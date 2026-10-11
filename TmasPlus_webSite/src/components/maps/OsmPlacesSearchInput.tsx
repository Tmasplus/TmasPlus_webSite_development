import { useEffect, useRef, useState } from "react";
import { searchPlaces, type OsmPlace } from "./osmGeocoding";

interface Location {
  latitude: number;
  longitude: number;
  title: string;
}

interface OsmPlacesSearchInputProps {
  label: string;
  placeholder: string;
  value: string;
  onSelect: (location: Location) => void;
  onClear?: () => void;
  icon: "origin" | "destination";
  disabled?: boolean;
  proximity?: { lng: number; lat: number } | null;
}

// Nominatim pide no superar ~1 petición por segundo.
const SEARCH_DEBOUNCE_MS = 700;

function shortenPlaceName(placeName: string): string {
  if (!placeName) return "";
  return placeName
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && p.toLowerCase() !== "colombia")
    .slice(0, 3)
    .join(", ");
}

export default function OsmPlacesSearchInput({
  label,
  placeholder,
  value,
  onSelect,
  onClear,
  icon,
  disabled,
  proximity,
}: OsmPlacesSearchInputProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<OsmPlace[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isOrigin = icon === "origin";

  useEffect(() => {
    setQuery(shortenPlaceName(value));
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSuggestions([]);
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const searchAddress = async (text: string) => {
    if (text.length < 3) {
      setSuggestions([]);
      setSearched(false);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      setSuggestions(await searchPlaces(text, proximity, controller.signal));
      setSearched(true);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        setSuggestions([]);
        setSearched(true);
      }
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  };

  const handleChange = (text: string) => {
    setQuery(text);
    setSelectedIdx(-1);
    setSearched(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text) {
      setSuggestions([]);
      onClear?.();
      return;
    }
    debounceRef.current = setTimeout(() => searchAddress(text), SEARCH_DEBOUNCE_MS);
  };

  const handleSelect = (s: OsmPlace) => {
    onSelect({ latitude: s.lat, longitude: s.lng, title: s.fullText });
    setQuery(shortenPlaceName(s.fullText));
    setSuggestions([]);
    setIsFocused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && selectedIdx >= 0) {
      e.preventDefault();
      handleSelect(suggestions[selectedIdx]);
    } else if (e.key === "Escape") {
      setSuggestions([]);
    }
  };

  const dotCls = isOrigin ? "bg-green-500" : "bg-red-500";
  const iconCls = isOrigin ? "text-green-500" : "text-red-500";
  const borderFocus = isOrigin
    ? "border-green-400 ring-2 ring-green-100 shadow-md"
    : "border-red-400 ring-2 ring-red-100 shadow-md";
  const suggIconBg = isOrigin ? "bg-green-50" : "bg-red-50";
  const suggIconTxt = isOrigin ? "text-green-500" : "text-red-500";

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-slate-600 mb-1">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${dotCls} mr-1.5 align-middle`} />
        {label}
      </label>
      <div
        className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-white transition-all ${
          isFocused ? borderFocus : "border-slate-300 hover:border-slate-400"
        }`}
      >
        <svg className={`w-5 h-5 ${iconCls} shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isOrigin ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z" />
          ) : (
            <>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </>
          )}
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 outline-none text-sm text-slate-800 placeholder:text-slate-400 bg-transparent"
          autoComplete="off"
        />
        {loading && (
          <svg className="w-4 h-4 text-slate-400 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {query && !loading && (
          <button type="button" onClick={() => handleChange("")} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {isFocused && suggestions.length > 0 && (
        <ul className="absolute z-[1100] mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto py-1">
          {suggestions.map((s, idx) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => handleSelect(s)}
                onMouseEnter={() => setSelectedIdx(idx)}
                className={`w-full text-left px-4 py-2.5 transition-colors flex items-start gap-3 ${
                  idx === selectedIdx ? "bg-slate-50" : "hover:bg-slate-50"
                }`}
              >
                <div className={`mt-0.5 w-8 h-8 rounded-lg ${suggIconBg} flex items-center justify-center shrink-0`}>
                  <svg className={`w-4 h-4 ${suggIconTxt}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{s.mainText}</p>
                  {s.secondaryText && <p className="text-xs text-slate-400 truncate">{s.secondaryText}</p>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {isFocused && searched && !loading && suggestions.length === 0 && query.length >= 3 && (
        <div className="absolute z-[1100] mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-2xl p-4 text-center">
          <p className="text-sm text-slate-400">No se encontraron resultados para &quot;{query}&quot;</p>
          <p className="text-xs text-slate-300 mt-1">Prueba con barrio o lugar conocido, o marca el punto en el mapa</p>
        </div>
      )}
    </div>
  );
}
