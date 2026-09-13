import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../context/I18nContext.jsx';
import LangBar from '../components/LangBar.jsx';
import { api } from '../api.js';

export default function CustomerRegister() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  async function sendOtp() {
    setError('');
    if (!/^\d{10}$/.test(phone)) { setError('Please enter a valid 10-digit mobile number.'); return; }
    try {
      const res = await api('POST', '/auth/send-otp', { phone });
      nav('/otp/customer', { state: { phone, dev_otp: res.dev_otp, name } });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div className="topbar"><button className="link-btn" onClick={() => nav('/')}>← {t('back')}</button><LangBar /></div>
      <div className="screen">
        <h2>{t('i_need_worker')}</h2>
        <div className="card">
          <label>{t('mobile_number')}</label>
          <input type="tel" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <label>{t('your_name')}</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          {error && <div className="error-box">{error}</div>}
          <button className="btn-primary" onClick={sendOtp}>{t('send_otp')}</button>
        </div>
      </div>
    </div>
  );
}
