import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import ClientDashboard from "@/components/dashboards/ClientDashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  component: DashboardRouter,
});

function DashboardRouter() {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (role === "admin") return <Navigate to="/admin/clients" replace />;
  return <ClientDashboard />;
}