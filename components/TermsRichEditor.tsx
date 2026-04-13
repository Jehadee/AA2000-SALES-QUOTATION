import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bold, Palette, Pipette } from 'lucide-react';
import { normalizeSafeColor, termsToSanitizedHtml } from '../utils/termsHtml';

function wrapSelectionSpanStyle(editor: HTMLDivElement, style: string): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;
  const span = document.createElement('span');
  span.setAttribute('style', style);
  try {
    range.surroundContents(span);
  } catch {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  sel.removeAllRanges();
  const nr = document.createRange();
  nr.selectNodeContents(span);
  nr.collapse(false);
  sel.addRange(nr);
}

type Props = {
  value: string;
  onChange: (html: string) => void;
  className?: string;
};

/**
 * Word-like editing: Ctrl+B bold, color picker for any safe CSS color on the selection,
 * plus a red preset (bold + red) for VAT-style lines.
 */
const TermsRichEditor: React.FC<Props> = ({ value, onChange, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pickerColor, setPickerColor] = useState('#2563eb');

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    onChange(termsToSanitizedHtml(el.innerHTML));
  }, [onChange]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    const incoming = termsToSanitizedHtml(value);
    const next = incoming.trim() === '' || incoming === '<br>' ? '<br>' : incoming;
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [value]);

  const applyBold = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    document.execCommand('bold', false);
    emit();
  }, [emit]);

  const applyPickerColor = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const c = normalizeSafeColor(pickerColor);
    if (!c) return;
    el.focus();
    wrapSelectionSpanStyle(el, `color:${c}`);
    emit();
  }, [emit, pickerColor]);

  const applyRedPreset = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    wrapSelectionSpanStyle(el, 'color:#b91c1c;font-weight:700');
    emit();
  }, [emit]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          title="Bold (Ctrl+B)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={applyBold}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          <Bold size={16} strokeWidth={2.5} />
        </button>
        <span className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5" title="Pick a color, select text, then Apply">
          <Pipette size={14} className="text-slate-500 shrink-0" aria-hidden />
          <input
            type="color"
            value={pickerColor}
            onChange={(e) => setPickerColor(e.target.value)}
            className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
            aria-label="Text color"
          />
          <button
            type="button"
            title="Apply selected color to highlighted text"
            onMouseDown={(e) => e.preventDefault()}
            onClick={applyPickerColor}
            className="rounded px-2 py-1 text-[10px] font-bold uppercase text-slate-700 hover:bg-slate-50"
          >
            Apply
          </button>
        </span>
        <button
          type="button"
          title="Red + bold preset (e.g. VAT EXCLUDED)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={applyRedPreset}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-bold text-red-700 hover:bg-red-50"
        >
          <Palette size={14} />
          Red
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        onInput={emit}
        onBlur={emit}
        onKeyDown={(e) => {
          if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
            e.preventDefault();
            ref.current?.focus();
            document.execCommand('bold', false);
            emit();
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const t = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, t);
          emit();
        }}
        className={
          'min-h-[3.5rem] rounded-md border border-slate-200 bg-white px-2 py-2 text-[8pt] font-normal normal-case leading-snug text-neutral-900 outline-none focus:border-indigo-500 ' +
          (className || '')
        }
      />
    </div>
  );
};

export default TermsRichEditor;
