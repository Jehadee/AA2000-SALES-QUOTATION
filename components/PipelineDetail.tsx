
import React, { useState } from 'react';
import { QuotationRecord, QuotationStatus, FollowUpLog, Attachment, ClientType } from '../types';
import { COMPANY_DETAILS } from '../constants';
import FlowchartProgress from './FlowchartProgress';

interface Props {
  quote: QuotationRecord;
  onClose: () => void;
  onUpdateStatus: (id: string, status: QuotationStatus) => void;
  onAddLog: (id: string, log: FollowUpLog) => void;
  onRevise: (quote: QuotationRecord) => void;
  onPreviewPDF: () => void;
  /** Move a draft quotation into the main sales pipeline. */
  onPromoteFromDraft?: (id: string) => void;
}

const PipelineDetail: React.FC<Props> = ({ quote, onClose, onUpdateStatus, onAddLog, onRevise, onPreviewPDF, onPromoteFromDraft }) => {
  const [activeTab, setActiveTab] = useState<'status' | 'overview' | 'items' | 'history'>('status');
  const [newNote, setNewNote] = useState('');

  const handleAddLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    onAddLog(quote.id, {
      date: new Date().toISOString(),
      note: newNote,
      user: 'Staff Admin'
    });
    setNewNote('');
  };

  // Advanced Workflow Control Panel
  const renderStageControls = () => {
    const btnBase = "flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95";
    
    // Primary Action (Move Forward)
    const primaryBtn = (label: string, action: () => void) => (
      <button onClick={action} className={`${btnBase} bg-slate-900 text-white hover:bg-slate-800`}>
        {label} <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
      </button>
    );

    // Secondary Action (Loop Back/Revise)
    const secondaryBtn = (label: string, action: () => void) => (
      <button onClick={action} className={`${btnBase} bg-white border border-slate-200 text-slate-600 hover:bg-slate-50`}>
        {label}
      </button>
    );

    // Critical Action (Reject/Cancel)
    const dangerBtn = (label: string, action: () => void) => (
      <button onClick={action} className={`${btnBase} bg-red-50 text-red-600 border border-red-100 hover:bg-red-100`}>
        {label}
      </button>
    );

    // Success Action (Accept)
    const successBtn = (label: string, action: () => void) => (
      <button onClick={action} className={`${btnBase} bg-emerald-600 text-white hover:bg-emerald-700`}>
        {label} <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
      </button>
    );

    // Special Email Action
    const emailBtn = (label: string, action: () => void) => (
      <button onClick={action} className={`${btnBase} bg-indigo-600 text-white hover:bg-indigo-700`}>
        {label} <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
      </button>
    );

    if (quote.isDraft && onPromoteFromDraft) {
      return (
        <div className="bg-amber-50 p-4 sm:p-6 rounded-2xl border border-amber-100 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest block">Draft Inbox</span>
              <span className="text-sm font-black text-amber-900 uppercase tracking-wide">Review before pipeline</span>
            </div>
          </div>
          <p className="text-xs text-amber-900/80 mb-4 leading-relaxed">
            This quote is not in the sales pipeline yet. Preview the PDF, send email to the customer if you want, then add it to the pipeline when you are ready.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            {secondaryBtn('Edit / Revise', () => onRevise(quote))}
            {emailBtn('Preview & Send Email', onPreviewPDF)}
            {primaryBtn('Add to Pipeline', () => onPromoteFromDraft(quote.id))}
          </div>
        </div>
      );
    }

    return (
      <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-100 mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Update Life Cycle</span>
            <span className="text-sm font-black text-indigo-600 uppercase tracking-wide">Stage Controls</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {quote.status === QuotationStatus.INQUIRY && primaryBtn("Start Requirements", () => onUpdateStatus(quote.id, QuotationStatus.REQUIREMENTS))}
          
          {quote.status === QuotationStatus.REQUIREMENTS && primaryBtn("Start Preparation", () => onUpdateStatus(quote.id, QuotationStatus.PREPARATION))}
          
          {quote.status === QuotationStatus.PREPARATION && (
            <>
              {secondaryBtn("Edit/Revise", () => onRevise(quote))}
              {primaryBtn("Ready for Review", () => onUpdateStatus(quote.id, QuotationStatus.REVIEW))}
            </>
          )}

          {quote.status === QuotationStatus.REVIEW && (
            <>
              {secondaryBtn("Edit Quote", () => onRevise(quote))}
              {emailBtn("Preview & Send Email", onPreviewPDF)} 
              {primaryBtn("Mark Sent / Follow-up", () => onUpdateStatus(quote.id, QuotationStatus.FOLLOWUP))}
            </>
          )}
          
          {quote.status === QuotationStatus.NEGOTIATION && (
             <>
               {secondaryBtn("Resend Email", onPreviewPDF)}
               {secondaryBtn("Revise Quote", () => onRevise(quote))}
               {successBtn("Approve / Confirm Order", () => onUpdateStatus(quote.id, QuotationStatus.ACCEPTED))}
             </>
          )}

          {quote.status === QuotationStatus.ACCEPTED && (
             <div className="flex gap-3 w-full">
               {dangerBtn("Cancel Order", () => onUpdateStatus(quote.id, QuotationStatus.REJECTED))}
               <div className="flex-1 p-3 rounded-xl text-center font-bold text-xs uppercase tracking-widest bg-emerald-100 text-emerald-700 flex items-center justify-center">
                 Order Confirmed & Closed
               </div>
             </div>
          )}

          {quote.status === QuotationStatus.REJECTED && (
             <div className="w-full p-3 rounded-xl text-center font-bold text-xs uppercase tracking-widest bg-slate-200 text-slate-600">
               Status: Closed / Lost
             </div>
          )}

          {(quote.status === QuotationStatus.FOLLOWUP || quote.status === QuotationStatus.DECISION) && (
              primaryBtn("Move to Negotiation", () => onUpdateStatus(quote.id, QuotationStatus.NEGOTIATION))
          )}
        </div>
      </div>
    );
  };

    const itemsTotal = quote.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const laborTotal = (quote.laborServices || []).reduce((sum, s) => sum + s.price, 0);
    const subtotal = itemsTotal + laborTotal;
  const discountType = quote.discountType || 'percentage';
  const discountValue = quote.discountValue ?? quote.discountPercent ?? 0;
  const contractorDiscount = quote.customer.clientType === ClientType.SYSTEM_CONTRACTOR ? subtotal * 0.20 : 0;
  const configuredDiscountAmount =
    discountType === 'fixed'
      ? discountValue
      : subtotal * (discountValue / 100);
  const manualDiscount = quote.customer.clientType === ClientType.SYSTEM_CONTRACTOR
    ? (discountType === 'fixed'
        ? discountValue
        : Math.max(0, configuredDiscountAmount - contractorDiscount))
    : configuredDiscountAmount;
  const netTotal = subtotal - contractorDiscount - manualDiscount;
  const vatAmount = netTotal * 0.12;
  const showVat = quote.showVat ?? true;
  const finalTotal = netTotal + (showVat ? vatAmount : 0);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-end">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-full max-w-3xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        <div className="px-4 py-4 sm:px-8 sm:py-6 border-b border-slate-100 bg-white z-20 flex justify-between items-start">
          <div>
             <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1">
               <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">{quote.id}</h2>
               {quote.isDraft ? (
                 <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest w-fit bg-amber-100 text-amber-800">
                   Draft
                 </span>
               ) : (
               <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest w-fit ${
                 quote.status === QuotationStatus.ACCEPTED ? 'bg-emerald-100 text-emerald-600' : 
                 quote.status === QuotationStatus.REJECTED ? 'bg-red-100 text-red-600' : 'bg-indigo-50 text-indigo-600'
               }`}>
                 {quote.status}
               </span>
               )}
             </div>
             <p className="text-xs sm:text-sm font-medium text-slate-500 truncate max-w-[200px] sm:max-w-none">{quote.customer.fullName} — {quote.customer.companyName}</p>
          </div>
          <div className="text-right mr-8 sm:mr-0">
             <span className="block text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Value</span>
             <span className="block text-xl sm:text-2xl font-black text-slate-900">₱{finalTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
          <button onClick={onClose} className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-4 sm:px-8 border-b border-slate-100 flex gap-4 sm:gap-6 overflow-x-auto no-scrollbar">
          {(['status', 'overview', 'items', 'history'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab === 'history' ? 'Audit Trail & Docs' : tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto bg-white custom-scrollbar">
          
          {/* STATUS TAB */}
          {activeTab === 'status' && (
            <div className="p-4 sm:p-8 space-y-8 animate-in fade-in duration-300">
               {quote.isDraft && (
                 <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-xs text-amber-900 font-medium">
                   Draft Inbox — this quotation is staged for review. It will appear in the main pipeline after you use &quot;Add to Pipeline&quot;.
                 </div>
               )}
               <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Real-time Progress</h3>
                  <FlowchartProgress currentStatus={quote.status} />
               </div>
               {renderStageControls()}
               <div className="p-6 bg-indigo-50 rounded-3xl border border-indigo-100 flex items-start gap-4">
                  <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest mb-1">Process Information</h4>
                    <p className="text-[10px] text-indigo-800/70 leading-relaxed">
                      This flowchart visualizes the current lifecycle stage of <strong>{quote.id}</strong>. Use the stage controls above to move the quotation forward or request revisions. 
                      All status changes are logged in the audit trail.
                    </p>
                  </div>
               </div>
            </div>
          )}

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="p-4 sm:p-8 space-y-8 animate-in fade-in duration-300">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                  Financial Breakdown
                  <span className="px-2 py-0.5 bg-slate-100 rounded text-[9px] text-slate-500">PHP</span>
                </h4>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal (List Price)</span>
                    <span className="font-medium">₱{subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                  {contractorDiscount > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Contractor Discount (20%)</span>
                      <span className="text-indigo-600 font-bold">-₱{contractorDiscount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                  )}
                  {manualDiscount > 0 && (
                     <div className="flex justify-between text-slate-600">
                      <span>
                        {discountType === 'fixed'
                          ? 'Manual Adjustment (Fixed)'
                          : `Manual Adjustment (${(
                              quote.customer.clientType === ClientType.SYSTEM_CONTRACTOR
                                ? Math.max(0, discountValue - 20)
                                : discountValue
                            ).toLocaleString(undefined, { maximumFractionDigits: 2 })}%)`}
                      </span>
                      <span className="text-orange-600 font-bold">-₱{manualDiscount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span className={showVat ? "" : "opacity-50"}>VAT (12%) {!showVat && "(Hidden on PDF)"}</span>
                    <span className={`font-medium ${showVat ? "text-indigo-600" : "line-through opacity-50"}`}>₱{vatAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                  <div className="border-t border-slate-100 pt-3 flex justify-between items-end">
                    <span className="font-bold text-slate-900">Grand Total ({showVat ? 'Gross' : 'Net'})</span>
                    <span className="text-xl font-black text-indigo-600">₱{finalTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">Client Details</h4>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-[10px] font-bold text-slate-400 uppercase">Attention To</dt>
                      <dd className="font-medium text-slate-900">{quote.customer.fullName}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold text-slate-400 uppercase">Email</dt>
                      <dd className="font-medium text-slate-900">{quote.customer.email}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold text-slate-400 uppercase">Phone</dt>
                      <dd className="font-medium text-slate-900">{quote.customer.phone || 'N/A'}</dd>
                    </div>
                  </dl>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">Project Info</h4>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-[10px] font-bold text-slate-400 uppercase">Project Name</dt>
                      <dd className="font-medium text-slate-900">{quote.customer.projectFor || 'General Supply'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold text-slate-400 uppercase">Site Location</dt>
                      <dd className="font-medium text-slate-900">{quote.customer.projectSite || 'N/A'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold text-slate-400 uppercase">Payment Terms</dt>
                      <dd className="font-medium text-slate-900">{quote.paymentMethod}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <button 
                  onClick={onPreviewPDF}
                  className="w-full py-4 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-600 rounded-xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Preview Official PDF
                </button>
              </div>
            </div>
          )}

          {/* ITEMS TAB */}
          {activeTab === 'items' && (
            <div className="p-4 sm:p-8 animate-in fade-in duration-300">
              <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[600px]">
                    <thead className="bg-slate-100 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4">Item Description</th>
                        <th className="px-6 py-4 text-center">Qty</th>
                        <th className="px-6 py-4 text-right">Unit Price</th>
                        <th className="px-6 py-4 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {quote.items.map((item, i) => (
                        <tr key={i} className="hover:bg-white transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-900">{item.model}</div>
                            <div className="text-xs text-slate-500 truncate max-w-[200px]">{item.name}</div>
                          </td>
                          <td className="px-6 py-4 text-center font-medium">{item.quantity}</td>
                          <td className="px-6 py-4 text-right font-medium text-slate-600">₱{item.price.toLocaleString()}</td>
                          <td className="px-6 py-4 text-right font-bold text-slate-900">₱{(item.price * item.quantity).toLocaleString()}</td>
                        </tr>
                      ))}
                      {(quote.laborServices || []).map((service, i) => (
                        <tr key={`labor-${i}`} className="hover:bg-white transition-colors bg-indigo-50/30">
                          <td className="px-6 py-4">
                            <div className="font-bold text-indigo-900">{service.name}</div>
                            <div className="text-xs text-indigo-600/70 truncate max-w-[200px]">{service.description}</div>
                          </td>
                          <td className="px-6 py-4 text-center font-medium">1</td>
                          <td className="px-6 py-4 text-right font-medium text-slate-600">₱{service.price.toLocaleString()}</td>
                          <td className="px-6 py-4 text-right font-bold text-indigo-900">₱{service.price.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100">
                      <tr>
                        <td colSpan={3} className="px-6 py-4 text-right text-xs font-black uppercase tracking-widest text-slate-500">Gross Total</td>
                        <td className="px-6 py-4 text-right font-black text-indigo-600">₱{subtotal.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="p-4 sm:p-8 flex flex-col h-full min-h-[400px] animate-in fade-in duration-300">
              <div className="flex-1 space-y-6 mb-6">
                {quote.attachments.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-3">Attached Files</h4>
                    <div className="flex flex-wrap gap-2">
                      {quote.attachments.map((file, idx) => (
                        <a 
                          key={idx}
                          href={`data:${file.type};base64,${file.data}`} 
                          download={file.name}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-all group"
                        >
                          <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                          <span className="text-xs font-bold text-slate-600 group-hover:text-indigo-900 truncate max-w-[150px]">{file.name}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-3">System Logs</h4>
                <div className="space-y-4">
                  {quote.logs.map((log, i) => (
                    <div key={i} className="flex gap-4 group">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-slate-300 group-hover:bg-indigo-400 mt-1.5 transition-colors" />
                        <div className="w-px h-full bg-slate-100 group-last:hidden mt-1" />
                      </div>
                      <div className="pb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-slate-900">{log.user}</span>
                          <span className="text-[10px] text-slate-400">{new Date(log.date).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg rounded-tl-none border border-slate-100">
                          {log.note}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-auto bg-white sticky bottom-0 pt-4">
                <form onSubmit={handleAddLog} className="relative">
                  <input 
                    type="text" 
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add an internal note or update..."
                    className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-sm transition-all"
                  />
                  <button 
                    type="submit"
                    disabled={!newNote.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 text-white rounded-lg disabled:opacity-50 disabled:bg-slate-300 hover:bg-indigo-700 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                  </button>
                </form>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default PipelineDetail;
