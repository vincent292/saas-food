"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendOrderStatusPush } from "@/lib/services/mobile-push.service";
import { sendOrderWhatsAppNotification } from "@/lib/services/order-whatsapp-notification.service";

const deliveryTokenSchema = z.object({
  token: z.string().min(20),
});

type MarkDeliveredPayload = {
  order_id?: string;
  restaurant_id?: string;
  status?: "arrived" | "delivered";
  status_changed?: boolean;
};

function scheduleDeliveryCustomerNotifications(orderId: string, status: "arrived" | "delivered") {
  after(async () => {
    await Promise.all([
      sendOrderStatusPush({ eventType: "delivery_status", orderId, status }).catch((error) => {
        console.error(`delivery-${status}-push-failed`, error);
      }),
      sendOrderWhatsAppNotification({ event: status, orderId }).catch((error) => {
        console.error(`delivery-${status}-whatsapp-failed`, error);
      }),
    ]);
  });
}

export async function markDeliveryArrivedAction(formData: FormData) {
  const parsed = deliveryTokenSchema.safeParse({
    token: formData.get("token"),
  });

  if (!parsed.success) {
    redirect("/delivery/error?error=invalid");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_delivery_order_arrived", {
    p_delivery_token: parsed.data.token,
  });

  if (error) {
    redirect(`/delivery/${parsed.data.token}?error=${encodeURIComponent(error.message)}`);
  }

  const payload = data as MarkDeliveredPayload | null;
  if (payload?.order_id && payload.status_changed !== false) {
    scheduleDeliveryCustomerNotifications(payload.order_id, "arrived");
  }
  revalidatePath(`/delivery/${parsed.data.token}`);
  if (payload?.restaurant_id) {
    revalidatePath(`/admin/restaurantes/${payload.restaurant_id}/pedidos`);
    revalidatePath(`/admin/restaurantes/${payload.restaurant_id}/dashboard`);
  }

  redirect(`/delivery/${parsed.data.token}?arrived=1`);
}

export async function markDeliveryDeliveredAction(formData: FormData) {
  const parsed = deliveryTokenSchema.safeParse({
    token: formData.get("token"),
  });

  if (!parsed.success) {
    redirect("/delivery/error?error=invalid");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_delivery_order_delivered", {
    p_delivery_token: parsed.data.token,
  });

  if (error) {
    redirect(`/delivery/${parsed.data.token}?error=${encodeURIComponent(error.message)}`);
  }

  const payload = data as MarkDeliveredPayload | null;
  if (payload?.order_id && payload.status_changed !== false) {
    scheduleDeliveryCustomerNotifications(payload.order_id, "delivered");
  }
  revalidatePath(`/delivery/${parsed.data.token}`);
  if (payload?.restaurant_id) {
    revalidatePath(`/admin/restaurantes/${payload.restaurant_id}/pedidos`);
    revalidatePath(`/admin/restaurantes/${payload.restaurant_id}/dashboard`);
  }

  redirect(`/delivery/${parsed.data.token}?delivered=1`);
}
