import { jsPDF } from 'jspdf';

export interface UploadQuotationResponse {
  message?: string;
  fileName?: string;
  originalName?: string;
  filePath?: string;
}

export interface PipelineUploadTriggerPayload {
  quoteId: string;
  customerName?: string;
  total?: number;
  createdAt?: string;
  pdfBlob?: Blob;
  fileName?: string;
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

export async function triggerPipelineUploadHook(payload: PipelineUploadTriggerPayload): Promise<void> {
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

  const res = await fetch(url, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Pipeline upload trigger failed (${res.status})`);
  }
}

