import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, AlertTriangle, RefreshCw, Hand, MapPin } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BolsaoResgateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imobiliariaId: string;
}

// Regras oficiais (planilha do dono, 04/08): botão "+ Mais Rebatidas" puxa
// 10 leads por clique da coluna REBATIDAS GERAL, limite de 50 por dia,
// nunca repete corretor que já atendeu esse lead (Regra de Ouro, checada no
// banco via puxar_mais_rebatidas/lead_historico_corretores), com filtro de
// cidade opcional.
export function BolsaoResgateDialog({ open, onOpenChange, imobiliariaId }: BolsaoResgateDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [cidadeFiltro, setCidadeFiltro] = useState<string>("todas");

  const { data: tarefasAtrasadasCount } = useQuery({
    queryKey: ["tarefas-atrasadas", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("corretor_id", user.id)
        .lte("lembrete_follow_up", new Date().toISOString())
        .is("data_fechamento", null);
      return count || 0;
    },
    enabled: open && !!user,
    // Esse número trava a ação real (bloqueia +Mais Rebatidas). O staleTime
    // global de 1min (ver __root.tsx) fazia o corretor devolver um lead e,
    // se reabrisse o popup em menos de 1min, ver a contagem antiga -- achado
    // real (24/08): "Devolver" às vezes não tirava o lead da base do
    // corretor, mas o problema real era esse contador não refletir a
    // devolução recém-feita, não o devolver em si (que já está correto no
    // banco). staleTime: 0 força buscar de novo toda vez que o popup abre.
    staleTime: 0,
  });

  // Rebatidas hoje: conta pelo log de distribuição (quando foi PUXADA), não
  // por created_at do lead (era assim antes — created_at é de quando o lead
  // entrou no CRM originalmente, não de quando o corretor puxou).
  const { data: rebatidasHojeCount } = useQuery({
    queryKey: ["rebatidas-hoje", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("distribuicao_log")
        .select("*", { count: "exact", head: true })
        .eq("corretor_id", user.id)
        .eq("tipo", "manual")
        .gte("created_at", hoje.toISOString());
      return count || 0;
    },
    enabled: open && !!user,
    staleTime: 0, // mesmo motivo do contador de tarefas atrasadas acima
  });

  // RPC dedicada (não select cru + .limit(500)): a Rebatida acumula
  // milhares de leads sem corretor, então um recorte cru de 500 linhas sem
  // ORDER BY podia nunca incluir cidades menos comuns (bug real reportado:
  // "não consigo selecionar São José dos Campos"). A RPC também dedupe por
  // grafia (Taubate/Taubaté viravam duas opções na lista antes do fix).
  const { data: cidadesDisponiveis } = useQuery({
    queryKey: ["rebatidas-cidades", imobiliariaId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cidades_rebatidas", {
        p_imobiliaria_id: imobiliariaId,
      });
      if (error) throw error;
      return (data || []).map((r: any) => r.cidade as string);
    },
    enabled: open && !!imobiliariaId,
  });

  const puxarMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      if (tarefasAtrasadasCount && tarefasAtrasadasCount > 0) {
        throw new Error("Você possui tarefas atrasadas. Zere suas pendências primeiro!");
      }
      const { data, error } = await supabase.rpc("puxar_mais_rebatidas", {
        p_corretor_id: user.id,
        p_cidade: cidadeFiltro === "todas" ? null : cidadeFiltro,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (quantidade) => {
      if (!quantidade) {
        toast.info("Nenhuma rebatida disponível com esse filtro no momento.");
        return;
      }
      toast.success(`${quantidade} rebatida(s) puxada(s)! Verifique a coluna REBATIDA.`);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["rebatidas-hoje"] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao puxar rebatidas");
    },
  });

  const bloqueado = (tarefasAtrasadasCount && tarefasAtrasadasCount > 0) || (rebatidasHojeCount && rebatidasHojeCount >= 50);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase flex items-center gap-2 text-slate-800">
            <RefreshCw className="h-5 w-5 text-orange-500" /> + Mais Rebatidas
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          {bloqueado ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex flex-col items-center text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mb-3" />
              <h3 className="text-lg font-bold text-red-700 mb-1">Rebatida Bloqueada</h3>
              <p className="text-sm text-red-600 mb-4">
                Você não cumpre os requisitos para puxar novas rebatidas neste momento.
              </p>
              <div className="w-full space-y-2 text-left bg-white p-4 rounded-md">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600">Tarefas Atrasadas (Máx: 0):</span>
                  <span className={tarefasAtrasadasCount! > 0 ? "text-red-600" : "text-green-600"}>
                    {tarefasAtrasadasCount} atrasadas
                  </span>
                </div>
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600">Rebatidas Hoje (Máx: 50):</span>
                  <span className={rebatidasHojeCount! >= 50 ? "text-red-600" : "text-green-600"}>
                    {rebatidasHojeCount} rebatidas
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between text-xs font-bold bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="text-slate-500">Tarefas Atrasadas: <span className="text-green-600">0 OK</span></span>
                <span className="text-slate-500">Rebatidas Hoje: <span className="text-primary">{rebatidasHojeCount ?? 0} / 50</span></span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Filtrar por cidade/bairro (opcional)</label>
                <Select value={cidadeFiltro} onValueChange={setCidadeFiltro}>
                  <SelectTrigger className="h-10 text-sm border-slate-200">
                    <MapPin className="h-3.5 w-3.5 text-slate-400 mr-1" />
                    <SelectValue placeholder="Todas as cidades/bairros" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as cidades/bairros</SelectItem>
                    {cidadesDisponiveis?.map((c) => (
                      <SelectItem key={c} value={c as string}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 flex items-start gap-3">
                <Hand className="h-8 w-8 text-orange-400 shrink-0" />
                <p className="text-xs text-orange-700 font-medium">
                  Cada clique puxa até <strong>10 leads</strong> da Rebatidas Geral — nunca um lead que você já atendeu ou descartou antes.
                </p>
              </div>

              <Button
                className="w-full h-11 text-xs font-black uppercase tracking-wider bg-orange-500 hover:bg-orange-600"
                onClick={() => puxarMutation.mutate()}
                disabled={puxarMutation.isPending}
              >
                {puxarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Puxar 10 Rebatidas
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
