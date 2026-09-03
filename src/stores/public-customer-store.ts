"use client";

import { create } from "zustand";
import { fetchPublicCustomerAccount, type PublicCustomerAccount } from "@/lib/client/customer-account";
import { createCustomerClient } from "@/lib/supabase/customer-client";

type CustomerSessionState = {
  account: PublicCustomerAccount;
  loaded: boolean;
  loading: boolean;
  mustChangePassword: boolean;
  refreshCustomerAccount: () => Promise<void>;
  sessionEmail: string;
  sessionName: string;
};

const emptyAccount: PublicCustomerAccount = { profile: null, addresses: [], orders: [] };
let pendingRefresh: Promise<void> | null = null;

export const usePublicCustomerStore = create<CustomerSessionState>((set) => ({
  account: emptyAccount,
  loaded: false,
  loading: true,
  mustChangePassword: false,
  sessionEmail: "",
  sessionName: "",

  refreshCustomerAccount: async () => {
    if (pendingRefresh) return pendingRefresh;

    pendingRefresh = (async () => {
      set({ loading: true });
      try {
        const supabase = createCustomerClient();
        const { data } = await supabase.auth.getSession();
        const metadata = data.session?.user.user_metadata as {
          full_name?: string;
          must_change_password?: boolean;
          name?: string;
        } | undefined;
        const account = data.session ? await fetchPublicCustomerAccount() : emptyAccount;

        set({
          account,
          loaded: true,
          mustChangePassword: metadata?.must_change_password === true,
          sessionEmail: data.session?.user.email ?? "",
          sessionName: metadata?.full_name?.trim() || metadata?.name?.trim() || "",
        });
      } catch {
        // Customer identity is a convenience layer for checkout. A transient failure
        // must not prevent a guest from continuing with their order.
        set({ loaded: true });
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
