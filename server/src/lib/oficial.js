// WhatsApp API oficial (Cloud API) pelo app Meta "Conecta Zap InoovaWeb", com Coexistência: o
// número do corretor continua no WhatsApp Business do celular E pode ter sessão WAHA/Baileys
// ao mesmo tempo (híbrido).
//
// - O dono/gerente liga a oficial do corretor pelo Cadastro Incorporado (Integrações); o backend
//   troca o `code` por um token (usuário do sistema da empresa, não expira) e assina o app na WABA.
// - O número é registrado no hub InoovaWeb (HUB_LEADS_URL + HUB_WA_KEY): o webhook do app é um só
//   pra todos os sistemas, e o hub entrega cada número só pro sistema dono dele.
// - Envio: janela de 24h aberta -> oficial; fechada -> não oficial; sem não oficial -> só modelo.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "../supabase.js";

// WA_GRAPH_URL só existe pra teste local (servidor falso no lugar da Meta).
const GRAPH = (process.env.WA_GRAPH_URL || "https://graph.facebook.com").replace(/\/$/, "") + "/v21.0";

export function oficialConfigurado() {
  return !!(process.env.WA_APP_ID && process.env.WA_APP_SECRET && process.env.WA_CONFIG_ID && process.env.OFICIAL_TOKEN_KEY);
}

// O que o front precisa pra abrir o Cadastro Incorporado (nada secreto).
export function configPublica() {
  return {
    configurado: oficialConfigurado(),
    appId: process.env.WA_APP_ID || null,
    configId: process.env.WA_CONFIG_ID || null,
  };
}

// Confere o x-hub-signature-256 (o hub repassa o corpo e a assinatura originais da Meta).
export function assinaturaValida(raw, header) {
  const secret = process.env.WA_APP_SECRET;
  if (!secret || !raw || !header?.startsWith("sha256=")) return false;
  const esperado = Buffer.from("sha256=" + createHmac("sha256", secret).update(raw).digest("hex"));
  const recebido = Buffer.from(header);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

async function graph(caminho, token, { method = "GET", body, form } = {}) {
  const r = await fetch(GRAPH + caminho, {
    method,
    headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const resp = await r.json().catch(() => ({}));
  if (!r.ok || resp.error) throw new Error(resp.error?.message || "Meta respondeu " + r.status);
  return resp;
}

// ------------------------------- token cifrado -------------------------------
function chaveCifra() {
  return createHash("sha256").update(String(process.env.OFICIAL_TOKEN_KEY || "")).digest();
}

export function cifrarToken(token) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chaveCifra(), iv);
  const cifrado = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return { token_cifrado: cifrado.toString("base64"), token_iv: iv.toString("base64"), token_tag: c.getAuthTag().toString("base64") };
}

function tokenDa(conexao) {
  const d = createDecipheriv("aes-256-gcm", chaveCifra(), Buffer.from(conexao.token_iv, "base64"));
  d.setAuthTag(Buffer.from(conexao.token_tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(conexao.token_cifrado, "base64")), d.final()]).toString("utf8");
}

// O que a tela pode ver de uma conexão (nunca o token).
export function publica(conexao) {
  if (!conexao) return null;
  const { token_cifrado: _c, token_iv: _i, token_tag: _t, ...resto } = conexao;
  return resto;
}

// --------------------------------- conexão ---------------------------------
// code do Cadastro Incorporado -> token de usuário do sistema da empresa (não expira).
export async function trocarCodigo(code) {
  const q = new URLSearchParams({ client_id: process.env.WA_APP_ID, client_secret: process.env.WA_APP_SECRET, code });
  const r = await fetch(GRAPH + "/oauth/access_token?" + q.toString());
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.access_token) throw new Error(body.error?.message || "Meta não devolveu o token");
  return body.access_token;
}

// Assina o app na WABA -- sem isso as mensagens do número não chegam no webhook.
export async function assinarApp(wabaId, token) {
  await graph(`/${wabaId}/subscribed_apps`, token, { method: "POST" });
}

export async function infoNumero(phoneNumberId, token) {
  return graph(`/${phoneNumberId}?fields=display_phone_number,verified_name`, token);
}

// Números da WABA -- na Coexistência a Meta pode devolver só o waba_id.
export async function numerosDaWaba(wabaId, token) {
  const r = await graph(`/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`, token);
  return r.data || [];
}

// Coexistência: a Meta exige pedir a sincronização de contatos e histórico em até 24h depois de
// conectar, senão desconecta o número. O CRM não importa esse conteúdo (chega como webhooks
// smb_app_state_sync / history e é ignorado) -- o importante é o pedido ser feito.
export async function sincronizarCoexistencia(phoneNumberId, token) {
  const erros = [];
  for (const sync_type of ["smb_app_state_sync", "history"]) {
    await graph(`/${phoneNumberId}/smb_app_data`, token, { method: "POST", body: { messaging_product: "whatsapp", sync_type } })
      .catch((e) => erros.push(sync_type + ": " + e.message));
  }
  return erros;
}

// --------------------------------- modelos ---------------------------------
const VARIAVEL = /\{\{\s*\w+\s*\}\}/g;

// Todos os modelos de uma WABA (aprovados, em análise, rejeitados...).
export async function listarModelos(conexao) {
  const r = await graph(
    `/${conexao.waba_id}/message_templates?fields=id,name,language,status,category,rejected_reason,components&limit=200`,
    tokenDa(conexao)
  );
  return (r.data || []).map((t) => {
    const comp = (tipo) => t.components?.find((c) => c.type === tipo);
    const texto = comp("BODY")?.text || "";
    return {
      id: t.id,
      nome: t.name,
      idioma: t.language,
      categoria: t.category,
      status: t.status,
      motivo: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
      cabecalho: comp("HEADER")?.format === "TEXT" ? comp("HEADER")?.text || null : null,
      texto,
      rodape: comp("FOOTER")?.text || null,
      botoes: (comp("BUTTONS")?.buttons || []).map((b) => b.text),
      variaveis: new Set(texto.match(VARIAVEL) || []).size,
    };
  });
}

// Cria o modelo na WABA (vai pra análise da Meta).
export async function criarModelo(conexao, m) {
  const components = [];
  if (m.cabecalho) components.push({ type: "HEADER", format: "TEXT", text: m.cabecalho });
  components.push({ type: "BODY", text: m.texto, ...(m.exemplos.length ? { example: { body_text: [m.exemplos] } } : {}) });
  if (m.rodape) components.push({ type: "FOOTER", text: m.rodape });
  if (m.botoes?.length) components.push({ type: "BUTTONS", buttons: m.botoes.map((text) => ({ type: "QUICK_REPLY", text })) });
  return graph(`/${conexao.waba_id}/message_templates`, tokenDa(conexao), {
    method: "POST",
    body: { name: m.nome, category: m.categoria, language: m.idioma, parameter_format: "positional", components },
  });
}

export async function apagarModelo(conexao, nome) {
  await graph(`/${conexao.waba_id}/message_templates?name=${encodeURIComponent(nome)}`, tokenDa(conexao), { method: "DELETE" });
}

// ------------------------- hub InoovaWeb: número -> este CRM -------------------------
function hub() {
  const url = (process.env.HUB_LEADS_URL || "").replace(/\/$/, "");
  const key = process.env.HUB_WA_KEY || "";
  return url && key ? { url, key } : null;
}

// 'ok' | 'outro' (número já é de outro sistema) | 'erro'
export async function hubRegistrarNumero(phoneNumberId, wabaId, displayPhone, ref) {
  const h = hub();
  if (!h) return "ok"; // sem hub configurado, o webhook do app aponta direto pro CRM
  try {
    const r = await fetch(h.url + "/api/whatsapp/numbers", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-key": h.key },
      body: JSON.stringify({ phoneNumberId, wabaId, displayPhone, ref }),
    });
    if (r.status === 409) return "outro";
    return r.ok ? "ok" : "erro";
  } catch {
    return "erro";
  }
}

export async function hubLiberarNumero(phoneNumberId) {
  const h = hub();
  if (!h) return;
  await fetch(h.url + "/api/whatsapp/numbers/" + encodeURIComponent(phoneNumberId), {
    method: "DELETE",
    headers: { "x-hub-key": h.key },
  }).catch((e) => console.error("hub: liberar número falhou --", e.message));
}

// --------------------------------- mensagens ---------------------------------
// wa_id (como o WhatsApp conhece o contato) de quem escreveu -- pode vir sem o 9º dígito. A
// janela de 24h só abre quando o cliente escreve, então quando a oficial é usada o wa_id quase
// sempre já passou por aqui.
const waIdPorTelefone = new Map();
const ultimos8 = (s) => String(s).replace(/\D/g, "").slice(-8);
export function lembrarWaId(waId) {
  waIdPorTelefone.set(ultimos8(waId), String(waId).replace(/\D/g, ""));
}
function destino(telefone) {
  const d = String(telefone).replace(/\D/g, "");
  return waIdPorTelefone.get(ultimos8(d)) || (d.length <= 11 ? "55" + d : d);
}

const JANELA_MS = 24 * 3600 * 1000 - 10 * 60 * 1000; // 24h com 10 min de folga

// O cliente escreveu pro número DESTE corretor nas últimas 24h? (vale mensagem que entrou pela
// não oficial também -- é o mesmo número)
export async function janelaAberta(leadId, userId) {
  if (!leadId || !userId) return false;
  const { data } = await supabaseAdmin
    .from("mensagens_whatsapp")
    .select("id")
    .eq("lead_id", leadId)
    .eq("direcao", "inbound")
    .eq("conexao_user_id", userId)
    .gte("created_at", new Date(Date.now() - JANELA_MS).toISOString())
    .limit(1);
  return !!data?.length;
}

// Conexão oficial ATIVA de um usuário (ou null).
export async function conexaoAtiva(userId) {
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from("whatsapp_oficial")
    .select("*")
    .eq("user_id", userId)
    .eq("ativa", true)
    .maybeSingle();
  return data || null;
}

// Mesmo número? (compara os 8 últimos dígitos: ignora DDI e o 9º dígito)
export function mesmoNumero(a, b) {
  const x = ultimos8(a || ""), y = ultimos8(b || "");
  return x.length === 8 && x === y;
}

// Conexão oficial que pode ser usada pra falar pelo WhatsApp desse usuário. Se ele também tem
// WhatsApp por QR Code, a oficial só vale quando é o MESMO número -- senão o cliente receberia a
// resposta de outro número (caso real 15/10: oficial do dono ligada na linha de uma corretora).
export async function conexaoUsavel(userId, instancia) {
  const conexao = await conexaoAtiva(userId);
  if (!conexao) return null;
  if (instancia?.phone_number && !mesmoNumero(instancia.phone_number, conexao.numero)) return null;
  return conexao;
}

export async function registrarErro(conexao, mensagem) {
  await supabaseAdmin
    .from("whatsapp_oficial")
    .update({ erro: mensagem ? String(mensagem).slice(0, 300) : null })
    .eq("id", conexao.id)
    .then(() => {}, () => {});
}

// Sobe um arquivo pra Meta e devolve o id da mídia (pra mandar sem precisar de link público).
export async function subirMidia(conexao, buffer, mimetype, fileName) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimetype);
  form.append("file", new Blob([buffer], { type: mimetype }), fileName || "arquivo");
  const r = await graph(`/${conexao.phone_number_id}/media`, tokenDa(conexao), { method: "POST", form });
  return r.id;
}

// conteudo: { texto?, midia?: { tipo: 'image'|'video'|'audio'|'document', id? | link?, fileName? } }
// Devolve o wamid da mensagem.
export async function enviarOficial(conexao, telefone, conteudo) {
  let corpo;
  const m = conteudo.midia;
  if (m) {
    const midia = m.id ? { id: m.id } : { link: m.link };
    if (m.tipo !== "audio" && conteudo.texto) midia.caption = conteudo.texto;
    if (m.tipo === "document") midia.filename = m.fileName || "arquivo";
    corpo = { type: m.tipo, [m.tipo]: midia };
  } else {
    corpo = { type: "text", text: { body: conteudo.texto || "", preview_url: true } };
  }
  const r = await graph(`/${conexao.phone_number_id}/messages`, tokenDa(conexao), {
    method: "POST",
    body: { messaging_product: "whatsapp", recipient_type: "individual", to: destino(telefone), ...corpo },
  });
  if (r.contacts?.[0]?.wa_id) lembrarWaId(r.contacts[0].wa_id);
  return r.messages?.[0]?.id || null;
}

export const primeiroNome = (nome) => String(nome || "").trim().split(/\s+/)[0] || "";

// Manda um modelo aprovado com os valores das variáveis ({{1}}, {{2}}... na ordem). Devolve o id e
// o texto como o cliente vai ler (pra gravar no histórico do CRM).
export async function enviarModelo(conexao, telefone, nome, idioma, valores) {
  const m = (await listarModelos(conexao)).find(
    (x) => x.nome === nome && x.status === "APPROVED" && (!idioma || x.idioma === idioma)
  );
  if (!m) throw new Error(`o modelo "${nome}" não está aprovado`);
  const vals = Array.from({ length: m.variaveis }, (_, i) => String(valores[i] || "").trim() || "-");
  const r = await graph(`/${conexao.phone_number_id}/messages`, tokenDa(conexao), {
    method: "POST",
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: destino(telefone),
      type: "template",
      template: {
        name: m.nome,
        language: { code: m.idioma },
        ...(vals.length ? { components: [{ type: "body", parameters: vals.map((text) => ({ type: "text", text })) }] } : {}),
      },
    },
  });
  if (r.contacts?.[0]?.wa_id) lembrarWaId(r.contacts[0].wa_id);
  const corpo = m.texto.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => vals[Number(n) - 1] ?? "");
  const texto = [m.cabecalho ? `*${m.cabecalho}*` : "", corpo, m.rodape ? `_${m.rodape}_` : ""].filter(Boolean).join("\n\n");
  return { id: r.messages?.[0]?.id || null, texto };
}

// Baixa a mídia recebida pela oficial (id -> URL temporária -> arquivo, os dois com o token).
export async function baixarMidia(conexao, mediaId) {
  const token = tokenDa(conexao);
  const info = await graph(`/${mediaId}`, token);
  if (!info.url) throw new Error("Meta não devolveu a URL da mídia");
  const r = await fetch(info.url, { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) throw new Error("download da mídia falhou: " + r.status);
  return Buffer.from(await r.arrayBuffer());
}
