import * as baileys from "./baileysClient.js";
import * as waha from "./wahaClient.js";
import { toJid } from "./lib/phone.js";

// Dado uma linha de whatsapp_instances, devolve um objeto com a mesma
// interface pros dois providers -- o resto do backend (routes/whatsapp.js e
// routes/webhook.js) nao precisa saber qual engine e'.
//
// baileys: identidade = phone_number (+E.164 e' montado dentro do client).
// waha:    identidade = session_name (= user_id do corretor).
export function providerFor(instance) {
  const kind = instance?.provider === "waha" ? "waha" : "baileys";

  if (kind === "waha") {
    const name = instance.session_name;
    return {
      kind,
      identity: name,
      createConnection: (webhookUrl) => waha.createConnection(name, webhookUrl),
      // "Desconectar" no WAHA = logout (mantem a sessao registrada).
      disconnect: () => waha.logoutConnection(name),
      // "Apagar" = delete completo.
      remove: () => waha.deleteConnection(name),
      resolveJid: (phone) => waha.resolveJid(name, phone),
      sendMessage: (jid, content) => waha.sendMessage(name, jid, content),
      fetchProfilePictureUrl: (jid) => waha.fetchProfilePictureUrl(name, jid),
      // WAHA nao empurra o QR em todo webhook -- da pra buscar sob demanda.
      liveStatus: () => waha.getSession(name),
      getQr: () => waha.getQrDataUrl(name),
      downloadMedia: (ref) => waha.downloadMedia(ref), // ref = URL da midia
    };
  }

  const phone = instance.phone_number;
  return {
    kind,
    identity: phone,
    createConnection: (webhookUrl) => baileys.createConnection(phone, webhookUrl),
    disconnect: () => baileys.deleteConnection(phone),
    remove: () => baileys.deleteConnection(phone),
    resolveJid: (target) => baileys.resolveJid(phone, target),
    sendMessage: (jid, content, options) => baileys.sendMessage(phone, jid, content, options),
    fetchProfilePictureUrl: (raw) => baileys.fetchProfilePictureUrl(phone, toJid(String(raw))),
    liveStatus: null, // baileys mantem o cache em whatsapp_instances via webhook
    getQr: null,
    downloadMedia: (ref) => baileys.downloadMedia(ref), // ref = id da mensagem
  };
}
