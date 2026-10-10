// Regra única de "atrasado" (pedido do dono 10/10). Antes cada tela tinha a
// sua: a aba Tarefas só chamava de atrasada a tarefa vencida ANTES de hoje e
// escondia lead com o robô, mas o "+ Mais Rebatidas" contava tudo que venceu
// até este minuto, inclusive lead com o follow-up automático rodando. Como
// todo lead que o corretor recebe ganha tarefa pra "agora", a rebatida puxada
// virava "atrasada" no minuto seguinte e travava o próximo puxão (em 10).

export function ehColunaFollowupAutomatico(nomeColuna?: string | null): boolean {
  return !!nomeColuna && /follow/i.test(nomeColuna) && /autom/i.test(nomeColuna);
}

export function inicioDeHoje(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

type LeadTarefa = {
  lembrete_follow_up?: string | null;
  data_fechamento?: string | null;
  descartado_em?: string | null;
};

// Lembrete já passou (indicador vermelho no Kanban / filtro "vencidos").
// Lead com o robô rodando não conta: quem está cuidando dele é o robô.
export function lembreteVencido(lead: LeadTarefa, nomeColuna?: string | null): boolean {
  if (!lead.lembrete_follow_up || lead.data_fechamento || lead.descartado_em) return false;
  if (ehColunaFollowupAutomatico(nomeColuna)) return false;
  return new Date(lead.lembrete_follow_up) <= new Date();
}

// Tarefa ATRASADA = mesma regra da aba Tarefas: venceu antes de hoje.
export function tarefaAtrasada(lead: LeadTarefa, nomeColuna?: string | null): boolean {
  if (!lembreteVencido(lead, nomeColuna)) return false;
  return new Date(lead.lembrete_follow_up!) < inicioDeHoje();
}
