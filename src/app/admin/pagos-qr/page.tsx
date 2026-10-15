import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CreditCard, LockKeyhole, ShieldCheck } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import { bankVaultConfigured } from "@/lib/payments/credential-vault";
import { boliviaDate } from "@/lib/payments/baneco";
import { bankPanelReadiness } from "@/lib/payments/qr-panel-readiness";
import { bankQrService, requireBankSuperadmin, safeBankError } from "@/lib/services/bank-qr.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { bankConnectionOperationAction, bankTestQrOperationAction, generateBankTestQrAction, saveBankConnectionAction } from "./actions";
import { BankQrAutoRefresh, DisconnectBankButton } from "./BankQrAutoRefresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const feedback: Record<string, string> = {
  saved: "Credenciales guardadas cifradas. No se realizó ninguna llamada al banco.",
  checked: "El banco aceptó las credenciales en el ambiente seleccionado.", generated: "QR generado. Ya puedes verlo, descargarlo y consultar su pago.",
  "production-ready": "Conexión de producción comprobada. Reutilizamos tus credenciales guardadas; ya puedes generar el QR.",
  "orders-updated": "Actualizamos el cobro de pedidos de este comercio. Los QR ya emitidos conservan su verificación automática.",
  "already-registered": "Esta solicitud ya estaba registrada. Revisa su estado abajo; no se volvió a generar otro QR.",
  disabled: "Cuenta desvinculada para nuevos QR. Los QR ya emitidos siguen vigentes y se verifican automáticamente; sus credenciales se conservan cifradas. No se ha cerrado tu cuenta bancaria.",
  reconciled: "Consulta al banco completada. Revisa el estado de la prueba.",
  "bank-vault-not-configured": "Falta configurar la clave maestra BANK_CREDENTIALS_KEY en el servidor.",
  "bank-vault-unreadable": "No se pudieron abrir las credenciales. Revisa la clave maestra; no reemplaces la configuración sin respaldarla.",
  "bank-storage-unavailable": "No se pudo acceder a los datos del panel. Revisa las migraciones y la conexión del servidor.",
  "bank-connection-unverified": "Usa Comprobar en la conexión antes de generar un QR.",
  "bank-connection-unavailable": "Conexión no disponible o ya existe una activa para ese comercio y ambiente. Desactiva la anterior antes de guardar una nueva.",
  "bank-rejected": "Baneco rechazó la operación. Verifica las credenciales, cuenta, ambiente y habilitación con el banco.",
  "bank-timeout": "El banco no respondió a tiempo. Si estabas generando un QR, no repitas a ciegas: el resultado puede ser desconocido.",
  "bank-unavailable": "No se pudo contactar al banco. Revisa conectividad y acceso desde el servidor.",
  "bank-http-error": "Respuesta HTTP inesperada del banco. No se siguieron redirecciones ni se expusieron credenciales.",
  "bank-invalid-response": "La respuesta no coincide con el contrato documentado. Necesita revisión antes de usarla.",
  "bank-invalid-qr-image": "El banco no devolvió una imagen PNG/JPEG de QR válida.",
  "bank-invalid-amount": "Usa un importe entre 0.01 y 100, con máximo dos decimales y punto decimal.",
  "bank-operation-busy": "Hay otra operación en curso o se alcanzó el límite. Espera y vuelve a consultar.",
  "bank-invalid-input": "Revisa los campos, la fecha y la confirmación del importe y ambiente.",
  "bank-request-unavailable": "La prueba aún no tiene un identificador de QR verificable. No se vuelve a generar automáticamente.",
  "bank-operation-failed": "No se completó la operación. No se muestran datos sensibles del proveedor.",
};
const statuses: Record<string, string> = { generating: "Generación en curso", unknown: "Resultado desconocido: revisar con banco",
  failed: "No se solicitó el QR: falló la conexión previa", pending: "Pendiente de pago", paid: "Pago verificado por el banco", cancelled: "Anulado por banco",
  expired: "Vencido estimado: consultar banco", review: "Respuesta de pago requiere revisión" };
const stageNames: Record<string, string> = { "password-encryption": "Cifrado de acceso", authentication: "Autenticación", "account-encryption": "Cifrado de cuenta", generation: "Generación del QR", status: "Consulta de pago", cancellation: "Anulación" };
function BankDiagnostic({ item }: { item: { last_error_stage: string | null; last_http_status: number | null; last_bank_code: number | null } }) {
  const details = [item.last_error_stage ? `Etapa: ${stageNames[item.last_error_stage] ?? "Operación bancaria"}` : null,
    item.last_http_status !== null ? `HTTP ${item.last_http_status}` : null,
    item.last_bank_code !== null ? `Código del banco: ${item.last_bank_code}` : null].filter(Boolean);
  return details.length ? <p className="mt-1 text-xs font-semibold">{details.join(" · ")}</p> : null;
}

export default async function BankQrPage({ searchParams }: { searchParams: Promise<{ result?: string; qr?: string; stage?: string; http?: string; bank?: string }> }) {
  try { await requireBankSuperadmin(); } catch { redirect("/admin?error=superadmin-required"); }
  const query = await searchParams;
  const numericCode = (value: string | undefined, min: number, max: number) => value && /^-?\d{1,10}$/.test(value) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
  const queryDiagnostic = { last_error_stage: query.stage && Object.hasOwn(stageNames, query.stage) ? query.stage : null,
    last_http_status: numericCode(query.http, 100, 599), last_bank_code: numericCode(query.bank, -2147483647, 2147483647) };
  const restaurants = await restaurantService.listRestaurants();
  const data = await bankQrService.list(query.qr).then(result => ({ ...result, storageError: "" })).catch(error =>
    ({ connections: [], requests: [], storageError: safeBankError(error) }));
  const storageError = data.storageError;
  const configured = bankVaultConfigured();
  const restaurantNames = new Map(restaurants.map(restaurant => [restaurant.id, restaurant.name]));
  const active = data.connections.filter(item => item.active && item.check_result === "ok");
  const productionRestaurants = new Set(data.connections.filter(item => item.active && item.environment === "production").map(item => item.restaurant_id));
  const readiness = bankPanelReadiness({ vaultConfigured: configured, storageError: Boolean(storageError), verifiedConnections: active.length });
  const blockerText = {
    vault: "Guardar y generar están bloqueados porque falta una clave maestra válida en el servidor. Configura BANK_CREDENTIALS_KEY en Vercel y vuelve a desplegar. No es la llave que te entregó Baneco.",
    storage: "No se pudo acceder a las conexiones. Revisa la configuración del servidor y las migraciones.",
    connection: "Primero comprueba una conexión. Si tus datos son de producción y los guardaste en certificación, usa «Usar en producción» en la conexión de abajo.",
  };
  return (
    <AdminLayout active="/admin/pagos-qr" title="QR dinámicos / Baneco">
      <div className="mx-auto grid max-w-6xl gap-5">
        <Card className="space-y-3">
          <BankQrAutoRefresh />
          <div className="flex items-center gap-3"><CreditCard className="h-6 w-6 text-[var(--primary)]" /><h1 className="text-2xl font-black">QR dinámicos por comercio</h1></div>
          <p className="text-sm text-[var(--muted)]">Los pagos confirmados actualizan este panel en vivo. Las pruebas manuales tienen un límite de 100; los cobros vinculados a pedidos usan el total del pedido.</p>
          <p className="text-sm">Activa «Cobrar pedidos» en cada cuenta para ofrecer QR dinámicos en el menú de ese comercio.</p>
          <details className="text-sm"><summary className="cursor-pointer font-bold">Activar avisos inmediatos de Baneco</summary><p className="mt-2">Solicita a Baneco registrar esta URL de notificación para tu cuenta:</p><code className="mt-2 block break-all rounded-xl bg-[var(--primary-light)] p-3">https://www.yopido.shop/api/qrsimple/notifyPaymentQR</code><p className="mt-2">Al recibir el aviso consultamos al banco y mostramos el resultado en vivo. Mientras Baneco no lo registre, o si un aviso no llega, el verificador de respaldo consulta cada 1–2 minutos.</p></details>
          <div className="flex flex-wrap gap-3 text-sm font-bold"><span className="flex items-center gap-2"><LockKeyhole className="h-4 w-4" />Credenciales cifradas por comercio</span><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Solo superadmin</span></div>
          <p className="text-sm">Producción permite pagos reales a la cuenta del comercio. Certificación utiliza el ambiente de pruebas del banco.</p>
        </Card>
        {query.result ? <Card className="text-sm font-semibold" role="status">{feedback[query.result] ?? feedback["bank-operation-failed"]}<BankDiagnostic item={queryDiagnostic} /></Card> : null}
        <Card className="space-y-2 text-sm" role={readiness.canSave ? "status" : "alert"}>
          <p className="font-bold">Estado del servidor</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2"><span>Protección de credenciales: <strong>{configured ? "configurada" : "pendiente"}</strong></span><span>Base de datos privada: <strong>{storageError ? "no disponible" : "disponible"}</strong></span></div>
          {readiness.saveBlocker ? <p>{blockerText[readiness.saveBlocker]}</p> : <p>{active.length ? "Conexión comprobada: lista para generar QR." : "Comprueba tu conexión o reutilízala en producción desde la lista de abajo."}</p>}
        </Card>
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card className="min-w-0 [&_select]:min-w-0">
            <details open={!data.connections.length}>
            <summary className="mb-2 cursor-pointer text-lg font-black">Guardar otra conexión</summary>
            <p className="mb-4 text-sm text-[var(--muted)]">Usuario, contraseña, llave Baneco y cuenta se cifran juntos. No se vuelven a mostrar. Para rotarlas, desactiva la conexión y guarda otra; los QR antiguos conservan su versión.</p>
            <form action={saveBankConnectionAction} className="grid gap-3" autoComplete="off">
              <label className="grid gap-1 text-sm font-bold">Comercio<Select name="restaurantId" required><option value="">Seleccionar comercio</option>{restaurants.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-bold">Nombre de conexión<Input name="label" maxLength={100} required placeholder="Baneco del comercio" /></label><label className="grid gap-1 text-sm font-bold">Ambiente<Select name="environment" defaultValue="production"><option value="production">Producción — pagos reales</option><option value="certification">Certificación / pruebas</option></Select></label></div>
              <label className="grid gap-1 text-sm font-bold">Formato de contraseña y cuenta<Select name="encryptionMode"><option value="bank_api">Sin cifrar: el servidor usa el servicio de cifrado del banco</option><option value="pre_encrypted">Ya cifradas por Baneco (base64)</option></Select></label>
              <p className="text-xs text-[var(--muted)]">Elige “Ya cifradas” solo si la contraseña y la cuenta fueron entregadas cifradas en base64. Si escribes la contraseña y el número de cuenta normales, usa “Sin cifrar”. La llave Baneco no sustituye la contraseña.</p>
              <label className="grid gap-1 text-sm font-bold">Usuario Baneco<Input name="userName" autoComplete="off" maxLength={120} required /></label>
              <label className="grid gap-1 text-sm font-bold">Contraseña Baneco (o valor ya cifrado)<Input name="password" type="password" autoComplete="new-password" maxLength={512} required /></label>
              <label className="grid gap-1 text-sm font-bold">Llave de cifrado asignada por Baneco<Input name="aesKey" type="password" autoComplete="new-password" maxLength={256} required /></label>
              <label className="grid gap-1 text-sm font-bold">Cuenta de abono (o valor ya cifrado)<Input name="accountCredit" type="password" autoComplete="off" maxLength={512} required /></label>
              <label className="grid gap-1 text-sm font-bold">Código de sucursal Baneco (opcional)<Input name="branchCode" maxLength={5} placeholder="E0001" /></label>
              <p className="text-xs text-[var(--muted)]">El PDF no define modo/IV de AES. No inventamos cifrado local compatible: usamos valores ya cifrados o el endpoint HTTPS documentado. Este último envía la llave Baneco y el texto en parámetros al banco; nunca se registra esa URL en nuestra app.</p>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="acknowledged" required className="mt-1 h-4 w-4 shrink-0" />Confirmo el comercio y ambiente de estas credenciales y autorizo su uso en este panel. Guardar no las envía al banco.</label>
              {readiness.saveBlocker ? <p id="bank-save-blocker" className="text-sm font-semibold" role="status">{blockerText[readiness.saveBlocker]}</p> : null}
              <FormSubmitButton describedBy={readiness.saveBlocker ? "bank-save-blocker" : undefined} disabled={!readiness.canSave} label="Guardar cifradas" pendingLabel="Cifrando..." />
            </form>
            </details>
            {data.connections.length ? <p className="mt-3 text-sm text-[var(--muted)]">Tus credenciales ya están guardadas. Usa las conexiones de abajo para comprobarlas o habilitarlas en producción, sin volver a ingresarlas.</p> : null}
          </Card>
          <Card className="min-w-0 [&_select]:min-w-0">
            <h2 className="mb-2 text-lg font-black">Generar QR</h2>
            <p className="mb-4 text-sm text-[var(--muted)]">Uso único, importe fijo, máximo 100. Primero usa “Comprobar” en la conexión. La consulta al banco verifica importe, moneda e ID de QR antes de mostrar pago verificado.</p>
            <form action={generateBankTestQrAction} className="grid gap-3">
              <input type="hidden" name="requestId" value={randomUUID()} />
              <label className="grid gap-1 text-sm font-bold">Conexión comprobada<Select name="connectionId" defaultValue={active.length === 1 ? active[0].id : ""} required><option value="">Seleccionar conexión</option>{active.map(item => <option key={item.id} value={item.id}>{item.label} · {restaurantNames.get(item.restaurant_id) ?? "Comercio"} · {item.environment === "production" ? "PRODUCCIÓN" : "Certificación"}</option>)}</Select></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-bold">Importe<Input name="amount" type="number" min="0.01" max="100" step="0.01" defaultValue="1.00" required /></label><label className="grid gap-1 text-sm font-bold">Moneda<Select name="currency"><option value="BOB">BOB / Bolivianos</option><option value="USD">USD / Dólares</option></Select></label></div>
              <label className="grid gap-1 text-sm font-bold">Vencimiento (día Bolivia)<Input name="dueDate" type="date" min={boliviaDate()} defaultValue={boliviaDate()} required /></label>
              <label className="grid gap-1 text-sm font-bold">Descripción<Input name="description" maxLength={150} defaultValue="Prueba QR Yopido" /></label>
              <label className="flex items-start gap-2 text-sm"><input name="testAcknowledged" type="checkbox" required className="mt-1 h-4 w-4 shrink-0" />Confirmo el importe y la conexión seleccionada. En producción, este QR permite un pago real a la cuenta configurada.</label>
              {readiness.generateBlocker ? <p id="bank-generate-blocker" className="text-sm font-semibold" role="status">{blockerText[readiness.generateBlocker]}</p> : null}
              <FormSubmitButton describedBy={readiness.generateBlocker ? "bank-generate-blocker" : undefined} label="Generar QR" pendingLabel="Consultando banco..." disabled={!readiness.canGenerate} />
            </form>
            <p className="mt-4 text-xs text-[var(--muted)]">Si una generación tarda o falla, no se repite automáticamente: Baneco podría haberla recibido. El estado desconocido requiere revisar con el banco.</p>
          </Card>
        </div>
        <Card><h2 className="mb-3 text-lg font-black">Últimas 100 conexiones guardadas</h2><div className="grid gap-3">{!data.connections.length ? <p className="text-sm">Todavía no hay conexiones.</p> : data.connections.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div className="min-w-0"><p className="font-bold">{item.label}</p><p className="text-sm">{restaurantNames.get(item.restaurant_id) ?? "Comercio"} · {item.environment === "certification" ? "Certificación" : "Producción — pagos reales"} · {item.active ? "Activa" : "Desvinculada para nuevos QR"}</p><p className="text-xs">{item.check_result === "ok" ? "Última comprobación: correcta" : item.check_result === "error" ? "Última comprobación: fallida" : "Sin comprobar"}</p>{item.last_error_code ? <p className="mt-1 text-xs">{feedback[item.last_error_code] ?? feedback["bank-operation-failed"]}</p> : null}<BankDiagnostic item={item} /></div>
          {item.active ? <div className="flex flex-wrap gap-2">{item.environment === "certification" && !productionRestaurants.has(item.restaurant_id) ? <form action={bankConnectionOperationAction}><input type="hidden" name="connectionId" value={item.id} /><input type="hidden" name="operation" value="production" /><FormSubmitButton label="Usar en producción" pendingLabel="Comprobando producción..." disabled={!readiness.canSave} /></form> : null}{item.environment === "production" && item.check_result === "ok" ? <form action={bankConnectionOperationAction}><input type="hidden" name="connectionId" value={item.id} /><input type="hidden" name="operation" value={item.orders_enabled ? "disable-orders" : "enable-orders"} /><FormSubmitButton label={item.orders_enabled ? "Dejar de cobrar pedidos" : "Cobrar pedidos"} variant="secondary" /></form> : null}<form action={bankConnectionOperationAction}><input type="hidden" name="connectionId" value={item.id} /><input type="hidden" name="operation" value="check" /><FormSubmitButton label="Comprobar" variant="secondary" disabled={!readiness.canSave} /></form><form action={bankConnectionOperationAction}><input type="hidden" name="connectionId" value={item.id} /><input type="hidden" name="operation" value="disable" /><DisconnectBankButton /></form></div> : null}
        </div>)}</div></Card>
        <Card><h2 className="mb-3 text-lg font-black">Últimos 30 QR</h2><p className="mb-4 text-sm">Los pagos vinculados se registran una sola vez en su pedido y caja tras confirmarse con Baneco. La preparación se aprueba desde el local. Una anulación se confirma con una segunda consulta al banco.</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{!data.requests.length ? <p className="text-sm">Todavía no hay pruebas.</p> : data.requests.map(item => <div key={item.id} className="min-w-0 rounded-2xl border border-[var(--border)] p-4">
          <p className="font-black">{item.currency} {Number(item.amount).toFixed(2)} · {statuses[item.status]}</p><p className="text-sm font-semibold">{item.environment === "production" ? "Producción — pago real" : "Certificación"}</p><p className="text-sm">{restaurantNames.get(item.restaurant_id) ?? "Comercio"} · vence {item.due_date}</p><p className="mt-2 break-all text-xs">Referencia: {item.transaction_id}</p>{item.qr_id ? <p className="break-all text-xs">QR: {item.qr_id}</p> : null}
          {item.order_id ? <p className="mt-2 text-xs font-semibold">Pedido vinculado · {item.application_state === "applied" ? "Cobro registrado en caja" : item.application_state === "waiting_cash" ? "Pago recibido; asiento pendiente hasta abrir caja" : item.application_state === "review" ? "Pago requiere revisión del local" : "Esperando confirmación bancaria"}</p> : null}
          {/* Bank adapter accepts PNG/JPEG only; no remote URL or SVG content. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {item.qr_image && !["paid", "cancelled", "expired", "review"].includes(item.status) ? <img src={item.qr_image} alt={`QR por ${item.currency} ${Number(item.amount).toFixed(2)}`} className="mx-auto my-3 aspect-square w-full max-w-56 rounded-xl object-contain" /> : null}
          {item.qr_image && !["paid", "cancelled", "expired", "review"].includes(item.status) ? <a href={item.qr_image} download={`yopido-qr-${item.id}.${item.qr_image.startsWith("data:image/jpeg") ? "jpg" : "png"}`} className="inline-flex min-h-10 items-center text-sm font-bold underline">Descargar QR</a> : null}
          {item.qr_id && !item.qr_image && !["paid", "cancelled", "expired", "review"].includes(item.status) ? <Link href={`/admin/pagos-qr?qr=${encodeURIComponent(item.id)}`} className="my-3 inline-flex min-h-10 items-center text-sm font-bold underline">Ver imagen del QR</Link> : null}
          {item.status === "paid" ? <p className="my-3 font-bold text-emerald-700">Pago confirmado. QR de uso único: no vuelvas a pagarlo.</p> : null}
          {item.status === "paid" && item.order_id && ["review", "waiting_cash"].includes(item.application_state) ? <form action={bankTestQrOperationAction}><input type="hidden" name="requestId" value={item.id} /><input type="hidden" name="operation" value="apply" /><FormSubmitButton label="Reintentar registro del pago" variant="secondary" /></form> : null}
          {item.qr_id && !["paid", "cancelled"].includes(item.status) ? <p className="mt-2 text-xs">Verificación automática activa{["expired", "review"].includes(item.status) ? " · revisión periódica cada hora" : ""}.{item.verified_at ? ` Última respuesta: ${new Date(item.verified_at).toLocaleString("es-BO", { timeZone: "America/La_Paz" })}.` : " Esperando respuesta del banco."}</p> : null}
          {item.last_error_code ? <p className="my-2 text-xs">{feedback[item.last_error_code] ?? feedback["bank-operation-failed"]}</p> : null}
          <BankDiagnostic item={item} />
          {item.qr_id && !["paid", "cancelled"].includes(item.status) ? <div className="mt-3 flex flex-wrap gap-2"><form action={bankTestQrOperationAction}><input type="hidden" name="requestId" value={item.id} /><input type="hidden" name="operation" value="status" /><FormSubmitButton label="Consultar" variant="secondary" disabled={!configured} /></form><form action={bankTestQrOperationAction}><input type="hidden" name="requestId" value={item.id} /><input type="hidden" name="operation" value="cancel" /><FormSubmitButton label="Anular QR" variant="secondary" disabled={!configured || item.status === "review"} /></form></div> : null}
        </div>)}</div></Card>
      </div>
    </AdminLayout>
  );
}
