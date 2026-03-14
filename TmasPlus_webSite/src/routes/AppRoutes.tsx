import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import DashboardLayout from '@/layouts/DashboardLayout';

// Páginas públicas
import LoginPage from '@/pages/Auth/LoginPage';
import RegisterDriverPage from '@/pages/Auth/RegisterDriverPage';
import UpdatePasswordPage from '@/pages/Auth/UpdatePasswordPage';

// Páginas protegidas
import UsersPage from '@/pages/Users/UsersPage';
import DriversPage from '@/pages/Users/DriversPage';
import CorporateBookingsPage from '@/pages/Bookings/CorporateBookingsPage';
import HomePage from '@/pages/Home/HomePage';
import ShiftChangerPage from '@/pages/ShiftChanger/ShiftChangerPage';
import BookingDetailsPage from '@/pages/BookingDetails/BookingDetailsPage';
import CompanyBillingPage from '@/pages/Billing/CompanyBillingPage';
import BookingHistoryPage from '@/pages/BookingHistory/BookingHistoryPage';
import AddBookingPage from '@/pages/AddBooking/AddBookingPage';
import OfficialsViewPage from '@/pages/Officials/OfficialsViewPage';
import ComplaintsViewPage from '@/pages/Complaints/ComplaintsViewPage';
import OffersPage from '@/pages/Offers/OffersPage';
import ContractsPage from '@/pages/Contracts/ContractsPage';
import ProfilePage from '@/pages/Profile/ProfilePage';
import SettingsPage from '@/pages/Settings/SettingsPage';
import TollsPage from '@/pages/Tolls/TollsPage';
import NotificationsPage from '@/pages/Notifications/NotificationsPage';

// Página 404
const NotFound = () => (
  <div className="p-6">
    <h1 className="text-2xl font-semibold">404 — Página no encontrada</h1>
    <p className="text-slate-600 mt-2">
      La página que buscas no existe o no tienes acceso a ella.
    </p>
  </div>
);

export default function AppRoutes() {
  return (
    <Routes>
      {/* Rutas públicas */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register-driver" element={<RegisterDriverPage />} />
      <Route path="/update-password" element={<UpdatePasswordPage />} />

      {/* Redirige raíz a /login */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Rutas protegidas - Solo para admins autenticados */}
      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/home" element={<HomePage />} />
        <Route path="/shiftchanger" element={<ShiftChangerPage />} />
        <Route path="/bookingHistory" element={<BookingHistoryPage />} />
        <Route path="/addbooking" element={<AddBookingPage />} />
        <Route path="/bookingCorp" element={<CorporateBookingsPage />} />
        <Route path="/bookingdetails" element={<BookingDetailsPage />} />
        <Route path="/billing" element={<CompanyBillingPage />} />
        <Route path="/users/*" element={<UsersPage />} />
        <Route path="/drivers" element={<DriversPage />} />
        <Route path="/officialview" element={<OfficialsViewPage />} />
        <Route path="/complaints" element={<ComplaintsViewPage />} />
        <Route path="/treasoffers" element={<OffersPage />} />
        <Route path="/contracts" element={<ContractsPage />} />
        <Route path="/userprofile" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/tolls" element={<TollsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
