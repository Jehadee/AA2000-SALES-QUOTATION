
import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import { UserRole, type SessionUserProfile } from './types';
import {
  isCompleteSessionPayload,
  normalizeSessionVerifyResponse,
  type SessionVerifyPayload,
} from './services/sessionProfile';

type SessionBridgeMessage = {
  type?: string;
  sessionToken?: string;
  sessionId?: string | number;
  roleName?: string;
  account?: {
    acc_ID?: string | number | null;
    role_name?: string | null;
  };
  session?: {
    s_name?: string | null;
    s_ID?: string | number | null;
  };
};

const SESSION_TOKEN_ENC_KEY = 'sessionTokenEnc';
const SESSION_ID_ENC_KEY = 'sessionIdEnc';
const ACCOUNT_ID_ENC_KEY = 'accountIdEnc';
const SESSION_TOKEN_LEGACY_KEY = 'sessionToken';
const SESSION_ID_LEGACY_KEY = 'sessionId';
const ACCOUNT_ID_LEGACY_KEY = 'accountId';
const SESSION_STORAGE_CRYPTO_KEY = 'sessionStorageCryptoKeyV1';

function isAuthDebugEnabled(): boolean {
  const raw = String((import.meta as any).env?.VITE_AUTH_DEBUG ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function authDebugLog(label: string, details?: Record<string, unknown>): void {
  if (!isAuthDebugEnabled()) return;
  if (details) {
    console.info(`[AUTH_DEBUG] ${label}`, details);
    return;
  }
  console.info(`[AUTH_DEBUG] ${label}`);
}

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

const PORTAL_DEV_KEY_SEED = 'aa2000-portal-launch-dev-v1';

/** Matches portal `appendSessionToUrl`: 64 hex chars or standard Base64 (decode must be 32 bytes). */
function parsePortalLaunchAesKeyMaterial(envValue: string): Uint8Array | null {
  const s = envValue.trim();
  if (!s) return null;
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) {
      out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  try {
    const bytes = base64ToBytes(base64UrlToBase64(s));
    if (bytes.length !== 32) return null;
    return bytes;
  } catch {
    return null;
  }
}

async function getPortalLaunchRawKeyBytes(): Promise<Uint8Array | null> {
  const env = (import.meta as any).env ?? {};
  const rawEnv = String(env.VITE_LAUNCH_AES_KEY ?? '').trim();
  if (rawEnv) {
    const parsed = parsePortalLaunchAesKeyMaterial(rawEnv);
    authDebugLog('launch key source=env', { parsed: !!parsed, byteLength: parsed?.length ?? 0 });
    return parsed;
  }
  // Dev parity with portal (`npm run dev` without env key): SHA-256(UTF-8 dev string).
  const isViteDev = (import.meta as any).env?.DEV === true;
  if (isViteDev) {
    authDebugLog('launch key source=dev-fallback-sha256');
    const seed = new TextEncoder().encode(PORTAL_DEV_KEY_SEED);
    const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(seed));
    return new Uint8Array(digest);
  }
  authDebugLog('launch key missing (no env key, not dev)');
  return null;
}

async function importPortalLaunchCryptoKey(): Promise<CryptoKey | null> {
  const raw = await getPortalLaunchRawKeyBytes();
  if (!raw) return null;
  return crypto.subtle.importKey('raw', toArrayBuffer(raw), { name: 'AES-GCM' }, false, ['decrypt']);
}

/**
 * Portal encoding: base64url → bytes; IV 12 | (ciphertext + 16-byte tag); AES-256-GCM.
 * Same layout for `__launch` (session s_name) and `__actor` (acc_ID as string).
 */
async function decryptPortalLaunchParam(b64urlToken: string): Promise<string | null> {
  const trimmed = String(b64urlToken ?? '').trim();
  if (!trimmed) return null;
  const c = globalThis.crypto;
  if (!c?.subtle) return null;

  let payload: Uint8Array;
  try {
    payload = base64UrlToBytes(trimmed);
  } catch {
    authDebugLog('portal decrypt skipped: invalid base64url');
    return null;
  }
  if (payload.length < 12 + 16) {
    authDebugLog('portal decrypt skipped: token too short', { length: payload.length });
    return null;
  }

  const key = await importPortalLaunchCryptoKey();
  if (!key) {
    authDebugLog('portal decrypt skipped: no AES key');
    return null;
  }

  const iv = payload.slice(0, 12);
  const cipherWithTag = payload.slice(12);
  try {
    const plain = await c.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv), tagLength: 128 },
      key,
      toArrayBuffer(cipherWithTag)
    );
    authDebugLog('portal decrypt success', { tokenLength: trimmed.length });
    return new TextDecoder().decode(plain);
  } catch {
    authDebugLog('portal decrypt failed');
    return null;
  }
}

async function deriveAesKeyFromSecret(secret: string): Promise<CryptoKey> {
  const secretBytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(secretBytes));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt']);
}

/** Legacy receiver: SHA-256(VITE_LAUNCH_TOKEN_SECRET || aa2k-launch-secret-v1), same IV||cipher layout. */
async function decryptLaunchTokenLegacy(token: string): Promise<string> {
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
    { name: 'AES-GCM', iv: toArrayBuffer(iv), tagLength: 128 },
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

  // 0) Portal appendSessionToUrl: VITE_LAUNCH_AES_KEY (hex/base64) or dev SHA-256(aa2000-portal-launch-dev-v1)
  const portalPlain = await decryptPortalLaunchParam(value);
  if (portalPlain) {
    authDebugLog('normalize token branch=portal-decrypt');
    return portalPlain;
  }

  // Legacy receiver: token is base64url, IV||cipher+tag, key = SHA-256(VITE_LAUNCH_TOKEN_SECRET || aa2k-...)
  if (mode === 'receiver' || mode === 'aes-gcm-payload' || mode === 'aes-gcm' || mode === '') {
    try {
      const decrypted = await decryptLaunchTokenLegacy(value);
      if (decrypted) {
        authDebugLog('normalize token branch=legacy-decrypt');
        return decrypted;
      }
    } catch {
      // continue to compatibility fallbacks below
      authDebugLog('legacy decrypt failed');
    }
  }

  // 1) "enc::<iv>:<cipher>" or "<iv>:<cipher>" AES-GCM using shared secret
  const payload = value.startsWith('enc::') ? value.slice(5) : value;
  if ((mode === 'aes' || mode === 'aes-gcm' || value.startsWith('enc::') || payload.includes(':')) && secret) {
    const decrypted = await decryptAesTokenWithSecret(payload, secret);
    if (decrypted) {
      authDebugLog('normalize token branch=legacy-enc-pair');
      return decrypted;
    }
  }

  // 2) URL-decoded token (common when upstream applies encodeURIComponent)
  try {
    const urlDecoded = decodeURIComponent(value);
    if (urlDecoded && urlDecoded !== value) return urlDecoded;
  } catch {
    // ignore invalid URI sequences
  }

  // 3) Base64/Base64URL plain text token encoding (opt-in only).
  // Do not auto-decode arbitrary tokens, otherwise valid session strings can become garbled.
  if (mode === 'base64' || mode === 'base64url') {
    const b64 = tryDecodeBase64Text(value);
    if (b64) {
      authDebugLog('normalize token branch=explicit-base64');
      return b64;
    }
  }

  // 4) Fallback to raw value
  authDebugLog('normalize token branch=raw');
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

async function setAccountIdSecure(accountId: string): Promise<void> {
  await setEncryptedSessionValue(ACCOUNT_ID_ENC_KEY, accountId);
  sessionStorage.removeItem(ACCOUNT_ID_LEGACY_KEY);
}

function resolveRoleFromSessionPayload(data: SessionVerifyPayload): UserRole {
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

function canBypassAuthOnLocalhost(): boolean {
  const env = (import.meta as any).env ?? {};
  const parsed = parseBooleanEnv(env.VITE_AUTH_BYPASS_LOCAL);
  if (parsed !== true) return false;
  const host = String(window.location.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function looksLikeEncryptedLaunchToken(value: string): boolean {
  const s = String(value || '').trim();
  if (!s) return false;
  // Portal format: base64url, IV(12) + ciphertext + tag(16) => at least 28 bytes payload
  if (!/^[A-Za-z0-9\-_]+$/.test(s)) return false;
  return s.length >= 38;
}

function normalizeLaunchTokenForVerify(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let candidate = raw;
  if (raw.includes('%')) {
    try {
      candidate = decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return looksLikeEncryptedLaunchToken(candidate) ? candidate : null;
}

function buildLocalBypassProfile(role: UserRole): SessionUserProfile {
  const label = role === 'ADMIN' ? 'System Admin' : 'Sales Employee';
  return {
    sessionId: null,
    sessionToken: null,
    sessionCreatedAt: null,
    acc_ID: null,
    username: null,
    role_ID: null,
    role_name: role,
    status: 'LOCAL_BYPASS',
    employee: null,
    displayName: `${label} (Local)`,
    initials: role === 'ADMIN' ? 'SA' : 'SE',
  };
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
  // Encrypted: __launch / _launch; plain (no AES key on portal): s_name
  const keys = ['__launch', '_launch', 'launchToken', 'sessionToken', 'token', 's_name'];
  for (const key of keys) {
    const raw = getRawQueryParam(search, key);
    if (raw !== null) return raw; // do not trim/alter
  }

  // Path-style launch links, e.g. "/__launch=TOKEN" or "/_launch=TOKEN"
  const path = window.location.pathname || '';
  const pathMatch = path.match(/\/(?:__launch|_launch)=([^/?#]+)/);
  if (pathMatch && pathMatch[1] != null) return pathMatch[1];

  return '';
}

function getAccountIdFromCurrentUrl(): string {
  const search = window.location.search || '';
  const keys = ['__actor', 'acc_ID', 'accId', 'accountId', 'acc_id'];
  for (const key of keys) {
    const raw = getRawQueryParam(search, key);
    if (raw !== null) return raw; // keep exact raw value
  }

  const path = window.location.pathname || '';
  const pathMatch = path.match(/\/(?:__actor|acc_ID|accId|accountId|acc_id)=([^/?#]+)/);
  if (pathMatch && pathMatch[1] != null) return pathMatch[1];

  return '';
}

function getSanitizedUrlWithoutLaunchToken(): string {
  const params = new URLSearchParams(window.location.search || '');
  params.delete('__launch');
  params.delete('_launch');
  params.delete('__actor');
  params.delete('s_name');
  params.delete('acc_ID');
  params.delete('accId');
  params.delete('accountId');
  params.delete('acc_id');
  params.delete('launchToken');
  params.delete('sessionToken');
  params.delete('token');

  let pathname = window.location.pathname || '/';
  // Remove path-style launch/account token segments.
  pathname = pathname.replace(/\/__launch=[^/?#]+/, '');
  pathname = pathname.replace(/\/_launch=[^/?#]+/, '');
  pathname = pathname.replace(/\/__actor=[^/?#]+/, '');
  pathname = pathname.replace(/\/s_name=[^/?#]+/, '');
  pathname = pathname.replace(/\/(?:acc_ID|accId|accountId|acc_id)=[^/?#]+/, '');
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  if (!pathname) pathname = '/';

  const qs = params.toString();
  const hash = window.location.hash || '';
  return `${pathname}${qs ? `?${qs}` : ''}${hash}`;
}

function verifyLaunchUrlCandidates(launchUrlOverride: string, launchToken: string): string[] {
  const encoded = encodeURIComponent(launchToken);
  let primary: string;
  if (launchUrlOverride.includes('{token}')) {
    primary = launchUrlOverride.replaceAll('{token}', encoded);
  } else {
    primary = `${launchUrlOverride}${launchUrlOverride.includes('?') ? '&' : '?'}${new URLSearchParams({ __launch: launchToken }).toString()}`;
  }
  const variants = [primary];
  if (primary.includes('__launch=')) {
    variants.push(primary.replace(/__launch=/g, '_launch='));
  }
  return Array.from(new Set(variants));
}

async function verifyLaunchToken(launchToken: string): Promise<SessionVerifyPayload | null> {
  const env = (import.meta as any).env ?? {};
  const launchUrlOverride = String(env.VITE_VERIFY_LAUNCH_URL ?? '').trim();
  if (launchUrlOverride) {
    for (const url of verifyLaunchUrlCandidates(launchUrlOverride, launchToken)) {
      try {
        const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
        if (!res.ok) {
          authDebugLog('verify-launch miss', { status: res.status, via: 'override' });
          continue;
        }
        authDebugLog('verify-launch success', { status: res.status, via: 'override' });
        return (await res.json()) as SessionVerifyPayload;
      } catch {
        // try next variant
        authDebugLog('verify-launch request error', { via: 'override' });
      }
    }
    return null;
  }

  const routeRaw = String(env.VITE_VERIFY_LAUNCH_PATH ?? '/verify-launch').trim();
  const route = routeRaw.startsWith('/') ? routeRaw : `/${routeRaw}`;
  const candidates = getApiBaseCandidates('auth');
  if (candidates.length === 0) return null;

  const launchQueryKeys = ['__launch', '_launch'] as const;
  const strictRoutes = parseBooleanEnv(env.VITE_AUTH_STRICT_ROUTES);
  const paths = strictRoutes === true
    ? Array.from(new Set([route, withPrefix(route)]))
    : buildRouteCandidates(route, ['/auth', '/login', '/account']);

  for (const launchKey of launchQueryKeys) {
    const qs = new URLSearchParams({ [launchKey]: launchToken }).toString();
    for (const base of candidates) {
      for (const path of paths) {
        const url = `${base}${path}?${qs}`;
        try {
          const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
          if (!res.ok) {
            authDebugLog('verify-launch miss', { status: res.status, via: 'route-candidate' });
            continue;
          }
          authDebugLog('verify-launch success', { status: res.status, via: 'route-candidate' });
          const data = (await res.json()) as SessionVerifyPayload;
          return data;
        } catch {
          // try the next candidate endpoint
          authDebugLog('verify-launch request error', { via: 'route-candidate' });
        }
      }
    }
  }

  return null;
}

async function verifySessionToken(sessionToken: string): Promise<SessionVerifyPayload | null> {
  const env = (import.meta as any).env ?? {};
  const sessionUrlOverride = String(env.VITE_VERIFY_SESSION_URL ?? '').trim();
  if (sessionUrlOverride) {
    const url = sessionUrlOverride.includes('{token}')
      ? sessionUrlOverride.replace('{token}', encodeURIComponent(sessionToken))
      : `${sessionUrlOverride.replace(/\/+$/, '')}/${encodeURIComponent(sessionToken)}`;
    try {
      const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      if (!res.ok) {
        authDebugLog('verify-session miss', { status: res.status, via: 'override' });
        return null;
      }
      authDebugLog('verify-session success', { status: res.status, via: 'override' });
      return (await res.json()) as SessionVerifyPayload;
    } catch {
      authDebugLog('verify-session request error', { via: 'override' });
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
        if (!res.ok) {
          authDebugLog('verify-session miss', { status: res.status, via: 'route-candidate' });
          continue;
        }
        authDebugLog('verify-session success', { status: res.status, via: 'route-candidate' });
        const data = (await res.json()) as SessionVerifyPayload;
        return data;
      } catch {
        // try next endpoint candidate
        authDebugLog('verify-session request error', { via: 'route-candidate' });
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
  const [sessionProfile, setSessionProfile] = useState<SessionUserProfile | null>(null);
  const [isRefreshingProfile, setIsRefreshingProfile] = useState(false);

  const persistVerifiedSession = useCallback(async (data: SessionVerifyPayload) => {
    const resolvedRole = resolveRoleFromSessionPayload(data);
    setUserRole(resolvedRole);
    setHasValidSession(true);
    setSessionProfile(normalizeSessionVerifyResponse(data));
    try {
      localStorage.setItem('userRole', resolvedRole);
      if (data.session?.s_ID != null) {
        await setSessionIdSecure(String(data.session.s_ID));
      }
      if (data.account?.acc_ID != null) {
        await setAccountIdSecure(String(data.account.acc_ID));
      }
    } catch {
      // ignore storage restrictions
    }
  }, []);

  const refreshSessionProfile = useCallback(async () => {
    setIsRefreshingProfile(true);
    try {
      let storedSessionToken = '';
      try {
        storedSessionToken = await getSessionTokenSecure();
      } catch {
        // ignore
      }
      if (!storedSessionToken) return;

      let sessionData = await verifySessionToken(storedSessionToken);
      if (!isCompleteSessionPayload(sessionData)) {
        // verify-launch typically expects the raw encrypted launch token, not decrypted session id
        const verifyCandidate = normalizeLaunchTokenForVerify(storedSessionToken);
        if (verifyCandidate) {
          sessionData = await verifyLaunchToken(verifyCandidate);
        }
      }
      if (isCompleteSessionPayload(sessionData)) {
        await persistVerifiedSession(sessionData);
      }
    } finally {
      setIsRefreshingProfile(false);
    }
  }, [persistVerifiedSession]);

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
      const accId = data.account?.acc_ID;
      const roleInput = data.roleName ?? data.account?.role_name ?? '';

      if (!token) return;
      (async () => {
        try {
          const normalizedToken = await normalizeIncomingLaunchToken(token);
          if (!normalizedToken) return;
          await setSessionTokenSecure(normalizedToken);
          if (sid != null) await setSessionIdSecure(String(sid));
          if (accId != null) await setAccountIdSecure(String(accId));
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
        const accountIdFromUrl = getAccountIdFromCurrentUrl();

        // Step 1: If launch token exists in URL, store it first in sessionStorage.
        if (launchToken) {
          try {
            const normalizedToken = await normalizeIncomingLaunchToken(launchToken);
            if (normalizedToken) {
              await setSessionTokenSecure(normalizedToken);
            }
            if (accountIdFromUrl) {
              const normalizedActor = await normalizeIncomingLaunchToken(accountIdFromUrl);
              if (normalizedActor) {
                await setAccountIdSecure(normalizedActor);
              }
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
          if (!cancelled && isCompleteSessionPayload(sessionData)) {
            await persistVerifiedSession(sessionData);
            return;
          }

          // Fallback: some backends only expose verify-launch route.
          // Prefer raw launch token from URL; using decrypted session token here can cause 400.
          const verifyLaunchCandidateRaw = launchToken || storedSessionToken;
          const verifyLaunchCandidate = normalizeLaunchTokenForVerify(verifyLaunchCandidateRaw);
          if (verifyLaunchCandidate) {
            const launchData = await verifyLaunchToken(verifyLaunchCandidate);
            if (!cancelled && isCompleteSessionPayload(launchData)) {
              try {
                if (launchData.session?.s_name) {
                  await setSessionTokenSecure(String(launchData.session.s_name));
                }
              } catch {
                // ignore
              }
              if (!cancelled) await persistVerifiedSession(launchData);
              return;
            }
          } else {
            authDebugLog('verify-launch skipped: malformed token candidate', {
              hasLaunchToken: !!launchToken,
              hasStoredToken: !!storedSessionToken,
            });
          }
        }

        // Local dev escape hatch: allow localhost usage without session only when there is no incoming/stored token.
        // If URL/session already has a token, enforce real backend verification.
        const hasIncomingSessionHints =
          !!launchToken ||
          !!accountIdFromUrl ||
          !!getRawQueryParam(window.location.search || '', '__launch') ||
          !!getRawQueryParam(window.location.search || '', '_launch') ||
          !!getRawQueryParam(window.location.search || '', 's_name') ||
          !!getRawQueryParam(window.location.search || '', '__actor') ||
          !!getRawQueryParam(window.location.search || '', 'acc_ID') ||
          !!storedSessionToken;
        if (!cancelled && canBypassAuthOnLocalhost() && !hasIncomingSessionHints) {
          const fallbackRole = normalizeUserRole(localStorage.getItem('userRole') || 'SALES');
          setUserRole(fallbackRole);
          setHasValidSession(true);
          setSessionProfile(buildLocalBypassProfile(fallbackRole));
          authDebugLog('auth bypassed on localhost', { role: fallbackRole });
          return;
        }

        // No valid session -> block access
        if (!cancelled) {
          setHasValidSession(false);
          setSessionProfile(null);
          if (shouldClearInvalidSession()) {
            try {
              sessionStorage.removeItem(SESSION_TOKEN_ENC_KEY);
              sessionStorage.removeItem(SESSION_ID_ENC_KEY);
              sessionStorage.removeItem(ACCOUNT_ID_ENC_KEY);
              sessionStorage.removeItem(SESSION_TOKEN_LEGACY_KEY);
              sessionStorage.removeItem(SESSION_ID_LEGACY_KEY);
              sessionStorage.removeItem(ACCOUNT_ID_LEGACY_KEY);
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
  }, [authCheckTick, persistVerifiedSession]);

  const handleLogout = () => {
    const env = (import.meta as any).env ?? {};
    const target = String(env.VITE_ONEAPP_RETURN_URL ?? env.VITE_ONEAPP_URL ?? 'https://aa2000portal.vercel.app').trim();
    if (!target) return;
    window.location.href = target;
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
            No valid session found. Use a portal link with encrypted{' '}
            <code className="text-slate-200">__launch</code> / <code className="text-slate-200">__actor</code>, or plain{' '}
            <code className="text-slate-200">s_name</code> / <code className="text-slate-200">acc_ID</code>. Set{' '}
            <code className="text-slate-200">VITE_LAUNCH_AES_KEY</code> in production (same as the portal). Dev uses the
            shared SHA-256 dev key. Ensure <code className="text-slate-200">VITE_VERIFY_SESSION_URL</code> /{' '}
            <code className="text-slate-200">VITE_VERIFY_LAUNCH_URL</code> reach your API.
          </p>
        </div>
      </div>
    );
  }
  return (
    <Dashboard
      onLogout={handleLogout}
      userRole={userRole}
      sessionProfile={sessionProfile}
      onRefreshSessionProfile={refreshSessionProfile}
      isRefreshingProfile={isRefreshingProfile}
    />
  );
};

export default App;
