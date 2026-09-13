const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { haversineKm, jitterCoord } = require('../utils');
const { requireAuth } = require('../middleware');
const { scoreMatches, parseSearchText } = require('../mlClient');

router.post('/customer/location', requireAuth(['customer']), async (req, res) => {
  const { latitude, longitude } = req.body;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'latitude and longitude are required.' });
  }
  await query('UPDATE customers SET latitude=?, longitude=?, location_updated_at=NOW() WHERE user_id=?', [latitude, longitude, req.session.user_id]);
  const rows = await query('SELECT * FROM customers WHERE user_id = ?', [req.session.user_id]);
  res.json({ message: 'Location detected.', customer: rows[0] });
});

async function findCandidates(customer, category, radiusKm) {
  const rows = await query(
    `SELECT wl.id as listing_id, wl.skill_category, wl.expected_daily_wage, wl.experience,
            w.id as worker_id, w.latitude, w.longitude, w.rating, w.total_jobs, w.verified,
            u.name, u.phone
     FROM worker_listings wl
     JOIN workers w ON w.id = wl.worker_id
     JOIN users u ON u.id = w.user_id
     WHERE wl.availability_status = 'available'
       AND w.latitude IS NOT NULL
       AND u.status = 'active'
       AND (? IS NULL OR wl.skill_category = ?)`,
    [category, category]
  );

  const withDistance = rows
    .map((r) => ({ ...r, distance_km: Math.round(haversineKm(customer.latitude, customer.longitude, r.latitude, r.longitude) * 10) / 10 }))
    .filter((r) => r.distance_km <= radiusKm);

  const scored = await scoreMatches(withDistance);
  return scored.map((r) => {
    const approx = jitterCoord(r.latitude, r.longitude, r.worker_id);
    return {
      listing_id: r.listing_id,
      worker_id: r.worker_id,
      name: r.name,
      skill_category: r.skill_category,
      experience: r.experience,
      expected_daily_wage: r.expected_daily_wage,
      rating: r.rating,
      total_jobs: r.total_jobs,
      verified: !!r.verified,
      distance_km: r.distance_km,
      match_score: r.match_score,
      approx_latitude: approx.latitude,
      approx_longitude: approx.longitude,
      phone: r.phone
    };
  });
}

router.get('/search', requireAuth(['customer']), async (req, res) => {
  const customers = await query('SELECT * FROM customers WHERE user_id = ?', [req.session.user_id]);
  const customer = customers[0];
  if (!customer || !customer.latitude) return res.status(400).json({ error: 'Please allow location access first.' });

  const radius = parseFloat(req.query.radius) || 5;
  const category = req.query.category && req.query.category !== 'any' ? req.query.category : null;
  const sortMode = req.query.sort === 'smart' ? 'smart' : 'distance';

  let results = await findCandidates(customer, category, radius);
  results.sort((a, b) => (sortMode === 'smart' ? b.match_score - a.match_score : a.distance_km - b.distance_km));
  res.json({ results, count: results.length, sort: sortMode });
});

router.post('/ai-search', requireAuth(['customer']), async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Please describe what you need.' });
  const customers = await query('SELECT * FROM customers WHERE user_id = ?', [req.session.user_id]);
  const customer = customers[0];
  if (!customer || !customer.latitude) return res.status(400).json({ error: 'Please allow location access first.' });

  const categories = await query('SELECT id, name_en FROM work_categories WHERE active = 1');
  const understood = await parseSearchText(text, categories);

  let results = await findCandidates(customer, understood.category, 5);
  results.sort((a, b) => b.match_score - a.match_score);
  results = results.slice(0, Math.max(understood.workers_required || 1, 5));

  res.json({ understood, results, count: results.length });
});

router.get('/customer/recommendations', requireAuth(['customer']), async (req, res) => {
  const customers = await query('SELECT * FROM customers WHERE user_id = ?', [req.session.user_id]);
  const customer = customers[0];
  if (!customer || !customer.latitude) return res.json({ results: [], reason: 'no_location' });

  const pastCats = await query(
    `SELECT wl.skill_category as category, COUNT(*) as cnt
     FROM bookings b JOIN worker_listings wl ON wl.id = b.listing_id
     WHERE b.customer_id = ? AND b.status = 'completed'
     GROUP BY wl.skill_category ORDER BY cnt DESC`,
    [customer.id]
  );
  const preferred = pastCats.map((r) => r.category);
  const reason = preferred.length ? 'past_history' : 'top_rated_nearby';

  let results = [];
  if (preferred.length) {
    for (const cat of preferred) {
      results = results.concat(await findCandidates(customer, cat, 10));
    }
  } else {
    results = await findCandidates(customer, null, 10);
  }
  results.sort((a, b) => b.match_score - a.match_score);
  res.json({ results: results.slice(0, 5), reason });
});

router.get('/customer/unrated-booking', requireAuth(['customer']), async (req, res) => {
  const customers = await query('SELECT id FROM customers WHERE user_id = ?', [req.session.user_id]);
  const rows = await query(
    `SELECT b.id, b.worker_id, u.name as worker_name
     FROM bookings b
     JOIN workers w ON w.id = b.worker_id
     JOIN users u ON u.id = w.user_id
     LEFT JOIN ratings r ON r.booking_id = b.id
     WHERE b.customer_id = ? AND b.status = 'completed' AND r.id IS NULL
     ORDER BY b.completed_at DESC LIMIT 1`,
    [customers[0].id]
  );
  if (rows.length === 0) return res.json({ booking: null });
  res.json({ booking: { id: rows[0].id, worker_id: rows[0].worker_id }, worker_name: rows[0].worker_name });
});

router.get('/customer/job-history', requireAuth(['customer']), async (req, res) => {
  const customers = await query('SELECT id FROM customers WHERE user_id = ?', [req.session.user_id]);
  const jobs = await query(
    `SELECT b.id as booking_id, b.completed_at, u.name as worker_name, wl.skill_category, r.rating as rating_given
     FROM bookings b
     JOIN workers w ON w.id = b.worker_id
     JOIN users u ON u.id = w.user_id
     JOIN worker_listings wl ON wl.id = b.listing_id
     LEFT JOIN ratings r ON r.booking_id = b.id
     WHERE b.customer_id = ? AND b.status = 'completed'
     ORDER BY b.completed_at DESC`,
    [customers[0].id]
  );
  res.json({ jobs });
});

router.get('/customer/work-requests', requireAuth(['customer']), async (req, res) => {
  const customers = await query('SELECT id FROM customers WHERE user_id = ?', [req.session.user_id]);
  const requests = await query(
    `SELECT wr.*, u.name as worker_name
     FROM work_requests wr
     JOIN workers w ON w.id = wr.worker_id
     JOIN users u ON u.id = w.user_id
     WHERE wr.customer_id = ?
     ORDER BY wr.created_at DESC`,
    [customers[0].id]
  );
  res.json({ requests });
});

module.exports = router;
