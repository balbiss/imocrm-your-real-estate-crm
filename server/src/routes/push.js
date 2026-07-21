import { Router } from "express";
import { requireUser } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabase.js";

export const pushRouter = Router();
pushRouter.use(requireUser);

pushRouter.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

pushRouter.post("/subscribe", async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Assinatura invalida" });
    }

    const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
      {
        user_id: req.userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      { onConflict: "endpoint" }
    );
    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao salvar push subscription:", err);
    res.status(500).json({ error: err.message });
  }
});

pushRouter.post("/unsubscribe", async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: "endpoint obrigatorio" });

    await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", endpoint);
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao remover push subscription:", err);
    res.status(500).json({ error: err.message });
  }
});
