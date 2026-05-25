import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, CheckCircle2, AlertCircle, RefreshCw, Loader2, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createWuzapiUser, deleteWuzapiUserFull, getWuzapiStatus, getWuzapiAvatar, setWuzapiWebhook } from "@/lib/wuzapi";
import { UserWhatsAppModal } from "./UserWhatsAppModal";

interface WhatsAppIntegrationCardProps {
  userId: string;
  userName: string;
}

export function WhatsAppIntegrationCard({ userId, userName }: WhatsAppIntegrationCardProps) {
  const [loading, setLoading] = useState(true);
  const [instanceData, setInstanceData] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Status derivados
  const hasInstance = !!instanceData;
  const isConnected = instanceData?.connected === true;
  const wuzapiToken = instanceData?.wuzapi_token;
  const wuzapiUserId = instanceData?.wuzapi_user_id;
  const jid = instanceData?.jid;

  const loadInstance = async () => {
    try {
      const { data, error } = await supabase
        .from("whatsapp_instances" as any)
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      
      if (error) throw error;
      setInstanceData(data);

      if (data && data.wuzapi_token) {
        // Verifica na WUZAPI se a sessão está realmente logada
        try {
          const status = await getWuzapiStatus(data.wuzapi_token);
          
          if (status.loggedIn) {
            // Atualiza jid se conectou e mudou
            if (status.jid && status.jid !== data.jid) {
              await supabase.from("whatsapp_instances" as any).update({ jid: status.jid, connected: true }).eq("user_id", userId);
              setInstanceData({ ...data, jid: status.jid, connected: true });
            } else if (!data.connected) {
              await supabase.from("whatsapp_instances" as any).update({ connected: true }).eq("user_id", userId);
              setInstanceData({ ...data, connected: true });
            }
            
            // Busca a foto de perfil
            if (status.jid) {
              const cleanJid = status.jid.split('@')[0].split(':')[0];
              const avatar = await getWuzapiAvatar(data.wuzapi_token, cleanJid);
              setAvatarUrl(avatar);
            }
          } else {
            // Se não está logado, garante que o card volte para "Aguardando"
            if (data.connected) {
              await supabase.from("whatsapp_instances" as any).update({ connected: false }).eq("user_id", userId);
              setInstanceData({ ...data, connected: false });
            }
          }
        } catch (e) {
          console.warn("Não foi possível verificar status", e);
        }
      }
    } catch (e) {
      console.error("Erro ao carregar instância:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstance();
  }, [userId]);

  const handleCreateConnection = async () => {
    setProcessing(true);
    try {
      const sanitizedName = userName.trim().replace(/\s+/g, "_") + "_" + userId.substring(0, 5);
      const wuzapiUser = await createWuzapiUser(sanitizedName);

      // Configurar o Webhook usando a URL do Supabase atual
      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;
      await setWuzapiWebhook(wuzapiUser.token, webhookUrl).catch(e => console.warn("Erro ao setar webhook:", e));

      const newInstance = {
        user_id: userId,
        wuzapi_token: wuzapiUser.token,
        wuzapi_user_id: wuzapiUser.id,
        connected: false
      };

      await supabase.from("whatsapp_instances" as any).insert(newInstance);
      
      setInstanceData(newInstance);
      toast.success("Conexão criada com sucesso! Agora gere seu QR Code.");
    } catch (error: any) {
      console.error(error);
      toast.error(`Erro ao criar conexão: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleDisconnect = async () => {
    setProcessing(true);
    try {
      if (wuzapiUserId) {
        try {
          await deleteWuzapiUserFull(wuzapiUserId);
        } catch (e: any) {
          console.warn("Erro ao deletar WUZAPI user (pode já estar excluído):", e);
        }
      }

      await supabase.from("whatsapp_instances" as any).delete().eq("user_id", userId);
      setInstanceData(null);
      toast.success("WhatsApp desconectado e instância removida completamente.");
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao remover conexão");
    } finally {
      setProcessing(false);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    loadInstance(); // Recarrega para ver se conectou
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
              <h3 className="text-saas-sm font-bold text-slate-700 mb-1">WhatsApp API</h3>
              <p className="text-saas-xs text-slate-400 leading-relaxed">
                Envio automático de mensagens e integração com chatbot.
              </p>
            </div>
          </div>
          <div className="mt-auto pt-2">
            <Button
              className="w-full h-9 text-[10px] font-bold uppercase tracking-wider"
              onClick={handleCreateConnection}
              disabled={processing}
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar Conexão
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ESTADO 2 e 4: Com Instância (Aguardando QR Code ou Conectado)
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
                <h3 className="text-sm font-bold text-slate-700">WhatsApp API</h3>
                <p className="text-[10px] text-slate-400 font-medium">Conexão Individual</p>
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
                  {instanceData.jid ? instanceData.jid.split('@')[0] : "Número indisponível"}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-2 flex items-center gap-2">
            {!isConnected ? (
              <Button
                className="flex-1 h-9 text-[10px] font-bold uppercase tracking-wider bg-primary hover:bg-primary/90"
                onClick={() => setIsModalOpen(true)}
              >
                Gerar QR Code
              </Button>
            ) : (
              <Button
                variant="outline"
                className="flex-1 h-9 text-[10px] font-bold uppercase tracking-wider border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={handleDisconnect}
                disabled={processing}
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Desconectar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isModalOpen && wuzapiToken && (
        <UserWhatsAppModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          userId={userId}
          wuzapiToken={wuzapiToken}
        />
      )}
    </>
  );
}
