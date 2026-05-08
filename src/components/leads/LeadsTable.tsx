import React, { useState } from "react";
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
import { MessageSquare, Phone, MoreVertical, Flame, Snowflake, Sun } from "lucide-react";
import { LeadDetailsModal } from "./LeadDetailsModal";

interface LeadsTableProps {
  leads?: any[];
  isLoading?: boolean;
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

export function LeadsTable({ leads, isLoading }: LeadsTableProps) {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleLeadClick = (id: string) => {
    setSelectedLeadId(id);
    setIsModalOpen(true);
  };

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
            <TableHead className="text-[10px] uppercase font-bold text-slate-500">Origem</TableHead>
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
                <Badge className={`text-[9px] font-bold border-none shadow-none uppercase px-1.5 h-4 ${STATUS_COLORS[lead.status] || 'bg-slate-100 text-slate-600'}`}>
                  {STATUS_LABELS[lead.status] || lead.status}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="text-[10px] font-medium text-slate-600 uppercase">
                  {lead.origem || "Site"}
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
                      window.open(`https://wa.me/55${lead.telefone.replace(/\D/g, "")}`, "_blank");
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
      />
    </div>
  );
}
