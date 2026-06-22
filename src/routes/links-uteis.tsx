import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, Trash2, Edit, Copy, Link as LinkIcon, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/links-uteis")({
  head: () => ({ meta: [{ title: "Links Úteis — CRM" }] }),
  component: LinksUteisPage,
});

function LinksUteisPage() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<any>(null);

  // Buscar links úteis associados à imobiliária do usuário
  const { data: links, isLoading } = useQuery({
    queryKey: ["links_uteis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("links_uteis")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Mutação para criar ou atualizar link útil
  const saveLink = useMutation({
    mutationFn: async (values: { titulo: string; url: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Não autenticado");

      // Garantir formato válido da URL
      let formattedUrl = values.url.trim();
      if (!/^https?:\/\//i.test(formattedUrl)) {
        formattedUrl = `https://${formattedUrl}`;
      }

      if (editingLink) {
        const { error } = await supabase
          .from("links_uteis")
          .update({ titulo: values.titulo, url: formattedUrl })
          .eq("id", editingLink.id);
        if (error) throw error;
      } else {
        // Buscar imobiliaria_id do perfil do usuário
        const { data: perfil } = await supabase
          .from("perfis")
          .select("imobiliaria_id")
          .eq("id", userData.user.id)
          .single();

        const { error } = await supabase
          .from("links_uteis")
          .insert({
            titulo: values.titulo,
            url: formattedUrl,
            imobiliaria_id: perfil?.imobiliaria_id!,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links_uteis"] });
      setIsOpen(false);
      setEditingLink(null);
      toast.success(editingLink ? "Link útil atualizado!" : "Link útil criado!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao salvar o link útil.");
    },
  });

  // Mutação para deletar link útil
  const deleteLink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("links_uteis").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links_uteis"] });
      toast.success("Link útil removido!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao remover o link útil.");
    },
  });

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Link copiado para a área de transferência!");
  };

  return (
    <MainLayout>
      <div className="p-4 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Links Úteis</h1>
            <p className="text-saas-sm text-muted-foreground">Acesse e gerencie atalhos rápidos importantes para o dia a dia.</p>
          </div>
          <Button onClick={() => setIsOpen(true)} className="h-9 text-[11px] font-bold uppercase tracking-wider px-6">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar Link
          </Button>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            Array(6)
              .fill(0)
              .map((_, i) => (
                <Card key={i} className="h-32 border-none shadow-soft bg-slate-50 animate-pulse" />
              ))
          ) : links && links.length > 0 ? (
            links.map((link) => (
              <Card key={link.id} className="border-none shadow-soft bg-white hover:shadow-md transition-all group overflow-hidden flex flex-col justify-between p-4 min-h-[120px]">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                      <LinkIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-saas-sm font-bold text-slate-800 truncate">{link.titulo}</h3>
                      <p className="text-saas-xs text-slate-400 truncate mt-0.5">{link.url}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-primary" onClick={() => {
                      setEditingLink(link);
                      setIsOpen(true);
                    }}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-500" onClick={() => {
                      if (confirm("Tem certeza que deseja excluir este link útil?")) {
                        deleteLink.mutate(link.id);
                      }
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-3">
                  <Button variant="ghost" className="h-7 px-2 text-[10px] font-bold text-slate-400 hover:text-primary" onClick={() => handleCopy(link.url)}>
                    <Copy className="h-3 w-3 mr-1" /> Copiar Link
                  </Button>

                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-[10px] font-bold text-primary hover:underline">
                    Acessar <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </div>
              </Card>
            ))
          ) : (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-center bg-white rounded-xl shadow-soft p-6">
              <LinkIcon className="h-10 w-10 text-slate-300 mb-3" />
              <h3 className="text-sm font-bold text-slate-700">Nenhum link útil cadastrado</h3>
              <p className="text-saas-xs text-slate-400 mt-1 max-w-[280px]">Clique no botão acima para adicionar o primeiro atalho para a sua equipe.</p>
            </div>
          )}
        </div>

        {/* Modal Create/Edit */}
        <Dialog open={isOpen} onOpenChange={(val) => {
          setIsOpen(val);
          if (!val) setEditingLink(null);
        }}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold">
                {editingLink ? "Editar Link Útil" : "Novo Link Útil"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              saveLink.mutate({
                titulo: formData.get("titulo") as string,
                url: formData.get("url") as string,
              });
            }} className="space-y-4 py-4">
              <div className="space-y-1.5">
                <label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Título</label>
                <Input name="titulo" defaultValue={editingLink?.titulo} placeholder="Ex: Portal do Corretor" className="h-9 text-saas-sm border-slate-200" required />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Link (URL)</label>
                <Input name="url" defaultValue={editingLink?.url} placeholder="Ex: https://portal.exemplo.com" className="h-9 text-saas-sm border-slate-200" required />
              </div>

              <DialogFooter className="pt-4 border-t border-slate-50">
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="text-saas-xs font-bold uppercase">
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={saveLink.isPending} className="text-saas-xs font-bold uppercase px-6">
                  {saveLink.isPending ? "Salvando..." : "Gravar Link"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
