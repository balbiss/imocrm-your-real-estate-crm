import { Home, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

const features = [
  "Funil de vendas visual",
  "Follow-up automático",
  "Relatórios em tempo real",
];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-2">
      {/* Lado esquerdo — apenas em telas md+ */}
      <aside className="relative hidden lg:flex flex-col justify-between p-12 text-white bg-gradient-brand-dark overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-blue-400/10 blur-3xl" />

        <div className="relative z-10 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 backdrop-blur ring-1 ring-white/20">
            <Home className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">ImoCRM</span>
        </div>

        <div className="relative z-10 space-y-8">
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight tracking-tight">
            Gerencie seus leads<br />imobiliários com<br />
            <span className="bg-gradient-to-r from-blue-300 to-white bg-clip-text text-transparent">
              inteligência
            </span>
          </h1>

          <ul className="space-y-3.5">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-3 text-blue-50/90">
                <CheckCircle2 className="h-5 w-5 text-blue-300 flex-shrink-0" />
                <span className="text-base">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <figure className="relative z-10 rounded-xl border border-white/10 bg-white/5 backdrop-blur p-5">
          <blockquote className="text-sm leading-relaxed text-blue-50/90">
            "Em 3 meses dobramos nossa taxa de conversão. O ImoCRM mudou a forma
            como trabalhamos com leads."
          </blockquote>
          <figcaption className="mt-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-sm font-semibold">
              MR
            </div>
            <div className="text-sm">
              <div className="font-semibold">Marcela Rocha</div>
              <div className="text-blue-200/70 text-xs">Diretora · Casa Viva Imóveis</div>
            </div>
          </figcaption>
        </figure>
      </aside>

      {/* Lado direito */}
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          {/* Logo mobile */}
          <div className="mb-8 flex items-center justify-center gap-2 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-brand text-white">
              <Home className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">ImoCRM</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
