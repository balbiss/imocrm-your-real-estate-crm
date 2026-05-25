import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { id } = await req.json();

    if (!id) {
      throw new Error("ID do usuário é obrigatório.");
    }

    // 1. Limpar dependências para evitar erro de Foreign Key
    await supabaseClient.from("descartes_leads").delete().eq("usuario_id", id);
    await supabaseClient.from("distribuicao_log").delete().eq("corretor_id", id);
    await supabaseClient.from("escala_plantao").delete().eq("corretor_id", id);
    await supabaseClient.from("filas_atendimento").delete().eq("corretor_id", id);
    await supabaseClient.from("lead_historico_corretores").delete().eq("corretor_id", id);
    await supabaseClient.from("leads").update({ corretor_id: null }).eq("corretor_id", id);

    // 2. Deletar do auth.users (isso disparará o cascade para deletar de 'perfis' se houver trigger/FK, mas deletamos de perfis antes por garantia)
    await supabaseClient.from("perfis").delete().eq("id", id);
    
    const { error: authError } = await supabaseClient.auth.admin.deleteUser(id);

    if (authError) {
      console.error("Erro ao deletar do Auth:", authError);
      throw authError;
    }

    return new Response(JSON.stringify({ success: true, message: "Usuário excluído definitivamente com sucesso!" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
