import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MessageCircle, AlertCircle, Loader2, User, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  connectWhatsapp,
  deleteWhatsappInstance,
  disconnectWhatsapp,
  getWhatsappAvatar,
  getWhatsappStatus,
  WhatsappProvider,
  WhatsappStatus,
} from "@/lib/baileys";
import { UserWhatsAppModal } from "./UserWhatsAppModal";

interface WhatsAppIntegrationCardProps {
  userId: string;
  userName: string;
}

export function WhatsAppIntegrationCard({ userId, userName }: WhatsAppIntegrationCardProps) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [provider, setProvider] = useState<WhatsappProvider>("waha");

  // Uma linha antiga (herdada da WUZAPI, sem numero de telefone) nao conta
  // como conexao de verdade — trata como "sem instancia" pra pedir o numero.
  const hasInstance = !!status?.hasInstance && !!status?.phoneNumber;
  const isConnected = status?.connected === true;

  const loadStatus = async () => {
    try {
      const data = await getWhatsappStatus();
      setStatus(data);

      if (data.connected && data.jid) {
        const cleanJid = data.jid.split("@")[0].split(":")[0];
        getWhatsappAvatar(cleanJid)
          .then((url) => setAvatarUrl(url))
          .catch(() => {});
      }
    } catch (e) {
      console.error("Erro ao carregar status do WhatsApp:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, [userId]);

  const handleConnect = async () => {
    const digits = phoneInput.replace(/\D/g, "");
    if (digits.length < 10) {
      toast.error("Informe um numero de WhatsApp valido, com DDD.");
      return;
    }

    setProcessing(true);
    try {
      await connectWhatsapp(digits, provider);
      await loadStatus();
      setIsModalOpen(true);
    } catch (error: any) {
      console.error(error);
      toast.error(`Erro ao criar conexao: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleShowQr = async () => {
    if (!status?.phoneNumber) return;
    setProcessing(true);
    try {
      // Repete o connect pra pedir um QR fresco — o anterior pode ja ter
      // expirado (as engines so geram QR sob demanda, nao guardam).
      await connectWhatsapp(status.phoneNumber, status.provider ?? "waha");
      setIsModalOpen(true);
    } catch (error: any) {
      console.error(error);
      toast.error(`Erro ao gerar QR Code: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleDisconnect = async () => {
    setProcessing(true);
    try {
      await disconnectWhatsapp();
      setAvatarUrl(null);
      await loadStatus();
      toast.success("WhatsApp desconectado. O número continua salvo — é só ler o QR de novo pra reconectar.");
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao desconectar");
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async () => {
    setProcessing(true);
    try {
      await deleteWhatsappInstance();
      setStatus({ hasInstance: false });
      setAvatarUrl(null);
      toast.success("Conexão removida por completo.");
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao deletar conexão");
    } finally {
      setProcessing(false);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    loadStatus();
  };

  if (loading) {
    return (
      <Card className="border-none shadow-soft bg-white h-full">
        <CardContent className="p-5 flex items-center justify-center h-[180px]">
          <Loader2 className="h-6 w-6 text-slate-300 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  // ESTADO 1: Sem instância
  if (!hasInstance) {
    return (
      <Card className="border-none shadow-soft bg-white hover:shadow-md transition-all group overflow-hidden h-full flex flex-col">
        <CardContent className="p-5 flex flex-col h-full gap-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 bg-slate-50 group-hover:bg-primary/5 transition-colors">
              <MessageCircle className="h-6 w-6 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-widest border-none bg-slate-50 text-slate-400 h-5 px-1.5">
                  Comunicação
                </Badge>
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="h-3 w-3 text-slate-300" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Inativo</span>
                </div>
              </div>
              <h3 className="text-saas-sm font-bold text-slate-700 mb-1">WhatsApp</h3>
              <p className="text-saas-xs text-slate-400 leading-relaxed">
                Envio automático de mensagens e integração com chatbot.
              </p>
            </div>
          </div>
          <div className="mt-auto pt-2 space-y-2">
            <div className="space-y-1.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Motor de conexão</span>
              <RadioGroup
                value={provider}
                onValueChange={(v) => setProvider(v as WhatsappProvider)}
                className="grid grid-cols-2 gap-2"
              >
                <label className={`flex items-center gap-2 rounded-lg border p-2 cursor-pointer transition-colors ${provider === "waha" ? "border-primary bg-primary/5" : "border-slate-200"}`}>
                  <RadioGroupItem value="waha" className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-bold text-slate-600">WAHA <span className="text-emerald-500 font-medium">(recomendado)</span></span>
                </label>
                <label className={`flex items-center gap-2 rounded-lg border p-2 cursor-pointer transition-colors ${provider === "baileys" ? "border-primary bg-primary/5" : "border-slate-200"}`}>
                  <RadioGroupItem value="baileys" className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-bold text-slate-600">Baileys</span>
                </label>
              </RadioGroup>
            </div>
            <Input
              placeholder="Seu numero com DDD (ex: 11999998888)"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="h-9 text-xs"
            />
            <Button
              className="w-full h-9 text-[10px] font-bold uppercase tracking-wider"
              onClick={handleConnect}
              disabled={processing}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Conectar WhatsApp
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ESTADO 2 e 3: Com instância (aguardando QR ou conectado)
  return (
    <>
      <Card className="border-none shadow-soft bg-white hover:shadow-md transition-all h-full flex flex-col relative overflow-hidden">
        {isConnected && (
          <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
        )}
        <CardContent className="p-5 flex flex-col h-full gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${isConnected ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                <MessageCircle className={`h-4 w-4 ${isConnected ? 'text-emerald-600' : 'text-slate-400'}`} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-700">WhatsApp</h3>
                <p className="text-[10px] text-slate-400 font-medium">
                  Conexão Individual{status?.provider ? ` · ${status.provider === "waha" ? "WAHA" : "Baileys"}` : ""}
                </p>
              </div>
            </div>
            {isConnected ? (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-100 text-[10px] font-bold uppercase">
                ● Conectado
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-100 text-[10px] font-bold uppercase">
                Aguardando
              </Badge>
            )}
          </div>

          <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-3 mb-2">
              {avatarUrl ? (
                <img src={avatarUrl} alt="WhatsApp Profile" className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                  <User className="w-5 h-5 text-slate-500" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <span>{userName}</span>
                </div>
                <div className="text-sm text-slate-500">
                  {status?.phoneNumber || "Número indisponível"}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-2 flex items-center gap-2">
            {!isConnected ? (
              <Button
                className="flex-1 h-9 text-[10px] font-bold uppercase tracking-wider bg-primary hover:bg-primary/90"
                onClick={handleShowQr}
                disabled={processing}
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Ver QR Code
              </Button>
            ) : (
              <Button
                variant="outline"
                className="flex-1 h-9 text-[10px] font-bold uppercase tracking-wider border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={handleDisconnect}
                disabled={processing}
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Desconectar
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={handleDelete}
              disabled={processing}
              title="Apagar conexão por completo"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {isModalOpen && (
        <UserWhatsAppModal isOpen={isModalOpen} onClose={handleModalClose} />
      )}
    </>
  );
}
