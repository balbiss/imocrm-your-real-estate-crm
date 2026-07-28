import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/AuthLayout";
import { TextField } from "@/components/TextField";
import { useAuth } from "@/context/AuthContext";

const schema = z.object({
  email: z.string().trim().email("E-mail inválido"),
});
type FormData = z.infer<typeof schema>;

export const Route = createFileRoute("/esqueci-senha")({
  head: () => ({
    meta: [{ title: "Esqueci minha senha — CRM" }],
  }),
  component: EsqueciSenhaPage,
});

function EsqueciSenhaPage() {
  const { resetPassword } = useAuth();
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      await resetPassword(data.email);
      setSent(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(msg || "Não foi possível enviar o e-mail de redefinição");
    }
  };

  if (sent) {
    return (
      <AuthLayout>
        <div className="space-y-4 mb-8 animate-fade-in-up text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">E-mail enviado!</h2>
          <p className="text-sm text-muted-foreground">
            Se esse e-mail estiver cadastrado, você vai receber um link pra redefinir sua senha. Confira também a caixa de spam.
          </p>
        </div>
        <Link
          to="/login"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-brand text-primary-foreground text-sm font-semibold transition shadow-elegant hover:opacity-95"
        >
          Voltar para o login
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="space-y-2 mb-8 animate-fade-in-up">
        <h2 className="text-3xl font-bold tracking-tight">Esqueci minha senha</h2>
        <p className="text-sm text-muted-foreground">
          Digite seu e-mail e vamos te mandar um link pra criar uma nova senha.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 animate-fade-in-up" style={{ animationDelay: '200ms' }} noValidate>
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

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-brand text-primary-foreground text-sm font-semibold transition shadow-elegant hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? "Enviando..." : "Enviar link de redefinição"}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Lembrou a senha?{" "}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Voltar para o login
        </Link>
      </p>
    </AuthLayout>
  );
}
