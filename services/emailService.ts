import { CustomerInfo } from '../types';
import { blobToBase64 } from './pdfService';

/**
 * CONFIGURATION: 
 * You MUST replace these placeholder strings with your actual keys from EmailJS (https://www.emailjs.com/)
 * To find these: Visit Dashboard -> Account (Public Key) and Email Services (Service ID).
 */
const EMAILJS_PUBLIC_KEY: string = "YOUR_PUBLIC_KEY"; 
const EMAILJS_SERVICE_ID: string = "YOUR_SERVICE_ID"; 
const EMAILJS_TEMPLATE_ID: string = "YOUR_TEMPLATE_ID";

export const sendQuotationEmail = async (
  customer: CustomerInfo, 
  pdfBlob: Blob, 
  quotationNo: string
) => {
  const emailjs = (window as any).emailjs;
  if (!emailjs) {
    throw new Error("Email engine (EmailJS) failed to initialize.");
  }

  // SIMULATION MODE:
  // If keys are still placeholders, we simulate a successful send so the UI workflow works.
  if (EMAILJS_PUBLIC_KEY === "YOUR_PUBLIC_KEY" || !EMAILJS_PUBLIC_KEY || EMAILJS_PUBLIC_KEY.trim() === "") {
    console.warn("EmailJS keys are not set. Simulating email dispatch for demonstration purposes.");
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
    return { status: 200, text: "Simulated Success" };
  }

  const base64Pdf = await blobToBase64(pdfBlob);

  const templateParams = {
    to_email: customer.email,
    to_name: customer.fullName,
    from_name: "AA2000 Sales Pro",
    quotation_no: quotationNo,
    message: `Greetings ${customer.fullName}, please find the attached official Sales Quotation (${quotationNo}) from AA2000 Security and Technology Solutions.`,
    content: base64Pdf 
  };

  try {
    const response = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams, EMAILJS_PUBLIC_KEY);
    console.log("Email Successfully Dispatched:", response);
    return response;
  } catch (error: any) {
    console.error("EmailJS Error Payload:", error);
    
    // Provide specific guidance based on common EmailJS errors
    if (error.status === 400) {
      throw new Error(`EmailJS Error (400): ${error.text || 'Invalid configuration. Verify your Service ID and Public Key.'}`);
    }
    
    throw new Error(`Email service failed: ${error.text || error.message || 'Unknown error'}`);
  }
};