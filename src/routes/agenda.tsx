import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MessageSquare, Phone, User, Calendar as CalendarIcon, Loader2, MapPin, ChevronLeft, ChevronRight, Star, AlertCircle, CheckSquare, ListTodo, LayoutGrid } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, isSameMonth, isSameDay, eachDayOfInterval, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LeadDetailsModal } from "@/components/leads/LeadDetailsModal";
import { ScheduleTaskModal } from "@/components/leads/ScheduleTaskModal";
import { Plus } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/context/AuthContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/agenda")({
  head: () => ({ meta: [{ title: "Tarefas — CRM" }] }),
  component: AgendaPage,
});

type EventType = "follow_up" | "visita" | "fid";

type CalendarEvent = {
  id: string;
  lead_id: string;
  nome: string;
  status: string;
  telefone: string;
  date: Date;
  type: EventType;
  corretor_nome?: string;
  local?: string;
  status_visita?: string;
  favorito: boolean;
};

function AgendaPage() {
  const { user } = useAuth();
  const { role, isLoading: loadingPerms } = usePermissions();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<"atrasadas" | "aFazer" | "visitas" | "futuras" | "favoritos">("aFazer");

  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ["user-profile-agenda", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("perfis").select("imobiliaria_id").eq("id", user.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: compromissosRaw, isLoading } = useQuery({
    queryKey: ["compromissos", profile?.imobiliaria_id, role],
    queryFn: async () => {
      if (!profile?.imobiliaria_id || loadingPerms) return [];

      let query = supabase
        .from("leads")
        .select("*, corretor:perfis!leads_corretor_id_fkey(nome)")
        .eq("imobiliaria_id", profile.imobiliaria_id)
        .is("descartado_em", null)
        .eq("descarte_pendente_aprovacao", false)
        .or("lembrete_follow_up.not.is.null,data_visita.not.is.null");

      if (role === 'corretor') {
        query = query.eq("corretor_id", user?.id || "");
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.imobiliaria_id && !loadingPerms,
  });

  // Mapear os leads para eventos individuais (pode ter 1 follow-up e 1 visita no mesmo lead)
  const allEvents: CalendarEvent[] = React.useMemo(() => {
    if (!compromissosRaw) return [];
    const events: CalendarEvent[] = [];

    compromissosRaw.forEach(lead => {
      const isFavorito = !!lead.favorito;
      if (lead.lembrete_follow_up) {
        events.push({
          id: `${lead.id}-followup`,
          lead_id: lead.id,
          nome: lead.nome,
          status: lead.status,
          telefone: lead.telefone,
          date: new Date(lead.lembrete_follow_up),
          type: "follow_up",
          corretor_nome: (lead as any).corretor?.nome || "Sem Corretor",
          favorito: isFavorito
        });
      }
      
      if (lead.data_visita) {
        events.push({
          id: `${lead.id}-visita`,
          lead_id: lead.id,
          nome: lead.nome,
          status: lead.status,
          telefone: lead.telefone,
          date: new Date(lead.data_visita),
          type: lead.tipo_visita === 'FID' ? "fid" : "visita",
          corretor_nome: (lead as any).corretor?.nome || "Sem Corretor",
          local: lead.bairro_interesse || "A Definir",
          status_visita: lead.status_visita || "AGENDADA",
          favorito: isFavorito
        });
      }
    });

    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [compromissosRaw]);

  // Lógica de categorização das tarefas
  const { atrasadas, aFazer, visitas, futuras, favoritos } = React.useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const filterAtrasadas = allEvents.filter(e => {
      if (e.date >= todayStart) return false;
      if (e.type === 'visita' || e.type === 'fid') {
        return e.status_visita !== 'REALIZADA' && e.status_visita !== 'DESMARCADA';
      }
      return true;
    });

    const filterAFazer = allEvents.filter(e => {
      const isTodayTask = e.date >= todayStart && e.date < tomorrowStart;
      if (!isTodayTask) return false;
      if (e.type === 'visita' || e.type === 'fid') {
        return e.status_visita !== 'REALIZADA' && e.status_visita !== 'DESMARCADA';
      }
      return true;
    });

    const filterVisitas = allEvents.filter(e => {
      const isVisita = e.type === 'visita' || e.type === 'fid';
      if (!isVisita) return false;
      return e.date >= todayStart && e.date <= tomorrowEnd;
    });

    const filterFuturas = allEvents.filter(e => {
      if (e.type === 'visita' || e.type === 'fid') {
        return e.date > tomorrowEnd;
      }
      return e.date >= tomorrowStart;
    });

    const filterFavoritos = allEvents.filter(e => e.favorito);

    return {
      atrasadas: filterAtrasadas,
      aFazer: filterAFazer,
      visitas: filterVisitas,
      futuras: filterFuturas,
      favoritos: filterFavoritos,
    };
  }, [allEvents]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  if (isLoading || loadingPerms || loadingProfile) {
    return (
      <MainLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6 h-[calc(100vh-4rem)] flex flex-col gap-6 overflow-hidden bg-slate-50/30">
        <Tabs defaultValue="calendario" className="w-full flex flex-col flex-1 min-h-0 gap-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between flex-shrink-0 gap-4">
            <div className="flex items-center gap-4">
              <TabsList className="bg-white rounded-xl border p-1 shadow-sm h-11">
                <TabsTrigger value="calendario" className="h-9 px-4 text-xs font-bold uppercase tracking-wider gap-2">
                  <CalendarIcon className="h-4 w-4" /> Calendário
                </TabsTrigger>
                <TabsTrigger value="tarefas" className="h-9 px-4 text-xs font-bold uppercase tracking-wider gap-2">
                  <LayoutGrid className="h-4 w-4" /> Lista de Tarefas
                </TabsTrigger>
              </TabsList>
            </div>
            
            <div className="flex items-center gap-3">
              <Button 
                className="bg-primary font-bold shadow-sm h-10 px-6 uppercase text-[11px] tracking-wider"
                onClick={() => setIsScheduleModalOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" /> Agendar
              </Button>
            </div>
          </div>

          <TabsContent value="calendario" className="flex-1 flex flex-col min-h-0 m-0 data-[state=inactive]:hidden">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between flex-shrink-0 gap-4 mb-4">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-bold tracking-tight capitalize w-48 text-slate-800">
                  {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
                </h1>
                <div className="flex items-center gap-1 bg-white rounded-lg border p-1 shadow-sm">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-900" onClick={prevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900" onClick={() => setCurrentMonth(new Date())}>
                    Hoje
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-900" onClick={nextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white p-2.5 px-4 rounded-xl border shadow-sm">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div>Visita</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500"></div>FID</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-300"></div>Follow-up</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-purple-500"></div>Desmarcado</div>
              </div>
            </div>

            <Card className="flex-1 border-slate-200 shadow-sm bg-white flex flex-col overflow-hidden rounded-2xl min-h-0">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
                {weekDays.map(day => (
                  <div key={day} className="py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {day}
                  </div>
                ))}
              </div>
              <div className="flex-1 grid grid-cols-7 auto-rows-[minmax(100px,1fr)] overflow-y-auto">
                {days.map((day, idx) => {
                  // A grade do Calendário é só pra visita/FID agendada — os
                  // follow-ups continuam aparecendo normalmente na aba
                  // "Lista de Tarefas" (atrasadas/a fazer/futuras usam allEvents).
                  const dayEvents = allEvents.filter(e => (e.type === 'visita' || e.type === 'fid') && isSameDay(e.date, day));
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isTodayDate = isToday(day);

                  return (
                    <div 
                      key={day.toISOString()} 
                      className={`border-r border-b border-slate-200 p-1 md:p-1.5 flex flex-col transition-colors min-h-0 ${!isCurrentMonth ? "bg-slate-50/80" : "bg-white"} ${idx % 7 === 6 ? "border-r-0" : ""} hover:bg-slate-50`}
                    >
                      <div className="flex justify-end items-center mb-1">
                        <span className={`text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-full ${isTodayDate ? "bg-primary text-white shadow-sm" : "text-slate-600"}`}>
                          {format(day, "d")}
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                        {dayEvents.map(event => {
                          let dotColor = "bg-slate-400";
                          if (event.type === 'visita') {
                            dotColor = event.status_visita === 'DESMARCADA' || event.status_visita === 'REAGENDADA' ? 'bg-purple-500' : 'bg-blue-500';
                          } else if (event.type === 'fid') {
                            dotColor = event.status_visita === 'DESMARCADA' || event.status_visita === 'REAGENDADA' ? 'bg-purple-500' : 'bg-green-500';
                          }
                          
                          return (
                            <div
                              key={event.id}
                              onClick={() => {
                                setSelectedLeadId(event.lead_id);
                                setIsModalOpen(true);
                              }}
                              className="flex items-center gap-1.5 text-[9px] md:text-[10px] p-0.5 rounded hover:bg-slate-100 cursor-pointer font-bold text-slate-600 transition-colors"
                              title={event.nome}
                            >
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                              <span className="opacity-70 flex-shrink-0">{format(event.date, "HH:mm")}</span>
                              <span className="truncate uppercase tracking-tight">
                                {event.type === 'follow_up' 
                                  ? event.nome.split(' ')[0] 
                                  : `${event.nome.split(' ')[0]} - ${event.type === 'fid' ? 'FID' : 'Visita'}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="tarefas" className="flex-1 flex flex-col min-h-0 m-0 data-[state=inactive]:hidden">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 flex-1 min-h-0">
              {/* Barra Lateral de Categorias */}
              <div className="md:col-span-1 flex flex-col gap-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm h-fit">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 px-2">Categorias</h3>
                
                {[
                  { id: "atrasadas", label: "Atrasadas", count: atrasadas.length, color: "text-red-500 bg-red-50 hover:bg-red-100/70 border-red-100", activeColor: "bg-red-500 text-white border-red-500 hover:bg-red-600", icon: AlertCircle },
                  { id: "aFazer", label: "A Fazer", count: aFazer.length, color: "text-blue-500 bg-blue-50 hover:bg-blue-100/70 border-blue-100", activeColor: "bg-blue-500 text-white border-blue-500 hover:bg-blue-600", icon: ListTodo },
                  { id: "visitas", label: "Visitas (Hoje e Amanhã)", count: visitas.length, color: "text-green-600 bg-green-50 hover:bg-green-100/70 border-green-100", activeColor: "bg-green-600 text-white border-green-600 hover:bg-green-700", icon: CalendarIcon },
                  { id: "futuras", label: "Futuras", count: futuras.length, color: "text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200", activeColor: "bg-slate-600 text-white border-slate-600 hover:bg-slate-700", icon: Clock },
                  { id: "favoritos", label: "Favoritos", count: favoritos.length, color: "text-yellow-600 bg-yellow-50 hover:bg-yellow-100/70 border-yellow-100", activeColor: "bg-yellow-500 text-white border-yellow-500 hover:bg-yellow-600", icon: Star },
                ].map((cat) => {
                  const Icon = cat.icon;
                  const isActive = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id as any)}
                      className={`flex items-center justify-between w-full p-3 rounded-xl border text-xs font-bold transition-all ${
                        isActive
                          ? cat.activeColor + " shadow-sm scale-[1.01]"
                          : "border-slate-100 text-slate-600 " + cat.color
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{cat.label}</span>
                      </div>
                      <Badge className={`rounded-full h-5 min-w-5 flex items-center justify-center px-1 text-[9px] font-black border-none ${
                        isActive ? "bg-white text-slate-900" : "bg-black/5 text-inherit"
                      }`}>
                        {cat.count}
                      </Badge>
                    </button>
                  );
                })}
              </div>

              {/* Lista de Cartões de Tarefas */}
              <div className="md:col-span-3 flex flex-col min-h-0 h-full">
                <Card className="flex-1 border-slate-200 shadow-sm bg-white flex flex-col overflow-hidden rounded-2xl h-full min-h-0">
                  <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between flex-shrink-0">
                    <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-widest">
                      {activeCategory === "atrasadas" && "Tarefas Atrasadas"}
                      {activeCategory === "aFazer" && "Tarefas a Fazer Hoje"}
                      {activeCategory === "visitas" && "Visitas (Hoje e Amanhã)"}
                      {activeCategory === "futuras" && "Tarefas Futuras"}
                      {activeCategory === "favoritos" && "Leads Favoritos"}
                    </CardTitle>
                  </CardHeader>
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-3">
                      {(() => {
                        const listMap = {
                          atrasadas,
                          aFazer,
                          visitas,
                          futuras,
                          favoritos
                        };
                        const currentList = listMap[activeCategory];

                        if (currentList.length === 0) {
                          return (
                            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                              <CheckSquare size={44} className="text-slate-200 mb-3" strokeWidth={1.5} />
                              <p className="text-xs font-bold">Nenhuma tarefa encontrada nesta categoria.</p>
                            </div>
                          );
                        }

                        return currentList.map((event) => {
                          const isVisita = event.type === 'visita' || event.type === 'fid';
                          let typeBadgeColor = "bg-slate-100 text-slate-700";
                          if (event.type === 'visita') typeBadgeColor = "bg-blue-50 text-blue-700 border-blue-100 border";
                          if (event.type === 'fid') typeBadgeColor = "bg-green-50 text-green-700 border-green-100 border";

                          return (
                            <div
                              key={event.id}
                              onClick={() => {
                                setSelectedLeadId(event.lead_id);
                                setIsModalOpen(true);
                              }}
                              className="flex items-center justify-between p-4 bg-white hover:bg-slate-50/30 border border-slate-100 hover:border-slate-200 rounded-2xl shadow-sm cursor-pointer transition-all hover:scale-[1.002] group"
                            >
                              <div className="flex items-start gap-4 min-w-0">
                                <div className="space-y-1.5 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="text-sm font-black text-slate-800 truncate">{event.nome}</h4>
                                    <Badge className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${typeBadgeColor}`}>
                                      {event.type === 'follow_up' ? 'Follow-up' : event.type === 'fid' ? 'FID' : 'Visita'}
                                    </Badge>
                                    {isVisita && event.status_visita && (
                                      <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0">
                                        {event.status_visita}
                                      </Badge>
                                    )}
                                  </div>
                                  
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 font-medium">
                                    <span className="flex items-center gap-1.5">
                                      <CalendarIcon className="h-3.5 w-3.5" />
                                      {format(event.date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                    </span>
                                    {event.local && (
                                      <span className="flex items-center gap-1.5">
                                        <MapPin className="h-3.5 w-3.5" />
                                        {event.local}
                                      </span>
                                    )}
                                    {role !== 'corretor' && event.corretor_nome && (
                                      <span className="flex items-center gap-1.5 text-slate-500 font-bold bg-slate-50 px-2 py-0.5 rounded-md">
                                        <User className="h-3.5 w-3.5" />
                                        {event.corretor_nome}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-yellow-500 hover:text-yellow-600 hover:bg-yellow-50 rounded-full"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const { error } = await supabase
                                      .from("leads")
                                      .update({ favorito: !event.favorito })
                                      .eq("id", event.lead_id);
                                    if (!error) {
                                      queryClient.invalidateQueries({ queryKey: ["compromissos"] });
                                      toast.success(event.favorito ? "Removido dos favoritos!" : "Adicionado aos favoritos!");
                                    }
                                  }}
                                >
                                  <Star className={`h-4.5 w-4.5 ${event.favorito ? "fill-yellow-400 text-yellow-500" : "text-slate-300"}`} />
                                </Button>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </ScrollArea>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ScheduleTaskModal 
        open={isScheduleModalOpen}
        onOpenChange={setIsScheduleModalOpen}
      />

      <LeadDetailsModal 
        leadId={selectedLeadId}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />
    </MainLayout>
  );
}
