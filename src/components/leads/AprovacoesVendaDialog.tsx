import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Trophy, CheckCircle, XCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/context/AuthContext";

interface AprovacoesVendaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imobiliariaId: string;
}

// Especificação do dono (05/08): toda venda enviada pelo corretor (botão
// VENDA em LeadDetailsModal) fica pendente de aprovação aqui antes de
// virar 'venda_concluida' de verdade — mesmo padrão do
// AprovacoesDescarteDialog (descarte extremo).
export function AprovacoesVendaDialog({ open, onOpenChange, imobiliariaId }: AprovacoesVendaDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: pendentes, isLoading } = useQuery({
    queryKey: ["aprovacoes-venda", imobiliariaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(`
          id,
          nome,
          telefone,
          valor_venda,
          empreendimento,
          unidade,
          torre,
          corretor:perfis!leads_corretor_id_fkey(nome),
          interacoes:leads_interacoes(conteudo, created_at, tipo)
        `)
        .eq("imobiliaria_id", imobiliariaId)
        .eq("venda_pendente_aprovacao", true);

      if (error) throw error;

      return data.map(lead => {
        const interacaoFechamento = lead.interacoes?.filter(i => i.tipo === 'fechamento')?.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        return {
          ...lead,
          justificativa: interacaoFechamento ? interacaoFechamento.conteudo : "Nenhuma anotação registrada."
        };
      });
    },
    enabled: open && !!imobiliariaId,
  });

  const aprovarMutation = useMutation({
    mutationFn: async (leadId: string) => {
      if (!user) throw new Error("Não autenticado");

      const { data: leadAtual } = await supabase.from("leads").select("imobiliaria_id").eq("id", leadId).single();
      const colunaVenda = leadAtual?.imobiliaria_id
        ? (await supabase
            .from("colunas_kanban")
            .select("id")
            .eq("imobiliaria_id", leadAtual.imobiliaria_id)
            .ilike("nome", "%venda%")
            .maybeSingle()).data
        : null;

      const { error } = await supabase
        .from("leads")
        .update({
          venda_pendente_aprovacao: false,
          status: 'venda_concluida',
          coluna_kanban_id: colunaVenda?.id || null,
          data_fechamento: new Date().toISOString(),
        })
        .eq("id", leadId);

      if (error) throw error;

      await supabase.from("leads_interacoes").insert({
        lead_id: leadId,
        autor_id: user.id,
        tipo: 'fechamento',
        conteudo: `Venda APROVADA pela gerência!`,
      });
    },
    onSuccess: () => {
      toast.success("Venda aprovada!");
      queryClient.invalidateQueries({ queryKey: ["aprovacoes-venda"] });
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
          venda_pendente_aprovacao: false,
          valor_venda: null,
          empreendimento: null,
          unidade: null,
          torre: null,
        })
        .eq("id", leadId);

      if (error) throw error;

      await supabase.from("leads_interacoes").insert({
        lead_id: leadId,
        autor_id: user.id,
        tipo: 'alerta',
        conteudo: `Venda REJEITADA pela gerência. Revise os dados e envie novamente.`,
      });
    },
    onSuccess: () => {
      toast.info("Venda rejeitada. O lead voltou para o corretor.");
      queryClient.invalidateQueries({ queryKey: ["aprovacoes-venda"] });
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
            <Trophy className="h-6 w-6 text-green-600" /> Aprovações de Venda
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
                <Trophy className="h-12 w-12 text-slate-300 mb-3" />
                <p className="text-base font-bold text-slate-500">Nenhuma venda pendente</p>
                <p className="text-xs text-slate-400">Nada esperando aprovação no momento.</p>
              </div>
            ) : (
              <div className="space-y-3 pr-3">
                {pendentes?.map(lead => (
                  <div key={lead.id} className="bg-white border border-green-100 rounded-lg p-4 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-green-500" />

                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">{lead.nome}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                          Corretor: <span className="text-slate-600">{lead.corretor?.nome || "Desconhecido"}</span>
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                          Tel: <span className="text-slate-600 normal-case">{lead.telefone || "-"}</span>
                        </p>
                      </div>
                      <span className="bg-green-50 text-green-700 text-[9px] px-2 py-1 rounded font-bold border border-green-100 uppercase">
                        R$ {lead.valor_venda ? Number(lead.valor_venda).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "0,00"}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3 text-[10px]">
                      <div className="bg-slate-50 rounded p-2 border border-slate-100">
                        <p className="text-slate-400 font-bold uppercase">Empreendimento</p>
                        <p className="text-slate-700 font-semibold truncate">{lead.empreendimento || "-"}</p>
                      </div>
                      <div className="bg-slate-50 rounded p-2 border border-slate-100">
                        <p className="text-slate-400 font-bold uppercase">Unidade</p>
                        <p className="text-slate-700 font-semibold truncate">{lead.unidade || "-"}</p>
                      </div>
                      <div className="bg-slate-50 rounded p-2 border border-slate-100">
                        <p className="text-slate-400 font-bold uppercase">Torre</p>
                        <p className="text-slate-700 font-semibold truncate">{lead.torre || "-"}</p>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded text-xs text-slate-600 border border-slate-100 mb-4 font-medium italic">
                      "{lead.justificativa}"
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => rejeitarMutation.mutate(lead.id)}
                        disabled={aprovarMutation.isPending || rejeitarMutation.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1.5" /> Rejeitar
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 text-xs bg-green-600 hover:bg-green-700"
                        onClick={() => aprovarMutation.mutate(lead.id)}
                        disabled={aprovarMutation.isPending || rejeitarMutation.isPending}
                      >
                        <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Aprovar Venda
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
