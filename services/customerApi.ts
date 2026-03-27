import type { CustomerInfo } from '../types';

/** Payload shape aligned with backend createCustomer: /customers/add/customer */
type AddCustomerPayload = {
  fname: string;
  mname: string;
  lname: string;
  email: string;
  c_num: string;
  latitude?: number;
  longitude?: number;
  street?: string;
  municipality?: string;
  province?: string;
  postal?: string;
  role_ID: number;
};

export type AddCustomerResponse = Record<string, unknown>;

function getAddCustomerUrl(): string {
  const base = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) ?? '';
  const pathOverride = (import.meta as any).env?.VITE_ADD_CUSTOMER_PATH as string | undefined;
  const baseClean = base.replace(/\/+$/, '');
  if (pathOverride != null && pathOverride.trim() !== '') {
    const p = pathOverride.trim().replace(/^\/+/, '/');
    return `${baseClean}${p}`;
  }
  // Default: call at server root (no /api prefix) to avoid 404 on /api/customers/add/customer
  return `${baseClean}/customers/add/customer`;
}

function getFnameMnameLname(customer: CustomerInfo): { fname: string; mname: string | null; lname: string } {
  if ((customer.fname ?? '').trim() && (customer.lname ?? '').trim()) {
    return {
      fname: (customer.fname ?? '').trim(),
      mname: customer.mname?.trim() || null,
      lname: (customer.lname ?? '').trim()
    };
  }
  const parts = (customer.fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { fname: '', mname: null, lname: '' };
  if (parts.length === 1) return { fname: parts[0], mname: null, lname: parts[0] };
  if (parts.length === 2) return { fname: parts[0], mname: null, lname: parts[1] };
  return { fname: parts[0], mname: parts.slice(1, -1).join(' '), lname: parts[parts.length - 1] };
}

export async function addCustomer(customer: CustomerInfo): Promise<AddCustomerResponse> {
  const url = getAddCustomerUrl();
  const { fname, mname, lname } = getFnameMnameLname(customer);
  const addressStr = customer.address?.trim() ?? '';

  const payload: AddCustomerPayload = {
    fname,
    mname: mname ?? '',
    lname,
    email: customer.email ?? '',
    c_num: customer.phone ?? '',
    role_ID: 0,
    latitude: customer.latitude ?? 0,
    longitude: customer.longitude ?? 0,
    ...(addressStr && { street: customer.street ?? addressStr }),
    ...(customer.municipality && { municipality: customer.municipality }),
    ...(customer.province && { province: customer.province }),
    ...(customer.postal && { postal: customer.postal }),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    let message: string;
    if (typeof data === 'string') {
      const preMatch = data.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
      message = preMatch ? preMatch[1].trim() : (data.length > 200 ? `Request failed (${res.status})` : data);
    } else if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (typeof obj.message === 'string') message = obj.message;
      if (Array.isArray(obj.errors) && obj.errors.length > 0) {
        message = [message, ...obj.errors].filter(Boolean).join('. ');
      }
      if (!message) message = `Request failed (${res.status})`;
    } else {
      message = `Request failed (${res.status})`;
    }
    throw new Error(message);
  }

  return data as AddCustomerResponse;
}

