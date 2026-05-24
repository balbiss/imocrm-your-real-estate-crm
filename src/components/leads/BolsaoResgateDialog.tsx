import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, AlertTriangle, RefreshCw, Hand } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface BolsaoResgateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imobiliariaId: string;
}

export function BolsaoResgateDialog({ open, onOpenChange, imobiliariaId }: BolsaoResgateDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isPulling, setIsPulling] = useState(false);

  // Trava 1: Tarefas Atrasadas
  const { data: tarefasAtrasadasCount } = useQuery({
    queryKey: ["tarefas-atrasadas", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from("leads")
        .select("*", { count: 'exact', head: true })
        .eq("corretor_id", user.id)
        .lte("lembrete_follow_up", new Date().toISOString())
        .is("data_fechamento", null);
      return count || 0;
    },
    enabled: open && !!user,
  });

  // Trava 2: Limite de Rebatidas hoje (30)
  const { data: rebatidasHojeCount } = useQuery({
    queryKey: ["rebatidas-hoje", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      
      const { count } = await supabase
        .from("leads")
        .select("*", { count: 'exact', head: true })
        .eq("corretor_id", user.id)
        .eq("status", "rebatida")
        .gte("created_at", hoje.toISOString()); // Simplificação: ideal seria log de histórico
      return count || 0;
    },
    enabled: open && !!user,
  });

  // Lista de leads disponíveis no Bolsão
  const { data: leadsBolsao, isLoading } = useQuery({
    queryKey: ["bolsao-disponiveis", imobiliariaId],
    queryFn: async () => {
      if (!user) return [];
      
      // Buscar leads sem corretor (Bolsão real + Quarentena)
      const { data: leads, error } = await supabase
        .from("leads")
        .select("*")
        .eq("imobiliaria_id", imobiliariaId)
        .is("corretor_id", null)
        .not("motivo_descarte", "in", '("Descadastrar", "Já Comprou (Outra Empresa)", "Aprovado/Desistiu")')
        .order("created_at", { ascending: true })
        .limit(300);
        
      if (error) throw error;
      
      const now = new Date();
      
      // Filtrar respeitando os dias de quarentena
      const leadsDisponiveis = leads.filter(lead => {
        if (!lead.descartado_em) return true;
        
        const descartadoDate = new Date(lead.descartado_em);
        const daysDiff = (now.getTime() - descartadoDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (lead.motivo_descarte === "Sem Resposta" && daysDiff < 3) return false;
        if (lead.motivo_descarte === "Parou de Responder" && daysDiff < 5) return false;
        if (lead.motivo_descarte === "Sem Interesse" && daysDiff < 15) return false;
        
        return true;
      });
      
      // Filtrar leads que este corretor já atendeu antes
      const filtrados = leadsDisponiveis.filter(l => !l.historico_corretores?.includes(user.id));
      
      return filtrados.slice(0, 50);
    },
    enabled: open && !!imobiliariaId,
  });

  const pullLeadMutation = useMutation({
    mutationFn: async (leadId: string) => {
      setIsPulling(true);
      if (!user) throw new Error("Não autenticado");
      
      if (tarefasAtrasadasCount && tarefasAtrasadasCount > 0) {
        throw new Error("Você possui tarefas atrasadas. Zere suas pendências primeiro!");
      }
      
      if (rebatidasHojeCount && rebatidasHojeCount >= 30) {
        throw new Error("Limite diário de 30 rebatidas atingido.");
      }

      const { error } = await supabase
        .from("leads")
        .update({ 
          corretor_id: user.id,
          status: "rebatida",
        })
        .eq("id", leadId);

      if (error) throw error;
      return leadId;
    },
    onSuccess: () => {
      toast.success("Lead resgatado com sucesso! Verifique a coluna REBATIDA.");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["bolsao-disponiveis"] });
      queryClient.invalidateQueries({ queryKey: ["tarefas-atrasadas"] });
      queryClient.invalidateQueries({ queryKey: ["rebatidas-hoje"] });
      setIsPulling(false);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao puxar lead");
      setIsPulling(false);
    }
  });

  const bloqueado = (tarefasAtrasadasCount && tarefasAtrasadasCount > 0) || (rebatidasHojeCount && rebatidasHojeCount >= 30);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase flex items-center gap-2 text-slate-800">
            <RefreshCw className="h-5 w-5 text-orange-500" /> Resgatar do Bolsão
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          {bloqueado ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex flex-col items-center text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mb-3" />
              <h3 className="text-lg font-bold text-red-700 mb-1">Rebatida Bloqueada</h3>
              <p className="text-sm text-red-600 mb-4">
                Você não cumpre os requisitos para puxar novos leads do bolsão neste momento.
              </p>
              <div className="w-full space-y-2 text-left bg-white p-4 rounded-md">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600">Tarefas Atrasadas (Máx: 0):</span>
                  <span className={tarefasAtrasadasCount! > 0 ? "text-red-600" : "text-green-600"}>
                    {tarefasAtrasadasCount} atrasadas
                  </span>
                </div>
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600">Rebatidas Hoje (Máx: 30):</span>
                  <span className={rebatidasHojeCount! >= 30 ? "text-red-600" : "text-green-600"}>
                    {rebatidasHojeCount} rebatidas
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between text-xs font-bold bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="text-slate-500">Tarefas Atrasadas: <span className="text-green-600">0 OK</span></span>
                <span className="text-slate-500">Rebatidas Hoje: <span className="text-primary">{rebatidasHojeCount} / 30</span></span>
              </div>

              <div className="bg-white border rounded-lg overflow-hidden">
                <div className="bg-slate-50 p-3 border-b text-xs font-bold text-slate-500 uppercase tracking-widest flex justify-between">
                  <span>Leads Disponíveis ({leadsBolsao?.length || 0})</span>
                </div>
                <ScrollArea className="h-[300px]">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                    </div>
                  ) : leadsBolsao?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-10 opacity-50">
                      <Hand className="h-10 w-10 text-slate-300 mb-2" />
                      <p className="text-sm font-bold">O Bolsão está vazio!</p>
                      <p className="text-[10px]">Nenhum lead compatível disponível no momento.</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {leadsBolsao?.map(lead => (
                        <div key={lead.id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                          <div>
                            <p className="text-sm font-bold text-slate-700">{lead.nome}</p>
                            <div className="flex gap-2 mt-1">
                              <Badge variant="outline" className="text-[9px] px-1.5 uppercase bg-white">{lead.origem || "Site"}</Badge>
                              {lead.temperatura && (
                                <Badge variant="outline" className="text-[9px] px-1.5 uppercase bg-white">
                                  {lead.temperatura}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            className="h-8 text-[10px] font-black uppercase tracking-wider bg-orange-500 hover:bg-orange-600"
                            onClick={() => pullLeadMutation.mutate(lead.id)}
                            disabled={isPulling}
                          >
                            {isPulling ? <Loader2 className="h-3 w-3 animate-spin" /> : "Puxar Lead"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
