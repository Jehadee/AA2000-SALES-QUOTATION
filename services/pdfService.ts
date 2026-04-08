import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export const generateQuotationPDF = async (element: HTMLElement, filename: string): Promise<Blob> => {
  if (!element) {
    throw new Error('Unable to generate PDF: missing document element.');
  }

  // Standard US Legal Width in MM (8.5")
  const LEGAL_WIDTH = 215.9;

  const colorProps: Array<keyof CSSStyleDeclaration> = [
    'color',
    'backgroundColor',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'outlineColor',
    'textDecorationColor',
    'fill',
    'stroke',
  ];

  const hasUnsupportedColorFn = (value: string): boolean => {
    const v = (value || '').toLowerCase();
    return v.includes('oklch(') || v.includes('oklab(');
  };

  const convertToSupportedColor = (value: string, prop?: keyof CSSStyleDeclaration): string => {
    if (!value || !hasUnsupportedColorFn(value)) return value;
    // Let the browser normalize color syntax for us; html2canvas prefers rgb/rgba.
    const probe = document.createElement('span');
    probe.style.color = value;
    probe.style.position = 'fixed';
    probe.style.left = '-9999px';
    document.body.appendChild(probe);
    const normalized = getComputedStyle(probe).color;
    document.body.removeChild(probe);
    if (normalized && !hasUnsupportedColorFn(normalized)) return normalized;

    // Export-safe fallback values (never fallback to black fills for backgrounds).
    if (prop === 'backgroundColor') return '#ffffff';
    if (
      prop === 'borderTopColor' ||
      prop === 'borderRightColor' ||
      prop === 'borderBottomColor' ||
      prop === 'borderLeftColor' ||
      prop === 'outlineColor'
    ) {
      return '#0f172a';
    }
    return '#111827';
  };

  const isTransparentColor = (value: string): boolean => {
    const v = (value || '').trim().toLowerCase();
    return (
      v === 'transparent' ||
      v === 'rgba(0, 0, 0, 0)' ||
      v === 'rgba(0,0,0,0)' ||
      v === 'hsla(0, 0%, 0%, 0)' ||
      v === 'hsla(0,0%,0%,0)'
    );
  };

  const waitNextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const waitForImages = async (root: HTMLElement) => {
    const imgs = Array.from(root.querySelectorAll('img'));
    await Promise.all(
      imgs.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        });
      }),
    );
  };

  const isCanvasLikelyBlank = (canvas: HTMLCanvasElement): boolean => {
    if (!canvas.width || !canvas.height) return true;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return true;
    const { width, height } = canvas;
    const sampleStepX = Math.max(1, Math.floor(width / 24));
    const sampleStepY = Math.max(1, Math.floor(height / 24));
    let nonWhite = 0;
    let sampled = 0;
    for (let y = 0; y < height; y += sampleStepY) {
      for (let x = 0; x < width; x += sampleStepX) {
        const d = ctx.getImageData(x, y, 1, 1).data;
        sampled++;
        const [r, g, b, a] = d;
        if (a > 8 && (r < 245 || g < 245 || b < 245)) nonWhite++;
      }
    }
    // If almost all samples are white/transparent, treat as empty render.
    return sampled > 0 ? nonWhite / sampled < 0.01 : true;
  };

  try {
    // Capture a detached clone on `document.body`. The preview lives inside a scaled node + scrollable
    // modal; html2canvas often mis-bounds/clips the subtree so the PDF header disappears. A fixed,
    // off-screen clone avoids ancestor overflow/transform issues and keeps the on-screen preview unchanged.
    const clone = element.cloneNode(true) as HTMLElement;
    clone.style.position = 'fixed';
    clone.style.left = '0';
    clone.style.top = '0';
    clone.style.zIndex = '-10000';
    clone.style.transform = 'none';
    clone.style.transformOrigin = 'top left';
    clone.style.margin = '0';
    clone.style.marginBottom = '0';
    clone.style.pointerEvents = 'none';
    clone.style.boxShadow = 'none';

    const w = Math.max(1, Math.ceil(element.scrollWidth || element.offsetWidth));
    clone.style.width = `${w}px`;

    document.body.appendChild(clone);

    let canvas: HTMLCanvasElement;
    try {
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          /* ignore */
        }
      }
      await waitForImages(clone);
      await waitNextFrame();
      await waitNextFrame();

      const scrollW = Math.ceil(clone.scrollWidth || clone.offsetWidth);
      const scrollH = Math.ceil(clone.scrollHeight || clone.offsetHeight);
      const pad = 32;
      // Clone iframe defaults to viewport size; tall quotations get clipped if these stay too small.
      const windowWidth = Math.max(typeof window !== 'undefined' ? window.innerWidth : scrollW, scrollW) + pad;
      const windowHeight = Math.max(typeof window !== 'undefined' ? window.innerHeight : scrollH, scrollH) + pad;

      // Width/height left unset so render size follows parsed element bounds; scroll forced to origin.
      const baseOptions = {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000,
        scrollX: 0,
        scrollY: 0,
        windowWidth,
        windowHeight,
      };

      const sanitizedFallbackOptions = {
        ...baseOptions,
        foreignObjectRendering: false,
        onclone: (clonedDoc: Document) => {
          const all = clonedDoc.querySelectorAll<HTMLElement>('*');
          all.forEach((node) => {
            const style = (node as HTMLElement).style;
            const computed = clonedDoc.defaultView?.getComputedStyle(node);
            colorProps.forEach((prop) => {
              const inlineVal = style[prop] as unknown as string;
              const computedVal = (computed?.[prop] as unknown as string) || '';
              const current = computedVal || inlineVal;
              if (!current) return;
              if (hasUnsupportedColorFn(current)) {
                (style[prop] as unknown as string) = convertToSupportedColor(current, prop);
              } else if (computedVal) {
                if (prop === 'backgroundColor' && isTransparentColor(computedVal)) {
                  (style[prop] as unknown as string) = '#ffffff';
                } else {
                  (style[prop] as unknown as string) = computedVal;
                }
              }
            });
          });
        },
      };

      try {
        canvas = await html2canvas(clone, {
          ...baseOptions,
          foreignObjectRendering: true,
        });
        if (isCanvasLikelyBlank(canvas)) {
          throw new Error('Blank canvas from foreignObject rendering');
        }
      } catch (primaryError) {
        canvas = await html2canvas(clone, sanitizedFallbackOptions);
        if (isCanvasLikelyBlank(canvas)) {
          throw new Error('Blank canvas from fallback rendering');
        }
      }
    } finally {
      clone.remove();
    }

    // JPEG avoids PNG alpha/compositing artifacts (black fills) in some PDF viewers.
    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    
    // Calculate PDF height based on aspect ratio to maintain width at 215.9mm
    const pdfHeight = (canvas.height * LEGAL_WIDTH) / canvas.width;

    // Create PDF with custom height to avoid page breaks (Long PDF)
    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: [LEGAL_WIDTH, pdfHeight]
    });

    pdf.addImage(imgData, 'JPEG', 0, 0, LEGAL_WIDTH, pdfHeight, undefined, 'MEDIUM');
    
    return pdf.output('blob');
  } catch (error) {
    console.error("Critical PDF Generation Error:", error);
    const message = error instanceof Error ? error.message : 'Unknown PDF generation failure';
    throw new Error(`Failed to generate PDF: ${message}`);
  }
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
