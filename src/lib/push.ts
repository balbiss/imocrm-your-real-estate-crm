// src/lib/push.ts
// Cliente do backend pra registrar/remover assinaturas de push notification.
import { supabase } from "@/integrations/supabase/client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || process.env.BACKEND_URL || "";

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
  if (!res.ok) throw new Error(data?.error || `Erro na API de push (${res.status})`);
  return data as T;
}

export async function getVapidPublicKey(): Promise<string> {
  const data = await call<{ publicKey: string }>("/api/push/vapid-public-key");
  return data.publicKey;
}

export function subscribePush(subscription: PushSubscriptionJSON) {
  return call("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint: subscription.endpoint, keys: subscription.keys }),
  });
}

export function unsubscribePush(endpoint: string) {
  return call("/api/push/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint }),
  });
}
