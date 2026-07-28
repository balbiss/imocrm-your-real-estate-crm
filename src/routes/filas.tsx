import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Shuffle, 
  GripVertical, 
  UserPlus, 
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/context/AuthContext";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

export const Route = createFileRoute("/filas")({
  component: FilasPage,
});

function SortableItem({ id, profile, index, isNext, canManage, onToggleStatus }: { id: string, profile: any, index: number, isNext: boolean, canManage: boolean, onToggleStatus: (id: string, current: boolean) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isOnline = profile?.status_roleta === true;

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`relative group bg-white border rounded-xl p-4 mb-3 transition-all ${
        isNext ? "border-primary shadow-md ring-1 ring-primary/20" : "border-slate-200 hover:border-slate-300"
      } ${!isOnline ? "opacity-60 grayscale-[0.5]" : ""}`}
    >
      <div className="flex items-center gap-4">
        <div
          {...(canManage ? attributes : {})}
          {...(canManage ? listeners : {})}
          className={`text-slate-300 ${canManage ? "cursor-grab active:cursor-grabbing hover:text-slate-500" : "cursor-not-allowed opacity-40"}`}
        >
          <GripVertical className="h-5 w-5" />
        </div>

        <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-lg ${
          isNext && isOnline ? "bg-primary text-white" : "bg-slate-100 text-slate-500"
        }`}>
          {index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold truncate">{profile?.nome || "Corretor"}</h4>
            {isNext && isOnline && (
              <Badge className="bg-primary hover:bg-primary text-[9px] h-4 px-1.5 font-black uppercase tracking-tighter">
                PRÓXIMO LEAD
              </Badge>
            )}
            {!isOnline && (
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-black uppercase tracking-tighter text-slate-400 border-slate-200">
                OFFLINE
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
              <Clock className="h-3 w-3" /> {profile?.ultimo_checkin_roleta ? `Check-in: ${format(new Date(profile.ultimo_checkin_roleta), "HH:mm")}` : "Sem check-in"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
           <div className="text-right flex flex-col items-end gap-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Status Roleta</p>
              <button 
                onClick={() => onToggleStatus(profile.id, isOnline)}
                disabled={!canManage}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${
                  isOnline ? "text-green-600 bg-green-50 hover:bg-green-100" : "text-slate-400 bg-slate-100 hover:bg-slate-200"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isOnline ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                <span className="text-[10px] font-bold uppercase tracking-widest leading-none">{isOnline ? "Online" : "Offline"}</span>
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}

function FilasPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { can, isLoading: loadingPerms } = usePermissions();
  const [activeTab, setActiveTab] = useState("roleta");
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay() || 7);
  const [selectedCorretor, setSelectedCorretor] = useState<string>("");

  if (loadingPerms) {
    return (
      <MainLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  const { data: profile } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("perfis").select("imobiliaria_id").eq("id", user.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: fila, isLoading: loadingFila } = useQuery({
    queryKey: ["fila-atendimento"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("filas_atendimento")
        .select("*, perfis(nome, avatar_url, status_roleta, ultimo_checkin_roleta)")
        .order("posicao", { ascending: true });
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  const { data: escala, isLoading: loadingEscala } = useQuery({
    queryKey: ["escala-plantao", profile?.imobiliaria_id],
    queryFn: async () => {
      if (!profile?.imobiliaria_id) return [];
      const { data, error } = await supabase
        .from("escala_plantao")
        .select(`
          *,
          corretor:perfis!corretor_id(nome)
        `)
        .eq("imobiliaria_id", profile.imobiliaria_id)
        .order("dia_semana", { ascending: true })
        .order("hora_inicio", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.imobiliaria_id,
  });

  const { data: todosCorretores } = useQuery({
    queryKey: ["todos-corretores", profile?.imobiliaria_id],
    queryFn: async () => {
      if (!profile?.imobiliaria_id) return [];
      const { data, error } = await supabase
        .from("perfis")
        .select("id, nome")
        .eq("imobiliaria_id", profile.imobiliaria_id);
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.imobiliaria_id,
  });

  const addToEscalaMutation = useMutation({
    mutationFn: async ({ corretorId, dia }: { corretorId: string, dia: number }) => {
      const { error } = await supabase
        .from("escala_plantao")
        .insert({
          imobiliaria_id: profile!.imobiliaria_id,
          corretor_id: corretorId,
          dia_semana: dia,
          hora_inicio: "08:00:00",
          hora_fim: "20:00:00"
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escala-plantao"] });
      toast.success("Corretor adicionado à escala!");
      setSelectedCorretor("");
    },
  });

  const removeFromEscalaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("escala_plantao")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escala-plantao"] });
      toast.success("Corretor removido da escala.");
    },
  });

  const updatePosicoesMutation = useMutation({
    mutationFn: async (newOrder: any[]) => {
      const updates = newOrder.map((item, index) => ({
        id: item.id,
        corretor_id: item.corretor_id,
        posicao: index + 1,
      }));

      const { error } = await supabase
        .from("filas_atendimento")
        .upsert(updates);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fila-atendimento"] });
      toast.success("Fila atualizada!");
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ profileId, status }: { profileId: string, status: boolean }) => {
      const { error } = await supabase
        .from("perfis")
        .update({ 
          status_roleta: !status,
          ultimo_checkin_roleta: !status ? new Date().toISOString() : null
        })
        .eq("id", profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fila-atendimento"] });
      toast.success("Status atualizado!");
    },
  });

  const checkinMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("perfis")
        .update({ 
          status_roleta: true,
          ultimo_checkin_roleta: new Date().toISOString(),
          em_plantao: true
        })
        .eq("id", user.id);
      if (error) throw error;
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao realizar check-in.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fila-atendimento"] });
      toast.success("Check-in realizado com sucesso!");
    },
  });

  const shuffleMutation = useMutation({
    mutationFn: async () => {
      if (!fila) return;
      // sort(() => Math.random() - 0.5) nao embaralha de verdade: com poucos
      // itens o algoritmo de ordenacao do V8 faz poucas comparacoes e a
      // lista quase nao muda. Fisher-Yates garante uma ordem realmente
      // aleatoria.
      const shuffled = [...fila];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      await updatePosicoesMutation.mutateAsync(shuffled);
    },
    onSuccess: () => {
      toast.info("Roleta embaralhada!");
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: any) {
    if (!can('manage_roleta')) return;
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = fila?.findIndex((i) => i.id === active.id) ?? -1;
      const newIndex = fila?.findIndex((i) => i.id === over.id) ?? -1;
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(fila!, oldIndex, newIndex);
        updatePosicoesMutation.mutate(newOrder);
      }
    }
  }

  const corretoresNoDiaAtual = escala?.filter(e => e.dia_semana === selectedDay) || [];

  const diasSemana = [
    { id: 1, nome: "Segunda" },
    { id: 2, nome: "Terça" },
    { id: 3, nome: "Quarta" },
    { id: 4, nome: "Quinta" },
    { id: 5, nome: "Sexta" },
    { id: 6, nome: "Sábado" },
    { id: 7, nome: "Domingo" },
  ];

  return (
    <MainLayout>
      <div className="p-8 max-w-5xl mx-auto h-[calc(100vh-4rem)] flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-1">
                 <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                   <Shuffle className="h-5 w-5" />
                 </div>
                 <h1 className="text-2xl font-black tracking-tight text-slate-800 uppercase">Gestão de Rodízio</h1>
              </div>
              <p className="text-sm text-slate-500 font-medium">Controle quem recebe leads e em quais horários.</p>
            </div>

            <div className="bg-slate-100 p-1 rounded-xl">
              <TabsList className="bg-transparent border-none">
                 <TabsTrigger value="roleta" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg text-xs font-black uppercase tracking-widest px-6 h-9">Roleta</TabsTrigger>
                 <TabsTrigger value="escala" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg text-xs font-black uppercase tracking-widest px-6 h-9">Escala Semanal</TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="roleta" className="flex-1 mt-0 animate-in fade-in slide-in-from-bottom-4 outline-none">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
               <Card className="border-none shadow-sm bg-primary/5">
                  <CardContent className="p-4 flex items-center gap-4">
                     <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white">
                        <Users className="h-5 w-5" />
                     </div>
                     <div>
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest leading-none mb-1">Na Fila</p>
                        <p className="text-xl font-black text-slate-800">{fila?.length || 0} Corretores</p>
                     </div>
                  </CardContent>
               </Card>

               <Card className="border-none shadow-sm bg-green-50">
                  <CardContent className="p-4 flex items-center gap-4">
                     <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center text-white">
                        <CheckCircle2 className="h-5 w-5" />
                     </div>
                     <div>
                        <p className="text-[10px] font-black text-green-600 uppercase tracking-widest leading-none mb-1">Status</p>
                        <p className="text-xl font-black text-slate-800">Ativo</p>
                     </div>
                  </CardContent>
               </Card>

               <div className="flex items-center justify-end gap-2">
                  <Button 
                    variant="outline" 
                    className="font-bold text-xs gap-2 border-slate-200"
                    onClick={() => shuffleMutation.mutate()}
                    disabled={shuffleMutation.isPending || !can('manage_roleta')}
                  >
                    <Shuffle className="h-3.5 w-3.5" /> EMBARALHAR
                  </Button>
                  <Button 
                    className="font-bold text-xs gap-2 bg-green-600 hover:bg-green-700"
                    onClick={() => checkinMutation.mutate()}
                    disabled={checkinMutation.isPending}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> CHECK-IN
                  </Button>
               </div>
            </div>

            <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-6">
                 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ordem de Prioridade</h3>
                 {can('manage_roleta') && (
                   <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                      <AlertCircle className="h-3 w-3" /> Arraste para reordenar
                   </div>
                 )}
              </div>

              <ScrollArea className="flex-1 pr-4">
                {loadingFila ? (
                  <div className="flex items-center justify-center h-40">
                    <RefreshCw className="h-8 w-8 animate-spin text-slate-300" />
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={fila?.map(i => i.id) || []} strategy={verticalListSortingStrategy}>
                      {fila?.map((item, index) => (
                        <SortableItem 
                          key={item.id} 
                          id={item.id} 
                          profile={item.perfis} 
                          index={index} 
                          isNext={index === 0} 
                          canManage={can('manage_roleta')}
                          onToggleStatus={(id, status) => toggleStatusMutation.mutate({ profileId: id, status })}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="escala" className="flex-1 mt-0 animate-in fade-in slide-in-from-bottom-4 outline-none flex flex-col gap-6">
            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100">
              {diasSemana.map((dia) => (
                <button
                  key={dia.id}
                  onClick={() => setSelectedDay(dia.id)}
                  className={`flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                    selectedDay === dia.id 
                      ? "bg-white text-primary shadow-sm ring-1 ring-slate-200" 
                      : "text-slate-400 hover:text-slate-600 hover:bg-white/50"
                  }`}
                >
                  {dia.nome}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1 overflow-hidden">
               <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                     <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Corretores Escalados</h3>
                     <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100 font-bold border-none">
                       {corretoresNoDiaAtual.length} Ativos
                     </Badge>
                  </div>
                  
                  <ScrollArea className="flex-1">
                     <div className="space-y-3">
                        {loadingEscala ? (
                          <div className="flex items-center justify-center py-10"><RefreshCw className="h-6 w-6 animate-spin text-slate-200" /></div>
                        ) : corretoresNoDiaAtual.length === 0 ? (
                          <div className="text-center py-20 opacity-30">
                             <Clock className="h-10 w-10 mx-auto mb-3" />
                             <p className="text-[10px] font-black uppercase tracking-widest">Ninguém escalado</p>
                          </div>
                        ) : (
                          corretoresNoDiaAtual.map((item) => (
                            <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group">
                               <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                     {item.corretor?.nome?.charAt(0) || "C"}
                                  </div>
                                  <span className="text-sm font-bold text-slate-700">{item.corretor?.nome || "Corretor"}</span>
                               </div>
                               {can('manage_roleta') && (
                                 <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-8 w-8 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => removeFromEscalaMutation.mutate(item.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                 </Button>
                               )}
                            </div>
                          ))
                        )}
                     </div>
                  </ScrollArea>
               </div>

            {can('manage_roleta') && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Adicionar Corretor à Escala</p>
                  <Select value={selectedCorretor} onValueChange={setSelectedCorretor}>
                    <SelectTrigger className="h-10 text-sm border-slate-200">
                      <SelectValue placeholder="Selecione um corretor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {todosCorretores?.filter(c => !corretoresNoDiaAtual.some(e => e.corretor_id === c.id)).map((corretor) => (
                        <SelectItem key={corretor.id} value={corretor.id}>{corretor.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  className="h-10 px-6 font-bold uppercase text-[11px] tracking-wider bg-primary w-full md:w-auto"
                  disabled={!selectedCorretor || addToEscalaMutation.isPending}
                  onClick={() => selectedCorretor && addToEscalaMutation.mutate({ corretorId: selectedCorretor, dia: selectedDay })}
                >
                  <UserPlus className="h-4 w-4 mr-2" /> Adicionar à Escala
                </Button>
              </div>
            )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
