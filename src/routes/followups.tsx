import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, Repeat, Trash2, Edit, ArrowUp, ArrowDown, Copy, UserX } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/followups")({
  head: () => ({ meta: [{ title: "Follow-ups — CRM" }] }),
  component: FollowupsPage,
});

const ATRASOS = [
  { label: "Imediatamente", min: 0 },
  { label: "30 minutos depois", min: 30 },
  { label: "1 hora depois", min: 60 },
  { label: "2 horas depois", min: 120 },
  { label: "4 horas depois", min: 240 },
  { label: "1 dia depois", min: 1440 },
  { label: "2 dias depois", min: 2880 },
  { label: "3 dias depois", min: 4320 },
  { label: "7 dias depois", min: 10080 },
];

const VARIAVEIS = ["{nome}", "{corretor}", "{origem}", "{bairro}"];

type PassoForm = { conteudo: string; atraso_minutos: number; so_horario_comercial: boolean };

function atrasoLabel(min: number, primeiro: boolean) {
  const found = ATRASOS.find((a) => a.min === min);
  const base = found ? found.label : `${min} min depois`;
  if (min === 0) return primeiro ? "Assim que iniciar" : "Logo após o passo anterior";
  return primeiro ? base.replace("depois", "após iniciar") : base + " (do passo anterior)";
}

function FollowupsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [eGeral, setEGeral] = useState(false);
  const [aoEsgotar, setAoEsgotar] = useState<"nada" | "descartar">("nada");
  const [passos, setPassos] = useState<PassoForm[]>([]);

  const { data: fluxos, isLoading } = useQuery({
    queryKey: ["followup-fluxos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("followup_fluxos" as any)
        .select("*, followup_passos(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]).map((f) => ({
        ...f,
        followup_passos: [...(f.followup_passos || [])].sort((a: any, b: any) => a.ordem - b.ordem),
      }));
    },
  });

  function abrirNovo() {
    setEditing(null);
    setNome("");
    setAtivo(false);
    setEGeral(false);
    setAoEsgotar("nada");
    setPassos([{ conteudo: "", atraso_minutos: 0, so_horario_comercial: true }]);
    setIsOpen(true);
  }

  function carregarNoForm(f: any, opts: { comoNovo?: boolean } = {}) {
    setEditing(opts.comoNovo ? null : f);
    setNome(opts.comoNovo ? `${f.nome || "Fluxo"} (minha cópia)` : f.nome || "");
    setAtivo(opts.comoNovo ? false : !!f.ativo);
    setEGeral(opts.comoNovo ? false : !!f.e_geral);
    setAoEsgotar((f.ao_esgotar as "nada" | "descartar") || "nada");
    setPassos(
      (f.followup_passos || []).map((p: any) => ({
        conteudo: p.conteudo || "",
        atraso_minutos: p.atraso_minutos ?? 0,
        so_horario_comercial: p.so_horario_comercial ?? true,
      }))
    );
    setIsOpen(true);
  }
  const abrirEdicao = (f: any) => carregarNoForm(f);
  const usarComoBase = (f: any) => carregarNoForm(f, { comoNovo: true });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      if (!nome.trim()) throw new Error("Dê um nome pro fluxo.");
      const passosLimpos = passos.filter((p) => p.conteudo.trim());
      if (passosLimpos.length === 0) throw new Error("Adicione pelo menos um passo com mensagem.");

      let fluxoId = editing?.id as string | undefined;

      if (fluxoId) {
        const { error } = await supabase
          .from("followup_fluxos" as any)
          .update({ nome: nome.trim(), ativo, e_geral: eGeral, ao_esgotar: aoEsgotar })
          .eq("id", fluxoId);
        if (error) throw error;
      } else {
        const { data: perfil } = await supabase
          .from("perfis")
          .select("imobiliaria_id")
          .eq("id", user.id)
          .single();
        const { data: novo, error } = await supabase
          .from("followup_fluxos" as any)
          .insert({
            nome: nome.trim(),
            ativo,
            e_geral: eGeral,
            ao_esgotar: aoEsgotar,
            imobiliaria_id: perfil?.imobiliaria_id,
            corretor_id: user.id,
            criado_por: user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        fluxoId = (novo as any).id;
      }

      // Só um fluxo "geral" por corretor.
      if (eGeral && fluxoId) {
        await supabase
          .from("followup_fluxos" as any)
          .update({ e_geral: false })
          .eq("corretor_id", user.id)
          .neq("id", fluxoId);
      }

      // Regrava os passos do zero (simples e sem risco de ordem furada).
      await supabase.from("followup_passos" as any).delete().eq("fluxo_id", fluxoId);
      const rows = passosLimpos.map((p, i) => ({
        fluxo_id: fluxoId,
        ordem: i + 1,
        atraso_minutos: p.atraso_minutos,
        base_atraso: i === 0 ? "inscricao" : "passo_anterior",
        conteudo: p.conteudo.trim(),
        so_horario_comercial: p.so_horario_comercial,
      }));
      const { error: passosErr } = await supabase.from("followup_passos" as any).insert(rows);
      if (passosErr) throw passosErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["followup-fluxos"] });
      setIsOpen(false);
      toast.success(editing ? "Fluxo atualizado!" : "Fluxo criado!");
    },
    onError: (e: any) => toast.error("Erro ao salvar: " + (e?.message || "erro desconhecido")),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("followup_fluxos" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["followup-fluxos"] });
      toast.success("Fluxo removido!");
    },
    onError: (e: any) => toast.error("Erro ao remover: " + (e?.message || "erro")),
  });

  function moverPasso(idx: number, dir: -1 | 1) {
    setPassos((prev) => {
      const arr = [...prev];
      const alvo = idx + dir;
      if (alvo < 0 || alvo >= arr.length) return prev;
      [arr[idx], arr[alvo]] = [arr[alvo], arr[idx]];
      return arr;
    });
  }
  function setPasso(idx: number, patch: Partial<PassoForm>) {
    setPassos((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  return (
    <MainLayout>
      <div className="p-4 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Follow-ups automáticos</h1>
            <p className="text-saas-sm text-muted-foreground">
              Monte uma sequência de mensagens de WhatsApp. Depois é só abrir o card do lead e clicar
              em <strong>Iniciar follow-up</strong>.
            </p>
          </div>
          <Button onClick={abrirNovo} className="h-9 text-[11px] font-bold uppercase tracking-wider px-6">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Novo Fluxo
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            Array(3).fill(0).map((_, i) => (
              <Card key={i} className="h-40 border-none shadow-soft bg-slate-50 animate-pulse" />
            ))
          ) : fluxos && fluxos.length > 0 ? (
            fluxos.map((f: any) => (
              <Card key={f.id} className="border-none shadow-soft bg-white hover:shadow-md transition-all group overflow-hidden flex flex-col">
                <CardHeader className="py-3 px-4 border-b border-slate-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`p-1.5 rounded-md ${f.ativo ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                        <Repeat className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-saas-sm font-bold text-slate-700 truncate">{f.nome}</span>
                    </div>
                    <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-primary" title="Usar como base (cria uma cópia sua)" onClick={() => usarComoBase(f)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {f.corretor_id !== null && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-primary" onClick={() => abrirEdicao(f)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-500" onClick={() => remover.mutate(f.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className={`border-none text-[9px] uppercase font-bold tracking-tighter ${f.ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {f.ativo ? "Ativo" : "Desativado"}
                    </Badge>
                    {f.e_geral && (
                      <Badge className="border-none text-[9px] uppercase font-bold tracking-tighter bg-blue-100 text-blue-700">Geral</Badge>
                    )}
                    {f.corretor_id === null && (
                      <Badge className="border-none text-[9px] uppercase font-bold tracking-tighter bg-violet-100 text-violet-700">Modelo</Badge>
                    )}
                    <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-none text-[9px] uppercase font-bold tracking-tighter">
                      {f.followup_passos?.length || 0} passo(s)
                    </Badge>
                    {f.ao_esgotar === "descartar" && (
                      <Badge className="border-none text-[9px] uppercase font-bold tracking-tighter bg-amber-100 text-amber-700 gap-1">
                        <UserX className="h-2.5 w-2.5" /> Descarta ao esgotar
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1 mt-1">
                    {(f.followup_passos || []).slice(0, 4).map((p: any) => (
                      <div key={p.id} className="text-saas-xs text-slate-600 bg-slate-50 rounded-md px-2 py-1.5 border border-slate-100">
                        <span className="font-bold text-slate-400 mr-1.5">{atrasoLabel(p.atraso_minutos, p.ordem === 1)}:</span>
                        <span className="line-clamp-2">{p.conteudo}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-full text-center py-12 text-slate-400 text-saas-sm">
              Nenhum fluxo ainda. Clique em <strong>Novo Fluxo</strong> pra começar.
            </div>
          )}
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold">{editing ? "Editar Fluxo" : "Novo Fluxo"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Nome do fluxo</label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Boas-vindas lead novo" className="h-9 text-saas-sm border-slate-200" />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-saas-sm text-slate-600">
                  <Switch checked={ativo} onCheckedChange={setAtivo} /> Ativo
                </label>
                <label className="flex items-center gap-2 text-saas-sm text-slate-600">
                  <Switch checked={eGeral} onCheckedChange={setEGeral} /> Fluxo geral
                </label>
              </div>
              {eGeral && (
                <p className="text-[10px] text-muted-foreground -mt-2">
                  Todo lead novo atribuído a você entra neste fluxo automaticamente — passa a valer
                  quando o dono ligar a automática. Só um fluxo pode ser "geral".
                </p>
              )}

              <div className="space-y-1.5">
                <label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">
                  Se terminar todos os passos sem o cliente responder
                </label>
                <Select value={aoEsgotar} onValueChange={(v) => setAoEsgotar(v as "nada" | "descartar")}>
                  <SelectTrigger className="h-9 text-saas-sm border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nada">Não fazer nada (marca como concluído)</SelectItem>
                    <SelectItem value="descartar">Descartar o lead (motivo: Sem Resposta)</SelectItem>
                  </SelectContent>
                </Select>
                {aoEsgotar === "descartar" && (
                  <p className="text-[10px] text-muted-foreground">
                    O lead sai do seu Kanban e vai pra Distribuição → Leads Descartados. Como o motivo
                    é "Sem Resposta", ele volta pro bolsão de rebatidas depois de 3 dias.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Passos</label>
                  <div className="flex flex-wrap gap-1">
                    {VARIAVEIS.map((v) => (
                      <span key={v} className="text-[9px] font-mono bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">{v}</span>
                    ))}
                  </div>
                </div>

                {passos.map((p, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-200 p-3 space-y-2 bg-slate-50/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Passo {idx + 1}</span>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-slate-400" onClick={() => moverPasso(idx, -1)} disabled={idx === 0}>
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-slate-400" onClick={() => moverPasso(idx, 1)} disabled={idx === passos.length - 1}>
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-red-500" onClick={() => setPassos((prev) => prev.filter((_, i) => i !== idx))} disabled={passos.length === 1}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <Select value={String(p.atraso_minutos)} onValueChange={(v) => setPasso(idx, { atraso_minutos: Number(v) })}>
                      <SelectTrigger className="h-8 text-saas-xs border-slate-200 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ATRASOS.map((a) => (
                          <SelectItem key={a.min} value={String(a.min)} className="text-saas-xs">
                            {idx === 0
                              ? a.min === 0 ? "Assim que iniciar" : a.label.replace("depois", "após iniciar")
                              : a.min === 0 ? "Logo após o passo anterior" : a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      value={p.conteudo}
                      onChange={(e) => setPasso(idx, { conteudo: e.target.value })}
                      placeholder="Oi {nome}, aqui é o {corretor}..."
                      className="min-h-[70px] text-saas-sm border-slate-200 bg-white resize-none"
                    />
                    <label className="flex items-center gap-2 text-[11px] text-slate-500">
                      <Switch checked={p.so_horario_comercial} onCheckedChange={(v) => setPasso(idx, { so_horario_comercial: v })} />
                      Só em horário comercial (Seg–Sáb, 8h–20h)
                    </label>
                  </div>
                ))}

                <Button type="button" variant="outline" size="sm" className="w-full text-[11px]" onClick={() => setPassos((prev) => [...prev, { conteudo: "", atraso_minutos: 1440, so_horario_comercial: true }])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar passo
                </Button>
              </div>
            </div>

            <DialogFooter className="pt-4 border-t border-slate-50">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="text-saas-xs font-bold uppercase">Cancelar</Button>
              <Button type="button" size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate()} className="text-saas-xs font-bold uppercase px-6">
                {salvar.isPending ? "Salvando..." : "Gravar Fluxo"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
