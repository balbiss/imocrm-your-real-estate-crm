import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export interface Notification {
  id: string;
  usuario_id: string;
  imobiliaria_id: string;
  lead_id: string | null;
  tipo: 'novo_lead' | 'sla_vencido' | 'followup' | 'descarte' | 'redistribuicao' | 'possivel_duplicidade';
  titulo: string;
  mensagem: string | null;
  lida: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    // Buscar notificações iniciais
    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from("notificacoes")
        .select("*")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (!error && data) {
        setNotifications(data as Notification[]);
        setUnreadCount(data.filter(n => !n.lida).length);
      }
    };

    fetchNotifications();

    // Ouvir mudanças em tempo real
    const channel = supabase
      .channel(`notificacoes_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificacoes',
          filter: `usuario_id=eq.${user.id}`
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications(prev => [newNotif, ...prev].slice(0, 20));
          setUnreadCount(prev => prev + 1);
          
          // Toast apenas para notificações recentes (últimos 5 segundos)
          const isRecent = new Date().getTime() - new Date(newNotif.created_at).getTime() < 5000;
          if (isRecent) {
            toast(newNotif.titulo, {
              description: newNotif.mensagem || "Nova atualização no sistema.",
              duration: 4000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAsRead = async (id: string) => {
    const { error } = await supabase
      .from("notificacoes")
      .update({ lida: true })
      .eq("id", id);

    if (!error) {
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, lida: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("notificacoes")
      .update({ lida: true })
      .eq("usuario_id", user.id)
      .eq("lida", false);

    if (!error) {
      setNotifications(prev => prev.map(n => ({ ...n, lida: true })));
      setUnreadCount(0);
    }
  };

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead
  };
}
