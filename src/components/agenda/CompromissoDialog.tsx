import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Compromisso da equipe que não é de lead (reunião, treinamento...). Pedido
// do dono 02/10: todos criam, aparece pra todos, aviso no sino 1h antes
// (cron avisar_compromissos_equipe, migration 20261002010000).

export type Compromisso = {
  id: string;
  titulo: string;
  tipo: "reuniao" | "treinamento" | "outro";
  inicio: string;
  fim: string | null;
  local: string | null;
  observacao: string | null;
  criado_por: string;
  criador?: { nome: string } | null;
};

export const TIPO_COMPROMISSO_LABEL: Record<Compromisso["tipo"], string> = {
  reuniao: "Reunião",
  treinamento: "Treinamento",
  outro: "Compromisso",
};

export function CompromissoDialog({
  open,
  onOpenChange,
  compromisso,
  imobiliariaId,
  userId,
  podeEditarTodos,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  compromisso: Compromisso | null; // null = novo
  imobiliariaId: string | undefined;
  userId: string | undefined;
  podeEditarTodos: boolean; // dono/gerente
}) {
  const queryClient = useQueryClient();
  const novo = !compromisso;
  const podeEditar = novo || podeEditarTodos || compromisso?.criado_por === userId;

  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<Compromisso["tipo"]>("reuniao");
  const [data, setData] = useState("");
  const [horaInicio, setHoraInicio] = useState("09:00");
  const [horaFim, setHoraFim] = useState("");
  const [local, setLocal] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!open) return;
    if (compromisso) {
      const ini = new Date(compromisso.inicio);
      setTitulo(compromisso.titulo);
      setTipo(compromisso.tipo);
      setData(format(ini, "yyyy-MM-dd"));
      setHoraInicio(format(ini, "HH:mm"));
      setHoraFim(compromisso.fim ? format(new Date(compromisso.fim), "HH:mm") : "");
      setLocal(compromisso.local || "");
      setObservacao(compromisso.observacao || "");
    } else {
      setTitulo("");
      setTipo("reuniao");
      setData(format(new Date(), "yyyy-MM-dd"));
      setHoraInicio("09:00");
      setHoraFim("");
      setLocal("");
      setObservacao("");
    }
  }, [open, compromisso]);

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["compromissos-equipe"] });
  };

  const salvar = useMutation({
    mutationFn: async () => {
      if (!titulo.trim()) throw new Error("Dê um título ao compromisso.");
      if (!data || !horaInicio) throw new Error("Escolha a data e o horário de início.");
      const inicio = new Date(`${data}T${horaInicio}`);
      if (isNaN(inicio.getTime())) throw new Error("Data ou horário inválido.");
      let fim: Date | null = null;
      if (horaFim) {
        fim = new Date(`${data}T${horaFim}`);
        if (fim <= inicio) throw new Error("O horário de término precisa ser depois do início.");
      }
      const campos = {
        titulo: titulo.trim(),
        tipo,
        inicio: inicio.toISOString(),
        fim: fim ? fim.toISOString() : null,
        local: local.trim() || null,
        observacao: observacao.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (novo) {
        const { error } = await supabase.from("compromissos_equipe" as any).insert({
          ...campos,
          imobiliaria_id: imobiliariaId,
          criado_por: userId,
        });
        if (error) throw error;
      } else {
        // Mudou o horário: o aviso de 1h antes precisa sair de novo.
        const mudouHorario = new Date(compromisso!.inicio).getTime() !== inicio.getTime();
        const { error } = await supabase
          .from("compromissos_equipe" as any)
          .update({ ...campos, ...(mudouHorario ? { aviso_enviado_em: null } : {}) })
          .eq("id", compromisso!.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidar();
      toast.success(novo ? "Compromisso agendado pra equipe." : "Compromisso atualizado.");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message || "Não foi possível salvar o compromisso."),
  });

  const cancelar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("compromissos_equipe" as any)
        .update({ cancelado_em: new Date().toISOString() })
        .eq("id", compromisso!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Compromisso cancelado.");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message || "Não foi possível cancelar o compromisso."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold">
            {novo ? "Novo compromisso da equipe" : podeEditar ? "Editar compromisso" : "Compromisso da equipe"}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            {novo
              ? "Aparece pra toda a equipe na lista de Tarefas e no calendário. Todo mundo recebe um aviso no sino 1 hora antes."
              : `Criado por ${compromisso?.criador?.nome || "alguém da equipe"}.${podeEditar ? "" : " Só quem criou, o dono ou o gerente podem alterar."}`}
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={!podeEditar} className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase text-slate-500">Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Treinamento Cenarium" className="h-9 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-500">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as Compromisso["tipo"])} disabled={!podeEditar}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reuniao">Reunião</SelectItem>
                  <SelectItem value="treinamento">Treinamento</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-500">Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-500">Começa às</Label>
              <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase text-slate-500">Termina às (opcional)</Label>
              <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase text-slate-500">Local ou link (opcional)</Label>
            <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex: Escritório, ou link do Meet" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase text-slate-500">Observação (opcional)</Label>
            <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Pauta, o que levar..." className="text-sm min-h-[64px]" />
          </div>
        </fieldset>

        <DialogFooter className="pt-3 border-t border-slate-100 gap-2 sm:justify-between">
          <div>
            {!novo && podeEditar && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs font-bold"
                disabled={cancelar.isPending}
                onClick={() => { if (confirm("Cancelar este compromisso? Ele some da agenda de toda a equipe.")) cancelar.mutate(); }}
              >
                Cancelar compromisso
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" className="text-xs font-bold" onClick={() => onOpenChange(false)}>
              {podeEditar ? "Fechar" : "Ok"}
            </Button>
            {podeEditar && (
              <Button type="button" size="sm" className="text-xs font-bold px-5" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
                {salvar.isPending ? "Salvando..." : novo ? "Agendar pra equipe" : "Salvar"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
