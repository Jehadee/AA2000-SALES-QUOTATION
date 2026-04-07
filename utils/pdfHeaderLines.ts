import type { PDFTemplate } from '../types';

export function getPdfHeaderLines(ci: PDFTemplate['companyInfo']): { brand: string; tagline: string } {
  const name = ci.name.trim();
  const words = name.split(/\s+/).filter(Boolean);
  const brand = ci.brandName?.trim() || words[0] || name;
  let tag = ci.tagline?.trim() || '';
  if (!tag && ci.brandName?.trim()) {
    const b = ci.brandName.trim();
    const rest = name.startsWith(b) ? name.slice(b.length).trim() : '';
    tag = rest.replace(/^[-–—]\s*/, '').trim();
  }
  if (!tag && words.length > 1) {
    tag = words.slice(1).join(' ');
  }
  return { brand, tagline: tag };
}
