export interface EstimationFileRecord {
  filename: string;
  fileUrl: string;
  previewUrl: string;
  extension: string;
  isPdf: boolean;
  isDocx: boolean;
}

function getBaseUrl(): string {
  const base = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) ?? '';
  return base.replace(/\/+$/, '');
}

function getApiBasePath(): string {
  const p = ((import.meta as any).env?.VITE_API_BASE_PATH as string | undefined) ?? '';
  if (!p.trim()) return '';
  return p.startsWith('/') ? p : `/${p}`;
}

function getListPath(): string {
  const override = (import.meta as any).env?.VITE_ESTIMATION_LIST_PATH as string | undefined;
  if (override && override.trim()) return override.trim();
  // Default assumes router is mounted under /products.
  return '/service/quotation/list/estimationFiles';
}

function getFilePathTemplate(): string {
  const override = (import.meta as any).env?.VITE_ESTIMATION_FILE_PATH_TEMPLATE as string | undefined;
  if (override && override.trim()) return override.trim();
  // Use "{filename}" token for interpolation.
  return '/service/quotation/list/estimationFiles{filename}';
}

function buildAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = getBaseUrl();
  const normalized = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${normalized}`;
}

function buildFileUrl(filename: string): string {
  const tpl = getFilePathTemplate();
  const encoded = encodeURIComponent(filename);
  const path = tpl.includes('{filename}') ? tpl.replace('{filename}', encoded) : `${tpl.replace(/\/+$/, '')}/${encoded}`;
  return buildAbsoluteUrl(path);
}

export async function fetchEstimationFiles(): Promise<EstimationFileRecord[]> {
  const configured = getListPath();
  const apiBasePath = getApiBasePath();
  const candidates = Array.from(
    new Set(
      [
        configured,
        `${apiBasePath}${configured.startsWith('/') ? configured : `/${configured}`}`,
        '/products/list/estimationFiles',
        '/api/products/list/estimationFiles',
        '/list/estimationFiles',
        '/api/list/estimationFiles',
      ].map((p) => p.replace(/\/{2,}/g, '/'))
    )
  );

  let lastStatus: number | null = null;
  let data: any = null;
  let usedPath = '';

  for (const path of candidates) {
    const listUrl = buildAbsoluteUrl(path);
    const res = await fetch(listUrl, { method: 'GET', headers: { Accept: 'application/json' } });
    if (res.ok) {
      data = await res.json();
      usedPath = path;
      break;
    }
    lastStatus = res.status;
  }
  
  if (!data) {
    throw new Error(
      `Failed to fetch estimation files. Tried: ${candidates.join(', ')}${lastStatus ? ` (last status ${lastStatus})` : ''}`
    );
  }

  const files = Array.isArray(data) ? data : (Array.isArray(data?.files) ? data.files : []);
  const isApiPrefixed = usedPath.startsWith('/api/');

  return files
    .map((f: unknown) => {
      const filename = typeof f === 'string' ? f : String((f as any)?.filename ?? (f as any)?.name ?? '').trim();
      if (!filename) return null;
      const extensionMatch = filename.match(/\.([a-z0-9]+)$/i);
      const extension = extensionMatch ? extensionMatch[1].toLowerCase() : '';
      const isPdf = extension === 'pdf';
      const isDocx = extension === 'docx' || extension === 'doc';
      let fileUrl = buildFileUrl(filename);
      if (isApiPrefixed && !/^https?:\/\//i.test(fileUrl) && !fileUrl.includes('/api/')) {
        fileUrl = buildAbsoluteUrl(`/api/products/get/estimationFile/${encodeURIComponent(filename)}`);
      }
      const previewUrl = isPdf
        ? fileUrl
        : isDocx
          ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`
          : fileUrl;
      return {
        filename,
        fileUrl,
        previewUrl,
        extension,
        isPdf,
        isDocx,
      } as EstimationFileRecord;
    })
    .filter((x: EstimationFileRecord | null): x is EstimationFileRecord => x !== null);
}

