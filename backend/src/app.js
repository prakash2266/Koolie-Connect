const express = require('express');
const cors = require('cors');
require('express-async-errors');

const authRoutes = require('./routes/auth');
const workerRoutes = require('./routes/worker').router;
const customerRoutes = require('./routes/customer');
const bookingRoutes = require('./routes/booking');
const miscRoutes = require('./routes/misc');
const adminRoutes = require('./routes/admin');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', authRoutes);
app.use('/api', workerRoutes);
app.use('/api', customerRoutes);
app.use('/api', bookingRoutes);
app.use('/api', miscRoutes);
app.use('/api', adminRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

module.exports = app;
