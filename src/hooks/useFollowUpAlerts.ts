import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export function useFollowUpAlerts() {
  const { user } = useAuth();

  // Pedido do dono (18/09): esse toast disparava pra QUALQUER lead com
  // lembrete vencido, em qualquer etapa -- virou ruído (etapas como
  // Agendado/Tarefas já têm aviso próprio). Restrito a Lead Novo e Análise
  // de Crédito (novo/pendente/aprovado/cobrar_doc/reprovado), com janela
  // maior (2h de atraso, não o instante em que vence) pra não incomodar por
  // um lembrete que passou há 2 minutos.
  const JANELA_ATRASO_MS = 2 * 60 * 60 * 1000;
  const STATUS_COM_ALERTA = ["novo", "pendente", "aprovado", "cobrar_doc", "reprovado"];

  const { data: alerts } = useQuery({
    queryKey: ["follow-up-alerts", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const limite = new Date(Date.now() - JANELA_ATRASO_MS).toISOString();

      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, lembrete_follow_up, status")
        .eq("corretor_id", user.id)
        .in("status", STATUS_COM_ALERTA)
        .lte("lembrete_follow_up", limite)
        .is("data_fechamento", null)
        .order("lembrete_follow_up", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 60000, // Verificar a cada minuto
  });

  useEffect(() => {
    if (alerts && alerts.length > 0) {
      alerts.forEach((alert) => {
        toast.error(`Follow-up Pendente: ${alert.nome}`, {
          description: "O horário agendado para este lead já passou.",
          action: {
            label: "Ver Lead",
            onClick: () => {
              // Aqui poderíamos abrir o modal ou navegar
              window.location.href = `/leads?id=${alert.id}`;
            },
          },
          duration: 10000,
        });
      });
    }
  }, [alerts]);

  return alerts;
}
