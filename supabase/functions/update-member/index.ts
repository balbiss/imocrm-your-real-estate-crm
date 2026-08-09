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
    const authHeader = req.headers.get("Authorization") ?? "";

    // Cliente "autenticado como quem chamou" -- usado só pra descobrir quem
    // está fazendo a chamada e validar permissão (RLS de verdade, não
    // confiar só no botão estar escondido no front).
    const authedClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: callerError } = await authedClient.auth.getUser();
    if (callerError || !caller) {
      throw new Error("Não autenticado.");
    }

    const { id, nome, telefone, role, email, senha } = await req.json();
    if (!id) throw new Error("ID do membro é obrigatório.");

    const { data: callerProfile, error: callerProfileError } = await authedClient
      .from("perfis")
      .select("role, imobiliaria_id")
      .eq("id", caller.id)
      .single();
    if (callerProfileError || !callerProfile) throw new Error("Perfil do solicitante não encontrado.");

    if (callerProfile.role !== "dono" && callerProfile.role !== "gerente") {
      throw new Error("Sem permissão para editar membros da equipe.");
    }

    // RLS de perfis_select só deixa ver quem é da mesma imobiliária --
    // se vier null aqui, ou é de outra imobiliária ou não existe.
    const { data: targetProfile, error: targetProfileError } = await authedClient
      .from("perfis")
      .select("role, imobiliaria_id")
      .eq("id", id)
      .maybeSingle();
    if (targetProfileError || !targetProfile) throw new Error("Membro não encontrado.");

    // Gerente só mexe em corretor -- não pode editar outro gerente/dono nem
    // promover ninguém, isso fica restrito a dono.
    let finalRole = role;
    if (callerProfile.role === "gerente") {
      if (targetProfile.role !== "corretor") {
        throw new Error("Gerente só pode editar consultores.");
      }
      finalRole = "corretor";
    }

    // Update de perfis passa pela RLS normal do cliente autenticado (a
    // policy perfis_update já permite dono/gerente atualizarem qualquer
    // perfil da mesma imobiliária).
    const { error: profileUpdateError } = await authedClient
      .from("perfis")
      .update({
        nome,
        telefone,
        role: finalRole,
      })
      .eq("id", id);
    if (profileUpdateError) throw profileUpdateError;

    // E-mail/senha vivem em auth.users, não em perfis -- só dá pra mudar via
    // Admin API com a service role key.
    if (email || senha) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      const authUpdate: Record<string, string> = {};
      if (email) authUpdate.email = email;
      if (senha) authUpdate.password = senha;

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(id, authUpdate);
      if (authUpdateError) throw authUpdateError;
    }

    return new Response(JSON.stringify({ success: true }), {
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
