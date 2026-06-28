import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const payload = await req.json();
    console.log("Webhook received:", JSON.stringify(payload, null, 2));
    const eventName = payload.type || payload.event || payload.Event;
    
    // DEBUG: Remover ou comentar o insert bruto após estabilizar
    /*
    await supabase.from("mensagens_whatsapp").insert({
      lead_id: 'a542eb3b-9c84-481c-b072-cb0b482b2f5e',
      imobiliaria_id: 'edfdab57-b624-4715-957c-8c76a37c6c98',
      conteudo: 'RAW PAYLOAD: ' + eventName,
      direcao: 'inbound',
      metadata: payload
    });
    */
    
    if (eventName === "Message") {
      const msgEvent = payload.event;
      if (!msgEvent || !msgEvent.Info) {
        return new Response(JSON.stringify({ success: true, warning: "No msgEvent info" }), { headers: corsHeaders, status: 200 });
      }

      const info = msgEvent.Info;
      let text = "";
      let msgType = "text";
      
      if (msgEvent.Message) {
        text = msgEvent.Message.conversation || 
               (msgEvent.Message.extendedTextMessage && msgEvent.Message.extendedTextMessage.text) || 
               "";
               
        if (msgEvent.Message.imageMessage) {
          msgType = "image";
          const caption = msgEvent.Message.imageMessage.caption ? `\nLegenda: ${msgEvent.Message.imageMessage.caption}` : "";
          text = `📷 Imagem recebida (ver no WhatsApp)${caption}`;
        } else if (msgEvent.Message.audioMessage) {
          msgType = "audio";
          text = `🎵 Áudio recebido (ouvir no WhatsApp)`;
        } else if (msgEvent.Message.videoMessage) {
          msgType = "video";
          const caption = msgEvent.Message.videoMessage.caption ? `\nLegenda: ${msgEvent.Message.videoMessage.caption}` : "";
          text = `🎥 Vídeo recebido (ver no WhatsApp)${caption}`;
        } else if (msgEvent.Message.documentMessage) {
          msgType = "document";
          const filename = msgEvent.Message.documentMessage.fileName || "Anexo";
          text = `📎 Documento recebido: ${filename} (ver no WhatsApp)`;
        } else if (msgEvent.Message.stickerMessage) {
          msgType = "sticker";
          text = `✨ Figurinha recebida`;
        }
      }
      
      const isFromMe = info.IsFromMe;
      // Pegamos o SenderAlt que contém o número real de WhatsApp no formato 55XXXXXXXXXX@s.whatsapp.net
      // Se não tiver SenderAlt, tenta pegar do Sender (útil para números normais)
      const remoteJid = info.SenderAlt || info.Sender || info.Chat;
      const messageId = info.ID;
      
      if (!isFromMe && remoteJid) {
        // Extrair apenas os dígitos
        const cleanNumber = remoteJid.split("@")[0].split(":")[0];
        
        console.log(`Recebida mensagem inbound de ${cleanNumber}: ${text}`);

        // 1. Tentar encontrar o lead por telefone usando a RPC inteligente
        const { data: leads, error: searchError } = await supabase
          .rpc("buscar_lead_por_telefone", { telefone_busca: cleanNumber });

        if (searchError) {
          console.error("Erro ao buscar lead por telefone:", searchError);
        }

        if (leads && leads.length > 0) {
          const lead = leads[0];
          console.log(`Lead encontrado: ${lead.id}`);

          // Tentar baixar arquivos de mídia (imagem, áudio, vídeo, documento) se presentes
          let attachmentUrl = "";
          let finalType = "text";
          
          let mediaMessage = null;
          let downloadEndpoint = "";
          let originalFileName = "";
          let caption = "";

          if (msgEvent.Message.imageMessage) {
            mediaMessage = msgEvent.Message.imageMessage;
            downloadEndpoint = "/chat/downloadimage";
            finalType = "image";
            caption = mediaMessage.caption ? `\n${mediaMessage.caption}` : "";
          } else if (msgEvent.Message.documentMessage) {
            mediaMessage = msgEvent.Message.documentMessage;
            downloadEndpoint = "/chat/downloaddocument";
            finalType = "document";
            originalFileName = mediaMessage.fileName || mediaMessage.Filename || "documento.pdf";
            caption = mediaMessage.caption ? `\n${mediaMessage.caption}` : "";
          } else if (msgEvent.Message.audioMessage) {
            mediaMessage = msgEvent.Message.audioMessage;
            downloadEndpoint = "/chat/downloadaudio";
            finalType = "audio";
          } else if (msgEvent.Message.videoMessage) {
            mediaMessage = msgEvent.Message.videoMessage;
            downloadEndpoint = "/chat/downloadvideo";
            finalType = "video";
            caption = mediaMessage.caption ? `\n${mediaMessage.caption}` : "";
          }

          if (mediaMessage && downloadEndpoint) {
            try {
              // Buscar o corretor_id do lead
              const { data: leadDetail } = await supabase
                .from("leads")
                .select("corretor_id")
                .eq("id", lead.id)
                .single();

              let wuzapiToken = "";
              if (leadDetail?.corretor_id) {
                const { data: instance } = await supabase
                  .from("whatsapp_instances")
                  .select("wuzapi_token")
                  .eq("user_id", leadDetail.corretor_id)
                  .maybeSingle();
                if (instance) {
                  wuzapiToken = instance.wuzapi_token;
                }
              }

              if (wuzapiToken) {
                const downloadParams = {
                  Url: mediaMessage.URL || mediaMessage.url || mediaMessage.Url,
                  MediaKey: mediaMessage.mediaKey || mediaMessage.MediaKey,
                  Mimetype: mediaMessage.mimetype || mediaMessage.Mimetype,
                  FileSHA256: mediaMessage.fileSHA256 || mediaMessage.fileSha256 || mediaMessage.FileSHA256,
                  FileLength: Number(mediaMessage.fileLength || mediaMessage.FileLength || 0),
                  DirectPath: mediaMessage.directPath || mediaMessage.DirectPath,
                  FileEncSHA256: mediaMessage.fileEncSHA256 || mediaMessage.fileEncSha256 || mediaMessage.FileEncSHA256
                };

                const downloadRes = await fetch(`https://wuzap.inoovaweb.cloud${downloadEndpoint}`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "token": wuzapiToken
                  },
                  body: JSON.stringify(downloadParams)
                });

                const downloadJson = await downloadRes.json();
                if (downloadJson.success && downloadJson.data && downloadJson.data.Data) {
                  const base64String = downloadJson.data.Data;
                  const parts = base64String.split(",");
                  const base64Clean = parts[1] || parts[0];
                  const mimeType = downloadParams.Mimetype || "application/octet-stream";
                  let fileExt = mimeType.split("/")[1] || "bin";
                  if (fileExt.includes(";")) {
                    fileExt = fileExt.split(";")[0];
                  }
                  
                  if (mimeType.includes("audio/ogg") || fileExt === "ogg") {
                    fileExt = "ogg";
                  }

                  const safeFileName = originalFileName 
                    ? `${crypto.randomUUID()}_${originalFileName.replace(/[^a-zA-Z0-9.-]/g, "_")}`
                    : `${crypto.randomUUID()}.${fileExt}`;

                  // Converter base64 para Uint8Array no Deno
                  const fileBytes = Uint8Array.from(atob(base64Clean), c => c.charCodeAt(0));

                  // Enviar para o Storage do Supabase (bucket whatsapp_media)
                  const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('whatsapp_media')
                    .upload(safeFileName, fileBytes, {
                      contentType: mimeType,
                      upsert: true
                    });

                  if (!uploadError) {
                    const { data: urlData } = supabase.storage
                      .from('whatsapp_media')
                      .getPublicUrl(safeFileName);
                    attachmentUrl = urlData.publicUrl;
                    
                    if (finalType === "document") {
                      text = `[Anexo]: ${attachmentUrl}\n${originalFileName}${caption}`;
                    } else {
                      text = `[Anexo]: ${attachmentUrl}${caption}`;
                    }
                  } else {
                    console.error(`Erro ao subir ${finalType} no Storage:`, uploadError);
                  }
                } else {
                  console.error(`Erro ao baixar ${finalType} da Wuzapi:`, downloadJson);
                }
              }
            } catch (err) {
              console.error(`Erro no processamento de ${finalType} do WhatsApp:`, err);
            }
          }

          // 2. Inserir a mensagem no histórico do lead
          const { error: insertError } = await supabase.from("mensagens_whatsapp").insert({
            lead_id: lead.id,
            imobiliaria_id: lead.imobiliaria_id,
            conteudo: text,
            direcao: "inbound",
            status: "delivered", // mensagens recebidas já chegam delivered/read
            whatsapp_message_id: messageId,
            tipo: finalType,
            metadata: payload
          });

          if (insertError) {
            console.error("Erro ao inserir mensagem:", insertError);
          }
          
          // 3. Atualizar última ação do lead
          await supabase.from("leads").update({
            ultima_acao_at: new Date().toISOString()
          }).eq("id", lead.id);
        } else {
          console.log(`Nenhum lead encontrado para o telefone ${cleanNumber}`);
        }
      }
    }
    return new Response(JSON.stringify({
      success: true
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 200
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 400
    });
  }
});
