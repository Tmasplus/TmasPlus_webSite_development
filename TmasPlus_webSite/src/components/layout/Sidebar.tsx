import { Link, useLocation } from "react-router-dom";
import { classNames } from "@/utils/classNames";
import { MdOutlineLocalOffer, MdOutlinePriceChange, MdNotificationsNone, MdOutlineLogout } from "react-icons/md";
import { TiHomeOutline } from "react-icons/ti";
import { SlEnvolopeLetter } from "react-icons/sl";
import { GrMoney, GrUserManager } from "react-icons/gr";
import { LuUserRound, LuUsersRound } from "react-icons/lu";
import { PiBuildingOfficeBold, PiReadCvLogoBold } from "react-icons/pi";
import { TbCalendarPlus, TbCalendarStats, TbContract, TbExchange } from "react-icons/tb";
import { RiSettings3Line } from "react-icons/ri";
import React from "react";

type Subuser = {
  InTurn: boolean;
  Name: string;
};

type AppUser = {
  usertype: "admin" | "company" | "driver" | string;
  profile_image?: string | null;
  subusers?: Subuser[];
};

type Props = {
  open: boolean;
  onToggle: () => void;
  onClose?: () => void;
  user: AppUser | null | undefined;
  isAnySubuserInTurn: boolean;
  getDisplayName: (u: AppUser) => string;
  defaultProfileImage: string;
  handleLogout: () => void;
  navigateToWhatsApp: () => void;
};

/** Item de navegación con estado activo */
const NavItem: React.FC<{
  to?: string;
  icon: React.ReactNode;
  label: string;
  isOpen: boolean;
  onClick?: () => void;
}> = ({ to, icon, label, isOpen, onClick }) => {
  const location = useLocation();
  const isActive = !!to && location.pathname.startsWith(to);

  const base   = "flex items-center w-full px-3 py-2 rounded-md group transition-colors";
  const idle   = "text-slate-700 hover:bg-primary/10 hover:text-primary-dark";
  const active = "bg-transparent border-l-4 border-primary text-primary-dark font-semibold";

  const content = (
    <>
      <span className={classNames("text-xl", isActive ? "text-primary-dark" : "text-primary-dark group-hover:text-primary-dark")}>
        {icon}
      </span>
      {isOpen && (
        <span className={classNames("ml-2", isActive ? "text-primary-dark" : "text-slate-800 group-hover:text-primary-dark")}>
          {label}
        </span>
      )}
    </>
  );

  if (to) {
    return (
      <li className="w-full flex justify-center">
        <Link to={to} className={classNames(base, isActive ? active : idle)}>
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li className="w-full flex justify-center">
      <button onClick={onClick} className={classNames(base, idle)}>
        {content}
      </button>
    </li>
  );
};


export const Sidebar: React.FC<Props> = ({
  onToggle,
  onClose,
  user,
  open,
  isAnySubuserInTurn,
  getDisplayName,
  defaultProfileImage,
  handleLogout,
}) => {
  const isAdmin = user?.usertype === "admin";
  // const isCompany = user?.usertype === "company";
  const isCompany = user?.usertype === "admin";
  // const isDriver = user?.usertype === "driver";
  const isDriver = user?.usertype === "admin";
  const hasAdminSubuserInTurn =
    !!user?.subusers?.some((s) => s.InTurn && s.Name === "Administrador");

  return (
    <aside
      className={classNames(
        "bg-white m-3 fixed z-10 rounded-s-2xl shadow-lg flex flex-col transition-[width] duration-300 ease-in-out",
        "overflow-hidden",          // evita que el contenido se salga horizontalmente
        open ? "w-64" : "w-16",
        "top-0 bottom-0"            // asegura altura total
      )}
      aria-label="Barra lateral"
      style={{ marginTop: "3.5rem" }}
    >
      <div className="flex flex-col h-full overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
        {/* Header */}
        {/* <div className="flex items-center justify-between p-5 flex-shrink-0">
          <button onClick={onToggle} aria-label="Abrir/Cerrar menú">
            <MdMenu className="text-2xl text-primary-dark" />
          </button>
        </div> */}

      {/* Perfil (solo abierto) */}
      {/* {open && user && ( */}
        <div className="flex items-center mx-4 mb-4 bg-white bg-opacity-30 backdrop-blur-lg p-4 rounded-lg shadow-md">
          <img
            src={user.profile_image || defaultProfileImage}
            className="w-16 h-16 rounded-full shadow-2xl object-cover"
            alt="Profile"
          />
          <div className="ml-4">
            <span className="block text-slate-500 text-sm">HOLA!</span>
            {/* <span className="text-slate-800 text-lg">{getDisplayName(user)}</span> */}
          </div>
        </div>
      {/* )} */}

      {/* Navegación */}
      <ul className="flex flex-col items-center flex-grow space-y-2">
        <NavItem to="/home" icon={<TiHomeOutline />} label="Inicio" isOpen={open} />

        {/* (Opcional) Tablero si luego lo habilitas para admin */}
        {/* {isAdmin && (
          <NavItem to="/dashboard" icon={<MdDashboard />} label="Tablero de Mando" isOpen={open} />
        )} */}

        {isCompany && (
          <NavItem
            to="/shiftchanger"
            icon={<TbExchange />}
            label="Cambiar Turno"
            isOpen={open}
          />
        )}

        {isAdmin && (
          <NavItem
            to="/bookingHistory"
            icon={<TbCalendarStats />}
            label="Historial de Reservas"
            isOpen={open}
          />
        )}

        {isAdmin && (
          <NavItem
            to="/addbooking"
            icon={<TbCalendarPlus />}
            label="Añadir Reservas"
            isOpen={open}
          />
        )}

        {(isAdmin || (isCompany && isAnySubuserInTurn)) && (
          <NavItem
            to="/bookingCorp"
            icon={<PiBuildingOfficeBold />}
            label="Reservas Corporativas"
            isOpen={open}
          />
        )}

        {(isAdmin || (isCompany && isAnySubuserInTurn)) && (
          <NavItem
            to="/bookingdetails"
            icon={<PiReadCvLogoBold />}
            label="Detalle de reserva"
            isOpen={open}
          />
        )}

        {isAdmin && (
          <NavItem
            to="/billing"
            icon={<GrMoney />}
            label="Módulo de Facturación"
            isOpen={open}
          />
        )}

        {(isAdmin || (isCompany && isAnySubuserInTurn)) && (
          <NavItem to="/users" icon={<LuUsersRound />} label="Usuarios" isOpen={open} />
        )}

        {isCompany && isAnySubuserInTurn && hasAdminSubuserInTurn && (
          <NavItem
            to="/officialview"
            icon={<GrUserManager />}
            label="Funcionarios"
            isOpen={open}
          />
        )}

        <NavItem
          to="/complaints"
          icon={<SlEnvolopeLetter />}
          label="Quejas"
          isOpen={open}
        />

        {isAdmin && (
          <NavItem
            to="/treasoffers"
            icon={<MdOutlineLocalOffer />}
            label="Ofertas TREAS"
            isOpen={open}
          />
        )}

        {isDriver && (
          <NavItem
            to="/contracts"
            icon={<TbContract />}
            label="Contratos"
            isOpen={open}
          />
        )}

        {user?.usertype !== "company" && (
          <NavItem to="/userprofile" icon={<LuUserRound />} label="Perfil" isOpen={open} />
        )}

        {isAdmin && (
          <NavItem
            to="/settings"
            icon={<RiSettings3Line />}
            label="Configuración"
            isOpen={open}
          />
        )}

        {isAdmin && (
          <NavItem
            to="/tolls"
            icon={<MdOutlinePriceChange />}
            label="Peajes"
            isOpen={open}
          />
        )}

        {isAdmin && (
          <NavItem
            to="/notifications"
            icon={<MdNotificationsNone />}
            label="Notificaciones"
            isOpen={open}
          />
        )}

        {/* Logout */}
        <NavItem
          icon={<MdOutlineLogout />}
          label="Cerrar Sesión"
          isOpen={open}
          onClick={handleLogout}
        />
      </ul>
      </div>
    </aside>
  );
};
