import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { LeadsKanban } from "@/components/leads/LeadsKanban";
import { NewLeadDialog } from "@/components/leads/NewLeadDialog";
import { LeadsTable } from "@/components/leads/LeadsTable";
import { BolsaoResgateDialog } from "@/components/leads/BolsaoResgateDialog";
import { AprovacoesDescarteDialog } from "@/components/leads/AprovacoesDescarteDialog";
import { AprovacoesVendaDialog } from "@/components/leads/AprovacoesVendaDialog";
import { ManageColumnsDialog } from "@/components/leads/ManageColumnsDialog";

import { Button } from "@/components/ui/button";
import { Plus, Filter, Search, List, Kanban, AlertCircle, Clock, Loader2, RefreshCw, Sliders, MoreHorizontal, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { normalizarCidade, dedupCidades } from "@/lib/utils";

export const Route = createFileRoute("/leads")({
  head: () => ({ meta: [{ title: "Leads — CRM" }] }),
  component: LeadsPage,
});

function LeadsPage() {
  const { user } = useAuth();
  const { role, isLoading: loadingPerms } = usePermissions();
  const [isNewLeadOpen, setIsNewLeadOpen] = useState(false);
  const [isBolsaoOpen, setIsBolsaoOpen] = useState(false);
  const [isAprovacoesOpen, setIsAprovacoesOpen] = useState(false);
  const [isAprovacoesVendaOpen, setIsAprovacoesVendaOpen] = useState(false);
  const [isManageColumnsOpen, setIsManageColumnsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [view, setView] = useState("kanban");
  const [tempFilter, setTempFilter] = useState<string | null>(null);
  const [corretorFilter, setCorretorFilter] = useState<string>('todos');
  const [cidadeFilter, setCidadeFilter] = useState<string>('todas');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  // Filtro de data (pedido do dono, 20/08): pra saber quantos leads novos,
  // rebatidas etc entraram/mudaram num dia específico — filtra por
  // created_at (quando o lead entrou no CRM), não por status atual.
  const [dataInicioFiltro, setDataInicioFiltro] = useState<string>("");
  const [dataFimFiltro, setDataFimFiltro] = useState<string>("");
  
  const queryClient = useQueryClient();
  const canMonitor = role === 'gerente' || role === 'dono';

  // Gerente (não dono) entra vendo só os próprios leads por padrão — ainda
  // pode trocar pro filtro "Todos os corretores" manualmente.
  useEffect(() => {
    if (role === "gerente" && user?.id) {
      setCorretorFilter((atual) => (atual === "todos" ? user.id : atual));
    }
  }, [role, user?.id]);

  // Chave de cache compartilhada com todas as outras páginas -- ver
  // agenda.tsx pro motivo (evita refazer essa consulta a cada navegação).
  const { data: profile, isLoading: loadingProfile } = useQuery({
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

  const { data: colunas } = useQuery({
    queryKey: ["colunas_kanban", profile?.imobiliaria_id],
    queryFn: async () => {
      if (!profile?.imobiliaria_id) return [];
      const { data, error } = await supabase
        .from("colunas_kanban")
        .select("id, nome, posicao")
        .eq("imobiliaria_id", profile.imobiliaria_id)
        .order("posicao", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.imobiliaria_id,
  });

  const { data: aprovacoesPendentesCount } = useQuery({
    queryKey: ["aprovacoes-pendentes-count", profile?.imobiliaria_id],
    queryFn: async () => {
      if (!profile?.imobiliaria_id) return 0;
      const { count, error } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("imobiliaria_id", profile.imobiliaria_id)
        .eq("descarte_pendente_aprovacao", true);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!profile?.imobiliaria_id && canMonitor,
    refetchInterval: 60000,
  });

  const { data: aprovacoesVendaPendentesCount } = useQuery({
    queryKey: ["aprovacoes-venda-pendentes-count", profile?.imobiliaria_id],
    queryFn: async () => {
      if (!profile?.imobiliaria_id) return 0;
      const { count, error } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("imobiliaria_id", profile.imobiliaria_id)
        .eq("venda_pendente_aprovacao", true);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!profile?.imobiliaria_id && canMonitor,
    refetchInterval: 60000,
  });

  const { data: leads, isLoading, error } = useQuery({
    queryKey: ["leads", profile?.imobiliaria_id, role],
    queryFn: async () => {
      if (!profile?.imobiliaria_id || loadingPerms) return [];

      const buildQuery = () => {
        let query = supabase
          .from("leads")
          .select(`
            *,
            corretor:perfis!corretor_id(nome, avatar_url)
          `)
          .eq("imobiliaria_id", profile.imobiliaria_id)
          // Tela de Leads (Kanban/Lista) so mostra quem ja esta com um
          // corretor -- a Rebatida geral (sem corretor, disponivel pra
          // qualquer um puxar em "+ Mais Rebatidas") nao entra aqui, senao
          // polui a tela de todo mundo com o pool inteiro.
          .not("corretor_id", "is", null)
          // Venda pendente de aprovacao some da tela ate o dono/gerente
          // decidir (ver AprovacoesVendaDialog) -- mesmo espirito do filtro
          // de descarte_pendente_aprovacao ja aplicado dentro do Kanban.
          .eq("venda_pendente_aprovacao", false);

        if (role === 'corretor') {
          query = query.eq("corretor_id", user?.id);
        }

        return query.order("created_at", { ascending: false });
      };

      // O Supabase/PostgREST limita cada resposta a 1000 linhas por padrao —
      // com a base passando disso, o Kanban/Lista ficavam faltando os leads
      // mais antigos (a ordenacao e por created_at desc). Busca em paginas
      // de 1000 ate esgotar, pra sempre trazer a base inteira.
      const PAGE_SIZE = 1000;
      let allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
        if (error) {
          console.error("Erro ao buscar leads:", error);
          throw error;
        }
        allRows = allRows.concat(data || []);
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return allRows;
    },
    enabled: !!profile?.imobiliaria_id && !loadingPerms,
    staleTime: 1000 * 60,
  });

  if (isLoading || loadingPerms || loadingProfile) {
    return (
      <MainLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-bold">Erro ao carregar leads</h2>
          <p className="text-sm text-muted-foreground">{(error as any).message}</p>
          <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
        </div>
      </MainLayout>
    );
  }


  const filteredLeads = leads?.filter(lead => {
    // Lead descartado / com descarte ou venda pendente de aprovação some das
    // duas visões (Kanban já escondia; a Lista mostrava e virava "lead
    // fantasma"). Descarte extremo aprovado só aparece na tela de
    // Redistribuição, não aqui.
    if (lead.descartado_em || lead.descarte_pendente_aprovacao || lead.venda_pendente_aprovacao) return false;

    const term = searchTerm.toLowerCase().trim();
    const matchesSearch = !term ||
      lead.nome?.toLowerCase().includes(term) ||
      lead.email?.toLowerCase().includes(term) ||
      lead.telefone?.includes(term) ||
      lead.origem?.toLowerCase().includes(term) ||
      lead.referencia?.toLowerCase().includes(term) ||
      lead.bairro_interesse?.toLowerCase().includes(term) ||
      (lead.cadencia_chamada != null && `chamada ${lead.cadencia_chamada}`.includes(term));

    const matchesTemp = tempFilter ? lead.temperatura === tempFilter : true;

    const matchesStatusColuna = statusFilter === 'todos' ? true : lead.coluna_kanban_id === statusFilter;

    const matchesCorretor = corretorFilter === 'meus' ? lead.corretor_id === user?.id
      : corretorFilter !== 'todos' ? lead.corretor_id === corretorFilter
      : true;

    const matchesCidade = cidadeFilter === 'todas' ? true : normalizarCidade(lead.bairro_interesse) === normalizarCidade(cidadeFilter);

    const isOverdue = lead.lembrete_follow_up && new Date(lead.lembrete_follow_up) <= new Date() && !lead.data_fechamento;
    const matchesOverdue = showOverdueOnly ? isOverdue : true;

    const dataLead = lead.created_at?.slice(0, 10);
    const matchesData = (!dataInicioFiltro || (dataLead && dataLead >= dataInicioFiltro)) &&
      (!dataFimFiltro || (dataLead && dataLead <= dataFimFiltro));

    return matchesSearch && matchesTemp && matchesStatusColuna && matchesCorretor && matchesCidade && matchesOverdue && matchesData;
  });

  const cidadesDisponiveis = dedupCidades((leads || []).map(l => l.bairro_interesse));

  const leadsVencidosCount = leads?.filter(l =>
    l.lembrete_follow_up && new Date(l.lembrete_follow_up) <= new Date() && !l.data_fechamento
  ).length || 0;

  const filtrosAtivos =
    (tempFilter ? 1 : 0) +
    (statusFilter !== "todos" ? 1 : 0) +
    (cidadeFilter !== "todas" ? 1 : 0) +
    (corretorFilter !== "todos" ? 1 : 0) +
    (dataInicioFiltro || dataFimFiltro ? 1 : 0);

  const limparFiltros = () => {
    setTempFilter(null);
    setStatusFilter("todos");
    setCidadeFilter("todas");
    setCorretorFilter("todos");
    setDataInicioFiltro("");
    setDataFimFiltro("");
  };

  return (
    <MainLayout>
      <div className="flex flex-col gap-6 p-4 h-full max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Gestão de Leads</h1>
            <p className="text-saas-sm text-muted-foreground">
              Acompanhe e converta seus leads de forma eficiente através do funil.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canMonitor && (
              <Button
                variant="outline"
                className="h-9 px-3 font-bold uppercase text-[10px] tracking-wider border-red-200 text-red-600 hover:bg-red-50 bg-white relative"
                onClick={() => setIsAprovacoesOpen(true)}
              >
                Aprovações
                {!!aprovacoesPendentesCount && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center">
                    {aprovacoesPendentesCount}
                  </span>
                )}
              </Button>
            )}
            {canMonitor && (
              <Button
                variant="outline"
                className="h-9 px-3 font-bold uppercase text-[10px] tracking-wider border-green-200 text-green-600 hover:bg-green-50 bg-white relative"
                onClick={() => setIsAprovacoesVendaOpen(true)}
              >
                Aprovar Vendas
                {!!aprovacoesVendaPendentesCount && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-green-600 text-white text-[9px] font-black flex items-center justify-center">
                    {aprovacoesVendaPendentesCount}
                  </span>
                )}
              </Button>
            )}

            <Button size="sm" className="h-9 px-4 font-bold uppercase text-[10px] tracking-wider" onClick={() => setIsNewLeadOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Novo Lead
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-slate-200">
                  <MoreHorizontal className="h-4 w-4 text-slate-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setIsBolsaoOpen(true)} className="text-xs cursor-pointer gap-2">
                  <RefreshCw className="h-3.5 w-3.5 text-orange-500" /> + Mais Rebatidas
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsManageColumnsOpen(true)} className="text-xs cursor-pointer gap-2">
                  <Sliders className="h-3.5 w-3.5 text-slate-400" /> Gerenciar Funil
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {leadsVencidosCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-900">Follow-ups vencidos hoje</p>
                <p className="text-[11px] text-amber-700">Você possui {leadsVencidosCount} contatos agendados que precisam de atenção.</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              className="text-amber-700 text-[10px] font-bold uppercase hover:bg-amber-100 h-8"
              onClick={() => setShowOverdueOnly(!showOverdueOnly)}
            >
              {showOverdueOnly ? "Ver Todos" : "Ver agora"}
            </Button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Buscar por nome, e-mail, telefone, campanha, bairro..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-saas-sm border-slate-200 focus-visible:ring-primary/20"
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`h-9 px-3 border-slate-200 shrink-0 ${filtrosAtivos ? "bg-primary/5 border-primary/20" : ""}`}
              >
                <Filter className={`h-3.5 w-3.5 mr-1.5 ${filtrosAtivos ? "text-primary" : "text-slate-400"}`} />
                <span className="text-[10px] font-bold uppercase">Filtros</span>
                {!!filtrosAtivos && (
                  <span className="ml-1.5 h-4 min-w-4 px-1 rounded-full bg-primary text-white text-[9px] font-black flex items-center justify-center">
                    {filtrosAtivos}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Filtros</span>
                {!!filtrosAtivos && (
                  <button
                    onClick={limparFiltros}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1"
                  >
                    <X className="h-3 w-3" /> Limpar tudo
                  </button>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase text-slate-400">Temperatura</Label>
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { v: null as string | null, label: "Todas" },
                    { v: "quente", label: "Quente" },
                    { v: "morno", label: "Morno" },
                    { v: "frio", label: "Frio" },
                  ].map((o) => (
                    <Button
                      key={o.label}
                      variant="outline"
                      size="sm"
                      className={`h-7 px-0 text-[10px] font-bold ${
                        tempFilter === o.v
                          ? "bg-primary/10 border-primary/30 text-primary"
                          : "border-slate-200 text-slate-500"
                      }`}
                      onClick={() => setTempFilter(o.v)}
                    >
                      {o.label}
                    </Button>
                  ))}
                </div>
              </div>

              {colunas && colunas.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase text-slate-400">Etapa do funil</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 text-xs border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos" className="text-xs">Todas as etapas</SelectItem>
                      {colunas.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {cidadesDisponiveis.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase text-slate-400">Cidade / bairro</Label>
                  <Select value={cidadeFilter} onValueChange={setCidadeFilter}>
                    <SelectTrigger className="h-8 text-xs border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      <SelectItem value="todas" className="text-xs">Todas as cidades</SelectItem>
                      {cidadesDisponiveis.map((c) => (
                        <SelectItem key={c} value={c} className="text-xs">
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {canMonitor && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase text-slate-400">Corretor</Label>
                  <Select value={corretorFilter} onValueChange={setCorretorFilter}>
                    <SelectTrigger className="h-8 text-xs border-slate-200">
                      <SelectValue placeholder="Todos os corretores" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      <SelectItem value="todos" className="text-xs">Todos os corretores</SelectItem>
                      <SelectItem value="meus" className="text-xs">Meus leads</SelectItem>
                      {Array.from(
                        new Map(
                          leads?.filter((l) => l.corretor && l.corretor_id).map((l) => [l.corretor_id, l.corretor])
                        ).entries()
                      ).map(([id, c]: any) => (
                        <SelectItem key={id} value={id} className="text-xs">
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase text-slate-400">Entrou no CRM entre</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="date"
                    value={dataInicioFiltro}
                    onChange={(e) => setDataInicioFiltro(e.target.value)}
                    className="h-8 text-[11px] font-bold border-slate-200"
                  />
                  <span className="text-[10px] font-bold text-slate-300">até</span>
                  <Input
                    type="date"
                    value={dataFimFiltro}
                    onChange={(e) => setDataFimFiltro(e.target.value)}
                    className="h-8 text-[11px] font-bold border-slate-200"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-4 sm:ml-auto">
            <Tabs value={view} onValueChange={setView} className="w-full md:w-auto">
              <TabsList className="h-8 bg-slate-50 p-0.5 border border-slate-100">
                <TabsTrigger value="kanban" className="h-7 text-[10px] font-bold uppercase data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <Kanban className="h-3 w-3 mr-1.5" /> Kanban
                </TabsTrigger>
                <TabsTrigger value="list" className="h-7 text-[10px] font-bold uppercase data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <List className="h-3 w-3 mr-1.5" /> Lista
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {view === "kanban" ? (
            <LeadsKanban leads={filteredLeads} isLoading={isLoading} imobiliariaId={profile?.imobiliaria_id || ""} role={role} />
          ) : (
            <LeadsTable leads={filteredLeads} isLoading={isLoading} colunas={colunas} role={role} />
          )}
        </div>

        <NewLeadDialog 
          open={isNewLeadOpen} 
          onOpenChange={setIsNewLeadOpen} 
        />
        
        <ManageColumnsDialog 
          open={isManageColumnsOpen}
          onOpenChange={setIsManageColumnsOpen}
          imobiliariaId={profile?.imobiliaria_id || ""}
        />
        
        <BolsaoResgateDialog 
          open={isBolsaoOpen}
          onOpenChange={setIsBolsaoOpen}
          imobiliariaId={profile?.imobiliaria_id || ""}
        />

        <AprovacoesDescarteDialog
          open={isAprovacoesOpen}
          onOpenChange={setIsAprovacoesOpen}
          imobiliariaId={profile?.imobiliaria_id || ""}
        />

        <AprovacoesVendaDialog
          open={isAprovacoesVendaOpen}
          onOpenChange={setIsAprovacoesVendaOpen}
          imobiliariaId={profile?.imobiliaria_id || ""}
        />
      </div>
    </MainLayout>
  );
}
