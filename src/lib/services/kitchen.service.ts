import { orderService } from "./order.service";

export const kitchenService = {
  async listKitchenOrders(restaurantId: string) {
    return (await orderService.listLiveByRestaurant(restaurantId)).filter((order) =>
      ["pending", "accepted", "preparing", "ready"].includes(order.status),
    );
  },
};
