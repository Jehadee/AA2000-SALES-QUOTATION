
import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import { UserRole } from './types';

type VerifyLaunchResponse = {
  session?: {
    s_ID?: number | string | null;
    s_name?: string | null;
  };
  account?: {
    role_name?: string | null;
    role_ID?: number | string | null;
  };
};

type SessionBridgeMessage = {
  type?: string;
  sessionToken?: string;
  sessionId?: string | number;
  roleName?: string;
  account?: {
    role_name?: string | null;
  };
  session?: {
    s_name?: string | null;
    s_ID?: string | number | null;
  };
};

function normalizeUserRole(input?: string | null): UserRole {
  const role = String(input || '').trim().toUpperCase();
  if (role.includes('ADMIN')) return 'ADMIN';
  return 'SALES';
}

function resolveRoleFromSessionPayload(data: VerifyLaunchResponse): UserRole {
  const roleName = data.account?.role_name;
  if (roleName && String(roleName).trim()) {
    return normalizeUserRole(roleName);
  }
  const roleId = data.account?.role_ID;
  if (roleId != null && String(roleId).trim()) {
    const id = Number(roleId);
    // Conservative fallback if backend returns only role_ID.
    if (Number.isFinite(id) && id === 1) return 'ADMIN';
  }
  return 'SALES';
}

function getApiBaseCandidates(kind: 'auth' | 'default' = 'default'): string[] {
  const env = (import.meta as any).env ?? {};
  const multiRaw =
    kind === 'auth'
      ? String(env.VITE_AUTH_API_BASE_URLS ?? env.VITE_API_BASE_URLS ?? '')
      : String(env.VITE_API_BASE_URLS ?? '');
  const singleRaw =
    kind === 'auth'
      ? String(env.VITE_AUTH_API_BASE_URL ?? env.VITE_API_BASE_URL ?? '')
      : String(env.VITE_API_BASE_URL ?? '');

  const multi = multiRaw
    .split(',')
    .map((x: string) => x.trim())
    .filter(Boolean);
  const single = singleRaw.trim();
  const all = [...multi, ...(single ? [single] : [])].map((u) => u.replace(/\/+$/, ''));
  return Array.from(new Set(all));
}

function isAbsoluteUrl(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

function withPrefix(path: string): string {
  const env = (import.meta as any).env ?? {};
  const prefixRaw = String(env.VITE_API_PREFIX ?? '').trim();
  if (!prefixRaw) return path;
  const prefix = prefixRaw.startsWith('/') ? prefixRaw : `/${prefixRaw}`;
  return `${prefix}${path}`.replace(/\/{2,}/g, '/');
}

function buildRouteCandidates(primaryRoute: string, secondaryBases: string[] = []): string[] {
  const normalizedPrimary = primaryRoute.startsWith('/') ? primaryRoute : `/${primaryRoute}`;
  const commonBases = ['', '/api', '/auth', '/login', '/account', '/accounts', '/service', '/service/auth', '/service/login'];
  const allBases = Array.from(new Set([...secondaryBases, ...commonBases]));
  const prefixedPrimary = withPrefix(normalizedPrimary);

  const variants = new Set<string>();
  variants.add(normalizedPrimary);
  variants.add(prefixedPrimary);
  for (const base of allBases) {
    const b = base ? (base.startsWith('/') ? base : `/${base}`) : '';
    variants.add(`${b}${normalizedPrimary}`.replace(/\/{2,}/g, '/'));
    variants.add(`${b}${prefixedPrimary}`.replace(/\/{2,}/g, '/'));
  }
  return Array.from(variants);
}

function parseBooleanEnv(value: unknown): boolean | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return null;
}

function shouldClearInvalidSession(): boolean {
  const env = (import.meta as any).env ?? {};
  // Testing-friendly default: keep session values unless explicitly enabled.
  const parsed = parseBooleanEnv(env.VITE_AUTH_CLEAR_INVALID_SESSION);
  return parsed === true;
}

function getRawQueryParam(search: string, key: string): string | null {
  if (!search) return null;
  const q = search.startsWith('?') ? search.slice(1) : search;
  if (!q) return null;
  const parts = q.split('&');
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) {
      if (part === key) return '';
      continue;
    }
    const k = part.slice(0, eq);
    if (k === key) return part.slice(eq + 1); // keep exact raw value from URL
  }
  return null;
}

function getTokenFromCurrentUrl(): string {
  const search = window.location.search || '';
  const keys = ['__launch', 'launchToken', 'sessionToken', 'token'];
  for (const key of keys) {
    const raw = getRawQueryParam(search, key);
    if (raw !== null) return raw; // do not trim/alter
  }

  // Support path-style launch links, e.g. "/__launch=TOKEN"
  const path = window.location.pathname || '';
  const pathMatch = path.match(/\/__launch=([^/?#]+)/);
  if (pathMatch && pathMatch[1] != null) return pathMatch[1];

  return '';
}

async function verifyLaunchToken(launchToken: string): Promise<VerifyLaunchResponse | null> {
  const env = (import.meta as any).env ?? {};
  const launchUrlOverride = String(env.VITE_VERIFY_LAUNCH_URL ?? '').trim();
  if (launchUrlOverride) {
    const url = launchUrlOverride.includes('{token}')
      ? launchUrlOverride.replace('{token}', encodeURIComponent(launchToken))
      : `${launchUrlOverride}${launchUrlOverride.includes('?') ? '&' : '?'}${new URLSearchParams({ __launch: launchToken }).toString()}`;
    try {
      const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      return (await res.json()) as VerifyLaunchResponse;
    } catch {
      return null;
    }
  }

  const routeRaw = String(env.VITE_VERIFY_LAUNCH_PATH ?? '/verify-launch').trim();
  const route = routeRaw.startsWith('/') ? routeRaw : `/${routeRaw}`;
  const candidates = getApiBaseCandidates('auth');
  if (candidates.length === 0) return null;

  const qs = new URLSearchParams({ __launch: launchToken }).toString();
  const strictRoutes = parseBooleanEnv(env.VITE_AUTH_STRICT_ROUTES);
  const paths = strictRoutes === true
    ? Array.from(new Set([route, withPrefix(route)]))
    : buildRouteCandidates(route, ['/auth', '/login', '/account']);

  for (const base of candidates) {
    for (const path of paths) {
      const url = `${base}${path}?${qs}`;
      try {
        const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
        if (!res.ok) continue;
        const data = (await res.json()) as VerifyLaunchResponse;
        return data;
      } catch {
        // try the next candidate endpoint
      }
    }
  }

  return null;
}

async function verifySessionToken(sessionToken: string): Promise<VerifyLaunchResponse | null> {
  const env = (import.meta as any).env ?? {};
  const sessionUrlOverride = String(env.VITE_VERIFY_SESSION_URL ?? '').trim();
  if (sessionUrlOverride) {
    const url = sessionUrlOverride.includes('{token}')
      ? sessionUrlOverride.replace('{token}', encodeURIComponent(sessionToken))
      : `${sessionUrlOverride.replace(/\/+$/, '')}/${encodeURIComponent(sessionToken)}`;
    try {
      const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      return (await res.json()) as VerifyLaunchResponse;
    } catch {
      return null;
    }
  }

  const routeRaw = String(env.VITE_VERIFY_SESSION_PATH ?? '/session').trim();
  const route = routeRaw.startsWith('/') ? routeRaw : `/${routeRaw}`;
  const candidates = getApiBaseCandidates('auth');
  if (candidates.length === 0) return null;

  const encodedToken = encodeURIComponent(sessionToken);
  const strictRoutes = parseBooleanEnv(env.VITE_AUTH_STRICT_ROUTES);
  const routeCandidates = strictRoutes === true
    ? Array.from(new Set([route, withPrefix(route)]))
    : buildRouteCandidates(route, ['/auth', '/login', '/account']);
  const paths = routeCandidates.map((p) => `${p}/${encodedToken}`.replace(/\/{2,}/g, '/'));

  for (const base of candidates) {
    for (const path of paths) {
      const baseOrPath = isAbsoluteUrl(path) ? path : `${base}${path}`;
      const url = baseOrPath;
      try {
        const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
        if (!res.ok) continue;
        const data = (await res.json()) as VerifyLaunchResponse;
        return data;
      } catch {
        // try next endpoint candidate
      }
    }
  }

  return null;
}

const App: React.FC = () => {
  const [userRole, setUserRole] = useState<UserRole>('SALES');
  const [isVerifyingLaunch, setIsVerifyingLaunch] = useState<boolean>(false);
  const [hasValidSession, setHasValidSession] = useState<boolean>(false);
  const [authCheckTick, setAuthCheckTick] = useState<number>(0);

  useEffect(() => {
    const onSessionMessage = (event: MessageEvent) => {
      const data = (event.data ?? {}) as SessionBridgeMessage;
      const msgType = String(data.type || '').trim().toUpperCase();
      if (msgType !== 'AA2000_SESSION' && msgType !== 'SESSION_TRANSFER') return;

      const token = String(
        data.sessionToken ||
          data.session?.s_name ||
          ''
      ).trim();
      const sid = data.sessionId ?? data.session?.s_ID;
      const roleInput = data.roleName ?? data.account?.role_name ?? '';

      if (!token) return;
      try {
        sessionStorage.setItem('sessionToken', token);
        if (sid != null) sessionStorage.setItem('sessionId', String(sid));
        if (roleInput) localStorage.setItem('userRole', normalizeUserRole(roleInput));
      } catch {
        // ignore storage restrictions
      }
      setAuthCheckTick((n) => n + 1);
    };

    window.addEventListener('message', onSessionMessage);
    return () => window.removeEventListener('message', onSessionMessage);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsVerifyingLaunch(true);
      try {
        const launchToken = getTokenFromCurrentUrl();

        // Step 1: If launch token exists in URL, store it first in sessionStorage.
        if (launchToken) {
          try {
            sessionStorage.setItem('sessionToken', launchToken);
          } catch {
            // ignore storage restrictions
          }
          const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
          window.history.replaceState({}, document.title, cleanUrl);
        }

        // Step 2: Always read token from sessionStorage, then verify using that token.
        let storedSessionToken = '';
        try {
          storedSessionToken = sessionStorage.getItem('sessionToken') || '';
        } catch {
          // ignore storage restrictions
        }

        if (storedSessionToken) {
          const sessionData = await verifySessionToken(storedSessionToken);
          if (!cancelled && sessionData?.account && sessionData?.session?.s_ID != null) {
            const resolvedRole = resolveRoleFromSessionPayload(sessionData);
            setUserRole(resolvedRole);
            setHasValidSession(true);
            try {
              localStorage.setItem('userRole', resolvedRole);
              sessionStorage.setItem('sessionId', String(sessionData.session.s_ID));
            } catch {
              // ignore
            }
            return;
          }

          // Fallback: some backends only expose verify-launch route.
          const launchData = await verifyLaunchToken(storedSessionToken);
          if (!cancelled && launchData?.account && launchData?.session?.s_ID != null) {
            const resolvedRole = resolveRoleFromSessionPayload(launchData);
            setUserRole(resolvedRole);
            setHasValidSession(true);
            try {
              localStorage.setItem('userRole', resolvedRole);
              if (launchData.session?.s_name) {
                sessionStorage.setItem('sessionToken', String(launchData.session.s_name));
              }
              sessionStorage.setItem('sessionId', String(launchData.session.s_ID));
            } catch {
              // ignore
            }
            return;
          }
        }

        // No valid session -> block access
        if (!cancelled) {
          setHasValidSession(false);
          if (shouldClearInvalidSession()) {
            try {
              sessionStorage.removeItem('sessionToken');
              sessionStorage.removeItem('sessionId');
              localStorage.removeItem('userRole');
            } catch {
              // ignore
            }
          }
        }
      } finally {
        if (!cancelled) setIsVerifyingLaunch(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [authCheckTick]);

  const handleLogout = () => {
    setUserRole('SALES');
    setHasValidSession(false);
    try {
      localStorage.removeItem('userRole');
      sessionStorage.removeItem('sessionToken');
      sessionStorage.removeItem('sessionId');
    } catch (e) {
      console.warn("Could not clear auth state", e);
    }
  };

  if (isVerifyingLaunch) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-sm font-semibold tracking-wide">Verifying launch session...</p>
      </div>
    );
  }

  if (!hasValidSession) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-lg font-bold">Session required</h1>
          <p className="text-sm text-slate-300">
            No valid session found. Open this app using a valid launch link with <code>?__launch=...</code>.
          </p>
        </div>
      </div>
    );
  }

  return <Dashboard onLogout={handleLogout} userRole={userRole} />;
};

export default App;
