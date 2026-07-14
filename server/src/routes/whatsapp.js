import { Router } from "express";
import { requireUser } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabase.js";
import * as baileys from "../baileysClient.js";
import { toDigitsWithDDI } from "../lib/phone.js";

export const whatsappRouter = Router();
whatsappRouter.use(requireUser);

function buildWebhookUrl(phoneNumber) {
  const url = new URL(process.env.PUBLIC_WEBHOOK_URL);
  url.searchParams.set("phone", phoneNumber);
  url.searchParams.set("secret", process.env.WEBHOOK_SECRET);
  return url.toString();
}

async function getInstance(userId) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

whatsappRouter.post("/connect", async (req, res) => {
  try {
    const phoneNumber = toDigitsWithDDI(req.body?.phoneNumber || "");
    if (phoneNumber.length < 12) {
      return res.status(400).json({ error: "Numero de telefone invalido" });
    }

    const { data: instance, error } = await supabaseAdmin
      .from("whatsapp_instances")
      .upsert(
        { user_id: req.userId, phone_number: phoneNumber, connected: false, qr_code: null },
        { onConflict: "user_id" }
      )
      .select()
      .single();
    if (error) throw error;

    await baileys.createConnection(phoneNumber, buildWebhookUrl(phoneNumber));

    res.json({ success: true, instance });
  } catch (err) {
    console.error("Erro ao criar conexao:", err);
    res.status(500).json({ error: err.message });
  }
});

whatsappRouter.get("/status", async (req, res) => {
  try {
    const instance = await getInstance(req.userId);
    if (!instance) return res.json({ hasInstance: false });

    res.json({
      hasInstance: true,
      connected: instance.connected,
      jid: instance.jid,
      qrCode: instance.qr_code,
      phoneNumber: instance.phone_number,
    });
  } catch (err) {
    console.error("Erro ao ler status:", err);
    res.status(500).json({ error: err.message });
  }
});

whatsappRouter.get("/avatar", async (req, res) => {
  try {
    const instance = await getInstance(req.userId);
    const jid = req.query.jid;
    if (!instance?.phone_number || !jid) return res.json({ url: null });

    const url = await baileys.fetchProfilePictureUrl(instance.phone_number, String(jid));
    res.json({ url });
  } catch (err) {
    res.json({ url: null });
  }
});

// O baileys-api so oferece logout completo (sem opcao de "pausar" mantendo a
// sessao) — a diferenca entre desconectar e deletar e so no nosso lado:
// desconectar mantem o numero salvo (reconecta sem digitar de novo, mas
// precisa ler QR de novo do mesmo jeito); deletar apaga o registro inteiro.
whatsappRouter.post("/disconnect", async (req, res) => {
  try {
    const instance = await getInstance(req.userId);
    if (instance?.phone_number) {
      await baileys.deleteConnection(instance.phone_number).catch((e) =>
        console.warn("Erro ao apagar conexao no baileys-api (seguindo mesmo assim):", e.message)
      );
    }
    await supabaseAdmin
      .from("whatsapp_instances")
      .update({ connected: false, jid: null, qr_code: null })
      .eq("user_id", req.userId);
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao desconectar:", err);
    res.status(500).json({ error: err.message });
  }
});

whatsappRouter.delete("/instance", async (req, res) => {
  try {
    const instance = await getInstance(req.userId);
    if (instance?.phone_number) {
      await baileys.deleteConnection(instance.phone_number).catch((e) =>
        console.warn("Erro ao apagar conexao no baileys-api (seguindo mesmo assim):", e.message)
      );
    }
    await supabaseAdmin.from("whatsapp_instances").delete().eq("user_id", req.userId);
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao deletar instancia:", err);
    res.status(500).json({ error: err.message });
  }
});

whatsappRouter.post("/send", async (req, res) => {
  try {
    const { phone, text, attachment } = req.body || {};
    if (!phone) return res.status(400).json({ error: "phone obrigatorio" });

    const instance = await getInstance(req.userId);
    if (!instance?.phone_number || !instance.connected) {
      return res.status(409).json({ error: "WhatsApp nao conectado" });
    }

    const jid = await baileys.resolveJid(instance.phone_number, phone);
    if (!jid) {
      return res.status(422).json({ error: "Numero nao encontrado no WhatsApp" });
    }

    const messageContent = {};
    if (attachment?.base64) {
      const pureBase64 = attachment.base64.includes(",")
        ? attachment.base64.split(",")[1]
        : attachment.base64;
      const mimetype = attachment.mimetype || "application/octet-stream";

      if (mimetype.startsWith("image/")) {
        messageContent.image = pureBase64;
        if (text) messageContent.caption = text;
      } else if (mimetype.startsWith("audio/")) {
        messageContent.audio = pureBase64;
        messageContent.mimetype = mimetype;
        messageContent.ptt = true;
      } else if (mimetype.startsWith("video/")) {
        messageContent.video = pureBase64;
        messageContent.mimetype = mimetype;
        if (text) messageContent.caption = text;
      } else {
        messageContent.document = pureBase64;
        messageContent.mimetype = mimetype;
        messageContent.fileName = attachment.fileName || "arquivo";
        if (text) messageContent.caption = text;
      }
    } else {
      messageContent.text = text || "";
    }

    const result = await baileys.sendMessage(instance.phone_number, jid, messageContent);
    const messageId = result?.data?.key?.id || null;

    res.json({ success: true, jid, messageId });
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err);
    res.status(500).json({ error: err.message });
  }
});
