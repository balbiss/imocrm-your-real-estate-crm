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
      
      if (msgEvent.Message) {
        text = msgEvent.Message.conversation || 
               (msgEvent.Message.extendedTextMessage && msgEvent.Message.extendedTextMessage.text) || 
               "";
      }
      
      const isFromMe = info.IsFromMe;
      // Pegamos o SenderAlt que contém o número real de WhatsApp no formato 55XXXXXXXXXX@s.whatsapp.net
      // Se não tiver SenderAlt, tenta pegar do Sender (útil para números normais)
      const remoteJid = info.SenderAlt || info.Sender || info.Chat;
      const messageId = info.ID;
      
      if (text && !isFromMe && remoteJid) {
        // Extrair apenas os dígitos
        const cleanNumber = remoteJid.split("@")[0].split(":")[0];
        
        console.log(`Recebida mensagem inbound de ${cleanNumber}: ${text}`);

        // 1. Tentar encontrar o lead por telefone
        // O banco salva "9181190130" mas o cleanNumber pode vir como "559181190130"
        const { data: leads } = await supabase
          .from("leads")
          .select("id, imobiliaria_id")
          .or(`telefone.ilike.%${cleanNumber}%,telefone.ilike.%${cleanNumber.slice(2)}%`)
          .limit(1);

        if (leads && leads.length > 0) {
          const lead = leads[0];
          console.log(`Lead encontrado: ${lead.id}`);

          // 2. Inserir a mensagem no histórico do lead
          const { error: insertError } = await supabase.from("mensagens_whatsapp").insert({
            lead_id: lead.id,
            imobiliaria_id: lead.imobiliaria_id,
            conteudo: text,
            direcao: "inbound",
            status: "delivered", // mensagens recebidas já chegam delivered/read
            whatsapp_message_id: messageId,
            tipo: "text",
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
