import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Trash2, Edit2, Plus, Loader2, Save, X } from "lucide-react";

interface ManageColumnsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imobiliariaId: string;
}

const COLORS = [
  { value: "bg-blue-500", label: "Azul" },
  { value: "bg-orange-500", label: "Laranja" },
  { value: "bg-red-500", label: "Vermelho" },
  { value: "bg-purple-500", label: "Roxo" },
  { value: "bg-amber-500", label: "Amarelo" },
  { value: "bg-cyan-500", label: "Ciano" },
  { value: "bg-slate-500", label: "Cinza" },
  { value: "bg-emerald-500", label: "Verde" },
  { value: "bg-rose-600", label: "Rosa" },
  { value: "bg-indigo-500", label: "Índigo" },
];

export function ManageColumnsDialog({ open, onOpenChange, imobiliariaId }: ManageColumnsDialogProps) {
  const queryClient = useQueryClient();
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnColor, setNewColumnColor] = useState("bg-blue-500");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingColor, setEditingColor] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Buscar colunas da imobiliária
  const { data: colunas, isLoading } = useQuery({
    queryKey: ["colunas_kanban", imobiliariaId],
    queryFn: async () => {
      if (!imobiliariaId) return [];
      const { data, error } = await supabase
        .from("colunas_kanban")
        .select("*")
        .eq("imobiliaria_id", imobiliariaId)
        .order("posicao", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!imobiliariaId && open,
  });

  // Criar coluna
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newColumnName.trim()) return;
      const nextPos = colunas && colunas.length > 0 ? Math.max(...colunas.map(c => c.posicao)) + 1 : 0;
      
      const { error } = await supabase
        .from("colunas_kanban")
        .insert({
          imobiliaria_id: imobiliariaId,
          nome: newColumnName.trim(),
          cor: newColumnColor,
          posicao: nextPos,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colunas_kanban", imobiliariaId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setNewColumnName("");
      toast.success("Coluna adicionada ao funil!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao adicionar coluna.");
    },
  });

  // Editar coluna (Salvar nome/cor)
  const updateMutation = useMutation({
    mutationFn: async ({ id, nome, cor }: { id: string; nome: string; cor: string }) => {
      const { error } = await supabase
        .from("colunas_kanban")
        .update({ nome, cor })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colunas_kanban", imobiliariaId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setEditingId(null);
      toast.success("Coluna atualizada!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao atualizar coluna.");
    },
  });

  // Deletar coluna
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("colunas_kanban")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colunas_kanban", imobiliariaId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Coluna removida! Os leads foram movidos para a coluna inicial.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao excluir coluna.");
    },
  });

  // Mover posição
  const moveMutation = useMutation({
    mutationFn: async ({ index, direction }: { index: number; direction: "up" | "down" }) => {
      if (!colunas) return;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= colunas.length) return;

      const current = colunas[index];
      const target = colunas[targetIndex];

      // Inverter posições no banco
      const { error: err1 } = await supabase
        .from("colunas_kanban")
        .update({ posicao: target.posicao })
        .eq("id", current.id);
      if (err1) throw err1;

      const { error: err2 } = await supabase
        .from("colunas_kanban")
        .update({ posicao: current.posicao })
        .eq("id", target.id);
      if (err2) throw err2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colunas_kanban", imobiliariaId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-md font-bold">Gerenciar Colunas do Kanban</DialogTitle>
        </DialogHeader>

        {/* Formulário de Adicionar */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-3">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nova Coluna</h4>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 space-y-1 w-full">
              <Label className="text-[9px] font-bold text-slate-500 uppercase">Nome da Coluna</Label>
              <Input 
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="Ex: Em Negociação"
                className="h-9 text-xs border-slate-200 bg-white"
              />
            </div>
            <div className="w-full sm:w-44 space-y-1">
              <Label className="text-[9px] font-bold text-slate-500 uppercase">Cor do Indicador</Label>
              <select
                value={newColumnColor}
                onChange={(e) => setNewColumnColor(e.target.value)}
                className="w-full h-9 text-xs border border-slate-200 bg-white rounded-md px-2 focus:ring-primary/20 focus:outline-none"
              >
                {COLORS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <Button 
              size="sm"
              disabled={createMutation.isPending || !newColumnName.trim()}
              onClick={() => createMutation.mutate()}
              className="h-9 px-4 font-bold text-xs uppercase"
            >
              {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              Adicionar
            </Button>
          </div>
        </div>

        {/* Listagem de Colunas */}
        <div className="flex-1 overflow-y-auto my-4 pr-1 custom-scrollbar min-h-[200px]">
          <div className="space-y-2">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 px-1">Colunas Ativas</h4>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : colunas && colunas.length > 0 ? (
              colunas.map((coluna, index) => {
                const isEditing = editingId === coluna.id;
                return (
                  <div 
                    key={coluna.id} 
                    className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Cor da Coluna */}
                      {isEditing ? (
                        <select
                          value={editingColor}
                          onChange={(e) => setEditingColor(e.target.value)}
                          className="h-8 text-xs border border-slate-200 rounded px-1"
                        >
                          {COLORS.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      ) : (
                        <div className={`w-3.5 h-3.5 rounded-full ${coluna.cor} shrink-0`} />
                      )}

                      {/* Nome da Coluna */}
                      {isEditing ? (
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-8 text-xs flex-1 min-w-[120px]"
                        />
                      ) : (
                        <span className="text-xs font-bold text-slate-700 truncate">{coluna.nome}</span>
                      )}
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-1 shrink-0">
                      {isEditing ? (
                        <>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-emerald-600 hover:bg-emerald-50"
                            onClick={() => updateMutation.mutate({ id: coluna.id, nome: editingName, cor: editingColor })}
                            disabled={updateMutation.isPending}
                          >
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-slate-400 hover:bg-slate-50"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : deleteConfirmId === coluna.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-red-600 font-bold mr-1 animate-pulse">Tem certeza?</span>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 font-bold"
                            onClick={() => {
                              deleteMutation.mutate(coluna.id);
                              setDeleteConfirmId(null);
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            Sim
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 px-2 text-xs text-slate-500 hover:bg-slate-50 font-bold"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            Não
                          </Button>
                        </div>
                      ) : (
                        <>
                          {/* Mover para Cima */}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-slate-400 hover:bg-slate-50"
                            disabled={index === 0}
                            onClick={() => moveMutation.mutate({ index, direction: "up" })}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          {/* Mover para Baixo */}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-slate-400 hover:bg-slate-50"
                            disabled={index === colunas.length - 1}
                            onClick={() => moveMutation.mutate({ index, direction: "down" })}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          {/* Editar */}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-slate-400 hover:text-primary hover:bg-slate-50"
                            onClick={() => {
                              setEditingId(coluna.id);
                              setEditingName(coluna.nome);
                              setEditingColor(coluna.cor);
                            }}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          {/* Deletar */}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => setDeleteConfirmId(coluna.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs font-medium">
                Nenhuma coluna cadastrada.
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-slate-50 pt-4">
          <Button onClick={() => onOpenChange(false)} className="w-full sm:w-auto text-xs font-bold uppercase">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
