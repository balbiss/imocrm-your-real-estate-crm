import React from "react";
import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFollowUpAlerts } from "@/hooks/useFollowUpAlerts";
import { VisitaAlertProvider } from "@/components/analytics/VisitaAlertProvider";
import { LeadNovoAlertProvider } from "@/components/leads/LeadNovoAlertProvider";

import appCss from "../styles.css?url";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // Dados permanecem "frescos" por 1 minuto
      gcTime: 1000 * 60 * 5, // Cache mantido em memória por 5 minutos
      refetchOnWindowFocus: false, // Evita recarregar toda vez que o usuário volta para a aba
      retry: 1, // Limita tentativas em caso de erro para não travar a UI
    },
  },
});

function NotFoundComponent() {
// ... existing code ...
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe.
        </p>
        <div className="mt-6">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Ir para o login
          </Link>
        </div>
      </div>
    </div>
  );
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || process.env.BACKEND_URL || "";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CRM — Gestão de Leads Imobiliários" },
      { name: "description", content: "Sistema de gestão de leads para imobiliárias. Funil visual, follow-up automático e relatórios em tempo real." },
      { name: "theme-color", content: "#1d4ed8" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "CRM Hinode" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: `${BACKEND_URL}/manifest.webmanifest` },
      { rel: "apple-touch-icon", href: `${BACKEND_URL}/apple-touch-icon.png` },
      { rel: "icon", href: `${BACKEND_URL}/favicon-32x32.png`, type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AppHooks() {
  useFollowUpAlerts();
  return null;
}

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppHooks />
        {/* Ficam aqui (não em MainLayout) porque MainLayout é instanciado de
        novo em cada rota-folha — mantê-los lá fazia o canal Realtime cair e
        reabrir a cada navegação, perdendo notificação de lead novo/alerta de
        visita bem na janela entre o unsubscribe e o subscribe novo. */}
        <VisitaAlertProvider />
        <LeadNovoAlertProvider />
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
