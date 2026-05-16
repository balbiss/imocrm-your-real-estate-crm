import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { sendWhatsAppMessage } from "@/utils/whatsapp";

interface Message {
  id: string;
  created_at: string;
  conteudo: string;
  direcao: "inbound" | "outbound";
  tipo: string;
}

interface WhatsAppChatProps {
  leadId: string;
  imobiliariaId: string;
  phoneNumber: string;
}

export function WhatsAppChat({ leadId, imobiliariaId, phoneNumber }: WhatsAppChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Carregar histórico inicial
  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("mensagens_whatsapp")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Erro ao carregar mensagens:", error);
        toast.error("Erro ao carregar histórico de chat");
      } else {
        setMessages(data || []);
      }
      setLoading(false);
    };

    fetchMessages();

    // 2. Ouvir novas mensagens via Realtime
    const channel = supabase
      .channel(`chat-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "mensagens_whatsapp",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          setMessages((current) => [...current, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId]);

  // Scroll para o fim quando chegar mensagem nova
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    const messageContent = newMessage;
    setNewMessage("");

    try {
      // 1. Enviar via Baileys API
      const result = await sendWhatsAppMessage(phoneNumber, messageContent);

      if (result.success) {
        // 2. Salvar no banco (direção outbound)
        const { data: { user } } = await supabase.auth.getUser();
        
        await supabase.from("mensagens_whatsapp").insert({
          lead_id: leadId,
          imobiliaria_id: imobiliariaId,
          corretor_id: user?.id,
          conteudo: messageContent,
          direcao: "outbound",
          whatsapp_message_id: null, // Pode ser atualizado depois se a API retornar
        });
      } else {
        if (result.fallbackUrl) {
          toast.warning("API desconectada. Abrindo link direto...");
          window.open(result.fallbackUrl, "_blank");
        } else {
          throw new Error(result.error);
        }
      }
    } catch (error: any) {
      toast.error(`Falha ao enviar: ${error.message}`);
      setNewMessage(messageContent); // Devolve o texto se falhar
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin mb-2" />
        <p className="text-sm">Carregando conversa...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[500px] bg-slate-50 rounded-xl border border-slate-200 overflow-hidden shadow-inner">
      {/* Cabeçalho do Chat */}
      <div className="bg-white p-3 border-b flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
          <MessageSquare className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-700">WhatsApp Live</p>
          <p className="text-[10px] text-green-500 font-medium flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
            Conexão Ativa
          </p>
        </div>
      </div>

      {/* Área de Mensagens */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-10 opacity-40">
              <MessageSquare className="h-12 w-12 mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-medium text-slate-500">Nenhuma mensagem ainda.</p>
              <p className="text-[10px] text-slate-400">Inicie a conversa abaixo.</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.direcao === "outbound" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-sm ${
                  msg.direcao === "outbound"
                    ? "bg-primary text-white rounded-tr-none"
                    : "bg-white text-slate-700 border border-slate-100 rounded-tl-none"
                }`}
              >
                <p className="leading-relaxed">{msg.conteudo}</p>
                <p className={`text-[9px] mt-1.5 font-medium opacity-60 ${
                  msg.direcao === "outbound" ? "text-right" : "text-left"
                }`}>
                  {format(new Date(msg.created_at), "HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input de Envio */}
      <form onSubmit={handleSendMessage} className="p-3 bg-white border-t flex gap-2">
        <Input
          placeholder="Digite sua mensagem..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          className="flex-1 h-10 border-slate-200 focus-visible:ring-primary/20 text-sm"
          disabled={sending}
        />
        <Button 
          type="submit" 
          size="icon" 
          className="h-10 w-10 shrink-0 shadow-lg shadow-primary/20"
          disabled={!newMessage.trim() || sending}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
