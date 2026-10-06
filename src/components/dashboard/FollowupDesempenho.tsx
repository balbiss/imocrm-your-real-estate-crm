import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Repeat } from "lucide-react";

// Follow-up automático no Dashboard (pedido do dono 06/10): filtro por
// corretor + tabela comparando os corretores ("ver qual corretor está com o
// melhor follow-up"), e o corretor vendo o quadro só com os leads dele.
// Dados de get_followup_desempenho() (migration 20261006000000) -- o banco
// força o corretor a ver só o próprio, mesmo que peça outro.

type Geral = {
  iniciados: number; respondeu: number; corretor_assumiu: number; descartados: number;
  concluidos_sem_resposta: number; erros: number; rodando: number; mensagens: number;
};
type PorCorretor = { id: string; nome: string; iniciados: number; respondeu: number; corretor_assumiu: number; descartados: number; erros: number; rodando: number };
type Resp = { geral: Geral; por_passo: { passo: number; enviados: number; responderam: number }[]; por_corretor: PorCorretor[] };

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);

export function FollowupDesempenho({
  dataInicio,
  dataFim,
  isManager,
  className = "",
}: {
  dataInicio: string;
  dataFim: string;
  isManager: boolean;
  className?: string;
}) {
  const [corretor, setCorretor] = useState<string>("todos");
  const corretorParam = isManager && corretor !== "todos" ? corretor : null;

  const { data, isLoading } = useQuery({
    queryKey: ["followup-desempenho", dataInicio, dataFim, corretorParam],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_followup_desempenho" as any, {
        p_inicio: dataInicio,
        p_fim: dataFim,
        p_corretor: corretorParam,
      });
      if (error) throw error;
      return data as unknown as Resp;
    },
    staleTime: 60_000,
  });

  // Lista de corretores pro filtro vem da própria tabela "todos" (quem teve follow-up no período).
  const { data: todos } = useQuery({
    queryKey: ["followup-desempenho", dataInicio, dataFim, null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_followup_desempenho" as any, { p_inicio: dataInicio, p_fim: dataFim, p_corretor: null });
      if (error) throw error;
      return data as unknown as Resp;
    },
    enabled: isManager,
    staleTime: 60_000,
  });

  const f = data?.geral;
  const passos = data?.por_passo || [];
  const maxTaxa = Math.max(1, ...passos.map((p) => pct(p.responderam, p.enviados)));
  const ranking = (data?.por_corretor || []).filter((c) => c.iniciados > 0);
  const melhorTaxa = Math.max(0, ...ranking.filter((c) => c.iniciados >= 10).map((c) => pct(c.respondeu, c.iniciados)));

  return (
    <Card className={`border-none shadow-soft bg-white overflow-hidden ${className}`}>
      <CardHeader className="py-4 px-5 border-b border-slate-50 flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-sm font-bold flex items-center gap-2"><Repeat className="h-3.5 w-3.5 text-violet-500" /> Follow-up automático</CardTitle>
          <CardDescription className="text-saas-xs mt-1">
            {isManager ? "O que o robô fez com os leads que entraram nele no período." : "O que o robô fez com os SEUS leads que entraram nele no período."}
          </CardDescription>
        </div>
        {isManager && (
          <Select value={corretor} onValueChange={setCorretor}>
            <SelectTrigger className="h-8 w-[170px] text-[11px] font-bold shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os corretores</SelectItem>
              {(todos?.por_corretor || []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardHeader>
      <CardContent className="p-5 space-y-5">
        {isLoading || !f ? (
          <div className="h-40 rounded-lg bg-slate-50 animate-pulse" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Entraram no robô", fmt(f.iniciados), `${fmt(f.mensagens)} mensagens enviadas`],
                ["Responderam", `${pct(f.respondeu, f.iniciados)}%`, `${fmt(f.respondeu)} leads`],
                ["Corretor assumiu", fmt(f.corretor_assumiu), "antes do fim da sequência"],
                ["Descartados no fim", fmt(f.descartados), f.erros ? `${fmt(f.erros)} travaram por erro` : `${fmt(f.rodando)} ainda rodando`],
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
              {passos.length === 0 && <p className="text-[11px] text-slate-400">Nenhuma mensagem enviada no período.</p>}
              <div className="space-y-1.5">
                {passos.map((p) => {
                  const taxa = pct(p.responderam, p.enviados);
                  return (
                    <div key={p.passo} className="grid grid-cols-[64px_1fr_92px] items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-600">{p.passo}ª msg</span>
                      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-violet-500" style={{ width: `${(100 * taxa) / maxTaxa}%` }} />
                      </div>
                      <span className="text-[10.5px] text-slate-500 text-right tabular-nums">{taxa}% de {fmt(p.enviados)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {isManager && corretor === "todos" && ranking.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Comparando os corretores</div>
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full min-w-[420px] text-left">
                    <thead>
                      <tr className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                        <th className="px-1 py-1.5">Corretor</th>
                        <th className="px-1 py-1.5 text-right">No robô</th>
                        <th className="px-1 py-1.5 text-right">Responderam</th>
                        <th className="px-1 py-1.5 text-right">Assumiu</th>
                        <th className="px-1 py-1.5 text-right">Descartados</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {ranking.map((c) => {
                        const taxa = pct(c.respondeu, c.iniciados);
                        const melhor = c.iniciados >= 10 && taxa === melhorTaxa && taxa > 0;
                        return (
                          <tr key={c.id} className="text-[12px] tabular-nums">
                            <td className="px-1 py-1.5 font-semibold text-slate-700 truncate max-w-[140px]">
                              <button type="button" className="hover:text-primary hover:underline text-left" onClick={() => setCorretor(c.id)}>{c.nome}</button>
                            </td>
                            <td className="px-1 py-1.5 text-right text-slate-600">{fmt(c.iniciados)}</td>
                            <td className={`px-1 py-1.5 text-right font-bold ${melhor ? "text-emerald-600" : "text-slate-700"}`}>
                              {taxa}% <span className="font-normal text-slate-400">({fmt(c.respondeu)})</span>
                            </td>
                            <td className="px-1 py-1.5 text-right text-slate-600">{fmt(c.corretor_assumiu)}</td>
                            <td className="px-1 py-1.5 text-right text-slate-600">{fmt(c.descartados)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400">Em verde, a maior taxa de resposta (entre quem teve 10+ leads no robô). Clique num nome pra ver só o follow-up dele.</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
