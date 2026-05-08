import React, { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2, Mail, Phone, FileText, User, Loader2, Check, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/AuthLayout";
import { TextField } from "@/components/TextField";
import { PasswordInput } from "@/components/PasswordInput";
import { useAuth } from "@/context/AuthContext";
import { maskCNPJ, maskTelefone, passwordStrength } from "@/lib/masks";
import { cn } from "@/lib/utils";

const step1Schema = z.object({
  imobiliariaNome: z.string().trim().min(2, "Informe o nome da imobiliária").max(120),
  imobiliariaCnpj: z.string().optional(),
  imobiliariaTelefone: z.string().optional(),
  imobiliariaEmail: z.string().trim().email("E-mail inválido"),
});

const step2Schema = z
  .object({
    nomeCompleto: z.string().trim().min(3, "Informe seu nome completo").max(120),
    email: z.string().trim().email("E-mail inválido"),
    senha: z
      .string()
      .min(8, "Mínimo de 8 caracteres")
      .regex(/[A-Z]/, "Inclua uma letra maiúscula")
      .regex(/[0-9]/, "Inclua um número"),
    confirmar: z.string(),
  })
  .refine((d) => d.senha === d.confirmar, {
    message: "As senhas não coincidem",
    path: ["confirmar"],
  });

const fullSchema = step1Schema.and(step2Schema);
type FormData = z.infer<typeof fullSchema>;

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [
      { title: "Cadastrar imobiliária — CRM" },
      { name: "description", content: "Crie sua conta no CRM e comece a gerenciar leads imobiliários hoje mesmo." },
    ],
  }),
  component: CadastroPage,
});

function CadastroPage() {
  const navigate = useNavigate();
  const { cadastrar } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);

  const {
    register,
    handleSubmit,
    trigger,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(fullSchema),
    mode: "onTouched",
  });

  const senha = watch("senha") ?? "";
  const strength = passwordStrength(senha);

  const goNext = async () => {
    const valid = await trigger(["imobiliariaNome", "imobiliariaEmail", "imobiliariaCnpj", "imobiliariaTelefone"]);
    if (valid) setStep(2);
  };

  const onSubmit = async (data: FormData) => {
    try {
      await cadastrar({
        imobiliariaNome: data.imobiliariaNome,
        imobiliariaCnpj: data.imobiliariaCnpj,
        imobiliariaTelefone: data.imobiliariaTelefone,
        imobiliariaEmail: data.imobiliariaEmail,
        nomeCompleto: data.nomeCompleto,
        email: data.email,
        senha: data.senha,
      });
      toast.success("Conta criada com sucesso! Redirecionando...");
      navigate({ to: "/dashboard" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("registered")) {
        toast.error("E-mail já cadastrado");
      } else if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) {
        toast.error("Erro de conexão. Tente novamente.");
      } else {
        toast.error(msg || "Não foi possível criar a conta");
      }
    }
  };

  return (
    <AuthLayout>
      <div className="mb-6 space-y-2 animate-fade-in-up">
        <h2 className="text-3xl font-bold tracking-tight">Crie sua conta</h2>
        <p className="text-sm text-muted-foreground">
          Comece grátis. Sem cartão de crédito.
        </p>
      </div>

      {/* Stepper */}
      <div className="animate-fade-in-up" style={{ animationDelay: '150ms' }}>
        <Stepper step={step} />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 animate-fade-in-up" style={{ animationDelay: '300ms' }} noValidate>
        {step === 1 && (
          <>
            <Field label="Nome da imobiliária" required error={errors.imobiliariaNome?.message}>
              <TextField
                placeholder="Casa Viva Imóveis"
                icon={<Building2 className="h-4 w-4" />}
                hasError={!!errors.imobiliariaNome}
                {...register("imobiliariaNome")}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="CNPJ" optional error={errors.imobiliariaCnpj?.message}>
                <TextField
                  placeholder="00.000.000/0000-00"
                  icon={<FileText className="h-4 w-4" />}
                  hasError={!!errors.imobiliariaCnpj}
                  {...register("imobiliariaCnpj")}
                  onChange={(e) => setValue("imobiliariaCnpj", maskCNPJ(e.target.value))}
                />
              </Field>

              <Field label="Telefone" optional error={errors.imobiliariaTelefone?.message}>
                <TextField
                  placeholder="(11) 99999-9999"
                  icon={<Phone className="h-4 w-4" />}
                  hasError={!!errors.imobiliariaTelefone}
                  {...register("imobiliariaTelefone")}
                  onChange={(e) => setValue("imobiliariaTelefone", maskTelefone(e.target.value))}
                />
              </Field>
            </div>

            <Field label="E-mail da imobiliária" required error={errors.imobiliariaEmail?.message}>
              <TextField
                type="email"
                placeholder="contato@imobiliaria.com"
                icon={<Mail className="h-4 w-4" />}
                hasError={!!errors.imobiliariaEmail}
                {...register("imobiliariaEmail")}
              />
            </Field>

            <button
              type="button"
              onClick={goNext}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-brand text-primary-foreground text-sm font-semibold shadow-elegant transition hover:opacity-95"
            >
              Próximo passo <ArrowRight className="h-4 w-4" />
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Seu nome completo" required error={errors.nomeCompleto?.message}>
              <TextField
                placeholder="Maria Silva"
                icon={<User className="h-4 w-4" />}
                hasError={!!errors.nomeCompleto}
                autoComplete="name"
                {...register("nomeCompleto")}
              />
            </Field>

            <Field label="E-mail de acesso" required error={errors.email?.message}>
              <TextField
                type="email"
                placeholder="voce@imobiliaria.com"
                icon={<Mail className="h-4 w-4" />}
                hasError={!!errors.email}
                autoComplete="email"
                {...register("email")}
              />
            </Field>

            <Field label="Senha" required error={errors.senha?.message}>
              <PasswordInput
                placeholder="Mínimo 8 caracteres"
                hasError={!!errors.senha}
                autoComplete="new-password"
                {...register("senha")}
              />
              {senha && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1 flex-1 rounded-full transition",
                          i < strength.score
                            ? strength.score <= 1
                              ? "bg-destructive"
                              : strength.score === 2
                              ? "bg-yellow-500"
                              : strength.score === 3
                              ? "bg-blue-500"
                              : "bg-success"
                            : "bg-muted",
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Força: {strength.label}</p>
                </div>
              )}
            </Field>

            <Field label="Confirmar senha" required error={errors.confirmar?.message}>
              <PasswordInput
                placeholder="Repita a senha"
                hasError={!!errors.confirmar}
                autoComplete="new-password"
                {...register("confirmar")}
              />
            </Field>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-semibold transition hover:bg-accent"
              >
                <ArrowLeft className="h-4 w-4" /> Voltar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-brand text-primary-foreground text-sm font-semibold shadow-elegant transition hover:opacity-95 disabled:opacity-60"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? "Criando conta..." : "Criar minha conta"}
              </button>
            </div>
          </>
        )}
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Fazer login
        </Link>
      </p>
    </AuthLayout>
  );
}

function Stepper({ step }: { step: 1 | 2 }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      {[
        { n: 1, label: "Imobiliária" },
        { n: 2, label: "Seu acesso" },
      ].map((s, i) => (
        <div key={s.n} className="flex flex-1 items-center gap-3">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition",
              step >= (s.n as 1 | 2)
                ? "bg-gradient-brand text-primary-foreground border-transparent"
                : "bg-background text-muted-foreground border-border",
            )}
          >
            {step > s.n ? <Check className="h-4 w-4" /> : s.n}
          </div>
          <div className="flex-1">
            <div
              className={cn(
                "text-xs font-medium",
                step >= (s.n as 1 | 2) ? "text-foreground" : "text-muted-foreground",
              )}
            >
              Passo {s.n}
            </div>
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
          </div>
          {i === 0 && (
            <div className={cn("h-px flex-1", step > 1 ? "bg-primary" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  required,
  optional,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium flex items-center gap-1.5">
        {label}
        {required && <span className="text-destructive">*</span>}
        {optional && <span className="text-xs font-normal text-muted-foreground">(opcional)</span>}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
