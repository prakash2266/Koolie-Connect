const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { uid } = require('../utils');
const { requireAuth } = require('../middleware');

const LOCATION_STALE_MINUTES = 60;

async function suppressOtherListings(workerId, exceptListingId) {
  await query(
    `UPDATE worker_listings SET availability_status='unavailable', auto_suppressed=1
     WHERE worker_id=? AND id<>? AND availability_status='available'`,
    [workerId, exceptListingId]
  );
}
async function restoreSuppressedListings(workerId) {
  await query(
    `UPDATE worker_listings SET availability_status='available', auto_suppressed=0
     WHERE worker_id=? AND auto_suppressed=1`,
    [workerId]
  );
}
module.exports.suppressOtherListings = suppressOtherListings;
module.exports.restoreSuppressedListings = restoreSuppressedListings;

router.get('/me', requireAuth(), async (req, res) => {
  const users = await query('SELECT * FROM users WHERE id = ?', [req.session.user_id]);
  const user = users[0];

  if (req.session.role === 'worker') {
    const workers = await query('SELECT * FROM workers WHERE user_id = ?', [req.session.user_id]);
    const profile = workers[0];
    const listings = await query('SELECT * FROM worker_listings WHERE worker_id = ? ORDER BY created_at ASC', [profile.id]);
    return res.json({ user, profile, listings });
  }
  if (req.session.role === 'customer') {
    const customers = await query('SELECT * FROM customers WHERE user_id = ?', [req.session.user_id]);
    return res.json({ user, profile: customers[0] });
  }
  res.json({ user, profile: null });
});

router.post('/worker/location', requireAuth(['worker']), async (req, res) => {
  const { latitude, longitude } = req.body;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'latitude and longitude are required.' });
  }
  await query('UPDATE workers SET latitude=?, longitude=?, location_updated_at=NOW() WHERE user_id=?', [latitude, longitude, req.session.user_id]);
  const workers = await query('SELECT * FROM workers WHERE user_id = ?', [req.session.user_id]);
  res.json({ message: 'Location detected.', worker: workers[0] });
});

router.post('/worker/listings', requireAuth(['worker']), async (req, res) => {
  const { skill_category, expected_daily_wage, experience } = req.body;
  if (!skill_category) return res.status(400).json({ error: 'Please choose a work type.' });
  const workers = await query('SELECT id FROM workers WHERE user_id = ?', [req.session.user_id]);
  const workerId = workers[0].id;
  const listingId = uid();
  await query(
    'INSERT INTO worker_listings (id, worker_id, skill_category, experience, expected_daily_wage, availability_status, auto_suppressed, created_at) VALUES (?,?,?,?,?,?,0,NOW())',
    [listingId, workerId, skill_category, experience || '', expected_daily_wage || 0, 'unavailable']
  );
  const rows = await query('SELECT * FROM worker_listings WHERE id = ?', [listingId]);
  res.json({ message: 'New job listing added.', listing: rows[0] });
});

router.get('/worker/listings', requireAuth(['worker']), async (req, res) => {
  const workers = await query('SELECT id FROM workers WHERE user_id = ?', [req.session.user_id]);
  const listings = await query('SELECT * FROM worker_listings WHERE worker_id = ? ORDER BY created_at ASC', [workers[0].id]);
  res.json({ listings });
});

router.post('/worker/listing-status', requireAuth(['worker']), async (req, res) => {
  const { listing_id, status } = req.body;
  if (!['available', 'unavailable'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const workers = await query('SELECT * FROM workers WHERE user_id = ?', [req.session.user_id]);
  const worker = workers[0];
  const listings = await query('SELECT * FROM worker_listings WHERE id = ? AND worker_id = ?', [listing_id, worker.id]);
  const listing = listings[0];
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });

  if (listing.availability_status === 'booked') {
    return res.status(409).json({ error: 'This job is currently booked - mark it Completed first.' });
  }

  if (status === 'available') {
    const bookedElsewhere = await query(
      `SELECT id FROM worker_listings WHERE worker_id=? AND availability_status='booked'`,
      [worker.id]
    );
    if (bookedElsewhere.length > 0) {
      return res.status(409).json({ error: 'You are currently on a booked job and cannot go Available for another one until it is complete.' });
    }
    if (!worker.latitude || !worker.longitude) {
      return res.status(400).json({ error: 'Please allow location access before going Available.' });
    }
    const ageMin = (Date.now() - new Date(worker.location_updated_at).getTime()) / 60000;
    if (ageMin > LOCATION_STALE_MINUTES) {
      return res.status(400).json({ error: 'Your location is out of date. Please refresh it and try again.' });
    }
  }

  await query('UPDATE worker_listings SET availability_status=?, auto_suppressed=0 WHERE id=?', [status, listing_id]);
  await query('INSERT INTO status_logs (listing_id, worker_id, status, at) VALUES (?,?,?,NOW())', [listing_id, worker.id, status]);
  const rows = await query('SELECT * FROM worker_listings WHERE id = ?', [listing_id]);
  res.json({ message: 'Status updated.', listing: rows[0] });
});

router.get('/worker/active-booking', requireAuth(['worker']), async (req, res) => {
  const workers = await query('SELECT id FROM workers WHERE user_id = ?', [req.session.user_id]);
  const rows = await query(
    `SELECT b.*, wl.skill_category FROM bookings b
     JOIN worker_listings wl ON wl.id = b.listing_id
     WHERE b.worker_id = ? AND b.status = 'booked'
     ORDER BY b.created_at DESC LIMIT 1`,
    [workers[0].id]
  );
  res.json({ booking: rows[0] || null });
});

router.get('/worker/job-history', requireAuth(['worker']), async (req, res) => {
  const workers = await query('SELECT id FROM workers WHERE user_id = ?', [req.session.user_id]);
  const jobs = await query(
    `SELECT b.id as booking_id, b.completed_at, u.name as customer_name, wl.skill_category,
            r.rating, r.review
     FROM bookings b
     JOIN customers c ON c.id = b.customer_id
     JOIN users u ON u.id = c.user_id
     JOIN worker_listings wl ON wl.id = b.listing_id
     LEFT JOIN ratings r ON r.booking_id = b.id
     WHERE b.worker_id = ? AND b.status = 'completed'
     ORDER BY b.completed_at DESC`,
    [workers[0].id]
  );
  res.json({ jobs });
});

router.post('/worker/request-verification', requireAuth(['worker']), async (req, res) => {
  const workers = await query('SELECT * FROM workers WHERE user_id = ?', [req.session.user_id]);
  const worker = workers[0];
  if (worker.verified) return res.json({ message: 'Already verified.', worker });
  await query('UPDATE workers SET verification_requested=1 WHERE id=?', [worker.id]);
  const rows = await query('SELECT * FROM workers WHERE id = ?', [worker.id]);
  res.json({ message: 'Verification requested. An admin will review your profile.', worker: rows[0] });
});

module.exports.router = router;
