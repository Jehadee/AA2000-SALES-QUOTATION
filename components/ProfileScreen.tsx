import React from 'react';
import { User, RefreshCw, Shield, KeyRound, Building2, Mail, Phone, BadgeCheck } from 'lucide-react';
import type { SessionUserProfile } from '../types';
import { profileImageDataUrl } from '../services/sessionProfile';

function maskToken(token: string | null | undefined): string {
  if (!token) return '—';
  const t = String(token);
  if (t.length <= 8) return '•'.repeat(Math.min(t.length, 6));
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

interface ProfileScreenProps {
  profile: SessionUserProfile;
  isRefreshing: boolean;
  onRefresh: () => void;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({ profile, isRefreshing, onRefresh }) => {
  const img = profileImageDataUrl(profile.employee?.Emp_imageBase64 ?? null);
  const emp = profile.employee;

  return (
    <div className="p-8 max-w-3xl mx-auto min-h-full">
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 mb-10">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Account</p>
            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <User size={26} className="text-indigo-600" strokeWidth={2} />
              Profile
            </h2>
            <p className="text-sm text-slate-500 mt-2 max-w-lg">
              Details loaded from your launch session. Refresh to sync the latest account and employee record from the server.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh from session
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-8 mb-10 pb-10 border-b border-slate-100">
          <div className="shrink-0">
            {img ? (
              <img
                src={img}
                alt=""
                className="w-28 h-28 rounded-2xl object-cover ring-2 ring-slate-100 shadow-md"
              />
            ) : (
              <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-indigo-600 to-slate-700 text-white flex items-center justify-center text-2xl font-black ring-2 ring-slate-100 shadow-md">
                {profile.initials}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="text-xl font-black text-slate-900">{profile.displayName}</h3>
            {profile.username && (
              <p className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <BadgeCheck size={16} className="text-emerald-600 shrink-0" />
                {profile.username}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              {profile.role_name && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                  <Shield size={12} />
                  {profile.role_name}
                </span>
              )}
              {profile.status != null && String(profile.status).trim() !== '' && (
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 text-[10px] font-bold uppercase tracking-wider text-emerald-800 border border-emerald-100">
                  {String(profile.status)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <section className="rounded-2xl bg-slate-50 border border-slate-100 p-5 space-y-4">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <KeyRound size={14} />
              Session & credentials
            </h4>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Account ID (acc_ID)</dt>
                <dd className="font-mono font-semibold text-slate-900 mt-0.5">{profile.acc_ID ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Session ID</dt>
                <dd className="font-mono font-semibold text-slate-900 mt-0.5">{profile.sessionId ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Session token</dt>
                <dd className="font-mono text-xs text-slate-700 mt-0.5 break-all">{maskToken(profile.sessionToken)}</dd>
              </div>
              {profile.sessionCreatedAt && (
                <div>
                  <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Session created</dt>
                  <dd className="text-slate-700 mt-0.5">{profile.sessionCreatedAt}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-2xl bg-slate-50 border border-slate-100 p-5 space-y-4">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Building2 size={14} />
              Employee record
            </h4>
            {!emp ? (
              <p className="text-sm text-slate-500">No employee row linked to this account.</p>
            ) : (
              <dl className="space-y-3 text-sm">
                {emp.Emp_ID != null && (
                  <div>
                    <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee ID</dt>
                    <dd className="font-mono font-semibold text-slate-900 mt-0.5">{emp.Emp_ID}</dd>
                  </div>
                )}
                {emp.Emp_IDno != null && String(emp.Emp_IDno).trim() !== '' && (
                  <div>
                    <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ID number</dt>
                    <dd className="text-slate-800 mt-0.5">{emp.Emp_IDno}</dd>
                  </div>
                )}
                {(emp.Emp_email != null && String(emp.Emp_email).trim() !== '') && (
                  <div className="flex items-start gap-2">
                    <Mail size={16} className="text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email</dt>
                      <dd className="text-slate-800 mt-0.5 break-all">{emp.Emp_email}</dd>
                    </div>
                  </div>
                )}
                {(emp.Emp_cnum != null && String(emp.Emp_cnum).trim() !== '') && (
                  <div className="flex items-start gap-2">
                    <Phone size={16} className="text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phone</dt>
                      <dd className="text-slate-800 mt-0.5">{emp.Emp_cnum}</dd>
                    </div>
                  </div>
                )}
                {emp.Emp_AddressID != null && (
                  <div>
                    <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Address ID</dt>
                    <dd className="font-mono text-slate-800 mt-0.5">{emp.Emp_AddressID}</dd>
                  </div>
                )}
              </dl>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default ProfileScreen;
