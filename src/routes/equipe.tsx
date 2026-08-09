import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, UserPlus, Search, Filter, Shield, Clock, TrendingUp, MoreHorizontal } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { InviteMemberDialog } from "@/components/team/InviteMemberDialog";
import { EditMemberDialog } from "@/components/team/EditMemberDialog";
import { useAuth } from "@/context/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { isCorretorOnlineNaRoleta } from "@/lib/utils";

export const Route = createFileRoute("/equipe")({
  head: () => ({ meta: [{ title: "Equipe — CRM" }] }),
  component: TeamPage,
});

function TeamPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("perfis")
        .select("imobiliaria_id, role")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: team, isLoading } = useQuery({
    queryKey: ["team-list", profile?.imobiliaria_id],
    queryFn: async () => {
      if (!profile?.imobiliaria_id) return [];
      
      // Busca membros + e-mail de acesso (e-mail vive em auth.users, não em
      // perfis -- a edge function get-team mescla os dois usando a service
      // role, já que o client não tem acesso admin ao Auth).
      const { data: membersData, error: membersError } = await supabase.functions.invoke("get-team", {
        body: { imobiliaria_id: profile.imobiliaria_id },
      });
      if (membersError) throw membersError;
      const members = (membersData || []) as any[];

      // Busca TODOS os leads da imobiliária de uma vez para calcular métricas em memória (mais rápido e sem bugs de RLS)
      // O Supabase/PostgREST limita cada resposta a 1000 linhas por padrao —
      // busca em paginas ate esgotar, pra nao subestimar as metricas de
      // equipe quando a base passar disso.
      const PAGE_SIZE = 1000;
      let allLeads: any[] = [];
      {
        let from = 0;
        while (true) {
          const { data, error: leadsError } = await supabase
            .from("leads")
            .select("id, corretor_id, status, created_at, primeiro_contato_em")
            .eq("imobiliaria_id", profile.imobiliaria_id)
            .range(from, from + PAGE_SIZE - 1);
          if (leadsError) throw leadsError;
          allLeads = allLeads.concat(data || []);
          if (!data || data.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }
      }

      // Busca métricas de leads para cada membro
      const teamWithMetrics = members.map((member) => {
        const memberLeads = allLeads?.filter(l => l.corretor_id === member.id) || [];
        
        const totalLeads = memberLeads.length;
        const sales = memberLeads.filter(l => l.status === "venda_concluida").length;

        // Calcular SLA real para o consultor
        const respondedLeads = memberLeads.filter(l => l.primeiro_contato_em != null);
        
        let avgSLA = "N/A";
        if (respondedLeads && respondedLeads.length > 0) {
          const totalDiff = respondedLeads.reduce((acc, lead) => {
            const diff = new Date(lead.primeiro_contato_em!).getTime() - new Date(lead.created_at).getTime();
            return acc + diff;
          }, 0);
          const avgMinutes = Math.round(totalDiff / respondedLeads.length / (1000 * 60));
          avgSLA = `${avgMinutes}m`;
        }

        return {
          ...member,
          leads_count: totalLeads,
          sales_count: sales,
          sla_media: avgSLA
        };
      });

      return teamWithMetrics;
    },
    enabled: !!profile?.imobiliaria_id,
    refetchInterval: 60000,
  });

  const togglePlantaoMutation = useMutation({
    mutationFn: async ({ id, em_plantao }: { id: string, em_plantao: boolean }) => {
      const novoValor = !em_plantao;
      const { error } = await supabase
        .from("perfis")
        .update({
          em_plantao: novoValor,
          status_roleta: novoValor,
          ultimo_checkin_roleta: novoValor ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-list"] });
      queryClient.invalidateQueries({ queryKey: ["fila-atendimento"] });
      queryClient.invalidateQueries({ queryKey: ["profile-with-imobiliaria"] });
      toast.success("Status de plantão atualizado!");
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar status: " + error.message);
    }
  });

  const toggleBloqueioMutation = useMutation({
    mutationFn: async ({ id, bloqueado }: { id: string, bloqueado: boolean }) => {
      const novoValor = !bloqueado;
      const { error } = await supabase
        .from("perfis")
        .update(
          // Bloquear tambem tira da roleta na hora (senao continuaria
          // recebendo lead mesmo sem conseguir entrar no CRM). Desbloquear
          // nao reativa a roleta sozinho -- a pessoa volta e liga de novo.
          novoValor
            ? { bloqueado: true, status_roleta: false, em_plantao: false }
            : { bloqueado: false }
        )
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["team-list"] });
      queryClient.invalidateQueries({ queryKey: ["fila-atendimento"] });
      toast.success(variables.bloqueado ? "Acesso liberado com sucesso!" : "Acesso bloqueado com sucesso!");
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar bloqueio: " + error.message);
    }
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ id, hardDelete }: { id: string, hardDelete?: boolean }) => {
      if (hardDelete) {
        // Exclusão definitiva: usar Edge Function para garantir a deleção no Auth
        const { error } = await supabase.functions.invoke("delete-member", {
          body: { id },
        });
        if (error) throw error;
      } else {
        // Soft delete: apenas remove o acesso
        const { error } = await supabase.from("perfis").update({ imobiliaria_id: null }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["team-list"] });
      toast.success(variables.hardDelete ? "Membro excluído definitivamente do banco de dados!" : "Acesso do membro removido com sucesso!");
    },
    onError: (error: any) => {
      toast.error("Erro ao remover membro: " + error.message);
    }
  });

  const filteredTeam = team?.filter((member: any) => 
    member.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.role?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) return (
    <MainLayout>
      <div className="p-4 space-y-4 max-w-7xl mx-auto">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    </MainLayout>
  );

  return (
    <MainLayout>
      <div className="p-4 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Gestão de Consultores</h1>
            <p className="text-saas-sm text-muted-foreground">Controle de acesso, performance e status da equipe.</p>
          </div>
          <Button 
            className="h-9 text-[11px] font-bold uppercase tracking-wider px-6"
            onClick={() => setIsInviteOpen(true)}
          >
            <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Convidar Membro
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input 
              placeholder="Filtrar por nome, e-mail ou cargo..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-saas-sm border-slate-200" 
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" className="h-9 px-4 text-saas-xs font-bold uppercase border-slate-200">
              <Filter className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Filtrar
            </Button>
            <Button variant="outline" className="h-9 px-4 text-saas-xs font-bold uppercase border-slate-200">
               <TrendingUp className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Rankings
            </Button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[300px] text-[10px] font-black uppercase tracking-widest text-slate-400">Consultor</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cargo</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Leads</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Vendas</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">SLA</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTeam?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    Nenhum membro encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTeam?.map((member) => {
                  const online = isCorretorOnlineNaRoleta(member.status_roleta, member.ultimo_checkin_roleta);
                  // Gerente só gerencia consultor -- dono/outro gerente ficam
                  // fora do alcance dele (mesma regra aplicada de verdade no
                  // servidor pela edge function update-member).
                  const canManageThisMember = profile?.role === "dono" || (profile?.role === "gerente" && member.role === "corretor");
                  return (
                  <TableRow key={member.id} className="group hover:bg-slate-50/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className="h-9 w-9 border-2 border-slate-50 shadow-sm">
                            <AvatarImage src={member.avatar_url || ""} />
                            <AvatarFallback className="bg-slate-100 text-slate-500 font-bold text-xs">{member.nome?.[0]}</AvatarFallback>
                          </Avatar>
                          {online && (
                             <div className="absolute -bottom-0.5 -right-0.5 bg-white p-0.5 rounded-full">
                                <div className="h-2 w-2 bg-emerald-500 rounded-full border border-white" />
                             </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 flex flex-col">
                          <span className="text-sm font-bold text-slate-700 truncate">{member.nome}</span>
                          {member.telefone && (
                            <span className="text-[10px] text-slate-400 truncate">{member.telefone}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[9px] font-bold h-5 px-2 uppercase border-none ${(member.role === 'dono' || member.role === 'gerente') ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                        {member.role || "Consultor"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-xs font-bold text-slate-700">{member.leads_count}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-xs font-bold text-emerald-600">{member.sales_count}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-xs font-bold text-slate-700">{member.sla_media}</span>
                    </TableCell>
                    <TableCell>
                      {member.bloqueado ? (
                        <Badge className="text-[9px] font-bold h-5 px-2 uppercase border-none bg-red-50 text-red-600">
                          Bloqueado
                        </Badge>
                      ) : (
                        <div
                          className={`flex items-center gap-1.5 w-fit transition-opacity ${
                            can('manage_team') ? "cursor-pointer hover:opacity-80" : "cursor-default opacity-90"
                          }`}
                          onClick={() => {
                            if (!can('manage_team')) return;
                            togglePlantaoMutation.mutate({ id: member.id, em_plantao: online });
                          }}
                        >
                          {togglePlantaoMutation.isPending && togglePlantaoMutation.variables?.id === member.id ? (
                            <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                          ) : (
                            <div className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-300"}`} />
                          )}
                          <span className="text-[10px] font-bold text-slate-500 tracking-tight">
                            {online ? "Disponível" : "Offline"}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManageThisMember && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              className="text-xs cursor-pointer"
                              onClick={() => {
                                setMemberToEdit(member);
                                setTimeout(() => setIsEditOpen(true), 100);
                              }}
                            >
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className={`text-xs cursor-pointer font-bold ${member.bloqueado ? "text-emerald-600 focus:bg-emerald-50 focus:text-emerald-700" : "text-amber-600 focus:bg-amber-50 focus:text-amber-700"}`}
                              onClick={() => {
                                toggleBloqueioMutation.mutate({ id: member.id, bloqueado: !!member.bloqueado });
                              }}
                            >
                              {member.bloqueado ? "Desbloquear Acesso" : "Bloquear Acesso (Férias/Afastado)"}
                            </DropdownMenuItem>
                            {profile?.role === "dono" && <DropdownMenuSeparator />}
                            {profile?.role === "dono" && (
                            <DropdownMenuItem
                              className="text-xs text-orange-600 focus:bg-orange-50 focus:text-orange-700 cursor-pointer font-bold"
                              onClick={() => {
                                setTimeout(() => {
                                  if (confirm(`DESVINCULAR: Tem certeza que deseja remover o acesso de ${member.nome}? (O histórico de vendas será mantido)`)) {
                                    removeMemberMutation.mutate({ id: member.id, hardDelete: false });
                                  }
                                }, 100);
                              }}
                            >
                              Remover Acesso (Seguro)
                            </DropdownMenuItem>
                            )}
                            {profile?.role === "dono" && (
                            <DropdownMenuItem
                              className="text-xs text-red-600 focus:bg-red-50 focus:text-red-700 cursor-pointer font-bold"
                              onClick={() => {
                                setTimeout(() => {
                                  if (confirm(`EXCLUIR DO BANCO: Esta ação apagará permanentemente o perfil de ${member.nome} e o removerá de todos os leads antigos. Tem certeza absoluta?`)) {
                                    removeMemberMutation.mutate({ id: member.id, hardDelete: true });
                                  }
                                }, 100);
                              }}
                            >
                              Excluir Definitivamente
                            </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <InviteMemberDialog 
        open={isInviteOpen} 
        onOpenChange={setIsInviteOpen} 
      />

      <EditMemberDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        member={memberToEdit}
        canChangeRole={profile?.role === "dono"}
      />
    </MainLayout>
  );
}
