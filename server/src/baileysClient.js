import { candidateDigits, toJid } from "./lib/phone.js";

const API_URL = process.env.BAILEYS_API_URL;
const API_KEY = process.env.BAILEYS_API_KEY;

// O baileys-api exige o numero da conexao no formato E.164 com "+" na frente
// (ex: +5511999998888) — o resto do backend guarda so digitos.
function withPlus(phoneNumber) {
  const digits = String(phoneNumber).replace(/\D/g, "");
  return `+${digits}`;
}

async function request(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const message = data?.message || data?.error || text || `Baileys API respondeu ${res.status}`;
    throw new Error(message);
  }

  return data;
}

// Cria (ou reconecta) a sessao de um numero, registrando pra onde os eventos
// devem ser enviados (connection.update / messages.upsert).
export function createConnection(phoneNumber, webhookUrl) {
  return request(`/connections/${withPlus(phoneNumber)}`, {
    method: "POST",
    body: { webhookUrl, webhookVerifyToken: process.env.WEBHOOK_SECRET },
  });
}

export function deleteConnection(phoneNumber) {
  return request(`/connections/${withPlus(phoneNumber)}`, { method: "DELETE" });
}

// Confere nos dois formatos possiveis (com/sem nono digito) qual JID existe
// de fato no WhatsApp, igual o WhatsappBaileysService#resolve_jid do VisitaIA.
export async function resolveJid(ownerPhoneNumber, targetPhoneOrJid) {
  const jids = candidateDigits(targetPhoneOrJid).map(toJid);
  const data = await request(`/connections/${withPlus(ownerPhoneNumber)}/on-whatsapp`, {
    method: "POST",
    body: { jids },
  });
  const results = Array.isArray(data) ? data : data?.data || [];
  const found = results.find((r) => r?.exists);
  return found?.jid || null;
}

export function sendMessage(ownerPhoneNumber, jid, messageContent, options) {
  return request(`/connections/${withPlus(ownerPhoneNumber)}/send-message`, {
    method: "POST",
    body: options ? { jid, messageContent, options } : { jid, messageContent },
  });
}

export function sendPresence(ownerPhoneNumber, toJidValue, type = "composing") {
  return request(`/connections/${withPlus(ownerPhoneNumber)}/presence`, {
    method: "PATCH",
    body: { type, toJid: toJidValue },
  });
}

export function fetchProfilePictureUrl(ownerPhoneNumber, jid) {
  return request(
    `/connections/${withPlus(ownerPhoneNumber)}/profile-picture-url?jid=${encodeURIComponent(jid)}`
  ).then((data) => data?.data?.profilePictureUrl || null);
}

// Baixa a midia bruta (imagem/audio/video/documento) de uma mensagem recebida.
export async function downloadMedia(messageId) {
  const res = await fetch(`${API_URL}/media/${messageId}`, {
    headers: { "x-api-key": API_KEY },
  });
  if (!res.ok) throw new Error(`Falha ao baixar midia ${messageId}: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
