import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, MessageSquare, Trash2, Edit, Copy, CheckCircle2, Mail, MessageCircle, Image, Video, FileText as FileIcon, X } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/templates")({
  head: () => ({ meta: [{ title: "Templates — CRM" }] }),
  component: TemplatesPage,
});

function tipoAnexoPorArquivo(file: File): "imagem" | "video" | "documento" {
  if (file.type.startsWith("image/")) return "imagem";
  if (file.type.startsWith("video/")) return "video";
  return "documento";
}

function IconeAnexo({ tipo, className }: { tipo: string | null; className?: string }) {
  if (tipo === "imagem") return <Image className={className} />;
  if (tipo === "video") return <Video className={className} />;
  return <FileIcon className={className} />;
}

type Anexo = { url: string; tipo: string; nome: string };

function anexosDoTemplate(template: any): Anexo[] {
  if (template?.anexos?.length) return template.anexos;
  if (template?.anexo_url) return [{ url: template.anexo_url, tipo: template.anexo_tipo, nome: template.anexo_nome }];
  return [];
}

function TemplatesPage() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [anexosExistentes, setAnexosExistentes] = useState<Anexo[]>([]);
  const [anexosNovos, setAnexosNovos] = useState<File[]>([]);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("templates_mensagem")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveTemplate = useMutation({
    mutationFn: async (values: any) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Não autenticado");

      const novosUploads: Anexo[] = [];
      for (const file of anexosNovos) {
        const fileExt = file.name.split(".").pop();
        const filePath = `${userData.user.id}/${crypto.randomUUID()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("templates_anexos")
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("templates_anexos")
          .getPublicUrl(filePath);

        novosUploads.push({ url: publicUrl, tipo: tipoAnexoPorArquivo(file), nome: file.name });
      }

      const anexosFinais = [...anexosExistentes, ...novosUploads];
      values.anexos = anexosFinais;
      // Colunas legadas (anexo_url/tipo/nome) ficam sincronizadas com o
      // primeiro anexo, pra qualquer código antigo que ainda leia só elas
      // continuar funcionando.
      values.anexo_url = anexosFinais[0]?.url || null;
      values.anexo_tipo = anexosFinais[0]?.tipo || null;
      values.anexo_nome = anexosFinais[0]?.nome || null;

      if (editingTemplate) {
        const { error } = await supabase
          .from("templates_mensagem")
          .update(values)
          .eq("id", editingTemplate.id);
        if (error) throw error;
      } else {
        const { data: perfil } = await supabase
          .from("perfis")
          .select("imobiliaria_id")
          .eq("id", userData.user.id)
          .single();

        const { error } = await supabase
          .from("templates_mensagem")
          .insert({ ...values, imobiliaria_id: perfil?.imobiliaria_id, criado_por: userData.user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setIsOpen(false);
      setEditingTemplate(null);
      setAnexosExistentes([]);
      setAnexosNovos([]);
      toast.success(editingTemplate ? "Template atualizado!" : "Template criado!");
    },
    onError: (error: any) => toast.error("Erro ao salvar: " + (error?.message || "erro desconhecido")),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("templates_mensagem").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template removido!");
    },
  });

  return (
    <MainLayout>
      <div className="p-4 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Biblioteca de Mensagens</h1>
            <p className="text-saas-sm text-muted-foreground">Padronize o atendimento com templates inteligentes.</p>
          </div>
          <Button onClick={() => { setEditingTemplate(null); setAnexosExistentes([]); setAnexosNovos([]); setIsOpen(true); }} className="h-9 text-[11px] font-bold uppercase tracking-wider px-6">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar Template
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            Array(6).fill(0).map((_, i) => (
              <Card key={i} className="h-40 border-none shadow-soft bg-slate-50 animate-pulse" />
            ))
          ) : (
            templates?.map((template) => (
              <Card key={template.id} className="border-none shadow-soft bg-white hover:shadow-md transition-all group overflow-hidden flex flex-col">
                <CardHeader className="py-3 px-4 border-b border-slate-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-md ${template.tipo === 'whatsapp' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                        {template.tipo === 'whatsapp' ? <MessageCircle className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                      </div>
                      <span className="text-saas-sm font-bold text-slate-700 truncate max-w-[140px]">{template.titulo}</span>
                    </div>
                    <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-primary" onClick={() => {
                        setEditingTemplate(template);
                        setAnexosExistentes(anexosDoTemplate(template));
                        setAnexosNovos([]);
                        setIsOpen(true);
                      }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-500" onClick={() => deleteTemplate.mutate(template.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 flex-1 flex flex-col">
                  {anexosDoTemplate(template).length > 0 && (
                    anexosDoTemplate(template).length === 1 && anexosDoTemplate(template)[0].tipo === "imagem" ? (
                      <img src={anexosDoTemplate(template)[0].url} alt={anexosDoTemplate(template)[0].nome || ""} className="mb-2 h-24 w-full object-cover rounded-lg border border-slate-100" />
                    ) : anexosDoTemplate(template).every(a => a.tipo === "imagem") ? (
                      <div className="mb-2 grid grid-cols-3 gap-1">
                        {anexosDoTemplate(template).slice(0, 3).map((a, i) => (
                          <div key={i} className="relative h-16">
                            <img src={a.url} alt={a.nome || ""} className="h-16 w-full object-cover rounded-md border border-slate-100" />
                            {i === 2 && anexosDoTemplate(template).length > 3 && (
                              <div className="absolute inset-0 bg-black/50 rounded-md flex items-center justify-center text-white text-[10px] font-bold">
                                +{anexosDoTemplate(template).length - 3}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-saas-xs text-slate-500">
                        <IconeAnexo tipo={anexosDoTemplate(template)[0].tipo} className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{anexosDoTemplate(template).length} anexo(s)</span>
                      </div>
                    )
                  )}
                  <div className="bg-slate-50 p-3 rounded-lg text-saas-xs text-slate-600 line-clamp-4 leading-relaxed font-medium whitespace-pre-wrap flex-1 border border-slate-100">
                    {template.conteudo}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-none text-[9px] uppercase font-bold tracking-tighter">
                      {template.tipo}
                    </Badge>
                    <Button variant="ghost" className="h-7 px-2 text-[10px] font-bold text-slate-400 hover:text-primary" onClick={() => {
                       navigator.clipboard.writeText(template.conteudo);
                       toast.success("Copiado!");
                    }}>
                      <Copy className="h-3 w-3 mr-1" /> Copiar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Dialog open={isOpen} onOpenChange={(val) => {
          setIsOpen(val);
          if (!val) {
            setEditingTemplate(null);
            setAnexosExistentes([]);
            setAnexosNovos([]);
          }
        }}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold">{editingTemplate ? "Editar Template" : "Novo Template"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const conteudo = (formData.get("conteudo") as string) || "";
              const temAnexo = anexosNovos.length > 0 || anexosExistentes.length > 0;
              if (!conteudo.trim() && !temAnexo) {
                toast.error("Adicione um texto ou um anexo (imagem/vídeo) pro template.");
                return;
              }
              saveTemplate.mutate({
                titulo: formData.get("titulo"),
                conteudo,
                tipo: formData.get("tipo"),
              });
            }} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Título</label>
                  <Input name="titulo" defaultValue={editingTemplate?.titulo} placeholder="Ex: Boas-vindas" className="h-9 text-saas-sm border-slate-200" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Canal</label>
                  <Select name="tipo" defaultValue={editingTemplate?.tipo || "whatsapp"}>
                    <SelectTrigger className="h-9 text-saas-sm border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Corpo da Mensagem</label>
                <Textarea
                  name="conteudo"
                  defaultValue={editingTemplate?.conteudo}
                  placeholder="Olá {nome}, vi que você se interessou pelo imóvel... (opcional se anexar imagem/vídeo)"
                  className="min-h-[160px] text-saas-sm border-slate-200 resize-none leading-relaxed"
                />
                <div className="flex items-center gap-2 mt-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    <p className="text-[10px] text-muted-foreground font-medium">Use tags como <strong>{"{nome}"}</strong> para personalização automática.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Anexos (pode escolher várias imagens/vídeos de uma vez)</label>
                {(anexosExistentes.length > 0 || anexosNovos.length > 0) && (
                  <div className="flex flex-col gap-1.5">
                    {anexosExistentes.map((a, i) => (
                      <div key={`existente-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <IconeAnexo tipo={a.tipo} className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="text-saas-sm text-slate-600 truncate">{a.nome}</span>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-red-500 shrink-0" onClick={() => setAnexosExistentes(prev => prev.filter((_, idx) => idx !== i))}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {anexosNovos.map((f, i) => (
                      <div key={`novo-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <IconeAnexo tipo={tipoAnexoPorArquivo(f)} className="h-4 w-4 shrink-0 text-primary" />
                          <span className="text-saas-sm text-slate-700 truncate">{f.name}</span>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-red-500 shrink-0" onClick={() => setAnexosNovos(prev => prev.filter((_, idx) => idx !== i))}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <Input
                  type="file"
                  multiple
                  accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
                  className="h-9 text-saas-sm border-slate-200"
                  onChange={(e) => {
                    const novos = Array.from(e.target.files || []);
                    if (novos.length) setAnexosNovos(prev => [...prev, ...novos]);
                    e.target.value = "";
                  }}
                />
              </div>
              <DialogFooter className="pt-4 border-t border-slate-50">
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="text-saas-xs font-bold uppercase">Cancelar</Button>
                <Button type="submit" size="sm" disabled={saveTemplate.isPending} className="text-saas-xs font-bold uppercase px-6">
                  {saveTemplate.isPending ? "Salvando..." : "Gravar Template"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
