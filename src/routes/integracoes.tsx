import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Webhook, 
  MessageCircle, 
  Facebook, 
  Globe, 
  Zap, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight,
  ExternalLink,
  ShieldCheck
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/integracoes")({
  head: () => ({ meta: [{ title: "Integrações — CRM" }] }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const integrations = [
    {
      id: "whatsapp",
      name: "WhatsApp API",
      description: "Envio automático de mensagens e integração com chatbot.",
      icon: <MessageCircle className="text-emerald-500" />,
      status: "connected",
      category: "Comunicação"
    },
    {
      id: "meta",
      name: "Meta Ads (Facebook/Insta)",
      description: "Captação direta de leads via formulários nativos do Meta.",
      icon: <Facebook className="text-blue-600" />,
      status: "pending",
      category: "Marketing"
    },
    {
      id: "webhooks",
      name: "Webhooks Customizados",
      description: "Receba leads de qualquer site ou sistema via endpoint POST.",
      icon: <Webhook className="text-indigo-500" />,
      status: "connected",
      category: "Técnico"
    },
    {
      id: "google",
      name: "Google Ads",
      description: "Integração de conversões offline e captação de leads.",
      icon: <Globe className="text-red-500" />,
      status: "disconnected",
      category: "Marketing"
    }
  ];

  return (
    <MainLayout>
      <div className="p-4 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Ecossistema de Integrações</h1>
            <p className="text-saas-sm text-muted-foreground">Conecte o CRM às suas ferramentas favoritas e automatize fluxos.</p>
          </div>
          <Button variant="outline" className="h-9 text-[11px] font-bold uppercase tracking-wider px-4 border-slate-200 bg-white">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-emerald-500" /> Segurança da API
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrations.map((item) => (
            <Card key={item.id} className="border-none shadow-soft bg-white hover:shadow-md transition-all overflow-hidden group">
              <CardContent className="p-5 flex items-start gap-4">
                <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center shrink-0 group-hover:bg-primary/5 transition-colors">
                  {React.cloneElement(item.icon as React.ReactElement, { size: 24 })}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-widest border-none bg-slate-50 text-slate-400 h-5 px-1.5">
                      {item.category}
                    </Badge>
                    <div className="flex items-center gap-1.5">
                      {item.status === "connected" && (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          <span className="text-[10px] font-bold text-emerald-600 uppercase">Ativo</span>
                        </>
                      )}
                      {item.status === "pending" && (
                        <>
                          <Zap className="h-3 w-3 text-amber-500" />
                          <span className="text-[10px] font-bold text-amber-600 uppercase">Configurar</span>
                        </>
                      )}
                      {item.status === "disconnected" && (
                        <>
                          <AlertCircle className="h-3 w-3 text-slate-300" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Inativo</span>
                        </>
                      )}
                    </div>
                  </div>
                  <h3 className="text-saas-sm font-bold text-slate-700 mb-1">{item.name}</h3>
                  <p className="text-saas-xs text-slate-400 leading-relaxed mb-4">{item.description}</p>
                  
                  <div className="flex items-center gap-2">
                    <Button variant={item.status === "connected" ? "outline" : "default"} className={`h-8 text-[10px] font-bold uppercase tracking-wider flex-1 ${
                      item.status === "connected" ? "border-slate-200 text-slate-600" : ""
                    }`}>
                      {item.status === "connected" ? "Gerenciar" : "Conectar agora"}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-slate-600">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-none shadow-soft bg-gradient-brand-dark text-white overflow-hidden relative">
          <CardContent className="p-6 relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <h2 className="text-lg font-bold mb-1">Precisa de uma integração sob medida?</h2>
              <p className="text-saas-sm opacity-80">Nossa API pública permite conectar qualquer sistema ao seu fluxo de leads.</p>
            </div>
            <Button className="bg-white text-slate-900 hover:bg-slate-50 font-bold text-[11px] uppercase tracking-wider h-10 px-6">
               Documentação da API <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardContent>
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Webhook size={120} />
          </div>
        </Card>
        <div className="pt-6 border-t border-slate-100">
           <div className="mb-4">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                 <Zap className="h-4 w-4 text-amber-500" /> Laboratório de Testes
              </h2>
              <p className="text-saas-xs text-muted-foreground">Simule eventos externos para validar suas automações e regras de distribuição.</p>
           </div>
           
           <Card className="border-none shadow-soft bg-white">
              <CardContent className="p-5 flex flex-col md:flex-row items-center justify-between gap-4">
                 <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                       <Webhook className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                       <p className="text-saas-sm font-bold text-slate-700">Simular Lead (Webhook)</p>
                       <p className="text-[10px] text-slate-400 font-medium">Dispara um evento de POST para seu endpoint de captura.</p>
                    </div>
                 </div>
                 <Button 
                   onClick={async () => {
                      const promise = async () => {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) throw new Error("Não autenticado");

                       const { data: perfil } = await supabase
                         .from("perfis")
                         .select("imobiliaria_id")
                         .eq("id", user.id)
                         .single();

                        if (!perfil?.imobiliaria_id) throw new Error("Perfil não encontrado");

                       // Buscar próximo corretor no rodízio
                       const { data: nextCorretorId, error: rpcError } = await supabase.rpc('get_next_corretor_rodizio', {
                         p_imobiliaria_id: perfil.imobiliaria_id
                       });

                       const { error } = await supabase
                         .from("leads")
                         .insert([{
                           nome: "Lead de Teste Webhook",
                           email: "teste@webhook.com",
                           telefone: "(11) 99999-9999",
                           origem: "Webhook Simulador",
                           status: "novo",
                           temperatura: "morno",
                           imobiliaria_id: perfil?.imobiliaria_id,
                           corretor_id: nextCorretorId || null
                         }]);
                       if (error) throw error;
                     };

                     toast.promise(promise(), {
                       loading: 'Processando Webhook...',
                       success: 'Lead capturado e roteado com sucesso!',
                       error: 'Falha na integração.',
                     });
                   }}
                   className="h-9 text-[11px] font-bold uppercase bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-100"
                 >
                    Executar Teste
                 </Button>
              </CardContent>
           </Card>
        </div>
      </div>
    </MainLayout>
  );
}
