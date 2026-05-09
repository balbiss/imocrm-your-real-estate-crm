import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { format, isAfter, isBefore, subHours, startOfHour, setHours, addDays, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, Calendar, User, Phone, MapPin } from "lucide-react";

interface VisitAlert {
  id: string;
  lead_name: string;
  visit_date: string;
  type: "day_before" | "two_hours_before";
}

export function VisitAlerts() {
  const { user } = useAuth();
  const [activeAlerts, setActiveAlerts] = useState<VisitAlert[]>([]);
  const [currentAlertIndex, setCurrentAlertIndex] = useState(0);

  const { data: leadsWithVisits } = useQuery({
    queryKey: ["leads-visits-alerts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, data_visita, telefone")
        .eq("corretor_id", user.id)
        .not("data_visita", "is", null)
        .gt("data_visita", new Date().toISOString());
      
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    refetchInterval: 1000 * 60 * 5, // Check every 5 minutes
  });

  useEffect(() => {
    if (!leadsWithVisits) return;

    const now = new Date();
    const alerts: VisitAlert[] = [];

    leadsWithVisits.forEach((lead) => {
      const visitDate = new Date(lead.data_visita);
      
      // Alerta 1: 17h do dia anterior
      const dayBefore = subDays(visitDate, 1);
      const startOfAlertDayBefore = setHours(startOfDay(dayBefore), 17);
      const endOfAlertDayBefore = endOfDay(dayBefore);

      if (isAfter(now, startOfAlertDayBefore) && isBefore(now, endOfAlertDayBefore)) {
        alerts.push({
          id: lead.id,
          lead_name: lead.nome,
          visit_date: lead.data_visita,
          type: "day_before"
        });
      }

      // Alerta 2: 2 horas antes da visita
      const twoHoursBefore = subHours(visitDate, 2);
      if (isAfter(now, twoHoursBefore) && isBefore(now, visitDate)) {
        alerts.push({
          id: lead.id,
          lead_name: lead.nome,
          visit_date: lead.data_visita,
          type: "two_hours_before"
        });
      }
    });

    // Filtrar alertas já visualizados nesta sessão (opcional, para não repetir a cada 5min)
    // Por enquanto, vamos apenas mostrar se houver.
    setActiveAlerts(alerts);
  }, [leadsWithVisits]);

  const currentAlert = activeAlerts[currentAlertIndex];

  if (!currentAlert) return null;

  return (
    <Dialog open={!!currentAlert} onOpenChange={() => {}}>
      <DialogContent className="max-w-md bg-gradient-to-br from-white to-slate-50 border-none shadow-2xl p-0 overflow-hidden">
        <div className="bg-red-600 h-1.5 w-full animate-pulse" />
        <div className="p-6">
          <DialogHeader className="items-center text-center">
            <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mb-4 animate-bounce">
              <Bell className="h-8 w-8 text-red-600" />
            </div>
            <DialogTitle className="text-xl font-black text-slate-900 uppercase tracking-tight">
              ALERTA DE VISITA
            </DialogTitle>
            <DialogDescription className="text-slate-500 font-medium">
              {currentAlert.type === "day_before" 
                ? "Confirmação necessária para visita de amanhã!" 
                : "Visita programada para daqui a pouco!"}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Cliente</p>
                <p className="text-sm font-bold text-slate-900">{currentAlert.lead_name}</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="h-12 w-12 bg-amber-100 rounded-lg flex items-center justify-center">
                <Calendar className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Data e Hora</p>
                <p className="text-sm font-bold text-slate-900">
                  {format(new Date(currentAlert.visit_date), "EEEE, dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-2">
            <Button 
              className="w-full h-12 bg-slate-900 hover:bg-black text-white font-black uppercase tracking-widest text-xs"
              onClick={() => {
                if (currentAlertIndex < activeAlerts.length - 1) {
                  setCurrentAlertIndex(prev => prev + 1);
                } else {
                  setActiveAlerts([]);
                  setCurrentAlertIndex(0);
                }
              }}
            >
              Ciente / Visualizado
            </Button>
            <p className="text-[10px] text-center text-slate-400 font-bold uppercase mt-2">
              Lembre-se da "Regra de Ouro": O atendimento gera o fechamento.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
