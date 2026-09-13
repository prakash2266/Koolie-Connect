import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../context/I18nContext.jsx';
import LangBar from '../components/LangBar.jsx';

export default function Landing() {
  const { t } = useI18n();
  const nav = useNavigate();
  return (
    <div>
      <div className="topbar"><h2>📍 {t('app_name')}</h2><LangBar /></div>
      <div className="screen">
        <h1 className="brand">{t('app_name')}</h1>
        <p className="tagline">{t('tagline')}</p>
        <button className="big-btn role-worker" onClick={() => nav('/worker/register')}>👷 {t('i_am_worker')}</button>
        <button className="big-btn role-customer" onClick={() => nav('/customer/register')}>👨‍💼 {t('i_need_worker')}</button>
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button className="link-btn" onClick={() => nav('/admin/login')}>Admin Login</button>
        </div>
      </div>
    </div>
  );
}
