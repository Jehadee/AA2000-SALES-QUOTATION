import type { PDFTemplate } from '../types';
import { getNormalizedApiBaseUrl } from './apiBaseUrl';

/** Display width (px) used in PDF template editor / preview when logo comes from the API. */
export const QUOTATION_LOGO_DISPLAY_WIDTH = 190;

const DEFAULT_LOGO_PATH = '/service/quotation/get/quotation-logo';

export function getQuotationLogoUrl(): string | null {
  const base = getNormalizedApiBaseUrl();
  if (!base) return null;
  const raw = ((import.meta as any).env?.VITE_QUOTATION_LOGO_PATH as string | undefined) ?? '';
  const path = (raw.trim() || DEFAULT_LOGO_PATH).replace(/\/{2,}/g, '/');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function resolveApiAssetUrl(pathOrUrl: string): string {
  const v = (pathOrUrl || '').trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v) || v.startsWith('data:')) return v;
  const base = getNormalizedApiBaseUrl().replace(/\/+$/, '');
  const normalized = v.startsWith('/') ? v : `/${v}`;
  return `${base}${normalized}`;
}

/** GET-only mode: return the backend logo endpoint (cache-busted) for immediate refresh. */
export async function uploadQuotationLogoFile(_file: File): Promise<string> {
  const dataUrl = await fetchQuotationLogoAsDataUrl();
  if (!dataUrl) {
    throw new Error('Failed to fetch logo from server endpoint.');
  }
  return dataUrl;
}

/** Fetches the logo as a data URL so PDF capture works without cross-origin canvas issues. */
export async function fetchQuotationLogoAsDataUrl(): Promise<string | null> {
  const url = getQuotationLogoUrl();
  if (!url) return null;
  try {
    const res = await fetch(url, { method: 'GET', headers: { Accept: 'image/*,*/*' } });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(new Error('read failed'));
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * If the template has no logo yet, pull from `GET …/quotation-logo` and set `logoWidth` to {@link QUOTATION_LOGO_DISPLAY_WIDTH}.
 */
export async function mergeApiQuotationLogoIfEmpty(template: PDFTemplate): Promise<PDFTemplate> {
  const existing = (template.companyInfo?.logoUrl ?? '').trim();
  if (existing) return template;
  const dataUrl = await fetchQuotationLogoAsDataUrl();
  if (!dataUrl) return template;
  return {
    ...template,
    companyInfo: {
      ...template.companyInfo,
      logoUrl: dataUrl,
      logoWidth: QUOTATION_LOGO_DISPLAY_WIDTH,
    },
  };
}
