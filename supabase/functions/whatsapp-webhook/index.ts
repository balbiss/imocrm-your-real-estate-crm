import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const payload = await req.json();
    console.log("Webhook received:", JSON.stringify(payload, null, 2));

    // Suporte para Evolution API e Baileys API
    const event = payload.event || payload.type;
    const data = payload.data || payload;
    
    if (event === "messages.upsert" || event === "MESSAGES_UPSERT" || event === "message.upsert") {
      const message = data.messages?.[0] || data;
      
      // Evolution API pode mandar o remoteJid em lugares diferentes
      const remoteJid = message.key?.remoteJid || message.remoteJid;
      const text = message.message?.conversation || 
                   message.message?.extendedTextMessage?.text || 
                   message.text || 
                   message.content ||
                   "";
      const isFromMe = message.key?.fromMe || message.fromMe || false;

      if (text && !isFromMe && remoteJid) {
        // 1. Limpar o número do cliente
        const cleanNumber = remoteJid.split("@")[0];

        // 2. Tentar encontrar o lead por telefone
        const { data: leads } = await supabase
          .from("leads")
          .select("id, imobiliaria_id")
          .or(`telefone.ilike.%${cleanNumber}%,telefone.ilike.%${cleanNumber.slice(2)}%`)
          .limit(1);

        if (leads && leads.length > 0) {
          const lead = leads[0];

          // 3. Salvar a mensagem no histórico
          await supabase.from("mensagens_whatsapp").insert({
            lead_id: lead.id,
            imobiliaria_id: lead.imobiliaria_id,
            conteudo: text,
            direcao: "inbound",
            whatsapp_message_id: message.key?.id || message.id,
            metadata: message
          });

          // 4. Atualizar última ação do lead
          await supabase.from("leads").update({
            ultima_acao_at: new Date().toISOString()
          }).eq("id", lead.id);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
