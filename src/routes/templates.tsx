import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, MessageSquare, Trash2, Edit, Copy, CheckCircle2, Mail, MessageCircle } from "lucide-react";
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

function TemplatesPage() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);

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
          .insert({ ...values, imobiliaria_id: perfil?.imobiliaria_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setIsOpen(false);
      setEditingTemplate(null);
      toast.success(editingTemplate ? "Template atualizado!" : "Template criado!");
    },
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
          <Button onClick={() => setIsOpen(true)} className="h-9 text-[11px] font-bold uppercase tracking-wider px-6">
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
          if (!val) setEditingTemplate(null);
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
