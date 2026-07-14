import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, QrCode, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { getWhatsappStatus } from "@/lib/baileys";

interface UserWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserWhatsAppModal({ isOpen, onClose }: UserWhatsAppModalProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");

  // O connect() ja foi disparado antes de abrir o modal (WhatsAppIntegrationCard).
  // Aqui a gente so faz polling do status ate o QR aparecer ou conectar de vez.
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setStatus("connecting");
    setQrCode(null);

    const poll = async () => {
      try {
        const data = await getWhatsappStatus();
        if (cancelled) return;

        if (data.connected) {
          setStatus("connected");
          setQrCode(null);
          toast.success("WhatsApp conectado com sucesso!");
          setTimeout(() => !cancelled && onClose(), 2000);
          return true;
        }

        if (data.qrCode) setQrCode(data.qrCode);
      } catch (e: any) {
        console.error("Erro ao consultar status do WhatsApp:", e);
      }
      return false;
    };

    poll();
    const interval = setInterval(async () => {
      const done = await poll();
      if (done) clearInterval(interval);
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
                    <Loader2 className="h-5 w-5 mx-auto text-primary animate-spin" />
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
