import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { I18nProvider } from './context/I18nContext.jsx';

import Landing from './pages/Landing.jsx';
import WorkerRegister from './pages/WorkerRegister.jsx';
import OtpVerify from './pages/OtpVerify.jsx';
import WorkerLocation from './pages/WorkerLocation.jsx';
import WorkerDashboard from './pages/WorkerDashboard.jsx';
import CustomerRegister from './pages/CustomerRegister.jsx';
import CustomerLocation from './pages/CustomerLocation.jsx';
import CustomerDashboard from './pages/CustomerDashboard.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';

function Protected({ role, children }) {
  const { token, role: userRole } = useAuth();
  if (!token) return <Navigate to="/" replace />;
  if (role && userRole !== role) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/worker/register" element={<WorkerRegister />} />
      <Route path="/otp/:role" element={<OtpVerify />} />
      <Route path="/worker/location" element={<Protected role="worker"><WorkerLocation /></Protected>} />
      <Route path="/worker/dashboard" element={<Protected role="worker"><WorkerDashboard /></Protected>} />
      <Route path="/customer/register" element={<CustomerRegister />} />
      <Route path="/customer/location" element={<Protected role="customer"><CustomerLocation /></Protected>} />
      <Route path="/customer/dashboard" element={<Protected role="customer"><CustomerDashboard /></Protected>} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/dashboard" element={<Protected role="admin"><AdminDashboard /></Protected>} />
    </Routes>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </I18nProvider>
  );
}
