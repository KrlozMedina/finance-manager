
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main>
      <h1>Dashboard</h1>

      <p>
        Bienvenido, {session.user.name ?? "Usuario"}.
      </p>

      <p>
        Correo: {session.user.email}
      </p>
    </main>
  );
}
