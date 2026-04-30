import { createFileRoute } from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/leads")({
  head: () => ({ meta: [{ title: "Leads — ImoCRM" }] }),
  component: () => (
    <MainLayout>
      <PlaceholderPage title="Leads" />
    </MainLayout>
  ),
});
