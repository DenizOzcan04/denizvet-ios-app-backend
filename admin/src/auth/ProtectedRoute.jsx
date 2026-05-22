import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./useAuth";

export default function ProtectedRoute({ allowedRoles = [] }) {
  const { isAuthed, user } = useAuth();
  if (!isAuthed) return <Navigate to="/login" replace />;

  const role = user?.role;
  if (role !== "admin" && role !== "vet") {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    const redirectPath = role === "vet" ? "/clinic" : "/";
    return <Navigate to={redirectPath} replace />;
  }

  return <Outlet />;
}
