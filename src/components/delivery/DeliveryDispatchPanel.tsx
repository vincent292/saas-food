"use client";

import { Bike, CheckCircle2, Copy, Download, ExternalLink, MessageCircle, QrCode, Search } from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState, useTransition } from "react";
import { createDeliveryLinkAction, requestRiderAutoDispatchAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import type { Order } from "@/types/order.types";

type DeliveryLinkResult =
  | {
      ok: true;
      orderNumber: string;
      deliveryUrl: string;
      whatsappUrl: string;
      deliveryPhone: string;
      expiresAt: string;
    }
  | {
      ok: false;
      error: string;
    };

type RiderDispatchResult =
  | {
      ok: true;
      status: string;
      message: string;
    }
  | {
      ok: false;
      error: string;
    };

export function DeliveryDispatchPanel({
  order,
  restaurantSlug,
  compact = false,
}: {
  order: Order;
  restaurantSlug: string;
  compact?: boolean;
}) {
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliveryName, setDeliveryName] = useState("");
  const [result, setResult] = useState<DeliveryLinkResult | null>(null);
  const [dispatchResult, setDispatchResult] = useState<RiderDispatchResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDispatchPending, startDispatchTransition] = useTransition();

  useEffect(() => {
    if (!result?.ok) {
      return;
    }

    let isMounted = true;
    QRCode.toDataURL(result.deliveryUrl, { errorCorrectionLevel: "M", margin: 2, width: 320 })
      .then((dataUrl) => {
        if (isMounted) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (isMounted) {
          setQrDataUrl("");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [result]);

  if (order.orderType !== "delivery" || order.status !== "ready") {
    return null;
  }

  function submit() {
    setResult(null);
    setQrDataUrl("");
    setCopied(false);
    startTransition(async () => {
      const response = (await createDeliveryLinkAction({
        restaurantId: order.restaurantId,
        restaurantSlug,
        orderId: order.id,
        deliveryPhone,
        deliveryName,
      })) as DeliveryLinkResult;
      setResult(response);
    });
  }

  function searchRider() {
    setDispatchResult(null);
    startDispatchTransition(async () => {
      const response = (await requestRiderAutoDispatchAction({
        restaurantId: order.restaurantId,
        orderId: order.id,
      })) as RiderDispatchResult;
      setDispatchResult(response);
    });
  }

  async function copyLink() {
    if (!result?.ok) {
      return;
    }
    await navigator.clipboard.writeText(result.deliveryUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className={cn("rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3", !compact && "mt-3")}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
          <Bike className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-[var(--text)]">Despacho de moto</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--muted)]">Primero busca rider afiliado. Si no hay disponible, usa QR seguro o WhatsApp manual.</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <Button className="min-h-11 w-full" disabled={isDispatchPending} onClick={searchRider} type="button" variant="secondary">
          <Search className="h-4 w-4" />
          {isDispatchPending ? "Buscando rider cercano..." : "Buscar rider afiliado"}
        </Button>
        {dispatchResult ? (
          <div
            className={cn(
              "rounded-2xl p-3 text-sm font-bold",
              dispatchResult.ok ? "bg-[var(--color-info-soft)] text-[var(--color-info-strong)]" : "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]",
            )}
          >
            {dispatchResult.ok ? dispatchResult.message : dispatchResult.error}
          </div>
        ) : null}
        <Input
          name="deliveryPhone"
          onChange={(event) => setDeliveryPhone(event.target.value)}
          placeholder="WhatsApp del repartidor (opcional)"
          type="tel"
          value={deliveryPhone}
        />
        <Input
          name="deliveryName"
          onChange={(event) => setDeliveryName(event.target.value)}
          placeholder="Nombre opcional"
          value={deliveryName}
        />
        <Button className="min-h-11 w-full" disabled={isPending} onClick={submit} type="button">
          <QrCode className="h-4 w-4" />
          {isPending ? "Generando..." : deliveryPhone.trim() ? "Generar QR y WhatsApp" : "Generar QR"}
        </Button>
      </div>

      {result?.ok ? (
        <div className="mt-3 rounded-2xl bg-[var(--color-success-soft)] p-3 text-sm text-[var(--color-success-strong)]">
          <div className="flex items-center gap-2 font-black">
            <CheckCircle2 className="h-4 w-4" />
            QR listo para pedido {result.orderNumber}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[128px_minmax(0,1fr)]">
            <div className="grid min-h-32 place-items-center rounded-2xl bg-[var(--surface)] p-2">
              {qrDataUrl ? (
                <Image alt={`QR de entrega ${result.orderNumber}`} className="h-28 w-28" height={112} src={qrDataUrl} unoptimized width={112} />
              ) : (
                <QrCode className="h-8 w-8 animate-pulse text-[var(--color-success)]" />
              )}
            </div>
            <div className="min-w-0 rounded-2xl bg-[var(--color-card-soft)] p-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-success-strong)]">Escaneo rapido</p>
              <p className="mt-1 text-sm font-bold text-[var(--color-success-strong)]">La moto escanea este QR y abre direccion, telefono, WhatsApp, Maps y estados.</p>
              {result.deliveryPhone ? <p className="mt-2 text-xs font-black text-[var(--color-success-strong)]">WhatsApp: {result.deliveryPhone}</p> : null}
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {result.whatsappUrl ? (
              <a
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-[var(--color-success)] px-3 text-xs font-black text-[var(--color-on-primary)]"
                href={result.whatsappUrl}
                rel="noreferrer"
                target="_blank"
              >
                <MessageCircle className="h-4 w-4" />
                Abrir WhatsApp
              </a>
            ) : null}
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-[var(--surface)] px-3 text-xs font-black text-[var(--color-success-strong)]"
              onClick={copyLink}
              type="button"
            >
              <Copy className="h-4 w-4" />
              {copied ? "Copiado" : "Copiar link"}
            </button>
            {qrDataUrl ? (
              <a
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-[var(--surface)] px-3 text-xs font-black text-[var(--color-success-strong)]"
                download={`qr-entrega-${result.orderNumber}.png`}
                href={qrDataUrl}
              >
                <Download className="h-4 w-4" />
                Descargar QR
              </a>
            ) : null}
          </div>
          <a className="mt-2 inline-flex items-center gap-1 text-xs font-black text-[var(--color-success-strong)]" href={result.deliveryUrl} rel="noreferrer" target="_blank">
            Vista repartidor
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : null}

      {result && !result.ok ? <div className="mt-3 rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm font-bold text-[var(--color-danger-strong)]">{result.error}</div> : null}
    </div>
  );
}
