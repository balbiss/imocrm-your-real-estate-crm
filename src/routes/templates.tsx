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

function TemplatesPage() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [anexoFile, setAnexoFile] = useState<File | null>(null);
  const [removerAnexoExistente, setRemoverAnexoExistente] = useState(false);

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

      if (anexoFile) {
        const fileExt = anexoFile.name.split(".").pop();
        const filePath = `${userData.user.id}/${crypto.randomUUID()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("templates_anexos")
          .upload(filePath, anexoFile);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("templates_anexos")
          .getPublicUrl(filePath);

        values.anexo_url = publicUrl;
        values.anexo_tipo = tipoAnexoPorArquivo(anexoFile);
        values.anexo_nome = anexoFile.name;
      } else if (removerAnexoExistente) {
        values.anexo_url = null;
        values.anexo_tipo = null;
        values.anexo_nome = null;
      }

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
      setAnexoFile(null);
      setRemoverAnexoExistente(false);
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
          <Button onClick={() => { setEditingTemplate(null); setAnexoFile(null); setRemoverAnexoExistente(false); setIsOpen(true); }} className="h-9 text-[11px] font-bold uppercase tracking-wider px-6">
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
                        setAnexoFile(null);
                        setRemoverAnexoExistente(false);
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
                  {template.anexo_url && (
                    template.anexo_tipo === "imagem" ? (
                      <img src={template.anexo_url} alt={template.anexo_nome || ""} className="mb-2 h-24 w-full object-cover rounded-lg border border-slate-100" />
                    ) : (
                      <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-saas-xs text-slate-500">
                        <IconeAnexo tipo={template.anexo_tipo} className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{template.anexo_nome}</span>
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
            setAnexoFile(null);
            setRemoverAnexoExistente(false);
          }
        }}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold">{editingTemplate ? "Editar Template" : "Novo Template"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              saveTemplate.mutate({
                titulo: formData.get("titulo"),
                conteudo: formData.get("conteudo"),
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
                  placeholder="Olá {nome}, vi que você se interessou pelo imóvel..." 
                  className="min-h-[160px] text-saas-sm border-slate-200 resize-none leading-relaxed"
                  required 
                />
                <div className="flex items-center gap-2 mt-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    <p className="text-[10px] text-muted-foreground font-medium">Use tags como <strong>{"{nome}"}</strong> para personalização automática.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Anexo (imagem, vídeo ou documento)</label>
                {editingTemplate?.anexo_url && !anexoFile && !removerAnexoExistente ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <IconeAnexo tipo={editingTemplate.anexo_tipo} className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="text-saas-sm text-slate-600 truncate">{editingTemplate.anexo_nome}</span>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-red-500 shrink-0" onClick={() => setRemoverAnexoExistente(true)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
                      className="h-9 text-saas-sm border-slate-200"
                      onChange={(e) => {
                        setAnexoFile(e.target.files?.[0] || null);
                        setRemoverAnexoExistente(false);
                      }}
                    />
                    {anexoFile && (
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-red-500 shrink-0" onClick={() => setAnexoFile(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
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
