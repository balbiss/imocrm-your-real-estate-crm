// WhatsApp API oficial (app Conecta Zap, Coexistência) -- 3ª via ao lado de WAHA e Baileys, por
// corretor. Ver lib/oficial.js pro funcionamento geral.
//
//   POST /webhooks/oficial            <- hub InoovaWeb (corpo + assinatura originais da Meta)
//   /api/whatsapp-oficial/...         <- telas (JWT do Supabase)
import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabase.js";
import * as oficial from "../lib/oficial.js";
import { normalizeOficialMessage } from "../lib/normalizeWhatsapp.js";
import { processInboundMessage } from "./webhook.js";

const soDigitos = (s) => String(s || "").replace(/\D/g, "");
const GESTORES = ["dono", "gerente"];

// ================================== WEBHOOK ==================================
export async function oficialWebhook(req, res) {
  if (!oficial.assinaturaValida(req.rawBody, req.header("x-hub-signature-256"))) return res.sendStatus(401);
  res.sendStatus(200); // responde rápido, processa depois
  try {
    await processarWebhook(req.body);
  } catch (e) {
    console.error("webhook oficial:", e.message);
  }
}

// Só usado se o webhook do app apontar direto pro CRM (sem hub).
export function oficialWebhookVerificacao(req, res) {
  if (
    req.query["hub.mode"] === "subscribe" &&
    process.env.WA_VERIFY_TOKEN &&
    req.query["hub.verify_token"] === process.env.WA_VERIFY_TOKEN
  ) {
    return res.status(200).send(String(req.query["hub.challenge"] ?? ""));
  }
  res.sendStatus(403);
}

// Status da Meta -> status da mensagem no chat. Só avança (status chegam fora de ordem).
const ORDEM_STATUS = { pending: 0, sent: 1, delivered: 2, read: 3 };

async function atualizarStatus(st) {
  if (!st?.id) return;
  if (st.status === "failed") {
    console.warn("oficial: mensagem não entregue --", JSON.stringify(st.errors || []).slice(0, 300));
    await supabaseAdmin
      .from("mensagens_whatsapp")
      .update({ status: "failed" })
      .eq("whatsapp_message_id", st.id)
      .or("status.is.null,status.neq.read");
    return;
  }
  const novo = ORDEM_STATUS[st.status];
  if (novo === undefined) return;
  const anteriores = Object.keys(ORDEM_STATUS).filter((k) => ORDEM_STATUS[k] < novo);
  await supabaseAdmin
    .from("mensagens_whatsapp")
    .update({ status: st.status })
    .eq("whatsapp_message_id", st.id)
    .or(`status.is.null,status.in.(${anteriores.join(",")})`);
}

async function conexaoPorNumero(phoneNumberId) {
  const { data } = await supabaseAdmin
    .from("whatsapp_oficial")
    .select("*, perfis!whatsapp_oficial_user_id_fkey(imobiliaria_id, role, nome, bloqueado)")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  return data || null;
}

// Processa um aviso do WhatsApp oficial (assinatura já conferida). Exportado pros testes.
export async function processarWebhook(body) {
  if (body?.object !== "whatsapp_business_account") return;
  for (const entry of body.entry || []) {
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      const field = ch.field;

      // Desligado pelo celular (Configurações > Conta > Plataforma comercial) ou pela Meta.
      if (field === "account_update" && /PARTNER_REMOVED|ACCOUNT_DELETED|DISABLED/i.test(String(v.event || ""))) {
        const { data: conexoes } = await supabaseAdmin
          .from("whatsapp_oficial")
          .select("id, numero")
          .eq("waba_id", String(entry.id));
        const numero = soDigitos(v.phone_number);
        for (const c of conexoes || []) {
          if (numero && c.numero && c.numero.slice(-8) !== numero.slice(-8)) continue;
          await supabaseAdmin
            .from("whatsapp_oficial")
            .update({ ativa: false, erro: `Desconectado da API oficial (${v.event})` })
            .eq("id", c.id);
        }
        continue;
      }
      if (field !== "messages" && field !== "smb_message_echoes") continue; // modelos, history, sync: nada a gravar

      const phoneNumberId = String(v.metadata?.phone_number_id || "");
      if (!phoneNumberId) continue;
      const conexao = await conexaoPorNumero(phoneNumberId);
      if (!conexao?.ativa) continue;

      for (const st of v.statuses || []) await atualizarStatus(st).catch((e) => console.error("oficial: status --", e.message));

      const nomes = Object.fromEntries((v.contacts || []).map((c) => [String(c.wa_id), String(c.profile?.name || "").trim()]));
      const lista =
        field === "messages"
          ? (v.messages || []).map((msg) => ({ msg, fromMe: false }))
          : (v.message_echoes || []).map((msg) => ({ msg, fromMe: true }));

      // Mesmo formato de "instância" que o webhook do WAHA/Baileys usa.
      const instancia = { user_id: conexao.user_id, perfis: conexao.perfis, provider: "oficial" };
      for (const { msg, fromMe } of lista) {
        // Retentativa atrasada da Meta (CRM fora do ar por horas) não cria lead com conversa velha.
        const ts = Number(msg.timestamp) || 0;
        if (ts && Date.now() / 1000 - ts > 6 * 3600) continue;
        const normalized = normalizeOficialMessage(msg, { fromMe, nomes });
        if (!normalized) continue;
        if (!fromMe) oficial.lembrarWaId(normalized.contactPhone);
        await processInboundMessage(normalized, instancia, {
          via: "oficial",
          baixarMidia: (mediaId) => oficial.baixarMidia(conexao, mediaId),
        }).catch((e) => console.error("Erro ao processar mensagem oficial:", e));
      }
    }
  }
}

// =================================== TELAS ===================================
export const whatsappOficialRouter = Router();

// Admin da plataforma: liga a oficial num número que JÁ está na API oficial por este mesmo app
// (ex.: conectado antes pelo Chatwoot ou pelo v2), reaproveitando o token de usuário do sistema --
// o Cadastro Incorporado não deixa conectar de novo um número que já está registrado.
whatsappOficialRouter.post("/vincular", async (req, res) => {
  const segredo = process.env.OFICIAL_ADMIN_SECRET;
  if (!segredo || req.header("x-oficial-admin") !== segredo) return res.status(401).json({ error: "Não autorizado" });
  const parsed = z
    .object({
      userId: z.string().uuid(),
      token: z.string().min(50),
      wabaId: z.string().regex(/^\d+$/),
      phoneNumberId: z.string().regex(/^\d+$/),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados incompletos" });
  const { data: alvo } = await supabaseAdmin.from("perfis").select("imobiliaria_id").eq("id", parsed.data.userId).maybeSingle();
  if (!alvo) return res.status(404).json({ error: "Usuário não encontrado" });
  const r = await ligarOficial({ ...parsed.data, imobiliariaId: alvo.imobiliaria_id, conectadoPor: null, sincronizar: false });
  res.status(r.status).json(r.body);
});

whatsappOficialRouter.use(requireUser);
whatsappOficialRouter.use(async (req, res, next) => {
  const { data } = await supabaseAdmin
    .from("perfis")
    .select("id, nome, role, imobiliaria_id, bloqueado")
    .eq("id", req.userId)
    .maybeSingle();
  if (!data || data.bloqueado || !data.imobiliaria_id) return res.status(403).json({ error: "Sem acesso" });
  req.perfil = data;
  next();
});

whatsappOficialRouter.get("/config", (_req, res) => res.json(oficial.configPublica()));

// Lead que o usuário pode ver (mesma imobiliária; corretor só os dele).
async function leadAutorizado(leadId, perfil) {
  if (!/^[0-9a-f-]{36}$/i.test(String(leadId))) return null;
  const { data } = await supabaseAdmin
    .from("leads")
    .select("id, imobiliaria_id, corretor_id, nome, telefone")
    .eq("id", leadId)
    .maybeSingle();
  if (!data || data.imobiliaria_id !== perfil.imobiliaria_id) return null;
  if (!GESTORES.includes(perfil.role) && data.corretor_id !== perfil.id) return null;
  return data;
}

// Situação da conversa pro chat: dá pra responder livre (janela aberta / não oficial no ar) ou
// só por modelo?
whatsappOficialRouter.get("/conversa/:leadId", async (req, res) => {
  const lead = await leadAutorizado(req.params.leadId, req.perfil);
  if (!lead) return res.status(404).json({ error: "Lead não encontrado" });
  const conexao = await oficial.conexaoAtiva(req.userId);
  if (!conexao) return res.json({ oficial: false });
  const { data: inst } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("connected, phone_number")
    .eq("user_id", req.userId)
    .maybeSingle();
  res.json({
    oficial: true,
    janelaAberta: await oficial.janelaAberta(lead.id, req.userId),
    naoOficialNoAr: !!(inst?.connected && inst.phone_number),
    nomeSugerido: oficial.primeiroNome(lead.nome),
  });
});

// Modelos aprovados do número do usuário (pro chat).
whatsappOficialRouter.get("/conversa/:leadId/modelos", async (req, res) => {
  const lead = await leadAutorizado(req.params.leadId, req.perfil);
  if (!lead) return res.status(404).json({ error: "Lead não encontrado" });
  const conexao = await oficial.conexaoAtiva(req.userId);
  if (!conexao) return res.json([]);
  try {
    res.json((await oficial.listarModelos(conexao)).filter((m) => m.status === "APPROVED"));
  } catch (e) {
    res.status(502).json({ error: "A Meta recusou: " + e.message });
  }
});

// Corretor manda um modelo aprovado pelo chat (o único jeito de puxar conversa fora da janela de 24h).
whatsappOficialRouter.post("/conversa/:leadId/modelo", async (req, res) => {
  const parsed = z
    .object({ nome: z.string().min(1), idioma: z.string().min(2), valores: z.array(z.string().max(300)).max(10).default([]) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos" });
  const lead = await leadAutorizado(req.params.leadId, req.perfil);
  if (!lead) return res.status(404).json({ error: "Lead não encontrado" });
  const conexao = await oficial.conexaoAtiva(req.userId);
  if (!conexao) return res.status(400).json({ error: "Sua API oficial não está ligada" });
  try {
    const { id, texto } = await oficial.enviarModelo(conexao, lead.telefone, parsed.data.nome, parsed.data.idioma, parsed.data.valores);
    const { data: row, error } = await supabaseAdmin
      .from("mensagens_whatsapp")
      .insert({
        lead_id: lead.id,
        imobiliaria_id: lead.imobiliaria_id,
        corretor_id: req.userId,
        conteudo: texto,
        direcao: "outbound",
        status: "sent",
        whatsapp_message_id: id,
        via: "oficial",
        conexao_user_id: req.userId,
        tipo: "text",
        lida: true,
        metadata: { modelo: parsed.data.nome },
      })
      .select("id")
      .maybeSingle();
    if (error) console.error("oficial: gravar modelo enviado --", error.message);
    await supabaseAdmin.from("leads").update({ ultima_acao_at: new Date().toISOString() }).eq("id", lead.id);
    res.status(201).json({ id: row?.id || null, texto });
  } catch (e) {
    await oficial.registrarErro(conexao, e.message);
    res.status(502).json({ error: "A Meta recusou: " + e.message });
  }
});

// ------------------------- dono / gerente -------------------------
whatsappOficialRouter.use((req, res, next) => {
  if (!GESTORES.includes(req.perfil.role)) return res.status(403).json({ error: "Só dono ou gerente" });
  next();
});

// Equipe com o WhatsApp de cada um (não oficial + oficial).
whatsappOficialRouter.get("/equipe", async (req, res) => {
  const imob = req.perfil.imobiliaria_id;
  const [{ data: perfis }, { data: conexoes }] = await Promise.all([
    supabaseAdmin.from("perfis").select("id, nome, role, bloqueado").eq("imobiliaria_id", imob).order("nome"),
    supabaseAdmin.from("whatsapp_oficial").select("*").eq("imobiliaria_id", imob),
  ]);
  const ids = (perfis || []).map((p) => p.id);
  const { data: instancias } = ids.length
    ? await supabaseAdmin.from("whatsapp_instances").select("user_id, provider, connected, phone_number").in("user_id", ids)
    : { data: [] };
  res.json(
    (perfis || []).map((p) => {
      const inst = (instancias || []).find((i) => i.user_id === p.id);
      return {
        userId: p.id,
        nome: p.nome,
        role: p.role,
        bloqueado: !!p.bloqueado,
        naoOficial: inst ? { provider: inst.provider, connected: inst.connected, numero: inst.phone_number } : null,
        oficial: oficial.publica((conexoes || []).find((c) => c.user_id === p.id)),
      };
    })
  );
});

// Volta do Cadastro Incorporado: troca o code, assina o app na WABA, liga o número ao corretor.
whatsappOficialRouter.post("/conectar", async (req, res) => {
  if (!oficial.oficialConfigurado()) {
    return res.status(400).json({ error: "API oficial não configurada no servidor." });
  }
  const parsed = z
    .object({
      userId: z.string().uuid(),
      code: z.string().min(10),
      wabaId: z.string().regex(/^\d+$/),
      phoneNumberId: z.string().regex(/^\d+$/).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados do cadastro incompletos" });
  const { data: alvo } = await supabaseAdmin
    .from("perfis")
    .select("id, imobiliaria_id")
    .eq("id", parsed.data.userId)
    .maybeSingle();
  if (!alvo || alvo.imobiliaria_id !== req.perfil.imobiliaria_id) return res.status(404).json({ error: "Usuário não encontrado" });
  let token;
  try {
    token = await oficial.trocarCodigo(parsed.data.code);
  } catch (e) {
    return res.status(502).json({ error: "A Meta recusou o código: " + e.message });
  }
  const r = await ligarOficial({
    ...parsed.data,
    token,
    imobiliariaId: req.perfil.imobiliaria_id,
    conectadoPor: req.userId,
    sincronizar: true,
  });
  res.status(r.status).json(r.body);
});

// Desliga a oficial do corretor (a não oficial, se houver, continua).
whatsappOficialRouter.delete("/conexao/:userId", async (req, res) => {
  const { data: c } = await supabaseAdmin
    .from("whatsapp_oficial")
    .select("id, phone_number_id, imobiliaria_id")
    .eq("user_id", req.params.userId)
    .maybeSingle();
  if (!c || c.imobiliaria_id !== req.perfil.imobiliaria_id) return res.status(404).json({ error: "Conexão não encontrada" });
  await oficial.hubLiberarNumero(c.phone_number_id);
  await supabaseAdmin.from("whatsapp_oficial").delete().eq("id", c.id);
  res.json({ ok: true });
});

// Contas do WhatsApp (WABA) da imobiliária -- os modelos são por conta. Usa a conexão ativa de
// qualquer corretor daquela conta pra falar com a Meta.
async function conexaoDaConta(imobiliariaId, wabaId) {
  let q = supabaseAdmin.from("whatsapp_oficial").select("*").eq("imobiliaria_id", imobiliariaId).eq("ativa", true);
  if (wabaId) q = q.eq("waba_id", wabaId);
  const { data } = await q.order("created_at").limit(1);
  return data?.[0] || null;
}

whatsappOficialRouter.get("/modelos", async (req, res) => {
  const { data: todas } = await supabaseAdmin
    .from("whatsapp_oficial")
    .select("waba_id, numero, perfis!whatsapp_oficial_user_id_fkey(nome)")
    .eq("imobiliaria_id", req.perfil.imobiliaria_id)
    .eq("ativa", true);
  const contas = [];
  for (const c of todas || []) {
    let conta = contas.find((x) => x.wabaId === c.waba_id);
    if (!conta) contas.push((conta = { wabaId: c.waba_id, numeros: [] }));
    conta.numeros.push({ numero: c.numero, nome: c.perfis?.nome || "" });
  }
  const wabaId = String(req.query.waba || contas[0]?.wabaId || "");
  const conexao = wabaId ? await conexaoDaConta(req.perfil.imobiliaria_id, wabaId) : null;
  if (!conexao) return res.json({ contas, wabaId: null, modelos: [] });
  try {
    res.json({ contas, wabaId, modelos: await oficial.listarModelos(conexao) });
  } catch (e) {
    res.status(502).json({ error: "A Meta recusou: " + e.message });
  }
});

whatsappOficialRouter.post("/modelos", async (req, res) => {
  const parsed = z
    .object({
      wabaId: z.string().regex(/^\d+$/),
      nome: z.string().regex(/^[a-z0-9_]{1,512}$/, "Nome só com letras minúsculas, números e _"),
      categoria: z.enum(["MARKETING", "UTILITY"]),
      idioma: z.string().default("pt_BR"),
      cabecalho: z.string().max(60).nullable().optional(),
      texto: z.string().min(1).max(1024),
      exemplos: z.array(z.string().min(1).max(200)).default([]),
      rodape: z.string().max(60).nullable().optional(),
      botoes: z.array(z.string().min(1).max(25)).max(3).default([]),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Dados inválidos" });
  const m = parsed.data;
  // Variáveis {{1}}, {{2}}... em ordem, sem pular, e com um exemplo pra cada (a Meta exige).
  const nums = [...m.texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((x) => Number(x[1]));
  const distintos = [...new Set(nums)].sort((a, b) => a - b);
  if (distintos.some((n, i) => n !== i + 1)) return res.status(400).json({ error: "Use as variáveis em sequência: {{1}}, {{2}}, {{3}}..." });
  if (/\{\{[^}]*\}\}/.test(m.texto.replace(/\{\{\s*\d+\s*\}\}/g, ""))) return res.status(400).json({ error: "Variável inválida: use só números, como {{1}}" });
  if (m.exemplos.length !== distintos.length) return res.status(400).json({ error: "Preencha um exemplo pra cada variável" });
  if (/^\s*\{\{\s*\d+\s*\}\}|\{\{\s*\d+\s*\}\}\s*$/.test(m.texto)) {
    return res.status(400).json({ error: "A Meta não aceita o texto começando ou terminando com uma variável" });
  }
  const conexao = await conexaoDaConta(req.perfil.imobiliaria_id, m.wabaId);
  if (!conexao) return res.status(404).json({ error: "Nenhum número com a API oficial nessa conta" });
  try {
    const r = await oficial.criarModelo(conexao, { ...m, cabecalho: m.cabecalho || null, rodape: m.rodape || null });
    res.status(201).json(r);
  } catch (e) {
    res.status(502).json({ error: "A Meta recusou: " + e.message });
  }
});

whatsappOficialRouter.delete("/modelos/:wabaId/:nome", async (req, res) => {
  const conexao = await conexaoDaConta(req.perfil.imobiliaria_id, req.params.wabaId);
  if (!conexao) return res.status(404).json({ error: "Nenhum número com a API oficial nessa conta" });
  try {
    await oficial.apagarModelo(conexao, req.params.nome);
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: "A Meta recusou: " + e.message });
  }
});

// Liga a API oficial no número de um corretor: confere o número na Meta, assina o app na WABA,
// registra no hub e grava (token cifrado). Usado pelo Cadastro Incorporado e pelo admin.
async function ligarOficial({ userId, imobiliariaId, token, wabaId, phoneNumberId, conectadoPor, sincronizar }) {
  const resp = (status, body) => ({ status, body });
  let pnid = phoneNumberId;
  let display = "";
  let nomeVerificado = null;
  try {
    // Na Coexistência a Meta pode devolver só a WABA: o número vem da lista dela.
    if (!pnid) {
      const nums = await oficial.numerosDaWaba(wabaId, token);
      if (nums.length !== 1) {
        return resp(400, {
          error: nums.length
            ? "A conta tem mais de um número — conecte de novo escolhendo só um."
            : "Nenhum número nessa conta do WhatsApp.",
        });
      }
      pnid = nums[0].id;
      display = nums[0].display_phone_number || "";
      nomeVerificado = nums[0].verified_name || null;
    } else {
      const info = await oficial.infoNumero(pnid, token);
      display = info.display_phone_number || "";
      nomeVerificado = info.verified_name || null;
    }
    await oficial.assinarApp(wabaId, token);
  } catch (e) {
    return resp(502, { error: "Não deu pra ativar o número na Meta: " + e.message });
  }
  const numero = soDigitos(display);

  // Um número oficial só pode estar num corretor.
  const { data: outro } = await supabaseAdmin
    .from("whatsapp_oficial")
    .select("user_id, perfis!whatsapp_oficial_user_id_fkey(nome)")
    .eq("phone_number_id", pnid)
    .neq("user_id", userId)
    .maybeSingle();
  if (outro) return resp(409, { error: `Esse número já está ligado na conta de ${outro.perfis?.nome || "outro usuário"}.` });

  const noHub = await oficial.hubRegistrarNumero(pnid, wabaId, display, "oka:" + userId);
  if (noHub === "outro") return resp(409, { error: "Esse número já está conectado em outro sistema da InoovaWeb." });
  if (noHub === "erro") return resp(502, { error: "Não deu pra registrar o número no hub. Tente de novo." });

  // Corretor trocando de número: libera o antigo no hub.
  const { data: anterior } = await supabaseAdmin
    .from("whatsapp_oficial")
    .select("phone_number_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (anterior && anterior.phone_number_id !== pnid) await oficial.hubLiberarNumero(anterior.phone_number_id);

  const { data: row, error } = await supabaseAdmin
    .from("whatsapp_oficial")
    .upsert(
      {
        user_id: userId,
        imobiliaria_id: imobiliariaId,
        phone_number_id: pnid,
        waba_id: wabaId,
        numero: numero || null,
        nome_verificado: nomeVerificado,
        ...oficial.cifrarToken(token),
        ativa: true,
        erro: null,
        conectado_por: conectadoPor,
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();
  if (error) return resp(500, { error: "Não deu pra salvar a conexão: " + error.message });

  // Exigência da Coexistência: pedir a sincronização logo depois de conectar (só vale nas 24h
  // depois do cadastro -- quem reaproveita uma conexão antiga não pede de novo).
  const errosSync = sincronizar ? await oficial.sincronizarCoexistencia(pnid, token) : [];
  if (errosSync.length) console.warn("oficial: sincronização da Coexistência --", errosSync.join(" | "));

  return resp(201, {
    ...oficial.publica(row),
    avisoSync: errosSync.length ? "A Meta não aceitou a sincronização: " + errosSync.join("; ") : null,
  });
}
