"use client";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

let customerClient: SupabaseClient<Database> | null = null;

export function createCustomerClient() {
  if (!customerClient) {
    customerClient = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: false,
          persistSession: true,
          storageKey: "yopido-public-customer-auth",
        },
      },
    );
  }

  return customerClient;
}
