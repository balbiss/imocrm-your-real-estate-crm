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

      const SLA_MINUTES = 5;
      const now = new Date();

      const expiredLeads = leads.filter(lead => {
        const createdAt = new Date(lead.created_at);
        const diffInMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);
        return diffInMinutes >= SLA_MINUTES;
      });

      if (expiredLeads.length === 0) return;

      // 2. Para cada lead vencido, redistribuir seguindo a Fila/Roleta
      for (const lead of expiredLeads) {
        // Buscar o próximo corretor da fila (menor posição) que não seja o atual
        const { data: nextFila } = await supabase
          .from("filas_atendimento")
          .select("id, corretor_id, posicao, perfis(nome)")
          .eq("imobiliaria_id", lead.imobiliaria_id)
          .neq("corretor_id", lead.corretor_id)
          .order("posicao", { ascending: true })
          .limit(1)
          .single();

        if (nextFila) {
          // Reatribuir lead para o próximo da fila
          const { error: updateError } = await supabase
            .from("leads")
            .update({ corretor_id: nextFila.corretor_id })
            .eq("id", lead.id);

          if (!updateError) {
            // Regra de Giro: Corretor recebeu lead, vai para o último lugar da fila
            const { data: lastFila } = await supabase
              .from("filas_atendimento")
              .select("posicao")
              .eq("imobiliaria_id", lead.imobiliaria_id)
              .order("posicao", { ascending: false })
              .limit(1)
              .single();

            const nextPos = (lastFila?.posicao || 0) + 1;
            
            await supabase
              .from("filas_atendimento")
              .update({ posicao: nextPos })
              .eq("id", nextFila.id);

            toast(`SLA Estourado! Lead repassado para ${nextFila.perfis?.nome || 'próximo'}`, {
              icon: <RefreshCw className="h-4 w-4 text-red-500 animate-spin" />,
              description: "Motivo: SLA de 5 minutos expirado sem ação.",
              duration: 6000,
            });
          }
        }
      }
    };

    const checkQuarentena = async () => {
      const { data: leads, error } = await supabase
        .from("leads")
        .select("id, nome, descartado_em, motivo_descarte, imobiliaria_id")
        .not("descartado_em", "is", null)
        .not("motivo_descarte", "in", '("Descadastrar", "Já Comprou (Outra Empresa)")');

      if (error || !leads) return;

      const now = new Date();

      for (const lead of leads) {
        if (!lead.descartado_em) continue;
        const descartadoDate = new Date(lead.descartado_em);
        const daysDiff = (now.getTime() - descartadoDate.getTime()) / (1000 * 60 * 60 * 24);
        
        let shouldReturn = false;
        let isAprovado = false;

        // APENAS Aprovado/Desistiu volta automaticamente para a Roleta.
        // Os demais ("Sem Resposta", "Parou", "Sem Interesse") ficam no Bolsão
        // para serem resgatados via "Puxar Bolsão" ou "MAIS REBATIDA".
        if (lead.motivo_descarte === "Aprovado/Desistiu" && daysDiff >= 30) {
          shouldReturn = true;
          isAprovado = true;
        }

        if (shouldReturn) {
          // Buscar corretor 1 da fila
          const { data: nextFila } = await supabase
            .from("filas_atendimento")
            .select("id, corretor_id")
            .eq("imobiliaria_id", lead.imobiliaria_id)
            .order("posicao", { ascending: true })
            .limit(1)
            .single();

          const corretorId = nextFila ? nextFila.corretor_id : null;

          await supabase.from("leads").update({
            status: "novo",
            corretor_id: corretorId,
            descartado_em: null,
            motivo_descarte: null,
            temperatura: isAprovado ? "quente" : "frio",
            origem: isAprovado ? "Crédito Aprovado (Retorno)" : "Retorno Quarentena"
          }).eq("id", lead.id);

          // Inserir log de histórico
          await supabase.from("interacoes").insert({
             lead_id: lead.id,
             tipo: 'status',
             conteudo: `Lead retornou automaticamente da quarentena após prazo vencido (${lead.motivo_descarte}).`
          });

          if (corretorId && nextFila) {
             const { data: lastFila } = await supabase.from("filas_atendimento").select("posicao").eq("imobiliaria_id", lead.imobiliaria_id).order("posicao", { ascending: false }).limit(1).single();
             await supabase.from("filas_atendimento").update({ posicao: (lastFila?.posicao || 0) + 1 }).eq("id", nextFila.id);
          }

          toast.success(`Lead ${lead.nome} reciclou da quarentena para LEAD NOVO!`);
        }
      }
    };

    // Rodar a cada 1 minuto
    const interval = setInterval(() => {
      checkSla();
      checkQuarentena();
    }, 60000);
    checkSla(); 
    checkQuarentena();

    return () => clearInterval(interval);
  }, [canMonitor, role]);

  return null; // Componente invisível de monitoramento
}
