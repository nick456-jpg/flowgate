import { Navigate, Outlet } from "react-router-dom";
import { Splash } from "./Splash";
import { useSession } from "../stores/session";

export function ProtectedRoute() {
  const status = useSession((state) => state.status);
  if (status === "loading") return <Splash />;
  if (status === "anonymous") return <Navigate to="/login" replace />;
  return <Outlet />;
}
