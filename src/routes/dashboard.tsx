import { useEffect, useState } from "react";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { Home, LogOut, Construction, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ImoCRM" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [imobiliariaNome, setImobiliariaNome] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("imobiliarias")
      .select("nome")
      .eq("owner_id", user.id)
      .maybeSingle()
      .then(({ data }) => setImobiliariaNome(data?.nome ?? null));
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;

  const handleLogout = async () => {
    await logout();
    toast.success("Até logo!");
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand text-white">
              <Home className="h-4.5 w-4.5" />
            </div>
            <span className="text-lg font-bold tracking-tight">ImoCRM</span>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium transition hover:bg-accent"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="rounded-2xl border bg-card p-10 text-center shadow-soft">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-brand text-white shadow-elegant">
            <Construction className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Em construção</h1>
          <p className="mt-2 text-muted-foreground">
            Sua área está sendo preparada. Em breve você terá acesso ao funil de leads.
          </p>

          {imobiliariaNome && (
            <div className="mx-auto mt-8 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm">
              <Building2 className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Imobiliária:</span>
              <span className="font-semibold">{imobiliariaNome}</span>
            </div>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            Logado como <span className="font-medium text-foreground">{user.email}</span>
          </p>
        </div>
      </main>
    </div>
  );
}
