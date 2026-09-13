import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../context/I18nContext.jsx';
import { api, getLocation } from '../api.js';

export default function CustomerLocation() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function allow() {
    setError(''); setStatus('');
    try {
      const loc = await getLocation();
      await api('POST', '/customer/location', loc);
      setStatus('ok');
      setTimeout(() => nav('/customer/dashboard'), 500);
    } catch (e) {
      setError('Location permission is required to search for workers.');
    }
  }

  return (
    <div>
      <div className="topbar"><h2>📍 {t('customer_dashboard')}</h2></div>
      <div className="screen">
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 50 }}>📍</div>
          <h3>Allow this website to access your location</h3>
          <p style={{ color: 'var(--muted)' }}>We need your location to find workers near you. Your exact address is never shown publicly.</p>
          {status === 'ok' && <div className="success-box">✅ {t('location_detected')}</div>}
          {error && <div className="error-box">{error}</div>}
          <button className="big-btn role-customer" onClick={allow}>{t('allow_location_btn')}</button>
        </div>
      </div>
    </div>
  );
}
