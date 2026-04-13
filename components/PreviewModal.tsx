
import React, { useRef, useState, useEffect } from 'react';
import { SelectedItem, CustomerInfo, PaymentMethod, ClientType, PDFTemplate } from '../types';
import { generateQuotationPDF } from '../services/pdfService';
import { TermsRichText } from '../utils/termsRichText';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: SelectedItem[];
  customer: CustomerInfo;
  paymentMethod: PaymentMethod;
  subtotal: number;
  laborCost?: number;
  vat: number;
  discountAmount: number;
  discountValue?: number;
  discountType?: 'percentage' | 'fixed';
  total: number;
  showVat: boolean;
  onSendEmail: (pdfBlob: Blob) => Promise<void>;
  onPersistPdf?: (pdfBlob: Blob, fileName: string) => Promise<void>;
  existingQuoteId?: string;
  template: PDFTemplate;
  customFileName: string;
  onCustomFileNameChange: (name: string) => void;
  headless?: boolean;
  printRefOverride?: React.RefObject<HTMLDivElement | null>;
  /** Shown on PDF (e.g. prepared-by line tied to logged-in sales account). */
  salesAccountTag?: string;
}

const PreviewModal: React.FC<Props> = ({ 
  isOpen, onClose, items, customer, paymentMethod, subtotal, laborCost = 0, vat, discountAmount, discountValue = 0, discountType = 'percentage', total, showVat, onSendEmail, existingQuoteId, template,
  customFileName, onCustomFileNameChange, onPersistPdf, headless = false, printRefOverride, salesAccountTag
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const effectivePrintRef = printRefOverride ?? printRef;
  const [isExporting, setIsExporting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [scale, setScale] = useState(1);
  
  const quotationNo = React.useMemo(() => {
    if (existingQuoteId) return existingQuoteId;
    return 'PQ-FDAS-' + new Date().getFullYear() + '-' + Date.now().toString().slice(-3);
  }, [existingQuoteId]);

  useEffect(() => {
    if (isOpen && !customFileName) {
      onCustomFileNameChange(`Quotation_${quotationNo}`);
    }
  }, [isOpen, quotationNo, customFileName, onCustomFileNameChange]);
  
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    const handleResize = () => {
      const availableWidth = window.innerWidth;
      const docWidth = 850; 
      if (availableWidth < docWidth) {
        setScale((availableWidth - 40) / docWidth); 
      } else {
        setScale(1);
      }
    };

    if (isOpen) {
      handleResize();
      window.addEventListener('resize', handleResize);
    }
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen]);

  const handleDownload = async () => {
    if (!effectivePrintRef.current) return;
    setIsExporting(true);
    try {
      const filename = customFileName.endsWith('.pdf') ? customFileName : `${customFileName}.pdf`;
      const pdfBlob = await generateQuotationPDF(effectivePrintRef.current, filename);
      if (onPersistPdf) {
        try {
          await onPersistPdf(pdfBlob, filename);
        } catch (err) {
          console.warn('PDF saved locally but upload failed:', err);
        }
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdfBlob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error("PDF Export Error:", err);
      alert("Failed to generate PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSendEmail = async () => {
    if (!effectivePrintRef.current) return;
    setIsSending(true);
    try {
      const filename = customFileName.endsWith('.pdf') ? customFileName : `${customFileName}.pdf`;
      const pdfBlob = await generateQuotationPDF(effectivePrintRef.current, filename);
      if (onPersistPdf) {
        try {
          await onPersistPdf(pdfBlob, filename);
        } catch (err) {
          console.warn('Email will continue but PDF upload failed:', err);
        }
      }
      await onSendEmail(pdfBlob);
      onClose(); 
    } catch (err) {
      console.error("Email Send Error:", err);
    } finally {
      setIsSending(false);
    }
  };

  // Keep PDF math aligned with dashboard overview calculation.
  const effectiveDiscountAmount = React.useMemo(() => {
    if (customer.clientType === ClientType.SYSTEM_CONTRACTOR) {
      return subtotal * 0.2;
    }
    return discountType === 'percentage' ? subtotal * (discountValue / 100) : discountValue;
  }, [customer.clientType, subtotal, discountType, discountValue]);

  const effectiveNetTotal = React.useMemo(
    () => subtotal - effectiveDiscountAmount + laborCost,
    [subtotal, effectiveDiscountAmount, laborCost]
  );
  const effectiveVat = React.useMemo(
    () => effectiveNetTotal * 0.12,
    [effectiveNetTotal]
  );
  const effectiveGrandTotal = React.useMemo(
    () => (showVat ? effectiveNetTotal + effectiveVat : effectiveNetTotal),
    [showVat, effectiveNetTotal, effectiveVat]
  );

  if (!isOpen && !headless) return null;
  
  return (
    <div className={headless ? "fixed -left-[200vw] top-0 z-[-1] pointer-events-none opacity-0" : "fixed inset-0 z-[200] flex items-center justify-center p-0 sm:p-4"}>
      {!headless && <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={onClose} />}
      
      <div className={headless ? "relative bg-white" : "relative bg-white w-full max-w-5xl h-full sm:h-auto sm:max-h-[95vh] flex flex-col sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"}>
        {!headless && <div className="flex flex-col sm:flex-row items-center justify-between p-4 sm:p-6 border-b border-slate-100 bg-white sticky top-0 z-20 gap-4 sm:gap-0">
          <div className="text-center sm:text-left">
            <h2 className="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tight">Document Preview</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{quotationNo}</p>
            {salesAccountTag && (
              <p className="text-[9px] text-slate-500 font-semibold mt-0.5">{salesAccountTag}</p>
            )}
          </div>

          <div className="flex-1 max-w-xs mx-4 hidden md:block">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Custom PDF Filename</label>
            <div className="relative">
              <input 
                type="text"
                value={customFileName}
                onChange={(e) => onCustomFileNameChange(e.target.value)}
                placeholder="Enter filename..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">.pdf</span>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-end">
            <button onClick={handleSendEmail} disabled={isSending || isExporting} className="flex-1 sm:flex-none justify-center px-4 py-3 sm:py-2.5 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2">
              {isSending ? 'Sending...' : 'Email PDF'}
            </button>
            <button onClick={handleDownload} disabled={isExporting || isSending} className="flex-1 sm:flex-none justify-center px-4 py-3 sm:py-2.5 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-2">
              {isExporting ? 'Processing...' : 'Download'}
            </button>
            <button onClick={onClose} className="p-3 bg-slate-100 hover:bg-slate-200 rounded-full transition-all active:scale-90">
              <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>}

        <div className={headless ? "p-0 bg-transparent flex justify-center items-start" : "flex-1 overflow-auto p-4 sm:p-8 bg-slate-200 custom-scrollbar flex justify-center items-start"}>
          <div 
            ref={effectivePrintRef} 
            className="bg-white flex flex-col text-black relative shrink-0 shadow-lg origin-top overflow-hidden"
            style={{ 
              width: '215.9mm', 
              fontFamily: '"Inter", sans-serif',
              transform: headless ? 'scale(1)' : `scale(${scale})`,
              marginBottom: headless ? '0' : (scale < 1 ? `-${(1-scale) * 100}%` : '0'), 
            }}
          >
            {/* PDF-HEADER — solid layers for html2canvas; ~41% brand column, separator, blue contact block */}
            <div className="pdf-header relative bg-white overflow-hidden min-h-[152px] border-b-2 border-black">
              <div className="absolute top-0 left-0 h-full w-[41%] bg-white z-0 pointer-events-none" aria-hidden />
              <div
                className="absolute top-0 bottom-0 z-[1] pointer-events-none bg-[#031b33]"
                style={{ left: '41%', width: '2%' }}
                aria-hidden
              />
              <div className="absolute top-0 right-0 bottom-0 left-[43%] bg-[#004a8d] z-0 pointer-events-none" aria-hidden />

              {template.companyInfo.headerImage && (
                <div
                  className="absolute z-[5]"
                  style={{
                    left: 0,
                    top: `${template.companyInfo.headerImage.yOffset || 0}px`,
                    width: '100%',
                    pointerEvents: 'none',
                  }}
                >
                  <img
                    src={template.companyInfo.headerImage.url}
                    alt="Header Decoration"
                    style={{
                      width: `${template.companyInfo.headerImage.width}px`,
                      height: `${template.companyInfo.headerImage.height}px`,
                      objectFit: 'contain',
                    }}
                  />
                </div>
              )}

              <div className="relative z-10 flex w-full min-h-[152px] items-stretch py-2">
                <div className="flex-[0_0_41%] w-[41%] max-w-[41%] box-border flex items-center justify-center px-3 py-1 text-center">
                  <div className="flex w-full min-h-[7rem] items-center justify-center shrink-0">
                    {template.companyInfo.logoUrl ? (
                      <div className="flex h-[100px] w-[180px] items-center justify-center overflow-hidden">
                        <img
                          src={template.companyInfo.logoUrl}
                          alt="Logo"
                          style={{
                            width: '120px',
                            height: 'auto',
                            transform: `scale(${Math.max(0.25, (template.companyInfo.logoWidth ?? 120) / 120)})`,
                            transformOrigin: 'center center',
                          }}
                          className="object-contain"
                        />
                      </div>
                    ) : (
                      <div
                        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#004a8d] shadow-md"
                        aria-hidden
                      >
                        <svg className="h-9 w-9 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center items-stretch text-center text-white px-5 sm:px-6 space-y-0.5 self-center">
                  <p className="text-[8.5pt] font-black uppercase tracking-wide leading-[1.25] whitespace-pre-line">
                    {template.companyInfo.address}
                  </p>
                  <p className="text-[8.5pt] font-black uppercase tracking-tight leading-tight">
                    T: {template.companyInfo.phone} / M: {template.companyInfo.mobile}
                  </p>
                  <p className="text-[8.5pt] font-black uppercase tracking-tight leading-tight">
                    E: {template.companyInfo.email}
                  </p>
                  <p className="text-[9.5pt] font-black uppercase tracking-widest underline leading-tight">
                    {template.companyInfo.website}
                  </p>
                </div>
              </div>
            </div>

            {/* PDF-BODY SECTION */}
            <div className="pdf-body px-[12mm] py-6 flex-1 bg-white">
              <div className="border-y border-black py-1.5 grid grid-cols-3 gap-4 text-[7.5pt] font-black uppercase mb-4">
                <div>VALIDITY: <span className="text-slate-900">15 DAYS</span></div>
                <div className="text-center">REF: <span className="text-slate-900">{quotationNo}</span></div>
                <div className="text-right">DATE: <span className="text-slate-900">{today.toUpperCase()}</span></div>
              </div>
              {salesAccountTag && (
                <div className="text-[7pt] font-bold text-slate-800 mb-3 normal-case tracking-normal">
                  {salesAccountTag}
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-12 gap-y-1.5 text-[7.5pt] mb-6 border border-black p-2">
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="font-black uppercase">Attention To:</span>
                  <span className="font-bold border-b border-slate-200 pb-0.5">{customer.fullName}</span>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="font-black uppercase">Position:</span>
                  <span className="font-bold border-b border-slate-200 pb-0.5">{customer.position || 'PURCHASING OFFICER'}</span>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="font-black uppercase">Company:</span>
                  <span className="font-bold border-b border-slate-200 pb-0.5">{customer.companyName}</span>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="font-black uppercase">Tel/Mobile No.:</span>
                  <span className="font-bold border-b border-slate-200 pb-0.5">{customer.phone}</span>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="font-black uppercase">Email:</span>
                  <span className="font-bold border-b border-slate-200 pb-0.5 text-blue-600 underline">{customer.email}</span>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="font-black uppercase">Address:</span>
                  <span className="font-bold border-b border-slate-200 pb-0.5">{customer.address}</span>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="font-black uppercase">Project For:</span>
                  <span className="font-bold border-b border-slate-200 pb-0.5">{customer.projectFor}</span>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="font-black uppercase">Project Site:</span>
                  <span className="font-bold border-b border-slate-200 pb-0.5">{customer.projectSite}</span>
                </div>
              </div>

              <p className="text-[7.5pt] font-bold italic text-slate-700 mb-4 uppercase">
                We respectfully submit our proposal for your requirements. We look forward to the approval of our product sales quotation, as follows:
              </p>

              <div className="border border-black">
                {/* Group items by brand */}
                {Object.entries(items.reduce((acc, item) => {
                  const brand = item.brand || 'OTHER';
                  if (!acc[brand]) acc[brand] = [];
                  acc[brand].push(item);
                  return acc;
                }, {} as Record<string, SelectedItem[]>)).map(([brand, brandItems], brandIdx) => (
                  <div key={brand} className={brandIdx > 0 ? "border-t border-black" : ""}>
                    <div className="bg-[#FFFF00] text-center text-black font-black text-[9pt] border-b border-black py-1.5 uppercase tracking-[0.2em]">
                      {brand} BRAND
                    </div>
                    <table className="w-full text-[7.5pt] border-collapse">
                      <thead>
                        <tr className="bg-slate-200 border-b border-black font-black uppercase">
                          <th className="border-r border-black px-2 py-1.5 text-center w-[8%]">ITEM</th>
                          <th className="border-r border-black px-2 py-1.5 text-center w-[12%]">MODEL</th>
                          <th className="border-r border-black px-2 py-1.5 text-center w-[45%]">DESCRIPTION</th>
                          <th className="border-r border-black px-2 py-1.5 text-center w-[5%]">QTY</th>
                          <th className="border-r border-black px-2 py-1.5 text-center w-[15%]">UNIT PRICE</th>
                          <th className="px-2 py-1.5 text-center w-[15%]">TOTAL PRICE</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/10">
                        {/* Sub-group by category within brand */}
                        {Object.entries(brandItems.reduce((acc, item) => {
                          const cat = item.category || '';
                          if (!acc[cat]) acc[cat] = [];
                          acc[cat].push(item);
                          return acc;
                        }, {} as Record<string, SelectedItem[]>)).map(([cat, catItems], catIdx) => (
                          <React.Fragment key={cat}>
                            <tr className="bg-slate-100 font-black uppercase">
                              <td colSpan={6} className="px-2 py-1 border-b border-black/10">
                                {cat ? `${String.fromCharCode(65 + catIdx)}. ${cat}` : ''}
                              </td>
                            </tr>
                            {catItems.map((item, idx) => (
                              <tr key={idx} className="border-b border-black/5">
                                <td className="border-r border-black px-2 py-2 text-center font-black">{idx + 1}</td>
                                <td className="border-r border-black px-2 py-2 text-center font-black">{item.model}</td>
                                <td className="border-r border-black px-2 py-2 font-bold leading-tight">
                                  <div className="font-black mb-0.5">{item.name}</div>
                                  <div className="text-[6.5pt] text-slate-500">{item.description}</div>
                                </td>
                                <td className="border-r border-black px-2 py-2 text-center font-black">{item.quantity}</td>
                                <td className="border-r border-black px-2 py-2 text-right font-black">₱{item.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                <td className="px-2 py-2 text-right font-black">₱{(item.price * item.quantity).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

                {customer.hasLabor && (
                  <div className="border-t border-black">
                    <div className="bg-[#004a8d] text-white text-center font-black text-[8pt] border-b border-black py-1 uppercase tracking-widest">LABOR SERVICES DETAILS</div>
                    <div className="p-2 grid grid-cols-2 gap-x-8 gap-y-2">
                      <div className="col-span-2 flex flex-col">
                        <span className="text-[7pt] font-black uppercase text-slate-500">Scope of Work:</span>
                        <span className="text-[7.5pt] font-bold uppercase whitespace-pre-wrap">{customer.laborScope || 'AS PER PROJECT REQUIREMENTS'}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[7pt] font-black uppercase text-slate-500">Target Mobilization:</span>
                        <span className="text-[7.5pt] font-bold uppercase">{customer.mobilizationDate || 'TBA'}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[7pt] font-black uppercase text-slate-500">Site Contact:</span>
                        <span className="text-[7.5pt] font-bold uppercase">{customer.siteContactName || 'N/A'} {customer.siteContactPhone ? `(${customer.siteContactPhone})` : ''}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary Footer Table (Standalone for totals) */}
                <table className="w-full text-[7.5pt] border-collapse">
                  <tfoot className="border-t border-black bg-slate-50">
                    <tr className="font-black">
                      <td colSpan={5} className="border-r border-black px-2 py-1 text-right uppercase w-[85%]">TOTAL (GROSS)</td>
                      <td className="px-2 py-1 text-right w-[15%]">₱{subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    </tr>
                    {laborCost > 0 && (
                      <tr className="font-black">
                        <td colSpan={5} className="border-r border-black px-2 py-1 text-right uppercase">LABOR SERVICES</td>
                        <td className="px-2 py-1 text-right">₱{laborCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                    )}
                    {effectiveDiscountAmount > 0 && (
                      <tr className="font-black text-red-600">
                        <td colSpan={5} className="border-r border-black px-2 py-1 text-right uppercase">
                          {customer.clientType === ClientType.SYSTEM_CONTRACTOR ? 'ADDITIONAL 20% CONTRACTORS DISCOUNT' : 'MANUAL DISCOUNT'}
                        </td>
                        <td className="px-2 py-1 text-right">-₱{effectiveDiscountAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                    )}
                    {showVat && (
                      <tr className="font-black text-indigo-600">
                        <td colSpan={5} className="border-r border-black px-2 py-1 text-right uppercase">ADD 12% VAT</td>
                        <td className="px-2 py-1 text-right">+₱{effectiveVat.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                    )}
                    <tr className="font-black bg-slate-200 border-t border-black">
                      <td colSpan={5} className="border-r border-black px-2 py-1 text-right uppercase text-[9pt]">GRAND TOTAL ({showVat ? 'VAT INCLUSIVE' : 'NET'})</td>
                      <td className="px-2 py-1 text-right text-[9pt]">₱{effectiveGrandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>


                <div className="mt-2 text-[8pt] text-slate-400 italic text-right font-bold uppercase tracking-tight">
                  Calculated {showVat ? 'Gross' : 'Net'} of VAT: ₱{effectiveGrandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}
                </div>



                <div className="mt-6 border border-black">
                  <div className="bg-[#FFFF00] text-center text-black font-black text-[8pt] border-b border-black py-1 uppercase tracking-widest">NOTE AND REMARKS: ALL INDICATED BELOW SHALL BE BILLED SEPARATELY</div>
                  <div className="p-2 space-y-1">
                    {template.notesAndRemarks.map((note, idx) => (
                      <div key={idx} className="grid grid-cols-[24px_1fr] gap-1 text-[7.2pt] font-bold uppercase text-slate-800 leading-[1.45]">
                        <span className="text-center shrink-0 leading-[1.45]">{idx + 1}</span>
                        <span className="whitespace-pre-wrap break-words leading-[1.45]">{note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            {/* PDF-FOOTER SECTION */}
            <div className="pdf-footer px-[12mm] py-8 bg-white shrink-0">
              <div className="border border-black mb-5 overflow-hidden font-sans text-neutral-900">
                <div className="bg-[#C5D4E0] text-center font-bold text-[9pt] border-b border-black py-2 uppercase tracking-wide text-neutral-900">
                  TERMS AND CONDITIONS
                </div>
                {template.termsAndConditions.map((term, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[32px_1fr] border-b border-black last:border-b-0 text-[7.2pt] leading-[1.5] text-neutral-900"
                  >
                    <div className="border-r border-black flex items-start justify-center font-bold pt-2 pb-2 shrink-0">
                      {term.key}
                    </div>
                    <div className="px-2.5 py-2 text-left normal-case font-normal whitespace-pre-wrap break-words antialiased">
                      <TermsRichText text={term.value} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="border border-black mb-6">
                {/* PAYMENT TERMS */}
                <div className="border-b border-black p-2">
                  <div className="text-[7.5pt] font-black uppercase mb-1">PAYMENT TERMS:</div>
                  <div className="pl-12 space-y-1 text-[7.2pt] font-bold uppercase">
                    <div className="grid grid-cols-[160px_1fr]">
                      <span className="font-black">SUPPLY OF DEVICES:</span>
                      <span>{template.paymentTerms.supplyOfDevices}</span>
                    </div>
                    <div className="grid grid-cols-[160px_1fr]">
                      <span className="font-black">SUPPLY OF LABOR:</span>
                      <span>{template.paymentTerms.supplyOfLabor}</span>
                    </div>
                  </div>
                </div>

                {/* PAYMENT DETAILS */}
                <div className="border-b border-black p-2">
                  <div className="text-[7.5pt] font-black uppercase mb-1">PAYMENT DETAILS:</div>
                  <div className="pl-12 text-[7.2pt] font-bold uppercase space-y-1">
                    <div>Bank deposit payment (<span className="font-black">{template.paymentDetails.bankName} Account Number: {template.paymentDetails.accountNumber}</span>)</div>
                    <div>Check payment must be named under <span className="font-black">{template.paymentDetails.accountName}</span></div>
                  </div>
                </div>

                {/* WARRANTY PERIOD */}
                <div className="border-b border-black p-2">
                  <div className="text-[7.5pt] font-black uppercase mb-1">WARRANTY PERIOD:</div>
                  <div className="pl-12 text-[7.2pt] font-bold uppercase space-y-0.5">
                    {template.warrantyPeriod.map((w, i) => <div key={i}>• {w}</div>)}
                  </div>
                </div>

                {/* AVAILABILITY */}
                <div className="p-2">
                  <div className="text-[7.5pt] font-black uppercase mb-1">AVAILABILITY:</div>
                  <div className="pl-12 text-[7.2pt] font-bold uppercase space-y-0.5">
                    {template.availability.map((a, i) => {
                      if (a.toLowerCase().startsWith("note:")) {
                        return (
                          <div key={i}>
                            <span className="text-red-600 font-black">Note:</span> {a.substring(5).trim()}
                          </div>
                        );
                      }
                      return <div key={i}>{a}</div>;
                    })}
                  </div>
                </div>
              </div>

              {/* SIGNATORIES SECTION - PARALLEL */}
              <div className="grid grid-cols-2 gap-12 mb-10 items-end">
                <div className="relative text-center">
                  <p className="text-[8pt] font-black mb-1 uppercase text-slate-900 text-left">Prepared By:</p>
                  <div className="border-b border-black pb-1 relative min-h-[76px] isolate">
                    {/* E-signature: top band, behind name/title */}
                    {template.signatories.preparedBy.signatureUrl && (
                      <div className="absolute left-0 right-0 top-0 flex justify-center pointer-events-none z-[1] pt-0.5">
                        <img
                          src={template.signatories.preparedBy.signatureUrl}
                          alt=""
                          className="max-h-[48px] w-auto object-contain opacity-90"
                          aria-hidden
                        />
                      </div>
                    )}
                    <div className="relative z-[2] pt-14">
                      <p className="text-[11pt] font-bold text-slate-900 leading-tight">{template.signatories.preparedBy.name}</p>
                      <p className="text-[9pt] font-medium italic text-slate-800 leading-tight">{template.signatories.preparedBy.position}</p>
                    </div>
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex flex-col items-center relative min-h-[80px] justify-end">
                    {/* Authorized Signature Overlay */}
                    {template.signatories.authorizedRepresentative.signatureUrl && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-90 -bottom-2">
                        <img 
                          src={template.signatories.authorizedRepresentative.signatureUrl} 
                          alt="Authorized Signature" 
                          className="max-h-24 object-contain"
                        />
                      </div>
                    )}
                    
                    <div className="relative z-10 w-full">
                      {template.signatories.authorizedRepresentative.name && (
                        <p className="text-[11pt] font-bold text-slate-900 leading-tight uppercase mb-6">{template.signatories.authorizedRepresentative.name}</p>
                      )}
                      <div className="w-full border-t border-black pt-2">
                        <p className="text-[10pt] font-black uppercase text-slate-900">{template.signatories.authorizedRepresentative.label}</p>
                        <p className="text-[7.5pt] font-bold text-slate-400 italic">(Printed Name / Signature / Date)</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t-[5px] border-[#003366] pt-5">
                <div className="bg-[#003366] text-white text-center font-black text-[9pt] py-1.5 uppercase tracking-[0.2em] mb-3">CONFIRMATION</div>
                <p className="text-center text-[7.8pt] font-bold text-slate-700 leading-snug uppercase px-6">
                  This proposal will be regarded as an order confirmation upon acceptance. Kindly acknowledge with your signature accompanied by a Purchase Order and/or company stamp. Thank you for your trust and confidence.
                </p>
              </div>

              {/* ADS BANNER */}
              {template.adsBannerUrl && (
                <div className="mt-8 w-full">
                  <img 
                    src={template.adsBannerUrl} 
                    alt="Ads Banner" 
                    className="w-full h-auto object-contain border border-slate-100 rounded shadow-sm"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreviewModal;
