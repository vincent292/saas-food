export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Row<T> = {
  Row: T;
  Insert: Partial<T>;
  Update: Partial<T>;
  Relationships: never[];
};

export type Database = {
  public: {
    Tables: {
      profiles: Row<{
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
        global_role: Database["public"]["Enums"]["app_role"] | null;
        created_at: string;
        updated_at: string;
      }>;
      restaurants: Row<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        status: Database["public"]["Enums"]["restaurant_status"];
        logo_url: string | null;
        banner_url: string | null;
        primary_color: string;
        secondary_color: string | null;
        whatsapp: string | null;
        address: string | null;
        city: string | null;
        created_at: string;
        updated_at: string;
      }>;
      restaurant_settings: Row<{
        id: string;
        restaurant_id: string;
        delivery_enabled: boolean;
        pickup_enabled: boolean;
        table_orders_enabled: boolean;
        inventory_enabled: boolean;
        cash_enabled: boolean;
        kitchen_enabled: boolean;
        delivery_fee: number;
        free_delivery_from: number | null;
        min_order_amount: number;
        currency: string;
        qr_payment_url: string | null;
        created_at: string;
        updated_at: string;
      }>;
      restaurant_memberships: Row<{
        id: string;
        restaurant_id: string;
        user_id: string;
        role: Database["public"]["Enums"]["app_role"];
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      categories: Row<{
        id: string;
        restaurant_id: string;
        name: string;
        description: string | null;
        image_url: string | null;
        sort_order: number;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      products: Row<{
        id: string;
        restaurant_id: string;
        category_id: string | null;
        name: string;
        description: string | null;
        price: number;
        image_url: string | null;
        is_available: boolean;
        is_featured: boolean;
        track_stock: boolean;
        sort_order: number;
        created_at: string;
        updated_at: string;
      }>;
      product_variants: Row<{
        id: string;
        restaurant_id: string;
        product_id: string;
        name: string;
        description: string | null;
        price_delta: number;
        sort_order: number;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      product_option_groups: Row<{
        id: string;
        restaurant_id: string;
        product_id: string;
        name: string;
        description: string | null;
        min_choices: number;
        max_choices: number;
        is_required: boolean;
        sort_order: number;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      product_options: Row<{
        id: string;
        restaurant_id: string;
        product_id: string;
        option_group_id: string;
        name: string;
        description: string | null;
        price_delta: number;
        sort_order: number;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      tables: Row<{
        id: string;
        restaurant_id: string;
        name: string;
        code: string;
        status: "available" | "occupied" | "waiting_order" | "served" | "checkout_requested";
        capacity: number;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      orders: Row<{
        id: string;
        restaurant_id: string;
        table_id: string | null;
        order_number: string;
        customer_name: string | null;
        customer_phone: string | null;
        customer_address: string | null;
        order_type: "table" | "delivery" | "pickup" | "pos";
        status: "pending" | "accepted" | "preparing" | "ready" | "delivered" | "cancelled";
        payment_status: "pending" | "paid" | "cancelled" | "refunded";
        payment_method: "cash" | "qr" | "bank_transfer" | "card" | "other";
        subtotal: number;
        delivery_fee: number;
        discount_total: number;
        total: number;
        notes: string | null;
        tracking_token: string;
        created_at: string;
        updated_at: string;
      }>;
      order_items: Row<{
        id: string;
        order_id: string;
        product_id: string | null;
        product_name: string;
        unit_price: number;
        quantity: number;
        subtotal: number;
        notes: string | null;
        created_at: string;
      }>;
      cash_sessions: Row<{
        id: string;
        restaurant_id: string;
        opened_by: string | null;
        closed_by: string | null;
        status: Database["public"]["Enums"]["cash_session_status"];
        opening_amount: number;
        expected_amount: number;
        counted_amount: number | null;
        difference_amount: number | null;
        opened_at: string;
        closed_at: string | null;
        notes: string | null;
      }>;
      cash_movements: Row<{
        id: string;
        restaurant_id: string;
        cash_session_id: string | null;
        order_id: string | null;
        type: Database["public"]["Enums"]["cash_movement_type"];
        payment_method: Database["public"]["Enums"]["payment_method_type"];
        amount: number;
        description: string | null;
        created_by: string | null;
        created_at: string;
      }>;
      inventory_items: Row<{
        id: string;
        restaurant_id: string;
        name: string;
        unit: string;
        current_stock: number;
        min_stock: number;
        unit_cost: number;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      inventory_movements: Row<{
        id: string;
        restaurant_id: string;
        inventory_item_id: string;
        type: Database["public"]["Enums"]["inventory_movement_type"];
        quantity: number;
        previous_stock: number;
        new_stock: number;
        reason: string | null;
        created_by: string | null;
        created_at: string;
      }>;
      module_settings: Row<{
        id: string;
        restaurant_id: string;
        module_key: string;
        is_enabled: boolean;
        created_at: string;
        updated_at: string;
      }>;
      subscription_plans: Row<{
        id: string;
        key: string;
        name: string;
        description: string | null;
        price_monthly: number;
        max_restaurants: number;
        max_users_per_restaurant: number;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      plan_modules: Row<{
        id: string;
        plan_id: string;
        module_key: string;
        is_enabled: boolean;
        created_at: string;
      }>;
      restaurant_subscriptions: Row<{
        id: string;
        restaurant_id: string;
        plan_id: string;
        status: Database["public"]["Enums"]["subscription_status"];
        starts_at: string;
        ends_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      business_hours: Row<{
        id: string;
        restaurant_id: string;
        day_of_week: number;
        opens_at: string | null;
        closes_at: string | null;
        is_closed: boolean;
        created_at: string;
        updated_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      get_public_order: {
        Args: {
          p_order_id: string;
          p_tracking_token: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      app_role: "superadmin" | "restaurant_admin" | "cashier" | "kitchen" | "waiter";
      restaurant_status: "active" | "inactive" | "suspended";
      order_status: "pending" | "accepted" | "preparing" | "ready" | "delivered" | "cancelled";
      payment_method_type: "cash" | "qr" | "bank_transfer" | "card" | "other";
      cash_session_status: "open" | "closed";
      cash_movement_type: "sale" | "expense" | "income" | "adjustment" | "opening" | "closing";
      inventory_movement_type: "in" | "out" | "adjustment" | "waste" | "sale_usage";
      subscription_status: "trialing" | "active" | "past_due" | "cancelled";
    };
  };
};
