import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Paperclip, Check, CheckCheck, Clock, X, Smile, User, Loader2, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { sendWuzapiText, sendWuzapiImage, sendWuzapiDocument, sendWuzapiAudio, checkWuzapiUser, getWuzapiAvatar } from "@/lib/wuzapi";

interface Message {
  id: string;
  created_at: string;
  conteudo: string;
  direcao: "inbound" | "outbound";
  tipo: string;
  status?: string;
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
        .from("mensagens_whatsapp" as any)
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
          setMessages((current) => {
            // Evita duplicatas se a mensagem otimista já estiver na lista
            const exists = current.some(m => m.id === payload.new.id);
            if (exists) {
              return current.map(m => m.id === payload.new.id ? payload.new as Message : m);
            }
            return [...current, payload.new as Message];
          });
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

  const [wuzapiToken, setWuzapiToken] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [leadAvatar, setLeadAvatar] = useState<string | null>(null);
  const [agentAvatar, setAgentAvatar] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Fecha o emoji picker ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Busca o token da instância do usuário logado
  useEffect(() => {
    const fetchToken = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("whatsapp_instances" as any)
        .select("wuzapi_token, jid")
        .eq("user_id", user.id)
        .single();
        
      if (data?.wuzapi_token) {
        setWuzapiToken(data.wuzapi_token);
        
        // Buscar a foto do Lead e do Corretor em background
        const corretorPhone = data.jid?.split('@')[0]?.split(':')[0];
        if (corretorPhone) {
          getWuzapiAvatar(data.wuzapi_token, corretorPhone)
            .then(url => { if (url) setAgentAvatar(url) })
            .catch(() => {});
        }
        
        const cleanLead = phoneNumber.replace(/\D/g, "");
        const leadPhone = cleanLead.startsWith("55") ? cleanLead : `55${cleanLead}`;
        getWuzapiAvatar(data.wuzapi_token, leadPhone)
          .then(url => { if (url) setLeadAvatar(url) })
          .catch(() => {});
      }
    };
    fetchToken();
  }, [phoneNumber]);

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        let encoded = reader.result?.toString() || "";
        // WuzAPI exige o prefixo inteiro: data:image/png;base64,...
        resolve(encoded);
      };
      reader.onerror = (error) => reject(error);
    });

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!newMessage.trim() && !attachment) || sending) return;
    if (!wuzapiToken) {
      toast.error("O WhatsApp do seu corretor não está conectado!");
      return;
    }

    setSending(true);
    const messageContent = newMessage;
    setNewMessage("");

    // GERAR ID PARA ATUALIZAÇÃO OTIMISTA
    const messageId = crypto.randomUUID();
    const optimisticMessage: Message = {
      id: messageId,
      lead_id: leadId,
      imobiliaria_id: imobiliariaId,
      conteudo: messageContent,
      direcao: "outbound",
      tipo: attachment ? attachment.type.split('/')[0] : "text",
      created_at: new Date().toISOString(),
      status: "pending",
    } as any;

    // Coloca na tela instantaneamente!
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      let finalConteudo = messageContent;
      let typeSent = "text";

      if (attachment) {
        const base64 = await toBase64(attachment);
        const type = attachment.type;
        const fileExt = attachment.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;

        // Salvar no bucket (ignora erro se o bucket não existir, apenas registra no DB sem link)
        const { data: storageData, error: storageError } = await supabase.storage
          .from('whatsapp_media')
          .upload(fileName, attachment);
          
        if (!storageError) {
          const { data: { publicUrl } } = supabase.storage.from('whatsapp_media').getPublicUrl(fileName);
          finalConteudo = `[Anexo]: ${publicUrl}\n${messageContent}`;
        } else {
          finalConteudo = `[Arquivo]: ${attachment.name}\n${messageContent}`;
        }

        // Limpa número
        const cleanTo = phoneNumber.replace(/\D/g, "");
        let finalTo = cleanTo.startsWith("55") ? cleanTo : `55${cleanTo}`;

        // Estratégia do Nono Dígito (Brasil)
        const phonesToCheck = [finalTo];
        if (finalTo.startsWith("55")) {
          if (finalTo.length === 13) {
            // Tem 9: checa sem o 9 (ex: 55 91 9 82935558 -> 55 91 82935558)
            const semNove = finalTo.substring(0, 4) + finalTo.substring(5);
            phonesToCheck.push(semNove);
          } else if (finalTo.length === 12) {
            // Não tem 9: checa com o 9 (ex: 55 91 81190130 -> 55 91 9 81190130)
            const comNove = finalTo.substring(0, 4) + "9" + finalTo.substring(4);
            phonesToCheck.push(comNove);
          }
        }

        const checkData = await checkWuzapiUser(wuzapiToken, phonesToCheck);
        const validUsers = checkData?.data?.Users || [];
        // Encontra o primeiro que está no WhatsApp
        const validUser = validUsers.find((u: any) => u.IsInWhatsapp);

        if (!validUser) {
          toast.error("Este número não está registrado no WhatsApp.");
          return;
        }

        // Usa o JID exato retornado pelo WhatsApp!
        const correctJid = validUser.JID;
        
        // A WUZAPI exige Mime Types específicos no prefixo, independente do arquivo real
        const pureBase64 = base64.includes(",") ? base64.split(",")[1] : base64;

        if (type.startsWith("image/")) {
           const finalBase64 = `data:image/png;base64,${pureBase64}`;
           await sendWuzapiImage(wuzapiToken, correctJid, finalBase64);
           typeSent = "image";
           if (messageContent) await sendWuzapiText(wuzapiToken, correctJid, messageContent);
        } else if (type.startsWith("audio/")) {
           const finalBase64 = `data:audio/ogg;base64,${pureBase64}`;
           await sendWuzapiAudio(wuzapiToken, correctJid, finalBase64);
           typeSent = "audio";
           if (messageContent) await sendWuzapiText(wuzapiToken, correctJid, messageContent);
        } else {
           const finalBase64 = `data:application/octet-stream;base64,${pureBase64}`;
           await sendWuzapiDocument(wuzapiToken, correctJid, finalBase64, attachment.name);
           typeSent = "document";
           if (messageContent) await sendWuzapiText(wuzapiToken, correctJid, messageContent);
        }
        
        setAttachment(null);
      } else {
        // Envia apenas o texto
        const cleanTo = phoneNumber.replace(/\D/g, "");
        let finalTo = cleanTo.startsWith("55") ? cleanTo : `55${cleanTo}`;

        const phonesToCheck = [finalTo];
        if (finalTo.startsWith("55")) {
          if (finalTo.length === 13) {
            const semNove = finalTo.substring(0, 4) + finalTo.substring(5);
            phonesToCheck.push(semNove);
          } else if (finalTo.length === 12) {
            const comNove = finalTo.substring(0, 4) + "9" + finalTo.substring(4);
            phonesToCheck.push(comNove);
          }
        }

        const checkData = await checkWuzapiUser(wuzapiToken, phonesToCheck);
        const validUsers = checkData?.data?.Users || [];
        const validUser = validUsers.find((u: any) => u.IsInWhatsapp);

        if (!validUser) {
          toast.error("Este número não está registrado no WhatsApp.");
          return;
        }

        await sendWuzapiText(wuzapiToken, validUser.JID, messageContent);
      }

      // 2. Salvar no banco (direção outbound)
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase.from("mensagens_whatsapp" as any).insert({
        id: messageId, // Usa o mesmo ID otimista
        lead_id: leadId,
        imobiliaria_id: imobiliariaId,
        corretor_id: user?.id,
        conteudo: finalConteudo,
        direcao: "outbound",
        tipo: typeSent,
        status: "sent",
      });

    } catch (error: any) {
      // Remove a mensagem otimista se der erro
      setMessages((prev) => prev.filter(m => m.id !== messageId));
      console.error("Erro no envio:", error);
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
    <div className="flex flex-col h-[55vh] min-h-[400px] max-h-[600px] bg-[#EFEAE2] rounded-xl border border-slate-200 overflow-hidden shadow-inner relative">
      {/* Background Pattern do WhatsApp */}
      <div 
        className="absolute inset-0 z-0 opacity-[0.06] pointer-events-none" 
        style={{ backgroundImage: 'url("https://w7.pngwing.com/pngs/353/128/png-transparent-whatsapp-pattern-design-art.png")', backgroundSize: '400px' }}
      />
      
      {/* Cabeçalho do Chat */}
      <div className="bg-[#F0F2F5] p-3 border-b border-[#D1D7DB] flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[#DFE5E7] flex items-center justify-center text-slate-500 overflow-hidden shrink-0 shadow-sm border border-black/5">
            {leadAvatar ? (
              <img src={leadAvatar} alt="Lead Avatar" className="h-full w-full object-cover" />
            ) : (
              <User className="h-6 w-6" />
            )}
          </div>
          <div>
            <p className="text-[15px] font-medium text-[#111B21]">{phoneNumber}</p>
            <div className="flex items-center gap-1.5 text-[13px] text-[#00A884]">
              <div className="h-2 w-2 bg-[#00A884] rounded-full mt-[1px]"></div>
              WhatsApp
            </div>
          </div>
        </div>
        
        {/* Foto do Corretor Conectado no Canto Direito */}
        {agentAvatar && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-400">Você</span>
            <div className="h-8 w-8 rounded-full bg-[#DFE5E7] overflow-hidden shrink-0 shadow-sm border border-black/5">
              <img src={agentAvatar} alt="Corretor" className="h-full w-full object-cover" />
            </div>
          </div>
        )}
      </div>

      {/* Área de Mensagens */}
      <div className="flex-1 p-4 z-10 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.2)_transparent]">
        <div className="space-y-2 pb-2">
          {messages.length === 0 && (
            <div className="text-center py-10 opacity-60 bg-[#FFEECD] text-[#54656F] rounded-lg p-4 mx-auto text-xs w-fit max-w-[80%] shadow-sm">
              <MessageSquare className="h-6 w-6 mx-auto mb-2 text-slate-400" />
              <p className="font-medium">As mensagens enviadas aparecerão aqui.</p>
            </div>
          )}
          
          {messages.map((msg) => {
            // Parser simples para extrair link de anexo se houver
            const hasAnexo = msg.conteudo?.includes('[Anexo]:');
            let contentText = msg.conteudo;
            let anexoUrl = '';
            
            if (hasAnexo) {
              const lines = msg.conteudo.split('\n');
              anexoUrl = lines[0].replace('[Anexo]: ', '').trim();
              contentText = lines.slice(1).join('\n');
            }

            return (
              <div
                key={msg.id}
                className={`flex ${msg.direcao === "outbound" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] p-2 px-3 rounded-lg text-[14px] shadow-[0_1px_0.5px_rgba(11,20,26,.13)] relative ${
                    msg.direcao === "outbound"
                      ? "bg-[#D9FDD3] text-[#111B21] rounded-tr-none"
                      : "bg-[#FFFFFF] text-[#111B21] rounded-tl-none"
                  }`}
                >
                  {hasAnexo && anexoUrl && (
                    <div className="mb-1 mt-1">
                      {anexoUrl.match(/\.(jpeg|jpg|gif|png)$/i) ? (
                        <img 
                          src={anexoUrl} 
                          alt="Anexo" 
                          className="rounded-md max-h-[250px] object-contain cursor-pointer hover:opacity-95" 
                          onClick={() => window.open(anexoUrl, '_blank')}
                          onLoad={() => {
                            scrollRef.current?.scrollIntoView({ behavior: "smooth" });
                          }}
                        />
                      ) : anexoUrl.match(/\.(ogg|mp3|wav|m4a)$/i) ? (
                        <audio src={anexoUrl} controls className="max-w-full my-1 focus:outline-none" />
                      ) : anexoUrl.match(/\.(mp4|webm|ogv|mov|3gp)$/i) ? (
                        <video 
                          src={anexoUrl} 
                          controls 
                          className="rounded-md max-h-[250px] max-w-full my-1 focus:outline-none"
                          onLoadedData={() => {
                            scrollRef.current?.scrollIntoView({ behavior: "smooth" });
                          }}
                        />
                      ) : (
                        <a href={anexoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-black/5 p-3 rounded-md hover:bg-black/10 transition-colors text-sm font-medium text-[#111B21]">
                          <Paperclip className="h-4 w-4 text-[#54656F]" /> Documento Anexo
                        </a>
                      )}
                    </div>
                  )}
                  <div className="flex items-end justify-between gap-3">
                    {contentText && <span className="leading-snug whitespace-pre-wrap">{contentText}</span>}
                    <div className="flex items-center text-[#667781] shrink-0 translate-y-[2px]">
                      <span className="text-[11px] whitespace-nowrap">
                        {format(new Date(msg.created_at), "HH:mm", { locale: ptBR })}
                      </span>
                      {msg.direcao === "outbound" && (
                        <span className="ml-1 flex items-center">
                          {msg.status === "pending" && <Clock className="h-[10px] w-[10px]" />}
                          {(msg.status === "sent" || !msg.status) && <Check className="h-[14px] w-[14px]" />}
                          {msg.status === "delivered" && <CheckCheck className="h-[14px] w-[14px]" />}
                          {msg.status === "read" && <CheckCheck className="h-[14px] w-[14px] text-[#53BDEB]" />}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={scrollRef} />
        </div>
      </div>

      {/* Input de Envio */}
      <div className="flex flex-col bg-[#F0F2F5] z-10 shrink-0 border-t border-[#D1D7DB]">
        {attachment && (
          <div className="px-4 pt-3 pb-1 flex items-center gap-2 bg-[#F0F2F5]">
            <div className="bg-[#E9EDEF] border border-[#D1D7DB] text-[#54656F] text-[13px] px-3 py-2 rounded-lg flex items-center gap-3 max-w-full shadow-sm">
              <Paperclip className="h-4 w-4 shrink-0" />
              <span className="truncate max-w-[200px] font-medium">{attachment.name}</span>
              <button onClick={() => setAttachment(null)} className="ml-2 p-1 hover:bg-[#D1D7DB] rounded-full transition-colors">
                <X className="h-3 w-3 text-[#54656F]" />
              </button>
            </div>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="px-4 py-3 flex gap-2 items-end">
          <input
            type="file"
            ref={fileInputRef}
            hidden
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                setAttachment(e.target.files[0]);
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 text-[#54656F] hover:bg-transparent hover:text-[#111B21] transition-colors"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
          >
            <Smile className="h-6 w-6" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 text-[#54656F] hover:bg-transparent hover:text-[#111B21] transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-6 w-6" />
          </Button>
          <div className="flex-1 bg-white rounded-lg border-none shadow-sm flex items-end relative">
            {showEmojiPicker && (
              <div ref={emojiPickerRef} className="absolute bottom-14 left-0 z-50">
                <EmojiPicker 
                  onEmojiClick={(emojiData: EmojiClickData) => {
                    setNewMessage((prev) => prev + emojiData.emoji);
                  }}
                  theme={Theme.LIGHT}
                  searchPlaceHolder="Buscar emoji..."
                  skinTonesDisabled
                  width={300}
                  height={400}
                />
              </div>
            )}
            <textarea
              placeholder={attachment ? "Adicione uma legenda..." : "Digite uma mensagem"}
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              rows={1}
              className="w-full resize-none bg-transparent py-2.5 px-4 max-h-[120px] text-[15px] focus:outline-none placeholder:text-[#8696A0] text-[#111B21]"
              disabled={sending}
            />
          </div>
          <Button 
            type="submit" 
            variant="ghost"
            size="icon" 
            className="h-10 w-10 shrink-0 text-[#54656F] hover:bg-transparent hover:text-[#111B21] transition-colors"
            disabled={(!newMessage.trim() && !attachment) || sending}
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin text-[#00A884]" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
