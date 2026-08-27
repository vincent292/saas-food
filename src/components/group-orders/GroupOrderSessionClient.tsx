"use client";

import QRCode from "qrcode";
import { ArrowRight, Bike, Check, Clipboard, CreditCard, Lock, MapPin, Minus, Plus, Send, Share2, ShoppingBag, Store, Trash2, UserRound, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, useEffect, useMemo, useState, useTransition } from "react";
import {
  addGroupOrderItemAction,
  joinGroupOrderSessionAction,
  removeGroupOrderItemAction,
  submitGroupOrderSessionAction,
  updateGroupOrderSessionSettingsAction,
  updateGroupOrderSessionStatusAction,
  updateGroupParticipantByHostAction,
  updateGroupParticipantPaymentFormAction,
  updateGroupParticipantPaymentAction,
} from "@/app/r/actions";
import { GoogleLocationFields } from "@/components/location/GoogleLocationFields";
import { ReceiptViewerButton } from "@/components/payments/ReceiptViewerButton";
import { ProductOptionModal, type ProductConfigMap } from "@/components/public-menu/PublicRestaurantOrderClient";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { resolveDeliveryPolicy } from "@/lib/delivery-policy";
import { useRealtimeBroadcast } from "@/lib/client/use-realtime-broadcast";
import { defaultProductImage } from "@/lib/utils/default-images";
import { formatMoney } from "@/lib/utils/money";
import { productImageFitStyle, type ProductImageFit } from "@/lib/utils/product-image-fit";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
import type { Category, Product, ProductOption, ProductStockAvailability, ProductVariant } from "@/types/product.types";
import type { Restaurant, RestaurantDeliveryZone, RestaurantSettings } from "@/types/restaurant.types";

type PaymentStatus = "pending" | "qr_uploaded" | "paid_qr" | "cash_pending" | "covered_by_host" | "excluded";
export type GroupOrderSessionView = {
  id: string;
  publicToken: string;
  hostName: string;
  hostPhone?: string;
  collectMode: "host_collects" | "restaurant_collects" | "internal_cash";
  hostQrUrl?: string;
  multisiteEnabled?: boolean;
  multisiteRadiusKm?: number;
  multisiteMaxPickups?: number;
  status: "open" | "locked" | "submitting" | "submitted" | "cancelled" | "expired";
  expiresAt: string;
  submittedOrderId?: string;
  submittedOrderTrackingToken?: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
};

export type GroupOrderParticipantView = {
  id: string;
  displayName: string;
  phone?: string;
  role: "host" | "guest";
  paymentStatus: PaymentStatus;
  paymentReceiptUrl?: string;
  paymentReceiptUploadedAt?: string;
};

export type GroupOrderItemView = {
  id: string;
  participantId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  notes?: string;
};

function isDisplayImage(value?: string | null) {
  return Boolean(value && (value.startsWith("http") || value.startsWith("/")) && !value.includes("imagendefault"));
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function collectModeLabel(mode: GroupOrderSessionView["collectMode"]) {
  if (mode === "host_collects") return "Todos pagan al host";
  if (mode === "restaurant_collects") return "Cada uno paga al restaurante";
  return "Arreglo interno";
}

function paymentStatusLabel(status: PaymentStatus) {
  if (status === "qr_uploaded") return "Comprobante por revisar";
  if (status === "paid_qr") return "QR verificado";
  if (status === "cash_pending") return "Efectivo";
  if (status === "covered_by_host") return "Cubierto";
  if (status === "excluded") return "Excluido";
  return "Pendiente";
}

function paymentStatusClasses(status: PaymentStatus) {
  if (status === "paid_qr" || status === "covered_by_host") return "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]";
  if (status === "qr_uploaded") return "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]";
  if (status === "cash_pending") return "bg-[var(--primary-light)] text-[var(--primary)]";
  if (status === "excluded") return "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]";
  return "bg-[var(--color-neutral-100)] text-[var(--muted)]";
}

function localStorageKey(sessionToken: string, key: "host" | "participant") {
  return `yopido:group-order:${sessionToken}:${key}`;
}

export function GroupOrderSessionClient({
  restaurant,
  categories,
  products,
  configuration,
  settings,
  deliveryZones,
  stockAvailability,
  session,
  participants,
  items,
  initialHostAccessToken,
  initialParticipantToken,
  currentParticipantId,
  orderError,
}: {
  restaurant: Restaurant;
  categories: Category[];
  products: Product[];
  configuration: ProductConfigMap;
  settings: RestaurantSettings | null;
  deliveryZones: RestaurantDeliveryZone[];
  stockAvailability: ProductStockAvailability[];
  session: GroupOrderSessionView;
  participants: GroupOrderParticipantView[];
  items: GroupOrderItemView[];
  initialHostAccessToken?: string;
  initialParticipantToken?: string;
  currentParticipantId?: string;
  orderError?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [productQuery, setProductQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const hostAccessToken = initialHostAccessToken ?? "";
  const participantToken = initialParticipantToken ?? "";
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [clientError, setClientError] = useState("");
  const [showSubmittedDetails, setShowSubmittedDetails] = useState(false);
  const [hostOrderType, setHostOrderType] = useState<"pickup" | "delivery">(() => (settings?.pickupEnabled === false && settings.deliveryEnabled ? "delivery" : "pickup"));
  const [hostPaymentMethod, setHostPaymentMethod] = useState<"cash" | "qr" | "bank_transfer" | "card">("cash");
  const [hostAddress, setHostAddress] = useState("");
  const [hostAddressDetail, setHostAddressDetail] = useState("");
  const [hostPanelTab, setHostPanelTab] = useState<"invite" | "payments" | "finish">("payments");
  const [hostDeliveryCoordinates, setHostDeliveryCoordinates] = useState<{ latitude: number; longitude: number }>();
  const inviteUrl = typeof window === "undefined" ? "" : `${window.location.origin}${publicRestaurantPath(restaurant.slug, `grupo/${session.publicToken}`)}`;
  const isHost = Boolean(hostAccessToken);
  const currentParticipant = participants.find((participant) => participant.id === currentParticipantId);
  const isJoined = Boolean(participantToken && currentParticipant);
  const stockByProduct = useMemo(() => new Map(stockAvailability.map((availability) => [availability.productId, availability])), [stockAvailability]);
  const itemsByParticipant = useMemo(() => {
    const map = new Map<string, GroupOrderItemView[]>();
    for (const item of items) {
      const current = map.get(item.participantId) ?? [];
      current.push(item);
      map.set(item.participantId, current);
    }
    return map;
  }, [items]);
  const totalsByParticipant = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      map.set(item.participantId, (map.get(item.participantId) ?? 0) + item.subtotal);
    }
    return map;
  }, [items]);
  const activeItems = items.filter((item) => participants.find((participant) => participant.id === item.participantId)?.paymentStatus !== "excluded");
  const activeSubtotal = activeItems.reduce((sum, item) => sum + item.subtotal, 0);
  const currentParticipantTotal = totalsByParticipant.get(currentParticipantId ?? "") ?? 0;
  const pendingPaymentCount = participants.filter((participant) => {
    const amount = totalsByParticipant.get(participant.id) ?? 0;
    return amount > 0 && (participant.paymentStatus === "pending" || participant.paymentStatus === "qr_uploaded");
  }).length;
  const expiresAtDate = new Date(session.expiresAt);
  const expiresAtLabel = Number.isNaN(expiresAtDate.getTime())
    ? ""
    : new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(expiresAtDate);
  const canModifyGroup = session.status === "open" || session.status === "locked";
  const hostReadyToSubmit = session.status === "locked" && activeItems.length > 0 && pendingPaymentCount === 0;
  const participantSubmitted = Boolean(isJoined && !isHost && currentParticipant && currentParticipant.paymentStatus !== "pending");
  const participantCanAddProducts = Boolean(isJoined && session.status === "open" && !participantSubmitted);
  const showGroupDetails = !participantSubmitted || showSubmittedDetails || isHost;
  const realtimeEnabled = session.status === "open" || session.status === "locked";
  useRealtimeBroadcast({
    enabled: realtimeEnabled,
    onChange: () => router.refresh(),
    onSync: () => router.refresh(),
    topic: `group-order:${session.publicToken}`,
  });
  const pickupEnabled = settings?.pickupEnabled ?? true;
  const deliveryEnabled = settings?.deliveryEnabled ?? true;
  const qrPaymentConfigured = Boolean(settings?.qrPaymentUrl?.trim());
  const hostDeliveryPolicy = useMemo(
    () =>
      hostOrderType === "delivery"
        ? resolveDeliveryPolicy({
            restaurantLocation:
              restaurant.latitude != null && restaurant.longitude != null
                ? { latitude: restaurant.latitude, longitude: restaurant.longitude }
                : undefined,
            deliveryLocation: hostDeliveryCoordinates,
            restaurantCity: restaurant.city,
            deliveryCity: restaurant.city,
            zones: deliveryZones,
            subtotal: activeSubtotal,
            baseDeliveryFee: settings?.deliveryFee ?? 0,
            baseMinOrderAmount: settings?.minOrderAmount ?? 0,
            qrPrepaymentEnabled: settings?.deliveryQrPrepaymentEnabled ?? true,
            freeDeliveryFrom: settings?.freeDeliveryFrom ?? 0,
            farDeliveryDistanceKm: settings?.farDeliveryDistanceKm,
          })
        : null,
    [activeSubtotal, deliveryZones, hostDeliveryCoordinates, hostOrderType, restaurant.city, restaurant.latitude, restaurant.longitude, settings],
  );
  const hostDeliveryFee = hostDeliveryPolicy?.deliveryFee ?? 0;
  const hostFinalTotal = activeSubtotal + hostDeliveryFee;
  const billableParticipantIds = useMemo(
    () =>
      participants
        .filter((participant) => (totalsByParticipant.get(participant.id) ?? 0) > 0 && participant.paymentStatus !== "excluded")
        .map((participant) => participant.id),
    [participants, totalsByParticipant],
  );
  const deliverySharePreview = hostOrderType === "delivery" && hostDeliveryFee > 0 && billableParticipantIds.length ? hostDeliveryFee / billableParticipantIds.length : 0;
  const effectiveHostPaymentMethod = hostDeliveryPolicy?.requiresQrPrepayment ? "qr" : hostPaymentMethod;
  const filteredProducts = useMemo(() => {
    const queryNeedle = normalize(productQuery);
    return products.filter((product) => {
      const matchesCategory = selectedCategory === "all" || product.categoryId === selectedCategory;
      const matchesSearch = !queryNeedle || normalize(`${product.name} ${product.description}`).includes(queryNeedle);
      return matchesCategory && matchesSearch;
    });
  }, [productQuery, products, selectedCategory]);

  useEffect(() => {
    if (initialHostAccessToken) {
      window.localStorage.setItem(localStorageKey(session.publicToken, "host"), initialHostAccessToken);
    } else {
      const savedHost = window.localStorage.getItem(localStorageKey(session.publicToken, "host"));
      if (savedHost) {
        const params = new URLSearchParams(window.location.search);
        params.set("host", savedHost);
        router.replace(`${window.location.pathname}?${params.toString()}`);
      }
    }

    if (initialParticipantToken) {
      window.localStorage.setItem(localStorageKey(session.publicToken, "participant"), initialParticipantToken);
    } else {
      const savedParticipant = window.localStorage.getItem(localStorageKey(session.publicToken, "participant"));
      if (savedParticipant) {
        const params = new URLSearchParams(window.location.search);
        params.set("participant", savedParticipant);
        router.replace(`${window.location.pathname}?${params.toString()}`);
      }
    }
  }, [initialHostAccessToken, initialParticipantToken, router, session.publicToken]);

  useEffect(() => {
    if (!inviteUrl) return;
    QRCode.toDataURL(inviteUrl, { margin: 1, width: 240 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [inviteUrl]);

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setShareState("copied");
    window.setTimeout(() => setShareState("idle"), 1800);
  }

  function addConfiguredProduct(product: Product, variant: ProductVariant | null, selectedOptions: ProductOption[]) {
    if (!participantToken) {
      setClientError("Primero unete al Yopido Grupal.");
      return;
    }

    startTransition(async () => {
      setClientError("");
      const result = await addGroupOrderItemAction({
        sessionToken: session.publicToken,
        participantToken,
        productId: product.id,
        variantId: variant?.id,
        optionIds: selectedOptions.map((option) => option.id),
      });
      if (!result.ok) {
        setClientError(
          result.error === "closed"
            ? "La sesion ya fue cerrada por el host."
            : result.error === "group-item-limit"
              ? "El grupo alcanzo el limite de productos."
              : result.error === "participant-item-limit"
                ? "Alcanzaste el limite de productos para tu parte."
                : "No se pudo agregar el producto.",
        );
        return;
      }
      setSelectedProduct(null);
      router.refresh();
    });
  }

  function removeItem(itemId: string) {
    startTransition(async () => {
      const result = await removeGroupOrderItemAction({
        sessionToken: session.publicToken,
        participantToken,
        hostAccessToken,
        itemId,
      });
      if (!result.ok) {
        setClientError("No se pudo quitar el producto.");
        return;
      }
      router.refresh();
    });
  }

  function updatePayment(paymentStatus: PaymentStatus) {
    if (!participantToken) return;
    startTransition(async () => {
      const result = await updateGroupParticipantPaymentAction({
        sessionToken: session.publicToken,
        participantToken,
        paymentStatus,
      });
      if (!result.ok) {
        setClientError("No se pudo actualizar el pago.");
        return;
      }
      router.refresh();
    });
  }

  function updateHostParticipant(participantId: string, paymentStatus: PaymentStatus) {
    if (!hostAccessToken) return;
    startTransition(async () => {
      const result = await updateGroupParticipantByHostAction({
        sessionToken: session.publicToken,
        hostAccessToken,
        participantId,
        paymentStatus,
      });
      if (!result.ok) {
        setClientError("No se pudo actualizar el participante.");
        return;
      }
      router.refresh();
    });
  }

  function updateSessionStatus(status: "open" | "locked" | "cancelled") {
    if (!hostAccessToken) return;
    startTransition(async () => {
      const result = await updateGroupOrderSessionStatusAction({
        restaurantSlug: restaurant.slug,
        sessionToken: session.publicToken,
        hostAccessToken,
        status,
      });
      if (!result.ok) {
        setClientError("No se pudo cambiar el estado del grupo.");
        return;
      }
      router.refresh();
    });
  }

  function handleHostDeliveryCoordinatesChange({ latitude, longitude }: { latitude: number; longitude: number; mapsUrl: string }) {
    setHostDeliveryCoordinates({ latitude, longitude });
    setHostAddress((currentAddress) => (currentAddress.trim() ? currentAddress : "Ubicacion marcada en el mapa"));
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,var(--color-surface)_0%,var(--background)_50%,var(--color-surface)_100%)] px-3 py-4 text-[var(--text)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-col gap-3 rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link className="inline-flex items-center gap-2 text-sm font-black text-[var(--primary)]" href={publicRestaurantPath(restaurant.slug)}>
              <ArrowRight className="h-4 w-4 rotate-180" />
              Volver al menu
            </Link>
            <h1 className="mt-2 text-2xl font-black leading-tight sm:text-4xl">Yopido Grupal</h1>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
              Host: <strong className="text-[var(--text)]">{session.hostName}</strong> · {collectModeLabel(session.collectMode)}
            </p>
            {expiresAtLabel ? <p className="mt-1 text-xs font-bold text-[var(--muted)]">Vence: {expiresAtLabel}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className={session.status === "open" ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : session.status === "locked" || session.status === "submitting" ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]" : "bg-[var(--color-neutral-100)] text-[var(--muted)]"}>
              {session.status === "open" ? "Abierto" : session.status === "locked" ? "Cerrado para agregar" : session.status === "submitting" ? "Enviando" : session.status}
            </Badge>
            {isHost ? <Badge>Host</Badge> : null}
          </div>
        </header>

        {orderError || clientError ? (
          <Card className="border-[var(--color-danger-strong)] bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]">
            <p className="text-sm font-black">{clientError || orderErrorMessage(orderError ?? "")}</p>
          </Card>
        ) : null}

        {session.status === "submitted" ? (
          <Card className="space-y-3 border-[var(--color-success-soft)] bg-[var(--color-success-soft)] text-[var(--color-success-strong)]">
            <h2 className="text-xl font-black">Pedido enviado</h2>
            <p className="text-sm font-bold">El host ya envio esta sesion. El pedido entro al flujo del restaurante.</p>
            {session.submittedOrderId && session.submittedOrderTrackingToken ? (
              <Link className={buttonClasses("primary", "w-fit")} href={`${publicRestaurantPath(restaurant.slug, `pedido/${session.submittedOrderId}`)}?token=${session.submittedOrderTrackingToken}&group=1`}>
                Ver seguimiento
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
          </Card>
        ) : null}

        {session.status === "submitting" ? (
          <Card className="border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]">
            <p className="text-sm font-black">Estamos creando el pedido final. Espera un momento antes de volver a intentar.</p>
          </Card>
        ) : null}

        {session.status === "locked" ? (
          <Card className="border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]">
            <p className="text-sm font-black">El host cerro el grupo para que ya no agreguen productos. Todavia se pueden revisar pagos antes de enviar.</p>
          </Card>
        ) : null}

        {session.status === "cancelled" ? (
          <Card className="border-[var(--color-danger-strong)] bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]">
            <p className="text-sm font-black">Este Yopido Grupal fue cancelado por el host.</p>
          </Card>
        ) : null}

        <div className={cn("grid gap-5", showGroupDetails ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "lg:grid-cols-1")}>
          <section className="space-y-5">
            {!isJoined && session.status === "open" ? (
              <Card className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-[var(--radius-control)] bg-[var(--primary-light)] text-[var(--primary)]">
                    <UserRound className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-xl font-black">Unete al pedido</h2>
                    <p className="text-sm font-semibold text-[var(--muted)]">Solo necesitamos tu nombre para separar lo que pides.</p>
                  </div>
                </div>
                <form action={joinGroupOrderSessionAction} className="grid gap-3 sm:grid-cols-2">
                  <input name="restaurantSlug" type="hidden" value={restaurant.slug} />
                  <input name="sessionToken" type="hidden" value={session.publicToken} />
                  <Input name="displayName" placeholder="Tu nombre" required />
                  <Input inputMode="tel" name="phone" placeholder="WhatsApp opcional" />
                  <button className={buttonClasses("primary", "sm:col-span-2")} type="submit">
                    Entrar al pedido
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              </Card>
            ) : null}

            {participantSubmitted ? (
              <Card className="space-y-4 border-[var(--color-success-soft)] bg-[var(--color-success-soft)] text-[var(--color-success-strong)]">
                <div className="flex items-start gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-control)] bg-white/75">
                    <Check className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-xl font-black">Tu parte fue enviada</h2>
                    <p className="mt-1 text-sm font-bold">
                      El host ya puede revisar lo que pediste y tu estado de pago. Total enviado: {formatMoney(currentParticipantTotal)}.
                    </p>
                  </div>
                </div>
                {session.status === "open" ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <button className={buttonClasses("secondary", "bg-white/80")} onClick={() => setShowSubmittedDetails(true)} type="button">
                      Ver detalles
                    </button>
                    <button className={buttonClasses("secondary", "bg-white/80")} onClick={() => {
                      setShowSubmittedDetails(false);
                      updatePayment("pending");
                    }} type="button">
                      Agregar algo mas
                    </button>
                    <Link className={buttonClasses("primary")} href={publicRestaurantPath(restaurant.slug)}>
                      Volver al menu
                    </Link>
                  </div>
                ) : (
                  <p className="rounded-[1rem] bg-white/75 p-3 text-sm font-black">El host ya cerro el grupo. Si necesitas cambiar algo, avisa al host.</p>
                )}
              </Card>
            ) : null}

            {participantCanAddProducts ? (
              <Card className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-black">Agregar productos</h2>
                    <p className="text-sm font-semibold text-[var(--muted)]">Estas agregando como {currentParticipant?.displayName ?? "participante"}.</p>
                  </div>
                  <span className="rounded-full bg-[var(--primary-light)] px-3 py-1 text-sm font-black text-[var(--primary)]">
                    Tu total: {formatMoney(currentParticipantTotal)}
                  </span>
                </div>
                <div className="grid gap-3">
                  <label className="flex min-h-12 items-center gap-3 rounded-[1rem] border border-[var(--border)] bg-[var(--color-input)] px-4">
                    <ShoppingBag className="h-5 w-5 text-[var(--muted)]" />
                    <input className="min-w-0 flex-1 bg-transparent text-sm font-black outline-none placeholder:text-[var(--color-placeholder)]" onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar producto" value={productQuery} />
                    {productQuery ? (
                      <button className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary)] text-white" onClick={() => setProductQuery("")} type="button">
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </label>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <CategoryButton active={selectedCategory === "all"} label="Todo" onClick={() => setSelectedCategory("all")} />
                    {categories.map((category) => (
                      <CategoryButton active={selectedCategory === category.id} key={category.id} label={category.name} onClick={() => setSelectedCategory(category.id)} />
                    ))}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {filteredProducts.map((product) => {
                      const isAvailable = stockByProduct.get(product.id)?.isAvailableHere ?? true;
                      return (
                        <button
                          className={cn(
                            "grid grid-cols-[74px_1fr_auto] items-center gap-3 rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)]",
                            !isAvailable && "pointer-events-none opacity-55",
                          )}
                          disabled={!isAvailable || isPending}
                          key={product.id}
                          onClick={() => setSelectedProduct(product)}
                          type="button"
                        >
                          <ProductImage fit={product} name={product.name} src={product.imageUrl} />
                          <span className="min-w-0">
                            <span className="block line-clamp-2 text-sm font-black">{product.name}</span>
                            <span className="mt-1 block text-sm font-black text-[var(--primary)]">{formatMoney(product.price)}</span>
                          </span>
                          <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent)] text-[var(--primary)]">
                            <Plus className="h-5 w-5" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Card>
            ) : null}

            {showGroupDetails ? (
            <Card className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-black">Pedido compartido</h2>
                  <p className="text-sm font-semibold text-[var(--muted)]">{participants.length} participantes · {items.length} productos</p>
                </div>
                <span className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-black text-[var(--primary)]">
                  Total activo {formatMoney(activeSubtotal)}
                </span>
              </div>

              <div className="grid gap-3">
                {participants.map((participant) => {
                  const participantItems = itemsByParticipant.get(participant.id) ?? [];
                  const canRemoveOwn = participant.id === currentParticipantId || isHost;
                  return (
                    <div className={cn("rounded-[1rem] border border-[var(--border)] bg-[var(--color-surface)] p-3", participant.paymentStatus === "excluded" && "opacity-60")} key={participant.id}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black">
                            {participant.displayName}
                            {participant.role === "host" ? " · host" : ""}
                          </p>
                          <span className={cn("mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-black", paymentStatusClasses(participant.paymentStatus))}>
                            {paymentStatusLabel(participant.paymentStatus)}
                          </span>
                          {participant.paymentReceiptUrl ? (
                            <div className="mt-2">
                              <ReceiptViewerButton label="Ver comprobante" receiptLabel={`Comprobante de ${participant.displayName}`} subtitle={paymentStatusLabel(participant.paymentStatus)} url={participant.paymentReceiptUrl} />
                            </div>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-sm font-black text-[var(--primary)]">{formatMoney(totalsByParticipant.get(participant.id) ?? 0)}</span>
                      </div>
                      {isHost && canModifyGroup && participant.role !== "host" ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button className={buttonClasses("secondary", "min-h-9 px-3 text-xs")} onClick={() => updateHostParticipant(participant.id, "covered_by_host")} type="button">
                            Cubrir
                          </button>
                          <button className={buttonClasses("secondary", "min-h-9 px-3 text-xs")} onClick={() => updateHostParticipant(participant.id, "paid_qr")} type="button">
                            QR verificado
                          </button>
                          <button className={buttonClasses("secondary", "min-h-9 px-3 text-xs")} onClick={() => updateHostParticipant(participant.id, "cash_pending")} type="button">
                            Efectivo
                          </button>
                          <button className={buttonClasses("danger", "min-h-9 px-3 text-xs")} onClick={() => updateHostParticipant(participant.id, "excluded")} type="button">
                            Excluir
                          </button>
                        </div>
                      ) : null}
                      {participantItems.length ? (
                        <div className="mt-3 grid gap-2">
                          {participantItems.map((item) => (
                            <div className="flex items-center justify-between gap-3 rounded-[0.85rem] bg-[var(--surface)] p-2" key={item.id}>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black">{item.quantity}x {item.productName}</p>
                                {item.notes ? <p className="truncate text-xs font-semibold text-[var(--muted)]">{item.notes}</p> : null}
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className="text-sm font-black">{formatMoney(item.subtotal)}</span>
                                {canRemoveOwn && (session.status === "open" || (isHost && session.status === "locked")) ? (
                                  <button className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]" onClick={() => removeItem(item.id)} type="button">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 rounded-[0.85rem] bg-[var(--surface)] p-3 text-sm font-semibold text-[var(--muted)]">Todavia no agrego productos.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
            ) : null}
          </section>

          {showGroupDetails ? (
          <aside className="space-y-5">
            {isHost ? (
              <div className="sticky top-3 z-20 grid grid-cols-3 gap-1 rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-card)]">
                {[
                  ["invite", "Invitar"],
                  ["payments", "Pagos"],
                  ["finish", "Finalizar"],
                ].map(([value, label]) => (
                  <button
                    className={cn("min-h-10 rounded-[0.85rem] text-xs font-black transition", hostPanelTab === value ? "bg-[var(--primary)] text-white" : "text-[var(--muted)]")}
                    key={value}
                    onClick={() => setHostPanelTab(value as typeof hostPanelTab)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}

            {!isHost || hostPanelTab === "invite" ? (
            <Card className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-[var(--radius-control)] bg-[var(--primary-light)] text-[var(--primary)]">
                  <UsersRound className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-black">Invitar</h2>
                  <p className="text-xs font-bold text-[var(--muted)]">Comparte este link o QR.</p>
                </div>
              </div>
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="QR del Yopido Grupal" className="mx-auto h-44 w-44 rounded-[1rem] bg-white p-2" src={qrDataUrl} />
              ) : null}
              <button className={buttonClasses("secondary", "w-full")} onClick={copyInvite} type="button">
                {shareState === "copied" ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                {shareState === "copied" ? "Copiado" : "Copiar link"}
              </button>
              <a className={buttonClasses("primary", "w-full")} href={`https://wa.me/?text=${encodeURIComponent(`Unete a mi Yopido Grupal en ${restaurant.name}: ${inviteUrl}`)}`} rel="noreferrer" target="_blank">
                <Share2 className="h-4 w-4" />
                WhatsApp
              </a>
            </Card>
            ) : null}

            {session.collectMode === "host_collects" && (!isHost || hostPanelTab === "payments") ? (
              <Card className="space-y-3">
                <h2 className="text-lg font-black">QR del host</h2>
                {session.hostQrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="QR del host" className="mx-auto max-h-72 w-full rounded-[1rem] object-contain bg-white p-2" src={session.hostQrUrl} />
                ) : (
                  <p className="rounded-[1rem] bg-[var(--color-warning-soft)] p-3 text-sm font-bold text-[var(--color-warning-strong)]">El host no subio QR. Pueden coordinar efectivo o transferencia externa.</p>
                )}
              </Card>
            ) : null}

            {!isHost && isJoined && canModifyGroup && !participantSubmitted && currentParticipantTotal > 0 ? (
              <Card className="space-y-3">
                <div>
                  <h2 className="text-lg font-black">Confirmar tu parte</h2>
                  <p className="mt-1 text-xs font-bold text-[var(--muted)]">Cuando confirmes, tu parte queda enviada. Para agregar algo mas tendras que reabrirla y mandar otro comprobante.</p>
                </div>
                <form action={updateGroupParticipantPaymentFormAction} className="grid gap-2 rounded-[1rem] bg-[var(--color-surface)] p-3">
                  <input name="restaurantSlug" type="hidden" value={restaurant.slug} />
                  <input name="sessionToken" type="hidden" value={session.publicToken} />
                  <input name="participantToken" type="hidden" value={participantToken} />
                  <input name="paymentStatus" type="hidden" value="qr_uploaded" />
                  <label className="grid gap-1 text-xs font-black">
                    Comprobante QR individual
                    <Input accept="image/png,image/jpeg,image/webp,image/avif,application/pdf" name="paymentReceiptFile" type="file" />
                  </label>
                  <Input name="paymentNote" placeholder="Nota opcional del pago" />
                  <button className={buttonClasses("primary", "min-h-10 w-full text-xs")} type="submit">
                    Enviar comprobante
                  </button>
                </form>
                <div className="grid gap-2">
                  <PaymentButton active={currentParticipant?.paymentStatus === "cash_pending"} label="Confirmar efectivo" onClick={() => updatePayment("cash_pending")} />
                  <PaymentButton active={currentParticipant?.paymentStatus === "pending"} label="Dejar pendiente" onClick={() => updatePayment("pending")} />
                </div>
                <p className="text-xs font-bold text-[var(--muted)]">Si el host te cubre o decide no incluir tu parte, lo marca desde su control.</p>
              </Card>
            ) : null}

            {isHost ? (
              <>
              {hostPanelTab === "payments" ? (
              <Card className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-[var(--radius-control)] bg-[var(--primary-light)] text-[var(--primary)]">
                    <Lock className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-black">Control del host</h2>
                    <p className="text-xs font-bold text-[var(--muted)]">{pendingPaymentCount ? `${pendingPaymentCount} participante(s) pendiente(s)` : "Pagos listos o cubiertos"}</p>
                  </div>
                </div>
                <div className="grid gap-2">
                  {session.status === "open" ? (
                    <button className={buttonClasses("secondary", "w-full")} onClick={() => updateSessionStatus("locked")} type="button">
                      Cerrar para que no agreguen mas
                    </button>
                  ) : session.status === "locked" ? (
                    <button className={buttonClasses("secondary", "w-full")} onClick={() => updateSessionStatus("open")} type="button">
                      Reabrir grupo
                    </button>
                  ) : null}
                  {canModifyGroup ? (
                    <button className={buttonClasses("danger", "w-full")} onClick={() => updateSessionStatus("cancelled")} type="button">
                      Cancelar grupo
                    </button>
                  ) : null}
                </div>
              </Card>
              ) : null}

              {hostPanelTab === "payments" ? (
              <Card className="space-y-4">
                <h2 className="text-lg font-black">Cobro del grupo</h2>
                <form action={updateGroupOrderSessionSettingsAction} className="grid gap-3">
                  <input name="restaurantSlug" type="hidden" value={restaurant.slug} />
                  <input name="sessionToken" type="hidden" value={session.publicToken} />
                  <input name="hostAccessToken" type="hidden" value={hostAccessToken} />
                  <Select name="collectMode" defaultValue={session.collectMode}>
                    <option value="host_collects">Todos pagan al host</option>
                    <option value="internal_cash">Arreglo interno / efectivo</option>
                  </Select>
                  <label className="grid gap-1 text-sm font-black">
                    Cambiar QR del host
                    <Input accept="image/png,image/jpeg,image/webp,image/avif" name="hostQrFile" type="file" />
                  </label>
                  <button className={buttonClasses("secondary", "w-full")} disabled={!canModifyGroup} type="submit">
                    Guardar cobro
                  </button>
                </form>
              </Card>
              ) : null}

              {hostPanelTab === "finish" ? (
              <Card className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-[var(--radius-control)] bg-[var(--primary-light)] text-[var(--primary)]">
                    <Lock className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-black">Finalizar Yopido Grupal</h2>
                    <p className="text-xs font-bold text-[var(--muted)]">El pedido entrara a caja y cocina como un pedido normal.</p>
                  </div>
                </div>
                <form action={submitGroupOrderSessionAction} className="grid gap-3">
                  <input name="restaurantSlug" type="hidden" value={restaurant.slug} />
                  <input name="sessionToken" type="hidden" value={session.publicToken} />
                  <input name="hostAccessToken" type="hidden" value={hostAccessToken} />
                  <input name="orderType" type="hidden" value={hostOrderType} />
                  <input name="paymentMethod" type="hidden" value={effectiveHostPaymentMethod} />
                  <input name="deliveryCity" type="hidden" value={restaurant.city} />
                  <Input defaultValue={session.hostName} name="customerName" placeholder="Nombre del host" required />
                  <Input defaultValue={session.hostPhone ?? ""} inputMode="tel" name="customerPhone" placeholder="WhatsApp del host" />
                  {session.status === "open" ? (
                    <div className="rounded-[1rem] bg-[var(--color-warning-soft)] p-3 text-xs font-black text-[var(--color-warning-strong)]">
                      Cierra el grupo antes de enviarlo para congelar productos y pagos.
                    </div>
                  ) : null}
                  {pendingPaymentCount ? (
                    <div className="rounded-[1rem] bg-[var(--color-warning-soft)] p-3 text-xs font-black text-[var(--color-warning-strong)]">
                      Hay {pendingPaymentCount} participante(s) pendiente(s) o con QR por revisar. Marcalos como QR verificado, efectivo, cubierto o excluido.
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2 rounded-[1rem] bg-[var(--primary-light)] p-1">
                    <button className={cn("flex min-h-11 items-center justify-center gap-2 rounded-[0.85rem] text-sm font-black transition disabled:opacity-50", hostOrderType === "pickup" ? "bg-[var(--surface)] text-[var(--primary)] shadow-sm" : "text-[var(--muted)]")} disabled={!pickupEnabled} onClick={() => setHostOrderType("pickup")} type="button">
                      <Store className="h-4 w-4" />
                      Recojo
                    </button>
                    <button className={cn("flex min-h-11 items-center justify-center gap-2 rounded-[0.85rem] text-sm font-black transition disabled:opacity-50", hostOrderType === "delivery" ? "bg-[var(--surface)] text-[var(--primary)] shadow-sm" : "text-[var(--muted)]")} disabled={!deliveryEnabled} onClick={() => setHostOrderType("delivery")} type="button">
                      <Bike className="h-4 w-4" />
                      Delivery
                    </button>
                  </div>

                  {hostOrderType === "delivery" ? (
                    <div className="grid gap-3 rounded-[1rem] border border-[var(--border)] bg-[var(--color-surface)] p-3">
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                        <div>
                          <p className="text-sm font-black">Direccion del host</p>
                          <p className="text-xs font-semibold text-[var(--muted)]">Elige la ubicacion exacta en Google Maps para calcular delivery.</p>
                        </div>
                      </div>
                      <Input name="customerAddress" onChange={(event) => setHostAddress(event.target.value)} placeholder="Direccion de entrega" value={hostAddress} />
                      <Textarea className="min-h-20" name="deliveryAddressDetail" onChange={(event) => setHostAddressDetail(event.target.value)} placeholder="Referencia, piso, puerta o indicacion" value={hostAddressDetail} />
                      <GoogleLocationFields
                        hideCoordinateInputs
                        hideMapsUrlInput
                        label="Ubicacion de entrega"
                        latitudeName="deliveryLatitude"
                        longitudeName="deliveryLongitude"
                        mapHeightClassName="h-[280px]"
                        mapsUrlName="deliveryMapsUrl"
                        onCoordinatesChange={handleHostDeliveryCoordinatesChange}
                        showMapByDefault
                      />
                      {hostDeliveryPolicy?.distanceKm != null ? (
                        <div className={cn("rounded-[1rem] p-3 text-sm font-bold", hostDeliveryPolicy.requiresQrPrepayment ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]" : "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]")}>
                          <p>
                            {hostDeliveryPolicy.distanceKm.toFixed(1)} km desde el local{hostDeliveryPolicy.matchedZone ? ` · ${hostDeliveryPolicy.matchedZone.name}` : ""}.
                          </p>
                          <p className="mt-1 text-xs">
                            Envio: {hostDeliveryFee <= 0 ? "Gratis" : formatMoney(hostDeliveryFee)}
                            {hostDeliveryPolicy.requiresQrPrepayment ? " · Por distancia requiere pago QR final." : ""}
                          </p>
                        </div>
                      ) : (
                        <p className="rounded-[1rem] bg-[var(--color-warning-soft)] p-3 text-xs font-black text-[var(--color-warning-strong)]">Marca la ubicacion para calcular el envio.</p>
                      )}
                      {hostDeliveryPolicy?.requiresQrPrepayment && !qrPaymentConfigured ? (
                        <p className="rounded-[1rem] bg-[var(--color-danger-soft)] p-3 text-xs font-black text-[var(--color-danger-strong)]">Este delivery requiere QR, pero el restaurante aun no tiene QR configurado.</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid gap-2 rounded-[1rem] border border-[var(--border)] bg-[var(--color-surface)] p-3">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-[var(--primary)]" />
                      <p className="text-sm font-black">Pago final al restaurante</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        ["cash", "Efectivo"],
                        ["qr", "QR"],
                        ["bank_transfer", "Transferencia"],
                        ["card", "Tarjeta"],
                      ].map(([value, label]) => (
                        <button
                          className={cn("min-h-10 rounded-full border px-3 text-sm font-black transition", effectiveHostPaymentMethod === value ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]")}
                          disabled={hostDeliveryPolicy?.requiresQrPrepayment && value !== "qr"}
                          key={value}
                          onClick={() => setHostPaymentMethod(value as typeof hostPaymentMethod)}
                          type="button"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="grid gap-1 text-sm font-black">
                    Comprobante final si paga QR
                    <Input accept="image/png,image/jpeg,image/webp,image/avif,application/pdf" name="paymentReceiptFile" type="file" />
                  </label>
                  <div className="rounded-[1rem] bg-[var(--primary-light)] p-3 text-sm font-black text-[var(--primary)]">
                    <div className="flex justify-between gap-3">
                      <span>Productos</span>
                      <span>{formatMoney(activeSubtotal)}</span>
                    </div>
                    <div className="mt-1 flex justify-between gap-3">
                      <span>Delivery</span>
                      <span>{hostOrderType === "delivery" ? (hostDeliveryFee <= 0 ? "Gratis" : formatMoney(hostDeliveryFee)) : "-"}</span>
                    </div>
                    {deliverySharePreview > 0 ? (
                      <div className="mt-1 flex justify-between gap-3 text-xs text-[var(--muted)]">
                        <span>Referencia por persona</span>
                        <span>{formatMoney(deliverySharePreview)}</span>
                      </div>
                    ) : null}
                    <div className="mt-2 flex justify-between gap-3 border-t border-[var(--border)] pt-2 text-base">
                      <span>Total final</span>
                      <span>{formatMoney(hostFinalTotal)}</span>
                    </div>
                  </div>
                  <button className={buttonClasses("primary", "w-full")} disabled={!hostReadyToSubmit} type="submit">
                    <Send className="h-4 w-4" />
                    Enviar Yopido Grupal
                  </button>
                </form>
              </Card>
              ) : null}
              </>
            ) : null}
          </aside>
          ) : null}
        </div>
      </div>

      {selectedProduct ? <ProductOptionModal config={configuration[selectedProduct.id]} onAdd={addConfiguredProduct} onClose={() => setSelectedProduct(null)} product={selectedProduct} /> : null}

      {isPending ? (
        <div className="fixed inset-x-0 top-4 z-[100] mx-auto flex w-fit items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-3 text-sm font-black text-white shadow-2xl">
          <Minus className="h-4 w-4 animate-pulse" />
          Actualizando
        </div>
      ) : null}
    </main>
  );
}

function orderErrorMessage(error: string) {
  const messages: Record<string, string> = {
    "rate-limit": "Demasiadas solicitudes. Espera un momento.",
    "invalid-join": "Revisa tu nombre para unirte.",
    closed: "El host ya cerro este Yopido Grupal.",
    "service-role-required": "Falta configuracion segura del servidor.",
    "delivery-address": "Para delivery el host debe escribir una direccion.",
    "delivery-location": "Para delivery marca la ubicacion exacta en el mapa.",
    "different-city": "La direccion parece estar fuera de la ciudad del restaurante.",
    "phone-required": "Para delivery el host debe dejar un WhatsApp de contacto.",
    "qr-required-distance": "Por la distancia, este delivery requiere pago QR final.",
    "qr-unavailable": "Este restaurante todavia no tiene QR configurado.",
    "lock-required": "Primero cierra el grupo para congelar productos y pagos.",
    "already-submitting": "El pedido ya se esta creando. Espera un momento.",
    "pending-payments": "Aun hay participantes con pago pendiente.",
    "host-only-payment-status": "Solo el host puede marcar cubierto o excluido.",
    "group-full": "Este Yopido Grupal ya alcanzo el limite de participantes.",
    "duplicate-name": "Ya existe un participante con ese nombre en el grupo.",
    "group-item-limit": "Este Yopido Grupal ya alcanzo el limite de productos.",
    "participant-item-limit": "Este participante ya alcanzo el limite de productos.",
    disabled: "La modalidad elegida no esta habilitada.",
    "temporarily-closed": "El restaurante esta cerrado temporalmente.",
    "outside-hours": "El restaurante esta fuera de horario.",
    "no-open-cash": "El restaurante no tiene caja abierta.",
    empty: "No hay productos activos para enviar.",
    minimum: "El pedido no alcanza el monto minimo.",
    "receipt-required": "Para pago QR final debes subir comprobante.",
    "receipt-size": "El comprobante debe pesar menos de 5 MB.",
    "receipt-type": "El comprobante debe ser imagen o PDF.",
    "qr-size": "El QR debe pesar menos de 5 MB.",
    "qr-type": "El QR debe ser PNG, JPG, WebP o AVIF.",
    payment: "No se pudo actualizar el pago.",
    settings: "No se pudo guardar la configuracion del grupo.",
    "product-not-found": "Uno de los productos ya no esta disponible.",
    "product-configuration": "Un producto necesita opciones validas.",
    "create-order": "No se pudo crear el pedido final.",
  };
  return messages[error] ?? "No se pudo completar la accion.";
}

function CategoryButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={cn("h-10 shrink-0 rounded-full px-4 text-sm font-black transition", active ? "bg-[var(--accent)] text-[var(--primary)]" : "bg-[var(--primary-light)] text-[var(--muted)]")} onClick={onClick} type="button">
      {label}
    </button>
  );
}

function PaymentButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={cn("min-h-11 rounded-full border px-3 text-sm font-black transition", active ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]")} onClick={onClick} type="button">
      {label}
    </button>
  );
}

function ProductImage({ fit, name, src }: { fit?: ProductImageFit; name: string; src?: string | null }) {
  const style: CSSProperties | undefined = fit ? productImageFitStyle(fit) : undefined;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={name} className="h-[74px] w-[74px] rounded-[0.85rem] bg-[var(--primary-light)] object-cover" src={isDisplayImage(src) ? (src ?? undefined) : defaultProductImage} style={style} />
  );
}
