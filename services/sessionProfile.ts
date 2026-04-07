import type { SessionEmployeeProfile, SessionUserProfile } from '../types';

/** Shape returned by GET /session/:token (and compatible verify-launch responses). */
export type SessionVerifyPayload = {
  message?: string | null;
  session?: {
    s_ID?: number | string | null;
    s_name?: string | null;
    createdAt?: string | null;
  };
  account?: {
    acc_ID?: number | string | null;
    username?: string | null;
    acc_username?: string | null;
    role_name?: string | null;
    role_ID?: number | string | null;
    status?: string | null;
    acc_status?: string | null;
  };
  employee?: SessionEmployeeProfile | Record<string, unknown> | null;
};

export function isCompleteSessionPayload(data: SessionVerifyPayload | null | undefined): boolean {
  return !!(data?.session?.s_ID != null && data?.account != null && data.account.acc_ID != null);
}

function pickEmployee(raw: SessionVerifyPayload['employee']): SessionEmployeeProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  return {
    Emp_ID: (e.Emp_ID ?? e.emp_ID) as SessionEmployeeProfile['Emp_ID'],
    Emp_IDno: (e.Emp_IDno ?? e.emp_IDno) as string | null | undefined,
    Emp_fname: (e.Emp_fname ?? e.emp_fname) as string | null | undefined,
    Emp_mname: (e.Emp_mname ?? e.emp_mname) as string | null | undefined,
    Emp_lname: (e.Emp_lname ?? e.emp_lname) as string | null | undefined,
    Emp_cnum: (e.Emp_cnum ?? e.emp_cnum) as string | null | undefined,
    Emp_email: (e.Emp_email ?? e.emp_email) as string | null | undefined,
    Emp_AddressID: (e.Emp_AddressID ?? e.emp_AddressID) as SessionEmployeeProfile['Emp_AddressID'],
    Emp_role: (e.Emp_role ?? e.emp_role) as SessionEmployeeProfile['Emp_role'],
    acc_ID: (e.acc_ID ?? e.acc_id) as SessionEmployeeProfile['acc_ID'],
    Emp_imageBase64: (e.Emp_imageBase64 ?? e.emp_imageBase64) as string | null | undefined,
  };
}

export function normalizeSessionVerifyResponse(data: SessionVerifyPayload): SessionUserProfile {
  const session = data.session ?? {};
  const account = data.account ?? {};
  const employee = pickEmployee(data.employee);

  const username = (account.username ?? account.acc_username ?? null) as string | null;
  const status = (account.status ?? account.acc_status ?? null) as string | null;

  const nameParts = [employee?.Emp_fname, employee?.Emp_mname, employee?.Emp_lname].filter(
    (x) => x != null && String(x).trim() !== ''
  ) as string[];
  const fromEmployee = nameParts.join(' ').trim();
  const displayName = fromEmployee || username || 'Signed-in user';

  const fn = employee?.Emp_fname != null ? String(employee.Emp_fname).charAt(0) : '';
  const ln = employee?.Emp_lname != null ? String(employee.Emp_lname).charAt(0) : '';
  let initials = `${fn}${ln}`.toUpperCase();
  if (!initials && username) initials = String(username).slice(0, 2).toUpperCase();
  if (!initials) initials = '•';

  return {
    sessionId: session.s_ID ?? null,
    sessionToken: session.s_name != null ? String(session.s_name) : null,
    sessionCreatedAt: session.createdAt != null ? String(session.createdAt) : null,
    acc_ID: account.acc_ID ?? null,
    username,
    role_ID: account.role_ID ?? null,
    role_name: account.role_name != null ? String(account.role_name) : null,
    status,
    employee,
    displayName,
    initials,
  };
}

export function profileImageDataUrl(raw: string | null | undefined): string | null {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim();
  if (s.startsWith('data:')) return s;
  return `data:image/jpeg;base64,${s}`;
}
