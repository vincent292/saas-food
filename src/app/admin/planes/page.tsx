import { PlanEditor } from "@/components/admin/PlanEditor";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { planService } from "@/lib/services/plan.service";

export default async function PlansPage() {
  const plans = await planService.listPlans();

  return (
    <AdminLayout active="/admin/planes" title="Planes">
      <SectionTitle description="Define precios, límites y módulos disponibles para cada tipo de restaurante." title="Planes y módulos" />
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {plans.map((plan) => (
          <PlanEditor key={plan.id} plan={plan} />
        ))}
      </div>
    </AdminLayout>
  );
}
