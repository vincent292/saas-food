import { Bike, CheckCircle2, FileCheck2, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { submitRiderApplicationAction } from "@/app/riders/actions";
import { PublicThemeToggle } from "@/components/public-theme/PublicThemeToggle";
import { QrPaymentViewer } from "@/components/payments/QrPaymentViewer";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { riderService } from "@/lib/services/rider.service";
import { formatMoney } from "@/lib/utils/money";

const errorMessages: Record<string, string> = {
  duplicate: "Ya existe una solicitud pendiente o aprobada con ese CI o placa para este restaurante.",
  "invalid-file": "Los respaldos deben ser imagenes de hasta 5 MB. El comprobante tambien puede ser PDF.",
  "invalid-invite": "Este link de registro ya no esta disponible.",
  invalid: "Revisa los datos obligatorios del formulario.",
  "payment-unconfigured": "El QR de pago para riders aun no esta configurado.",
  "save-failed": "No se pudo guardar la solicitud. Intenta de nuevo.",
  "service-role-required": "Falta configurar el servidor para recibir solicitudes.",
  "upload-failed": "No se pudieron subir los respaldos. Intenta con imagenes mas livianas.",
};

export default async function RiderApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ inviteToken: string }>;
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const [{ inviteToken }, status] = await Promise.all([params, searchParams]);
  const invite = await riderService.getPublicInvite(inviteToken);

  if (!invite) {
    notFound();
  }

  const sent = status.sent === "1";
  const errorMessage = status.error ? errorMessages[status.error] ?? `No se pudo enviar: ${status.error}.` : "";

  return (
    <main className="public-brand-theme min-h-screen bg-[var(--background)] px-4 py-5 text-[var(--text)] sm:px-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex justify-end">
          <PublicThemeToggle />
        </div>

        <section className="rounded-[1.5rem] bg-[linear-gradient(145deg,var(--primary)_0%,var(--primary-dark)_100%)] p-5 text-[var(--color-on-primary)] shadow-xl md:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <Badge className="bg-[var(--surface)]/10 text-[var(--color-on-primary)]">
                <Bike className="mr-1.5 h-3.5 w-3.5" />
                Registro de rider
              </Badge>
              <h1 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">Afiliacion para {invite.restaurant.name}</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--color-on-primary-muted)]">
                Completa tus datos, sube tus respaldos y envia el comprobante de membresia. Cada envio queda como una solicitud nueva para revision.
              </p>
            </div>
            {invite.restaurant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={invite.restaurant.name} className="h-20 w-20 shrink-0 rounded-2xl bg-white object-cover" src={invite.restaurant.logoUrl} />
            ) : (
              <span className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-[var(--accent)] text-2xl font-black text-[var(--primary)]">
                {invite.restaurant.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
        </section>

        {sent ? (
          <Card className="border-[var(--color-success-soft)] bg-[var(--color-success-soft)] text-[var(--color-success-strong)]">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h2 className="font-black">Solicitud enviada</h2>
                <p className="mt-1 text-sm font-bold leading-6">El equipo de yopido.shop revisara documentos y pago. Cuando este aprobada, el rider podra activarse en la app.</p>
              </div>
            </div>
          </Card>
        ) : null}

        {errorMessage ? (
          <Card className="border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]">
            <p className="text-sm font-black">{errorMessage}</p>
          </Card>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form action={submitRiderApplicationAction} className="space-y-5">
            <input name="inviteToken" type="hidden" value={invite.inviteToken} />

            <Card className="grid gap-4 md:grid-cols-2">
              <SectionTitle className="md:col-span-2" title="Datos del rider" description="Usaremos estos datos para validar identidad y habilitar acceso cuando la solicitud sea aprobada." />
              <Input autoComplete="name" name="fullName" placeholder="Nombre completo" required />
              <Input autoComplete="email" name="email" placeholder="Correo para la futura app" required type="email" />
              <Input autoComplete="tel" name="phone" placeholder="WhatsApp / celular" required type="tel" />
              <Input name="documentNumber" placeholder="CI / carnet de identidad" required />
            </Card>

            <Card className="grid gap-4 md:grid-cols-2">
              <SectionTitle className="md:col-span-2" title="Moto y propietario" description="La placa y RUAT deben coincidir con los respaldos subidos." />
              <Input name="plateNumber" placeholder="Placa, numero y letras" required />
              <Input name="ruatNumber" placeholder="Numero de RUAT" required />
              <Input className="md:col-span-2" name="vehicleOwnerName" placeholder="Nombre del propietario de la moto" required />
            </Card>

            <Card className="grid gap-4">
              <SectionTitle title="Respaldos" description="Sube fotos claras, completas y legibles. Las imagenes se optimizan antes de enviar." />
              <div className="grid gap-4 md:grid-cols-2">
                <CompressedImageInput help="Foto frontal del carnet." label="CI anverso" name="ciFrontFile" required />
                <CompressedImageInput help="Foto posterior del carnet." label="CI reverso" name="ciBackFile" required />
                <CompressedImageInput help="Foto frontal del RUAT." label="RUAT anverso" name="ruatFrontFile" required />
                <CompressedImageInput help="Foto posterior del RUAT." label="RUAT reverso" name="ruatBackFile" required />
                <CompressedImageInput help="Carnet del propietario registrado en el RUAT." label="Carnet propietario" name="ownerDocumentFile" required />
                <CompressedImageInput help="Foto clara donde se vea la placa de la moto." label="Foto de placa / moto" name="platePhotoFile" required />
              </div>
            </Card>

            <Card className="grid gap-4">
              <SectionTitle title="Comprobante" description={`Membresia mensual: ${formatMoney(invite.payment.amount, invite.payment.currency)}.`} />
              <CompressedImageInput acceptPdf help="Sube captura o PDF del pago realizado al QR indicado." label="Comprobante de pago" name="paymentProofFile" required />
              <button className={buttonClasses("primary", "min-h-12 w-full text-base")} type="submit">
                <FileCheck2 className="h-5 w-5" />
                Enviar solicitud
              </button>
            </Card>
          </form>

          <aside className="space-y-5 lg:sticky lg:top-5 lg:self-start">
            <Card className="space-y-4">
              <SectionTitle title="Pago mensual" description="Este pago habilita revision y membresia inicial si la solicitud es aprobada." />
              <div className="rounded-2xl bg-[var(--color-surface)] p-4">
                <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">Monto</p>
                <p className="mt-1 text-3xl font-black text-[var(--color-heading)]">{formatMoney(invite.payment.amount, invite.payment.currency)}</p>
              </div>
              {invite.payment.qrUrl ? (
                <QrPaymentViewer
                  downloadFileName="qr-rider-yopido.png"
                  imageClassName="h-auto w-full aspect-square"
                  subtitle="Paga la membresia y sube el comprobante en este formulario."
                  title="QR membresia rider"
                  url={invite.payment.qrUrl}
                />
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-sm font-bold text-[var(--color-secondary-text)]">
                  QR pendiente de configuracion.
                </div>
              )}
              {invite.payment.qrNote ? <p className="text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">{invite.payment.qrNote}</p> : null}
            </Card>

            <Card className="space-y-3">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[var(--primary)]" />
                <div>
                  <h2 className="font-black text-[var(--color-heading)]">Revision manual</h2>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
                    El restaurante solo podra usar riders aprobados y afiliados a su cuenta. Esta solicitud no activa acceso automatico.
                  </p>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
