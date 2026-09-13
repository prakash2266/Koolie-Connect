import React, { useState, useEffect } from 'react';
import { useI18n } from '../context/I18nContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';

export default function AdminDashboard() {
  const { t } = useI18n();
  const { logout } = useAuth();
  const [tab, setTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [userRole, setUserRole] = useState('worker');
  const [reports, setReports] = useState([]);
  const [categories, setCategories] = useState([]);
  const [verifications, setVerifications] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [fraud, setFraud] = useState([]);
  const [newCat, setNewCat] = useState({ id: '', name_en: '', name_te: '', name_hi: '' });

  useEffect(() => { api('GET', '/admin/stats').then(setStats); }, []);

  async function openTab(name) {
    setTab(name);
    if (name === 'users') { const r = await api('GET', `/admin/users?role=${userRole}`); setUsers(r.users); }
    if (name === 'reports') { const r = await api('GET', '/admin/reports'); setReports(r.reports); }
    if (name === 'categories') { const r = await api('GET', '/categories'); setCategories(r.categories); }
    if (name === 'verification') { const r = await api('GET', '/admin/verification-requests'); setVerifications(r.requests); }
    if (name === 'analytics') { const r = await api('GET', '/admin/analytics'); setAnalytics(r); }
    if (name === 'fraud') { const r = await api('GET', '/admin/fraud-signals'); setFraud(r.signals); }
  }

  async function switchRole(role) {
    setUserRole(role);
    const r = await api('GET', `/admin/users?role=${role}`);
    setUsers(r.users);
  }

  async function setUserStatus(id, status) {
    await api('POST', '/admin/user-status', { user_id: id, status });
    switchRole(userRole);
  }

  async function resolveReport(id, action) {
    await api('POST', '/admin/reports/resolve', { report_id: id, action });
    const r = await api('GET', '/admin/reports'); setReports(r.reports);
  }

  async function toggleCategory(id, active) {
    await api('POST', '/admin/categories/toggle', { id, active });
    const r = await api('GET', '/categories'); setCategories(r.categories);
  }

  async function addCategory() {
    await api('POST', '/admin/categories', newCat);
    setNewCat({ id: '', name_en: '', name_te: '', name_hi: '' });
    const r = await api('GET', '/categories'); setCategories(r.categories);
  }

  async function approveWorker(workerId) {
    await api('POST', '/admin/verify-worker', { worker_id: workerId, verified: true });
    const r = await api('GET', '/admin/verification-requests'); setVerifications(r.requests);
  }

  return (
    <div>
      <div className="topbar">
        <h2>{t('admin_dashboard')}</h2>
        <button className="link-btn" onClick={logout}>{t('logout')}</button>
      </div>
      <div className="screen">
        <div className="nav-row">
          <button className="link-btn" onClick={() => openTab('stats')}>📊 Stats</button>
          <button className="link-btn" onClick={() => openTab('users')}>👥 Users</button>
          <button className="link-btn" onClick={() => openTab('reports')}>🚩 Reports</button>
          <button className="link-btn" onClick={() => openTab('categories')}>🏷️ Categories</button>
          <button className="link-btn" onClick={() => openTab('verification')}>✅ Verification</button>
          <button className="link-btn" onClick={() => openTab('analytics')}>📈 {t('analytics')}</button>
          <button className="link-btn" onClick={() => openTab('fraud')}>🛡️ {t('fraud_signals')}</button>
        </div>

        {tab === 'stats' && stats && (
          <div className="stats-grid">
            <div className="stat-box"><div className="num">{stats.total_workers}</div><div className="label">Total Workers</div></div>
            <div className="stat-box"><div className="num">{stats.available_workers}</div><div className="label">Available Listings</div></div>
            <div className="stat-box"><div className="num">{stats.booked_workers}</div><div className="label">Booked Listings</div></div>
            <div className="stat-box"><div className="num">{stats.total_customers}</div><div className="label">Total Customers</div></div>
            <div className="stat-box"><div className="num">{stats.completed_jobs}</div><div className="label">Completed Jobs</div></div>
            <div className="stat-box"><div className="num">{stats.open_reports}</div><div className="label">Open Reports</div></div>
          </div>
        )}

        {tab === 'users' && (
          <>
            <div className="card" style={{ display: 'flex', gap: 8 }}>
              <button className="link-btn" onClick={() => switchRole('worker')}>Workers</button>
              <button className="link-btn" onClick={() => switchRole('customer')}>Customers</button>
            </div>
            {users.map((u) => (
              <div key={u.id} className="worker-card">
                <div className="name">{u.name || u.phone} <span className={`status-badge ${u.status === 'active' ? 'available' : u.status === 'suspended' ? 'booked' : 'unavailable'}`}>{u.status}</span></div>
                <div className="meta">{u.phone}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {u.status !== 'active' && <button className="link-btn" onClick={() => setUserStatus(u.id, 'active')}>Activate</button>}
                  {u.status !== 'suspended' && <button className="link-btn" onClick={() => setUserStatus(u.id, 'suspended')}>Suspend</button>}
                  {u.status !== 'blocked' && <button className="link-btn" style={{ color: 'var(--red)' }} onClick={() => setUserStatus(u.id, 'blocked')}>Block</button>}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'reports' && reports.map((r) => (
          <div key={r.id} className="worker-card">
            <div className="name">{r.reason} <span className={`status-badge ${r.status === 'open' ? 'booked' : 'available'}`}>{r.status}</span></div>
            <div className="meta">{r.description}</div>
            {r.status === 'open' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="link-btn" onClick={() => resolveReport(r.id, 'dismiss')}>Dismiss</button>
                <button className="link-btn" onClick={() => resolveReport(r.id, 'warn')}>Warn</button>
                <button className="link-btn" style={{ color: 'var(--red)' }} onClick={() => resolveReport(r.id, 'block')}>Block</button>
              </div>
            )}
          </div>
        ))}

        {tab === 'categories' && (
          <>
            {categories.map((c) => (
              <div key={c.id} className="worker-card">
                <div className="name">{c.name_en} <span className={`status-badge ${c.active ? 'available' : 'unavailable'}`}>{c.active ? 'active' : 'inactive'}</span></div>
                <button className="link-btn" onClick={() => toggleCategory(c.id, !c.active)}>{c.active ? 'Deactivate' : 'Activate'}</button>
              </div>
            ))}
            <div className="card">
              <label>New category ID</label>
              <input value={newCat.id} onChange={(e) => setNewCat({ ...newCat, id: e.target.value })} />
              <label>Name (English)</label>
              <input value={newCat.name_en} onChange={(e) => setNewCat({ ...newCat, name_en: e.target.value })} />
              <label>Name (Telugu)</label>
              <input value={newCat.name_te} onChange={(e) => setNewCat({ ...newCat, name_te: e.target.value })} />
              <label>Name (Hindi)</label>
              <input value={newCat.name_hi} onChange={(e) => setNewCat({ ...newCat, name_hi: e.target.value })} />
              <button className="btn-primary" onClick={addCategory}>Add Category</button>
            </div>
          </>
        )}

        {tab === 'verification' && verifications.map((r) => (
          <div key={r.worker.id} className="worker-card">
            <div className="name">{r.user.name || r.user.phone}</div>
            <div className="meta">{r.listings.map((l) => l.skill_category).join(', ')}</div>
            <button className="btn-primary" onClick={() => approveWorker(r.worker.id)}>Approve</button>
          </div>
        ))}

        {tab === 'analytics' && analytics && (
          <>
            <div className="stats-grid">
              <div className="stat-box"><div className="num">⭐ {analytics.avgRating}</div><div className="label">Avg Rating</div></div>
              <div className="stat-box"><div className="num">₹{analytics.estimatedEarnings}</div><div className="label">Est. Wages Paid</div></div>
            </div>
            <div className="card">
              <label>Jobs (Last 7 Days)</label>
              {analytics.jobsByDay.map((d) => {
                const max = Math.max(1, ...analytics.jobsByDay.map((x) => x.count));
                return (
                  <div key={d.day} className="bar-row">
                    <div className="bar-label"><span>{d.day.slice(5)}</span><span>{d.count}</span></div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${(d.count / max) * 100}%` }}></div></div>
                  </div>
                );
              })}
            </div>
            <div className="card">
              <label>Top Rated Workers</label>
              {analytics.topRated.map((w, i) => (
                <div key={i} className="worker-card"><div className="name">{w.name}</div><div className="meta">{w.category} · ⭐ {w.rating} ({w.total_jobs} jobs)</div></div>
              ))}
            </div>
          </>
        )}

        {tab === 'fraud' && (
          fraud.length === 0 ? <div className="info-box">No fraud signals detected.</div> :
          fraud.map((s, i) => (
            <div key={i} className={`card signal-card ${s.severity}`}>
              <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{s.type.replace(/_/g, ' ')} <span className={`status-badge ${s.severity === 'high' ? 'unavailable' : s.severity === 'medium' ? 'booked' : 'available'}`}>{s.severity}</span></div>
              <p style={{ color: 'var(--muted)', fontSize: 15 }}>{s.description}</p>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Affected: {s.users.map((u) => u.name || u.phone).join(', ')}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
