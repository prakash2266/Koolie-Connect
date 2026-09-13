const { query } = require('./db');
const { uid } = require('./utils');

async function notify(userId, title, message, type) {
  await query(
    'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at) VALUES (?,?,?,?,?,0,NOW())',
    [uid(), userId, title, message, type]
  );
}

module.exports = { notify };
