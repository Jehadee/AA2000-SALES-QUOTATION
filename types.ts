
export type UserRole = 'ADMIN' | 'SALES';

export interface Product {
  id: number;
  model: string;
  name: string;
  description: string;
  brand: string;
  baseCost: number; // The internal purchase cost before markup
  price: number; // The default selling price
  category?: string;
  dealerPrice?: number;
  contractorPrice?: number;
  endUserPrice?: number;
  dealerBigVolumePrice?: number;
  contractorBigVolumePrice?: number;
  endUserBigVolumePrice?: number;
}

export interface SelectedItem extends Product {
  quantity: number;
  sourceFileId?: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  timestamp: string;
}

export enum ClientType {
  DEALER = 'DEALER',
  SYSTEM_CONTRACTOR = 'SYSTEM_CONTRACTOR',
  END_USER = 'END_USER',
  GOVERNMENT = 'GOVERNMENT'
}

export interface CustomerInfo {
  fullName: string;
  fname: string;
  mname: string;
  lname: string;
  attentionTo: string;
  position: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  latitude?: number;
  longitude?: number;
  street?: string;
  municipality?: string;
  province?: string;
  postal?: string;
  projectFor: string;
  projectSite: string;
  clientType: ClientType;
  hasLabor?: boolean;
  laborScope?: string;
  laborCost?: number;
  mobilizationDate?: string;
  siteContactName?: string;
  siteContactPhone?: string;
}

export enum PaymentMethod {
  BANK_TRANSFER = 'Bank Transfer',
  CREDIT_CARD = 'Credit Card',
  CASH = 'Cash',
  COMPANY_CHECK = 'Company Check'
}

export enum QuotationStatus {
  INQUIRY = 'Customer Inquiry',
  REQUIREMENTS = 'Requirements Gathering',
  PREPARATION = 'Quote Preparation',
  REVIEW = 'Internal Review',
  DELIVERY = 'Quote Delivery',
  FOLLOWUP = 'Follow-up',
  NEGOTIATION = 'Negotiation',
  DECISION = 'Customer Decision',
  ACCEPTED = 'Order Confirmed',
  REJECTED = 'Close / Nurture'
}

export interface FollowUpLog {
  date: string;
  note: string;
  nextActionDate?: string;
  user: string;
}

export interface AdminLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  type: 'IMPORT' | 'DELETE' | 'RESET' | 'SYSTEM' | 'RESTORE';
}

export interface Attachment {
  name: string;
  type: string;
  data: string; // Base64 encoded file content
  timestamp: string;
}

export interface LaborService {
  id: string;
  name: string;
  description: string;
  price: number;
}

export interface QuotationRecord {
  id: string;
  items: SelectedItem[];
  laborServices: LaborService[];
  customer: CustomerInfo;
  paymentMethod: PaymentMethod;
  discountPercent: number; // Keep for backward compatibility or remove if not needed
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  showVat: boolean;
  status: QuotationStatus;
  total: number;
  createdAt: string;
  logs: FollowUpLog[];
  attachments: Attachment[];
  version: number;
}

export interface PDFTemplate {
  companyInfo: {
    name: string;
    address: string;
    phone: string;
    mobile: string;
    email: string;
    website: string;
    logoUrl?: string;
    logoWidth?: number;
    logoXOffset?: number;
    logoYOffset?: number;
    headerImage?: {
      url: string;
      width: number;
      height: number;
      yOffset?: number;
    };
    companyNameStyle?: {
      fontSize?: number;
      color?: string;
      fontWeight?: string;
      fontFamily?: string;
      italic?: boolean;
    };
  };
  notesAndRemarks: string[];
  termsAndConditions: { key: string; value: string }[];
  paymentTerms: {
    supplyOfDevices: string;
    supplyOfLabor: string;
  };
  paymentDetails: {
    bankName: string;
    accountNumber: string;
    accountName: string;
  };
  warrantyPeriod: string[];
  availability: string[];
  signatories: {
    preparedBy: {
      name: string;
      position: string;
      signatureUrl?: string;
    };
    authorizedRepresentative: {
      label: string;
      name?: string;
      signatureUrl?: string;
    };
  };
  adsBannerUrl?: string;
}

export interface SystemBackup {
  version: string;
  timestamp: string;
  catalog: Product[];
  pipeline: QuotationRecord[];
  logs: AdminLog[];
  pdfTemplate?: PDFTemplate;
}
