import { Router } from "express";
import { supabaseAdmin } from "../supabase.js";
import * as baileys from "../baileysClient.js";
import { uploadWhatsappMedia } from "../lib/media.js";

export const webhookRouter = Router();

function checkSecret(req, res) {
  if (req.query.secret !== process.env.WEBHOOK_SECRET) {
    res.status(401).json({ error: "Segredo do webhook invalido" });
    return false;
  }
  return true;
}

webhookRouter.post("/baileys", async (req, res) => {
  if (!checkSecret(req, res)) return;

  try {
    // O baileys-api manda {event, data, webhookVerifyToken, awaitResponse} direto
    // na raiz do body — sem nenhum wrapper "payload".
    const { event, data } = req.body || {};
    const phoneNumber = String(req.query.phone || "");

    if (event === "connection.update") {
      await handleConnectionUpdate(phoneNumber, data || {});
    } else if (event === "messages.upsert") {
      await handleMessagesUpsert(data || {});
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Erro no webhook do baileys:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

async function handleConnectionUpdate(phoneNumber, data) {
  if (!phoneNumber) return;

  const update = {};
  const qr = data.qrDataUrl || data.qr;
  if (qr) update.qr_code = qr;

  if (data.connection) {
    update.connected = data.connection === "open";
    if (update.connected) update.qr_code = null;
  }

  if (Object.keys(update).length === 0) return;

  const { error } = await supabaseAdmin
    .from("whatsapp_instances")
    .update(update)
    .eq("phone_number", phoneNumber);
  if (error) console.error("Erro ao atualizar whatsapp_instances no webhook:", error);
}

async function handleMessagesUpsert(data) {
  const messages = data.messages || [];

  for (const msg of messages) {
    await handleSingleMessage(msg).catch((e) =>
      console.error("Erro ao processar mensagem individual:", e)
    );
  }
}

async function handleSingleMessage(msg) {
  const remoteJid = msg?.key?.remoteJid;
  if (!remoteJid || remoteJid.includes("@g.us")) return; // ignora grupos
  if (msg?.key?.fromMe) return; // eco do que a gente mesmo mandou

  const remoteJidAlt = msg?.key?.remoteJidAlt;
  let contactPhone;
  if (remoteJid.includes("@s.whatsapp.net")) {
    contactPhone = remoteJid.split("@")[0];
  } else if (remoteJid.includes("@lid") && remoteJidAlt?.includes("@s.whatsapp.net")) {
    contactPhone = remoteJidAlt.split("@")[0];
  } else {
    contactPhone = remoteJid.split("@")[0];
  }

  const sourceId = msg?.key?.id;
  if (!sourceId) return;

  // Dedupe: se ja gravamos essa mensagem, nao faz nada.
  const { data: existing } = await supabaseAdmin
    .from("mensagens_whatsapp")
    .select("id")
    .eq("whatsapp_message_id", sourceId)
    .maybeSingle();
  if (existing) return;

  const { data: leads, error: searchError } = await supabaseAdmin.rpc(
    "buscar_lead_por_telefone",
    { telefone_busca: contactPhone }
  );
  if (searchError) {
    console.error("Erro ao buscar lead por telefone:", searchError);
    return;
  }
  if (!leads?.length) return;

  const lead = leads[0];

  let text =
    msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || "";
  let tipo = "text";
  let mediaInfo = null;

  const message = msg?.message || {};
  if (message.imageMessage) {
    tipo = "image";
    mediaInfo = message.imageMessage;
  } else if (message.audioMessage) {
    tipo = "audio";
    mediaInfo = message.audioMessage;
  } else if (message.videoMessage) {
    tipo = "video";
    mediaInfo = message.videoMessage;
  } else if (message.documentMessage) {
    tipo = "document";
    mediaInfo = message.documentMessage;
  } else if (message.stickerMessage) {
    tipo = "sticker";
    mediaInfo = message.stickerMessage;
  }

  if (mediaInfo) {
    try {
      const buffer = await baileys.downloadMedia(sourceId);
      const mimetype = mediaInfo.mimetype || "application/octet-stream";
      const fileName = mediaInfo.fileName || null;
      const url = await uploadWhatsappMedia(buffer, mimetype, fileName);

      const caption = mediaInfo.caption ? `\n${mediaInfo.caption}` : "";
      text = tipo === "document" ? `[Anexo]: ${url}\n${fileName || ""}${caption}` : `[Anexo]: ${url}${caption}`;
    } catch (e) {
      console.error(`Erro ao baixar midia ${tipo} da mensagem ${sourceId}:`, e.message);
      text = text || "📎 Arquivo não pôde ser baixado";
    }
  }

  if (!text) text = "📎 Arquivo não suportado ou vazio";

  const { error: insertError } = await supabaseAdmin.from("mensagens_whatsapp").insert({
    lead_id: lead.id,
    imobiliaria_id: lead.imobiliaria_id,
    conteudo: text,
    direcao: "inbound",
    status: "delivered",
    whatsapp_message_id: sourceId,
    tipo,
    metadata: msg,
  });
  if (insertError) console.error("Erro ao inserir mensagem:", insertError);

  await supabaseAdmin
    .from("leads")
    .update({ ultima_acao_at: new Date().toISOString() })
    .eq("id", lead.id);
}
