
import React, { useState, useRef, useEffect } from 'react';
import { Message } from './Dashboard';
import { Sparkles, Paperclip, Send, X, FileSpreadsheet, Image as ImageIcon } from 'lucide-react';

interface Props {
  messages: Message[];
  onSendMessage: (text: string, files?: File[]) => void;
  isProcessing: boolean;
  isFloating?: boolean;
}

const AIChat: React.FC<Props> = ({ messages, onSendMessage, isProcessing, isFloating = false }) => {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isFloating) {
      setIsMinimized(false);
    }
  }, [isFloating]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && files.length === 0) || isProcessing) return;
    onSendMessage(input, files);
    setInput('');
    setFiles([]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...selected]);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1 || items[i].type.indexOf('excel') !== -1 || items[i].type.indexOf('spreadsheetml') !== -1) {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      setFiles(prev => [...prev, ...pastedFiles]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <div className={`
      bg-white shadow-sm border border-slate-200 overflow-hidden flex flex-col transition-all duration-500 ease-in-out
      ${isFloating 
        ? `fixed bottom-6 right-6 z-[100] shadow-2xl ${isMinimized ? 'w-72 h-16 rounded-2xl' : 'w-96 h-[600px] rounded-[2rem]'}` 
        : 'relative w-full h-[600px] rounded-[2.5rem]'
      }
    `}>
      {/* Header */}
      <div className={`px-8 py-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white ${isFloating && isMinimized ? 'cursor-pointer h-full' : ''}`} onClick={() => isFloating && isMinimized && setIsMinimized(false)}>
        <div className="flex items-center gap-4">
          <div className={`
            bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 transition-all
            ${isFloating && isMinimized ? 'w-8 h-8' : 'w-12 h-12'}
          `}>
            <Sparkles size={isFloating && isMinimized ? 16 : 24} />
          </div>
          <div>
            <h3 className={`text-slate-900 font-black uppercase tracking-widest transition-all ${isFloating && isMinimized ? 'text-[10px]' : 'text-sm'}`}>
              {isFloating && isMinimized ? 'AI Assistant' : 'AA2000 AI ASSISTANT'}
            </h3>
            {!isMinimized && (
              <p className="text-indigo-600 text-[10px] font-bold uppercase tracking-widest animate-in fade-in mt-1">Smart Quotation Engine v4.0</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
           {isFloating && (
             <button 
              onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
             >
               {isMinimized ? (
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l-5-5m11 5v-4m0 4h-4m4 0l-5-5" /></svg>
               ) : (
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18 12H6" /></svg>
               )}
             </button>
           )}
           {!isMinimized && (
             <div className="flex items-center gap-2 animate-in fade-in bg-emerald-50 px-3 py-1.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] text-emerald-600 font-black uppercase tracking-widest hidden sm:inline">Online</span>
             </div>
           )}
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages Area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-slate-50/30 bg-dot-pattern">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                <div className={`max-w-[85%] p-5 text-sm shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-[1.5rem] rounded-tr-sm' 
                    : 'bg-white text-slate-700 border border-slate-100 rounded-[1.5rem] rounded-tl-sm'
                }`}>
                  <p className="leading-relaxed font-medium whitespace-pre-wrap">{msg.content}</p>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {msg.attachments.map((at, idx) => (
                        <div key={idx} className="bg-white/10 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-[10px] font-bold border border-white/20 flex items-center gap-2 overflow-hidden">
                           <Paperclip size={12} />
                           <span className="truncate">{at.name || 'Attachment'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-start animate-pulse">
                <div className="bg-white text-slate-400 border border-slate-100 rounded-[1.5rem] rounded-tl-sm p-5 text-xs font-black uppercase tracking-widest flex items-center gap-3 shadow-sm">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                  </div>
                  Analyzing Request...
                </div>
              </div>
            )}
          </div>

          {/* Input Tray */}
          <div className="p-6 bg-white border-t border-slate-100 shrink-0">
            {files.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2 animate-in slide-in-from-bottom-2">
                {files.map((f, idx) => (
                  <div key={idx} className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border border-indigo-100 flex items-center gap-2 max-w-xs">
                    {f.type.includes('image') ? <ImageIcon size={12} /> : <FileSpreadsheet size={12} />}
                    <span className="truncate">{f.name}</span>
                    <button onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))} className="hover:text-indigo-800 shrink-0 ml-1">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex gap-4 items-center relative bg-slate-50 p-2 pr-3 rounded-[1.5rem] border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
              <input 
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                accept="image/*,.xlsx,.xls"
                onChange={handleFileChange}
              />
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-10 h-10 bg-white text-slate-400 rounded-full flex items-center justify-center hover:bg-slate-100 hover:text-slate-600 transition-all shrink-0 shadow-sm border border-slate-100"
                title="Attach Excel or Image"
              >
                <Paperclip size={18} />
              </button>
              
              <input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                disabled={isProcessing}
                placeholder="Describe needs or paste image..."
                className="flex-1 bg-transparent text-slate-900 outline-none text-sm placeholder-slate-400 font-medium h-10"
              />
              
              <button 
                type="submit"
                disabled={(!input.trim() && files.length === 0) || isProcessing}
                className="w-10 h-10 bg-slate-400 text-white rounded-xl flex items-center justify-center shadow-sm hover:bg-slate-600 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale shrink-0"
              >
                <Send size={18} className={input.trim() || files.length > 0 ? "text-white" : "text-slate-200"} />
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};

export default AIChat;
