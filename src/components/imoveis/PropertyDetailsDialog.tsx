import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { 
  Loader2, Trash2, Upload, X, ChevronLeft, ChevronRight, 
  MapPin, Bed, Bath, Square, DollarSign, Info, Edit3, Plus
} from "lucide-react";

const CARACTERISTICAS_PADRAO = [
  "Varanda",
  "Suíte",
  "Piscina",
  "Churrasqueira",
  "Garagem Coberta",
  "Portaria 24h",
  "Academia",
  "Elevador",
  "Mobiliado",
  "Ar Condicionado"
];

interface PropertyDetailsDialogProps {
  imovel: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PropertyDetailsDialog({ imovel, open, onOpenChange }: PropertyDetailsDialogProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = React.useState(0);
  const [previews, setPreviews] = React.useState<string[]>(imovel?.fotos || []);
  const [newFiles, setNewFiles] = React.useState<File[]>([]);
  const [customFields, setCustomFields] = React.useState<Array<{ key: string; value: string }>>([]);
  const [newFeatureName, setNewFeatureName] = React.useState("");

  const toggleFeature = (name: string) => {
    const exists = customFields.some(f => f.key.toLowerCase() === name.toLowerCase());
    if (exists) {
      setCustomFields(prev => prev.filter(f => f.key.toLowerCase() !== name.toLowerCase()));
    } else {
      setCustomFields(prev => [...prev, { key: name, value: "Sim" }]);
    }
  };

  const handleAddNewFeature = () => {
    const name = newFeatureName.trim();
    if (!name) return;
    const exists = customFields.some(f => f.key.toLowerCase() === name.toLowerCase());
    if (!exists) {
      setCustomFields(prev => [...prev, { key: name, value: "Sim" }]);
    }
    setNewFeatureName("");
  };

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    defaultValues: imovel
  });

  React.useEffect(() => {
    if (imovel) {
      reset(imovel);
      setPreviews(imovel.fotos || []);
      setCurrentPhotoIndex(0);
      
      const fields = imovel.caracteristicas 
        ? Object.entries(imovel.caracteristicas).map(([key, value]) => ({
            key,
            value: String(value)
          }))
        : [];
      setCustomFields(fields);
    }
  }, [imovel, reset]);

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

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      setUploading(true);
      try {
        let uploadedUrls = previews.filter((url) => !url.startsWith("blob:"));

        for (const file of newFiles) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Math.random()}.${fileExt}`;
          const filePath = `${imovel.imobiliaria_id}/${fileName}`;

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

        const { error } = await supabase
          .from("imoveis")
          .update({
            ...data,
            preco: parseFloat(data.preco) || 0,
            fotos: uploadedUrls,
            caracteristicas: caracteristicasObj,
          })
          .eq("id", imovel.id);

        if (error) throw error;
      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imoveis-list"] });
      toast.success("Imóvel atualizado com sucesso!");
      setIsEditing(false);
      setNewFiles([]);
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("imoveis")
        .delete()
        .eq("id", imovel.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imoveis-list"] });
      toast.success("Imóvel excluído com sucesso!");
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error("Erro ao excluir: " + error.message);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setNewFiles((prev) => [...prev, ...files]);
      const newPreviews = files.map(file => URL.createObjectURL(file));
      setPreviews((prev) => [...prev, ...newPreviews]);
    }
  };

  const removePhoto = (index: number) => {
    const originalCount = imovel?.fotos?.length || 0;
    setPreviews((prev) => prev.filter((_, i) => i !== index));
    if (index >= originalCount) {
      const newFileIndex = index - originalCount;
      setNewFiles((prev) => prev.filter((_, i) => i !== newFileIndex));
    }
  };

  if (!imovel) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] w-[95vw] max-h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl animate-in fade-in zoom-in duration-300 rounded-2xl">
        <DialogHeader className="p-6 pb-4 flex flex-row items-center justify-between border-b border-slate-50 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex flex-col">
            <DialogTitle className="text-xl font-bold tracking-tight text-slate-900 leading-tight">
              {isEditing ? "Edição do Imóvel" : imovel.titulo}
            </DialogTitle>
            {!isEditing && (
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase mt-0.5 tracking-wider">
                <MapPin className="h-3 w-3" /> {imovel.cidade}, {imovel.estado}
              </div>
            )}
          </div>
          {!isEditing && (
            <div className="flex gap-2 mr-6">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsEditing(true)} 
                className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest border-slate-200 hover:bg-slate-50 text-slate-600 transition-all rounded-lg"
              >
                <Edit3 className="h-3 w-3 mr-1.5 text-primary" /> Editar
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  if(confirm("Tem certeza que deseja excluir este imóvel?")) deleteMutation.mutate();
                }} 
                className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest text-red-400 hover:text-red-600 hover:bg-red-50 transition-all rounded-lg"
              >
                <Trash2 className="h-3 w-3 mr-1.5" /> Excluir
              </Button>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30">
          <div className="p-6 space-y-8">
            {/* Seção de Fotos Premium */}
            <div className="relative aspect-video sm:aspect-[21/9] rounded-2xl overflow-hidden bg-slate-100 group shadow-lg border border-white">
              {previews.length > 0 ? (
                <>
                  <img 
                    src={previews[currentPhotoIndex]} 
                    alt="Imóvel" 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  {previews.length > 1 && (
                    <>
                      <button 
                        onClick={() => setCurrentPhotoIndex(i => (i > 0 ? i - 1 : previews.length - 1))}
                        className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 p-2.5 rounded-full shadow-saas opacity-0 group-hover:opacity-100 transition-all hover:bg-white hover:scale-110 active:scale-90"
                      >
                        <ChevronLeft className="h-5 w-5 text-slate-700" />
                      </button>
                      <button 
                        onClick={() => setCurrentPhotoIndex(i => (i < previews.length - 1 ? i + 1 : 0))}
                        className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 p-2.5 rounded-full shadow-saas opacity-0 group-hover:opacity-100 transition-all hover:bg-white hover:scale-110 active:scale-90"
                      >
                        <ChevronRight className="h-5 w-5 text-slate-700" />
                      </button>
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 p-1.5 bg-black/20 backdrop-blur-md rounded-full">
                        {previews.map((_, i) => (
                          <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === currentPhotoIndex ? "bg-white w-5" : "bg-white/40 w-1.5"}`} />
                        ))}
                      </div>
                    </>
                  )}
                  {isEditing && (
                      <button
                          onClick={() => removePhoto(currentPhotoIndex)}
                          className="absolute top-4 right-4 bg-red-500/90 backdrop-blur-sm text-white p-2.5 rounded-full shadow-lg hover:bg-red-600 transition-all hover:rotate-90 active:scale-90"
                      >
                          <X className="h-5 w-5" />
                      </button>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-3">
                  <Upload size={56} strokeWidth={1.5} className="animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Nenhuma imagem</span>
                </div>
              )}
            </div>

            <form id="edit-property-form" onSubmit={handleSubmit((data) => updateMutation.mutate(data))} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                
                {/* Coluna Esquerda - Info Principal */}
                <div className="md:col-span-7 space-y-6">
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-7 w-1 bg-primary rounded-full" />
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900">Informações Gerais</h4>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Título do Anúncio</Label>
                      {isEditing ? (
                        <Input {...register("titulo")} className="h-11 text-sm border-slate-200 focus:ring-primary/20" />
                      ) : (
                        <p className="text-base font-bold text-slate-800">{imovel.titulo}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Preço</Label>
                        {isEditing ? (
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input type="number" step="0.01" {...register("preco")} className="h-11 pl-9 text-sm border-slate-200" />
                          </div>
                        ) : (
                          <p className="text-lg font-black text-primary">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(imovel.preco || 0)}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Tipo de Imóvel</Label>
                        {isEditing ? (
                          <Select defaultValue={imovel.tipo} onValueChange={(v) => setValue("tipo", v)}>
                            <SelectTrigger className="h-11 text-sm border-slate-200">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="casa">Casa</SelectItem>
                              <SelectItem value="apartamento">Apartamento</SelectItem>
                              <SelectItem value="terreno">Terreno</SelectItem>
                              <SelectItem value="comercial">Comercial</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="h-11 flex items-center px-4 bg-slate-50 rounded-lg text-xs font-bold text-slate-600 uppercase tracking-widest">
                            {imovel.tipo}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Localização</Label>
                      {isEditing ? (
                        <div className="grid grid-cols-3 gap-2">
                          <Input placeholder="Endereço" {...register("endereco")} className="col-span-3 h-11 text-sm border-slate-200" />
                          <Input placeholder="Cidade" {...register("cidade")} className="col-span-2 h-11 text-sm border-slate-200" />
                          <Input placeholder="Estado" {...register("estado")} className="h-11 text-sm border-slate-200" />
                        </div>
                      ) : (
                        <div className="flex items-start gap-2.5 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                           <MapPin className="h-4 w-4 text-slate-400 mt-0.5" />
                           <p className="text-xs font-medium text-slate-600 leading-relaxed">{imovel.endereco}, {imovel.cidade} - {imovel.estado}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Atributos Responsivos */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-1.5 hover:shadow-md transition-all">
                      {isEditing ? (
                        <div className="w-full space-y-1 text-center">
                          <Label className="text-[9px] font-black text-slate-400 uppercase">Quartos</Label>
                          <Input type="number" {...register("quartos")} className="h-8 text-center font-bold" />
                        </div>
                      ) : (
                        <>
                          <Bed className="h-5 w-5 text-primary/60" />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Quartos</span>
                          <span className="text-sm font-bold text-slate-800">{imovel.quartos || 0}</span>
                        </>
                      )}
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-1.5 hover:shadow-md transition-all">
                      {isEditing ? (
                        <div className="w-full space-y-1 text-center">
                          <Label className="text-[9px] font-black text-slate-400 uppercase">Banheiros</Label>
                          <Input type="number" {...register("banheiros")} className="h-8 text-center font-bold" />
                        </div>
                      ) : (
                        <>
                          <Bath className="h-5 w-5 text-primary/60" />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Banheiros</span>
                          <span className="text-sm font-bold text-slate-800">{imovel.banheiros || 0}</span>
                        </>
                      )}
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-1.5 hover:shadow-md transition-all col-span-2 sm:col-span-1">
                      {isEditing ? (
                        <div className="w-full space-y-1 text-center">
                          <Label className="text-[9px] font-black text-slate-400 uppercase">Área (m²)</Label>
                          <Input type="number" {...register("area")} className="h-8 text-center font-bold" />
                        </div>
                      ) : (
                        <>
                          <Square className="h-5 w-5 text-primary/60" />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Área Útil</span>
                          <span className="text-sm font-bold text-slate-800">{imovel.area ? `${imovel.area}m²` : "0m²"}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Seção de Campos Personalizados */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-1 bg-primary rounded-full" />
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900">Características Adicionais</h4>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-4">
                        {/* Tags pré-definidas */}
                        <div className="space-y-2">
                          <Label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Opções Rápidas (Clique para marcar/desmarcar)</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {CARACTERISTICAS_PADRAO.map(char => {
                              const isSelected = customFields.some(f => f.key.toLowerCase() === char.toLowerCase());
                              return (
                                <Badge
                                  key={char}
                                  type="button"
                                  variant={isSelected ? "default" : "outline"}
                                  onClick={() => toggleFeature(char)}
                                  className="cursor-pointer select-none text-[9px] font-black uppercase tracking-wider py-1 px-2.5 transition-all hover:bg-primary/10 active:scale-95"
                                >
                                  {char}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>

                        {/* Campo de criação livre de tag */}
                        <div className="space-y-2">
                          <Label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Criar característica personalizada na hora</Label>
                          <div className="flex gap-2">
                            <Input 
                              placeholder="Digite um nome (ex: Quintal Grande)" 
                              value={newFeatureName}
                              onChange={(e) => setNewFeatureName(e.target.value)}
                              className="h-10 text-xs border-slate-200"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddNewFeature();
                                }
                              }}
                            />
                            <Button 
                              type="button" 
                              onClick={handleAddNewFeature}
                              className="h-10 text-xs font-bold uppercase px-4 shrink-0"
                            >
                              + Criar
                            </Button>
                          </div>
                        </div>

                        {/* Lista de características ativas para alteração do valor */}
                        {customFields.length > 0 && (
                          <div className="space-y-2 mt-4 pt-4 border-t border-slate-100">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Valores / Detalhes das Características</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {customFields.map((field, idx) => (
                                <div key={idx} className="flex gap-2 items-center bg-slate-50/50 p-2 rounded-xl border border-slate-100/50">
                                  <span className="text-xs font-bold text-slate-700 flex-1 truncate pl-1">{field.key}</span>
                                  <Input
                                    placeholder="Sim"
                                    value={field.value}
                                    onChange={(e) => handleCustomFieldChange(idx, "value", e.target.value)}
                                    className="h-8 text-xs border-slate-200 bg-white w-24 text-center font-medium rounded-lg"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveCustomField(idx)}
                                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg flex-shrink-0"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        {customFields.map((field, idx) => (
                          <div key={idx} className="space-y-1 p-3 bg-slate-50/50 rounded-xl border border-slate-100/50">
                            <Label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{field.key}</Label>
                            <p className="text-sm font-bold text-slate-800">{field.value}</p>
                          </div>
                        ))}
                        {customFields.length === 0 && (
                          <p className="text-xs text-slate-400 col-span-2 py-2">Sem características adicionais cadastradas.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Coluna Direita - Descrição e Upload */}
                <div className="md:col-span-5 space-y-6">
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm h-full flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="h-7 w-1 bg-slate-200 rounded-full" />
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-900">Descrição Detalhada</h4>
                    </div>
                    {isEditing ? (
                      <Textarea 
                        {...register("descricao")} 
                        className="flex-1 min-h-[200px] text-sm border-slate-200 resize-none focus:ring-primary/20 p-4" 
                        placeholder="Escreva sobre as qualidades do imóvel..."
                      />
                    ) : (
                      <div className="flex-1 bg-slate-50/50 p-4 rounded-xl border border-slate-50">
                        <p className="text-xs font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">
                          {imovel.descricao || "Nenhuma descrição detalhada foi fornecida para este imóvel."}
                        </p>
                      </div>
                    )}

                    {isEditing && (
                      <div className="mt-6 space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Novas Fotos</Label>
                          <span className="text-[9px] font-bold text-primary/60 px-2 py-0.5 bg-primary/5 rounded-full">UP TO 10MB</span>
                        </div>
                        <label className="border-2 border-dashed border-slate-100 rounded-2xl h-28 flex flex-col items-center justify-center cursor-pointer hover:border-primary/30 hover:bg-slate-50 transition-all group active:scale-95 shadow-inner">
                          <Upload className="h-6 w-6 text-slate-300 group-hover:text-primary transition-colors duration-300" />
                          <span className="text-[10px] font-black text-slate-400 group-hover:text-primary mt-2 tracking-widest transition-colors duration-300">ADICIONAR ARQUIVOS</span>
                          <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 border-t border-slate-50 bg-white/80 backdrop-blur-md sticky bottom-0 z-10">
          {isEditing ? (
            <div className="flex w-full gap-4">
              <Button 
                variant="outline" 
                onClick={() => setIsEditing(false)}
                className="flex-1 h-12 text-[11px] font-bold uppercase tracking-widest border-slate-200 hover:bg-slate-50 transition-all rounded-xl"
              >
                Cancelar
              </Button>
              <Button 
                form="edit-property-form"
                type="submit" 
                disabled={updateMutation.isPending || uploading}
                className="flex-[2] h-12 text-[11px] font-bold uppercase tracking-widest shadow-elegant transition-all active:scale-[0.98] rounded-xl"
              >
                {updateMutation.isPending || uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {uploading ? "Sincronizando..." : "Confirmar Alterações"}
              </Button>
            </div>
          ) : (
            <Button 
              onClick={() => onOpenChange(false)}
              className="w-full h-12 text-[11px] font-bold uppercase tracking-widest shadow-saas transition-all active:scale-[0.98] rounded-xl"
            >
              Fechar Detalhes
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
