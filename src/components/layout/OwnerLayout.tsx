import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { OwnerShellClient } from "@/components/layout/OwnerShellClient";
import { authService } from "@/lib/services/auth.service";
import { membershipService, type UserRestaurantMembership } from "@/lib/services/membership.service";
import { ownerMembershipsForUser } from "@/lib/services/owner-dashboard.service";

export async function getOwnerLayoutContext() {
  const profile = await authService.getCurrentProfile();

  if (!profile) {
    redirect("/admin/login?error=session");
  }

  if (profile.mustChangePassword) {
    redirect("/admin/cambiar-contrasena");
  }

  if (profile.globalRole === "superadmin") {
    redirect("/admin");
  }

  const memberships = await membershipService.listActiveRestaurantsForUser(profile.id);
  const ownerMemberships = ownerMembershipsForUser(memberships, profile.id);

  if (memberships.length > 0 && ownerMemberships.length === 0) {
    if (memberships.length === 1) {
      redirect(`/admin/restaurantes/${memberships[0].restaurant.id}/dashboard`);
    }

    redirect("/admin");
  }

  return {
    profile,
    memberships,
    ownerMemberships,
  };
}

export async function OwnerLayout({
  active,
  children,
  memberships,
  title,
}: {
  active: string;
  children: ReactNode;
  memberships: UserRestaurantMembership[];
  title: string;
}) {
  const profile = await authService.getCurrentProfile();

  if (!profile) {
    redirect("/admin/login?error=session");
  }

  if (profile.mustChangePassword) {
    redirect("/admin/cambiar-contrasena");
  }

  return (
    <OwnerShellClient
      active={active}
      branchCount={memberships.length}
      firstRestaurantId={memberships[0]?.restaurant.id}
      ownerEmail={profile.email}
      ownerName={profile.fullName}
      title={title}
    >
      {children}
    </OwnerShellClient>
  );
}
