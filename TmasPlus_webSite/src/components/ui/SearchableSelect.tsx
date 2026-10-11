import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

export type SearchableOption = { value: string; label: string };

const MAX_VISIBLE = 50;

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Select con búsqueda por texto; pensado para listas largas (conductores, clientes…). */
export function SearchableSelect({
  options,
  value,
  onChange,
  allLabel,
  placeholder = "Buscar…",
  className = "",
  onQueryChange,
  loading = false,
  selectedLabel,
}: {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  /** Texto de la opción vacía (sin filtro). */
  allLabel: string;
  placeholder?: string;
  className?: string;
  /** Búsqueda remota: si se pasa, `options` ya llega filtrado por el padre. */
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  /** Etiqueta del valor elegido cuando ya no está en `options` (búsqueda remota). */
  selectedLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected =
    options.find((o) => o.value === value) ??
    (value && selectedLabel ? { value, label: selectedLabel } : null);

  const matches = useMemo(() => {
    if (onQueryChange) return options;
    const q = normalize(query);
    const sorted = [...options].sort((a, b) => a.label.localeCompare(b.label, "es"));
    return q ? sorted.filter((o) => normalize(o.label).includes(q)) : sorted;
  }, [options, query, onQueryChange]);
  const visible = matches.slice(0, MAX_VISIBLE);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (next: string) => {
    onChange(next);
    setQuery("");
    onQueryChange?.("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && open && visible[highlight]) {
      e.preventDefault();
      choose(visible[highlight].value);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={rootRef} className={`relative min-w-[240px] ${className}`}>
      <div
        className={`flex items-center gap-2 rounded-lg border bg-white px-2.5 ${
          open ? "border-sky-400 ring-2 ring-primary/40" : "border-slate-300"
        }`}
      >
        <Search size={15} className="shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          value={open ? query : selected?.label ?? ""}
          placeholder={open ? placeholder : allLabel}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            onQueryChange?.(e.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-slate-500"
          aria-label={allLabel}
        />
        {value ? (
          <button type="button" onClick={() => choose("")} className="rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label="Quitar filtro">
            <X size={15} />
          </button>
        ) : (
          <ChevronDown size={15} className="shrink-0 text-slate-400" />
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <ul className="max-h-72 overflow-y-auto py-1 text-sm">
            {!query && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose("")}
                  className={`w-full px-3 py-2 text-left font-medium hover:bg-slate-50 ${!value ? "text-sky-700" : "text-slate-600"}`}
                >
                  {allLabel}
                </button>
              </li>
            )}
            {visible.map((o, i) => (
              <li key={o.value}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(o.value)}
                  className={`w-full px-3 py-2 text-left ${i === highlight ? "bg-sky-50" : ""} ${
                    o.value === value ? "font-semibold text-sky-700" : "text-slate-700"
                  }`}
                >
                  {o.label}
                </button>
              </li>
            ))}
            {loading && <li className="px-3 py-3 text-slate-400">Buscando…</li>}
            {!loading && visible.length === 0 && (
              <li className="px-3 py-3 text-slate-400">{query ? `Sin resultados para “${query}”` : "Escribe para buscar"}</li>
            )}
          </ul>
          {matches.length > MAX_VISIBLE && (
            <p className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">
              Mostrando {MAX_VISIBLE} de {matches.length}. Sigue escribiendo para afinar la búsqueda.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
