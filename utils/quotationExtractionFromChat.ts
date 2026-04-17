import type { CustomerInfo, Product } from '../types';
import { ClientType } from '../types';

export type ItemsToAddEntry = { model: string; quantity: number };

export type QuotationExtractionPayload = {
  customerUpdate?: Partial<CustomerInfo>;
  itemsToAdd?: ItemsToAddEntry[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function asPositiveInt(v: unknown, fallback = 1): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function normalizePayload(raw: unknown): QuotationExtractionPayload | null {
  if (!isRecord(raw)) return null;
  const out: QuotationExtractionPayload = {};
  if ('customerUpdate' in raw && isRecord(raw.customerUpdate)) {
    out.customerUpdate = raw.customerUpdate as Partial<CustomerInfo>;
  }
  if ('itemsToAdd' in raw && Array.isArray(raw.itemsToAdd)) {
    const items: ItemsToAddEntry[] = [];
    for (const row of raw.itemsToAdd) {
      if (!isRecord(row)) continue;
      const model = typeof row.model === 'string' ? row.model.trim() : typeof row.name === 'string' ? row.name.trim() : '';
      if (!model) continue;
      items.push({ model, quantity: asPositiveInt(row.quantity, 1) });
    }
    if (items.length) out.itemsToAdd = items;
  }
  if (!out.customerUpdate && !out.itemsToAdd?.length) return null;
  return out;
}

/** Try to parse a JSON object that includes quotation keys from assistant text. */
export function parseQuotationExtractionFromAssistantReply(fullText: string): {
  displayText: string;
  extraction: QuotationExtractionPayload | null;
} {
  const trimmed = fullText.trim();
  if (!trimmed) return { displayText: '', extraction: null };

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      const parsed = JSON.parse(fence[1].trim());
      const norm = normalizePayload(parsed);
      if (norm) {
        const displayText = trimmed.replace(fence[0], '').trim();
        return { displayText: displayText || trimmed, extraction: norm };
      }
    } catch {
      /* continue */
    }
  }

  const tail = trimmed.slice(-12000);
  const bracePositions: number[] = [];
  for (let i = 0; i < tail.length; i++) {
    if (tail[i] === '{') bracePositions.push(i);
  }
  for (let k = bracePositions.length - 1; k >= 0; k--) {
    const start = bracePositions[k];
    const sub = tail.slice(start);
    for (let len = sub.length; len > 0; len--) {
      try {
        const slice = sub.slice(0, len);
        if (!/itemsToAdd|customerUpdate/.test(slice)) continue;
        const parsed = JSON.parse(slice);
        const norm = normalizePayload(parsed);
        if (norm) {
          const jsonStartInFull = trimmed.length - tail.length + start;
          const jsonEndInFull = jsonStartInFull + len;
          const displayText = `${trimmed.slice(0, jsonStartInFull).trimEnd()}\n${trimmed.slice(jsonEndInFull).trimStart()}`.trim();
          return { displayText: displayText || trimmed, extraction: norm };
        }
      } catch {
        /* try shorter */
      }
    }
  }

  return { displayText: trimmed, extraction: null };
}

export function matchProductFromCatalog(products: Product[], modelOrName: string): Product | undefined {
  const q = modelOrName.trim();
  if (!q) return undefined;
  const lower = q.toLowerCase().replace(/\s+/g, ' ');

  const exactModel = products.find((p) => p.model.toLowerCase() === lower);
  if (exactModel) return exactModel;

  const exactName = products.find((p) => p.name.toLowerCase() === lower);
  if (exactName) return exactName;

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const qn = norm(q);
  if (qn.length >= 3) {
    const byNorm = products.find((p) => norm(p.model) === qn || norm(p.name) === qn);
    if (byNorm) return byNorm;
  }

  const tokenHit = products.find(
    (p) =>
      lower.includes(p.model.toLowerCase()) ||
      p.model.toLowerCase().includes(lower) ||
      lower.includes(p.name.toLowerCase()) ||
      p.name.toLowerCase().includes(lower),
  );
  if (tokenHit) return tokenHit;

  return undefined;
}

export function mapClientTypeFromText(raw: string | undefined): ClientType | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const ct = raw.toUpperCase();
  if (ct.includes('SYSTEM') && ct.includes('CONTRACTOR')) return ClientType.SYSTEM_CONTRACTOR;
  if (ct.includes('DEALER')) return ClientType.DEALER;
  if (ct.includes('GOVERNMENT') || ct.includes('GOV')) return ClientType.GOVERNMENT;
  if (ct.includes('END') || ct.includes('USER')) return ClientType.END_USER;
  return undefined;
}

export function sanitizeCustomerPatch(patch: Partial<CustomerInfo>): Partial<CustomerInfo> {
  const out: Partial<CustomerInfo> = { ...patch };
  if (out.phone) {
    out.phone = String(out.phone).replace(/[^\d]/g, '').slice(0, 11);
  }
  if (out.clientType != null && typeof out.clientType === 'string') {
    const mapped = mapClientTypeFromText(String(out.clientType));
    if (mapped) out.clientType = mapped;
    else delete out.clientType;
  }
  return out;
}

/** Drops empty strings so we do not overwrite existing quotation fields with blanks. */
export function compactCustomerPatch(patch: Partial<CustomerInfo>): Partial<CustomerInfo> {
  const sanitized = sanitizeCustomerPatch(patch);
  const out: Partial<CustomerInfo> = {};
  for (const key of Object.keys(sanitized) as (keyof CustomerInfo)[]) {
    const v = sanitized[key];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    (out as Record<string, unknown>)[key] = v as unknown;
  }
  return out;
}
