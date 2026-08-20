import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export function useFollowUpAlerts() {
  const { user } = useAuth();

  const { data: alerts } = useQuery({
    queryKey: ["follow-up-alerts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const now = new Date().toISOString();
      
      // Buscar leads com lembrete vencido ou próximo (nos próximos 15 min)
      // que pertencem ao usuário atual
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, lembrete_follow_up")
        .eq("corretor_id", user.id)
        .lte("lembrete_follow_up", now)
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
