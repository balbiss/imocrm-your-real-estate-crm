import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

const INTERVALO_MS = 60 * 60 * 1000; // 1 hora

// Pedido do dono (11/09): aviso urgente sobre a Meta ter atualizado o
// WhatsApp -- a integração vai precisar de atualização no proxy reverso, ou
// para de funcionar. Só dono/gerente vê (corretor não precisa saber disso).
// Bloqueante de propósito (só fecha pelo botão) -- mesmo padrão já usado em
// AnaliseCreditoAlertProvider. Aparece ao entrar e se repete a cada 1h
// enquanto a aba ficar aberta. Liga/desliga em Configurações -> Imobiliária
// (imobiliarias.aviso_meta_whatsapp_ativo) -- é um aviso temporário, o dono
// desliga quando resolver o proxy.
export function AvisoMetaWhatsappProvider() {
  const { user } = useAuth();
  const { role, isLoading: loadingPerms } = usePermissions();
  const [open, setOpen] = useState(false);

  const { data: imobiliaria } = useQuery({
    queryKey: ["aviso-meta-whatsapp-flag", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: perfil } = await supabase.from("perfis").select("imobiliaria_id").eq("id", user.id).single();
      if (!perfil?.imobiliaria_id) return null;
      const { data } = await supabase
        .from("imobiliarias")
        .select("aviso_meta_whatsapp_ativo")
        .eq("id", perfil.imobiliaria_id)
        .single();
      return data;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  const ativo = !!(imobiliaria as any)?.aviso_meta_whatsapp_ativo;
  const podeVer = !loadingPerms && role !== "corretor";

  useEffect(() => {
    if (!podeVer || !ativo) return;
    setOpen(true);
    const id = setInterval(() => setOpen(true), INTERVALO_MS);
    return () => clearInterval(id);
  }, [podeVer, ativo]);

  if (!podeVer || !ativo || !open) return null;

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md border-red-500 border-2 shadow-[0_0_50px_rgba(220,38,38,0.35)] pointer-events-auto z-[9999]"
        // Bloqueante de propósito -- só fecha pelo botão, não por clique fora nem Esc.
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideClose
      >
        <DialogHeader className="space-y-3">
          <div className="mx-auto bg-red-100 p-4 rounded-full">
            <AlertTriangle className="h-10 w-10 text-red-600" />
          </div>
          <DialogTitle className="text-center text-xl font-black text-red-700 uppercase tracking-tight">
            Aviso importante — Integração WhatsApp
          </DialogTitle>
          <div className="text-center text-slate-600 font-bold text-sm leading-relaxed">
            A Meta atualizou o WhatsApp. Nossa integração vai precisar de uma atualização no proxy
            reverso em breve — sem isso, o envio/recebimento de mensagens pode parar de funcionar.
          </div>
          <div className="text-center text-red-700 font-black text-sm uppercase tracking-tight">
            Atualize o código do proxy reverso urgente.
          </div>
        </DialogHeader>

        <DialogFooter className="sm:justify-center pt-2">
          <Button
            className="w-full h-11 text-sm font-black uppercase tracking-widest bg-red-600 hover:bg-red-700"
            onClick={() => setOpen(false)}
          >
            OK, entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
