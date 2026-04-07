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
    // Preview UI uses CSS `transform: scale(...)` on the root; html2canvas often clips or drops
    // the top of the layout (header) when capturing transformed nodes. Snapshot at 1:1 scale.
    const prevTransform = element.style.transform;
    const prevTransformOrigin = element.style.transformOrigin;
    const prevMarginBottom = element.style.marginBottom;

    let canvas: HTMLCanvasElement;
    try {
      element.style.transform = 'none';
      element.style.transformOrigin = 'top center';
      element.style.marginBottom = '0';
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      // Base capture configuration
      const baseOptions = {
        scale: 2, // Balanced for quality and file size
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
        x: 0,
        y: 0,
      };

      // Fallback options sanitize unsupported css color functions.
      const sanitizedFallbackOptions = {
        ...baseOptions,
        foreignObjectRendering: false,
        onclone: (clonedDoc: Document) => {
          // html2canvas fails on unsupported color functions (`oklch` / `oklab`).
          // To keep visual fidelity, force a safe inline value per rendered node using computed styles
          // instead of rewriting all stylesheet tokens globally.
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
                // Lock the rendered color to avoid stylesheet parsing differences in html2canvas.
                if (prop === 'backgroundColor' && isTransparentColor(computedVal)) {
                  (style[prop] as unknown as string) = '#ffffff';
                } else {
                  (style[prop] as unknown as string) = computedVal;
                }
              }
            });
          });
        }
      };

      try {
        // Primary path: rely on native browser rendering for best visual fidelity.
        canvas = await html2canvas(element, {
          ...baseOptions,
          foreignObjectRendering: true,
        });
        if (isCanvasLikelyBlank(canvas)) {
          throw new Error('Blank canvas from foreignObject rendering');
        }
      } catch (primaryError) {
        // Fallback path for environments where foreignObject rendering is unsupported
        // or css parsing fails due oklch/oklab.
        canvas = await html2canvas(element, sanitizedFallbackOptions);
        if (isCanvasLikelyBlank(canvas)) {
          throw new Error('Blank canvas from fallback rendering');
        }
      }
    } finally {
      element.style.transform = prevTransform;
      element.style.transformOrigin = prevTransformOrigin;
      element.style.marginBottom = prevMarginBottom;
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
