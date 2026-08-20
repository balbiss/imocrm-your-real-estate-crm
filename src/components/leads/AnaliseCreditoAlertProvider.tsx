import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileWarning, MessageCircle } from "lucide-react";
import { LeadDetailsModal } from "@/components/leads/LeadDetailsModal";

type AnaliseCreditoTipo = "nova_analise_credito" | "analise_credito_pendencia" | "analise_credito_lembrete";

type AnaliseCreditoNotificacao = {
  id: string;
  lead_id: string | null;
  tipo: AnaliseCreditoTipo;
  titulo: string;
  mensagem: string | null;
};

const TIPOS_RELEVANTES: AnaliseCreditoTipo[] = [
  "nova_analise_credito",
  "analise_credito_pendencia",
  "analise_credito_lembrete",
];

// Especificação formal do dono (20/08) -- Módulo Análise de Crédito: os três
// avisos (pasta nova pra gestão, pendência devolvida pro corretor, lembrete
// horário recorrente) precisam ser um MODAL BLOQUEANTE no meio da tela, não
// só o sino/toast silencioso que já existia (notificar_entrada_analise_credito
// e notificar_leads_analise_credito, ambos no banco, já inserem a
// notificação certa -- só faltava esse provider pra exibir como popup).
// Mesmo padrão de fila/realtime já usado em LeadNovoAlertProvider.
export function AnaliseCreditoAlertProvider() {
  const { user } = useAuth();
  const [activeAlert, setActiveAlert] = useState<AnaliseCreditoNotificacao | null>(null);
  const [leadAberto, setLeadAberto] = useState(false);
  const queueRef = useRef<AnaliseCreditoNotificacao[]>([]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`analise_credito_alert_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacoes",
          filter: `usuario_id=eq.${user.id}`,
        },
        (payload) => {
          const notif = payload.new as { id: string; tipo: string; lead_id: string | null; titulo: string; mensagem: string | null };
          if (!TIPOS_RELEVANTES.includes(notif.tipo as AnaliseCreditoTipo)) return;

          queueRef.current.push({
            id: notif.id,
            lead_id: notif.lead_id,
            tipo: notif.tipo as AnaliseCreditoTipo,
            titulo: notif.titulo,
            mensagem: notif.mensagem,
          });
          setActiveAlert((current) => current ?? queueRef.current.shift() ?? null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const advanceQueue = () => {
    const next = queueRef.current.shift() ?? null;
    setActiveAlert(next);
  };

  const handleOk = () => {
    if (activeAlert) {
      supabase.from("notificacoes").update({ lida: true }).eq("id", activeAlert.id).then(() => {});
    }
    advanceQueue();
  };

  const handleVerLead = () => {
    if (!activeAlert) return;
    supabase.from("notificacoes").update({ lida: true }).eq("id", activeAlert.id).then(() => {});
    setLeadAberto(true);
  };

  if (!activeAlert) return null;

  if (leadAberto) {
    return (
      <LeadDetailsModal
        leadId={activeAlert.lead_id}
        open={leadAberto}
        onOpenChange={(open) => {
          setLeadAberto(open);
          if (!open) advanceQueue();
        }}
      />
    );
  }

  const ehLembreteHorario = activeAlert.tipo === "analise_credito_lembrete";

  return (
    <Dialog open={true}>
      <DialogContent
        className="sm:max-w-md border-amber-500 border-2 shadow-[0_0_50px_rgba(217,119,6,0.3)] pointer-events-auto z-[9999]"
        // Modal BLOQUEANTE de propósito (spec do dono, 20/08) -- só fecha
        // pelo botão, não por clique fora nem Esc.
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideClose
      >
        <DialogHeader className="space-y-3">
          <div className="mx-auto bg-amber-100 p-4 rounded-full">
            <FileWarning className="h-10 w-10 text-amber-600" />
          </div>
          <DialogTitle className="text-center text-xl font-black text-amber-700 uppercase tracking-tight">
            {activeAlert.tipo === "nova_analise_credito" && "Nova Pasta em Análise de Crédito"}
            {activeAlert.tipo === "analise_credito_pendencia" && "Análise Retornada com Pendência"}
            {ehLembreteHorario && "Análise de Crédito"}
          </DialogTitle>
          <div className="text-center text-slate-600 font-bold text-base">
            {activeAlert.titulo}
          </div>
          {activeAlert.mensagem && (
            <div className="text-center text-slate-500 text-sm bg-slate-50 border border-slate-200 rounded-lg p-3">
              {activeAlert.mensagem}
            </div>
          )}
        </DialogHeader>

        <DialogFooter className="sm:justify-center pt-2 flex-col gap-2">
          {!ehLembreteHorario && activeAlert.lead_id && (
            <Button
              className="w-full h-11 text-sm font-black uppercase tracking-widest bg-amber-600 hover:bg-amber-700"
              onClick={handleVerLead}
            >
              <MessageCircle className="mr-2 h-5 w-5" /> Ver Lead
            </Button>
          )}
          <Button
            variant={ehLembreteHorario ? "default" : "ghost"}
            className={ehLembreteHorario ? "w-full h-11 text-sm font-black uppercase tracking-widest bg-amber-600 hover:bg-amber-700" : "w-full h-9 text-xs font-bold text-slate-500 hover:text-slate-700"}
            onClick={handleOk}
          >
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
