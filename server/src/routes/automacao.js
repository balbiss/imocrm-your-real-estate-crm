// Endpoint chamado pelo motor de follow-up no n8n. Auth por ?secret= (igual aos
// webhooks), NÃO por JWT -- o n8n não tem sessão de usuário. Recebe uma linha
// de followup_proximo_lote(), manda a mensagem pelo WhatsApp do corretor
// (WAHA/Baileys via providerFor), grava em mensagens_whatsapp com canal
// 'followup' e chama followup_registrar_envio pra avançar a sequência.
import { Router } from "express";
import { supabaseAdmin } from "../supabase.js";
import { providerFor } from "../whatsappProvider.js";
import { checkSecret } from "../lib/webhookSecret.js";
import { renderTemplate, primeiroNome } from "../lib/template.js";

export const automacaoRouter = Router();

automacaoRouter.post("/followup/enviar", async (req, res) => {
  if (!checkSecret(req, res)) return;

  try {
    const {
      execucao_id,
      lead_id,
      corretor_id,
      imobiliaria_id,
      telefone,
      telefone_alternativo,
      passo_ordem,
      conteudo,
      lead_nome,
      lead_origem,
      corretor_nome,
    } = req.body || {};

    if (!execucao_id || !lead_id || !corretor_id || !telefone || !conteudo) {
      return res.status(400).json({ error: "payload incompleto" });
    }

    // Instância do corretor dono do lead.
    const { data: instance } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("*")
      .eq("user_id", corretor_id)
      .maybeSingle();

    if (!instance?.phone_number || !instance.connected) {
      // Não é erro -- a execução fica pra próxima passada do motor.
      return res.json({ skipped: "sem_conexao" });
    }

    const provider = providerFor(instance);

    const texto = renderTemplate(conteudo, {
      nome: primeiroNome(lead_nome),
      corretor: corretor_nome || "",
      origem: lead_origem || "",
      bairro: "",
    });

    let jid = await provider.resolveJid(telefone);
    if (!jid && telefone_alternativo) {
      jid = await provider.resolveJid(telefone_alternativo);
    }
    if (!jid) {
      // Pode ser número fora do WhatsApp OU sessão WAHA momentaneamente fora do
      // ar. Não avança nem encerra -- tenta de novo na próxima passada.
      return res.json({ skipped: "jid_nao_resolvido" });
    }

    const result = await provider.sendMessage(jid, { text: texto });
    const messageId = result?.data?.key?.id || null;

    // Grava a mensagem no fio (mesmo padrão do webhook: upsert idempotente pelo
    // whatsapp_message_id). canal='followup' -> o chat mostra com selo 🤖 e o
    // followup_proximo_lote NÃO conta isso como "corretor assumiu".
    let mensagemWhatsappId = null;
    if (messageId) {
      const { data: msgRow } = await supabaseAdmin
        .from("mensagens_whatsapp")
        .upsert(
          {
            lead_id,
            imobiliaria_id: imobiliaria_id || null,
            corretor_id,
            conteudo: texto,
            direcao: "outbound",
            status: "sent",
            whatsapp_message_id: messageId,
            tipo: "text",
            canal: "followup",
            lida: true,
            metadata: { followup: true, passo: passo_ordem },
          },
          { onConflict: "whatsapp_message_id", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle();
      mensagemWhatsappId = msgRow?.id || null;
    }

    // Avança a sequência (registra followup_envios + agenda o próximo passo ou
    // conclui). Feito aqui no backend -- se o n8n cair depois do envio, não
    // re-manda na próxima passada.
    const { error: rpcError } = await supabaseAdmin.rpc("followup_registrar_envio", {
      p_execucao_id: execucao_id,
      p_whatsapp_message_id: messageId,
      p_conteudo: texto,
      p_mensagem_whatsapp_id: mensagemWhatsappId,
    });
    if (rpcError) {
      console.error("followup_registrar_envio falhou:", rpcError.message);
      return res.status(500).json({ error: "registro_falhou", detail: rpcError.message });
    }

    await supabaseAdmin
      .from("leads")
      .update({ ultima_acao_at: new Date().toISOString() })
      .eq("id", lead_id);

    res.json({ success: true, whatsapp_message_id: messageId });
  } catch (err) {
    console.error("Erro no envio de follow-up:", err);
    res.status(500).json({ error: err.message });
  }
});
