import { orderService } from "./order.service";
import { isSameBusinessDay } from "@/lib/utils/dates";

export const kitchenService = {
  async listKitchenOrders(restaurantId: string) {
    return (await orderService.listByRestaurant(restaurantId)).filter(
      (order) => isSameBusinessDay(order.createdAt) && ["accepted", "preparing", "ready", "delivered"].includes(order.status),
    );
  },
};
