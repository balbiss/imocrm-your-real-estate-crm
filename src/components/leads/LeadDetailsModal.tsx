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

  // Buscar dados do lead
  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: async () => {
      if (!leadId) return null;
      // Simplificando query para diagnóstico
      const { data, error } = await supabase
        .from("leads")
        .select("*")
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

  useEffect(() => {
    if (lead) {
      setEditNome(lead.nome);
      setEditTelefone(lead.telefone);
    }
  }, [lead]);

  // Mutação para atualizar lead
  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
      const { error } = await supabase
        .from("leads")
        .update(updates)
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

      const { error } = await supabase.from("leads_interacoes").insert({
        lead_id: leadId!,
        autor_id: user.id,
        tipo,
        conteudo,
      });
      if (error) throw error;
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
        status: 'novo' // Volta para o bolsão como novo
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
        etapa: 'fechado',
        valor_venda: valorNum,
        data_fechamento: new Date().toISOString(),
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
        lembrete_follow_up: followUpDate
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
          <div className="flex items-center justify-between mb-3">
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
            <div className="p-4">
              <Tabs value={activeTab} className="w-full">
                {/* ABA DETALHES */}
                <TabsContent value="detalhes" className="mt-0 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-none shadow-sm bg-white overflow-hidden">
                      <CardHeader className="p-4 pb-2 bg-slate-50/50">
                        <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Informações de Contato</CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-4 space-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Telefone / WhatsApp</Label>
                          <div className="flex gap-2">
                            <Input 
                              value={editTelefone} 
                              onChange={(e) => setEditTelefone(e.target.value)}
                              className="h-9 text-sm border-slate-200"
                            />
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-9 px-3 text-[10px] font-bold uppercase border-slate-200"
                              onClick={() => handleUpdateField("telefone", editTelefone)}
                            >Alt</Button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">E-mail Corporativo</Label>
                          <Input value={lead.email || ""} placeholder="Adicionar e-mail..." className="h-9 text-sm border-slate-200" onBlur={(e) => handleUpdateField("email", e.target.value)} />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-none shadow-sm bg-white">
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Ações e Temperatura</CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0 space-y-4">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase">Temperatura</Label>
                          <div className="flex gap-2">
                            <Button 
                              variant={lead.temperatura === 'quente' ? 'default' : 'outline'} 
                              size="sm" 
                              className={`flex-1 h-8 text-[10px] font-bold gap-1.5 ${lead.temperatura === 'quente' ? 'bg-red-500 hover:bg-red-600' : ''}`}
                              onClick={() => handleUpdateField("temperatura", "quente")}
                            >
                              <Flame className="h-3 w-3" /> QUENTE
                            </Button>
                            <Button 
                              variant={lead.temperatura === 'morno' ? 'default' : 'outline'} 
                              size="sm" 
                              className={`flex-1 h-8 text-[10px] font-bold gap-1.5 ${lead.temperatura === 'morno' ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
                              onClick={() => handleUpdateField("temperatura", "morno")}
                            >
                              <Sun className="h-3 w-3" /> MORNO
                            </Button>
                            <Button 
                              variant={lead.temperatura === 'frio' ? 'default' : 'outline'} 
                              size="sm" 
                              className={`flex-1 h-8 text-[10px] font-bold gap-1.5 ${lead.temperatura === 'frio' ? 'bg-blue-500 hover:bg-blue-600' : ''}`}
                              onClick={() => handleUpdateField("temperatura", "frio")}
                            >
                              <Snowflake className="h-3 w-3" /> FRIO
                            </Button>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <Button 
                            variant="outline" 
                            className="flex-1 h-9 text-[10px] font-bold text-orange-600 border-orange-200 hover:bg-orange-50 gap-2"
                            onClick={() => setShowDescarteModal(true)}
                          >
                            <XCircle className="h-3.5 w-3.5" /> DEVOLVER LEAD
                          </Button>
                          <Button 
                            className="flex-1 h-9 text-[10px] font-bold bg-green-600 hover:bg-green-700 gap-2"
                            onClick={() => setShowFechamentoModal(true)}
                          >
                            <Trophy className="h-3.5 w-3.5" /> FECHAR NEGÃ“CIO
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* ABA FOLLOW-UP */}
                <TabsContent value="followup" className="mt-0 space-y-4">
                  <div className="bg-white rounded-lg border-none shadow-sm p-4 space-y-3">
                    <div className="flex items-center gap-2 text-primary">
                      <Calendar className="h-4 w-4" />
                      <h4 className="text-sm font-bold">Próximo Contato Agendado</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input 
                          type="datetime-local" 
                          value={followUpDate}
                          onChange={(e) => setFollowUpDate(e.target.value)}
                          className="h-9 text-sm flex-1 border-slate-200"
                        />
                        <Button 
                          onClick={handleAgendarFollowUp}
                          disabled={!followUpDate}
                          className="h-9 text-[11px] font-bold bg-primary text-white"
                        >
                          Agendar Agora
                        </Button>
                      </div>
                      <Textarea 
                        placeholder="O que será feito nesse contato?"
                        value={followUpObs}
                        onChange={(e) => setFollowUpObs(e.target.value)}
                        className="text-xs min-h-[60px]"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium italic">
                      O sistema emitirá um alerta visual quando chegar o horário definido.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Tentativas", value: lead.tentativas_contato || 0, color: "text-slate-700" },
                      { label: "Primeiro Contato", value: lead.primeiro_contato_em ? format(new Date(lead.primeiro_contato_em), "HH:mm") : "---", color: "text-slate-700" },
                      { label: "SLA (Atendimento)", value: "08:45", color: "text-emerald-600" },
                    ].map(stat => (
                      <div key={stat.label} className="p-3 bg-white rounded-lg shadow-sm text-center">
                        <p className={`text-base font-bold ${stat.color}`}>{stat.value}</p>
                        <p className="text-[9px] text-slate-400 uppercase font-bold tracking-tighter">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* ABA TEMPLATES */}
                <TabsContent value="templates" className="mt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      { id: 1, title: "Apresentação", body: "Olá [nome], sou corretor da Oka Imóveis..." },
                      { id: 2, title: "Opções de Imóveis", body: "Olá, separei estas opções que encaixam no seu perfil..." },
                      { id: 3, title: "Follow-up", body: "Ainda tem interesse no imóvel que vimos?" },
                    ].map(template => (
                      <Card key={template.id} className="p-3 hover:border-primary/50 cursor-pointer transition-all bg-white border-slate-200 group">
                        <h5 className="font-bold text-xs mb-1.5 group-hover:text-primary">{template.title}</h5>
                        <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-2 mb-3">{template.body}</p>
                        <Button variant="ghost" className="w-full text-[10px] h-7 font-bold uppercase tracking-wider bg-slate-50">Usar Template</Button>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                {/* ABA HISTÃ“RICO */}
                <TabsContent value="historico" className="mt-0">
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
                </TabsContent>

                {/* ABA ANOTAÇÕES */}
                <TabsContent value="anotacoes" className="mt-0 space-y-3">
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 text-amber-800 text-[11px] font-medium flex gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                    <p>Anotações estratégicas e observações internas sobre a negociação.</p>
                  </div>
                  <Textarea 
                    className="min-h-[250px] bg-white text-sm p-3 focus-visible:ring-amber-200 border-amber-100 shadow-sm" 
                    placeholder="Escreva suas observações aqui..."
                  />
                  <div className="flex justify-end">
                    <Button size="sm" className="h-8 text-[11px] font-bold bg-amber-600 hover:bg-amber-700">Salvar Notas</Button>
                  </div>
                </TabsContent>
              </Tabs>
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
