import React, { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../context/I18nContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api, getLocation } from '../api.js';

export default function WorkerDashboard() {
  const { t, lang } = useI18n();
  const { logout } = useAuth();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [listings, setListings] = useState([]);
  const [categories, setCategories] = useState([]);
  const [notifs, setNotifs] = useState({ notifications: [], unread_count: 0 });
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [view, setView] = useState('dashboard'); // dashboard | notifications | requests | history
  const [activeBooking, setActiveBooking] = useState(null);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newListing, setNewListing] = useState({ skill_category: '', expected_daily_wage: '', experience: '' });

  const load = useCallback(async () => {
    const me = await api('GET', '/me');
    setUser(me.user);
    setProfile(me.profile);
    setListings(me.listings || []);
    const n = await api('GET', '/notifications');
    setNotifs(n);
    const booked = (me.listings || []).find((l) => l.availability_status === 'booked');
    if (booked) {
      const b = await api('GET', '/worker/active-booking');
      setActiveBooking(b.booking);
    } else {
      setActiveBooking(null);
    }
  }, []);

  useEffect(() => {
    load();
    api('GET', '/categories').then((res) => {
      setCategories(res.categories);
      if (res.categories.length) setNewListing((f) => ({ ...f, skill_category: res.categories[0].id }));
    }).catch(() => {});
  }, [load]);

  async function goAvailable(listingId) {
    setError('');
    try {
      const loc = await getLocation();
      await api('POST', '/worker/location', loc);
      await api('POST', '/worker/listing-status', { listing_id: listingId, status: 'available' });
      load();
    } catch (e) {
      setError(e.message || 'Please allow location access.');
    }
  }

  async function goUnavailable(listingId) {
    setError('');
    try {
      await api('POST', '/worker/listing-status', { listing_id: listingId, status: 'unavailable' });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function completeJob(nextStatus) {
    if (!activeBooking) return;
    await api('POST', '/booking/complete', { booking_id: activeBooking.id, next_status: nextStatus });
    load();
  }

  async function addListing() {
    setError('');
    try {
      await api('POST', '/worker/listings', {
        skill_category: newListing.skill_category,
        expected_daily_wage: Number(newListing.expected_daily_wage) || 0,
        experience: newListing.experience
      });
      setShowAddForm(false);
      setNewListing({ skill_category: categories[0]?.id || '', expected_daily_wage: '', experience: '' });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function requestVerification() {
    await api('POST', '/worker/request-verification');
    load();
  }

  async function openRequests() {
    const r = await api('GET', '/worker/work-requests');
    setRequests(r.requests);
    setView('requests');
  }

  async function respondRequest(id, action) {
    await api('POST', '/work-request/respond', { request_id: id, action });
    const r = await api('GET', '/worker/work-requests');
    setRequests(r.requests);
    load();
  }

  async function openHistory() {
    const h = await api('GET', '/worker/job-history');
    setHistory(h.jobs);
    setView('history');
  }

  async function openNotifications() {
    setView('notifications');
  }

  function categoryName(id) {
    const c = categories.find((x) => x.id === id);
    if (!c) return id;
    return c[`name_${lang}`] || c.name_en;
  }

  if (!profile) return <div className="screen">Loading…</div>;

  if (view === 'notifications') {
    return (
      <div>
        <div className="topbar"><button className="link-btn" onClick={() => setView('dashboard')}>← {t('back')}</button><h2>{t('notifications')}</h2></div>
        <div className="screen">
          {notifs.notifications.length === 0 && <div className="info-box">No notifications yet.</div>}
          {notifs.notifications.map((n) => (
            <div key={n.id} className="card" style={{ opacity: n.is_read ? 0.6 : 1, borderColor: n.is_read ? undefined : 'var(--blue)' }}>
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
              <div className="name">{r.customer_name}</div>
              <div className="meta">{r.description} {r.work_date && `· 📅 ${r.work_date}`} {r.start_time && `· 🕐 ${r.start_time}`}</div>
              <span className={`status-badge ${r.status === 'pending' ? 'booked' : r.status === 'accepted' ? 'available' : 'unavailable'}`}>{r.status}</span>
              {r.status === 'pending' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="link-btn" onClick={() => respondRequest(r.id, 'accept')}>{t('accept')}</button>
                  <button className="link-btn" style={{ color: 'var(--red)' }} onClick={() => respondRequest(r.id, 'reject')}>{t('reject')}</button>
                </div>
              )}
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
              <div className="name">{j.customer_name}</div>
              <div className="meta">{j.skill_category} · {j.completed_at && new Date(j.completed_at).toLocaleDateString()} {j.rating ? `· ⭐ ${j.rating}` : ''}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <h2>📍 {t('worker_dashboard')}</h2>
        <button className="link-btn" onClick={logout}>{t('logout')}</button>
      </div>
      <div className="screen">
        <div className="nav-row">
          <button className="link-btn" onClick={openNotifications}>🔔 {t('notifications')}{notifs.unread_count ? ` (${notifs.unread_count})` : ''}</button>
          <button className="link-btn" onClick={openRequests}>📋 {t('work_requests')}</button>
          <button className="link-btn" onClick={openHistory}>🕘 {t('job_history')}</button>
        </div>

        <div className="card">
          <div style={{ fontSize: 20, fontWeight: 700 }}>{user?.name || user?.phone} {profile.verified ? '✅' : ''}</div>
          {!profile.verified && (
            <button className="link-btn" disabled={profile.verification_requested} onClick={requestVerification}>
              {profile.verification_requested ? 'Verification pending admin review' : `✅ ${t('request_verification')}`}
            </button>
          )}
        </div>

        <label style={{ fontWeight: 700, display: 'block', margin: '10px 0 6px' }}>{t('my_job_listings')}</label>
        {listings.map((l) => (
          <div key={l.id} className="worker-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{categoryName(l.skill_category)}</div>
                <div className="meta">₹{l.expected_daily_wage}/{t('day')} {l.experience && `· ${l.experience}`}</div>
              </div>
              <span className={`status-badge ${l.availability_status}`}>{t(`status_${l.availability_status}`)}</span>
            </div>
            {l.availability_status === 'booked' ? (
              <div style={{ marginTop: 10 }}>
                <button className="big-btn neutral" onClick={() => completeJob('available')}>{t('mark_completed')} → {t('available_again')}</button>
                <button className="big-btn unavailable" onClick={() => completeJob('unavailable')}>{t('mark_completed')} → {t('become_unavailable')}</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {l.availability_status !== 'available' && (
                  <button className="big-btn available" style={{ flex: 1, margin: 0, padding: 14, fontSize: 16 }} onClick={() => goAvailable(l.id)}>YES</button>
                )}
                {l.availability_status !== 'unavailable' && (
                  <button className="big-btn unavailable" style={{ flex: 1, margin: 0, padding: 14, fontSize: 16 }} onClick={() => goUnavailable(l.id)}>NO</button>
                )}
              </div>
            )}
          </div>
        ))}

        <button className="link-btn" style={{ width: '100%', textAlign: 'center', border: '2px dashed var(--border)', padding: 14, borderRadius: 12 }} onClick={() => setShowAddForm(!showAddForm)}>
          ➕ {t('add_job_listing')}
        </button>

        {showAddForm && (
          <div className="card" style={{ marginTop: 12 }}>
            <label>{t('work_category')}</label>
            <select value={newListing.skill_category} onChange={(e) => setNewListing({ ...newListing, skill_category: e.target.value })}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c[`name_${lang}`] || c.name_en}</option>)}
            </select>
            <label>{t('expected_wage')}</label>
            <input type="number" value={newListing.expected_daily_wage} onChange={(e) => setNewListing({ ...newListing, expected_daily_wage: e.target.value })} placeholder="700" />
            <label>{t('experience')}</label>
            <input type="text" value={newListing.experience} onChange={(e) => setNewListing({ ...newListing, experience: e.target.value })} />
            <button className="btn-primary" onClick={addListing}>{t('save_listing')}</button>
          </div>
        )}
        {error && <div className="error-box">{error}</div>}
      </div>
    </div>
  );
}
