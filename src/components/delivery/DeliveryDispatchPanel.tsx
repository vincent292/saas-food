"use client";

import { Bike, CheckCircle2, Copy, Download, ExternalLink, MessageCircle, QrCode } from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState, useTransition } from "react";
import { createDeliveryLinkAction } from "@/app/admin/actions";
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
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

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

  async function copyLink() {
    if (!result?.ok) {
      return;
    }
    await navigator.clipboard.writeText(result.deliveryUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className={cn("rounded-2xl border border-[var(--border)] bg-white p-3", !compact && "mt-3")}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
          <Bike className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-[var(--text)]">Despacho de moto</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--muted)]">Genera QR seguro para escanear aqui o envia el link por WhatsApp.</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
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
        <div className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">
          <div className="flex items-center gap-2 font-black">
            <CheckCircle2 className="h-4 w-4" />
            QR listo para pedido {result.orderNumber}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[128px_minmax(0,1fr)]">
            <div className="grid min-h-32 place-items-center rounded-2xl bg-white p-2">
              {qrDataUrl ? (
                <Image alt={`QR de entrega ${result.orderNumber}`} className="h-28 w-28" height={112} src={qrDataUrl} unoptimized width={112} />
              ) : (
                <QrCode className="h-8 w-8 animate-pulse text-emerald-600" />
              )}
            </div>
            <div className="min-w-0 rounded-2xl bg-white/70 p-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-700">Escaneo rapido</p>
              <p className="mt-1 text-sm font-bold text-emerald-900">La moto escanea este QR y abre direccion, telefono, WhatsApp, Maps y estados.</p>
              {result.deliveryPhone ? <p className="mt-2 text-xs font-black text-emerald-700">WhatsApp: {result.deliveryPhone}</p> : null}
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {result.whatsappUrl ? (
              <a
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 text-xs font-black text-white"
                href={result.whatsappUrl}
                rel="noreferrer"
                target="_blank"
              >
                <MessageCircle className="h-4 w-4" />
                Abrir WhatsApp
              </a>
            ) : null}
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-white px-3 text-xs font-black text-emerald-800"
              onClick={copyLink}
              type="button"
            >
              <Copy className="h-4 w-4" />
              {copied ? "Copiado" : "Copiar link"}
            </button>
            {qrDataUrl ? (
              <a
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-white px-3 text-xs font-black text-emerald-800"
                download={`qr-entrega-${result.orderNumber}.png`}
                href={qrDataUrl}
              >
                <Download className="h-4 w-4" />
                Descargar QR
              </a>
            ) : null}
          </div>
          <a className="mt-2 inline-flex items-center gap-1 text-xs font-black text-emerald-800" href={result.deliveryUrl} rel="noreferrer" target="_blank">
            Vista repartidor
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : null}

      {result && !result.ok ? <div className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{result.error}</div> : null}
    </div>
  );
}
