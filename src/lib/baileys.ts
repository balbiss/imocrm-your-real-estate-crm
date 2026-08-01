// src/lib/baileys.ts
// Cliente do backend dedicado (Node/Express) que fala com o baileys-api.
// Substitui o antigo src/lib/wuzapi.ts + as Edge Functions wuzapi-proxy/whatsapp-webhook.
import { supabase } from "@/integrations/supabase/client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || process.env.BACKEND_URL || "";

export interface WhatsappStatus {
  hasInstance: boolean;
  connected?: boolean;
  jid?: string | null;
  qrCode?: string | null;
  phoneNumber?: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function call<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Erro na API do WhatsApp (${res.status})`);
  }
  return data as T;
}

export function connectWhatsapp(phoneNumber: string) {
  return call("/api/whatsapp/connect", {
    method: "POST",
    body: JSON.stringify({ phoneNumber }),
  });
}

export function getWhatsappStatus(): Promise<WhatsappStatus> {
  return call("/api/whatsapp/status");
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

export function sendWhatsappMessage(phone: string, text?: string, attachment?: SendAttachment, quoted?: any) {
  return call<{ success: boolean; jid: string; messageId: string | null }>(
    "/api/whatsapp/send",
    {
      method: "POST",
      body: JSON.stringify({ phone, text, attachment, quoted }),
    }
  );
}
