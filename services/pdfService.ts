
export const generateQuotationPDF = async (element: HTMLElement, filename: string): Promise<Blob> => {
  const jsPDFLib = (window as any).jspdf;
  const jsPDF = jsPDFLib.jsPDF || jsPDFLib;
  const html2canvas = (window as any).html2canvas;

  // Standard US Legal Width in MM (8.5")
  const LEGAL_WIDTH = 215.9;

  try {
    // Use a high-quality capture configuration
    const captureOptions = {
      scale: 2, // Balanced for quality and file size
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight
    };

    // Capture the entire element
    const canvas = await html2canvas(element, captureOptions);
    const imgData = canvas.toDataURL('image/png', 1.0);
    
    // Calculate PDF height based on aspect ratio to maintain width at 215.9mm
    const pdfHeight = (canvas.height * LEGAL_WIDTH) / canvas.width;

    // Create PDF with custom height to avoid page breaks (Long PDF)
    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: [LEGAL_WIDTH, pdfHeight]
    });

    pdf.addImage(imgData, 'PNG', 0, 0, LEGAL_WIDTH, pdfHeight, undefined, 'FAST');
    
    return pdf.output('blob');
  } catch (error) {
    console.error("Critical PDF Generation Error:", error);
    throw error;
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
