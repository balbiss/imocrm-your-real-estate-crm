import React from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Upload, X, Image as ImageIcon, Plus, Trash2 } from "lucide-react";

interface NewPropertyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewPropertyDialog({ open, onOpenChange }: NewPropertyDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  const [uploading, setUploading] = React.useState(false);
  const [previews, setPreviews] = React.useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [customFields, setCustomFields] = React.useState<Array<{ key: string; value: string }>>([]);

  const handleAddCustomField = () => {
    setCustomFields((prev) => [...prev, { key: "", value: "" }]);
  };

  const handleRemoveCustomField = (index: number) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCustomFieldChange = (index: number, field: "key" | "value", val: string) => {
    setCustomFields((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: val } : item))
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...files]);
      
      const newPreviews = files.map(file => URL.createObjectURL(file));
      setPreviews((prev) => [...prev, ...newPreviews]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      const newPreviews = [...prev];
      URL.revokeObjectURL(newPreviews[index]);
      return newPreviews.filter((_, i) => i !== index);
    });
  };

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      setUploading(true);
      try {
        // Buscar perfil para obter imobiliaria_id
        const { data: profile } = await supabase
          .from("perfis")
          .select("imobiliaria_id")
          .eq("id", user?.id)
          .single();

        if (!profile?.imobiliaria_id) throw new Error("Imobiliária não encontrada");

        // Upload das fotos
        const uploadedUrls: string[] = [];
        for (const file of selectedFiles) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Math.random()}.${fileExt}`;
          const filePath = `${profile.imobiliaria_id}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('imoveis_fotos')
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('imoveis_fotos')
            .getPublicUrl(filePath);
          
          uploadedUrls.push(publicUrl);
        }

        const caracteristicasObj = customFields.reduce((acc, field) => {
          if (field.key.trim()) {
            acc[field.key.trim()] = field.value;
          }
          return acc;
        }, {} as Record<string, string>);

        const { error } = await supabase.from("imoveis").insert({
          ...data,
          imobiliaria_id: profile.imobiliaria_id,
          preco: parseFloat(data.preco) || 0,
          fotos: uploadedUrls,
          caracteristicas: caracteristicasObj,
        });

        if (error) throw error;
      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imoveis-list"] });
      toast.success("Imóvel cadastrado com sucesso!");
      reset();
      setPreviews([]);
      setSelectedFiles([]);
      setCustomFields([]);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error("Erro ao cadastrar imóvel: " + error.message);
    },
  });

  const onSubmit = (data: any) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-elegant animate-fade-in-up">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-bold tracking-tight text-slate-900">Novo Imóvel</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-6 py-2 custom-scrollbar">
          <form id="new-property-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5 pb-6">
            <div className="space-y-2">
              <Label htmlFor="titulo" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Título do Anúncio</Label>
              <Input 
                id="titulo" 
                placeholder="Ex: Casa duplex no condomínio X" 
                {...register("titulo", { required: true })}
                className="h-10 text-sm border-slate-200 focus:border-primary transition-all"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tipo" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tipo</Label>
                <Select onValueChange={(v) => setValue("tipo", v)}>
                  <SelectTrigger className="h-10 text-sm border-slate-200">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="casa">Casa</SelectItem>
                    <SelectItem value="apartamento">Apartamento</SelectItem>
                    <SelectItem value="terreno">Terreno</SelectItem>
                    <SelectItem value="comercial">Comercial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="finalidade" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Finalidade</Label>
                <Select onValueChange={(v) => setValue("finalidade", v)}>
                  <SelectTrigger className="h-10 text-sm border-slate-200">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="venda">Venda</SelectItem>
                    <SelectItem value="aluguel">Aluguel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="preco" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Preço (R$)</Label>
              <Input 
                id="preco" 
                type="number" 
                step="0.01"
                placeholder="0,00" 
                {...register("preco", { required: true })}
                className="h-10 text-sm border-slate-200 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endereco" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Endereço Completo</Label>
              <Input 
                id="endereco" 
                placeholder="Rua, número, bairro..." 
                {...register("endereco")}
                className="h-10 text-sm border-slate-200 focus:border-primary transition-all"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cidade" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cidade</Label>
                <Input 
                  id="cidade" 
                  placeholder="Ex: São Paulo" 
                  {...register("cidade")}
                  className="h-10 text-sm border-slate-200 focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estado" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Estado</Label>
                <Input 
                  id="estado" 
                  placeholder="Ex: SP" 
                  {...register("estado")}
                  className="h-10 text-sm border-slate-200 focus:border-primary transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Descrição</Label>
              <Textarea 
                id="descricao" 
                placeholder="Detalhes sobre o imóvel..." 
                {...register("descricao")}
                className="min-h-[80px] text-sm border-slate-200 focus:border-primary transition-all resize-none"
              />
            </div>

            {/* Seção de Campos Personalizados */}
            <div className="space-y-3 p-4 bg-slate-50/50 rounded-xl border border-slate-100/50">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Características Adicionais</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCustomField}
                  className="h-7 px-2 text-[9px] font-bold uppercase tracking-wider border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
                </Button>
              </div>

              <div className="space-y-2">
                {customFields.map((field, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Input
                      placeholder="Nome (ex: Suítes)"
                      value={field.key}
                      onChange={(e) => handleCustomFieldChange(idx, "key", e.target.value)}
                      className="h-9 text-xs border-slate-200 flex-1"
                    />
                    <Input
                      placeholder="Valor (ex: 2)"
                      value={field.value}
                      onChange={(e) => handleCustomFieldChange(idx, "value", e.target.value)}
                      className="h-9 text-xs border-slate-200 flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveCustomField(idx)}
                      className="h-9 w-9 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {customFields.length === 0 && (
                  <p className="text-[11px] text-slate-400 text-center py-2">Nenhum campo personalizado adicionado.</p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fotos do Imóvel</Label>
              
              <div className="grid grid-cols-3 xs:grid-cols-4 gap-2">
                {previews.map((src, idx) => (
                  <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-100 group animate-fade-in-up hover-lift shadow-sm">
                    <img src={src} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="absolute top-1 right-1 bg-white/90 rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3 text-red-500" />
                    </button>
                  </div>
                ))}
                
                <label className="border-2 border-dashed border-slate-100 rounded-lg aspect-square flex flex-col items-center justify-center cursor-pointer hover:border-primary/40 hover:bg-slate-50 transition-all group active:scale-95">
                  <Upload className="h-5 w-5 text-slate-300 group-hover:text-primary transition-colors" />
                  <span className="text-[9px] font-bold text-slate-300 group-hover:text-primary mt-1 tracking-widest">ADD</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
            </div>
          </form>
        </div>

        <DialogFooter className="p-6 pt-2 border-t border-slate-50 bg-slate-50/50">
          <div className="flex w-full gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="flex-1 h-11 text-[11px] font-bold uppercase tracking-wider border-slate-200 hover:bg-slate-100 transition-all"
            >
              Cancelar
            </Button>
            <Button 
              form="new-property-form"
              type="submit" 
              disabled={mutation.isPending || uploading}
              className="flex-[2] h-11 text-[11px] font-bold uppercase tracking-wider shadow-elegant transition-all active:scale-[0.98]"
            >
              {mutation.isPending || uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {uploading ? "Enviando Fotos..." : "Cadastrar Imóvel"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
