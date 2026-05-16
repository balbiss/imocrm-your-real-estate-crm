import { supabase } from "@/integrations/supabase/client";

interface WhatsAppConfig {
  apiUrl: string;
  apiKey: string;
  phoneNumber: string;
}

export async function sendWhatsAppMessage(to: string, message: string) {
  try {
    // 1. Buscar configuração da imobiliária
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado");

    const { data: perfil } = await supabase
      .from("perfis")
      .select("imobiliaria_id")
      .eq("id", user.id)
      .single();

    if (!perfil?.imobiliaria_id) throw new Error("Imobiliária não encontrada");

    const { data: configRow } = await supabase
      .from("integracoes_config")
      .select("config, status")
      .eq("imobiliaria_id", perfil.imobiliaria_id)
      .eq("integration_id", "whatsapp")
      .single();

    if (!configRow || configRow.status !== "connected") {
      // Se não estiver conectado via API, podemos retornar um link wa.me como fallback
      console.warn("WhatsApp não configurado ou desconectado.");
      return { success: false, fallbackUrl: `https://wa.me/${to.replace(/\D/g, "")}?text=${encodeURIComponent(message)}` };
    }

    const config = configRow.config as unknown as WhatsAppConfig;
    
    // 2. Limpar o número de destino
    const cleanTo = to.replace(/\D/g, "");
    const finalTo = cleanTo.startsWith("55") ? cleanTo : `55${cleanTo}`;

    // 3. Chamar a Baileys API
    const response = await fetch(`${config.apiUrl}/connections/${config.phoneNumber}/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey
      },
      body: JSON.stringify({
        to: `+${finalTo}`,
        text: message
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Erro ao enviar mensagem");
    }

    return { success: true };
  } catch (error: any) {
    console.error("Erro no envio de WhatsApp:", error);
    return { success: false, error: error.message };
  }
}
