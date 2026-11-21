
import { auth } from "@/auth";
import { redirect } from "next/navigation";

import DashboardOverview from "@/components/dashboard/DashboardOverview";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main>
      <DashboardOverview />
    </main>
  );
}
