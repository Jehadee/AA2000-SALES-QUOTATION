import { getNormalizedApiBaseUrl } from './apiBaseUrl';

function getApiBasePath(): string {
  const p = ((import.meta as any).env?.VITE_API_BASE_PATH as string | undefined) ?? '';
  if (!p.trim()) return '';
  return p.startsWith('/') ? p : `/${p}`;
}

function getChatBotUrl(): string {
  const override = (import.meta as any).env?.VITE_CHAT_BOT_PATH as string | undefined;
  const base = getNormalizedApiBaseUrl().replace(/\/+$/, '');
  if (!base) {
    return '';
  }
  if (override != null && override.trim() !== '') {
    const p = override.trim();
    if (/^https?:\/\//i.test(p)) return p;
    return `${base}${p.startsWith('/') ? p : `/${p}`}`;
  }
  const apiPath = getApiBasePath();
  return `${base}${apiPath}/service/quotation/post/chat-bot`;
}

/**
 * POST /chat-bot multipart form-data:
 * - message: string (optional when image exists)
 * - image: file (optional when message exists)
 */
export async function sendChatBotMessage(message: string, image?: File): Promise<string> {
  const url = getChatBotUrl();
  if (!url) {
    throw new Error(
      'Chat is not configured. Set SERVER_API_URL (and VITE_API_BASE_PATH if your API uses a prefix, e.g. /api).',
    );
  }

  const formData = new FormData();
  if (message.trim()) formData.append('message', message);
  if (image) formData.append('image', image, image.name);

  const res = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: formData,
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const err =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error?: unknown }).error ?? '')
        : typeof data === 'string'
          ? data
          : `Request failed (${res.status})`;
    throw new Error(err || `Chat request failed (${res.status})`);
  }

  if (typeof data === 'object' && data !== null && 'success' in data && (data as { success?: boolean }).success === false) {
    const msg =
      typeof (data as { error?: string; details?: string }).error === 'string'
        ? (data as { error: string }).error
        : 'The chatbot failed to process your message.';
    throw new Error(msg);
  }

  const text =
    typeof data === 'object' && data !== null && 'ai_response' in data
      ? String((data as { ai_response?: unknown }).ai_response ?? '').trim()
      : '';

  if (!text) {
    throw new Error('Empty response from chatbot.');
  }

  return text;
}
