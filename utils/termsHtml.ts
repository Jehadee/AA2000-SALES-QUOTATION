/** Markers → HTML for migration / preview. */
export function migrateMarkersToHtml(s: string): string {
  if (!s.includes('{{')) return s;
  return s
    .replace(/\{\{r\}\}([\s\S]*?)\{\{\/r\}\}/g, '<span style="color:#b91c1c;font-weight:700">$1</span>')
    .replace(/\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g, '<strong>$1</strong>');
}

export function normWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function stripRichMarkers(s: string): string {
  return s.replace(/\{\{b\}\}|\{\{\/b\}\}|\{\{r\}\}|\{\{\/r\}\}/g, '');
}

export function stringToPlainForCompare(s: string): string {
  const noMarkers = stripRichMarkers(s);
  if (typeof document === 'undefined') {
    return normWs(noMarkers.replace(/<[^>]+>/g, ' '));
  }
  const d = document.createElement('div');
  d.innerHTML = noMarkers;
  return normWs(d.textContent || '');
}

function stripAllAttrs(el: HTMLElement): void {
  while (el.attributes.length > 0) {
    el.removeAttribute(el.attributes[0].name);
  }
}

/**
 * Returns a safe canonical `color:` value, or null. Blocks `url()`, `var()`, etc.
 */
export function normalizeSafeColor(raw: string): string | null {
  const v0 = raw.trim();
  if (!v0 || /url\(|expression|javascript|@import|var\(|attr\(|</i.test(v0)) return null;
  const compact = v0.replace(/\s+/g, '').toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(compact)) return compact;
  const rgbCompact = v0.replace(/\s+/g, '').toLowerCase();
  if (
    /^rgba?\(\d{1,3},\d{1,3},\d{1,3}(,\d*\.?\d+%?)?\)$/.test(rgbCompact) &&
    !/rgba?\([^)]*url/i.test(v0)
  ) {
    return rgbCompact;
  }
  if (/^hsla?\(/i.test(v0) && v0.trim().endsWith(')') && !/url|expression|var|@import/i.test(v0)) {
    const inner = v0.slice(v0.indexOf('(') + 1, -1);
    if (/^[\d\s.,%/-]+$/i.test(inner)) {
      return v0.replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }
  return null;
}

function sanitizeSpanStyle(style: string | null): string | null {
  if (!style) return null;
  const out: string[] = [];
  for (const part of style.split(';')) {
    const p = part.trim();
    if (!p) continue;
    const idx = p.indexOf(':');
    if (idx < 0) continue;
    const key = p.slice(0, idx).trim().toLowerCase();
    const valRaw = p.slice(idx + 1).trim();
    const valLower = valRaw.toLowerCase();
    if (key === 'color') {
      const ok = normalizeSafeColor(valRaw);
      if (ok) out.push(`color:${ok}`);
    }
    if (key === 'font-weight' && (valLower === '700' || valLower === 'bold')) {
      out.push('font-weight:700');
    }
  }
  return out.length ? out.join(';') : null;
}

function walkSanitizeOnce(parent: HTMLElement): boolean {
  let changed = false;
  const children = Array.from(parent.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) continue;
    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.parentNode?.removeChild(child);
      changed = true;
      continue;
    }
    const el = child as HTMLElement;
    const t = el.tagName.toLowerCase();
    if (new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta']).has(t)) {
      el.remove();
      changed = true;
      continue;
    }
    if (t === 'br') {
      stripAllAttrs(el);
      continue;
    }
    if (t === 'strong' || t === 'b') {
      stripAllAttrs(el);
      if (walkSanitizeOnce(el)) changed = true;
      continue;
    }
    if (t === 'font') {
      const doc = el.ownerDocument;
      const raw = (el.getAttribute('color') || '').trim();
      let c: string | null = null;
      if (raw.startsWith('#') || /^rgba?\(/i.test(raw) || /^hsla?\(/i.test(raw)) {
        c = normalizeSafeColor(raw);
      } else if (raw) {
        c = normalizeSafeColor(raw.startsWith('#') ? raw : `#${raw.replace(/^#/, '')}`);
      }
      const p = el.parentNode;
      if (!p) continue;
      if (c) {
        const span = doc.createElement('span');
        span.setAttribute('style', `color:${c}`);
        while (el.firstChild) span.appendChild(el.firstChild);
        p.replaceChild(span, el);
        if (walkSanitizeOnce(span)) changed = true;
      } else {
        while (el.firstChild) p.insertBefore(el.firstChild, el);
        p.removeChild(el);
      }
      changed = true;
      continue;
    }
    if (t === 'span') {
      const clean = sanitizeSpanStyle(el.getAttribute('style'));
      stripAllAttrs(el);
      if (clean) {
        el.setAttribute('style', clean);
        if (walkSanitizeOnce(el)) changed = true;
      } else {
        const p = el.parentNode;
        if (p) {
          while (el.firstChild) p.insertBefore(el.firstChild, el);
          p.removeChild(el);
          changed = true;
        }
      }
      continue;
    }
    const p = el.parentNode;
    if (!p) continue;
    while (el.firstChild) p.insertBefore(el.firstChild, el);
    p.removeChild(el);
    changed = true;
  }
  return changed;
}

/** Allow only bold / red emphasis tags for quotation terms (XSS-safe subset). */
export function sanitizeTermsHtml(input: string): string {
  const raw = input || '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+=/gi, '');
  }
  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLDivElement | null;
  if (!root) return '';
  for (let i = 0; i < 12 && walkSanitizeOnce(root); i += 1) {
    // unwrap nested disallowed tags (e.g. div/p from paste)
  }
  let html = root.innerHTML;
  if (!html || html === '<br>') return '<br>';
  return html;
}

export function preprocessMarkdownBold(raw: string): string {
  if (raw.includes('{{')) return raw;
  return raw.replace(/\*\*([\s\S]+?)\*\*/g, '{{b}}$1{{/b}}');
}

export function termsLooksRich(s: string): boolean {
  const staged = migrateMarkersToHtml(preprocessMarkdownBold(s));
  return /<(strong|b|span|br)\b/i.test(staged);
}

export function termsToSanitizedHtml(s: string): string {
  return sanitizeTermsHtml(migrateMarkersToHtml(preprocessMarkdownBold(s)));
}
