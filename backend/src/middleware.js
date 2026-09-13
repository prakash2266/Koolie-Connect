const { query } = require('./db');

function requireAuth(roles) {
  return async (req, res, next) => {
    const auth = req.headers['authorization'] || '';
    const token = auth.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'Not authenticated. Please log in again.' });

    const rows = await query('SELECT token, user_id, role FROM sessions WHERE token = ?', [token]);
    if (rows.length === 0) return res.status(401).json({ error: 'Not authenticated. Please log in again.' });

    const session = rows[0];
    if (roles && !roles.includes(session.role)) {
      return res.status(403).json({ error: 'You are not allowed to perform this action.' });
    }
    req.session = { user_id: session.user_id, role: session.role };
    next();
  };
}

module.exports = { requireAuth };
