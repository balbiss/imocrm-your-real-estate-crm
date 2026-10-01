import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ChevronDown, Search } from "lucide-react";

// Filtro de campanha com várias ao mesmo tempo (Relatórios, pedido do dono
// 02/10). selecionadas vazia = todas as campanhas.
export function FiltroCampanhas({
  opcoes,
  selecionadas,
  onChange,
}: {
  opcoes: string[];
  selecionadas: string[];
  onChange: (v: string[]) => void;
}) {
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();
  const visiveis = useMemo(
    () => (termo ? opcoes.filter((o) => o.toLowerCase().includes(termo)) : opcoes),
    [opcoes, termo]
  );

  const rotulo =
    selecionadas.length === 0
      ? "Todas as campanhas"
      : selecionadas.length === 1
        ? selecionadas[0]
        : `${selecionadas.length} campanhas`;

  const alternar = (o: string) =>
    onChange(selecionadas.includes(o) ? selecionadas.filter((x) => x !== o) : [...selecionadas, o]);

  const todasVisiveisMarcadas = visiveis.length > 0 && visiveis.every((o) => selecionadas.includes(o));
  const marcarVisiveis = () =>
    onChange(
      todasVisiveisMarcadas
        ? selecionadas.filter((o) => !visiveis.includes(o))
        : Array.from(new Set([...selecionadas, ...visiveis]))
    );

  return (
    <Popover onOpenChange={(aberto) => { if (!aberto) setBusca(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`h-8 w-[180px] inline-flex items-center justify-between gap-2 rounded-md border px-3 text-[11px] font-bold bg-white ${
            selecionadas.length ? "border-primary/40 text-primary" : "border-input text-foreground"
          }`}
          title={selecionadas.length > 1 ? selecionadas.join("\n") : undefined}
        >
          <span className="truncate">{rotulo}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0">
        <div className="p-2 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar campanha (ex: cenarium)"
              className="h-8 pl-7 text-[12px]"
            />
          </div>
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 text-[11px]">
          <button type="button" onClick={marcarVisiveis} disabled={visiveis.length === 0} className="font-bold text-primary hover:underline disabled:opacity-40">
            {todasVisiveisMarcadas ? "Desmarcar" : "Marcar"} {termo ? `as ${visiveis.length} que aparecem` : "todas"}
          </button>
          {selecionadas.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="text-slate-500 hover:text-slate-800">
              Limpar ({selecionadas.length})
            </button>
          )}
        </div>
        <div className="max-h-[280px] overflow-y-auto py-1">
          {visiveis.length === 0 && <p className="px-3 py-4 text-center text-[11px] text-slate-400">Nenhuma campanha com esse nome.</p>}
          {visiveis.map((o) => (
            <label key={o} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-slate-50">
              <Checkbox checked={selecionadas.includes(o)} onCheckedChange={() => alternar(o)} />
              <span className="text-[12px] text-slate-700 truncate" title={o}>{o}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
