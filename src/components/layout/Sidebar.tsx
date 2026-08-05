import { useState, useEffect } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar as CalendarIcon,
  Home,
  LayoutDashboard,
  Users,
  Layers,
  RefreshCw,
  UsersRound,
  BarChart2,
  MessageSquare,
  MessageCircle,
  Settings,
  LogOut,
  Loader2,
  Link as LinkIcon,
  GraduationCap,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";

type Item = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeTone?: "red";
};

export function Sidebar({ collapsed, onClose }: { collapsed: boolean; onClose?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });

  // Buscar perfil, status de plantão e dados da imobiliária
  const { data: profileData, isLoading: isLoadingProfile } = useQuery({
    queryKey: ["profile-with-imobiliaria", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: profile, error: profileError } = await supabase
        .from("perfis")
        .select("*, imobiliarias(*)")
        .eq("id", user.id)
        .single();
      
      if (profileError) throw profileError;
      return profile;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  const profile = profileData;
  const imobiliaria = profileData?.imobiliarias;

  // Mutação para alternar plantão
  const mutation = useMutation({
    mutationFn: async (newValue: boolean) => {
      const { error: profileError } = await supabase
        .from("perfis")
        .update({
          em_plantao: newValue,
          status_roleta: newValue,
          ultimo_checkin: newValue ? new Date().toISOString() : null,
          ultimo_checkin_roleta: newValue ? new Date().toISOString() : null
        })
        .eq("id", user?.id);

      if (profileError) throw profileError;

      // A posição na fila (filas_atendimento) é permanente — só criamos uma
      // linha na primeira vez que o corretor entra em plantão. Ficar
      // ligando/desligando depois disso NUNCA mexe em filas_atendimento,
      // porque isso jogava o corretor pro fim da fila a cada toggle
      // (get_next_corretor_rodizio usa a posição salva + perfis.status_roleta
      // pra decidir quem está elegível, sem precisar remover/recriar a linha).
      if (newValue) {
        const { data: existing } = await supabase
          .from("filas_atendimento")
          .select("id")
          .eq("corretor_id", user?.id)
          .maybeSingle();

        if (!existing) {
          const { data: lastPos } = await supabase
            .from("filas_atendimento")
            .select("posicao")
            .eq("imobiliaria_id", profile?.imobiliaria_id)
            .order("posicao", { ascending: false })
            .limit(1);

          const nextPos = (lastPos?.[0]?.posicao || 0) + 1;

          await supabase.from("filas_atendimento").insert({
            imobiliaria_id: profile?.imobiliaria_id,
            corretor_id: user?.id,
            posicao: nextPos,
            status_on: true
          });
        }
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao realizar check-in.");
    },
    onSuccess: (_, newValue) => {
      queryClient.invalidateQueries({ queryKey: ["profile-with-imobiliaria"] });
      queryClient.invalidateQueries({ queryKey: ["fila-atendimento"] });
      queryClient.invalidateQueries({ queryKey: ["team-list"] });
      toast.success(newValue ? "Check-in realizado! Você está em plantão." : "Check-out realizado.");
    },
  });

  // Contagem de leads para badges
  const { data: counts } = useQuery({
    queryKey: ["sidebar-counts", profile?.imobiliaria_id],
    queryFn: async () => {
      if (!profile?.imobiliaria_id) return { leads: 0, fila: 0 };

      let query = supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("imobiliaria_id", profile.imobiliaria_id);

      // Se for corretor, contar apenas os dele
      if (profile.role === 'corretor') {
        query = query.eq("corretor_id", profile.id);
      }

      const { count: leadsCount } = await query;

      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);

      // Mesma regra das duas abas de /redistribuicao (bolsão + presos), pra
      // o número do badge bater com o que realmente aparece na tela.
      const { count: bolsaoCount } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("imobiliaria_id", profile.imobiliaria_id)
        .is("corretor_id", null)
        .is("descartado_em", null);

      const { count: presosCount } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("imobiliaria_id", profile.imobiliaria_id)
        .not("corretor_id", "is", null)
        .is("descartado_em", null)
        .or(`tentativas_contato.gte.5,and(status.eq.novo,created_at.lt.${yesterday.toISOString()})`);

      return { leads: leadsCount || 0, fila: (bolsaoCount || 0) + (presosCount || 0) };
    },
    enabled: !!profile?.imobiliaria_id,
    staleTime: 1000 * 30,
    refetchInterval: 60000,
  });

  // Contagem de mensagens nao lidas (conversas)
  const { data: naoLidas } = useQuery({
    queryKey: ["sidebar-nao-lidas", profile?.id, profile?.role],
    queryFn: async () => {
      let query = supabase
        .from("mensagens_whatsapp")
        .select("*", { count: "exact", head: true })
        .eq("direcao", "inbound")
        .eq("lida", false);

      if (profile?.role === 'corretor') {
        query = query.eq("corretor_id", profile.id);
      }

      const { count } = await query;
      return count || 0;
    },
    enabled: !!profile?.id,
    staleTime: 1000 * 15,
    refetchInterval: 30000,
  });

  const { can, role } = usePermissions();
  const main: Item[] = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/conversas", label: "Conversas", icon: MessageCircle, badge: naoLidas, badgeTone: "red" },
    { to: "/leads", label: "Leads", icon: Users, badge: counts?.leads },
  ];

  if (can('view_base_leads')) {
    main.push({ to: "/clientes", label: "Clientes", icon: UsersRound });
  }

  main.push({ to: "/imoveis", label: "Imóveis", icon: Home });
  main.push({ to: "/agenda", label: "Tarefas", icon: CalendarIcon });

  if (can('view_roleta')) {
    main.push({ to: "/filas", label: "Roleta", icon: RefreshCw });
  }

  const tools: Item[] = [];

  if (can('configure_system')) {
    tools.push({ to: "/redistribuicao", label: "Rebatidas", icon: Layers, badge: counts?.fila, badgeTone: "red" });
  }

  if (can('manage_team')) {
    tools.push({ to: "/equipe", label: "Equipe", icon: UsersRound });
  }

  if (can('view_reports')) {
    tools.push({ to: "/relatorios", label: "Relatórios", icon: BarChart2 });
  }

  tools.push({ to: "/templates", label: "Templates", icon: MessageSquare });

  // Todo mundo tem acesso à página de integrações (para conectar seu próprio WhatsApp)
  tools.push({ to: "/integracoes", label: "Integrações", icon: Settings });

  tools.push({ to: "/links-uteis", label: "Links Úteis", icon: LinkIcon });
  tools.push({ to: "/treinamentos", label: "Treinamentos", icon: GraduationCap });
  tools.push({ to: "/manual", label: "Manual do CRM", icon: BookOpen });

  if (can('configure_system')) {
    tools.push({ to: "/configuracoes", label: "Ajustes", icon: Settings });
  }

  const nome = profile?.nome ?? user?.email ?? "Usuário";
  const inicial = String(nome).trim().charAt(0).toUpperCase();
  const emPlantao = profile?.em_plantao ?? false;

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
          <span className={`ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white ${item.badgeTone === "red" ? "bg-[#ef4444]" : "bg-primary"}`}>
            {item.badge}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <aside
      className={`flex h-full flex-col bg-[#0f172a] text-white transition-[width] duration-200 ${
        collapsed ? "w-14" : "w-52"
      }`}
    >
      {/* Logo */}
      <div className={`flex h-12 items-center gap-2 border-b border-white/5 ${collapsed ? "justify-center px-1" : "px-4"}`}>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-gradient-brand">
          <Home className="h-4 w-4 text-white" />
        </div>
        {!collapsed && <span className="text-sm font-bold tracking-tight">{imobiliaria?.nome || "Carregando..."}</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 custom-scrollbar">
        {!collapsed && (
          <p className="mb-1.5 px-2 text-[9px] font-bold uppercase tracking-widest text-[#64748b]">
            Menu
          </p>
        )}
        <div className="space-y-0.5">{main.map(renderItem)}</div>

        {!collapsed && (
          <p className="mb-1.5 mt-5 px-2 text-[9px] font-bold uppercase tracking-widest text-[#64748b]">
            Ferramentas
          </p>
        )}
        {collapsed && <div className="my-3 border-t border-white/5" />}
        <div className="space-y-0.5">{tools.map(renderItem)}</div>
      </nav>

      {/* Footer */}
      <div className="border-t border-white/5 p-2">
        {!collapsed && (
          <div className="mb-2 flex items-center justify-between rounded bg-[#1e293b] px-2 py-1.5">
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${emPlantao ? "bg-[#10b981]" : "bg-[#64748b]"}`} />
              <span className="text-[10px] font-semibold text-white/90">{emPlantao ? "No Plantão" : "Offline"}</span>
            </div>
            <button
              type="button"
              role="switch"
              disabled={mutation.isPending || isLoadingProfile}
              aria-checked={emPlantao}
              onClick={() => mutation.mutate(!emPlantao)}
              className={`relative h-4 w-7 rounded-full transition-colors ${
                emPlantao ? "bg-[#10b981]" : "bg-[#475569]"
              } ${mutation.isPending ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {mutation.isPending ? (
                <Loader2 className="absolute top-0.5 left-0.5 h-3 w-3 animate-spin text-white" />
              ) : (
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                    emPlantao ? "translate-x-3.5" : "translate-x-0.5"
                  }`}
                />
              )}
            </button>
          </div>
        )}

        <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-[10px] font-bold text-white uppercase">
            {isLoadingProfile ? <Loader2 className="h-3 w-3 animate-spin" /> : inicial}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold text-white/95">{nome}</p>
              <p className="truncate text-[9px] text-[#94a3b8] uppercase font-medium">{profile?.role || "Corretor"}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="rounded p-1 text-[#94a3b8] transition hover:bg-[#1e293b] hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
