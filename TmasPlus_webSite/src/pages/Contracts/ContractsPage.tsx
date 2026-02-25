import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { motion } from "framer-motion";
import ContractPDF from "./ContractPDF";

interface User {
  uid: string;
  firstName: string;
  lastName: string;
  docNumber: string;
  verifyId?: string;
  CompanyName?: string;
  NIT?: string;
  addresCompany?: string;
  cityCompany?: string;
  Full_Name_Legal_Representative?: string;
  docTypelegalrepresentative?: string;
  verifyIdRepresentativeLegal?: string;
  cartype?: string;
  carType?: string;
  vehicleNumber?: string;
  vehicleMake?: string;
  vehicleLine?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehicleMetalup?: string;
  vehicleNoSerie?: string;
  vehicleNoMotor?: string;
  vehicleNoChasis?: string;
  vehicleNoVin?: string;
  vehicleCylinders?: string;
  vehicleFuel?: string;
  vehicleDoors?: string;
  vehiclePassengers?: string;
  vehicleForm?: string;
  vehicleType?: string;
  vehicleCapacity?: string;
  vigencia?: number;
}

export default function ContractsPage() {
  const [user, setUser] = useState<User>({
    uid: "U12345",
    firstName: "Juan",
    lastName: "Pérez",
    docNumber: "1020304050",
    CompanyName: "",
    NIT: "",
    addresCompany: "",
    cityCompany: "",
    Full_Name_Legal_Representative: "",
    docTypelegalrepresentative: "",
    verifyIdRepresentativeLegal: "",
    cartype: "TREAS-X",
    carType: "Hosting",
    vehicleNumber: "ABC123",
    vehicleMake: "Toyota",
    vehicleModel: "2020",
    vehicleColor: "Blanco",
    vigencia: 365,
  });

  const [form, setForm] = useState(user);
  const [saved, setSaved] = useState(false);

  const isDataMissing =
    !user.CompanyName ||
    !user.NIT ||
    !user.addresCompany ||
    !user.cityCompany ||
    !user.Full_Name_Legal_Representative ||
    !user.docTypelegalrepresentative ||
    !user.verifyIdRepresentativeLegal;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    setUser(form);
    setSaved(true);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">
        Contratos
      </h1>

      {isDataMissing && !saved ? (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-2xl shadow-md border border-slate-200"
        >
          <h2 className="text-xl font-semibold mb-4">
            Información de la empresa requerida
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: "Nombre de la Empresa", name: "CompanyName" },
              { label: "NIT", name: "NIT" },
              { label: "Dirección de la Empresa", name: "addresCompany" },
              { label: "Ciudad", name: "cityCompany" },
              { label: "Representante Legal", name: "Full_Name_Legal_Representative" },
              { label: "Tipo de Documento", name: "docTypelegalrepresentative" },
              { label: "Documento del Representante", name: "verifyIdRepresentativeLegal" },
            ].map((f) => (
              <div key={f.name}>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {f.label}
                </label>
                <input
                  type="text"
                  name={f.name}
                  value={(form as any)[f.name] || ""}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end mt-6">
            <Button onClick={handleSave}>Guardar y Continuar</Button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <ContractDisplay auth={user} />
        </motion.div>
      )}
    </div>
  );
}

function ContractDisplay({ auth }: { auth: User }) {
  return (
    <Card className="p-6 bg-white">
      <h2 className="text-xl font-semibold mb-4 text-slate-800">
        Contrato generado para {auth.firstName} {auth.lastName}
      </h2>
      <p className="text-slate-600 mb-4">
        Tipo de contrato:{" "}
        <span className="font-medium">{auth.cartype}</span>
      </p>

      <ContractPDF auth={auth} />

      <p className="text-slate-500 mt-4 text-sm">
        Si alguno de los datos es incorrecto, vuelve atrás para editar
        la información de la empresa.
      </p>
    </Card>
  );
}
