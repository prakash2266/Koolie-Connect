import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '../context/I18nContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api, getLocation } from '../api.js';
import WorkerResultCard from '../components/WorkerResultCard.jsx';
import L from 'leaflet';

export default function CustomerDashboard() {
  const { t, lang } = useI18n();
  const { logout } = useAuth();
  const [categories, setCategories] = useState([]);
  const [notifs, setNotifs] = useState({ notifications: [], unread_count: 0 });
  const [recs, setRecs] = useState({ results: [], reason: '' });
  const [unrated, setUnrated] = useState(null);
  const [category, setCategory] = useState('any');
  const [radius, setRadius] = useState(5);
  const [sortMode, setSortMode] = useState('distance');
  const [results, setResults] = useState([]);
  const [aiText, setAiText] = useState('');
  const [aiUnderstood, setAiUnderstood] = useState(null);
  const [view, setView] = useState('dashboard'); // dashboard | notifications | requests | history
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedRating, setSelectedRating] = useState(0);
  const [review, setReview] = useState('');
  const [error, setError] = useState('');
  const [showMap, setShowMap] = useState(false);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  const load = useCallback(async () => {
    const n = await api('GET', '/notifications');
    setNotifs(n);
    const r = await api('GET', '/customer/recommendations');
    setRecs(r);
    const u = await api('GET', '/customer/unrated-booking');
    setUnrated(u.booking ? u : null);
  }, []);

  useEffect(() => {
    load();
    api('GET', '/categories').then((res) => setCategories(res.categories)).catch(() => {});
  }, [load]);

  async function runSearch() {
    setError(''); setAiUnderstood(null);
    try {
      const res = await api('GET', `/search?category=${category}&radius=${radius}&sort=${sortMode}`);
      setResults(res.results);
      setShowMap(false);
    } catch (e) {
      setError(e.message);
    }
  }

  async function runAiSearch() {
    if (!aiText.trim()) return;
    setError('');
    try {
      const res = await api('POST', '/ai-search', { text: aiText });
      setAiUnderstood(res.understood);
      setResults(res.results);
      setShowMap(false);
    } catch (e) {
      setError(e.message);
    }
  }

  async function toggleMap() {
    if (showMap) { setShowMap(false); return; }
    try {
      const loc = await getLocation();
      setShowMap(true);
      setTimeout(() => {
        if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
        const map = L.map(mapRef.current).setView([loc.latitude, loc.longitude], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
        L.marker([loc.latitude, loc.longitude]).addTo(map).bindPopup('📍 You').openPopup();
        results.forEach((w) => {
          if (w.approx_latitude == null) return;
          L.marker([w.approx_latitude, w.approx_longitude]).addTo(map).bindPopup(`👷 ${w.name} · ${w.skill_category} · ~${w.distance_km} KM`);
        });
        mapInstance.current = map;
      }, 50);
    } catch (e) {
      setError('Could not get your location.');
    }
  }

  async function submitRating() {
    if (!selectedRating || !unrated) return;
    await api('POST', '/rating', { booking_id: unrated.booking.id, worker_id: unrated.booking.worker_id, rating: selectedRating, review });
    setSelectedRating(0); setReview('');
    load();
  }

  async function openRequests() {
    const r = await api('GET', '/customer/work-requests');
    setRequests(r.requests);
    setView('requests');
  }

  async function openHistory() {
    const h = await api('GET', '/customer/job-history');
    setHistory(h.jobs);
    setView('history');
  }

  function categoryName(id) {
    const c = categories.find((x) => x.id === id);
    if (!c) return id;
    return c[`name_${lang}`] || c.name_en;
  }

  if (view === 'notifications') {
    return (
      <div>
        <div className="topbar"><button className="link-btn" onClick={() => setView('dashboard')}>← {t('back')}</button><h2>{t('notifications')}</h2></div>
        <div className="screen">
          {notifs.notifications.length === 0 && <div className="info-box">No notifications yet.</div>}
          {notifs.notifications.map((n) => (
            <div key={n.id} className="card" style={{ opacity: n.is_read ? 0.6 : 1 }}>
              <div style={{ fontWeight: 700 }}>{n.title}</div>
              <div style={{ color: 'var(--muted)', fontSize: 15 }}>{n.message}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'requests') {
    return (
      <div>
        <div className="topbar"><button className="link-btn" onClick={() => setView('dashboard')}>← {t('back')}</button><h2>{t('work_requests')}</h2></div>
        <div className="screen">
          {requests.length === 0 && <div className="info-box">No work requests yet.</div>}
          {requests.map((r) => (
            <div key={r.id} className="worker-card">
              <div className="name">{r.worker_name}</div>
              <div className="meta">{r.description} {r.work_date && `· 📅 ${r.work_date}`}</div>
              <span className={`status-badge ${r.status === 'pending' ? 'booked' : r.status === 'accepted' ? 'available' : 'unavailable'}`}>{r.status}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'history') {
    return (
      <div>
        <div className="topbar"><button className="link-btn" onClick={() => setView('dashboard')}>← {t('back')}</button><h2>{t('job_history')}</h2></div>
        <div className="screen">
          {history.length === 0 && <div className="info-box">No completed jobs yet.</div>}
          {history.map((j) => (
            <div key={j.booking_id} className="worker-card">
              <div className="name">{j.worker_name}</div>
              <div className="meta">{j.skill_category} · {j.completed_at && new Date(j.completed_at).toLocaleDateString()} {j.rating_given ? `· ⭐ ${j.rating_given}` : ''}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <h2>📍 {t('customer_dashboard')}</h2>
        <button className="link-btn" onClick={logout}>{t('logout')}</button>
      </div>
      <div className="screen">
        <div className="nav-row">
          <button className="link-btn" onClick={() => setView('notifications')}>🔔 {t('notifications')}{notifs.unread_count ? ` (${notifs.unread_count})` : ''}</button>
          <button className="link-btn" onClick={openRequests}>📋 {t('work_requests')}</button>
          <button className="link-btn" onClick={openHistory}>🕘 {t('job_history')}</button>
        </div>

        {unrated && (
          <div className="card">
            <p>⭐ {t('rate_worker')}: <b>{unrated.worker_name}</b></p>
            <div className="stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={`star ${n <= selectedRating ? 'filled' : ''}`} onClick={() => setSelectedRating(n)}>★</span>
              ))}
            </div>
            <textarea rows={2} placeholder="Optional review..." value={review} onChange={(e) => setReview(e.target.value)} />
            <button className="btn-primary" onClick={submitRating}>{t('submit_rating')}</button>
          </div>
        )}

        <div className="card">
          <label>🤖 {t('ai_search')}</label>
          <textarea rows={2} value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="e.g. I need two workers tomorrow morning for house painting" />
          <button className="btn-primary" onClick={runAiSearch}>{t('ai_search_btn')}</button>
          {aiUnderstood && (
            <div className="info-box">
              <b>Understood:</b> {aiUnderstood.category ? categoryName(aiUnderstood.category) : '—'}
              {aiUnderstood.workers_required > 1 ? ` × ${aiUnderstood.workers_required}` : ''}
              {aiUnderstood.date_label ? ` · 📅 ${aiUnderstood.date_label}` : ''}
              {aiUnderstood.time_range ? ` · 🕐 ${aiUnderstood.time_range}` : ''}
            </div>
          )}
        </div>

        {recs.results.length > 0 && (
          <div className="card">
            <label>✨ {t('recommended_for_you')}</label>
            {recs.results.map((w) => <WorkerResultCard key={w.listing_id} w={w} onBooked={load} />)}
          </div>
        )}

        <div className="card">
          <label>{t('what_worker_type')}</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="any">{t('any_worker')}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c[`name_${lang}`] || c.name_en}</option>)}
          </select>
          <label>{t('search_radius')}</label>
          <select value={radius} onChange={(e) => setRadius(e.target.value)}>
            <option value={2}>2 KM</option>
            <option value={5}>5 KM</option>
            <option value={10}>10 KM</option>
          </select>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0' }}>
            <label style={{ margin: 0 }}>Sort:</label>
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
              <option value="distance">{t('sort_distance')}</option>
              <option value="smart">{t('sort_smart')}</option>
            </select>
          </div>
          <button className="big-btn role-customer" onClick={runSearch}>{t('find_workers')}</button>
        </div>

        {results.length > 0 && (
          <button className="link-btn" onClick={toggleMap}>{showMap ? 'Hide Map' : t('view_map')}</button>
        )}
        {showMap && <div id="map-container" ref={mapRef}></div>}

        {error && <div className="error-box">{error}</div>}
        {results.map((w) => <WorkerResultCard key={w.listing_id} w={w} onBooked={load} />)}
      </div>
    </div>
  );
}
