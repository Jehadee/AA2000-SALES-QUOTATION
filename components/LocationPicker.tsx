import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type LatLon = { lat: number; lon: number };

// Fix default marker icon in Leaflet with bundlers
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

interface LocationPickerProps {
  location: LatLon;
  onChange: (loc: LatLon) => void;
}

const LocationPicker: React.FC<LocationPickerProps> = ({ location, onChange }) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView([location.lat, location.lon], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const marker = L.marker([location.lat, location.lon], { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onChange({ lat: pos.lat, lon: pos.lng });
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      onChange({ lat: e.latlng.lat, lon: e.latlng.lng });
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const latLng = L.latLng(location.lat, location.lon);
    marker.setLatLng(latLng);
    map.panTo(latLng);
  }, [location.lat, location.lon]);

  return (
    <div className="w-full h-56 rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-100">
      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
};

export default LocationPicker;
