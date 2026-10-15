// WhatsApp API oficial (app Conecta Zap, Coexistência) -- 3ª via ao lado de WAHA e Baileys.
// O dono/gerente liga a oficial de cada corretor pelo Cadastro Incorporado da Meta (os números
// ficam no portfólio da imobiliária); o corretor conversa normal pelo chat.
import { call } from "@/lib/baileys";

export interface ConfigOficial {
  configurado: boolean;
  appId: string | null;
  configId: string | null;
}

export interface ConexaoOficial {
  id: string;
  user_id: string;
  phone_number_id: string;
  waba_id: string;
  numero: string | null;
  nome_verificado: string | null;
  ativa: boolean;
  erro: string | null;
  created_at: string;
}

export interface MembroEquipe {
  userId: string;
  nome: string;
  role: string;
  bloqueado: boolean;
  naoOficial: { provider: string; connected: boolean; numero: string | null } | null;
  oficial: ConexaoOficial | null;
}

export interface Modelo {
  id: string;
  nome: string;
  idioma: string;
  categoria: string;
  status: string;
  motivo: string | null;
  cabecalho: string | null;
  texto: string;
  rodape: string | null;
  botoes: string[];
  variaveis: number;
}

export interface SituacaoConversa {
  oficial: boolean;
  janelaAberta?: boolean;
  naoOficialNoAr?: boolean;
  nomeSugerido?: string;
}

let configCache: Promise<ConfigOficial> | null = null;
export function getConfigOficial(): Promise<ConfigOficial> {
  configCache ??= call<ConfigOficial>("/api/whatsapp-oficial/config").catch(() => {
    configCache = null;
    return { configurado: false, appId: null, configId: null };
  });
  return configCache;
}

export const getEquipe = () => call<MembroEquipe[]>("/api/whatsapp-oficial/equipe");

export const conectarOficial = (userId: string, cadastro: { code: string; wabaId: string; phoneNumberId?: string }) =>
  call<ConexaoOficial & { avisoSync?: string | null }>("/api/whatsapp-oficial/conectar", {
    method: "POST",
    body: JSON.stringify({ userId, ...cadastro }),
  });

export const desligarOficial = (userId: string) =>
  call(`/api/whatsapp-oficial/conexao/${userId}`, { method: "DELETE" });

export const getModelos = (wabaId?: string) =>
  call<{ contas: { wabaId: string; numeros: { numero: string | null; nome: string }[] }[]; wabaId: string | null; modelos: Modelo[] }>(
    "/api/whatsapp-oficial/modelos" + (wabaId ? `?waba=${encodeURIComponent(wabaId)}` : "")
  );

export const criarModelo = (m: {
  wabaId: string; nome: string; categoria: "UTILITY" | "MARKETING"; idioma: string; texto: string;
  exemplos: string[]; cabecalho: string | null; rodape: string | null; botoes: string[];
}) => call("/api/whatsapp-oficial/modelos", { method: "POST", body: JSON.stringify(m) });

export const apagarModelo = (wabaId: string, nome: string) =>
  call(`/api/whatsapp-oficial/modelos/${wabaId}/${encodeURIComponent(nome)}`, { method: "DELETE" });

export const getSituacaoConversa = (leadId: string) => call<SituacaoConversa>(`/api/whatsapp-oficial/conversa/${leadId}`);

export const getModelosDaConversa = (leadId: string) => call<Modelo[]>(`/api/whatsapp-oficial/conversa/${leadId}/modelos`);

export const enviarModeloNaConversa = (leadId: string, nome: string, idioma: string, valores: string[]) =>
  call<{ id: string | null; texto: string }>(`/api/whatsapp-oficial/conversa/${leadId}/modelo`, {
    method: "POST",
    body: JSON.stringify({ nome, idioma, valores }),
  });

// ------------------------- SDK do Facebook (Cadastro Incorporado) -------------------------
declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

let sdk: Promise<void> | null = null;
function carregarSdk(appId: string) {
  sdk ??= new Promise<void>((ok, erro) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" });
      ok();
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/pt_BR/sdk.js";
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => {
      sdk = null;
      erro(new Error("Não deu pra carregar o login da Meta (bloqueador de anúncios?)"));
    };
    document.body.appendChild(s);
  });
  return sdk;
}

// Abre o Cadastro Incorporado com Coexistência (número que já está no WhatsApp Business do
// celular) e devolve o que a Meta mandou de volta.
export async function cadastroIncorporado(cfg: ConfigOficial): Promise<{ code: string; wabaId: string; phoneNumberId?: string }> {
  await carregarSdk(cfg.appId!);
  return new Promise((ok, erro) => {
    let sessao: { wabaId?: string; phoneNumberId?: string } | null = null;
    let code: string | null = null;
    const fim = () => {
      if (code && sessao?.wabaId) {
        window.removeEventListener("message", ouvir);
        ok({ code, wabaId: sessao.wabaId, phoneNumberId: sessao.phoneNumberId });
      }
    };
    const ouvir = (ev: MessageEvent) => {
      if (!String(ev.origin).endsWith("facebook.com")) return;
      try {
        const d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (d?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (/^FINISH/.test(d.event)) {
          sessao = { wabaId: d.data?.waba_id, phoneNumberId: d.data?.phone_number_id };
          fim();
        } else if (d.event === "CANCEL") {
          window.removeEventListener("message", ouvir);
          erro(new Error(d.data?.current_step ? `Cadastro cancelado na etapa "${d.data.current_step}"` : "Cadastro cancelado"));
        } else if (d.event === "ERROR") {
          window.removeEventListener("message", ouvir);
          erro(new Error(d.data?.error_message || "A Meta deu erro no cadastro"));
        }
      } catch {
        /* mensagem que não é do cadastro */
      }
    };
    window.addEventListener("message", ouvir);
    window.FB.login(
      (r: any) => {
        if (r?.authResponse?.code) {
          code = r.authResponse.code;
          fim();
          setTimeout(() => {
            if (!sessao) {
              window.removeEventListener("message", ouvir);
              erro(new Error("A Meta não informou qual número foi conectado. Tente de novo."));
            }
          }, 8000);
        } else {
          window.removeEventListener("message", ouvir);
          erro(new Error("Login com a Meta não concluído"));
        }
      },
      {
        config_id: cfg.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3", version: "v4" },
      }
    );
  });
}

// "+55 91 98119-0130" a partir de só dígitos.
export function formatarNumero(n: string | null | undefined) {
  const d = String(n || "").replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  return d ? `+${d}` : "";
}
