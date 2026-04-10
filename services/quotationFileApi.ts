import { jsPDF } from 'jspdf';

export interface UploadQuotationResponse {
  message?: string;
  fileName?: string;
  originalName?: string;
  filePath?: string;
  file_path?: string;
}

export interface PipelineUploadTriggerPayload {
  quoteId: string;
  customerName?: string;
  total?: number;
  createdAt?: string;
  pdfBlob?: Blob;
  fileName?: string;
  /** Sales user account id — stored server-side with the quotation / file metadata. */
  accountId?: string;
  ownerLabel?: string;
}

export type SaveQuotationProjectPayload = {
  Proj_ID?: string | number;
  AccountId: string;
  customerID?: string | number;
  clientID?: string | number;
  status?: string;
  Start_date?: string;
  quotationFilePath?: string | null;
  manpowerIds?: (string | number)[];
  activity?: string | null;
  objective?: string | null;
};

/** Aligns with DB table `project_details` (see project_details.sql). */
export type SaveProjectDetailsPayload = {
  Proj_ID: string | number;
  /** `account.acc_ID` of the logged-in user who submitted the pipeline. */
  Account_ID: string | number;
  Status?: 'APPROVED' | 'REJECTED' | 'ONPROGRESS' | 'PENDING';
  Customer_ID?: string | number | null;
  /** `YYYY-MM-DD` */
  Start_date?: string | null;
  FilePath?: string | null;
  deposit_amount?: number;
  current_balance?: number | null;
  /** DB enum uses spelling `QOUTATION`. */
  application?: 'QOUTATION' | 'BOQ' | 'ESTIMATION' | 'TECHNCODE';
  activity?: string | null;
  objective?: string | null;
};

function pickFilePathFromUploadJson(data: unknown): string | undefined {
  if (data == null || typeof data !== 'object') return undefined;
  const o = data as Record<string, unknown>;
  const v =
    o.filePath ??
    o.file_path ??
    o.FilePath ??
    o.path ??
    o.url ??
    (typeof o.data === 'object' && o.data !== null
      ? (o.data as Record<string, unknown>).filePath ??
        (o.data as Record<string, unknown>).file_path ??
        (o.data as Record<string, unknown>).FilePath
      : undefined);
  if (typeof v === 'string' && v.trim()) return v.trim();
  return undefined;
}

function getUploadQuotationUrl(): string {
  const base = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) ?? '';
  const override = (import.meta as any).env?.VITE_UPLOAD_QUOTATION_PATH as string | undefined;
  const baseClean = base.replace(/\/+$/, '');
  if (override && override.trim()) {
    const p = override.trim().startsWith('/') ? override.trim() : `/${override.trim()}`;
    return `${baseClean}${p}`;
  }
  // Default route from backend router mount
  return `${baseClean}/service/estimation/upload/qoutationFile`;
}

export async function uploadQuotationFile(pdfBlob: Blob, fileName: string): Promise<UploadQuotationResponse> {
  const primaryUrl = getUploadQuotationUrl();
  const formData = new FormData();
  formData.append('file', pdfBlob, fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
  // Fallback for older mount path used in some environments.
  const fallbackLegacyUrl = primaryUrl.includes('/service/estimation/upload/qoutationFile')
    ? primaryUrl.replace('/service/estimation/upload/qoutationFile', '/upload/qoutationFile')
    : '';

  let res: Response;
  try {
    res = await fetch(primaryUrl, {
      method: 'POST',
      body: formData,
    });
  } catch (networkErr) {
    if (!fallbackLegacyUrl) throw networkErr;
    res = await fetch(fallbackLegacyUrl, { method: 'POST', body: formData });
  }

  if (!res.ok && fallbackLegacyUrl) {
    const retry = await fetch(fallbackLegacyUrl, { method: 'POST', body: formData });
    if (retry.ok) res = retry;
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    if (typeof data === 'string') throw new Error(data || `Upload failed (${res.status})`);
    throw new Error((data as any)?.message || `Upload failed (${res.status})`);
  }

  return (typeof data === 'object' ? data : { message: String(data) }) as UploadQuotationResponse;
}

function getSubmitPipelineTriggerUrl(): string {
  const base = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) ?? '';
  const override = (import.meta as any).env?.VITE_SUBMIT_PIPELINE_UPLOAD_PATH as string | undefined;
  const baseClean = base.replace(/\/+$/, '');
  if (override && override.trim()) {
    const p = override.trim().startsWith('/') ? override.trim() : `/${override.trim()}`;
    return `${baseClean}${p}`;
  }
  return `${baseClean}/service/quotation/post/upload/qoutationFile`;
}

function getSaveQuotationProjectUrl(): string {
  const base = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) ?? '';
  const override = (import.meta as any).env?.VITE_SAVE_QUOTATION_PATH as string | undefined;
  const baseClean = base.replace(/\/+$/, '');
  if (override && override.trim()) {
    const p = override.trim().startsWith('/') ? override.trim() : `/${override.trim()}`;
    return `${baseClean}${p}`;
  }
  // Backend router mounts this under /project (see devtunnel 404 when using /save/quotation alone).
  return `${baseClean}/project/save/quotation`;
}

function getSaveProjectDetailsUrl(): string {
  const base = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) ?? '';
  const override = (import.meta as any).env?.VITE_SAVE_PROJECT_DETAILS_PATH as string | undefined;
  const baseClean = base.replace(/\/+$/, '');
  if (override && override.trim()) {
    const p = override.trim().startsWith('/') ? override.trim() : `/${override.trim()}`;
    return `${baseClean}${p}`;
  }
  return `${baseClean}/save/project_details`;
}

/** ISO datetime or date string → `YYYY-MM-DD` for MySQL date columns. */
export function toSqlDateOnly(isoOrDate: string | undefined | null): string | null {
  if (!isoOrDate || !String(isoOrDate).trim()) return null;
  const s = String(isoOrDate).trim();
  const d = s.includes('T') ? s.split('T')[0] : s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

export function pickProjectIdFromSaveQuotationResponse(data: unknown): string | number | undefined {
  if (data == null || typeof data !== 'object') return undefined;
  const o = data as Record<string, unknown>;
  const inner = o.data;
  if (inner && typeof inner === 'object') {
    const r = inner as Record<string, unknown>;
    if (r.Proj_ID != null) return r.Proj_ID as string | number;
    if (r.proj_ID != null) return r.proj_ID as string | number;
  }
  if (o.Proj_ID != null) return o.Proj_ID as string | number;
  return undefined;
}

export async function saveQuotationProject(body: SaveQuotationProjectPayload): Promise<unknown> {
  const url = getSaveQuotationProjectUrl();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof data === 'string' ? data : (data as any)?.message || `Save quotation failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

/**
 * Inserts/updates `project_details` for a project (e.g. after pipeline submit).
 * Backend should accept the same keys as the Sequelize / SQL columns.
 */
export async function saveProjectDetails(body: SaveProjectDetailsPayload): Promise<unknown> {
  const url = getSaveProjectDetailsUrl();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const msg =
      typeof data === 'string' ? data : (data as any)?.message || `Save project_details failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function triggerPipelineUploadHook(payload: PipelineUploadTriggerPayload): Promise<UploadQuotationResponse | null> {
  const url = getSubmitPipelineTriggerUrl();
  let pdfBlob: Blob;
  if (payload.pdfBlob) {
    pdfBlob = payload.pdfBlob;
  } else {
    // Fallback only when a full designed PDF blob is unavailable.
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const lines = [
      'AA2000 Sales Quotation',
      '',
      `Reference: ${payload.quoteId}`,
      `Customer: ${payload.customerName || '-'}`,
      `Account: ${payload.accountId || '-'}`,
      `Total: ₱${Number(payload.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      `Created At: ${payload.createdAt || new Date().toISOString()}`,
      '',
      'Generated automatically during Submit to Pipeline.',
    ];
    let y = 20;
    lines.forEach((line: string) => {
      pdf.text(line, 15, y);
      y += 7;
    });
    pdfBlob = pdf.output('blob');
  }

  const formData = new FormData();
  const uploadFileName = payload.fileName?.trim()
    ? (payload.fileName.toLowerCase().endsWith('.pdf') ? payload.fileName : `${payload.fileName}.pdf`)
    : `${payload.quoteId || 'quotation'}.pdf`;
  formData.append('file', pdfBlob, uploadFileName);
  formData.append('quoteId', payload.quoteId || '');
  formData.append('customerName', payload.customerName || '');
  formData.append('total', String(payload.total ?? ''));
  formData.append('createdAt', payload.createdAt || '');
  if (payload.accountId) {
    formData.append('accountId', payload.accountId);
    formData.append('AccountId', payload.accountId);
  }
  if (payload.ownerLabel) formData.append('ownerLabel', payload.ownerLabel);

  const res = await fetch(url, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Pipeline upload trigger failed (${res.status})`);
  }
  const outCt = res.headers.get('content-type') || '';
  if (outCt.includes('application/json')) {
    try {
      const json = await res.json();
      const fp = pickFilePathFromUploadJson(json);
      const base = (typeof json === 'object' && json !== null ? json : {}) as UploadQuotationResponse;
      return { ...base, ...(fp ? { filePath: fp } : {}) };
    } catch {
      return null;
    }
  }
  return null;
}

