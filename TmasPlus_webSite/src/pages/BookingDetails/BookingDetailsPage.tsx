import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { BookingDetailBody, BookingDetailHeader } from "@/components/bookings/BookingDetailView";
import { Button } from "@/components/ui/Button";
import { FloatingInput } from "@/components/ui/FloatingField";
import { BookingsService, type BookingRecord } from "@/services/bookings.service";

export default function BookingDetailsPage() {
  const [searchParams] = useSearchParams();
  const [reference, setReference] = useState(searchParams.get("reference") || "");
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchBooking = async (value: string) => {
    const q = value.trim();
    if (!q) return;

    setLoading(true);
    setSearched(true);
    setError(null);
    setBooking(null);

    try {
      const data = await BookingsService.findByReferenceOrId(q);
      setBooking(data);
    } catch (err: any) {
      setError(err?.message || "Error al buscar la reserva");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await searchBooking(reference);
  };

  useEffect(() => {
    const paramReference = searchParams.get("reference");
    if (paramReference) searchBooking(paramReference);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-full bg-slate-50/70 p-4 sm:p-6">
      <div className="mb-8 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Resumen del Servicio</h1>
          <p className="mt-1 text-sm text-slate-500">Busca por referencia de reserva o por ID.</p>
        </div>

        <form onSubmit={handleSearch} className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">
          <FloatingInput
            id="booking-reference"
            label="Referencia o ID de reserva"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <Button type="submit" disabled={!reference.trim() || loading} className="whitespace-nowrap px-6 py-3">
            {loading ? "Buscando..." : "Buscar"}
          </Button>
        </form>
      </div>

      <div className="mt-6">
        {!searched ? (
          <p className="mt-10 text-center text-slate-500">Ingresa una referencia para buscar una reserva.</p>
        ) : loading ? (
          <p className="mt-10 text-center text-slate-500">Buscando...</p>
        ) : error ? (
          <p className="mt-10 text-center text-red-600">{error}</p>
        ) : booking ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <BookingDetailHeader booking={booking} />
            <BookingDetailBody booking={booking} />
          </motion.div>
        ) : (
          <p className="mt-10 text-center text-slate-500">
            No se encontraron reservas con esa referencia o ID.
          </p>
        )}
      </div>
    </div>
  );
}
