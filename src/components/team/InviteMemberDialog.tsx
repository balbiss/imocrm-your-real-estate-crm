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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteMemberDialog({ open, onOpenChange }: InviteMemberDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      // Buscar perfil do usuário logado para pegar a imobiliaria_id
      const { data: profile } = await supabase
        .from("perfis")
        .select("imobiliaria_id")
        .eq("id", user?.id)
        .single();

      if (!profile?.imobiliaria_id) throw new Error("Imobiliária não encontrada");

      // Chamar a Edge Function para convidar o usuário
      const { data: responseData, error } = await supabase.functions.invoke("invite-member", {
        body: {
          email: data.email,
          nome: data.nome,
          role: data.role,
          imobiliaria_id: profile.imobiliaria_id,
          telefone: data.telefone,
        },
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-list"] });
      toast.success("Membro adicionado com sucesso!", {
        description: "A senha padrão dele é: Hinode@Mudar123",
        duration: 10000,
      });
      reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error("Erro ao convidar: " + error.message);
    },
  });

  const onSubmit = (data: any) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px] bg-white border-none shadow-2xl">
        <DialogHeader>
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
             <Mail className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight">Convidar para a Equipe</DialogTitle>
          <p className="text-saas-sm text-muted-foreground">O novo membro receberá um e-mail com as instruções de acesso.</p>
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

          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold uppercase text-slate-400">E-mail Corporativo</Label>
            <Input 
              type="email"
              placeholder="joao@imobiliaria.com" 
              {...register("email", { required: true })}
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
              <Select onValueChange={(v) => setValue("role", v)}>
                <SelectTrigger className="h-10 text-sm border-slate-200">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="corretor">Corretor</SelectItem>
                  <SelectItem value="gerente">Gerente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-4 flex flex-col gap-2">
            <Button 
              type="submit" 
              disabled={mutation.isPending}
              className="w-full h-11 text-xs font-bold uppercase tracking-wider bg-primary shadow-lg shadow-primary/20"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enviar Convite
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
