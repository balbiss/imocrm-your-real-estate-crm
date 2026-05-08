import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Phone, 
  Mail, 
  MessageSquare, 
  Calendar, 
  Clock, 
  MapPin, 
  History, 
  Send,
  User,
  ArrowLeft
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/leads/$id")({
  component: LeadDetailsPage,
});

function LeadDetailsPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(`
          *,
          corretor:perfis(nome, avatar_url, telefone),
          imovel:imoveis(*),
          interacoes:leads_interacoes(
            *,
            autor:perfis(nome, avatar_url)
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const addInteraction = useMutation({
    mutationFn: async (tipo: string) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuário não autenticado");

      const { error } = await supabase.from("leads_interacoes").insert({
        lead_id: id,
        autor_id: userData.user.id,
        tipo,
        conteudo: note || `Interação do tipo ${tipo} registrada.`,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      setNote("");
      toast.success("Interação registrada!");
    },
  });

  if (isLoading) return <MainLayout>Carregando...</MainLayout>;
  if (!lead) return <MainLayout>Lead não encontrado.</MainLayout>;

  return (
    <MainLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-4">
          <Link to="/leads">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{lead.nome}</h1>
              <Badge>{lead.status}</Badge>
            </div>
            <p className="text-muted-foreground text-sm">Lead criado em {format(new Date(lead.created_at), "PPP", { locale: ptBR })}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Esquerda: Informações e Ações */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Informações de Contato</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-full">
                    <Phone className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground uppercase font-semibold">Telefone</span>
                    <span className="text-sm font-medium">{lead.telefone}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-full">
                    <Mail className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground uppercase font-semibold">E-mail</span>
                    <span className="text-sm font-medium">{lead.email || "Não informado"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-full">
                    <History className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground uppercase font-semibold">Origem</span>
                    <span className="text-sm font-medium">{lead.origem || "Site"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Atendimento</CardTitle>
                <CardDescription>Ações rápidas para contato</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button className="flex-1 bg-green-600 hover:bg-green-700">
                  <MessageSquare className="mr-2 h-4 w-4" /> WhatsApp
                </Button>
                <Button className="flex-1" variant="outline">
                  <Phone className="mr-2 h-4 w-4" /> Ligar
                </Button>
                <Button className="w-full" variant="secondary">
                  <Mail className="mr-2 h-4 w-4" /> Enviar E-mail
                </Button>
              </CardContent>
            </Card>

            {lead.imovel && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Imóvel de Interesse</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="aspect-video bg-muted rounded-md overflow-hidden relative">
                    {lead.imovel.fotos?.[0] ? (
                      <img src={lead.imovel.fotos[0]} alt={lead.imovel.titulo} className="object-cover w-full h-full" />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">Sem foto</div>
                    )}
                  </div>
                  <h4 className="font-bold">{lead.imovel.titulo}</h4>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {lead.imovel.cidade}, {lead.imovel.estado}
                  </p>
                  <p className="text-primary font-bold">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.imovel.preco || 0)}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Coluna Direita: Timeline e Notas */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Registrar Atendimento</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Textarea 
                  placeholder="Escreva uma nota ou resumo do atendimento..." 
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="min-h-[100px]"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => addInteraction.mutate("ligacao")}>
                    Registrar Ligação
                  </Button>
                  <Button onClick={() => addInteraction.mutate("nota")}>
                    Salvar Nota
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="timeline" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="timeline">Linha do Tempo</TabsTrigger>
                <TabsTrigger value="dados">Dados Completos</TabsTrigger>
              </TabsList>
              <TabsContent value="timeline" className="mt-4">
                <div className="space-y-6 relative before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-muted">
                  {lead.interacoes?.length > 0 ? (
                    lead.interacoes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((interacao) => (
                      <div key={interacao.id} className="relative pl-12">
                        <div className="absolute left-0 top-0 p-2 bg-background border rounded-full z-10">
                          {interacao.tipo === "whatsapp" && <MessageSquare className="h-4 w-4 text-green-500" />}
                          {interacao.tipo === "ligacao" && <Phone className="h-4 w-4 text-blue-500" />}
                          {interacao.tipo === "nota" && <Send className="h-4 w-4 text-orange-500" />}
                          {interacao.tipo === "email" && <Mail className="h-4 w-4 text-purple-500" />}
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">{interacao.autor?.nome}</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {format(new Date(interacao.created_at), "dd/MM 'às' HH:mm")}
                            </span>
                          </div>
                          <div className="bg-muted/30 p-3 rounded-lg text-sm">
                            {interacao.conteudo}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      Nenhuma interação registrada ainda.
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="dados">
                {/* Aqui poderiam ir campos extras de perfil do lead */}
                <div className="p-4 text-muted-foreground">Campos personalizados do lead serão exibidos aqui.</div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
