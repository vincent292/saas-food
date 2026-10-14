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
import { bankQrService, requireBankSuperadmin, safeBankError } from "@/lib/services/bank-qr.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { bankConnectionOperationAction, bankTestQrOperationAction, generateBankTestQrAction, saveBankConnectionAction } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const feedback: Record<string, string> = {
  saved: "Credenciales guardadas cifradas. No se realizó ninguna llamada al banco.",
  checked: "El banco aceptó las credenciales de certificación.", generated: "QR de certificación generado. No se cobró ni modificó ningún pedido.",
  disabled: "Conexión desactivada para nuevos QR. Se conserva para conciliar QR anteriores.",
  reconciled: "Consulta al banco completada. Revisa el estado de la prueba.",
  "bank-vault-not-configured": "Falta configurar la clave maestra BANK_CREDENTIALS_KEY en el servidor.",
  "bank-vault-unreadable": "No se pudieron abrir las credenciales. Revisa la clave maestra; no reemplaces la configuración sin respaldarla.",
  "bank-storage-unavailable": "Falta la migración 0120, la configuración de Supabase o el acceso a las tablas privadas.",
  "bank-production-disabled": "Producción está bloqueada en esta primera integración. Usa credenciales de certificación proporcionadas por Baneco.",
  "bank-connection-unavailable": "Conexión no disponible o ya existe una activa para ese comercio y ambiente. Desactiva la anterior antes de guardar una nueva.",
  "bank-rejected": "Baneco rechazó la operación. Verifica las credenciales, cuenta, ambiente y habilitación con el banco.",
  "bank-timeout": "El banco no respondió a tiempo. Si estabas generando un QR, no repitas a ciegas: el resultado puede ser desconocido.",
  "bank-unavailable": "No se pudo contactar al banco. Revisa conectividad y acceso desde el servidor.",
  "bank-http-error": "Respuesta HTTP inesperada del banco. No se siguieron redirecciones ni se expusieron credenciales.",
  "bank-invalid-response": "La respuesta no coincide con el contrato documentado. Necesita revisión antes de usarla.",
  "bank-invalid-qr-image": "El banco no devolvió una imagen PNG/JPEG de QR válida.",
  "bank-invalid-amount": "Usa un importe entre 0.01 y 100, con máximo dos decimales y punto decimal.",
  "bank-operation-busy": "Hay otra operación en curso o se alcanzó el límite. Espera y vuelve a consultar.",
  "bank-invalid-input": "Revisa los campos, la fecha y las confirmaciones de certificación.",
  "bank-request-unavailable": "La prueba aún no tiene un identificador de QR verificable. No se vuelve a generar automáticamente.",
  "bank-operation-failed": "No se completó la operación. No se muestran datos sensibles del proveedor.",
};
const statuses: Record<string, string> = { generating: "Generación en curso", unknown: "Resultado desconocido: revisar con banco",
  pending: "Pendiente de pago", paid: "Pago verificado en certificación", cancelled: "Anulado por banco",
  expired: "Vencido estimado: consultar banco", review: "Respuesta de pago requiere revisión" };

export default async function BankQrPage({ searchParams }: { searchParams: Promise<{ result?: string; qr?: string }> }) {
  try { await requireBankSuperadmin(); } catch { redirect("/admin?error=superadmin-required"); }
  const query = await searchParams;
  const restaurants = await restaurantService.listRestaurants();
  const data = await bankQrService.list(query.qr).then(result => ({ ...result, storageError: "" })).catch(error =>
    ({ connections: [], requests: [], storageError: safeBankError(error) }));
  const storageError = data.storageError;
  const configured = bankVaultConfigured();
  const restaurantNames = new Map(restaurants.map(restaurant => [restaurant.id, restaurant.name]));
  const active = data.connections.filter(item => item.active && item.environment === "certification");
  return (
    <AdminLayout active="/admin/pagos-qr" title="QR dinámicos / Baneco">
      <div className="mx-auto grid max-w-6xl gap-5">
        <Card className="space-y-3">
          <div className="flex items-center gap-3"><CreditCard className="h-6 w-6 text-[var(--primary)]" /><h1 className="text-2xl font-black">Laboratorio de QR dinámicos</h1></div>
          <p className="text-sm text-[var(--muted)]">Primero certificamos Baneco por comercio. Este panel no cambia pedidos, caja, inventario ni mensualidades.</p>
          <div className="flex flex-wrap gap-3 text-sm font-bold"><span className="flex items-center gap-2"><LockKeyhole className="h-4 w-4" />Credenciales cifradas por comercio</span><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Solo superadmin · producción bloqueada</span></div>
          <p className="break-all text-xs">Certificación: https://apimktdesa.baneco.com.bo/ApiGateway/</p>
        </Card>
        {query.result || storageError || !configured ? <Card className="text-sm font-semibold" role="status">{feedback[query.result ?? ""] ?? feedback[storageError] ?? (!configured ? feedback["bank-vault-not-configured"] : feedback["bank-operation-failed"])}</Card> : null}
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card className="min-w-0 [&_select]:min-w-0">
            <h2 className="mb-2 text-lg font-black">1. Guardar credenciales del comercio</h2>
            <p className="mb-4 text-sm text-[var(--muted)]">Usuario, contraseña, llave Baneco y cuenta se cifran juntos. No se vuelven a mostrar. Para rotarlas, desactiva la conexión y guarda otra; los QR antiguos conservan su versión.</p>
            <form action={saveBankConnectionAction} className="grid gap-3" autoComplete="off">
              <label className="grid gap-1 text-sm font-bold">Comercio<Select name="restaurantId" required><option value="">Seleccionar comercio</option>{restaurants.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-bold">Nombre de conexión<Input name="label" maxLength={100} required placeholder="Baneco - pruebas" /></label><label className="grid gap-1 text-sm font-bold">Ambiente<Select name="environment" defaultValue="certification"><option value="certification">Certificación / pruebas</option><option value="production">Producción (solo guardar; bloqueada)</option></Select></label></div>
              <label className="grid gap-1 text-sm font-bold">Formato de contraseña y cuenta<Select name="encryptionMode"><option value="bank_api">Sin cifrar: el servidor usa el servicio de cifrado del banco</option><option value="pre_encrypted">Ya cifradas por Baneco (base64)</option></Select></label>
              <label className="grid gap-1 text-sm font-bold">Usuario Baneco<Input name="userName" autoComplete="off" maxLength={120} required /></label>
              <label className="grid gap-1 text-sm font-bold">Contraseña Baneco (o valor ya cifrado)<Input name="password" type="password" autoComplete="new-password" maxLength={512} required /></label>
              <label className="grid gap-1 text-sm font-bold">Llave de cifrado asignada por Baneco<Input name="aesKey" type="password" autoComplete="new-password" maxLength={256} required /></label>
              <label className="grid gap-1 text-sm font-bold">Cuenta de abono (o valor ya cifrado)<Input name="accountCredit" type="password" autoComplete="off" maxLength={512} required /></label>
              <label className="grid gap-1 text-sm font-bold">Código de sucursal Baneco (opcional)<Input name="branchCode" maxLength={5} placeholder="E0001" /></label>
              <p className="text-xs text-[var(--muted)]">El PDF no define modo/IV de AES. No inventamos cifrado local compatible: usamos valores ya cifrados o el endpoint HTTPS documentado. Este último envía la llave Baneco y el texto en parámetros al banco; nunca se registra esa URL en nuestra app.</p>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="acknowledged" required className="mt-1 h-4 w-4 shrink-0" />Confirmo el comercio y ambiente de estas credenciales y autorizo su uso en este panel. Guardar no las envía al banco.</label>
              <FormSubmitButton disabled={!configured || Boolean(storageError)} label="Guardar cifradas" pendingLabel="Cifrando..." />
            </form>
          </Card>
          <Card className="min-w-0 [&_select]:min-w-0">
            <h2 className="mb-2 text-lg font-black">2. Generar un QR de certificación</h2>
            <p className="mb-4 text-sm text-[var(--muted)]">Uso único, importe fijo, máximo 100. Primero usa “Comprobar” en la conexión. La consulta al banco verifica importe, moneda e ID de QR antes de mostrar pago verificado.</p>
            <form action={generateBankTestQrAction} className="grid gap-3">
              <input type="hidden" name="requestId" value={randomUUID()} />
              <label className="grid gap-1 text-sm font-bold">Conexión<Select name="connectionId" required><option value="">Seleccionar certificación</option>{active.map(item => <option key={item.id} value={item.id}>{item.label} · {restaurantNames.get(item.restaurant_id) ?? "Comercio"}</option>)}</Select></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-bold">Importe<Input name="amount" type="number" min="0.01" max="100" step="0.01" defaultValue="1.00" required /></label><label className="grid gap-1 text-sm font-bold">Moneda<Select name="currency"><option value="BOB">BOB / Bolivianos</option><option value="USD">USD / Dólares</option></Select></label></div>
              <label className="grid gap-1 text-sm font-bold">Vencimiento (día Bolivia)<Input name="dueDate" type="date" min={boliviaDate()} defaultValue={boliviaDate()} required /></label>
              <label className="grid gap-1 text-sm font-bold">Descripción<Input name="description" maxLength={150} defaultValue="Prueba de certificación Yopido" /></label>
              <label className="flex items-start gap-2 text-sm"><input name="testAcknowledged" type="checkbox" required className="mt-1 h-4 w-4 shrink-0" />Baneco confirmó que estas credenciales son de certificación. No utilizaré dinero real ni cuenta de producción para esta prueba.</label>
              <FormSubmitButton label="Generar QR de prueba" pendingLabel="Consultando banco..." disabled={!configured || !active.length || Boolean(storageError)} />
            </form>
            <p className="mt-4 text-xs text-[var(--muted)]">Si una generación tarda o falla, no se repite automáticamente: Baneco podría haberla recibido. El estado desconocido requiere revisar con el banco.</p>
          </Card>
        </div>
        <Card><h2 className="mb-3 text-lg font-black">Últimas 100 conexiones guardadas</h2><div className="grid gap-3">{!data.connections.length ? <p className="text-sm">Todavía no hay conexiones.</p> : data.connections.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div className="min-w-0"><p className="font-bold">{item.label}</p><p className="text-sm">{restaurantNames.get(item.restaurant_id) ?? "Comercio"} · {item.environment === "certification" ? "Certificación" : "Producción bloqueada"} · {item.active ? "Activa" : "Desactivada"}</p><p className="text-xs">{item.check_result === "ok" ? "Última comprobación: correcta" : item.check_result === "error" ? "Última comprobación: fallida" : "Sin comprobar"}</p></div>
          {item.active ? <div className="flex flex-wrap gap-2"><form action={bankConnectionOperationAction}><input type="hidden" name="connectionId" value={item.id} /><input type="hidden" name="operation" value="check" /><FormSubmitButton label="Comprobar" variant="secondary" disabled={!configured || item.environment !== "certification"} /></form><form action={bankConnectionOperationAction}><input type="hidden" name="connectionId" value={item.id} /><input type="hidden" name="operation" value="disable" /><FormSubmitButton label="Desactivar" variant="secondary" /></form></div> : null}
        </div>)}</div></Card>
        <Card><h2 className="mb-3 text-lg font-black">Últimas 30 pruebas</h2><p className="mb-4 text-sm">Consultar no cobra ni aprueba pedidos. Una anulación se confirma con una segunda consulta al banco.</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{!data.requests.length ? <p className="text-sm">Todavía no hay pruebas.</p> : data.requests.map(item => <div key={item.id} className="min-w-0 rounded-2xl border border-[var(--border)] p-4">
          <p className="font-black">{item.currency} {Number(item.amount).toFixed(2)} · {statuses[item.status]}</p><p className="text-sm">{restaurantNames.get(item.restaurant_id) ?? "Comercio"} · vence {item.due_date}</p><p className="mt-2 break-all text-xs">Referencia: {item.transaction_id}</p>{item.qr_id ? <p className="break-all text-xs">QR: {item.qr_id}</p> : null}
          {/* Bank adapter accepts PNG/JPEG only; no remote URL or SVG content. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {item.qr_image ? <img src={item.qr_image} alt={`QR de certificación por ${item.currency} ${Number(item.amount).toFixed(2)}`} className="mx-auto my-3 aspect-square w-full max-w-56 rounded-xl object-contain" /> : null}
          {item.qr_id && !item.qr_image ? <Link href={`/admin/pagos-qr?qr=${encodeURIComponent(item.id)}`} className="my-3 inline-flex min-h-10 items-center text-sm font-bold underline">Ver imagen del QR</Link> : null}
          {item.last_error_code ? <p className="my-2 text-xs">{feedback[item.last_error_code] ?? feedback["bank-operation-failed"]}</p> : null}
          {item.qr_id && !["paid", "cancelled"].includes(item.status) ? <div className="mt-3 flex flex-wrap gap-2"><form action={bankTestQrOperationAction}><input type="hidden" name="requestId" value={item.id} /><input type="hidden" name="operation" value="status" /><FormSubmitButton label="Consultar" variant="secondary" disabled={!configured} /></form><form action={bankTestQrOperationAction}><input type="hidden" name="requestId" value={item.id} /><input type="hidden" name="operation" value="cancel" /><FormSubmitButton label="Anular QR" variant="secondary" disabled={!configured || item.status === "review"} /></form></div> : null}
        </div>)}</div></Card>
      </div>
    </AdminLayout>
  );
}
