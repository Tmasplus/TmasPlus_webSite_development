import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, CornerDownLeft, FileText, Search, type LucideIcon } from "lucide-react";
import { NAV_PAGES } from "./navigation";

type Command = {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  to: string;
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Buscador global: navegar a cualquier módulo o buscar reservas. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const q = normalize(query);
    const text = query.trim();
    const actions: Command[] = text
      ? [
          {
            id: "search-history",
            label: `Buscar «${text}» en el historial de reservas`,
            hint: "Cliente, conductor, placa, dirección…",
            icon: CalendarClock,
            to: `/bookingHistory?search=${encodeURIComponent(text)}`,
          },
          {
            id: "search-reference",
            label: `Abrir la reserva con referencia «${text}»`,
            hint: "Detalle de reserva",
            icon: FileText,
            to: `/bookingdetails?reference=${encodeURIComponent(text)}`,
          },
        ]
      : [];
    const pages = NAV_PAGES.filter(
      (p) => !q || normalize(`${p.label} ${p.section} ${p.keywords ?? ""}`).includes(q)
    ).map<Command>((p) => ({ id: p.to, label: p.label, hint: p.section, icon: p.icon, to: p.to }));
    return [...pages, ...actions];
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  if (!open) return null;

  const run = (cmd?: Command) => {
    if (!cmd) return;
    onClose();
    navigate(cmd.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, commands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(commands[highlight]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/40 p-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Buscador"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search size={18} className="shrink-0 text-sky-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Busca un módulo, una reserva, un cliente, una placa…"
            className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">ESC</kbd>
        </div>

        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {commands.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-400">Sin resultados</li>}
          {commands.map((cmd, i) => {
            const Icon = cmd.icon;
            const active = i === highlight;
            return (
              <li key={cmd.id}>
                <button
                  type="button"
                  data-index={i}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => run(cmd)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${active ? "bg-sky-50 text-sky-800" : "text-slate-700"}`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-sky-500 text-white" : "bg-sky-50 text-sky-500"}`}>
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{cmd.label}</span>
                    <span className="block truncate text-xs text-slate-400">{cmd.hint}</span>
                  </span>
                  {active && <CornerDownLeft size={14} className="shrink-0 text-sky-400" />}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-4 border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          <span><kbd className="font-sans font-semibold">↑ ↓</kbd> moverse</span>
          <span><kbd className="font-sans font-semibold">Enter</kbd> abrir</span>
          <span><kbd className="font-sans font-semibold">Ctrl K</kbd> abrir buscador</span>
        </div>
      </div>
    </div>
  );
}
