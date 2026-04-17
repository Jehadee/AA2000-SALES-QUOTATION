import type { PDFTemplate } from '../types';
import { getNormalizedApiBaseUrl } from './apiBaseUrl';

export type PdfTemplateCategories =
  | 'notes and remarks'
  | 'Terms and condition'
  | 'Payment Terms'
  | 'Payment Details'
  | 'waranty'
  | 'availability';

export type PdfTemplateServerData = {
  'notes and remarks': string[];
  'Terms and condition': string[];
  'Payment Terms': string[];
  'Payment Details': string[];
  waranty: string[];
  availability: string[];
};

function getApiBasePath(): string {
  const p = ((import.meta as any).env?.VITE_API_BASE_PATH as string | undefined) ?? '';
  if (!p.trim()) return '';
  return p.startsWith('/') ? p : `/${p}`;
}

function buildAbsolute(path: string): string {
  const base = getNormalizedApiBaseUrl().replace(/\/+$/, '');
  if (!base) return '';
  const apiPath = getApiBasePath();
  const p = path.startsWith('/') ? path : `/${path}`;

  // Avoid common misconfig where SERVER_API_URL already includes `/api`
  // and VITE_API_BASE_PATH is also set to `/api` → would produce `/api/api/...` (404).
  try {
    const u = new URL(base);
    const basePath = (u.pathname || '/').replace(/\/+$/, '') || '/';
    const apiClean = (apiPath || '').replace(/\/+$/, '') || '';
    const shouldAppendApi = apiClean && basePath !== apiClean && !basePath.endsWith(apiClean);
    const joined = shouldAppendApi ? `${base}${apiClean}${p}` : `${base}${p}`;
    return joined.replace(/([^:]\/)\/+/g, '$1');
  } catch {
    // If URL parsing fails, fall back to old concatenation.
    const apiClean = (apiPath || '').replace(/\/+$/, '');
    const joined = `${base}${apiClean}${p}`;
    return joined.replace(/([^:]\/)\/+/g, '$1');
  }
}

function htmlToText(html: string): string {
  const s = String(html ?? '');
  // Best-effort strip tags; TermsRichEditor stores safe HTML.
  const noTags = s.replace(/<[^>]*>/g, ' ');
  const collapsed = noTags.replace(/\s+/g, ' ').trim();
  return collapsed;
}

export function pdfTemplateToServerData(template: PDFTemplate): PdfTemplateServerData {
  return {
    'notes and remarks': (template.notesAndRemarks ?? []).map((s) => String(s ?? '').trim()).filter(Boolean),
    'Terms and condition': (template.termsAndConditions ?? [])
      .map((t) => htmlToText((t as any)?.value ?? ''))
      .map((s) => s.trim())
      .filter(Boolean),
    'Payment Terms': [
      String(template.paymentTerms?.supplyOfDevices ?? '').trim(),
      String(template.paymentTerms?.supplyOfLabor ?? '').trim(),
    ].filter(Boolean),
    'Payment Details': [
      String(template.paymentDetails?.bankName ?? '').trim(),
      String(template.paymentDetails?.accountNumber ?? '').trim(),
      String(template.paymentDetails?.accountName ?? '').trim(),
    ].filter(Boolean),
    waranty: (template.warrantyPeriod ?? []).map((s) => String(s ?? '').trim()).filter(Boolean),
    availability: (template.availability ?? []).map((s) => String(s ?? '').trim()).filter(Boolean),
  };
}

export function applyServerTemplateToPdfTemplate(prev: PDFTemplate, data: PdfTemplateServerData): PDFTemplate {
  const next: PDFTemplate = JSON.parse(JSON.stringify(prev)) as PDFTemplate;

  next.notesAndRemarks = Array.isArray(data['notes and remarks']) ? data['notes and remarks'] : [];
  next.warrantyPeriod = Array.isArray(data.waranty) ? data.waranty : [];
  next.availability = Array.isArray(data.availability) ? data.availability : [];

  const terms = Array.isArray(data['Terms and condition']) ? data['Terms and condition'] : [];
  next.termsAndConditions = (terms.length ? terms : ['']).map((t, i) => ({
    key: String(i + 1),
    value: String(t ?? ''),
  }));

  const pt = Array.isArray(data['Payment Terms']) ? data['Payment Terms'] : [];
  next.paymentTerms = {
    ...next.paymentTerms,
    supplyOfDevices: String(pt[0] ?? next.paymentTerms?.supplyOfDevices ?? '').trim(),
    supplyOfLabor: String(pt[1] ?? next.paymentTerms?.supplyOfLabor ?? '').trim(),
  };

  const pd = Array.isArray(data['Payment Details']) ? data['Payment Details'] : [];
  next.paymentDetails = {
    ...next.paymentDetails,
    bankName: String(pd[0] ?? next.paymentDetails?.bankName ?? '').trim(),
    accountNumber: String(pd[1] ?? next.paymentDetails?.accountNumber ?? '').trim(),
    accountName: String(pd[2] ?? next.paymentDetails?.accountName ?? '').trim(),
  };

  return next;
}

export async function fetchPdfTemplate(accId: string): Promise<PdfTemplateServerData> {
  const url = buildAbsolute(`/service/quotation/get/PDF-Template/get/${encodeURIComponent(accId)}`);
  if (!url) throw new Error('Missing SERVER_API_URL.');

  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  const ct = res.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  const body = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = typeof body === 'string' ? body : String((body as any)?.message ?? (body as any)?.error ?? `Failed (${res.status})`);
    throw new Error(msg);
  }

  if (!body || typeof body !== 'object') throw new Error('Invalid template response.');
  const data = (body as any).data ?? (body as any);
  return data as PdfTemplateServerData;
}

export async function addPdfTemplate(accId: string, template: PDFTemplate): Promise<void> {
  const url = buildAbsolute(`/service/quotation/post/add/PDF-Template/${encodeURIComponent(accId)}`);
  if (!url) throw new Error('Missing SERVER_API_URL.');

  const payload = pdfTemplateToServerData(template);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });

  const ct = res.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof body === 'string' ? body : String((body as any)?.message ?? (body as any)?.error ?? `Failed (${res.status})`);
    throw new Error(msg);
  }
}

export async function updatePdfTemplateItem(params: {
  accId: string;
  category: PdfTemplateCategories;
  index: number;
  newValue: string;
}): Promise<void> {
  const url = buildAbsolute(`/service/quotation/post/PDF-Template/${encodeURIComponent(params.accId)}/update-item`);
  if (!url) throw new Error('Missing SERVER_API_URL.');

  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ category: params.category, index: params.index, newValue: params.newValue }),
  });

  const ct = res.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof body === 'string' ? body : String((body as any)?.message ?? (body as any)?.error ?? `Failed (${res.status})`);
    throw new Error(msg);
  }
}

