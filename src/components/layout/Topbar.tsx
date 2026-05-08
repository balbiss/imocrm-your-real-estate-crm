import { Menu, Search, Bell, Check, Clock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";

export function Topbar({
  title,
  onToggleSidebar,
}: {
  title: string;
  onToggleSidebar: () => void;
}) {
  const { user } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const nome = (user?.user_metadata as any)?.nome_completo ?? user?.email ?? "Usuário";
  const inicial = String(nome).trim().charAt(0).toUpperCase();

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-[#e2e8f0] bg-white px-4">
      <button
        onClick={onToggleSidebar}
        className="rounded-md p-2 text-[#475569] transition hover:bg-[#f1f5f9]"
        aria-label="Alternar menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="hidden text-base font-semibold text-[#0f172a] md:block">{title}</h1>

      <div className="relative ml-2 hidden flex-1 max-w-md md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
        <input
          type="search"
          placeholder="Buscar leads, corretores..."
          className="h-9 w-full rounded-md border border-[#e2e8f0] bg-[#f8fafc] pl-9 pr-3 text-sm placeholder:text-[#94a3b8] focus:border-[#3b82f6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/20"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative rounded-md p-2 text-[#475569] transition hover:bg-[#f1f5f9]">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0 shadow-2xl border-slate-200">
            <div className="flex items-center justify-between p-4 border-b">
              <DropdownMenuLabel className="p-0 font-bold text-sm">Notificações</DropdownMenuLabel>
              {unreadCount > 0 && (
                <button 
                  onClick={markAllAsRead}
                  className="text-[10px] font-bold text-primary hover:underline uppercase"
                >
                  Ler tudo
                </button>
              )}
            </div>
            <ScrollArea className="h-[350px]">
              {notifications.length === 0 ? (
                <div className="p-10 text-center text-slate-400">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-xs font-medium">Nenhuma notificação</p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {notifications.map((n) => (
                    <DropdownMenuItem 
                      key={n.id} 
                      className={`p-4 cursor-pointer focus:bg-slate-50 flex flex-col items-start gap-1 border-b last:border-0 ${!n.lida ? 'bg-slate-50/50' : ''}`}
                      onClick={() => markAsRead(n.id)}
                    >
                      <div className="flex justify-between w-full gap-2">
                        <span className={`text-[11px] font-bold leading-tight ${!n.lida ? 'text-slate-900' : 'text-slate-500'}`}>
                          {n.titulo}
                        </span>
                        {!n.lida && <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </div>
              )}
            </ScrollArea>
            <div className="p-2 border-t bg-slate-50">
              <button className="w-full text-center py-1 text-[10px] font-bold text-slate-500 hover:text-primary uppercase tracking-wider">
                Ver todas as notificações
              </button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mx-1 h-6 w-px bg-[#e2e8f0]" />

        <div className="flex items-center gap-2 pr-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-brand text-xs font-semibold text-white">
            {inicial}
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-xs font-semibold leading-tight text-[#0f172a]">{nome}</p>
            <p className="text-[10px] leading-tight text-[#64748b]">Acesso Hinode</p>
          </div>
        </div>
      </div>
    </header>
  );
}
