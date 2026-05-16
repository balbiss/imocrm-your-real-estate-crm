import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MessageSquare, Phone, User, Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LeadDetailsModal } from "@/components/leads/LeadDetailsModal";
import { ScheduleTaskModal } from "@/components/leads/ScheduleTaskModal";
import { useState } from "react";
import { Plus } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/agenda")({
  head: () => ({ meta: [{ title: "Agenda — CRM" }] }),
  component: AgendaPage,
});

function AgendaPage() {
  const { user } = useAuth();
  const { role, isLoading: loadingPerms } = usePermissions();
  const [date, setDate] = useState<Date | undefined>(new Date());
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

  const { data: compromissos, isLoading } = useQuery({
    queryKey: ["compromissos", profile?.imobiliaria_id, role],
    queryFn: async () => {
      if (!profile?.imobiliaria_id || loadingPerms) return [];

      let query = supabase
        .from("leads")
        .select("*")
        .eq("imobiliaria_id", profile.imobiliaria_id)
        .not("lembrete_follow_up", "is", null);

      if (role === 'corretor') {
        query = query.eq("corretor_id", user?.id);
      }

      const { data, error } = await query.order("lembrete_follow_up");
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.imobiliaria_id && !loadingPerms,
  });

  if (isLoading || loadingPerms || loadingProfile) {
    return (
      <MainLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  const filteredCompromissos = compromissos?.filter(item => {
    if (!date) return true;
    const itemDate = new Date(item.lembrete_follow_up);
    return itemDate.getDate() === date.getDate() &&
           itemDate.getMonth() === date.getMonth() &&
           itemDate.getFullYear() === date.getFullYear();
  });

  return (
    <MainLayout>
      <div className="p-6 h-[calc(100vh-4rem)] flex flex-col md:flex-row gap-6 overflow-hidden">
        <div className="flex-shrink-0 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
              <p className="text-sm text-muted-foreground">Gerencie seus compromissos e follow-ups.</p>
            </div>
            <Button 
              size="sm"
              className="bg-primary font-bold shadow-sm"
              onClick={() => setIsScheduleModalOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" /> Agendar
            </Button>
          </div>

          <Card className="p-4 border-none shadow-md bg-white">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="rounded-md"
              locale={ptBR}
            />
          </Card>

          <Card className="p-4 bg-primary/5 border-primary/10">
            <h3 className="text-sm font-bold text-primary flex items-center gap-2 mb-2">
              <CalendarIcon className="h-4 w-4" /> Resumo do Dia
            </h3>
            <p className="text-xs text-muted-foreground">Você tem <span className="font-bold text-foreground">{compromissos?.length || 0}</span> compromissos agendados no total.</p>
          </Card>
        </div>

        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">
              Compromissos de {date ? format(date, "dd 'de' MMMM", { locale: ptBR }) : "hoje"}
            </h2>
            <Badge variant="secondary" className="h-6 px-2 text-[10px] font-bold uppercase">
              {filteredCompromissos?.length || 0} Agendados
            </Badge>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
            {filteredCompromissos?.map((item) => (
              <Card key={item.id} className="hover:border-primary/50 transition-colors border-slate-200">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-slate-100 flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold uppercase text-slate-500 leading-none">
                        {format(new Date(item.lembrete_follow_up), "MMM", { locale: ptBR })}
                      </span>
                      <span className="text-sm font-bold leading-none">
                        {format(new Date(item.lembrete_follow_up), "dd")}
                      </span>
                    </div>
                    
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h4 className="text-sm font-bold truncate">{item.nome}</h4>
                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-slate-200 uppercase font-bold text-slate-500">
                          {item.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {format(new Date(item.lembrete_follow_up), "HH:mm")}
                        </span>
                        <span className="flex items-center gap-1 truncate">
                          <Phone className="h-3 w-3" /> {item.telefone}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:bg-green-50">
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 text-[11px] font-bold px-3"
                      onClick={() => {
                        setSelectedLeadId(item.id);
                        setIsModalOpen(true);
                      }}
                    >
                      Ver Lead
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredCompromissos?.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                <CalendarIcon className="h-12 w-12 mb-4" />
                <p className="text-sm font-medium">Nenhum compromisso para este dia.</p>
              </div>
            )}
          </div>
        </div>
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
