import { orderService } from "./order.service";

export const kitchenService = {
  async listKitchenOrders(restaurantId: string) {
    return (await orderService.listByRestaurant(restaurantId)).filter((order) =>
      ["accepted", "preparing", "ready", "delivered"].includes(order.status),
    );
  },
};
