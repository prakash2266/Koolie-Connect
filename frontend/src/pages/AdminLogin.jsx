import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../context/I18nContext.jsx';
import LangBar from '../components/LangBar.jsx';
import { api } from '../api.js';

export default function AdminLogin() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  async function sendOtp() {
    setError('');
    try {
      const res = await api('POST', '/auth/send-otp', { phone });
      nav('/otp/admin', { state: { phone, dev_otp: res.dev_otp } });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div className="topbar"><button className="link-btn" onClick={() => nav('/')}>← {t('back')}</button><LangBar /></div>
      <div className="screen">
        <h2>Admin Login</h2>
        <div className="card">
          <label>{t('mobile_number')}</label>
          <input type="tel" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9999999999" />
          {error && <div className="error-box">{error}</div>}
          <button className="btn-primary" onClick={sendOtp}>{t('send_otp')}</button>
        </div>
      </div>
    </div>
  );
}
