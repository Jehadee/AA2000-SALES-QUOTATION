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
export type CustomerDirectoryItem = {
  id: number | string;
  fullName: string;
  fname: string;
  mname: string;
  lname: string;
  email: string; 
  phone: string;
  companyName: string;
  address: string;
  latitude?: number;
  longitude?: number;
  street?: string;
  municipality?: string;
  province?: string;
  postal?: string;
};

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

function getCustomersUrl(): string {
  const base = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) ?? '';
  const pathOverride = (import.meta as any).env?.VITE_GET_CUSTOMERS_PATH as string | undefined;
  const baseClean = base.replace(/\/+$/, '');
  if (pathOverride != null && pathOverride.trim() !== '') {
    const p = pathOverride.trim().replace(/^\/+/, '/');
    return `${baseClean}${p}`;
  }
  return `${baseClean}/customers/get/customers`;
}

function asString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const val = obj[k];
    if (typeof val === 'string' && val.trim()) return val.trim();
    if (typeof val === 'number') return String(val);
  }
  return '';
}

function asNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const val = obj[k];
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'string' && val.trim()) {
      const n = Number(val);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

export async function fetchCustomers(): Promise<CustomerDirectoryItem[]> {
  const url = getCustomersUrl();
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    throw new Error(typeof data === 'string' ? data : `Failed to fetch customers (${res.status})`);
  }
  if (!Array.isArray(data)) return [];

  return data.map((row: unknown) => {
    const item = (row ?? {}) as Record<string, unknown>;
    const addressObj =
      ((item.Address as Record<string, unknown> | undefined) ??
        (item.address as Record<string, unknown> | undefined) ??
        {}) as Record<string, unknown>;

    const fname = asString(item, ['cus_fname', 'fname', 'first_name', 'firstName']);
    const mname = asString(item, ['cus_mname', 'mname', 'middle_name', 'middleName']);
    const lname = asString(item, ['cus_lname', 'lname', 'last_name', 'lastName']);
    const fullName = [fname, mname, lname].filter(Boolean).join(' ').trim();
    const street = asString(addressObj, ['street', 'street_name', 'streetName', 'addr_street']);
    const municipality = asString(addressObj, ['municipality', 'city', 'town', 'addr_city']);
    const province = asString(addressObj, ['province', 'state', 'addr_province']);
    const postal = asString(addressObj, ['postal', 'postcode', 'postal_code', 'zip', 'addr_postal']);
    const compositeAddress = [street, municipality, province, postal].filter(Boolean).join(', ');

    return {
      id: asString(item, ['cus_ID', 'id']) || Math.random().toString(36).slice(2),
      fullName: fullName || asString(item, ['fullName', 'name']),
      fname,
      mname,
      lname,
      email: asString(item, ['cus_email', 'email']),
      phone: asString(item, ['cus_cnum', 'phone', 'mobile']),
      companyName: asString(item, ['company_name', 'companyName', 'company']),
      address: compositeAddress || asString(addressObj, ['address', 'fullAddress']) || asString(item, ['address']),
      latitude: asNumber(addressObj, ['latitude', 'lat']),
      longitude: asNumber(addressObj, ['longitude', 'lon', 'lng']),
      street: street || undefined,
      municipality: municipality || undefined,
      province: province || undefined,
      postal: postal || undefined,
    } as CustomerDirectoryItem;
  });
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

/** Best-effort id from POST /customers/add/customer (shape varies by deployment). */
export function extractCustomerIdFromAddResponse(data: unknown): string | undefined {
  if (data == null || typeof data !== 'object') return undefined;
  const o = data as Record<string, unknown>;
  const nested = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : undefined;
  const candidates = [
    o.cus_ID,
    o.customerID,
    o.Customer_ID,
    o.id,
    nested?.cus_ID,
    nested?.customerID,
    nested?.Customer_ID,
    nested?.id,
  ];
  for (const v of candidates) {
    if (v != null && v !== '') return String(v);
  }
  return undefined;
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

