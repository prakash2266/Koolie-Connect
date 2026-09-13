import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../context/I18nContext.jsx';
import { api, getLocation } from '../api.js';

export default function WorkerLocation() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function allow() {
    setError(''); setStatus('');
    try {
      const loc = await getLocation();
      await api('POST', '/worker/location', loc);
      setStatus('ok');
      setTimeout(() => nav('/worker/dashboard'), 500);
    } catch (e) {
      setError('Location permission is required to appear in searches.');
    }
  }

  return (
    <div>
      <div className="topbar"><h2>📍 {t('worker_dashboard')}</h2></div>
      <div className="screen">
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 50 }}>📍</div>
          <h3>Allow this website to access your location</h3>
          <p style={{ color: 'var(--muted)' }}>We need your location so nearby customers can find you. Your exact address is never shown publicly.</p>
          {status === 'ok' && <div className="success-box">✅ {t('location_detected')}</div>}
          {error && <div className="error-box">{error}</div>}
          <button className="big-btn role-worker" onClick={allow}>{t('allow_location_btn')}</button>
        </div>
      </div>
    </div>
  );
}
