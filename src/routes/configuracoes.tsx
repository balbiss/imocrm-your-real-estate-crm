import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — ImoCRM" }] }),
  component: () => (
    <MainLayout>
      <PlaceholderPage title="Configurações" />
    </MainLayout>
  ),
});
