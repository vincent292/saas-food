import { OwnerDashboard } from "@/components/owner/OwnerDashboard";
import { OwnerOnboarding } from "@/components/owner/OwnerOnboarding";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { getOwnerActivationSummary, getOwnerDashboardData } from "@/lib/services/owner-dashboard.service";

export default async function OwnerHomePage() {
  const { profile, ownerMemberships } = await getOwnerLayoutContext({ active: "/dueno" });

  if (!ownerMemberships.length) {
    const activation = await getOwnerActivationSummary(profile.id);
    const mode = activation.accountSuspended ? "suspended" : activation.total > 0 ? "expansion" : "first";

    return <OwnerOnboarding activation={activation} email={profile.email} fullName={profile.fullName} mode={mode} />;
  }

  const data = await getOwnerDashboardData(ownerMemberships);

  return (
    <OwnerLayout active="/dueno" memberships={ownerMemberships} title="Resumen del negocio">
      <OwnerDashboard data={data} email={profile.email} />
    </OwnerLayout>
  );
}
