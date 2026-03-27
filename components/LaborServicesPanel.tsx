
import React from 'react';
import { LaborService } from '../types';
import { Plus, Wrench, X, Trash2 } from 'lucide-react';

interface Props {
  laborServices: LaborService[];
  onAddLabor: () => void;
  onUpdateLabor: (id: string, updates: Partial<LaborService>) => void;
  onRemoveLabor: (id: string) => void;
}

const LaborServicesPanel: React.FC<Props> = ({ 
  laborServices, 
  onAddLabor, 
  onUpdateLabor, 
  onRemoveLabor 
}) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[400px]">
      <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-indigo-900/20">
            <Wrench size={18} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">Labor & Services</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Manual Pricing Panel</p>
          </div>
        </div>
        <button 
          onClick={onAddLabor}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-indigo-700 transition-all active:scale-95 shadow-md shadow-indigo-500/20"
        >
          <Plus size={14} strokeWidth={3} />
          <span>Add Service</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {laborServices.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-300 py-12">
            <Wrench size={48} className="mb-4 opacity-10" />
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">No services added yet</p>
            <p className="text-[10px] text-slate-400 mt-1">Click the button above to add labor or professional services.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {laborServices.map((service) => (
              <div key={service.id} className="group relative p-5 bg-slate-50 border border-slate-100 rounded-2xl transition-all hover:bg-white hover:border-indigo-200 hover:shadow-md">
                <button 
                  onClick={() => onRemoveLabor(service.id)}
                  className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors p-1 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 size={14} />
                </button>

                <div className="space-y-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Service Name</label>
                    <input 
                      type="text"
                      value={service.name}
                      onChange={(e) => onUpdateLabor(service.id, { name: e.target.value })}
                      placeholder="e.g. Installation, Delivery, Maintenance"
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Description / Scope of Work</label>
                    <textarea 
                      value={service.description}
                      onChange={(e) => onUpdateLabor(service.id, { description: e.target.value })}
                      placeholder="Describe the service details..."
                      rows={2}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-600 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Service Price (PHP)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₱</span>
                        <input 
                          type="number"
                          value={service.price}
                          onChange={(e) => onUpdateLabor(service.id, { price: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-4 py-2.5 font-black text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LaborServicesPanel;
