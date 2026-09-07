"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import { fetchPublicCustomerAccountWithToken, type PublicCustomerAccount } from "@/lib/client/customer-account";
import { createCustomerClient } from "@/lib/supabase/customer-client";

type CustomerSessionState = {
  account: PublicCustomerAccount;
  loaded: boolean;
  loading: boolean;
  mustChangePassword: boolean;
  refreshCustomerAccount: (session?: Session | null) => Promise<void>;
  sessionEmail: string;
  sessionName: string;
};

const emptyAccount: PublicCustomerAccount = { profile: null, addresses: [], orders: [] };
let pendingRefresh: Promise<void> | null = null;

function sessionMetadata(session: Session | null) {
  return session?.user.user_metadata as {
    full_name?: string;
    must_change_password?: boolean;
    name?: string;
  } | undefined;
}

function isMissingRefreshTokenError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; message?: unknown };
  return maybeError.code === "refresh_token_not_found" || (typeof maybeError.message === "string" && maybeError.message.toLowerCase().includes("refresh token"));
}

async function clearBrokenCustomerSession(supabase: SupabaseClient) {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    localStorage.removeItem("yopido-public-customer-auth");
  }
}

export const usePublicCustomerStore = create<CustomerSessionState>((set) => ({
  account: emptyAccount,
  loaded: false,
  loading: true,
  mustChangePassword: false,
  sessionEmail: "",
  sessionName: "",

  refreshCustomerAccount: async (currentSession?: Session | null) => {
    if (pendingRefresh) return pendingRefresh;

    pendingRefresh = (async () => {
      set({ loading: true });
      try {
        const supabase = createCustomerClient();
        const session =
          currentSession === undefined
            ? await supabase.auth.getSession().then(({ data, error }) => {
                if (error) throw error;
                return data.session;
              })
            : currentSession;
        const metadata = sessionMetadata(session);
        const account = session?.access_token ? await fetchPublicCustomerAccountWithToken(session.access_token) : emptyAccount;

        set({
          account,
          loaded: true,
          mustChangePassword: metadata?.must_change_password === true,
          sessionEmail: session?.user.email ?? "",
          sessionName: metadata?.full_name?.trim() || metadata?.name?.trim() || "",
        });
      } catch (error) {
        if (isMissingRefreshTokenError(error)) {
          await clearBrokenCustomerSession(createCustomerClient());
        }
        // Customer identity is a convenience layer for checkout. A transient failure
        // must not prevent a guest from continuing with their order.
        set({ account: emptyAccount, loaded: true, mustChangePassword: false, sessionEmail: "", sessionName: "" });
      } finally {
        set({ loading: false });
      }
    })();

    try {
      await pendingRefresh;
    } finally {
      pendingRefresh = null;
    }
  },
}));
