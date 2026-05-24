import { useState, type ReactNode } from "react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/context/AuthContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { VisitaAlertProvider } from "@/components/analytics/VisitaAlertProvider";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/leads": "Leads",
  "/imoveis": "Imóveis",
  "/clientes": "Clientes",
  "/agenda": "Agenda",
  "/filas": "Filas",
  "/redistribuicao": "Fila de Redistribuição",
  "/equipe": "Equipe",
  "/relatorios": "Relatórios",
  "/templates": "Templates",
  "/integracoes": "Integrações",
  "/configuracoes": "Configurações",
};

export function MainLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;

  const title = TITLES[path] ?? "CRM";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f8fafc]">
      <VisitaAlertProvider />
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar collapsed={collapsed} />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-60">
            <Sidebar collapsed={false} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={title}
          onToggleSidebar={() => {
            if (window.innerWidth < 768) setMobileOpen(true);
            else setCollapsed((v) => !v);
          }}
        />
        <main className="flex-1 overflow-y-auto p-4">{children}</main>
      </div>
    </div>
  );
}
