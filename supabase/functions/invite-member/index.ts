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

    const { email, nome, role, imobiliaria_id, telefone, senha } = await req.json();

    const finalPassword = senha || "Hinode@Mudar123";

    // Tenta criar o usuário
    const { data: userData, error: createError } = await supabaseClient.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: { nome, role, imobiliaria_id },
    });

    let userId = userData?.user?.id;

    if (createError) {
      // Se o usuário já existir, buscamos o ID dele para atualizar o perfil
      if (createError.message.includes("already") || createError.message.includes("already exists")) {
        // Como o admin.createUser falhou, buscamos o usuário pelo email
        const { data: userList, error: listError } = await supabaseClient.auth.admin.listUsers();
        if (listError) throw listError;
        
        const existingUser = userList.users.find(u => u.email === email);
        if (!existingUser) throw new Error("Erro ao localizar usuário existente.");
        
        userId = existingUser.id;
        
        // Atualiza a senha se foi passada uma nova
        if (senha) {
          const { error: updateAuthError } = await supabaseClient.auth.admin.updateUserById(userId, {
            password: senha
          });
          if (updateAuthError) console.error("Erro ao atualizar senha:", updateAuthError);
        }
      } else {
        throw createError;
      }
    }

    // Criar ou atualizar o perfil na tabela 'perfis'
    const { error: profileError } = await supabaseClient
      .from("perfis")
      .upsert({
        id: userId,
        nome,
        role,
        imobiliaria_id,
        telefone,
        // Mantemos o status de plantão se já existir, ou definimos como false
        em_plantao: false,
      });

    if (profileError) throw profileError;

    return new Response(JSON.stringify({ 
      message: createError ? "Perfil do membro atualizado com sucesso!" : "Membro convidado com sucesso!",
      tempPassword: createError ? null : finalPassword,
      isNewUser: !createError
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
