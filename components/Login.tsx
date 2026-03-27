
import React, { useState } from 'react';
import { UserRole } from '../types';

interface Props {
  onLogin: (role: UserRole) => void;
}

const Login: React.FC<Props> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Simulate network delay
    setTimeout(() => {
      if (username === 'admin' && password === 'admin123') {
        onLogin('ADMIN');
      } else if (username === 'sales' && password === 'sales123') {
        onLogin('SALES');
      } else {
        setError('Invalid credentials. Use admin/admin123 or sales/sales123');
        setIsLoading(false);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px]" />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[2.5rem] shadow-2xl">
          <div className="text-center mb-8">
            <div className="mb-6 flex flex-col items-center">
              <svg width="100" height="100" viewBox="0 0 120 120" className="drop-shadow-2xl">
                <circle cx="60" cy="60" r="30" fill="#3b82f6" opacity="0.2" />
                <path d="M40 25 A45 45 0 0 1 105 60" fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
                <path d="M15 60 A45 45 0 0 0 80 105" fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
                <circle cx="60" cy="60" r="28" fill="#1e40af" />
                <circle cx="60" cy="60" r="20" fill="#3b82f6" />
                <circle cx="52" cy="52" r="6" fill="white" opacity="0.4" />
                <line x1="20" y1="70" x2="40" y2="50" stroke="#2563eb" strokeWidth="2" opacity="0.5" />
              </svg>
              <h2 className="text-4xl font-black text-white tracking-tighter mt-4 italic uppercase">AA2000</h2>
              <p className="text-[9px] text-blue-400 font-bold uppercase tracking-[0.15em] mt-1">Security and Technology Solutions Inc.</p>
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Internal Access</h1>
            <p className="text-slate-400 text-sm">Sign in to the AA2000 Quotation Engine</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">Username</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                placeholder="admin"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg flex items-center gap-2 animate-shake">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              ) : (
                'System Login'
              )}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-white/10 text-center">
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
              Standard Operation Environment v3.1
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
