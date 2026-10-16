"use client";
import { useFormStatus } from "react-dom";
import { branchBankAction } from "@/app/admin/restaurantes/[restaurantId]/configuracion/banco/actions";
type Connection = { id: string; label: string; active: boolean; check_result: string | null; orders_enabled: boolean; checked_at: string | null };
function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button className="min-h-12 rounded-xl bg-[var(--primary)] px-4 font-bold text-white disabled:opacity-50" disabled={pending}>{pending ? "Procesando…" : children}</button>;
}
export function BranchBankPanel({ restaurantId, connections, configured, result }: { restaurantId: string; connections: Connection[]; configured: boolean; result?: string }) {
  const active = connections.find(row => row.active);
  const messages: Record<string, string> = { saved: "Credenciales guardadas cifradas. Comprueba el acceso antes de habilitar cobros.", check: "Baneco aceptó la autenticación. Esto no mueve dinero ni certifica un pago.", enable: "QR dinámico habilitado para esta sucursal. Los nuevos pedidos QR se aceptarán automáticamente tras confirmar el pago.", disable: "Conexión desvinculada para nuevos cobros. Los QR anteriores conservan su conciliación.", "bank-connection-unavailable": "Ya existe una cuenta activa o la conexión no está disponible. Desvincúlala antes de reemplazarla.", "bank-connection-unverified": "Primero comprueba el acceso a Baneco.", "bank-forbidden": "Solo el dueño de esta sucursal o superadmin puede configurar la cuenta.", "bank-vault-not-configured": "Falta configurar el cofre de credenciales del servidor.", "bank-rejected": "Baneco rechazó las credenciales. Revisa los datos entregados por el banco.", "bank-order-ineligible": "La sucursal debe operar en BOB para habilitar estos cobros." };
  return <div className="space-y-5">
    {result ? <p className="rounded-xl border p-4 text-sm" role="status">{messages[result] ?? "No se pudo completar la operación. Revisa la conexión y vuelve a intentar sin generar cobros."}</p> : null}
    {!configured ? <p role="alert">El cofre del servidor no está configurado. No guardaremos credenciales sin cifrado.</p> : null}
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="text-lg font-black">Cuenta de cobro de esta sucursal</h2>
      <p className="mt-2 text-sm">Cada QR tiene el importe exacto del pedido. Baneco confirma el pago y Yopido lo acepta automáticamente, sin foto ni comprobante. La cuenta debe estar autorizada por el banco para estas credenciales.</p>
      <p className="mt-2 text-sm">Si no hay cuenta propia activa, el sistema podrá usar la cuenta de respaldo que superadmin haya autorizado. Ese dinero lo recibe Yopido por cuenta de tu local y se registra por separado; no es una transferencia automática a tu cuenta. Una cuenta propia activa pero sin habilitar no se sustituye silenciosamente.</p>
      <p className="mt-2 break-all text-xs text-[var(--muted)]">API oficial de producción: https://apimkt.baneco.com.bo/ApiGateway/ · No se admiten URLs arbitrarias.</p>
      {active ? <div className="mt-4 space-y-3">
        <p className="font-bold">{active.label} · {active.orders_enabled ? "Cobros habilitados" : "Cobros deshabilitados"}</p>
        <p className="text-sm">Acceso: {active.check_result === "ok" ? "autenticación verificada" : "pendiente de comprobar"}. Las claves y el número de cuenta no se vuelven a mostrar.</p>
        <div className="flex flex-wrap gap-3">{(["check", "enable", "disable"] as const).filter(op => op !== "enable" || !active.orders_enabled).map(operation => <form action={branchBankAction} key={operation} onSubmit={event => {
          if (operation !== "check" && !window.confirm(operation === "enable" ? "¿Habilitar pagos reales a esta cuenta y aceptación automática de los pedidos pagados de esta sucursal?" : "¿Impedir nuevos QR en esta cuenta? Los pagos y QR anteriores no se borran ni se anulan.")) event.preventDefault();
        }}>
          <input name="restaurantId" type="hidden" value={restaurantId} /><input name="connectionId" type="hidden" value={active.id} />
          <input name="operation" type="hidden" value={operation} /><input name="confirmed" type="hidden" value="yes" />
          <Submit>{operation === "check" ? "Comprobar acceso" : operation === "enable" ? "Habilitar cobros" : "Desvincular cuenta"}</Submit>
        </form>)}</div>
      </div> : <form action={branchBankAction} className="mt-4 grid gap-4" autoComplete="off">
        <input name="restaurantId" type="hidden" value={restaurantId} /><input name="operation" type="hidden" value="save" />
        <label className="grid gap-1 text-sm font-bold">Nombre de la conexión<input className="min-h-12 rounded-xl border bg-transparent px-3" name="label" maxLength={100} required placeholder="Cuenta principal de la sucursal" /></label>
        <label className="grid gap-1 text-sm font-bold">Formato entregado por Baneco<select className="min-h-12 rounded-xl border bg-transparent px-3" name="encryptionMode" defaultValue="bank_api"><option value="bank_api">Datos sin cifrar — cifrado mediante Baneco</option><option value="pre_encrypted">Contraseña y cuenta ya cifradas por Baneco</option></select></label>
        <div className="grid gap-4 sm:grid-cols-2">{[["userName", "Usuario Baneco", "text"], ["password", "Contraseña Baneco", "password"], ["aesKey", "Llave de cifrado Baneco", "password"], ["accountCredit", "Cuenta de abono autorizada", "password"]].map(([name, label, type]) => <label className="grid min-w-0 gap-1 text-sm font-bold" key={name}>{label}<input className="min-h-12 w-full rounded-xl border bg-transparent px-3" autoComplete="off" name={name} type={type} maxLength={512} required /></label>)}</div>
        <label className="grid gap-1 text-sm font-bold">Código de sucursal Baneco (opcional)<input className="min-h-12 rounded-xl border bg-transparent px-3" name="branchCode" maxLength={5} pattern="[A-Za-z0-9]*" /></label>
        <p className="text-xs text-[var(--muted)]">No supongas que usuario, contraseña y llave son iguales. Usa los datos entregados por Baneco. Guardar no llama al banco ni genera un pago.</p>
        <label className="flex items-start gap-2 text-sm"><input className="mt-1 h-5 w-5 shrink-0" name="acknowledged" type="checkbox" required />Soy el titular o estoy autorizado para cobrar en esta cuenta de producción.</label>
        {configured ? <Submit>Guardar cifradas</Submit> : null}
      </form>}
    </section>
    <section className="rounded-2xl border p-4 text-sm"><h2 className="font-bold">Confirmación bancaria</h2><p className="mt-2">Solicita a Baneco registrar para esta cuenta: <span className="break-all font-semibold">https://www.yopido.shop/api/qrsimple/notifyPaymentQR</span>. Mientras tanto se conserva la consulta automática de respaldo. La cuenta bancaria no se cierra al desvincularla de Yopido.</p></section>
  </div>;
}
