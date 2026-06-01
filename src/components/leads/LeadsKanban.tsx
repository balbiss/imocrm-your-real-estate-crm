import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { MoreHorizontal, MessageSquare, Phone, User, RefreshCw, Flame, Snowflake, Sun, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeadDetailsModal } from "./LeadDetailsModal";

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

interface LeadsKanbanProps {
  leads?: any[];
  isLoading?: boolean;
}

export function LeadsKanban({ leads: initialLeads, isLoading: initialLoading }: LeadsKanbanProps) {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
  const isLoading = initialLoading !== undefined ? initialLoading : queryLoading;

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

  const leadsByStage = STAGES.reduce((acc, stage) => {
    acc[stage.id] = leads?.filter((lead) => {
      if (lead.descarte_pendente_aprovacao) return false;
      let status = String(lead.status || "").toLowerCase();
      // Se o status do banco não existir nas 8 colunas oficiais, joga pra "novo" pro lead não sumir
      if (!STAGES.some(s => s.id === status) && status !== "venda_concluida") {
        status = "novo";
      }
      return status === stage.id.toLowerCase();
    }) || [];
    return acc;
  }, {} as Record<string, any[]>);

  const handleLeadClick = (id: string) => {
    setSelectedLeadId(id);
    setIsModalOpen(true);
  };

  return (
    <div className="flex gap-3 h-[calc(100vh-10rem)] overflow-x-auto pb-4 custom-scrollbar">
      {STAGES.map((stage) => (
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
              {leadsByStage[stage.id].map((lead) => (
                <Card 
                  key={lead.id} 
                  onClick={() => handleLeadClick(lead.id)}
                  className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group relative overflow-hidden border-slate-200 hover-lift animate-fade-in-up"
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
                            {Math.floor((new Date().getTime() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24))} dias parado
                          </span>
                          {lead.sla_vencido && (
                            <Badge className="text-[8px] h-3.5 px-1 font-bold bg-red-100 text-red-600 border-none uppercase">SLA</Badge>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[8px] h-3.5 px-1 shrink-0 font-bold border-slate-200 text-slate-500 bg-slate-50 uppercase">
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
                            window.open(`https://wa.me/55${lead.telefone.replace(/\D/g, "")}`, "_blank");
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
                          <Avatar className="h-5 w-5 border border-slate-100">
                            <AvatarImage src={lead.corretor.avatar_url} />
                            <AvatarFallback className="text-[8px]">{lead.corretor.nome?.[0]}</AvatarFallback>
                          </Avatar>
                        ) : (
                          <div className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                            <User className="h-2.5 w-2.5 text-slate-400" />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {leadsByStage[stage.id].length === 0 && (
                <div className="border border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center text-center bg-slate-50/50">
                  <p className="text-[10px] text-slate-400 font-medium">Vazio</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      ))}

      <LeadDetailsModal 
        leadId={selectedLeadId}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />
    </div>
  );
}
