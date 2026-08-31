import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  Phone,
  Mail,
  Calendar,
  History,
  FileText,
  User,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Flame,
  Snowflake,
  Sun,
  XCircle,
  Trophy,
  DollarSign,
  ArrowLeftRight,
  Edit3,
  LayoutGrid,
  MessageCircle,
  Star,
} from "lucide-react";
import { WhatsAppChat } from "./WhatsAppChat";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/context/AuthContext";
import { getRetrocompatibleStatus, getColunaPorStatus, calcularProximaCadencia } from "@/lib/utils";

interface LeadDetailsModalProps {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: "detalhes" | "chat";
}

export function LeadDetailsModal({ leadId, open, onOpenChange, initialTab = "detalhes" }: LeadDetailsModalProps) {
  const queryClient = useQueryClient();
  const { can, role } = usePermissions();
  const { user: authUser } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isEditing, setIsEditing] = useState(false);
  const [editingInteracaoId, setEditingInteracaoId] = useState<string | null>(null);
  const [editingInteracaoTexto, setEditingInteracaoTexto] = useState("");
  const [showDescarteModal, setShowDescarteModal] = useState(false);
  const [showFechamentoModal, setShowFechamentoModal] = useState(false);
  const [motivoDescarte, setMotivoDescarte] = useState("");
  const [obsDescarte, setObsDescarte] = useState("");
  const [valorFechamento, setValorFechamento] = useState("");
  const [obsFechamento, setObsFechamento] = useState("");
  const [empreendimentoFechamento, setEmpreendimentoFechamento] = useState("");
  const [unidadeFechamento, setUnidadeFechamento] = useState("");
  const [torreFechamento, setTorreFechamento] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpObs, setFollowUpObs] = useState("");
  const [mounted, setMounted] = useState(false);
  // Pedido do dono (09/08): mudar de coluna primeiro, pedir a data do
  // próximo contato depois -- antes bloqueava com toast.error exigindo
  // preencher o Bloco 3 ANTES de deixar mudar. Mesmo padrão de modal que
  // já existe e funciona em LeadsTable.tsx, pra não ter duas UX diferentes
  // pra mesma trava.
  const [pendingColunaChange, setPendingColunaChange] = useState<{ colunaId: string; nomeColuna: string; posicao: number } | null>(null);
  const [proximoContatoTemp, setProximoContatoTemp] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // O modal e reaproveitado entre leads diferentes (nao remonta por key),
  // entao a aba precisa ser resetada toda vez que abre de novo -- senao um
  // clique no icone do WhatsApp de um lead pode abrir na aba errada se o
  // usuario tinha deixado outro lead aberto no "Detalhes" antes.
  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  const [editNome, setEditNome] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [slaTimeLeft, setSlaTimeLeft] = useState<number | null>(null);

  // Buscar dados do lead
  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: async () => {
      if (!leadId) return null;
      const { data, error } = await supabase
        .from("leads")
        .select("*, interacoes:leads_interacoes(*, autor:perfis(nome))")
        .eq("id", leadId)
        .maybeSingle();
      
      if (error) {
        console.error("Error fetching lead:", error);
        throw error;
      }
      return data;
    },
    enabled: !!leadId && open,
  });

  // Buscar colunas do Kanban
  const { data: colunas, isLoading: loadingColunas } = useQuery({
    queryKey: ["colunas_kanban", lead?.imobiliaria_id],
    queryFn: async () => {
      if (!lead?.imobiliaria_id) return [];
      const { data, error } = await supabase
        .from("colunas_kanban")
        .select("*")
        .eq("imobiliaria_id", lead.imobiliaria_id)
        .order("posicao", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!lead?.imobiliaria_id && open,
  });


  // Lista de corretores da imobiliária, pra dono/gerente poderem transferir o lead
  const { data: corretoresImobiliaria } = useQuery({
    queryKey: ["corretores-transferencia", lead?.imobiliaria_id],
    queryFn: async () => {
      if (!lead?.imobiliaria_id) return [];
      const { data, error } = await supabase
        .from("perfis")
        .select("id, nome")
        .eq("imobiliaria_id", lead.imobiliaria_id)
        .order("nome", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!lead?.imobiliaria_id && open && can('manage_team'),
  });

  const transferMutation = useMutation({
    mutationFn: async (corretorId: string) => {
      const { error } = await supabase.rpc('distribuir_leads_massa', {
        p_lead_ids: [leadId],
        p_corretor_id: corretorId,
        p_tipo: 'manual',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead transferido!");
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (error: any) => toast.error("Erro ao transferir: " + error.message),
  });

  // Especificação do dono (04/08): mover pra qualquer uma dessas colunas
  // exige já ter um Próximo Contato agendado no futuro — sem isso o card
  // trava e não é possível mudar de status.
  const COLUNAS_AGENDAMENTO_OBRIGATORIO = [
    "conversando", "visitou", "cobrar doc", "pendente",
    "aprovado", "reprovado", "restricao", "restrição", "futuros",
  ];

  const handleMoveColuna = (colunaId: string, nomeColuna: string, posicao: number) => {
    // Negócio já fechado é estado terminal — não deixa mudar de coluna por
    // aqui sobrescrever o status 'venda_concluida' (ver LeadsTable.tsx pro
    // mesmo guard e o motivo: vendas sumindo dos relatórios).
    if (lead?.status === "venda_concluida") {
      toast.error("Negócio já fechado — não é possível mudar a coluna por aqui.");
      return;
    }
    // Venda pendente de aprovação também é estado travado — evita mexer na
    // coluna enquanto o dono/gerente ainda não decidiu (ver AprovacoesVendaDialog).
    if (lead?.venda_pendente_aprovacao) {
      toast.error("Venda aguardando aprovação — não é possível mudar a coluna agora.");
      return;
    }

    const nomeColunaLower = nomeColuna.toLowerCase();
    const ehAgendadoOuFid = nomeColunaLower.includes("agendado") || nomeColunaLower.includes("fid");
    if (ehAgendadoOuFid) {
      // Agendado/FID continua exigindo Data e Horário do compromisso via
      // campo dedicado (Bloco 3) -- diferente do "Próximo Contato" comum,
      // porque aqui a data É o proprio motivo da coluna, não um lembrete.
      const temVisitaFutura = lead?.data_visita && new Date(lead.data_visita) > new Date();
      if (!temVisitaFutura) {
        toast.error(`"${nomeColuna}" exige Data e Horário do agendamento preenchidos. Use o campo "Agendar Compromisso" (Bloco 3) antes de mudar o status.`);
        return;
      }
    } else {
      const exigeAgendamento = COLUNAS_AGENDAMENTO_OBRIGATORIO.some((n) => nomeColunaLower.includes(n));
      const temProximoContatoFuturo = lead?.lembrete_follow_up && new Date(lead.lembrete_follow_up) > new Date();
      if (exigeAgendamento && !temProximoContatoFuturo) {
        // Pedido do dono (09/08): não bloquear mais -- abre um modal pra
        // preencher a data JUNTO com a troca de coluna, mesmo padrão do
        // Dialog de LeadsTable.tsx (que já pedia isso corretamente).
        setProximoContatoTemp("");
        setPendingColunaChange({ colunaId, nomeColuna, posicao });
        return;
      }
    }

    const retroStatus = getRetrocompatibleStatus(nomeColuna, posicao, colunas ? colunas.length : 10);
    updateMutation.mutate({
      updates: { coluna_kanban_id: colunaId, status: retroStatus },
      descricao: `Moveu o card para a coluna "${nomeColuna}"`,
    });
  };

  const confirmarMudancaColuna = (comData: boolean) => {
    if (!pendingColunaChange) return;
    const { colunaId, nomeColuna, posicao } = pendingColunaChange;
    const retroStatus = getRetrocompatibleStatus(nomeColuna, posicao, colunas ? colunas.length : 10);
    const updates: any = { coluna_kanban_id: colunaId, status: retroStatus };
    if (comData && proximoContatoTemp) {
      updates.lembrete_follow_up = new Date(proximoContatoTemp).toISOString();
    }
    updateMutation.mutate({
      updates,
      descricao: `Moveu o card para a coluna "${nomeColuna}"${comData && proximoContatoTemp ? " e agendou próximo contato" : ""}`,
    });
    setPendingColunaChange(null);
    setProximoContatoTemp("");
  };

  // Lógica do SLA de 5 minutos
  useEffect(() => {
    if (lead && lead.status === 'novo' && lead.ultima_acao_at) {
      const calculateTimeLeft = () => {
        const lastAction = new Date(lead.ultima_acao_at).getTime();
        const now = new Date().getTime();
        const diff = (lastAction + 5 * 60 * 1000) - now;
        return diff > 0 ? Math.floor(diff / 1000) : 0;
      };

      setSlaTimeLeft(calculateTimeLeft());

      const timer = setInterval(() => {
        const left = calculateTimeLeft();
        setSlaTimeLeft(left);
        if (left <= 0) clearInterval(timer);
      }, 1000);

      return () => clearInterval(timer);
    } else {
      setSlaTimeLeft(null);
    }
  }, [lead]);

  const formatSlaTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (lead) {
      setEditNome(lead.nome);
      setEditTelefone(lead.telefone);
      setEditEmail(lead.email || "");
    }
  }, [lead]);

  // Rótulos legíveis pros campos que o corretor mexe no card, pra gerar o
  // registro automático de histórico sem precisar anotar cada chamada.
  const CAMPO_LABELS: Record<string, string> = {
    nome: "Nome",
    telefone: "Telefone",
    email: "E-mail",
    favorito: "Favorito",
    temperatura: "Temperatura",
    status: "Status",
    cadencia_chamada: "Cadência de chamada",
    tipo_visita: "Tipo de visita",
    data_visita: "Data da visita",
    status_visita: "Status da visita",
    renda_familiar: "Renda familiar",
    saldo_fgts: "Saldo de FGTS",
    valor_entrada: "Valor de entrada",
    link_drive: "Link de documentos",
    lembrete_follow_up: "Follow-up",
  };

  function gerarDescricaoAutomatica(updates: Record<string, any>): string | null {
    const campos = Object.keys(updates).filter((k) => k in CAMPO_LABELS);
    if (campos.length === 0) return null;
    return campos.map((campo) => `${CAMPO_LABELS[campo]} alterado(a) para "${updates[campo]}"`).join("; ");
  }

  // Mutação para atualizar lead
  const updateMutation = useMutation({
    mutationFn: async ({ updates, descricao }: { updates: any; descricao?: string | null }) => {
      // Sempre atualizar ultima_acao_at ao mexer no card
      const fullUpdates = {
        ...updates,
        ultima_acao_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from("leads")
        .update(fullUpdates)
        .eq("id", leadId);
      if (error) throw error;

      // Registra automaticamente no histórico, sem o corretor precisar
      // escrever nada — qualquer mudança feita no card já vira registro.
      const texto = descricao ?? gerarDescricaoAutomatica(updates);
      if (texto && authUser) {
        await supabase.from("leads_interacoes").insert({
          lead_id: leadId!,
          autor_id: authUser.id,
          tipo: "auto",
          conteudo: texto,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["compromissos"] });
      toast.success("Informações atualizadas!");
    },
  });

  // Mutação para adicionar interação
  const addInteractionMutation = useMutation({
    mutationFn: async ({ tipo, conteudo }: { tipo: string; conteudo: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Registrar interação
      const { error: interError } = await supabase.from("leads_interacoes").insert({
        lead_id: leadId!,
        autor_id: user.id,
        tipo,
        conteudo,
      });
      if (interError) throw interError;

      // Resetar SLA ao registrar nota/interação
      await supabase.from("leads").update({
        ultima_acao_at: new Date().toISOString()
      }).eq("id", leadId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      toast.success("Interação registrada!");
    },
  });

  // Corretor só edita/apaga o que ele mesmo escreveu, e só no mesmo dia;
  // dono/gerente podem mexer em qualquer registro do histórico.
  const podeEditarInteracao = (interacao: any) => {
    if (!authUser) return false;
    if (role === "dono" || role === "gerente") return true;
    return interacao.autor_id === authUser.id && isToday(new Date(interacao.created_at));
  };

  const editInteractionMutation = useMutation({
    mutationFn: async ({ id, conteudo }: { id: string; conteudo: string }) => {
      const { error } = await supabase.from("leads_interacoes").update({ conteudo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      toast.success("Registro atualizado!");
    },
    onError: (error: any) => toast.error("Erro ao editar: " + error.message),
  });

  const deleteInteractionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads_interacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      toast.success("Registro removido!");
    },
    onError: (error: any) => toast.error("Erro ao remover: " + error.message),
  });

  const handleDescarte = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Registrar em descartes_leads
      await supabase.from("descartes_leads").insert({
        lead_id: leadId!,
        usuario_id: user.id,
        motivo: motivoDescarte,
        observacao: obsDescarte,
      });

      const isExtreme = motivoDescarte === "Descadastrar" || motivoDescarte === "Já Comprou (Outra Empresa)" || motivoDescarte === "Contato Errado";
      
      if (isExtreme) {
        // Fluxo de Aprovação Gerencial (O lead "morre" da tela do corretor mas aguarda aprovação)
        await supabase.from("leads").update({
          descarte_pendente_aprovacao: true,
          motivo_descarte: motivoDescarte,
          ultima_acao_at: new Date().toISOString()
          // Mantém o corretor_id para saber de quem veio e o status inalterado por enquanto
        }).eq("id", leadId);

        await supabase.from("leads_interacoes").insert({
          lead_id: leadId!,
          autor_id: user.id,
          tipo: 'descarte',
          conteudo: `Solicitação de descarte extremo gerada: ${motivoDescarte} - ${obsDescarte}`,
        });

        toast.success("Solicitação enviada para aprovação do Gerente!");
      } else {
        // Fluxo Normal (Vai pro bolsão/quarentena) -- via RPC SECURITY DEFINER:
        // um update direto tentando zerar corretor_id falha com RLS pro
        // papel corretor (achado real, 05/08 -- corretor descartava, via
        // "sucesso" mas o lead nunca saia de verdade). Ver
        // descartar_lead_normal() na migration 20260805030000.
        const { error: descarteError } = await supabase.rpc("descartar_lead_normal", {
          p_lead_id: leadId,
          p_motivo: motivoDescarte,
          p_observacao: obsDescarte || null,
        });
        if (descarteError) throw descarteError;
        toast.success("Lead devolvido ao bolsão");
      }

      setShowDescarteModal(false);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["compromissos"] });
    } catch (error) {
      toast.error("Erro ao descartar lead");
    }
  };

  // Especificação do dono (05/08): VENDA nunca fecha na hora — fica
  // pendente de aprovação do dono/gerente (ver AprovacoesVendaDialog).
  // Igual ao descarte extremo, status e coluna_kanban_id NÃO são tocados
  // aqui — só na aprovação, os dois mudam juntos pra coluna VENDA. Isso
  // elimina o bug relatado (card "preso" em Tarefa mesmo com venda
  // registrada): antes só o status mudava, agora nada muda até aprovar.
  const handleFechamento = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const valorNum = parseFloat(valorFechamento.replace(/[^\d,]/g, '').replace(',', '.'));

      await supabase.from("leads").update({
        venda_pendente_aprovacao: true,
        valor_venda: valorNum,
        empreendimento: empreendimentoFechamento || null,
        unidade: unidadeFechamento || null,
        torre: torreFechamento || null,
        ultima_acao_at: new Date().toISOString()
      }).eq("id", leadId);

      await supabase.from("leads_interacoes").insert({
        lead_id: leadId!,
        autor_id: user.id,
        tipo: 'fechamento',
        conteudo: `Venda enviada para aprovação! Valor: R$ ${valorFechamento} · Empreendimento: ${empreendimentoFechamento || "-"} · Unidade: ${unidadeFechamento || "-"} · Torre: ${torreFechamento || "-"}${obsFechamento ? " · " + obsFechamento : ""}`,
      });

      toast.success("Venda enviada para aprovação do gerente/dono!");
      setShowFechamentoModal(false);
      setValorFechamento("");
      setObsFechamento("");
      setEmpreendimentoFechamento("");
      setUnidadeFechamento("");
      setTorreFechamento("");
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["aprovacoes-pendentes-count"] });
    } catch (error) {
      toast.error("Erro ao enviar venda para aprovação");
    }
  };

  const handleAgendarFollowUp = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // followUpDate vem sem timezone ("YYYY-MM-DDTHH:mm", horário local
      // digitado pelo corretor) — new Date(...).toISOString() converte pro
      // UTC certo antes de salvar, senão o Postgres assume UTC direto e o
      // horário exibido depois fica 3h a menos (fuso de Brasília).
      const followUpDateUtc = new Date(followUpDate).toISOString();

      await supabase.from("lembretes_followup").insert({
        lead_id: leadId!,
        corretor_id: user.id,
        datetime: followUpDateUtc,
        observacao: followUpObs,
      });

      await supabase.from("leads").update({
        lembrete_follow_up: followUpDateUtc,
        ultima_acao_at: new Date().toISOString()
      }).eq("id", leadId);

      toast.success("Lembrete agendado!");
      setFollowUpDate("");
      setFollowUpObs("");
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["compromissos"] });
    } catch (error) {
      toast.error("Erro ao agendar lembrete");
    }
  };

  if (!mounted) return null;

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl h-[60vh] flex items-center justify-center">
          <DialogTitle className="sr-only">Carregando detalhes...</DialogTitle>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </DialogContent>
      </Dialog>
    );
  }

  if (!lead) return null;

  const handleUpdateField = (field: string, value: any) => {
    // Evita registrar histórico "alterado" quando o campo só perdeu o foco
    // sem ninguém mudar o valor de fato (ex: clicar e sair do input).
    if (field !== "cadencia_chamada" && value === (lead as any)[field]) return;

    const payload: any = { [field]: value };

    if (field === "cadencia_chamada") {
      const now = new Date();
      payload.data_ultima_chamada = now.toISOString();
      
      // Agenda a próxima tarefa no horário fixo da cadência
      const nextDate = calcularProximaCadencia(now);
      payload.lembrete_follow_up = nextDate.toISOString();
      
      // Move para tarefas (se não for venda ou descarte) — precisa mudar o
      // status E a coluna do kanban juntos, senao o card fica visualmente
      // parado na coluna antiga (ex: "Lead Novo") mesmo o historico
      // registrando que o status virou "tarefas".
      if (lead.status !== 'venda_concluida' && !lead.descartado_em) {
         payload.status = 'tarefas';
         const colunaTarefas = getColunaPorStatus(colunas, 'tarefas');
         if (colunaTarefas) payload.coluna_kanban_id = colunaTarefas.id;
      }
    }
    
    updateMutation.mutate({ updates: payload });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 overflow-hidden bg-slate-50 border-none shadow-2xl">
        <DialogHeader className="p-4 pb-0 bg-white border-b">
          <DialogTitle className="sr-only">Detalhes do Lead: {lead.nome}</DialogTitle>
          
          {/* BARRA DE SLA */}
          {slaTimeLeft !== null && (
            <div className={`absolute top-0 left-0 w-full h-1 flex items-center justify-center transition-all ${slaTimeLeft < 60 ? 'bg-red-500' : 'bg-primary'}`}>
              <div className="absolute top-1 bg-inherit text-white text-[9px] font-black px-2 py-0.5 rounded-b-md shadow-sm animate-bounce">
                SLA: {formatSlaTime(slaTimeLeft)}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-3 pt-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-brand flex items-center justify-center text-white text-lg font-bold shadow-sm">
                {lead.nome[0]}
              </div>
              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <div className="flex gap-2 items-center">
                    <Input 
                      value={editNome} 
                      onChange={(e) => setEditNome(e.target.value)} 
                      className="h-8 text-sm font-bold border-primary/20 focus:ring-primary/20"
                    />
                    <Button 
                      size="sm" 
                      className="h-8 px-3 text-[10px] font-bold"
                      onClick={() => {
                        handleUpdateField("nome", editNome);
                        setIsEditing(false);
                      }}
                    >Salvar</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsEditing(true)}>
                      <h2 className="text-lg font-bold leading-none truncate group-hover:text-primary transition-colors">{lead.nome}</h2>
                      <Edit3 className="h-3 w-3 text-slate-300 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all" />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-yellow-500 hover:text-yellow-600 hover:bg-yellow-50 rounded-full"
                      onClick={() => handleUpdateField("favorito", !lead.favorito)}
                    >
                      <Star className={`h-4 w-4 ${lead.favorito ? "fill-yellow-400 text-yellow-500" : "text-slate-300"}`} />
                    </Button>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-bold uppercase bg-slate-100 text-slate-500 border-none">
                    {lead.status.replace("_", " ")}
                  </Badge>
                  {(lead.status !== "rebatida" || role !== "corretor") && (
                    <span className="text-[10px] font-medium text-slate-400">
                      Desde {format(new Date(lead.created_at), "dd/MM/yy 'às' HH:mm")}
                    </span>
                  )}
                  {lead.recadastro_em && (
                    <Badge className="h-4 px-1.5 text-[9px] font-black uppercase bg-red-100 text-red-700 border-none">
                      Segundo cadastro · {format(new Date(lead.recadastro_em), "dd/MM/yy")}
                      {lead.recadastro_origem ? ` (${lead.recadastro_origem})` : ""}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "detalhes" | "chat")} className="w-full">
            <TabsList className="bg-transparent border-b rounded-none h-9 p-0 gap-5">
              {[
                { id: "detalhes", icon: User, label: "Detalhes" },
                { id: "chat", icon: MessageCircle, label: "Chat WhatsApp" },
              ].map(tab => (
                <TabsTrigger 
                  key={tab.id}
                  value={tab.id} 
                  className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none h-full text-[11px] font-bold uppercase tracking-wider px-0 transition-all opacity-60 data-[state=active]:opacity-100"
                >
                  <tab.icon className="h-3.5 w-3.5 mr-1.5" /> {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-6">
              {activeTab === "detalhes" && (
                <>
              {/* BLOCO 1: INFORMAÇÕES DO CONTATO */}
              <Card className="border-none shadow-sm bg-white overflow-hidden">
                <CardHeader className="p-4 pb-2 bg-slate-50/50">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Bloco 1: Informações de Contato</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Campanha (Origem do lead)</Label>
                      <Input value={lead.referencia || lead.origem || "Não informado"} disabled className="h-9 text-sm border-slate-200 bg-slate-50" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Nome Completo</Label>
                      <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} onBlur={() => handleUpdateField("nome", editNome)} className="h-9 text-sm border-slate-200" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Telefone / WhatsApp</Label>
                      <div className="flex gap-2">
                        <Input value={editTelefone} onChange={(e) => setEditTelefone(e.target.value)} onBlur={() => handleUpdateField("telefone", editTelefone)} className="h-9 text-sm border-slate-200" />
                        <Button size="sm" variant="outline" className="h-9 px-3 text-green-600 border-green-100 bg-green-50" asChild>
                          <a href={`https://wa.me/55${lead.telefone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageSquare className="h-4 w-4" /></a>
                        </Button>
                      </div>
                      {lead.telefone_alternativo && lead.telefone_alternativo.replace(/\D/g, "") !== lead.telefone.replace(/\D/g, "") && (
                        <div className="flex gap-2 items-center pt-1">
                          <span className="text-[10px] font-bold text-amber-600 uppercase shrink-0">2º nº (form):</span>
                          <span className="text-sm text-slate-600 flex-1">{lead.telefone_alternativo}</span>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] font-bold text-slate-500" onClick={() => { setEditTelefone(lead.telefone_alternativo!); handleUpdateField("telefone", lead.telefone_alternativo!); }}>
                            Usar este
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-green-600 border-green-100 bg-green-50" asChild>
                            <a href={`https://wa.me/55${lead.telefone_alternativo.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageSquare className="h-3.5 w-3.5" /></a>
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">E-mail</Label>
                      <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Adicionar e-mail..." className="h-9 text-sm border-slate-200" onBlur={() => handleUpdateField("email", editEmail)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Data de Nascimento (p/ lembrete de aniversário)</Label>
                      <Input
                        type="date"
                        defaultValue={lead.data_nascimento ? lead.data_nascimento.slice(0, 10) : ""}
                        className="h-9 text-sm border-slate-200"
                        onBlur={(e) => handleUpdateField("data_nascimento", e.target.value || null)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* BLOCO 2: AÇÕES E TEMPERATURA */}
              <Card className="border-none shadow-sm bg-white overflow-hidden">
                <CardHeader className="p-4 pb-2 bg-slate-50/50">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Bloco 2: Ações e Temperatura</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-4">
                  <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="flex-1 w-full space-y-2">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Temperatura do Lead</Label>
                      <div className="flex gap-2">
                        <Button 
                          variant={lead.temperatura === 'quente' ? 'default' : 'outline'} 
                          size="sm" 
                          className={`flex-1 h-10 text-[10px] font-bold gap-1.5 ${lead.temperatura === 'quente' ? 'bg-red-500 hover:bg-red-600' : ''}`}
                          onClick={() => handleUpdateField("temperatura", "quente")}
                        >
                          <Flame className="h-3.5 w-3.5" /> QUENTE
                        </Button>
                        <Button 
                          variant={lead.temperatura === 'morno' ? 'default' : 'outline'} 
                          size="sm" 
                          className={`flex-1 h-10 text-[10px] font-bold gap-1.5 ${lead.temperatura === 'morno' ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
                          onClick={() => handleUpdateField("temperatura", "morno")}
                        >
                          <Sun className="h-3.5 w-3.5" /> MORNO
                        </Button>
                        <Button 
                          variant={lead.temperatura === 'frio' ? 'default' : 'outline'} 
                          size="sm" 
                          className={`flex-1 h-10 text-[10px] font-bold gap-1.5 ${lead.temperatura === 'frio' ? 'bg-blue-500 hover:bg-blue-600' : ''}`}
                          onClick={() => handleUpdateField("temperatura", "frio")}
                        >
                          <Snowflake className="h-3.5 w-3.5" /> FRIO
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto pt-6">
                      <Button variant="outline" className="h-10 text-[10px] font-bold text-orange-600 border-orange-200 hover:bg-orange-50 gap-2" onClick={() => setShowDescarteModal(true)}>
                        <XCircle className="h-4 w-4" /> DEVOLVER
                      </Button>
                      {lead.venda_pendente_aprovacao ? (
                        <Button disabled className="h-10 text-[10px] font-bold bg-amber-100 text-amber-700 gap-2 cursor-not-allowed">
                          <Trophy className="h-4 w-4" /> AGUARDANDO APROVAÇÃO
                        </Button>
                      ) : (
                        <Button className="h-10 text-[10px] font-bold bg-green-600 hover:bg-green-700 gap-2" onClick={() => setShowFechamentoModal(true)}>
                          <Trophy className="h-4 w-4" /> VENDA
                        </Button>
                      )}
                    </div>
                  </div>

                  {can('manage_team') && (
                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5">
                      {lead.corretor_id && (
                        <p className="text-[10px] text-slate-400">
                          Atualmente com <strong className="text-slate-600">{corretoresImobiliaria?.find(c => c.id === lead.corretor_id)?.nome || "..."}</strong> — por isso ela(e) não aparece na lista abaixo.
                        </p>
                      )}
                      <div className="flex items-center gap-3">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter shrink-0 flex items-center gap-1.5">
                          <ArrowLeftRight className="h-3.5 w-3.5" /> Transferir para
                        </Label>
                        <Select onValueChange={(v) => transferMutation.mutate(v)} disabled={transferMutation.isPending}>
                          <SelectTrigger className="h-9 text-xs font-bold flex-1 border-slate-200">
                            <SelectValue placeholder={lead.corretor_id ? "Selecione outro corretor..." : "Atribuir a um corretor..."} />
                          </SelectTrigger>
                          <SelectContent>
                            {corretoresImobiliaria?.filter(c => c.id !== lead.corretor_id).map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* BLOCO 2.5: FOLLOW-UP E VISITA (movido pra cima do Status do
                  Kanban a pedido do dono, 17/08 -- é o bloco que os
                  corretores mais usam no dia a dia) */}
              <Card className="border-none shadow-sm bg-white overflow-hidden">
                <CardHeader className="p-4 pb-2 bg-slate-50/50">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Bloco 2.5: Follow-up e Visita</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-4 space-y-6">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Próximo Contato</Label>
                      <div className="flex gap-2">
                        <Input 
                          type="date" 
                          value={followUpDate ? followUpDate.split('T')[0] : ""} 
                          onChange={(e) => setFollowUpDate(`${e.target.value}T${followUpDate && followUpDate.includes('T') ? followUpDate.split('T')[1].substring(0,5) : "09:00"}`)} 
                          className="h-10 text-sm border-slate-200" 
                        />
                        <Select 
                          value={followUpDate && followUpDate.includes('T') ? followUpDate.split('T')[1].substring(0,5) : "09:00"} 
                          onValueChange={(v) => setFollowUpDate(`${followUpDate ? followUpDate.split('T')[0] : new Date().toISOString().split('T')[0]}T${v}`)}
                        >
                          <SelectTrigger className="w-[90px] h-10 text-xs border-slate-200"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Array.from({length: 30}).map((_, i) => { const totalMin = i * 30; const h = `${(7 + Math.floor(totalMin / 60)).toString().padStart(2, '0')}:${(totalMin % 60).toString().padStart(2, '0')}`; return <SelectItem key={h} value={h}>{h}</SelectItem> })}
                          </SelectContent>
                        </Select>
                        <Button onClick={handleAgendarFollowUp} disabled={!followUpDate} className="h-10 text-[11px] font-bold bg-primary px-4">
                          <Clock className="h-4 w-4 mr-2" /> Agendar
                        </Button>
                      </div>
                      {lead.lembrete_follow_up && (
                        <p className="text-[11px] font-bold text-primary flex items-center bg-primary/5 p-1.5 rounded-md mt-1">
                          <Clock className="h-3 w-3 mr-1.5 text-primary" /> 
                          Agendado: {format(new Date(lead.lembrete_follow_up), "dd/MM/yyyy 'às' HH:mm")}
                        </p>
                      )}
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Agendar Compromisso (ALERTA)</Label>
                      <div className="flex gap-2">
                        <Select 
                          value={lead.tipo_visita || 'VISITA'} 
                          onValueChange={(v) => handleUpdateField("tipo_visita", v)}
                        >
                          <SelectTrigger className="w-[110px] h-10 text-xs font-bold border-primary/20 bg-primary/5 text-primary">
                            <SelectValue placeholder="Tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="VISITA" className="font-bold text-blue-600">VISITA</SelectItem>
                            <SelectItem value="FID" className="font-bold text-green-600">FID</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="date"
                          value={lead.data_visita ? format(new Date(lead.data_visita), "yyyy-MM-dd") : ""}
                          onChange={(e) => handleUpdateField("data_visita", new Date(`${e.target.value}T${lead.data_visita ? format(new Date(lead.data_visita), "HH:mm") : "09:00"}`).toISOString())}
                          className="flex-1 h-10 text-sm border-primary/20 bg-primary/5 font-bold"
                        />
                        <Select
                          value={lead.data_visita ? format(new Date(lead.data_visita), "HH:mm") : "09:00"}
                          onValueChange={(v) => handleUpdateField("data_visita", new Date(`${lead.data_visita ? format(new Date(lead.data_visita), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")}T${v}`).toISOString())}
                        >
                          <SelectTrigger className="w-[90px] h-10 text-xs font-bold border-primary/20 bg-primary/5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({length: 30}).map((_, i) => { const totalMin = i * 30; const h = `${(7 + Math.floor(totalMin / 60)).toString().padStart(2, '0')}:${(totalMin % 60).toString().padStart(2, '0')}`; return <SelectItem key={h} value={h}>{h}</SelectItem> })}
                          </SelectContent>
                        </Select>
                      </div>
                      {lead.data_visita && (
                        <div className="pt-2">
                          <Select 
                            value={lead.status_visita || 'AGENDADA'} 
                            onValueChange={(v) => handleUpdateField("status_visita", v)}
                          >
                            <SelectTrigger className="w-full h-8 text-[11px] font-bold border-slate-200 bg-white">
                              <SelectValue placeholder="Status do Compromisso" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AGENDADA" className="font-bold text-slate-600">Agendada</SelectItem>
                              <SelectItem value="REALIZADA" className="font-bold text-green-600">Realizada</SelectItem>
                              <SelectItem value="DESMARCADA" className="font-bold text-red-600">Desmarcou</SelectItem>
                              <SelectItem value="REAGENDADA" className="font-bold text-purple-600">Reagendou</SelectItem>
                              <SelectItem value="FURO" className="font-bold text-orange-600">Furou (Não compareceu)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Cadência de Chamada</Label>
                      <Select value={String(lead.cadencia_chamada || 0)} onValueChange={(v) => handleUpdateField("cadencia_chamada", parseInt(v))}>
                        <SelectTrigger className="h-10 text-sm border-slate-200">
                          <SelectValue placeholder="Selecione a chamada..." />
                        </SelectTrigger>
                        <SelectContent>
                          {[0, 1, 2, 3, 4, 5].map(n => (
                            <SelectItem key={n} value={String(n)}>{n === 0 ? "Início" : `Chamada ${n}`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Última Chamada</Label>
                      <Input value={lead.data_ultima_chamada ? format(new Date(lead.data_ultima_chamada), "dd/MM/yy HH:mm", { locale: ptBR }) : "Nenhuma"} disabled className="h-10 text-sm bg-slate-50" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* BLOCO 3: STATUS DO KANBAN */}
              <Card className="border-none shadow-sm bg-white overflow-hidden">
                <CardHeader className="p-4 pb-2 bg-slate-50/50">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <LayoutGrid className="h-3.5 w-3.5" /> Mover Coluna do Kanban
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {loadingColunas ? (
                      <div className="col-span-full flex justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      </div>
                    ) : colunas && colunas.length > 0 ? (
                      colunas.map((coluna) => {
                        const retroStatus = getRetrocompatibleStatus(coluna.nome, coluna.posicao, colunas.length);
                        const isAtiva = lead.coluna_kanban_id
                          ? lead.coluna_kanban_id === coluna.id
                          : lead.status === retroStatus;

                        // Determinar cores dinâmicas baseadas na classe da cor da coluna
                        let colorClass = "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100";
                        if (coluna.cor === "bg-orange-500") colorClass = "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100";
                        else if (coluna.cor === "bg-red-500") colorClass = "bg-red-50 text-red-700 border-red-200 hover:bg-red-100";
                        else if (coluna.cor === "bg-purple-500") colorClass = "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100";
                        else if (coluna.cor === "bg-amber-500") colorClass = "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100";
                        else if (coluna.cor === "bg-cyan-500") colorClass = "bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100";
                        else if (coluna.cor === "bg-slate-500") colorClass = "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200";
                        else if (coluna.cor === "bg-emerald-500") colorClass = "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100";
                        else if (coluna.cor === "bg-rose-600") colorClass = "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100";
                        else if (coluna.cor === "bg-indigo-500") colorClass = "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100";

                        return (
                          <button
                            key={coluna.id}
                            onClick={() => {
                              if (!isAtiva) {
                                handleMoveColuna(coluna.id, coluna.nome, coluna.posicao);
                              }
                            }}
                            className={`relative h-10 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all ${
                              isAtiva
                                ? "ring-2 ring-offset-1 ring-primary shadow-sm scale-[1.03] " + colorClass
                                : colorClass + " opacity-70"
                            }`}
                          >
                            {isAtiva && (
                              <CheckCircle2 className="absolute top-1 right-1 h-3 w-3 text-primary opacity-80" />
                            )}
                            {coluna.nome}
                          </button>
                        );
                      })
                    ) : (
                      ([
                        { value: "novo",            label: "Novo",         color: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
                        { value: "rebatida",        label: "Rebatida",     color: "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100" },
                        { value: "tarefas",         label: "Tarefas",      color: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" },
                        { value: "agendado",        label: "Agendado",     color: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" },
                        { value: "visitou",         label: "Visitou",      color: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
                        { value: "cobrar_doc",      label: "Cobrar Doc",   color: "bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100" },
                        { value: "pendente",        label: "Pendente",     color: "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200" },
                        { value: "aprovado",        label: "Aprovado",     color: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
                        { value: "reprovado",       label: "Reprovado",    color: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" },
                        { value: "futuros",         label: "Futuros",      color: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100" },
                      ] as const).map((s) => (
                        <button
                          key={s.value}
                          onClick={() => {
                            if (lead.status !== s.value) {
                              handleUpdateField("status", s.value);
                            }
                          }}
                          className={`relative h-10 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all ${
                            lead.status === s.value
                              ? "ring-2 ring-offset-1 ring-primary shadow-sm scale-[1.03] " + s.color
                              : s.color + " opacity-70"
                          }`}
                        >
                          {lead.status === s.value && (
                            <CheckCircle2 className="absolute top-1 right-1 h-3 w-3 text-primary opacity-80" />
                          )}
                          {s.label}
                        </button>
                      ))
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 font-medium">
                    Coluna atual: <span className="font-bold text-slate-600">
                      {colunas && lead.coluna_kanban_id
                        ? colunas.find(c => c.id === lead.coluna_kanban_id)?.nome
                        : lead.status.replace("_", " ").toUpperCase()}
                    </span>
                  </p>
                </CardContent>
              </Card>

              {/* BLOCO 4: PERFIL FINANCEIRO */}
              <Card className="border-none shadow-sm bg-white overflow-hidden">
                <CardHeader className="p-4 pb-2 bg-slate-50/50">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Bloco 4: Perfil Financeiro</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Renda Bruta Familiar</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <Input 
                          type="number" 
                          defaultValue={lead.renda_familiar || ""} 
                          placeholder="0.00" 
                          className="h-9 pl-8 text-sm border-slate-200" 
                          onBlur={(e) => handleUpdateField("renda_familiar", parseFloat(e.target.value))} 
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Saldo de FGTS</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <Input 
                          type="number" 
                          defaultValue={lead.saldo_fgts || ""} 
                          placeholder="0.00" 
                          className="h-9 pl-8 text-sm border-slate-200" 
                          onBlur={(e) => handleUpdateField("saldo_fgts", parseFloat(e.target.value))} 
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Valor de Entrada</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <Input 
                          type="number" 
                          defaultValue={lead.valor_entrada || ""} 
                          placeholder="0.00" 
                          className="h-9 pl-8 text-sm border-slate-200" 
                          onBlur={(e) => handleUpdateField("valor_entrada", parseFloat(e.target.value))} 
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* BLOCO 5: ARQUIVOS E HISTÓRICO */}
              <Card className="border-none shadow-sm bg-white overflow-hidden">
                <CardHeader className="p-4 pb-2 bg-slate-50/50">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Bloco 5: Arquivos e Histórico</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-4 space-y-6">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Link do Drive (Documentos)</Label>
                    <div className="flex gap-2">
                      <Input 
                        defaultValue={lead.link_drive || ""} 
                        placeholder="https://drive.google.com/..." 
                        className="h-9 text-sm border-slate-200 flex-1" 
                        onBlur={(e) => handleUpdateField("link_drive", e.target.value)} 
                      />
                      {lead.link_drive && (
                        <Button size="sm" variant="outline" className="h-9 px-3 border-slate-200" asChild>
                          <a href={lead.link_drive} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Histórico de Interações</Label>
                    <div className="relative pl-6 space-y-4 before:absolute before:left-[7px] before:top-2 before:h-[calc(100%-12px)] before:w-[1px] before:bg-slate-200">
                      {lead.interacoes?.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((interacao: any) => {
                        const editavel = podeEditarInteracao(interacao);
                        const editando = editingInteracaoId === interacao.id;
                        return (
                        <div key={interacao.id} className="relative group">
                          <div className={`absolute -left-[24px] top-0 h-4 w-4 rounded-full border-2 border-slate-50 flex items-center justify-center ${
                            interacao.tipo === 'status' ? 'bg-blue-500' : 'bg-green-500'
                          }`}>
                            {interacao.tipo === 'status' ? <RefreshCw className="h-2 w-2 text-white" /> : <MessageSquare className="h-2 w-2 text-white" />}
                          </div>
                          <div className="bg-white rounded-lg border border-slate-100 p-2.5 shadow-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">
                                {interacao.tipo}
                                {(role === "dono" || role === "gerente") && interacao.autor?.nome && (
                                  <span className="text-primary normal-case"> · {interacao.autor.nome}</span>
                                )}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] text-slate-400 font-medium">
                                  {format(new Date(interacao.created_at), "dd/MM HH:mm", { locale: ptBR })}
                                </span>
                                {editavel && !editando && (
                                  <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-0.5">
                                    <button
                                      className="text-slate-300 hover:text-primary p-0.5"
                                      onClick={() => { setEditingInteracaoId(interacao.id); setEditingInteracaoTexto(interacao.conteudo); }}
                                    >
                                      <Edit3 className="h-3 w-3" />
                                    </button>
                                    <button
                                      className="text-slate-300 hover:text-red-500 p-0.5"
                                      onClick={() => { if (confirm("Remover este registro do histórico?")) deleteInteractionMutation.mutate(interacao.id); }}
                                    >
                                      <XCircle className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                            {editando ? (
                              <div className="space-y-1.5">
                                <Textarea
                                  value={editingInteracaoTexto}
                                  onChange={(e) => setEditingInteracaoTexto(e.target.value)}
                                  className="text-xs min-h-[60px] border-slate-200"
                                />
                                <div className="flex justify-end gap-1.5">
                                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setEditingInteracaoId(null)}>Cancelar</Button>
                                  <Button
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => {
                                      editInteractionMutation.mutate({ id: interacao.id, conteudo: editingInteracaoTexto });
                                      setEditingInteracaoId(null);
                                    }}
                                  >
                                    Salvar
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-600 leading-relaxed">{interacao.conteudo}</p>
                            )}
                          </div>
                        </div>
                        );
                      })}
                      {(!lead.interacoes || lead.interacoes.length === 0) && (
                        <div className="text-center py-10 opacity-30">
                          <History className="h-10 w-10 mx-auto mb-2" />
                          <p className="text-xs font-medium">Sem registros</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              </>
              )}

              {activeTab === "chat" && (
                <div className="mt-4">
                  <WhatsAppChat
                    leadId={lead.id}
                    imobiliariaId={lead.imobiliaria_id}
                    phoneNumber={lead.telefone}
                    leadName={lead.nome}
                  />
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {activeTab !== "chat" && (
          <div className="p-3 bg-white border-t flex items-center gap-2">
            <Input 
              placeholder="Registrar mensagem rápida..." 
              className="flex-1 h-9 text-xs border-slate-200"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addInteractionMutation.mutate({ tipo: 'nota', conteudo: e.currentTarget.value });
                  e.currentTarget.value = '';
                }
              }}
            />
            <Button 
              size="sm" 
              className="h-9 px-4 text-[11px] font-bold uppercase tracking-wider"
              onClick={() => {
                const input = document.querySelector('input[placeholder="Registrar mensagem rápida..."]') as HTMLInputElement;
                if (input.value) {
                  addInteractionMutation.mutate({ tipo: 'nota', conteudo: input.value });
                  input.value = '';
                }
              }}
            >
              Registrar
            </Button>
          </div>
        )}

        {/* MODAL DE DESCARTE */}
        <Dialog open={showDescarteModal} onOpenChange={setShowDescarteModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">Devolver Lead ao Bolsão</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">Motivo do Descarte</Label>
                <Select value={motivoDescarte} onValueChange={setMotivoDescarte}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um motivo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Sem Resposta">Sem Resposta</SelectItem>
                    <SelectItem value="Parou de Responder">Parou de Responder</SelectItem>
                    <SelectItem value="Sem Interesse">Sem Interesse</SelectItem>
                    <SelectItem value="Aprovado/Desistiu">Aprovado/Desistiu</SelectItem>
                    <SelectItem value="Descadastrar" className="text-red-600 font-bold">Descadastrar (Requer Aprovação)</SelectItem>
                    <SelectItem value="Já Comprou (Outra Empresa)" className="text-red-600 font-bold">Já Comprou - Outra Empresa (Requer Aprovação)</SelectItem>
                    <SelectItem value="Contato Errado" className="text-red-600 font-bold">Contato Errado (Requer Aprovação)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">Observações (opcional)</Label>
                <Textarea 
                  placeholder="Detalhes adicionais sobre a devolução..." 
                  value={obsDescarte}
                  onChange={(e) => setObsDescarte(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => setShowDescarteModal(false)}>Cancelar</Button>
                <Button 
                  className="flex-1 bg-orange-600 hover:bg-orange-700" 
                  onClick={handleDescarte} 
                  disabled={!motivoDescarte || ((motivoDescarte === "Descadastrar" || motivoDescarte === "Já Comprou (Outra Empresa)" || motivoDescarte === "Contato Errado") && !obsDescarte.trim())}
                >
                  Confirmar Devolução
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* MODAL DE FECHAMENTO — a venda vai pra aprovação do dono/gerente,
            não fecha na hora (especificação do dono, 05/08). */}
        <Dialog open={showFechamentoModal} onOpenChange={setShowFechamentoModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" /> Enviar Venda para Aprovação
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">Valor da Venda</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="0,00"
                    className="pl-9"
                    value={valorFechamento}
                    onChange={(e) => setValorFechamento(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase">Empreendimento</Label>
                  <Input
                    placeholder="Nome do empreendimento"
                    value={empreendimentoFechamento}
                    onChange={(e) => setEmpreendimentoFechamento(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase">Unidade</Label>
                  <Input
                    placeholder="Ex: 302"
                    value={unidadeFechamento}
                    onChange={(e) => setUnidadeFechamento(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">Torre</Label>
                <Input
                  placeholder="Ex: Torre A"
                  value={torreFechamento}
                  onChange={(e) => setTorreFechamento(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">Anotações do Fechamento</Label>
                <Textarea
                  placeholder="Relate como foi a negociação..."
                  value={obsFechamento}
                  onChange={(e) => setObsFechamento(e.target.value)}
                />
              </div>
              <p className="text-[10px] text-slate-400 font-medium">
                A venda só é confirmada depois que o dono/gerente aprovar.
              </p>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => setShowFechamentoModal(false)}>Voltar</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700 font-bold" onClick={handleFechamento} disabled={!valorFechamento}>ENVIAR PARA APROVAÇÃO</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Pedido do dono (09/08): pede a data do proximo contato DEPOIS de
            escolher a coluna nova, no mesmo fluxo -- nao bloqueia mais com
            toast.error exigindo preencher antes. */}
        <Dialog open={!!pendingColunaChange} onOpenChange={(open) => { if (!open) setPendingColunaChange(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold">
                Mover para "{pendingColunaChange?.nomeColuna}"
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5 py-2">
              <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                Próximo contato (obrigatório nesse status)
              </Label>
              <Input
                type="datetime-local"
                step={1800}
                value={proximoContatoTemp}
                onChange={(e) => setProximoContatoTemp(e.target.value)}
                className="h-9 text-sm border-slate-200"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                size="sm"
                className="text-xs font-bold uppercase px-6"
                disabled={!proximoContatoTemp}
                onClick={() => confirmarMudancaColuna(true)}
              >
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>

  );
}
