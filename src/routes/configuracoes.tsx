import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { User, Bell, Settings as SettingsIcon, Shield, CreditCard, Laptop } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { PasswordInput } from "@/components/PasswordInput";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — CRM" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const { data: profile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ["profile-settings", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("perfis").select("*").eq("id", user.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: imobiliaria, isLoading: isLoadingImobiliaria } = useQuery({
    queryKey: ["imobiliaria-settings", profile?.imobiliaria_id],
    queryFn: async () => {
      if (!profile?.imobiliaria_id) return null;
      const { data, error } = await supabase.from("imobiliarias").select("*").eq("id", profile.imobiliaria_id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.imobiliaria_id,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (newData: any) => {
      const { error } = await supabase.from("perfis").update(newData).eq("id", user?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-settings"] });
      toast.success("Perfil atualizado com sucesso!");
    },
    onError: (err: any) => toast.error("Erro ao atualizar perfil: " + err.message)
  });

  const updateImobiliariaMutation = useMutation({
    mutationFn: async (newData: any) => {
      const { error } = await supabase.from("imobiliarias").update(newData).eq("id", profile?.imobiliaria_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imobiliaria-settings"] });
      toast.success("Dados da imobiliária atualizados!");
    },
    onError: (err: any) => toast.error("Erro ao atualizar imobiliária: " + err.message)
  });

  const { data: usage } = useQuery({
    queryKey: ["imobiliaria-usage", profile?.imobiliaria_id],
    queryFn: async () => {
      if (!profile?.imobiliaria_id) return { leads: 0, members: 0 };
      
      const { count: leadsCount } = await supabase
        .from("leads")
        .select("*", { count: 'exact', head: true })
        .eq("imobiliaria_id", profile.imobiliaria_id);

      const { count: membersCount } = await supabase
        .from("perfis")
        .select("*", { count: 'exact', head: true })
        .eq("imobiliaria_id", profile.imobiliaria_id);

      return {
        leads: leadsCount || 0,
        members: membersCount || 0
      };
    },
    enabled: !!profile?.imobiliaria_id,
  });

  if (isLoadingProfile || (profile?.imobiliaria_id && isLoadingImobiliaria)) {
    return (
      <MainLayout>
        <div className="p-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-4 space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Configurações da Conta</h1>
            <p className="text-saas-sm text-muted-foreground">Personalize sua experiência e gerencie acessos.</p>
          </div>
          <Badge variant="outline" className="h-6 text-[9px] font-bold uppercase tracking-wider text-primary border-primary/20">Plano Ativo</Badge>
        </div>

        <Tabs defaultValue="perfil" className="space-y-6">
          <TabsList className="bg-slate-100/50 p-1 rounded-xl w-full md:w-auto overflow-x-auto justify-start border border-slate-200/50">
            <TabsTrigger value="perfil" className="gap-2 text-[11px] font-bold px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-soft rounded-lg transition-all uppercase tracking-tighter">
              <User className="h-3.5 w-3.5" /> Perfil
            </TabsTrigger>
            <TabsTrigger value="imobiliaria" className="gap-2 text-[11px] font-bold px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-soft rounded-lg transition-all uppercase tracking-tighter">
              <SettingsIcon className="h-3.5 w-3.5" /> Imobiliária
            </TabsTrigger>
            <TabsTrigger value="assinatura" className="gap-2 text-[11px] font-bold px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-soft rounded-lg transition-all uppercase tracking-tighter">
              <CreditCard className="h-3.5 w-3.5" /> Assinatura
            </TabsTrigger>
            <TabsTrigger value="seguranca" className="gap-2 text-[11px] font-bold px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-soft rounded-lg transition-all uppercase tracking-tighter">
              <Shield className="h-3.5 w-3.5" /> Segurança
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="perfil">
              <Card className="border-none shadow-soft bg-white overflow-hidden">
                <CardHeader className="py-4 px-5 border-b border-slate-50">
                  <CardTitle className="text-sm font-bold">Dados do Consultor</CardTitle>
                  <CardDescription className="text-saas-xs">Informações públicas exibidas para os leads.</CardDescription>
                </CardHeader>
                <CardContent className="p-5 space-y-6">
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    updateProfileMutation.mutate({
                      nome: formData.get("nome"),
                      telefone: formData.get("telefone"),
                    });
                  }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="nome" className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Nome Completo</Label>
                        <Input id="nome" name="nome" defaultValue={profile?.nome || ""} className="h-9 text-saas-sm border-slate-200" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="email" className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">E-mail Corporativo</Label>
                        <Input id="email" defaultValue={user?.email || ""} disabled className="h-9 text-saas-sm bg-slate-50 border-slate-200 cursor-not-allowed" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="telefone" className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Telefone/WhatsApp</Label>
                        <Input id="telefone" name="telefone" defaultValue={profile?.telefone || ""} placeholder="(00) 00000-0000" className="h-9 text-saas-sm border-slate-200" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="role" className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Cargo</Label>
                        <Input id="role" defaultValue={profile?.role || ""} disabled className="h-9 text-saas-sm bg-slate-50 border-slate-200 cursor-not-allowed uppercase font-bold" />
                      </div>
                    </div>
                    <div className="pt-4 border-t border-slate-50 flex justify-end">
                      <Button type="submit" disabled={updateProfileMutation.isPending} className="h-8 px-6 text-[10px] font-bold uppercase tracking-wider">
                        {updateProfileMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Save className="h-3 w-3 mr-2" />}
                        {updateProfileMutation.isPending ? "Salvando..." : "Atualizar Perfil"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="imobiliaria">
              <Card className="border-none shadow-soft bg-white overflow-hidden">
                <CardHeader className="py-4 px-5 border-b border-slate-50">
                  <CardTitle className="text-sm font-bold">Dados da Imobiliária</CardTitle>
                  <CardDescription className="text-saas-xs">Configure os dados da sua empresa e identidade visual.</CardDescription>
                </CardHeader>
                <CardContent className="p-5 space-y-6">
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    updateImobiliariaMutation.mutate({
                      nome: formData.get("nome"),
                      cnpj: formData.get("cnpj"),
                      telefone: formData.get("telefone"),
                    });
                  }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Razão Social</Label>
                        <Input name="nome" defaultValue={imobiliaria?.nome || ""} className="h-9 text-saas-sm border-slate-200" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">CNPJ</Label>
                        <Input name="cnpj" defaultValue={imobiliaria?.cnpj || ""} placeholder="00.000.000/0000-00" className="h-9 text-saas-sm border-slate-200" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">E-mail Comercial</Label>
                        <Input defaultValue={imobiliaria?.email || ""} disabled className="h-9 text-saas-sm bg-slate-50 border-slate-200" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Telefone Comercial</Label>
                        <Input name="telefone" defaultValue={imobiliaria?.telefone || ""} placeholder="(00) 0000-0000" className="h-9 text-saas-sm border-slate-200" />
                      </div>
                    </div>
                    <div className="pt-4 border-t border-slate-50 flex justify-end">
                      <Button type="submit" disabled={updateImobiliariaMutation.isPending} className="h-8 px-6 text-[10px] font-bold uppercase tracking-wider">
                        {updateImobiliariaMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Save className="h-3 w-3 mr-2" />}
                        {updateImobiliariaMutation.isPending ? "Salvando..." : "Salvar Dados da Empresa"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="assinatura">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-3 border-none shadow-soft bg-white overflow-hidden">
                  <CardHeader className="py-4 px-5 border-b border-slate-50 bg-slate-50/30">
                    <CardTitle className="text-sm font-bold">Plano Atual: <span className="text-primary uppercase tracking-tighter">Ilimitado (Beta)</span></CardTitle>
                    <CardDescription className="text-saas-xs">Uso atual dos recursos da plataforma.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                       <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Total de Leads</p>
                          <p className="text-xl font-bold text-slate-800">{usage?.leads || 0}</p>
                          <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                             <div className="bg-primary h-full w-[100%]" />
                          </div>
                       </div>
                       <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Usuários Ativos</p>
                          <p className="text-xl font-bold text-slate-800">{usage?.members || 0}</p>
                          <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                             <div className="bg-emerald-500 h-full w-[100%]" />
                          </div>
                       </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/10">
                       <div className="space-y-0.5">
                          <p className="text-saas-sm font-bold text-primary">Ambiente de Produção</p>
                          <p className="text-[10px] text-slate-500">Sua conta está conectada aos dados reais do Supabase.</p>
                       </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="seguranca">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2 border-none shadow-soft bg-white overflow-hidden">
                  <CardHeader className="py-4 px-5 border-b border-slate-50">
                    <CardTitle className="text-sm font-bold">Alterar Senha de Acesso</CardTitle>
                    <CardDescription className="text-saas-xs">Recomendamos trocar sua senha a cada 90 dias.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <div className="space-y-4 max-w-sm">
                      <div className="space-y-1.5">
                        <Label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Senha Atual</Label>
                        <PasswordInput className="h-9 text-saas-sm border-slate-200" placeholder="••••••••" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Nova Senha</Label>
                        <PasswordInput className="h-9 text-saas-sm border-slate-200" placeholder="••••••••" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-saas-xs font-bold text-slate-500 uppercase tracking-wider">Confirmar Nova Senha</Label>
                        <PasswordInput className="h-9 text-saas-sm border-slate-200" placeholder="••••••••" />
                      </div>
                    </div>
                    <div className="pt-4 border-t border-slate-50 flex justify-start">
                      <Button variant="outline" className="h-8 px-6 text-[10px] font-bold uppercase tracking-wider border-red-200 text-red-600 hover:bg-red-50">Redefinir Senha</Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card className="border-none shadow-soft bg-white">
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                         <Shield className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-saas-sm font-bold text-slate-700">Autenticação 2FA</p>
                        <p className="text-[10px] text-slate-400">Camada extra de proteção.</p>
                      </div>
                      <Button variant="link" className="ml-auto text-primary p-0 h-auto text-[10px] font-bold uppercase">Ativar</Button>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-none shadow-soft bg-slate-900 text-white overflow-hidden">
                    <CardContent className="p-5 space-y-3">
                      <Laptop className="h-5 w-5 opacity-50" />
                      <p className="text-saas-xs opacity-70 leading-relaxed">Você está logado em um navegador <strong>Chrome (Windows)</strong> em São Paulo, Brasil.</p>
                      <Button variant="link" className="p-0 h-auto text-white text-[10px] font-bold uppercase underline-offset-4">Encerrar outras sessões</Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </MainLayout>
  );
}
