import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Home, Plus, Search, Filter, MapPin, Tag, MoreHorizontal, Bed, Bath, Square } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { NewPropertyDialog } from "@/components/imoveis/NewPropertyDialog";
import { PropertyDetailsDialog } from "@/components/imoveis/PropertyDetailsDialog";
import { useState } from "react";

export const Route = createFileRoute("/imoveis")({
  head: () => ({ meta: [{ title: "Imóveis — CRM" }] }),
  component: ImoveisPage,
});

function ImoveisPage() {
  const [isNewPropertyOpen, setIsNewPropertyOpen] = useState(false);
  const [selectedImovel, setSelectedImovel] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { data: imoveis, isLoading } = useQuery({
    queryKey: ["imoveis-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imoveis")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filteredImoveis = imoveis?.filter(imovel => 
    imovel.titulo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    imovel.codigo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    imovel.cidade?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    imovel.estado?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) return (
    <MainLayout>
      <div className="p-4 space-y-4 max-w-7xl mx-auto">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      </div>
    </MainLayout>
  );

  return (
    <MainLayout>
      <div className="p-4 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Carteira de Imóveis</h1>
            <p className="text-saas-sm text-muted-foreground">Gerencie seus produtos e ofertas de forma estratégica.</p>
          </div>
          <Button 
            className="h-9 text-[11px] font-bold uppercase tracking-wider px-6"
            onClick={() => setIsNewPropertyOpen(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Novo Imóvel
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input 
              placeholder="Buscar por título, código ou endereço..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-saas-sm border-slate-200" 
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" className="h-9 px-4 text-saas-xs font-bold uppercase border-slate-200">
              <Filter className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Filtrar
            </Button>
            <Button variant="outline" className="h-9 px-4 text-saas-xs font-bold uppercase border-slate-200">
               <Tag className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Categorias
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredImoveis?.map((imovel) => (
            <Card 
              key={imovel.id} 
              className="border-none shadow-soft bg-white hover:shadow-md transition-all group overflow-hidden flex flex-col cursor-pointer"
              onClick={() => setSelectedImovel(imovel)}
            >
              <div className="aspect-[4/3] w-full bg-slate-100 relative overflow-hidden">
                {imovel.fotos && imovel.fotos.length > 0 ? (
                  <img src={imovel.fotos[0]} alt={imovel.titulo} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                    <Home size={40} />
                  </div>
                )}
                <div className="absolute top-2 left-2 flex gap-1">
                  <Badge className="bg-white/90 text-slate-900 border-none text-[9px] font-black uppercase tracking-tight backdrop-blur-sm">
                    {imovel.finalidade || "Venda"}
                  </Badge>
                  {imovel.fotos && imovel.fotos.length > 1 && (
                    <Badge className="bg-black/50 text-white border-none text-[9px] font-bold backdrop-blur-sm">
                      +{imovel.fotos.length - 1} FOTOS
                    </Badge>
                  )}
                </div>
                <div className="absolute top-2 right-2">
                   <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                   </Button>
                </div>
              </div>
              
              <CardContent className="p-3 flex-1 flex flex-col gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-1 text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-1">
                    <MapPin className="h-2.5 w-2.5" /> {imovel.cidade} - {imovel.estado}
                  </div>
                  <h3 className="text-saas-sm font-bold text-slate-700 line-clamp-1 leading-tight group-hover:text-primary transition-colors">
                    {imovel.titulo}
                  </h3>
                  <p className="text-xs font-black text-slate-900 mt-1">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(imovel.preco || 0)}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-1 pt-3 border-t border-slate-50">
                  <div className="flex items-center gap-1 justify-center bg-slate-50 rounded-lg py-1">
                    <Bed className="h-3 w-3 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-600">
                      {imovel.quartos !== null && imovel.quartos !== undefined ? imovel.quartos : "-"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 justify-center bg-slate-50 rounded-lg py-1">
                    <Bath className="h-3 w-3 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-600">
                      {imovel.banheiros !== null && imovel.banheiros !== undefined ? imovel.banheiros : "-"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 justify-center bg-slate-50 rounded-lg py-1">
                    <Square className="h-3 w-3 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-600">
                      {imovel.area !== null && imovel.area !== undefined ? `${imovel.area}m²` : "-"}
                    </span>
                  </div>
                </div>

                <Button 
                  onClick={() => setSelectedImovel(imovel)}
                  className="w-full h-8 mt-2 text-[10px] font-bold uppercase tracking-wider bg-slate-50 hover:bg-slate-100 text-slate-600 border-none transition-all"
                >
                  Ver Detalhes
                </Button>
              </CardContent>
            </Card>
          ))}

          {imoveis?.length === 0 && (
             <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-100 rounded-3xl">
                <Home className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                <h3 className="text-saas-sm font-bold text-slate-400">Nenhum imóvel cadastrado</h3>
                <p className="text-saas-xs text-slate-300">Comece adicionando seu primeiro imóvel à carteira.</p>
                <Button 
                  variant="outline" 
                  className="mt-4 h-8 text-[10px] font-bold uppercase border-slate-200"
                  onClick={() => setIsNewPropertyOpen(true)}
                >
                  Adicionar Agora
                </Button>
             </div>
          )}
        </div>
      </div>

      <NewPropertyDialog 
        open={isNewPropertyOpen} 
        onOpenChange={setIsNewPropertyOpen} 
      />

      <PropertyDetailsDialog
        imovel={selectedImovel}
        open={!!selectedImovel}
        onOpenChange={(open) => !open && setSelectedImovel(null)}
      />
    </MainLayout>
  );
}
