import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./auth/ProtectedRoute";
import { useAuth } from "./auth/useAuth";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Blogs from "./pages/Blogs";
import Clinics from "./pages/Clinics";
import Appointments from "./pages/Appointments";
import ClinicDashboard from "./pages/ClinicDashboard";
import ClinicAppointments from "./pages/ClinicAppointments";
import ClinicCancelRequests from "./pages/ClinicCancelRequests";
import ClinicHistory from "./pages/ClinicHistory";
import ClinicSlots from "./pages/ClinicSlots";
import ClinicProfile from "./pages/ClinicProfile";

export default function App() {
  const { isAuthed, user } = useAuth();

  const fallbackPath = !isAuthed ? "/login" : user?.role === "vet" ? "/clinic" : "/";

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/blogs" element={<Blogs />} />
        <Route path="/clinics" element={<Clinics />} />
        <Route path="/appointments" element={<Appointments />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["vet"]} />}>
        <Route path="/clinic" element={<ClinicDashboard />} />
        <Route path="/clinic/appointments" element={<ClinicAppointments />} />
        <Route path="/clinic/cancel-requests" element={<ClinicCancelRequests />} />
        <Route path="/clinic/history" element={<ClinicHistory />} />
        <Route path="/clinic/slots" element={<ClinicSlots />} />
        <Route path="/clinic/profile" element={<ClinicProfile />} />
      </Route>

      <Route path="*" element={<Navigate to={fallbackPath} replace />} />
    </Routes>
  );
}
