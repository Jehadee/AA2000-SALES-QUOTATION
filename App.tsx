
import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { UserRole } from './types';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<UserRole>('SALES');

  useEffect(() => {
    try {
      const authStatus = localStorage.getItem('isQuotationAuth');
      const storedRole = localStorage.getItem('userRole') as UserRole;
      
      if (authStatus === 'true') {
        setIsAuthenticated(true);
        if (storedRole) setUserRole(storedRole);
      }
    } catch (e) {
      console.warn("Storage access restricted", e);
    }
  }, []);

  const handleLogin = (role: UserRole) => {
    setIsAuthenticated(true);
    setUserRole(role);
    try {
      localStorage.setItem('isQuotationAuth', 'true');
      localStorage.setItem('userRole', role);
    } catch (e) {
      console.warn("Could not persist auth state", e);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserRole('SALES');
    try {
      localStorage.removeItem('isQuotationAuth');
      localStorage.removeItem('userRole');
    } catch (e) {
      console.warn("Could not clear auth state", e);
    }
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return <Dashboard onLogout={handleLogout} userRole={userRole} />;
};

export default App;
