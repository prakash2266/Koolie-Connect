import React, { useState } from 'react';
import { useI18n } from '../context/I18nContext.jsx';
import { api } from '../api.js';

// Shared card for search results / AI search / recommendations.
// Handles Call, Confirm Booking, and Send Work Request actions.
export default function WorkerResultCard({ w, onBooked }) {
  const { t } = useI18n();
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ description: '', work_date: '', start_time: '' });

  async function confirmBooking() {
    setError('');
    try {
      await api('POST', '/booking/confirm', { listing_id: w.listing_id });
      setConfirmed(true);
      if (onBooked) onBooked();
    } catch (e) {
      setError(e.message);
    }
  }

  async function sendRequest() {
    setError('');
    try {
      await api('POST', '/work-request', { listing_id: w.listing_id, ...form });
      setRequestSent(true);
    } catch (e) {
      setError(e.message);
    }
  }

  if (confirmed) {
    return <div className="success-box">Booking confirmed!</div>;
  }

  return (
    <div className="worker-card">
      <div className="name">👷 {w.name} {w.verified ? '✅' : ''}</div>
      <div className="meta">
        {w.skill_category} {w.distance_km != null ? `· 📍 ${w.distance_km} KM ${t('away')}` : ''}
        {w.rating ? ` · ⭐ ${w.rating}` : ''} {w.total_jobs ? ` (${w.total_jobs})` : ''}
        {w.match_score != null && <span className="match-badge"> {t('sort_smart')} {w.match_score}%</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>💰 ₹{w.expected_daily_wage}/{t('day')}</div>
        <a className="link-btn" href={`tel:${w.phone}`}>📞 {t('call_worker')}</a>
      </div>
      {error && <div className="error-box">{error}</div>}
      <button className="btn-primary" onClick={confirmBooking}>{t('confirm_booking')}</button>
      {!requestSent ? (
        <button className="link-btn" style={{ width: '100%', textAlign: 'center' }} onClick={() => setShowRequestForm(!showRequestForm)}>
          {t('send_work_request')}
        </button>
      ) : (
        <div className="success-box">✅ Sent</div>
      )}
      {showRequestForm && !requestSent && (
        <div style={{ marginTop: 10 }}>
          <label>Description</label>
          <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <label>Date</label>
          <input type="text" placeholder="2026-08-15" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} />
          <label>Time</label>
          <input type="text" placeholder="10:00 AM" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          <button className="btn-primary" onClick={sendRequest}>{t('send_work_request')}</button>
        </div>
      )}
    </div>
  );
}
