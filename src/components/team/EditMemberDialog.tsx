import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, UserCog } from "lucide-react";

interface EditMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: any;
}

export function EditMemberDialog({ open, onOpenChange, member }: EditMemberDialogProps) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  useEffect(() => {
    if (member && open) {
      setValue("nome", member.nome);
      setValue("telefone", member.telefone);
      setValue("role", member.role);
    }
  }, [member, open, setValue]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase
        .from("perfis")
        .update({
          nome: data.nome,
          telefone: data.telefone,
          role: data.role,
        })
        .eq("id", member.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-list"] });
      toast.success("Dados do membro atualizados com sucesso!");
      reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar membro: " + error.message);
    },
  });

  const onSubmit = (data: any) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px] bg-white border-none shadow-2xl">
        <DialogHeader>
          <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center mb-3">
             <UserCog className="h-5 w-5 text-indigo-600" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight">Editar Membro</DialogTitle>
          <p className="text-saas-sm text-muted-foreground">Atualize as informações do consultor na equipe.</p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold uppercase text-slate-400">Nome Completo</Label>
            <Input 
              placeholder="Ex: João Silva" 
              {...register("nome", { required: true })}
              className="h-10 text-sm border-slate-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase text-slate-400">Telefone/WhatsApp</Label>
              <Input 
                placeholder="(00) 00000-0000" 
                {...register("telefone")}
                className="h-10 text-sm border-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase text-slate-400">Cargo / Nível</Label>
              <Select onValueChange={(v) => setValue("role", v)} defaultValue={member?.role}>
                <SelectTrigger className="h-10 text-sm border-slate-200">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="corretor">Corretor</SelectItem>
                  <SelectItem value="gerente">Gerente</SelectItem>
                  <SelectItem value="dono">Dono</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-4 flex flex-col gap-2">
            <Button 
              type="submit" 
              disabled={mutation.isPending}
              className="w-full h-11 text-xs font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar Alterações
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
              className="w-full h-10 text-xs font-bold uppercase text-slate-400 hover:text-slate-600"
            >
              Cancelar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
