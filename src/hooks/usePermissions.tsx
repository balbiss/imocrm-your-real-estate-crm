import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Action = 'view_reports' | 'manage_team' | 'manage_properties' | 'delete_records' | 'configure_system';

export function usePermissions() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("perfis")
        .select("role")
        .eq("id", user.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  const can = (action: Action): boolean => {
    if (!profile) return false;
    const role = profile.role;

    switch (action) {
      case 'view_reports':
      case 'manage_team':
      case 'configure_system':
        return role === 'dono' || role === 'gerente';
      case 'manage_properties':
        return true; // Todos podem ver imóveis, mas talvez apenas dono/gerente editem?
      case 'delete_records':
        return role === 'dono';
      default:
        return false;
    }
  };

  return { can, role: profile?.role };
}

export function PermissionGuard({ action, children, fallback = null }: { action: Action, children: React.ReactNode, fallback?: React.ReactNode }) {
  const { can } = usePermissions();
  if (!can(action)) return <>{fallback}</>;
  return <>{children}</>;
}
