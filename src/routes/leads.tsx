import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { LeadsKanban } from "@/components/leads/LeadsKanban";
import { NewLeadDialog } from "@/components/leads/NewLeadDialog";
import { LeadsTable } from "@/components/leads/LeadsTable";

import { Button } from "@/components/ui/button";
import { Plus, Filter, Search, List, Kanban, AlertCircle, Clock, Flame, Snowflake, Sun, Loader2 } from "lucide-react";
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
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/leads")({
  head: () => ({ meta: [{ title: "Leads — CRM" }] }),
  component: LeadsPage,
});

function LeadsPage() {
  const { user } = useAuth();
  const { role, isLoading: loadingPerms } = usePermissions();
  const [isNewLeadOpen, setIsNewLeadOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [view, setView] = useState("kanban");
  const [tempFilter, setTempFilter] = useState<string | null>(null);
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

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
    
    const isOverdue = lead.lembrete_follow_up && new Date(lead.lembrete_follow_up) <= new Date() && !lead.data_fechamento;
    const matchesOverdue = showOverdueOnly ? isOverdue : true;
    
    return matchesSearch && matchesTemp && matchesOverdue;
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
            <LeadsKanban leads={filteredLeads} isLoading={isLoading} />
          ) : (
            <LeadsTable leads={filteredLeads} isLoading={isLoading} />
          )}
        </div>

        <NewLeadDialog 
          open={isNewLeadOpen} 
          onOpenChange={setIsNewLeadOpen} 
        />
      </div>
    </MainLayout>
  );
}
