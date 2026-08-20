import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Filter, Mail, Phone, MoreVertical, UserCheck, Download, History, Edit, Trash2, Eye, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { LeadDetailsModal } from "@/components/leads/LeadDetailsModal";
import { NewLeadDialog } from "@/components/leads/NewLeadDialog";
import { ImportClientesDialog } from "@/components/leads/ImportClientesDialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/clientes")({
  head: () => ({ meta: [{ title: "Clientes — CRM" }] }),
  component: ClientesPage,
});

function ClientesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedClienteId, setSelectedClienteId] = React.useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes-list"] });
      toast.success("Cliente removido com sucesso!");
      setIsDeleteDialogOpen(false);
    },
    onError: (err: any) => {
      toast.error("Erro ao remover cliente: " + err.message);
    }
  });

  const { role, isLoading: loadingPerms } = usePermissions();

  // Chave de cache compartilhada com todas as outras páginas -- ver
  // agenda.tsx pro motivo (evita refazer essa consulta a cada navegação).
  const { data: profile } = useQuery({
    queryKey: ["perfil-imobiliaria", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("perfis").select("imobiliaria_id, role").eq("id", user.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  const { data: leads, isLoading } = useQuery({
    queryKey: ["clientes-list", profile?.imobiliaria_id, role],
    queryFn: async () => {
      if (!profile?.imobiliaria_id || loadingPerms) return [];

      const buildQuery = () => {
        let query = supabase
          .from("leads")
          .select("*")
          .eq("imobiliaria_id", profile.imobiliaria_id);

        if (role === 'corretor') {
          query = query.eq("corretor_id", user?.id);
        }

        return query.order("nome");
      };

      // O Supabase/PostgREST limita cada resposta a 1000 linhas por padrao —
      // busca em paginas ate esgotar, pra nao faltar clientes na lista
      // quando a base passar disso.
      const PAGE_SIZE = 1000;
      let allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        allRows = allRows.concat(data || []);
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return allRows;
    },
    enabled: !!profile?.imobiliaria_id && !loadingPerms,
  });

  const [searchTerm, setSearchTerm] = React.useState("");

  const filteredClientes = leads?.filter(cliente => 
    cliente.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cliente.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cliente.telefone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cliente.cpf?.includes(searchTerm)
  );

  if (isLoading || loadingPerms) return (
    <MainLayout>
      <div className="p-4 space-y-4 max-w-7xl mx-auto">
        <Skeleton className="h-6 w-48" />
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      </div>
    </MainLayout>
  );

  return (
    <MainLayout>
      <div className="p-4 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Base de Clientes</h1>
            <p className="text-saas-sm text-muted-foreground">Relacionamento e histórico completo dos seus contatos.</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="h-9 text-[11px] font-bold uppercase tracking-wider px-4 border-slate-200"
              onClick={() => setIsImportModalOpen(true)}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Importar
            </Button>
            <Button variant="outline" className="h-9 text-[11px] font-bold uppercase tracking-wider px-4 border-slate-200">
              <Download className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Exportar
            </Button>
            <Button 
              className="h-9 text-[11px] font-bold uppercase tracking-wider px-4"
              onClick={() => setIsAddModalOpen(true)}
            >
              <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Adicionar Cliente
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-2 rounded-2xl shadow-soft border border-slate-50">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input 
              placeholder="Filtrar por nome, CPF, e-mail ou telefone..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-saas-sm border-none shadow-none focus-visible:ring-0" 
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto px-2">
            <Button variant="ghost" className="h-8 px-3 text-[10px] font-bold uppercase text-slate-400 hover:text-primary">
              <Filter className="mr-1 h-3 w-3" /> Status
            </Button>
            <Button variant="ghost" className="h-8 px-3 text-[10px] font-bold uppercase text-slate-400 hover:text-primary">
              <History className="mr-1 h-3 w-3" /> Recentes
            </Button>
          </div>
        </div>

        <Card className="border-none shadow-soft bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-50 bg-slate-50/30">
                  <th className="py-3 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cliente</th>
                  <th className="py-3 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Contato</th>
                  <th className="py-3 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="py-3 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Ãšltima Compra</th>
                  <th className="py-3 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Valor Total</th>
                  <th className="py-3 px-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredClientes?.map((cliente) => (
                  <tr key={cliente.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 border border-slate-100 shadow-sm">
                          <AvatarFallback className="bg-slate-50 text-slate-500 text-[10px] font-bold">{cliente.nome[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-saas-sm font-bold text-slate-700 leading-none mb-1">{cliente.nome}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{cliente.id.slice(0,8).toUpperCase()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-saas-xs text-slate-500 font-medium">
                          <Mail className="h-2.5 w-2.5 text-slate-300" /> {cliente.email || "N/A"}
                        </div>
                        <div className="flex items-center gap-1.5 text-saas-xs text-slate-500 font-medium">
                          <Phone className="h-2.5 w-2.5 text-slate-300" /> {cliente.telefone}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={`text-[9px] font-bold h-5 px-1.5 uppercase border-none ${
                        cliente.status === 'venda_concluida' ? 'bg-emerald-50 text-emerald-600' : 
                        cliente.status === 'novo' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {cliente.status === 'venda_concluida' ? 'Fidelizado' : 
                         cliente.status === 'novo' ? 'Lead Novo' : 'Em Atendimento'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-saas-xs text-slate-500 font-bold uppercase tracking-tight">
                        {new Date(cliente.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-saas-sm font-black text-slate-900">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cliente.valor_estimado || 0)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-slate-600">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem 
                            className="text-xs font-medium cursor-pointer"
                            onClick={() => {
                              setSelectedClienteId(cliente.id);
                              setIsDetailsOpen(true);
                            }}
                          >
                            <Eye className="mr-2 h-3.5 w-3.5 text-slate-400" /> Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-xs font-medium cursor-pointer"
                            onClick={() => {
                              setSelectedClienteId(cliente.id);
                              setIsDetailsOpen(true);
                            }}
                          >
                            <Edit className="mr-2 h-3.5 w-3.5 text-slate-400" /> Editar Cliente
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-xs font-medium cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                            onClick={() => {
                              setSelectedClienteId(cliente.id);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir Cliente
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                {filteredClientes?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                      Nenhum cliente encontrado para sua pesquisa ou filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <NewLeadDialog 
        open={isAddModalOpen} 
        onOpenChange={setIsAddModalOpen} 
      />

      <ImportClientesDialog
        open={isImportModalOpen}
        onOpenChange={setIsImportModalOpen}
      />

      <LeadDetailsModal 
        leadId={selectedClienteId}
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente o registro do cliente e todo o seu histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-red-600 hover:bg-red-700"
              onClick={() => selectedClienteId && deleteMutation.mutate(selectedClienteId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
