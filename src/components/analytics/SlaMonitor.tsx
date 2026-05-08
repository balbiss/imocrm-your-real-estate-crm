import React, { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { AlertCircle, RefreshCw } from "lucide-react";

export function SlaMonitor() {
  const { role } = usePermissions();
  
  // Apenas donos e gerentes realizam o monitoramento de transbordo
  const canMonitor = role === "dono" || role === "gerente";

  useEffect(() => {
    if (!canMonitor) return;

    const checkSla = async () => {
      // 1. Buscar leads 'novos' sem atendimento
      const { data: leads, error } = await supabase
        .from("leads")
        .select("id, nome, created_at, corretor_id, imobiliaria_id")
        .eq("status", "novo")
        .is("primeiro_contato_em", null);

      if (error || !leads) return;

      const SLA_MINUTES = 0.5; // Ajustado para teste (30s)
      const now = new Date();

      const expiredLeads = leads.filter(lead => {
        const createdAt = new Date(lead.created_at);
        const diffInMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);
        return diffInMinutes >= SLA_MINUTES;
      });

      if (expiredLeads.length === 0) return;

      // 2. Para cada lead vencido, redistribuir
      for (const lead of expiredLeads) {
        // Buscar próximo corretor em plantão (que não seja o atual)
        const { data: nextCorretor } = await supabase
          .from("perfis")
          .select("id, nome")
          .eq("imobiliaria_id", lead.imobiliaria_id)
          .eq("em_plantao", true)
          .neq("id", lead.corretor_id)
          .limit(1)
          .single();

        if (nextCorretor) {
          const { error: updateError } = await supabase
            .from("leads")
            .update({ 
              corretor_id: nextCorretor.id,
            })
            .eq("id", lead.id);

          if (!updateError) {
            toast(`Transbordo: Lead ${lead.nome} passado para ${nextCorretor.nome}`, {
              icon: <RefreshCw className="h-4 w-4 text-amber-500 animate-spin" />,
              description: "Motivo: SLA de 10 minutos expirado.",
              duration: 5000,
            });
          }
        }
      }
    };

    // Rodar a cada 1 minuto
    const interval = setInterval(checkSla, 60000);
    checkSla(); // Execução imediata

    return () => clearInterval(interval);
  }, [canMonitor, role]);

  return null; // Componente invisível de monitoramento
}
