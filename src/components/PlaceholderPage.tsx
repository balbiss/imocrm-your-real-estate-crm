import { Construction } from "lucide-react";

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="rounded-2xl border bg-white p-10 text-center shadow-soft">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand text-white shadow-elegant">
          <Construction className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">{title}</h1>
        <p className="mt-2 text-sm text-[#64748b]">Em construção ??</p>
        <p className="mt-1 text-xs text-[#94a3b8]">Esta área está sendo preparada.</p>
      </div>
    </div>
  );
}
