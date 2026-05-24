import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MessageSquare, Phone, User, Calendar as CalendarIcon, Loader2, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, isSameMonth, isSameDay, eachDayOfInterval, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LeadDetailsModal } from "@/components/leads/LeadDetailsModal";
import { ScheduleTaskModal } from "@/components/leads/ScheduleTaskModal";
import { Plus } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/context/AuthContext";
import { ScrollArea } from "@/components/ui/scroll-area";

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
};

function AgendaPage() {
  const { user } = useAuth();
  const { role, isLoading: loadingPerms } = usePermissions();
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

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
      if (lead.lembrete_follow_up) {
        events.push({
          id: `${lead.id}-followup`,
          lead_id: lead.id,
          nome: lead.nome,
          status: lead.status,
          telefone: lead.telefone,
          date: new Date(lead.lembrete_follow_up),
          type: "follow_up",
          corretor_nome: (lead as any).corretor?.nome || "Sem Corretor"
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
          status_visita: lead.status_visita || "AGENDADA"
        });
      }
    });

    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [compromissosRaw]);

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
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between flex-shrink-0 gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold tracking-tight capitalize w-48">
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
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white p-2.5 px-4 rounded-xl border shadow-sm">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div>Visita</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500"></div>FID</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-300"></div>Follow-up</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-purple-500"></div>Desmarcado</div>
            </div>
            <Button 
              className="bg-primary font-bold shadow-sm h-10 px-6 uppercase text-[11px] tracking-wider"
              onClick={() => setIsScheduleModalOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" /> Agendar
            </Button>
          </div>
        </div>

        <Card className="flex-1 border-slate-200 shadow-sm bg-white flex flex-col overflow-hidden rounded-2xl">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
            {weekDays.map(day => (
              <div key={day} className="py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                {day}
              </div>
            ))}
          </div>
          <div className="flex-1 grid grid-cols-7 auto-rows-[minmax(100px,1fr)] overflow-y-auto">
            {days.map((day, idx) => {
              const dayEvents = allEvents.filter(e => isSameDay(e.date, day));
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
