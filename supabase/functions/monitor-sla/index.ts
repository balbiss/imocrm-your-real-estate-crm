import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    // 1. Buscar leads com SLA vencido que ainda não foram marcados
    // Regra padrão: se status = 'novo' e criado há mais de 2 horas
    const twoHoursAgo = new Date()
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2)

    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, nome, imobiliaria_id, corretor_id')
      .eq('sla_vencido', false)
      .eq('status', 'novo')
      .lt('created_at', twoHoursAgo.toISOString())

    if (leadsError) throw leadsError

    if (leads && leads.length > 0) {
      // 2. Marcar leads como SLA Vencido
      const leadIds = leads.map(l => l.id)
      const { error: updateError } = await supabase
        .from('leads')
        .update({ sla_vencido: true })
        .in('id', leadIds)
      
      if (updateError) throw updateError

      // 3. Gerar notificações
      for (const lead of leads) {
        const { data: admins } = await supabase
          .from('perfis')
          .select('id')
          .eq('imobiliaria_id', lead.imobiliaria_id)
          .in('role', ['dono', 'gerente'])

        if (admins && admins.length > 0) {
          const notifications = admins.map(admin => ({
            usuario_id: admin.id,
            imobiliaria_id: lead.imobiliaria_id,
            titulo: '⚠️ SLA VENCIDO: ' + lead.nome,
            mensagem: `O lead ${lead.nome} está há mais de 2 horas sem o primeiro contato.`,
            tipo: 'sla_vencido'
          }))
          
          await supabase.from('notificacoes').insert(notifications)
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed: leads?.length ?? 0 
    }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
