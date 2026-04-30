import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — ImoCRM" }] }),
  component: () => (
    <MainLayout>
      <PlaceholderPage title="Relatórios" />
    </MainLayout>
  ),
});
