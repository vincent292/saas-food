"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendOrderStatusPush } from "@/lib/services/mobile-push.service";

const deliveryTokenSchema = z.object({
  token: z.string().min(20),
});

type MarkDeliveredPayload = {
  order_id?: string;
  restaurant_id?: string;
  status?: "arrived" | "delivered";
};

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
  if (payload?.order_id) {
    await sendOrderStatusPush({
      eventType: "delivery_status",
      orderId: payload.order_id,
      status: "arrived",
    }).catch((error) => {
      console.error("delivery-arrived-push-failed", error);
    });
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
  if (payload?.order_id) {
    await sendOrderStatusPush({
      eventType: "delivery_status",
      orderId: payload.order_id,
      status: "delivered",
    }).catch((error) => {
      console.error("delivery-delivered-push-failed", error);
    });
  }
  revalidatePath(`/delivery/${parsed.data.token}`);
  if (payload?.restaurant_id) {
    revalidatePath(`/admin/restaurantes/${payload.restaurant_id}/pedidos`);
    revalidatePath(`/admin/restaurantes/${payload.restaurant_id}/dashboard`);
  }

  redirect(`/delivery/${parsed.data.token}?delivered=1`);
}
