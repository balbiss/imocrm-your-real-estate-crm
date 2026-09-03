import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Repeat, Pause, Play, X, CheckCircle2, MessageCircle, Clock } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  ativo: "Rodando",
  respondeu: "Cliente respondeu",
  pausado_corretor: "Pausado",
  parado_lead: "Parado (lead saiu de cena)",
  concluido: "Concluído",
  encerrado_manual: "Encerrado",
  erro: "Erro no envio",
};

export function FollowUpPanel({
  leadId,
  leadCorretorId,
}: {
  leadId: string;
  leadCorretorId: string | null;
}) {
  const queryClient = useQueryClient();
  const [fluxoSel, setFluxoSel] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["followup", leadId],
    queryFn: async () => {
      const { data: execs, error } = await supabase
        .from("followup_execucoes" as any)
        .select("*, followup_fluxos(nome), followup_envios(*)")
        .eq("lead_id", leadId)
        .order("inscrito_em", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (execs as any[])[0] || null;
    },
  });

  const { data: fluxos } = useQuery({
    queryKey: ["followup-fluxos-ativos", leadCorretorId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("followup_fluxos" as any)
        .select("id, nome, corretor_id, e_geral")
        .eq("ativo", true);
      if (error) throw error;
      return (rows as any[]).filter(
        (f) => f.corretor_id === leadCorretorId || f.corretor_id === null
      );
    },
  });

  // Realtime: a execução avança quando o motor manda um passo.
  useEffect(() => {
    const ch = supabase
      .channel(`followup-${leadId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "followup_execucoes", filter: `lead_id=eq.${leadId}` },
        () => queryClient.invalidateQueries({ queryKey: ["followup", leadId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [leadId, queryClient]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["followup", leadId] });
    queryClient.invalidateQueries({ queryKey: ["lead"] });
  };

  const iniciar = useMutation({
    mutationFn: async () => {
      if (!fluxoSel) throw new Error("Escolha um fluxo.");
      const { error } = await supabase.rpc("followup_iniciar_manual" as any, {
        p_lead_id: leadId,
        p_fluxo_id: fluxoSel,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Follow-up iniciado!");
      setFluxoSel("");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao iniciar"),
  });

  const acao = useMutation({
    mutationFn: async (rpc: "followup_pausar" | "followup_retomar" | "followup_encerrar") => {
      const { error } = await supabase.rpc(rpc as any, { p_execucao_id: data.id });
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message || "Erro"),
  });

  const trocar = useMutation({
    mutationFn: async (novoFluxoId: string) => {
      const { error } = await supabase.rpc("followup_trocar_fluxo" as any, {
        p_execucao_id: data.id,
        p_novo_fluxo_id: novoFluxoId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fluxo trocado!");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao trocar"),
  });

  if (isLoading) {
    return <div className="text-saas-sm text-slate-400 py-8 text-center">Carregando...</div>;
  }

  const exec = data;
  const ativo = exec && exec.status === "ativo";
  const envios: any[] = exec?.followup_envios
    ? [...exec.followup_envios].sort((a, b) => (a.passo_ordem ?? 0) - (b.passo_ordem ?? 0))
    : [];

  const iniciarBox = (
    <div className="rounded-lg border border-slate-200 p-4 space-y-3 bg-slate-50/50">
      <p className="text-saas-sm font-bold text-slate-600">Iniciar um follow-up pra este lead</p>
      {fluxos && fluxos.length > 0 ? (
        <>
          <Select value={fluxoSel} onValueChange={setFluxoSel}>
            <SelectTrigger className="h-9 text-saas-sm border-slate-200 bg-white">
              <SelectValue placeholder="Escolher fluxo..." />
            </SelectTrigger>
            <SelectContent>
              {fluxos.map((f: any) => (
                <SelectItem key={f.id} value={f.id} className="text-saas-sm">
                  {f.nome}
                  {f.corretor_id === null ? " (modelo)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="w-full text-[11px] font-bold uppercase" disabled={iniciar.isPending} onClick={() => iniciar.mutate()}>
            <Repeat className="h-3.5 w-3.5 mr-1.5" /> Iniciar follow-up
          </Button>
        </>
      ) : (
        <p className="text-saas-xs text-slate-400">
          Nenhum fluxo ativo. Crie um em <strong>Follow-ups</strong> no menu lateral.
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {exec && (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
            <div className="flex items-center gap-2 min-w-0">
              <Repeat className="h-4 w-4 text-violet-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-saas-sm font-bold text-slate-700 truncate">
                  {exec.followup_fluxos?.nome || "Fluxo"}
                </p>
                <p className="text-[10px] text-slate-400">
                  Passo {exec.passo_atual} enviado{" "}
                  {ativo && exec.proximo_envio_em
                    ? `· próximo em ${format(new Date(exec.proximo_envio_em), "dd/MM 'às' HH:mm", { locale: ptBR })}`
                    : ""}
                </p>
              </div>
            </div>
            <Badge
              className={`border-none text-[9px] uppercase font-bold tracking-tighter shrink-0 ${
                ativo ? "bg-emerald-100 text-emerald-700" : exec.status === "respondeu" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"
              }`}
            >
              {STATUS_LABEL[exec.status] || exec.status}
            </Badge>
          </div>

          <div className="p-4 space-y-2">
            {envios.length === 0 && (
              <p className="text-saas-xs text-slate-400">Nenhuma mensagem enviada ainda.</p>
            )}
            {envios.map((ev) => (
              <div key={ev.id} className="flex gap-2 text-saas-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-slate-600">
                    <span className="font-bold text-slate-400 mr-1">Passo {ev.passo_ordem}</span>
                    enviado {format(new Date(ev.enviado_em), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    {ev.respondeu_apos && (
                      <span className="ml-1.5 text-blue-600 font-bold">· cliente respondeu</span>
                    )}
                  </p>
                  <p className="text-slate-400 line-clamp-2">{ev.conteudo_enviado}</p>
                </div>
              </div>
            ))}
            {ativo && exec.proximo_envio_em && (
              <div className="flex gap-2 text-saas-xs text-slate-400">
                <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  Próximo passo agendado pra{" "}
                  {format(new Date(exec.proximo_envio_em), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            {ativo && (
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => acao.mutate("followup_pausar")}>
                <Pause className="h-3 w-3 mr-1" /> Pausar
              </Button>
            )}
            {(exec.status === "pausado_corretor" || exec.status === "erro") && (
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => acao.mutate("followup_retomar")}>
                <Play className="h-3 w-3 mr-1" /> Retomar
              </Button>
            )}
            {!["concluido", "encerrado_manual"].includes(exec.status) && (
              <Button size="sm" variant="outline" className="h-7 text-[10px] text-red-500 border-red-100" onClick={() => acao.mutate("followup_encerrar")}>
                <X className="h-3 w-3 mr-1" /> Encerrar
              </Button>
            )}
            {ativo && fluxos && fluxos.length > 1 && (
              <Select onValueChange={(v) => trocar.mutate(v)}>
                <SelectTrigger className="h-7 text-[10px] w-auto border-slate-200 gap-1">
                  <MessageCircle className="h-3 w-3" /> Trocar fluxo
                </SelectTrigger>
                <SelectContent>
                  {fluxos.map((f: any) => (
                    <SelectItem key={f.id} value={f.id} className="text-saas-xs">
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      )}

      {(!exec || !ativo) && iniciarBox}

      <p className="text-[10px] text-slate-400 leading-relaxed">
        O follow-up para sozinho quando o cliente responde ou quando você manda uma mensagem manual
        pelo Chat. As mensagens automáticas aparecem no Chat com o selo 🤖.
      </p>
    </div>
  );
}
