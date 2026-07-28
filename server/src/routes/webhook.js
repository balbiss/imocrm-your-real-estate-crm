import { Router } from "express";
import { supabaseAdmin } from "../supabase.js";
import * as baileys from "../baileysClient.js";
import { uploadWhatsappMedia } from "../lib/media.js";
import { sendPushToUser } from "../push.js";

export const webhookRouter = Router();

function checkSecret(req, res) {
  if (req.query.secret !== process.env.WEBHOOK_SECRET) {
    res.status(401).json({ error: "Segredo do webhook invalido" });
    return false;
  }
  return true;
}

webhookRouter.post("/baileys", async (req, res) => {
  if (!checkSecret(req, res)) return;

  try {
    // O baileys-api manda {event, data, webhookVerifyToken, awaitResponse} direto
    // na raiz do body — sem nenhum wrapper "payload".
    const { event, data } = req.body || {};
    const phoneNumber = String(req.query.phone || "");

    if (event === "connection.update") {
      await handleConnectionUpdate(phoneNumber, data || {});
    } else if (event === "messages.upsert") {
      await handleMessagesUpsert(data || {}, phoneNumber);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Erro no webhook do baileys:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

async function handleConnectionUpdate(phoneNumber, data) {
  if (!phoneNumber) return;

  const update = {};
  const qr = data.qrDataUrl || data.qr;
  if (qr) update.qr_code = qr;

  if (data.connection) {
    update.connected = data.connection === "open";
    if (update.connected) update.qr_code = null;
  }

  if (Object.keys(update).length === 0) return;

  const { error } = await supabaseAdmin
    .from("whatsapp_instances")
    .update(update)
    .eq("phone_number", phoneNumber);
  if (error) console.error("Erro ao atualizar whatsapp_instances no webhook:", error);
}

async function handleMessagesUpsert(data, receivingPhoneNumber) {
  const messages = data.messages || [];

  for (const msg of messages) {
    await handleSingleMessage(msg, receivingPhoneNumber).catch((e) =>
      console.error("Erro ao processar mensagem individual:", e)
    );
  }
}

// Se o lead que mandou a mensagem ja pertence a outro corretor (ou esta
// marcado como rebatida) e quem recebeu foi um numero de WhatsApp diferente
// do dono do lead, avisa dono/gerente pra decidirem se transferem o card.
async function alertaPossivelDuplicidade(lead, leadDetail, receivingPhoneNumber) {
  if (!receivingPhoneNumber) return;

  const { data: instance } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("user_id")
    .eq("phone_number", receivingPhoneNumber)
    .maybeSingle();

  const receivingUserId = instance?.user_id;
  if (!receivingUserId) return;

  const isRebatida = leadDetail?.status === "rebatida";
  const isOutroCorretor = leadDetail?.corretor_id && leadDetail.corretor_id !== receivingUserId;

  if (!isRebatida && !isOutroCorretor) return;

  // Evita duplicar alerta: se ja existe um aviso nao lido pra esse lead
  // nas ultimas 2 horas, nao cria outro a cada mensagem nova.
  const duasHorasAtras = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: alertaExistente } = await supabaseAdmin
    .from("notificacoes")
    .select("id")
    .eq("lead_id", lead.id)
    .eq("tipo", "possivel_duplicidade")
    .eq("lida", false)
    .gte("created_at", duasHorasAtras)
    .limit(1);
  if (alertaExistente?.length) return;

  const { data: gestores } = await supabaseAdmin
    .from("perfis")
    .select("id")
    .eq("imobiliaria_id", lead.imobiliaria_id)
    .in("role", ["dono", "gerente"]);
  if (!gestores?.length) return;

  const nomeLead = leadDetail?.nome || leadDetail?.telefone || "Lead";
  const titulo = isRebatida
    ? `${nomeLead} (rebatida) respondeu de novo — confira se precisa transferir`
    : `${nomeLead} chamou outro corretor, mas já é atendido — confira se precisa transferir`;

  const rows = gestores.map((g) => ({
    usuario_id: g.id,
    imobiliaria_id: lead.imobiliaria_id,
    lead_id: lead.id,
    tipo: "possivel_duplicidade",
    titulo,
    lida: false,
  }));

  const { error } = await supabaseAdmin.from("notificacoes").insert(rows);
  if (error) console.error("Erro ao criar alerta de duplicidade:", error);
}

// Descobre a imobiliaria e o corretor dono do numero de WhatsApp que recebeu
// a mensagem (whatsapp_instances nao guarda imobiliaria_id direto, so via perfis).
async function resolverDonoDaInstancia(receivingPhoneNumber) {
  if (!receivingPhoneNumber) return null;

  const { data } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("user_id, perfis!inner(imobiliaria_id)")
    .eq("phone_number", receivingPhoneNumber)
    .maybeSingle();

  const imobiliariaId = data?.perfis?.imobiliaria_id;
  if (!data?.user_id || !imobiliariaId) return null;

  return { userId: data.user_id, imobiliariaId };
}

// Cliente novo (nao cadastrado) mandou mensagem pro WhatsApp conectado: cria
// o lead na hora, na roleta de distribuicao, em vez de simplesmente ignorar.
async function criarLeadDoWhatsapp(contactPhone, receivingPhoneNumber, pushName) {
  const dono = await resolverDonoDaInstancia(receivingPhoneNumber);
  if (!dono) return null;

  const { data: rodizio } = await supabaseAdmin.rpc("get_next_corretor_rodizio", {
    p_imobiliaria_id: dono.imobiliariaId,
  });
  const corretorId = rodizio?.[0]?.corretor_id || dono.userId;

  const { data: novoLead, error } = await supabaseAdmin
    .from("leads")
    .insert({
      nome: pushName || contactPhone,
      telefone: contactPhone,
      imobiliaria_id: dono.imobiliariaId,
      corretor_id: corretorId,
      origem: "WhatsApp",
      status: "novo",
    })
    .select("id, imobiliaria_id, corretor_id, nome, telefone, status")
    .single();

  if (error) {
    console.error("Erro ao criar lead automatico do WhatsApp:", error);
    return null;
  }
  return novoLead;
}

async function handleSingleMessage(msg, receivingPhoneNumber) {
  const remoteJid = msg?.key?.remoteJid;
  if (!remoteJid || remoteJid.includes("@g.us")) return; // ignora grupos
  if (msg?.key?.fromMe) return; // eco do que a gente mesmo mandou

  const remoteJidAlt = msg?.key?.remoteJidAlt;
  let contactPhone;
  if (remoteJid.includes("@s.whatsapp.net")) {
    contactPhone = remoteJid.split("@")[0];
  } else if (remoteJid.includes("@lid") && remoteJidAlt?.includes("@s.whatsapp.net")) {
    contactPhone = remoteJidAlt.split("@")[0];
  } else {
    contactPhone = remoteJid.split("@")[0];
  }

  const sourceId = msg?.key?.id;
  if (!sourceId) return;

  // Dedupe: se ja gravamos essa mensagem, nao faz nada.
  const { data: existing } = await supabaseAdmin
    .from("mensagens_whatsapp")
    .select("id")
    .eq("whatsapp_message_id", sourceId)
    .maybeSingle();
  if (existing) return;

  const { data: leads, error: searchError } = await supabaseAdmin.rpc(
    "buscar_lead_por_telefone",
    { telefone_busca: contactPhone }
  );
  if (searchError) {
    console.error("Erro ao buscar lead por telefone:", searchError);
    return;
  }

  let lead;
  let leadDetail;

  if (leads?.length) {
    lead = leads[0];
    const { data } = await supabaseAdmin
      .from("leads")
      .select("corretor_id, nome, telefone, status")
      .eq("id", lead.id)
      .single();
    leadDetail = data;

    await alertaPossivelDuplicidade(lead, leadDetail, receivingPhoneNumber).catch((e) =>
      console.error("Erro ao checar duplicidade:", e)
    );
  } else {
    const novoLead = await criarLeadDoWhatsapp(contactPhone, receivingPhoneNumber, msg?.pushName);
    if (!novoLead) return; // nao foi possivel identificar a imobiliaria dona do numero
    lead = { id: novoLead.id, imobiliaria_id: novoLead.imobiliaria_id };
    leadDetail = { corretor_id: novoLead.corretor_id, nome: novoLead.nome, telefone: novoLead.telefone, status: novoLead.status };
  }

  let text =
    msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || "";
  let tipo = "text";
  let mediaInfo = null;

  const message = msg?.message || {};
  if (message.imageMessage) {
    tipo = "image";
    mediaInfo = message.imageMessage;
  } else if (message.audioMessage) {
    tipo = "audio";
    mediaInfo = message.audioMessage;
  } else if (message.videoMessage) {
    tipo = "video";
    mediaInfo = message.videoMessage;
  } else if (message.documentMessage) {
    tipo = "document";
    mediaInfo = message.documentMessage;
  } else if (message.stickerMessage) {
    tipo = "sticker";
    mediaInfo = message.stickerMessage;
  }

  if (mediaInfo) {
    try {
      const buffer = await baileys.downloadMedia(sourceId);
      const mimetype = mediaInfo.mimetype || "application/octet-stream";
      const fileName = mediaInfo.fileName || null;
      const url = await uploadWhatsappMedia(buffer, mimetype, fileName);

      const caption = mediaInfo.caption ? `\n${mediaInfo.caption}` : "";
      text = tipo === "document" ? `[Anexo]: ${url}\n${fileName || ""}${caption}` : `[Anexo]: ${url}${caption}`;
    } catch (e) {
      console.error(`Erro ao baixar midia ${tipo} da mensagem ${sourceId}:`, e.message);
      text = text || "📎 Arquivo não pôde ser baixado";
    }
  }

  if (!text) text = "📎 Arquivo não suportado ou vazio";

  const { error: insertError } = await supabaseAdmin.from("mensagens_whatsapp").insert({
    lead_id: lead.id,
    imobiliaria_id: lead.imobiliaria_id,
    corretor_id: leadDetail?.corretor_id || null,
    conteudo: text,
    direcao: "inbound",
    status: "delivered",
    whatsapp_message_id: sourceId,
    tipo,
    lida: false,
    metadata: msg,
  });
  if (insertError) console.error("Erro ao inserir mensagem:", insertError);

  await supabaseAdmin
    .from("leads")
    .update({ ultima_acao_at: new Date().toISOString() })
    .eq("id", lead.id);

  if (leadDetail?.corretor_id) {
    const nomeExibicao = leadDetail.nome || leadDetail.telefone || "Novo lead";
    console.log(`Disparando push pro corretor ${leadDetail.corretor_id} (lead ${lead.id})`);
    sendPushToUser(leadDetail.corretor_id, {
      title: nomeExibicao,
      body: text.length > 120 ? `${text.slice(0, 117)}...` : text,
      tag: lead.id,
      url: "/conversas",
    }).catch((e) => console.error("Erro ao enviar push:", e));
  } else {
    console.log(`Lead ${lead.id} sem corretor_id — push nao disparado`);
  }
}
