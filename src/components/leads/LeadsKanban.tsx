import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { MoreHorizontal, MessageSquare, Phone, User, RefreshCw, Flame, Snowflake, Sun, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { LeadDetailsModal } from "./LeadDetailsModal";
import { getColunaPorStatus, calcularProximaCadencia } from "@/lib/utils";

const STAGES = [
  { id: "novo", title: "LEAD NOVO", color: "bg-blue-500" },
  { id: "rebatida", title: "REBATIDA", color: "bg-orange-500" },
  { id: "tarefas", title: "TAREFAS ATRASADAS / DO DIA", color: "bg-red-500" },
  { id: "agendado", title: "AGENDADO", color: "bg-purple-500" },
  { id: "visitou", title: "VISITOU", color: "bg-amber-500" },
  { id: "cobrar_doc", title: "COBRAR DOC", color: "bg-cyan-500" },
  { id: "pendente", title: "PENDENTE", color: "bg-slate-500" },
  { id: "aprovado", title: "APROVADO", color: "bg-emerald-500" },
  { id: "reprovado", title: "REPROVADO", color: "bg-rose-600" },
  { id: "futuros", title: "FUTUROS", color: "bg-indigo-500" },
];

import { useAuth } from "@/context/AuthContext";

interface LeadsKanbanProps {
  leads?: any[];
  isLoading?: boolean;
  imobiliariaId?: string;
  role?: string;
}

// Compara nome de coluna ignorando acento (Postgres ILIKE não ignora acento
// — "análise" != "analise" pro banco; achado real testando o alerta de
// entrada em Análise de Crédito, que nunca disparava por causa disso).
function ehColunaAnaliseCredito(nome?: string): boolean {
  if (!nome) return false;
  const n = nome.toLowerCase();
  return (n.includes("analise") || n.includes("análise")) && (n.includes("credito") || n.includes("crédito"));
}

export function LeadsKanban({ leads: initialLeads, isLoading: initialLoading, imobiliariaId, role }: LeadsKanbanProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<"detalhes" | "chat">("detalhes");

  // Buscar perfil se não foi passado imobiliariaId
  const { data: profile } = useQuery({
    queryKey: ["user-profile-kanban", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("perfis")
        .select("imobiliaria_id")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !imobiliariaId,
  });

  const resolvedImobiliariaId = imobiliariaId || profile?.imobiliaria_id;

  // Buscar colunas da imobiliária
  const { data: colunas, isLoading: loadingColunas } = useQuery({
    queryKey: ["colunas_kanban", resolvedImobiliariaId],
    queryFn: async () => {
      if (!resolvedImobiliariaId) return [];
      const { data, error } = await supabase
        .from("colunas_kanban")
        .select("*")
        .eq("imobiliaria_id", resolvedImobiliariaId)
        .order("posicao", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!resolvedImobiliariaId,
  });

  // Se não passarmos as props, usamos o query interno como fallback (compatibilidade)
  const { data: leadsData, isLoading: queryLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(`
          *,
          corretor:perfis!corretor_id(nome, avatar_url)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !initialLeads,
    staleTime: 1000 * 60,
  });

  const leads = initialLeads || leadsData;
  const isLoading = (initialLoading !== undefined ? initialLoading : queryLoading) || (!!resolvedImobiliariaId && loadingColunas);

  // Mesma lógica da LeadsTable: agenda follow-up no horário fixo da
  // cadência e move status+coluna pra "tarefas".
  const changeCadenciaMutation = useMutation({
    mutationFn: async ({ lead, cadencia }: { lead: any; cadencia: number }) => {
      const now = new Date();
      const nextDate = calcularProximaCadencia(now);

      const payload: any = {
        cadencia_chamada: cadencia,
        data_ultima_chamada: now.toISOString(),
        lembrete_follow_up: nextDate.toISOString(),
        ultima_acao_at: now.toISOString(),
      };

      if (lead.status !== "venda_concluida" && !lead.descartado_em && !lead.venda_pendente_aprovacao) {
        payload.status = "tarefas";
        const colunaTarefas = getColunaPorStatus(colunas, "tarefas");
        if (colunaTarefas) payload.coluna_kanban_id = colunaTarefas.id;
      }

      const { error } = await supabase.from("leads").update(payload).eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["compromissos"] });
      toast.success("Cadência atualizada!");
    },
    onError: (error: any) => toast.error("Erro ao atualizar cadência: " + (error?.message || "erro desconhecido")),
  });

  // Gestão dá "Visto" (aprova a documentação, card sai do alerta vermelho e
  // segue o funil normal) ou "Retornar com Pendência" (volta pro corretor
  // como PENDENTE, com uma nota do que falta).
  const vistoMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase
        .from("leads")
        .update({ credito_aprovado_em: new Date().toISOString(), ultima_acao_at: new Date().toISOString() })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Visto registrado — documentação auditada.");
    },
    onError: (error: any) => toast.error("Erro ao dar visto: " + (error?.message || "erro desconhecido")),
  });

  const retornarPendenciaMutation = useMutation({
    mutationFn: async (lead: any) => {
      const observacao = window.prompt("O que está faltando? (aparece pro corretor)");
      if (observacao === null) throw new Error("__cancelado__");
      const colunaPendente = getColunaPorStatus(colunas, "pendente");
      const { error } = await supabase
        .from("leads")
        .update({
          status: "pendente",
          ...(colunaPendente ? { coluna_kanban_id: colunaPendente.id } : {}),
          ultima_acao_at: new Date().toISOString(),
        })
        .eq("id", lead.id);
      if (error) throw error;
      if (user && observacao) {
        await supabase.from("leads_interacoes").insert({
          lead_id: lead.id,
          autor_id: user.id,
          tipo: "alerta",
          conteudo: `Análise de Crédito retornada com pendência: ${observacao}`,
        });
      }
      // Spec do dono (20/08): devolução de pendência precisa abrir um modal
      // bloqueante na tela do corretor (ver AnaliseCreditoAlertProvider),
      // não só o histórico do card -- antes disso nada avisava o corretor.
      if (lead.corretor_id) {
        await supabase.from("notificacoes").insert({
          usuario_id: lead.corretor_id,
          imobiliaria_id: lead.imobiliaria_id,
          lead_id: lead.id,
          tipo: "analise_credito_pendencia",
          titulo: `Análise de Crédito retornada com pendência: ${lead.nome || lead.telefone}`,
          mensagem: observacao || null,
          lida: false,
        });
      }
    },
    onSuccess: (_data, _lead) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.info("Devolvido ao corretor como Pendente.");
    },
    onError: (error: any) => {
      if (error?.message === "__cancelado__") return;
      toast.error("Erro ao retornar pendência: " + (error?.message || "erro desconhecido"));
    },
  });

  // Hooks (useState/useQuery/useMutation) SEMPRE precisam vir antes de
  // qualquer return condicional -- um hook chamado só depois desse "if"
  // muda a contagem de hooks entre o render de loading e o de dados
  // carregados, e quebra a página inteira (React error #300). Esse early
  // return por isso fica DEPOIS de todos os hooks do componente.
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 h-full">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ))}
      </div>
    );
  }

  const stages = colunas && colunas.length > 0
    ? colunas.map((c) => ({ id: c.id, title: c.nome.toUpperCase(), color: c.cor }))
    : STAGES;

  const leadsByStage = stages.reduce((acc, stage) => {
    acc[stage.id] = leads?.filter((lead) => {
      if (lead.descarte_pendente_aprovacao) return false;
      if (lead.descartado_em) return false;
      if (lead.venda_pendente_aprovacao) return false;

      // Se o lead tem a coluna_kanban_id explícita
      if (lead.coluna_kanban_id) {
        return lead.coluna_kanban_id === stage.id;
      }
      
      // Caso contrário, usamos o status antigo como fallback (para consistência imediata antes das triggers)
      let statusText = String(lead.status || "").toLowerCase();
      
      // Se o stage for uma coluna padrão de fallback (não-dinâmica, ex: STAGES original)
      if (!colunas || colunas.length === 0) {
        if (!STAGES.some(s => s.id === statusText) && statusText !== "venda_concluida") {
          statusText = "novo";
        }
        return statusText === stage.id.toLowerCase();
      }
      
      // Se temos colunas dinâmicas, mas o lead não tem coluna_kanban_id ainda,
      // mapeamos o status antigo para a coluna com nome equivalente
      const matchingColumn = colunas.find(col => {
        const colNameNormalized = col.nome.toLowerCase();
        const statusNameMap: Record<string, string> = {
          novo: "lead novo",
          rebatida: "rebatida",
          tarefas: "tarefas",
          agendado: "agendado",
          visitou: "visitou",
          cobrar_doc: "cobrar doc",
          pendente: "pendente",
          aprovado: "aprovado",
          reprovado: "reprovado",
          futuros: "futuros",
        };
        const expectedName = statusNameMap[statusText] || statusText;
        return colNameNormalized === expectedName;
      });

      if (matchingColumn) {
        return matchingColumn.id === stage.id;
      }

      // Se não bateu com nenhuma coluna, colocamos na primeira coluna ativa do funil
      const firstColumn = colunas[0];
      return firstColumn?.id === stage.id;
    }) || [];
    return acc;
  }, {} as Record<string, any[]>);

  const handleLeadClick = (id: string) => {
    setSelectedLeadId(id);
    setModalInitialTab("detalhes");
    setIsModalOpen(true);
  };

  const handleOpenChat = (id: string) => {
    setSelectedLeadId(id);
    setModalInitialTab("chat");
    setIsModalOpen(true);
  };

  // Coluna sem nenhum lead fica oculta pra não poluir a tela — ela volta a
  // aparecer sozinha assim que algum lead for movido pra ela (via dropdown de
  // status no card/modal; não tem drag-and-drop nesse Kanban).
  const stagesComLeads = stages.filter((stage) => leadsByStage[stage.id].length > 0);

  return (
    <div className="flex gap-3 h-[calc(100vh-10rem)] overflow-x-auto pb-4 custom-scrollbar">
      {stagesComLeads.map((stage) => (
        <div key={stage.id} className="flex-shrink-0 w-72 flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${stage.color} shadow-sm`} />
              <h3 className="font-bold text-[11px] uppercase tracking-wider text-slate-500">
                {stage.title}
              </h3>
              <Badge variant="secondary" className="h-4 px-1 text-[9px] font-bold bg-slate-100 text-slate-600 border-none">
                {leadsByStage[stage.id].length}
              </Badge>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-2 pr-3">
              {leadsByStage[stage.id].map((lead) => {
                const emAnaliseCredito = ehColunaAnaliseCredito(stage.title);
                const aguardandoAuditoria = emAnaliseCredito && !lead.credito_aprovado_em;
                const podeAuditar = aguardandoAuditoria && (role === "dono" || role === "gerente");
                return (
                <Card
                  key={lead.id}
                  onClick={() => handleLeadClick(lead.id)}
                  className={`cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group relative overflow-hidden hover-lift animate-fade-in-up ${podeAuditar ? "border-red-300 bg-red-50/60" : "border-slate-200"}`}
                >
                  {/* Indicador de Lembrete */}
                  {lead.lembrete_follow_up && new Date(lead.lembrete_follow_up) <= new Date() && (
                    <div className="absolute top-0 left-0 w-full h-0.5 bg-red-500 animate-pulse" />
                  )}

                  <CardHeader className="p-2.5 pb-1.5">
                    <div className="flex justify-between items-start gap-1.5">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <CardTitle className="text-[12px] font-bold leading-tight flex items-center gap-2 truncate">
                          {lead.temperatura === "quente" && <Flame className="h-3 w-3 text-red-500 fill-red-500 shrink-0" />}
                          {lead.temperatura === "morno" && <Sun className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />}
                          {lead.temperatura === "frio" && <Snowflake className="h-3 w-3 text-blue-400 shrink-0" />}
                          <span className="truncate">{lead.nome}</span>
                        </CardTitle>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-medium text-slate-400 uppercase tracking-tight">
                            {Math.floor((new Date().getTime() - new Date(lead.ultima_acao_at || lead.created_at).getTime()) / (1000 * 60 * 60 * 24))} dias parado
                          </span>
                          {lead.sla_vencido && (
                            <Badge className="text-[8px] h-3.5 px-1 font-bold bg-red-100 text-red-600 border-none uppercase">SLA</Badge>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button onClick={(e) => e.stopPropagation()}>
                                <Badge className={`text-[8px] h-3.5 px-1 font-bold border-none uppercase cursor-pointer hover:opacity-80 ${lead.cadencia_chamada ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}>
                                  {lead.cadencia_chamada ? `Chamada ${lead.cadencia_chamada}` : "Cadência"}
                                </Badge>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                              {[0, 1, 2, 3, 4, 5].map((n) => (
                                <DropdownMenuItem
                                  key={n}
                                  disabled={(lead.cadencia_chamada || 0) === n}
                                  onClick={() => changeCadenciaMutation.mutate({ lead, cadencia: n })}
                                >
                                  {n === 0 ? "Início" : `Chamada ${n}`}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        title={lead.origem || "Site"}
                        className="text-[8px] h-3.5 px-1 max-w-[92px] shrink-0 truncate font-bold border-slate-200 text-slate-500 bg-slate-50 uppercase"
                      >
                        {lead.origem || "Site"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2.5 pt-0 flex flex-col gap-2">
                    <div className="flex flex-col gap-0.5">
                      <p className="text-[11px] text-slate-600 flex items-center gap-1 font-medium">
                        <Phone className="h-2.5 w-2.5 text-slate-400" /> {lead.telefone}
                      </p>
                      {lead.valor_estimado && (
                        <p className="text-[11px] font-bold text-emerald-600">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.valor_estimado)}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between pt-1 border-t border-slate-50">
                      <div className="flex items-center gap-0.5">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 rounded text-green-600 hover:bg-green-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenChat(lead.id);
                          }}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 rounded text-blue-600 hover:bg-blue-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.location.href = `tel:+55${lead.telefone.replace(/\D/g, "")}`;
                          }}
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        {lead.lembrete_follow_up && (
                          <div className={`h-5 w-5 rounded-full flex items-center justify-center ${new Date(lead.lembrete_follow_up) <= new Date() ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`} title="Possui follow-up agendado">
                            <span className="text-[9px] font-bold">!</span>
                          </div>
                        )}
                        {lead.corretor ? (
                          <div className="flex items-center gap-1 min-w-0" title={lead.corretor.nome}>
                            <span className="text-[9px] font-bold text-slate-500 truncate max-w-[64px]">
                              {lead.corretor.nome?.split(" ")[0]}
                            </span>
                            <Avatar className="h-5 w-5 border border-slate-100 shrink-0">
                              <AvatarImage src={lead.corretor.avatar_url} />
                              <AvatarFallback className="text-[8px]">{lead.corretor.nome?.[0]}</AvatarFallback>
                            </Avatar>
                          </div>
                        ) : (
                          <div className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                            <User className="h-2.5 w-2.5 text-slate-400" />
                          </div>
                        )}
                      </div>
                    </div>

                    {podeAuditar && (
                      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-red-100" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          className="h-6 flex-1 text-[9px] font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => vistoMutation.mutate(lead.id)}
                          disabled={vistoMutation.isPending}
                        >
                          Visto
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 flex-1 text-[9px] font-black uppercase tracking-wider border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => retornarPendenciaMutation.mutate(lead)}
                          disabled={retornarPendenciaMutation.isPending}
                        >
                          Pendência
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      ))}

      <LeadDetailsModal
        leadId={selectedLeadId}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        initialTab={modalInitialTab}
      />
    </div>
  );
}
