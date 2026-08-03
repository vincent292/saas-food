import { PlanEditor } from "@/components/admin/PlanEditor";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { planService } from "@/lib/services/plan.service";

export default async function PlansPage() {
  const plans = await planService.listPlans();

  return (
    <AdminLayout active="/admin/planes" title="Tarifa">
      <SectionTitle description="Define la tarifa Full y sus precios. Las nuevas sucursales se habilitan por dueno desde la cuenta del restaurante." title="Tarifa y sucursales" />
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {plans.map((plan) => (
          <PlanEditor key={plan.id} plan={plan} />
        ))}
      </div>
    </AdminLayout>
  );
}
