import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  QrCode, 
  Save, 
  RefreshCw,
  Smartphone,
  ShieldCheck,
  Globe
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WhatsAppConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  imobiliariaId: string;
  currentConfig?: any;
  onSaved: () => void;
}

export function WhatsAppConfigModal({
  isOpen,
  onClose,
  imobiliariaId,
  currentConfig,
  onSaved,
}: WhatsAppConfigModalProps) {
  const [instanceName, setInstanceName] = useState(currentConfig?.instanceName || "WhatsApp_CRM");
  const [apiUrl, setApiUrl] = useState(currentConfig?.apiUrl || "https://evogo.inoovaweb.cloud");
  const [apiKey, setApiKey] = useState(currentConfig?.apiKey || "2722b3cb9ec5ddba9cc509f0f321e1d8");
  const [phoneNumber, setPhoneNumber] = useState(currentConfig?.phoneNumber || "");
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [checkingStatus, setCheckingStatus] = useState(false);

  // Verificar status atual na Evolution API
  const checkApiStatus = async () => {
    if (!apiUrl || !apiKey || !instanceName) return;
    
    setCheckingStatus(true);
    try {
      const response = await fetch(`${apiUrl}/instance/connectionState/${instanceName}`, {
        headers: { "apikey": apiKey }
      });
      const data = await response.json();
      if (data.instance?.state === "open") {
        setStatus("connected");
      }
    } catch (error) {
      console.error("Erro ao validar API:", error);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleSaveConfig = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("integracoes_config")
        .upsert(
          {
            imobiliaria_id: imobiliariaId,
            integration_id: "whatsapp",
            status: status === "connected" ? "connected" : "pending",
            config: {
              apiUrl,
              apiKey,
              phoneNumber,
              instanceName,
              provider: "evolution_go"
            },
          },
          { onConflict: "imobiliaria_id,integration_id" }
        );

      if (error) throw error;
      toast.success("Configurações salvas com sucesso!");
      onSaved();
    } catch (error) {
      toast.error("Erro ao salvar configurações.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const configureWebhook = async (sanitizedName: string) => {
    try {
      await fetch(`${apiUrl}/webhook/set/${sanitizedName}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "apikey": apiKey 
        },
        body: JSON.stringify({
          url: "https://osheoeeigahkwsrzfjdw.supabase.co/functions/v1/whatsapp-webhook",
          webhook_by_events: false,
          events: [
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
            "MESSAGES_DELETE",
            "SEND_MESSAGE",
            "CONNECTION_UPDATE"
          ]
        })
      });
      console.log("Webhook configurado automaticamente.");
    } catch (e) {
      console.error("Erro ao configurar webhook:", e);
    }
  };

  const generateQRCode = async () => {
    if (!instanceName) {
      toast.error("Informe um nome para a instância (sem espaços)");
      return;
    }

    setLoading(true);
    setStatus("connecting");
    setQrCode(null);

    const sanitizedInstanceName = instanceName.trim().replace(/\s+/g, "_");

    try {
      // 1. Criar ou Reiniciar Instância na Evolution API
      await fetch(`${apiUrl}/instance/create`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "apikey": apiKey 
        },
        body: JSON.stringify({
          instanceName: sanitizedInstanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS"
        })
      });

      // 2. Configurar Webhook Automaticamente
      await configureWebhook(sanitizedInstanceName);
      
      // 3. Buscar QR Code
      const connectRes = await fetch(`${apiUrl}/instance/connect/${sanitizedInstanceName}`, {
        headers: { "apikey": apiKey }
      });

      const data = await connectRes.json();

      if (connectRes.ok && data.base64) {
        setQrCode(data.base64);
        toast.success("QR Code gerado e Webhook configurado!");
      } else {
        // Tentar ver se já está conectado
        const stateRes = await fetch(`${apiUrl}/instance/connectionState/${sanitizedInstanceName}`, {
          headers: { "apikey": apiKey }
        });
        const stateData = await stateRes.json();
        
        if (stateData.instance?.state === "open") {
          setStatus("connected");
          toast.success("WhatsApp já está conectado!");
        } else {
          throw new Error(data.message || "Erro ao conectar instância");
        }
      }
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  // Polling para verificar se o QR foi lido
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (status === "connecting" || qrCode) {
      const sanitizedInstanceName = instanceName.trim().replace(/\s+/g, "_");
      
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${apiUrl}/instance/connectionState/${sanitizedInstanceName}`, {
            headers: { "apikey": apiKey }
          });
          const data = await res.json();

          if (data.instance?.state === "open") {
            setStatus("connected");
            setQrCode(null);
            clearInterval(interval);
            toast.success("WhatsApp conectado com sucesso!");
            await handleSaveConfig();
          }
        } catch (e) {
          console.error("Erro no polling de status:", e);
        }
      }, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status, qrCode, apiUrl, apiKey, instanceName]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] max-h-[90vh] bg-white border-none shadow-2xl p-0 overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-4 text-white flex items-center gap-3 shrink-0">
          <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
            <QrCode className="h-6 w-6 text-white" />
          </div>
          <div>
            <DialogTitle className="text-lg font-bold text-white">Conectar WhatsApp</DialogTitle>
            <DialogDescription className="text-emerald-50/80 text-[10px] uppercase tracking-wider font-bold">
              Configuração de Instância
            </DialogDescription>
          </div>
        </div>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">
            {/* Status da API */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${status === "connected" ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status da Instância</span>
              </div>
              <Badge variant="outline" className={`h-5 text-[9px] font-black uppercase ${
                status === "connected" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-100 text-slate-400 border-slate-200"
              }`}>
                {status === "connected" ? "● Online" : "● Offline"}
              </Badge>
            </div>

            <div className="space-y-4">
              <div className="grid gap-1.5">
                <Label htmlFor="instanceName" className="text-[10px] font-bold text-slate-400 uppercase ml-1">
                  Nome da Conexão
                </Label>
                <Input
                  id="instanceName"
                  placeholder="Ex: WhatsApp Comercial"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  className="bg-slate-50 border-slate-200 focus:bg-white transition-all h-10 text-sm"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="phone" className="text-[10px] font-bold text-slate-400 uppercase ml-1">
                  Seu Número (com DDI)
                </Label>
                <Input
                  id="phone"
                  placeholder="+5591999999999"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="bg-slate-50 border-slate-200 focus:bg-white transition-all h-10 text-sm font-medium"
                />
                <p className="text-[9px] text-slate-400 ml-1 italic">* Use o formato com +55</p>
              </div>

              {/* Campos técnicos escondidos (acessíveis apenas se necessário via código) */}
              <div className="hidden">
                <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
                <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              </div>
            </div>

            {/* QR Code Area */}
            <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 relative min-h-[220px] transition-all hover:border-emerald-200">
              {qrCode ? (
                <div className="bg-white p-3 rounded-xl shadow-lg animate-in zoom-in-95 duration-300">
                  <img src={qrCode} alt="WhatsApp QR Code" className="w-40 h-40" />
                </div>
              ) : (
                <div className="text-center space-y-2">
                  <div className="h-12 w-12 rounded-full bg-white shadow-sm flex items-center justify-center mx-auto text-slate-200">
                    <QrCode className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase">Aguardando geração...</p>
                    <p className="text-[9px] text-slate-400 max-w-[180px] mx-auto mt-1">
                      Salve os dados e gere o código para conectar seu celular.
                    </p>
                  </div>
                </div>
              )}
              
              {loading && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center rounded-2xl">
                  <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="p-4 bg-slate-50 border-t flex gap-3 shrink-0">
          <Button
            variant="outline"
            className="flex-1 h-11 font-bold uppercase tracking-wider text-[10px] border-slate-200 bg-white"
            onClick={handleSaveConfig}
            disabled={loading}
          >
            Salvar Dados
          </Button>
          <Button
            className="flex-1 h-11 font-bold uppercase tracking-wider text-[10px] bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100"
            onClick={generateQRCode}
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <QrCode className="mr-2 h-3.5 w-3.5" />}
            Gerar QR Code
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
