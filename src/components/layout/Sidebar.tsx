import { useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Home,
  LayoutDashboard,
  Users,
  Layers,
  RefreshCw,
  UsersRound,
  BarChart2,
  MessageSquare,
  Settings,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

type Item = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeTone?: "red";
};

const main: Item[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", icon: Users, badge: 8, badgeTone: "red" },
  { to: "/filas", label: "Filas", icon: Layers },
  { to: "/redistribuicao", label: "Fila de Redistribuição", icon: RefreshCw, badge: 3, badgeTone: "red" },
  { to: "/equipe", label: "Equipe", icon: UsersRound },
  { to: "/relatorios", label: "Relatórios", icon: BarChart2 },
];

const tools: Item[] = [
  { to: "/templates", label: "Templates", icon: MessageSquare },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export function Sidebar({ collapsed, onClose }: { collapsed: boolean; onClose?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [plantao, setPlantao] = useState(true);

  const nome = (user?.user_metadata as any)?.nome_completo ?? user?.email ?? "Usuário";
  const inicial = String(nome).trim().charAt(0).toUpperCase();

  const handleLogout = async () => {
    await logout();
    toast.success("Até logo!");
    navigate({ to: "/login" });
  };

  const renderItem = (item: Item) => {
    const active = path === item.to;
    const Icon = item.icon;
    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={onClose}
        className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? "bg-[#1e3a5f] text-white"
            : "text-[#94a3b8] hover:bg-[#1e293b] hover:text-white"
        }`}
      >
        {active && (
          <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-[#3b82f6]" />
        )}
        <Icon className="h-4.5 w-4.5 shrink-0" />
        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
        {!collapsed && item.badge ? (
          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1.5 text-[10px] font-bold text-white">
            {item.badge}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <aside
      className={`flex h-full flex-col bg-[#0f172a] text-white transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Logo */}
      <div className={`flex h-[60px] items-center gap-2.5 border-b border-white/5 ${collapsed ? "justify-center px-2" : "px-5"}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand">
          <Home className="h-4.5 w-4.5" />
        </div>
        {!collapsed && <span className="text-base font-bold tracking-tight">ImoCRM</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        {!collapsed && (
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">
            Menu Principal
          </p>
        )}
        <div className="space-y-1">{main.map(renderItem)}</div>

        {!collapsed && (
          <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">
            Ferramentas
          </p>
        )}
        {collapsed && <div className="my-4 border-t border-white/5" />}
        <div className="space-y-1">{tools.map(renderItem)}</div>
      </nav>

      {/* Footer */}
      <div className="border-t border-white/5 p-3">
        {!collapsed && (
          <div className="mb-3 flex items-center justify-between rounded-md bg-[#1e293b] px-3 py-2">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${plantao ? "bg-[#10b981]" : "bg-[#64748b]"}`} />
              <span className="text-xs font-medium text-white">Em Plantão</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={plantao}
              onClick={() => setPlantao((v) => !v)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                plantao ? "bg-[#10b981]" : "bg-[#475569]"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  plantao ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        )}

        <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-sm font-semibold text-white">
            {inicial}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{nome}</p>
              <p className="truncate text-[10px] text-[#94a3b8]">Dono</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="rounded-md p-2 text-[#94a3b8] transition hover:bg-[#1e293b] hover:text-white"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
