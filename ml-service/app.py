"""
Digital Kooli Connect - ML microservice.

Real scikit-learn models (not an LLM - no internet access is needed to run
this, everything below is a genuine, lightweight ML model trained at
startup or on the fly from the request itself):

  POST /match  - ranks worker candidates using a trained linear model
                 (weights learned once via LinearRegression on a small
                 labeled bootstrap set, then applied to real candidates)
  POST /parse  - free-text search parsing using TF-IDF + cosine similarity
                 to match the customer's sentence against category
                 descriptions (genuine text-similarity ML, not just regex)
  POST /fraud  - anomaly detection over worker feature vectors using
                 scikit-learn's IsolationForest (unsupervised ML)

The Express backend calls this service over HTTP and falls back to a
simple local heuristic if it's unreachable (see backend/src/mlClient.js),
so the ML service is an enhancement, not a hard dependency.
"""
from flask import Flask, request, jsonify
import numpy as np
import re
from datetime import datetime, timedelta
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import IsolationForest
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

app = Flask(__name__)

# ---------------------------------------------------------------------------
# /match — learn feature weights once at startup from a small synthetic
# bootstrap set that encodes the same priorities the platform cares about
# (closer, higher-rated, more experienced, more jobs, verified = better),
# then apply the trained model to real candidates at request time.
# ---------------------------------------------------------------------------
def _train_match_model():
    # Each row: [distance_km, rating, experience_years, total_jobs, verified]
    X = np.array([
        [0.2, 5.0, 10, 50, 1], [0.5, 4.8, 8, 40, 1], [1.0, 4.5, 5, 20, 0],
        [2.0, 4.0, 3, 10, 0], [3.0, 3.5, 2, 5, 0], [4.5, 3.0, 1, 2, 0],
        [0.1, 3.0, 1, 0, 0], [5.0, 5.0, 10, 50, 1], [1.5, 2.0, 0, 0, 0],
        [0.3, 4.9, 6, 30, 1], [2.5, 4.2, 4, 15, 1], [4.0, 4.7, 9, 45, 1],
    ])
    # Hand-labeled target scores (0-100) reflecting the same priorities as
    # the platform's rule-based fallback, used as training signal.
    y = np.array([98, 92, 75, 55, 40, 25, 30, 88, 15, 90, 68, 82])
    model = LinearRegression()
    model.fit(X, y)
    return model

match_model = _train_match_model()

@app.route('/match', methods=['POST'])
def match():
    data = request.get_json()
    candidates = data.get('candidates', [])
    if not candidates:
        return jsonify({'scores': []})

    X = []
    for c in candidates:
        exp_years = 0
        m = re.search(r'\d+', str(c.get('experience', '') or ''))
        if m:
            exp_years = int(m.group())
        X.append([
            c.get('distance_km', 0),
            c.get('rating', 0) or 0,
            exp_years,
            c.get('total_jobs', 0) or 0,
            1 if c.get('verified') else 0
        ])
    preds = match_model.predict(np.array(X))
    scores = [int(max(0, min(100, round(p)))) for p in preds]
    return jsonify({'scores': scores})


# ---------------------------------------------------------------------------
# /parse — TF-IDF + cosine similarity to match free text against category
# descriptions (real text-similarity ML), plus lightweight date/number
# extraction for the rest of the structured fields.
# ---------------------------------------------------------------------------
CATEGORY_DESCRIPTIONS = {
    'mason': 'mason masonry brick wall building construction cement',
    'helper': 'helper labour labor general assistant coolie',
    'painter': 'painter painting paint wall color house',
    'carpenter': 'carpenter carpentry wood furniture doors windows',
    'plumber': 'plumber plumbing pipe leak tap water bathroom',
    'electrician': 'electrician electrical wiring switch fan light current',
    'agri': 'agriculture farm field crop harvest agricultural',
    'construction': 'construction building site cement structure',
    'other': 'other miscellaneous general work'
}
NUMBER_WORDS = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'a': 1, 'an': 1}
TIME_WORDS = {
    'morning': '8:00 AM - 12:00 PM', 'afternoon': '12:00 PM - 4:00 PM',
    'evening': '4:00 PM - 8:00 PM', 'night': '8:00 PM - 10:00 PM'
}

@app.route('/parse', methods=['POST'])
def parse():
    data = request.get_json()
    text = (data.get('text') or '').lower()
    categories = data.get('categories', [])

    result = {
        'category': None, 'workers_required': 1,
        'date': None, 'date_label': None,
        'time_of_day': None, 'time_range': None
    }

    if categories:
        cat_ids = [c['id'] for c in categories if c['id'] in CATEGORY_DESCRIPTIONS]
        corpus = [CATEGORY_DESCRIPTIONS[cid] for cid in cat_ids] + [text]
        if len(corpus) > 1:
            vectorizer = TfidfVectorizer()
            tfidf = vectorizer.fit_transform(corpus)
            sims = cosine_similarity(tfidf[-1], tfidf[:-1]).flatten()
            best_idx = int(np.argmax(sims))
            if sims[best_idx] > 0.05:  # some real similarity, not just noise
                result['category'] = cat_ids[best_idx]

    num_match = re.search(r'(\d+)\s*(worker|workers|people|person|men)', text)
    if num_match:
        result['workers_required'] = int(num_match.group(1))
    else:
        for word, num in NUMBER_WORDS.items():
            if re.search(rf'\b{word}\b\s*(worker|workers|people|person)', text):
                result['workers_required'] = num
                break

    today = datetime.now()
    if 'tomorrow' in text:
        d = today + timedelta(days=1)
        result['date'] = d.strftime('%Y-%m-%d')
        result['date_label'] = 'tomorrow'
    elif 'today' in text:
        result['date'] = today.strftime('%Y-%m-%d')
        result['date_label'] = 'today'

    for word, time_range in TIME_WORDS.items():
        if word in text:
            result['time_of_day'] = word
            result['time_range'] = time_range
            break

    return jsonify({'understood': result})


# ---------------------------------------------------------------------------
# /fraud — Isolation Forest anomaly detection over worker feature vectors
# (real unsupervised ML, genuinely fitted on the request's own data each
# call since there's no persistent training set in this prototype).
# ---------------------------------------------------------------------------
@app.route('/fraud', methods=['POST'])
def fraud():
    data = request.get_json()
    records = data.get('records', [])
    if len(records) < 3:
        return jsonify({'anomaly_indices': []})  # IsolationForest needs a few points to be meaningful

    X = np.array([[
        r.get('latitude', 0) or 0,
        r.get('longitude', 0) or 0,
        r.get('wage', 0) or 0,
        r.get('status_changes_last_hour', 0) or 0
    ] for r in records])

    contamination = min(0.3, max(0.05, 1.0 / len(records)))
    clf = IsolationForest(contamination=contamination, random_state=42, n_estimators=100)
    preds = clf.fit_predict(X)  # -1 = anomaly, 1 = normal

    anomaly_indices = [i for i, p in enumerate(preds) if p == -1]
    return jsonify({'anomaly_indices': anomaly_indices})


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'digital-kooli-connect-ml'})


if __name__ == '__main__':
    port = 6000
    print(f"Digital Kooli Connect ML service running at http://localhost:{port}")
    app.run(host='0.0.0.0', port=port)
