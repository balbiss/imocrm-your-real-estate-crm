// src/lib/baileys.ts
// Cliente do backend dedicado (Node/Express) que fala com o baileys-api.
// Substitui o antigo src/lib/wuzapi.ts + as Edge Functions wuzapi-proxy/whatsapp-webhook.
import { supabase } from "@/integrations/supabase/client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || process.env.BACKEND_URL || "";

export type WhatsappProvider = "baileys" | "waha";

export interface WhatsappStatus {
  hasInstance: boolean;
  provider?: WhatsappProvider;
  connected?: boolean;
  jid?: string | null;
  qrCode?: string | null;
  phoneNumber?: string | null;
  // API oficial do usuário (ligada pelo dono/gerente). Com ela ativa dá pra conversar pelo chat
  // mesmo sem a não oficial conectada (dentro da janela de 24h ou por modelo).
  oficial?: { ativa: boolean; numero: string | null; erro: string | null } | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Erro do backend com o código (ex.: "FORA_DA_JANELA") pra tela decidir o que mostrar.
export class ErroBackend extends Error {
  codigo?: string;
  constructor(mensagem: string, codigo?: string) {
    super(mensagem);
    this.codigo = codigo;
  }
}

export async function call<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ErroBackend(data?.error || `Erro na API do WhatsApp (${res.status})`, data?.codigo);
  }
  return data as T;
}

export function connectWhatsapp(phoneNumber: string, provider: WhatsappProvider = "waha") {
  return call("/api/whatsapp/connect", {
    method: "POST",
    body: JSON.stringify({ phoneNumber, provider }),
  });
}

// renovarQr: só a janela "Ler QR Code" pede -- o backend gera um QR novo se o
// guardado estiver velho (sessão do baileys parou de mandar QR).
export function getWhatsappStatus(opts?: { renovarQr?: boolean }): Promise<WhatsappStatus> {
  return call(opts?.renovarQr ? "/api/whatsapp/status?renovar_qr=1" : "/api/whatsapp/status");
}

// Desloga do WhatsApp mas mantem o numero salvo — reconectar so pede um novo QR.
export function disconnectWhatsapp() {
  return call("/api/whatsapp/disconnect", { method: "POST" });
}

// Desloga e apaga o registro inteiro — precisa digitar o numero de novo pra reconectar.
export function deleteWhatsappInstance() {
  return call("/api/whatsapp/instance", { method: "DELETE" });
}

export async function getWhatsappAvatar(jid: string): Promise<string | null> {
  const data = await call<{ url: string | null }>(
    `/api/whatsapp/avatar?jid=${encodeURIComponent(jid)}`
  );
  return data.url;
}

export interface SendAttachment {
  base64: string;
  mimetype: string;
  fileName?: string;
}

// leadId: com a API oficial ligada, o backend usa pra saber se a janela de 24h está aberta.
// via: por onde saiu ("oficial" | "nao_oficial") -- vai gravado na mensagem.
export function sendWhatsappMessage(phone: string, text?: string, attachment?: SendAttachment, quoted?: any, leadId?: string) {
  return call<{ success: boolean; jid: string | null; messageId: string | null; via?: "oficial" | "nao_oficial" }>(
    "/api/whatsapp/send",
    {
      method: "POST",
      body: JSON.stringify({ phone, text, attachment, quoted, leadId }),
    }
  );
}
