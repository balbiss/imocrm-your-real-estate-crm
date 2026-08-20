import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Corretor fica "online" na roleta enquanto o toggle status_roleta estiver
// ligado — sem expirar sozinho por inatividade (removido a pedido do dono:
// derrubava corretores ativos que só não tinham reclicado "check-in").
export function isCorretorOnlineNaRoleta(statusRoleta: boolean | null | undefined, ultimoCheckin: string | null | undefined): boolean {
  return !!statusRoleta;
}

// Horário fixo da próxima cadência de chamada (especificação formal do
// dono, 04/08 — substitui a regra de 12h/16:30/11:00 anterior): executada
// antes das 13h -> mesmo dia às 17:00; executada a partir das 13h ->
// dia seguinte às 11:00 (pulando pra segunda-feira se cair domingo).
// Exceção (17/08): aos sábados os corretores saem às 15h, então mesmo uma
// chamada feita antes das 13h não pode agendar retorno pra 17h do mesmo
// dia — sábado sempre cai no mesmo ramo de "próximo dia útil às 11h" (que
// já pula domingo e cai em segunda-feira).
export function calcularProximaCadencia(agora: Date = new Date()): Date {
  const proxima = new Date(agora);
  const isSabado = agora.getDay() === 6;
  if (agora.getHours() < 13 && !isSabado) {
    proxima.setHours(17, 0, 0, 0);
  } else {
    proxima.setDate(proxima.getDate() + 1);
    proxima.setHours(11, 0, 0, 0);
    if (proxima.getDay() === 0) {
      proxima.setDate(proxima.getDate() + 1);
    }
  }
  return proxima;
}

// Deriva o status "retrocompatível" (usado em dashboard/relatórios) a partir
// da coluna de kanban real do lead — as colunas são livremente renomeadas/
// reordenadas por cada imobiliária, então isso tenta casar pelo nome antes
// de cair num fallback por posição relativa.
export function getRetrocompatibleStatus(nomeColuna: string, posicao: number, total: number): string {
  const nomeNormalized = nomeColuna.toLowerCase().trim();

  if (nomeNormalized.includes("novo") || nomeNormalized.includes("triagem") || nomeNormalized.includes("entrada")) return "novo";
  if (nomeNormalized.includes("rebatida")) return "rebatida";
  if (nomeNormalized.includes("tarefa") || nomeNormalized.includes("dia")) return "tarefas";
  if (nomeNormalized.includes("agenda") || nomeNormalized.includes("reunião")) return "agendado";
  if (nomeNormalized.includes("visita")) return "visitou";
  if (nomeNormalized.includes("cobrar") || nomeNormalized.includes("document")) return "cobrar_doc";
  if (nomeNormalized.includes("pendente")) return "pendente";
  if (nomeNormalized.includes("aprovado") || nomeNormalized.includes("fechamento")) return "aprovado";
  if (nomeNormalized.includes("reprovado") || nomeNormalized.includes("perdido")) return "reprovado";
  if (nomeNormalized.includes("futuro") || nomeNormalized.includes("frio") || nomeNormalized.includes("arquivado")) return "futuros";

  const ratio = posicao / Math.max(total - 1, 1);
  if (ratio < 0.15) return "novo";
  if (ratio < 0.3) return "rebatida";
  if (ratio < 0.45) return "tarefas";
  if (ratio < 0.6) return "agendado";
  if (ratio < 0.7) return "visitou";
  if (ratio < 0.8) return "cobrar_doc";
  if (ratio < 0.9) return "pendente";
  return "futuros";
}

// Normaliza nome de cidade/bairro pra comparação (remove acento, caixa e
// espaços extras) — "Taubate" e "Taubaté" (ou "  Taubaté  ") devem contar
// como a mesma cidade nos filtros, mesmo com o dado salvo de forma
// inconsistente no banco (vários pontos de entrada de lead diferentes:
// cadastro manual, WhatsApp, Facebook).
export function normalizarCidade(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Deduplica uma lista de cidades/bairros por valor normalizado, mantendo
// a grafia mais frequente (e, em empate, a primeira em ordem alfabética)
// como rótulo exibido — evita duas opções pra mesma cidade no filtro.
export function dedupCidades(valores: (string | null | undefined)[]): string[] {
  const contagem = new Map<string, Map<string, number>>();
  for (const valor of valores) {
    if (!valor) continue;
    const norm = normalizarCidade(valor);
    if (!norm) continue;
    const variantes = contagem.get(norm) ?? new Map<string, number>();
    variantes.set(valor, (variantes.get(valor) ?? 0) + 1);
    contagem.set(norm, variantes);
  }
  const resultado: string[] = [];
  for (const variantes of contagem.values()) {
    let melhor: string | null = null;
    let melhorCount = -1;
    for (const [valor, count] of variantes.entries()) {
      if (count > melhorCount || (count === melhorCount && (melhor === null || valor.localeCompare(melhor) < 0))) {
        melhor = valor;
        melhorCount = count;
      }
    }
    if (melhor) resultado.push(melhor);
  }
  return resultado.sort((a, b) => a.localeCompare(b));
}

// Inverso: acha a coluna de kanban que representa um dado status
// retrocompatível, pra manter coluna_kanban_id e status sincronizados
// quando o codigo muda o status "por baixo dos panos" (ex: rebatida em
// lote, avanco de cadencia de chamada) sem o usuario arrastar o card.
export function getColunaPorStatus<T extends { nome: string; posicao: number; id: string }>(
  colunas: T[] | undefined | null,
  status: string
): T | undefined {
  if (!colunas || colunas.length === 0) return undefined;
  return colunas.find((c) => getRetrocompatibleStatus(c.nome, c.posicao, colunas.length) === status);
}
