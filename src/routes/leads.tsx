import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { LeadsKanban } from "@/components/leads/LeadsKanban";
import { NewLeadDialog } from "@/components/leads/NewLeadDialog";
import { LeadsTable } from "@/components/leads/LeadsTable";
import { BolsaoResgateDialog } from "@/components/leads/BolsaoResgateDialog";
import { AprovacoesDescarteDialog } from "@/components/leads/AprovacoesDescarteDialog";
import { ManageColumnsDialog } from "@/components/leads/ManageColumnsDialog";

import { Button } from "@/components/ui/button";
import { Plus, Filter, Search, List, Kanban, AlertCircle, Clock, Flame, Snowflake, Sun, Loader2, RefreshCw, User, Sliders } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getColunaPorStatus } from "@/lib/utils";

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
  const [isManageColumnsOpen, setIsManageColumnsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [view, setView] = useState("kanban");
  const [tempFilter, setTempFilter] = useState<string | null>(null);
  const [corretorFilter, setCorretorFilter] = useState<string>('todos');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  
  const queryClient = useQueryClient();
  const canMonitor = role === 'gerente' || role === 'dono';

  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ["user-profile-leads", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("perfis").select("imobiliaria_id").eq("id", user.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
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

  const { data: leads, isLoading, error } = useQuery({
    queryKey: ["leads", profile?.imobiliaria_id, role],
    queryFn: async () => {
      if (!profile?.imobiliaria_id || loadingPerms) return [];

      let query = supabase
        .from("leads")
        .select(`
          *,
          corretor:perfis!corretor_id(nome, avatar_url)
        `)
        .eq("imobiliaria_id", profile.imobiliaria_id);

      if (role === 'corretor') {
        query = query.eq("corretor_id", user?.id);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      
      if (error) {
        console.error("Erro ao buscar leads:", error);
        throw error;
      }
      
      return data;
    },
    enabled: !!profile?.imobiliaria_id && !loadingPerms,
    staleTime: 1000 * 60,
  });

  const loteRebatidaMutation = useMutation({
    mutationFn: async () => {
      if (!user || !profile?.imobiliaria_id) throw new Error("Não autenticado ou sem imobiliária");

      const { count: tarefasAtrasadasCount } = await supabase
        .from("leads")
        .select("*", { count: 'exact', head: true })
        .eq("corretor_id", user.id)
        .lte("lembrete_follow_up", new Date().toISOString())
        .is("data_fechamento", null);

      if (tarefasAtrasadasCount && tarefasAtrasadasCount > 0) throw new Error("Você possui tarefas atrasadas. Zere suas pendências primeiro!");

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const { count: rebatidasHojeCount } = await supabase
        .from("leads")
        .select("*", { count: 'exact', head: true })
        .eq("corretor_id", user.id)
        .eq("status", "rebatida")
        .gte("created_at", hoje.toISOString());

      const atual = rebatidasHojeCount || 0;
      if (atual >= 30) throw new Error("Limite diário de 30 rebatidas já foi atingido.");

      const vagas = 30 - atual;
      const quantidadePuxar = Math.min(10, vagas);

      const { data: leadsBolsao, error } = await supabase
        .from("leads")
        .select("*")
        .eq("imobiliaria_id", profile.imobiliaria_id)
        .is("corretor_id", null)
        .not("motivo_descarte", "in", '("Descadastrar", "Já Comprou (Outra Empresa)", "Aprovado/Desistiu")')
        .limit(500);

      if (error) throw error;

      const now = new Date();
      const leadsDisponiveis = leadsBolsao.filter(lead => {
        if (!lead.descartado_em) return true;
        const descartadoDate = new Date(lead.descartado_em);
        const daysDiff = (now.getTime() - descartadoDate.getTime()) / (1000 * 60 * 60 * 24);
        if (lead.motivo_descarte === "Sem Resposta" && daysDiff < 3) return false;
        if (lead.motivo_descarte === "Parou de Responder" && daysDiff < 5) return false;
        if (lead.motivo_descarte === "Sem Interesse" && daysDiff < 15) return false;
        return true;
      });

      const filtrados = leadsDisponiveis.filter(l => !l.historico_corretores?.includes(user.id));
      if (filtrados.length === 0) throw new Error("O Bolsão está vazio ou você já atendeu todos os leads disponíveis.");

      const shuffled = filtrados.sort(() => 0.5 - Math.random());
      const lote = shuffled.slice(0, quantidadePuxar);
      const loteIds = lote.map(l => l.id);

      // Move pra coluna "Rebatida" tambem — so mudar o status sem mudar a
      // coluna deixa o card visualmente parado onde estava (ex: Lead Novo).
      const colunaRebatida = getColunaPorStatus(colunas, "rebatida");

      const { error: updateError } = await supabase
        .from("leads")
        .update({
          corretor_id: user.id,
          status: "rebatida",
          ultima_acao_at: new Date().toISOString(),
          ...(colunaRebatida ? { coluna_kanban_id: colunaRebatida.id } : {}),
        })
        .in("id", loteIds);

      if (updateError) throw updateError;
      
      return lote.length;
    },
    onSuccess: (qtd) => {
      toast.success(`💥 ${qtd} leads puxados do bolsão com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (error: any) => toast.error(error.message)
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
    const matchesSearch = lead.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.telefone?.includes(searchTerm);
    
    const matchesTemp = tempFilter ? lead.temperatura === tempFilter : true;
    
    const matchesCorretor = corretorFilter === 'meus' ? lead.corretor_id === user?.id 
      : corretorFilter !== 'todos' ? lead.corretor_id === corretorFilter 
      : true;

    const isOverdue = lead.lembrete_follow_up && new Date(lead.lembrete_follow_up) <= new Date() && !lead.data_fechamento;
    const matchesOverdue = showOverdueOnly ? isOverdue : true;
    
    return matchesSearch && matchesTemp && matchesCorretor && matchesOverdue;
  });

  const leadsVencidosCount = leads?.filter(l => 
    l.lembrete_follow_up && new Date(l.lembrete_follow_up) <= new Date() && !l.data_fechamento
  ).length || 0;

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
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className={`h-9 px-3 border-slate-200 ${tempFilter ? 'bg-primary/5 border-primary/20' : ''}`}>
                  <Filter className={`h-3.5 w-3.5 mr-1.5 ${tempFilter ? 'text-primary' : 'text-slate-400'}`} /> 
                  <span className="text-[10px] font-bold uppercase">
                    {tempFilter ? `Filtro: ${tempFilter}` : 'Filtros'}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-[10px] uppercase font-bold text-slate-400">Temperatura</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setTempFilter(null)} className="text-xs cursor-pointer">Todas</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTempFilter('quente')} className="text-xs cursor-pointer flex items-center gap-2">
                  <Flame className="h-3 w-3 text-red-500" /> Quente
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTempFilter('morno')} className="text-xs cursor-pointer flex items-center gap-2">
                  <Sun className="h-3 w-3 text-amber-500" /> Morno
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTempFilter('frio')} className="text-xs cursor-pointer flex items-center gap-2">
                  <Snowflake className="h-3 w-3 text-blue-500" /> Frio
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {canMonitor && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className={`h-9 px-3 border-slate-200 ${corretorFilter !== 'todos' ? 'bg-primary/5 border-primary/20' : ''}`}>
                    <User className={`h-3.5 w-3.5 mr-1.5 ${corretorFilter !== 'todos' ? 'text-primary' : 'text-slate-400'}`} /> 
                    <span className="text-[10px] font-bold uppercase">
                      {corretorFilter === 'meus' ? 'Meus Leads' : corretorFilter !== 'todos' ? 'Filtro Corretor' : 'Corretor'}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 max-h-64 overflow-y-auto">
                  <DropdownMenuLabel className="text-[10px] uppercase font-bold text-slate-400">Filtrar por</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setCorretorFilter('todos')} className="text-xs cursor-pointer font-bold">Todos os Leads</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCorretorFilter('meus')} className="text-xs cursor-pointer font-bold text-primary">Meus Leads</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] uppercase font-bold text-slate-400">Equipe</DropdownMenuLabel>
                  {Array.from(new Map(leads?.filter(l => l.corretor && l.corretor_id).map(l => [l.corretor_id, l.corretor])).entries()).map(([id, c]: any) => (
                    <DropdownMenuItem key={id} onClick={() => setCorretorFilter(id)} className="text-xs cursor-pointer">
                      {c.nome}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {canMonitor && (
              <Button 
                variant="outline" 
                className="h-9 px-4 font-bold uppercase text-[10px] tracking-wider border-red-200 text-red-600 hover:bg-red-50 bg-white"
                onClick={() => setIsAprovacoesOpen(true)}
              >
                Aprovações
              </Button>
            )}

            <Button 
              className="h-9 px-4 font-black uppercase text-[10px] tracking-widest bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20"
              onClick={() => loteRebatidaMutation.mutate()}
              disabled={loteRebatidaMutation.isPending}
            >
              {loteRebatidaMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Flame className="mr-1.5 h-3.5 w-3.5" />}
              MAIS REBATIDA
            </Button>

            <Button variant="outline" size="sm" className="h-9 px-4 font-bold uppercase text-[10px] tracking-wider border-orange-200 text-orange-600 hover:bg-orange-50 bg-white" onClick={() => setIsBolsaoOpen(true)}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Puxar Bolsão
            </Button>

            <Button variant="outline" size="sm" className="h-9 px-4 font-bold uppercase text-[10px] tracking-wider border-slate-200 text-slate-700 hover:bg-slate-50 bg-white" onClick={() => setIsManageColumnsOpen(true)}>
              <Sliders className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Gerenciar Funil
            </Button>

            <Button size="sm" className="h-9 px-4 font-bold uppercase text-[10px] tracking-wider" onClick={() => setIsNewLeadOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Novo Lead
            </Button>
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

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input 
              placeholder="Buscar por nome, e-mail ou telefone..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-saas-sm border-slate-200 focus-visible:ring-primary/20" 
            />
          </div>
          <div className="flex items-center gap-4">
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
            <LeadsKanban leads={filteredLeads} isLoading={isLoading} imobiliariaId={profile?.imobiliaria_id || ""} />
          ) : (
            <LeadsTable leads={filteredLeads} isLoading={isLoading} />
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
      </div>
    </MainLayout>
  );
}
