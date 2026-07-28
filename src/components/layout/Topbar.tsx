import { useEffect, useRef, useState } from "react";
import { Menu, Search, Bell, Check, Clock, User as UserIcon, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
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

interface SearchLeadResult { id: string; nome: string; telefone: string | null }
interface SearchCorretorResult { id: string; nome: string }

export function Topbar({
  title,
  onToggleSidebar,
}: {
  title: string;
  onToggleSidebar: () => void;
}) {
  const { user } = useAuth();
  const { can, role } = usePermissions();
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const nome = (user?.user_metadata as any)?.nome_completo ?? user?.email ?? "Usuário";
  const inicial = String(nome).trim().charAt(0).toUpperCase();

  const searchBoxRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<{ leads: SearchLeadResult[]; corretores: SearchCorretorResult[] }>({ leads: [], corretores: [] });

  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 2 || !user) {
      setSearchResults({ leads: [], corretores: [] });
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const timer = setTimeout(async () => {
      const { data: profile } = await supabase
        .from("perfis")
        .select("imobiliaria_id")
        .eq("id", user.id)
        .single();
      if (!profile?.imobiliaria_id) {
        setSearchResults({ leads: [], corretores: [] });
        setSearchLoading(false);
        return;
      }

      let leadsQuery = supabase
        .from("leads")
        .select("id, nome, telefone")
        .eq("imobiliaria_id", profile.imobiliaria_id)
        .or(`nome.ilike.%${term}%,telefone.ilike.%${term}%`)
        .limit(6);
      if (role === "corretor") {
        leadsQuery = leadsQuery.eq("corretor_id", user.id);
      }

      const corretoresPromise = can("manage_team")
        ? supabase
            .from("perfis")
            .select("id, nome")
            .eq("imobiliaria_id", profile.imobiliaria_id)
            .ilike("nome", `%${term}%`)
            .limit(5)
        : Promise.resolve({ data: [] as SearchCorretorResult[] });

      const [{ data: leadsData }, { data: corretoresData }] = await Promise.all([leadsQuery, corretoresPromise]);

      setSearchResults({ leads: leadsData || [], corretores: corretoresData || [] });
      setSearchLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, user, role]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const goToLead = (id: string) => {
    setSearchOpen(false);
    setSearchTerm("");
    navigate({ to: "/leads/$id", params: { id } });
  };

  const goToCorretor = () => {
    setSearchOpen(false);
    setSearchTerm("");
    navigate({ to: "/equipe" });
  };

  const term = searchTerm.trim();
  const hasResults = searchResults.leads.length > 0 || searchResults.corretores.length > 0;

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

      <div ref={searchBoxRef} className="relative ml-2 hidden flex-1 max-w-md md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
        <input
          type="search"
          placeholder="Buscar leads, corretores..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          className="h-9 w-full rounded-md border border-[#e2e8f0] bg-[#f8fafc] pl-9 pr-3 text-sm placeholder:text-[#94a3b8] focus:border-[#3b82f6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/20"
        />

        {searchOpen && term.length >= 2 && (
          <div className="absolute left-0 right-0 top-11 z-50 max-h-96 overflow-y-auto rounded-md border border-[#e2e8f0] bg-white shadow-lg">
            {searchLoading ? (
              <div className="flex items-center justify-center gap-2 p-4 text-sm text-[#94a3b8]">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
              </div>
            ) : !hasResults ? (
              <p className="p-4 text-center text-sm text-[#94a3b8]">Nada encontrado para "{term}"</p>
            ) : (
              <>
                {searchResults.leads.length > 0 && (
                  <div className="py-1.5">
                    <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">Leads</p>
                    {searchResults.leads.map((lead) => (
                      <button
                        key={lead.id}
                        onClick={() => goToLead(lead.id)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[#f1f5f9]"
                      >
                        <Search className="h-3.5 w-3.5 shrink-0 text-[#94a3b8]" />
                        <span className="min-w-0 flex-1 truncate font-medium text-[#0f172a]">{lead.nome}</span>
                        {lead.telefone && <span className="shrink-0 text-xs text-[#94a3b8]">{lead.telefone}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.corretores.length > 0 && (
                  <div className="border-t border-[#e2e8f0] py-1.5">
                    <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">Corretores</p>
                    {searchResults.corretores.map((corretor) => (
                      <button
                        key={corretor.id}
                        onClick={() => goToCorretor()}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[#f1f5f9]"
                      >
                        <UserIcon className="h-3.5 w-3.5 shrink-0 text-[#94a3b8]" />
                        <span className="min-w-0 flex-1 truncate font-medium text-[#0f172a]">{corretor.nome}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
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
