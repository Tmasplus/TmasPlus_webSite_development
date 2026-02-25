import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

interface Toll {
  id: string;
  NameToll: string;
  PriceToll: number;
  CoordToll: string;
  UpdateDate: string;
}

export default function TollsPage() {
  // 🔹 Simulación de datos
  const [tolls, setTolls] = useState<Toll[]>([
    {
      id: "1",
      NameToll: "Peaje Andes",
      PriceToll: 9800,
      CoordToll: "6.412, -75.035",
      UpdateDate: "2025-08-01",
    },
    {
      id: "2",
      NameToll: "Peaje Llanos",
      PriceToll: 12600,
      CoordToll: "4.141, -73.626",
      UpdateDate: "2025-07-12",
    },
  ]);

  const [search, setSearch] = useState("");
  const [filteredTolls, setFilteredTolls] = useState<Toll[]>(tolls);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Toll | null>(null);
  const [percent, setPercent] = useState(0);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // 🔹 Iniciar mapa
  useEffect(() => {
    if (mapRef.current && !mapInstance.current) {
      mapInstance.current = L.map(mapRef.current).setView([4.6, -74.08], 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(mapInstance.current);
    }
  }, []);

  // 🔹 Filtro de búsqueda
  useEffect(() => {
    setFilteredTolls(
      tolls.filter((t) =>
        t.NameToll.toLowerCase().includes(search.toLowerCase())
      )
    );
  }, [search, tolls]);

  const redIcon = L.icon({
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.3.1/images/marker-shadow.png",
    shadowSize: [41, 41],
  });

  const handleShowOnMap = (toll: Toll) => {
    if (!mapInstance.current || !toll.CoordToll) return;
    const [lat, lon] = toll.CoordToll.split(",").map(Number);

    if (markerRef.current) markerRef.current.remove();

    const marker = L.marker([lat, lon], { icon: redIcon })
      .addTo(mapInstance.current)
      .bindPopup(
        `<strong>${toll.NameToll}</strong><br/>Precio: $${toll.PriceToll}`
      )
      .openPopup();

    mapInstance.current.setView([lat, lon], 12);
    markerRef.current = marker;
  };

  const handleUpdateAll = () => {
    setTolls((prev) =>
      prev.map((t) => ({
        ...t,
        PriceToll: Math.round(t.PriceToll * (1 + percent / 100)),
        UpdateDate: new Date().toISOString().split("T")[0],
      }))
    );
    setModalOpen(false);
  };

  const handleUpdateSelected = () => {
    if (!selected) return;
    setTolls((prev) =>
      prev.map((t) => (t.id === selected.id ? selected : t))
    );
    setSelected(null);
    setModalOpen(false);
  };

  return (
    <div className="p-6">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
      >
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">
            Gestión de Peajes
          </h1>
          <Button onClick={() => setModalOpen(true)}>Actualizar</Button>
        </div>

        {/* Buscador */}
        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar peaje..."
            className="w-full md:w-1/2 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Tabla */}
          <div className="lg:w-1/2 overflow-y-auto max-h-[70vh] rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="text-left p-3 font-medium">Nombre</th>
                  <th className="text-left p-3 font-medium">Precio</th>
                  <th className="text-left p-3 font-medium">Actualizado</th>
                  <th className="text-left p-3 font-medium">Mapa</th>
                </tr>
              </thead>
              <tbody>
                {filteredTolls.map((t) => (
                  <tr
                    key={t.id}
                    className="border-t hover:bg-slate-50 transition"
                  >
                    <td className="p-3">{t.NameToll}</td>
                    <td className="p-3">${t.PriceToll}</td>
                    <td className="p-3">{t.UpdateDate}</td>
                    <td className="p-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleShowOnMap(t)}
                      >
                        Ver
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mapa */}
          <div className="lg:w-1/2">
            <div
              ref={mapRef}
              className="h-80 lg:h-[70vh] rounded-xl border border-slate-200 shadow-inner"
            />
          </div>
        </div>
      </motion.div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"  style={{zIndex:99999999}}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl shadow-xl p-6 w-96 border border-slate-200"
          >
            <h2 className="text-xl font-semibold text-slate-800 mb-4">
              Actualización de Peajes
            </h2>

            <label className="text-sm text-slate-600 block mb-1">
              Porcentaje de aumento
            </label>
            <input
              type="number"
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
              className="border border-slate-300 rounded-lg w-full px-3 py-2 mb-3 text-sm"
            />
            <Button
              onClick={handleUpdateAll}
              className="w-full mb-4"
              variant="outline"
            >
              Actualizar todos
            </Button>

            <hr className="my-3" />

            <label className="text-sm text-slate-600 block mb-1">
              Buscar peaje
            </label>
            <input
              type="text"
              placeholder="Nombre del peaje"
              value={selected?.NameToll || ""}
              onChange={(e) =>
                setSelected(
                  tolls.find((t) =>
                    t.NameToll.toLowerCase().includes(
                      e.target.value.toLowerCase()
                    )
                  ) || null
                )
              }
              className="border border-slate-300 rounded-lg w-full px-3 py-2 mb-3 text-sm"
            />

            {selected && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={selected.NameToll}
                  onChange={(e) =>
                    setSelected({ ...selected, NameToll: e.target.value })
                  }
                  className="border border-slate-300 rounded-lg w-full px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  value={selected.PriceToll}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      PriceToll: Number(e.target.value),
                    })
                  }
                  className="border border-slate-300 rounded-lg w-full px-3 py-2 text-sm"
                />
                <Button
                  onClick={handleUpdateSelected}
                  className="w-full"
                  variant="solid"
                >
                  Actualizar Peaje
                </Button>
              </div>
            )}

            <Button
              onClick={() => setModalOpen(false)}
              variant="secondary"
              className="w-full mt-5"
            >
              Cerrar
            </Button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
