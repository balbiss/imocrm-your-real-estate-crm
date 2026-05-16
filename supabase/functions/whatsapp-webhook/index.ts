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

    // A estrutura do payload depende da API do Baileys utilizada
    // Geralmente: { event: "message.upsert", data: { ... } }
    const { event, data, phoneNumber } = payload;

    if (event === "messages.upsert" || event === "message.upsert") {
      const message = data.messages?.[0] || data;
      const remoteJid = message.key.remoteJid;
      const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
      const isFromMe = message.key.fromMe;

      if (text && !isFromMe) {
        // 1. Limpar o número do cliente (remoteJid vem algo como 5511999999999@s.whatsapp.net)
        const cleanNumber = remoteJid.split("@")[0];

        // 2. Tentar encontrar o lead por telefone
        // Procuramos por variações (com ou sem 55)
        const { data: leads } = await supabase
          .from("leads")
          .select("id, imobiliaria_id")
          .or(`telefone.ilike.%${cleanNumber}%,telefone.ilike.%${cleanNumber.slice(2)}%`)
          .limit(1);

        if (leads && leads.length > 0) {
          const lead = leads[0];

          // 3. Salvar a mensagem no histórico (direção inbound)
          await supabase.from("mensagens_whatsapp").insert({
            lead_id: lead.id,
            imobiliaria_id: lead.imobiliaria_id,
            conteudo: text,
            direcao: "inbound",
            whatsapp_message_id: message.key.id,
            metadata: message
          });

          // 4. Atualizar última ação do lead para ele subir no Kanban ou disparar alertas
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
