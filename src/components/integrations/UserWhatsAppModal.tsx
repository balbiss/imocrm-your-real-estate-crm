import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, QrCode, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { connectWuzapiSession, getWuzapiQR, getWuzapiStatus } from "@/lib/wuzapi";

interface UserWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  wuzapiToken: string;
}

export function UserWhatsAppModal({ isOpen, onClose, userId, wuzapiToken }: UserWhatsAppModalProps) {
  const [loading, setLoading] = useState(true);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");

  // Inicia a geração do QR Code ao abrir o modal
  useEffect(() => {
    if (isOpen && wuzapiToken) {
      generateQRCode();
    }
  }, [isOpen, wuzapiToken]);

  const generateQRCode = async () => {
    setLoading(true);
    setStatus("connecting");
    setQrCode(null);

    try {
      try {
        await connectWuzapiSession(wuzapiToken);
      } catch (connErr: any) {
        if (connErr.message?.toLowerCase().includes("already connected")) {
          const { loggedIn } = await getWuzapiStatus(wuzapiToken);
          if (loggedIn) {
            handleSuccess();
            return;
          }
        } else {
          throw connErr;
        }
      }

      // Aguardar um instante e pegar o QR Code
      setTimeout(async () => {
        try {
          const base64QR = await getWuzapiQR(wuzapiToken);
          if (base64QR) {
            setQrCode(base64QR);
          } else {
            // Se não vier QR Code, verificar se já está logado.
            const { connected, loggedIn } = await getWuzapiStatus(wuzapiToken);
            if (connected && loggedIn) {
              handleSuccess();
            }
          }
        } catch (e: any) {
          toast.error(e.message || "Erro ao pegar QR Code.");
          setStatus("error");
        } finally {
          setLoading(false);
        }
      }, 3000);
    } catch (error: any) {
      console.error(error);
      const errorMsg = error.message?.toLowerCase() || "";
      if (errorMsg.includes("unauthorized") || errorMsg.includes("não autorizado")) {
        toast.error("Sua instância não existe mais. Feche e recrie a conexão.");
      } else {
        toast.error(`Erro: ${error.message}`);
      }
      setStatus("error");
      setLoading(false);
    }
  };

  const handleSuccess = async () => {
    setStatus("connected");
    setQrCode(null);
    setLoading(false);
    await supabase.from("whatsapp_instances" as any).update({ connected: true }).eq("user_id", userId);
    toast.success("WhatsApp conectado com sucesso!");
    setTimeout(() => onClose(), 2000);
  };

  // Polling
  useEffect(() => {
    let interval: NodeJS.Timeout;
    let qrRefreshCounter = 0;

    if (isOpen && status === "connecting" && qrCode && wuzapiToken) {
      interval = setInterval(async () => {
        try {
          const { connected, loggedIn } = await getWuzapiStatus(wuzapiToken);
          
          if (connected && loggedIn) {
            clearInterval(interval);
            handleSuccess();
          } else {
            qrRefreshCounter++;
            if (qrRefreshCounter >= 3) {
               qrRefreshCounter = 0;
               try {
                 const base64QR = await getWuzapiQR(wuzapiToken);
                 if (base64QR) setQrCode(base64QR);
               } catch(e) {} 
            }
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen, status, qrCode, wuzapiToken, userId]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] bg-white border-none shadow-2xl p-0 overflow-hidden flex flex-col">
        <div className="bg-primary p-4 text-primary-foreground flex items-center gap-3 shrink-0">
          <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
            <MessageCircle className="h-6 w-6 text-white" />
          </div>
          <div>
            <DialogTitle className="text-lg font-bold text-white">Ler QR Code</DialogTitle>
            <DialogDescription className="text-white/80 text-[10px] uppercase tracking-wider font-bold">
              Escaneie com seu WhatsApp
            </DialogDescription>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-5">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${status === "connected" ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status da Conexão</span>
              </div>
              <Badge variant="outline" className={`h-5 text-[9px] font-black uppercase ${
                status === "connected" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-100 text-slate-400 border-slate-200"
              }`}>
                {status === "connected" ? "● Conectado" : "● Aguardando"}
              </Badge>
            </div>

            {status === "connected" ? (
              <div className="text-center py-6">
                <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="h-8 w-8" />
                </div>
                <h3 className="text-slate-800 font-bold">Tudo Certo!</h3>
                <p className="text-sm text-slate-500 mt-2">Você já pode fechar esta janela.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 relative min-h-[240px]">
                {qrCode ? (
                  <div className="bg-white p-3 rounded-xl shadow-lg animate-in zoom-in-95 duration-300">
                    <img src={qrCode} alt="WhatsApp QR Code" className="w-48 h-48" />
                  </div>
                ) : (
                  <div className="text-center space-y-2">
                    <div className="h-12 w-12 rounded-full bg-white shadow-sm flex items-center justify-center mx-auto text-slate-300">
                      <QrCode className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-500 uppercase">Aguardando geração...</p>
                    </div>
                  </div>
                )}
                
                {loading && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
