import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageSquare, Phone, MoreVertical, Flame, Snowflake, Sun } from "lucide-react";
import { LeadDetailsModal } from "./LeadDetailsModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getRetrocompatibleStatus, getColunaPorStatus } from "@/lib/utils";
import { toast } from "sonner";

interface Coluna {
  id: string;
  nome: string;
  posicao: number;
}

interface LeadsTableProps {
  leads?: any[];
  isLoading?: boolean;
  colunas?: Coluna[];
}

const STATUS_COLORS: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700",
  em_atendimento: "bg-yellow-100 text-yellow-700",
  qualificado: "bg-purple-100 text-purple-700",
  desqualificado: "bg-red-100 text-red-700",
  venda_concluida: "bg-green-100 text-green-700",
};

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  em_atendimento: "Em Atendimento",
  qualificado: "Qualificado",
  desqualificado: "Desqualificado",
  venda_concluida: "Venda Concluída",
};

export function LeadsTable({ leads, isLoading, colunas }: LeadsTableProps) {
  const queryClient = useQueryClient();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<"detalhes" | "chat">("detalhes");
  const [pendingStatusChange, setPendingStatusChange] = useState<{ lead: any; coluna: Coluna } | null>(null);
  const [followUpDateTemp, setFollowUpDateTemp] = useState("");

  const handleLeadClick = (id: string) => {
    setSelectedLeadId(id);
    setModalInitialTab("detalhes");
    setIsModalOpen(true);
  };

  const handleOpenChat = (id: string) => {
    setSelectedLeadId(id);
    setModalInitialTab("chat");
    setIsModalOpen(true);
  };

  // Muda o status direto na lista, sem abrir o card — move status e coluna
  // do kanban juntos (mesma logica de handleMoveColuna no LeadDetailsModal),
  // senao o card fica visualmente parado na coluna antiga.
  const changeStatusMutation = useMutation({
    mutationFn: async ({ lead, coluna, followUpDate }: { lead: any; coluna: Coluna; followUpDate?: string }) => {
      // Negócio já fechado (handleFechamento em LeadDetailsModal) é estado
      // terminal — mudar a coluna do kanban não pode sobrescrever o status
      // 'venda_concluida' por baixo, senão a venda some dos relatórios
      // (achado real: 3 de 4 vendas fechadas perderam o status assim).
      if (lead.status === "venda_concluida") {
        throw new Error("Negócio já fechado — não é possível mudar a coluna por aqui.");
      }
      const status = getRetrocompatibleStatus(coluna.nome, coluna.posicao, colunas?.length || 1);
      const payload: any = { coluna_kanban_id: coluna.id, status };
      // followUpDate vem de <input type="datetime-local"> (sem timezone) —
      // converte pro UTC certo antes de salvar (mesmo ajuste feito em
      // ScheduleTaskModal/LeadDetailsModal, senão fica 3h errado).
      if (followUpDate) payload.lembrete_follow_up = new Date(followUpDate).toISOString();
      const { error } = await supabase
        .from("leads")
        .update(payload)
        .eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      if (variables.followUpDate) queryClient.invalidateQueries({ queryKey: ["compromissos"] });
      toast.success("Status atualizado!");
    },
    onError: (error: any) => toast.error("Erro ao atualizar status: " + (error?.message || "erro desconhecido")),
  });

  // Mesma lógica do handleUpdateField("cadencia_chamada", ...) do modal:
  // agenda follow-up +24h e move status+coluna pra "tarefas" (se não for
  // venda/descarte), pra não duplicar comportamento divergente entre lista e modal.
  const changeCadenciaMutation = useMutation({
    mutationFn: async ({ lead, cadencia }: { lead: any; cadencia: number }) => {
      const now = new Date();
      const nextDate = new Date();
      nextDate.setHours(nextDate.getHours() + 24);

      const payload: any = {
        cadencia_chamada: cadencia,
        data_ultima_chamada: now.toISOString(),
        lembrete_follow_up: nextDate.toISOString(),
        ultima_acao_at: now.toISOString(),
      };

      if (lead.status !== "venda_concluida" && !lead.descartado_em) {
        payload.status = "tarefas";
        const colunaTarefas = getColunaPorStatus(colunas, "tarefas");
        if (colunaTarefas) payload.coluna_kanban_id = colunaTarefas.id;
      }

      const { error } = await supabase.from("leads").update(payload).eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["compromissos"] });
      toast.success("Cadência atualizada!");
    },
    onError: (error: any) => toast.error("Erro ao atualizar cadência: " + (error?.message || "erro desconhecido")),
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-8 text-center text-slate-400">Carregando leads...</div>
      </div>
    );
  }

  if (!leads || leads.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <p className="text-slate-500 font-medium">Nenhum lead encontrado.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <Table>
        <TableHeader className="bg-slate-50/50">
          <TableRow>
            <TableHead className="text-[10px] uppercase font-bold text-slate-500 py-3">Lead</TableHead>
            <TableHead className="text-[10px] uppercase font-bold text-slate-500">Status</TableHead>
            <TableHead className="text-[10px] uppercase font-bold text-slate-500">Cadência</TableHead>
            <TableHead className="text-[10px] uppercase font-bold text-slate-500">Origem</TableHead>
            <TableHead className="text-[10px] uppercase font-bold text-slate-500">Referência</TableHead>
            <TableHead className="text-[10px] uppercase font-bold text-slate-500">Corretor</TableHead>
            <TableHead className="text-[10px] uppercase font-bold text-slate-500">Data</TableHead>
            <TableHead className="text-[10px] uppercase font-bold text-slate-500 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => (
            <TableRow 
              key={lead.id} 
              className="cursor-pointer hover:bg-slate-50 transition-colors group"
              onClick={() => handleLeadClick(lead.id)}
            >
              <TableCell className="py-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    {lead.temperatura === "quente" && <Flame className="h-3 w-3 text-red-500 fill-red-500" />}
                    {lead.temperatura === "morno" && <Sun className="h-3 w-3 text-amber-500 fill-amber-500" />}
                    {lead.temperatura === "frio" && <Snowflake className="h-3 w-3 text-blue-400" />}
                    <span className="text-[12px] font-bold text-slate-900 group-hover:text-primary transition-colors">
                      {lead.nome}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500">{lead.telefone}</span>
                </div>
              </TableCell>
              <TableCell>
                {colunas && colunas.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button onClick={(e) => e.stopPropagation()}>
                        <Badge className={`text-[9px] font-bold border-none shadow-none uppercase px-1.5 h-4 cursor-pointer hover:opacity-80 ${STATUS_COLORS[lead.status] || 'bg-slate-100 text-slate-600'}`}>
                          {STATUS_LABELS[lead.status] || lead.status}
                        </Badge>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                      {colunas.map((coluna) => (
                        <DropdownMenuItem
                          key={coluna.id}
                          disabled={lead.coluna_kanban_id === coluna.id}
                          onClick={() => { setFollowUpDateTemp(""); setPendingStatusChange({ lead, coluna }); }}
                        >
                          {coluna.nome}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Badge className={`text-[9px] font-bold border-none shadow-none uppercase px-1.5 h-4 ${STATUS_COLORS[lead.status] || 'bg-slate-100 text-slate-600'}`}>
                    {STATUS_LABELS[lead.status] || lead.status}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button onClick={(e) => e.stopPropagation()}>
                      <Badge variant="outline" className="text-[9px] font-bold uppercase px-1.5 h-4 cursor-pointer hover:opacity-80 border-slate-200 text-slate-600 bg-white">
                        {lead.cadencia_chamada ? `Chamada ${lead.cadencia_chamada}` : "Início"}
                      </Badge>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <DropdownMenuItem
                        key={n}
                        disabled={(lead.cadencia_chamada || 0) === n}
                        onClick={() => changeCadenciaMutation.mutate({ lead, cadencia: n })}
                      >
                        {n === 0 ? "Início" : `Chamada ${n}`}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
              <TableCell>
                <span className="text-[10px] font-medium text-slate-600 uppercase">
                  {lead.origem || "Site"}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-[10px] font-medium text-slate-600 uppercase">
                  {lead.referencia || "---"}
                </span>
              </TableCell>
              <TableCell>
                {lead.corretor ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5 border border-slate-100">
                      <AvatarImage src={lead.corretor.avatar_url} />
                      <AvatarFallback className="text-[8px]">{lead.corretor.nome?.[0]}</AvatarFallback>
                    </Avatar>
                    <span className="text-[10px] font-medium text-slate-700">{lead.corretor.nome}</span>
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-400">Não atribuído</span>
                )}
              </TableCell>
              <TableCell>
                <span className="text-[10px] text-slate-500">
                  {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-green-600 hover:bg-green-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenChat(lead.id);
                    }}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-blue-600 hover:bg-blue-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.location.href = `tel:+55${lead.telefone.replace(/\D/g, "")}`;
                    }}
                  >
                    <Phone className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400" onClick={(e) => e.stopPropagation()}>
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <LeadDetailsModal
        leadId={selectedLeadId}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        initialTab={modalInitialTab}
      />

      <Dialog open={!!pendingStatusChange} onOpenChange={(open) => { if (!open) setPendingStatusChange(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              Mover para "{pendingStatusChange?.coluna.nome}"
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
              Agendar próximo follow-up (opcional)
            </label>
            <Input
              type="datetime-local"
              value={followUpDateTemp}
              onChange={(e) => setFollowUpDateTemp(e.target.value)}
              className="h-9 text-sm border-slate-200"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-saas-xs font-bold uppercase"
              onClick={() => {
                if (!pendingStatusChange) return;
                changeStatusMutation.mutate({ lead: pendingStatusChange.lead, coluna: pendingStatusChange.coluna });
                setPendingStatusChange(null);
              }}
            >
              Salvar sem agendar
            </Button>
            <Button
              type="button"
              size="sm"
              className="text-saas-xs font-bold uppercase px-6"
              disabled={!followUpDateTemp}
              onClick={() => {
                if (!pendingStatusChange) return;
                changeStatusMutation.mutate({ lead: pendingStatusChange.lead, coluna: pendingStatusChange.coluna, followUpDate: followUpDateTemp });
                setPendingStatusChange(null);
              }}
            >
              Salvar e agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
