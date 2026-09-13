const crypto = require('crypto');

function uid() { return crypto.randomUUID(); }
function genOtp() { return String(Math.floor(1000 + Math.random() * 9000)); }
function genToken() { return crypto.randomBytes(24).toString('hex'); }

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function jitterCoord(lat, lng, seedStr, maxMeters = 350) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  const r1 = (h % 1000) / 1000;
  const r2 = ((h * 7) % 1000) / 1000;
  const angle = r1 * 2 * Math.PI;
  const distMeters = r2 * maxMeters;
  const dLat = (distMeters * Math.cos(angle)) / 111320;
  const dLng = (distMeters * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return { latitude: lat + dLat, longitude: lng + dLng };
}

module.exports = { uid, genOtp, genToken, haversineKm, jitterCoord };
