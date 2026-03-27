import React from 'react';
import { QuotationStatus } from '../types';

interface Props {
  currentStatus: QuotationStatus;
}

// Mapped exactly to the provided Flowchart Image
const STEPS = [
  { 
    status: QuotationStatus.INQUIRY, 
    label: 'Inquiry', 
    icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' 
  },
  { 
    status: QuotationStatus.REQUIREMENTS, 
    label: 'Requirements', 
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' 
  },
  { 
    status: QuotationStatus.PREPARATION, 
    label: 'Preparation', 
    icon: 'M9 7h6m0 2H9m3 4v-6m-2 8h4m-2 2v-2m1 8h-4a2 2 0 01-2-2V5a2 2 0 012-2h8a2 2 0 012 2v14a2 2 0 01-2 2h-4z' 
  },
  { 
    status: QuotationStatus.REVIEW, 
    label: 'Internal Review', 
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l3 3m0 0l-3-3m3 3L9 12' 
  },
  { 
    status: QuotationStatus.DELIVERY, 
    label: 'Quote Delivery', 
    icon: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8' 
  },
  { 
    status: QuotationStatus.FOLLOWUP, 
    label: 'Follow-up', 
    icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' 
  },
  { 
    status: QuotationStatus.NEGOTIATION, 
    label: 'Negotiation', 
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' 
  },
  {
    status: QuotationStatus.DECISION,
    label: 'Decision',
    icon: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3' 
  },
  { 
    status: QuotationStatus.ACCEPTED, 
    label: 'Confirmed', 
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' 
  }
];

const FlowchartProgress: React.FC<Props> = ({ currentStatus }) => {
  let currentIndex = STEPS.findIndex(s => s.status === currentStatus);
  const isTerminalRejected = currentStatus === QuotationStatus.REJECTED;

  // If rejected, highlight up to Decision but in red
  if (isTerminalRejected) {
    currentIndex = STEPS.findIndex(s => s.status === QuotationStatus.DECISION); 
  }

  return (
    <div className="w-full bg-white rounded-[1.5rem] py-6 px-8 border border-slate-200 shadow-sm mb-6 overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Process Flowchart</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Live Workflow Status</p>
        </div>
        <div className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${isTerminalRejected ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'}`}>
          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isTerminalRejected ? 'bg-red-500' : 'bg-indigo-500'}`}></span>
          {currentStatus}
        </div>
      </div>

      <div className="relative flex items-center justify-between">
        {/* Background Line */}
        <div className="absolute left-0 top-[18px] -translate-y-1/2 h-0.5 bg-slate-100 w-full z-0"></div>
        
        {/* Active Progress Line */}
        <div 
          className={`absolute left-0 top-[18px] -translate-y-1/2 h-0.5 z-0 transition-all duration-700 ${isTerminalRejected ? 'bg-red-500' : 'bg-indigo-600'}`}
          style={{ width: currentIndex >= 0 ? `${(currentIndex / (STEPS.length - 1)) * 100}%` : '0%' }}
        ></div>

        {STEPS.map((step, idx) => {
          const isCompleted = idx <= currentIndex;
          const isActive = idx === currentIndex;
          const isRejectedNode = isTerminalRejected && step.status === QuotationStatus.DECISION;

          return (
            <div key={step.label} className="relative z-10 flex flex-col items-center gap-2 group">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-500 border-[3px] ${
                isRejectedNode
                  ? 'bg-red-600 text-white border-red-100 shadow-md shadow-red-500/20'
                  : isActive 
                    ? 'bg-indigo-600 text-white border-indigo-100 shadow-md shadow-indigo-500/20 scale-110' 
                    : isCompleted 
                      ? 'bg-indigo-50 text-indigo-600 border-white' 
                      : 'bg-white text-slate-200 border-slate-50'
              }`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={step.icon} />
                </svg>
              </div>
              
              <span className={`text-[7px] font-black uppercase tracking-tight text-center max-w-[60px] transition-colors ${
                isRejectedNode ? 'text-red-600' : isActive ? 'text-indigo-600' : 'text-slate-300'
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FlowchartProgress;