
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { LayoutDashboard, History, Settings, LogOut, FileText, ChevronRight, Search, Filter, Trash2, FolderOpen, RefreshCw, X, PanelLeftClose, PanelLeft } from 'lucide-react';
import {
  Product,
  SelectedItem,
  CustomerInfo,
  PaymentMethod,
  QuotationStatus,
  QuotationRecord,
  ClientType,
  Attachment,
  AdminLog,
  SystemBackup,
  FollowUpLog,
  PDFTemplate,
  UserRole,
  LaborService,
  UploadedFile,
  type SessionUserProfile,
} from '../types';
import { PRODUCTS, COMPANY_DETAILS, DEFAULT_PDF_TEMPLATE, INITIAL_CUSTOMER } from '../constants';
import { processConversation } from '../services/geminiService';
import { db, saveCatalog, savePipeline, saveAdminLogs, saveSettings, getSettings, saveCurrentAppState, getCurrentAppState } from '../services/db';
import CustomerForm from './CustomerForm';
import QuotationSummary from './QuotationSummary';
import ProductList from './ProductList';
import PreviewModal from './PreviewModal';
import PipelineDetail from './PipelineDetail';
import AdminPanel from './AdminPanel';
import ExcelImporter from './ExcelImporter';
import AIChat from './AIChat';
import { sendQuotationEmail } from '../services/emailService';
import { blobToBase64, generateQuotationPDF } from '../services/pdfService';
import { addCustomer, extractCustomerIdFromAddResponse } from '../services/customerApi';
import {
  triggerPipelineUploadHook,
  uploadQuotationFile,
  saveQuotationProject,
  saveProjectDetails,
  pickProjectIdFromSaveQuotationResponse,
  toSqlDateOnly,
} from '../services/quotationFileApi';
import { createProductOnApi, deleteProductOnApi, fetchProducts } from '../services/productsApi';
import { deriveTierPricesFromBasePrice } from '../services/pricing';
import * as XLSX from 'xlsx';
import { fetchAllyOpportunities } from '../services/allyOpportunitiesApi';
import { fetchEstimationFiles, type EstimationFileRecord } from '../services/estimationApi';
import { upgradeTermsFromLegacy } from '../utils/upgradeTermsFromLegacy';
import { mergeApiQuotationLogoIfEmpty } from '../services/quotationLogoApi';
import ProfileScreen from './ProfileScreen';

interface DashboardProps {
  onLogout: () => void;
  userRole: UserRole;
  /** Logged-in user's server Account_ID (pipeline isolation for SALES). */
  accountId: string;
  displayName: string;
  sessionProfile: SessionUserProfile | null;
  onRefreshSessionProfile: () => Promise<void>;
  isRefreshingProfile: boolean;
}

function sanitizeAccountFileToken(s: string): string {
  const t = (s || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return t.slice(0, 40) || 'User';
}

/** Stable key for reusing a designed PDF (e.g. after Download) when submitting the same quotation. */
function buildQuotationPdfContentKey(params: {
  previewId: string;
  items: SelectedItem[];
  laborServices: LaborService[];
  customer: CustomerInfo;
  paymentMethod: PaymentMethod;
  manualDiscountEnabled: boolean;
  discountValue: number;
  discountType: 'percentage' | 'fixed';
  showVat: boolean;
  pdfTemplate: PDFTemplate;
  accountId: string;
  ownerLabel: string;
}): string {
  return JSON.stringify({
    previewId: params.previewId,
    items: params.items.map((i) => ({
      id: i.id,
      q: i.quantity,
      p: i.price,
      name: i.name,
      model: i.model,
    })),
    labor: params.laborServices,
    customer: params.customer,
    pm: params.paymentMethod,
    mde: params.manualDiscountEnabled,
    dv: params.discountValue,
    dt: params.discountType,
    vat: params.showVat,
    tpl: params.pdfTemplate,
    aid: params.accountId,
    own: params.ownerLabel,
  });
}

export interface Message {
  role: 'user' | 'model';
  content: string;
  attachments?: { type: string; data: string; name?: string }[];
}

const Dashboard: React.FC<DashboardProps> = ({
  onLogout,
  userRole,
  accountId,
  displayName,
  sessionProfile,
  onRefreshSessionProfile,
  isRefreshingProfile,
}) => {
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [laborServices, setLaborServices] = useState<LaborService[]>([]);
  const [customer, setCustomer] = useState<CustomerInfo>(INITIAL_CUSTOMER);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.BANK_TRANSFER);
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [manualDiscountEnabled, setManualDiscountEnabled] = useState<boolean>(true);
  const [showVat, setShowVat] = useState<boolean>(true);
  const [currentStatus, setCurrentStatus] = useState<QuotationStatus>(QuotationStatus.INQUIRY);
  const [activeTab, setActiveTab] = useState<'estimation' | 'quotation' | 'pipeline' | 'profile' | 'admin'>('estimation');
  
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: "Hello! I'm your AA2000 Sales Assistant. I can help you build quotations faster. Just tell me what products you need, or upload a photo of a hand-written BOM or an Excel file!" }
  ]);
  const [isProcessingChat, setIsProcessingChat] = useState(false);
  
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string>(() => `PQ-FDAS-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`);
  const [pdfFileName, setPdfFileName] = useState<string>('');

  const [isFormValid, setIsFormValid] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [savedQuotes, setSavedQuotes] = useState<QuotationRecord[]>([]);
  const savedQuotesRef = useRef<QuotationRecord[]>([]);
  const [dynamicProducts, setDynamicProducts] = useState<Product[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [pdfTemplate, setPdfTemplate] = useState<PDFTemplate>(DEFAULT_PDF_TEMPLATE);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  
  const [pipelineSearch, setPipelineSearch] = useState('');
  const [pipelineStatusFilter, setPipelineStatusFilter] = useState<QuotationStatus | 'ALL'>('ALL');
  const [estimationFiles, setEstimationFiles] = useState<EstimationFileRecord[]>([]);
  const [isLoadingEstimations, setIsLoadingEstimations] = useState(false);
  const [estimationError, setEstimationError] = useState<string | null>(null);
  const [selectedEstimationFile, setSelectedEstimationFile] = useState<EstimationFileRecord | null>(null);
  
  const [isChatFloating, setIsChatFloating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const chatSensorRef = useRef<HTMLDivElement>(null);
  const processedAllyOpportunityIdsRef = useRef<Set<string>>(new Set());
  const latestDesignedPdfRef = useRef<{
    blob: Blob;
    fileName: string;
    at: number;
    contentKey: string;
  } | null>(null);
  const submitPipelinePrintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // If the sensor is not intersecting, it means we've scrolled past it
        setIsChatFloating(!entry.isIntersecting);
      },
      { threshold: 0 }
    );

    if (chatSensorRef.current) {
      observer.observe(chatSensorRef.current);
    }

    return () => observer.disconnect();
  }, [activeTab]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const savedPipeline = await db.pipeline.toArray();
        if (savedPipeline.length > 0) setSavedQuotes(savedPipeline);

        try {
          const apiProducts = await fetchProducts();
          if (apiProducts.length > 0) setDynamicProducts(apiProducts);
          else {
            const savedCatalog = await db.catalog.toArray();
            setDynamicProducts(savedCatalog);
          }
        } catch {
          const savedCatalog = await db.catalog.toArray();
          setDynamicProducts(savedCatalog);
        }

        const savedLogs = await db.adminLogs.toArray();
        if (savedLogs.length > 0) setAdminLogs(savedLogs);

        const savedTemplate = await getSettings('pdf_template');
        const baseTemplate: PDFTemplate = savedTemplate
          ? upgradeTermsFromLegacy(savedTemplate)
          : upgradeTermsFromLegacy(JSON.parse(JSON.stringify(DEFAULT_PDF_TEMPLATE)) as PDFTemplate);
        const nextTemplate = await mergeApiQuotationLogoIfEmpty(baseTemplate);
        setPdfTemplate(nextTemplate);
        const persistKey = savedTemplate ? JSON.stringify(savedTemplate) : null;
        if (persistKey !== JSON.stringify(nextTemplate)) {
          await saveSettings('pdf_template', nextTemplate);
        }

        const savedAppState = await getCurrentAppState();
        if (savedAppState) {
          setItems(savedAppState.items);
          setUploadedFiles(savedAppState.uploadedFiles || []);
          setLaborServices(savedAppState.laborServices || []);
          setCustomer(savedAppState.customer);
          setPaymentMethod(savedAppState.paymentMethod);
          setDiscountValue(savedAppState.discountValue || savedAppState.discountPercent || 0);
          setDiscountType(savedAppState.discountType || 'percentage');
          setManualDiscountEnabled(savedAppState.manualDiscountEnabled ?? true);
          setShowVat(savedAppState.showVat);
          setCurrentStatus(savedAppState.currentStatus);
          setPdfFileName(savedAppState.pdfFileName || '');
          if (savedAppState.referenceCode) setPreviewId(savedAppState.referenceCode);
        }
      } catch (e) {
        console.error("Failed to load persistence data from IndexedDB:", e);
      }
    };
    loadData();
  }, []);

  // Keep refs in sync for polling logic (avoid stale closures)
  useEffect(() => {
    savedQuotesRef.current = savedQuotes;
  }, [savedQuotes]);

  // Load already-imported Ally opportunity ids
  useEffect(() => {
    try {
      const raw = localStorage.getItem('allyProcessedOpportunityIds');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        processedAllyOpportunityIdsRef.current = new Set(parsed.filter((x) => typeof x === 'string'));
      }
    } catch (e) {
      console.warn('Failed to load Ally processed IDs from localStorage', e);
    }
  }, []);

  // Auto-set 20% discount for System Contractors
  useEffect(() => {
    if (customer.clientType === ClientType.SYSTEM_CONTRACTOR) {
      setDiscountType('percentage');
      setDiscountValue(20);
    }
  }, [customer.clientType]);

  // Auto-save current app state (draft)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveCurrentAppState({
        id: 'current',
        items,
        uploadedFiles,
        laborServices,
        customer,
        paymentMethod,
        discountValue,
        manualDiscountEnabled,
        discountType,
        discountPercent: discountType === 'percentage' ? discountValue : 0, // for backward compatibility
        showVat,
        currentStatus,
        pdfFileName,
        referenceCode: previewId
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [items, customer, paymentMethod, discountValue, manualDiscountEnabled, discountType, showVat, currentStatus]);

  const persistQuotes = async (quotes: QuotationRecord[]) => {
    setSavedQuotes(quotes);
    await savePipeline(quotes);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const persistTemplate = useCallback(async (template: PDFTemplate) => {
    setPdfTemplate(template);
    await saveSettings('pdf_template', template);
  }, []);

  const persistCatalog = async (products: Product[]) => {
    setDynamicProducts(products);
    await saveCatalog(products);
  };

  const persistLogs = async (logs: AdminLog[]) => {
    setAdminLogs(logs);
    await saveAdminLogs(logs);
  };

  const loadEstimationInbox = useCallback(async () => {
    setIsLoadingEstimations(true);
    setEstimationError(null);
    try {
      const files = await fetchEstimationFiles();
      setEstimationFiles(files);
    } catch (e: any) {
      const msg = e?.message || 'Failed to load estimation files';
      setEstimationError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoadingEstimations(false);
    }
  }, []);

  const handleDownloadEstimationFile = useCallback(async (file: EstimationFileRecord) => {
    try {
      showToast(`Downloading ${file.filename}...`, 'info');
      const res = await fetch(file.fileUrl, { method: 'GET' });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      showToast(`Downloaded ${file.filename}`, 'success');
    } catch (e: any) {
      const msg = e?.message || 'Failed to download file';
      setEstimationError(msg);
      showToast(msg, 'error');
      // Fallback: open in new tab (server may already send attachment disposition).
      try {
        const a = document.createElement('a');
        a.href = file.fileUrl;
        a.target = '_blank';
        a.rel = 'noreferrer';
        a.download = file.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch {
        try {
          window.open(file.fileUrl, '_blank', 'noreferrer');
        } catch {
          // ignore
        }
      }
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'estimation') return;
    loadEstimationInbox();
    const timer = window.setInterval(loadEstimationInbox, 12000);
    return () => window.clearInterval(timer);
  }, [activeTab, loadEstimationInbox]);

  const handleCreateQuotationFromEstimation = useCallback((file: EstimationFileRecord) => {
    setSelectedEstimationFile(file);
    setActiveTab('quotation');
    showToast(`Loaded ${file.filename}. You can draft while viewing the source file.`, 'info');
  }, []);

  const getPriceForClient = useCallback((product: Product, clientType: ClientType, volume: number): number => {
    const tier = deriveTierPricesFromBasePrice(product.baseCost || 0);
    const isBigVolume = volume >= 50;

    switch (clientType) {
      case ClientType.DEALER:
        return isBigVolume ? tier.dealerBigVolumePrice : tier.dealerPrice;
      case ClientType.SYSTEM_CONTRACTOR:
        return isBigVolume ? tier.contractorBigVolumePrice : tier.contractorPrice;
      case ClientType.END_USER:
      case ClientType.GOVERNMENT:
        return isBigVolume ? tier.endUserBigVolumePrice : tier.endUserPrice;
      default:
        return tier.endUserPrice;
    }
  }, []);

  const buildQuotationFromAllyOpportunity = useCallback(
    (opp: { id: string; createdAt: string; raw: any }): QuotationRecord => {
      const raw = opp.raw ?? {};

      const fullName =
        (raw?.customer?.fullName as string | undefined) ||
        (raw?.customer?.name as string | undefined) ||
        raw?.fullName ||
        raw?.name ||
        raw?.opportunity?.fullName ||
        `Ally Opportunity ${opp.id}`;

      const companyName =
        (raw?.customer?.companyName as string | undefined) ||
        raw?.companyName ||
        raw?.account?.companyName ||
        raw?.opportunity?.companyName ||
        '';

      const email = (raw?.customer?.email as string | undefined) || raw?.email || raw?.opportunity?.email || '';
      const phone = (raw?.customer?.phone as string | undefined) || raw?.phone || raw?.opportunity?.phone || '';
      const address = (raw?.customer?.address as string | undefined) || raw?.address || raw?.opportunity?.address || '';

      const projectFor =
        raw?.projectFor ||
        raw?.project?.name ||
        raw?.opportunity?.projectFor ||
        raw?.opportunity?.project?.name ||
        '';

      const projectSite =
        raw?.projectSite ||
        raw?.project?.site ||
        raw?.opportunity?.projectSite ||
        raw?.opportunity?.project?.site ||
        '';

      const inferClientType = (): ClientType => {
        const ctRaw = String(raw?.clientType ?? raw?.customer?.clientType ?? raw?.opportunity?.clientType ?? '').toUpperCase();
        if (ctRaw.includes('SYSTEM') && ctRaw.includes('CONTRACTOR')) return ClientType.SYSTEM_CONTRACTOR;
        if (ctRaw.includes('DEALER')) return ClientType.DEALER;
        if (ctRaw.includes('GOV')) return ClientType.GOVERNMENT;
        if (ctRaw.includes('END') && ctRaw.includes('USER')) return ClientType.END_USER;
        if (ctRaw.includes('END') || ctRaw.includes('USER')) return ClientType.END_USER;
        return ClientType.END_USER;
      };

      const clientType = inferClientType();

      const splitName = (name: string): { fname: string; mname: string; lname: string } => {
        const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return { fname: '', mname: '', lname: '' };
        if (parts.length === 1) return { fname: parts[0], mname: '', lname: parts[0] };
        if (parts.length === 2) return { fname: parts[0], mname: '', lname: parts[1] };
        return { fname: parts[0], mname: parts.slice(1, -1).join(' '), lname: parts[parts.length - 1] };
      };

      const { fname, mname, lname } = splitName(fullName);

      const lineItems: any[] =
        (Array.isArray(raw?.lineItems) ? raw.lineItems : undefined) ||
        (Array.isArray(raw?.items) ? raw.items : undefined) ||
        (Array.isArray(raw?.opportunity?.lineItems) ? raw.opportunity.lineItems : undefined) ||
        [];

      const normalized = lineItems
        .map((li, idx) => {
          const model = li?.model ?? li?.code ?? li?.partNumber ?? li?.itemCode ?? li?.name ?? li?.productName ?? '';
          const name = li?.name ?? li?.description ?? li?.itemDescription ?? model ?? '';
          const quantity = Number(li?.quantity ?? li?.qty ?? li?.amount ?? 1);
          return {
            model: String(model || '').trim(),
            name: String(name || '').trim(),
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
            idx,
          };
        })
        .filter((x) => x.model !== '' || x.name !== '');

      const totalVolume = normalized.reduce((sum, i) => sum + i.quantity, 0);
      const sourceFileId = `ally-${opp.id}`;

      const items: SelectedItem[] = normalized.map((li, idx) => {
        const modelLower = li.model.toLowerCase();
        const nameLower = li.name.toLowerCase();

        const product = dynamicProducts.find(
          (p) =>
            (li.model && p.model.toLowerCase() === modelLower) ||
            (li.name && p.name.toLowerCase() === nameLower) ||
            (li.model && p.name.toLowerCase() === modelLower)
        );

        if (product) {
          const price = getPriceForClient(product, clientType, totalVolume);
          return {
            ...product,
            quantity: li.quantity,
            price,
            sourceFileId,
          };
        }

        // Placeholder entry for unknown items (user can revise later in Quotation Studio)
        const placeholderId = 1000000 + idx;
        return {
          id: placeholderId,
          model: li.model || `ALLY-${idx + 1}`,
          name: li.name || li.model || `Item ${idx + 1}`,
          description: '',
          brand: 'OTHER',
          baseCost: 0,
          price: 0,
          category: undefined,
          dealerPrice: 0,
          contractorPrice: 0,
          endUserPrice: 0,
          dealerBigVolumePrice: 0,
          contractorBigVolumePrice: 0,
          endUserBigVolumePrice: 0,
          quantity: li.quantity,
          sourceFileId,
        };
      });

      const laborServices: LaborService[] = [];
      const paymentMethod = PaymentMethod.BANK_TRANSFER;

      const showVat = raw?.showVat != null ? Boolean(raw.showVat) : true;

      const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const laborCost = 0;
      const discountValue = 0;
      const discountPercent = 0;
      const discountType: 'percentage' = 'percentage';
      const discountAmount = 0;

      const netTotal = subtotal - discountAmount + laborCost;
      const vatAmount = netTotal * 0.12;
      const total = showVat ? netTotal + vatAmount : netTotal;

      const customer: CustomerInfo = {
        fullName: String(fullName || '').trim(),
        fname: String(fname || '').trim(),
        mname: String(mname || '').trim(),
        lname: String(lname || '').trim(),
        attentionTo: String(fullName || '').trim(),
        position: raw?.position || raw?.customer?.position || 'PURCHASING OFFICER',
        companyName: String(companyName || '').trim(),
        email: String(email || '').trim(),
        phone: String(phone || '').trim(),
        address: String(address || '').trim(),
        projectFor: String(projectFor || '').trim(),
        projectSite: String(projectSite || '').trim(),
        clientType,
        hasLabor: false,
      };

      const logDate = opp.createdAt || new Date().toISOString();

      return {
        id: `ALLY-${opp.id}`,
        items,
        laborServices,
        customer,
        paymentMethod,
        discountPercent,
        discountType,
        discountValue,
        showVat,
        status: QuotationStatus.INQUIRY,
        total,
        createdAt: logDate,
        logs: [
          {
            date: logDate,
            note: 'Imported from Ally Virtual webhook opportunity.',
            user: 'AllyWebhook',
          },
        ],
        attachments: [],
        version: 1,
        isDraft: false,
        accountId: (accountId || '').trim() || undefined,
        ownerLabel: (displayName || '').trim() || undefined,
      };
    },
    [dynamicProducts, getPriceForClient, accountId, displayName]
  );

  // Poll Ally Virtual opportunities (webhook -> server -> this importer -> local pipeline)
  useEffect(() => {
    if (activeTab !== 'pipeline') return;
    if (!dynamicProducts.length) return;

    let cancelled = false;
    const run = async () => {
      try {
        const opportunities = await fetchAllyOpportunities(20);
        if (cancelled) return;

        const existingQuoteIds = new Set(savedQuotesRef.current.map((q) => q.id));
        const newOpportunities = opportunities.filter((o) => {
          const quoteId = `ALLY-${o.id}`;
          return (
            !processedAllyOpportunityIdsRef.current.has(o.id) &&
            !existingQuoteIds.has(quoteId)
          );
        });

        if (newOpportunities.length === 0) return;

        const quotesById = new Map(savedQuotesRef.current.map((q) => [q.id, q]));
        for (const o of newOpportunities) {
          const q = buildQuotationFromAllyOpportunity(o);
          quotesById.set(q.id, q);
          processedAllyOpportunityIdsRef.current.add(o.id);
        }

        const merged = Array.from(quotesById.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        await persistQuotes(merged);
        try {
          localStorage.setItem(
            'allyProcessedOpportunityIds',
            JSON.stringify(Array.from(processedAllyOpportunityIdsRef.current))
          );
        } catch {
          // ignore
        }

        showToast(`Imported ${newOpportunities.length} Ally Virtual opportunity(s) into pipeline.`, 'success');
      } catch (e) {
        console.error('Ally opportunities poll failed:', e);
      }
    };

    // Run immediately, then poll periodically.
    run();
    const interval = window.setInterval(run, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeTab, dynamicProducts, buildQuotationFromAllyOpportunity]);

  const totalVolume = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);

  useEffect(() => {
    setItems(prev => prev.map(item => ({
      ...item,
      price: getPriceForClient(item, customer.clientType, totalVolume)
    })));
  }, [customer.clientType, totalVolume, getPriceForClient]);

  const addItem = useCallback((product: Product, quantity: number = 1, sourceFileId?: string) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === product.id && i.sourceFileId === sourceFileId);
      const newItems = existing 
        ? prev.map(i => (i.id === product.id && i.sourceFileId === sourceFileId) ? { ...i, quantity: i.quantity + quantity } : i)
        : [...prev, { ...product, quantity, price: product.price, sourceFileId }]; // Temporary price, will be updated by useEffect
      
      const newTotalVolume = newItems.reduce((sum, i) => sum + i.quantity, 0);
      return newItems.map(i => ({
        ...i,
        price: getPriceForClient(i, customer.clientType, newTotalVolume)
      }));
    });
    if (currentStatus === QuotationStatus.INQUIRY) setCurrentStatus(QuotationStatus.REQUIREMENTS);
  }, [customer.clientType, getPriceForClient, currentStatus]);

  const handleCreateQuickProduct = useCallback(async (product: Product) => {
    const exists = dynamicProducts.some(
      (p) => p.model.toLowerCase() === product.model.toLowerCase() || p.id === product.id
    );
    if (exists) {
      throw new Error(`Product with model "${product.model}" already exists.`);
    }
    await createProductOnApi(product);
    const refreshedProducts = await fetchProducts();
    await persistCatalog(refreshedProducts);
    showToast(`Added new product to database: ${product.model}`, 'success');
  }, [dynamicProducts]);

  const removeUploadedFile = useCallback((fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
    setItems(prev => prev.filter(item => item.sourceFileId !== fileId));
    showToast("File and associated items removed", "info");
  }, []);

  const updateItem = useCallback((id: number, updates: Partial<SelectedItem>) => {
    setItems(prev => {
      const newItems = prev.map(i => i.id === id ? { ...i, ...updates } : i);
      const newTotalVolume = newItems.reduce((sum, i) => sum + i.quantity, 0);
      return newItems.map(i => ({ 
        ...i, 
        price: getPriceForClient(i, customer.clientType, newTotalVolume) 
      }));
    });
  }, [customer.clientType, getPriceForClient]);

  const parseExcelToText = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          let textContext = `CONTENT FROM EXCEL FILE (${file.name}):\n`;
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);
            textContext += `\n### Sheet: ${sheetName}\n${JSON.stringify(json, null, 2)}\n`;
          });
          resolve(textContext);
        } catch (err) {
          console.error("Error parsing Excel file:", err);
          resolve(`[Error parsing Excel file ${file.name}]`);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const handleAIChat = async (text: string, files?: File[]) => {
    setIsProcessingChat(true);
    const newMsg: Message = { role: 'user', content: text, attachments: [] };
    
    let augmentedText = text;
    const imageParts: { data: string; mimeType: string }[] = [];
    
    if (files && files.length > 0) {
      for (const file of files) {
        const base64 = await blobToBase64(file);
        newMsg.attachments?.push({ type: file.type, data: base64, name: file.name });
        
        if (file.type.startsWith('image/')) {
          imageParts.push({ data: base64, mimeType: file.type });
        } else if (file.name.match(/\.(xlsx|xls)$/i)) {
          // If it's an Excel file, parse it and add its text content to the prompt
          const excelText = await parseExcelToText(file);
          augmentedText += `\n\n${excelText}`;
        }
      }
    }

    setMessages(prev => [...prev, newMsg]);

    try {
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      const context = { customer, items, availableProducts: dynamicProducts };
      // Pass the augmented text (original text + parsed excel data) to Gemini
      const aiResponse = await processConversation(augmentedText, history, context, imageParts);
      
      setMessages(prev => [...prev, { role: 'model', content: aiResponse.reply }]);

      if (aiResponse.updates) {
        const u = aiResponse.updates;
        if (u.customerUpdate) {
          const sanitizedUpdate = { ...u.customerUpdate };
          
          // Sanitize phone if present
          if (sanitizedUpdate.phone) {
            sanitizedUpdate.phone = sanitizedUpdate.phone.replace(/[^\d]/g, '').slice(0, 11);
          }
          
          // Map client type if present (case-insensitive and partial match)
          if (sanitizedUpdate.clientType) {
            const ct = sanitizedUpdate.clientType.toUpperCase();
            if (ct.includes('SYSTEM') && ct.includes('CONTRACTOR')) sanitizedUpdate.clientType = ClientType.SYSTEM_CONTRACTOR;
            else if (ct.includes('DEALER')) sanitizedUpdate.clientType = ClientType.DEALER;
            else if (ct.includes('END') || ct.includes('USER')) sanitizedUpdate.clientType = ClientType.END_USER;
            else if (ct.includes('GOV')) sanitizedUpdate.clientType = ClientType.GOVERNMENT;
          }

          setCustomer(prev => ({ ...prev, ...sanitizedUpdate }));
          showToast("AI updated customer details", "info");
        }
        if (u.itemsToAdd && u.itemsToAdd.length > 0) {
          u.itemsToAdd.forEach(itemReq => {
            const product = dynamicProducts.find(p => p.model.toLowerCase() === itemReq.model.toLowerCase() || p.name.toLowerCase() === itemReq.model.toLowerCase());
            if (product) {
              addItem(product, itemReq.quantity);
              showToast(`AI added: ${product.model} (x${itemReq.quantity})`, "success");
            }
          });
        }
        if (u.paymentUpdate) {
          const matched = Object.values(PaymentMethod).find(pm => u.paymentUpdate?.toLowerCase().includes(pm.toLowerCase()));
          if (matched) setPaymentMethod(matched);
        }
        if (u.triggerPdf) {
          if (isFormValid && items.length > 0) {
            const newId = `PQ-FDAS-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
            setPreviewId(newId);
            setIsPreviewOpen(true);
          } else {
            setMessages(prev => [...prev, { 
              role: 'model', 
              content: "I cannot generate the PDF yet. Please ensure all required customer details (Attention To, Email, and Tel/Mobile No.) are filled and at least one item is added to the quotation." 
            }]);
          }
        }
      }
    } catch (err) {
      console.error("AI Chat Error:", err);
      setMessages(prev => [...prev, { role: 'model', content: "I'm sorry, I had an error processing that. Please try again." }]);
    } finally {
      setIsProcessingChat(false);
    }
  };

  const quotationPdfContentKey = useMemo(
    () =>
      buildQuotationPdfContentKey({
        previewId,
        items,
        laborServices,
        customer,
        paymentMethod,
        manualDiscountEnabled,
        discountValue,
        discountType,
        showVat,
        pdfTemplate,
        accountId: (accountId || '').trim(),
        ownerLabel: (displayName || '').trim(),
      }),
    [
      previewId,
      items,
      laborServices,
      customer,
      paymentMethod,
      manualDiscountEnabled,
      discountValue,
      discountType,
      showVat,
      pdfTemplate,
      accountId,
      displayName,
    ],
  );

  const handleSubmitPipeline = async () => {
    if (!isFormValid || items.length === 0) return;

    const sessionAccount = (accountId || '').trim();
    if (!sessionAccount) {
      showToast('Missing Account ID. Log out and sign in with your server Account_ID.', 'error');
      return;
    }

    let customerBackendId: string | undefined;
    try {
      const addRes = await addCustomer(customer);
      customerBackendId = extractCustomerIdFromAddResponse(addRes);
    } catch (e: any) {
      showToast(`Submit failed: ${e?.message || 'Could not reach server'}`, 'error');
      return;
    }

    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const laborCost = customer.hasLabor ? (customer.laborCost || 0) : 0;
    const effectiveDiscountValue = manualDiscountEnabled ? discountValue : 0;
    const discountAmount = discountType === 'percentage' ? (subtotal * (effectiveDiscountValue / 100)) : effectiveDiscountValue;
    const netTotal = subtotal - discountAmount + laborCost;
    const vat = netTotal * 0.12;
    const finalTotal = showVat ? netTotal + vat : netTotal;
    const newId = `PQ-${Date.now().toString().slice(-6)}`;
    const pdfFileSafe = `${newId}_ACC-${sanitizeAccountFileToken(sessionAccount)}.pdf`;
    const ownerShort = (displayName || '').trim() || sessionAccount;
    const newQuote: QuotationRecord = {
      id: newId,
      items: [...items],
      laborServices: [...laborServices],
      customer: { ...customer },
      paymentMethod,
      discountPercent: discountType === 'percentage' ? effectiveDiscountValue : 0,
      discountType,
      discountValue: effectiveDiscountValue,
      showVat,
      status: currentStatus === QuotationStatus.INQUIRY ? QuotationStatus.PREPARATION : currentStatus,
      total: finalTotal,
      createdAt: new Date().toISOString(),
      logs: [
        {
          date: new Date().toISOString(),
          note: `Quotation created in system (Account: ${sessionAccount}).`,
          user: ownerShort,
        },
      ],
      attachments: [],
      version: 1,
      isDraft: false,
      accountId: sessionAccount,
      ownerLabel: ownerShort,
    };

    const pdfKey = quotationPdfContentKey;
    const cachedDesigned = latestDesignedPdfRef.current;
    const reusePdf =
      !!cachedDesigned &&
      cachedDesigned.contentKey === pdfKey &&
      cachedDesigned.blob &&
      cachedDesigned.blob.size > 0;

    let designedPdfBlob: Blob | undefined = reusePdf ? cachedDesigned.blob : undefined;
    const persistP = persistQuotes([newQuote, ...savedQuotes]);

    const genP =
      !reusePdf && submitPipelinePrintRef.current
        ? generateQuotationPDF(submitPipelinePrintRef.current, pdfFileSafe, { pipelineFast: true })
            .then((pdf) => {
              designedPdfBlob = pdf;
              latestDesignedPdfRef.current = {
                blob: pdf,
                fileName: pdfFileSafe,
                at: Date.now(),
                contentKey: pdfKey,
              };
            })
            .catch((e: any) => {
              showToast(`Designed PDF generation failed, using fallback upload: ${e?.message || 'PDF error'}`, 'info');
              designedPdfBlob = undefined;
            })
        : Promise.resolve();

    await persistP;
    await genP;

    const resetReference = `PQ-FDAS-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    const clearedCustomer: CustomerInfo = { ...INITIAL_CUSTOMER, clientType: ClientType.END_USER };

    showToast('Quote submitted. Customer saved; quotation added to pipeline. PDF sync runs in the background.');
    setItems([]);
    setUploadedFiles([]);
    setLaborServices([]);
    setCustomer(clearedCustomer);
    setPaymentMethod(PaymentMethod.BANK_TRANSFER);
    setDiscountValue(0);
    setDiscountType('percentage');
    setManualDiscountEnabled(false);
    setShowVat(true);
    setCurrentStatus(QuotationStatus.INQUIRY);
    setPdfFileName('');
    setPreviewId(resetReference);
    setSelectedQuoteId(null);
    setActiveTab('pipeline');

    const uploadSnapshot = {
      quoteId: newQuote.id,
      customerName: newQuote.customer.fullName || newQuote.customer.companyName,
      total: newQuote.total,
      createdAt: newQuote.createdAt,
      pdfBlob: designedPdfBlob,
      fileName: designedPdfBlob ? pdfFileSafe : undefined,
      accountId: sessionAccount,
      ownerLabel: ownerShort,
      customerBackendId,
      pipelineStatus: newQuote.status,
      projectFor: newQuote.customer.projectFor || null,
    };

    void saveCurrentAppState({
      id: 'current',
      items: [],
      uploadedFiles: [],
      laborServices: [],
      customer: clearedCustomer,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      discountPercent: 0,
      discountType: 'percentage',
      discountValue: 0,
      manualDiscountEnabled: false,
      showVat: true,
      currentStatus: QuotationStatus.INQUIRY,
      pdfFileName: '',
      referenceCode: resetReference,
    }).catch(() => {});

    const patchQuoteServerId = (projId: string | number | undefined) => {
      if (projId == null) return;
      setSavedQuotes((prev) => {
        const next = prev.map((q) => (q.id === newId ? { ...q, serverProjId: projId } : q));
        void savePipeline(next);
        return next;
      });
    };

    void (async () => {
      try {
        const uploadRes = await triggerPipelineUploadHook({
          quoteId: uploadSnapshot.quoteId,
          customerName: uploadSnapshot.customerName,
          total: uploadSnapshot.total,
          createdAt: uploadSnapshot.createdAt,
          pdfBlob: uploadSnapshot.pdfBlob,
          fileName: uploadSnapshot.fileName,
          accountId: uploadSnapshot.accountId,
          ownerLabel: uploadSnapshot.ownerLabel,
        });
        const quotationFilePath = uploadRes?.filePath || uploadRes?.file_path;
        try {
          const saveRes = await saveQuotationProject({
            AccountId: uploadSnapshot.accountId,
            customerID: uploadSnapshot.customerBackendId,
            clientID: uploadSnapshot.customerBackendId,
            status: String(uploadSnapshot.pipelineStatus),
            Start_date: uploadSnapshot.createdAt,
            quotationFilePath: quotationFilePath != null ? String(quotationFilePath) : null,
            activity: `Quotation ${uploadSnapshot.quoteId}`,
            objective: uploadSnapshot.projectFor,
          });
          const projId = pickProjectIdFromSaveQuotationResponse(saveRes);
          patchQuoteServerId(projId);
          const accountNum = Number(uploadSnapshot.accountId);
          if (projId != null && Number.isFinite(accountNum)) {
            try {
              await saveProjectDetails({
                Proj_ID: projId,
                Account_ID: accountNum,
                Status: 'PENDING',
                Customer_ID: uploadSnapshot.customerBackendId ?? null,
                Start_date: toSqlDateOnly(uploadSnapshot.createdAt),
                FilePath: quotationFilePath != null ? String(quotationFilePath) : null,
                deposit_amount: 0,
                current_balance: null,
                application: 'QOUTATION',
                activity: `Quotation ${uploadSnapshot.quoteId}`,
                objective: uploadSnapshot.projectFor,
              });
            } catch (detailsErr: any) {
              console.warn('save/project_details:', detailsErr);
              showToast(
                `Project saved, but project_details failed: ${detailsErr?.message || 'Server error'}`,
                'error',
              );
            }
          }
        } catch (saveErr: any) {
          console.warn('save/quotation:', saveErr);
          showToast(`Quotation file uploaded, but project save failed: ${saveErr?.message || 'Server error'}`, 'error');
        }
        if (!uploadSnapshot.pdfBlob) showToast('Pipeline uploaded using fallback PDF.', 'info');
      } catch (e: any) {
        showToast(`Pipeline upload trigger failed: ${e?.message || 'Server error'}`, 'error');
      }
    })();
  };

  const handlePromoteFromDraft = (id: string) => {
    persistQuotes(
      savedQuotes.map((q) =>
        q.id === id
          ? {
              ...q,
              isDraft: false,
              status: QuotationStatus.PREPARATION,
              logs: [
                ...q.logs,
                {
                  date: new Date().toISOString(),
                  note: 'Added to sales pipeline from Draft Inbox.',
                  user: 'Staff',
                },
              ],
            }
          : q
      )
    );
    showToast('Quotation added to pipeline.');
    setSelectedQuoteId(null);
  };

  const handleExcelImport = useCallback((importedItems: any[], file: File) => {
    const fileId = `file-${Date.now()}-${file.name}`;
    const newFile: UploadedFile = {
      id: fileId,
      name: file.name,
      timestamp: new Date().toISOString()
    };
    setUploadedFiles(prev => [...prev, newFile]);

    setItems(prev => {
      let currentItems = [...prev];
      let addedCount = 0;
      
      importedItems.forEach(i => {
        const modelLower = i.model?.toLowerCase();
        const nameLower = i.name?.toLowerCase();
        
        const product = dynamicProducts.find(x => 
          (modelLower && x.model.toLowerCase() === modelLower) || 
          (modelLower && x.name.toLowerCase() === modelLower) ||
          (nameLower && x.name.toLowerCase() === nameLower)
        );
        
        if (product) {
          const existing = currentItems.find(x => x.id === product.id && x.sourceFileId === fileId);
          if (existing) {
            currentItems = currentItems.map(x => (x.id === product.id && x.sourceFileId === fileId) ? { ...x, quantity: x.quantity + i.quantity } : x);
          } else {
            currentItems.push({ ...product, quantity: i.quantity, sourceFileId: fileId });
          }
          addedCount++;
        }
      });
      
      if (addedCount > 0) {
        showToast(`Successfully imported ${addedCount} matched items from ${file.name}.`, 'success');
      } else {
        showToast(`No items from ${file.name} were found in the database.`, 'error');
      }

      const newTotalVolume = currentItems.reduce((sum, i) => sum + i.quantity, 0);
      return currentItems.map(i => ({
        ...i,
        price: getPriceForClient(i, customer.clientType, newTotalVolume)
      }));
    });

    if (currentStatus === QuotationStatus.INQUIRY) setCurrentStatus(QuotationStatus.REQUIREMENTS);
  }, [dynamicProducts, customer.clientType, getPriceForClient, currentStatus]);

  const handleEmailAction = async (pdfBlob: Blob) => {
    try {
      await sendQuotationEmail(customer, pdfBlob, previewId);
      if (selectedQuoteId) {
        const target = savedQuotes.find((q) => q.id === selectedQuoteId);
        const isDraftQuote = target?.isDraft;
        persistQuotes(
          savedQuotes.map((q) =>
            q.id === selectedQuoteId
              ? {
                  ...q,
                  ...(!isDraftQuote ? { status: QuotationStatus.FOLLOWUP } : {}),
                  logs: [
                    ...q.logs,
                    {
                      date: new Date().toISOString(),
                      note: isDraftQuote ? 'Emailed to customer (from draft).' : 'Emailed to customer.',
                      user: 'System',
                    },
                  ],
                }
              : q
          )
        );
        showToast(isDraftQuote ? 'Email sent. Draft updated in history.' : 'Email sent. Pipeline updated.');
      } else {
        const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
        const laborCost = customer.hasLabor ? (customer.laborCost || 0) : 0;
        const effectiveDiscountValue = manualDiscountEnabled ? discountValue : 0;
        const discountAmount = discountType === 'percentage' ? (subtotal * (effectiveDiscountValue / 100)) : effectiveDiscountValue;
        const netTotal = subtotal - discountAmount + laborCost;
        const vat = netTotal * 0.12;
        const finalTotal = showVat ? netTotal + vat : netTotal;
        const newQuote: QuotationRecord = {
          id: previewId, 
          items: [...items], 
          laborServices: [...laborServices],
          customer: { ...customer }, 
          paymentMethod, 
          discountPercent: discountType === 'percentage' ? effectiveDiscountValue : 0,
          discountType,
          discountValue: effectiveDiscountValue,
          showVat,
          status: QuotationStatus.FOLLOWUP, total: finalTotal, createdAt: new Date().toISOString(),
          logs: [{ date: new Date().toISOString(), note: 'Created via Email flow.', user: 'System' }],
          attachments: [], version: 1,
          isDraft: false,
          accountId: (accountId || '').trim() || undefined,
          ownerLabel: (displayName || '').trim() || (accountId || '').trim() || undefined,
        };
        persistQuotes([newQuote, ...savedQuotes]);
        setItems([]); setUploadedFiles([]); setCustomer(INITIAL_CUSTOMER);
        showToast('Email sent and quote saved to Follow-up.');
      }
      setIsPreviewOpen(false);
    } catch (e: any) {
      showToast(`Email failed: ${e.message}`, 'error');
    }
  };

  const handlePersistPdf = useCallback(
    async (pdfBlob: Blob, fileName: string) => {
      try {
        latestDesignedPdfRef.current = {
          blob: pdfBlob,
          fileName,
          at: Date.now(),
          contentKey: quotationPdfContentKey,
        };
        await uploadQuotationFile(pdfBlob, fileName);
        showToast('Quotation PDF uploaded to server storage.', 'success');
      } catch (e: any) {
        showToast(`PDF upload failed: ${e?.message || 'Server upload error'}`, 'error');
        throw e;
      }
    },
    [quotationPdfContentKey],
  );

  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.price * i.quantity, 0), [items]);
  const laborCost = useMemo(() => customer.hasLabor ? (customer.laborCost || 0) : 0, [customer.hasLabor, customer.laborCost]);
  
  const discountAmount = useMemo(() => {
    if (!manualDiscountEnabled) return 0;
    if (discountType === 'percentage') {
      return subtotal * (discountValue / 100);
    }
    return discountValue;
  }, [subtotal, discountValue, discountType, manualDiscountEnabled]);

  const netTotal = useMemo(() => subtotal - discountAmount + laborCost, [subtotal, discountAmount, laborCost]);
  
  // Calculate VAT (12% of the net price)
  const vatAmount = useMemo(() => netTotal * 0.12, [netTotal]);
  
  // The grand total is the Net amount plus VAT (if enabled)
  const grandTotal = useMemo(() => showVat ? netTotal + vatAmount : netTotal, [showVat, netTotal, vatAmount]);

  /** Sales users only see quotations tagged with their Account_ID; admins see all. */
  const pipelineQuotes = useMemo(() => {
    if (userRole === 'ADMIN') return savedQuotes;
    const aid = (accountId || '').trim();
    if (!aid) return [];
    return savedQuotes.filter((q) => q.accountId === aid);
  }, [savedQuotes, userRole, accountId]);

  const salesAccountTag = useMemo(() => {
    const aid = (accountId || '').trim();
    if (!aid) return undefined;
    const name = (displayName || '').trim();
    return name
      ? `Prepared by: ${name} · Account ID: ${aid}`
      : `Account ID: ${aid}`;
  }, [accountId, displayName]);

  const recentQuotationHistory = useMemo(() => {
    const entries: { quoteId: string; note: string; date: string; user: string }[] = [];
    for (const q of pipelineQuotes) {
      for (const log of q.logs) {
        entries.push({ quoteId: q.id, note: log.note, date: log.date, user: log.user });
      }
    }
    return entries
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 12);
  }, [pipelineQuotes]);

  return (
    <div className="flex h-screen bg-[#F8F9FA] font-sans overflow-hidden text-slate-900">
      {toast && (
        <div className="fixed top-6 right-6 z-[300] animate-in slide-in-from-right-4">
          <div className={`px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 border ${
            toast.type === 'success' ? 'bg-emerald-600 border-emerald-500 text-white' : 
            toast.type === 'error' ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <span className="font-medium text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Sidebar - Dark Theme */}
      <aside
        className={`bg-[#0B1120] text-white flex flex-col flex-shrink-0 z-50 overflow-hidden transition-[width] duration-300 ease-out ${sidebarOpen ? 'w-72' : 'w-0'}`}
        aria-hidden={!sidebarOpen}
      >
        <div className="w-72 min-h-full flex flex-col flex-shrink-0">
        <div className="p-6">
          <div className="flex items-start gap-2 mb-8">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 shrink-0 bg-cyan-500 rounded-xl flex items-center justify-center text-[#0B1120] font-black text-sm shadow-lg shadow-cyan-500/20">AA</div>
              <div className="min-w-0">
                <h1 className="font-bold text-base tracking-wide text-white">AA2000</h1>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Sales Operations Suite</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="shrink-0 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
              title="Hide sidebar"
              aria-label="Hide sidebar for more workspace space"
            >
              <PanelLeftClose size={20} strokeWidth={2} />
            </button>
          </div>

          <div className="space-y-8">
            <div>
              <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Workspaces</p>
              <nav className="space-y-1">
                <button
                  onClick={() => setActiveTab('estimation')}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all group ${activeTab === 'estimation' ? 'bg-[#1E293B] text-white shadow-lg shadow-black/20 border border-slate-700/50' : 'text-slate-400 hover:text-white hover:bg-[#1E293B]/50'}`}
                >
                  <div className={`p-2 rounded-lg transition-colors ${activeTab === 'estimation' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'}`}>
                    <FolderOpen size={18} />
                  </div>
                  <div className="text-left">
                    <span className="block font-bold">Estimation Inbox</span>
                    <span className="block text-[10px] opacity-60 font-normal mt-0.5">DRAFT FROM RECEIVED FILES</span>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('quotation')}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all group ${activeTab === 'quotation' ? 'bg-[#1E293B] text-white shadow-lg shadow-black/20 border border-slate-700/50' : 'text-slate-400 hover:text-white hover:bg-[#1E293B]/50'}`}
                >
                  <div className={`p-2 rounded-lg transition-colors ${activeTab === 'quotation' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'}`}>
                    <LayoutDashboard size={18} />
                  </div>
                  <div className="text-left">
                    <span className="block font-bold">Quotation Studio</span>
                    <span className="block text-[10px] opacity-60 font-normal mt-0.5">BUILD & SEND OFFERS</span>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('pipeline')}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all group ${activeTab === 'pipeline' ? 'bg-[#1E293B] text-white shadow-lg shadow-black/20 border border-slate-700/50' : 'text-slate-400 hover:text-white hover:bg-[#1E293B]/50'}`}
                >
                  <div className={`p-2 rounded-lg transition-colors ${activeTab === 'pipeline' ? 'bg-purple-500/10 text-purple-400' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'}`}>
                    <History size={18} />
                  </div>
                  <div className="text-left">
                    <span className="block font-bold">Pipeline</span>
                    <span className="block text-[10px] opacity-60 font-normal mt-0.5">ACTIVE QUOTATIONS</span>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('admin')}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all group ${activeTab === 'admin' ? 'bg-[#1E293B] text-white shadow-lg shadow-black/20 border border-slate-700/50' : 'text-slate-400 hover:text-white hover:bg-[#1E293B]/50'}`}
                >
                  <div className={`p-2 rounded-lg transition-colors ${activeTab === 'admin' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'}`}>
                    <Settings size={18} />
                  </div>
                  <div className="text-left">
                    <span className="block font-bold">Admin Console</span>
                    <span className="block text-[10px] opacity-60 font-normal mt-0.5">CATALOG & SYSTEM</span>
                  </div>
                </button>
              </nav>
            </div>
          </div>
        </div>

        <div className="mt-auto p-6 border-t border-slate-800/50">
          <div className="flex items-center justify-between group">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className="flex items-center gap-3 text-left rounded-xl -m-1 p-1 pr-2 hover:bg-slate-800/70 transition-colors flex-1 min-w-0"
              title="Open profile"
            >
              <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold ring-2 ring-slate-800 shrink-0">
                {sessionProfile?.initials ?? (userRole === 'ADMIN' ? 'SA' : 'SE')}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {(displayName || '').trim() || (userRole === 'ADMIN' ? 'System Admin' : 'Sales Employee')}
                </p>
                <p className="text-[9px] text-emerald-400 font-bold tracking-wider uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                  Signed In
                </p>
                {(accountId || '').trim() && (
                  <p className="text-[9px] text-slate-500 font-mono truncate mt-1" title={accountId}>
                    ID: {accountId}
                  </p>
                )}
              </div>
            </button>
            <button onClick={onLogout} className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all">
              <LogOut size={18} />
            </button>
          </div>
        </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative scroll-smooth bg-[#F8F9FA]">
        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="fixed top-4 left-4 z-40 flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-xl bg-[#0B1120] text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-black/20 border border-slate-700/50 hover:bg-slate-900 transition-colors"
            title="Show sidebar"
            aria-label="Show navigation sidebar"
          >
            <PanelLeft size={18} strokeWidth={2} />
            Menu
          </button>
        )}
        {activeTab === 'estimation' && (
          <div className="p-8 max-w-7xl mx-auto min-h-full">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[80vh]">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Workspace</p>
                  <h2 className="text-2xl font-black text-slate-900">Estimation Inbox</h2>
                  <p className="mt-2 text-sm text-slate-500 max-w-2xl">
                    Review incoming estimation PDFs, download originals, and start drafting a quotation in one click.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    {estimationFiles.length} {estimationFiles.length === 1 ? 'File' : 'Files'}
                  </div>
                  <button
                    onClick={loadEstimationInbox}
                    disabled={isLoadingEstimations}
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={isLoadingEstimations ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
              </div>

              {estimationError && (
                <div className="mb-6 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">
                  {estimationError}
                </div>
              )}

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4">File Name</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Saved</th>
                      <th className="px-6 py-4">Download</th>
                      <th className="px-6 py-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoadingEstimations && estimationFiles.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-16 text-slate-400 text-sm font-medium">
                          Loading estimation files...
                        </td>
                      </tr>
                    ) : estimationFiles.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-16 text-slate-400 text-sm font-medium">
                          No estimation files found.
                        </td>
                      </tr>
                    ) : (
                      estimationFiles.map((f) => (
                        <tr key={f.filename} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-5">
                            <div className="font-bold text-slate-900 text-sm break-all">{f.filename}</div>
                          </td>
                          <td className="px-6 py-5">
                            <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-700">
                              {f.isPdf ? 'PDF' : f.isDocx ? 'DOCX' : (f.extension ? f.extension.toUpperCase() : 'FILE')}
                            </span>
                          </td>
                          <td className="px-6 py-5 text-xs text-slate-500 whitespace-nowrap">
                            {f.createdAt ? new Date(f.createdAt).toLocaleString() : '-'}
                          </td>
                          <td className="px-6 py-5">
                            <button
                              type="button"
                              onClick={() => handleDownloadEstimationFile(f)}
                              className="px-3 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800"
                            >
                              Download
                            </button>
                          </td>
                          <td className="px-6 py-5">
                            <button
                              onClick={() => handleCreateQuotationFromEstimation(f)}
                              className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-500"
                            >
                              Create Quotation
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'quotation' && (
          <div className="min-h-full flex flex-col">
            {/* Header */}
            <header className="px-8 py-6 flex items-start justify-between bg-[#F8F9FA] sticky top-0 z-30">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">QUOTATION STUDIO</p>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Create & refine professional quotations</h1>
                {selectedEstimationFile && (
                  <p className="mt-2 text-xs font-bold text-amber-700 uppercase tracking-wider">
                    Drafting from estimation file: {selectedEstimationFile.filename}
                  </p>
                )}
              </div>
              
              <div className="flex items-center gap-4">
                {selectedEstimationFile && (
                  <button
                    onClick={() => setSelectedEstimationFile(null)}
                    className="inline-flex items-center gap-2 bg-white px-4 py-3 rounded-2xl border border-slate-200 shadow-sm text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <X size={14} />
                    Exit Split View
                  </button>
                )}
                <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-sm flex flex-col min-w-[180px]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Client</span>
                  <span className="text-sm font-bold text-slate-700 truncate">
                    {customer.companyName || 'No active client selected'}
                  </span>
                </div>
                <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-sm flex flex-col min-w-[180px]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Workspace Total</span>
                  <span className="text-sm font-black text-slate-900">₱{grandTotal.toLocaleString()}</span>
                </div>
              </div>
            </header>

            <div className="px-8 pb-32 max-w-7xl mx-auto w-full space-y-8">
              {recentQuotationHistory.length > 0 && (
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Quotation history</h3>
                  <p className="text-xs text-slate-500 mb-4">Latest quotation activity (newest first).</p>
                  <ul className="divide-y divide-slate-100 max-h-56 overflow-y-auto custom-scrollbar">
                    {recentQuotationHistory.map((e, i) => (
                      <li key={`${e.quoteId}-${e.date}-${i}`} className="py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 text-xs">
                        <div className="flex flex-wrap items-baseline gap-2 min-w-0">
                          <span className="font-bold text-indigo-600 shrink-0">{e.quoteId}</span>
                          <span className="text-slate-600 break-words">{e.note}</span>
                        </div>
                        <div className="flex flex-col sm:items-end gap-0.5 text-[10px] text-slate-400 shrink-0">
                          <span>{e.user}</span>
                          <span>{new Date(e.date).toLocaleString()}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedEstimationFile ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
                  <section className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden xl:sticky xl:top-6 xl:self-start">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Estimation File Preview</h3>
                      <a
                        href={selectedEstimationFile.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-indigo-600 hover:underline"
                      >
                        Open original file
                      </a>
                    </div>
                    <div className="h-[78vh] overflow-auto bg-slate-100">
                      {selectedEstimationFile.previewUrl ? (
                        <iframe
                          src={selectedEstimationFile.previewUrl}
                          title={selectedEstimationFile.filename}
                          className="w-full h-full min-h-[320px] border-0"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full min-h-[320px] p-8 text-center gap-4">
                          <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400">
                            <FileText size={28} strokeWidth={2} />
                          </div>
                          <div className="max-w-md space-y-2">
                            <p className="text-sm font-bold text-slate-800">Preview is not available in the browser</p>
                            <p className="text-xs text-slate-600 leading-relaxed">
                              {selectedEstimationFile.isPdf ? (
                                <>
                                  PDFs usually open inside this panel when the server allows embedding. If you only see a blank area, the server may be blocking iframes or your browser blocked mixed content. Use{' '}
                                  <span className="font-semibold text-slate-800">Open original file</span> above to view the PDF in a new tab with your session.
                                </>
                              ) : selectedEstimationFile.isDocx ? (
                                <>
                                  Word files are often shown with Microsoft&apos;s online viewer, which only works when the file URL is reachable from the public internet (not all local or tunnel URLs). Open the file in a new tab to view it with your session.
                                </>
                              ) : (
                                <>
                                  Open the file in a new tab to view it. If this is a PDF, ensure the file name ends with <span className="font-mono">.pdf</span> so the app can pick the right viewer.
                                </>
                              )}
                            </p>
                          </div>
                          <a
                            href={selectedEstimationFile.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-indigo-500"
                          >
                            Open file
                          </a>
                        </div>
                      )}
                    </div>
                  </section>

                  <div className="space-y-8">
                    <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-8 border-b border-slate-100">
                        <h3 className="text-xl font-black text-slate-900">Recipient Details</h3>
                      </div>
                      <div className="p-8">
                        <CustomerForm customer={customer} setCustomer={setCustomer} onValidationChange={setIsFormValid} />
                      </div>
                    </div>

                    <ProductList products={dynamicProducts} onAdd={addItem} onCreateProduct={handleCreateQuickProduct} />

                    <QuotationSummary
                      items={items}
                      onUpdateQty={(id, q) => updateItem(id, { quantity: q })}
                      onUpdateItem={updateItem}
                      onRemove={(id) => setItems(prev => prev.filter(x => x.id !== id))}
                      onClear={() => { setItems([]); setUploadedFiles([]); }}
                      subtotal={subtotal}
                      laborCost={laborCost}
                      vat={vatAmount}
                      discountValue={discountValue}
                      discountType={discountType}
                      manualDiscountEnabled={manualDiscountEnabled}
                      onManualDiscountEnabledChange={setManualDiscountEnabled}
                      onDiscountValueChange={setDiscountValue}
                      onDiscountTypeChange={setDiscountType}
                      showVat={showVat}
                      onShowVatChange={setShowVat}
                      total={grandTotal}
                      isValid={isFormValid && items.length > 0}
                      pdfFileName={pdfFileName}
                      onPdfFileNameChange={setPdfFileName}
                      referenceCode={previewId}
                      onReferenceCodeChange={setPreviewId}
                      onPreview={() => { setIsPreviewOpen(true); }}
                      onSubmit={handleSubmitPipeline}
                      onSendEmail={async () => { setIsPreviewOpen(true); }}
                      clientType={customer.clientType}
                    />
                  </div>
                </div>
              ) : (
              <>
              {/* AI Assistant Section */}
              <div ref={chatSensorRef} className="w-full min-h-[600px]">
                <AIChat 
                  messages={messages} 
                  onSendMessage={handleAIChat} 
                  isProcessing={isProcessingChat} 
                  isFloating={isChatFloating}
                />
              </div>

              {/* Manual Entry Section */}
              <div className="grid grid-cols-1 gap-8 animate-in slide-in-from-bottom-8 duration-700">
                 {/* Tools Grid */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ExcelImporter 
                      onImport={handleExcelImport} 
                      onImageUpload={async (file) => {
                        handleAIChat("Analyze this Bill of Materials image.", [file]);
                      }} 
                    />
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-center items-center text-center gap-3 cursor-pointer group" onClick={() => { const newId = `PQ-FDAS-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`; setPreviewId(newId); setIsPreviewOpen(true); }}>
                       <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                          <FileText size={24} />
                       </div>
                       <div>
                         <h3 className="font-bold text-slate-900">Preview & Export</h3>
                         <p className="text-xs text-slate-500 mt-1">Generate PDF or Send Email</p>
                       </div>
                    </div>
                 </div>

                <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                   <div className="p-8 border-b border-slate-100">
                      <h3 className="text-xl font-black text-slate-900">Client Details</h3>
                   </div>
                   <div className="p-8">
                      <CustomerForm customer={customer} setCustomer={setCustomer} onValidationChange={setIsFormValid} />
                   </div>
                </div>

                <div className="flex flex-col gap-8">
                   <div className="w-full space-y-8">
                      <ProductList products={dynamicProducts} onAdd={addItem} onCreateProduct={handleCreateQuickProduct} />
                   </div>
                   <div className="w-full">
                      <QuotationSummary 
                        items={items} 
                        onUpdateQty={(id, q) => updateItem(id, { quantity: q })} 
                        onUpdateItem={updateItem} 
                        onRemove={(id) => setItems(prev => prev.filter(x => x.id !== id))} 
                        onClear={() => { setItems([]); setUploadedFiles([]); }} 
                        subtotal={subtotal} 
                        laborCost={laborCost}
                        vat={vatAmount} 
                        discountValue={discountValue}
                        discountType={discountType}
                        manualDiscountEnabled={manualDiscountEnabled}
                        onManualDiscountEnabledChange={setManualDiscountEnabled}
                        onDiscountValueChange={setDiscountValue}
                        onDiscountTypeChange={setDiscountType}
                        showVat={showVat}
                        onShowVatChange={setShowVat}
                        total={grandTotal} 
                        isValid={isFormValid && items.length > 0} 
                        pdfFileName={pdfFileName}
                        onPdfFileNameChange={setPdfFileName}
                        referenceCode={previewId}
                        onReferenceCodeChange={setPreviewId}
                        onPreview={() => { setIsPreviewOpen(true); }} 
                        onSubmit={handleSubmitPipeline} 
                        onSendEmail={async () => { setIsPreviewOpen(true); }} 
                        clientType={customer.clientType}
                      />
                   </div>
                </div>
              </div>
              </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'pipeline' && (
          <div className="p-8 max-w-7xl mx-auto min-h-full">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[80vh]">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Overview</p>
                  <h2 className="text-2xl font-black text-slate-900">Quotation Pipeline</h2>
                </div>
                <div className="flex gap-3">
                  <div className="group flex items-center bg-white border border-slate-200 rounded-2xl px-4 py-3 w-72 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all shadow-sm">
                    <Search className="text-slate-400 group-focus-within:text-indigo-500 transition-colors mr-3 shrink-0" size={18} />
                    <input 
                      type="text" 
                      placeholder="Search quotes..." 
                      value={pipelineSearch} 
                      onChange={(e) => setPipelineSearch(e.target.value)} 
                      className="bg-transparent border-none outline-none text-sm font-medium w-full placeholder:text-slate-400 text-slate-700 h-full p-0" 
                    />
                  </div>
                  <div className="group flex items-center bg-white border border-slate-200 rounded-2xl px-4 py-3 min-w-[180px] focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all shadow-sm cursor-pointer relative">
                    <Filter className="text-slate-400 group-focus-within:text-indigo-500 transition-colors mr-3 shrink-0" size={18} />
                    <select 
                      value={pipelineStatusFilter} 
                      onChange={(e) => setPipelineStatusFilter(e.target.value as any)} 
                      className="bg-transparent border-none outline-none text-sm font-medium w-full appearance-none cursor-pointer text-slate-700 z-10 p-0 pr-6"
                    >
                      <option value="ALL">All Statuses</option>
                      {Object.values(QuotationStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" size={14} />
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500 border-y border-slate-100">
                    <tr>
                      <th className="px-6 py-4 first:rounded-l-xl">Quote ID</th>
                      {userRole === 'ADMIN' && (
                        <th className="px-6 py-4">Sales account</th>
                      )}
                      <th className="px-6 py-4">Recipient</th>
                      <th className="px-6 py-4">Project</th>
                      <th className="px-6 py-4">Total Value</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 last:rounded-r-xl">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pipelineQuotes.length === 0 ? (
                      <tr>
                        <td
                          colSpan={userRole === 'ADMIN' ? 7 : 6}
                          className="text-center py-16 text-slate-400 text-sm font-medium"
                        >
                          {userRole !== 'ADMIN' && savedQuotes.length > 0
                            ? 'No quotations for your account. Quotes from other sales users are hidden.'
                            : 'No quotations found in pipeline.'}
                        </td>
                      </tr>
                    ) : pipelineQuotes.filter(q => (pipelineStatusFilter === 'ALL' || q.status === pipelineStatusFilter) && (q.id.toLowerCase().includes(pipelineSearch.toLowerCase()) || q.customer.fullName.toLowerCase().includes(pipelineSearch.toLowerCase()))).map(q => (
                      <tr key={q.id} className="hover:bg-slate-50 cursor-pointer transition-colors group" onClick={() => setSelectedQuoteId(q.id)}>
                        <td className="px-6 py-5"><span className="font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg text-xs">{q.id}</span></td>
                        {userRole === 'ADMIN' && (
                          <td className="px-6 py-5 text-xs">
                            <div className="font-semibold text-slate-800">{q.ownerLabel || '—'}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{q.accountId || '—'}</div>
                          </td>
                        )}
                        <td className="px-6 py-5">
                          <div className="font-bold text-slate-900 text-sm">{q.customer.fullName}</div>
                          <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide mt-0.5">{q.customer.companyName}</div>
                        </td>
                        <td className="px-6 py-5 text-sm font-medium text-slate-600">{q.customer.projectFor}</td>
                        <td className="px-6 py-5 font-bold text-slate-900 text-sm">₱{q.total.toLocaleString()}</td>
                        <td className="px-6 py-5">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide inline-flex items-center gap-1.5 ${
                            q.status === QuotationStatus.ACCEPTED ? 'bg-emerald-100 text-emerald-700' :
                            q.status === QuotationStatus.REJECTED ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              q.status === QuotationStatus.ACCEPTED ? 'bg-emerald-500' :
                              q.status === QuotationStatus.REJECTED ? 'bg-red-500' :
                              'bg-amber-500'
                            }`}></span>
                            {q.status}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <button onClick={(e) => { e.stopPropagation(); persistQuotes(savedQuotes.filter(x => x.id !== q.id)); }} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                            <Trash2 size={18} /> 
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="min-h-full bg-[#F8F9FA]">
            {sessionProfile ? (
              <ProfileScreen
                profile={sessionProfile}
                isRefreshing={isRefreshingProfile}
                onRefresh={() => void onRefreshSessionProfile()}
              />
            ) : (
              <div className="p-8 max-w-md mx-auto flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <p className="text-sm text-slate-600 font-medium">Loading your profile...</p>
                <button
                  type="button"
                  onClick={() => void onRefreshSessionProfile()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                >
                  <RefreshCw size={14} className={isRefreshingProfile ? 'animate-spin' : ''} />
                  Retry
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'admin' && (
          <div className="p-8 max-w-7xl mx-auto">
             <AdminPanel 
              currentProducts={dynamicProducts} 
              adminLogs={adminLogs} 
              currentPipeline={savedQuotes} 
              pdfTemplate={pdfTemplate}
              onUpdateCatalog={(products, log) => {
                const removedProducts = dynamicProducts.filter(
                  (existing) => !products.some((next) => next.id === existing.id)
                );
                const addedProducts = products.filter(
                  (next) =>
                    !dynamicProducts.some(
                      (existing) =>
                        existing.id === next.id ||
                        existing.model.toLowerCase() === next.model.toLowerCase()
                    )
                );

                (async () => {
                  try {
                    if (addedProducts.length > 0) {
                      await Promise.all(addedProducts.map((p) => createProductOnApi(p)));
                    }
                    if (removedProducts.length > 0) {
                      await Promise.all(removedProducts.map((p) => deleteProductOnApi(p)));
                    }
                    const refreshedProducts = await fetchProducts();
                    await persistCatalog(refreshedProducts);
                    if (addedProducts.length > 0 && removedProducts.length > 0) {
                      showToast('Catalog synced to database (add + delete).', 'success');
                    } else if (addedProducts.length > 0) {
                      showToast(`Uploaded ${addedProducts.length} product(s) to database.`, 'success');
                    } else if (removedProducts.length > 0) {
                      showToast(`Deleted ${removedProducts.length} product(s) from database.`, 'success');
                    } else {
                      await persistCatalog(products);
                    }
                  } catch (e: any) {
                    console.error('Catalog sync to database failed:', e);
                    try {
                      const refreshedProducts = await fetchProducts();
                      await persistCatalog(refreshedProducts);
                    } catch {
                      // If refetch fails, keep existing local catalog (last known DB snapshot)
                    }
                    showToast(`Database sync failed: ${e?.message || 'Server error'}`, 'error');
                  }
                })();
                if (log) {
                  const newLog: AdminLog = {
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    action: log.details,
                    details: log.details,
                    type: log.type
                  };
                  persistLogs([newLog, ...adminLogs]);
                }
              }} 
              onUpdateTemplate={persistTemplate}
              onReset={async () => {
                try {
                  await Promise.all([
                    db.catalog.clear(),
                    db.pipeline.clear(),
                    db.adminLogs.clear(),
                    db.appState.clear(),
                    db.settings.clear()
                  ]);
                  localStorage.clear();
                  sessionStorage.clear();
                  showToast("System reset successful. Reloading...", "success");
                  setTimeout(() => window.location.reload(), 1000);
                } catch (err) {
                  console.error("Reset failed:", err);
                  try {
                    await db.delete();
                    window.location.reload();
                  } catch (e2) {
                    alert("Reset failed. Please try clearing your browser data manually.");
                  }
                }
              }} 
              onImportBackup={async (backup) => {
                await persistCatalog(backup.catalog);
                await persistQuotes(backup.pipeline);
                await persistLogs(backup.logs);
                if (backup.pdfTemplate) await persistTemplate(backup.pdfTemplate);
                showToast("Backup restored successfully!");
              }} 
            />
          </div>
        )}
      </main>

      <PreviewModal 
        isOpen={isPreviewOpen} 
        onClose={() => setIsPreviewOpen(false)} 
        items={items} 
        customer={customer} 
        paymentMethod={paymentMethod} 
        subtotal={subtotal} 
        laborCost={laborCost}
        vat={vatAmount} 
        discountAmount={discountAmount} 
        discountValue={manualDiscountEnabled ? discountValue : 0}
        discountType={discountType}
        total={grandTotal} 
        showVat={showVat}
        existingQuoteId={previewId} 
        onSendEmail={handleEmailAction} 
        onPersistPdf={handlePersistPdf}
        template={pdfTemplate}
        customFileName={pdfFileName}
        onCustomFileNameChange={setPdfFileName}
        salesAccountTag={salesAccountTag}
      />
      <PreviewModal
        headless
        printRefOverride={submitPipelinePrintRef}
        isOpen={false}
        onClose={() => {}}
        items={items}
        customer={customer}
        paymentMethod={paymentMethod}
        subtotal={subtotal}
        laborCost={laborCost}
        vat={vatAmount}
        discountAmount={discountAmount}
        discountValue={manualDiscountEnabled ? discountValue : 0}
        discountType={discountType}
        total={grandTotal}
        showVat={showVat}
        existingQuoteId={previewId}
        onSendEmail={async () => {}}
        template={pdfTemplate}
        customFileName={pdfFileName || `Quotation_${previewId}`}
        onCustomFileNameChange={() => {}}
        salesAccountTag={salesAccountTag}
      />
      {selectedQuoteId && (
        <PipelineDetail
          quote={savedQuotes.find((q) => q.id === selectedQuoteId)!}
          onClose={() => setSelectedQuoteId(null)}
          onUpdateStatus={(id, s) => persistQuotes(savedQuotes.map((q) => (q.id === id ? { ...q, status: s } : q)))}
          onAddLog={(id, l) => persistQuotes(savedQuotes.map((q) => (q.id === id ? { ...q, logs: [...q.logs, l] } : q)))}
          onRevise={(q) => {
            setItems(q.items);
            setLaborServices(q.laborServices || []);
            setCustomer(q.customer);
            setDiscountValue(q.discountValue || q.discountPercent || 0);
            setDiscountType(q.discountType || 'percentage');
            setManualDiscountEnabled((q.discountValue || q.discountPercent || 0) > 0);
            setShowVat(q.showVat ?? true);
            setPaymentMethod(q.paymentMethod);
            setPreviewId(q.id);
            setActiveTab('quotation');
            setSelectedQuoteId(null);
          }}
          onPreviewPDF={() => {
            const q = savedQuotes.find((x) => x.id === selectedQuoteId)!;
            setItems(q.items);
            setLaborServices(q.laborServices || []);
            setCustomer(q.customer);
            setDiscountValue(q.discountValue || q.discountPercent || 0);
            setDiscountType(q.discountType || 'percentage');
            setManualDiscountEnabled((q.discountValue || q.discountPercent || 0) > 0);
            setShowVat(q.showVat ?? true);
            setPaymentMethod(q.paymentMethod);
            setPreviewId(q.id);
            setPdfFileName('');
            setIsPreviewOpen(true);
          }}
          onPromoteFromDraft={handlePromoteFromDraft}
        />
      )}
    </div>
  );
};

export default Dashboard;
