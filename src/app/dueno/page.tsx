import { OwnerDashboard } from "@/components/owner/OwnerDashboard";
import { OwnerOnboarding } from "@/components/owner/OwnerOnboarding";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { getOwnerDashboardData } from "@/lib/services/owner-dashboard.service";

export default async function OwnerHomePage() {
  const { profile, ownerMemberships } = await getOwnerLayoutContext();

  if (!ownerMemberships.length) {
    return <OwnerOnboarding email={profile.email} fullName={profile.fullName} />;
  }

  const data = await getOwnerDashboardData(ownerMemberships);

  return (
    <OwnerLayout active="/dueno" memberships={ownerMemberships} title="Resumen del negocio">
      <OwnerDashboard data={data} email={profile.email} />
    </OwnerLayout>
  );
}
