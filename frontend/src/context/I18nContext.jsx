import React, { createContext, useContext, useState, useCallback } from 'react';
import en from '../i18n/en.json';
import te from '../i18n/te.json';
import hi from '../i18n/hi.json';

const DICTS = { en, te, hi };
const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(localStorage.getItem('dkc_lang') || 'en');

  const changeLang = useCallback((l) => {
    localStorage.setItem('dkc_lang', l);
    setLang(l);
  }, []);

  const t = useCallback((key) => DICTS[lang][key] || key, [lang]);

  return (
    <I18nContext.Provider value={{ lang, changeLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
