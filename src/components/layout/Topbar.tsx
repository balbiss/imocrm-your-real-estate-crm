import { Menu, Search, Bell } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function Topbar({
  title,
  onToggleSidebar,
}: {
  title: string;
  onToggleSidebar: () => void;
}) {
  const { user } = useAuth();
  const nome = (user?.user_metadata as any)?.nome_completo ?? user?.email ?? "Usuário";
  const inicial = String(nome).trim().charAt(0).toUpperCase();

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-[#e2e8f0] bg-white px-4">
      <button
        onClick={onToggleSidebar}
        className="rounded-md p-2 text-[#475569] transition hover:bg-[#f1f5f9]"
        aria-label="Alternar menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="hidden text-base font-semibold text-[#0f172a] md:block">{title}</h1>

      <div className="relative ml-2 hidden flex-1 max-w-md md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
        <input
          type="search"
          placeholder="Buscar leads, corretores..."
          className="h-9 w-full rounded-md border border-[#e2e8f0] bg-[#f8fafc] pl-9 pr-3 text-sm placeholder:text-[#94a3b8] focus:border-[#3b82f6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/20"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button className="relative rounded-md p-2 text-[#475569] transition hover:bg-[#f1f5f9]">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-bold text-white">
            3
          </span>
        </button>

        <div className="mx-1 h-6 w-px bg-[#e2e8f0]" />

        <div className="flex items-center gap-2 pr-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-brand text-xs font-semibold text-white">
            {inicial}
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-xs font-semibold leading-tight text-[#0f172a]">{nome}</p>
            <p className="text-[10px] leading-tight text-[#64748b]">Dono</p>
          </div>
        </div>
      </div>
    </header>
  );
}
