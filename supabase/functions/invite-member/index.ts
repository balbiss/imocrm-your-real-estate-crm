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

    const { email, nome, role, imobiliaria_id, telefone } = await req.json();

    // Criar o usuário diretamente com uma senha padrão
    // Isso permite que o corretor logue imediatamente
    const { data: userData, error: createError } = await supabaseClient.auth.admin.createUser({
      email,
      password: "Hinode@Mudar123", // Senha padrão para novos membros
      email_confirm: true,
      user_metadata: { nome, role, imobiliaria_id },
    });

    if (createError) {
      // Se o usuário já existir, tentamos apenas atualizar o perfil
      if (createError.message.includes("already registered")) {
        throw new Error("Este e-mail já está cadastrado no sistema.");
      }
      throw createError;
    }

    // Criar o perfil na tabela 'perfis'
    const { error: profileError } = await supabaseClient
      .from("perfis")
      .upsert({
        id: userData.user.id,
        nome,
        role,
        imobiliaria_id,
        telefone,
        em_plantao: false,
      });

    if (profileError) throw profileError;

    return new Response(JSON.stringify({ 
      message: "Membro criado com sucesso!",
      tempPassword: "Hinode@Mudar123" 
    }), {
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
