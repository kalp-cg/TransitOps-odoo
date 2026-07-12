import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import Drivers from './pages/Drivers';
import Trips from './pages/Trips';
import Maintenance from './pages/Maintenance';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Users from './pages/Users';
import { api } from './api';

const PAGE_LABELS = {
  dashboard: 'Dashboard',
  vehicles: 'Vehicle Registry',
  drivers: 'Driver Management',
  trips: 'Trip Dispatcher',
  maintenance: 'Maintenance Scheduler',
  expenses: 'Fuel & Expenses',
  reports: 'Reports & Analytics',
  users: 'Users & Roles',
};

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Restore session on mount
  useEffect(() => {
    const restore = async () => {
      const token = localStorage.getItem('transitops_token');
      if (token) {
        try {
          const res = await api.me();
          setUser(res.user || res);
        } catch {
          localStorage.removeItem('transitops_token');
        }
      }
      setAuthLoading(false);
    };
    restore();
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('transitops_token');
    setUser(null);
    setActiveTab('dashboard');
  };

  if (authLoading) {
    return (
      <div style={{
        display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'var(--bg-dark)', color: 'var(--text-muted)', fontSize: '14px'
      }}>
        Loading TransitOps…
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const renderPage = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard userRole={user.role} />;
      case 'vehicles': return <Vehicles userRole={user.role} />;
      case 'drivers': return <Drivers userRole={user.role} />;
      case 'trips': return <Trips userRole={user.role} />;
      case 'maintenance': return <Maintenance userRole={user.role} />;
      case 'expenses': return <Expenses userRole={user.role} />;
      case 'reports': return <Reports userRole={user.role} />;
      case 'users': return <Users userRole={user.role} />;
      default: return <Dashboard userRole={user.role} />;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} userRole={user.role} />

      <div style={{
        marginLeft: 'var(--sidebar-width)',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh'
      }}>
        <Header user={user} currentPage={PAGE_LABELS[activeTab] || activeTab} onLogout={handleLogout} />

        <main style={{
          marginTop: '56px',
          padding: '24px',
          flex: 1,
          backgroundColor: 'var(--bg-dark)',
          overflowY: 'auto'
        }}>
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default App;
