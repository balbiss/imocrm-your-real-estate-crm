// Conector do Claude (MCP) — o dono/gerente adiciona
// https://crm.hinodeimoveis.com.br/backend/mcp como "conector personalizado" no
// claude.ai e consulta os números do CRM conversando. SOMENTE LEITURA.
//
// Login: OAuth 2.1 (o que o claude.ai exige pra conector com login) feito aqui
// mesmo, validando e-mail/senha do CRM no Supabase Auth. Só dono e gerente
// ativos entram; o papel é reconferido a cada consulta (mcp_assumir_usuario),
// então bloquear/remover o usuário no CRM corta o acesso na hora.
//
// Rotas (o Traefik tira o /backend antes de chegar aqui):
//   /backend/mcp                         -> servidor MCP (exige Bearer)
//   /backend/oauth/register|authorize|token
//   /.well-known/oauth-*                 -> roteado direto pro backend (sem /backend),
//                                           também respondido em /backend/.well-known/*
import crypto from "crypto";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { supabaseAdmin } from "../supabase.js";

const BASE_URL = (process.env.MCP_PUBLIC_URL || "https://crm.hinodeimoveis.com.br").replace(/\/$/, "");
const RESOURCE_URL = `${BASE_URL}/backend/mcp`;
const ISSUER = BASE_URL;
const PRM_URL = `${BASE_URL}/.well-known/oauth-protected-resource/backend/mcp`;
const ACCESS_TTL_S = 60 * 60; // 1h
const REFRESH_TTL_S = 30 * 24 * 60 * 60; // 30 dias
const CODE_TTL_S = 10 * 60;

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const aleatorio = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const mcpRouter = express.Router();
mcpRouter.use(express.urlencoded({ extended: false }));

// ---------------------------------------------------------------- descoberta
const metadadosRecurso = (_req, res) =>
  res.json({
    resource: RESOURCE_URL,
    authorization_servers: [ISSUER],
    bearer_methods_supported: ["header"],
    resource_name: "CRM OKA",
  });

const metadadosAutorizacao = (_req, res) =>
  res.json({
    issuer: ISSUER,
    authorization_endpoint: `${BASE_URL}/backend/oauth/authorize`,
    token_endpoint: `${BASE_URL}/backend/oauth/token`,
    registration_endpoint: `${BASE_URL}/backend/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["crm.leitura"],
  });

mcpRouter.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/*"], metadadosRecurso);
mcpRouter.get(
  ["/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/*", "/.well-known/openid-configuration", "/.well-known/openid-configuration/*"],
  metadadosAutorizacao
);

// ---------------------------------------------------------------- registro dinâmico (RFC 7591)
mcpRouter.post("/oauth/register", async (req, res) => {
  const b = req.body || {};
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u) => typeof u === "string") : [];
  if (!uris.length || uris.some((u) => !/^https:\/\//.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u))) {
    return res.status(400).json({ error: "invalid_redirect_uri", error_description: "redirect_uris precisa de URLs https" });
  }
  const metodo = ["client_secret_post", "client_secret_basic"].includes(b.token_endpoint_auth_method) ? b.token_endpoint_auth_method : "none";
  const clientId = `mcp_${aleatorio(16)}`;
  const secret = metodo === "none" ? null : aleatorio(32);
  const { error } = await supabaseAdmin.from("mcp_oauth_clientes").insert({
    id: clientId,
    secret_hash: secret ? sha256(secret) : null,
    redirect_uris: uris,
    nome: typeof b.client_name === "string" ? b.client_name.slice(0, 120) : null,
  });
  if (error) {
    console.error("[mcp] registro de cliente falhou:", error.message);
    return res.status(500).json({ error: "server_error" });
  }
  res.status(201).json({
    client_id: clientId,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: uris,
    client_name: b.client_name,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: metodo,
  });
});

// ---------------------------------------------------------------- login (authorize)
async function carregarCliente(clientId) {
  if (!clientId) return null;
  const { data } = await supabaseAdmin.from("mcp_oauth_clientes").select("*").eq("id", clientId).maybeSingle();
  return data;
}

const CAMPOS_AUTH = ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"];

function paginaLogin(params, erro) {
  const ocultos = CAMPOS_AUTH.map((k) => `<input type="hidden" name="${k}" value="${escHtml(params[k])}">`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conectar o Claude ao CRM OKA</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a}
  .card{width:100%;max-width:380px;margin:16px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(15,23,42,.08);padding:28px}
  h1{font-size:20px;margin:0 0 6px} p{font-size:13px;color:#475569;margin:0 0 18px;line-height:1.5}
  label{display:block;font-size:12px;font-weight:600;margin:12px 0 6px;color:#334155}
  input[type=email],input[type=password]{box-sizing:border-box;width:100%;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px}
  button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:10px;background:#1d4ed8;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  .erro{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:8px}
  .nota{font-size:11.5px;color:#64748b;margin-top:16px}
</style></head><body><form class="card" method="post" action="${BASE_URL}/backend/oauth/authorize">
<h1>Conectar o Claude ao CRM OKA</h1>
<p>Entre com o mesmo e-mail e senha que você usa no CRM. Só dono e gerente podem conectar.</p>
${erro ? `<div class="erro">${escHtml(erro)}</div>` : ""}
${ocultos}
<label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" required autofocus>
<label for="senha">Senha</label><input id="senha" name="senha" type="password" autocomplete="current-password" required>
<button type="submit">Entrar e conectar</button>
<div class="nota">O Claude vai poder <strong>apenas consultar</strong> os números e os leads do CRM. Ele não altera nem apaga nada.</div>
</form></body></html>`;
}

async function validarPedido(params) {
  if (params.response_type && params.response_type !== "code") return "Tipo de resposta não suportado.";
  const cliente = await carregarCliente(params.client_id);
  if (!cliente) return "Aplicativo desconhecido. Remova e adicione o conector de novo no Claude.";
  if (!cliente.redirect_uris.includes(params.redirect_uri)) return "Endereço de retorno não autorizado.";
  if (!params.code_challenge || (params.code_challenge_method || "S256") !== "S256") return "Pedido sem PKCE (S256).";
  return null;
}

mcpRouter.get("/oauth/authorize", async (req, res) => {
  const erro = await validarPedido(req.query);
  if (erro) return res.status(400).type("html").send(`<p style="font-family:sans-serif;padding:24px">${escHtml(erro)}</p>`);
  res.type("html").send(paginaLogin(req.query));
});

// Trava simples contra chute de senha: 8 tentativas erradas por IP+e-mail a cada 15 min.
const tentativas = new Map();
function bloqueadoPorTentativas(chave) {
  const agora = Date.now();
  const t = (tentativas.get(chave) || []).filter((x) => agora - x < 15 * 60 * 1000);
  tentativas.set(chave, t);
  return t.length >= 8;
}

mcpRouter.post("/oauth/authorize", async (req, res) => {
  const p = req.body || {};
  const erroPedido = await validarPedido(p);
  if (erroPedido) return res.status(400).type("html").send(`<p style="font-family:sans-serif;padding:24px">${escHtml(erroPedido)}</p>`);

  const email = String(p.email || "").trim().toLowerCase();
  const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
  const chave = `${ip}|${email}`;
  if (bloqueadoPorTentativas(chave)) {
    return res.status(429).type("html").send(paginaLogin(p, "Muitas tentativas. Espere 15 minutos e tente de novo."));
  }

  // Cliente próprio por login: não mistura sessão com o cliente compartilhado do backend.
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: login, error: erroLogin } = await sb.auth.signInWithPassword({ email, password: String(p.senha || "") });
  if (erroLogin || !login?.user) {
    tentativas.get(chave).push(Date.now());
    return res.status(401).type("html").send(paginaLogin(p, "E-mail ou senha incorretos."));
  }

  const { data: perfil } = await supabaseAdmin.from("perfis").select("id, nome, role, bloqueado, removido_em").eq("id", login.user.id).maybeSingle();
  if (!perfil || !["dono", "gerente"].includes(perfil.role) || perfil.bloqueado || perfil.removido_em) {
    return res.status(403).type("html").send(paginaLogin(p, "Seu usuário não tem permissão. Só dono e gerente podem conectar o Claude ao CRM."));
  }

  const codigo = aleatorio(32);
  const { error } = await supabaseAdmin.from("mcp_oauth_codigos").insert({
    codigo_hash: sha256(codigo),
    cliente_id: p.client_id,
    usuario_id: perfil.id,
    redirect_uri: p.redirect_uri,
    code_challenge: p.code_challenge,
    expira_em: new Date(Date.now() + CODE_TTL_S * 1000).toISOString(),
  });
  if (error) {
    console.error("[mcp] erro ao gravar código:", error.message);
    return res.status(500).type("html").send(paginaLogin(p, "Erro interno. Tente de novo."));
  }
  console.log(`[mcp] login ok: ${perfil.nome} (${perfil.role})`);
  const destino = new URL(p.redirect_uri);
  destino.searchParams.set("code", codigo);
  if (p.state) destino.searchParams.set("state", p.state);
  res.redirect(302, destino.toString());
});

// ---------------------------------------------------------------- token
async function emitirTokens(clienteId, usuarioId) {
  const access = aleatorio(32);
  const refresh = aleatorio(32);
  const agora = Date.now();
  const { error } = await supabaseAdmin.from("mcp_oauth_tokens").insert([
    { token_hash: sha256(access), tipo: "access", cliente_id: clienteId, usuario_id: usuarioId, expira_em: new Date(agora + ACCESS_TTL_S * 1000).toISOString() },
    { token_hash: sha256(refresh), tipo: "refresh", cliente_id: clienteId, usuario_id: usuarioId, expira_em: new Date(agora + REFRESH_TTL_S * 1000).toISOString() },
  ]);
  if (error) throw error;
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: "crm.leitura" };
}

function credenciaisCliente(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Basic ")) {
    const [id, secret] = Buffer.from(auth.slice(6), "base64").toString().split(":");
    return { id: decodeURIComponent(id || ""), secret: decodeURIComponent(secret || "") };
  }
  return { id: req.body?.client_id, secret: req.body?.client_secret };
}

mcpRouter.post("/oauth/token", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const b = req.body || {};
  const cred = credenciaisCliente(req);
  const cliente = await carregarCliente(cred.id);
  if (!cliente) return res.status(401).json({ error: "invalid_client" });
  if (cliente.secret_hash && sha256(cred.secret || "") !== cliente.secret_hash) return res.status(401).json({ error: "invalid_client" });

  try {
    if (b.grant_type === "authorization_code") {
      const { data: cod } = await supabaseAdmin.from("mcp_oauth_codigos").select("*").eq("codigo_hash", sha256(String(b.code || ""))).maybeSingle();
      if (!cod || cod.usado_em || new Date(cod.expira_em) < new Date() || cod.cliente_id !== cliente.id) {
        return res.status(400).json({ error: "invalid_grant" });
      }
      if (b.redirect_uri && b.redirect_uri !== cod.redirect_uri) return res.status(400).json({ error: "invalid_grant" });
      const desafio = crypto.createHash("sha256").update(String(b.code_verifier || "")).digest("base64url");
      if (desafio !== cod.code_challenge) return res.status(400).json({ error: "invalid_grant", error_description: "PKCE inválido" });
      // marca usado só se ainda não foi (corrida de dois pedidos com o mesmo código)
      const { data: marcado } = await supabaseAdmin.from("mcp_oauth_codigos").update({ usado_em: new Date().toISOString() })
        .eq("codigo_hash", cod.codigo_hash).is("usado_em", null).select("codigo_hash");
      if (!marcado?.length) return res.status(400).json({ error: "invalid_grant" });
      return res.json(await emitirTokens(cliente.id, cod.usuario_id));
    }

    if (b.grant_type === "refresh_token") {
      const hash = sha256(String(b.refresh_token || ""));
      const { data: tok } = await supabaseAdmin.from("mcp_oauth_tokens").select("*").eq("token_hash", hash).eq("tipo", "refresh").maybeSingle();
      if (!tok || tok.revogado_em || new Date(tok.expira_em) < new Date() || tok.cliente_id !== cliente.id) {
        return res.status(400).json({ error: "invalid_grant" });
      }
      const { data: revogado } = await supabaseAdmin.from("mcp_oauth_tokens").update({ revogado_em: new Date().toISOString() })
        .eq("token_hash", hash).is("revogado_em", null).select("token_hash");
      if (!revogado?.length) return res.status(400).json({ error: "invalid_grant" });
      return res.json(await emitirTokens(cliente.id, tok.usuario_id));
    }

    return res.status(400).json({ error: "unsupported_grant_type" });
  } catch (e) {
    console.error("[mcp] erro no token:", e?.message || e);
    return res.status(500).json({ error: "server_error" });
  }
});

// ---------------------------------------------------------------- servidor MCP
async function usuarioDoToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  const { data: tok } = await supabaseAdmin.from("mcp_oauth_tokens").select("usuario_id, expira_em, revogado_em")
    .eq("token_hash", sha256(auth.slice(7))).eq("tipo", "access").maybeSingle();
  if (!tok || tok.revogado_em || new Date(tok.expira_em) < new Date()) return null;
  return tok.usuario_id;
}

function negar(res) {
  res.status(401)
    .set("WWW-Authenticate", `Bearer resource_metadata="${PRM_URL}"`)
    .json({ jsonrpc: "2.0", error: { code: -32001, message: "Faça login no CRM OKA pra usar o conector." }, id: null });
}

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD");
const periodo = {
  data_inicio: dataISO.describe("Primeiro dia do período, AAAA-MM-DD (horário de Brasília)."),
  data_fim: dataISO.describe("Último dia do período, inclusive, AAAA-MM-DD."),
};
const SO_LEITURA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

// O que cada número significa — o dono já se confundiu comparando quadros que
// medem grupos diferentes (13/10), então isso vai junto em toda resposta.
const COMO_LER = {
  safra: "Resumo, funil e campanhas contam só os leads que ENTRARAM (foram criados) no período, e até onde cada um já chegou até hoje.",
  responderam: "Lead que mandou pelo menos 1 mensagem no WhatsApp. Quem chegou chamando direto no WhatsApp do corretor (origem 'WhatsApp') conta como respondeu por definição — ver responderam_whatsapp.",
  cobrar_doc: "Passou pela coluna COBRAR DOC ou PENDENTE (ou já foi pra análise).",
  documentacao: "= ANÁLISE DE CRÉDITO: entrou na coluna ANÁLISE DE CRÉDITO ou já tem resultado (APROVADO, REPROVADO, RESTRIÇÃO). COBRAR DOC não entra.",
  aprovados: "Crédito aprovado (coluna APROVADO, visto de crédito ou venda).",
  vendas_safra_x_fechadas: "vendas_safra = leads do período que já viraram venda; vendas_fechadas/valor_vendido = vendas com data de fechamento dentro do período (de qualquer lead).",
  primeiro_contato: "Minutos entre o lead chegar no corretor e a 1ª mensagem enviada (mediana).",
  devolvidos: "Leads devolvidos ao bolsão pelos corretores no período.",
  corretores: "recebidos = leads que o corretor ganhou no período (roleta, transferência ou rebatida puxada); tempo_resposta_min = mediana entre o cliente mandar mensagem e o corretor responder (sem o robô); carteira/atrasadas/parados = foto de agora.",
  follow_up: "Conta os leads que ENTRARAM NO ROBÔ no período, inclusive lead antigo puxado da rebatida — é outro grupo, não compare com o funil. respondeu = cliente respondeu ao robô; corretor_assumiu = o corretor parou o robô ANTES do cliente responder (assumiu a conversa ou tirou o card da coluna FOLLOW-UP AUTOMÁTICO); descartados = sequência terminou sem resposta e o lead foi descartado.",
};

function texto(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 1) }] };
}

async function rpc(nome, args) {
  const { data, error } = await supabaseAdmin.rpc(nome, args);
  if (error) throw new Error(error.message);
  return data;
}

function criarServidor(usuarioId) {
  const server = new McpServer(
    { name: "crm-oka", version: "1.0.0" },
    {
      instructions:
        "CRM OKA (imobiliária, Minha Casa Minha Vida). Ferramentas só de leitura. Datas em AAAA-MM-DD no horário de Brasília; " +
        "cada resposta traz 'hoje'. Antes de comparar números, leia 'como_ler': quadros diferentes medem grupos diferentes. " +
        "Responda em português, em linguagem de imobiliária, sem termos técnicos.",
    }
  );

  const executar = (nomeFerramenta, fn) => async (args) => {
    try {
      console.log(`[mcp] ${usuarioId} -> ${nomeFerramenta} ${JSON.stringify(args)}`);
      return await fn(args);
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `Não consegui consultar: ${e.message}` }] };
    }
  };

  server.registerTool(
    "resumo_do_periodo",
    {
      title: "Resumo do período",
      description: "Números gerais da imobiliária num período: leads que entraram (campanha x WhatsApp), quantos responderam, cobrar doc, análise de crédito, aprovados, visitas, vendas, tempo do 1º contato, caminho do lead (funil), motivos de devolução e pontos de atenção. Mesma conta do Dashboard do CRM.",
      inputSchema: periodo,
      annotations: SO_LEITURA,
    },
    executar("resumo_do_periodo", async ({ data_inicio, data_fim }) => {
      const d = await rpc("mcp_dashboard", { p_usuario: usuarioId, p_inicio: data_inicio, p_fim: data_fim });
      return texto({ hoje: hojeSP(), periodo: d.periodo, resumo: d.resumo, caminho_do_lead: d.funil, motivos_devolucao: d.motivos, pontos_de_atencao: d.alertas, como_ler: COMO_LER });
    })
  );

  server.registerTool(
    "desempenho_dos_corretores",
    {
      title: "Desempenho dos corretores",
      description: "Por corretor, no período: leads recebidos, devolvidos (e motivo mais comum), mensagens enviadas, conversas, tempo de resposta, visitas, vendas; e foto de agora: carteira, tarefas atrasadas, leads parados, leads no follow-up, WhatsApp conectado.",
      inputSchema: periodo,
      annotations: SO_LEITURA,
    },
    executar("desempenho_dos_corretores", async ({ data_inicio, data_fim }) => {
      const d = await rpc("mcp_dashboard", { p_usuario: usuarioId, p_inicio: data_inicio, p_fim: data_fim });
      return texto({ hoje: hojeSP(), periodo: d.periodo, corretores: d.corretores, como_ler: { corretores: COMO_LER.corretores } });
    })
  );

  server.registerTool(
    "campanhas",
    {
      title: "Qualidade das campanhas",
      description: "Por campanha/anúncio (origem do lead), dos leads que entraram no período: total, responderam, agendaram, análise de crédito, vendas, lead ruim (número errado, renda baixa, outra região), sem resposta e gasto lançado.",
      inputSchema: periodo,
      annotations: SO_LEITURA,
    },
    executar("campanhas", async ({ data_inicio, data_fim }) => {
      const d = await rpc("mcp_dashboard", { p_usuario: usuarioId, p_inicio: data_inicio, p_fim: data_fim });
      return texto({ hoje: hojeSP(), periodo: d.periodo, campanhas: d.campanhas, como_ler: { safra: COMO_LER.safra, documentacao: COMO_LER.documentacao } });
    })
  );

  server.registerTool(
    "follow_up_automatico",
    {
      title: "Follow-up automático",
      description: "O que o robô de follow-up fez no período: quantos entraram no robô, responderam, corretor parou o robô, descartados, erros, em qual mensagem o cliente mais responde e comparação por corretor. Opcionalmente filtra um corretor pelo nome.",
      inputSchema: { ...periodo, corretor: z.string().optional().describe("Nome (ou parte do nome) do corretor, opcional.") },
      annotations: SO_LEITURA,
    },
    executar("follow_up_automatico", async ({ data_inicio, data_fim, corretor }) => {
      let corretorId = null;
      if (corretor) {
        corretorId = await rpc("mcp_corretor_por_nome", { p_usuario: usuarioId, p_nome: corretor });
        if (!corretorId) return texto({ erro: `Não achei corretor com o nome "${corretor}".` });
      }
      const d = await rpc("mcp_followup", { p_usuario: usuarioId, p_inicio: data_inicio, p_fim: data_fim, p_corretor: corretorId });
      return texto({ hoje: hojeSP(), periodo: { data_inicio, data_fim }, follow_up: d, como_ler: { follow_up: COMO_LER.follow_up } });
    })
  );

  server.registerTool(
    "carteira_atual",
    {
      title: "Carteira de agora",
      description: "Foto de agora: quantos cards cada corretor tem em cada coluna do Kanban, tarefas atrasadas, se está na roleta e com WhatsApp conectado; rebatidas no bolsão e descartes/vendas aguardando aprovação.",
      inputSchema: {},
      annotations: SO_LEITURA,
    },
    executar("carteira_atual", async () => texto({ hoje: hojeSP(), ...(await rpc("mcp_carteira", { p_usuario: usuarioId })) }))
  );

  server.registerTool(
    "buscar_lead",
    {
      title: "Buscar lead",
      description: "Procura um lead pelo nome ou telefone (até 10 resultados) e mostra corretor, coluna, origem, datas, próximo contato, visita, renda, descarte, venda, últimos registros do histórico e últimas mensagens do WhatsApp.",
      inputSchema: { busca: z.string().min(3).describe("Nome (ou parte) ou telefone do lead.") },
      annotations: SO_LEITURA,
    },
    executar("buscar_lead", async ({ busca }) => texto({ hoje: hojeSP(), leads: await rpc("mcp_buscar_lead", { p_usuario: usuarioId, p_busca: busca }) }))
  );

  return server;
}

mcpRouter.post("/mcp", async (req, res) => {
  const usuarioId = await usuarioDoToken(req);
  if (!usuarioId) return negar(res);
  // Sem sessão (stateless): um servidor por requisição, nada fica em memória.
  const server = criarServidor(usuarioId);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error("[mcp] erro:", e?.message || e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Erro interno" }, id: null });
  }
});

const naoPermitido = async (req, res) => {
  if (!(await usuarioDoToken(req))) return negar(res);
  res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Método não permitido." }, id: null });
};
mcpRouter.get("/mcp", naoPermitido);
mcpRouter.delete("/mcp", naoPermitido);
