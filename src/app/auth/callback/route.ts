import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const fallbackPath = "/admin";
const allowedPrefixes = ["/admin", "/dueno"];

type UserIdentityLike = {
  email?: string | null;
  identity_data?: unknown;
  provider?: string;
};

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallbackPath;
  }

  return allowedPrefixes.some((prefix) => value === prefix || value.startsWith(`${prefix}/`)) ? value : fallbackPath;
}

function stringFromIdentityData(identityData: unknown, key: string) {
  if (!identityData || typeof identityData !== "object" || Array.isArray(identityData)) {
    return "";
  }

  const value = (identityData as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function identityEmail(identity: UserIdentityLike) {
  return (identity.email || stringFromIdentityData(identity.identity_data, "email")).trim().toLowerCase();
}

function withAuthResult(redirectUrl: URL, key: string, value: string) {
  const isAdminLogin = redirectUrl.pathname === "/admin/login";
  redirectUrl.searchParams.set(isAdminLogin ? "error" : key, value.replace(/^google-/, ""));
  return redirectUrl;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  const redirectUrl = new URL(next, url.origin);

  if (!code) {
    return NextResponse.redirect(withAuthResult(redirectUrl, "googleLinked", "google-missing-code"));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(withAuthResult(redirectUrl, "googleLinked", "google-error"));
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.redirect(withAuthResult(redirectUrl, "googleLinked", "google-session-error"));
  }

  const [{ data: profile }, { data: customerProfile }, identitiesResult] = await Promise.all([
    supabase.from("profiles").select("id,email,global_role").eq("id", user.id).maybeSingle(),
    supabase.from("customer_profiles").select("id").eq("id", user.id).maybeSingle(),
    supabase.auth.getUserIdentities(),
  ]);

  const identities = identitiesResult.data?.identities ?? [];
  const googleIdentity = identities.find((identity) => identity.provider === "google");
  const profileEmail = (profile?.email ?? user.email ?? "").trim().toLowerCase();
  const googleEmail = googleIdentity ? identityEmail(googleIdentity) : "";

  if (!profile || customerProfile) {
    if (googleIdentity && identities.length > 1) {
      await supabase.auth.unlinkIdentity(googleIdentity).catch(() => null);
    }
    await supabase.auth.signOut().catch(() => null);
    return NextResponse.redirect(withAuthResult(redirectUrl, "googleLinked", "google-business-account-required"));
  }

  if (googleIdentity && profileEmail && googleEmail && googleEmail !== profileEmail) {
    if (identities.length > 1) {
      await supabase.auth.unlinkIdentity(googleIdentity).catch(() => null);
    }
    return NextResponse.redirect(withAuthResult(redirectUrl, "googleLinked", "google-email-mismatch"));
  }

  redirectUrl.searchParams.set(redirectUrl.pathname === "/admin/login" ? "google" : "googleLinked", "1");
  return NextResponse.redirect(redirectUrl);
}
