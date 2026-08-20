import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { BookOpen, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

export const Route = createFileRoute("/manual")({
  head: () => ({
    meta: [
      { title: "Manual do CRM — CRM" },
      { name: "description", content: "Guia de uso do CRM para dono, gerente e corretores." },
    ],
  }),
  component: ManualPage,
});

type Role = "dono" | "gerente" | "corretor" | "todos";

const ROLE_STYLES: Record<Role, string> = {
  dono: "bg-slate-100 text-slate-700 border-slate-200",
  gerente: "bg-teal-50 text-teal-700 border-teal-200",
  corretor: "bg-blue-50 text-blue-700 border-blue-200",
  todos: "bg-white text-slate-400 border-slate-200",
};
const ROLE_LABELS: Record<Role, string> = {
  dono: "Dono",
  gerente: "Gerente",
  corretor: "Corretor",
  todos: "Todos os papéis",
};

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${ROLE_STYLES[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}

const NAV_GROUPS: { title: string; items: { id: string; label: string }[] }[] = [
  {
    title: "Comece por aqui",
    items: [
      { id: "papeis", label: "Papéis e permissões" },
      { id: "inicio-rapido", label: "Início rápido por papel" },
    ],
  },
  {
    title: "Trabalho do dia a dia",
    items: [
      { id: "dashboard", label: "Dashboard" },
      { id: "leads", label: "Leads e Kanban" },
      { id: "conversas", label: "Conversas (WhatsApp)" },
      { id: "agenda", label: "Agenda" },
      { id: "clientes", label: "Base de Clientes" },
    ],
  },
  {
    title: "Gestão da equipe",
    items: [
      { id: "distribuicao", label: "Distribuição de Leads" },
      { id: "equipe", label: "Equipe" },
      { id: "roleta", label: "Rodízio e Roleta" },
      { id: "aprovacoes", label: "Aprovações" },
      { id: "relatorios", label: "Relatórios" },
    ],
  },
  {
    title: "Cadastros e ajustes",
    items: [
      { id: "imoveis", label: "Imóveis" },
      { id: "templates", label: "Mensagens Prontas" },
      { id: "notificacoes", label: "Notificações" },
      { id: "configuracoes", label: "Configurações" },
      { id: "conta", label: "Conta e senha" },
    ],
  },
  {
    title: "Ajuda",
    items: [{ id: "faq", label: "Perguntas frequentes" }],
  },
];

function Section({
  id,
  title,
  roles,
  lede,
  children,
}: {
  id: string;
  title: string;
  roles?: Role[];
  lede?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-b border-slate-100 py-10 first:pt-0 last:border-b-0">
      {roles && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {roles.map((r) => (
            <RoleBadge key={r} role={r} />
          ))}
        </div>
      )}
      <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
      {lede && <p className="mt-1.5 max-w-2xl text-saas-sm text-slate-500">{lede}</p>}
      <div className="mt-4 max-w-2xl space-y-3 text-saas-sm leading-relaxed text-slate-600 [&_strong]:font-bold [&_strong]:text-slate-800 [&_a]:font-semibold [&_a]:text-primary [&_a]:hover:underline">
        {children}
      </div>
    </section>
  );
}

function Callout({ title, children, tone = "amber" }: { title: string; children: ReactNode; tone?: "amber" | "red" }) {
  const toneClass = tone === "red" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50";
  const titleClass = tone === "red" ? "text-red-700" : "text-amber-700";
  return (
    <div className={`max-w-2xl rounded-lg border ${toneClass} p-4`}>
      <p className={`mb-1 text-[10px] font-bold uppercase tracking-wider ${titleClass}`}>{title}</p>
      <div className="text-saas-sm text-slate-600">{children}</div>
    </div>
  );
}

function ManualPage() {
  return (
    <MainLayout>
      <div className="mx-auto flex max-w-6xl gap-8 p-4">
        {/* Nav lateral */}
        <nav className="sticky top-4 hidden h-fit w-56 shrink-0 lg:block">
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-soft">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="mb-5 last:mb-0">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">{group.title}</p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className="block rounded px-2 py-1 text-saas-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-primary"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Conteúdo */}
        <div className="min-w-0 flex-1 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-white shadow-elegant">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Manual do CRM</h1>
              <p className="text-saas-sm text-slate-500">Guia de uso completo para dono, gerente e corretores.</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-soft sm:p-8">
            <Section id="papeis" title="Papéis e permissões" lede="O sistema tem três papéis. Cada tela respeita essas regras — algumas ações simplesmente não aparecem, ou aparecem desabilitadas, para quem não tem permissão.">
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full min-w-[480px] text-saas-xs">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="px-3 py-2">Ação</th>
                      <th className="px-3 py-2">Dono</th>
                      <th className="px-3 py-2">Gerente</th>
                      <th className="px-3 py-2">Corretor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[
                      ["Ver leads e trabalhar no Kanban", true, true, true],
                      ["Ver relatórios e indicadores", true, true, true],
                      ["Ver a Base de Clientes completa", true, false, true],
                      ["Transferir lead entre corretores", true, true, false],
                      ["Ativar/desativar plantão de um corretor", true, true, false],
                      ["Convidar e gerenciar a equipe", true, true, false],
                      ["Gerenciar ordem da roleta / rodízio", true, true, false],
                      ["Cadastrar e editar imóveis", true, true, true],
                      ["Aprovar descarte extremo de lead", true, true, false],
                      ["Alterar configurações do sistema", true, true, false],
                      ["Excluir registros definitivamente", true, false, false],
                    ].map(([label, dono, gerente, corretor]) => (
                      <tr key={label as string}>
                        <td className="px-3 py-2 font-medium text-slate-700">{label as string}</td>
                        <td className={`px-3 py-2 font-bold ${dono ? "text-teal-600" : "text-slate-300"}`}>{dono ? "Sim" : "Não"}</td>
                        <td className={`px-3 py-2 font-bold ${gerente ? "text-teal-600" : "text-slate-300"}`}>{gerente ? "Sim" : "Não"}</td>
                        <td className={`px-3 py-2 font-bold ${corretor ? "text-teal-600" : "text-slate-300"}`}>{corretor ? "Sim" : "Não"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Callout title="Detalhe que confunde">
                <p><strong>O gerente não vê a Base de Clientes completa</strong> — esse acesso é só do dono e dos corretores (cada um vendo os próprios). O gerente enxerga tudo pelo Kanban, Relatórios e Distribuição de Leads.</p>
              </Callout>
            </Section>

            <Section id="inicio-rapido" title="Início rápido por papel" lede="O caminho mais curto para começar a usar o sistema hoje, separado por função.">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    role: "dono" as Role,
                    title: "Sua primeira semana",
                    steps: ["Convide corretores e gerentes em Equipe", "Monte a ordem da Roleta", "Cadastre os primeiros Imóveis", "Acompanhe tudo pelos Relatórios"],
                  },
                  {
                    role: "gerente" as Role,
                    title: "Sua rotina diária",
                    steps: ["Limpe o Bolsão em Distribuição de Leads", "Revise leads presos no Kanban", "Confirme plantões do dia no Rodízio", "Responda pedidos em Aprovações"],
                  },
                  {
                    role: "corretor" as Role,
                    title: "Seu fluxo de atendimento",
                    steps: ["Conecte seu WhatsApp em Integrações", "Responda leads novos em até 5 minutos", "Mova o card no Kanban a cada etapa", "Agende visitas pela Agenda"],
                  },
                ].map((card) => (
                  <div key={card.role} className="rounded-lg border border-slate-100 p-4">
                    <RoleBadge role={card.role} />
                    <h3 className="mt-2.5 text-saas-sm font-bold text-slate-800">{card.title}</h3>
                    <ol className="mt-2 space-y-1.5 text-saas-xs text-slate-500">
                      {card.steps.map((s) => (
                        <li key={s} className="flex gap-1.5">
                          <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-slate-300" />
                          {s}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="dashboard" title="Dashboard" roles={["todos"]} lede="A tela inicial ao entrar no sistema. Mostra um resumo do que está acontecendo agora — leads novos, leads esperando resposta, visitas marcadas e como estão as vendas do período.">
              <p>Corretores veem os próprios números; dono e gerente veem o total da imobiliária, com opção de filtrar por corretor.</p>
            </Section>

            <Section id="leads" title="Leads e Kanban" roles={["todos"]} lede="O coração do sistema. Cada lead é um cartão que anda por colunas conforme avança no atendimento — da primeira mensagem até a venda ou descarte.">
              <p><strong>Fluxo das colunas:</strong> Lead Novo → Tarefas → Agendado → Visitou → Cobrar Doc → Pendente → Aprovado. As colunas de Rebatida (lead que voltou a responder) e Sem Resposta ficam paralelas ao fluxo principal. É possível renomear/reordenar colunas em <a href="#configuracoes">Configurações</a>.</p>
              <p><strong>Temperatura</strong> indica quão quente está o interesse. <strong>SLA de 5 minutos</strong> marca um lead novo como atrasado se ninguém responder a tempo. <strong>Devolver</strong> manda o lead de volta ao Bolsão sem corretor. <strong>Descartar</strong> encerra o lead — descarte extremo (ex: "Já Comprou") exige aprovação, veja <a href="#aprovacoes">Aprovações</a>. <strong>Fechar venda</strong> não fecha na hora — o valor e os detalhes vão pra aprovação do dono/gerente antes de virar venda de verdade.</p>
              <p><strong>Filtros da tela (busca, temperatura, coluna, cidade, corretor, data):</strong> a barra no topo filtra a lista/Kanban por qualquer combinação desses campos. O filtro de data usa dois campos (início/fim) e considera <em>quando o lead entrou no CRM</em> — útil pra saber quantos leads novos, rebatidas etc aconteceram num dia específico.</p>
              <div className="flex flex-wrap items-baseline gap-2">
                <RoleBadge role="dono" />
                <RoleBadge role="gerente" />
                <p className="m-0"><strong>Análise de Crédito:</strong> todo lead que entra nessa coluna fica com um alerta vermelho até dono ou gerente clicar em "Visto" (documentação auditada) ou "Retornar com Pendência" (volta pro corretor com uma nota do que falta). O alerta some assim que "Visto" é dado, e só volta a acender se o lead sair e retornar pra essa coluna de novo. Três avisos abrem um <strong>modal bloqueante</strong> no meio da tela (não só o sino): quando a pasta entra na coluna (avisa dono/gerente), quando a gestão retorna com pendência (avisa o corretor) e, enquanto o lead ficar parado nessa coluna, um lembrete a cada hora pra corretor, gerente e dono conferirem se já houve retorno do banco.</p>
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                <RoleBadge role="dono" />
                <RoleBadge role="gerente" />
                <p className="m-0"><strong>Transferir um lead:</strong> abra o card — logo abaixo dos botões de venda/devolução há um seletor "Transferir para" com a lista de corretores. Escolher um nome move o lead na hora e avisa o corretor (som + pop-up), do mesmo jeito que um lead novo da roleta.</p>
              </div>
              <p><strong>Mudar de coluna e agendar o próximo contato:</strong> ao mover o card para uma coluna como Conversando, Visitou, Cobrar Doc, Pendente, Aprovado, Reprovado, Restrição ou Futuros, primeiro escolhe-se a coluna — depois abre uma janela pedindo a data e o horário do próximo contato, nessa ordem. Agendado/FID continua exigindo a data e horário do compromisso antes, porque ali a data é o próprio motivo da coluna.</p>
              <p><strong>Cadência de chamada:</strong> vai de "Início" até "Chamada 5". Cada vez que se registra uma chamada, o sistema já agenda a próxima automaticamente: ligou antes das 13h, o próximo contato cai pra 17h do mesmo dia; ligou a partir das 13h (ou em qualquer horário de sábado, já que a equipe sai às 15h), cai pra 11h do próximo dia útil — pulando pra segunda-feira se cair domingo.</p>
              <p><strong>Devolver ao Bolsão:</strong> tira o lead do corretor e some com qualquer follow-up/visita que estivesse agendado — o card não fica preso em Tarefas depois de devolvido.</p>
              <p><strong>Data de Nascimento e lembretes automáticos:</strong> o card tem um campo opcional de Data de Nascimento, no bloco de Informações de Contato — preencha quando souber. No dia do aniversário, o corretor responsável recebe uma notificação lembrando de mandar um áudio parabenizando o cliente. Da mesma forma, 30 dias depois de uma venda aprovada, o corretor recebe uma notificação com uma mensagem de pós-venda já pronta (pedindo avaliação e indicação) pra copiar e enviar no chat — nenhuma dessas duas mensagens é enviada sozinha pelo sistema, é sempre o corretor que manda.</p>
              <Callout title="Leads descartados não voltam a aparecer">
                Um lead descartado sai de todas as colunas do Kanban e da Agenda, mesmo que tivesse tarefa ou visita pendente antes do descarte. O mesmo vale pra um lead com venda aprovada: ele não fica mais preso em "tarefa atrasada".
              </Callout>
            </Section>

            <Section id="conversas" title="Conversas (WhatsApp)" roles={["todos"]} lede="Cada corretor conecta o próprio número de WhatsApp ao sistema e atende os leads direto por aqui.">
              <p><strong>Conectar:</strong> abra Integrações, escaneie o QR Code com o WhatsApp do celular (Aparelhos conectados). A conexão fica ativa enquanto o celular tiver internet.</p>
              <p><strong>Mensagens prontas:</strong> digite <strong>/</strong> sozinho no campo de mensagem para abrir a lista de <a href="#templates">mensagens prontas</a> sem sair da conversa.</p>
              <p><strong>Leads automáticos:</strong> quando um cliente ainda não cadastrado manda mensagem para o número conectado, o sistema cria o lead sozinho e distribui pela roleta — não é preciso cadastrar manualmente antes.</p>
              <p><strong>Divisor de data no chat:</strong> entre mensagens de dias diferentes aparece "Hoje", "Ontem" ou a data completa, igual ao WhatsApp do celular.</p>
              <p><strong>Todo o histórico fica salvo no sistema, não no celular</strong> — cada mensagem é gravada no CRM assim que chega ou é enviada. Se o WhatsApp desconectar (celular sem internet, precisa reescanear o QR Code), nada do que já foi trocado se perde; só as mensagens que chegarem <em>durante</em> o período desconectado não são capturadas em tempo real. Dono e gerente sempre têm acesso ao histórico completo de qualquer corretor.</p>
              <Callout title="Alerta de possível duplicidade">
                Se uma mensagem chega em um número diferente do corretor responsável — ou de um lead marcado como rebatida — dono e gerente recebem uma notificação avisando, para decidirem se transferem o atendimento.
              </Callout>
              <Callout title="Um número que já é lead 'reaparece' sozinho no funil">
                Quando o Facebook reenvia um cadastro antigo do mesmo anúncio (isso acontece, é do lado da Meta, não do CRM), o sistema não cria um lead duplicado — ele atualiza o lead que já existia. Se esse lead estava sem corretor, ele é redistribuído pela roleta na hora e o corretor sorteado recebe o mesmo aviso de lead novo (som + pop-up).
              </Callout>
            </Section>

            <Section id="agenda" title="Agenda" roles={["todos"]} lede="Visitas, ligações combinadas e follow-ups aparecem em formato de calendário, cruzados com os leads que os geraram.">
              <p>Compromissos de leads descartados não aparecem mais na Agenda, para evitar lembrete de uma visita que não vai mais acontecer.</p>
            </Section>

            <Section id="clientes" title="Base de Clientes" roles={["dono", "corretor"]} lede="Lista completa de leads e clientes já atendidos, com filtros por status, corretor e período — útil para retomar contato com quem esfriou.">
              <p>Corretores veem sua própria carteira; o dono vê a base inteira. O gerente não tem esta tela — sua visão de equipe é feita pelo Kanban e pelos Relatórios.</p>
            </Section>

            <Section id="distribuicao" title="Distribuição de Leads" roles={["dono", "gerente"]} lede="Painel de gestão para leads que não estão sendo atendidos como deveriam. Tem seis abas.">
              <p><strong>Leads Novos:</strong> só quem chegou agora e nunca teve nenhum corretor — separado de propósito do resto do Bolsão, que pode ter anos de leads antigos/importados misturados. Mostra data e hora exata de entrada, com filtro de período (de/até) e um card no topo com o total de "Hoje + Ontem", pra bater o olho rápido sem precisar vasculhar a lista inteira.</p>
              <p><strong>Rebatidas Geral (Bolsão):</strong> todo lead sem corretor, incluindo os antigos — a lista completa, sem filtrar por "nunca teve dono". Mostra os 500 mais antigos por padrão (a base pode ter milhares); o <strong>filtro de cidade</strong> busca no banco antes desse corte, então filtrar por uma cidade específica sempre traz os leads certos dela, mesmo que o lote seja mais recente que os 500 mais antigos gerais.</p>
              <p><strong>Presos para Redistribuir:</strong> leads com corretor, mas parados há tempo demais sem movimento (5 ou mais tentativas de contato, ou mais de 24h sem sair de "Novo").</p>
              <p><strong>Leads Descartados:</strong> descartes normais (Sem Resposta, Não Tem Interesse, etc) — têm botão <strong>Reativar</strong>, que devolve o lead pro Bolsão do zero (sem corretor, sem histórico do descarte).</p>
              <p><strong>Lead Descadastrar:</strong> só os descartes extremos (Descadastrar / Já Comprou em Outra Empresa) que já foram aprovados pelo dono em <a href="#aprovacoes">Aprovações</a> — ficam numa aba própria porque são definitivos, diferente de um descarte normal que qualquer corretor pode reverter puxando de novo.</p>
              <p><strong>Histórico da Roleta:</strong> mostra, lead por lead, pra qual corretor a roleta automática mandou e em que data/hora — só o que a roleta decidiu sozinha, não o que foi transferido manualmente (isso fica registrado à parte, no próprio card do lead).</p>
              <p>Um campo de busca por nome, telefone ou corretor ajuda a localizar um lead rápido dentro dessas listas. Quando o lead distribuído (individualmente ou em massa) é um Lead Novo genuíno — nunca teve corretor antes — ele sempre avisa o corretor (som + pop-up + contagem de SLA), mesmo em "Ações em Massa"; distribuição de rebatida em massa continua silenciosa, só a transferência individual ("Encaminhar para...") avisa nesse caso, pra não virar spam de notificação.</p>
              <p><strong>Filtro de cidade/bairro:</strong> tanto em "+ Mais Rebatidas" quanto nos filtros de cidade em Leads e Rebatidas Geral, cidades com grafia parecida (acento, maiúscula) são agrupadas como uma só opção.</p>
            </Section>

            <Section id="equipe" title="Equipe" roles={["dono", "gerente"]} lede="Cadastro e gestão de quem trabalha na imobiliária dentro do sistema.">
              <p><strong>Convidar membro</strong> envia convite por e-mail definindo se a pessoa entra como corretor ou gerente. <strong>Ativar/desativar plantão</strong> tira temporariamente um corretor da fila de recebimento de leads novos, sem excluir o cadastro. <strong>Métricas por corretor</strong> mostram leads recebidos, vendas fechadas e SLA médio, lado a lado.</p>
            </Section>

            <Section id="roleta" title="Rodízio e Roleta" roles={["todos"]} lede="Define a ordem em que os corretores recebem os próximos leads novos.">
              <p>Todo mundo pode consultar a ordem atual. Só dono e gerente podem reordenar a fila. A <strong>Escala Semanal</strong> mostra quem está escalado em cada dia.</p>
              <p><strong>Como a roleta decide pra quem vai um lead:</strong> quando um lead chega, o sistema pega o próximo corretor da fila que esteja com o toggle "disponível na roleta" ligado, não esteja em horário de almoço, e não tenha advertências demais na semana. Depois de receber um lead, esse corretor vai pro final da fila — assim todo mundo recebe na mesma proporção com o tempo.</p>
              <p><strong>O toggle "disponível na roleta" é manual</strong> — cada corretor (ou dono/gerente por ele) precisa ativar ao começar o expediente. Ele não liga sozinho.</p>
              <Callout title="A roleta desliga todo mundo sozinha no fim do expediente">
                Todo dia, no horário de fechamento (18:20 na maioria dos dias, 19:30 quinta-feira, 15:20 sábado — e aos domingos a roleta fica desligada o dia inteiro), o sistema desativa automaticamente o toggle de todos os corretores, pra ninguém receber lead fora do horário. <strong>Mas ele não reativa sozinho de manhã</strong> — se um corretor esquecer de ligar o toggle ao chegar, os leads que chegarem nesse meio tempo caem no Bolsão sem dono, esperando alguém puxar manualmente. Vale religar assim que começar o dia.
              </Callout>
              <p>Quando nenhum corretor está disponível no momento em que um lead chega, ele não se perde — vai parar na coluna "Rebatida" do Kanban, sem dono, visível em <a href="#distribuicao">Distribuição de Leads → Rebatidas Geral</a>.</p>
            </Section>

            <Section id="aprovacoes" title="Aprovações" roles={["dono", "gerente"]} lede='Fila de pedidos de descarte extremo — motivos como "Já Comprou" ou "Descadastrar" — e de vendas fechadas, que um corretor não pode encerrar sozinho.'>
              <p>O corretor pede o descarte (ou fecha uma venda), o card fica pendente de aprovação, e dono ou gerente aprovam ou recusam aqui. Cada pedido mostra a campanha de origem do lead, e clicar no nome do cliente abre o card completo sem precisar sair da tela.</p>
            </Section>

            <Section id="relatorios" title="Relatórios" roles={["todos"]} lede="Indicadores de performance por período: volume de leads, taxa de conversão, tempo médio de resposta e ranking de corretores.">
              <p>Corretor vê seus próprios números; dono e gerente veem o comparativo de toda a equipe. Os filtros no topo (mês, corretor, campanha, cidade) afetam a página inteira — <em>exceto</em> o Relatório de Campanhas, que sempre mostra todas as campanhas lado a lado (ver abaixo).</p>
              <p><strong>Período personalizado:</strong> por padrão a tela mostra o mês atual (seletor de mês), mas dá pra escolher uma data de início e/ou fim específica ao lado — quando preenchidas, elas mandam mais que o seletor de mês. "Limpar período" volta a usar o mês selecionado.</p>
              <p><strong>Funil Completo</strong> mostra quantos leads passaram por cada coluna do Kanban no período — clique numa barra pra ver a lista de leads daquela etapa.</p>
              <p><strong>Ranking de Consultores:</strong> tabela por corretor com todas as etapas do funil — Novos, Rebatidas, Agendado, Visitou, Cobrar Doc, Pendente, Análise de Crédito, Restrição, Aprovado, FID, Vendas, Descarte, Descadastrado, Taxa de Conversão (Novo → Venda) e SLA médio de resposta. O seletor "Ranking" no topo da tabela reordena por Vendas, Agendamento, Visita, Análise ou total de Leads.</p>
              <p><strong>Relatório de Campanhas:</strong> o mesmo funil, mas por campanha/anúncio (a "Origem" do lead) em vez de por corretor — em porcentagem sobre o total de leads daquela campanha, pra comparar quais anúncios convertem melhor.</p>
              <div className="flex flex-wrap items-baseline gap-2">
                <RoleBadge role="dono" />
                <RoleBadge role="gerente" />
                <p className="m-0"><strong>CAC (Custo por Venda):</strong> dentro do Relatório de Campanhas, um campo editável guarda quanto foi gasto em cada campanha naquele mês. O sistema calcula sozinho CAC = gasto ÷ número de vendas daquela campanha no mês. A coluna <strong>Taxa Aprov. Créd.</strong> mostra, de quem passou por Análise de Crédito, quantos não caíram em Restrição.</p>
              </div>
              <Callout title="Venda conta pelo mês em que fechou, não em que o lead chegou">
                Um lead que entrou em junho e fechou em agosto aparece no relatório de agosto, não no de junho — senão a venda "sumiria" do mês em que ela realmente aconteceu.
              </Callout>
            </Section>

            <Section id="imoveis" title="Imóveis" roles={["todos"]} lede="Cadastro do portfólio: fotos, características, valores e status (disponível, reservado, vendido).">
              <p>Imóveis cadastrados aqui podem ser vinculados a um lead no Kanban.</p>
            </Section>

            <Section id="templates" title="Mensagens Prontas" roles={["todos"]} lede="Biblioteca de textos padronizados — saudação inicial, envio de documentos, confirmação de visita, etc.">
              <p>Acessível de dentro de qualquer conversa digitando <strong>/</strong>, como descrito em <a href="#conversas">Conversas</a>.</p>
            </Section>

            <Section id="notificacoes" title="Notificações" roles={["todos"]} lede="O sino no topo do sistema avisa em tempo real sobre lead novo, SLA vencido, follow-up do dia, pedido de descarte, redistribuição e possível duplicidade de atendimento.">
              <p>A busca ao lado do sino encontra leads e corretores pelo nome ou telefone, de qualquer tela do sistema.</p>
              <p><strong>Aviso de lead novo:</strong> quando um lead cai pra um corretor — seja pela roleta automática, seja transferido manualmente por dono/gerente — abre uma janela com contagem regressiva de 20 segundos, toca um som, e se o corretor estiver numa aba diferente do navegador (mas com o sistema ainda aberto em alguma aba) também aparece uma notificação do próprio navegador. Pra isso funcionar é preciso ter aceitado a permissão de notificações quando o sistema pediu.</p>
              <Callout title="O aviso não cobre navegador totalmente fechado">
                O pop-up e o som funcionam com o CRM aberto em qualquer aba, mesmo sem estar em foco. Se o navegador estiver completamente fechado, o aviso não chega — só as notificações de mensagem de WhatsApp funcionam assim (com o navegador fechado), lead novo ainda não.
              </Callout>
            </Section>

            <Section id="configuracoes" title="Configurações" roles={["dono", "gerente"]} lede="Ajustes gerais da imobiliária, incluindo as colunas do Kanban — dá pra renomear, reordenar ou criar novas colunas para adaptar o funil ao processo de vendas da empresa.">
              <p>Mudanças nas colunas afetam o Kanban imediatamente para toda a equipe.</p>
            </Section>

            <Section id="conta" title="Conta e senha" roles={["todos"]} lede='Esqueceu a senha? Na tela de login, clique em "Esqueci minha senha", informe o e-mail cadastrado e siga o link recebido para cadastrar uma nova senha.'>
              <Callout title="O e-mail pode demorar" tone="red">
                Se o link de redefinição não chegar em alguns minutos, confira a caixa de spam antes de solicitar de novo.
              </Callout>
            </Section>

            <Section id="faq" title="Perguntas frequentes">
              <p><strong>Um lead sumiu do Kanban, o que houve?</strong><br />Provavelmente foi descartado ou teve a venda fechada. Busque pelo nome ou telefone em <a href="#clientes">Base de Clientes</a> ou <a href="#relatorios">Relatórios</a>.</p>
              <p><strong>Por que não consigo transferir um lead?</strong><br />Só dono e gerente transferem leads entre corretores. Confirme se seu cadastro está marcado como gerente em <a href="#equipe">Equipe</a>.</p>
              <p><strong>O corretor saiu de férias, o que fazer?</strong><br />Dono ou gerente desativam o plantão dele em <a href="#equipe">Equipe</a> — ele para de receber leads novos, mas o histórico e a carteira continuam intactos.</p>
              <p><strong>Dois corretores estão falando com o mesmo cliente. Por quê?</strong><br />É o cenário que o <a href="#conversas">alerta de possível duplicidade</a> existe para pegar. Use o alerta para decidir quem fica com o lead e transfira pelo card.</p>
              <p><strong>Chegou lead novo, mas ele não aparece atribuído a ninguém. Por quê?</strong><br />Provavelmente nenhum corretor estava com o toggle "disponível na roleta" ligado no momento em que ele chegou — veja <a href="#roleta">Rodízio e Roleta</a>. O lead não se perde: ele fica esperando na coluna "Rebatida", visível em <a href="#distribuicao">Distribuição de Leads → Rebatidas Geral</a>, até alguém puxar manualmente.</p>
              <p><strong>Um cliente que já era lead "voltou" do nada, sem ninguém cadastrar de novo. É bug?</strong><br />Não — o Facebook às vezes reenvia o mesmo formulário de um cadastro antigo. O sistema detecta que aquele telefone já é um lead e atualiza o registro existente em vez de duplicar. Veja o <a href="#conversas">Callout em Conversas</a>.</p>
              <p><strong>Reativei um lead descartado e ele não apareceu em lugar nenhum. O que houve?</strong><br />Isso era um bug real, já corrigido (09/08) — o botão "Reativar" às vezes não confirmava a mudança de verdade. Hoje ele garante a reativação e devolve o lead pro Bolsão. Se acontecer de novo, avise.</p>
            </Section>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
