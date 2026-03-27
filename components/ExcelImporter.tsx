import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

interface ImportedItem {
  model?: string;
  name?: string;
  quantity: number;
  price?: number;
  brand?: string;
  category?: string;
  description?: string;
}

interface Props {
  onImport: (items: ImportedItem[], file: File) => void;
  onImageUpload: (file: File) => void;
  isProcessing?: boolean;
}

const ExcelImporter: React.FC<Props> = ({ onImport, onImageUpload, isProcessing = false }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [pendingItems, setPendingItems] = useState<ImportedItem[] | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (file.name.match(/\.(xls|xlsx)$/i)) {
      // Handle Excel File
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          let allExtractedItems: ImportedItem[] = [];

          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
            
            // Derive brand from sheet name (fallback)
            let sheetBrand = '';
            const isGenericSheet = /^Sheet\d+$/i.test(sheetName || '');
            if (!isGenericSheet) {
              const parts = sheetName.split('_');
              sheetBrand = parts.length >= 2 ? parts.slice(1).join(' ').toUpperCase() : sheetName.toUpperCase();
            }

            // Find the header row (the one containing "MODEL" or "ITEM DESCRIPTION")
            let headerRowIndex = -1;
            for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
              const row = rawRows[i];
              if (row && row.some(cell => {
                const c = String(cell).toLowerCase();
                return c === 'model' || c.includes('item description') || c === 'brand' || c.includes('part number') || c.includes('item code');
              })) {
                headerRowIndex = i;
                break;
              }
            }

            if (headerRowIndex !== -1) {
              const headers = rawRows[headerRowIndex].map(h => String(h).toLowerCase().trim());
              const dataRows = rawRows.slice(headerRowIndex + 1);

              const sheetItems = dataRows.map(row => {
                if (!row || row.length === 0) return null;

                const getVal = (terms: string[]) => {
                  for (const term of terms) {
                    const idx = headers.findIndex(h => h.includes(term));
                    if (idx !== -1) return row[idx];
                  }
                  return undefined;
                };

                const model = getVal(['model', 'code', 'part number', 'item code']);
                const name = getVal(['item description', 'name', 'description', 'item name']);
                const brand = getVal(['brand']) || sheetBrand;
                const category = getVal(['category', 'cat']);
                const type = getVal(['type', 'specifications']);
                const price = getVal(['updated price', 'base cost', 'cost', 'srp', 'unit price', 'price']);
                const qty = getVal(['qty', 'quantity', 'amount']);

                if ((model && String(model).trim() !== '') || (name && String(name).trim() !== '') || (brand && String(brand).trim() !== '')) {
                  const qtyValue = qty ? parseFloat(String(qty).replace(/[^\d.]/g, '')) : 1;
                  const priceValue = price ? parseFloat(String(price).replace(/[^\d.]/g, '')) : undefined;
                  
                  return {
                    model: model ? String(model).trim() : undefined,
                    name: name ? String(name).trim() : undefined,
                    brand: brand ? String(brand).trim() : undefined,
                    category: category ? String(category).trim() : undefined,
                    description: type ? `Type: ${type}` : undefined,
                    quantity: isNaN(qtyValue) ? 1 : qtyValue,
                    price: isNaN(priceValue as number) ? undefined : priceValue
                  };
                }
                return null;
              }).filter(item => item !== null) as ImportedItem[];

              allExtractedItems = [...allExtractedItems, ...sheetItems];
            } else {
              // Fallback to previous logic if no clear header row found
              const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as any[];
              const sheetItems = jsonData.map(row => {
                const keys = Object.keys(row);
                const findKey = (keywords: string[]) => {
                  for (const kw of keywords) {
                    const key = keys.find(k => k.toLowerCase().includes(kw.toLowerCase()));
                    if (key) return key;
                  }
                  return undefined;
                };

                const modelKey = findKey(['model', 'item', 'code', 'part number', 'item code']);
                const nameKey = findKey(['name', 'description', 'item description']);
                const qtyKey = findKey(['qty', 'quantity', 'amount']);
                const brandKey = findKey(['brand']);
                const priceKey = findKey(['updated price', 'base cost', 'cost', 'srp', 'price']);
                
                if ((modelKey && row[modelKey]) || (nameKey && row[nameKey]) || (brandKey && row[brandKey])) {
                  return {
                    model: modelKey ? String(row[modelKey]).trim() : undefined,
                    name: nameKey ? String(row[nameKey]).trim() : undefined,
                    brand: (brandKey ? String(row[brandKey]).trim() : '') || sheetBrand,
                    price: priceKey ? parseFloat(String(row[priceKey]).replace(/[^\d.]/g, '')) || undefined : undefined,
                    quantity: qtyKey ? parseFloat(String(row[qtyKey]).replace(/[^\d.]/g, '')) || 1 : 1
                  };
                }
                return null;
              }).filter(item => item !== null) as ImportedItem[];
              allExtractedItems = [...allExtractedItems, ...sheetItems];
            }
          });

          if (allExtractedItems.length > 0) {
            setPendingItems(allExtractedItems);
            setPendingFile(file);
          } else {
            // If no items found with headers, try a more aggressive approach (no headers)
            // This handles cases where the first row isn't headers
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
            
            // Just take rows that look like they have data (at least 2 columns)
            const fallbackItems: ImportedItem[] = rawData
              .filter(row => row && row.length >= 2 && row[0])
              .map(row => {
                const qtyVal = parseFloat(String(row[1]).replace(/[^\d.]/g, ''));
                return {
                  model: String(row[0]).trim(),
                  quantity: isNaN(qtyVal) ? 1 : qtyVal
                };
              })
              .filter(item => item.model.length > 2 && item.model.toLowerCase() !== 'model' && item.model.toLowerCase() !== 'item'); // Avoid noise and headers

            if (fallbackItems.length > 0) {
              setPendingItems(fallbackItems);
              setPendingFile(file);
            }
          }
        } catch (err) {
          console.error("Excel processing error:", err);
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (file.type.startsWith('image/')) {
      // Handle Image File
      onImageUpload(file);
    }
  };

  const handleAccept = () => {
    if (pendingItems && pendingFile) {
      try {
        onImport(pendingItems, pendingFile);
        setPendingItems(null);
        setPendingFile(null);
      } catch (err) {
        console.error("Import error:", err);
        // Even if it fails, we might want to clear or show an error
        // For now, just clearing to prevent the UI from being stuck
        setPendingItems(null);
        setPendingFile(null);
      }
    }
  };

  const handleDecline = () => {
    setPendingItems(null);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isProcessing || pendingItems) return;

    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {!pendingItems ? (
        <div 
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`relative group bg-white border-2 border-dashed rounded-[2rem] p-8 text-center transition-all cursor-pointer overflow-hidden ${
            isDragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
          } ${isProcessing ? 'opacity-70 pointer-events-none' : ''}`}
          onClick={() => !isProcessing && fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".xls,.xlsx,image/*" 
            onChange={handleFileChange} 
          />
          
          <div className="flex flex-col items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${
              isDragging ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-600'
            }`}>
              {isProcessing ? (
                <svg className="w-8 h-8 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              ) : (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 17v-2a2 2 0 00-2-2H5a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              )}
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 leading-tight">Smart Import</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Drop Excel or Images here</p>
            </div>
            <p className="text-[10px] text-slate-400 max-w-[250px]">
              Upload <strong>.xlsx</strong> for direct entry or <strong>Images</strong> (Bill of Materials/Purchase Orders) for AI scanning.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-xl animate-in zoom-in-95 duration-300">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-black text-slate-900">Import Preview</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Found {pendingItems.length} items in {pendingFile?.name}</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleDecline}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                Decline
              </button>
              <button 
                onClick={handleAccept}
                className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all"
              >
                Accept All
              </button>
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto border border-slate-100 rounded-2xl custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 z-10">
                <tr>
                  <th className="px-4 py-3">Brand</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pendingItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-[10px] font-black text-indigo-600">{item.brand || '-'}</td>
                    <td className="px-4 py-3 text-[10px] font-bold text-slate-500">{item.model || '-'}</td>
                    <td className="px-4 py-3 text-[10px] font-bold text-slate-800 truncate max-w-[200px]">{item.name || item.description || '-'}</td>
                    <td className="px-4 py-3 text-[10px] font-black text-slate-900 text-right">{item.price ? `₱${item.price.toLocaleString()}` : '-'}</td>
                    <td className="px-4 py-3 text-[10px] font-black text-slate-900 text-right">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExcelImporter;