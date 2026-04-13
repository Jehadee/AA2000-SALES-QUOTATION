import React from 'react';
import { termsLooksRich, termsToSanitizedHtml } from './termsHtml';

/**
 * Renders quotation term `value`: sanitized HTML (from the rich editor) or legacy
 * `{{b}}` / `{{r}}` / `**bold**`, otherwise plain text.
 */
export function TermsRichText({ text, className }: { text: string; className?: string }) {
  if (termsLooksRich(text)) {
    const safe = termsToSanitizedHtml(text);
    return <span className={className} dangerouslySetInnerHTML={{ __html: safe || '<br>' }} />;
  }
  return <span className={className}>{text}</span>;
}
