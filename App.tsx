
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

const SESSION_TOKEN_ENC_KEY = 'sessionTokenEnc';
const SESSION_ID_ENC_KEY = 'sessionIdEnc';
const SESSION_TOKEN_LEGACY_KEY = 'sessionToken';
const SESSION_ID_LEGACY_KEY = 'sessionId';
const SESSION_STORAGE_CRYPTO_KEY = 'sessionStorageCryptoKeyV1';

function normalizeUserRole(input?: string | null): UserRole {
  const role = String(input || '').trim().toUpperCase();
  if (role.includes('ADMIN')) return 'ADMIN';
  return 'SALES';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function base64UrlToBase64(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  if (pad === 0) return normalized;
  return normalized + '='.repeat(4 - pad);
}

function base64UrlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveAesKeyFromSecret(secret: string): Promise<CryptoKey> {
  const secretBytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(secretBytes));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt']);
}

async function decryptLaunchToken(token: string): Promise<string> {
  const launchSecret =
    String((import.meta as any).env?.VITE_LAUNCH_TOKEN_SECRET ?? '').trim() ||
    'aa2k-launch-secret-v1';
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('WebCrypto not available');
  const payload = base64UrlToBytes(token);
  if (payload.length <= 12) throw new Error('Invalid token payload');

  const iv = payload.slice(0, 12);
  const cipher = payload.slice(12);
  const key = await deriveAesKeyFromSecret(launchSecret);
  const plain = await c.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(cipher)
  );
  return new TextDecoder().decode(plain);
}

async function decryptAesTokenWithSecret(payload: string, secret: string): Promise<string | null> {
  const idx = payload.indexOf(':');
  if (idx <= 0) return null;
  const ivRaw = payload.slice(0, idx);
  const cipherRaw = payload.slice(idx + 1);
  if (!ivRaw || !cipherRaw) return null;

  try {
    const iv = base64ToBytes(base64UrlToBase64(ivRaw));
    const cipher = base64ToBytes(base64UrlToBase64(cipherRaw));
    const key = await deriveAesKeyFromSecret(secret);
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(cipher)
    );
    return new TextDecoder().decode(plainBuffer);
  } catch {
    return null;
  }
}

function tryDecodeBase64Text(input: string): string | null {
  try {
    const bytes = base64ToBytes(base64UrlToBase64(input));
    const decoded = new TextDecoder().decode(bytes);
    return decoded || null;
  } catch {
    return null;
  }
}

async function normalizeIncomingLaunchToken(rawToken: string): Promise<string> {
  const env = (import.meta as any).env ?? {};
  const secret = String(env.VITE_LAUNCH_TOKEN_SECRET ?? '').trim();
  const mode = String(env.VITE_LAUNCH_TOKEN_ENCRYPTION ?? '').trim().toLowerCase();
  const value = rawToken ?? '';
  if (!value) return '';

  // Primary receiver-compatible mode:
  // token is base64url(payload), first 12 bytes = IV, rest = AES-GCM cipher, key = SHA-256(secret)
  if (mode === 'receiver' || mode === 'aes-gcm-payload' || mode === 'aes-gcm' || mode === '') {
    try {
      const decrypted = await decryptLaunchToken(value);
      if (decrypted) return decrypted;
    } catch {
      // continue to compatibility fallbacks below
    }
  }

  // 1) "enc::<iv>:<cipher>" or "<iv>:<cipher>" AES-GCM using shared secret
  const payload = value.startsWith('enc::') ? value.slice(5) : value;
  if ((mode === 'aes' || mode === 'aes-gcm' || value.startsWith('enc::') || payload.includes(':')) && secret) {
    const decrypted = await decryptAesTokenWithSecret(payload, secret);
    if (decrypted) return decrypted;
  }

  // 2) URL-decoded token (common when upstream applies encodeURIComponent)
  try {
    const urlDecoded = decodeURIComponent(value);
    if (urlDecoded && urlDecoded !== value) return urlDecoded;
  } catch {
    // ignore invalid URI sequences
  }

  // 3) Base64/Base64URL plain text token encoding
  if (mode === 'base64' || mode === 'base64url' || /^[A-Za-z0-9\-_+/=]+$/.test(value)) {
    const b64 = tryDecodeBase64Text(value);
    if (b64) return b64;
  }

  // 4) Fallback to raw value
  return value;
}

async function getOrCreateStorageCryptoKey(): Promise<CryptoKey> {
  const existing = localStorage.getItem(SESSION_STORAGE_CRYPTO_KEY);
  if (existing) {
    return crypto.subtle.importKey('raw', toArrayBuffer(base64ToBytes(existing)), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(SESSION_STORAGE_CRYPTO_KEY, bytesToBase64(rawKey));
  return crypto.subtle.importKey('raw', toArrayBuffer(rawKey), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptForSessionStorage(plainText: string): Promise<string> {
  const key = await getOrCreateStorageCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(encoded));
  return `${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(cipherBuffer))}`;
}

async function decryptFromSessionStorage(payload: string): Promise<string | null> {
  const idx = payload.indexOf(':');
  if (idx <= 0) return null;
  const ivPart = payload.slice(0, idx);
  const cipherPart = payload.slice(idx + 1);
  const iv = base64ToBytes(ivPart);
  const cipher = base64ToBytes(cipherPart);
  const key = await getOrCreateStorageCryptoKey();
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(cipher));
  return new TextDecoder().decode(plainBuffer);
}

async function setEncryptedSessionValue(storageKey: string, value: string): Promise<void> {
  const encrypted = await encryptForSessionStorage(value);
  sessionStorage.setItem(storageKey, encrypted);
}

async function getDecryptedSessionValue(storageKey: string): Promise<string> {
  const encrypted = sessionStorage.getItem(storageKey);
  if (!encrypted) return '';
  try {
    const plain = await decryptFromSessionStorage(encrypted);
    return plain ?? '';
  } catch {
    return '';
  }
}

async function setSessionTokenSecure(token: string): Promise<void> {
  await setEncryptedSessionValue(SESSION_TOKEN_ENC_KEY, token);
  // Remove legacy plain-text key.
  sessionStorage.removeItem(SESSION_TOKEN_LEGACY_KEY);
}

async function getSessionTokenSecure(): Promise<string> {
  const enc = await getDecryptedSessionValue(SESSION_TOKEN_ENC_KEY);
  if (enc) return enc;
  // Backward compatibility for previous plain-text sessions.
  return sessionStorage.getItem(SESSION_TOKEN_LEGACY_KEY) || '';
}

async function setSessionIdSecure(sessionId: string): Promise<void> {
  await setEncryptedSessionValue(SESSION_ID_ENC_KEY, sessionId);
  sessionStorage.removeItem(SESSION_ID_LEGACY_KEY);
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

function getSanitizedUrlWithoutLaunchToken(): string {
  const params = new URLSearchParams(window.location.search || '');
  params.delete('__launch');
  params.delete('launchToken');
  params.delete('sessionToken');
  params.delete('token');

  let pathname = window.location.pathname || '/';
  // Remove path-style launch token: "/__launch=TOKEN"
  pathname = pathname.replace(/\/__launch=[^/?#]+/, '');
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  if (!pathname) pathname = '/';

  const qs = params.toString();
  const hash = window.location.hash || '';
  return `${pathname}${qs ? `?${qs}` : ''}${hash}`;
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
      (async () => {
        try {
          const normalizedToken = await normalizeIncomingLaunchToken(token);
          if (!normalizedToken) return;
          await setSessionTokenSecure(normalizedToken);
          if (sid != null) await setSessionIdSecure(String(sid));
          if (roleInput) localStorage.setItem('userRole', normalizeUserRole(roleInput));
        } catch {
          // ignore storage restrictions
        }
        setAuthCheckTick((n) => n + 1);
      })();
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
            const normalizedToken = await normalizeIncomingLaunchToken(launchToken);
            if (normalizedToken) {
              await setSessionTokenSecure(normalizedToken);
            }
          } catch {
            // ignore storage restrictions
          }
          const cleanUrl = getSanitizedUrlWithoutLaunchToken();
          window.history.replaceState({}, document.title, cleanUrl);
        }

        // Step 2: Always read token from sessionStorage, then verify using that token.
        let storedSessionToken = '';
        try {
          storedSessionToken = await getSessionTokenSecure();
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
              await setSessionIdSecure(String(sessionData.session.s_ID));
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
                await setSessionTokenSecure(String(launchData.session.s_name));
              }
              await setSessionIdSecure(String(launchData.session.s_ID));
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
              sessionStorage.removeItem(SESSION_TOKEN_ENC_KEY);
              sessionStorage.removeItem(SESSION_ID_ENC_KEY);
              sessionStorage.removeItem(SESSION_TOKEN_LEGACY_KEY);
              sessionStorage.removeItem(SESSION_ID_LEGACY_KEY);
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
      sessionStorage.removeItem(SESSION_TOKEN_ENC_KEY);
      sessionStorage.removeItem(SESSION_ID_ENC_KEY);
      sessionStorage.removeItem(SESSION_TOKEN_LEGACY_KEY);
      sessionStorage.removeItem(SESSION_ID_LEGACY_KEY);
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
