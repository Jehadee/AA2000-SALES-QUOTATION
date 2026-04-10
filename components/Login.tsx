
import React, { useState } from 'react';
import { UserRole } from '../types';

interface Props {
  onLogin: (role: UserRole, profile: { accountId: string; displayName: string }) => void;
}

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

const Login: React.FC<Props> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const u = username.trim().toLowerCase();
    const p = password;

    await new Promise((r) => setTimeout(r, 350));

    if (u === ADMIN_USER && p === ADMIN_PASS) {
      onLogin('ADMIN', {
        accountId: '1',
        displayName: 'Administrator',
      });
      return;
    }

    setError('Invalid username or password.');
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 sm:p-8 bg-[#070b14] relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 20% -10%, rgba(59, 130, 246, 0.22), transparent 55%), radial-gradient(ellipse 60% 50% at 95% 80%, rgba(99, 102, 241, 0.18), transparent 50%)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.028\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]" />

      <div className="w-full max-w-[420px] relative z-10">
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-[0_24px_80px_-12px_rgba(0,0,0,0.5)] px-8 py-10 sm:px-10 sm:py-11">
          <header className="text-center mb-9">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-950/40">
              <span className="text-lg font-black tracking-tight text-white">AA</span>
            </div>
            <h1 className="text-[1.65rem] font-bold tracking-tight text-white sm:text-[1.75rem]">AA2000</h1>
            <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Security &amp; Technology Solutions
            </p>
            <div className="mx-auto mt-8 h-px w-12 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <h2 className="mt-7 text-lg font-semibold text-white">Sales quotation</h2>
            <p className="mt-2 max-w-[280px] mx-auto text-sm leading-relaxed text-slate-400">
              Sign in with your username and password.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="login-username" className="block text-sm font-medium text-slate-300">
                Username
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-white/[0.1] bg-[#0c1220] px-4 py-3.5 text-[15px] text-white placeholder:text-slate-600 shadow-inner outline-none transition-colors focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
                placeholder="Enter username"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-300">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/[0.1] bg-[#0c1220] px-4 py-3.5 text-[15px] text-white placeholder:text-slate-600 shadow-inner outline-none transition-colors focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div
                role="alert"
                className="flex gap-3 rounded-xl border border-red-500/25 bg-red-950/40 px-4 py-3 text-sm text-red-200"
              >
                <svg
                  className="mt-0.5 h-5 w-5 shrink-0 text-red-400/90"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <p className="min-w-0 leading-snug">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-indigo-950/50 transition-all hover:from-blue-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isLoading ? (
                <>
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path
                      className="opacity-80"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-500">
            <span className="text-slate-600">Need help?</span> Contact IT.
          </p>
        </div>

        <p className="mt-8 text-center text-[11px] text-slate-600">© AA2000 · Internal use</p>
      </div>
    </div>
  );
};

export default Login;
