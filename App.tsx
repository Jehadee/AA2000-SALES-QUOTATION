
import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { UserRole } from './types';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<UserRole>('SALES');
  const [accountId, setAccountId] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    try {
      const authStatus = localStorage.getItem('isQuotationAuth');
      const storedRole = localStorage.getItem('userRole') as UserRole;
      const storedAccount = localStorage.getItem('quotationAccountId') || '';
      const storedName = localStorage.getItem('quotationDisplayName') || '';

      if (authStatus === 'true') {
        setIsAuthenticated(true);
        if (storedRole) setUserRole(storedRole);
        setAccountId(storedAccount);
        setDisplayName(storedName);
      }
    } catch (e) {
      console.warn("Storage access restricted", e);
    }
  }, []);

  const handleLogin = (role: UserRole, profile: { accountId: string; displayName: string }) => {
    setIsAuthenticated(true);
    setUserRole(role);
    setAccountId(profile.accountId.trim());
    setDisplayName(profile.displayName.trim());
    try {
      localStorage.setItem('isQuotationAuth', 'true');
      localStorage.setItem('userRole', role);
      localStorage.setItem('quotationAccountId', profile.accountId.trim());
      localStorage.setItem('quotationDisplayName', profile.displayName.trim());
    } catch (e) {
      console.warn("Could not persist auth state", e);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserRole('SALES');
    setAccountId('');
    setDisplayName('');
    try {
      localStorage.removeItem('isQuotationAuth');
      localStorage.removeItem('userRole');
      localStorage.removeItem('quotationAccountId');
      localStorage.removeItem('quotationDisplayName');
    } catch (e) {
      console.warn("Could not clear auth state", e);
    }
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Dashboard
      onLogout={handleLogout}
      userRole={userRole}
      accountId={accountId}
      displayName={displayName}
    />
  );
};

export default App;
