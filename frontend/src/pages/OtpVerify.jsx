import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useI18n } from '../context/I18nContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import LangBar from '../components/LangBar.jsx';
import { api } from '../api.js';

export default function OtpVerify() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const { role } = useParams();
  const location = useLocation();
  const { login } = useAuth();
  const reg = location.state || {};
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // page was opened directly without going through registration first
    if (!reg.phone) nav('/');
  }, [reg.phone, nav]);

  if (!reg.phone) return null;

  async function verify() {
    setError('');
    try {
      const res = await api('POST', '/auth/verify-otp', {
        phone: reg.phone,
        otp,
        role,
        name: reg.name,
        language: lang,
        category: reg.category,
        experience: reg.experience,
        expected_daily_wage: reg.expected_daily_wage
      });
      login(res.token, res.user.role, res.user);
      if (res.user.role === 'worker') nav('/worker/location');
      else if (res.user.role === 'customer') nav('/customer/location');
      else nav('/admin/dashboard');
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div className="topbar"><button className="link-btn" onClick={() => nav(-1)}>← {t('back')}</button><LangBar /></div>
      <div className="screen">
        <h2>{t('enter_otp')}</h2>
        <p>OTP sent to {reg.phone}</p>
        <div className="info-box">Dev mode: your OTP is <b>{reg.dev_otp}</b> (a real SMS gateway would send this in production).</div>
        <div className="card">
          <input
            type="tel"
            maxLength={4}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            style={{ textAlign: 'center', fontSize: 28, letterSpacing: 8 }}
            placeholder="1234"
          />
          {error && <div className="error-box">{error}</div>}
          <button className="btn-primary" onClick={verify}>{t('verify')}</button>
        </div>
      </div>
    </div>
  );
}
