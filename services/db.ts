
import Dexie, { Table } from 'dexie';
import { Product, QuotationRecord, AdminLog, PDFTemplate, SelectedItem, CustomerInfo, PaymentMethod, QuotationStatus, LaborService, UploadedFile } from '../types';

export interface AppState {
  id: string;
  items: SelectedItem[];
  uploadedFiles?: UploadedFile[];
  laborServices: LaborService[];
  customer: CustomerInfo;
  paymentMethod: PaymentMethod;
  discountPercent: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  showVat: boolean;
  currentStatus: QuotationStatus;
  pdfFileName?: string;
  referenceCode?: string;
}

export class AA2000Database extends Dexie {
  catalog!: Table<Product>;
  pipeline!: Table<QuotationRecord>;
  adminLogs!: Table<AdminLog>;
  settings!: Table<{ key: string; value: any }>;
  appState!: Table<AppState>;

  constructor() {
    super('AA2000Database');
    this.version(1).stores({
      catalog: '++id, model, name',
      pipeline: 'id, createdAt, status',
      adminLogs: 'id, timestamp, type',
      settings: 'key',
      appState: 'id'
    });
  }
}

export const db = new AA2000Database();

// Helper functions for common operations
export const saveCatalog = async (products: Product[]) => {
  await db.catalog.clear();
  await db.catalog.bulkAdd(products);
};

export const savePipeline = async (quotes: QuotationRecord[]) => {
  await db.pipeline.clear();
  await db.pipeline.bulkAdd(quotes);
};

export const saveAdminLogs = async (logs: AdminLog[]) => {
  await db.adminLogs.clear();
  await db.adminLogs.bulkAdd(logs);
};

export const saveSettings = async (key: string, value: any) => {
  await db.settings.put({ key, value });
};

export const getSettings = async (key: string) => {
  const entry = await db.settings.get(key);
  return entry ? entry.value : null;
};

export const saveCurrentAppState = async (state: AppState) => {
  await db.appState.put(state);
};

export const getCurrentAppState = async () => {
  return await db.appState.get('current');
};
