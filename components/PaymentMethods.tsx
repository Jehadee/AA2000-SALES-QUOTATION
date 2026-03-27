
import React from 'react';
import { PaymentMethod } from '../types';

interface Props {
  selected: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  total: number;
}

const METHODS = [
  { id: PaymentMethod.BANK_TRANSFER, name: 'Bank Transfer', desc: 'Direct bank deposit', fee: 'No fees' },
  { id: PaymentMethod.CREDIT_CARD, name: 'Credit Card', desc: 'Visa, Mastercard', fee: '+3% processing fee' },
  { id: PaymentMethod.CASH, name: 'Cash', desc: 'Cash on delivery', fee: 'Orders < ₱50k only' },
  { id: PaymentMethod.COMPANY_CHECK, name: 'Company Check', desc: 'Post-dated accepted', fee: 'No fees' },
];

const PaymentMethods: React.FC<Props> = ({ selected, onChange, total }) => {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
        </div>
        <h2 className="text-lg font-semibold">Payment Method</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {METHODS.map((m) => {
          const isDisabled = m.id === PaymentMethod.CASH && total > 50000;
          const isSelected = selected === m.id;
          
          return (
            <button
              key={m.id}
              disabled={isDisabled}
              onClick={() => onChange(m.id)}
              className={`flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                isSelected 
                  ? 'border-blue-500 bg-blue-50/50' 
                  : 'border-slate-100 bg-slate-50 hover:border-slate-300'
              } ${isDisabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
            >
              <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {m.id === PaymentMethod.BANK_TRANSFER && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 21v-4m18 4v-4M3 10h18M5 10V7a3 3 0 013-3h8a3 3 0 013 3v3M1 21h22" />}
                  {m.id === PaymentMethod.CREDIT_CARD && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />}
                  {m.id === PaymentMethod.CASH && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
                  {m.id === PaymentMethod.COMPANY_CHECK && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />}
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-semibold text-slate-800">{m.name}</span>
                  {isSelected && (
                    <div className="bg-blue-600 text-white p-0.5 rounded-full">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-1">{m.desc}</p>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${m.fee === 'No fees' ? 'text-green-600' : 'text-orange-500'}`}>
                  {m.fee}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      
      <div className="mt-6 p-4 bg-amber-50 border-l-4 border-amber-400 rounded-lg">
        <h4 className="text-sm font-semibold text-amber-800 mb-1">Important Note:</h4>
        <p className="text-xs text-amber-700 leading-relaxed">
          Standard payment terms are Net 30 days. Late payments may incur a 1.5% monthly interest fee.
        </p>
      </div>
    </section>
  );
};

export default PaymentMethods;
