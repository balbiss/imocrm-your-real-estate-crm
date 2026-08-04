import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Paperclip, Check, CheckCheck, Clock, X, Smile, User, Loader2, MessageSquare, FileText } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { getWhatsappAvatar, getWhatsappStatus, sendWhatsappMessage } from "@/lib/baileys";

interface Message {
  id: string;
  created_at: string;
  conteudo: string;
  direcao: "inbound" | "outbound";
  tipo: string;
  status?: string;
  metadata?: any;
}

interface WhatsAppChatProps {
  leadId: string;
  imobiliariaId: string;
  phoneNumber: string;
  leadName?: string | null;
  fullHeight?: boolean;
  onHeaderClick?: () => void;
}

interface Template {
  id: string;
  titulo: string;
  conteudo: string;
  anexo_url: string | null;
  anexo_tipo: string | null;
  anexo_nome: string | null;
  anexos?: { url: string; tipo: string; nome: string }[] | null;
}

function anexosDoTemplate(t: Template) {
  if (t.anexos?.length) return t.anexos;
  if (t.anexo_url) return [{ url: t.anexo_url, tipo: t.anexo_tipo || "documento", nome: t.anexo_nome || "anexo" }];
  return [];
}

export function WhatsAppChat({ leadId, imobiliariaId, phoneNumber, leadName, fullHeight, onHeaderClick }: WhatsAppChatProps) {
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

  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [leadAvatar, setLeadAvatar] = useState<string | null>(null);
  const [agentAvatar, setAgentAvatar] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [imagemAberta, setImagemAberta] = useState<string | null>(null);
  const [respondendoA, setRespondendoA] = useState<Message | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);

  // Fecha o emoji picker / mensagens prontas ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (templatesRef.current && !templatesRef.current.contains(event.target as Node)) {
        setShowTemplates(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Carrega as mensagens prontas (templates) da imobiliária
  useEffect(() => {
    const fetchTemplates = async () => {
      const { data, error } = await supabase
        .from("templates_mensagem")
        .select("id, titulo, conteudo, anexo_url, anexo_tipo, anexo_nome, anexos")
        .eq("imobiliaria_id", imobiliariaId)
        .eq("tipo", "whatsapp")
        .order("titulo", { ascending: true });
      if (!error) setTemplates((data || []) as Template[]);
    };
    if (imobiliariaId) fetchTemplates();
  }, [imobiliariaId]);

  // Busca o status de conexão do WhatsApp do usuário logado
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await getWhatsappStatus();
        setWhatsappConnected(!!data.connected);
        if (!data.connected) return;

        // Buscar a foto do Lead e do Corretor em background
        // (data.jid quase nunca vem preenchido — usa o proprio numero conectado)
        if (data.phoneNumber) {
          getWhatsappAvatar(data.phoneNumber)
            .then(url => { if (url) setAgentAvatar(url) })
            .catch(() => {});
        }

        const cleanLead = phoneNumber.replace(/\D/g, "");
        const leadPhone = cleanLead.startsWith("55") ? cleanLead : `55${cleanLead}`;
        getWhatsappAvatar(leadPhone)
          .then(url => { if (url) setLeadAvatar(url) })
          .catch(() => {});
      } catch (e) {
        console.error("Erro ao buscar status do WhatsApp:", e);
      }
    };
    fetchStatus();
  }, [phoneNumber]);

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        let encoded = reader.result?.toString() || "";
        resolve(encoded);
      };
      reader.onerror = (error) => reject(error);
    });

  // Template com mais de um anexo não cabe no modelo de "1 mensagem = 1
  // anexo" desse chat — manda cada anexo como uma mensagem separada em
  // sequência (texto do template vira legenda só da primeira), em vez de
  // só popular a caixa de digitação como no caso de anexo único.
  const enviarTemplateComMultiplosAnexos = async (anexos: { url: string; tipo: string; nome: string }[], texto: string) => {
    if (!whatsappConnected) {
      toast.error("O WhatsApp do seu corretor não está conectado!");
      return;
    }
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    let falhas = 0;
    for (let i = 0; i < anexos.length; i++) {
      const anexo = anexos[i];
      try {
        const res = await fetch(anexo.url);
        const blob = await res.blob();
        const file = new File([blob], anexo.nome || "anexo", { type: blob.type });
        const base64 = await toBase64(file);
        const legenda = i === 0 ? texto : "";

        const result = await sendWhatsappMessage(phoneNumber, legenda, {
          base64,
          mimetype: blob.type,
          fileName: anexo.nome,
        });

        await supabase.from("mensagens_whatsapp" as any).insert({
          id: crypto.randomUUID(),
          lead_id: leadId,
          imobiliaria_id: imobiliariaId,
          corretor_id: user?.id,
          conteudo: `[Anexo]: ${anexo.url}${legenda ? `\n${legenda}` : ""}`,
          whatsapp_message_id: result?.messageId || null,
          direcao: "outbound",
          tipo: anexo.tipo === "imagem" ? "image" : anexo.tipo === "video" ? "video" : "document",
          status: "sent",
        });
      } catch (err) {
        console.error("Erro ao enviar anexo do template:", err);
        falhas++;
      }
    }
    setSending(false);
    if (falhas === 0) {
      toast.success(`${anexos.length} anexos enviados!`);
    } else {
      toast.error(`${falhas} de ${anexos.length} anexos falharam ao enviar.`);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!newMessage.trim() && !attachment) || sending) return;
    if (!whatsappConnected) {
      toast.error("O WhatsApp do seu corretor não está conectado!");
      return;
    }

    setSending(true);
    const messageContent = newMessage;
    const pendingAttachment = attachment;
    // Só dá pra citar nativamente mensagem que RECEBEMOS — é a única que
    // guarda o objeto bruto do Baileys inteiro (metadata) que a citação
    // precisa. Responder mensagem nossa mostra o contexto só na tela do CRM.
    const quoted = respondendoA?.direcao === "inbound" ? respondendoA.metadata : undefined;
    setNewMessage("");
    setAttachment(null);
    setRespondendoA(null);

    const messageId = crypto.randomUUID();

    try {
      let finalConteudo = messageContent;
      let typeSent = "text";
      let base64: string | null = null;
      let mimetype = "";

      // Sobe o anexo (se tiver) ANTES de mostrar a bolha otimista, pra ela ja
      // nascer com a miniatura/link certos em vez de so o texto da legenda.
      if (pendingAttachment) {
        base64 = await toBase64(pendingAttachment);
        mimetype = pendingAttachment.type;
        const fileExt = pendingAttachment.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;

        const { error: storageError } = await supabase.storage
          .from('whatsapp_media')
          .upload(fileName, pendingAttachment);

        if (!storageError) {
          const { data: { publicUrl } } = supabase.storage.from('whatsapp_media').getPublicUrl(fileName);
          finalConteudo = `[Anexo]: ${publicUrl}${messageContent ? `\n${messageContent}` : ""}`;
        } else {
          finalConteudo = `[Arquivo]: ${pendingAttachment.name}${messageContent ? `\n${messageContent}` : ""}`;
        }

        typeSent = mimetype.startsWith("image/") ? "image" : mimetype.startsWith("audio/") ? "audio" : "document";
      }

      // Coloca na tela instantaneamente, ja com o conteudo final (inclusive anexo)
      const optimisticMessage: Message = {
        id: messageId,
        lead_id: leadId,
        imobiliaria_id: imobiliariaId,
        conteudo: finalConteudo,
        direcao: "outbound",
        tipo: typeSent,
        created_at: new Date().toISOString(),
        status: "pending",
      } as any;
      setMessages((prev) => [...prev, optimisticMessage]);

      let whatsappMessageId: string | null = null;
      if (pendingAttachment && base64) {
        // O backend resolve o JID certo (com/sem nono dígito) e envia via baileys-api
        const result = await sendWhatsappMessage(phoneNumber, messageContent, {
          base64,
          mimetype,
          fileName: pendingAttachment.name,
        }, quoted);
        whatsappMessageId = result?.messageId || null;
      } else {
        // Envia apenas o texto — o backend resolve o JID e faz o envio
        const result = await sendWhatsappMessage(phoneNumber, messageContent, undefined, quoted);
        whatsappMessageId = result?.messageId || null;
      }

      // 2. Salvar no banco (direção outbound)
      const { data: { user } } = await supabase.auth.getUser();

      // upsert com ignoreDuplicates em vez de insert: o webhook do baileys
      // recebe o eco (fromMe=true) dessa mesma mensagem e pode gravar ela
      // primeiro (corrida real, confirmado em produção — 178 mensagens
      // duplicadas entre 01/08 e 03/08). Com o índice único parcial em
      // whatsapp_message_id, quem chegar depois vira no-op em vez de duplicar
      // (ou, sem isso, um insert comum daria erro e derrubaria a bolha otimista
      // mesmo a mensagem já tendo sido enviada com sucesso).
      await supabase.from("mensagens_whatsapp" as any).upsert(
        {
          id: messageId, // Usa o mesmo ID otimista
          lead_id: leadId,
          imobiliaria_id: imobiliariaId,
          corretor_id: user?.id,
          conteudo: finalConteudo,
          // Guarda o id real do Baileys pra o webhook reconhecer o eco dessa
          // mesma mensagem (fromMe=true) e nao duplicar — sem isso nao dava
          // pra distinguir "eco do que o CRM mandou" de "mensagem mandada
          // direto do celular", e ficava tudo bloqueado.
          whatsapp_message_id: whatsappMessageId,
          direcao: "outbound",
          tipo: typeSent,
          status: "sent",
        },
        { onConflict: "whatsapp_message_id", ignoreDuplicates: true }
      );

    } catch (error: any) {
      // Remove a mensagem otimista se der erro
      setMessages((prev) => prev.filter(m => m.id !== messageId));
      console.error("Erro no envio:", error);
      toast.error(`Falha ao enviar: ${error.message}`);
      setNewMessage(messageContent); // Devolve o texto se falhar
      if (pendingAttachment) setAttachment(pendingAttachment); // Devolve o anexo tambem
      if (quoted) setRespondendoA(respondendoA); // Devolve a citação tambem
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center text-slate-400 ${fullHeight ? "h-full" : "h-[400px]"}`}>
        <Loader2 className="h-8 w-8 animate-spin mb-2" />
        <p className="text-sm">Carregando conversa...</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col bg-[#EFEAE2] rounded-xl border border-slate-200 overflow-hidden shadow-inner relative ${fullHeight ? "h-full" : "h-[55vh] min-h-[400px] max-h-[600px]"}`}>
      {/* Background Pattern do WhatsApp */}
      <div 
        className="absolute inset-0 z-0 opacity-[0.06] pointer-events-none" 
        style={{ backgroundImage: 'url("https://w7.pngwing.com/pngs/353/128/png-transparent-whatsapp-pattern-design-art.png")', backgroundSize: '400px' }}
      />
      
      {/* Cabeçalho do Chat */}
      <div className="bg-[#F0F2F5] p-3 border-b border-[#D1D7DB] flex items-center justify-between z-10">
        <div
          className={`flex items-center gap-3 ${onHeaderClick ? "cursor-pointer" : ""}`}
          onClick={onHeaderClick}
        >
          <div className="h-10 w-10 rounded-full bg-[#DFE5E7] flex items-center justify-center text-slate-500 overflow-hidden shrink-0 shadow-sm border border-black/5">
            {leadAvatar ? (
              <img src={leadAvatar} alt="Lead Avatar" className="h-full w-full object-cover" />
            ) : (
              <User className="h-6 w-6" />
            )}
          </div>
          <div>
            <p className="text-[15px] font-medium text-[#111B21]">{leadName || phoneNumber}</p>
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

            const reacao = (msg as any).metadata?.reacao as string | null | undefined;

            const botaoResponder = (
              <button
                type="button"
                title="Responder"
                onClick={() => setRespondendoA(msg)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-[#54656F] hover:text-[#111B21] shrink-0"
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            );

            return (
              <div
                key={msg.id}
                className={`group flex items-center gap-1.5 ${msg.direcao === "outbound" ? "justify-end" : "justify-start"}`}
              >
                {msg.direcao === "outbound" && botaoResponder}
                <div className="relative max-w-[75%]">
                {reacao && (
                  <div className="absolute -bottom-2.5 right-1 bg-white rounded-full shadow border border-slate-100 text-[13px] leading-none px-1 py-0.5 z-10">
                    {reacao}
                  </div>
                )}
                <div
                  className={`p-2 px-3 rounded-lg text-[14px] shadow-[0_1px_0.5px_rgba(11,20,26,.13)] relative ${
                    msg.direcao === "outbound"
                      ? "bg-[#D9FDD3] text-[#111B21] rounded-tr-none"
                      : "bg-[#FFFFFF] text-[#111B21] rounded-tl-none"
                  }`}
                >
                  {hasAnexo && anexoUrl && (
                    <div className="mb-1 mt-1">
                      {(msg as any).tipo === "sticker" ? (
                        <img
                          src={anexoUrl}
                          alt="Figurinha"
                          className="max-h-[120px] max-w-[120px] object-contain cursor-pointer hover:opacity-90"
                          onClick={() => setImagemAberta(anexoUrl)}
                          onLoad={() => scrollRef.current?.scrollIntoView({ behavior: "smooth" })}
                        />
                      ) : (msg as any).tipo === "image" || anexoUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                        <img
                          src={anexoUrl}
                          alt="Anexo"
                          className="rounded-md max-h-[250px] object-contain cursor-pointer hover:opacity-95"
                          onClick={() => setImagemAberta(anexoUrl)}
                          onLoad={() => scrollRef.current?.scrollIntoView({ behavior: "smooth" })}
                        />
                      ) : (msg as any).tipo === "audio" || anexoUrl.match(/\.(ogg|mp3|wav|m4a)$/i) ? (
                        <audio src={anexoUrl} controls className="max-w-full my-1 focus:outline-none" />
                      ) : (msg as any).tipo === "video" || anexoUrl.match(/\.(mp4|webm|ogv|mov|3gp)$/i) ? (
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
                {msg.direcao === "inbound" && botaoResponder}
              </div>
            );
          })}
          <div ref={scrollRef} />
        </div>
      </div>

      {/* Input de Envio */}
      <div className="flex flex-col bg-[#F0F2F5] z-10 shrink-0 border-t border-[#D1D7DB]">
        {respondendoA && (
          <div className="px-4 pt-3 pb-1 flex items-center gap-2 bg-[#F0F2F5]">
            <div className="flex-1 min-w-0 bg-[#E9EDEF] border-l-4 border-[#00A884] text-[13px] px-3 py-1.5 rounded-md flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[#00A884] font-bold text-[11px]">Respondendo</p>
                <p className="truncate text-[#54656F]">{respondendoA.conteudo}</p>
              </div>
              <button onClick={() => setRespondendoA(null)} className="p-1 hover:bg-[#D1D7DB] rounded-full transition-colors shrink-0">
                <X className="h-3.5 w-3.5 text-[#54656F]" />
              </button>
            </div>
          </div>
        )}
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
          <div className="relative shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-[#54656F] hover:bg-transparent hover:text-[#111B21] transition-colors"
              onClick={() => setShowTemplates((prev) => !prev)}
              title="Mensagens prontas"
            >
              <FileText className="h-6 w-6" />
            </Button>
            {showTemplates && (
              <div ref={templatesRef} className="absolute bottom-14 left-0 z-50 w-72 max-h-80 overflow-y-auto bg-white rounded-lg shadow-lg border border-slate-200">
                {templates.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400 text-center">
                    Nenhuma mensagem pronta cadastrada. Crie em "Templates" no menu.
                  </p>
                ) : (
                  templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="w-full text-left px-3 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                      onClick={async () => {
                        const primeiroNome = (leadName || "").trim().split(/\s+/)[0] || "";
                        const conteudoPersonalizado = t.conteudo.replace(/\{nome\}/gi, primeiroNome);
                        const anexos = anexosDoTemplate(t);
                        setShowTemplates(false);

                        if (anexos.length > 1) {
                          // Vários anexos: manda tudo direto em sequência
                          // (não dá pra pré-visualizar múltiplos na caixa
                          // de digitação como acontece com só 1 anexo).
                          await enviarTemplateComMultiplosAnexos(anexos, conteudoPersonalizado);
                          return;
                        }

                        setNewMessage((prev) => (prev ? `${prev}\n${conteudoPersonalizado}` : conteudoPersonalizado));
                        if (anexos[0]) {
                          try {
                            const res = await fetch(anexos[0].url);
                            const blob = await res.blob();
                            setAttachment(new File([blob], anexos[0].nome || "anexo", { type: blob.type }));
                          } catch {
                            toast.error("Não consegui carregar o anexo do template.");
                          }
                        }
                      }}
                    >
                      <p className="text-xs font-bold text-slate-700">{t.titulo}</p>
                      <p className="text-xs text-slate-500 truncate">{t.conteudo}</p>
                      {anexosDoTemplate(t).length > 0 && (
                        <p className="text-[10px] text-primary/70 truncate mt-0.5">
                          📎 {anexosDoTemplate(t).length > 1 ? `${anexosDoTemplate(t).length} anexos` : anexosDoTemplate(t)[0].nome}
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
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
                const value = e.target.value;
                if (value === "/") {
                  setShowTemplates(true);
                  setNewMessage("");
                } else {
                  setNewMessage(value);
                }
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

      {imagemAberta && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setImagemAberta(null)}
        >
          <img src={imagemAberta} alt="Visualização ampliada" className="max-h-full max-w-full object-contain rounded-md" />
          <button
            onClick={() => setImagemAberta(null)}
            className="absolute top-4 right-4 h-9 w-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
