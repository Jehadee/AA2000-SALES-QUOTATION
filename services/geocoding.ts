/**
 * Geocoding via Nominatim (OpenStreetMap). No API key required.
 * Use responsibly: https://operations.osmfoundation.org/policies/nominatim/
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const DEFAULT_HEADERS = { 'Accept': 'application/json' };

export interface ReverseGeocodeResult {
  street: string;
  city: string;
  province: string;
  postcode: string;
}

export interface PlaceResult {
  displayName: string;
  lat: number;
  lon: number;
}

export async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult> {
  const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
  const res = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = await res.json();
  const addr = data?.address ?? {};
  return {
    street: ([addr.road, addr.house_number, addr.suburb, addr.neighbourhood].filter(Boolean).join(', ') || addr.street) ?? '',
    city: addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? '',
    province: addr.state ?? addr.province ?? '',
    postcode: addr.postcode ?? '',
  };
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(q)}&limit=8&addressdetails=1`;
  const res = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!res.ok) throw new Error(`Place search failed: ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : [];
  return list.map((item: { display_name?: string; name?: string; lat: string; lon: string }) => ({
    displayName: item.display_name ?? item.name ?? `${item.lat}, ${item.lon}`,
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
  }));
}
