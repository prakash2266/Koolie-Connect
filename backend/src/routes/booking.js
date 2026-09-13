const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { uid } = require('../utils');
const { requireAuth } = require('../middleware');
const { notify } = require('../notify');
const { suppressOtherListings, restoreSuppressedListings } = require('./worker');

router.post('/booking/confirm', requireAuth(['customer']), async (req, res) => {
  const { listing_id } = req.body;
  const listings = await query('SELECT * FROM worker_listings WHERE id = ?', [listing_id]);
  const listing = listings[0];
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  if (listing.availability_status !== 'available') {
    return res.status(409).json({ error: 'This worker is no longer available.' });
  }
  const workers = await query('SELECT * FROM workers WHERE id = ?', [listing.worker_id]);
  const worker = workers[0];
  const customers = await query('SELECT * FROM customers WHERE user_id = ?', [req.session.user_id]);
  const customer = customers[0];

  await query('UPDATE worker_listings SET availability_status="booked", auto_suppressed=0 WHERE id=?', [listing_id]);
  await suppressOtherListings(worker.id, listing_id);

  const bookingId = uid();
  await query(
    'INSERT INTO bookings (id, customer_id, worker_id, listing_id, status, started_at, created_at) VALUES (?,?,?,?,"booked",NOW(),NOW())',
    [bookingId, customer.id, worker.id, listing_id]
  );

  const customerUser = (await query('SELECT name FROM users WHERE id = ?', [req.session.user_id]))[0];
  await notify(worker.user_id, 'Booking confirmed', `${customerUser.name || 'A customer'} has booked you for ${listing.skill_category} work.`, 'booking_confirmed');

  const bookingRows = await query('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  res.json({ message: 'Booking confirmed.', booking: bookingRows[0] });
});

router.post('/booking/complete', requireAuth(['worker']), async (req, res) => {
  const { booking_id, next_status } = req.body;
  const workers = await query('SELECT * FROM workers WHERE user_id = ?', [req.session.user_id]);
  const worker = workers[0];
  const bookings = await query('SELECT * FROM bookings WHERE id = ? AND worker_id = ?', [booking_id, worker.id]);
  const booking = bookings[0];
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });

  await query('UPDATE bookings SET status="completed", completed_at=NOW() WHERE id=?', [booking_id]);
  await query('UPDATE workers SET total_jobs = total_jobs + 1 WHERE id=?', [worker.id]);
  await query('UPDATE worker_listings SET availability_status=?, auto_suppressed=0 WHERE id=?', [next_status === 'available' ? 'available' : 'unavailable', booking.listing_id]);
  await restoreSuppressedListings(worker.id);

  const customers = await query('SELECT * FROM customers WHERE id = ?', [booking.customer_id]);
  const workerUser = (await query('SELECT name FROM users WHERE id = ?', [req.session.user_id]))[0];
  await notify(customers[0].user_id, 'Job completed', `${workerUser.name || 'The worker'} marked the job as completed. Please rate your experience.`, 'job_completed');

  const updated = await query('SELECT * FROM bookings WHERE id = ?', [booking_id]);
  res.json({ message: 'Job marked complete.', booking: updated[0] });
});

router.post('/work-request', requireAuth(['customer']), async (req, res) => {
  const { listing_id, description, work_date, start_time } = req.body;
  const listings = await query('SELECT * FROM worker_listings WHERE id = ?', [listing_id]);
  const listing = listings[0];
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  if (listing.availability_status !== 'available') {
    return res.status(409).json({ error: 'This worker is no longer available.' });
  }
  const workers = await query('SELECT * FROM workers WHERE id = ?', [listing.worker_id]);
  const worker = workers[0];
  const customers = await query('SELECT * FROM customers WHERE user_id = ?', [req.session.user_id]);
  const customer = customers[0];

  const requestId = uid();
  await query(
    `INSERT INTO work_requests (id, customer_id, worker_id, listing_id, category_id, description, work_date, start_time, status, created_at)
     VALUES (?,?,?,?,?,?,?,?, 'pending', NOW())`,
    [requestId, customer.id, worker.id, listing_id, listing.skill_category, description || '', work_date || '', start_time || '']
  );

  const customerUser = (await query('SELECT name FROM users WHERE id = ?', [req.session.user_id]))[0];
  await notify(worker.user_id, 'New Work Request', `${customerUser.name || 'A customer'} sent you a work request for ${work_date || 'soon'}.`, 'work_request');

  const rows = await query('SELECT * FROM work_requests WHERE id = ?', [requestId]);
  res.json({ message: 'Work request sent.', request: rows[0] });
});

router.get('/worker/work-requests', requireAuth(['worker']), async (req, res) => {
  const workers = await query('SELECT id FROM workers WHERE user_id = ?', [req.session.user_id]);
  const requests = await query(
    `SELECT wr.*, u.name as customer_name, u.phone as customer_phone
     FROM work_requests wr
     JOIN customers c ON c.id = wr.customer_id
     JOIN users u ON u.id = c.user_id
     WHERE wr.worker_id = ?
     ORDER BY wr.created_at DESC`,
    [workers[0].id]
  );
  res.json({ requests });
});

router.post('/work-request/respond', requireAuth(['worker']), async (req, res) => {
  const { request_id, action } = req.body;
  if (!['accept', 'reject'].includes(action)) return res.status(400).json({ error: 'action must be accept or reject.' });

  const workers = await query('SELECT * FROM workers WHERE user_id = ?', [req.session.user_id]);
  const worker = workers[0];
  const requests = await query('SELECT * FROM work_requests WHERE id = ? AND worker_id = ?', [request_id, worker.id]);
  const request = requests[0];
  if (!request) return res.status(404).json({ error: 'Request not found.' });
  if (request.status !== 'pending') return res.status(409).json({ error: 'This request has already been responded to.' });

  const customers = await query('SELECT * FROM customers WHERE id = ?', [request.customer_id]);
  const customer = customers[0];

  if (action === 'accept') {
    const listings = await query('SELECT * FROM worker_listings WHERE id = ?', [request.listing_id]);
    const listing = listings[0];
    if (!listing || listing.availability_status !== 'available') {
      return res.status(409).json({ error: 'You must be Available on this listing to accept the request.' });
    }
    await query('UPDATE work_requests SET status="accepted" WHERE id=?', [request_id]);
    await query('UPDATE worker_listings SET availability_status="booked", auto_suppressed=0 WHERE id=?', [listing.id]);
    await suppressOtherListings(worker.id, listing.id);

    const bookingId = uid();
    await query(
      'INSERT INTO bookings (id, customer_id, worker_id, listing_id, work_request_id, status, started_at, created_at) VALUES (?,?,?,?,?,"booked",NOW(),NOW())',
      [bookingId, customer.id, worker.id, listing.id, request_id]
    );
    await notify(customer.user_id, 'Request Accepted', 'The worker accepted your work request and is now booked for you.', 'request_accepted');
    const bookingRows = await query('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    res.json({ message: 'Request accepted.', request: { ...request, status: 'accepted' }, booking: bookingRows[0] });
  } else {
    await query('UPDATE work_requests SET status="rejected" WHERE id=?', [request_id]);
    await notify(customer.user_id, 'Request Rejected', 'The worker was unable to accept your work request.', 'request_rejected');
    res.json({ message: 'Request rejected.', request: { ...request, status: 'rejected' } });
  }
});

module.exports = router;
