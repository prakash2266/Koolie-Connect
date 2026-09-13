require('dotenv').config();
const ML_BASE = process.env.ML_SERVICE_URL || 'http://localhost:6000';

async function mlFetch(path, body) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${ML_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function localMatchScore(candidate) {
  const distanceScore = Math.max(0, 40 - candidate.distance_km * 6);
  const ratingScore = (candidate.rating || 0) * 6;
  const experienceYears = parseFloat(String(candidate.experience || '').match(/\d+/)?.[0] || '0');
  const experienceScore = Math.min(15, experienceYears * 2);
  const jobsScore = Math.min(10, (candidate.total_jobs || 0) * 1);
  const verifiedScore = candidate.verified ? 5 : 0;
  return Math.round(Math.min(100, distanceScore + ratingScore + experienceScore + jobsScore + verifiedScore));
}

async function scoreMatches(candidates) {
  const result = await mlFetch('/match', { candidates });
  if (result && result.scores) {
    return candidates.map((c, i) => ({ ...c, match_score: result.scores[i] }));
  }
  return candidates.map((c) => ({ ...c, match_score: localMatchScore(c) }));
}

function localParse(text, categories) {
  const lower = (text || '').toLowerCase();
  const result = { category: null, workers_required: 1, date: null, date_label: null, time_of_day: null, time_range: null };
  for (const cat of categories) {
    if (lower.includes(cat.name_en.toLowerCase()) || lower.includes(cat.id)) { result.category = cat.id; break; }
  }
  const numMatch = lower.match(/(\d+)\s*(worker|workers|people|person)/);
  if (numMatch) result.workers_required = parseInt(numMatch[1], 10);
  if (lower.includes('tomorrow')) result.date_label = 'tomorrow';
  else if (lower.includes('today')) result.date_label = 'today';
  for (const w of ['morning', 'afternoon', 'evening', 'night']) {
    if (lower.includes(w)) { result.time_of_day = w; break; }
  }
  return result;
}

async function parseSearchText(text, categories) {
  const result = await mlFetch('/parse', { text, categories });
  if (result && result.understood) return result.understood;
  return localParse(text, categories);
}

async function detectAnomalies(records) {
  const result = await mlFetch('/fraud', { records });
  if (result && result.anomaly_indices) return result.anomaly_indices;
  return [];
}

module.exports = { scoreMatches, parseSearchText, detectAnomalies };
