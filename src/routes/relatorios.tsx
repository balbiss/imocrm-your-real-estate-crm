import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Target, CheckCircle, Clock, Calendar, BarChart3, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — CRM" }] }),
  component: ReportsPage,
});

const COLORS = ["#1d4ed8", "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6"];

function ReportsPage() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["user-profile-reports", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("perfis").select("imobiliaria_id").eq("id", user.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ["reports-dashboard", profile?.imobiliaria_id],
    queryFn: async () => {
      if (!profile?.imobiliaria_id) return null;

      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("*")
        .eq("imobiliaria_id", profile.imobiliaria_id);
      
      const { data: team, error: corrError } = await supabase
        .from("perfis")
        .select("id, nome, avatar_url")
        .eq("imobiliaria_id", profile.imobiliaria_id);

      if (leadsError || corrError) throw leadsError || corrError;

      // Agrupar por Origem
      const byOrigin = leads.reduce((acc: any, lead) => {
        acc[lead.origem || "Outros"] = (acc[lead.origem || "Outros"] || 0) + 1;
        return acc;
      }, {});
      const originData = Object.keys(byOrigin).map(key => ({ name: key, value: byOrigin[key] }));

      // Agrupar por Status
      const byStatus = leads.reduce((acc: any, lead) => {
        acc[lead.status] = (acc[lead.status] || 0) + 1;
        return acc;
      }, {});
      const statusData = Object.keys(byStatus).map(key => ({ name: key, value: byStatus[key] }));

      // Agrupar por Temperatura
      const byTemp = leads.reduce((acc: any, lead) => {
        const t = lead.temperatura || "Não definido";
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {});
      const tempData = [
        { name: "Quente", value: byTemp["quente"] || 0, color: "#ef4444" },
        { name: "Morno", value: byTemp["morno"] || 0, color: "#f59e0b" },
        { name: "Frio", value: byTemp["frio"] || 0, color: "#3b82f6" },
      ];

      const respondedLeads = leads.filter(l => l.primeiro_contato_em);
      const avgResponseTime = respondedLeads.length > 0 
        ? respondedLeads.reduce((acc, lead) => {
            const diff = new Date(lead.primeiro_contato_em!).getTime() - new Date(lead.created_at).getTime();
            return acc + diff;
          }, 0) / respondedLeads.length / (1000 * 60)
        : 0;

      // Performance por Corretor
      const brokerPerformance = team?.map(broker => {
        const brokerLeads = leads.filter(l => l.corretor_id === broker.id);
        const brokerConverted = brokerLeads.filter(l => l.status === "venda_concluida").length;
        const brokerResponded = brokerLeads.filter(l => l.primeiro_contato_em);
        const brokerAvgSLA = brokerResponded.length > 0
          ? brokerResponded.reduce((acc, lead) => {
              const diff = new Date(lead.primeiro_contato_em!).getTime() - new Date(lead.created_at).getTime();
              return acc + diff;
            }, 0) / brokerResponded.length / (1000 * 60)
          : 0;

        return {
          id: broker.id,
          nome: broker.nome,
          avatar: broker.avatar_url,
          leads: brokerLeads.length,
          vendas: brokerConverted,
          sla: Math.round(brokerAvgSLA),
          conversao: brokerLeads.length > 0 ? ((brokerConverted / brokerLeads.length) * 100).toFixed(1) : "0"
        };
      }) || [];

      return {
        totalLeads: leads.length,
        converted: leads.filter(l => l.status === "venda_concluida").length,
        avgResponseTime: Math.round(avgResponseTime),
        originData,
        statusData,
        tempData,
        brokerPerformance: brokerPerformance.sort((a, b) => b.vendas - a.vendas)
      };
    },
    enabled: !!profile?.imobiliaria_id
  });

  if (isLoading || !profile) {
    return (
      <MainLayout>
        <div className="p-8 flex flex-col items-center justify-center min-h-[400px] gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-slate-500">Compilando inteligência comercial...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-4 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Analytics & Performance</h1>
            <p className="text-saas-sm text-muted-foreground">Visão geral da saúde comercial e conversão.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold">
              <Calendar className="mr-1.5 h-3.5 w-3.5" /> Últimos 30 dias
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Total de Leads" value={stats?.totalLeads} trend="+15%" icon={<Users />} color="text-primary" />
          <StatCard title="SLA de Atendimento" value={`${stats?.avgResponseTime} min`} trend="Meta: 5min" icon={<Clock />} color="text-amber-500" />
          <StatCard title="Taxa de Conversão" value={`${((stats?.converted || 0) / (stats?.totalLeads || 1) * 100).toFixed(1)}%`} trend="+2.4%" icon={<Target />} color="text-blue-500" />
          <StatCard title="Vendas Mensais" value={stats?.converted} trend="+10%" icon={<CheckCircle />} color="text-emerald-500" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-7 border-none shadow-soft bg-white overflow-hidden">
            <CardHeader className="py-4 px-5 border-b border-slate-50 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold">Qualidade dos Leads</CardTitle>
                <CardDescription className="text-saas-xs">Distribuição por potencial de fechamento (Temperatura)</CardDescription>
              </div>
              <BarChart3 className="h-4 w-4 text-slate-300" />
            </CardHeader>
            <CardContent className="p-6 h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.tempData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" fontSize={11} axisLine={false} tickLine={false} />
                  <YAxis fontSize={11} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                    {stats?.tempData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="lg:col-span-5 border-none shadow-soft bg-white overflow-hidden">
            <CardHeader className="py-4 px-5 border-b border-slate-50">
              <CardTitle className="text-sm font-bold">Status do Funil</CardTitle>
              <CardDescription className="text-saas-xs">Etapas atuais dos leads ativos</CardDescription>
            </CardHeader>
            <CardContent className="p-6 h-[280px] flex flex-col items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats?.statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                  >
                    {stats?.statusData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                <p className="text-xl font-bold text-slate-900">{stats?.totalLeads}</p>
                <p className="text-[9px] uppercase font-bold text-slate-400 tracking-tighter">Leads Ativos</p>
              </div>
            </CardContent>
            <div className="px-6 pb-6 grid grid-cols-2 gap-2">
                {stats?.statusData.map((item: any, index: number) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-[10px] font-bold text-slate-500 uppercase truncate max-w-[100px]">{item.name.replace('_', ' ')}</span>
                    <span className="text-[10px] font-bold ml-auto">{item.value}</span>
                  </div>
                ))}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-none shadow-soft bg-white overflow-hidden">
            <CardHeader className="py-4 px-5 border-b border-slate-50">
              <CardTitle className="text-sm font-bold">Volume por Canal</CardTitle>
              <CardDescription className="text-saas-xs">Leads por plataforma de origem</CardDescription>
            </CardHeader>
            <CardContent className="p-6 h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.originData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" fontSize={11} axisLine={false} tickLine={false} />
                  <YAxis fontSize={11} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="#1d4ed8" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-none shadow-soft bg-white overflow-hidden">
            <CardHeader className="py-4 px-5 border-b border-slate-50">
              <CardTitle className="text-sm font-bold">Ranking de Consultores</CardTitle>
              <CardDescription className="text-saas-xs">Performance individual e conversão</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
               <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-50 bg-slate-50/50">
                        <th className="px-5 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Consultor</th>
                        <th className="px-5 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Leads</th>
                        <th className="px-5 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Vendas</th>
                        <th className="px-5 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Conv.</th>
                        <th className="px-5 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">SLA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {stats?.brokerPerformance.map((broker: any) => (
                        <tr key={broker.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3">
                             <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 overflow-hidden">
                                   {broker.avatar ? <img src={broker.avatar} className="w-full h-full object-cover" /> : broker.nome?.[0]}
                                </div>
                                <span className="text-saas-xs font-bold text-slate-700">{broker.nome}</span>
                             </div>
                          </td>
                          <td className="px-5 py-3 text-center text-saas-xs font-medium text-slate-600">{broker.leads}</td>
                          <td className="px-5 py-3 text-center text-saas-xs font-bold text-emerald-600">{broker.vendas}</td>
                          <td className="px-5 py-3 text-center">
                             <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-black border-none bg-slate-100 text-slate-600">{broker.conversao}%</Badge>
                          </td>
                          <td className="px-5 py-3 text-center text-saas-xs font-bold text-slate-700">{broker.sla}m</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}

function StatCard({ title, value, trend, icon, color }: any) {
  return (
    <Card className="border-none shadow-soft bg-white hover:shadow-md transition-all">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-saas-xs font-bold text-slate-400 uppercase tracking-widest">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-900">{value}</span>
            <span className="text-[9px] font-bold text-emerald-500">{trend}</span>
          </div>
        </div>
        <div className={`p-2.5 rounded-lg bg-slate-50 ${color}`}>
          {React.cloneElement(icon, { className: "h-4 w-4" })}
        </div>
      </CardContent>
    </Card>
  );
}
