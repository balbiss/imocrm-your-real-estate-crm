import { createFileRoute } from "@tanstack/react-router";
import {
  Users,
  Clock,
  AlertCircle,
  TrendingUp,
  UserPlus,
  Phone,
  CheckCircle2,
  Home as HomeIcon,
  RefreshCw,
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ImoCRM" }] }),
  component: () => (
    <MainLayout>
      <DashboardContent />
    </MainLayout>
  ),
});

const kpis = [
  {
    label: "Total de Leads",
    value: 47,
    icon: Users,
    color: "#3b82f6",
    bg: "#dbeafe",
    sub: "+5 esta semana",
    subColor: "#10b981",
  },
  {
    label: "Aguardando Follow-up",
    value: 8,
    icon: Clock,
    color: "#f59e0b",
    bg: "#fef3c7",
    sub: "precisam de contato",
    subColor: "#64748b",
  },
  {
    label: "Fila de Redistribuição",
    value: 3,
    icon: AlertCircle,
    color: "#ef4444",
    bg: "#fee2e2",
    sub: "tentativas esgotadas",
    subColor: "#64748b",
  },
  {
    label: "Fechados no mês",
    value: 12,
    icon: TrendingUp,
    color: "#10b981",
    bg: "#d1fae5",
    sub: "conversões",
    subColor: "#64748b",
  },
];

const funil = [
  { etapa: "Novo", valor: 18, color: "#3b82f6" },
  { etapa: "Contato", valor: 12, color: "#6366f1" },
  { etapa: "Visita", valor: 8, color: "#8b5cf6" },
  { etapa: "Proposta", valor: 6, color: "#f59e0b" },
  { etapa: "Fechado", valor: 3, color: "#10b981" },
];

const atividades = [
  {
    icon: UserPlus,
    color: "#3b82f6",
    bg: "#dbeafe",
    text: "Novo lead recebido — Maria Souza",
    when: "há 2 minutos",
  },
  {
    icon: Phone,
    color: "#f59e0b",
    bg: "#fef3c7",
    text: "Ana Lima entrou em contato com João Pereira",
    when: "há 18 minutos",
  },
  {
    icon: HomeIcon,
    color: "#8b5cf6",
    bg: "#ede9fe",
    text: "Visita agendada — Apto Vila Mariana",
    when: "há 1 hora",
  },
  {
    icon: CheckCircle2,
    color: "#10b981",
    bg: "#d1fae5",
    text: "Negócio fechado por Marcos Santos",
    when: "há 3 horas",
  },
  {
    icon: RefreshCw,
    color: "#ef4444",
    bg: "#fee2e2",
    text: "Lead enviado para redistribuição",
    when: "há 5 horas",
  },
];

const corretores = [
  { nome: "Ana Lima", leads: 14, fechados: 5, conv: 36, online: true },
  { nome: "Marcos Santos", leads: 12, fechados: 4, conv: 33, online: true },
  { nome: "Carla Fonseca", leads: 11, fechados: 2, conv: 18, online: false },
  { nome: "Bruno Rocha", leads: 10, fechados: 1, conv: 10, online: true },
];

function DashboardContent() {
  const totalFunil = funil.reduce((s, f) => s + f.valor, 0);
  const max = Math.max(...funil.map((f) => f.valor));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-soft">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-[#64748b]">{k.label}</p>
                  <p className="mt-2 text-3xl font-bold tracking-tight" style={{ color: k.color }}>
                    {k.value}
                  </p>
                </div>
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ backgroundColor: k.bg }}
                >
                  <Icon className="h-5 w-5" style={{ color: k.color }} />
                </div>
              </div>
              <p className="mt-3 text-xs font-medium" style={{ color: k.subColor }}>
                {k.sub}
              </p>
            </div>
          );
        })}
      </div>

      {/* Funil + Atividade */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-soft lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#0f172a]">Funil de Conversão</h2>
              <p className="text-xs text-[#64748b]">Distribuição dos leads por etapa</p>
            </div>
            <span className="text-xs font-medium text-[#64748b]">Total: {totalFunil}</span>
          </div>

          <div className="space-y-3">
            {funil.map((f) => {
              const pct = totalFunil ? Math.round((f.valor / totalFunil) * 100) : 0;
              const width = max ? (f.valor / max) * 100 : 0;
              return (
                <div key={f.etapa}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-[#0f172a]">{f.etapa}</span>
                    <span className="text-[#64748b]">
                      <span className="font-semibold text-[#0f172a]">{f.valor}</span> · {pct}%
                    </span>
                  </div>
                  <div className="h-7 overflow-hidden rounded-md bg-[#f1f5f9]">
                    <div
                      className="flex h-full items-center justify-end rounded-md px-2 text-[11px] font-semibold text-white transition-all"
                      style={{ width: `${Math.max(width, 8)}%`, backgroundColor: f.color }}
                    >
                      {f.valor}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-soft">
          <h2 className="text-base font-semibold text-[#0f172a]">Atividade Recente</h2>
          <p className="text-xs text-[#64748b]">Últimos eventos do sistema</p>

          <ul className="mt-4 space-y-3">
            {atividades.map((a, i) => {
              const Icon = a.icon;
              return (
                <li key={i} className="flex gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: a.bg }}
                  >
                    <Icon className="h-4 w-4" style={{ color: a.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-snug text-[#0f172a]">{a.text}</p>
                    <p className="mt-0.5 text-[10px] text-[#94a3b8]">{a.when}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Corretores em destaque */}
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-soft">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-[#0f172a]">Corretores em Destaque</h2>
          <p className="text-xs text-[#64748b]">Performance da equipe neste mês</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {corretores.map((c) => {
            const inicial = c.nome.charAt(0);
            return (
              <div
                key={c.nome}
                className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-4 transition hover:border-[#cbd5e1] hover:bg-white"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-brand text-sm font-semibold text-white">
                    {inicial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#0f172a]">{c.nome}</p>
                    <span
                      className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        c.online
                          ? "bg-[#d1fae5] text-[#065f46]"
                          : "bg-[#f1f5f9] text-[#64748b]"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${c.online ? "bg-[#10b981]" : "bg-[#94a3b8]"}`} />
                      {c.online ? "Em Plantão" : "Offline"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#e2e8f0] pt-3">
                  <div>
                    <p className="text-[10px] text-[#64748b]">Leads</p>
                    <p className="text-sm font-bold text-[#0f172a]">{c.leads}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#64748b]">Fechados</p>
                    <p className="text-sm font-bold text-[#10b981]">{c.fechados}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#64748b]">Conv.</p>
                    <p className="text-sm font-bold text-[#3b82f6]">{c.conv}%</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
