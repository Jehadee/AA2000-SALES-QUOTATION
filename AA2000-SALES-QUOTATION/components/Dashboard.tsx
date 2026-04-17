
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { LayoutDashboard, History, Settings, LogOut, UserCircle2, Plus, FileText, Send, Paperclip, ChevronRight, Search, Filter, Trash2 } from 'lucide-react';
import { Product, SelectedItem, CustomerInfo, PaymentMethod, QuotationStatus, QuotationRecord, ClientType, Attachment, AdminLog, SystemBackup, FollowUpLog, PDFTemplate, UserRole, LaborService, UploadedFile } from '../types';
import { PRODUCTS, COMPANY_DETAILS, DEFAULT_PDF_TEMPLATE, INITIAL_CUSTOMER } from '../constants';
import { sendChatBotMessage } from '../../services/chatBotApi';
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
import { blobToBase64 } from '../services/pdfService';
import { fetchProducts } from '../services/productsApi';
import { deriveTierPricesFromBasePrice } from '../services/pricing';
import * as XLSX from 'xlsx';
import { fetchAllyOpportunities } from '../services/allyOpportunitiesApi';
import { deleteQuotationProject } from '../../services/quotationFileApi';
import {
  compactCustomerPatch,
  matchProductFromCatalog,
  parseQuotationExtractionFromAssistantReply,
} from '../../utils/quotationExtractionFromChat';

const CHAT_QUOTATION_EXTRACTION_INSTRUCTION = `---QUOTATION_JSON---
After your natural-language answer, append ONE valid JSON object (no markdown code fences) containing structured data you inferred from the document. Shape:
{"customerUpdate":{"fullName":"","companyName":"","email":"","phone":"","address":"","projectFor":"","projectSite":"","position":"","attentionTo":"","clientType":""},"itemsToAdd":[{"model":"text as printed for SKU/model","quantity":1}]}
Rules: Use only fields you can read. Use "" for unknown strings. clientType must be one of: SYSTEM_CONTRACTOR, END_USER, DEALER, GOVERNMENT. itemsToAdd must list each product line with quantity; "model" should match the document wording so it can be matched to the catalog.
---END---`;

interface DashboardProps {
  onLogout: () => void;
  userRole: UserRole;
}

export interface Message {
  role: 'user' | 'model';
  content: string;
  attachments?: { type: string; data: string; name?: string }[];
}

const Dashboard: React.FC<DashboardProps> = ({ onLogout, userRole }) => {
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [laborServices, setLaborServices] = useState<LaborService[]>([]);
  const [customer, setCustomer] = useState<CustomerInfo>(INITIAL_CUSTOMER);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.BANK_TRANSFER);
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [showVat, setShowVat] = useState<boolean>(true);
  const [currentStatus, setCurrentStatus] = useState<QuotationStatus>(QuotationStatus.INQUIRY);
  const [activeTab, setActiveTab] = useState<'quotation' | 'pipeline' | 'admin'>('quotation');
  
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: "Hello! I'm your AA2000 Sales Assistant. I can help you build quotations faster. Just tell me what products you need, or upload a photo of a hand-written BOM or an Excel file!" }
  ]);
  const [isProcessingChat, setIsProcessingChat] = useState(false);
  
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string>(() => `PQ-FDAS-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`);
  const [pdfFileName, setPdfFileName] = useState<string>('');

  const [isFormValid, setIsFormValid] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [selectedExistingCustomerId, setSelectedExistingCustomerId] = useState<string | null>(null);
  const [savedQuotes, setSavedQuotes] = useState<QuotationRecord[]>([]);
  const savedQuotesRef = useRef<QuotationRecord[]>([]);
  const [dynamicProducts, setDynamicProducts] = useState<Product[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [pdfTemplate, setPdfTemplate] = useState<PDFTemplate>(DEFAULT_PDF_TEMPLATE);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  
  const [pipelineSearch, setPipelineSearch] = useState('');
  const [pipelineStatusFilter, setPipelineStatusFilter] = useState<QuotationStatus | 'ALL'>('ALL');
  
  const [isChatFloating, setIsChatFloating] = useState(false);
  const chatSensorRef = useRef<HTMLDivElement>(null);
  const processedAllyOpportunityIdsRef = useRef<Set<string>>(new Set());

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
        if (savedTemplate) setPdfTemplate(savedTemplate);

        const savedAppState = await getCurrentAppState();
        if (savedAppState) {
          setItems(savedAppState.items);
          setUploadedFiles(savedAppState.uploadedFiles || []);
          setLaborServices(savedAppState.laborServices || []);
          setCustomer(savedAppState.customer);
          setPaymentMethod(savedAppState.paymentMethod);
          setDiscountValue(savedAppState.discountValue || savedAppState.discountPercent || 0);
          setDiscountType(savedAppState.discountType || 'percentage');
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
        discountType,
        discountPercent: discountType === 'percentage' ? discountValue : 0, // for backward compatibility
        showVat,
        currentStatus,
        pdfFileName,
        referenceCode: previewId
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [items, customer, paymentMethod, discountValue, discountType, showVat, currentStatus]);

  const persistQuotes = async (quotes: QuotationRecord[]) => {
    setSavedQuotes(quotes);
    await savePipeline(quotes);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const persistTemplate = async (template: PDFTemplate) => {
    setPdfTemplate(template);
    await saveSettings('pdf_template', template);
  };

  const persistCatalog = async (products: Product[]) => {
    setDynamicProducts(products);
    await saveCatalog(products);
  };

  const persistLogs = async (logs: AdminLog[]) => {
    setAdminLogs(logs);
    await saveAdminLogs(logs);
  };

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
      };
    },
    [dynamicProducts, getPriceForClient]
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
    let firstImageFile: File | undefined;
    
    if (files && files.length > 0) {
      for (const file of files) {
        const base64 = await blobToBase64(file);
        newMsg.attachments?.push({ type: file.type, data: base64, name: file.name });
        
        if (file.type.startsWith('image/')) {
          imageParts.push({ data: base64, mimeType: file.type });
          if (!firstImageFile) firstImageFile = file;
        } else if (file.name.match(/\.(xlsx|xls)$/i)) {
          // If it's an Excel file, parse it and add its text content to the prompt
          const excelText = await parseExcelToText(file);
          augmentedText += `\n\n${excelText}`;
        }
      }
    }

    setMessages(prev => [...prev, newMsg]);

    try {
      const historyLines = messages.map((m) =>
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`,
      );
      const hasExcelContext = augmentedText.includes('CONTENT FROM EXCEL FILE');
      const wantsStructuredExtraction = Boolean(firstImageFile || hasExcelContext);

      let messageForApi = [...historyLines, `User: ${augmentedText}`].join('\n\n');
      if (wantsStructuredExtraction) {
        messageForApi += `\n\n${CHAT_QUOTATION_EXTRACTION_INSTRUCTION}`;
      }

      const replyText = await sendChatBotMessage(messageForApi, firstImageFile);
      const { displayText, extraction } = parseQuotationExtractionFromAssistantReply(replyText);
      let shown = displayText.trim();
      if (!shown && extraction) {
        shown = 'Applied extraction to the quotation workspace below.';
      }
      if (!shown) shown = replyText;

      setMessages((prev) => [...prev, { role: 'model', content: shown }]);

      if (extraction?.customerUpdate) {
        const customerPatch = compactCustomerPatch(extraction.customerUpdate);
        if (Object.keys(customerPatch).length > 0) {
          setCustomer((prev) => ({ ...prev, ...customerPatch }));
          showToast('Customer details filled from chat extraction', 'info');
        }
      }

      if (extraction?.itemsToAdd && extraction.itemsToAdd.length > 0) {
        const matchedLabels: string[] = [];
        const unmatched: string[] = [];
        for (const row of extraction.itemsToAdd) {
          const product = matchProductFromCatalog(dynamicProducts, row.model);
          if (product) {
            addItem(product, row.quantity);
            matchedLabels.push(`${product.model} ×${row.quantity}`);
          } else {
            unmatched.push(row.model);
          }
        }
        if (matchedLabels.length > 0) {
          showToast(`Added to quotation: ${matchedLabels.join(', ')}`, 'success');
        }
        if (unmatched.length > 0) {
          showToast(`No catalog match for: ${unmatched.slice(0, 5).join(', ')}${unmatched.length > 5 ? '…' : ''}`, 'info');
        }
      }
    } catch (err) {
      console.error("AI Chat Error:", err);
      setMessages(prev => [...prev, { role: 'model', content: "I'm sorry, I had an error processing that. Please try again." }]);
    } finally {
      setIsProcessingChat(false);
    }
  };

  const handleSubmitPipeline = async () => {
    if (!isFormValid || items.length === 0) return;

    // Intentionally skip add-customer API on submit to avoid duplicate customer creation.

    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const laborCost = customer.hasLabor ? (customer.laborCost || 0) : 0;
    const discountAmount = discountType === 'percentage' ? (subtotal * (discountValue / 100)) : discountValue;
    const netTotal = subtotal - discountAmount + laborCost;
    const vat = netTotal * 0.12;
    const finalTotal = showVat ? netTotal + vat : netTotal;
    const newId = `PQ-${Date.now().toString().slice(-6)}`;
    const newQuote: QuotationRecord = {
      id: newId,
      items: [...items],
      laborServices: [...laborServices],
      customer: { ...customer },
      paymentMethod,
      discountPercent: discountType === 'percentage' ? discountValue : 0,
      discountType,
      discountValue,
      showVat,
      status: currentStatus === QuotationStatus.INQUIRY ? QuotationStatus.PREPARATION : currentStatus,
      total: finalTotal, createdAt: new Date().toISOString(),
      logs: [{ date: new Date().toISOString(), note: 'Quotation created in system.', user: 'Staff Admin' }],
      attachments: [], version: 1
    };
    await persistQuotes([newQuote, ...savedQuotes]);
    showToast('Quote submitted. Customer saved to backend; quotation saved to pipeline.');
    setItems([]); setUploadedFiles([]); setCustomer(INITIAL_CUSTOMER); setSelectedExistingCustomerId(null);
    setDiscountValue(0); setDiscountType('percentage'); setCurrentStatus(QuotationStatus.INQUIRY); setActiveTab('pipeline');
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
        persistQuotes(savedQuotes.map(q => q.id === selectedQuoteId ? { 
          ...q, status: QuotationStatus.FOLLOWUP, 
          logs: [...q.logs, { date: new Date().toISOString(), note: 'Emailed to customer.', user: 'System' }] 
        } : q));
        showToast('Email sent. Pipeline updated.');
      } else {
        const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
        const laborCost = customer.hasLabor ? (customer.laborCost || 0) : 0;
        const discountAmount = discountType === 'percentage' ? (subtotal * (discountValue / 100)) : discountValue;
        const netTotal = subtotal - discountAmount + laborCost;
        const vat = netTotal * 0.12;
        const finalTotal = showVat ? netTotal + vat : netTotal;
        const newQuote: QuotationRecord = {
          id: previewId, 
          items: [...items], 
          laborServices: [...laborServices],
          customer: { ...customer }, 
          paymentMethod, 
          discountPercent: discountType === 'percentage' ? discountValue : 0,
          discountType,
          discountValue,
          showVat,
          status: QuotationStatus.FOLLOWUP, total: finalTotal, createdAt: new Date().toISOString(),
          logs: [{ date: new Date().toISOString(), note: 'Created via Email flow.', user: 'System' }],
          attachments: [], version: 1
        };
        persistQuotes([newQuote, ...savedQuotes]);
        setItems([]); setUploadedFiles([]); setCustomer(INITIAL_CUSTOMER); setSelectedExistingCustomerId(null);
        showToast('Email sent and quote saved to Follow-up.');
      }
      setIsPreviewOpen(false);
    } catch (e: any) {
      showToast(`Email failed: ${e.message}`, 'error');
    }
  };

  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.price * i.quantity, 0), [items]);
  const laborCost = useMemo(() => customer.hasLabor ? (customer.laborCost || 0) : 0, [customer.hasLabor, customer.laborCost]);
  
  const discountAmount = useMemo(() => {
    if (discountType === 'percentage') {
      return subtotal * (discountValue / 100);
    }
    return discountValue;
  }, [subtotal, discountValue, discountType]);

  const netTotal = useMemo(() => subtotal - discountAmount + laborCost, [subtotal, discountAmount, laborCost]);
  
  // Calculate VAT (12% of the net price)
  const vatAmount = useMemo(() => netTotal * 0.12, [netTotal]);
  
  // The grand total is the Net amount plus VAT (if enabled)
  const grandTotal = useMemo(() => showVat ? netTotal + vatAmount : netTotal, [showVat, netTotal, vatAmount]);

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
      <aside className="w-72 bg-[#0B1120] text-white flex flex-col flex-shrink-0 transition-all duration-300 z-50">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-cyan-500 rounded-xl flex items-center justify-center text-[#0B1120] font-black text-sm shadow-lg shadow-cyan-500/20">AA</div>
            <div>
              <h1 className="font-bold text-base tracking-wide text-white">AA2000</h1>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Sales Operations Suite</p>
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Workspaces</p>
              <nav className="space-y-1">
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
                    <span className="block font-bold">Quotation history</span>
                    <span className="block text-[10px] opacity-60 font-normal mt-0.5">VIEW SENT QUOTATIONS</span>
                  </div>
                </button>

                {userRole === 'ADMIN' && (
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
                )}
              </nav>
            </div>
          </div>
        </div>

        <div className="mt-auto p-6 border-t border-slate-800/50">
          <div className="flex items-center justify-between group">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold ring-2 ring-slate-800">
                {userRole === 'ADMIN' ? 'SA' : 'SE'}
              </div>
              <div>
                <p className="text-xs font-bold text-white">
                  {userRole === 'ADMIN' ? 'System Admin' : 'Sales Employee'}
                </p>
                <p className="text-[9px] text-emerald-400 font-bold tracking-wider uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Signed In
                </p>
              </div>
            </div>
            <button onClick={onLogout} className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative scroll-smooth bg-[#F8F9FA]">
        {activeTab === 'quotation' && (
          <div className="min-h-full flex flex-col">
            {/* Header */}
            <header className="px-8 py-6 flex items-start justify-between bg-[#F8F9FA] sticky top-0 z-30">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">QUOTATION STUDIO</p>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Create & refine professional quotations</h1>
              </div>
              
              <div className="flex items-center gap-4">
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
                      <CustomerForm
                        customer={customer}
                        setCustomer={setCustomer}
                        onValidationChange={setIsFormValid}
                        onExistingCustomerSelect={setSelectedExistingCustomerId}
                      />
                   </div>
                </div>

                <div className="flex flex-col gap-8">
                   <div className="w-full space-y-8">
                      <ProductList products={dynamicProducts} onAdd={addItem} />
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
                      <th className="px-6 py-4">Recipient</th>
                      <th className="px-6 py-4">Project</th>
                      <th className="px-6 py-4">Total Value</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 last:rounded-r-xl">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {savedQuotes.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-16 text-slate-400 text-sm font-medium">No quotations found in pipeline.</td></tr>
                    ) : savedQuotes.filter(q => (pipelineStatusFilter === 'ALL' || q.status === pipelineStatusFilter) && (q.id.toLowerCase().includes(pipelineSearch.toLowerCase()) || q.customer.fullName.toLowerCase().includes(pipelineSearch.toLowerCase()))).map(q => (
                      <tr key={q.id} className="hover:bg-slate-50 cursor-pointer transition-colors group" onClick={() => setSelectedQuoteId(q.id)}>
                        <td className="px-6 py-5"><span className="font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg text-xs">{q.id}</span></td>
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
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const serverId = (q as any).serverProjId;
                              if (serverId != null) {
                                void (async () => {
                                  try {
                                    await deleteQuotationProject(serverId);
                                    showToast('Project deleted from server.', 'success');
                                  } catch (err: any) {
                                    showToast(`Server delete failed: ${err?.message || 'Server error'}`, 'error');
                                  }
                                })();
                              }
                              persistQuotes(savedQuotes.filter((x) => x.id !== q.id));
                            }}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
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

        {activeTab === 'admin' && (
          <div className="p-8 max-w-7xl mx-auto">
             <AdminPanel 
              currentProducts={dynamicProducts} 
              adminLogs={adminLogs} 
              currentPipeline={savedQuotes} 
              pdfTemplate={pdfTemplate}
              onUpdateCatalog={(products, log) => {
                persistCatalog(products);
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
        total={grandTotal} 
        showVat={showVat}
        existingQuoteId={previewId} 
        onSendEmail={handleEmailAction} 
        template={pdfTemplate}
        customFileName={pdfFileName}
        onCustomFileNameChange={setPdfFileName}
      />
      {selectedQuoteId && <PipelineDetail quote={savedQuotes.find(q => q.id === selectedQuoteId)!} onClose={() => setSelectedQuoteId(null)} onUpdateStatus={(id, s) => persistQuotes(savedQuotes.map(q => q.id === id ? { ...q, status: s } : q))} onAddLog={(id, l) => persistQuotes(savedQuotes.map(q => q.id === id ? { ...q, logs: [...q.logs, l] } : q))} onRevise={(q) => { setItems(q.items); setCustomer(q.customer); setDiscountValue(q.discountValue || q.discountPercent || 0); setDiscountType(q.discountType || 'percentage'); setShowVat(q.showVat ?? true); setActiveTab('quotation'); setSelectedQuoteId(null); }} onPreviewPDF={() => { const q = savedQuotes.find(x => x.id === selectedQuoteId)!; setItems(q.items); setCustomer(q.customer); setDiscountValue(q.discountValue || q.discountPercent || 0); setDiscountType(q.discountType || 'percentage'); setPreviewId(q.id); setIsPreviewOpen(true); }} />}
    </div>
  );
};

export default Dashboard;
