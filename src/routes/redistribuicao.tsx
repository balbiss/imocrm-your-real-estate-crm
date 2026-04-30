import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/redistribuicao")({
  head: () => ({ meta: [{ title: "Fila de Redistribuição — ImoCRM" }] }),
  component: () => (
    <MainLayout>
      <PlaceholderPage title="Fila de Redistribuição" />
    </MainLayout>
  ),
});
