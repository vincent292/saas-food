import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";

type AppRole = Database["public"]["Enums"]["app_role"];

type BusinessProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  document_number: string | null;
  global_role: AppRole | null;
  created_at: string;
  updated_at: string;
};

type CustomerProfileRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  document_number: string;
  provider: "email" | "google";
  status: "active" | "blocked";
  created_at: string;
  updated_at: string;
};

export type SuperadminUserAccountType = "business" | "customer" | "auth";

export type SuperadminUserRecord = {
  id: string;
  accountType: SuperadminUserAccountType;
  fullName: string;
  email: string;
  phone: string;
  documentNumber: string;
  roleLabel: string;
  statusLabel: string;
  mustChangePassword: boolean;
  lastSignInAt: string | null;
  createdAt: string;
  updatedAt: string;
  whatsappHref: string;
};

const roleLabels: Record<AppRole, string> = {
  superadmin: "Superadmin",
  restaurant_admin: "Dueno/admin",
  cashier: "Caja",
  kitchen: "Cocina",
  waiter: "Mesero",
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9@.+\s-]/g, "")
    .trim()
    .toLowerCase();
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function metadataString(user: User | undefined, key: string) {
  const value = user?.user_metadata?.[key];
  return typeof value === "string" ? value : "";
}

function buildWhatsAppHref(phone: string, fullName: string, password: string) {
  const phoneDigits = digits(phone);
  if (!phoneDigits) return "";

  const text = `Hola ${fullName || "usuario"}, tu contrasena temporal de Yopido es: ${password}. Ingresa con esa clave y el sistema te pedira cambiarla.`;
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}

function matchesQuery(user: SuperadminUserRecord, query: string) {
  if (!query) return true;
  const haystack = normalizeSearch([
    user.fullName,
    user.email,
    user.phone,
    user.documentNumber,
    user.roleLabel,
    user.statusLabel,
  ].join(" "));
  return haystack.includes(query);
}

function mapBusinessProfile(row: BusinessProfileRow, authUser: User | undefined): SuperadminUserRecord {
  const fullName = row.full_name || metadataString(authUser, "full_name") || authUser?.email || row.email || "Usuario";
  const email = row.email || authUser?.email || "";
  const phone = row.phone || metadataString(authUser, "phone");
  const documentNumber = row.document_number || metadataString(authUser, "document_number");

  return {
    id: row.id,
    accountType: "business",
    fullName,
    email,
    phone,
    documentNumber,
    roleLabel: row.global_role ? roleLabels[row.global_role] : "Operativo",
    statusLabel: authUser?.banned_until ? "Suspendido" : "Activo",
    mustChangePassword: authUser?.user_metadata?.must_change_password === true,
    lastSignInAt: authUser?.last_sign_in_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    whatsappHref: buildWhatsAppHref(phone, fullName, ""),
  };
}

function mapCustomerProfile(row: CustomerProfileRow, authUser: User | undefined): SuperadminUserRecord {
  return {
    id: row.id,
    accountType: "customer",
    fullName: row.full_name || authUser?.email || "Cliente",
    email: row.email || authUser?.email || "",
    phone: row.phone,
    documentNumber: row.document_number,
    roleLabel: row.provider === "google" ? "Cliente Google" : "Cliente email",
    statusLabel: row.status === "active" ? "Activo" : "Bloqueado",
    mustChangePassword: authUser?.user_metadata?.must_change_password === true,
    lastSignInAt: authUser?.last_sign_in_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    whatsappHref: buildWhatsAppHref(row.phone, row.full_name, ""),
  };
}

function mapAuthUser(user: User): SuperadminUserRecord {
  const fullName = metadataString(user, "full_name") || user.email || "Usuario auth";
  const phone = metadataString(user, "phone") || user.phone || "";

  return {
    id: user.id,
    accountType: "auth",
    fullName,
    email: user.email || "",
    phone,
    documentNumber: metadataString(user, "document_number"),
    roleLabel: "Auth sin perfil",
    statusLabel: user.banned_until ? "Suspendido" : "Activo",
    mustChangePassword: user.user_metadata?.must_change_password === true,
    lastSignInAt: user.last_sign_in_at ?? null,
    createdAt: user.created_at,
    updatedAt: user.updated_at ?? user.created_at,
    whatsappHref: buildWhatsAppHref(phone, fullName, ""),
  };
}

async function listAuthUsers(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const users: User[] = [];
  const perPage = 200;

  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) break;

    users.push(...data.users);
    if (data.users.length < perPage) break;
  }

  return users;
}

export const superadminUsersService = {
  async listUsers(search = ""): Promise<SuperadminUserRecord[]> {
    const admin = createAdminClient();
    if (!admin) return [];

    const [{ data: profiles }, { data: customers }, authUsers] = await Promise.all([
      admin
        .from("profiles")
        .select("id,full_name,email,phone,document_number,global_role,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(500),
      admin
        .from("customer_profiles")
        .select("id,full_name,email,phone,document_number,provider,status,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(500),
      listAuthUsers(admin),
    ]);

    const authById = new Map(authUsers.map((user) => [user.id, user]));
    const profileIds = new Set<string>();
    const query = normalizeSearch(search);
    const users: SuperadminUserRecord[] = [];

    for (const profile of (profiles ?? []) as BusinessProfileRow[]) {
      profileIds.add(profile.id);
      users.push(mapBusinessProfile(profile, authById.get(profile.id)));
    }

    for (const customer of (customers ?? []) as CustomerProfileRow[]) {
      profileIds.add(customer.id);
      users.push(mapCustomerProfile(customer, authById.get(customer.id)));
    }

    for (const authUser of authUsers) {
      if (!profileIds.has(authUser.id)) {
        users.push(mapAuthUser(authUser));
      }
    }

    return users
      .filter((user) => matchesQuery(user, query))
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
      .slice(0, 250);
  },
};

export function buildSuperadminUserWhatsAppHref(phone: string, fullName: string, password: string) {
  return buildWhatsAppHref(phone, fullName, password);
}
