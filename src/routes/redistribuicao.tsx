import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Users, Shuffle, CheckCircle2, History, UserPlus, AlertCircle, AlertTriangle, Clock, UserCheck, Search, MapPin } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigate } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/redistribuicao")({
  head: () => ({ meta: [{ title: "Redistribuição — CRM" }] }),
  component: RedistributionPage,
});

function RedistributionPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role, isLoading: loadingPerms } = usePermissions();
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("bolsao");
  const [isDistributing, setIsDistributing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [cidadeFilter, setCidadeFilter] = useState<string>("todas");

  // Proteção de rota
  React.useEffect(() => {
    if (!loadingPerms && role === 'corretor') {
      toast.error("Acesso restrito à gestão.");
      navigate({ to: "/dashboard" });
    }
  }, [role, loadingPerms, navigate]);

  const { data: profile } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("perfis").select("imobiliaria_id").eq("id", user.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  const { data: leads, isLoading: loadingLeads } = useQuery({
    queryKey: ["leads-redistribution", profile?.imobiliaria_id, activeTab],
    queryFn: async () => {
      if (!profile?.imobiliaria_id) return [];

      const buildQuery = () => {
        let query = supabase
          .from("leads")
          .select(`
            *,
            corretor:perfis!corretor_id(nome)
          `)
          .eq("imobiliaria_id", profile.imobiliaria_id);

        if (activeTab === "bolsao") {
          query = query.is("corretor_id", null).is("descartado_em", null);
        } else if (activeTab === "descartados") {
          query = query.not("descartado_em", "is", null);
        } else {
          // Regra de redistribuição: tentativas >= 5 ou sem contato há > 24h
          const yesterday = new Date();
          yesterday.setHours(yesterday.getHours() - 24);
          query = query
            .not("corretor_id", "is", null)
            .is("descartado_em", null)
            .or(`tentativas_contato.gte.5,and(status.eq.novo,created_at.lt.${yesterday.toISOString()})`);
        }

        return query.order("created_at", { ascending: true });
      };

      // Os cards de contagem no topo usam a query separada `statCounts`
      // (count exato via head:true, sempre bate com a base real) -- essa
      // lista aqui e so pra exibir/selecionar em massa, entao nao precisa
      // baixar o Bolsao inteiro (que hoje passa de 8 mil leads). Antes isso
      // buscava tudo em paginas de 1000 -- com refetchInterval de 10s, isso
      // virava ~9 requests sequenciais repetidos a cada 10 segundos so
      // dessa tela. Agora traz so os 500 mais antigos (FIFO, os que mais
      // esperam), que ja e mais do que da pra revisar/selecionar em massa
      // de uma vez com conforto.
      const { data, error } = await buildQuery().range(0, 499);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.imobiliaria_id,
    refetchInterval: 10000, // Atualizar a cada 10 segundos para o dono
    staleTime: 1000 * 30,
  });

  // Cards do topo mostram os totais reais de Bolsao/Presos, independente da
  // aba ativa — antes eles liam do array `leads` (que so tinha a aba atual,
  // e ainda por cima vinha truncado em 1000 linhas), entao o numero exibido
  // nunca batia com a base real.
  const { data: statCounts } = useQuery({
    queryKey: ["leads-redistribution-stats", profile?.imobiliaria_id],
    queryFn: async () => {
      if (!profile?.imobiliaria_id) return { semContato: 0, abandonados: 0 };

      const { count: semContato } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("imobiliaria_id", profile.imobiliaria_id)
        .is("corretor_id", null)
        .is("descartado_em", null);

      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);
      const { count: abandonados } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("imobiliaria_id", profile.imobiliaria_id)
        .not("corretor_id", "is", null)
        .is("descartado_em", null)
        .or(`tentativas_contato.gte.5,and(status.eq.novo,created_at.lt.${yesterday.toISOString()})`);

      return { semContato: semContato || 0, abandonados: abandonados || 0 };
    },
    enabled: !!profile?.imobiliaria_id,
    refetchInterval: 10000,
    staleTime: 1000 * 30,
  });

  const { data: corretores } = useQuery({
    queryKey: ["corretores-plantao", profile?.imobiliaria_id],
    queryFn: async () => {
      if (!profile?.imobiliaria_id) return [];
      const { data, error } = await supabase
        .from("perfis")
        .select("id, nome")
        .eq("imobiliaria_id", profile.imobiliaria_id)
        .eq("em_plantao", true);
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.imobiliaria_id,
    staleTime: 1000 * 60,
  });

  const reassignMutation = useMutation({
    mutationFn: async ({ leadId, corretorId }: { leadId: string; corretorId: string }) => {
      const { error } = await supabase.rpc('distribuir_leads_massa', {
        p_lead_ids: [leadId],
        p_corretor_id: corretorId,
        p_tipo: 'manual'
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead redistribuído com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["leads-redistribution"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase
        .from("leads")
        .update({
          corretor_id: null,
          descartado_em: null,
          descartado_por: null,
          motivo_descarte: null,
          status: "novo",
          tentativas_contato: 0,
          lembrete_follow_up: null,
          data_visita: null
        })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead reativado e movido para o Bolsão!");
      queryClient.invalidateQueries({ queryKey: ["leads-redistribution"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-counts"] });
    },
  });

  if (loadingPerms || role === 'corretor') {
    return (
      <MainLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  const handleBulkDistribute = async (mode: 'rodizio' | 'um_corretor', targetCorretorId?: string) => {
    if (selectedLeads.length === 0) {
      toast.error("Selecione ao menos um lead.");
      return;
    }

    setIsDistributing(true);
    try {
      if (mode === 'um_corretor') {
        if (!targetCorretorId) return;
        const { error } = await supabase.rpc('distribuir_leads_massa', {
          p_lead_ids: selectedLeads,
          p_corretor_id: targetCorretorId,
          p_tipo: 'massa'
        });
        if (error) throw error;
      } else {
        const plantaoIds = corretores?.map(c => c.id) || [];
        if (plantaoIds.length === 0) {
          toast.error("Nenhum corretor em plantão!");
          return;
        }

        for (let i = 0; i < selectedLeads.length; i++) {
          const corretorId = plantaoIds[i % plantaoIds.length];
          await supabase.rpc('distribuir_leads_massa', {
            p_lead_ids: [selectedLeads[i]],
            p_corretor_id: corretorId,
            p_tipo: 'massa'
          });
        }
      }

      toast.success(`${selectedLeads.length} leads distribuídos!`);
      setSelectedLeads([]);
      queryClient.invalidateQueries({ queryKey: ["leads-redistribution"] });
    } catch (error) {
      toast.error("Erro na distribuição em massa.");
    } finally {
      setIsDistributing(false);
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedLeads.length === (filteredLeads?.length || 0) && (filteredLeads?.length || 0) !== 0) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(filteredLeads?.map(l => l.id) || []);
    }
  };

  const handleSelectLead = (id: string) => {
    setSelectedLeads(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const cidadesDisponiveis = Array.from(
    new Set((leads || []).map(l => l.bairro_interesse).filter((c): c is string => !!c))
  ).sort();

  const filteredLeads = leads?.filter((lead) => {
    if (cidadeFilter !== "todas" && lead.bairro_interesse !== cidadeFilter) return false;

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      lead.nome?.toLowerCase().includes(term) ||
      lead.telefone?.toLowerCase().includes(term) ||
      lead.corretor?.nome?.toLowerCase().includes(term)
    );
  });

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-800">DISTRIBUIÇÃO DE LEADS</h1>
            <p className="text-sm text-slate-500 font-medium">Gerencie o fluxo de atendimento e recupere leads parados.</p>
          </div>
          <Button 
            variant="outline" 
            className="h-9 gap-2 text-xs font-bold border-slate-200"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["leads-redistribution"] })}
          >
            <RefreshCw className="h-4 w-4" /> Atualizar Fila
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-none shadow-sm bg-amber-50">
            <CardContent className="p-4 flex items-center gap-4">
               <div className="h-10 w-10 rounded-full bg-amber-500 flex items-center justify-center text-white shadow-lg shadow-amber-200">
                  <AlertTriangle className="h-5 w-5" />
               </div>
               <div>
                  <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest leading-none mb-1">Sem Contato</p>
                  <p className="text-xl font-black text-slate-800">
                    {(statCounts?.semContato ?? 0).toString().padStart(2, '0')}
                  </p>
               </div>
            </CardContent>
          </Card>
          
          <Card className="border-none shadow-sm bg-red-50">
            <CardContent className="p-4 flex items-center gap-4">
               <div className="h-10 w-10 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg shadow-red-200">
                  <Clock className="h-5 w-5" />
               </div>
               <div>
                  <p className="text-[10px] font-black text-red-600 uppercase tracking-widest leading-none mb-1">Abandonados</p>
                  <p className="text-xl font-black text-slate-800">
                    {(statCounts?.abandonados ?? 0).toString().padStart(2, '0')}
                  </p>
               </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-primary/5">
            <CardContent className="p-4 flex items-center gap-4">
               <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                  <UserCheck className="h-5 w-5" />
               </div>
               <div>
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest leading-none mb-1">Corretores ON</p>
                  <p className="text-xl font-black text-slate-800">{corretores?.length || 0}</p>
               </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100">
            <TabsList className="bg-transparent border-none h-12 p-0 gap-8">
              <TabsTrigger
                value="bolsao"
                className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none h-full text-xs font-black uppercase tracking-wider px-0 opacity-40 data-[state=active]:opacity-100 transition-all"
              >
                Rebatidas Geral
              </TabsTrigger>
              <TabsTrigger
                value="descartados"
                className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none h-full text-xs font-black uppercase tracking-wider px-0 opacity-40 data-[state=active]:opacity-100 transition-all"
              >
                Leads Descartados
              </TabsTrigger>
            </TabsList>

            {selectedLeads.length > 0 && (
              <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {selectedLeads.length} selecionados
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-8 text-[10px] font-black bg-primary uppercase tracking-widest px-4 shadow-lg shadow-primary/20">
                      Ações em Massa
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 p-2 border-slate-100 shadow-xl">
                    <DropdownMenuItem 
                      className="text-xs font-bold cursor-pointer gap-2 py-2"
                      onClick={() => handleBulkDistribute('rodizio')}
                    >
                      <Shuffle className="h-3.5 w-3.5 text-primary" /> Rodízio automático
                    </DropdownMenuItem>
                    <div className="h-px bg-slate-100 my-1" />
                    <p className="px-2 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Atribuir Direto</p>
                    {corretores?.map(c => (
                      <DropdownMenuItem 
                        key={c.id} 
                        className="text-xs font-medium cursor-pointer py-2"
                        onClick={() => handleBulkDistribute('um_corretor', c.id)}
                      >
                        {c.nome}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Buscar por nome, telefone ou corretor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs border-slate-200"
              />
            </div>

            {cidadesDisponiveis.length > 0 && (
              <Select value={cidadeFilter} onValueChange={setCidadeFilter}>
                <SelectTrigger className="w-[180px] h-9 text-xs border-slate-200">
                  <MapPin className="h-3.5 w-3.5 text-slate-400 mr-1" />
                  <SelectValue placeholder="Cidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas" className="text-xs">Todas as Cidades</SelectItem>
                  {cidadesDisponiveis.map(cidade => (
                    <SelectItem key={cidade} value={cidade} className="text-xs">{cidade}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-none">
                  <TableHead className="w-10 py-4 pl-6">
                    <Checkbox
                      checked={selectedLeads.length === (filteredLeads?.length || 0) && (filteredLeads?.length || 0) !== 0}
                      onCheckedChange={handleToggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 text-slate-400">Lead</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 text-slate-400">Origem / Motivo</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 text-slate-400">
                    {activeTab === 'bolsao' ? 'Tempo de Espera' : activeTab === 'descartados' ? 'Motivo do Descarte' : 'Responsável Atual'}
                  </TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest py-4 text-slate-400 text-right pr-6">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingLeads ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-64 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary/30" />
                        <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Carregando leads...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredLeads?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-64 text-center">
                      <div className="flex flex-col items-center gap-4 opacity-20">
                        <Users className="h-12 w-12" />
                        <p className="text-sm font-black uppercase tracking-widest">Nenhum lead encontrado</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeads?.map((lead) => (
                    <TableRow key={lead.id} className="group hover:bg-slate-50/50 transition-colors border-slate-50">
                      <TableCell className="py-4 pl-6">
                        <Checkbox 
                          checked={selectedLeads.includes(lead.id)}
                          onCheckedChange={() => handleSelectLead(lead.id)}
                        />
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-700">{lead.nome}</span>
                          <span className="text-[10px] font-medium text-slate-400">{lead.telefone}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex flex-col gap-1.5">
                          <Badge variant="outline" className="text-[9px] w-fit h-4.5 px-2 font-black border-slate-200 text-slate-500 uppercase tracking-tighter bg-white">
                            {lead.origem || "Site"}
                          </Badge>
                          {lead.motivo_descarte && (
                            <Badge className="text-[9px] w-fit h-4.5 px-2 font-black bg-red-50 text-red-500 border-none uppercase tracking-tighter">
                              {lead.motivo_descarte}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        {activeTab === 'bolsao' ? (
                          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 bg-slate-100 w-fit px-2 py-1 rounded-md">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            {Math.floor((new Date().getTime() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60))}h na fila
                          </div>
                        ) : activeTab === 'descartados' ? (
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-red-500 uppercase tracking-tight">{lead.motivo_descarte}</span>
                            <span className="text-[10px] text-slate-400 font-medium">Descartado em {new Date(lead.descartado_em!).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                             <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 uppercase">
                                {lead.corretor?.nome?.charAt(0) || "?"}
                             </div>
                             <span className="text-sm font-bold text-slate-600">{lead.corretor?.nome || "Sem Corretor"}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="py-4 text-right pr-6">
                        {activeTab === 'descartados' ? (
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-8 text-[10px] font-black text-primary hover:text-primary hover:bg-primary/5 uppercase tracking-widest gap-2"
                            onClick={() => reactivateMutation.mutate(lead.id)}
                            disabled={reactivateMutation.isPending}
                          >
                            <RefreshCw className={`h-3 w-3 ${reactivateMutation.isPending ? 'animate-spin' : ''}`} /> Reativar
                          </Button>
                        ) : (
                          <Select 
                            onValueChange={(val) => reassignMutation.mutate({ leadId: lead.id, corretorId: val })}
                          >
                            <SelectTrigger className="w-[180px] h-9 text-[11px] font-bold ml-auto bg-slate-50 border-none shadow-none hover:bg-slate-100 transition-colors">
                              <SelectValue placeholder="Encaminhar para..." />
                            </SelectTrigger>
                            <SelectContent className="border-slate-100 shadow-xl p-1">
                              {corretores?.map(c => (
                                <SelectItem key={c.id} value={c.id} className="text-[11px] font-medium py-2">{c.nome}</SelectItem>
                              ))}
                              {!corretores?.length && (
                                <p className="p-2 text-[10px] text-center text-slate-400 font-bold uppercase">Nenhum corretor ON</p>
                              )}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Tabs>
      </div>
    </MainLayout>
  );
}
