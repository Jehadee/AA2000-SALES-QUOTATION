import type { Product } from '../types';
import { getNormalizedApiBaseUrl } from './apiBaseUrl';
import { deriveTierPricesFromBasePrice } from './pricing';

/** Backend product shape (from Sequelize Product model) */
interface BackendProduct {
  prod_ID: number;
  prod_Code?: string | null;
  prod_Name?: string | null;
  image_base64?: string | null;
  prod_CategoryID?: number | null;
  prod_supplierID?: number | null;
  prob_status?: string | null;
  prod_price?: number | null;
}

function normalizeProductImageSource(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  if (/^data:image\//i.test(value)) return value;
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  // Backend commonly returns pure base64 bytes; default to jpeg if mime is not provided.
  return `data:image/jpeg;base64,${value}`;
}

function firstNonEmptyString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** Supplier name may appear on the product row (JOIN), as brand, or nested under Supplier. */
function extractSupplierNameFromApiRow(row: Record<string, unknown>): string {
  const flatKeys = [
    row.supplier_name,
    row.Supplier_Name,
    row.supp_Name,
    row.supp_name,
    row.Supp_Name,
    row.prod_supplier_name,
    row.prod_supplierName,
    row.supplierName,
    row.SupplierName,
    row.company_name,
    row.CompanyName,
    row.sup_storeName,
    row.sup_StoreName,
    row.brand,
    row.Brand,
  ];
  for (const c of flatKeys) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  for (const key of ['Supplier', 'supplier', 'SuppSupplier', 'suppSupplier']) {
    const nested = row[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const n = nested as Record<string, unknown>;
      const name = firstNonEmptyString(
        n.sup_storeName,
        n.sup_StoreName,
        n.supp_Name,
        n.supplier_name,
        n.Supplier_Name,
        n.name,
        n.supp_name,
        n.SupplierName,
        n.company_name,
        n.CompanyName,
        n.supp_CompanyName,
        n.sup_Owner
      );
      if (name) return name;
    }
  }
  return '';
}

/**
 * Resolves prod_supplierID / supplier FK from API JSON (column names vary by DB and Sequelize config).
 */
function extractSupplierIdFromApiRow(row: Record<string, unknown>): number | null {
  const explicit: unknown[] = [
    row.prod_supplierID,
    row.prod_supplier_id,
    row.prod_SupplierID,
    row.Prod_SupplierID,
    row.SupplierID,
    row.supplier_ID,
    row.supplier_id,
    row.supplierId,
    row.sup_ID,
    row.Supp_ID,
    row.supp_ID,
    row.SuppId,
    row.suppId,
    row.FK_Supplier,
    row.fk_supplier,
  ];
  for (const v of explicit) {
    if (v == null || v === '') continue;
    const n = Number(v);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  for (const key of Object.keys(row)) {
    if (/name$/i.test(key) || /code$/i.test(key)) continue;
    if (!/supplier|supp/i.test(key)) continue;
    if (!/id$/i.test(key) && !/_id$/i.test(key) && !/ID$/.test(key) && key.toLowerCase() !== 'suppid')
      continue;
    const v = row[key];
    if (v == null || v === '') continue;
    const n = Number(v);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  for (const key of ['Supplier', 'supplier', 'SuppSupplier', 'suppSupplier']) {
    const nested = row[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const n = nested as Record<string, unknown>;
      const inner = Number(
        n.sup_ID ?? n.supp_ID ?? n.supplier_ID ?? n.supplier_id ?? n.Supp_ID ?? n.supplierId ?? n.SupplierID ?? 0
      );
      if (!Number.isNaN(inner) && inner > 0) return inner;
    }
  }
  return null;
}

function getSuppliersUrl(): string {
  const base = getNormalizedApiBaseUrl();
  const pathOverride = (import.meta as any).env?.VITE_SUPPLIERS_PATH as string | undefined;
  const baseClean = base.replace(/\/+$/, '');
  if (pathOverride != null && pathOverride.trim() !== '') {
    const p = pathOverride.trim().replace(/^\/+/, '/');
    return `${baseClean}${p}`;
  }
  // Matches: router.get('/get/suppliers') mounted e.g. app.use('/suppliers', router)
  return `${baseClean}/suppliers/get/suppliers`;
}

function parseSupplierRowsToMap(list: unknown[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const item of list) {
    if (item == null || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = Number(
      r.sup_ID ??
        r.supp_ID ??
        r.supplier_ID ??
        r.supplier_id ??
        r.Supp_ID ??
        r.supplierId ??
        r.SupplierID ??
        r.prod_supplierID ??
        0
    );
    const name = firstNonEmptyString(
      r.sup_storeName,
      r.sup_StoreName,
      r.supp_Name,
      r.supplier_name,
      r.Supplier_Name,
      r.name,
      r.supp_name,
      r.CompanyName,
      r.company_name,
      r.SupplierName,
      r.sup_Owner
    );
    if (id > 0 && name) map.set(id, name);
  }
  return map;
}

/** Load supplier id → display name from the API (database). */
async function fetchSupplierMap(): Promise<Map<number, string>> {
  const primary = getSuppliersUrl();
  const base = getNormalizedApiBaseUrl();
  const baseClean = base.replace(/\/+$/, '');
  const fallback = `${baseClean}/products/get/suppliers`;

  const tryUrl = async (url: string): Promise<Map<number, string>> => {
    try {
      const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      if (!res.ok) return new Map();
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.data ?? data?.suppliers ?? data?.rows ?? []);
      return parseSupplierRowsToMap(Array.isArray(list) ? list : []);
    } catch {
      return new Map();
    }
  };

  let map = await tryUrl(primary);
  if (map.size === 0 && primary !== fallback) {
    map = await tryUrl(fallback);
  }
  return map;
}

function getProductsUrl(): string {
  const base = getNormalizedApiBaseUrl();
  const pathOverride = (import.meta as any).env?.VITE_PRODUCTS_PATH as string | undefined;
  const baseClean = base.replace(/\/+$/, '');
  if (pathOverride != null && pathOverride.trim() !== '') {
    const p = pathOverride.trim().replace(/^\/+/, '/');
    return `${baseClean}${p}`;
  }
  // Default: backend routes are mounted under /products with
  //   router.get('/get/products', ...)
  // and router is mounted as app.use('/products', router)
  // → full path: /products/get/products
  //
  // If your mounting changes in the future, override via VITE_PRODUCTS_PATH
  // e.g. VITE_PRODUCTS_PATH=/api/products/get/products
  return `${baseClean}/products/get/products`;
}

function mapBackendProductToFrontend(row: BackendProduct, brandFromSupplier: string): Product {
  const id = Number(row.prod_ID ?? 0);
  const code = String(row.prod_Code ?? '').trim();
  const name = String(row.prod_Name ?? '').trim();
  /** DB/API: single base (unit cost); tiers computed in deriveTierPricesFromBasePrice */
  const baseCost = Number(row.prod_price ?? 0);
  const tier = deriveTierPricesFromBasePrice(baseCost);
  const category = row.prod_CategoryID != null ? String(row.prod_CategoryID) : '';
  return {
    id,
    model: code || name || String(id),
    name: name || code || '—',
    description: name ? `Product: ${name}` : '',
    brand: brandFromSupplier.trim(),
    imageUrl: normalizeProductImageSource(row.image_base64),
    baseCost,
    price: tier.endUserPrice,
    category: category || undefined,
    dealerPrice: tier.dealerPrice,
    contractorPrice: tier.contractorPrice,
    endUserPrice: tier.endUserPrice,
    dealerBigVolumePrice: tier.dealerBigVolumePrice,
    contractorBigVolumePrice: tier.contractorBigVolumePrice,
    endUserBigVolumePrice: tier.endUserBigVolumePrice,
  };
}

export async function fetchProducts(): Promise<Product[]> {
  const url = getProductsUrl();
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Failed to fetch products: ${res.status}`);
  }
  const data = await res.json();
  const list = Array.isArray(data) ? data : (data?.data ?? data?.products ?? data?.rows ?? []);
  const rows = list.filter((row: unknown): row is Record<string, unknown> => row != null && typeof row === 'object');

  const pairs = rows.map((row) => {
    const backend: BackendProduct = {
      prod_ID: Number(row.prod_ID ?? row.prod_id ?? 0),
      prod_Code: row.prod_Code ?? row.prod_code ?? null,
      prod_Name: row.prod_Name ?? row.prod_name ?? null,
      image_base64: row.image_base64 ?? null,
      prod_CategoryID: row.prod_CategoryID ?? row.prod_categoryID ?? null,
      prod_supplierID: row.prod_supplierID ?? row.prod_supplier_id ?? row.supplier_ID ?? null,
      prob_status: row.prob_status ?? row.prod_status ?? null,
      prod_price: row.prod_price ?? row.prod_price ?? null,
    };
    const brandFromJoin = extractSupplierNameFromApiRow(row);
    const product = mapBackendProductToFrontend(backend, brandFromJoin);
    const supplierId = extractSupplierIdFromApiRow(row);
    return { product, supplierId };
  });

  const needsSupplierLookup = pairs.some(
    ({ product, supplierId }) => supplierId != null && !(product.brand ?? '').trim()
  );
  if (!needsSupplierLookup) {
    return pairs.map((p) => p.product);
  }

  const supplierMap = await fetchSupplierMap();
  return pairs.map(({ product, supplierId }) => {
    if ((product.brand ?? '').trim()) return product;
    if (supplierId != null && supplierMap.has(supplierId)) {
      return { ...product, brand: supplierMap.get(supplierId)! };
    }
    return product;
  });
}
