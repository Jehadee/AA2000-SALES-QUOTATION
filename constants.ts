
import { Product, PDFTemplate, ClientType, CustomerInfo } from './types';

// Helper to initialize price at SRP Small (1.5x)
const createProd = (id: number, model: string, name: string, description: string, brand: string, baseCost: number, category: string): Product => ({
  id,
  model,
  name,
  description,
  brand,
  baseCost,
  price: baseCost * 1.5,
  category
});

export const PRODUCTS: Product[] = [];

export const COMPANY_DETAILS = {
  name: "AA2000 Security and Technology Solutions Inc.",
  address: "Unit 2C Norkis Building 11 Calbayog St. cor. Libertad, Highway Hills, Mandaluyong City, Philippines 1550",
  phone: "(02) 8571-56-93; 7155-7010 / M: 09171557010",
  email: "info.aa2000@gmail.com / aa2000ent@gmail.com",
  website: "www.aa2000ph.com",
  vatRate: 0.12
};

export const INITIAL_CUSTOMER: CustomerInfo = {
  fullName: '',
  fname: '',
  mname: '',
  lname: '',
  attentionTo: '',
  position: '',
  companyName: '',
  email: '',
  phone: '',
  address: '',
  projectFor: '',
  projectSite: '',
  clientType: ClientType.SYSTEM_CONTRACTOR,
  hasLabor: false,
  laborScope: '',
  laborCost: 0,
  mobilizationDate: '',
  siteContactName: '',
  siteContactPhone: ''
};

export const DEFAULT_PDF_TEMPLATE: PDFTemplate = {
  companyInfo: {
    name: "AA2000 Security and Technology Solutions Inc.",
    brandName: "AA2000",
    tagline: "Security and Technology Solutions Inc.",
    address:
      "UNIT 2C NORKIS BUILDING 11 CALBAYOG ST. COR.\nLIBERTAD, HIGHWAY HILLS, MANDALUYONG CITY,\nPHILIPPINES 1550",
    phone: "(02) 8571-56-93; 7155-7010",
    mobile: "09171557010",
    email: "INFO.AA2000@GMAIL.COM / AA2000ENT@GMAIL.COM",
    website: "WWW.AA2000PH.COM",
    companyNameStyle: {
      fontSize: 22,
      color: "#004a8d",
      fontWeight: "900",
      fontFamily: "Inter",
      italic: false
    }
  },
  notesAndRemarks: [
    "Any additional services and materials that are not included in this quotation",
    "Any additional civil and engineering works. Signed and seale of Professional Engineer.",
    "Insurance Policy or Bonds",
    "Scaffolding Rental, Delivery and Pullout - if required",
    "Professional project assistance (SAFETY OFFICER) – As Required",
    "COVID-19 Related requirements."
  ],
  termsAndConditions: [
    { key: "A", value: "Unless specified, above given prices are VAT Included." },
    { key: "B", value: "Prices are based on cost and conditions existing on date of quotation and are SUBJECT TO CHANGE BY THE SELLER UPON FINAL ACCEPTANCE." },
    { key: "C", value: "Others: Any other materials/equipment/permits/installation/bonds works not stated herein shall be considered as ADDITIONAL COST." },
    { key: "D", value: "Warehouse Charges/Penalties: There will be a 500 pesos penalty per day, if devices are not picked up upon notice of availability" },
    { key: "E", value: "A penalty charge of 40% of the total contract price will be imposed for cancellation of Purchase Order." },
    { key: "F", value: "LATE PAYMENT PENALTY CHARGE: Any payments not made within the specified period of time, it will incur an interest charge at the rate of 1% of the total contract/P.O. price." },
    { key: "G", value: "Delivery: For client charge or Pick up by Client. (For Supply Only)" }
  ],
  paymentTerms: {
    supplyOfDevices: "50% Downpayment ; 50% Upon pick up/delivery of the items.",
    supplyOfLabor: "50% Downpayment ; 50% Upon Completion."
  },
  paymentDetails: {
    bankName: "BDO",
    accountNumber: "006930089663",
    accountName: "AA2000 Security and Technology Solution Inc."
  },
  warrantyPeriod: [
    "Product Warranty: 1 year",
    "7 Days Replacement against Factory Defects."
  ],
  availability: [
    "2-4 working days if on stock upon receipt of P.O and downpayment.",
    "12-16 weeks if No Stock/Pre-order basis.",
    "Note: Stocks of goods are subject for confirmation upon order."
  ],
  signatories: {
    preparedBy: {
      name: "Ms. Mary Grace Alviar",
      position: "Sales Officer"
    },
    authorizedRepresentative: {
      label: "Authorized Representative",
      name: ""
    }
  },
  adsBannerUrl: ""
};
