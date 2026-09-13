const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { uid } = require('../utils');
const { requireAuth } = require('../middleware');
const { notify } = require('../notify');

router.get('/categories', async (req, res) => {
  const categories = await query('SELECT * FROM work_categories WHERE active = 1');
  res.json({ categories });
});

router.get('/notifications', requireAuth(), async (req, res) => {
  const list = await query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [req.session.user_id]);
  res.json({ notifications: list, unread_count: list.filter((n) => !n.is_read).length });
});

router.post('/notifications/read', requireAuth(), async (req, res) => {
  await query('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [req.body.notification_id, req.session.user_id]);
  res.json({ message: 'ok' });
});

router.post('/notifications/read-all', requireAuth(), async (req, res) => {
  await query('UPDATE notifications SET is_read=1 WHERE user_id=?', [req.session.user_id]);
  res.json({ message: 'ok' });
});

router.post('/report', requireAuth(['worker', 'customer']), async (req, res) => {
  const { reported_user_id, reason, description } = req.body;
  const id = uid();
  await query(
    'INSERT INTO reports (id, reporter_id, reported_user_id, reason, description, status, created_at) VALUES (?,?,?,?,?,"open",NOW())',
    [id, req.session.user_id, reported_user_id, reason, description || '']
  );
  const rows = await query('SELECT * FROM reports WHERE id = ?', [id]);
  res.json({ message: 'Report submitted.', report: rows[0] });
});

router.post('/rating', requireAuth(['customer']), async (req, res) => {
  const { booking_id, worker_id, rating, review } = req.body;
  const customers = await query('SELECT id FROM customers WHERE user_id = ?', [req.session.user_id]);
  const bookings = await query(
    'SELECT * FROM bookings WHERE id=? AND customer_id=? AND worker_id=? AND status="completed"',
    [booking_id, customers[0].id, worker_id]
  );
  if (bookings.length === 0) return res.status(400).json({ error: 'Only completed bookings can be rated.' });

  const existing = await query('SELECT id FROM ratings WHERE booking_id = ?', [booking_id]);
  if (existing.length > 0) return res.status(409).json({ error: 'This booking has already been rated.' });
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Rating must be between 1 and 5.' });

  const id = uid();
  await query(
    'INSERT INTO ratings (id, booking_id, customer_id, worker_id, rating, review, created_at) VALUES (?,?,?,?,?,?,NOW())',
    [id, booking_id, customers[0].id, worker_id, rating, review || '']
  );
  const avgRows = await query('SELECT AVG(rating) as avg FROM ratings WHERE worker_id = ?', [worker_id]);
  await query('UPDATE workers SET rating=? WHERE id=?', [Math.round(avgRows[0].avg * 10) / 10, worker_id]);

  const rows = await query('SELECT * FROM ratings WHERE id = ?', [id]);
  res.json({ message: 'Thank you for rating.', rating: rows[0] });
});

module.exports = router;
