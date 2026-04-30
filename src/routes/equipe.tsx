import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/equipe")({
  head: () => ({ meta: [{ title: "Equipe — ImoCRM" }] }),
  component: () => (
    <MainLayout>
      <PlaceholderPage title="Equipe" />
    </MainLayout>
  ),
});
