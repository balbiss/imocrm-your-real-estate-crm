import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageCircle, Search, User } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WhatsAppChat } from "@/components/leads/WhatsAppChat";
import { LeadDetailsModal } from "@/components/leads/LeadDetailsModal";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/conversas")({
  head: () => ({ meta: [{ title: "Conversas — CRM" }] }),
  component: ConversasPage,
});

interface Conversa {
  lead_id: string;
  lead_nome: string | null;
  lead_telefone: string | null;
  corretor_id: string | null;
  corretor_nome: string | null;
  imobiliaria_id: string;
  ultima_mensagem: string | null;
  ultima_mensagem_em: string;
  ultima_direcao: string;
  nao_lidas: number;
}

function ConversasPage() {
  const { user } = useAuth();
  const { role } = usePermissions();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [corretorFiltro, setCorretorFiltro] = useState<string>("todos");
  const [selected, setSelected] = useState<Conversa | null>(null);
  const [leadCardAberto, setLeadCardAberto] = useState(false);

  const canVerTodas = role === "dono" || role === "gerente";

  const { data: corretores } = useQuery({
    queryKey: ["corretores-filtro-conversas", user?.id],
    queryFn: async () => {
      const { data: perfil } = await supabase.from("perfis").select("imobiliaria_id").eq("id", user!.id).single();
      if (!perfil?.imobiliaria_id) return [];
      const { data, error } = await supabase
        .from("perfis")
        .select("id, nome")
        .eq("imobiliaria_id", perfil.imobiliaria_id)
        .order("nome", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user && canVerTodas,
  });

  const { data: conversas, isLoading } = useQuery({
    queryKey: ["conversas", user?.id, role],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_conversas", {
        p_corretor_id: canVerTodas ? null : user?.id,
      });
      if (error) throw error;
      return (data || []) as Conversa[];
    },
    enabled: !!user && !!role,
    refetchInterval: 30000,
  });

  // Realtime: qualquer mensagem nova (minha ou de quem eu monitoro) atualiza a lista
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`conversas-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens_whatsapp" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversas"] });
          queryClient.invalidateQueries({ queryKey: ["sidebar-nao-lidas"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const handleSelect = async (conversa: Conversa) => {
    setSelected(conversa);
    if (conversa.nao_lidas > 0) {
      await supabase.rpc("marcar_conversa_lida", { p_lead_id: conversa.lead_id });
      queryClient.invalidateQueries({ queryKey: ["conversas"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-nao-lidas"] });
    }
  };

  const filtered = (conversas || []).filter((c) => {
    if (corretorFiltro !== "todos" && c.corretor_id !== corretorFiltro) return false;
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      c.lead_nome?.toLowerCase().includes(term) ||
      c.lead_telefone?.toLowerCase().includes(term)
    );
  });

  return (
    <MainLayout>
      <div className="flex h-full max-w-7xl mx-auto w-full">
        {/* Lista de conversas */}
        <div className="w-full max-w-sm shrink-0 border-r border-slate-200 flex flex-col h-full">
          <div className="p-4 border-b border-slate-200 shrink-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 mb-1">Conversas</h1>
            <p className="text-saas-sm text-muted-foreground mb-3">
              {canVerTodas ? "Todas as conversas da imobiliária" : "Suas conversas de WhatsApp"}
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            {canVerTodas && (
              <Select value={corretorFiltro} onValueChange={setCorretorFiltro}>
                <SelectTrigger className="h-9 text-sm mt-2">
                  <SelectValue placeholder="Filtrar por corretor..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os corretores</SelectItem>
                  {corretores?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-6 text-center text-sm text-slate-400">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center">
                <MessageCircle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm text-slate-400">
                  {search ? "Nenhuma conversa encontrada." : "Nenhuma conversa ainda."}
                </p>
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.lead_id}
                  onClick={() => handleSelect(c)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 flex items-start gap-3 transition-colors hover:bg-slate-50 ${
                    selected?.lead_id === c.lead_id ? "bg-slate-50" : ""
                  }`}
                >
                  <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center shrink-0 text-slate-500 font-semibold text-sm">
                    {c.lead_nome ? c.lead_nome.charAt(0).toUpperCase() : <User className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-slate-800 truncate">
                        {c.lead_nome || c.lead_telefone || "Sem nome"}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {formatDistanceToNow(new Date(c.ultima_mensagem_em), { locale: ptBR, addSuffix: false })}
                      </span>
                    </div>
                    {canVerTodas && c.corretor_nome && (
                      <p className="text-[10px] text-primary font-medium truncate">{c.corretor_nome}</p>
                    )}
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-slate-500 truncate">
                        {c.ultima_direcao === "outbound" ? "Você: " : ""}
                        {c.ultima_mensagem}
                      </p>
                      {c.nao_lidas > 0 && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white shrink-0">
                          {c.nao_lidas}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat ativo */}
        <div className="flex-1 flex flex-col h-full p-4">
          {selected ? (
            <WhatsAppChat
              key={selected.lead_id}
              leadId={selected.lead_id}
              imobiliariaId={selected.imobiliaria_id}
              phoneNumber={selected.lead_telefone || ""}
              leadName={selected.lead_nome}
              fullHeight
              onHeaderClick={() => setLeadCardAberto(true)}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
              <MessageCircle className="h-12 w-12 mb-3" />
              <p className="text-sm text-slate-400">Selecione uma conversa pra começar</p>
            </div>
          )}
        </div>
      </div>

      <LeadDetailsModal
        leadId={selected?.lead_id ?? null}
        open={leadCardAberto}
        onOpenChange={setLeadCardAberto}
      />
    </MainLayout>
  );
}
