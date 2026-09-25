import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Megaphone, Plus, Edit, ExternalLink, ImageOff, FolderOpen, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/campanhas")({
  head: () => ({ meta: [{ title: "Campanhas — CRM" }] }),
  component: CampanhasPage,
});

type Campanha = {
  nome: string;
  total_leads: number;
  leads_7d: number;
  leads_30d: number;
  ultimo_lead: string | null;
  campanha_id: string | null;
  drive_url: string | null;
  observacao: string | null;
};

// Link do Google Drive -> prévia. Aceita os formatos que o Drive gera ao
// "Compartilhar"/"Copiar link" (/file/d/<id>/..., ?id=<id>). Pasta não tem
// prévia -- só vira botão pra abrir. O arquivo precisa estar compartilhado
// como "Qualquer pessoa com o link", senão a imagem não carrega.
function driveInfo(url: string | null): { tipo: "arquivo" | "pasta" | "outro"; thumb?: string } | null {
  if (!url) return null;
  if (/\/folders\//.test(url)) return { tipo: "pasta" };
  const id = url.match(/\/d\/([\w-]{10,})/)?.[1] ?? url.match(/[?&]id=([\w-]{10,})/)?.[1];
  if (id) return { tipo: "arquivo", thumb: `https://drive.google.com/thumbnail?id=${id}&sz=w800` };
  return { tipo: "outro" };
}

function Previa({ c }: { c: Campanha }) {
  const [falhou, setFalhou] = useState(false);
  const info = driveInfo(c.drive_url);

  if (info?.tipo === "arquivo" && !falhou) {
    return (
      <img
        src={info.thumb}
        alt={`Criativo da campanha ${c.nome}`}
        className="h-full w-full object-contain"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFalhou(true)}
      />
    );
  }

  const [Icone, texto] =
    info?.tipo === "pasta"
      ? [FolderOpen, "Pasta do Drive — clique em Abrir no Drive"]
      : falhou
        ? [ImageOff, "Não deu pra carregar a imagem. Confira se o arquivo está compartilhado como \"Qualquer pessoa com o link\"."]
        : info
          ? [ImageOff, "Esse link não é do Google Drive"]
          : [ImageOff, "Sem imagem do criativo"];

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-slate-400">
      <Icone className="h-8 w-8" />
      <p className="text-saas-xs max-w-[220px]">{texto}</p>
    </div>
  );
}

function CampanhasPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const podeEditar = can("configure_system");

  const [filtro, setFiltro] = useState<"ativas" | "todas">("ativas");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Campanha | null>(null);
  const [nova, setNova] = useState(false);

  const { data: campanhas, isLoading } = useQuery({
    queryKey: ["campanhas-resumo"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_campanhas_resumo" as any);
      if (error) throw error;
      return (data as Campanha[]) || [];
    },
  });

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (campanhas || []).filter((c) => {
      if (filtro === "ativas" && c.leads_30d === 0 && c.total_leads > 0) return false;
      return !termo || c.nome.toLowerCase().includes(termo);
    });
  }, [campanhas, filtro, busca]);

  const salvar = useMutation({
    mutationFn: async (v: { nome: string; drive_url: string; observacao: string }) => {
      const nome = v.nome.trim();
      if (!nome) throw new Error("Informe o nome da campanha.");
      let drive = v.drive_url.trim();
      if (drive && !/^https?:\/\//i.test(drive)) drive = `https://${drive}`;
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Não autenticado");
      const { data: perfil } = await supabase.from("perfis").select("imobiliaria_id").eq("id", userData.user.id).single();
      const { error } = await supabase.from("campanhas" as any).upsert(
        {
          imobiliaria_id: perfil?.imobiliaria_id,
          nome,
          drive_url: drive || null,
          observacao: v.observacao.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "imobiliaria_id,nome" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campanhas-resumo"] });
      setEditando(null);
      setNova(false);
      toast.success("Campanha salva!");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar a campanha."),
  });

  const dialogAberto = nova || !!editando;

  return (
    <MainLayout>
      <div className="p-4 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Campanhas</h1>
            <p className="text-saas-sm text-muted-foreground">
              Cada anúncio que trouxe leads, com o criativo (imagem do Google Drive) e quantos leads chegaram.
            </p>
          </div>
          {podeEditar && (
            <Button onClick={() => setNova(true)} className="h-9 text-[11px] font-bold uppercase tracking-wider px-6">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Nova Campanha
            </Button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar campanha..."
              className="h-9 pl-8 text-saas-sm border-slate-200"
            />
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(["ativas", "todas"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-3 h-8 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  filtro === f ? "bg-primary text-primary-foreground" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {f === "ativas" ? "Últimos 30 dias" : "Todas"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {isLoading ? (
            Array(8)
              .fill(0)
              .map((_, i) => <Card key={i} className="h-80 border-none shadow-soft bg-slate-50 animate-pulse" />)
          ) : visiveis.length > 0 ? (
            visiveis.map((c) => (
              <Card key={c.nome} className="border-none shadow-soft bg-white overflow-hidden flex flex-col group">
                <div className="aspect-square bg-slate-50 border-b border-slate-100">
                  <Previa c={c} />
                </div>
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-saas-sm font-bold text-slate-800 break-words">{c.nome}</h3>
                    {podeEditar && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-slate-400 hover:text-primary"
                        onClick={() => setEditando(c)}
                        aria-label="Editar campanha"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Total", c.total_leads],
                      ["7 dias", c.leads_7d],
                      ["30 dias", c.leads_30d],
                    ].map(([rotulo, valor]) => (
                      <div key={rotulo as string} className="rounded-md bg-slate-50 py-1.5">
                        <p className="text-sm font-bold text-slate-800 tabular-nums">{valor as number}</p>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400">{rotulo as string}</p>
                      </div>
                    ))}
                  </div>

                  <p className="text-saas-xs text-slate-400">
                    {c.ultimo_lead
                      ? `Último lead ${formatDistanceToNow(new Date(c.ultimo_lead), { addSuffix: true, locale: ptBR })}`
                      : "Ainda sem leads"}
                  </p>

                  {c.observacao && <p className="text-saas-xs text-slate-600 whitespace-pre-line">{c.observacao}</p>}

                  {c.drive_url && (
                    <a
                      href={c.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-auto inline-flex items-center text-[10px] font-bold text-primary hover:underline"
                    >
                      Abrir no Drive <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  )}
                </div>
              </Card>
            ))
          ) : (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-center bg-white rounded-xl shadow-soft p-6">
              <Megaphone className="h-10 w-10 text-slate-300 mb-3" />
              <h3 className="text-sm font-bold text-slate-700">Nenhuma campanha encontrada</h3>
              <p className="text-saas-xs text-slate-400 mt-1 max-w-[300px]">
                {busca ? "Tente outro termo na busca." : "As campanhas aparecem aqui assim que o primeiro lead delas chega."}
              </p>
            </div>
          )}
        </div>

        <Dialog
          open={dialogAberto}
          onOpenChange={(val) => {
            if (!val) {
              setEditando(null);
              setNova(false);
            }
          }}
        >
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold">{editando ? "Editar Campanha" : "Nova Campanha"}</DialogTitle>
            </DialogHeader>
            <form
              key={editando?.nome ?? "nova"}
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                salvar.mutate({
                  nome: editando ? editando.nome : (fd.get("nome") as string),
                  drive_url: (fd.get("drive_url") as string) || "",
                  observacao: (fd.get("observacao") as string) || "",
                });
              }}
              className="space-y-4 py-2"
            >
              <div className="space-y-1.5">
                <label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Nome da campanha</label>
                {editando ? (
                  <p className="text-saas-sm font-medium text-slate-800">{editando.nome}</p>
                ) : (
                  <>
                    <Input name="nome" placeholder="Ex: [CN 54] [CENARIUM]" className="h-9 text-saas-sm border-slate-200" required />
                    <p className="text-[10px] text-slate-400">
                      Escreva exatamente como vem no anúncio, pra juntar com os leads quando eles chegarem.
                    </p>
                  </>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Link do Google Drive (criativo)</label>
                <Input
                  name="drive_url"
                  defaultValue={editando?.drive_url ?? ""}
                  placeholder="https://drive.google.com/file/d/..."
                  className="h-9 text-saas-sm border-slate-200"
                />
                <p className="text-[10px] text-slate-400">
                  No Drive: botão direito na imagem → Compartilhar → "Qualquer pessoa com o link" → Copiar link.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Observação</label>
                <Textarea
                  name="observacao"
                  defaultValue={editando?.observacao ?? ""}
                  placeholder="Ex: público renda até 3,8 mil, empreendimento Cenarium"
                  className="text-saas-sm border-slate-200 min-h-[70px]"
                />
              </div>

              <DialogFooter className="pt-4 border-t border-slate-50">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditando(null);
                    setNova(false);
                  }}
                  className="text-saas-xs font-bold uppercase"
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={salvar.isPending} className="text-saas-xs font-bold uppercase px-6">
                  {salvar.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
