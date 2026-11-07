import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, MessagesSquare, RefreshCw, Send } from "lucide-react";
import {
  ADMIN_CHAT_NAME,
  fetchChatMessages,
  sendAdminChatMessage,
  type ChatMessage,
} from "@/services/bookingDetail.service";
import { toast } from "@/utils/toast";

const CHAT_REFRESH_MS = 5000;
const MAX_LENGTH = 1000;

const ROLE_LABEL: Record<ChatMessage["senderRole"], string> = {
  customer: "Cliente",
  driver: "Conductor",
  admin: "Soporte",
};

function dayKey(iso: string) {
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  return isNaN(+d) ? "—" : d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function BookingChatPanel({
  bookingId,
  live,
  customerName,
  driverName,
  canSend = false,
}: {
  bookingId: string;
  /** Viaje en curso: refresca el chat periódicamente. */
  live: boolean;
  customerName?: string | null;
  driverName?: string | null;
  /** Solo administrador: puede escribir como «Admin T+Plus». */
  canSend?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await fetchChatMessages(bookingId);
      setMessages(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [bookingId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    lastCountRef.current = 0;
    load().finally(() => !cancelled && setLoading(false));
    if (!live) return () => void (cancelled = true);
    const timer = window.setInterval(() => void load(), CHAT_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [load, live]);

  useEffect(() => {
    if (messages.length === lastCountRef.current) return;
    lastCountRef.current = messages.length;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendAdminChatMessage(bookingId, text);
      setDraft("");
      await load();
    } catch (e: unknown) {
      toast.error(`No se pudo enviar el mensaje: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSending(false);
    }
  };

  const nameFor = (m: ChatMessage) =>
    m.senderName ||
    (m.senderRole === "customer" ? customerName : m.senderRole === "driver" ? driverName : ADMIN_CHAT_NAME) ||
    ROLE_LABEL[m.senderRole];

  let lastDay = "";

  return (
    <div className={`flex flex-col ${canSend ? "h-[30rem]" : "h-[26rem]"}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-xs text-slate-500">
        <span className="flex items-center gap-2">
          {live && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              En vivo
            </span>
          )}
          {messages.length} mensaje{messages.length === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-400" /> Cliente
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-600" /> Conductor
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan-500" /> {ADMIN_CHAT_NAME}
          </span>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="rounded-lg p-1 text-slate-500 hover:bg-white hover:text-blue-700 disabled:opacity-50"
            aria-label="Actualizar chat"
            title="Actualizar chat"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          </button>
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-white px-5 py-4">
        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>No se pudo cargar el chat: {error}</span>
          </div>
        ) : loading ? (
          <p className="py-10 text-center text-sm text-slate-400">Cargando conversación…</p>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
            <MessagesSquare size={28} />
            <p className="text-sm">Cliente y conductor no intercambiaron mensajes en este servicio.</p>
          </div>
        ) : (
          messages.map((m) => {
            const day = dayKey(m.createdAt);
            const showDay = day !== lastDay;
            lastDay = day;
            const isDriver = m.senderRole === "driver";
            const isAdmin = m.senderRole === "admin";
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <span className="h-px flex-1 bg-slate-100" />
                    {day}
                    <span className="h-px flex-1 bg-slate-100" />
                  </div>
                )}
                <div className={`flex ${isAdmin ? "justify-center" : isDriver ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[75%]">
                    <p
                      className={`mb-0.5 text-[11px] font-semibold ${
                        isAdmin ? "text-center text-cyan-700" : isDriver ? "text-right text-blue-700" : "text-slate-500"
                      }`}
                    >
                      {nameFor(m)} · {ROLE_LABEL[m.senderRole]}
                    </p>
                    <div
                      className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm [overflow-wrap:anywhere] ${
                        isAdmin
                          ? "border border-cyan-200 bg-cyan-50 text-cyan-900"
                          : isDriver
                          ? "rounded-tr-sm bg-blue-600 text-white"
                          : "rounded-tl-sm bg-slate-100 text-slate-800"
                      }`}
                    >
                      {m.message}
                    </div>
                    <p
                      className={`mt-0.5 text-[10px] tabular-nums text-slate-400 ${
                        isAdmin ? "text-center" : isDriver ? "text-right" : ""
                      }`}
                    >
                      {timeLabel(m.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {canSend && (
        <form
          className="flex items-end gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder={`Escribe como ${ADMIN_CHAT_NAME}… (Enter envía, Shift+Enter salto de línea)`}
            className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none"
            disabled={sending}
            aria-label="Mensaje del administrador"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-cyan-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-cyan-700 disabled:opacity-50"
          >
            <Send size={15} />
            {sending ? "Enviando…" : "Enviar"}
          </button>
        </form>
      )}
    </div>
  );
}
