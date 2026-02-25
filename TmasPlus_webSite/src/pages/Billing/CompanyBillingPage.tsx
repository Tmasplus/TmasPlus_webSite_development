import React, { useState } from "react";
import { FloatingSelect, FloatingInput } from "@/components/ui/FloatingField";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";

export default function CompanyBillingPage() {
  const [selectedBusiness, setSelectedBusiness] = useState("");
  const [reference, setReference] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSearched(true);

    // const res = await fetch(`/api/facturacion?empresa=${selectedBusiness}&ref=${reference}`);
    // const data = await res.json();
    // setResults(data);

    // Simulación temporal de búsqueda
    setTimeout(() => {
      if (selectedBusiness && reference === "TPLUS456") {
        setResults([
          {
            id: "TPLUS456",
            empresa: selectedBusiness,
            cliente: "María Gómez",
            fecha: "2025-10-18 09:20",
            monto: "$45.500",
            estado: "Completado",
          },
        ]);
      } else {
        setResults([]);
      }
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          Facturación de Empresas
        </h1>
        <h4>(Buscar TPLUS456)</h4>

        <form
          onSubmit={handleSearch}
          className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto"
        >
          <FloatingSelect
            id="negocio"
            label="Selecciona un negocio"
            value={selectedBusiness}
            onChange={(e) => setSelectedBusiness(e.target.value)}
          >
            <option value="">Selecciona un negocio</option>
            <option value="Tplus Mobility">Tplus Mobility</option>
            <option value="FastRide S.A.">FastRide S.A.</option>
            <option value="MoveXpress">MoveXpress</option>
          </FloatingSelect>

          <FloatingInput
            id="referencia"
            label="Buscar por referencia"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />

          <Button
            type="submit"
            disabled={!selectedBusiness || loading}
            className="whitespace-nowrap px-6 py-3"
          >
            {loading ? "Buscando..." : "Buscar"}
          </Button>
        </form>
      </div>

      <div className="mt-6">
        {!searched ? (
          <p className="text-slate-500 text-center mt-10">
            Selecciona un negocio y busca una referencia.
          </p>
        ) : loading ? (
          <p className="text-slate-500 text-center mt-10">Buscando...</p>
        ) : results.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-x-auto"
          >
            <table className="min-w-full bg-white rounded-xl shadow-md overflow-hidden">
              <thead>
                <tr className="bg-primary/10 text-left text-sm text-slate-700">
                  <th className="py-3 px-5">Referencia</th>
                  <th className="py-3 px-5">Cliente</th>
                  <th className="py-3 px-5">Fecha</th>
                  <th className="py-3 px-5">Monto</th>
                  <th className="py-3 px-5">Estado</th>
                  <th className="py-3 px-5">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-100 hover:bg-primary/5 transition-colors"
                  >
                    <td className="py-3 px-5 font-medium text-slate-800">
                      {r.id}
                    </td>
                    <td className="py-3 px-5 text-slate-700">{r.cliente}</td>
                    <td className="py-3 px-5 text-slate-700">{r.fecha}</td>
                    <td className="py-3 px-5 text-slate-700">{r.monto}</td>
                    <td className="py-3 px-5">
                      <span className="inline-block bg-green-100 text-green-700 text-xs px-3 py-1 rounded-full">
                        {r.estado}
                      </span>
                    </td>
                    <td className="py-3 px-5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => alert(`Ver factura de ${r.id}`)}
                      >
                        Ver factura
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        ) : (
          <p className="text-slate-500 text-center mt-10">
            No se encontraron reservas completadas para el negocio seleccionado.
          </p>
        )}
      </div>
    </div>
  );
}
