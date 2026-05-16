import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  MessageSquare, 
  TrendingUp, 
  Clock, 
  ChevronRight,
  PlusCircle,
  Phone,
  BarChart3,
  CalendarDays,
  ArrowUpRight,
  Zap
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";


export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | CRM" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  const { role, isLoading: loadingPerms } = usePermissions();

  const { data: profile } = useQuery({
    queryKey: ["user-profile-dashboard", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("perfis").select("imobiliaria_id").eq("id", user.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["dashboard-summary", profile?.imobiliaria_id, role],
    queryFn: async () => {
      if (!profile?.imobiliaria_id || loadingPerms) return null;

      let query = supabase
        .from("leads")
        .select("*, corretor:perfis!corretor_id(nome)")
        .eq("imobiliaria_id", profile.imobiliaria_id);

      // Se for corretor, filtrar apenas os dele
      if (role === 'corretor') {
        query = query.eq("corretor_id", user?.id);
      }

      const { data: leads, error: leadsError } = await query.order("created_at", { ascending: false });

      if (leadsError) throw leadsError;

      const stats = {
        totalLeads: leads.length,
        newLeads: leads.filter(l => l.status === "novo").length,
        inProgress: leads.filter(l => l.status === "em_atendimento").length,
        concluded: leads.filter(l => l.status === "venda_concluida").length,
        overdueFollowups: leads.filter(l => l.lembrete_follow_up && new Date(l.lembrete_follow_up) <= new Date() && !l.data_fechamento).length,
        recentLeads: leads.slice(0, 6),
      };

      return stats;
    },
    enabled: !!profile?.imobiliaria_id && !loadingPerms,
  });

  if (isLoading || loadingPerms || !profile) {
    return (
      <MainLayout>
        <div className="p-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  const isBroker = role === 'corretor';

  return (
    <MainLayout>
      <div className="p-4 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {isBroker ? "Meu Dashboard" : "Dashboard Executivo"}
            </h1>
            <p className="text-saas-sm text-muted-foreground">
              {isBroker 
                ? "Acompanhe seus leads e atividades individuais." 
                : "Monitoramento de performance e gestão em tempo real."}
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/leads">
              <Button size="sm" className="h-8 text-[11px] font-bold uppercase tracking-wider px-4">
                <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Adicionar Lead
              </Button>
            </Link>
          </div>
        </div>

        {/* MÃ‰TRICAS PRINCIPAIS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: "Total de Leads", value: dashboardData?.totalLeads || 0, icon: Users, color: "text-primary", bg: "bg-primary/5", trend: "" },
            { title: "Leads Novos", value: dashboardData?.newLeads || 0, icon: Zap, color: "text-amber-500", bg: "bg-amber-50", trend: "" },
            { title: "Em Negociação", value: dashboardData?.inProgress || 0, icon: Clock, color: "text-blue-500", bg: "bg-blue-50", trend: "" },
            { title: "Vendas (Mês)", value: dashboardData?.concluded || 0, icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-50", trend: "" },
          ].map((stat, i) => (
            <Card 
              key={i} 
              className="border-none shadow-soft overflow-hidden group hover:shadow-md transition-all animate-fade-in-up hover-lift"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-lg ${stat.bg}`}>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                  <Badge variant="outline" className="text-[9px] font-bold border-none bg-slate-50 text-slate-400">
                    {stat.trend}
                  </Badge>
                </div>
                <div>
                  <p className="text-saas-xs text-slate-500 uppercase tracking-widest mb-1">{stat.title}</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-slate-900">{stat.value}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEADS RECENTES */}
          <Card className="lg:col-span-8 border-none shadow-soft bg-white">
            <CardHeader className="flex flex-row items-center justify-between py-4 px-5 border-b border-slate-50">
              <div>
                <CardTitle className="text-sm font-bold">Atividades de Leads</CardTitle>
                <CardDescription className="text-saas-xs">Ãšltimos registros e movimentações no funil.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold uppercase text-primary">Ver Todos</Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-50">
                {dashboardData?.recentLeads.map((lead) => (
                  <div key={lead.id} className="flex items-center gap-4 p-4 hover:bg-slate-50/50 transition-colors cursor-pointer group">
                    <Avatar className="h-8 w-8 border border-slate-100 shadow-sm">
                      <AvatarFallback className="bg-slate-50 text-slate-400 text-xs font-bold">{lead.nome[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-saas-sm font-bold text-slate-900 truncate">{lead.nome}</p>
                        <Badge className={`h-4 px-1.5 text-[9px] font-bold uppercase border-none ${
                          lead.status === 'novo' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {lead.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-saas-xs text-slate-400">
                        {lead.origem} â€¢ {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* COLUNA LATERAL - AÇÕES E AGENDA */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="border-none shadow-soft bg-white">
              <CardHeader className="py-4 px-5 border-b border-slate-50">
                <CardTitle className="text-sm font-bold">Ações Prioritárias</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <QuickAction 
                  icon={<Zap className="text-amber-500 h-3.5 w-3.5" />} 
                  title="Contactar novos leads" 
                  count={dashboardData?.newLeads || 0}
                  color="bg-amber-50"
                />
                <Link to="/leads">
                  <QuickAction 
                    icon={<CalendarDays className="text-primary h-3.5 w-3.5" />} 
                    title="Follow-ups para hoje" 
                    count={dashboardData?.overdueFollowups || 0}
                    color="bg-primary/5"
                  />
                </Link>
                <QuickAction 
                  icon={<BarChart3 className="text-emerald-500 h-3.5 w-3.5" />} 
                  title="Metas de conversão" 
                  count={`${dashboardData?.totalLeads ? Math.round((dashboardData.concluded / dashboardData.totalLeads) * 100) : 0}%`}
                  color="bg-emerald-50"
                />
                <Link to="/relatorios">
                  <Button className="w-full mt-4 h-9 text-[11px] font-bold uppercase tracking-wider bg-slate-900 hover:bg-slate-800">
                    Relatório Completo
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="bg-gradient-brand-dark border-none shadow-elegant text-white overflow-hidden relative animate-float">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <ArrowUpRight size={100} />
              </div>
              <CardContent className="p-6 relative z-10">
                <h4 className="text-sm font-bold mb-2">Plano Pro</h4>
                <p className="text-saas-xs opacity-80 mb-4">Seu funil de vendas está rendendo 15% mais este mês comparado ao anterior.</p>
                <div className="flex items-center gap-2 text-xs font-bold bg-white/10 p-2 rounded-lg inline-flex">
                  <TrendingUp className="h-3 w-3" /> 
                  Alta de Performance
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

function QuickAction({ icon, title, count, color }: any) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100 cursor-pointer group">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}>
          {icon}
        </div>
        <span className="text-saas-sm font-bold text-slate-700 group-hover:text-primary transition-colors">{title}</span>
      </div>
      <Badge variant="secondary" className="bg-slate-100 text-slate-500 font-bold text-[10px]">{count}</Badge>
    </div>
  );
}
