import type { PDFTemplate } from '../types';
import { DEFAULT_PDF_TEMPLATE } from '../constants';
import { migrateMarkersToHtml, sanitizeTermsHtml, stringToPlainForCompare } from './termsHtml';

/**
 * - Converts legacy `{{b}}` / `{{r}}` strings to sanitized HTML.
 * - If a row matches the default wording (plain-text compare), replaces with canonical default HTML.
 */
export function upgradeTermsFromLegacy(template: PDFTemplate): PDFTemplate {
  if (!Array.isArray(template.termsAndConditions) || template.termsAndConditions.length === 0) {
    return template;
  }
  const defaults = DEFAULT_PDF_TEMPLATE.termsAndConditions;
  let changed = false;
  const terms = template.termsAndConditions.map((term) => {
    if (/\{\{/.test(term.value)) {
      changed = true;
      return { ...term, value: sanitizeTermsHtml(migrateMarkersToHtml(term.value)) };
    }
    const def = defaults.find((d) => d.key === term.key);
    if (def && stringToPlainForCompare(term.value) === stringToPlainForCompare(def.value)) {
      if (term.value !== def.value) changed = true;
      return { ...term, value: def.value };
    }
    return term;
  });
  return changed ? { ...template, termsAndConditions: terms } : template;
}
