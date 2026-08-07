import { createCustomerClient } from "@/lib/supabase/customer-client";

export type PublicCustomerProfile = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  documentNumber: string;
  provider: "email" | "google";
  status: "active" | "blocked";
  createdAt: string;
  updatedAt: string;
  lastSignInAt: string | null;
};

export type PublicCustomerAddress = {
  id: string;
  customerId: string;
  label: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  mapsUrl: string | null;
  city: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PublicCustomerOrder = {
  id: string;
  restaurantName: string;
  restaurantSlug: string;
  orderNumber: string;
  customerPhone: string;
  trackingToken: string;
  orderType: "delivery" | "pickup" | "table" | "pos";
  status: "pending" | "accepted" | "preparing" | "ready" | "delivered" | "cancelled";
  total: number;
  createdAt: string;
};

export type PublicCustomerAccount = {
  profile: PublicCustomerProfile | null;
  addresses: PublicCustomerAddress[];
  favorites?: unknown[];
  orders?: PublicCustomerOrder[];
};

export const customerAccountChangedEvent = "yopido:customer-account-changed";

function customerErrorCode(error: unknown) {
  if (error instanceof Error) return error.message;
  return "customer-api-failed";
}

export function customerErrorMessage(error: unknown) {
  const code = customerErrorCode(error);
  if (code === "phone-already-exists") return "Ese telefono ya esta registrado en otra cuenta.";
  if (code === "document-already-exists") return "Ese carnet ya esta registrado en otra cuenta.";
  if (code === "email-already-exists") return "Ese correo ya esta registrado.";
  if (code === "customer-profile-required") return "Primero guarda tus datos de perfil.";
  if (code === "invalid-customer-registration") return "Revisa nombre, telefono, carnet, correo y contrasena.";
  if (code === "invalid-customer-profile") return "Revisa nombre, telefono y carnet.";
  if (code === "invalid-customer-address") return "Marca una direccion valida en el mapa.";
  if (code === "service-role-required") return "Falta SUPABASE_SERVICE_ROLE_KEY en la web.";
  return "No se pudo completar la accion. Intenta nuevamente.";
}

async function accessToken() {
  const supabase = createCustomerClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

async function parseApiError(response: Response) {
  const body = await response.json().catch(() => null);
  const error = typeof body?.error === "string" ? body.error : "customer-api-failed";
  throw new Error(error);
}

export function notifyCustomerAccountChanged() {
  window.dispatchEvent(new Event(customerAccountChangedEvent));
}

export async function registerPublicCustomer(input: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  documentNumber: string;
}) {
  const response = await fetch("/api/customers/register", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) await parseApiError(response);
  return (await response.json()) as { profile: PublicCustomerProfile };
}

export async function signInPublicCustomer(email: string, password: string) {
  const supabase = createCustomerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
}

export async function signOutPublicCustomer() {
  const supabase = createCustomerClient();
  await supabase.auth.signOut();
  notifyCustomerAccountChanged();
}

export async function fetchPublicCustomerAccount(): Promise<PublicCustomerAccount> {
  const token = await accessToken();
  if (!token) return { profile: null, addresses: [], orders: [] };

  const response = await fetch("/api/customers/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    if (response.status === 401) return { profile: null, addresses: [], orders: [] };
    await parseApiError(response);
  }
  return (await response.json()) as PublicCustomerAccount;
}

export async function updatePublicCustomerProfile(input: {
  fullName: string;
  phone: string;
  documentNumber: string;
}) {
  const token = await accessToken();
  if (!token) throw new Error("unauthorized");

  const response = await fetch("/api/customers/profile", {
    body: JSON.stringify(input),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    method: "PUT",
  });
  if (!response.ok) await parseApiError(response);
  notifyCustomerAccountChanged();
  return (await response.json()) as { profile: PublicCustomerProfile };
}

export async function createPublicCustomerAddress(input: {
  label: string;
  address: string;
  latitude?: number;
  longitude?: number;
  mapsUrl?: string;
  city?: string;
  isDefault?: boolean;
}) {
  const token = await accessToken();
  if (!token) throw new Error("unauthorized");

  const response = await fetch("/api/customers/addresses", {
    body: JSON.stringify(input),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) await parseApiError(response);
  notifyCustomerAccountChanged();
  return (await response.json()) as { addresses: PublicCustomerAddress[] };
}
