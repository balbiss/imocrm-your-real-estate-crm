import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, ShieldAlert, CheckCircle, XCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/context/AuthContext";

interface AprovacoesDescarteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imobiliariaId: string;
}

export function AprovacoesDescarteDialog({ open, onOpenChange, imobiliariaId }: AprovacoesDescarteDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: pendentes, isLoading } = useQuery({
    queryKey: ["aprovacoes-descarte", imobiliariaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(`
          id, 
          nome, 
          motivo_descarte, 
          corretor:perfis!leads_corretor_id_fkey(nome),
          interacoes:leads_interacoes(conteudo, created_at, tipo)
        `)
        .eq("imobiliaria_id", imobiliariaId)
        .eq("descarte_pendente_aprovacao", true);
        
      if (error) throw error;

      return data.map(lead => {
        // Encontra a interação de descarte mais recente que contém a justificativa
        const interacaoDescarte = lead.interacoes?.filter(i => i.tipo === 'descarte')?.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        return {
          ...lead,
          justificativa: interacaoDescarte ? interacaoDescarte.conteudo : "Nenhuma justificativa registrada."
        };
      });
    },
    enabled: open && !!imobiliariaId,
  });

  const aprovarMutation = useMutation({
    mutationFn: async (leadId: string) => {
      if (!user) throw new Error("Não autenticado");
      
      const { error } = await supabase
        .from("leads")
        .update({
          descarte_pendente_aprovacao: false,
          descartado_em: new Date().toISOString(),
          descartado_por: user.id,
          corretor_id: null,
          coluna_kanban_id: null,
          status: 'novo'
        })
        .eq("id", leadId);

      if (error) throw error;

      await supabase.from("leads_interacoes").insert({
        lead_id: leadId,
        autor_id: user.id,
        tipo: 'descarte',
        conteudo: `Descarte Extremo APROVADO pela gerência. O lead foi definitivamente removido.`,
      });
    },
    onSuccess: () => {
      toast.success("Descarte aprovado. Lead removido!");
      queryClient.invalidateQueries({ queryKey: ["aprovacoes-descarte"] });
      queryClient.invalidateQueries({ queryKey: ["aprovacoes-pendentes-count"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (error: any) => toast.error(error.message)
  });

  const rejeitarMutation = useMutation({
    mutationFn: async (leadId: string) => {
      if (!user) throw new Error("Não autenticado");
      
      const { error } = await supabase
        .from("leads")
        .update({ 
          descarte_pendente_aprovacao: false,
          motivo_descarte: null
        })
        .eq("id", leadId);

      if (error) throw error;

      await supabase.from("leads_interacoes").insert({
        lead_id: leadId,
        autor_id: user.id,
        tipo: 'alerta',
        conteudo: `Descarte Extremo REJEITADO pela gerência. O lead retornou para você.`,
      });
    },
    onSuccess: () => {
      toast.info("Descarte rejeitado. O lead voltou para o corretor.");
      queryClient.invalidateQueries({ queryKey: ["aprovacoes-descarte"] });
      queryClient.invalidateQueries({ queryKey: ["aprovacoes-pendentes-count"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (error: any) => toast.error(error.message)
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-slate-50">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase flex items-center gap-2 text-slate-800">
            <ShieldAlert className="h-6 w-6 text-red-600" /> Aprovações de Descarte
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <ScrollArea className="h-[400px]">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
              </div>
            ) : pendentes?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-10 opacity-50">
                <ShieldAlert className="h-12 w-12 text-slate-300 mb-3" />
                <p className="text-base font-bold text-slate-500">Nenhum descarte pendente</p>
                <p className="text-xs text-slate-400">A equipe está trabalhando certinho.</p>
              </div>
            ) : (
              <div className="space-y-3 pr-3">
                {pendentes?.map(lead => (
                  <div key={lead.id} className="bg-white border border-red-100 rounded-lg p-4 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
                    
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">{lead.nome}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                          Corretor: <span className="text-slate-600">{lead.corretor?.nome || "Desconhecido"}</span>
                        </p>
                      </div>
                      <span className="bg-red-50 text-red-700 text-[9px] px-2 py-1 rounded font-bold border border-red-100 uppercase">
                        {lead.motivo_descarte}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded text-xs text-slate-600 border border-slate-100 mb-4 font-medium italic">
                      "{lead.justificativa}"
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 text-xs border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => aprovarMutation.mutate(lead.id)}
                        disabled={aprovarMutation.isPending || rejeitarMutation.isPending}
                      >
                        <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Aprovar (Matar Lead)
                      </Button>
                      <Button 
                        size="sm" 
                        className="flex-1 text-xs bg-slate-800 hover:bg-slate-900"
                        onClick={() => rejeitarMutation.mutate(lead.id)}
                        disabled={aprovarMutation.isPending || rejeitarMutation.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1.5" /> Rejeitar (Devolver)
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
