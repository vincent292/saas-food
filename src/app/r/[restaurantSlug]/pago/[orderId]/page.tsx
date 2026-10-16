import { notFound, redirect } from "next/navigation";
import { BankCheckoutPayment } from "@/components/orders/BankCheckoutPayment";
import { RestaurantLayout } from "@/components/layout/RestaurantLayout";
import { createAdminClient } from "@/lib/supabase/admin";
import { bankOrderPaymentService } from "@/lib/services/bank-qr.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
import { formatMoney } from "@/lib/utils/money";
export const dynamic = "force-dynamic";
export default async function PaymentPage({ params, searchParams }: {
  params: Promise<{ restaurantSlug: string; orderId: string }>; searchParams: Promise<{ token?: string }>;
}) {
  const [{ restaurantSlug, orderId }, { token }] = await Promise.all([params, searchParams]);
  if (!token || token.length < 20 || token.length > 256 || !/^[0-9a-f-]{36}$/i.test(orderId)) notFound();
  const restaurant = await restaurantService.getBySlug(restaurantSlug);
  const admin = createAdminClient();
  if (!restaurant || !admin) notFound();
  const { data: order } = await admin.from("orders").select("id,total,payment_method,payment_status,status,bank_payment_required,bank_checkout_hold,public_request_id")
    .eq("restaurant_id", restaurant.id).eq("id", orderId).eq("tracking_token", token).maybeSingle();
  if (!order) notFound();
  const submitted = order.payment_status === "paid" && !order.bank_checkout_hold && !["pending", "cancelled"].includes(order.status);
  if (order.payment_method !== "qr" || !order.bank_payment_required || submitted) redirect(`${publicRestaurantPath(restaurantSlug, `pedido/${orderId}`)}?token=${encodeURIComponent(token)}`);
  const payment = await bankOrderPaymentService.get(orderId, token).catch(() => null);
  return <RestaurantLayout restaurant={restaurant} showCart={false} showMobileNav={false}>
    <main className="mx-auto w-full max-w-xl px-4 pb-12 pt-6 sm:px-6">
      <p className="text-xs font-black uppercase tracking-widest text-[var(--muted)]">Revisar → Pagar → Pedido aprobado</p>
      <h1 className="mt-3 text-2xl font-black text-[var(--primary)] sm:text-3xl">Paga para enviar tu pedido</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{restaurant.name} · Total {formatMoney(Number(order.total), "BOB")}</p>
      <div className="mt-5"><BankCheckoutPayment orderId={orderId} token={token} restaurantSlug={restaurantSlug} requestId={order.public_request_id} initialPayment={payment} /></div>
    </main>
  </RestaurantLayout>;
}
