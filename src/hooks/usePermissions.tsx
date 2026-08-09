import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Action = 'view_reports' | 'manage_team' | 'manage_properties' | 'delete_records' | 'configure_system' | 'view_roleta' | 'manage_roleta' | 'view_base_leads';

export function usePermissions() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("perfis")
        .select("role, bloqueado")
        .eq("id", user.id)
        .single();
      return data;
    },
    enabled: !!user,
    // Verifica bloqueio periodicamente -- pega mesmo quem ja estava logado
    // numa aba aberta quando o dono/gerente bloqueou o acesso em /equipe.
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (profile?.bloqueado) {
      logout().then(() => {
        toast.error("Seu acesso foi bloqueado. Fale com seu gerente ou com o dono da imobiliária.");
        navigate({ to: "/login" });
      });
    }
  }, [profile?.bloqueado, logout, navigate]);

  const can = (action: Action): boolean => {
    if (!profile) return false;
    const role = profile.role;

    switch (action) {
      case 'view_reports':
      case 'view_roleta':
        return true; // Todos (Dono, Gerente, Corretor)
      case 'manage_roleta':
      case 'manage_team':
      case 'configure_system':
        return role === 'dono' || role === 'gerente';
      case 'view_base_leads':
        // Gerente não pode ver a base de leads (clientes)
        return role === 'dono' || role === 'corretor';
      case 'manage_properties':
        return true; 
      case 'delete_records':
        return role === 'dono';
      default:
        return false;
    }
  };

  return { can, role: profile?.role, isLoading };
}

export function PermissionGuard({ action, children, fallback = null }: { action: Action, children: React.ReactNode, fallback?: React.ReactNode }) {
  const { can } = usePermissions();
  if (!can(action)) return <>{fallback}</>;
  return <>{children}</>;
}
