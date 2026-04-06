
import React, { useState, useMemo, useDeferredValue, useRef } from 'react';
import { Product } from '../types';
import { deriveTierPricesFromBasePrice } from '../services/pricing';

interface Props {
  products: Product[];
  onAdd: (product: Product) => void;
  onCreateProduct: (product: Product) => void | Promise<void>;
}

const ProductList: React.FC<Props> = React.memo(({ products, onAdd, onCreateProduct }) => {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [displayLimit, setDisplayLimit] = useState(50);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '',
    model: '',
    category: '',
    supplier: '',
    status: 'ACTIVE',
    price: '',
    imageUrl: '',
  });
  const imageInputRef = useRef<HTMLInputElement>(null);

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
  const categories = useMemo(() => Array.from(new Set(products.map(p => p.category || '').filter(Boolean))).sort(), [products]);
  const suppliers = useMemo(() => Array.from(new Set(products.map(p => p.brand || '').filter(Boolean))).sort(), [products]);

  const handleOpenCreate = () => {
    setCreateError(null);
    setNewProduct({ name: '', model: '', category: '', supplier: '', status: 'ACTIVE', price: '', imageUrl: '' });
    setIsCreateOpen(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setCreateError('Please upload a valid image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = String(event.target?.result || '');
      setNewProduct(prev => ({ ...prev, imageUrl: base64 }));
      setCreateError(null);
    };
    reader.onerror = () => setCreateError('Failed to read image file.');
    reader.readAsDataURL(file);
  };

  const handleSubmitCreate = async () => {
    const name = newProduct.name.trim();
    const model = newProduct.model.trim();
    const category = newProduct.category.trim();
    const supplier = newProduct.supplier.trim();
    const baseCost = Number(newProduct.price);

    if (!name) return setCreateError('Product name is required.');
    if (!model) return setCreateError('Model is required.');
    if (!Number.isFinite(baseCost) || baseCost <= 0) return setCreateError('Price must be greater than 0.');

    const tier = deriveTierPricesFromBasePrice(baseCost);
    const product: Product = {
      id: Date.now(),
      model: model.toUpperCase(),
      name,
      description: `${name}${newProduct.status ? ` (${newProduct.status})` : ''}`,
      brand: supplier ? supplier.toUpperCase() : 'NO SUPPLIER',
      imageUrl: newProduct.imageUrl || undefined,
      baseCost,
      price: tier.endUserPrice,
      category: category ? category.toUpperCase() : 'UNCATEGORIZED',
      dealerPrice: tier.dealerPrice,
      contractorPrice: tier.contractorPrice,
      endUserPrice: tier.endUserPrice,
      dealerBigVolumePrice: tier.dealerBigVolumePrice,
      contractorBigVolumePrice: tier.contractorBigVolumePrice,
      endUserBigVolumePrice: tier.endUserBigVolumePrice,
    };

    setIsCreating(true);
    setCreateError(null);
    try {
      await onCreateProduct(product);
      setIsCreateOpen(false);
      onAdd(product);
    } catch (e: any) {
      setCreateError(e?.message || 'Failed to create product.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[500px] lg:h-[700px]">
      <div className="p-4 sm:p-6 border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">Quick Add Pricelist</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenCreate}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-emerald-500 transition-colors"
            >
              Add Product
            </button>
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

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {displayedItems.map(p => {
          const t = deriveTierPricesFromBasePrice(p.baseCost);
          return (
          <div key={p.id} className="group p-4 bg-white hover:bg-slate-50 border border-slate-100 hover:border-blue-200 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-4">
            {p.imageUrl ? (
              <img src={p.imageUrl} alt={p.name} className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center text-slate-400 text-[10px] font-black uppercase">No Img</div>
            )}
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
        </div>
        
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
    {isCreateOpen && (
      <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setIsCreateOpen(false)} />
        <div className="relative w-full max-w-3xl bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-900">Add product</h3>
            <button onClick={() => setIsCreateOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Product Image</label>
              <div className="mt-2 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400"
                >
                  {newProduct.imageUrl ? (
                    <img src={newProduct.imageUrl} alt="Preview" className="w-full h-full object-cover rounded-2xl" />
                  ) : (
                    <span className="text-2xl font-bold">+</span>
                  )}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="px-3 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-slate-800"
                  >
                    Upload
                  </button>
                  {newProduct.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setNewProduct(prev => ({ ...prev, imageUrl: '' }))}
                      className="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-wider hover:bg-red-100"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Name *</label>
              <input value={newProduct.name} onChange={(e) => setNewProduct(prev => ({ ...prev, name: e.target.value }))} className="mt-1 w-full px-4 py-3 border border-slate-200 rounded-xl text-sm" />
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Model *</label>
              <input value={newProduct.model} onChange={(e) => setNewProduct(prev => ({ ...prev, model: e.target.value }))} className="mt-1 w-full px-4 py-3 border border-slate-200 rounded-xl text-sm" />
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Status</label>
              <select value={newProduct.status} onChange={(e) => setNewProduct(prev => ({ ...prev, status: e.target.value }))} className="mt-1 w-full px-4 py-3 border border-slate-200 rounded-xl text-sm">
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Category</label>
              <input list="quick-add-categories" value={newProduct.category} onChange={(e) => setNewProduct(prev => ({ ...prev, category: e.target.value }))} className="mt-1 w-full px-4 py-3 border border-slate-200 rounded-xl text-sm" placeholder="e.g. CCTV" />
              <datalist id="quick-add-categories">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Supplier</label>
              <input list="quick-add-suppliers" value={newProduct.supplier} onChange={(e) => setNewProduct(prev => ({ ...prev, supplier: e.target.value }))} className="mt-1 w-full px-4 py-3 border border-slate-200 rounded-xl text-sm" placeholder="e.g. EDWARDS" />
              <datalist id="quick-add-suppliers">
                {suppliers.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div className="md:col-span-2">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Price (PHP) *</label>
              <input type="number" min={0} step="0.01" value={newProduct.price} onChange={(e) => setNewProduct(prev => ({ ...prev, price: e.target.value }))} className="mt-1 w-full px-4 py-3 border border-slate-200 rounded-xl text-sm" />
            </div>
            {createError && <p className="md:col-span-2 text-xs font-bold text-red-600">{createError}</p>}
          </div>
          <div className="px-6 pb-6 flex gap-3">
            <button onClick={handleSubmitCreate} disabled={isCreating} className="px-5 py-3 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-500 disabled:opacity-60">
              {isCreating ? 'Adding...' : 'Add product'}
            </button>
            <button onClick={() => setIsCreateOpen(false)} className="px-5 py-3 rounded-xl text-sm font-black text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
});

export default ProductList;
