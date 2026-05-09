import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
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
} from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LeadDetailsModalProps {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadDetailsModal({ leadId, open, onOpenChange }: LeadDetailsModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("detalhes");
  const [isEditing, setIsEditing] = useState(false);
  const [showDescarteModal, setShowDescarteModal] = useState(false);
  const [showFechamentoModal, setShowFechamentoModal] = useState(false);
  const [motivoDescarte, setMotivoDescarte] = useState("");
  const [obsDescarte, setObsDescarte] = useState("");
  const [valorFechamento, setValorFechamento] = useState("");
  const [obsFechamento, setObsFechamento] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpObs, setFollowUpObs] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [editNome, setEditNome] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [slaTimeLeft, setSlaTimeLeft] = useState<number | null>(null);

  // Buscar dados do lead
  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: async () => {
      if (!leadId) return null;
      const { data, error } = await supabase
        .from("leads")
        .select("*, interacoes:leads_interacoes(*)")
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
    }
  }, [lead]);

  // Mutação para atualizar lead
  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
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

      // 2. Atualizar lead
      await supabase.from("leads").update({
        corretor_id: null,
        motivo_descarte: motivoDescarte,
        descartado_por: user.id,
        descartado_em: new Date().toISOString(),
        status: 'novo',
        ultima_acao_at: new Date().toISOString()
      }).eq("id", leadId);

      // 3. Registrar no histórico
      await supabase.from("leads_interacoes").insert({
        lead_id: leadId!,
        autor_id: user.id,
        tipo: 'descarte',
        conteudo: `Lead devolvido: ${motivoDescarte}${obsDescarte ? ' - ' + obsDescarte : ''}`,
      });

      toast.success("Lead devolvido ao bolsão");
      setShowDescarteModal(false);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    } catch (error) {
      toast.error("Erro ao descartar lead");
    }
  };

  const handleFechamento = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const valorNum = parseFloat(valorFechamento.replace(/[^\d,]/g, '').replace(',', '.'));

      await supabase.from("leads").update({
        status: 'venda_concluida',
        valor_venda: valorNum,
        data_fechamento: new Date().toISOString(),
        ultima_acao_at: new Date().toISOString()
      }).eq("id", leadId);

      await supabase.from("leads_interacoes").insert({
        lead_id: leadId!,
        autor_id: user.id,
        tipo: 'fechamento',
        conteudo: `Negócio fechado! Valor: R$ ${valorFechamento}${obsFechamento ? ' - ' + obsFechamento : ''}`,
      });

      toast.success("Parabéns! Negócio fechado com sucesso!");
      setShowFechamentoModal(false);
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    } catch (error) {
      toast.error("Erro ao registrar fechamento");
    }
  };

  const handleAgendarFollowUp = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("lembretes_followup").insert({
        lead_id: leadId!,
        corretor_id: user.id,
        datetime: followUpDate,
        observacao: followUpObs,
      });

      await supabase.from("leads").update({
        lembrete_follow_up: followUpDate,
        ultima_acao_at: new Date().toISOString()
      }).eq("id", leadId);

      toast.success("Lembrete agendado!");
      setFollowUpDate("");
      setFollowUpObs("");
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
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
    updateMutation.mutate({ [field]: value });
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
                  <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditing(true)}>
                    <h2 className="text-lg font-bold leading-none truncate group-hover:text-primary transition-colors">{lead.nome}</h2>
                    <Edit3 className="h-3 w-3 text-slate-300 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all" />
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-bold uppercase bg-slate-100 text-slate-500 border-none">
                    {lead.status.replace("_", " ")}
                  </Badge>
                  <span className="text-[10px] font-medium text-slate-400">
                    Desde {format(new Date(lead.created_at), "dd/MM/yy")}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mr-6">
              <Button 
                size="sm" 
                variant="outline" 
                className="h-8 text-[11px] font-bold bg-green-50 text-green-700 border-green-100 hover:bg-green-100"
                asChild
                onClick={() => handleUpdateField("ultima_acao_at", new Date().toISOString())}
              >
                <a href={`https://wa.me/55${lead.telefone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                  <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> WhatsApp
                </a>
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="h-8 text-[11px] font-bold bg-blue-50 text-blue-700 border-blue-100"
                asChild
                onClick={() => handleUpdateField("ultima_acao_at", new Date().toISOString())}
              >
                <a href={`tel:+55${lead.telefone.replace(/\D/g, "")}`}>
                  <Phone className="h-3.5 w-3.5 mr-1.5" /> Ligar
                </a>
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                className="h-8 text-[11px] font-bold bg-slate-50 text-slate-700 border-slate-200"
                asChild
              >
                <a href={`mailto:${lead.email}`}>
                  <Mail className="h-3.5 w-3.5 mr-1.5" /> E-mail
                </a>
              </Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-transparent border-b rounded-none h-9 p-0 gap-5">
              {[
                { id: "detalhes", icon: User, label: "Detalhes" },
                { id: "followup", icon: Calendar, label: "Follow-up" },
                { id: "templates", icon: FileText, label: "Templates" },
                { id: "historico", icon: History, label: "Histórico" },
                { id: "anotacoes", icon: AlertCircle, label: "Anotações" },
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
              {/* BLOCO 1: INFORMAÇÕES DO CONTATO */}
              <Card className="border-none shadow-sm bg-white overflow-hidden">
                <CardHeader className="p-4 pb-2 bg-slate-50/50">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Bloco 1: Informações de Contato</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Referência (ID Anúncio)</Label>
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
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">E-mail</Label>
                      <Input value={lead.email || ""} placeholder="Adicionar e-mail..." className="h-9 text-sm border-slate-200" onBlur={(e) => handleUpdateField("email", e.target.value)} />
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
                      <Button className="h-10 text-[10px] font-bold bg-green-600 hover:bg-green-700 gap-2" onClick={() => setShowFechamentoModal(true)}>
                        <Trophy className="h-4 w-4" /> VENDA
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* BLOCO 3: FOLLOW-UP E VISITA */}
              <Card className="border-none shadow-sm bg-white overflow-hidden">
                <CardHeader className="p-4 pb-2 bg-slate-50/50">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Bloco 3: Follow-up e Visita</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-4 space-y-6">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Próximo Contato</Label>
                      <div className="flex gap-2">
                        <Input type="datetime-local" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="h-10 text-sm border-slate-200" />
                        <Button onClick={handleAgendarFollowUp} disabled={!followUpDate} className="h-10 text-[11px] font-bold bg-primary px-4">
                          <Clock className="h-4 w-4 mr-2" /> Agendar
                        </Button>
                      </div>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Agendar Visita (ALERTA)</Label>
                      <Input 
                        type="datetime-local" 
                        value={lead.data_visita ? format(new Date(lead.data_visita), "yyyy-MM-dd'T'HH:mm") : ""} 
                        onChange={(e) => handleUpdateField("data_visita", e.target.value)}
                        className="h-10 text-sm border-primary/20 bg-primary/5 font-bold" 
                      />
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
                          {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
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
                          value={lead.renda_familiar || ""} 
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
                          value={lead.saldo_fgts || ""} 
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
                          value={lead.valor_entrada || ""} 
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
                        value={lead.link_drive || ""} 
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
                      {lead.interacoes?.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((interacao: any) => (
                        <div key={interacao.id} className="relative">
                          <div className={`absolute -left-[24px] top-0 h-4 w-4 rounded-full border-2 border-slate-50 flex items-center justify-center ${
                            interacao.tipo === 'status' ? 'bg-blue-500' : 'bg-green-500'
                          }`}>
                            {interacao.tipo === 'status' ? <RefreshCw className="h-2 w-2 text-white" /> : <MessageSquare className="h-2 w-2 text-white" />}
                          </div>
                          <div className="bg-white rounded-lg border border-slate-100 p-2.5 shadow-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">{interacao.tipo}</span>
                              <span className="text-[9px] text-slate-400 font-medium">
                                {format(new Date(interacao.created_at), "dd/MM HH:mm", { locale: ptBR })}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed">{interacao.conteudo}</p>
                          </div>
                        </div>
                      ))}
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
            </div>
          </ScrollArea>
        </div>

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
                    <SelectItem value="Sem interesse">Sem interesse</SelectItem>
                    <SelectItem value="Número inválido">Número inválido / não existe</SelectItem>
                    <SelectItem value="Já comprou com outro">Já comprou com outro corretor</SelectItem>
                    <SelectItem value="Fora do perfil">Fora do perfil de compra</SelectItem>
                    <SelectItem value="Não atende">Não atende / sem contato</SelectItem>
                    <SelectItem value="Duplicado">Lead duplicado</SelectItem>
                    <SelectItem value="Outro">Outro (especificar)</SelectItem>
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
                <Button className="flex-1 bg-orange-600 hover:bg-orange-700" onClick={handleDescarte} disabled={!motivoDescarte}>Confirmar Devolução</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* MODAL DE FECHAMENTO */}
        <Dialog open={showFechamentoModal} onOpenChange={setShowFechamentoModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" /> Fechar Negócio!
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
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">Anotações do Fechamento</Label>
                <Textarea 
                  placeholder="Relate como foi a negociação..." 
                  value={obsFechamento}
                  onChange={(e) => setObsFechamento(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => setShowFechamentoModal(false)}>Voltar</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700 font-bold" onClick={handleFechamento} disabled={!valorFechamento}>CONFIRMAR VENDA</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>

  );
}
