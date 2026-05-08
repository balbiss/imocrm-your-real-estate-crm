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
import { Input } from "@/components/ui/input";
import { InviteMemberDialog } from "@/components/team/InviteMemberDialog";
import { useAuth } from "@/context/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/equipe")({
  head: () => ({ meta: [{ title: "Equipe — CRM" }] }),
  component: TeamPage,
});

function TeamPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("perfis")
        .select("imobiliaria_id")
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
      
      // Busca membros
      const { data: members, error: membersError } = await supabase
        .from("perfis")
        .select("*")
        .eq("imobiliaria_id", profile.imobiliaria_id)
        .order("nome");
      
      if (membersError) throw membersError;

      // Busca métricas de leads para cada membro
      const teamWithMetrics = await Promise.all(members.map(async (member) => {
        const { count: totalLeads } = await supabase
          .from("leads")
          .select("*", { count: 'exact', head: true })
          .eq("corretor_id", member.id);

        const { count: sales } = await supabase
          .from("leads")
          .select("*", { count: 'exact', head: true })
          .eq("corretor_id", member.id)
          .eq("status", "venda_concluida");

        // Calcular SLA real para o consultor
        const { data: respondedLeads } = await supabase
          .from("leads")
          .select("created_at, primeiro_contato_em")
          .eq("corretor_id", member.id)
          .not("primeiro_contato_em", "is", null);
        
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
          leads_count: totalLeads || 0,
          sales_count: sales || 0,
          sla_media: avgSLA
        };
      }));
    },
    enabled: !!profile?.imobiliaria_id,
  });

  const togglePlantaoMutation = useMutation({
    mutationFn: async ({ id, em_plantao }: { id: string, em_plantao: boolean }) => {
      const { error } = await supabase
        .from("perfis")
        .update({ em_plantao: !em_plantao })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-list"] });
      toast.success("Status de plantão atualizado!");
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar status: " + error.message);
    }
  });

  const filteredTeam = team?.filter(member => 
    member.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTeam?.map((member) => (
            <Card key={member.id} className="border-none shadow-soft bg-white hover:shadow-md transition-all group overflow-hidden">
              <CardHeader className="py-3 px-4 border-b border-slate-50">
                <div className="flex items-center justify-between">
                  <Badge className={`text-[9px] font-bold h-5 px-2 uppercase border-none ${member.role === 'admin' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                    {member.role || "Consultor"}
                  </Badge>
                  <div 
                    className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => togglePlantaoMutation.mutate({ id: member.id, em_plantao: !!member.em_plantao })}
                  >
                    {togglePlantaoMutation.isPending && togglePlantaoMutation.variables?.id === member.id ? (
                      <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                    ) : (
                      <div className={`h-1.5 w-1.5 rounded-full ${member.em_plantao ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-300"}`} />
                    )}
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                      {member.em_plantao ? "Disponível" : "Offline"}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-5 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-11 w-11 border-2 border-slate-50 shadow-sm">
                      <AvatarImage src={member.avatar_url || ""} />
                      <AvatarFallback className="bg-slate-100 text-slate-500 font-bold text-sm">{member.nome?.[0]}</AvatarFallback>
                    </Avatar>
                    {member.em_plantao && (
                       <div className="absolute -bottom-0.5 -right-0.5 bg-white p-0.5 rounded-full">
                          <div className="h-2.5 w-2.5 bg-emerald-500 rounded-full border border-white" />
                       </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-saas-sm font-bold text-slate-700 truncate leading-none mb-1">{member.nome}</h3>
                    <p className="text-[10px] text-slate-400 truncate font-medium">{member.email || "consultor@crm.com"}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-slate-600">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2 py-3 px-1 bg-slate-50/50 rounded-xl border border-slate-100/50">
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Leads</p>
                    <p className="text-xs font-bold text-slate-700">{member.leads_count}</p>
                  </div>
                  <div className="text-center border-x border-slate-200">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Vendas</p>
                    <p className="text-xs font-bold text-emerald-600">{member.sales_count}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">SLA</p>
                    <p className="text-xs font-bold text-slate-700">{member.sla_media}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" className="flex-1 h-8 text-[10px] font-bold uppercase tracking-wider border-slate-200 hover:bg-slate-50 transition-colors">Perfil Detalhado</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-primary transition-colors">
                    <Shield className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <InviteMemberDialog 
        open={isInviteOpen} 
        onOpenChange={setIsInviteOpen} 
      />
    </MainLayout>
  );
}
