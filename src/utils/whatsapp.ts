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

    const config = configRow.config as any;
    
    // 2. Limpar o número de destino (Evolution Go prefere sem o '+')
    const cleanTo = to.replace(/\D/g, "");
    const finalTo = cleanTo.startsWith("55") ? cleanTo : `55${cleanTo}`;

    // 3. Chamar a Evolution API Go
    const sanitizedInstanceName = (config.instanceName || "WhatsApp_CRM").trim().replace(/\s+/g, "_");
    
    const response = await fetch(`${config.apiUrl}/message/sendText/${sanitizedInstanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": config.apiKey
      },
      body: JSON.stringify({
        number: finalTo,
        text: message,
        linkPreview: false
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Erro ao enviar mensagem via Evolution");
    }

    return { success: true };
  } catch (error: any) {
    console.error("Erro no envio de WhatsApp:", error);
    return { success: false, error: error.message };
  }
}
