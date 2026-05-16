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
  const [apiUrl, setApiUrl] = useState(currentConfig?.apiUrl || "https://wa.inoovaweb.com.br");
  const [apiKey, setApiKey] = useState(currentConfig?.apiKey || "minha_chave_mestra_123");
  const [phoneNumber, setPhoneNumber] = useState(currentConfig?.phoneNumber || "");
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [checkingStatus, setCheckingStatus] = useState(false);

  // Verificar status atual na API do Baileys
  const checkApiStatus = async () => {
    if (!apiUrl || !apiKey || !phoneNumber) return;
    
    setCheckingStatus(true);
    try {
      const response = await fetch(`${apiUrl}/status`, {
        headers: { "x-api-key": apiKey }
      });
      if (response.ok) {
        // Se a API está OK, podemos tentar ver se o número está conectado futuramente
        // Por enquanto, apenas validamos a conexão com a API
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

  const generateQRCode = async () => {
    if (!phoneNumber) {
      toast.error("Informe o número de telefone (ex: +5511999999999)");
      return;
    }

    setLoading(true);
    setStatus("connecting");
    setQrCode(null);

    try {
      // 1. Iniciar conexão na Baileys API
      const res = await fetch(`${apiUrl}/connections/${phoneNumber}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-api-key": apiKey 
        }
      });

      const data = await res.json();

      if (res.ok) {
        toast.info("Aguardando QR Code...");
        
        if (data.qr) {
          setQrCode(data.qr);
        } else {
          // Tentar buscar o QR via GET se não veio no POST
          const qrRes = await fetch(`${apiUrl}/connections/${phoneNumber}`, {
            headers: { "x-api-key": apiKey }
          });
          const qrData = await qrRes.json();
          if (qrData.qr) setQrCode(qrData.qr);
        }
      } else {
        throw new Error(data.message || "Erro ao iniciar conexão");
      }
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  // Efeito para verificar status automaticamente quando estiver tentando conectar
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (status === "connecting" || qrCode) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${apiUrl}/connections/${phoneNumber}`, {
            headers: { "x-api-key": apiKey }
          });
          const data = await res.json();

          // Se a conexão estiver 'open' (aberta), significa que o QR foi lido
          if (data.status === "open" || data.state === "open") {
            setStatus("connected");
            setQrCode(null);
            clearInterval(interval);
            toast.success("WhatsApp conectado com sucesso!");
            
            // Salvar automaticamente o status no banco
            await handleSaveConfig();
          }
        } catch (e) {
          console.error("Erro no polling de status:", e);
        }
      }, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status, qrCode, apiUrl, apiKey, phoneNumber]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-white border-none shadow-2xl p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <QrCode className="h-6 w-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-white">Configurar WhatsApp</DialogTitle>
                <DialogDescription className="text-emerald-50/80 text-xs">
                  Conecte sua instância da Baileys-API para automações.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-6">
          {/* Status da API */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Status da Instância</span>
            </div>
            <Badge variant="outline" className="bg-white text-[10px] font-bold">
              {checkingStatus ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <CheckCircle2 className="h-3 w-3 text-emerald-500 mr-1" />
              )}
              ONLINE
            </Badge>
          </div>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="apiUrl" className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Globe className="h-3 w-3" /> URL da API
              </Label>
              <Input
                id="apiUrl"
                placeholder="https://wa.inoovaweb.com.br"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="bg-slate-50 border-slate-200 focus:bg-white transition-all h-11"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="apiKey" className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="h-3 w-3" /> API Key (x-api-key)
              </Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Sua chave de acesso"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="bg-slate-50 border-slate-200 focus:bg-white transition-all h-11"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phone" className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Smartphone className="h-3 w-3" /> Seu Número (com DDI)
              </Label>
              <Input
                id="phone"
                placeholder="+5511999999999"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="bg-slate-50 border-slate-200 focus:bg-white transition-all h-11"
              />
            </div>
          </div>

          {/* QR Code Area */}
          <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 relative min-h-[250px]">
            {qrCode ? (
              <div className="bg-white p-4 rounded-xl shadow-lg animate-in zoom-in-95 duration-300">
                <img src={qrCode} alt="WhatsApp QR Code" className="w-48 h-48" />
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
                  <QrCode className="h-8 w-8 text-slate-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-600">Aguardando geração...</p>
                  <p className="text-[10px] text-slate-400 max-w-[200px] mx-auto">
                    Salve as configurações e gere o QR Code para parear seu celular.
                  </p>
                </div>
              </div>
            )}
            
            {loading && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center rounded-2xl">
                <div className="flex flex-col items-center gap-2">
                  <RefreshCw className="h-8 w-8 text-emerald-600 animate-spin" />
                  <span className="text-xs font-bold text-emerald-700 animate-pulse">Processando...</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1 h-12 font-bold uppercase tracking-wider text-[11px] border-slate-200"
              onClick={handleSaveConfig}
              disabled={loading}
            >
              <Save className="mr-2 h-4 w-4" /> Salvar Dados
            </Button>
            <Button
              className="flex-1 h-12 font-bold uppercase tracking-wider text-[11px] bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100"
              onClick={generateQRCode}
              disabled={loading}
            >
              <QrCode className="mr-2 h-4 w-4" /> Gerar QR Code
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
