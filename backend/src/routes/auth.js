const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { uid, genOtp, genToken } = require('../utils');

router.post('/auth/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
  }
  const otp = genOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await query(
    'INSERT INTO otps (phone, otp, expires_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE otp=VALUES(otp), expires_at=VALUES(expires_at)',
    [phone, otp, expiresAt]
  );
  console.log(`[DEV OTP] phone=${phone} otp=${otp}`);
  res.json({ message: 'OTP sent.', dev_otp: otp });
});

router.post('/auth/verify-otp', async (req, res) => {
  const { phone, otp, role, name, language, category, experience, expected_daily_wage } = req.body;

  const otpRows = await query('SELECT * FROM otps WHERE phone = ?', [phone]);
  const record = otpRows[0];
  if (!record || record.otp !== otp || new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ error: 'OTP is incorrect or has expired. Please request a new one.' });
  }
  await query('DELETE FROM otps WHERE phone = ?', [phone]);

  let userRows = await query('SELECT * FROM users WHERE phone = ?', [phone]);
  let user = userRows[0];

  if (!user) {
    if (!role || !['worker', 'customer'].includes(role)) {
      return res.status(400).json({ error: 'role must be worker or customer for first-time registration.' });
    }
    const userId = uid();
    await query(
      'INSERT INTO users (id, phone, name, role, language, status, created_at) VALUES (?,?,?,?,?,?,NOW())',
      [userId, phone, name || '', role, language || 'en', 'active']
    );

    if (role === 'worker') {
      const workerId = uid();
      await query('INSERT INTO workers (id, user_id, verified, verification_requested) VALUES (?,?,0,0)', [workerId, userId]);
      const listingId = uid();
      await query(
        'INSERT INTO worker_listings (id, worker_id, skill_category, experience, expected_daily_wage, availability_status, auto_suppressed, created_at) VALUES (?,?,?,?,?,?,0,NOW())',
        [listingId, workerId, category || 'other', experience || '', expected_daily_wage || 0, 'unavailable']
      );
    } else {
      const customerId = uid();
      await query('INSERT INTO customers (id, user_id) VALUES (?,?)', [customerId, userId]);
    }

    userRows = await query('SELECT * FROM users WHERE id = ?', [userId]);
    user = userRows[0];
  }

  if (user.status === 'blocked') {
    return res.status(403).json({ error: 'This account has been blocked. Contact support.' });
  }

  const token = genToken();
  await query('INSERT INTO sessions (token, user_id, role) VALUES (?,?,?)', [token, user.id, user.role]);
  res.json({ token, user });
});

module.exports = router;
