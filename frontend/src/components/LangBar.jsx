import React from 'react';
import { useI18n } from '../context/I18nContext.jsx';

const LANGS = [['en', 'English'], ['te', 'తెలుగు'], ['hi', 'हिन्दी']];

export default function LangBar() {
  const { lang, changeLang } = useI18n();
  return (
    <div className="lang-pill">
      {LANGS.map(([code, label]) => (
        <button
          key={code}
          className={lang === code ? 'active' : ''}
          onClick={() => changeLang(code)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
