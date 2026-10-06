import { Router } from "express";
import { requireUser } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabase.js";
import { providerFor } from "../whatsappProvider.js";
import { toDigitsWithDDI } from "../lib/phone.js";
import { sendMessageComRetry } from "../lib/sendComRetry.js";

export const whatsappRouter = Router();
whatsappRouter.use(requireUser);

const DEFAULT_PROVIDER = "waha";

function buildWebhookUrl(provider, phoneNumber) {
  if (provider === "waha") {
    const url = new URL(process.env.WAHA_PUBLIC_WEBHOOK_URL);
    url.searchParams.set("secret", process.env.WEBHOOK_SECRET);
    return url.toString();
  }
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
    const provider = req.body?.provider === "baileys" ? "baileys" : DEFAULT_PROVIDER;

    // Mesmo número em duas contas = mesma sessão no baileys-api (é chaveada
    // pelo número) e o webhook não sabe de quem é a mensagem: mídia não era
    // baixada e contato novo não virava lead (caso real 30/09: Barbara/Michael
    // e Mariaan/Farah). Bloqueia conectar um número que já está em outra conta.
    const { data: outraConta } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("user_id, perfis!inner(nome)")
      .eq("phone_number", phoneNumber)
      .neq("user_id", req.userId)
      .limit(1)
      .maybeSingle();
    if (outraConta) {
      return res.status(409).json({
        error: `Esse número já está conectado na conta de ${outraConta.perfis?.nome || "outro usuário"}. Desconecte ele naquela conta primeiro (Integrações → Desconectar) ou fale com o suporte.`,
      });
    }

    // Trocar de provider sem apagar a instancia antes: derruba a conexao
    // antiga (engine que estava em uso) pra nao ficar sessao orfã rodando.
    const anterior = await getInstance(req.userId);
    if (anterior && anterior.provider !== provider) {
      try {
        await providerFor(anterior).remove();
      } catch (e) {
        console.warn("Erro ao limpar conexao antiga ao trocar de provider:", e.message);
      }
    }

    const { data: instance, error } = await supabaseAdmin
      .from("whatsapp_instances")
      .upsert(
        {
          user_id: req.userId,
          phone_number: phoneNumber,
          provider,
          session_name: provider === "waha" ? req.userId : null,
          connected: false,
          qr_code: null,
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();
    if (error) throw error;

    await providerFor(instance).createConnection(buildWebhookUrl(provider, phoneNumber));

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

    let connected = instance.connected;
    let qrCode = instance.qr_code;

    // WAHA nao empurra o QR em todo webhook -- consulta ao vivo e busca o QR
    // na hora se a sessao estiver pedindo leitura. Tambem sincroniza o cache.
    if (instance.provider === "waha" && instance.session_name) {
      const provider = providerFor(instance);
      try {
        const sess = await provider.liveStatus();
        const status = sess?.status;
        if (status === "WORKING") {
          connected = true;
          qrCode = null;
        } else if (status === "SCAN_QR_CODE") {
          connected = false;
          qrCode = (await provider.getQr()) || qrCode;
        } else if (status === "FAILED" || status === "STOPPED") {
          connected = false;
        }
        if (connected !== instance.connected || qrCode !== instance.qr_code) {
          await supabaseAdmin
            .from("whatsapp_instances")
            .update({ connected, qr_code: connected ? null : qrCode })
            .eq("user_id", req.userId);
        }
      } catch (e) {
        console.warn("Erro ao consultar status ao vivo do WAHA:", e.message);
      }
    }

    // Baileys: o QR chega por webhook e fica guardado. Se a sessão parou de
    // gerar QR (expirou as tentativas, ou o baileys-api reiniciou), o CRM
    // mostrava o QR velho pra sempre e a leitura não funcionava ("fica só
    // aguardando", caso Mariaan 06/10). Com a janela de QR aberta
    // (?renovar_qr=1), QR sem atualização há mais de 90s -> pede outro.
    // updated_at muda a cada QR novo (trigger set_whatsapp_instances_updated_at).
    if (
      req.query.renovar_qr === "1" &&
      instance.provider === "baileys" &&
      !instance.connected &&
      instance.phone_number &&
      Date.now() - new Date(instance.updated_at).getTime() > 90_000
    ) {
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({ qr_code: null })
        .eq("user_id", req.userId);
      qrCode = null;
      providerFor(instance)
        .createConnection(buildWebhookUrl(instance.provider, instance.phone_number))
        .catch((e) => console.warn("Erro ao renovar QR do baileys:", e.message));
    }

    res.json({
      hasInstance: true,
      provider: instance.provider,
      connected,
      jid: instance.jid,
      qrCode,
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
    const raw = req.query.jid;
    if (!instance?.phone_number || !raw) return res.json({ url: null });

    const url = await providerFor(instance).fetchProfilePictureUrl(String(raw));
    res.json({ url });
  } catch (err) {
    res.json({ url: null });
  }
});

// Número conectado também em OUTRA conta (mesma sessão no baileys-api): quem
// desconecta só se desvincula -- derrubar a sessão tiraria do ar o WhatsApp
// da outra pessoa junto.
async function numeroCompartilhado(instance) {
  if (!instance?.phone_number || instance.provider !== "baileys") return false;
  const { count } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("id", { count: "exact", head: true })
    .eq("phone_number", instance.phone_number)
    .eq("provider", "baileys")
    .neq("user_id", instance.user_id);
  return (count || 0) > 0;
}

whatsappRouter.post("/disconnect", async (req, res) => {
  try {
    const instance = await getInstance(req.userId);
    if (instance && (await numeroCompartilhado(instance))) {
      await supabaseAdmin.from("whatsapp_instances").delete().eq("user_id", req.userId);
      return res.json({ success: true, desvinculado: true });
    }
    if (instance) {
      await providerFor(instance)
        .disconnect()
        .catch((e) =>
          console.warn("Erro ao desconectar na engine (seguindo mesmo assim):", e.message)
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
    if (instance && !(await numeroCompartilhado(instance))) {
      await providerFor(instance)
        .remove()
        .catch((e) =>
          console.warn("Erro ao apagar conexao na engine (seguindo mesmo assim):", e.message)
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
    const { phone, text, attachment, quoted } = req.body || {};
    if (!phone) return res.status(400).json({ error: "phone obrigatorio" });

    const instance = await getInstance(req.userId);
    if (!instance?.phone_number || !instance.connected) {
      return res.status(409).json({ error: "WhatsApp nao conectado" });
    }

    const provider = providerFor(instance);

    const jid = await provider.resolveJid(phone);
    if (!jid) {
      return res.status(422).json({ error: "Numero nao encontrado no WhatsApp" });
    }

    const messageContent = {};
    if (attachment?.base64) {
      const pureBase64 = attachment.base64.includes(",")
        ? attachment.base64.split(",")[1]
        : attachment.base64;
      const mimetype = attachment.mimetype || "application/octet-stream";

      // WhatsApp rejeita video como mensagem de video acima de ~16mb -- vai
      // como documento em vez de dar erro no envio.
      const tamanhoBytes = (pureBase64.length * 3) / 4;
      const videoGrandeDemais = mimetype.startsWith("video/") && tamanhoBytes > 16 * 1024 * 1024;

      if (mimetype.startsWith("image/")) {
        messageContent.image = pureBase64;
        messageContent.mimetype = mimetype;
        if (attachment.fileName) messageContent.fileName = attachment.fileName;
        if (text) messageContent.caption = text;
      } else if (mimetype.startsWith("audio/")) {
        messageContent.audio = pureBase64;
        messageContent.mimetype = mimetype;
        messageContent.ptt = true;
      } else if (mimetype.startsWith("video/") && !videoGrandeDemais) {
        messageContent.video = pureBase64;
        messageContent.mimetype = mimetype;
        if (attachment.fileName) messageContent.fileName = attachment.fileName;
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

    // "quoted" (citacao nativa) so e' suportado no baileys hoje -- ele guarda
    // o objeto bruto da mensagem original. No WAHA seria por reply_to (id),
    // fica pra depois.
    const options =
      instance.provider === "baileys" && quoted ? { quoted } : undefined;

    const result = await sendMessageComRetry(provider, jid, messageContent, options);
    const messageId = result?.data?.key?.id || null;

    res.json({ success: true, jid, messageId });
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err);
    res.status(500).json({ error: err.message });
  }
});
