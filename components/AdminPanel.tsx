
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Product, AdminLog, QuotationRecord, SystemBackup, PDFTemplate } from '../types';
import { Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { deriveTierPricesFromBasePrice, END_USER_MARKUP, roundMoney } from '../services/pricing';
import { getPdfHeaderLines } from '../utils/pdfHeaderLines';

interface Props {
  currentProducts: Product[];
  adminLogs: AdminLog[];
  currentPipeline: QuotationRecord[];
  pdfTemplate: PDFTemplate;
  onUpdateCatalog: (newProducts: Product[], logDetails?: { type: AdminLog['type'], details: string }) => void;
  onUpdateTemplate: (template: PDFTemplate) => void;
  onReset: () => void;
  onImportBackup: (backup: SystemBackup) => void;
}

// Visual mapping for brands
const BRAND_META: Record<string, { icon: React.ReactNode, color: string, bg: string }> = {
  'EDWARDS': { 
    icon: <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
    color: 'text-red-600',
    bg: 'bg-red-50'
  },
  'SIMPLEX': { 
    icon: <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
    color: 'text-blue-600',
    bg: 'bg-blue-50'
  },
  'PANASONIC': { 
    icon: <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50'
  },
  'ASPEX': { 
    icon: <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50'
  },
  'NOTIFIER': { 
    icon: <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    color: 'text-orange-600',
    bg: 'bg-orange-50'
  },
  'HONEYWELL': { 
    icon: <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>,
    color: 'text-red-700',
    bg: 'bg-red-50'
  }
};

const DEFAULT_META = {
  icon: <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  color: 'text-slate-400',
  bg: 'bg-slate-50'
};

const AdminPanel: React.FC<Props> = React.memo(({ currentProducts, adminLogs, currentPipeline, pdfTemplate, onUpdateCatalog, onUpdateTemplate, onReset, onImportBackup }) => {
  const [activeSubTab, setActiveSubTab] = useState<'catalog' | 'template'>('catalog');
  const [pasteData, setPasteData] = useState('');
  // Sheet management states
  const [parsedPreview, setParsedPreview] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const headerImageInputRef = useRef<HTMLInputElement>(null);
  const adsBannerInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const authorizedSignatureInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedBrand && !currentProducts.some(p => (p.brand?.toUpperCase() || 'OTHER') === selectedBrand)) {
      setSelectedBrand(null);
    }
  }, [currentProducts, selectedBrand]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        handleUpdateTemplateField('companyInfo.logoUrl', base64);
        if (!pdfTemplate.companyInfo.logoWidth) {
          handleUpdateTemplateField('companyInfo.logoWidth', 200);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Logo upload failed", err);
    }
  };

  const handleHeaderImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        handleUpdateTemplateField('companyInfo.headerImage', {
          url: base64,
          width: 800, // Default width
          height: 100, // Default height
          xOffset: 0,
          yOffset: 0
        });
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Header image upload failed", err);
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        handleUpdateTemplateField('signatories.preparedBy.signatureUrl', base64);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Signature upload failed", err);
    }
  };

  const handleAdsBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        handleUpdateTemplateField('adsBannerUrl', base64);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Ads banner upload failed", err);
    }
  };

  const handleAuthorizedSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        handleUpdateTemplateField('signatories.authorizedRepresentative.signatureUrl', base64);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Authorized signature upload failed", err);
    }
  };

  const handleUpdateStyleField = (field: string, value: any) => {
    const currentStyle = pdfTemplate.companyInfo.companyNameStyle || {
      fontSize: 16,
      color: "#004a8d",
      fontWeight: "900",
      fontFamily: "Inter",
      italic: true
    };
    const newStyle = { ...currentStyle, [field]: value };
    handleUpdateTemplateField('companyInfo.companyNameStyle', newStyle);
  };

  const groupedProducts = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    const filtered = currentProducts.filter(p => 
      p.model.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      p.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      (p.brand && p.brand.toLowerCase().includes(catalogSearch.toLowerCase())) ||
      (p.category && p.category.toLowerCase().includes(catalogSearch.toLowerCase()))
    );

    filtered.forEach(p => {
      const brand = p.brand?.toUpperCase() || 'OTHER';
      if (!groups[brand]) groups[brand] = [];
      groups[brand].push(p);
    });
    return groups;
  }, [currentProducts, catalogSearch]);

  const brands = useMemo(() => Object.keys(groupedProducts).sort(), [groupedProducts]);

  const handleExportBackup = () => {
    const backup: SystemBackup = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      catalog: currentProducts,
      pipeline: currentPipeline,
      logs: adminLogs
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `AA2000_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("This will overwrite your entire current catalog, pipeline, and logs. Proceed?")) {
      if (backupInputRef.current) backupInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const backup = JSON.parse(text) as SystemBackup;
        onImportBackup(backup);
      } catch (err: any) {
        alert(`Restore failed: ${err.message}`);
      } finally {
        if (backupInputRef.current) backupInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const processRowData = (data: any[], startIndex: number = 0, sheetName?: string, headers?: string[]): Product[] => {
    const batchId = Date.now();
    
    // Derive default brand/category from sheet name (e.g., FDAS_EDWARDS -> Category: FDAS, Brand: EDWARDS)
    let sheetCategory = '';
    let sheetBrand = '';
    
    if (sheetName) {
      const parts = sheetName.split('_');
      if (parts.length >= 2) {
        sheetCategory = parts[0].toUpperCase();
        sheetBrand = parts.slice(1).join(' ').toUpperCase();
      } else {
        sheetBrand = sheetName.toUpperCase();
        // If no underscore, use sheet name as category too for better organization
        sheetCategory = sheetName.toUpperCase();
      }
    }

    return data.map((row: any, index: number) => {
      let model = '';
      let name = '';
      let description = '';
      let price = 0;
      let baseCost = 0;
      let dealerPrice = 0;
      let contractorPrice = 0;
      let endUserPrice = 0;
      let dealerBigVolumePrice = 0;
      let contractorBigVolumePrice = 0;
      let endUserBigVolumePrice = 0;
      let category = '';
      let brand = '';

      if (Array.isArray(row) && headers) {
        const getVal = (terms: string[]) => {
          for (const term of terms) {
            const idx = headers.findIndex(h => h.includes(term));
            if (idx !== -1) return row[idx];
          }
          return undefined;
        };

        model = String(getVal(['model', 'item code', 'code', 'part number']) || '').trim();
        name = String(getVal(['item description', 'description', 'item name', 'name']) || '').trim();
        const otherDesc = String(getVal(['other description', 'specifications', 'remarks']) || '').trim();
        brand = String(getVal(['brand']) || '').trim();
        category = String(getVal(['category', 'cat']) || '').trim();
        
        description = brand ? `Brand: ${brand}. ${otherDesc}` : otherDesc;
        
        const costStr = String(getVal(['updated price', 'base cost', 'purchase amount', 'cost', 'unit cost']) || '0').replace(/[^\d.]/g, '');
        baseCost = parseFloat(costStr) || 0;

        const endUserParsed = parseFloat(String(getVal(['end user', 'end-user', 'srp', 'small volume', 'selling price']) || '0').replace(/[^\d.]/g, '')) || 0;
        if (baseCost <= 0 && endUserParsed > 0) {
          baseCost = roundMoney(endUserParsed / END_USER_MARKUP);
        }

        const tier = deriveTierPricesFromBasePrice(baseCost);
        price = tier.endUserPrice;
        dealerPrice = tier.dealerPrice;
        dealerBigVolumePrice = tier.dealerBigVolumePrice;
        contractorPrice = tier.contractorPrice;
        contractorBigVolumePrice = tier.contractorBigVolumePrice;
        endUserPrice = tier.endUserPrice;
        endUserBigVolumePrice = tier.endUserBigVolumePrice;
      } else if (!Array.isArray(row)) {
        const keys = Object.keys(row);
        const findKey = (keywords: string[]) => {
          for (const kw of keywords) {
            const key = keys.find(k => k.toLowerCase().trim().includes(kw.toLowerCase()));
            if (key) return key;
          }
          return undefined;
        };

        const categoryKey = findKey(['category', 'cat']);
        const brandKey = findKey(['brand']);
        const modelKey = findKey(['model', 'item code', 'code', 'part number']);
        const nameKey = findKey(['item description', 'description', 'item name', 'name']);
        const otherDescKey = findKey(['other description', 'specifications', 'remarks']);
        const costKey = findKey(['updated price', 'base cost', 'purchase amount', 'cost', 'unit cost']);
        const endUserPriceKey = findKey(['end user', 'end-user', 'srp', 'small volume', 'selling price']);
        
        category = String(row[categoryKey || ''] || '').trim();
        brand = String(row[brandKey || ''] || '').trim();
        model = String(row[modelKey || ''] || '').trim();
        name = String(row[nameKey || ''] || '').trim();
        const otherDesc = String(row[otherDescKey || ''] || '').trim();
        description = brand ? `Brand: ${brand}. ${otherDesc}` : otherDesc;
        
        const costStr = String(row[costKey || ''] || '0').replace(/[^\d.]/g, '');
        baseCost = parseFloat(costStr) || 0;

        const endUserParsed = parseFloat(String(row[endUserPriceKey || ''] || '0').replace(/[^\d.]/g, '')) || 0;
        if (baseCost <= 0 && endUserParsed > 0) {
          baseCost = roundMoney(endUserParsed / END_USER_MARKUP);
        }

        const tier = deriveTierPricesFromBasePrice(baseCost);
        price = tier.endUserPrice;
        dealerPrice = tier.dealerPrice;
        dealerBigVolumePrice = tier.dealerBigVolumePrice;
        contractorPrice = tier.contractorPrice;
        contractorBigVolumePrice = tier.contractorBigVolumePrice;
        endUserPrice = tier.endUserPrice;
        endUserBigVolumePrice = tier.endUserBigVolumePrice;
      } else {
        // Simple array fallback
        model = row[2]?.trim() || row[0]?.trim() || '';
        name = row[3]?.trim() || row[1]?.trim() || '';
        description = row[4]?.trim() || '';
        const priceStr = row[7]?.toString().replace(/[^\d.]/g, '') || '0';
        baseCost = parseFloat(priceStr) || 0;
        const tierSimple = deriveTierPricesFromBasePrice(baseCost);
        price = tierSimple.endUserPrice;
        dealerPrice = tierSimple.dealerPrice;
        dealerBigVolumePrice = tierSimple.dealerBigVolumePrice;
        contractorPrice = tierSimple.contractorPrice;
        contractorBigVolumePrice = tierSimple.contractorBigVolumePrice;
        endUserPrice = tierSimple.endUserPrice;
        endUserBigVolumePrice = tierSimple.endUserBigVolumePrice;
        category = row[0]?.trim() || '';
      }

      // Prioritize brand from column. If empty, use sheet-derived brand (unless generic)
      const isGenericSheet = /^Sheet\d+$/i.test(sheetName || '');
      if (!brand && sheetBrand && !isGenericSheet) {
        brand = sheetBrand;
      }

      // Sheet name takes precedence for category if row is missing it or it's default
      if ((!category || category === '') && sheetCategory && !isGenericSheet) {
        category = sheetCategory;
      }

      if (!name && model) name = model;

      return {
        id: batchId + index + startIndex,
        model,
        name,
        description,
        brand: brand.toUpperCase() || 'OTHER',
        baseCost: baseCost,
        price: price,
        category: category.toUpperCase(),
        dealerPrice: dealerPrice,
        contractorPrice: contractorPrice,
        endUserPrice: endUserPrice,
        dealerBigVolumePrice,
        contractorBigVolumePrice,
        endUserBigVolumePrice
      };
    }).filter(p => (p.model || p.name || p.brand));
  };

  const handleParseText = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!pasteData.trim()) return;
    try {
      const rows = pasteData.trim().split('\n').map(row => 
        row.includes('\t') ? row.split('\t') : row.split(',')
      );
      setParsedPreview(processRowData(rows));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        
        let allNewProducts: Product[] = [];
        let startIdx = 0;
        
        wb.SheetNames.forEach(name => {
          const worksheet = wb.Sheets[name];
          const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          // Find the header row (the one containing "MODEL" or "ITEM DESCRIPTION")
          let headerRowIndex = -1;
          for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
            const row = rawRows[i];
            if (row && row.some(cell => {
              const c = String(cell).toLowerCase();
              return c === 'model' || c.includes('item description') || c === 'brand';
            })) {
              headerRowIndex = i;
              break;
            }
          }

          let products: Product[] = [];
          if (headerRowIndex !== -1) {
            const headers = rawRows[headerRowIndex].map(h => String(h).toLowerCase().trim());
            const dataRows = rawRows.slice(headerRowIndex + 1);
            products = processRowData(dataRows, startIdx, name, headers);
          } else {
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as any[];
            products = processRowData(jsonData, startIdx, name);
          }

          allNewProducts = [...allNewProducts, ...products];
          startIdx += products.length;
        });

        if (allNewProducts.length > 0) {
          setParsedPreview(allNewProducts);
        } else {
          setError("No valid products found in the uploaded file.");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleApply = (e: React.MouseEvent) => {
    e.preventDefault();
    if (parsedPreview.length > 0) {
      onUpdateCatalog([...currentProducts, ...parsedPreview], { 
        type: 'IMPORT', 
        details: `Imported ${parsedPreview.length} items from Excel file.` 
      });
      setPasteData('');
      setParsedPreview([]);
    }
  };

  const handleDecline = (e: React.MouseEvent) => {
    e.preventDefault();
    setParsedPreview([]);
    setPasteData('');
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpdateTemplateField = (path: string, value: any) => {
    const newTemplate = { ...pdfTemplate };
    const keys = path.split('.');
    let current: any = newTemplate;
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    onUpdateTemplate(newTemplate);
  };

  const handleUpdateListItem = (listKey: 'notesAndRemarks' | 'warrantyPeriod' | 'availability', index: number, value: string) => {
    const newList = [...pdfTemplate[listKey]];
    newList[index] = value;
    handleUpdateTemplateField(listKey, newList);
  };

  const handleAddListItem = (listKey: 'notesAndRemarks' | 'warrantyPeriod' | 'availability') => {
    handleUpdateTemplateField(listKey, [...pdfTemplate[listKey], '']);
  };

  const handleRemoveListItem = (listKey: 'notesAndRemarks' | 'warrantyPeriod' | 'availability', index: number) => {
    handleUpdateTemplateField(listKey, pdfTemplate[listKey].filter((_, i) => i !== index));
  };

  const handleUpdateTerm = (index: number, field: 'key' | 'value', value: string) => {
    const newTerms = [...pdfTemplate.termsAndConditions];
    newTerms[index] = { ...newTerms[index], [field]: value };
    handleUpdateTemplateField('termsAndConditions', newTerms);
  };

  return (
    <>
      {/* Custom Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mb-6 mx-auto">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h3 className="text-xl font-black text-slate-900 text-center mb-2 uppercase tracking-tight">Confirm Deletion</h3>
            <p className="text-slate-500 text-center text-sm font-medium mb-8">
              Are you sure you want to delete all <span className="text-red-600 font-bold">{selectedBrand}</span> products? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  const newProducts = currentProducts.filter(p => (p.brand?.toUpperCase() || 'OTHER') !== selectedBrand);
                  onUpdateCatalog(newProducts, {
                    type: 'DELETE',
                    details: `Deleted entire brand: ${selectedBrand}`
                  });
                  setSelectedBrand(null);
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-200"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Factory Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mb-6 mx-auto">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </div>
            <h3 className="text-xl font-black text-slate-900 text-center mb-2 uppercase tracking-tight">Factory Reset</h3>
            <p className="text-slate-500 text-center text-sm font-medium mb-8">
              Are you sure you want to perform a factory reset? This will remove all products, quotations, and system logs. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  onReset();
                  setShowResetConfirm(false);
                }}
                className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-200"
              >
                Yes, Reset All
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-0">
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={() => setActiveSubTab('catalog')}
          className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'catalog' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-200'}`}
        >
          Catalog Management
        </button>
        <button 
          onClick={() => setActiveSubTab('template')}
          className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'template' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-200'}`}
        >
          PDF Template Editor
        </button>
      </div>

      {activeSubTab === 'catalog' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ... existing catalog management code ... */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm relative z-10">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-xl font-black text-slate-900">Import Center</h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Populate your master database</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setIsLogOpen(true)} className="px-4 py-2 text-[10px] font-black uppercase text-indigo-600 border border-indigo-100 rounded-xl hover:bg-indigo-50 transition-all flex items-center gap-2">Activity Log</button>
                  <button onClick={() => setShowResetConfirm(true)} className="px-4 py-2 text-[10px] font-black uppercase text-red-500 border border-red-100 rounded-xl hover:bg-red-50 transition-all">Factory Reset</button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 mb-8">
                <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center p-12 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl hover:border-indigo-400 hover:bg-indigo-50 transition-all group">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-indigo-600 shadow-sm mb-4">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  </div>
                  <span className="text-sm font-black text-slate-900 uppercase tracking-widest">Upload Excel Workbook</span>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">All sheets will be processed automatically</p>
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".xls,.xlsx" />
                </button>
              </div>

              <div className="relative">
                <textarea
                  value={pasteData}
                  onChange={(e) => setPasteData(e.target.value)}
                  placeholder="Paste row data from Excel here..."
                  className="w-full h-32 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] p-6 font-mono text-[10px] focus:border-indigo-500 outline-none transition-all resize-none"
                />
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={handleParseText}
                  className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 transition-all disabled:opacity-50"
                  disabled={!pasteData.trim() || isProcessing}
                >
                  Analyze Paste Data
                </button>
                {parsedPreview.length > 0 && (
                  <>
                    <button 
                      onClick={handleApply}
                      className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-500 transition-all shadow-lg"
                    >
                      Accept & Import ({parsedPreview.length} Items)
                    </button>
                    <button 
                      onClick={handleDecline}
                      className="flex-1 py-4 bg-red-50 text-red-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-red-100 transition-all"
                    >
                      Decline
                    </button>
                  </>
                )}
              </div>

              {error && <div className="mt-4 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-[10px] font-bold">{error}</div>}
            </div>

            {parsedPreview.length > 0 && (
              <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm animate-in slide-in-from-bottom-4">
                 <div className="flex items-center justify-between mb-6">
                   <div>
                     <h3 className="text-xl font-black text-slate-900">Import Preview</h3>
                     <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Review the items below before confirming import</p>
                   </div>
                 </div>
                 <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                   <table className="w-full text-left border-collapse">
                     <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                       <tr>
                         <th className="px-4 py-3">Brand</th>
                          <th className="px-4 py-3">Model</th>
                         <th className="px-4 py-3">Item Description</th>
                         <th className="px-4 py-3">Updated Price</th>
                         <th className="px-4 py-3">Dealer (SV/BV)</th>
                         <th className="px-4 py-3">Contractor (SV/BV)</th>
                         <th className="px-4 py-3">End User (SV/BV)</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-50">
                       {parsedPreview.map((p, idx) => {
                         const t = deriveTierPricesFromBasePrice(p.baseCost);
                         return (
                         <tr key={idx} className="hover:bg-slate-50 transition-colors">
                           <td className="px-4 py-3 text-[10px] font-black text-indigo-600">{p.brand}</td>
                           <td className="px-4 py-3 text-[10px] font-bold text-slate-500">{p.model || '-'}</td>
                           <td className="px-4 py-3 text-[10px] font-bold text-slate-800 truncate max-w-[150px]">{p.name}</td>
                           <td className="px-4 py-3 text-[10px] font-black text-slate-900">₱{p.baseCost.toLocaleString()}</td>
                           <td className="px-4 py-3 text-[9px] font-bold text-slate-500">
                             ₱{t.dealerPrice.toLocaleString()} / <span className="text-emerald-600">₱{t.dealerBigVolumePrice.toLocaleString()}</span>
                           </td>
                           <td className="px-4 py-3 text-[9px] font-bold text-slate-500">
                             ₱{t.contractorPrice.toLocaleString()} / <span className="text-emerald-600">₱{t.contractorBigVolumePrice.toLocaleString()}</span>
                           </td>
                           <td className="px-4 py-3 text-[9px] font-bold text-slate-500">
                             ₱{t.endUserPrice.toLocaleString()} / <span className="text-emerald-600">₱{t.endUserBigVolumePrice.toLocaleString()}</span>
                           </td>
                         </tr>
                         );
                       })}
                     </tbody>
                   </table>
                 </div>
              </div>
            )}

            <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm min-h-[500px]">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                  {selectedBrand && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSelectedBrand(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-all">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                      </button>
                      <button 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowDeleteConfirm(true);
                        }}
                        className="px-3 py-1 bg-red-50 text-red-600 border border-red-100 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-red-100 transition-all"
                      >
                        Delete Brand
                      </button>
                    </div>
                  )}
                  <h2 className="text-xl font-black text-slate-900">{selectedBrand ? `${selectedBrand} BRAND` : 'Catalog Browser'}</h2>
                </div>
                <input type="text" placeholder="Search catalog..." value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} className="w-full md:w-64 pl-4 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none" />
              </div>

              {!selectedBrand ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 animate-in zoom-in-95">
                  {brands.map(brand => {
                    const meta = BRAND_META[brand] || DEFAULT_META;
                    return (
                      <button key={brand} onClick={() => setSelectedBrand(brand)} className="group relative flex flex-col items-center p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 hover:border-indigo-400 hover:bg-white hover:shadow-xl transition-all text-center overflow-hidden">
                        <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${meta.bg} ${meta.color}`}>{meta.icon}</div>
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">{brand}</h3>
                        <p className="text-[9px] font-bold text-slate-300 mt-2">{groupedProducts[brand].length} Items</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {groupedProducts[selectedBrand]?.map(p => {
                    const t = deriveTierPricesFromBasePrice(p.baseCost);
                    return (
                    <div key={p.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-white transition-all group relative">
                      <button onClick={() => onUpdateCatalog(currentProducts.filter(x => x.id !== p.id), { type: 'DELETE', details: `Deleted: ${p.model}` })} className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-indigo-600 uppercase">{p.brand}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{p.model || 'No Model'}</p>
                      </div>
                      <p className="text-sm font-black text-slate-800 mb-1">{p.name}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[9px] font-black px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded uppercase">{p.category}</span>
                        <div className="text-right">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Base</p>
                          <p className="text-[11px] font-black text-slate-900">₱{p.baseCost.toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100">
                        <div className="text-center">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Dealer</p>
                          <p className="text-[10px] font-bold text-slate-600">₱{t.dealerPrice.toLocaleString()}</p>
                          <p className="text-[8px] font-bold text-emerald-600">BV: ₱{t.dealerBigVolumePrice.toLocaleString()}</p>
                        </div>
                        <div className="text-center border-x border-slate-100">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Contractor</p>
                          <p className="text-[10px] font-bold text-slate-600">₱{t.contractorPrice.toLocaleString()}</p>
                          <p className="text-[8px] font-bold text-emerald-600">BV: ₱{t.contractorBigVolumePrice.toLocaleString()}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[8px] font-black text-slate-400 uppercase">End User</p>
                          <p className="text-[10px] font-bold text-slate-600">₱{t.endUserPrice.toLocaleString()}</p>
                          <p className="text-[8px] font-bold text-emerald-600">BV: ₱{t.endUserBigVolumePrice.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900 rounded-[2rem] p-8 text-white shadow-xl">
              <h3 className="text-lg font-black mb-6">Database Stats</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-white/10 pb-2">
                  <span className="text-[10px] font-black uppercase opacity-60">Total Items</span>
                  <span className="text-2xl font-black">{currentProducts.length}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Maintenance</h3>
              <div className="space-y-3">
                <button onClick={handleExportBackup} className="w-full flex items-center justify-between p-4 bg-indigo-50 border border-indigo-100 rounded-2xl transition-all">
                  <span className="text-[10px] font-black text-indigo-600 uppercase">Export Backup</span>
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                </button>
                <button onClick={() => backupInputRef.current?.click()} className="w-full flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-2xl transition-all">
                  <span className="text-[10px] font-black text-slate-600 uppercase">Restore Backup</span>
                  <input type="file" ref={backupInputRef} onChange={handleImportBackupFile} className="hidden" accept=".json" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-100 rounded-[2.5rem] p-4 md:p-12 border border-slate-200 shadow-inner animate-in slide-in-from-bottom-4 min-h-screen">
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row items-start justify-between mb-8 px-4 gap-8">
              <div className="flex-1">
                <h2 className="text-4xl font-black text-slate-900 leading-tight">PDF Template Editor</h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2 max-w-xs">Live visual editor for your quotation format</p>
              </div>
              
              <div className="flex flex-col gap-4 w-full md:w-auto">
                <input type="file" ref={logoInputRef} onChange={handleLogoUpload} className="hidden" accept="image/*" />
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Name Styling Controls */}
                  <div className="flex items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl px-6 py-3 shadow-sm">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Company Name</span>
                    <div className="flex items-center gap-3">
                      <input 
                        type="color" 
                        value={pdfTemplate.companyInfo.companyNameStyle?.color || '#004a8d'}
                        onChange={(e) => handleUpdateStyleField('color', e.target.value)}
                        className="w-6 h-6 rounded cursor-pointer border-none p-0"
                      />
                      <input 
                        type="number" 
                        min="10" 
                        max="72" 
                        value={pdfTemplate.companyInfo.companyNameStyle?.fontSize || 32}
                        onChange={(e) => handleUpdateStyleField('fontSize', parseInt(e.target.value))}
                        className="w-12 bg-slate-50 border border-slate-200 rounded px-1 text-[10px] font-bold text-center py-1"
                      />
                      <button 
                        onClick={() => handleUpdateStyleField('italic', !pdfTemplate.companyInfo.companyNameStyle?.italic)}
                        className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${pdfTemplate.companyInfo.companyNameStyle?.italic ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}
                      >
                        Italic
                      </button>
                    </div>
                  </div>

                  {/* Signature Controls */}
                  <div className="flex items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl px-6 py-3 shadow-sm">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">E-Signature</span>
                    <div className="flex items-center gap-2">
                      <input type="file" ref={signatureInputRef} onChange={handleSignatureUpload} className="hidden" accept="image/*" />
                      <button 
                        onClick={() => signatureInputRef.current?.click()}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                      >
                        {pdfTemplate.signatories.preparedBy.signatureUrl ? 'Change' : 'Upload'}
                      </button>
                      {pdfTemplate.signatories.preparedBy.signatureUrl && (
                        <button 
                          onClick={() => handleUpdateTemplateField('signatories.preparedBy.signatureUrl', undefined)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Ads Banner Controls */}
                  <div className="flex items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl px-6 py-3 shadow-sm">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ads Banner</span>
                    <div className="flex items-center gap-2">
                      <input type="file" ref={adsBannerInputRef} onChange={handleAdsBannerUpload} className="hidden" accept="image/*" />
                      <button 
                        onClick={() => adsBannerInputRef.current?.click()}
                        className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                      >
                        {pdfTemplate.adsBannerUrl ? 'Change Ads' : 'Upload Ads'}
                      </button>
                      {pdfTemplate.adsBannerUrl && (
                        <button 
                          onClick={() => handleUpdateTemplateField('adsBannerUrl', undefined)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Header Image Upload */}
                  <div className="flex items-center">
                    <input type="file" ref={headerImageInputRef} onChange={handleHeaderImageUpload} className="hidden" accept="image/*" />
                    <button 
                      onClick={() => headerImageInputRef.current?.click()}
                      className="w-full px-8 py-4 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-slate-800 transition-all shadow-2xl shadow-slate-300 border border-white/10"
                    >
                      {pdfTemplate.companyInfo.headerImage ? 'Change Header Image' : 'Upload Header Image'}
                    </button>
                  </div>
                </div>

                {/* Logo & Header Advanced Controls (Visible only if active) */}
                {(pdfTemplate.companyInfo.logoUrl || pdfTemplate.companyInfo.headerImage) && (
                  <div className="flex flex-wrap gap-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    {pdfTemplate.companyInfo.logoUrl && (
                      <div className="flex items-center gap-6">
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Logo Size</span>
                          <input type="range" min="50" max="600" value={pdfTemplate.companyInfo.logoWidth || 200} onChange={(e) => handleUpdateTemplateField('companyInfo.logoWidth', parseInt(e.target.value))} className="w-24 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">X-Offset</span>
                          <input type="range" min="-100" max="100" value={pdfTemplate.companyInfo.logoXOffset || 0} onChange={(e) => handleUpdateTemplateField('companyInfo.logoXOffset', parseInt(e.target.value))} className="w-24 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                        </div>
                        <button onClick={() => handleUpdateTemplateField('companyInfo.logoUrl', undefined)} className="p-2 text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                      </div>
                    )}
                    
                    {pdfTemplate.companyInfo.headerImage && (
                      <div className="flex items-center gap-6 border-l border-slate-100 pl-6">
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Header Height</span>
                          <input type="range" min="20" max="400" value={pdfTemplate.companyInfo.headerImage.height} onChange={(e) => handleUpdateTemplateField('companyInfo.headerImage', { ...pdfTemplate.companyInfo.headerImage, height: parseInt(e.target.value) })} className="w-24 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                        </div>
                        <button onClick={() => handleUpdateTemplateField('companyInfo.headerImage', undefined)} className="p-2 text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Visual Editor "Paper" */}
            <div className="bg-white shadow-2xl rounded-sm border border-slate-300 overflow-hidden flex flex-col min-h-[1200px] w-full max-w-[800px] mx-auto">
              
              {/* HEADER MOCKUP (matches PDF preview layout) */}
              <div className="relative bg-white overflow-hidden min-h-[152px] border-b-2 border-black">
                <div className="absolute top-0 left-0 h-full w-[41%] bg-white z-0 pointer-events-none" aria-hidden />
                <div className="absolute top-0 bottom-0 z-[1] pointer-events-none bg-[#031b33] w-[2%] left-[41%]" aria-hidden />
                <div className="absolute top-0 right-0 bottom-0 left-[43%] bg-[#004a8d] z-0 pointer-events-none" aria-hidden />

                <div className="relative z-10 flex w-full min-h-[152px] items-stretch py-2">
                  <div className="flex-[0_0_41%] w-[41%] max-w-[41%] box-border flex flex-col items-center justify-center gap-2 px-3 py-1 text-center">
                    <div
                      onClick={() => logoInputRef.current?.click()}
                      className="group flex w-full min-h-[4.5rem] cursor-pointer items-center justify-center"
                      title="Click to upload logo"
                    >
                      {pdfTemplate.companyInfo.logoUrl ? (
                        <div
                          style={{
                            transform: `translate(${pdfTemplate.companyInfo.logoXOffset || 0}px, ${pdfTemplate.companyInfo.logoYOffset || 0}px)`,
                          }}
                          className="transition-transform duration-200"
                        >
                          <img
                            src={pdfTemplate.companyInfo.logoUrl}
                            alt="Logo"
                            style={{ width: `${pdfTemplate.companyInfo.logoWidth ?? 96}px`, maxWidth: 'min(120px, 85%)' }}
                            className="h-auto object-contain"
                          />
                        </div>
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#004a8d] p-2 shadow-lg transition-colors group-hover:bg-[#003366]">
                          <svg className="h-9 w-9 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                          </svg>
                        </div>
                      )}
                    </div>

                    <div className="flex w-full flex-col items-center gap-1 min-w-0">
                      <input
                        type="text"
                        value={pdfTemplate.companyInfo.brandName ?? ''}
                        onChange={(e) => handleUpdateTemplateField('companyInfo.brandName', e.target.value)}
                        placeholder={getPdfHeaderLines(pdfTemplate.companyInfo).brand}
                        style={{
                          fontSize: `${pdfTemplate.companyInfo.companyNameStyle?.fontSize || 22}pt`,
                          color: pdfTemplate.companyInfo.companyNameStyle?.color || '#004a8d',
                          fontWeight: pdfTemplate.companyInfo.companyNameStyle?.fontWeight || '900',
                          fontFamily: pdfTemplate.companyInfo.companyNameStyle?.fontFamily || 'Inter',
                          fontStyle: pdfTemplate.companyInfo.companyNameStyle?.italic ? 'italic' : 'normal',
                        }}
                        className="w-full bg-transparent border-b border-dashed border-slate-200 hover:border-indigo-300 focus:border-indigo-500 outline-none uppercase leading-none tracking-tight text-center"
                      />
                      <textarea
                        value={pdfTemplate.companyInfo.name}
                        onChange={(e) => handleUpdateTemplateField('companyInfo.name', e.target.value)}
                        className="w-full mt-0.5 bg-slate-50/80 rounded px-1 py-0.5 border border-transparent hover:border-slate-200 focus:border-indigo-400 outline-none text-[7pt] font-bold uppercase text-slate-500 leading-tight text-center resize-none"
                        rows={2}
                        title="Full legal company name"
                      />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-center items-stretch text-center text-white px-5 space-y-0.5 self-center">
                    <textarea 
                      value={pdfTemplate.companyInfo.address} 
                      onChange={(e) => handleUpdateTemplateField('companyInfo.address', e.target.value)}
                      className="w-full bg-transparent border-none outline-none text-[8pt] font-black uppercase text-center resize-none min-h-[3.25rem] leading-[1.25] whitespace-pre-line overflow-hidden"
                    />
                    <div className="flex justify-center items-center gap-1 text-[8pt] font-black uppercase">
                      <span>T:</span>
                      <input type="text" value={pdfTemplate.companyInfo.phone} onChange={(e) => handleUpdateTemplateField('companyInfo.phone', e.target.value)} className="bg-transparent border-none outline-none text-center w-40" />
                      <span className="mx-1">/</span>
                      <span>M:</span>
                      <input type="text" value={pdfTemplate.companyInfo.mobile} onChange={(e) => handleUpdateTemplateField('companyInfo.mobile', e.target.value)} className="bg-transparent border-none outline-none text-center w-32" />
                    </div>
                    <div className="flex justify-center items-center gap-1 text-[8pt] font-black uppercase">
                      <span>E:</span>
                      <input type="text" value={pdfTemplate.companyInfo.email} onChange={(e) => handleUpdateTemplateField('companyInfo.email', e.target.value)} className="w-full bg-transparent border-none outline-none text-center" />
                    </div>
                    <input type="text" value={pdfTemplate.companyInfo.website} onChange={(e) => handleUpdateTemplateField('companyInfo.website', e.target.value)} className="w-full bg-transparent border-none outline-none text-[9pt] font-black text-center underline uppercase tracking-widest" />
                  </div>
                </div>
              </div>

              {/* BODY MOCKUP */}
              <div className="p-8 space-y-6">
                <div className="border-y border-black py-2 grid grid-cols-3 gap-4 text-[8pt] font-black uppercase">
                  <div>VALIDITY: <span className="text-slate-900">15 DAYS</span></div>
                  <div className="text-center">REF: <span className="text-slate-900">PQ-FDAS-XXXX</span></div>
                  <div className="text-right">DATE: <span className="text-slate-900">FEB 05, 2026</span></div>
                </div>

                {/* TABLE MOCKUP */}
                <div className="border border-black">
                  <div className="bg-[#FFFF00] text-center text-black font-black text-[10pt] border-b border-black py-1 uppercase tracking-widest">PRODUCT SALES QUOTATION</div>
                  <div className="h-32 bg-slate-50 flex items-center justify-center text-slate-300 text-[8pt] font-black uppercase italic">Itemized Products Table Area</div>
                </div>

                {/* NOTES SECTION */}
                <div className="border border-black">
                  <div className="bg-[#FFFF00] text-center text-black font-black text-[8pt] border-b border-black py-1 uppercase tracking-widest flex items-center justify-center gap-2">
                    NOTE AND REMARKS
                    <button onClick={() => handleAddListItem('notesAndRemarks')} className="p-1 bg-black text-white rounded hover:bg-slate-800 transition-all">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                    </button>
                  </div>
                  <div className="p-4 space-y-2">
                    {pdfTemplate.notesAndRemarks.map((note, idx) => (
                      <div key={idx} className="flex gap-2 group">
                        <span className="text-[8pt] font-black text-slate-400 w-4">{idx + 1}</span>
                        <textarea 
                          value={note} 
                          onChange={(e) => handleUpdateListItem('notesAndRemarks', idx, e.target.value)}
                          className="flex-1 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 outline-none text-[8pt] font-bold uppercase resize-none whitespace-pre-wrap overflow-hidden"
                          rows={1}
                          onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            target.style.height = target.scrollHeight + 'px';
                          }}
                        />
                        <button onClick={() => handleRemoveListItem('notesAndRemarks', idx)} className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 rounded transition-all">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* TERMS SECTION */}
                <div className="border border-black">
                  <div className="bg-[#003366] text-white text-center font-bold text-[9pt] border-b border-black py-1.5 uppercase tracking-widest">TERMS AND CONDITIONS</div>
                  <div className="p-4 space-y-3">
                    {pdfTemplate.termsAndConditions.map((term, idx) => (
                      <div key={idx} className="flex gap-3">
                        <input 
                          type="text" 
                          value={term.key} 
                          onChange={(e) => handleUpdateTerm(idx, 'key', e.target.value)}
                          className="w-8 h-8 flex items-center justify-center bg-slate-100 border border-slate-200 rounded text-[8pt] font-black text-center outline-none"
                        />
                        <textarea 
                          value={term.value} 
                          onChange={(e) => handleUpdateTerm(idx, 'value', e.target.value)}
                          className="flex-1 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 outline-none text-[8pt] font-bold uppercase resize-none h-12 leading-tight"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* PAYMENT TERMS */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-black">
                    <div className="bg-slate-100 px-3 py-1 border-b border-black text-[8pt] font-black uppercase">Payment Terms</div>
                    <div className="p-3 space-y-2">
                      <div className="flex flex-col">
                        <label className="text-[7pt] font-black text-slate-400 uppercase mb-1">Supply of Devices</label>
                        <input type="text" value={pdfTemplate.paymentTerms.supplyOfDevices} onChange={(e) => handleUpdateTemplateField('paymentTerms.supplyOfDevices', e.target.value)} className="bg-transparent border-b border-slate-200 outline-none text-[8pt] font-bold uppercase" />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[7pt] font-black text-slate-400 uppercase mb-1">Supply of Labor</label>
                        <input type="text" value={pdfTemplate.paymentTerms.supplyOfLabor} onChange={(e) => handleUpdateTemplateField('paymentTerms.supplyOfLabor', e.target.value)} className="bg-transparent border-b border-slate-200 outline-none text-[8pt] font-bold uppercase" />
                      </div>
                    </div>
                  </div>
                  <div className="border border-black">
                    <div className="bg-slate-100 px-3 py-1 border-b border-black text-[8pt] font-black uppercase">Payment Details</div>
                    <div className="p-3 space-y-2">
                      <input type="text" value={pdfTemplate.paymentDetails.bankName} onChange={(e) => handleUpdateTemplateField('paymentDetails.bankName', e.target.value)} placeholder="Bank Name" className="w-full bg-transparent border-b border-slate-200 outline-none text-[8pt] font-bold uppercase" />
                      <input type="text" value={pdfTemplate.paymentDetails.accountNumber} onChange={(e) => handleUpdateTemplateField('paymentDetails.accountNumber', e.target.value)} placeholder="Account Number" className="w-full bg-transparent border-b border-slate-200 outline-none text-[8pt] font-bold uppercase" />
                      <input type="text" value={pdfTemplate.paymentDetails.accountName} onChange={(e) => handleUpdateTemplateField('paymentDetails.accountName', e.target.value)} placeholder="Account Name" className="w-full bg-transparent border-b border-slate-200 outline-none text-[8pt] font-bold uppercase" />
                    </div>
                  </div>
                </div>

                {/* WARRANTY & AVAILABILITY */}
                <div className="grid grid-cols-2 gap-8 pt-8">
                  <div className="border border-black">
                    <div className="bg-slate-100 px-3 py-1 border-b border-black text-[8pt] font-black uppercase flex justify-between items-center">
                      Warranty
                      <button onClick={() => handleAddListItem('warrantyPeriod')} className="p-1 hover:bg-slate-200 rounded transition-all">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                      </button>
                    </div>
                    <div className="p-3 space-y-1">
                      {pdfTemplate.warrantyPeriod.map((w, i) => (
                        <div key={i} className="flex gap-2 group">
                          <textarea 
                            value={w} 
                            onChange={(e) => handleUpdateListItem('warrantyPeriod', i, e.target.value)} 
                            className="flex-1 bg-transparent border-b border-transparent hover:border-slate-200 outline-none text-[7.5pt] font-bold uppercase resize-none whitespace-pre-wrap overflow-hidden"
                            rows={1}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = target.scrollHeight + 'px';
                            }}
                          />
                          <button onClick={() => handleRemoveListItem('warrantyPeriod', i)} className="opacity-0 group-hover:opacity-100 text-red-500"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border border-black">
                    <div className="bg-slate-100 px-3 py-1 border-b border-black text-[8pt] font-black uppercase flex justify-between items-center">
                      Availability
                      <button onClick={() => handleAddListItem('availability')} className="p-1 hover:bg-slate-200 rounded transition-all">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                      </button>
                    </div>
                    <div className="p-3 space-y-1">
                      {pdfTemplate.availability.map((a, i) => (
                        <div key={i} className="flex gap-2 group">
                          <textarea 
                            value={a} 
                            onChange={(e) => handleUpdateListItem('availability', i, e.target.value)} 
                            className="flex-1 bg-transparent border-b border-transparent hover:border-slate-200 outline-none text-[7.5pt] font-bold uppercase resize-none whitespace-pre-wrap overflow-hidden"
                            rows={1}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = target.scrollHeight + 'px';
                            }}
                          />
                          <button onClick={() => handleRemoveListItem('availability', i)} className="opacity-0 group-hover:opacity-100 text-red-500"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* SIGNATORIES - PARALLEL */}
                <div className="grid grid-cols-2 gap-12 pt-10 items-end">
                  <div className="relative group/sig text-center">
                    <p className="text-[8pt] font-black mb-1 uppercase text-slate-900 text-left">Prepared By:</p>
                    <div className="border-b border-black pb-1 relative min-h-[60px] flex flex-col justify-end">
                      {/* E-Signature Overlay */}
                      {pdfTemplate.signatories.preparedBy.signatureUrl && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-80">
                          <img 
                            src={pdfTemplate.signatories.preparedBy.signatureUrl} 
                            alt="Signature" 
                            className="max-h-24 object-contain mb-4"
                          />
                        </div>
                      )}
                      
                      <div className="relative z-10">
                        <input type="text" value={pdfTemplate.signatories.preparedBy.name} onChange={(e) => handleUpdateTemplateField('signatories.preparedBy.name', e.target.value)} className="w-full bg-transparent border-none outline-none text-[11pt] font-bold text-slate-900 text-center p-0" />
                        <input type="text" value={pdfTemplate.signatories.preparedBy.position} onChange={(e) => handleUpdateTemplateField('signatories.preparedBy.position', e.target.value)} className="w-full bg-transparent border-none outline-none text-[9pt] font-medium italic text-slate-800 text-center p-0" />
                      </div>

                      {/* Signature Upload Button */}
                      <div className="absolute -right-8 top-0 opacity-0 group-hover/sig:opacity-100 transition-opacity">
                        <input type="file" ref={signatureInputRef} onChange={handleSignatureUpload} className="hidden" accept="image/*" />
                        <button 
                          onClick={() => signatureInputRef.current?.click()}
                          className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-lg hover:bg-indigo-700 transition-all"
                          title="Upload E-Signature"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        {pdfTemplate.signatories.preparedBy.signatureUrl && (
                          <button 
                            onClick={() => handleUpdateTemplateField('signatories.preparedBy.signatureUrl', undefined)}
                            className="p-1.5 bg-red-600 text-white rounded-lg shadow-lg hover:bg-red-700 transition-all mt-1 block"
                            title="Remove E-Signature"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="relative group/sig text-center">
                    <p className="text-[8pt] font-black mb-1 uppercase text-slate-400 text-left invisible">Authorized By:</p>
                    <div className="border-b border-black pb-1 relative min-h-[80px] flex flex-col justify-end">
                      {/* E-Signature Overlay */}
                      {pdfTemplate.signatories.authorizedRepresentative.signatureUrl && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-80 -bottom-2">
                          <img 
                            src={pdfTemplate.signatories.authorizedRepresentative.signatureUrl} 
                            alt="Signature" 
                            className="max-h-24 object-contain"
                          />
                        </div>
                      )}
                      
                      <div className="relative z-10">
                        <input 
                          type="text" 
                          value={pdfTemplate.signatories.authorizedRepresentative.name || ''} 
                          onChange={(e) => handleUpdateTemplateField('signatories.authorizedRepresentative.name', e.target.value)} 
                          placeholder="REPRESENTATIVE NAME"
                          className="w-full bg-transparent border-none outline-none text-[10pt] font-black uppercase text-center p-0 mb-6" 
                        />
                      </div>

                      {/* Signature Upload Button */}
                      <div className="absolute -right-8 top-0 opacity-0 group-hover/sig:opacity-100 transition-opacity">
                        <input type="file" ref={authorizedSignatureInputRef} onChange={handleAuthorizedSignatureUpload} className="hidden" accept="image/*" />
                        <button 
                          onClick={() => authorizedSignatureInputRef.current?.click()}
                          className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-lg hover:bg-indigo-700 transition-all"
                          title="Upload E-Signature"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        {pdfTemplate.signatories.authorizedRepresentative.signatureUrl && (
                          <button 
                            onClick={() => handleUpdateTemplateField('signatories.authorizedRepresentative.signatureUrl', undefined)}
                            className="p-1.5 bg-red-600 text-white rounded-lg shadow-lg hover:bg-red-700 transition-all mt-1 block"
                            title="Remove E-Signature"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="w-full pt-2">
                      <input 
                        type="text" 
                        value={pdfTemplate.signatories.authorizedRepresentative.label} 
                        onChange={(e) => handleUpdateTemplateField('signatories.authorizedRepresentative.label', e.target.value)} 
                        className="w-full bg-transparent border-none outline-none text-[8pt] font-bold uppercase text-center p-0" 
                      />
                      <p className="text-[7pt] font-bold text-slate-400 italic">(Printed Name / Signature / Date)</p>
                    </div>
                  </div>
                </div>

                {/* CONFIRMATION FOOTER */}
                <div className="border-t-[5px] border-[#003366] pt-5">
                  <div className="bg-[#003366] text-white text-center font-black text-[9pt] py-1.5 uppercase tracking-widest mb-3">CONFIRMATION</div>
                  <p className="text-center text-[7pt] font-bold text-slate-700 leading-snug uppercase px-6">
                    This proposal will be regarded as an order confirmation upon acceptance. Kindly acknowledge with your signature accompanied by a Purchase Order and/or company stamp. Thank you for your trust and confidence.
                  </p>
                </div>

                {/* ADS BANNER */}
                {pdfTemplate.adsBannerUrl && (
                  <div className="pt-8 w-full">
                    <img 
                      src={pdfTemplate.adsBannerUrl} 
                      alt="Ads Banner" 
                      className="w-full h-auto object-contain border border-slate-100 rounded shadow-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isLogOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsLogOpen(false)} />
          <div className="relative bg-white w-full max-w-2xl h-[80vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Activity Log</h3>
              <button onClick={() => setIsLogOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-4">
              {adminLogs.map((log) => (
                <div key={log.id} className="pb-6 border-b border-slate-50 last:border-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black uppercase text-indigo-600">{log.action}</span>
                    <span className="text-[10px] text-slate-400">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-slate-600">{log.details}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
});

export default AdminPanel;
