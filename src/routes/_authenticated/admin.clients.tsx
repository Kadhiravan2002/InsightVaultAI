import { createFileRoute } from "@tanstack/react-router";
import AdminDashboard from "@/components/dashboards/AdminDashboard";

export const Route = createFileRoute("/_authenticated/admin/clients")({
  ssr: false,
  component: AdminDashboard,
});