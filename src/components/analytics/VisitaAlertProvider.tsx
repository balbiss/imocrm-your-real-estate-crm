import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, Calendar, MapPin, User, CheckCircle2, X, MessageCircle } from "lucide-react";
import { format, differenceInHours, differenceInMinutes, isSameDay, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { LeadDetailsModal } from "@/components/leads/LeadDetailsModal";

export function VisitaAlertProvider() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeAlert, setActiveAlert] = useState<{
    lead: any;
    type: "17h" | "2h";
  } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [chatAberto, setChatAberto] = useState(false);
  // Guarda quando cada alerta foi "fechado sem confirmar" — soneca de
  // 10min antes de voltar a interromper o corretor com o mesmo alerta.
  const [snoozedAte, setSnoozedAte] = useState<Record<string, number>>({});
  const SNOOZE_MS = 10 * 60 * 1000;

  useEffect(() => {
    if (!user) return;

    const checkAlerts = async () => {
      // Se já tem um alerta na tela, não verifica outro até ele resolver
      if (activeAlert) return;

      const { data: leads, error } = await supabase
        .from("leads")
        .select("id, nome, telefone, data_visita, alerta_visita_17h_ciente, alerta_visita_2h_ciente")
        .eq("corretor_id", user.id)
        .eq("status", "agendado")
        .not("data_visita", "is", null);

      if (error || !leads) return;

      const now = new Date();

      for (const lead of leads) {
        if (!lead.data_visita) continue;
        const visitaDate = new Date(lead.data_visita);

        // --- Alerta 1: Às 17h do dia anterior ---
        // A data da visita é 'visitaDate'. O dia anterior é 'visitaDate - 1 dia'.
        // O alerta dispara se o 'now' já passou das 17:00 do dia anterior.
        const diaAnterior17h = new Date(visitaDate);
        diaAnterior17h.setDate(diaAnterior17h.getDate() - 1);
        diaAnterior17h.setHours(17, 0, 0, 0);

        const chave17h = `${lead.id}-17h`;
        const emSoneca17h = snoozedAte[chave17h] && now.getTime() < snoozedAte[chave17h];
        if (!lead.alerta_visita_17h_ciente && !emSoneca17h && now >= diaAnterior17h && now < visitaDate) {
          setActiveAlert({ lead, type: "17h" });
          return; // Para e mostra esse alerta
        }

        // --- Alerta 2: 2 horas antes da visita ---
        const duasHorasAntes = new Date(visitaDate);
        duasHorasAntes.setHours(duasHorasAntes.getHours() - 2);

        const chave2h = `${lead.id}-2h`;
        const emSoneca2h = snoozedAte[chave2h] && now.getTime() < snoozedAte[chave2h];
        if (!lead.alerta_visita_2h_ciente && !emSoneca2h && now >= duasHorasAntes && now <= visitaDate) {
          setActiveAlert({ lead, type: "2h" });
          return; // Para e mostra esse alerta
        }
      }
    };

    const interval = setInterval(checkAlerts, 30000); // Checa a cada 30 segundos
    checkAlerts(); // Execução inicial

    return () => clearInterval(interval);
  }, [user, activeAlert, snoozedAte]);

  const handleFechar = () => {
    if (!activeAlert) return;
    const chave = `${activeAlert.lead.id}-${activeAlert.type}`;
    setSnoozedAte((prev) => ({ ...prev, [chave]: Date.now() + SNOOZE_MS }));
    setActiveAlert(null);
  };

  // Marca o alerta como ciente + registra no histórico. `abrirChat`:
  // "Enviar Mensagem de Lembrete" abre o WhatsApp do lead depois;
  // "Confirmei por ligação/pessoalmente" só fecha (pra lead sem WhatsApp
  // ou quando o corretor já falou por outro canal -- não fica preso no
  // loop de 10 em 10 min).
  const confirmarAlerta = async (abrirChat: boolean) => {
    if (!activeAlert) return;
    setIsConfirming(true);

    try {
      const updateData = activeAlert.type === "17h"
        ? { alerta_visita_17h_ciente: true }
        : { alerta_visita_2h_ciente: true };

      const { error } = await supabase
        .from("leads")
        .update(updateData)
        .eq("id", activeAlert.lead.id);

      if (error) throw error;

      if (user) {
        const tipoTxt = activeAlert.type === "17h" ? "lembrete de 17h do dia anterior" : "lembrete de 2 horas antes";
        await supabase.from("leads_interacoes").insert({
          lead_id: activeAlert.lead.id,
          autor_id: user.id,
          tipo: "status",
          conteudo: abrirChat
            ? `Corretor confirmou o alerta de visita (${tipoTxt}) e abriu o WhatsApp para enviar o lembrete.`
            : `Corretor confirmou o alerta de visita (${tipoTxt}) — lembrete feito por ligação / pessoalmente.`,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["leads"] });
      if (abrirChat) setChatAberto(true);
      else setActiveAlert(null);
    } catch (error) {
      toast.error("Erro ao confirmar alerta. Tente novamente.");
      console.error(error);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleEnviarLembrete = () => confirmarAlerta(true);

  if (!activeAlert) return null;

  const lead = activeAlert.lead;
  const visitaDate = new Date(lead.data_visita);

  // Enquanto o chat abre, esconde o alerta em vez de sobrepor dois Dialog
  // ao mesmo tempo (Radix não gosta de dois modais abertos juntos).
  if (chatAberto) {
    return (
      <LeadDetailsModal
        leadId={lead.id}
        open={chatAberto}
        onOpenChange={(open) => {
          setChatAberto(open);
          if (!open) setActiveAlert(null);
        }}
        initialTab="chat"
      />
    );
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) handleFechar(); }}>
      <DialogContent className="sm:max-w-md border-red-500 border-2 shadow-[0_0_50px_rgba(239,68,68,0.3)] pointer-events-auto z-[9999]">
        <DialogHeader className="space-y-3">
          <div className="mx-auto bg-red-100 p-4 rounded-full animate-pulse">
            <AlertTriangle className="h-10 w-10 text-red-600" />
          </div>
          <DialogTitle className="text-center text-2xl font-black text-red-600 uppercase tracking-tight">
            Atenção: Visita Agendada!
          </DialogTitle>
          <div className="text-center text-slate-500 font-medium">
            {activeAlert.type === "17h" 
              ? "Você tem uma visita marcada para amanhã. Este é o alerta de 17h." 
              : "Faltam menos de 2 horas para sua visita! Prepare-se."}
          </div>
        </DialogHeader>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 my-2 space-y-3">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-slate-400" />
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase">Cliente</p>
              <p className="text-sm font-bold text-slate-800">{lead.nome}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase">Data da Visita</p>
              <p className="text-sm font-bold text-blue-700">
                {format(visitaDate, "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-orange-500" />
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase">Telefone de Contato</p>
              <p className="text-sm font-bold text-slate-800">{lead.telefone}</p>
            </div>
          </div>
        </div>

        <div className="bg-red-50 p-3 rounded-lg border border-red-100 text-center">
          <p className="text-xs font-bold text-red-700">
            Confirme de alguma forma — se só fechar, o alerta volta em 10 minutos.
          </p>
        </div>

        <DialogFooter className="sm:justify-center pt-2 flex-col gap-2">
          <Button
            className="w-full h-12 text-sm font-black uppercase tracking-widest bg-red-600 hover:bg-red-700 hover:scale-[1.02] transition-all shadow-lg shadow-red-200"
            onClick={handleEnviarLembrete}
            disabled={isConfirming}
          >
            {isConfirming ? "Registrando..." : (
              <>
                <MessageCircle className="mr-2 h-5 w-5" /> Enviar Mensagem de Lembrete
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="w-full h-10 text-xs font-bold border-slate-200 text-slate-600 hover:bg-slate-50"
            onClick={() => confirmarAlerta(false)}
            disabled={isConfirming}
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-500" /> Já confirmei por ligação / pessoalmente
          </Button>
          <Button
            variant="ghost"
            className="w-full h-8 text-[11px] font-bold text-slate-400 hover:text-slate-600"
            onClick={handleFechar}
            disabled={isConfirming}
          >
            <X className="mr-1.5 h-3 w-3" /> Agora não (lembrar de novo em 10 min)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
