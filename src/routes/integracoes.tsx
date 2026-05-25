import React, { useEffect, useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
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
  ShieldCheck,
  RefreshCw,
  TrendingUp,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { WhatsAppIntegrationCard } from "@/components/integrations/WhatsAppIntegrationCard";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

export const Route = createFileRoute("/integracoes")({
  head: () => ({ meta: [{ title: "Integrações — CRM" }] }),
  component: IntegrationsPage,
});

// ----- Tipos -----
type IntegrationStatus = "connected" | "pending" | "disconnected";

interface IntegrationConfig {
  id?: string;
  integration_id: string;
  status: IntegrationStatus;
  ultimo_lead_em?: string | null;
  total_leads?: number;
  config?: Record<string, unknown>;
}

interface IntegrationDef {
  id: string;
  name: string;
  description: string;
  icon: React.ReactElement;
  category: string;
  defaultStatus: IntegrationStatus;
  docUrl?: string;
}

// ----- Definições estáticas das integrações -----
const INTEGRATION_DEFS: IntegrationDef[] = [
  {
    id: "whatsapp",
    name: "WhatsApp API",
    description: "Envio automático de mensagens e integração com chatbot.",
    icon: <MessageCircle className="text-emerald-500" />,
    category: "Comunicação",
    defaultStatus: "connected",
    docUrl: "#",
  },
  {
    id: "meta",
    name: "Meta Ads (Facebook/Insta)",
    description: "Captação direta de leads via formulários nativos do Meta.",
    icon: <Facebook className="text-blue-600" />,
    category: "Marketing",
    defaultStatus: "disconnected",
    docUrl: "https://developers.facebook.com/docs/marketing-api/guides/lead-ads/",
  },
  {
    id: "webhooks",
    name: "Webhooks Customizados",
    description: "Receba leads de qualquer site ou sistema via endpoint POST.",
    icon: <Webhook className="text-indigo-500" />,
    category: "Técnico",
    defaultStatus: "connected",
    docUrl: "#",
  },
  {
    id: "google",
    name: "Google Ads",
    description: "Integração de conversões offline e captação de leads.",
    icon: <Globe className="text-red-500" />,
    category: "Marketing",
    defaultStatus: "disconnected",
    docUrl: "#",
  },
];

// ----- Helpers -----
function statusLabel(status: IntegrationStatus) {
  if (status === "connected") return "Ativo";
  if (status === "pending") return "Configurar";
  return "Inativo";
}

function StatusBadge({ status }: { status: IntegrationStatus }) {
  if (status === "connected")
    return (
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        <span className="text-[10px] font-bold text-emerald-600 uppercase">Ativo</span>
      </div>
    );
  if (status === "pending")
    return (
      <div className="flex items-center gap-1.5">
        <Zap className="h-3 w-3 text-amber-500" />
        <span className="text-[10px] font-bold text-amber-600 uppercase">Configurar</span>
      </div>
    );
  return (
    <div className="flex items-center gap-1.5">
      <AlertCircle className="h-3 w-3 text-slate-300" />
      <span className="text-[10px] font-bold text-slate-400 uppercase">Inativo</span>
    </div>
  );
}

// ----- Componente Principal -----
function IntegrationsPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const [configs, setConfigs] = useState<Record<string, IntegrationConfig>>({});
  const [imobiliariaId, setImobiliariaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [userName, setUserName] = useState("Corretor");

  // Carregar imobiliaria_id do usuário logado
  const loadImobiliariaId = useCallback(async () => {
    if (!user) return null;
    const { data: perfil } = await supabase
      .from("perfis")
      .select("imobiliaria_id, nome")
      .eq("id", user.id)
      .single();
    
    if (perfil) {
      setUserName(perfil.nome);
    }
    return perfil?.imobiliaria_id ?? null;
  }, [user]);

  // Carregar configurações do banco
  const loadConfigs = useCallback(async (imobId: string) => {
    const { data, error } = await supabase
      .from("integracoes_config")
      .select("*")
      .eq("imobiliaria_id", imobId);

    if (error) {
      console.error("Erro ao carregar integrações:", error);
      return;
    }

    const map: Record<string, IntegrationConfig> = {};
    for (const row of data ?? []) {
      map[row.integration_id] = row as IntegrationConfig;
    }
    setConfigs(map);
  }, [user]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const imobId = await loadImobiliariaId();
      setImobiliariaId(imobId);
      if (imobId) await loadConfigs(imobId);
      setLoading(false);
    })();
  }, [loadImobiliariaId, loadConfigs]);

  // Alternar status da integração genérica
  const toggleIntegration = async (def: IntegrationDef) => {
    if (!imobiliariaId) return;

    setSaving(def.id);

    const current = configs[def.id];
    const nextStatus: IntegrationStatus =
      current?.status === "connected" ? "disconnected" : "connected";

    const { error } = await supabase
      .from("integracoes_config")
      .upsert(
        {
          imobiliaria_id: imobiliariaId,
          integration_id: def.id,
          status: nextStatus,
          ...(current?.id ? { id: current.id } : {}),
        },
        { onConflict: "imobiliaria_id,integration_id" }
      );

    if (error) {
      toast.error("Erro ao atualizar integração.");
    } else {
      toast.success(
        nextStatus === "connected"
          ? `${def.name} ativada com sucesso!`
          : `${def.name} desativada.`
      );
      await loadConfigs(imobiliariaId);
    }
    setSaving(null);
  };

  // Mesclar definições estáticas com dados do banco
  const integrations = INTEGRATION_DEFS.filter(d => d.id !== "whatsapp").map((def) => {
    const dbConfig = configs[def.id];
    return {
      ...def,
      status: (dbConfig?.status ?? def.defaultStatus) as IntegrationStatus,
      ultimo_lead_em: dbConfig?.ultimo_lead_em ?? null,
      total_leads: dbConfig?.total_leads ?? 0,
    };
  });

  // Simular lead de teste via webhook
  const simularLead = async () => {
    if (!imobiliariaId) return;
    const promise = async () => {
      const { data: nextCorretorId } = await supabase.rpc(
        "get_next_corretor_rodizio",
        { p_imobiliaria_id: imobiliariaId }
      );
      const { error } = await supabase.from("leads").insert([
        {
          nome: "Lead de Teste Webhook",
          email: "teste@webhook.com",
          telefone: "(11) 99999-9999",
          origem: "Webhook Simulador",
          status: "novo",
          temperatura: "morno",
          imobiliaria_id: imobiliariaId,
          corretor_id: nextCorretorId || null,
        },
      ]);
      if (error) throw error;
    };
    toast.promise(promise(), {
      loading: "Processando Webhook...",
      success: "Lead capturado e roteado com sucesso!",
      error: "Falha na integração.",
    });
  };

  return (
    <MainLayout>
      <div className="p-4 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Ecossistema de Integrações
            </h1>
            <p className="text-saas-sm text-muted-foreground">
              Conecte o CRM às suas ferramentas favoritas e automatize fluxos.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 border border-slate-200 bg-white"
              onClick={async () => {
                if (imobiliariaId) {
                  setLoading(true);
                  await loadConfigs(imobiliariaId);
                  setLoading(false);
                  toast.success("Atualizado!");
                }
              }}
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="outline"
              className="h-9 text-[11px] font-bold uppercase tracking-wider px-4 border-slate-200 bg-white"
            >
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-emerald-500" /> Segurança da API
            </Button>
          </div>
        </div>

        {/* Cards de integrações */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {user && <WhatsAppIntegrationCard userId={user.id} userName={userName} />}
          
          {can('configure_system') && integrations.map((item) => (
            <Card
              key={item.id}
              className="border-none shadow-soft bg-white hover:shadow-md transition-all overflow-hidden group"
            >
              <CardContent className="p-5 flex items-start gap-4">
                {/* Ícone */}
                <div
                  className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                    item.status === "connected"
                      ? "bg-emerald-50 group-hover:bg-emerald-100"
                      : "bg-slate-50 group-hover:bg-primary/5"
                  }`}
                >
                  {React.cloneElement(item.icon, { size: 24 })}
                </div>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <Badge
                      variant="outline"
                      className="text-[9px] font-bold uppercase tracking-widest border-none bg-slate-50 text-slate-400 h-5 px-1.5"
                    >
                      {item.category}
                    </Badge>
                    <StatusBadge status={item.status} />
                  </div>

                  <h3 className="text-saas-sm font-bold text-slate-700 mb-1">{item.name}</h3>
                  <p className="text-saas-xs text-slate-400 leading-relaxed mb-3">
                    {item.description}
                  </p>

                  {/* Métricas — aparece só quando conectado */}
                  {item.status === "connected" && (
                    <div className="flex items-center gap-3 mb-3 p-2 rounded-lg bg-slate-50">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                        <span className="text-[10px] font-bold text-slate-600">
                          {item.total_leads} leads capturados
                        </span>
                      </div>
                      {item.ultimo_lead_em && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                          <Clock className="h-3 w-3" />
                          <span>
                            Último:{" "}
                            {formatDistanceToNow(new Date(item.ultimo_lead_em), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ações */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant={item.status === "connected" ? "outline" : "default"}
                      className={`h-8 text-[10px] font-bold uppercase tracking-wider flex-1 ${
                        item.status === "connected"
                          ? "border-slate-200 text-slate-600 hover:border-red-200 hover:text-red-600"
                          : ""
                      }`}
                      disabled={saving === item.id || loading}
                      onClick={() => toggleIntegration(item)}
                    >
                      {saving === item.id ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : item.status === "connected" ? (
                        "Desconectar"
                      ) : (
                        "Conectar agora"
                      )}
                    </Button>
                    {item.docUrl && item.docUrl !== "#" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-300 hover:text-slate-600"
                        onClick={() => window.open(item.docUrl, "_blank")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Banner API */}
        <Card className="border-none shadow-soft bg-gradient-brand-dark text-white overflow-hidden relative">
          <CardContent className="p-6 relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <h2 className="text-lg font-bold mb-1">Precisa de uma integração sob medida?</h2>
              <p className="text-saas-sm opacity-80">
                Nossa API pública permite conectar qualquer sistema ao seu fluxo de leads.
              </p>
            </div>
            <Button className="bg-white text-slate-900 hover:bg-slate-50 font-bold text-[11px] uppercase tracking-wider h-10 px-6">
              Documentação da API <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardContent>
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Webhook size={120} />
          </div>
        </Card>

        {/* Laboratório de testes */}
        <div className="pt-6 border-t border-slate-100">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" /> Laboratório de Testes
            </h2>
            <p className="text-saas-xs text-muted-foreground">
              Simule eventos externos para validar suas automações e regras de distribuição.
            </p>
          </div>

          <Card className="border-none shadow-soft bg-white">
            <CardContent className="p-5 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <Webhook className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-saas-sm font-bold text-slate-700">Simular Lead (Webhook)</p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Dispara um evento de POST para seu endpoint de captura.
                  </p>
                </div>
              </div>
              <Button
                onClick={simularLead}
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
