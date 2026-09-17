'use client';

import Script from 'next/script';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { prepareWhatsAppConnectionAction, finishWhatsAppConnectionAction, disconnectWhatsAppConnectionAction, checkWhatsAppConnectionAction } from '@/app/admin/restaurantes/[restaurantId]/whatsapp/connection-actions';
import type { WhatsAppConnectionStatus } from '@/types/whatsapp-connection.types';

type FacebookSdk = {
  init(options: { appId: string; version: string; xfbml: boolean; cookie: boolean }): void;
  login(callback: (response: { authResponse?: { code?: string } }) => void, options: Record<string, unknown>): void;
};
type Prepared = { sessionId: string; appId: string; configId: string; version: string };
const labels = { connected: 'Conectado', pending: 'Conexión incompleta', disconnected: 'Desconectado', needs_reconnect: 'Necesita reconexión' };

export function WhatsAppConnectionPanel({ restaurantId, restaurantName, initialState }: {
  restaurantId: string; restaurantName: string; initialState: WhatsAppConnectionStatus;
}) {
  const [state, setState] = useState(initialState);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const pending = useRef<{ session: Prepared; code?: string; phoneNumberId?: string; wabaId?: string; saving?: boolean } | null>(null);

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (!['https://www.facebook.com', 'https://web.facebook.com'].includes(event.origin) || !pending.current) return;
      let payload: { type?: string; event?: string; data?: { phone_number_id?: string; waba_id?: string } };
      try { payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
      if (!payload || payload.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (payload.event === 'CANCEL' || payload.event === 'ERROR') {
        pending.current = null; setBusy(false); setPrepared(null);
        setMessage('El enlace no se completó. Puedes volver a intentarlo.'); return;
      }
      if (payload.event !== 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' && payload.event !== 'FINISH') return;
      const phoneNumberId = payload.data?.phone_number_id;
      const wabaId = payload.data?.waba_id;
      if (!phoneNumberId || !wabaId || !/^\d+$/.test(phoneNumberId) || !/^\d+$/.test(wabaId)) return;
      Object.assign(pending.current, { phoneNumberId, wabaId });
      void complete();
    }
    async function complete() {
      const value = pending.current;
      if (!value || value.saving || !value.code || !value.phoneNumberId || !value.wabaId) return;
      value.saving = true;
      try {
        const result = await finishWhatsAppConnectionAction({ restaurantId, sessionId: value.session.sessionId, code: value.code, phoneNumberId: value.phoneNumberId, wabaId: value.wabaId });
        if (result.ok) { setState(result.state); setMessage('WhatsApp conectado. Escribe a tu número desde otro teléfono para probar el menú y los pedidos.'); }
        else setMessage(result.error);
      } catch { setMessage('No pudimos finalizar el enlace. Revisa tu conexión e inténtalo otra vez.'); }
      finally { pending.current = null; setPrepared(null); setBusy(false); }
    }
    // The SDK callback and postMessage may arrive in either order.
    function onCode() { void complete(); }
    window.addEventListener('message', receive);
    window.addEventListener('yopido-whatsapp-code', onCode);
    return () => { window.removeEventListener('message', receive); window.removeEventListener('yopido-whatsapp-code', onCode); pending.current = null; };
  }, [restaurantId]);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => {
      if (pending.current && !pending.current.saving) {
        pending.current = null; setPrepared(null); setBusy(false);
        setMessage('El enlace no se completó a tiempo. Abre nuevamente la conexión con Meta.');
      }
    }, 15 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [busy]);

  async function prepare() {
    setBusy(true); setMessage('');
    try {
      const result = await prepareWhatsAppConnectionAction(restaurantId);
      if (result.ok) setPrepared(result); else setMessage(result.error);
    } catch { setMessage('No pudimos iniciar el enlace. Intenta nuevamente.'); }
    finally { setBusy(false); }
  }
  function connect() {
    const sdk = (window as unknown as { FB?: FacebookSdk }).FB;
    if (!sdk || !prepared) { setMessage('No se pudo cargar Meta. Revisa los bloqueadores del navegador y vuelve a intentar.'); return; }
    setBusy(true); setMessage('Completa los pasos de Meta. El QR aparecerá allí cuando tu número sea elegible para coexistencia.');
    pending.current = { session: prepared };
    try {
    sdk.init({ appId: prepared.appId, version: prepared.version, xfbml: false, cookie: false });
    sdk.login((response) => {
      if (!pending.current) return;
      if (!response.authResponse?.code) {
        pending.current = null; setBusy(false); setPrepared(null); setMessage('Meta no autorizó la conexión. Puedes intentarlo nuevamente.'); return;
      }
      pending.current.code = response.authResponse.code;
      window.dispatchEvent(new Event('yopido-whatsapp-code'));
    }, {
      config_id: prepared.configId, response_type: 'code', override_default_response_type: true,
      extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' },
    });
    } catch {
      pending.current = null; setBusy(false); setPrepared(null);
      setMessage('No se pudo abrir Meta. Permite las ventanas emergentes e inténtalo nuevamente.');
    }
  }
  async function manage(action: 'check' | 'disconnect') {
    setBusy(true); setMessage('');
    try {
      const result = await (action === 'check' ? checkWhatsAppConnectionAction(restaurantId) : disconnectWhatsAppConnectionAction(restaurantId));
      if (result.ok) { setState(result.state); setMessage(action === 'check' ? 'Estado actualizado.' : 'Bot desconectado de esta sucursal. Puedes seguir usando WhatsApp Business.'); }
      else setMessage(result.error);
    } catch { setMessage('No se pudo completar la acción. Intenta nuevamente.'); }
    finally { setBusy(false); setConfirmDisconnect(false); }
  }

  return <Card className="space-y-4">
    {state.setupReady && state.canManage ? <Script src="https://connect.facebook.net/es_LA/sdk.js" strategy="afterInteractive" onReady={() => setSdkReady(true)} onError={() => setMessage('No se pudo cargar Meta. Revisa tu conexión o los bloqueadores del navegador.')} /> : null}
    <div>
      <h2 className="text-xl font-black">WhatsApp Business de {restaurantName}</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">Conecta el número de esta sucursal para recibir pedidos con tu menú, botones, carrito y bot actuales. Tus clientes hablarán directamente con tu restaurante.</p>
    </div>
    {!state.canManage ? <p>Solo el dueño o responsable de la sucursal puede administrar esta conexión.</p> : <>
      <p className="text-sm">Con coexistencia puedes seguir atendiendo desde la app WhatsApp Business. Cuando respondas desde el teléfono, el bot dejará la conversación en atención humana; podrás reactivarlo desde la bandeja de WhatsApp.</p>
      <p className="text-xs text-[var(--muted)]">Revisa los mensajes automáticos de bienvenida y ausencia de la app para evitar respuestas duplicadas con el bot.</p>
      {state.connection ? <div className="rounded-2xl bg-[var(--primary-light)] p-4">
        <p className="font-bold">{state.connection.displayPhone} · {labels[state.connection.status]}</p>
        {state.connection.verifiedName ? <p>{state.connection.verifiedName}</p> : null}
        {state.connection.lastError ? <p className="mt-2 text-sm">{state.connection.lastError}</p> : null}
      </div> : null}
      {!state.setupReady ? <p className="rounded-2xl bg-[var(--color-warning-soft)] p-4 text-sm">El administrador de Yopido todavía debe habilitar la conexión con Meta. Tu bot y menú actuales siguen disponibles.</p> : <div className="space-y-3">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Ten instalada y actualizada la app WhatsApp Business en el teléfono del negocio.</li>
          <li>Continúa con la cuenta de Meta que administra el negocio y autoriza el acceso.</li>
          <li>Elige conectar WhatsApp Business y sigue las instrucciones de Meta para escanear el QR.</li>
        </ol>
        <p className="text-xs text-[var(--muted)]">Meta verifica la elegibilidad del número y puede solicitar pasos adicionales. La cuenta de WhatsApp puede tener cargos de Meta por su uso.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy || !sdkReady} onClick={prepared ? connect : () => void prepare()}>{busy ? 'Conectando…' : prepared ? 'Continuar con Meta' : state.connection ? 'Volver a conectar WhatsApp' : 'Conectar WhatsApp Business'}</Button>
        </div>
      </div>}
      {state.connection && state.connection.status !== 'disconnected' ? <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy || !state.setupReady} onClick={() => void manage('check')}>Comprobar conexión</Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirmDisconnect(true)}>Desconectar bot</Button>
      </div> : null}
      {confirmDisconnect ? <div className="rounded-2xl border border-[var(--border)] p-4">
        <p className="mb-3 text-sm">El bot dejará de responder en este número. El historial se conserva y tu app WhatsApp Business seguirá funcionando.</p>
        <Button type="button" disabled={busy} onClick={() => void manage('disconnect')}>Confirmar desconexión</Button>
        <Button type="button" variant="secondary" onClick={() => setConfirmDisconnect(false)}>Cancelar</Button>
      </div> : null}
      <Link className="inline-block text-sm font-bold text-[var(--primary)]" href={`/admin/restaurantes/${restaurantId}/whatsapp`}>Abrir conversaciones y configurar respuestas del bot</Link>
    </>}
    {message ? <p role="status" className="rounded-2xl bg-[var(--surface)] p-3 text-sm">{message}</p> : null}
  </Card>;
}
