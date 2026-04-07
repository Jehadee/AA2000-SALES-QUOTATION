
import React, { useRef, useState, useEffect } from 'react';
import { SelectedItem, CustomerInfo, PaymentMethod, ClientType, PDFTemplate } from '../types';
import { generateQuotationPDF } from '../services/pdfService';

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
  total: number;
  showVat: boolean;
  onSendEmail: (pdfBlob: Blob) => Promise<void>;
  onPersistPdf?: (pdfBlob: Blob, fileName: string) => Promise<void>;
  existingQuoteId?: string;
  template: PDFTemplate;
  customFileName: string;
  onCustomFileNameChange: (name: string) => void;
}

const PreviewModal: React.FC<Props> = ({ 
  isOpen, onClose, items, customer, paymentMethod, subtotal, laborCost = 0, vat, discountAmount, total, showVat, onSendEmail, existingQuoteId, template,
  customFileName, onCustomFileNameChange, onPersistPdf
}) => {
  const printRef = useRef<HTMLDivElement>(null);
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
    if (!printRef.current) return;
    setIsExporting(true);
    try {
      const filename = customFileName.endsWith('.pdf') ? customFileName : `${customFileName}.pdf`;
      const pdfBlob = await generateQuotationPDF(printRef.current, filename);
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
    if (!printRef.current) return;
    setIsSending(true);
    try {
      const filename = customFileName.endsWith('.pdf') ? customFileName : `${customFileName}.pdf`;
      const pdfBlob = await generateQuotationPDF(printRef.current, filename);
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

  if (!isOpen) return null;

  // Total after all deductions
  const finalPayable = subtotal - discountAmount;
  
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative bg-white w-full max-w-5xl h-full sm:h-auto sm:max-h-[95vh] flex flex-col sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 sm:p-6 border-b border-slate-100 bg-white sticky top-0 z-20 gap-4 sm:gap-0">
          <div className="text-center sm:text-left">
            <h2 className="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tight">Document Preview</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{quotationNo}</p>
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
        </div>

        <div className="flex-1 overflow-auto p-4 sm:p-8 bg-slate-200 custom-scrollbar flex justify-center items-start">
          <div 
            ref={printRef} 
            className="bg-white flex flex-col text-black relative shrink-0 shadow-lg origin-top overflow-hidden"
            style={{ 
              width: '215.9mm', 
              fontFamily: '"Inter", sans-serif',
              transform: `scale(${scale})`,
              marginBottom: scale < 1 ? `-${(1-scale) * 100}%` : '0', 
            }}
          >
            {/* PDF-HEADER SECTION — gradient instead of skewed boxes so html2canvas captures reliably */}
            <div className="pdf-header relative bg-white overflow-hidden h-[130px] border-b-2 border-black">
              <div
                className="absolute inset-0 z-0 pointer-events-none"
                aria-hidden
                style={{
                  background:
                    'linear-gradient(112deg, #ffffff 0%, #ffffff 36%, #031b33 36%, #031b33 39.5%, #004a8d 39.5%, #004a8d 100%)',
                }}
              />
              
              {/* Header Image (Product Showcase) */}
              {template.companyInfo.headerImage && (
                <div 
                  className="absolute z-10"
                  style={{
                    left: 0,
                    top: `${template.companyInfo.headerImage.yOffset || 0}px`,
                    width: '100%',
                    pointerEvents: 'none' // Ensure it doesn't block text selection if overlaying
                  }}
                >
                  <img 
                    src={template.companyInfo.headerImage.url} 
                    alt="Header Decoration"
                    style={{
                      width: `${template.companyInfo.headerImage.width}px`,
                      height: `${template.companyInfo.headerImage.height}px`,
                      objectFit: 'contain'
                    }} 
                  />
                </div>
              )}

              <div className="relative z-10 flex w-full h-full items-center px-[12mm]">
                <div className="w-[45%] flex items-center gap-4">
                  {/* Logo Area */}
                  {template.companyInfo.logoUrl && (
                    <div 
                      style={{ 
                        transform: `translate(${template.companyInfo.logoXOffset || 0}px, ${template.companyInfo.logoYOffset || 0}px)` 
                      }}
                      className="shrink-0"
                    >
                      <img 
                        src={template.companyInfo.logoUrl} 
                        alt="Logo" 
                        style={{ width: `${template.companyInfo.logoWidth || 200}px` }}
                        className="max-w-full object-contain"
                      />
                    </div>
                  )}

                  {/* Company Name */}
                  <div className="flex-1 min-w-0">
                    <h1 
                      style={{
                        fontSize: `${template.companyInfo.companyNameStyle?.fontSize || 32}pt`,
                        color: template.companyInfo.companyNameStyle?.color || '#004a8d',
                        fontWeight: template.companyInfo.companyNameStyle?.fontWeight || '900',
                        fontFamily: template.companyInfo.companyNameStyle?.fontFamily || 'Inter',
                        fontStyle: template.companyInfo.companyNameStyle?.italic ? 'italic' : 'normal',
                      }}
                      className="tracking-tighter leading-none uppercase whitespace-pre-wrap"
                    >
                      {template.companyInfo.name}
                    </h1>
                  </div>
                </div>

                <div className="flex-1 flex flex-col justify-center items-center text-center text-white pl-12 pr-4 space-y-1">
                  <p className="text-[8.5pt] font-black uppercase tracking-wide leading-tight">{template.companyInfo.address}</p>
                  <p className="text-[8.5pt] font-black uppercase tracking-tight">T: {template.companyInfo.phone} / M: {template.companyInfo.mobile}</p>
                  <p className="text-[8.5pt] font-black uppercase tracking-tight">E: {template.companyInfo.email}</p>
                  <p className="text-[9.5pt] font-black uppercase tracking-widest underline">{template.companyInfo.website}</p>
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
                    {discountAmount > 0 && (
                      <tr className="font-black text-red-600">
                        <td colSpan={5} className="border-r border-black px-2 py-1 text-right uppercase">
                          {customer.clientType === ClientType.SYSTEM_CONTRACTOR ? 'ADDITIONAL 20% CONTRACTORS DISCOUNT' : 'MANUAL DISCOUNT'}
                        </td>
                        <td className="px-2 py-1 text-right">-₱{discountAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                    )}
                    {showVat && (
                      <tr className="font-black text-indigo-600">
                        <td colSpan={5} className="border-r border-black px-2 py-1 text-right uppercase">ADD 12% VAT</td>
                        <td className="px-2 py-1 text-right">+₱{vat.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                    )}
                    <tr className="font-black bg-slate-200 border-t border-black">
                      <td colSpan={5} className="border-r border-black px-2 py-1 text-right uppercase text-[9pt]">GRAND TOTAL ({showVat ? 'VAT INCLUSIVE' : 'NET'})</td>
                      <td className="px-2 py-1 text-right text-[9pt]">₱{total.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>


                <div className="mt-2 text-[8pt] text-slate-400 italic text-right font-bold uppercase tracking-tight">
                  Calculated {showVat ? 'Gross' : 'Net'} of VAT: ₱{total.toLocaleString(undefined, {minimumFractionDigits: 2})}
                </div>



                <div className="mt-6 border border-black">
                  <div className="bg-[#FFFF00] text-center text-black font-black text-[8pt] border-b border-black py-1 uppercase tracking-widest">NOTE AND REMARKS: ALL INDICATED BELOW SHALL BE BILLED SEPARATELY</div>
                  <div className="p-2 space-y-1">
                    {template.notesAndRemarks.map((note, idx) => (
                      <div key={idx} className="flex text-[7.2pt] font-bold uppercase text-slate-800 whitespace-pre-wrap">
                        <span className="w-6 text-center shrink-0">{idx + 1}</span>
                        <span>{note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            {/* PDF-FOOTER SECTION */}
            <div className="pdf-footer px-[12mm] py-8 bg-white shrink-0">
              <div className="border border-black mb-5">
                <div className="bg-[#003366] text-white text-center font-bold text-[9pt] border-b border-black py-1.5 uppercase tracking-widest">TERMS AND CONDITIONS</div>
                <div className="p-3 space-y-1.5">
                  {template.termsAndConditions.map((term, idx) => (
                    <div key={idx} className="flex text-[7.2pt] font-bold uppercase leading-relaxed text-slate-800">
                      <span className="w-6 text-center shrink-0">{term.key}</span>
                      <span>{term.value}</span>
                    </div>
                  ))}
                </div>
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
                  <div className="border-b border-black pb-1 relative min-h-[60px] flex flex-col justify-end">
                    {/* E-Signature Overlay */}
                    {template.signatories.preparedBy.signatureUrl && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-90">
                        <img 
                          src={template.signatories.preparedBy.signatureUrl} 
                          alt="Signature" 
                          className="max-h-24 object-contain mb-4"
                        />
                      </div>
                    )}
                    <div className="relative z-10">
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
