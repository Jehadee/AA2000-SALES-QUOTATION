import { getNormalizedApiBaseUrl } from './apiBaseUrl';

export interface EstimationFileRecord {
  filename: string;
  fileUrl: string;
  /** ISO string of the file created date/time when returned by the server list endpoint. */
  createdAt?: string;
  /** URL for iframe preview: PDF from get route, DOCX from server /preview (PDF) or Office Online fallback. */
  previewUrl: string;
  extension: string;
  isPdf: boolean;
  isDocx: boolean;
  /** True when Word has no inline preview (no API preview URL and Office Online not usable). */
  docxInlinePreviewSkipped?: boolean;
}

const ESTIMATION_LIST_SUFFIX = '/list/estimationFiles';

function estimationRoutePrefixFromListPath(usedPath: string, isApiPrefixed: boolean): string {
  if (usedPath.endsWith(ESTIMATION_LIST_SUFFIX)) {
    return usedPath.slice(0, -ESTIMATION_LIST_SUFFIX.length);
  }
  return isApiPrefixed ? '/api/products' : '';
}

/**
 * Office Online embed fetches `src` from Microsoft's servers — localhost, tunnels, and auth-only URLs fail with
 * "not valid or not publicly accessible". Call this before building an Office embed URL.
 */
export function canOfficeOnlinePreview(fileUrl: string): boolean {
  const flag = (import.meta as any).env?.VITE_ESTIMATION_OFFICE_PREVIEW as string | undefined;
  if (flag === '0' || flag === 'false') return false;
  if (flag === '1' || flag === 'true') return true;

  try {
    const u = new URL(fileUrl);
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local')) return false;
    if (/^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return false;
    if (
      /devtunnels\.ms$/i.test(h) ||
      h.endsWith('.ngrok-free.app') ||
      h.endsWith('.ngrok.io') ||
      /loca\.lt$/i.test(h) ||
      h.endsWith('.trycloudflare.com')
    )
      return false;
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

function getBaseUrl(): string {
  return getNormalizedApiBaseUrl();
}

function getApiBasePath(): string {
  const p = ((import.meta as any).env?.VITE_API_BASE_PATH as string | undefined) ?? '';
  if (!p.trim()) return '';
  return p.startsWith('/') ? p : `/${p}`;
}

function getListPath(): string {
  const override = (import.meta as any).env?.VITE_ESTIMATION_LIST_PATH as string | undefined;
  if (override && override.trim()) return override.trim();
  // Default: GET .../list/estimationFiles
  return '/service/quotation/get/list/estimationFiles';
}

function getFilePathTemplate(): string {
  const override = (import.meta as any).env?.VITE_ESTIMATION_FILE_PATH_TEMPLATE as string | undefined;
  if (override && override.trim()) return override.trim();
  // Default: GET .../get/estimationFile/:filename (note nested "get" under /service/quotation/get/)
  return '/service/quotation/get/get/estimationFile/{filename}';
}

function buildAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = getBaseUrl();
  const normalized = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${normalized}`;
}

function buildFileUrl(filename: string): string {
  let tpl = getFilePathTemplate();
  // Backward compatibility: if an old list endpoint template is configured for file download,
  // force it to use the proper get endpoint to avoid malformed URLs like
  // /service/quotation/list/estimationFiles<filename>.
  if (/\/list\/estimationFiles/i.test(tpl)) {
    const replacement = /service\/quotation\/get\//i.test(tpl)
      ? '/get/get/estimationFile/{filename}'
      : '/get/estimationFile/{filename}';
    tpl = tpl.replace(/\/list\/estimationFiles(?:\{filename\})?/i, replacement);
  }
  const encoded = encodeURIComponent(filename);
  const path = tpl.includes('{filename}') ? tpl.replace('{filename}', encoded) : `${tpl.replace(/\/+$/, '')}/${encoded}`;
  return buildAbsoluteUrl(path);
}

/** DOCX → HTML preview route; matches .../preview/estimationFile/:filename next to the get route. */
function buildDocxServerPreviewUrl(fileUrl: string, filename: string): string {
  if (/\/get\/estimationFile\//i.test(fileUrl)) {
    return fileUrl.replace(/\/get\/estimationFile\//i, '/preview/estimationFile/');
  }
  const enc = encodeURIComponent(filename);
  const override = (import.meta as any).env?.VITE_ESTIMATION_PREVIEW_PATH_TEMPLATE as string | undefined;
  if (override && override.trim()) {
    const tpl = override.trim();
    const path = tpl.includes('{filename}') ? tpl.replace('{filename}', enc) : `${tpl.replace(/\/+$/, '')}/${enc}`;
    return buildAbsoluteUrl(path);
  }
  let prevTpl = getFilePathTemplate();
  if (/get\/get\/estimationFile/i.test(prevTpl)) {
    prevTpl = prevTpl.replace(/get\/get\/estimationFile/i, 'get/preview/estimationFile');
  } else {
    prevTpl = prevTpl.replace(/\/get\/estimationFile/i, '/preview/estimationFile');
  }
  const path = prevTpl.includes('{filename}')
    ? prevTpl.replace('{filename}', enc)
    : `${prevTpl.replace(/\/+$/, '')}/${enc}`;
  return buildAbsoluteUrl(path);
}

export async function fetchEstimationFiles(): Promise<EstimationFileRecord[]> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    // If baseUrl is empty, all candidate endpoints become relative paths and Vercel will return HTML
    // (index.html / fallback), causing JSON parsing errors.
    throw new Error(
      `Missing VITE_API_BASE_URL. The estimation list fetch would call relative URLs on Vercel (HTML instead of JSON). ` +
        `Set VITE_API_BASE_URL to your backend origin (e.g. "https://your-server-host.com") and ensure VITE_API_BASE_PATH matches.`
    );
  }

  const configured = getListPath();
  const apiBasePath = getApiBasePath();
  const listSuffix = '/list/estimationFiles';
  const serviceQuotationList = '/service/quotation/get/list/estimationFiles';
  const candidates = Array.from(
    new Set(
      [
        configured,
        ...(apiBasePath
          ? [
              `${apiBasePath}${serviceQuotationList}`.replace(/\/{2,}/g, '/'),
              `${apiBasePath}${listSuffix}`.replace(/\/{2,}/g, '/'),
            ]
          : []),
        `${apiBasePath}${configured.startsWith('/') ? configured : `/${configured}`}`.replace(/\/{2,}/g, '/'),
        serviceQuotationList,
        '/products/list/estimationFiles',
        '/api/products/list/estimationFiles',
        listSuffix,
        '/api/list/estimationFiles',
        '/service/quotation/list/estimationFiles',
      ].map((p) => p.replace(/\/{2,}/g, '/'))
    )
  );

  let lastStatus: number | null = null;
  let saw404 = false;
  let sawNon404Error = false;
  let data: any = null;
  let usedPath = '';
  let lastNonJsonBody: string | null = null;
  let lastNonJsonUrl: string | null = null;

  for (const path of candidates) {
    const listUrl = buildAbsoluteUrl(path);
    const res = await fetch(listUrl, { method: 'GET', headers: { Accept: 'application/json' } });
    if (res.ok) {
      // Some deployments return an HTML fallback (e.g. Vercel 404 page or SPA index.html),
      // which causes `res.json()` to throw "Unexpected token '<'".
      const rawText = await res.text();
      try {
        data = JSON.parse(rawText);
        usedPath = path;
        break;
      } catch {
        // Not JSON: try next candidate endpoint instead of failing the whole fetch.
        lastNonJsonUrl = listUrl;
        lastNonJsonBody = rawText.trim().slice(0, 200);
      }
    } else {
      lastStatus = res.status;
      if (res.status === 404) saw404 = true;
      else sawNon404Error = true;
    }
  }
  
  if (!data) {
    // Some backends return 404 when estimation storage is empty/missing.
    // Treat this as an empty inbox instead of a hard failure.
    if (saw404 && !sawNon404Error && !lastNonJsonUrl) {
      return [];
    }
    throw new Error(
      `Failed to fetch estimation files JSON. Tried: ${candidates.join(', ')}${
        lastStatus ? ` (last status ${lastStatus})` : ''
      }${lastNonJsonUrl ? ` (non-JSON response at ${lastNonJsonUrl}; FirstChars="${(lastNonJsonBody || '').replace(/\s+/g, ' ')}")` : ''}`
    );
  }

  const files = Array.isArray(data) ? data : (Array.isArray(data?.files) ? data.files : []);
  const isApiPrefixed = usedPath.startsWith('/api/');
  const estimationRoutePrefix = estimationRoutePrefixFromListPath(usedPath, isApiPrefixed);

  return files
    .map((f: unknown) => {
      const filename =
        typeof f === 'string' ? f : String((f as any)?.filename ?? (f as any)?.name ?? '').trim();
      if (!filename) return null;
      const createdAt =
        typeof f === 'string'
          ? undefined
          : (f as any)?.createdAt
            ? String((f as any).createdAt)
            : undefined;
      const basename = filename.split(/[?#]/)[0] ?? filename;
      const extensionMatch = basename.match(/\.([a-z0-9]+)$/i);
      const extension = extensionMatch ? extensionMatch[1].toLowerCase() : '';
      const isPdf = extension === 'pdf' || /\.pdf$/i.test(basename);
      const isDocx =
        /\.docx$/i.test(basename) || (/\.doc$/i.test(basename) && !/\.docx$/i.test(basename));
      let fileUrl = buildFileUrl(filename);
      if (isApiPrefixed && estimationRoutePrefix && !/^https?:\/\//i.test(fileUrl) && !fileUrl.includes('/api/')) {
        fileUrl = buildAbsoluteUrl(
          `${estimationRoutePrefix}/get/estimationFile/${encodeURIComponent(filename)}`
        );
      }

      const serverDocxPreview = isDocx ? buildDocxServerPreviewUrl(fileUrl, filename) : '';
      const useOffice = isDocx && !serverDocxPreview && canOfficeOnlinePreview(fileUrl);

      const previewUrl = isPdf
        ? fileUrl
        : isDocx
          ? serverDocxPreview ||
            (useOffice
              ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`
              : '')
          : fileUrl;

      return {
        filename,
        fileUrl,
        createdAt,
        previewUrl,
        extension,
        isPdf,
        isDocx,
        docxInlinePreviewSkipped: isDocx && !previewUrl,
      } as EstimationFileRecord;
    })
    .filter((x: EstimationFileRecord | null): x is EstimationFileRecord => x !== null);
}

