const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { requireAuth } = require('../middleware');
const { notify } = require('../notify');
const { detectAnomalies } = require('../mlClient');

router.get('/admin/stats', requireAuth(['admin']), async (req, res) => {
  const [[totalWorkers], [totalListings], [avail], [booked], [unavail], [totalCustomers], [completed], [openReports], [blocked]] = await Promise.all([
    query('SELECT COUNT(*) as c FROM workers'),
    query('SELECT COUNT(*) as c FROM worker_listings'),
    query(`SELECT COUNT(*) as c FROM worker_listings WHERE availability_status='available'`),
    query(`SELECT COUNT(*) as c FROM worker_listings WHERE availability_status='booked'`),
    query(`SELECT COUNT(*) as c FROM worker_listings WHERE availability_status='unavailable'`),
    query('SELECT COUNT(*) as c FROM customers'),
    query(`SELECT COUNT(*) as c FROM bookings WHERE status='completed'`),
    query(`SELECT COUNT(*) as c FROM reports WHERE status='open'`),
    query(`SELECT COUNT(*) as c FROM users WHERE status='blocked'`)
  ]);
  res.json({
    total_workers: totalWorkers.c,
    total_listings: totalListings.c,
    available_workers: avail.c,
    booked_workers: booked.c,
    unavailable_workers: unavail.c,
    total_customers: totalCustomers.c,
    completed_jobs: completed.c,
    open_reports: openReports.c,
    blocked_users: blocked.c
  });
});

router.get('/admin/users', requireAuth(['admin']), async (req, res) => {
  const role = req.query.role;
  const users = role
    ? await query('SELECT * FROM users WHERE role = ?', [role])
    : await query('SELECT * FROM users');
  res.json({ users });
});

router.post('/admin/user-status', requireAuth(['admin']), async (req, res) => {
  const { user_id, status } = req.body;
  if (!['active', 'suspended', 'blocked'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  await query('UPDATE users SET status=? WHERE id=?', [status, user_id]);
  const rows = await query('SELECT * FROM users WHERE id = ?', [user_id]);
  if (rows.length === 0) return res.status(404).json({ error: 'User not found.' });
  res.json({ message: 'User status updated.', user: rows[0] });
});

router.get('/admin/reports', requireAuth(['admin']), async (req, res) => {
  const reports = await query('SELECT * FROM reports ORDER BY created_at DESC');
  res.json({ reports });
});

router.post('/admin/reports/resolve', requireAuth(['admin']), async (req, res) => {
  const { report_id, action } = req.body;
  const reports = await query('SELECT * FROM reports WHERE id = ?', [report_id]);
  const report = reports[0];
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  await query('UPDATE reports SET status="resolved", resolved_at=NOW() WHERE id=?', [report_id]);
  if (action === 'block') {
    await query('UPDATE users SET status="blocked" WHERE id=?', [report.reported_user_id]);
  } else if (action === 'warn') {
    await notify(report.reported_user_id, 'Warning', 'An admin has reviewed a report about your account. Please follow platform rules.', 'warning');
  }
  const updated = await query('SELECT * FROM reports WHERE id = ?', [report_id]);
  res.json({ message: 'Report resolved.', report: updated[0] });
});

router.post('/admin/categories', requireAuth(['admin']), async (req, res) => {
  const { id, name_en, name_te, name_hi } = req.body;
  if (!id || !name_en) return res.status(400).json({ error: 'id and name_en are required.' });
  const existing = await query('SELECT id FROM work_categories WHERE id = ?', [id]);
  if (existing.length > 0) return res.status(409).json({ error: 'A category with this id already exists.' });
  await query('INSERT INTO work_categories (id, name_en, name_te, name_hi, active) VALUES (?,?,?,?,1)', [id, name_en, name_te || name_en, name_hi || name_en]);
  const rows = await query('SELECT * FROM work_categories WHERE id = ?', [id]);
  res.json({ message: 'Category added.', category: rows[0] });
});

router.post('/admin/categories/toggle', requireAuth(['admin']), async (req, res) => {
  const { id, active } = req.body;
  await query('UPDATE work_categories SET active=? WHERE id=?', [active ? 1 : 0, id]);
  const rows = await query('SELECT * FROM work_categories WHERE id = ?', [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Category not found.' });
  res.json({ message: 'Category updated.', category: rows[0] });
});

router.get('/admin/verification-requests', requireAuth(['admin']), async (req, res) => {
  const workers = await query(`SELECT * FROM workers WHERE verification_requested=1 AND verified=0`);
  const results = [];
  for (const w of workers) {
    const userRows = await query('SELECT * FROM users WHERE id = ?', [w.user_id]);
    const listings = await query('SELECT * FROM worker_listings WHERE worker_id = ?', [w.id]);
    results.push({ worker: w, user: userRows[0], listings });
  }
  res.json({ requests: results });
});

router.post('/admin/verify-worker', requireAuth(['admin']), async (req, res) => {
  const { worker_id, verified } = req.body;
  await query('UPDATE workers SET verified=?, verification_requested=0 WHERE id=?', [verified ? 1 : 0, worker_id]);
  const rows = await query('SELECT * FROM workers WHERE id = ?', [worker_id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Worker not found.' });
  await notify(
    rows[0].user_id,
    verified ? 'You are now Verified' : 'Verification declined',
    verified ? 'Your profile now shows a verified badge.' : 'Your verification request was not approved.',
    'verification'
  );
  res.json({ message: 'Updated.', worker: rows[0] });
});

router.get('/admin/analytics', requireAuth(['admin']), async (req, res) => {
  const jobsByDayRows = await query(
    `SELECT DATE(completed_at) as day, COUNT(*) as count
     FROM bookings WHERE status='completed' AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
     GROUP BY DATE(completed_at)`
  );
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = jobsByDayRows.find((r) => String(r.day).slice(0, 10) === key);
    days.push({ day: key, count: found ? found.count : 0 });
  }

  const categoryDistribution = await query(
    `SELECT wl.skill_category as category, COUNT(*) as count
     FROM bookings b JOIN worker_listings wl ON wl.id = b.listing_id
     WHERE b.status = 'completed'
     GROUP BY wl.skill_category ORDER BY count DESC`
  );

  const [avgRow] = await query('SELECT AVG(rating) as avg, COUNT(*) as cnt FROM ratings');
  const avgRating = avgRow.cnt > 0 ? Math.round(avgRow.avg * 10) / 10 : 0;

  const topRated = await query(
    `SELECT u.name, w.rating, w.total_jobs,
            (SELECT skill_category FROM worker_listings WHERE worker_id = w.id LIMIT 1) as category
     FROM workers w JOIN users u ON u.id = w.user_id
     WHERE w.total_jobs > 0
     ORDER BY w.rating DESC, w.total_jobs DESC LIMIT 5`
  );

  const utilRows = await query(`SELECT availability_status, COUNT(*) as c FROM worker_listings GROUP BY availability_status`);
  const totalListings = utilRows.reduce((s, r) => s + r.c, 0) || 1;
  const utilization = { available: 0, booked: 0, unavailable: 0 };
  utilRows.forEach((r) => { utilization[r.availability_status] = Math.round((r.c / totalListings) * 100); });

  const [earnRow] = await query(
    `SELECT COALESCE(SUM(wl.expected_daily_wage), 0) as total
     FROM bookings b JOIN worker_listings wl ON wl.id = b.listing_id
     WHERE b.status = 'completed'`
  );

  res.json({
    jobsByDay: days,
    categoryDistribution,
    avgRating,
    topRated,
    utilization,
    estimatedEarnings: earnRow.total,
    totalRatings: avgRow.cnt
  });
});

router.get('/admin/fraud-signals', requireAuth(['admin']), async (req, res) => {
  const signals = [];

  const dupCoords = await query(
    `SELECT ROUND(latitude,4) as lat_r, ROUND(longitude,4) as lng_r, COUNT(*) as cnt,
            GROUP_CONCAT(id) as worker_ids
     FROM workers WHERE latitude IS NOT NULL
     GROUP BY lat_r, lng_r HAVING cnt >= 2`
  );
  for (const row of dupCoords) {
    const workerIds = row.worker_ids.split(',');
    const users = [];
    for (const wid of workerIds) {
      const w = (await query('SELECT user_id FROM workers WHERE id = ?', [wid]))[0];
      const u = (await query('SELECT * FROM users WHERE id = ?', [w.user_id]))[0];
      users.push(u);
    }
    signals.push({
      type: 'duplicate_location',
      severity: 'medium',
      description: `${row.cnt} worker accounts share the exact same GPS location. Could be a shared labour point (normal) or fake accounts (suspicious) - please review.`,
      users
    });
  }

  const badWages = await query(
    `SELECT wl.*, w.user_id FROM worker_listings wl JOIN workers w ON w.id = wl.worker_id
     WHERE wl.expected_daily_wage = 0 OR wl.expected_daily_wage > 5000`
  );
  for (const l of badWages) {
    const u = (await query('SELECT * FROM users WHERE id = ?', [l.user_id]))[0];
    signals.push({
      type: 'implausible_wage',
      severity: 'low',
      description: `A "${l.skill_category}" listing has an expected daily wage of Rs.${l.expected_daily_wage}, which is outside the typical Rs.300-2000 range.`,
      users: [u]
    });
  }

  const allWorkers = await query(
    `SELECT w.id, w.user_id, w.latitude, w.longitude,
            (SELECT AVG(expected_daily_wage) FROM worker_listings WHERE worker_id = w.id) as avg_wage,
            (SELECT COUNT(*) FROM status_logs WHERE worker_id = w.id AND at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)) as status_changes
     FROM workers w WHERE w.latitude IS NOT NULL`
  );
  if (allWorkers.length >= 3) {
    const records = allWorkers.map((w) => ({
      latitude: w.latitude,
      longitude: w.longitude,
      wage: w.avg_wage || 0,
      status_changes_last_hour: w.status_changes
    }));
    const anomalyIndices = await detectAnomalies(records);
    for (const idx of anomalyIndices) {
      const w = allWorkers[idx];
      const u = (await query('SELECT * FROM users WHERE id = ?', [w.user_id]))[0];
      signals.push({
        type: 'ml_anomaly',
        severity: 'high',
        description: 'Flagged by the ML anomaly-detection model based on an unusual combination of location, wage, and activity patterns.',
        users: [u]
      });
    }
  }

  res.json({ signals });
});

module.exports = router;
