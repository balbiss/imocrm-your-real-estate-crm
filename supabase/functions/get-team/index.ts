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

    const { imobiliaria_id } = await req.json();

    if (!imobiliaria_id) {
        throw new Error("imobiliaria_id is required");
    }

    // Busca os perfis da imobiliária
    const { data: perfis, error: perfisError } = await supabaseClient
      .from("perfis")
      .select("*")
      .eq("imobiliaria_id", imobiliaria_id)
      .order("nome");

    if (perfisError) throw perfisError;

    // Busca todos os usuários do Auth para pegar os emails
    const { data: authUsers, error: authError } = await supabaseClient.auth.admin.listUsers();
    
    if (authError) throw authError;

    // Mescla os emails nos perfis
    const teamWithEmails = perfis.map(perfil => {
        const user = authUsers.users.find(u => u.id === perfil.id);
        return {
            ...perfil,
            email: user?.email || "Email não encontrado"
        };
    });

    return new Response(JSON.stringify(teamWithEmails), {
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
