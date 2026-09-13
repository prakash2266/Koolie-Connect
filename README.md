# Digital Kooli Connect — MySQL + React + ML Edition

This is a full rebuild of the platform on the stack you asked for:

- **Database:** MySQL (schema in `database/schema.sql`)
- **Backend:** Express.js (Node) talking to MySQL via `mysql2`
- **Frontend:** React (Vite)
- **ML service:** a separate Python (Flask + scikit-learn) microservice for
  worker matching, free-text search parsing, and fraud anomaly detection

## Important — please read before running

This sandbox has **no internet access** (confirmed: `npm install` and even
`apt-get install mysql-server` both return `403 Forbidden`), so I could not:
- run a real MySQL server here, or
- `npm install` React/Express/mysql2 here to build-test the actual packages.

What I *could* and *did* actually test, for real, in this sandbox:
- **The SQL query logic** — I ran the exact query shapes this backend uses
  (joins, the booking-cascade updates, analytics aggregates, the fraud
  duplicate-location query) against Node's built-in SQLite engine and
  confirmed every one produces the correct result for the multi-listing
  scenario from our conversation (a worker with several job types; booking
  one hides the others; completing it restores exactly the ones that were
  auto-hidden). MySQL and SQLite use the same `?` placeholder style and
  near-identical SQL for these queries, so this gives real confidence —
  but it is not a substitute for testing against actual MySQL.
- **The ML service** — this runs on plain Python + scikit-learn, both
  already installed here, so I started it for real and hit all three
  endpoints with real requests. Confirmed working: a strong nearby
  candidate scored 94/100 vs. a weak one at 17/100; the free-text parser
  correctly extracted "painter, tomorrow, morning, 2 workers" from a
  natural sentence; the anomaly detector correctly flagged the one
  suspicious record out of four.
- **Every backend and frontend file** — checked with `node -c` (backend)
  and manual review (frontend `.jsx`, since JSX needs a bundler to parse
  and none was installable here).

What is **not yet verified end-to-end**: the Express backend has not been
run against a real MySQL server, and the React frontend has not been built
or run with Vite, because neither MySQL nor npm packages could be installed
in this sandbox. The code is written carefully and translated line-by-line
from an earlier version of this same app that I did fully test — but
please run `npm install` and do a smoke test on your own machine (which
has internet) before relying on this for anything real. If something
doesn't compile, it's most likely a small typo I couldn't catch without a
real bundler — tell me the exact error and I'll fix it immediately.

## Project structure

```
database/
  schema.sql          MySQL schema + seed data (categories, admin account)

backend/
  server.js           Entry point
  src/
    app.js             Express app, mounts all routers
    db.js              MySQL connection pool
    middleware.js       Session-token auth
    mlClient.js          Calls the ML service, falls back to local logic if it's down
    notify.js            In-app notification helper
    utils.js              id/otp/token generation, haversine distance, map jitter
    routes/
      auth.js             OTP send/verify, registration
      worker.js            Profile, GPS, job listings, listing status, history, verification
      customer.js          GPS, search, AI search, recommendations, history
      booking.js            Booking confirm/complete, work requests
      misc.js                Categories, notifications, reports, ratings
      admin.js                Stats, users, reports, categories, verification, analytics, fraud signals

ml-service/
  app.py                Flask service: /match, /parse, /fraud, /health
  requirements.txt

frontend/
  index.html
  vite.config.js
  src/
    main.jsx, App.jsx (routing)
    api.js               fetch wrapper + geolocation helper
    context/              Auth + language state (React Context)
    i18n/                 en.json, te.json, hi.json
    components/            LangBar, WorkerResultCard (shared search-result card)
    pages/                  One file per screen (Landing, Worker*, Customer*, Admin*)
```

## How to run it (on your own machine, with internet)

### 1. MySQL
Install MySQL if you don't have it, then:
```
mysql -u root -p < database/schema.sql
```
This creates the `digital_kooli_connect` database with all tables, the 9
default work categories, and one seeded admin account (phone `9999999999`).

### 2. Backend
```
cd backend
npm install
cp .env.example .env
```
Edit `.env` and set `DB_PASSWORD` (and other DB settings if not using
defaults). Then:
```
npm start
```
Should print `Digital Kooli Connect backend (Express + MySQL) running at http://localhost:4000`.

### 3. ML service (optional but recommended — the backend works without it,
just with simpler local scoring instead of the trained models)
```
cd ml-service
pip install -r requirements.txt
python app.py
```
Should print `Digital Kooli Connect ML service running at http://localhost:6000`.

### 4. Frontend
```
cd frontend
npm install
cp .env.example .env
```
Edit `.env` if your backend isn't at `http://localhost:4000/api`. Then:
```
npm run dev
```
Opens at `http://localhost:5500` (configured in `vite.config.js`).

For a production build: `npm run build` produces static files in `frontend/dist/`
that you can deploy anywhere (Netlify, Vercel, Render Static Site, etc.).

## What each part actually does

**Multiple job listings per worker** (the feature we discussed at length):
a worker account can have several job-type listings (e.g. Mason AND
Painter), each independently toggled Available/Unavailable. The moment
any one listing gets booked, the backend automatically hides that
worker's *other* available listings too (see `suppressOtherListings` in
`backend/src/routes/worker.js`) — a person can only do one job at a time.
When the booked job is marked complete, exactly the listings that were
auto-hidden come back to Available; ones the worker had already turned off
themselves stay off.

**Category-filtered search**: `/api/search?category=painter` only returns
that worker's painter listing — their other job types never show up in a
search for a different category. This was verified in the SQLite query
test.

**The ML service** (`ml-service/app.py`) is genuine scikit-learn, not an
LLM and not a rules engine dressed up as ML:
- `/match` — a `LinearRegression` model trained (at service startup) on a
  small hand-labeled bootstrap set encoding "closer + higher-rated + more
  experienced + more jobs + verified = better", then applied to real
  candidates to produce a 0–100 match score.
- `/parse` — `TfidfVectorizer` + cosine similarity matches the customer's
  free-text sentence against category descriptions, which is genuine text
  similarity ML rather than keyword regex matching.
- `/fraud` — `IsolationForest`, unsupervised anomaly detection over each
  worker's [latitude, longitude, wage, recent status-change count]
  feature vector.

The Express backend calls this service over HTTP for every search/AI-search/
fraud-signals request; if the service is down, `backend/src/mlClient.js`
falls back to simple local scoring so the app keeps working either way.

## Moving further toward production

- Real SMS gateway (Twilio/MSG91) in place of the on-screen dev OTP
- JWT or Redis-backed sessions instead of the `sessions` MySQL table (fine
  for correctness at small scale, but a dedicated session store scales better)
- Serve the ML service behind a proper WSGI server (gunicorn) instead of
  Flask's development server, which prints a warning about this
- Add automated tests (Jest for the backend, React Testing Library for the
  frontend) — none exist yet since I built this in an environment where I
  couldn't install the test runners either
- HTTPS everywhere (required for the Geolocation API on real phones)
