import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  Users,
  TrendingUp,
  Clock,
  ChevronRight,
  PlusCircle,
  Phone,
  BarChart3,
  Zap,
  PhoneCall,
  MapPin,
  Landmark,
  RefreshCw,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { LeadDetailsModal } from "@/components/leads/LeadDetailsModal";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | CRM" }] }),
  component: DashboardPage,
});

const COLORS = ["#1d4ed8", "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6"];

// Primeiro e último dia do mês atual, em formato YYYY-MM-DD (o que o
// <input type="date"> espera) -- essa é a faixa padrão do Dashboard, pedido
// do dono (17/08): "aparecer automático do mês, mas ter opção de filtro por
// data".
function mesAtualRange() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  const toISODate = (d: Date) => d.toISOString().split("T")[0];
  return { inicio: toISODate(inicio), fim: toISODate(fim) };
}

// Início/fim do dia de hoje (hora local do navegador) -- os widgets "no dia"
// (pedido do dono, 11/09) são sempre HOJE, independente do filtro de período
// escolhido pra cima (que é só pra Total de Leads/Vendas/etc).
function hojeRangeIso() {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { inicioIso: inicio.toISOString(), fimIso: fim.toISOString() };
}

interface LeadMini {
  id: string;
  nome: string;
  telefone: string;
  origem: string | null;
  quando: string; // ISO -- created_at, lembrete_follow_up ou data_visita, dependendo do widget
}

function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { role, isLoading: loadingPerms } = usePermissions();
  const isManager = role !== "corretor";
  const mesAtual = mesAtualRange();
  const [dataInicio, setDataInicio] = useState(mesAtual.inicio);
  const [dataFim, setDataFim] = useState(mesAtual.fim);
  const isMesAtual = dataInicio === mesAtual.inicio && dataFim === mesAtual.fim;

  const [leadSelecionadoId, setLeadSelecionadoId] = useState<string | null>(null);
  const [horaSelecionada, setHoraSelecionada] = useState<number | null>(null);
  const [campanhaSelecionada, setCampanhaSelecionada] = useState<string | null>(null);
  const [corretorSelecionado, setCorretorSelecionado] = useState<{ id: string; nome: string } | null>(null);

  // Chave de cache compartilhada com todas as outras páginas -- ver
  // agenda.tsx pro motivo (evita refazer essa consulta a cada navegação).
  const { data: profile } = useQuery({
    queryKey: ["perfil-imobiliaria", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("perfis").select("imobiliaria_id, role").eq("id", user.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["dashboard-summary", profile?.imobiliaria_id, role, dataInicio, dataFim],
    queryFn: async () => {
      if (!profile?.imobiliaria_id || loadingPerms) return null;

      // Faixa exclusiva no fim (dataFim + 1 dia) pra pegar o dia inteiro
      // selecionado, já que created_at/data_fechamento têm hora.
      const inicioIso = new Date(`${dataInicio}T00:00:00`).toISOString();
      const fimExclusivoIso = new Date(new Date(`${dataFim}T00:00:00`).getTime() + 24 * 60 * 60 * 1000).toISOString();

      // Antes isso baixava a tabela de leads INTEIRA pro navegador (paginando
      // de 1000 em 1000) so pra contar status e pegar os 6 mais recentes --
      // com a base na casa dos milhares isso ficava lento em toda visita ao
      // Dashboard. Agora cada numero e um count=exact/head do PostgREST (o
      // Postgres conta sem devolver as linhas) rodando em paralelo, e so os
      // dados de campanha trazem colunas de verdade.
      //
      // Os filtros de corretor_id/descartado_em/descarte_pendente_aprovacao
      // replicam exatamente o que a tela de Leads (Kanban) mostra -- sem
      // eles, "Leads Novos" contava lead sem corretor e ate lead ja
      // descartado (status='novo' que nunca foi limpo), dando um numero bem
      // maior que os cards reais do Kanban (achado real: 144 no Dashboard
      // vs 26 no Kanban, mesma base).
      const base = () => {
        let query = supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("imobiliaria_id", profile.imobiliaria_id)
          .not("corretor_id", "is", null)
          .is("descartado_em", null)
          .eq("descarte_pendente_aprovacao", false);
        if (role === "corretor") {
          query = query.eq("corretor_id", user?.id);
        }
        return query;
      };

      // "Total de Leads" e "Leads Novos" contam quem ENTROU no período
      // (created_at); "Vendas" conta quem FECHOU no período
      // (data_fechamento) -- um lead pode ter chegado meses atrás e vendido
      // agora, não faria sentido exigir os dois na mesma janela. "Em
      // Negociação" e "Atrasados" continuam sendo a foto de agora (estado
      // atual), não fazem sentido "dentro de um período".
      const [totalRes, newRes, progressRes, concludedRes, overdueRes, campanhaRes] = await Promise.all([
        base().gte("created_at", inicioIso).lt("created_at", fimExclusivoIso),
        base().eq("status", "novo").gte("created_at", inicioIso).lt("created_at", fimExclusivoIso),
        base().eq("status", "em_atendimento"),
        base().eq("status", "venda_concluida").gte("data_fechamento", inicioIso).lt("data_fechamento", fimExclusivoIso),
        base().lte("lembrete_follow_up", new Date().toISOString()).is("data_fechamento", null),
        // Gráfico de Campanhas (pedido do dono, 11/09) -- segue o MESMO
        // período escolhido acima (não é "hoje"): campanha não muda minuto a
        // minuto, olhar só o dia deixaria o gráfico vazio na maioria dos dias.
        (() => {
          let q = supabase
            .from("leads")
            .select("id, nome, telefone, origem, created_at")
            .eq("imobiliaria_id", profile.imobiliaria_id)
            .not("corretor_id", "is", null)
            .is("descartado_em", null)
            .eq("descarte_pendente_aprovacao", false)
            .gte("created_at", inicioIso)
            .lt("created_at", fimExclusivoIso);
          if (role === "corretor") q = q.eq("corretor_id", user?.id);
          return q;
        })(),
      ]);

      const firstError = totalRes.error || newRes.error || progressRes.error || concludedRes.error || overdueRes.error || campanhaRes.error;
      if (firstError) throw firstError;

      const porCampanhaMap: Record<string, LeadMini[]> = {};
      (campanhaRes.data || []).forEach((l: any) => {
        const key = l.origem || "Outros";
        (porCampanhaMap[key] ||= []).push({ id: l.id, nome: l.nome, telefone: l.telefone, origem: l.origem, quando: l.created_at });
      });
      const porCampanha = Object.entries(porCampanhaMap)
        .map(([campanha, leads]) => ({ campanha, total: leads.length, leads }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);

      return {
        totalLeads: totalRes.count || 0,
        newLeads: newRes.count || 0,
        inProgress: progressRes.count || 0,
        concluded: concludedRes.count || 0,
        overdueFollowups: overdueRes.count || 0,
        porCampanha,
      };
    },
    enabled: !!profile?.imobiliaria_id && !loadingPerms,
  });

  // Widgets "no dia" (pedido do dono, 11/09): sempre HOJE, independente do
  // período escolhido em cima e independente de quando o lead entrou.
  const { data: hojeData, isLoading: isLoadingHoje } = useQuery({
    queryKey: ["dashboard-hoje", profile?.imobiliaria_id, role, user?.id],
    queryFn: async () => {
      if (!profile?.imobiliaria_id || loadingPerms) return null;
      const imobiliariaId = profile.imobiliaria_id;
      const { inicioIso, fimIso } = hojeRangeIso();

      const scope = (q: any) => (role === "corretor" ? q.eq("corretor_id", user?.id) : q);

      // Nomes reais das colunas de Análise de Crédito dessa imobiliária --
      // mesmo padrão já usado em relatorios.tsx (colunaIdsPorNome), porque
      // colunas do Kanban são customizáveis pelo dono.
      const { data: colunas } = await supabase
        .from("colunas_kanban")
        .select("id, nome")
        .eq("imobiliaria_id", imobiliariaId);
      const nomesCredito = (colunas || [])
        .filter((c: any) => /an[aá]lise|cr[eé]dito/i.test(c.nome))
        .map((c: any) => c.nome.replace(/[%,"]/g, ""));

      const [novosRes, agendaRes, visitasRes, perfisRes, rebatidasRes] = await Promise.all([
        scope(
          supabase
            .from("leads")
            .select("id, nome, telefone, origem, created_at")
            .eq("imobiliaria_id", imobiliariaId)
            .gte("created_at", inicioIso)
            .lt("created_at", fimIso)
        ).order("created_at", { ascending: false }),
        scope(
          supabase
            .from("leads")
            .select("id, nome, telefone, origem, lembrete_follow_up")
            .eq("imobiliaria_id", imobiliariaId)
            .gte("lembrete_follow_up", inicioIso)
            .lt("lembrete_follow_up", fimIso)
            .is("descartado_em", null)
        ).order("lembrete_follow_up", { ascending: true }),
        scope(
          supabase
            .from("leads")
            .select("id, nome, telefone, origem, data_visita")
            .eq("imobiliaria_id", imobiliariaId)
            .gte("data_visita", inicioIso)
            .lt("data_visita", fimIso)
        ).order("data_visita", { ascending: true }),
        supabase.from("perfis").select("id, nome").eq("imobiliaria_id", imobiliariaId),
        // Rebatidas por corretor: descartado_por/descartado_em só ficam
        // preenchidos no descarte NORMAL (descartar_lead_normal) -- descarte
        // extremo pendente de aprovação não passa por aqui, de propósito.
        supabase
          .from("leads")
          .select("id, nome, telefone, origem, descartado_por, descartado_em, motivo_descarte")
          .eq("imobiliaria_id", imobiliariaId)
          .gte("descartado_em", inicioIso)
          .lt("descartado_em", fimIso)
          .not("descartado_por", "is", null),
      ]);

      // Filtro por texto feito no cliente (não no PostgREST) de propósito --
      // o conteúdo gravado tem aspas literais (`Moveu o card para a coluna
      // "Análise de Crédito"`), e um .ilike/.or() com aspas dentro do valor
      // entra em conflito com a própria sintaxe de citação de valor do
      // PostgREST. RLS de leads_interacoes já escopa por imobiliária/lead
      // visível, então um SELECT amplo (só tipo='auto' + hoje) é seguro.
      let creditoHoje: (LeadMini & { corretorId: string | null })[] = [];
      if (nomesCredito.length > 0) {
        const { data: interacoes } = await supabase
          .from("leads_interacoes")
          .select("id, lead_id, created_at, conteudo, leads!inner(nome, telefone, origem, corretor_id, imobiliaria_id)")
          .eq("tipo", "auto")
          .gte("created_at", inicioIso)
          .lt("created_at", fimIso);
        creditoHoje = (interacoes || [])
          .filter((i: any) => nomesCredito.some((n) => i.conteudo?.includes(`coluna "${n}"`)))
          .filter((i: any) => i.leads?.imobiliaria_id === imobiliariaId)
          .filter((i: any) => role !== "corretor" || i.leads?.corretor_id === user?.id)
          .map((i: any) => ({
            id: i.lead_id,
            nome: i.leads?.nome || "Sem nome",
            telefone: i.leads?.telefone || "",
            origem: i.leads?.origem ?? null,
            quando: i.created_at,
            corretorId: i.leads?.corretor_id ?? null,
          }));
      }

      const perfisPorId: Record<string, string> = {};
      (perfisRes.data || []).forEach((p: any) => (perfisPorId[p.id] = p.nome));

      const rebatidasPorCorretorMap: Record<string, LeadMini[]> = {};
      (rebatidasRes.data || []).forEach((l: any) => {
        const key = l.descartado_por;
        (rebatidasPorCorretorMap[key] ||= []).push({
          id: l.id,
          nome: l.nome,
          telefone: l.telefone,
          origem: l.motivo_descarte,
          quando: l.descartado_em,
        });
      });
      const rebatidasPorCorretor = Object.entries(rebatidasPorCorretorMap)
        .map(([corretorId, leads]) => ({ corretorId, nome: perfisPorId[corretorId] || "Corretor removido", total: leads.length, leads }))
        .sort((a, b) => b.total - a.total);

      const novos: LeadMini[] = (novosRes.data || []).map((l: any) => ({ id: l.id, nome: l.nome, telefone: l.telefone, origem: l.origem, quando: l.created_at }));
      const agenda: LeadMini[] = (agendaRes.data || []).map((l: any) => ({ id: l.id, nome: l.nome, telefone: l.telefone, origem: l.origem, quando: l.lembrete_follow_up }));
      const visitas: LeadMini[] = (visitasRes.data || []).map((l: any) => ({ id: l.id, nome: l.nome, telefone: l.telefone, origem: l.origem, quando: l.data_visita }));

      const porHoraMap = new Array(24).fill(0);
      novos.forEach((l) => { porHoraMap[new Date(l.quando).getHours()]++; });
      const porHora = porHoraMap.map((total, hora) => ({ hora, label: String(hora).padStart(2, "0") + "h", total }));

      return { novos, agenda, visitas, credito: creditoHoje, porHora, rebatidasPorCorretor };
    },
    enabled: !!profile?.imobiliaria_id && !loadingPerms,
  });

  // Tempo real (pedido do dono, 11/09): qualquer INSERT/UPDATE em leads dessa
  // imobiliária refaz os widgets "no dia" na hora -- sem precisar dar F5.
  useEffect(() => {
    if (!profile?.imobiliaria_id) return;
    const channel = supabase
      .channel(`dashboard_hoje_${profile.imobiliaria_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `imobiliaria_id=eq.${profile.imobiliaria_id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["dashboard-hoje", profile.imobiliaria_id] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-summary", profile.imobiliaria_id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.imobiliaria_id, queryClient]);

  if (isLoading || loadingPerms || !profile) {
    return (
      <MainLayout>
        <div className="p-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  const isBroker = role === "corretor";
  const maxHora = Math.max(1, ...(hojeData?.porHora.map((h) => h.total) ?? [1]));
  const maxCampanha = Math.max(1, ...(dashboardData?.porCampanha.map((c) => c.total) ?? [1]));

  return (
    <MainLayout>
      <div className="p-4 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {isBroker ? "Meu Dashboard" : "Dashboard Executivo"}
            </h1>
            <p className="text-saas-sm text-muted-foreground">
              {isBroker
                ? "Acompanhe seus leads e atividades individuais."
                : "Monitoramento de performance e gestão em tempo real."}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">De</Label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="h-8 text-xs w-[140px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Até</Label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="h-8 text-xs w-[140px]"
              />
            </div>
            {!isMesAtual && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-[11px] font-bold uppercase tracking-wider px-3"
                onClick={() => { setDataInicio(mesAtual.inicio); setDataFim(mesAtual.fim); }}
              >
                Mês Atual
              </Button>
            )}
            <Link to="/leads">
              <Button size="sm" className="h-8 text-[11px] font-bold uppercase tracking-wider px-4">
                <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Adicionar Lead
              </Button>
            </Link>
          </div>
        </div>

        {/* MÉTRICAS PRINCIPAIS (período selecionado acima) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: "Total de Leads", value: dashboardData?.totalLeads || 0, icon: Users, color: "text-primary", bg: "bg-primary/5" },
            { title: "Leads Novos", value: dashboardData?.newLeads || 0, icon: Zap, color: "text-amber-500", bg: "bg-amber-50" },
            { title: "Em Negociação", value: dashboardData?.inProgress || 0, icon: Clock, color: "text-blue-500", bg: "bg-blue-50" },
            { title: isMesAtual ? "Vendas (Mês)" : "Vendas (Período)", value: dashboardData?.concluded || 0, icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-50" },
          ].map((stat, i) => (
            <Card key={i} className="border-none shadow-soft overflow-hidden group hover:shadow-md transition-all animate-fade-in-up hover-lift" style={{ animationDelay: `${i * 100}ms` }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-lg ${stat.bg}`}>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </div>
                <div>
                  <p className="text-saas-xs text-slate-500 uppercase tracking-widest mb-1">{stat.title}</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-slate-900">{stat.value}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Hoje, em tempo real — {format(new Date(), "dd/MM/yyyy")}</p>
        </div>

        {/* WIDGETS "NO DIA" -- pedido do dono, 11/09 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ListaHojeCard
            titulo="Leads Novos"
            icon={<Zap className="h-3.5 w-3.5 text-amber-500" />}
            leads={hojeData?.novos}
            loading={isLoadingHoje}
            vazio="Nenhum lead novo ainda hoje."
            colunaExtra="campanha"
            onAbrirLead={setLeadSelecionadoId}
          />
          <ListaHojeCard
            titulo="Agendamento no Dia"
            icon={<PhoneCall className="h-3.5 w-3.5 text-blue-500" />}
            leads={hojeData?.agenda}
            loading={isLoadingHoje}
            vazio="Nenhum contato agendado pra hoje."
            colunaExtra="hora"
            onAbrirLead={setLeadSelecionadoId}
          />
          <ListaHojeCard
            titulo="Visitas no Dia"
            icon={<MapPin className="h-3.5 w-3.5 text-emerald-500" />}
            leads={hojeData?.visitas}
            loading={isLoadingHoje}
            vazio="Nenhuma visita marcada pra hoje."
            colunaExtra="hora"
            onAbrirLead={setLeadSelecionadoId}
          />
          <ListaHojeCard
            titulo="Análise de Crédito"
            icon={<Landmark className="h-3.5 w-3.5 text-violet-500" />}
            leads={hojeData?.credito}
            loading={isLoadingHoje}
            vazio="Nenhum card migrado pra análise hoje."
            colunaExtra="hora"
            onAbrirLead={setLeadSelecionadoId}
          />
        </div>

        {/* GRÁFICOS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-7 border-none shadow-soft bg-white overflow-hidden">
            <CardHeader className="py-4 px-5 border-b border-slate-50">
              <CardTitle className="text-sm font-bold">Horários dos Cadastros</CardTitle>
              <CardDescription className="text-saas-xs">Leads que entraram hoje, por hora — clique numa barra pra ver quem foi.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hojeData?.porHora} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" fontSize={9.5} axisLine={false} tickLine={false} interval={1} />
                  <YAxis fontSize={11} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,.1)", fontSize: 12 }} />
                  <Bar
                    dataKey="total"
                    radius={[3, 3, 0, 0]}
                    className="cursor-pointer"
                    onClick={(entry: any) => entry?.total > 0 && setHoraSelecionada(entry.hora)}
                  >
                    {hojeData?.porHora.map((h, i) => (
                      <Cell key={i} fill={h.total > 0 ? "#1d4ed8" : "#f1f5f9"} fillOpacity={h.total > 0 ? 0.85 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="lg:col-span-5 border-none shadow-soft bg-white overflow-hidden">
            <CardHeader className="py-4 px-5 border-b border-slate-50">
              <CardTitle className="text-sm font-bold">Campanhas</CardTitle>
              <CardDescription className="text-saas-xs">Quantidade de leads por campanha no período selecionado — clique numa barra.</CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-2.5 max-h-[240px] overflow-y-auto">
              {(!dashboardData?.porCampanha || dashboardData.porCampanha.length === 0) && (
                <p className="text-saas-xs text-slate-400 py-6 text-center">Sem leads no período.</p>
              )}
              {dashboardData?.porCampanha.map((c, i) => (
                <button
                  key={c.campanha}
                  onClick={() => setCampanhaSelecionada(c.campanha)}
                  className="w-full flex items-center gap-3 group text-left"
                >
                  <span className="w-28 shrink-0 text-[10.5px] font-bold text-slate-500 uppercase text-right truncate group-hover:text-primary">{c.campanha}</span>
                  <div className="flex-1 h-5 bg-slate-50 rounded-md overflow-hidden">
                    <div
                      className="h-full transition-all rounded-md flex items-center justify-end px-2"
                      style={{ width: `${Math.max(6, (c.total / maxCampanha) * 100)}%`, background: COLORS[i % COLORS.length], opacity: 0.85 }}
                    >
                      <span className="text-[10px] font-bold text-white">{c.total}</span>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* REBATIDAS POR CORRETOR NO DIA -- só faz sentido comparar entre corretores pra quem gerencia */}
        {isManager && (
          <Card className="border-none shadow-soft bg-white overflow-hidden">
            <CardHeader className="py-4 px-5 border-b border-slate-50 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold">Rebatidas no Dia, por Corretor</CardTitle>
                <CardDescription className="text-saas-xs">Quantos leads cada corretor devolveu pro bolsão hoje. Clique num corretor pra ver quais.</CardDescription>
              </div>
              <RefreshCw className="h-4 w-4 text-slate-300" />
            </CardHeader>
            <CardContent className="p-4">
              {(!hojeData?.rebatidasPorCorretor || hojeData.rebatidasPorCorretor.length === 0) && (
                <p className="text-saas-xs text-slate-400 py-4 text-center">Nenhuma rebatida registrada hoje.</p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {hojeData?.rebatidasPorCorretor.map((r) => (
                  <button
                    key={r.corretorId}
                    onClick={() => setCorretorSelecionado({ id: r.corretorId, nome: r.nome })}
                    className="flex items-center justify-between gap-2 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 hover:border-slate-200 transition-all text-left"
                  >
                    <span className="text-saas-xs font-bold text-slate-700 truncate">{r.nome}</span>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-500 font-bold text-[10px] shrink-0">{r.total}</Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Drill-down: hora do gráfico de horários */}
      <Dialog open={horaSelecionada !== null} onOpenChange={(open) => { if (!open) setHoraSelecionada(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold uppercase">
              {horaSelecionada !== null && String(horaSelecionada).padStart(2, "0") + "h"} · {hojeData?.novos.filter((l) => new Date(l.quando).getHours() === horaSelecionada).length || 0} leads
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-1.5 pr-3">
              {hojeData?.novos.filter((l) => new Date(l.quando).getHours() === horaSelecionada).map((lead) => (
                <LinhaLead key={lead.id} lead={lead} onClick={() => { setLeadSelecionadoId(lead.id); setHoraSelecionada(null); }} />
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Drill-down: campanha do gráfico de campanhas */}
      <Dialog open={!!campanhaSelecionada} onOpenChange={(open) => { if (!open) setCampanhaSelecionada(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold uppercase">
              {campanhaSelecionada} · {dashboardData?.porCampanha.find((c) => c.campanha === campanhaSelecionada)?.total || 0} leads
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-1.5 pr-3">
              {dashboardData?.porCampanha.find((c) => c.campanha === campanhaSelecionada)?.leads.map((lead) => (
                <LinhaLead key={lead.id} lead={lead} onClick={() => { setLeadSelecionadoId(lead.id); setCampanhaSelecionada(null); }} />
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Drill-down: rebatidas de um corretor específico hoje */}
      <Dialog open={!!corretorSelecionado} onOpenChange={(open) => { if (!open) setCorretorSelecionado(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold uppercase">
              {corretorSelecionado?.nome} · {hojeData?.rebatidasPorCorretor.find((r) => r.corretorId === corretorSelecionado?.id)?.total || 0} rebatidas hoje
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-1.5 pr-3">
              {hojeData?.rebatidasPorCorretor.find((r) => r.corretorId === corretorSelecionado?.id)?.leads.map((lead) => (
                <LinhaLead key={lead.id} lead={lead} motivoLabel onClick={() => { setLeadSelecionadoId(lead.id); setCorretorSelecionado(null); }} />
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <LeadDetailsModal
        leadId={leadSelecionadoId}
        open={!!leadSelecionadoId}
        onOpenChange={(open) => { if (!open) setLeadSelecionadoId(null); }}
      />
    </MainLayout>
  );
}

function LinhaLead({ lead, onClick, motivoLabel }: { lead: LeadMini; onClick: () => void; motivoLabel?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center justify-between gap-3 p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
    >
      <span className="flex flex-col min-w-0">
        <span className="text-xs font-bold text-slate-700 truncate">{lead.nome}</span>
        {lead.origem && <span className="text-[10px] text-slate-400 truncate">{motivoLabel ? "Motivo: " : ""}{lead.origem}</span>}
      </span>
      <span className="text-[10px] text-slate-400 flex items-center gap-1 shrink-0">
        <Phone className="h-3 w-3" /> {lead.telefone}
      </span>
    </button>
  );
}

function ListaHojeCard({
  titulo,
  icon,
  leads,
  loading,
  vazio,
  colunaExtra,
  onAbrirLead,
}: {
  titulo: string;
  icon: React.ReactNode;
  leads: LeadMini[] | undefined;
  loading: boolean;
  vazio: string;
  colunaExtra: "campanha" | "hora";
  onAbrirLead: (id: string) => void;
}) {
  return (
    <Card className="border-none shadow-soft bg-white overflow-hidden flex flex-col">
      <CardHeader className="py-3.5 px-4 border-b border-slate-50 flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-[13px] font-bold">{titulo}</CardTitle>
        </div>
        <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-bold text-[10px]">{leads?.length ?? (loading ? "…" : 0)}</Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[220px] overflow-y-auto divide-y divide-slate-50">
          {loading && <p className="text-[11px] text-slate-400 p-4 text-center">Carregando…</p>}
          {!loading && (!leads || leads.length === 0) && <p className="text-[11px] text-slate-400 p-4 text-center">{vazio}</p>}
          {leads?.map((lead) => (
            <button
              key={lead.id}
              onClick={() => onAbrirLead(lead.id)}
              className="w-full flex items-center gap-2.5 p-2.5 hover:bg-slate-50/70 transition-colors text-left group"
            >
              <Avatar className="h-7 w-7 border border-slate-100 shrink-0">
                <AvatarFallback className="bg-slate-50 text-slate-400 text-[10px] font-bold">{lead.nome?.[0] || "?"}</AvatarFallback>
              </Avatar>
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] font-bold text-slate-800 truncate">{lead.nome || "Sem nome"}</span>
                <span className="block text-[10px] text-slate-400 truncate">
                  {colunaExtra === "campanha" ? (lead.origem || "Sem campanha") : format(new Date(lead.quando), "HH:mm")}
                  {colunaExtra === "campanha" && " · " + format(new Date(lead.quando), "HH:mm")}
                </span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
