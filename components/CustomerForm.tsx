import React, { useState, useEffect, useRef } from 'react';
import { CustomerInfo, ClientType } from '../types';
import { INITIAL_CUSTOMER } from '../constants';
import { Trash2, MapPin, Crosshair } from 'lucide-react';
import { reverseGeocode, searchPlaces } from '../services/geocoding';
import LocationPicker, { type LatLon } from './LocationPicker';

const DEFAULT_LOCATION: LatLon = { lat: 14.5995, lon: 120.9842 };

interface Props {
  customer: CustomerInfo;
  setCustomer: React.Dispatch<React.SetStateAction<CustomerInfo>>;
  onValidationChange: (isValid: boolean) => void;
}

const CustomerForm: React.FC<Props> = React.memo(({ customer, setCustomer, onValidationChange }) => {
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [location, setLocation] = useState<LatLon | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [locQuery, setLocQuery] = useState('');
  const [locResults, setLocResults] = useState<{ displayName: string; lat: number; lon: number }[]>([]);

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (!customer.fname?.trim()) newErrors.fname = 'First name is required';
    if (!customer.lname?.trim()) newErrors.lname = 'Last name is required';
    if (!customer.email?.trim()) newErrors.email = 'Email address is required';
    if (!customer.phone) {
      newErrors.phone = 'Phone number is required';
    } else if (customer.phone.length !== 11) {
      newErrors.phone = 'Phone number must be exactly 11 digits';
    }
    
    setErrors(newErrors);
    onValidationChange(Object.keys(newErrors).length === 0);
  };

  useEffect(() => {
    validate();
  }, [customer]);

  const handleChange = (field: keyof CustomerInfo, value: any) => {
    setCustomer(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'fname' || field === 'mname' || field === 'lname') {
        next.fullName = [next.fname, next.mname, next.lname].filter(Boolean).join(' ').trim();
      }
      return next;
    });
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const numericValue = val.replace(/[^\d]/g, '').slice(0, 11);
    handleChange('phone', numericValue);
  };

  const applyReverseGeocode = async (lat: number, lon: number) => {
    console.log('[CustomerForm] applyReverseGeocode called', { lat, lon });
    try {
      const addr = await reverseGeocode(lat, lon);
      console.log('[CustomerForm] reverseGeocode result', addr);
      const street = addr.street ?? '';
      const municipality = addr.city ?? '';
      const province = addr.province ?? '';
      const postal = addr.postcode ?? '';
      const pieces = [street, municipality, province, postal].filter(Boolean);
      const addressStr = pieces.length ? pieces.join(', ') : `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      setCustomer((prev) => ({
        ...prev,
        address: addressStr,
        latitude: lat,
        longitude: lon,
        street: street || undefined,
        municipality: municipality || undefined,
        province: province || undefined,
        postal: postal || undefined,
      }));
    } catch {
      console.warn('[CustomerForm] reverseGeocode failed, falling back to raw coordinates');
      setCustomer((prev) => ({
        ...prev,
        address: prev.address || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        latitude: lat,
        longitude: lon,
      }));
    }
  };

  const handleUseCurrentLocation = () => {
    console.log('[CustomerForm] handleUseCurrentLocation clicked');
    if (!('geolocation' in navigator)) {
      setLocError('Location not supported in this browser.');
      return;
    }
    setLocError(null);
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        console.log('[CustomerForm] geolocation success', pos.coords);
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setLocation({ lat, lon });
        await applyReverseGeocode(lat, lon);
        setLocLoading(false);
      },
      (err) => {
        console.error('[CustomerForm] geolocation error', err);
        setLocError(err.message || 'Failed to get current location.');
        setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleRecenter = () => {
    setLocation((prev) => (prev ? { ...prev } : DEFAULT_LOCATION));
  };

  const handleSearchPlace = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = locQuery.trim();
    if (!q) return;
    setLocError(null);
    setLocLoading(true);
    try {
      const mapped = await searchPlaces(q);
      setLocResults(mapped);
      if (!mapped.length) setLocError('No places found. Try a more specific search.');
    } catch (err) {
      setLocError(err instanceof Error ? err.message : 'Failed to search for that place.');
      setLocResults([]);
    } finally {
      setLocLoading(false);
    }
  };

  return (
    <section className="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-4 sm:p-6 lg:p-8 transition-all hover:shadow-md">
      <div className="flex items-center gap-4 mb-6 sm:mb-8">
        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
        </div>
        <div className="flex-1">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">Recipient Details</h2>
          <p className="text-xs sm:text-sm text-slate-500 font-bold uppercase tracking-widest mt-0.5">Project Information Grid</p>
        </div>
        <button 
          type="button"
          onClick={() => setCustomer(INITIAL_CUSTOMER)}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
        >
          <Trash2 size={14} />
          CLEAR DETAILS
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">First Name <span className="text-red-500">*</span></label>
          <input 
            type="text"
            value={customer.fname ?? ''}
            onChange={(e) => handleChange('fname', e.target.value)}
            className={`w-full p-3 sm:p-4 text-sm bg-slate-50 border-2 ${errors.fname ? 'border-red-300' : 'border-slate-100'} rounded-2xl focus:border-indigo-500 outline-none transition-all`}
            placeholder="e.g. Gemmalyn"
          />
          {errors.fname && <p className="text-[10px] text-red-500 font-bold ml-1">{errors.fname}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Middle Name</label>
          <input 
            type="text"
            value={customer.mname ?? ''}
            onChange={(e) => handleChange('mname', e.target.value)}
            className="w-full p-3 sm:p-4 text-sm bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all"
            placeholder="e.g. Santos"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Last Name <span className="text-red-500">*</span></label>
          <input 
            type="text"
            value={customer.lname ?? ''}
            onChange={(e) => handleChange('lname', e.target.value)}
            className={`w-full p-3 sm:p-4 text-sm bg-slate-50 border-2 ${errors.lname ? 'border-red-300' : 'border-slate-100'} rounded-2xl focus:border-indigo-500 outline-none transition-all`}
            placeholder="e.g. Ventur"
          />
          {errors.lname && <p className="text-[10px] text-red-500 font-bold ml-1">{errors.lname}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Email <span className="text-red-500">*</span></label>
          <input 
            type="email"
            value={customer.email ?? ''}
            onChange={(e) => handleChange('email', e.target.value)}
            className={`w-full p-3 sm:p-4 text-sm bg-slate-50 border-2 ${errors.email ? 'border-red-300' : 'border-slate-100'} rounded-2xl focus:border-indigo-500 outline-none transition-all`}
            placeholder="e.g. name@company.com"
          />
          {errors.email && <p className="text-[10px] text-red-500 font-bold ml-1">{errors.email}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Tel/Mobile No. (11 digits) <span className="text-red-500">*</span></label>
          <input 
            type="text"
            value={customer.phone ?? ''}
            onChange={handlePhoneChange}
            className={`w-full p-3 sm:p-4 text-sm bg-slate-50 border-2 ${errors.phone ? 'border-red-300' : 'border-slate-100'} rounded-2xl focus:border-indigo-500 outline-none transition-all font-mono`}
            placeholder="09XXXXXXXXX"
            maxLength={11}
          />
          {errors.phone && <p className="text-[10px] text-red-500 font-bold ml-1">{errors.phone}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Position</label>
          <input 
            type="text"
            value={customer.position}
            onChange={(e) => handleChange('position', e.target.value)}
            className="w-full p-3 sm:p-4 text-sm bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Company Name</label>
          <input 
            type="text"
            value={customer.companyName}
            onChange={(e) => handleChange('companyName', e.target.value)}
            className="w-full p-3 sm:p-4 text-sm bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Address</label>
          <input 
            type="text"
            value={customer.address}
            onChange={(e) => handleChange('address', e.target.value)}
            className="w-full p-3 sm:p-4 text-sm bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all"
          />
          {(customer.latitude != null && customer.longitude != null) && (
            <p className="mt-1.5 text-[10px] text-slate-500 font-medium">
              Lat: {customer.latitude.toFixed(6)}, Long: {customer.longitude.toFixed(6)}
            </p>
          )}
        </div>

        <div className="md:col-span-2 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <MapPin className="h-4 w-4 text-indigo-600" />
              <span className="font-medium">Pin recipient location (optional)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={locLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-all"
              >
                <Crosshair className="h-3.5 w-3.5" />
                {locLoading ? 'Locating…' : 'Use current location'}
              </button>
              <button
                type="button"
                onClick={() => { setLocation(DEFAULT_LOCATION); applyReverseGeocode(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon); }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all"
              >
                Recenter map
              </button>
            </div>
          </div>
          {location !== null && (
            <div className="space-y-2">
              <form onSubmit={handleSearchPlace} className="flex flex-wrap gap-2 items-center">
                <input
                  type="text"
                  value={locQuery}
                  onChange={(e) => setLocQuery(e.target.value)}
                  placeholder="Search place, street, city..."
                  className="flex-1 min-w-0 border-2 border-slate-100 rounded-xl px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 outline-none"
                />
                <button
                  type="submit"
                  disabled={locLoading}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-60 transition-all"
                >
                  {locLoading ? 'Searching…' : 'Search'}
                </button>
              </form>
              {locResults.length > 0 && (
                <div className="space-y-1">
                  {locResults.map((r, idx) => (
                    <button
                      key={`${r.lat}-${r.lon}-${idx}`}
                      type="button"
                      onClick={async () => {
                        setLocation({ lat: r.lat, lon: r.lon });
                        setLocQuery(r.displayName);
                        setLocResults([]);
                        await applyReverseGeocode(r.lat, r.lon);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      {r.displayName}
                    </button>
                  ))}
                </div>
              )}
              <LocationPicker
                location={location}
                onChange={async (loc) => {
                  setLocation(loc);
                  await applyReverseGeocode(loc.lat, loc.lon);
                }}
              />
              <p className="text-[10px] text-slate-400 font-medium">
                Drag the pin or click on the map to adjust. Address above updates automatically.
              </p>
            </div>
          )}
          {location === null && (
            <button
              type="button"
              onClick={() => setLocation(DEFAULT_LOCATION)}
              className="w-full py-3 rounded-xl border-2 border-dashed border-slate-200 text-sm font-bold text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all"
            >
              Show map to pin location
            </button>
          )}
          {locError && <p className="text-xs font-bold text-red-600">{locError}</p>}
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Project For</label>
          <input 
            type="text"
            value={customer.projectFor}
            onChange={(e) => handleChange('projectFor', e.target.value)}
            className="w-full p-3 sm:p-4 text-sm bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all"
            placeholder="e.g. 22-Storey Building with Roof Deck, Pasig City"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Project Site</label>
          <input 
            type="text"
            value={customer.projectSite}
            onChange={(e) => handleChange('projectSite', e.target.value)}
            className="w-full p-3 sm:p-4 text-sm bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Client Category</label>
          <select 
            value={customer.clientType}
            onChange={(e) => handleChange('clientType', e.target.value)}
            className="w-full p-3 sm:p-4 text-sm bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none appearance-none"
          >
            <option value={ClientType.SYSTEM_CONTRACTOR}>System Contractor (20% Disc)</option>
            <option value={ClientType.END_USER}>End User</option>
            <option value={ClientType.DEALER}>Dealer</option>
          </select>
        </div>

        <div className="md:col-span-2 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Labor Services</h3>
              <p className="text-[10px] text-slate-500 font-medium">Does this project require installation or labor?</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input 
                type="checkbox" 
                checked={customer.hasLabor || false} 
                onChange={(e) => handleChange('hasLabor', e.target.checked)}
                className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[1.2rem] rtl:peer-checked:after:-translate-x-[1.2rem] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          {customer.hasLabor && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 animate-in slide-in-from-top-2 duration-300">
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Scope of Work</label>
                <textarea 
                  value={customer.laborScope || ''}
                  onChange={(e) => handleChange('laborScope', e.target.value)}
                  className="w-full p-3 sm:p-4 text-sm bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all min-h-[80px]"
                  placeholder="Describe the installation or labor requirements..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Labor Cost (PHP)</label>
                <input 
                  type="number"
                  value={customer.laborCost || ''}
                  onChange={(e) => handleChange('laborCost', parseFloat(e.target.value) || 0)}
                  className="w-full p-3 sm:p-4 text-sm bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all font-mono"
                  placeholder="0.00"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Target Mobilization Date</label>
                <input 
                  type="date"
                  value={customer.mobilizationDate || ''}
                  onChange={(e) => handleChange('mobilizationDate', e.target.value)}
                  className="w-full p-3 sm:p-4 text-sm bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Site Contact Person</label>
                <input 
                  type="text"
                  value={customer.siteContactName || ''}
                  onChange={(e) => handleChange('siteContactName', e.target.value)}
                  className="w-full p-3 sm:p-4 text-sm bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all"
                  placeholder="Name of site engineer/contact"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Site Contact Number</label>
                <input 
                  type="text"
                  value={customer.siteContactPhone || ''}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^\d]/g, '').slice(0, 11);
                    handleChange('siteContactPhone', val);
                  }}
                  className="w-full p-3 sm:p-4 text-sm bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 outline-none transition-all font-mono"
                  placeholder="09XXXXXXXXX"
                  maxLength={11}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
});

export default CustomerForm;