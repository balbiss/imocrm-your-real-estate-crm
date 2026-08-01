import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Search, Calendar, User } from "lucide-react";

interface ScheduleTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScheduleTaskModal({ open, onOpenChange }: ScheduleTaskModalProps) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLead, setSelectedLead] = useState<{ id: string, nome: string } | null>(null);
  const [date, setDate] = useState("");
  const [obs, setObs] = useState("");

  const { data: leads, isLoading: isLoadingLeads } = useQuery({
    queryKey: ["leads-search", searchTerm],
    queryFn: async () => {
      if (searchTerm.length < 2) return [];
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome")
        .ilike("nome", `%${searchTerm}%`)
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: searchTerm.length >= 2,
  });

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLead || !date) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // O <input type="datetime-local"> devolve string sem timezone (ex.:
      // "2026-08-01T14:30"). new Date(...) interpreta isso como horário
      // local do navegador e .toISOString() converte certo pra UTC — sem
      // isso o Postgres assumia UTC direto e o horário salvo ficava 3h
      // adiantado (3h a menos na hora de exibir de volta em -03).
      const dateUtc = new Date(date).toISOString();

      // 1. Inserir na tabela de lembretes
      const { error: errorLembrete } = await supabase.from("lembretes_followup").insert({
        lead_id: selectedLead.id,
        corretor_id: user.id,
        datetime: dateUtc,
        observacao: obs,
      });
      if (errorLembrete) throw errorLembrete;

      // 2. Atualizar campo no lead para visualização rápida
      const { error: errorLead } = await supabase.from("leads").update({
        lembrete_follow_up: dateUtc
      }).eq("id", selectedLead.id);
      if (errorLead) throw errorLead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compromissos"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Compromisso agendado com sucesso!");
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error("Erro ao agendar: " + err.message);
    }
  });

  const resetForm = () => {
    setSearchTerm("");
    setSelectedLead(null);
    setDate("");
    setObs("");
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (!val) resetForm();
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Agendar Novo Compromisso</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase text-slate-500">Selecionar Lead</Label>
            {selectedLead ? (
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  <span className="text-sm font-bold">{selectedLead.nome}</span>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setSelectedLead(null)}>Trocar</Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Pesquisar por nome do lead..." 
                  className="pl-9 h-9 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {isLoadingLeads && (
                  <div className="absolute right-3 top-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  </div>
                )}
                {leads && leads.length > 0 && !selectedLead && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                    {leads.map(lead => (
                      <button
                        key={lead.id}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-none"
                        onClick={() => setSelectedLead(lead)}
                      >
                        {lead.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase text-slate-500">Data e Hora</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input 
                type="datetime-local" 
                className="pl-9 h-9 text-sm"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase text-slate-500">Observações</Label>
            <Textarea 
              placeholder="Ex: Ligar para confirmar interesse no imóvel X..." 
              className="text-xs min-h-[80px]"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button 
            onClick={() => scheduleMutation.mutate()}
            disabled={!selectedLead || !date || scheduleMutation.isPending}
            className="bg-primary font-bold"
          >
            {scheduleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Agendar Compromisso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
