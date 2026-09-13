import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../context/I18nContext.jsx';
import LangBar from '../components/LangBar.jsx';
import { api } from '../api.js';

export default function WorkerRegister() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [categories, setCategories] = useState([]);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [wage, setWage] = useState('');
  const [experience, setExperience] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api('GET', '/categories').then((res) => {
      setCategories(res.categories);
      if (res.categories.length) setCategory(res.categories[0].id);
    }).catch(() => {});
  }, []);

  async function sendOtp() {
    setError('');
    if (!/^\d{10}$/.test(phone)) { setError('Please enter a valid 10-digit mobile number.'); return; }
    try {
      const res = await api('POST', '/auth/send-otp', { phone });
      nav('/otp/worker', { state: { phone, dev_otp: res.dev_otp, name, category, expected_daily_wage: Number(wage) || 0, experience } });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div className="topbar"><button className="link-btn" onClick={() => nav('/')}>← {t('back')}</button><LangBar /></div>
      <div className="screen">
        <h2>{t('i_am_worker')}</h2>
        <div className="card">
          <label>{t('mobile_number')}</label>
          <input type="tel" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <label>{t('your_name')}</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          <label>{t('work_category')}</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
          </select>
          <label>{t('expected_wage')}</label>
          <input type="number" value={wage} onChange={(e) => setWage(e.target.value)} placeholder="700" />
          <label>{t('experience')}</label>
          <input type="text" value={experience} onChange={(e) => setExperience(e.target.value)} />
          {error && <div className="error-box">{error}</div>}
          <button className="btn-primary" onClick={sendOtp}>{t('send_otp')}</button>
        </div>
      </div>
    </div>
  );
}
