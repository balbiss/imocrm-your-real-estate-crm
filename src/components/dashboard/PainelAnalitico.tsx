import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  FileCheck2,
  Handshake,
  MessageCircleReply,
  Repeat,
  Sparkles,
  UserPlus,
  BadgeCheck,
} from "lucide-react";

// Painel do Dashboard pra dono/gerente (pedido do dono, 01/10: "mais detalhes
// das métricas ... como se fosse um analista"). Todos os números vêm prontos
// de get_dashboard_analitico() (migration 20261002000000), calculados no banco
// numa chamada só. A comparação usa o período anterior de mesmo tamanho.

type Resumo = {
  entraram: number; recadastros: number; com_corretor: number; contatados: number; responderam: number;
  agendaram: number; visitaram: number; documentacao: number; aprovados: number; vendas_safra: number;
  primeiro_contato_mediana_min: number | null; pct_contato_5min: number | null;
  vendas_fechadas: number; valor_vendido: number; devolvidos: number; em_aberto_agora: number; sem_corretor_agora: number;
};
type Corretor = {
  id: string; nome: string; recebidos: number; devolvidos: number; motivo_top: string | null;
  mensagens_enviadas: number; leads_conversaram: number; tempo_resposta_min: number | null;
  visitas_marcadas: number; visitas_realizadas: number; vendas: number; carteira: number;
  atrasadas: number; parados: number; em_followup: number; whatsapp_conectado: boolean;
};
type Campanha = {
  origem: string; leads: number; responderam: number; agendaram: number; documentacao: number; vendas: number;
  numero_errado: number; renda_baixa: number; outra_regiao: number; sem_resposta: number; gasto: number | null;
};
type Analitico = {
  resumo: Resumo;
  funil: { etapa: string; qtd: number }[];
  corretores: Corretor[];
  campanhas: Campanha[];
  followup: {
    iniciados: number; respondeu: number; corretor_assumiu: number; descartados: number; erros: number;
    rodando: number; mensagens: number; por_passo: { passo: number; enviados: number; responderam: number }[];
  };
  motivos: { motivo: string; qtd: number }[];
  alertas: { nivel: "alto" | "medio"; texto: string }[];
};

const fmtInt = (n: number | null | undefined) => (n ?? 0).toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function fmtMin(min: number | null | undefined) {
  if (min == null) return "—";
  if (min < 1) return "< 1 min";
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 60 * 24) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m ? `${h}h ${m}min` : `${h}h`;
  }
  return `${(min / 1440).toFixed(1).replace(".", ",")} dias`;
}

async function buscar(inicio: string, fim: string): Promise<Analitico> {
  const { data, error } = await supabase.rpc("get_dashboard_analitico" as any, { p_inicio: inicio, p_fim: fim });
  if (error) throw error;
  return data as unknown as Analitico;
}

export function PainelAnalitico({
  dataInicio,
  dataFim,
  onAbrirCampanha,
}: {
  dataInicio: string;
  dataFim: string;
  onAbrirCampanha?: (origem: string) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-analitico", dataInicio, dataFim],
    queryFn: () => buscar(dataInicio, dataFim),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  if (error) {
    return (
      <Card className="border-none shadow-soft bg-white">
        <CardContent className="p-5 text-saas-sm text-red-600">
          Não foi possível carregar as métricas do período. Atualize a página; se continuar, me avise.
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-28 rounded-xl bg-slate-100/70 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 rounded-xl bg-slate-100/70 animate-pulse" />)}
        </div>
      </div>
    );
  }

  const r = data.resumo;

  return (
    <div className="space-y-6">
      <LeituraDoPeriodo alertas={data.alertas} resumo={r} />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi icon={UserPlus} rotulo="Leads que entraram" valor={fmtInt(r.entraram)}
          detalhe={r.recadastros ? `+ ${fmtInt(r.recadastros)} recadastros` : "no período"} />
        <Kpi icon={MessageCircleReply} rotulo="Responderam" valor={`${pct(r.responderam, r.entraram)}%`}
          detalhe={`${fmtInt(r.responderam)} de ${fmtInt(r.entraram)} leads`} />
        <Kpi icon={FileCheck2} rotulo="Documentação / crédito" valor={fmtInt(r.documentacao)}
          detalhe={`${pct(r.documentacao, r.entraram)}% dos que entraram`} />
        <Kpi icon={BadgeCheck} rotulo="Crédito aprovado" valor={fmtInt(r.aprovados)}
          detalhe={`${pct(r.aprovados, r.documentacao)}% da documentação`} />
        <Kpi icon={Handshake} rotulo="Vendas fechadas" valor={fmtInt(r.vendas_fechadas)}
          detalhe={r.valor_vendido ? brl(Number(r.valor_vendido)) : "no período"} destaque />
        <Kpi icon={Clock} rotulo="1º contato (mediana)" valor={fmtMin(r.primeiro_contato_mediana_min)}
          detalhe={r.pct_contato_5min != null ? `${r.pct_contato_5min}% em até 5 min` : "sem dados"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <CaminhoDoLead funil={data.funil} />
        <FollowupCard f={data.followup} />
      </div>

      <TabelaCorretores corretores={data.corretores} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <TabelaCampanhas campanhas={data.campanhas} onAbrirCampanha={onAbrirCampanha} />
        <MotivosCard motivos={data.motivos} total={r.devolvidos} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LeituraDoPeriodo({ alertas, resumo }: { alertas: Analitico["alertas"]; resumo: Resumo }) {
  const altos = alertas.filter((a) => a.nivel === "alto");
  const medios = alertas.filter((a) => a.nivel !== "alto");
  return (
    <Card className="border-none shadow-soft bg-white overflow-hidden">
      <div className="flex flex-col md:flex-row">
        <div className="md:w-64 shrink-0 p-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
            <Sparkles className="h-3.5 w-3.5" /> Leitura do período
          </div>
          <p className="mt-3 text-2xl font-bold leading-tight">
            {alertas.length === 0 ? "Tudo dentro do normal" : `${alertas.length} ponto${alertas.length > 1 ? "s" : ""} de atenção`}
          </p>
          <p className="mt-2 text-[11px] text-slate-300 leading-relaxed">
            {fmtInt(resumo.em_aberto_agora)} leads em atendimento agora
            {resumo.sem_corretor_agora ? ` · ${fmtInt(resumo.sem_corretor_agora)} do período sem corretor` : ""}
          </p>
        </div>
        <div className="flex-1 p-4 md:p-5">
          {alertas.length === 0 ? (
            <div className="h-full flex items-center gap-2 text-saas-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Nenhum WhatsApp desconectado, devolução fora da curva ou lead esquecido.
            </div>
          ) : (
            <ul className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-2.5">
              {[...altos, ...medios].map((a, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[12.5px] leading-snug text-slate-700">
                  <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${a.nivel === "alto" ? "bg-red-500" : "bg-amber-400"}`} />
                  {a.texto}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

// Pedido do dono (02/10): sem comparação com outra data -- só os números do
// período escolhido, com o detalhe embaixo pra entender os leads.
function Kpi({
  icon: Icon, rotulo, valor, detalhe, destaque,
}: {
  icon: any; rotulo: string; valor: string; detalhe: string; destaque?: boolean;
}) {
  return (
    <Card className={`border-none shadow-soft overflow-hidden ${destaque ? "bg-emerald-600 text-white" : "bg-white"}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${destaque ? "text-emerald-100" : "text-slate-400"}`}>{rotulo}</span>
          <Icon className={`h-3.5 w-3.5 ${destaque ? "text-emerald-100" : "text-slate-300"}`} />
        </div>
        <div className={`mt-2 text-[26px] leading-none font-bold tabular-nums ${destaque ? "text-white" : "text-slate-900"}`}>{valor}</div>
        <div className={`mt-2 text-[11px] leading-snug ${destaque ? "text-emerald-50" : "text-slate-500"}`}>{detalhe}</div>
      </CardContent>
    </Card>
  );
}

function CaminhoDoLead({ funil }: { funil: Analitico["funil"] }) {
  const base = funil[0]?.qtd || 0;
  return (
    <Card className="lg:col-span-7 border-none shadow-soft bg-white overflow-hidden">
      <CardHeader className="py-4 px-5 border-b border-slate-50">
        <CardTitle className="text-sm font-bold">Caminho do lead</CardTitle>
        <CardDescription className="text-saas-xs">
          Dos leads que entraram no período, até onde cada um já chegou. A seta mostra quantos passaram da etapa anterior.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5 space-y-2">
        {funil.map((e, i) => {
          const largura = base ? Math.max(1.5, (100 * e.qtd) / base) : 0;
          const anteriorQtd = i > 0 ? funil[i - 1].qtd : null;
          const conv = anteriorQtd ? pct(e.qtd, anteriorQtd) : null;
          // azul vai clareando conforme o lead avança no caminho
          return (
            <div key={e.etapa} className="grid grid-cols-[minmax(0,148px)_1fr_96px] items-center gap-3">
              <span className="text-[12px] font-semibold text-slate-600 truncate">{e.etapa}</span>
              <div className="h-7 rounded-md bg-slate-50 overflow-hidden">
                <div
                  className="h-full rounded-md flex items-center px-2 transition-[width] duration-700"
                  style={{ width: `${largura}%`, backgroundColor: `hsl(221 ${70 + i * 2}% ${30 + i * 6}%)` }}
                >
                  {largura > 12 && <span className="text-[11px] font-bold text-white tabular-nums">{fmtInt(e.qtd)}</span>}
                </div>
              </div>
              <div className="text-right leading-tight">
                <div className="text-[12px] font-bold text-slate-800 tabular-nums">
                  {largura <= 12 && <span className="mr-1">{fmtInt(e.qtd)} ·</span>}
                  {pct(e.qtd, base)}%
                </div>
                {conv != null && <div className="text-[10px] text-slate-400 tabular-nums whitespace-nowrap" title="Quantos passaram da etapa anterior pra esta">↳ {conv}% da anterior</div>}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function FollowupCard({ f }: { f: Analitico["followup"] }) {
  const maxTaxa = Math.max(1, ...f.por_passo.map((p) => pct(p.responderam, p.enviados)));
  return (
    <Card className="lg:col-span-5 border-none shadow-soft bg-white overflow-hidden">
      <CardHeader className="py-4 px-5 border-b border-slate-50">
        <CardTitle className="text-sm font-bold flex items-center gap-2"><Repeat className="h-3.5 w-3.5 text-violet-500" /> Follow-up automático</CardTitle>
        <CardDescription className="text-saas-xs">O que o robô fez com os leads que entraram nele no período.</CardDescription>
      </CardHeader>
      <CardContent className="p-5 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Entraram no robô", fmtInt(f.iniciados), `${fmtInt(f.mensagens)} mensagens enviadas`],
            ["Responderam", `${pct(f.respondeu, f.iniciados)}%`, `${fmtInt(f.respondeu)} leads`],
            ["Corretor assumiu", fmtInt(f.corretor_assumiu), "antes do fim da sequência"],
            ["Descartados no fim", fmtInt(f.descartados), f.erros ? `${fmtInt(f.erros)} travaram por erro` : `${fmtInt(f.rodando)} ainda rodando`],
          ].map(([rot, val, det]) => (
            <div key={rot} className="rounded-lg border border-slate-100 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{rot}</div>
              <div className="text-lg font-bold text-slate-900 tabular-nums">{val}</div>
              <div className="text-[10.5px] text-slate-500 truncate">{det}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Em qual mensagem o cliente responde</div>
          {f.por_passo.length === 0 && <p className="text-[11px] text-slate-400">Nenhuma mensagem enviada no período.</p>}
          <div className="space-y-1.5">
            {f.por_passo.map((p) => {
              const taxa = pct(p.responderam, p.enviados);
              return (
                <div key={p.passo} className="grid grid-cols-[64px_1fr_92px] items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-600">{p.passo}ª msg</span>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${(100 * taxa) / maxTaxa}%` }} />
                  </div>
                  <span className="text-[10.5px] text-slate-500 text-right tabular-nums">{taxa}% de {fmtInt(p.enviados)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type ColCorretor = { chave: keyof Corretor | "taxa"; rotulo: string; dica: string; alerta?: (c: Corretor) => boolean };

function TabelaCorretores({ corretores }: { corretores: Corretor[] }) {
  const [ordem, setOrdem] = useState<{ chave: ColCorretor["chave"]; desc: boolean }>({ chave: "recebidos", desc: true });

  const cols: ColCorretor[] = [
    { chave: "recebidos", rotulo: "Recebidos", dica: "Leads que ele(a) recebeu no período (roleta, transferência, rebatida)" },
    { chave: "leads_conversaram", rotulo: "Conversaram", dica: "Leads que mandaram mensagem pra ele(a) no período" },
    { chave: "tempo_resposta_min", rotulo: "Tempo de resposta", dica: "Mediana do tempo entre o cliente mandar mensagem e o corretor responder (sem contar o robô)",
      alerta: (c) => (c.tempo_resposta_min ?? 0) > 60 },
    { chave: "devolvidos", rotulo: "Devolvidos", dica: "Leads que ele(a) devolveu pro bolsão no período",
      alerta: (c) => c.recebidos > 0 && c.devolvidos > c.recebidos },
    { chave: "visitas_marcadas", rotulo: "Visitas", dica: "Visitas/FID marcadas pra datas dentro do período (realizadas entre parênteses)" },
    { chave: "vendas", rotulo: "Vendas", dica: "Vendas fechadas no período" },
    { chave: "carteira", rotulo: "Carteira", dica: "Leads com ele(a) agora, em atendimento" },
    { chave: "atrasadas", rotulo: "Atrasadas", dica: "Tarefas com data de próximo contato vencida", alerta: (c) => c.atrasadas >= 20 },
    { chave: "parados", rotulo: "Parados 3+ dias", dica: "Leads sem nenhuma ação há mais de 3 dias e sem tarefa futura", alerta: (c) => c.parados >= 20 },
  ];

  const linhas = useMemo(() => {
    const v = (c: Corretor) => (ordem.chave === "taxa" ? 0 : (c[ordem.chave as keyof Corretor] as any) ?? -1);
    return [...corretores].sort((a, b) => {
      const x = v(a), y = v(b);
      if (typeof x === "string") return ordem.desc ? String(y).localeCompare(x) : x.localeCompare(String(y));
      return ordem.desc ? y - x : x - y;
    });
  }, [corretores, ordem]);

  const max = Math.max(1, ...corretores.map((c) => c.recebidos));

  return (
    <Card className="border-none shadow-soft bg-white overflow-hidden">
      <CardHeader className="py-4 px-5 border-b border-slate-50">
        <CardTitle className="text-sm font-bold">Desempenho por corretor</CardTitle>
        <CardDescription className="text-saas-xs">
          O que cada um fez no período e como está a carteira agora. Clique no título de uma coluna pra ordenar; em vermelho, o que pede atenção.
        </CardDescription>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Corretor</th>
              {cols.map((c) => (
                <th key={c.chave} className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    title={c.dica}
                    onClick={() => setOrdem((o) => ({ chave: c.chave, desc: o.chave === c.chave ? !o.desc : true }))}
                    className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${ordem.chave === c.chave ? "text-slate-700" : "text-slate-400 hover:text-slate-600"}`}
                  >
                    {c.rotulo}
                    {ordem.chave === c.chave ? (ordem.desc ? <ArrowDown className="h-2.5 w-2.5" /> : <ArrowUp className="h-2.5 w-2.5" />) : <ArrowUpDown className="h-2.5 w-2.5 opacity-40" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {linhas.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      title={c.whatsapp_conectado ? "WhatsApp conectado ao CRM" : "WhatsApp DESCONECTADO do CRM"}
                      className={`h-2 w-2 rounded-full shrink-0 ${c.whatsapp_conectado ? "bg-emerald-500" : "bg-red-500 animate-pulse"}`}
                    />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-bold text-slate-800 truncate max-w-[180px]">{c.nome}</div>
                      <div className="mt-1 h-1 w-28 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-primary/70 rounded-full" style={{ width: `${(100 * c.recebidos) / max}%` }} />
                      </div>
                    </div>
                  </div>
                </td>
                {cols.map((col) => {
                  const ruim = col.alerta?.(c);
                  let conteudo: React.ReactNode = fmtInt(c[col.chave as keyof Corretor] as number);
                  if (col.chave === "tempo_resposta_min") conteudo = fmtMin(c.tempo_resposta_min);
                  if (col.chave === "visitas_marcadas") conteudo = <>{fmtInt(c.visitas_marcadas)} <span className="text-slate-400">({fmtInt(c.visitas_realizadas)})</span></>;
                  if (col.chave === "devolvidos") conteudo = <span title={c.motivo_top ? `Motivo mais comum: ${c.motivo_top}` : undefined}>{fmtInt(c.devolvidos)}</span>;
                  return (
                    <td key={col.chave} className={`px-3 py-3 text-right text-[12.5px] tabular-nums ${ruim ? "text-red-600 font-bold" : "text-slate-700"} ${col.chave === "vendas" && c.vendas > 0 ? "text-emerald-600 font-bold" : ""}`}>
                      {conteudo}
                    </td>
                  );
                })}
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr><td colSpan={cols.length + 1} className="px-5 py-8 text-center text-saas-xs text-slate-400">Nenhuma atividade de corretor no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TabelaCampanhas({ campanhas, onAbrirCampanha }: { campanhas: Campanha[]; onAbrirCampanha?: (origem: string) => void }) {
  const [todas, setTodas] = useState(false);
  const lista = todas ? campanhas : campanhas.slice(0, 10);
  return (
    <Card className="lg:col-span-8 border-none shadow-soft bg-white overflow-hidden">
      <CardHeader className="py-4 px-5 border-b border-slate-50">
        <CardTitle className="text-sm font-bold">Qualidade das campanhas</CardTitle>
        <CardDescription className="text-saas-xs">
          Leads que entraram por cada campanha no período e até onde chegaram. "Lead ruim" = descartado por número errado, renda baixa ou outra região.
          Gasto vem do que foi lançado em Relatórios.
        </CardDescription>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <th className="px-5 py-2.5">Campanha</th>
              <th className="px-3 py-2.5 text-right">Leads</th>
              <th className="px-3 py-2.5">Responderam</th>
              <th className="px-3 py-2.5 text-right">Docs</th>
              <th className="px-3 py-2.5 text-right">Vendas</th>
              <th className="px-3 py-2.5 text-right">Lead ruim</th>
              <th className="px-3 py-2.5 text-right">Custo/lead</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {lista.map((c) => {
              const taxa = pct(c.responderam, c.leads);
              const ruins = c.numero_errado + c.renda_baixa + c.outra_regiao;
              const pctRuim = pct(ruins, c.leads);
              return (
                <tr key={c.origem} onClick={() => onAbrirCampanha?.(c.origem)} className={`transition-colors ${onAbrirCampanha ? "cursor-pointer hover:bg-slate-50/60" : ""}`}>
                  <td className="px-5 py-2.5 text-[12px] font-semibold text-slate-700 max-w-[240px] truncate" title={c.origem}>{c.origem}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] font-bold tabular-nums text-slate-800">{fmtInt(c.leads)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full ${taxa >= 50 ? "bg-emerald-500" : taxa >= 25 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${taxa}%` }} />
                      </div>
                      <span className="text-[11px] tabular-nums text-slate-600">{taxa}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-slate-700">{fmtInt(c.documentacao)}</td>
                  <td className={`px-3 py-2.5 text-right text-[12px] tabular-nums ${c.vendas ? "text-emerald-600 font-bold" : "text-slate-400"}`}>{fmtInt(c.vendas)}</td>
                  <td className={`px-3 py-2.5 text-right text-[12px] tabular-nums ${pctRuim >= 30 && c.leads >= 10 ? "text-red-600 font-bold" : "text-slate-500"}`}>{ruins ? `${pctRuim}%` : "—"}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-slate-600">
                    {c.gasto && Number(c.gasto) > 0 ? brl(Number(c.gasto) / c.leads) : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              );
            })}
            {campanhas.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-saas-xs text-slate-400">Nenhum lead entrou no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {campanhas.length > 10 && (
        <button type="button" onClick={() => setTodas((v) => !v)} className="w-full py-2.5 text-[11px] font-bold text-primary hover:bg-slate-50 border-t border-slate-50">
          {todas ? "Mostrar só as 10 maiores" : `Ver todas as ${campanhas.length} campanhas`}
        </button>
      )}
    </Card>
  );
}

function MotivosCard({ motivos, total }: { motivos: Analitico["motivos"]; total: number }) {
  const soma = motivos.reduce((s, m) => s + m.qtd, 0) || 1;
  return (
    <Card className="lg:col-span-4 border-none shadow-soft bg-white overflow-hidden">
      <CardHeader className="py-4 px-5 border-b border-slate-50">
        <CardTitle className="text-sm font-bold flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Por que os leads são devolvidos</CardTitle>
        <CardDescription className="text-saas-xs">{fmtInt(total)} devoluções feitas por corretores no período, mais os descartes do robô.</CardDescription>
      </CardHeader>
      <CardContent className="p-5 space-y-2.5">
        {motivos.length === 0 && <p className="text-[11px] text-slate-400">Nenhuma devolução no período.</p>}
        {motivos.slice(0, 9).map((m) => (
          <div key={m.motivo}>
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-slate-600 truncate pr-2">{m.motivo}</span>
              <span className="font-bold text-slate-800 tabular-nums">{fmtInt(m.qtd)} <span className="font-normal text-slate-400">· {pct(m.qtd, soma)}%</span></span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-amber-400" style={{ width: `${(100 * m.qtd) / motivos[0].qtd}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
