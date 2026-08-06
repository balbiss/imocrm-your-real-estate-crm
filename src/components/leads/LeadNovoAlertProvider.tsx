import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, MessageCircle, X } from "lucide-react";
import { playNotificationSound } from "@/lib/notificationSound";
import { LeadDetailsModal } from "@/components/leads/LeadDetailsModal";

const COUNTDOWN_SECONDS = 20;

type LeadNovoNotificacao = {
  id: string;
  lead_id: string | null;
  titulo: string;
};

// Pedido do dono (06/08): quando um lead novo cai pro corretor, quer um
// popup chamativo com contagem regressiva (nao so o toast silencioso que ja
// existia), + som, + notificacao do sistema se o corretor estiver em outra
// aba/janela. Reaproveita a notificacao 'lead_novo_atribuido' que ja e
// inserida por notificar_novo_lead_atribuido() (migration 20260804020000) --
// so faltava esse aviso mais forte no frontend.
export function LeadNovoAlertProvider() {
  const { user } = useAuth();
  const [activeAlert, setActiveAlert] = useState<LeadNovoNotificacao | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [chatAberto, setChatAberto] = useState(false);
  const queueRef = useRef<LeadNovoNotificacao[]>([]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`lead_novo_alert_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacoes",
          filter: `usuario_id=eq.${user.id}`,
        },
        (payload) => {
          const notif = payload.new as { id: string; tipo: string; lead_id: string | null; titulo: string };
          if (notif.tipo !== "lead_novo_atribuido") return;

          playNotificationSound();

          if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
            const sysNotif = new Notification(notif.titulo, {
              body: "Novo lead atribuído a você — abra o CRM para atender.",
              tag: notif.id,
            });
            sysNotif.onclick = () => window.focus();
          }

          queueRef.current.push({ id: notif.id, lead_id: notif.lead_id, titulo: notif.titulo });
          setActiveAlert((current) => current ?? queueRef.current.shift() ?? null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!activeAlert || chatAberto) return;

    setSecondsLeft(COUNTDOWN_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          handleFechar();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAlert, chatAberto]);

  const advanceQueue = () => {
    const next = queueRef.current.shift() ?? null;
    setActiveAlert(next);
  };

  const handleFechar = () => {
    if (activeAlert) {
      supabase.from("notificacoes").update({ lida: true }).eq("id", activeAlert.id).then(() => {});
    }
    advanceQueue();
  };

  const handleVerLead = () => {
    if (!activeAlert) return;
    supabase.from("notificacoes").update({ lida: true }).eq("id", activeAlert.id).then(() => {});
    setChatAberto(true);
  };

  if (!activeAlert) return null;

  if (chatAberto) {
    return (
      <LeadDetailsModal
        leadId={activeAlert.lead_id}
        open={chatAberto}
        onOpenChange={(open) => {
          setChatAberto(open);
          if (!open) advanceQueue();
        }}
      />
    );
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) handleFechar(); }}>
      <DialogContent className="sm:max-w-md border-primary border-2 shadow-[0_0_50px_rgba(37,99,235,0.3)] pointer-events-auto z-[9999]">
        <DialogHeader className="space-y-3">
          <div className="mx-auto bg-primary/10 p-4 rounded-full animate-pulse">
            <Sparkles className="h-10 w-10 text-primary" />
          </div>
          <DialogTitle className="text-center text-2xl font-black text-primary uppercase tracking-tight">
            Lead Novo!
          </DialogTitle>
          <div className="text-center text-slate-600 font-bold text-base">
            {activeAlert.titulo}
          </div>
        </DialogHeader>

        <div className="flex flex-col items-center gap-2 py-2">
          <div className="relative h-16 w-16 flex items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="#e2e8f0" strokeWidth="6" />
              <circle
                cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="6"
                strokeLinecap="round"
                className="text-primary transition-all duration-1000 ease-linear"
                strokeDasharray={2 * Math.PI * 28}
                strokeDashoffset={2 * Math.PI * 28 * (1 - secondsLeft / COUNTDOWN_SECONDS)}
              />
            </svg>
            <span className="text-lg font-black text-slate-700">{secondsLeft}</span>
          </div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            Fecha sozinho em {secondsLeft}s
          </p>
        </div>

        <DialogFooter className="sm:justify-center pt-2 flex-col gap-2">
          <Button
            className="w-full h-12 text-sm font-black uppercase tracking-widest bg-primary hover:scale-[1.02] transition-all shadow-lg shadow-primary/20"
            onClick={handleVerLead}
          >
            <MessageCircle className="mr-2 h-5 w-5" /> Ver Lead Agora
          </Button>
          <Button
            variant="ghost"
            className="w-full h-9 text-xs font-bold text-slate-500 hover:text-slate-700"
            onClick={handleFechar}
          >
            <X className="mr-1.5 h-3.5 w-3.5" /> Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
