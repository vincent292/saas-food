'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { encryptWhatsAppToken } from '../../../../../../supabase/functions/_shared/whatsapp-credentials';
import {
  getWhatsAppConnectionStatus, metaGraphVersion, metaRequest, requireWhatsAppManager,
  resolveWhatsAppSender, whatsAppSetupReady,
} from '@/lib/services/whatsapp-connection.service';

const branchId = z.string().uuid();
const finishSchema = z.object({
  restaurantId: branchId, sessionId: z.string().uuid(), code: z.string().min(1).max(4096),
  phoneNumberId: z.string().max(32).regex(/^\d+$/), wabaId: z.string().max(32).regex(/^\d+$/),
});
const safeError = (error: unknown) => error instanceof Error && !('code' in error)
  ? error.message : 'No se pudo guardar la conexión. Intenta nuevamente.';

export async function prepareWhatsAppConnectionAction(restaurantId: string) {
  try {
    branchId.parse(restaurantId);
    const { admin, user } = await requireWhatsAppManager(restaurantId);
    if (!whatsAppSetupReady()) throw new Error('La conexión con Meta aún debe ser habilitada por el administrador de la plataforma.');
    await admin.from('whatsapp_onboarding_sessions').delete().eq('user_id', user.id).eq('restaurant_id', restaurantId);
    const { data, error } = await admin.from('whatsapp_onboarding_sessions')
      .insert({ restaurant_id: restaurantId, user_id: user.id }).select('id').single();
    if (error || !data) throw new Error('No se pudo iniciar el enlace.');
    return { ok: true as const, sessionId: data.id, appId: process.env.META_APP_ID!, configId: process.env.META_WHATSAPP_CONFIG_ID!, version: metaGraphVersion };
  } catch (error) { return { ok: false as const, error: safeError(error) }; }
}

export async function finishWhatsAppConnectionAction(input: z.infer<typeof finishSchema>) {
  try {
    const values = finishSchema.parse(input);
    const { admin, user } = await requireWhatsAppManager(values.restaurantId);
    if (!whatsAppSetupReady()) throw new Error('La integración de Meta no está configurada.');
    const { data: session, error: sessionError } = await admin.from('whatsapp_onboarding_sessions')
      .update({ consumed_at: new Date().toISOString() }).eq('id', values.sessionId)
      .eq('restaurant_id', values.restaurantId).eq('user_id', user.id).is('consumed_at', null)
      .gt('expires_at', new Date().toISOString()).select('id').maybeSingle();
    if (sessionError || !session) throw new Error('La sesión de enlace venció. Vuelve a abrir Conectar WhatsApp.');

    const appId = process.env.META_APP_ID!;
    const appSecret = process.env.META_APP_SECRET!;
    const exchange = await metaRequest<{ access_token: string; expires_in?: number }>(
      'oauth/access_token', `${appId}|${appSecret}`, {
        method: 'POST', form: { client_id: appId, client_secret: appSecret, code: values.code },
      },
    );
    if (!exchange.access_token) throw new Error('Meta no devolvió una autorización válida.');
    const token = exchange.access_token;
    const debug = await metaRequest<{ data: { app_id: string; is_valid: boolean; scopes?: string[]; expires_at?: number } }>(
      `debug_token?input_token=${encodeURIComponent(token)}`, `${appId}|${appSecret}`,
    );
    if (!debug.data.is_valid || debug.data.app_id !== appId ||
      !['whatsapp_business_management', 'whatsapp_business_messaging'].every((scope) => debug.data.scopes?.includes(scope))) {
      throw new Error('Autoriza la administración de WhatsApp y el envío de mensajes en la ventana de Meta.');
    }
    // Verify the claimed number belongs to the WABA using the exchanged token,
    // not the browser's completion event. Fetch all pages without following an arbitrary URL.
    type Phone = { id: string; display_phone_number: string; verified_name?: string; is_on_biz_app?: boolean };
    let phone: Phone | undefined;
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const phones = await metaRequest<{ data: Phone[]; paging?: { next?: string; cursors?: { after?: string } } }>(
        `${values.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,is_on_biz_app&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`, token,
      );
      phone = phones.data.find((item) => item.id === values.phoneNumberId);
      if (phone || !phones.paging?.next || !phones.paging.cursors?.after) break;
      after = phones.paging.cursors.after;
    }
    if (!phone) throw new Error('El número seleccionado no pertenece a la cuenta de WhatsApp autorizada.');
    if (phone.is_on_biz_app !== true) throw new Error('Este enlace requiere WhatsApp Business con coexistencia. Elige conectar tu aplicación WhatsApp Business en Meta.');
    if (values.phoneNumberId === process.env.WHATSAPP_PHONE_NUMBER_ID) throw new Error('El número global de Yopido no puede asignarse a una sucursal.');

    const { data: previous, error: previousError } = await admin.from('restaurant_whatsapp_connections')
      .select('phone_number_id,status').eq('restaurant_id', values.restaurantId).maybeSingle();
    if (previousError) throw new Error('No se pudo consultar la conexión anterior.');
    if (previous && previous.phone_number_id !== phone.id) throw new Error('Esta sucursal ya tiene otro número asociado. Contacta al administrador para cambiarlo conservando el historial.');
    const expiresAt = debug.data.expires_at
      ? new Date(debug.data.expires_at * 1000).toISOString()
      : exchange.expires_in ? new Date(Date.now() + exchange.expires_in * 1000).toISOString() : null;
    const now = new Date().toISOString();
    const ciphertext = await encryptWhatsAppToken(token, process.env.WHATSAPP_CREDENTIALS_KEY!, values.restaurantId);
    const { error: saveError } = await admin.from('restaurant_whatsapp_connections').upsert({
      restaurant_id: values.restaurantId, phone_number_id: phone.id, waba_id: values.wabaId,
      display_phone_number: phone.display_phone_number, verified_name: phone.verified_name ?? null,
      token_ciphertext: ciphertext,
      token_expires_at: expiresAt, coexistence: true, status: 'pending',
      connected_by: user.id, last_error: null, last_checked_at: now,
    }, { onConflict: 'restaurant_id' });
    if (saveError) throw new Error(saveError.code === '23505' ? 'Este número ya está enlazado a otra sucursal.' : 'No se pudo guardar la conexión.');

    try {
      // Coexistence numbers are already registered. Do not call /register or
      // /deregister: the phone must remain usable in the Business App.
      const subscribed = await metaRequest<{ success: boolean }>(`${values.wabaId}/subscribed_apps`, token, { method: 'POST' });
      if (!subscribed.success) throw new Error('No se pudo activar la recepción de mensajes.');
    } catch {
      await admin.from('restaurant_whatsapp_connections').update({ status: 'needs_reconnect', last_error: 'Vuelve a conectar para activar la recepción de mensajes.' }).eq('restaurant_id', values.restaurantId).eq('phone_number_id', phone.id).eq('token_ciphertext', ciphertext).eq('status', 'pending');
      throw new Error('Meta autorizó el número, pero no pudimos activar el webhook. Vuelve a conectar.');
    }
    const { data: activated, error: activateError } = await admin.from('restaurant_whatsapp_connections')
      .update({ status: 'connected', connected_at: now, last_error: null }).eq('restaurant_id', values.restaurantId)
      .eq('phone_number_id', phone.id).eq('status', 'pending').eq('token_ciphertext', ciphertext).select('restaurant_id').maybeSingle();
    if (activateError || !activated) throw new Error('La conexión cambió durante el enlace. Revisa su estado antes de volver a conectar.');
    revalidatePath(`/admin/restaurantes/${values.restaurantId}/configuracion`);
    revalidatePath(`/admin/restaurantes/${values.restaurantId}/whatsapp`);
    return { ok: true as const, state: await getWhatsAppConnectionStatus(values.restaurantId) };
  } catch (error) { return { ok: false as const, error: safeError(error) }; }
}

export async function disconnectWhatsAppConnectionAction(restaurantId: string) {
  try {
    branchId.parse(restaurantId);
    const { admin } = await requireWhatsAppManager(restaurantId);
    // Disable this number only. Unsubscribing the whole WABA would disable
    // other branches sharing that account. Keep a tombstone for routing.
    const { error } = await admin.from('restaurant_whatsapp_connections')
      .update({ status: 'disconnected', token_ciphertext: null, last_error: null })
      .eq('restaurant_id', restaurantId);
    if (error) throw new Error('No se pudo desconectar. Intenta nuevamente.');
    revalidatePath(`/admin/restaurantes/${restaurantId}/configuracion`);
    return { ok: true as const, state: await getWhatsAppConnectionStatus(restaurantId) };
  } catch (error) { return { ok: false as const, error: safeError(error) }; }
}

export async function checkWhatsAppConnectionAction(restaurantId: string) {
  try {
    branchId.parse(restaurantId);
    const { admin } = await requireWhatsAppManager(restaurantId);
    const { data } = await admin.from('restaurant_whatsapp_connections').select('phone_number_id,waba_id,status').eq('restaurant_id', restaurantId).maybeSingle();
    if (!data || data.status === 'disconnected') throw new Error('Conecta tu número primero.');
    const sender = await resolveWhatsAppSender(restaurantId, data.phone_number_id);
    let healthy = false;
    if (sender) {
      try {
        const phone = await metaRequest<{ id: string; is_on_biz_app?: boolean }>(`${data.phone_number_id}?fields=id,is_on_biz_app`, sender.token);
        const apps = await metaRequest<{ data: Array<{ whatsapp_business_api_data?: { id: string } }> }>(`${data.waba_id}/subscribed_apps`, sender.token);
        healthy = phone.id === data.phone_number_id && phone.is_on_biz_app === true && apps.data.some((app) => app.whatsapp_business_api_data?.id === process.env.META_APP_ID);
      } catch { healthy = false; }
    }
    const { error } = await admin.from('restaurant_whatsapp_connections').update({
      status: healthy ? 'connected' : 'needs_reconnect', last_checked_at: new Date().toISOString(),
      last_error: healthy ? null : 'No se pudo verificar la autorización con Meta. Vuelve a conectar el número.',
    }).eq('restaurant_id', restaurantId).eq('status', data.status);
    if (error) throw new Error('No se pudo guardar la comprobación.');
    return { ok: true as const, state: await getWhatsAppConnectionStatus(restaurantId) };
  } catch (error) { return { ok: false as const, error: safeError(error) }; }
}
