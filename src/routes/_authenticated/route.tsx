import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Sparkles, LogOut, LayoutDashboard, Users, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayout,
});

function AuthedLayout() {
  const { session, loading, role, user, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [session, loading, navigate]);

  if (loading || !session) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border/60 bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <div className="flex items-center gap-2 p-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg gradient-primary shadow-elegant">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-display text-base font-semibold">InsightVault AI</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{role === "admin" ? "Admin console" : "Client portal"}</div>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3">
          <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" active={pathname === "/dashboard"} />
          {role === "admin" && (
            <NavItem to="/admin/clients" icon={Users} label="Clients & workspaces" active={pathname.startsWith("/admin")} />
          )}
          {role !== "admin" && (
            <NavItem to="/dashboard" icon={MessageSquare} label="Ask the assistant" active={false} />
          )}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 truncate px-2 text-xs text-muted-foreground">{user?.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={async () => { await signOut(); navigate({ to: "/auth", replace: true }); }}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="md:pl-64">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, icon: Icon, label, active }: { to: string; icon: any; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}