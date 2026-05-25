// src/lib/wuzapi.ts
import { supabase } from "@/integrations/supabase/client";

// Interfaces
export interface WuzapiUser {
  id: string;
  name: string;
  token: string;
  webhook?: string;
  events?: string;
}

/**
 * Função helper interna para chamar o nosso proxy no Supabase.
 */
async function invokeProxy(method: string, path: string, payload?: any, userToken?: string) {
  const headers: Record<string, string> = {};
  if (userToken) {
    headers["wuzapi-token"] = userToken;
  }

  const { data, error } = await supabase.functions.invoke("wuzapi-proxy", {
    method: "POST", // supabase.functions.invoke usa POST para a função Deno
    headers,
    body: {
      method,
      path,
      payload,
    },
  });

  if (error) {
    throw new Error(error.message || "Erro de rede ao chamar proxy WUZAPI");
  }

  // O proxy retorna os erros da WUZAPI mantendo o padrão da API original
  if (!data.success) {
    throw new Error(data.details || data.error || "Erro na operação da WUZAPI");
  }

  return data;
}

/**
 * Cria um usuário no WUZAPI para obter um Token Pessoal.
 * Endpoint: POST /admin/users
 */
export async function createWuzapiUser(name: string): Promise<WuzapiUser> {
  const tokenForUser = "tk_" + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);

  const response = await invokeProxy("POST", "/admin/users", {
    name: name,
    token: tokenForUser,
  });

  return response.data; // Retorna o usuário criado (id, name, token)
}

/**
 * Inicia a sessão no WUZAPI. Se não estiver conectado, ele habilita a geração de QR.
 * Endpoint: POST /session/connect
 */
export async function connectWuzapiSession(userToken: string): Promise<any> {
  const response = await invokeProxy("POST", "/session/connect", {
    Events: ["Message", "ReadReceipt", "Presence", "HistorySync", "ChatPresence"],
    Immediate: true // Não espera os 10s para retornar
  }, userToken);

  return response.data;
}

/**
 * Retorna o QR Code base64 para scan.
 * Endpoint: GET /session/qr
 */
export async function getWuzapiQR(userToken: string): Promise<string | null> {
  const response = await invokeProxy("GET", "/session/qr", undefined, userToken);
  return response.data?.QRCode || null;
}

/**
 * Verifica o status da conexão.
 * Endpoint: GET /session/status
 */
export async function getWuzapiStatus(userToken: string): Promise<{ connected: boolean, loggedIn: boolean, jid?: string }> {
  const response = await invokeProxy("GET", "/session/status", undefined, userToken);
  // Garante que funciona independente se a API retornar maiúsculo ou minúsculo
  return {
    connected: response.data?.connected || response.data?.Connected || false,
    loggedIn: response.data?.loggedIn || response.data?.LoggedIn || false,
    jid: response.data?.jid || response.data?.Jid
  };
}

/**
 * Desconecta a sessão do WhatsApp no WUZAPI
 * Endpoint: POST /session/disconnect
 */
export async function disconnectWuzapiSession(userToken: string): Promise<void> {
  await invokeProxy("POST", "/session/disconnect", undefined, userToken);
}

/**
 * Remove completamente um usuário do WUZAPI, limpando da memória e desconectando do celular
 * Endpoint: DELETE /admin/users/{id}/full
 */
export async function deleteWuzapiUserFull(wuzapiUserId: string): Promise<void> {
  // A Edge Function injeta o Authorization do Admin na rota /admin automaticamente
  await invokeProxy("DELETE", `/admin/users/${wuzapiUserId}/full`);
}

export async function getWuzapiAvatar(userToken: string, jid: string): Promise<string | null> {
  try {
    const phone = jid.split('@')[0].split(':')[0];
    const response = await invokeProxy("POST", "/user/avatar", {
      Phone: phone,
      Preview: true
    }, userToken);

    return response.data?.url || response.data?.URL || null;
  } catch (error) {
    console.warn("Error fetching Wuzapi avatar:", error);
    return null;
  }
}

/**
 * Desloga (encerra a sessão exigindo novo QR Code no futuro).
 * Endpoint: POST /session/logout
 */
export async function logoutWuzapiSession(userToken: string): Promise<void> {
  await invokeProxy("POST", "/session/logout", undefined, userToken);
}

// ============================================
// WUZAPI WEBHOOK ENDPOINTS
// ============================================

export async function setWuzapiWebhook(userToken: string, webhookUrl: string) {
  return await invokeProxy("PUT", "/webhook", {
    WebhookURL: webhookUrl,
    Events: ["Message"],
    active: true
  }, userToken);
}

// ============================================
// WUZAPI SEND ENDPOINTS
// ============================================

export async function sendWuzapiText(userToken: string, phone: string, text: string) {
  return await invokeProxy("POST", "/chat/send/text", {
    Phone: phone,
    Body: text
  }, userToken);
}

export async function sendWuzapiImage(userToken: string, phone: string, base64Image: string) {
  return await invokeProxy("POST", "/chat/send/image", {
    Phone: phone,
    Image: base64Image
  }, userToken);
}

export async function sendWuzapiDocument(userToken: string, phone: string, base64Doc: string, fileName: string) {
  return await invokeProxy("POST", "/chat/send/document", {
    Phone: phone,
    Document: base64Doc,
    FileName: fileName
  }, userToken);
}

export async function checkWuzapiUser(userToken: string, phones: string[]) {
  return await invokeProxy("POST", "/user/check", {
    Phone: phones
  }, userToken);
}


export async function sendWuzapiAudio(userToken: string, phone: string, base64Audio: string) {
  return await invokeProxy("POST", "/chat/send/audio", {
    Phone: phone,
    Audio: base64Audio
  }, userToken);
}
