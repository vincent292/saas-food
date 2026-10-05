import { redirect } from "next/navigation";
import { MultisiteSimulatorClient } from "@/components/admin/MultisiteSimulatorClient";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { authService } from "@/lib/services/auth.service";
import { multisiteSimulatorService } from "@/lib/services/multisite-simulator.service";

export default async function MultisiteSimulatorPage() {
  const profile = await authService.getCurrentProfile();

  if (!profile) {
    redirect("/admin/login?error=session");
  }

  if (profile.globalRole !== "superadmin") {
    redirect("/admin?error=superadmin-required");
  }

  const operationalRestaurants = await multisiteSimulatorService.listOperationalRestaurants();

  return (
    <AdminLayout active="/admin/multi-pedidos/simulador" title="Simulador multi-pedido">
      <MultisiteSimulatorClient operationalRestaurants={operationalRestaurants} />
    </AdminLayout>
  );
}
