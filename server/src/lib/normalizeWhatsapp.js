// Normalizadores puros: traduzem o payload cru de cada engine (baileys /
// WAHA) pro MESMO formato interno que routes/webhook.js#processInboundMessage
// consome. Sem side-effects / sem imports de rede -- da pra testar isolado.
//
// Formato interno:
//   { sourceId, contactPhone, fromMe, pushName, isGroup,
//     reaction?: { targetId, emoji },
//     text,
//     media?: { tipo, mimetype, fileName, caption, ref },
//     raw }
//
// media.ref = id da mensagem (baileys, baixa via /media/:id) OU URL da midia
//             (waha, baixa direto da URL).
// Quando isGroup=true os demais campos podem faltar -- o chamador descarta.

export function normalizeBaileysMessage(msg) {
  const remoteJid = msg?.key?.remoteJid;
  const sourceId = msg?.key?.id;
  if (!remoteJid || !sourceId) return null;
  if (remoteJid.includes("@g.us")) return { isGroup: true };

  const remoteJidAlt = msg?.key?.remoteJidAlt;
  let contactPhone;
  if (remoteJid.includes("@s.whatsapp.net")) {
    contactPhone = remoteJid.split("@")[0];
  } else if (remoteJid.includes("@lid") && remoteJidAlt?.includes("@s.whatsapp.net")) {
    contactPhone = remoteJidAlt.split("@")[0];
  } else {
    contactPhone = remoteJid.split("@")[0];
  }

  const reactionMessage = msg?.message?.reactionMessage;
  const reaction = reactionMessage
    ? { targetId: reactionMessage.key?.id, emoji: reactionMessage.text ?? null }
    : null;

  const message = msg?.message || {};
  let media = null;
  if (message.imageMessage) media = { tipo: "image", info: message.imageMessage };
  else if (message.audioMessage) media = { tipo: "audio", info: message.audioMessage };
  else if (message.videoMessage) media = { tipo: "video", info: message.videoMessage };
  else if (message.documentMessage) media = { tipo: "document", info: message.documentMessage };
  else if (message.stickerMessage) media = { tipo: "sticker", info: message.stickerMessage };

  return {
    sourceId,
    contactPhone,
    fromMe: !!msg?.key?.fromMe,
    pushName: msg?.pushName,
    isGroup: false,
    reaction,
    text: message.conversation || message.extendedTextMessage?.text || "",
    media: media
      ? {
          tipo: media.tipo,
          mimetype: media.info?.mimetype || "application/octet-stream",
          fileName: media.info?.fileName || null,
          caption: media.info?.caption || null,
          ref: sourceId,
        }
      : null,
    raw: msg,
  };
}

export function normalizeWahaMessage(payload) {
  const sourceId = payload?.id;
  if (!sourceId) return null;

  const fromMe = !!payload.fromMe;
  const chatId = fromMe ? payload.to : payload.from;
  if (!chatId) return null;
  if (String(chatId).endsWith("@g.us")) return { isGroup: true };

  const contactPhone = String(chatId).split("@")[0].replace(/\D/g, "");

  let media = null;
  if (payload.hasMedia && payload.media?.url) {
    const mimetype =
      payload.media.mimetype || payload._data?.mimetype || "application/octet-stream";
    let tipo = "document";
    if (mimetype.startsWith("image/")) tipo = "image";
    else if (mimetype.startsWith("audio/")) tipo = "audio";
    else if (mimetype.startsWith("video/")) tipo = "video";
    else if (payload._data?.type === "sticker") tipo = "sticker";
    media = {
      tipo,
      mimetype,
      fileName: payload.media.filename || null,
      caption: payload.body || null,
      ref: payload.media.url,
    };
  }

  return {
    sourceId,
    contactPhone,
    fromMe,
    pushName: payload.notifyName || payload._data?.notifyName || null,
    isGroup: false,
    reaction: null,
    text: media ? "" : payload.body || "",
    media,
    raw: payload,
  };
}
