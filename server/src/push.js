import webpush from "web-push";
import { supabaseAdmin } from "./supabase.js";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:suporte@hinodeimoveis.com.br",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Manda push pra todas as assinaturas de um usuario. Remove sozinho qualquer
// assinatura expirada (410 Gone / 404) que o navegador ja descartou.
export async function sendPushToUser(userId, payload) {
  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    console.error("Erro ao buscar push_subscriptions:", error);
    return;
  }
  if (!subs?.length) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("Erro ao enviar push:", err.statusCode, err.body || err.message);
        }
      }
    })
  );
}
