import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/AuthLayout";
import { TextField } from "@/components/TextField";
import { PasswordInput } from "@/components/PasswordInput";
import { useAuth } from "@/context/AuthContext";

const schema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  senha: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});
type FormData = z.infer<typeof schema>;

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — ImoCRM" },
      { name: "description", content: "Acesse sua conta ImoCRM e gerencie seus leads imobiliários." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      await login(data.email, data.senha);
      toast.success("Bem-vindo de volta!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.toLowerCase().includes("invalid login")) {
        toast.error("E-mail ou senha incorretos");
      } else if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) {
        toast.error("Erro de conexão. Tente novamente.");
      } else {
        toast.error(msg || "Não foi possível entrar");
      }
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-2 mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Bem-vindo de volta</h2>
        <p className="text-sm text-muted-foreground">
          Entre na sua conta para continuar gerenciando seus leads.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">E-mail</label>
          <TextField
            id="email"
            type="email"
            placeholder="voce@imobiliaria.com"
            autoComplete="email"
            icon={<Mail className="h-4 w-4" />}
            hasError={!!errors.email}
            {...register("email")}
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="senha" className="text-sm font-medium">Senha</label>
            <Link to="/login" className="text-xs text-primary hover:underline font-medium">
              Esqueci minha senha
            </Link>
          </div>
          <PasswordInput
            id="senha"
            placeholder="••••••••"
            autoComplete="current-password"
            hasError={!!errors.senha}
            {...register("senha")}
          />
          {errors.senha && <p className="text-xs text-destructive">{errors.senha.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-brand text-primary-foreground text-sm font-semibold transition shadow-elegant hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Não tem conta?{" "}
        <Link to="/cadastro" className="font-semibold text-primary hover:underline">
          Cadastre sua imobiliária
        </Link>
      </p>
    </AuthLayout>
  );
}
