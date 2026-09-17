import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { decryptWhatsAppToken } from '../../../supabase/functions/_shared/whatsapp-credentials';
import type { WhatsAppConnectionStatus } from '@/types/whatsapp-connection.types';

export const metaGraphVersion = process.env.META_GRAPH_API_VERSION || 'v26.0';

export async function requireWhatsAppManager(restaurantId: string) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Inicia sesión para conectar WhatsApp.');
  const admin = createAdminClient();
  if (!admin) throw new Error('El servicio de conexión no está configurado.');
  const [{ data: profile }, { data: restaurant }, { data: membership }] = await Promise.all([
    client.from('profiles').select('global_role').eq('id', user.id).maybeSingle(),
    admin.from('restaurants').select('id,owner_user_id,status,deleted_at').eq('id', restaurantId).maybeSingle(),
    client.from('restaurant_memberships').select('role').eq('restaurant_id', restaurantId).eq('user_id', user.id).eq('is_active', true).maybeSingle(),
  ]);
  if (!restaurant || restaurant.deleted_at || (profile?.global_role !== 'superadmin' &&
    (restaurant.status !== 'active' || (restaurant.owner_user_id !== user.id && membership?.role !== 'restaurant_admin')))) {
    throw new Error('Solo el dueño o responsable de esta sucursal puede administrar su conexión.');
  }
  return { admin, user };
}

export function whatsAppSetupReady() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_WHATSAPP_CONFIG_ID && process.env.WHATSAPP_CREDENTIALS_KEY);
}

export async function getWhatsAppConnectionStatus(restaurantId: string): Promise<WhatsAppConnectionStatus> {
  try {
    const { admin } = await requireWhatsAppManager(restaurantId);
    // Explicit public projection. Never serialize ciphertext or access tokens.
    const { data, error } = await admin.from('restaurant_whatsapp_connections')
      .select('display_phone_number,verified_name,status,coexistence,connected_at,last_checked_at,last_error')
      .eq('restaurant_id', restaurantId).maybeSingle();
    return {
      canManage: true,
      setupReady: whatsAppSetupReady() && !error,
      connection: data ? {
        displayPhone: data.display_phone_number, verifiedName: data.verified_name,
        status: data.status, coexistence: data.coexistence, connectedAt: data.connected_at,
        lastCheckedAt: data.last_checked_at, lastError: data.last_error,
      } : null,
    };
  } catch {
    return { canManage: false, setupReady: false, connection: null };
  }
}

export async function resolveWhatsAppSender(restaurantId: string, channelKey: string) {
  if (channelKey === 'platform') {
    const token = process.env.WHATSAPP_TOKEN?.trim();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    return token && phoneNumberId ? { token, phoneNumberId } : null;
  }
  const admin = createAdminClient();
  const key = process.env.WHATSAPP_CREDENTIALS_KEY;
  if (!admin || !key) return null;
  const { data, error } = await admin.from('restaurant_whatsapp_connections').select('*')
    .eq('restaurant_id', restaurantId).eq('phone_number_id', channelKey).eq('status', 'connected').maybeSingle();
  if (error || !data?.token_ciphertext || (data.token_expires_at && Date.parse(data.token_expires_at) <= Date.now())) return null;
  try {
    return { token: await decryptWhatsAppToken(data.token_ciphertext, key, restaurantId), phoneNumberId: data.phone_number_id };
  } catch {
    return null;
  }
}

export function insideWhatsAppReplyWindow(lastCustomerMessageAt: string | null | undefined) {
  const timestamp = Date.parse(lastCustomerMessageAt ?? '');
  return Number.isFinite(timestamp) && timestamp <= Date.now() && Date.now() - timestamp < 24 * 60 * 60 * 1000;
}

export class MetaConnectionError extends Error {}

export async function metaRequest<T>(path: string, token: string, options: { method?: string; body?: unknown; form?: Record<string, string> } = {}): Promise<T> {
  const response = await fetch(`https://graph.facebook.com/${metaGraphVersion}/${path}`, {
    method: options.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': options.form ? 'application/x-www-form-urlencoded' : 'application/json' },
    ...(options.form ? { body: new URLSearchParams(options.form).toString() } : options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.error) {
    // Do not expose Meta responses, access tokens or OAuth request URLs.
    throw new MetaConnectionError('Meta no pudo completar la conexión. Revisa tus permisos y vuelve a enlazar el número.');
  }
  return payload as T;
}
