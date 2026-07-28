import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/AuthLayout";
import { PasswordInput } from "@/components/PasswordInput";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const schema = z
  .object({
    senha: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
    confirmarSenha: z.string(),
  })
  .refine((data) => data.senha === data.confirmarSenha, {
    message: "As senhas não coincidem",
    path: ["confirmarSenha"],
  });
type FormData = z.infer<typeof schema>;

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({
    meta: [{ title: "Redefinir senha — CRM" }],
  }),
  component: RedefinirSenhaPage,
});

function RedefinirSenhaPage() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();
  const [validSession, setValidSession] = useState<boolean | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    // O link do e-mail de recuperação abre a sessão automaticamente
    // (o supabase-js lê o token direto da URL). Só confirmamos que existe sessão.
    supabase.auth.getSession().then(({ data }) => {
      setValidSession(!!data.session);
    });
  }, []);

  const onSubmit = async (data: FormData) => {
    try {
      await updatePassword(data.senha);
      toast.success("Senha redefinida com sucesso!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(msg || "Não foi possível redefinir a senha");
    }
  };

  if (validSession === false) {
    return (
      <AuthLayout>
        <div className="space-y-2 mb-8 animate-fade-in-up text-center">
          <h2 className="text-2xl font-bold tracking-tight">Link inválido ou expirado</h2>
          <p className="text-sm text-muted-foreground">
            Peça um novo link em "Esqueci minha senha" na tela de login.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="space-y-2 mb-8 animate-fade-in-up">
        <h2 className="text-3xl font-bold tracking-tight">Criar nova senha</h2>
        <p className="text-sm text-muted-foreground">
          Escolha uma nova senha de acesso pra sua conta.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 animate-fade-in-up" style={{ animationDelay: '200ms' }} noValidate>
        <div className="space-y-1.5">
          <label htmlFor="senha" className="text-sm font-medium">Nova senha</label>
          <PasswordInput
            id="senha"
            placeholder="••••••••"
            autoComplete="new-password"
            hasError={!!errors.senha}
            {...register("senha")}
          />
          {errors.senha && <p className="text-xs text-destructive">{errors.senha.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirmarSenha" className="text-sm font-medium">Confirmar nova senha</label>
          <PasswordInput
            id="confirmarSenha"
            placeholder="••••••••"
            autoComplete="new-password"
            hasError={!!errors.confirmarSenha}
            {...register("confirmarSenha")}
          />
          {errors.confirmarSenha && <p className="text-xs text-destructive">{errors.confirmarSenha.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting || validSession === null}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-brand text-primary-foreground text-sm font-semibold transition shadow-elegant hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? "Salvando..." : "Salvar nova senha"}
        </button>
      </form>
    </AuthLayout>
  );
}
