
import React, { useState, useMemo } from 'react';
import { SelectedItem, ClientType } from '../types';
import { FileText, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';

interface Props {
  items: SelectedItem[];
  onUpdateQty: (id: number, qty: number) => void;
  onUpdateItem: (id: number, updates: Partial<SelectedItem>) => void;
  onRemove: (id: number) => void;
  onClear: () => void;
  subtotal: number;
  laborCost?: number;
  vat: number;
  discountValue: number;
  discountType: 'percentage' | 'fixed';
  onDiscountValueChange: (val: number) => void;
  onDiscountTypeChange: (type: 'percentage' | 'fixed') => void;
  showVat: boolean;
  onShowVatChange: (show: boolean) => void;
  total: number;
  isValid: boolean;
  onPreview: () => void;
  onSubmit: () => Promise<void>;
  onSendEmail: () => Promise<void>;
  clientType?: ClientType;
  pdfFileName: string;
  onPdfFileNameChange: (name: string) => void;
  referenceCode: string;
  onReferenceCodeChange: (code: string) => void;
}

const QuotationSummary: React.FC<Props> = React.memo(({ 
  items, 
  onUpdateQty, 
  onUpdateItem,
  onRemove,
  onClear,
  subtotal, 
  laborCost = 0,
  vat, 
  discountValue,
  discountType,
  onDiscountValueChange,
  onDiscountTypeChange,
  showVat,
  onShowVatChange,
  total,
  isValid,
  onPreview,
  onSubmit,
  onSendEmail,
  clientType = ClientType.END_USER,
  pdfFileName,
  onPdfFileNameChange,
  referenceCode,
  onReferenceCodeChange
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalQty = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);

  const activeTierLabel = useMemo(() => {
    switch (clientType) {
      case ClientType.DEALER:
        return totalQty >= 50 ? "DEALER BIG VOLUME (20%)" : "DEALER SMALL VOLUME (30%)";
      case ClientType.SYSTEM_CONTRACTOR:
        return totalQty >= 50 ? "CONTRACTOR BIG VOLUME (10%)" : "CONTRACTOR SMALL VOLUME (15%)";
      case ClientType.END_USER:
      case ClientType.GOVERNMENT:
        return totalQty >= 50 ? "SRP BIG VOLUME (30%)" : "SRP SMALL VOLUME (50%)";
      default:
        return "STANDARD PRICING";
    }
  }, [clientType, totalQty]);

  const handleSubmitClick = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-6 overflow-hidden transition-all hover:shadow-md h-full flex flex-col">
      {/* Header matching screenshot */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#0B1120] text-white rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-slate-900/20">
            <FileText size={18} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 tracking-tight leading-none">Workspace</h2>
            <div className="mt-1">
               <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">{activeTierLabel}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="text-center">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">TOTAL VOLUME</span>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-md inline-block border ${totalQty >= 50 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-100'}`}>
              {totalQty} Units
            </span>
          </div>
          <div className="h-6 w-px bg-slate-100 mx-1"></div>
          <button 
            onClick={onClear}
            className="group flex items-center gap-1.5 px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-100"
          >
            <div className="w-5 h-5 rounded-md bg-red-50 text-red-500 flex items-center justify-center group-hover:bg-red-100 transition-colors">
               <Trash2 size={10} strokeWidth={2.5} />
            </div>
            <span>Clear</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-3 min-h-[300px]">
        {items.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-300 py-12">
             <FileText size={32} className="mb-3 opacity-20" />
             <p className="text-[10px] font-bold uppercase tracking-widest">Workspace is empty</p>
          </div>
        )}
        {items.map((item) => (
          <div key={item.id} className="group relative p-4 bg-[#F8FAFC] border border-slate-100 rounded-2xl transition-all hover:bg-white hover:border-indigo-100 hover:shadow-sm">
            {/* Remove Button - Top Right */}
            <button 
              onClick={() => onRemove(item.id)}
              className="absolute top-3 right-3 text-slate-300 hover:text-red-500 transition-colors"
            >
              <X size={14} />
            </button>

            <div className="flex flex-col gap-3">
              {/* Top Row: Model & Brand */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">{item.model}</span>
                <span className="text-[8px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded uppercase tracking-wider">{item.brand}</span>
              </div>

              {/* Middle Row: Name & Quantity */}
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                   <p className="font-bold text-slate-900 text-sm leading-tight truncate mb-1">{item.name}</p>
                   <div className="flex items-baseline gap-1">
                      <span className="text-xs text-indigo-600 font-bold">₱{item.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      <span className="text-[9px] text-slate-400 font-medium">per unit</span>
                   </div>
                </div>

                {/* Quantity Selector */}
                <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-sm h-8">
                  <button 
                    onClick={() => onUpdateQty(item.id, Math.max(0, item.quantity - 1))}
                    className="w-6 h-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-l-lg transition-colors"
                  >
                    <ChevronDown size={12} />
                  </button>
                  <input 
                    type="number"
                    min="0"
                    value={item.quantity === 0 ? '' : item.quantity}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        onUpdateQty(item.id, 0);
                        return;
                      }
                      const parsed = parseInt(val);
                      if (!isNaN(parsed)) {
                        onUpdateQty(item.id, Math.max(0, parsed));
                      }
                    }}
                    className="w-8 text-center font-bold text-slate-900 text-xs bg-transparent border-none outline-none focus:ring-0 p-0"
                  />
                  <button 
                    onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                    className="w-6 h-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-r-lg transition-colors"
                  >
                    <ChevronUp size={12} />
                  </button>
                </div>
              </div>

              {/* Bottom Row: Total */}
              <div className="flex justify-end items-end mt-1">
                <div className="text-right">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Total</p>
                  <span className="text-sm font-black text-slate-900 block">
                    ₱{(item.price * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-6 border-t border-slate-100">
        <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 space-y-3">
          <div className="flex justify-between text-sm font-medium text-slate-600">
            <span>Subtotal</span>
            <span className="text-slate-900 font-bold">₱{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>

          {laborCost > 0 && (
            <div className="flex justify-between text-sm font-medium text-slate-600">
              <span>Labor Services</span>
              <span className="text-slate-900 font-bold">₱{laborCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          
          <div className="flex flex-col gap-2 p-3 bg-orange-50/50 rounded-xl border border-orange-100">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-orange-700 uppercase tracking-widest">Manual Discount</span>
              <div className="flex bg-white border border-orange-200 rounded-lg p-0.5">
                <button 
                  onClick={() => onDiscountTypeChange('percentage')}
                  className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${discountType === 'percentage' ? 'bg-orange-500 text-white shadow-sm' : 'text-orange-400 hover:text-orange-600'}`}
                >
                  %
                </button>
                <button 
                  onClick={() => onDiscountTypeChange('fixed')}
                  className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${discountType === 'fixed' ? 'bg-orange-500 text-white shadow-sm' : 'text-orange-400 hover:text-orange-600'}`}
                >
                  ₱
                </button>
              </div>
            </div>
            
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1">
                  {discountType === 'fixed' && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-orange-400">₱</span>}
                  <input 
                    type="number"
                    min="0"
                    max={discountType === 'percentage' ? 100 : subtotal}
                    step="0.01"
                    value={discountValue === 0 ? '' : discountValue}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        onDiscountValueChange(0);
                        return;
                      }
                      const parsed = parseFloat(val);
                      if (!isNaN(parsed)) {
                        onDiscountValueChange(Math.max(0, parsed));
                      }
                    }}
                    placeholder="0.00"
                    className={`w-full bg-white border border-orange-200 rounded-lg py-1.5 text-center font-bold outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-xs ${discountType === 'fixed' ? 'pl-5' : ''}`}
                  />
                  {discountType === 'percentage' && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-orange-400">%</span>}
                </div>
              </div>
              <div className="text-right min-w-[80px]">
                <span className="text-xs font-bold text-orange-600">
                  -₱{(discountType === 'percentage' ? (subtotal * (discountValue / 100)) : discountValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-between text-xs font-medium text-slate-500">
            <div className="flex items-center gap-2">
              <span>VAT (12%)</span>
              <label className="inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={showVat} 
                  onChange={(e) => onShowVatChange(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="relative w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
            <span className={showVat ? "text-indigo-600 font-bold" : "text-slate-300 line-through"}>
              +₱{vat.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="h-px bg-slate-200 my-2"></div>

          <div className="flex justify-between items-end">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Total Amount</span>
            <span className="text-3xl font-black text-slate-900 tracking-tight">₱{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Reference Code & PDF Filename Customization */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 px-1">
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Reference Code</label>
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <FileText size={14} />
              </div>
              <input 
                type="text"
                value={referenceCode}
                onChange={(e) => onReferenceCodeChange(e.target.value)}
                placeholder="e.g. PQ-FDAS-2026-001"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all group-hover:bg-white"
              />
            </div>
          </div>
          
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Generated PDF Filename</label>
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <FileText size={14} />
              </div>
              <input 
                type="text"
                value={pdfFileName}
                onChange={(e) => onPdfFileNameChange(e.target.value)}
                placeholder="e.g. Quotation_ProjectName"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-12 py-2.5 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all group-hover:bg-white"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">.pdf</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
            <button 
              onClick={onPreview} 
              disabled={!isValid}
              className="py-3 px-3 bg-white border border-slate-200 text-slate-700 font-bold text-[10px] rounded-xl hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
            >
              Review PDF
            </button>
            <button
              type="button"
              onClick={handleSubmitClick}
              disabled={!isValid || isSubmitting}
              className={`py-3 px-3 font-bold text-[10px] rounded-xl border transition-all flex items-center justify-center gap-2 active:scale-95 uppercase tracking-wider ${
                isValid && !isSubmitting
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100'
                  : 'bg-slate-100 text-slate-400 border-slate-100 shadow-none'
              }`}
            >
              {isSubmitting ? 'Processing...' : 'Submit to Pipeline'}
            </button>
            <button onClick={handleSubmitClick} disabled={!isValid || isSubmitting} className={`col-span-2 py-3 px-3 font-bold text-[10px] rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 active:scale-95 uppercase tracking-wider ${isValid && !isSubmitting ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-slate-100 text-slate-400 shadow-none'}`}>
              {isSubmitting ? 'Processing...' : 'Submit to Pipeline'}
            </button>
        </div>
      </div>
    </section>
  );
});

export default QuotationSummary;
