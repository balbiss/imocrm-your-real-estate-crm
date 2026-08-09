import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Target, CheckCircle, Clock, Calendar, BarChart3, Loader2, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LeadDetailsModal } from "@/components/leads/LeadDetailsModal";

import { useNavigate } from "@tanstack/react-router";
import { usePermissions } from "@/hooks/usePermissions";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — CRM" }] }),
  component: ReportsPage,
});

const COLORS = ["#1d4ed8", "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6"];

function ReportsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { role, isLoading: loadingPerms } = usePermissions();
  const [statusSelecionado, setStatusSelecionado] = React.useState<string | null>(null);
  const [leadSelecionadoId, setLeadSelecionadoId] = React.useState<string | null>(null);
  const [colunaSelecionada, setColunaSelecionada] = React.useState<{ id: string; nome: string } | null>(null);
  const mesAtual = new Date().toISOString().slice(0, 7);
  const [mesFiltro, setMesFiltro] = React.useState<string>(mesAtual);
  const [corretorFiltroRel, setCorretorFiltroRel] = React.useState<string>("todos");
  const [origemFiltroRel, setOrigemFiltroRel] = React.useState<string>("todas");

  // Proteção de rota
  React.useEffect(() => {
    if (!loadingPerms && role === 'corretor') {
      navigate({ to: "/dashboard" });
    }
  }, [role, loadingPerms, navigate]);

  const { data: profile } = useQuery({
    queryKey: ["user-profile-reports", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("perfis").select("imobiliaria_id").eq("id", user.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: raw, isLoading } = useQuery({
    queryKey: ["reports-dashboard-raw", profile?.imobiliaria_id],
    queryFn: async () => {
      if (!profile?.imobiliaria_id) return null;

      // O Supabase/PostgREST limita cada resposta a 1000 linhas por padrao —
      // busca em paginas ate esgotar, pra nao subestimar os relatorios
      // quando a base passar disso.
      const PAGE_SIZE = 1000;
      let leads: any[] = [];
      let leadsError: any = null;
      {
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from("leads")
            .select("*")
            .eq("imobiliaria_id", profile.imobiliaria_id)
            .range(from, from + PAGE_SIZE - 1);
          if (error) { leadsError = error; break; }
          leads = leads.concat(data || []);
          if (!data || data.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }
      }

      const { data: team, error: corrError } = await supabase
        .from("perfis")
        .select("id, nome, avatar_url")
        .eq("imobiliaria_id", profile.imobiliaria_id);

      const { data: colunas, error: colunasError } = await supabase
        .from("colunas_kanban")
        .select("id, nome, posicao")
        .eq("imobiliaria_id", profile.imobiliaria_id)
        .order("posicao", { ascending: true });

      if (leadsError || corrError || colunasError) throw leadsError || corrError || colunasError;

      return { leads, team: team || [], colunas: colunas || [] };
    },
    enabled: !!profile?.imobiliaria_id
  });

  const origensDisponiveis = React.useMemo(() => {
    const set = new Set<string>();
    raw?.leads.forEach((l: any) => set.add(l.origem || "Outros"));
    return Array.from(set).sort();
  }, [raw]);

  const stats = React.useMemo(() => {
    if (!raw) return null;

    const leads = raw.leads.filter((l: any) => {
      if (mesFiltro && !l.created_at?.startsWith(mesFiltro)) return false;
      if (corretorFiltroRel !== "todos" && l.corretor_id !== corretorFiltroRel) return false;
      if (origemFiltroRel !== "todas" && (l.origem || "Outros") !== origemFiltroRel) return false;
      return true;
    });
    const team = raw.team;

    // Agrupar por Origem
    const byOrigin = leads.reduce((acc: any, lead: any) => {
      acc[lead.origem || "Outros"] = (acc[lead.origem || "Outros"] || 0) + 1;
      return acc;
    }, {});
    const originData = Object.keys(byOrigin).map(key => ({ name: key, value: byOrigin[key] }));

    // Agrupar por Status
    const byStatus = leads.reduce((acc: any, lead: any) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1;
      return acc;
    }, {});
    const statusData = Object.keys(byStatus).map(key => ({ name: key, value: byStatus[key] }));

    // Agrupar por Temperatura
    const byTemp = leads.reduce((acc: any, lead: any) => {
      const t = lead.temperatura || "Não definido";
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});
    const tempData = [
      { name: "Quente", value: byTemp["quente"] || 0, color: "#ef4444" },
      { name: "Morno", value: byTemp["morno"] || 0, color: "#f59e0b" },
      { name: "Frio", value: byTemp["frio"] || 0, color: "#3b82f6" },
    ];

    // Funil real — pelas colunas de kanban de verdade da imobiliária (cada
    // uma tem o nome que o dono escolheu, ex: "Análise de Crédito", "FID"),
    // em vez do status retrocompatível fixo, que não tem esses nomes.
    // Venda entra como etapa final separada (não é uma coluna do kanban).
    const funil = raw.colunas.map((c: any) => ({
      id: c.id,
      nome: c.nome,
      value: leads.filter((l: any) => l.coluna_kanban_id === c.id).length,
    }));
    // Vendas usa data_fechamento (quando a venda foi FECHADA), não created_at
    // (quando o lead ENTROU) — um lead criado em junho e fechado em agosto
    // precisa aparecer no relatório de agosto, senão a venda "some" do mês
    // em que ela realmente aconteceu (bug reportado: "vendas não aparecem
    // em relatórios"). Aplica os mesmos filtros de corretor/campanha, só
    // troca o filtro de data.
    const leadsFechadosNoMes = raw.leads.filter((l: any) => {
      if (!l.data_fechamento || !l.data_fechamento.startsWith(mesFiltro)) return false;
      if (corretorFiltroRel !== "todos" && l.corretor_id !== corretorFiltroRel) return false;
      if (origemFiltroRel !== "todas" && (l.origem || "Outros") !== origemFiltroRel) return false;
      return true;
    });
    const vendasDoMes = leadsFechadosNoMes.length;

    const colunaIdsPorNome = (padrao: string) =>
      raw.colunas.filter((c: any) => c.nome.toLowerCase().includes(padrao)).map((c: any) => c.id);
    const idsAnaliseCredito = colunaIdsPorNome("analise") .concat(colunaIdsPorNome("crédito")).concat(colunaIdsPorNome("credito"));
    const idsFid = colunaIdsPorNome("fid");
    const idsAgendado = colunaIdsPorNome("agenda").concat(colunaIdsPorNome("reunião")).concat(colunaIdsPorNome("reuniao"));
    const idsVisitou = colunaIdsPorNome("visita");
    const idsAprovado = colunaIdsPorNome("aprovado").concat(colunaIdsPorNome("fechamento"));
    // Pedido do dono (09/08, spec de relatórios): completar as etapas que
    // faltavam na tabela por corretor -- mesmo padrão já usado acima
    // (busca coluna real do kanban pelo nome, não um status fixo).
    const idsCobrarDoc = colunaIdsPorNome("cobrar doc");
    const idsPendente = colunaIdsPorNome("pendente");
    const idsRestricao = colunaIdsPorNome("restricao").concat(colunaIdsPorNome("restrição"));
    // Descarte/Descadastrado não são colunas do kanban -- são estados
    // marcados por descartado_em/motivo_descarte (mesma regra já usada em
    // redistribuicao.tsx pra separar as abas "Leads Descartados" vs
    // "Lead Descadastrar": motivo extremo = precisou aprovação do dono).
    const MOTIVOS_DESCADASTRO = ["Descadastrar", "Já Comprou (Outra Empresa)"];
    const ehDescadastrado = (l: any) => !!l.descartado_em && MOTIVOS_DESCADASTRO.includes(l.motivo_descarte);
    const ehDescarteComum = (l: any) => !!l.descartado_em && !MOTIVOS_DESCADASTRO.includes(l.motivo_descarte);

    const respondedLeads = leads.filter((l: any) => l.primeiro_contato_em);
    const avgResponseTime = respondedLeads.length > 0
      ? respondedLeads.reduce((acc: number, lead: any) => {
          const diff = new Date(lead.primeiro_contato_em!).getTime() - new Date(lead.created_at).getTime();
          return acc + diff;
        }, 0) / respondedLeads.length / (1000 * 60)
      : 0;

    // Performance por Corretor — pedido do dono: além de leads/vendas/conversão,
    // quebrar por etapa (rebatidas puxadas, agendados, visitou, análise de
    // crédito, aprovado, FID) pra ele conseguir cobrar cada corretor por
    // etapa do funil, não só pelo total.
    const brokerPerformance = team?.map((broker: any) => {
      const brokerLeads = leads.filter((l: any) => l.corretor_id === broker.id);
      const brokerConverted = leadsFechadosNoMes.filter((l: any) => l.corretor_id === broker.id).length;
      const brokerResponded = brokerLeads.filter((l: any) => l.primeiro_contato_em);
      const brokerAvgSLA = brokerResponded.length > 0
        ? brokerResponded.reduce((acc: number, lead: any) => {
            const diff = new Date(lead.primeiro_contato_em!).getTime() - new Date(lead.created_at).getTime();
            return acc + diff;
          }, 0) / brokerResponded.length / (1000 * 60)
        : 0;

      return {
        id: broker.id,
        nome: broker.nome,
        avatar: broker.avatar_url,
        leads: brokerLeads.length,
        rebatidas: brokerLeads.filter((l: any) => l.status === "rebatida").length,
        agendados: brokerLeads.filter((l: any) => idsAgendado.includes(l.coluna_kanban_id)).length,
        visitou: brokerLeads.filter((l: any) => idsVisitou.includes(l.coluna_kanban_id)).length,
        cobrarDoc: brokerLeads.filter((l: any) => idsCobrarDoc.includes(l.coluna_kanban_id)).length,
        pendente: brokerLeads.filter((l: any) => idsPendente.includes(l.coluna_kanban_id)).length,
        analiseCredito: brokerLeads.filter((l: any) => idsAnaliseCredito.includes(l.coluna_kanban_id)).length,
        restricao: brokerLeads.filter((l: any) => idsRestricao.includes(l.coluna_kanban_id)).length,
        aprovado: brokerLeads.filter((l: any) => idsAprovado.includes(l.coluna_kanban_id)).length,
        fid: brokerLeads.filter((l: any) => idsFid.includes(l.coluna_kanban_id)).length,
        descarte: brokerLeads.filter(ehDescarteComum).length,
        descadastrado: brokerLeads.filter(ehDescadastrado).length,
        vendas: brokerConverted,
        sla: Math.round(brokerAvgSLA),
        conversao: brokerLeads.length > 0 ? ((brokerConverted / brokerLeads.length) * 100).toFixed(1) : "0"
      };
    }) || [];

    // Relatório de Campanhas (Fase 2, pedido do dono 09/08): funil de
    // conversão em % por origem/anúncio -- mesmas colunas do kanban já
    // resolvidas acima, só agrupando por origem em vez de por corretor.
    // % é sobre o total de leads daquela campanha no período filtrado.
    const campanhaPerformance = origensDisponiveis.map((origem) => {
      const leadsOrigem = leads.filter((l: any) => (l.origem || "Outros") === origem);
      const total = leadsOrigem.length;
      const vendasOrigem = leadsFechadosNoMes.filter((l: any) => (l.origem || "Outros") === origem).length;
      const pct = (n: number) => (total > 0 ? ((n / total) * 100) : 0);

      const agendado = leadsOrigem.filter((l: any) => idsAgendado.includes(l.coluna_kanban_id)).length;
      const visitou = leadsOrigem.filter((l: any) => idsVisitou.includes(l.coluna_kanban_id)).length;
      const analiseCredito = leadsOrigem.filter((l: any) => idsAnaliseCredito.includes(l.coluna_kanban_id)).length;
      const restricao = leadsOrigem.filter((l: any) => idsRestricao.includes(l.coluna_kanban_id)).length;
      const descadastrado = leadsOrigem.filter(ehDescadastrado).length;

      return {
        origem,
        total,
        agendadoPct: pct(agendado),
        visitouPct: pct(visitou),
        analiseCreditoPct: pct(analiseCredito),
        restricaoPct: pct(restricao),
        descadastradoPct: pct(descadastrado),
        vendas: vendasOrigem,
        vendasPct: pct(vendasOrigem),
      };
    }).sort((a, b) => b.total - a.total);

    return {
      totalLeads: leads.length,
      converted: vendasDoMes,
      avgResponseTime: Math.round(avgResponseTime),
      originData,
      statusData,
      tempData,
      funil,
      vendasDoMes,
      leadsFechadosNoMes,
      brokerPerformance: brokerPerformance.sort((a: any, b: any) => b.vendas - a.vendas),
      campanhaPerformance,
      leads,
    };
  }, [raw, mesFiltro, corretorFiltroRel, origemFiltroRel]);

  if (isLoading || !profile) {
    return (
      <MainLayout>
        <div className="p-8 flex flex-col items-center justify-center min-h-[400px] gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-slate-500">Compilando inteligência comercial...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-4 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Analytics & Performance</h1>
            <p className="text-saas-sm text-muted-foreground">Visão geral da saúde comercial e conversão.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none z-10" />
              <input
                type="month"
                value={mesFiltro}
                onChange={(e) => setMesFiltro(e.target.value)}
                className="h-8 pl-8 pr-2 text-[11px] font-bold border border-slate-200 rounded-md text-slate-700 bg-white"
              />
            </div>
            {(role === "dono" || role === "gerente") && (
              <Select value={corretorFiltroRel} onValueChange={setCorretorFiltroRel}>
                <SelectTrigger className="h-8 w-[160px] text-[11px] font-bold">
                  <SelectValue placeholder="Corretor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os corretores</SelectItem>
                  {raw?.team.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={origemFiltroRel} onValueChange={setOrigemFiltroRel}>
              <SelectTrigger className="h-8 w-[180px] text-[11px] font-bold">
                <SelectValue placeholder="Campanha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as campanhas</SelectItem>
                {origensDisponiveis.map((o) => (
                  <SelectItem key={o} value={o} className="truncate">{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Leads no Mês" value={stats?.totalLeads} trend={format(new Date(`${mesFiltro}-02`), "MMMM 'de' yyyy", { locale: ptBR })} icon={<Users />} color="text-primary" />
          <StatCard title="SLA de Atendimento" value={`${stats?.avgResponseTime} min`} trend="Meta: 5min" icon={<Clock />} color="text-amber-500" />
          <StatCard title="Taxa de Conversão" value={`${((stats?.converted || 0) / (stats?.totalLeads || 1) * 100).toFixed(1)}%`} trend="No período filtrado" icon={<Target />} color="text-blue-500" />
          <StatCard title="Vendas no Mês" value={stats?.vendasDoMes} trend="Fechamentos" icon={<CheckCircle />} color="text-emerald-500" />
        </div>

        <Card className="border-none shadow-soft bg-white overflow-hidden">
          <CardHeader className="py-4 px-5 border-b border-slate-50">
            <CardTitle className="text-sm font-bold">Funil Completo</CardTitle>
            <CardDescription className="text-saas-xs">Quantos leads passaram por cada etapa no período filtrado — clique numa barra pra ver os cards</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-2.5">
            {stats?.funil.map((etapa: any) => {
              const max = Math.max(1, ...(stats.funil.map((e: any) => e.value)), stats.vendasDoMes);
              return (
                <button
                  key={etapa.id}
                  onClick={() => setColunaSelecionada({ id: etapa.id, nome: etapa.nome })}
                  className="w-full flex items-center gap-3 group"
                >
                  <span className="w-36 shrink-0 text-[10px] font-bold text-slate-500 uppercase text-right truncate group-hover:text-primary">{etapa.nome}</span>
                  <div className="flex-1 h-6 bg-slate-50 rounded-md overflow-hidden">
                    <div
                      className="h-full bg-blue-500/80 group-hover:bg-blue-600 transition-all rounded-md flex items-center justify-end px-2"
                      style={{ width: `${Math.max(4, (etapa.value / max) * 100)}%` }}
                    >
                      {etapa.value > 0 && <span className="text-[10px] font-bold text-white">{etapa.value}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
            <button
              onClick={() => setStatusSelecionado("venda_concluida")}
              className="w-full flex items-center gap-3 group pt-1 border-t border-slate-100"
            >
              <span className="w-36 shrink-0 text-[10px] font-bold text-emerald-600 uppercase text-right truncate">Venda</span>
              <div className="flex-1 h-6 bg-slate-50 rounded-md overflow-hidden">
                <div
                  className="h-full bg-emerald-500/80 group-hover:bg-emerald-600 transition-all rounded-md flex items-center justify-end px-2"
                  style={{ width: `${Math.max(4, (stats?.vendasDoMes || 0) / Math.max(1, ...(stats?.funil.map((e: any) => e.value) || [1]), stats?.vendasDoMes || 1) * 100)}%` }}
                >
                  {(stats?.vendasDoMes || 0) > 0 && <span className="text-[10px] font-bold text-white">{stats?.vendasDoMes}</span>}
                </div>
              </div>
            </button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-7 border-none shadow-soft bg-white overflow-hidden">
            <CardHeader className="py-4 px-5 border-b border-slate-50 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold">Qualidade dos Leads</CardTitle>
                <CardDescription className="text-saas-xs">Distribuição por potencial de fechamento (Temperatura)</CardDescription>
              </div>
              <BarChart3 className="h-4 w-4 text-slate-300" />
            </CardHeader>
            <CardContent className="p-6 h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.tempData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" fontSize={11} axisLine={false} tickLine={false} />
                  <YAxis fontSize={11} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                    {stats?.tempData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="lg:col-span-5 border-none shadow-soft bg-white overflow-hidden">
            <CardHeader className="py-4 px-5 border-b border-slate-50">
              <CardTitle className="text-sm font-bold">Status do Funil</CardTitle>
              <CardDescription className="text-saas-xs">Etapas atuais dos leads ativos</CardDescription>
            </CardHeader>
            <CardContent className="p-6 h-[280px] flex flex-col items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats?.statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                    className="cursor-pointer"
                    onClick={(entry: any) => setStatusSelecionado(entry.name)}
                  >
                    {stats?.statusData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                <p className="text-xl font-bold text-slate-900">{stats?.totalLeads}</p>
                <p className="text-[9px] uppercase font-bold text-slate-400 tracking-tighter">Leads Ativos</p>
              </div>
            </CardContent>
            <div className="px-6 pb-6 grid grid-cols-2 gap-2">
                {stats?.statusData.map((item: any, index: number) => (
                  <div
                    key={item.name}
                    className="flex items-center gap-2 cursor-pointer hover:opacity-70 rounded px-1 -mx-1"
                    onClick={() => setStatusSelecionado(item.name)}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-[10px] font-bold text-slate-500 uppercase truncate max-w-[100px]">{item.name.replace('_', ' ')}</span>
                    <span className="text-[10px] font-bold ml-auto">{item.value}</span>
                  </div>
                ))}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-none shadow-soft bg-white overflow-hidden">
            <CardHeader className="py-4 px-5 border-b border-slate-50">
              <CardTitle className="text-sm font-bold">Volume por Canal</CardTitle>
              <CardDescription className="text-saas-xs">Leads por plataforma de origem</CardDescription>
            </CardHeader>
            <CardContent className="p-6 h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.originData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" fontSize={11} axisLine={false} tickLine={false} />
                  <YAxis fontSize={11} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="#1d4ed8" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-none shadow-soft bg-white overflow-hidden">
            <CardHeader className="py-4 px-5 border-b border-slate-50">
              <CardTitle className="text-sm font-bold">Ranking de Consultores</CardTitle>
              <CardDescription className="text-saas-xs">Performance individual e conversão</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
               <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-50 bg-slate-50/50">
                        <th className="px-5 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consultor</th>
                        <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Novos</th>
                        <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Rebat.</th>
                        <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Agend.</th>
                        <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Visitou</th>
                        <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Cobrar Doc</th>
                        <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Pendente</th>
                        <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">An. Créd.</th>
                        <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Restrição</th>
                        <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Aprov.</th>
                        <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">FID</th>
                        <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Vendas</th>
                        <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Descarte</th>
                        <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Descad.</th>
                        <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Conv.</th>
                        <th className="px-5 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">SLA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {stats?.brokerPerformance.map((broker: any) => (
                        <tr key={broker.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3">
                             <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 overflow-hidden">
                                   {broker.avatar ? <img src={broker.avatar} className="w-full h-full object-cover" /> : broker.nome?.[0]}
                                </div>
                                <span className="text-saas-xs font-bold text-slate-700">{broker.nome}</span>
                             </div>
                          </td>
                          <td className="px-3 py-3 text-center text-saas-xs font-medium text-slate-600">{broker.leads}</td>
                          <td className="px-3 py-3 text-center text-saas-xs font-medium text-slate-600">{broker.rebatidas}</td>
                          <td className="px-3 py-3 text-center text-saas-xs font-medium text-slate-600">{broker.agendados}</td>
                          <td className="px-3 py-3 text-center text-saas-xs font-medium text-slate-600">{broker.visitou}</td>
                          <td className="px-3 py-3 text-center text-saas-xs font-medium text-slate-600">{broker.cobrarDoc}</td>
                          <td className="px-3 py-3 text-center text-saas-xs font-medium text-slate-600">{broker.pendente}</td>
                          <td className="px-3 py-3 text-center text-saas-xs font-medium text-slate-600">{broker.analiseCredito}</td>
                          <td className="px-3 py-3 text-center text-saas-xs font-medium text-rose-600">{broker.restricao}</td>
                          <td className="px-3 py-3 text-center text-saas-xs font-medium text-slate-600">{broker.aprovado}</td>
                          <td className="px-3 py-3 text-center text-saas-xs font-medium text-slate-600">{broker.fid}</td>
                          <td className="px-3 py-3 text-center text-saas-xs font-bold text-emerald-600">{broker.vendas}</td>
                          <td className="px-3 py-3 text-center text-saas-xs font-medium text-slate-400">{broker.descarte}</td>
                          <td className="px-3 py-3 text-center text-saas-xs font-medium text-slate-400">{broker.descadastrado}</td>
                          <td className="px-3 py-3 text-center">
                             <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-black border-none bg-slate-100 text-slate-600">{broker.conversao}%</Badge>
                          </td>
                          <td className="px-5 py-3 text-center text-saas-xs font-bold text-slate-700">{broker.sla}m</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-none shadow-soft bg-white overflow-hidden">
          <CardHeader className="py-4 px-5 border-b border-slate-50">
            <CardTitle className="text-sm font-bold">Relatório de Campanhas</CardTitle>
            <CardDescription className="text-saas-xs">Funil de conversão por campanha/anúncio — % sobre o total de leads daquela campanha no período filtrado</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-50 bg-slate-50/50">
                    <th className="px-5 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Campanha</th>
                    <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Leads</th>
                    <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Agendamento</th>
                    <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Visita</th>
                    <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">An. Crédito</th>
                    <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Restrição</th>
                    <th className="px-3 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Descadastrar</th>
                    <th className="px-5 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Venda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {stats?.campanhaPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-saas-xs text-slate-400 font-medium">
                        Nenhuma campanha no período filtrado.
                      </td>
                    </tr>
                  ) : (
                    stats?.campanhaPerformance.map((camp: any) => (
                      <tr key={camp.origem} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3">
                          <span className="text-saas-xs font-bold text-slate-700 truncate block max-w-[220px]" title={camp.origem}>{camp.origem}</span>
                        </td>
                        <td className="px-3 py-3 text-center text-saas-xs font-bold text-slate-700">{camp.total}</td>
                        <td className="px-3 py-3 text-center text-saas-xs font-medium text-slate-600">{camp.agendadoPct.toFixed(1)}%</td>
                        <td className="px-3 py-3 text-center text-saas-xs font-medium text-slate-600">{camp.visitouPct.toFixed(1)}%</td>
                        <td className="px-3 py-3 text-center text-saas-xs font-medium text-slate-600">{camp.analiseCreditoPct.toFixed(1)}%</td>
                        <td className="px-3 py-3 text-center text-saas-xs font-medium text-rose-600">{camp.restricaoPct.toFixed(1)}%</td>
                        <td className="px-3 py-3 text-center text-saas-xs font-medium text-slate-400">{camp.descadastradoPct.toFixed(1)}%</td>
                        <td className="px-5 py-3 text-center">
                          <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-black border-none bg-emerald-50 text-emerald-600">
                            {camp.vendas} · {camp.vendasPct.toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!statusSelecionado} onOpenChange={(open) => { if (!open) setStatusSelecionado(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold uppercase">
              {statusSelecionado?.replace('_', ' ')} · {(statusSelecionado === "venda_concluida" ? stats?.leadsFechadosNoMes : stats?.leads.filter((l: any) => l.status === statusSelecionado))?.length || 0} leads
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-1.5 pr-3">
              {(statusSelecionado === "venda_concluida" ? stats?.leadsFechadosNoMes : stats?.leads.filter((l: any) => l.status === statusSelecionado))?.map((lead: any) => (
                <button
                  key={lead.id}
                  onClick={() => { setLeadSelecionadoId(lead.id); setStatusSelecionado(null); }}
                  className="w-full text-left flex items-center justify-between gap-3 p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <span className="text-xs font-bold text-slate-700 truncate">{lead.nome}</span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 shrink-0">
                    <Phone className="h-3 w-3" /> {lead.telefone}
                  </span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={!!colunaSelecionada} onOpenChange={(open) => { if (!open) setColunaSelecionada(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold uppercase">
              {colunaSelecionada?.nome} · {stats?.leads.filter((l: any) => l.coluna_kanban_id === colunaSelecionada?.id).length} leads
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-1.5 pr-3">
              {stats?.leads.filter((l: any) => l.coluna_kanban_id === colunaSelecionada?.id).map((lead: any) => (
                <button
                  key={lead.id}
                  onClick={() => { setLeadSelecionadoId(lead.id); setColunaSelecionada(null); }}
                  className="w-full text-left flex items-center justify-between gap-3 p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <span className="text-xs font-bold text-slate-700 truncate">{lead.nome}</span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 shrink-0">
                    <Phone className="h-3 w-3" /> {lead.telefone}
                  </span>
                </button>
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

function StatCard({ title, value, trend, icon, color }: any) {
  return (
    <Card className="border-none shadow-soft bg-white hover:shadow-md transition-all">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-saas-xs font-bold text-slate-400 uppercase tracking-widest">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-900">{value}</span>
            <span className="text-[9px] font-bold text-emerald-500">{trend}</span>
          </div>
        </div>
        <div className={`p-2.5 rounded-lg bg-slate-50 ${color}`}>
          {React.cloneElement(icon, { className: "h-4 w-4" })}
        </div>
      </CardContent>
    </Card>
  );
}
