import { candidateDigits } from "./lib/phone.js";

// Cliente da REST do WAHA (https://waha.devlike.pro). Espelha, funcao a
// funcao, o baileysClient.js -- o whatsappProvider.js escolhe qual dos dois
// usar de acordo com whatsapp_instances.provider.
//
// Identificador da conexao aqui e' o NOME DA SESSAO (usamos o user_id do
// corretor), nao o telefone. O telefone so aparece pra montar chatId de
// destino (formato "<digits>@c.us").

const API_URL = (process.env.WAHA_API_URL || "").replace(/\/$/, "");
const API_KEY = process.env.WAHA_API_KEY;

// Sempre devolve "<digits>@c.us" -- tolera receber telefone puro, "@c.us" ou
// ate um jid "@s.whatsapp.net" (formato do baileys).
function digitsToChatId(phoneOrChatId) {
  const digits = String(phoneOrChatId).split("@")[0].replace(/\D/g, "");
  return `${digits}@c.us`;
}

async function request(path, { method = "GET", body, accept } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: accept || "application/json",
      "X-Api-Key": API_KEY,
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
    const message =
      data?.message || data?.error || text || `WAHA API respondeu ${res.status}`;
    const err = new Error(Array.isArray(message) ? message.join("; ") : message);
    err.status = res.status;
    throw err;
  }

  return data;
}

const WEBHOOK_EVENTS = ["session.status", "message"];

function sessionConfig(webhookUrl) {
  return {
    webhooks: [
      {
        url: webhookUrl,
        events: WEBHOOK_EVENTS,
        hmac: process.env.WEBHOOK_SECRET ? { key: process.env.WEBHOOK_SECRET } : null,
        retries: { policy: "linear", delaySeconds: 2, attempts: 5 },
      },
    ],
  };
}

// Cria (ou reconfigura) a sessao e liga. Idempotente: se a sessao ja existe,
// atualiza a config (webhook) e da start de novo.
export async function createConnection(sessionName, webhookUrl) {
  const config = sessionConfig(webhookUrl);
  try {
    return await request(`/api/sessions`, {
      method: "POST",
      body: { name: sessionName, start: true, config },
    });
  } catch (err) {
    // 422/409 = sessao ja existe -> atualiza config e garante start
    if (err.status === 422 || err.status === 409) {
      await request(`/api/sessions/${encodeURIComponent(sessionName)}`, {
        method: "PUT",
        body: { config },
      }).catch(() => {});
      return startConnection(sessionName);
    }
    throw err;
  }
}

export function startConnection(sessionName) {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/start`, {
    method: "POST",
  });
}

export function getSession(sessionName) {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}`);
}

// Desloga (remove a autenticacao/aparelho) mas mantem a sessao registrada.
export function logoutConnection(sessionName) {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/logout`, {
    method: "POST",
  });
}

// Apaga a sessao inteira (logout + stop + limpa dados).
export function deleteConnection(sessionName) {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}`, {
    method: "DELETE",
  });
}

// QR em base64 -> devolve data URL pronta pro <img src>. WAHA responde
// {mimetype, data} (data sem prefixo). Retorna null se a sessao nao estiver
// no estado de leitura de QR.
export async function getQrDataUrl(sessionName) {
  try {
    const data = await request(
      `/api/${encodeURIComponent(sessionName)}/auth/qr`,
      { accept: "application/json" }
    );
    if (data?.data) {
      const mime = data.mimetype || "image/png";
      return `data:${mime};base64,${data.data}`;
    }
    if (typeof data?.value === "string") return data.value;
    return null;
  } catch (err) {
    if (err.status === 404 || err.status === 422) return null; // nao esta pedindo QR
    throw err;
  }
}

// Confere nos dois formatos (com/sem nono digito) qual existe no WhatsApp.
export async function resolveJid(sessionName, targetPhoneOrChatId) {
  const candidates = candidateDigits(targetPhoneOrChatId);
  for (const digits of candidates) {
    try {
      const data = await request(
        `/api/checkNumberStatus?phone=${encodeURIComponent(digits)}&session=${encodeURIComponent(sessionName)}`
      );
      const exists = data?.numberExists ?? data?.exists ?? false;
      if (exists) {
        return data?.chatId || data?.jid || digitsToChatId(digits);
      }
    } catch {
      /* tenta o proximo candidato */
    }
  }
  return null;
}

// messageContent no MESMO shape que o backend ja monta pro baileys
// ({ text } | { image, caption } | { audio, ptt, mimetype } |
//  { video, caption, mimetype } | { document, fileName, mimetype, caption }),
// com os campos de midia em base64 puro. Traduz pro endpoint certo do WAHA.
export async function sendMessage(sessionName, chatId, messageContent) {
  const base = { session: sessionName, chatId: digitsToChatId(chatId) };

  if (messageContent.text != null && messageContent.image == null && messageContent.video == null && messageContent.audio == null && messageContent.document == null) {
    const result = await request(`/api/sendText`, {
      method: "POST",
      body: { ...base, text: messageContent.text || "" },
    });
    return normalizeSendResult(result);
  }

  if (messageContent.image) {
    const result = await request(`/api/sendImage`, {
      method: "POST",
      body: {
        ...base,
        file: { mimetype: messageContent.mimetype || "image/jpeg", data: messageContent.image, filename: messageContent.fileName || "imagem.jpg" },
        caption: messageContent.caption || undefined,
      },
    });
    return normalizeSendResult(result);
  }

  if (messageContent.audio) {
    const result = await request(`/api/sendVoice`, {
      method: "POST",
      body: {
        ...base,
        file: { mimetype: messageContent.mimetype || "audio/ogg; codecs=opus", data: messageContent.audio, filename: "audio.ogg" },
        convert: true,
      },
    });
    return normalizeSendResult(result);
  }

  if (messageContent.video) {
    const result = await request(`/api/sendVideo`, {
      method: "POST",
      body: {
        ...base,
        file: { mimetype: messageContent.mimetype || "video/mp4", data: messageContent.video, filename: messageContent.fileName || "video.mp4" },
        caption: messageContent.caption || undefined,
        convert: true,
      },
    });
    return normalizeSendResult(result);
  }

  // documento / fallback
  const result = await request(`/api/sendFile`, {
    method: "POST",
    body: {
      ...base,
      file: {
        mimetype: messageContent.mimetype || "application/octet-stream",
        data: messageContent.document,
        filename: messageContent.fileName || "arquivo",
      },
      caption: messageContent.caption || undefined,
    },
  });
  return normalizeSendResult(result);
}

// Devolve { data: { key: { id } } } pra bater com o formato que
// routes/whatsapp.js ja espera do baileys (result?.data?.key?.id).
function normalizeSendResult(result) {
  const id =
    result?.id?._serialized ||
    (typeof result?.id === "string" ? result.id : null) ||
    result?.key?.id ||
    result?._data?.id?._serialized ||
    null;
  return { data: { key: { id } } };
}

export async function sendPresence(sessionName, chatId, type = "composing") {
  const path = type === "paused" || type === "stopTyping" ? "/api/stopTyping" : "/api/startTyping";
  return request(path, {
    method: "POST",
    body: { session: sessionName, chatId: digitsToChatId(chatId) },
  }).catch(() => {});
}

export async function fetchProfilePictureUrl(sessionName, chatId) {
  try {
    const data = await request(
      `/api/contacts/profile-picture?contactId=${encodeURIComponent(digitsToChatId(chatId))}&session=${encodeURIComponent(sessionName)}`
    );
    return data?.profilePictureURL || data?.url || null;
  } catch {
    return null;
  }
}

// Baixa a midia bruta de uma mensagem recebida. No WAHA a URL vem pronta no
// payload do webhook (payload.media.url), hospedada pelo proprio WAHA.
export async function downloadMedia(mediaUrl) {
  const res = await fetch(mediaUrl, { headers: { "X-Api-Key": API_KEY } });
  if (!res.ok) throw new Error(`Falha ao baixar midia do WAHA (${res.status}): ${mediaUrl}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
