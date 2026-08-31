import { Router } from "express";
import { supabaseAdmin } from "../supabase.js";
import { providerFor } from "../whatsappProvider.js";
import * as waha from "../wahaClient.js";
import { uploadWhatsappMedia } from "../lib/media.js";
import { sendPushToUser } from "../push.js";
import { normalizeBaileysMessage, normalizeWahaMessage } from "../lib/normalizeWhatsapp.js";

export const webhookRouter = Router();

function checkSecret(req, res) {
  if (req.query.secret !== process.env.WEBHOOK_SECRET) {
    res.status(401).json({ error: "Segredo do webhook invalido" });
    return false;
  }
  return true;
}

// ============================ BAILEYS ============================
// O baileys-api manda {event, data, webhookVerifyToken, awaitResponse} direto
// na raiz do body -- sem nenhum wrapper "payload".
webhookRouter.post("/baileys", async (req, res) => {
  if (!checkSecret(req, res)) return;

  try {
    const { event, data } = req.body || {};
    const phoneNumber = String(req.query.phone || "");

    if (event === "connection.update") {
      await handleBaileysConnectionUpdate(phoneNumber, data || {});
    } else if (event === "messages.upsert") {
      const instance = await getInstanceByPhone(phoneNumber);
      for (const msg of data?.messages || []) {
        const normalized = normalizeBaileysMessage(msg);
        if (normalized) {
          await processInboundMessage(normalized, instance).catch((e) =>
            console.error("Erro ao processar mensagem baileys:", e)
          );
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Erro no webhook do baileys:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

async function handleBaileysConnectionUpdate(phoneNumber, data) {
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
    .eq("phone_number", phoneNumber)
    .eq("provider", "baileys");
  if (error) console.error("Erro ao atualizar whatsapp_instances (baileys):", error);
}

// ============================= WAHA =============================
// WAHA manda {event, session, payload, me, engine} na raiz. A sessao (=
// user_id do corretor) identifica a instancia.
webhookRouter.post("/waha", async (req, res) => {
  if (!checkSecret(req, res)) return;

  try {
    const { event, session, payload } = req.body || {};

    if (event === "session.status") {
      await handleWahaStatus(session, payload || {});
    } else if (event === "message" || event === "message.any") {
      const instance = await getInstanceBySession(session);
      const normalized = normalizeWahaMessage(payload || {});
      if (normalized) {
        await processInboundMessage(normalized, instance).catch((e) =>
          console.error("Erro ao processar mensagem waha:", e)
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Erro no webhook do WAHA:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

async function handleWahaStatus(sessionName, payload) {
  if (!sessionName) return;

  const status = payload.status;
  const update = {};

  if (status === "WORKING") {
    update.connected = true;
    update.qr_code = null;
  } else if (status === "SCAN_QR_CODE") {
    update.connected = false;
    update.qr_code = await waha.getQrDataUrl(sessionName).catch(() => null);
  } else if (status === "FAILED" || status === "STOPPED") {
    update.connected = false;
  } else {
    return; // STARTING etc -- ignora
  }

  const { error } = await supabaseAdmin
    .from("whatsapp_instances")
    .update(update)
    .eq("session_name", sessionName)
    .eq("provider", "waha");
  if (error) console.error("Erro ao atualizar whatsapp_instances (waha):", error);
}

// ===================== NORMALIZADORES =====================
// Formato interno unico: { sourceId, contactPhone, fromMe, pushName, isGroup,
//   reaction?: {targetId, emoji}, text, media?: {tipo, mimetype, fileName, ref},
//   raw }
// media.ref = id da mensagem (baileys) OU URL da midia (waha).
// (implementacao em ../lib/normalizeWhatsapp.js -- funcoes puras, testaveis)

// ===================== LOOKUPS DE INSTANCIA =====================
async function getInstanceByPhone(phoneNumber) {
  if (!phoneNumber) return null;
  const { data } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("*, perfis!inner(imobiliaria_id)")
    .eq("phone_number", phoneNumber)
    .eq("provider", "baileys")
    .maybeSingle();
  return data || null;
}

async function getInstanceBySession(sessionName) {
  if (!sessionName) return null;
  const { data } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("*, perfis!inner(imobiliaria_id)")
    .eq("session_name", sessionName)
    .eq("provider", "waha")
    .maybeSingle();
  return data || null;
}

// ===================== PIPELINE COMUM =====================
async function processInboundMessage(normalized, instance) {
  if (!normalized || normalized.isGroup) return;

  const {
    sourceId,
    contactPhone,
    fromMe,
    pushName,
    reaction,
    media,
  } = normalized;
  if (!sourceId || !contactPhone) return;

  // Dedupe: se ja gravamos essa mensagem, nao faz nada.
  const { data: existing } = await supabaseAdmin
    .from("mensagens_whatsapp")
    .select("id")
    .eq("whatsapp_message_id", sourceId)
    .maybeSingle();
  if (existing) return;

  // Reacao (emoji em cima de uma mensagem) -- atualiza o metadata da original.
  if (reaction) {
    const { targetId, emoji } = reaction;
    if (targetId) {
      const { data: targetMsg } = await supabaseAdmin
        .from("mensagens_whatsapp")
        .select("id, metadata")
        .eq("whatsapp_message_id", targetId)
        .maybeSingle();
      if (targetMsg) {
        await supabaseAdmin
          .from("mensagens_whatsapp")
          .update({ metadata: { ...(targetMsg.metadata || {}), reacao: emoji } })
          .eq("id", targetMsg.id);
      }
    }
    return;
  }

  const imobiliariaId = instance?.perfis?.imobiliaria_id || null;

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

    await alertaPossivelDuplicidade(lead, leadDetail, instance).catch((e) =>
      console.error("Erro ao checar duplicidade:", e)
    );
  } else {
    if (!instance || !imobiliariaId) return; // nao da pra saber a imobiliaria dona
    const novoLead = await criarLeadDoWhatsapp(contactPhone, instance, imobiliariaId, pushName);
    if (!novoLead) return;
    lead = { id: novoLead.id, imobiliaria_id: novoLead.imobiliaria_id };
    leadDetail = {
      corretor_id: novoLead.corretor_id,
      nome: novoLead.nome,
      telefone: novoLead.telefone,
      status: novoLead.status,
    };
  }

  let text = normalized.text || "";
  let tipo = media?.tipo || "text";

  if (media && instance) {
    try {
      const provider = providerFor(instance);
      const buffer = await provider.downloadMedia(media.ref);
      const url = await uploadWhatsappMedia(buffer, media.mimetype, media.fileName);
      const caption = media.caption ? `\n${media.caption}` : "";
      text =
        tipo === "document"
          ? `[Anexo]: ${url}\n${media.fileName || ""}${caption}`
          : `[Anexo]: ${url}${caption}`;
    } catch (e) {
      console.error(`Erro ao baixar midia (${tipo}) da mensagem ${sourceId}:`, e.message);
      text = text || "📎 Arquivo não pôde ser baixado";
    }
  }

  if (!text) text = "📎 Arquivo não suportado ou vazio";

  // upsert com ignoreDuplicates: corrida real com o insert do proprio CRM
  // (WhatsAppChat.tsx) pro eco da mensagem que ELE mandou -- o indice unico
  // parcial em whatsapp_message_id torna isso atomico.
  const { error: insertError } = await supabaseAdmin
    .from("mensagens_whatsapp")
    .upsert(
      {
        lead_id: lead.id,
        imobiliaria_id: lead.imobiliaria_id,
        corretor_id: leadDetail?.corretor_id || null,
        conteudo: text,
        direcao: fromMe ? "outbound" : "inbound",
        status: fromMe ? "sent" : "delivered",
        whatsapp_message_id: sourceId,
        tipo,
        lida: fromMe ? true : false,
        metadata: normalized.raw,
      },
      { onConflict: "whatsapp_message_id", ignoreDuplicates: true }
    );
  if (insertError) console.error("Erro ao inserir mensagem:", insertError);

  await supabaseAdmin
    .from("leads")
    .update({ ultima_acao_at: new Date().toISOString() })
    .eq("id", lead.id);

  if (leadDetail?.corretor_id) {
    const nomeExibicao = leadDetail.nome || leadDetail.telefone || "Novo lead";
    sendPushToUser(leadDetail.corretor_id, {
      title: nomeExibicao,
      body: text.length > 120 ? `${text.slice(0, 117)}...` : text,
      tag: lead.id,
      url: "/conversas",
    }).catch((e) => console.error("Erro ao enviar push:", e));
  }
}

// Se o lead ja pertence a outro corretor (ou e' rebatida) e quem recebeu foi
// um numero diferente do dono do lead, avisa dono/gerente.
async function alertaPossivelDuplicidade(lead, leadDetail, instance) {
  const receivingUserId = instance?.user_id;
  if (!receivingUserId) return;

  const isRebatida = leadDetail?.status === "rebatida";
  const isOutroCorretor = leadDetail?.corretor_id && leadDetail.corretor_id !== receivingUserId;
  if (!isRebatida && !isOutroCorretor) return;

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

// leads.telefone e' salvo sem o DDI 55 no resto do sistema.
function telefoneSemDDI(digitsOnly) {
  if (digitsOnly.startsWith("55") && digitsOnly.length >= 12) {
    return digitsOnly.slice(2);
  }
  return digitsOnly;
}

// Cliente novo mandou mensagem: cria o lead na hora, na roleta.
async function criarLeadDoWhatsapp(contactPhone, instance, imobiliariaId, pushName) {
  const telefone = telefoneSemDDI(contactPhone);

  const { data: existentes } = await supabaseAdmin.rpc("buscar_lead_por_telefone", {
    telefone_busca: telefone,
  });
  if (existentes?.length) {
    const { data: existente } = await supabaseAdmin
      .from("leads")
      .select("id, imobiliaria_id, corretor_id, nome, telefone, status")
      .eq("id", existentes[0].id)
      .single();
    if (existente) return existente;
  }

  const { data: rodizio } = await supabaseAdmin.rpc("get_next_corretor_rodizio", {
    p_imobiliaria_id: imobiliariaId,
  });
  const corretorId = rodizio?.[0]?.corretor_id || null;

  const agora = new Date().toISOString();
  let colunaConversando = null;
  if (corretorId) {
    const { data: coluna } = await supabaseAdmin
      .from("colunas_kanban")
      .select("id")
      .eq("imobiliaria_id", imobiliariaId)
      .ilike("nome", "%conversando%")
      .order("posicao")
      .limit(1)
      .maybeSingle();
    colunaConversando = coluna?.id || null;
  }

  const { data: novoLead, error } = await supabaseAdmin
    .from("leads")
    .insert({
      nome: pushName || telefone,
      telefone,
      imobiliaria_id: imobiliariaId,
      corretor_id: corretorId,
      origem: "WhatsApp",
      status: corretorId ? "tarefas" : "novo",
      ...(colunaConversando ? { coluna_kanban_id: colunaConversando } : {}),
      lembrete_follow_up: corretorId ? agora : null,
    })
    .select("id, imobiliaria_id, corretor_id, nome, telefone, status")
    .single();

  if (error) {
    console.error("Erro ao criar lead automatico do WhatsApp:", error);
    return null;
  }
  return novoLead;
}
