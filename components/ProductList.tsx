
import React, { useState, useMemo, useDeferredValue } from 'react';
import { Product } from '../types';
import { deriveTierPricesFromBasePrice } from '../services/pricing';

interface Props {
  products: Product[];
  onAdd: (product: Product) => void;
}

const ProductList: React.FC<Props> = React.memo(({ products, onAdd }) => {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [displayLimit, setDisplayLimit] = useState(50);

  const filtered = useMemo(() => {
    const searchTerms = deferredSearch.toLowerCase().trim().split(/\s+/).filter(Boolean);
    
    let result = products;
    if (searchTerms.length > 0) {
      result = products.filter(p => 
        searchTerms.every(term => 
          p.name.toLowerCase().includes(term) || 
          p.brand.toLowerCase().includes(term) ||
          p.model.toLowerCase().includes(term) ||
          p.category?.toLowerCase().includes(term) ||
          p.description.toLowerCase().includes(term)
        )
      );
    }
    return result;
  }, [products, deferredSearch]);

  const displayedItems = useMemo(() => filtered.slice(0, displayLimit), [filtered, displayLimit]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[500px] lg:h-[700px]">
      <div className="p-4 sm:p-6 border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">Quick Add Pricelist</h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Showing {displayedItems.length} of {filtered.length}</span>
            <span className="text-xs font-semibold px-2 py-1 bg-slate-100 text-slate-500 rounded-full">{products.length} Total</span>
          </div>
        </div>
        
        <div className="relative group/search">
          <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/search:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input 
            type="text"
            placeholder="Search items by brand, model, or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-medium"
          />
          {search && (
            <button 
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-all"
              title="Clear search"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
        {displayedItems.map(p => {
          const t = deriveTierPricesFromBasePrice(p.baseCost);
          return (
          <div key={p.id} className="group p-4 bg-white hover:bg-slate-50 border border-slate-100 hover:border-blue-200 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{p.model}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded uppercase tracking-tighter">{p.brand}</span>
              </div>
              <h4 className="text-sm font-semibold text-slate-800 group-hover:text-blue-600 transition-colors truncate">{p.name}</h4>
              <p className="text-xs text-slate-500 mt-1 truncate uppercase font-bold tracking-tight opacity-60">{p.category}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                <span className="text-[9px] font-bold text-slate-400">DLR: ₱{t.dealerPrice.toLocaleString()} <span className="text-emerald-600">(BV: ₱{t.dealerBigVolumePrice.toLocaleString()})</span></span>
                <span className="text-[9px] font-bold text-slate-400">CON: ₱{t.contractorPrice.toLocaleString()} <span className="text-emerald-600">(BV: ₱{t.contractorBigVolumePrice.toLocaleString()})</span></span>
                <span className="text-[9px] font-bold text-slate-400">EU: ₱{t.endUserPrice.toLocaleString()} <span className="text-emerald-600">(BV: ₱{t.endUserBigVolumePrice.toLocaleString()})</span></span>
              </div>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); onAdd(p); }}
              className="w-10 h-10 flex shrink-0 items-center justify-center bg-blue-50 text-blue-600 rounded-full group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            </button>
          </div>
          );
        })}
        
        {filtered.length > displayLimit && (
          <button 
            onClick={() => setDisplayLimit(prev => prev + 50)}
            className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-dashed border-slate-200 mt-4"
          >
            Load More (+50 Items)
          </button>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <svg className="w-12 h-12 mx-auto text-slate-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">No items found</p>
          </div>
        )}
      </div>
    </div>
  );
});

export default ProductList;
