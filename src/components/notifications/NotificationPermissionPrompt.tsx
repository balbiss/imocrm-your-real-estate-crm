import { useEffect, useState } from "react";
import { Bell, X, Share, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const DISMISS_KEY = "push-prompt-dismissed";

export function NotificationPermissionPrompt() {
  const { permission, isSupported, needsInstallOnIOS, loading, subscribe } =
    usePushNotifications();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (!isSupported || dismissed || permission !== "default") return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const handleEnable = async () => {
    const ok = await subscribe();
    if (ok) {
      toast.success("Notificações ativadas!");
      // Lê o valor atual do navegador em vez do estado do hook (que so
      // atualiza no proximo render — chegaria atrasado aqui).
    } else if (Notification.permission === "denied") {
      toast.error("Notificação bloqueada no navegador. Ative nas configurações do site pra receber.");
    }
  };

  return (
    <div className="mx-4 mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-start gap-3">
      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Bell className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        {needsInstallOnIOS ? (
          <>
            <p className="text-sm font-semibold text-slate-800">Instale o app pra receber notificações</p>
            <p className="text-xs text-slate-500 mt-0.5">
              No iPhone, toque em{" "}
              <Share className="h-3 w-3 inline-block mx-0.5 -mt-0.5" /> (Compartilhar) e depois em{" "}
              <PlusSquare className="h-3 w-3 inline-block mx-0.5 -mt-0.5" /> "Adicionar à Tela de Início".
              É uma limitação do próprio iPhone — só funciona assim.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-800">Ativar notificações de mensagens</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Receba um alerta na hora que um lead te mandar mensagem no WhatsApp, mesmo com o CRM fechado.
            </p>
            <Button size="sm" className="mt-2 h-7 text-xs" onClick={handleEnable} disabled={loading}>
              {loading ? "Ativando..." : "Ativar notificações"}
            </Button>
          </>
        )}
      </div>
      <button onClick={handleDismiss} className="text-slate-400 hover:text-slate-600 shrink-0">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
