import { WorkspaceProvider } from "@/contexts/WorkspaceProvider";
import MainLayout from "@/components/layout/MainLayout";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider>
      <MainLayout>{children}</MainLayout>
    </WorkspaceProvider>
  );
}