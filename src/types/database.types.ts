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
        document_number: string | null;
        document_number_normalized: string | null;
        birth_date: string | null;
        owner_profile_completed_at: string | null;
        global_role: Database["public"]["Enums"]["app_role"] | null;
        created_at: string;
        updated_at: string;
      }>;
      customer_profiles: Row<{
        id: string;
        full_name: string;
        email: string;
        phone: string;
        phone_normalized: string;
        document_number: string;
        document_number_normalized: string;
        provider: "email" | "google";
        status: "active" | "blocked";
        last_sign_in_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      customer_addresses: Row<{
        id: string;
        customer_id: string;
        label: string;
        address: string;
        latitude: number | null;
        longitude: number | null;
        maps_url: string | null;
        city: string | null;
        apartment: string | null;
        building_name: string | null;
        reference: string | null;
        is_default: boolean;
        created_at: string;
        updated_at: string;
      }>;
      customer_favorites: Row<{
        id: string;
        customer_id: string;
        kind: "restaurant" | "product";
        restaurant_id: string;
        product_id: string | null;
        created_at: string;
      }>;
      owner_branch_entitlements: Row<{
        owner_user_id: string;
        branch_limit: number;
        created_by: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      owner_branch_capacity_requests: Row<{
        id: string;
        owner_user_id: string;
        source_restaurant_id: string;
        requested_additional: number;
        reason: string | null;
        status: "pending" | "approved" | "rejected";
        current_limit: number;
        approved_limit: number | null;
        payment_amount: number;
        payment_currency: string;
        payment_qr_url: string | null;
        payment_qr_note: string | null;
        payment_proof_url: string | null;
        payment_proof_file_name: string | null;
        payment_proof_file_size: number;
        payment_proof_uploaded_at: string | null;
        resolved_by: string | null;
        resolved_at: string | null;
        resolution_notes: string | null;
        created_at: string;
        updated_at: string;
      }>;
      owner_platform_billing_settings: Row<{
        owner_user_id: string;
        billing_anchor_day: number;
        next_due_date: string;
        reminder_days: number;
        currency: string;
        platform_qr_url: string | null;
        platform_qr_note: string | null;
        created_by: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      owner_platform_payment_cycles: Row<{
        id: string;
        owner_user_id: string;
        due_date: string;
        period_key: string;
        branch_count: number;
        primary_price_monthly: number;
        additional_price_monthly: number;
        amount_due: number;
        currency: string;
        status: "pending" | "proof_uploaded" | "verified" | "paid" | "overdue" | "cancelled";
        proof_url: string | null;
        proof_uploaded_at: string | null;
        proof_verified_at: string | null;
        proof_verified_by: string | null;
        paid_at: string | null;
        paid_by: string | null;
        notes: string | null;
        resolution_notes: string | null;
        created_at: string;
        updated_at: string;
      }>;
      platform_branch_request_payment_settings: Row<{
        id: boolean;
        amount: number;
        currency: string;
        qr_url: string | null;
        qr_note: string | null;
        updated_by: string | null;
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
        business_type: Database["public"]["Enums"]["business_type"] | null;
        public_category: string | null;
        owner_user_id: string | null;
        owner_name: string | null;
        owner_email: string | null;
        background_color: string;
        surface_color: string;
        text_color: string;
        muted_color: string;
        border_color: string;
        nav_background_color: string;
        nav_text_color: string;
        menu_background_image_url: string | null;
        public_banner_size: "compact" | "standard" | "large";
        latitude: number | null;
        longitude: number | null;
        maps_url: string | null;
        address_reference: string | null;
        deactivated_at: string | null;
        deactivated_by: string | null;
        deleted_at: string | null;
        deleted_by: string | null;
        restored_at: string | null;
        restored_by: string | null;
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
        delivery_qr_prepayment_enabled: boolean;
        far_delivery_distance_km: number;
        free_delivery_from: number | null;
        min_order_amount: number;
        currency: string;
        invoice_enabled: boolean;
        qr_payment_url: string | null;
        qr_account_name: string | null;
        qr_account_document: string | null;
        qr_bank_name: string | null;
        qr_account_type: string | null;
        qr_currency: string;
        print_format: "thermal_58" | "thermal_80" | "large";
        auto_print_kitchen: boolean;
        print_logo: boolean;
        created_at: string;
        updated_at: string;
      }>;
      restaurant_delivery_zones: Row<{
        id: string;
        restaurant_id: string;
        name: string;
        city: string | null;
        center_latitude: number | null;
        center_longitude: number | null;
        radius_km: number;
        delivery_fee: number;
        min_order_amount: number;
        is_active: boolean;
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
      restaurant_announcements: Row<{
        id: string;
        restaurant_id: string;
        type: "announcement" | "closure";
        title: string;
        body: string | null;
        image_url: string | null;
        starts_at: string;
        ends_at: string | null;
        is_active: boolean;
        created_by: string | null;
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
        compare_at_price: number | null;
        prep_minutes: number;
        image_url: string | null;
        image_position_x: number;
        image_position_y: number;
        image_zoom: number;
        is_available: boolean;
        is_featured: boolean;
        product_kind: "standard" | "promotion" | "lunch";
        available_from: string | null;
        available_until: string | null;
        available_days: number[] | null;
        available_start_time: string | null;
        available_end_time: string | null;
        order_count: number;
        last_ordered_at: string | null;
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
        inventory_item_id: string | null;
        inventory_quantity: number | null;
        inventory_waste_factor: number;
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
        customer_id: string | null;
        table_id: string | null;
        order_number: string;
        public_request_id: string | null;
        customer_name: string | null;
        customer_phone: string | null;
        customer_email: string | null;
        customer_address: string | null;
        delivery_address_detail: string | null;
        delivery_latitude: number | null;
        delivery_longitude: number | null;
        delivery_maps_url: string | null;
        delivery_distance_km: number | null;
        requires_prepayment: boolean;
        requested_fulfillment_at: string | null;
        invoice_required: boolean;
        invoice_document_type: string | null;
        invoice_document_number: string | null;
        invoice_name: string | null;
        invoice_issued_at: string | null;
        invoice_issued_by: string | null;
        invoice_number: string | null;
        invoice_notes: string | null;
        order_type: "table" | "delivery" | "pickup" | "pos";
        order_origin: Database["public"]["Enums"]["order_origin"];
        status: "pending" | "accepted" | "preparing" | "ready" | "delivered" | "cancelled";
        payment_status: "pending" | "paid" | "cancelled" | "refunded";
        payment_method: "cash" | "qr" | "bank_transfer" | "card" | "other";
        payment_receipt_url: string | null;
        payment_receipt_uploaded_at: string | null;
        payment_receipt_reference: string | null;
        payment_verified_at: string | null;
        subtotal: number;
        delivery_fee: number;
        discount_total: number;
        total: number;
        notes: string | null;
        tracking_token: string;
        accepted_at: string | null;
        preparing_at: string | null;
        ready_at: string | null;
        delivered_at: string | null;
        cancelled_at: string | null;
        cancellation_reason: string | null;
        printed_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      order_items: Row<{
        id: string;
        order_id: string;
        product_id: string | null;
        product_name: string;
        variant_id: string | null;
        option_ids: string[];
        unit_price: number;
        quantity: number;
        subtotal: number;
        prep_minutes: number;
        notes: string | null;
        created_at: string;
      }>;
      order_delivery_links: Row<{
        id: string;
        restaurant_id: string;
        order_id: string;
        delivery_token: string;
        delivery_phone: string | null;
        delivery_name: string | null;
        status: "active" | "arrived" | "delivered" | "cancelled" | "expired";
        opened_at: string | null;
        arrived_at: string | null;
        delivered_at: string | null;
        expires_at: string;
        created_at: string;
        updated_at: string;
      }>;
      group_order_sessions: Row<{
        id: string;
        restaurant_id: string;
        public_token: string;
        host_access_token: string;
        host_participant_id: string | null;
        host_name: string;
        host_phone: string | null;
        collect_mode: "host_collects" | "restaurant_collects" | "internal_cash";
        host_qr_url: string | null;
        multisite_enabled: boolean;
        multisite_radius_km: number;
        multisite_max_pickups: number;
        status: "open" | "locked" | "submitted" | "cancelled" | "expired";
        submitted_order_id: string | null;
        submitted_at: string | null;
        subtotal: number;
        delivery_fee: number;
        total: number;
        expires_at: string;
        created_at: string;
        updated_at: string;
      }>;
      group_order_participants: Row<{
        id: string;
        session_id: string;
        participant_token: string;
        display_name: string;
        phone: string | null;
        role: "host" | "guest";
        payment_status: "pending" | "paid_qr" | "cash_pending" | "covered_by_host" | "excluded";
        payment_method: Database["public"]["Enums"]["payment_method_type"] | null;
        payment_note: string | null;
        payment_receipt_url: string | null;
        payment_receipt_uploaded_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      group_order_items: Row<{
        id: string;
        session_id: string;
        participant_id: string;
        product_id: string;
        product_name: string;
        variant_id: string | null;
        option_ids: string[];
        unit_price: number;
        quantity: number;
        subtotal: number;
        notes: string | null;
        created_at: string;
        updated_at: string;
      }>;
      order_cancellation_reviews: Row<{
        id: string;
        restaurant_id: string;
        order_id: string;
        order_number: string;
        order_status_at_cancellation: Database["public"]["Enums"]["order_status"];
        payment_status_at_cancellation: "pending" | "paid" | "cancelled" | "refunded";
        order_type: "table" | "delivery" | "pickup" | "pos";
        total: number;
        payment_method: Database["public"]["Enums"]["payment_method_type"] | null;
        cancellation_kind: "rejected" | "cancelled" | "deleted";
        reason: string;
        cancelled_by: string | null;
        cancelled_by_name: string | null;
        cancelled_by_email: string | null;
        cancelled_at: string;
        payment_receipt_url: string | null;
        payment_receipt_reference: string | null;
        payment_receipt_uploaded_at: string | null;
        requested_fulfillment_at: string | null;
        accepted_at: string | null;
        ready_at: string | null;
        dispatched_at: string | null;
        delivered_at: string | null;
        cash_session_id: string | null;
        cash_movement_id: string | null;
        owner_review_status: "pending" | "approved" | "observed";
        owner_review_notes: string | null;
        owner_reviewed_by: string | null;
        owner_reviewed_at: string | null;
        snapshot: Json;
        created_at: string;
        updated_at: string;
      }>;
      mobile_push_tokens: Row<{
        id: string;
        expo_push_token: string;
        customer_phone: string | null;
        customer_phone_normalized: string;
        device_id: string | null;
        platform: string | null;
        app_version: string | null;
        is_enabled: boolean;
        last_seen_at: string;
        created_at: string;
        updated_at: string;
      }>;
      mobile_order_push_tokens: Row<{
        order_id: string;
        restaurant_id: string;
        expo_push_token: string;
        customer_phone: string | null;
        last_notified_status: string | null;
        last_notified_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      mobile_push_notification_logs: Row<{
        id: string;
        order_id: string | null;
        restaurant_id: string | null;
        expo_push_token: string | null;
        event_type: string;
        status: string | null;
        title: string;
        body: string;
        expo_ticket_id: string | null;
        response_status: string | null;
        response_payload: Json | null;
        error_message: string | null;
        created_at: string;
      }>;
      restaurant_public_visits: Row<{
        id: string;
        restaurant_id: string;
        visited_at: string;
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
        item_kind: "finished" | "ingredient" | "supply";
        unit: string;
        current_stock: number;
        min_stock: number;
        unit_cost: number;
        sku: string | null;
        category: string | null;
        category_id: string | null;
        purchase_unit: string | null;
        purchase_to_stock_factor: number;
        supplier_id: string | null;
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
        from_zone_id: string | null;
        to_zone_id: string | null;
        supplier_id: string | null;
        order_id: string | null;
        related_movement_id: string | null;
      }>;
      inventory_lots: Row<{
        id: string;
        restaurant_id: string;
        inventory_item_id: string;
        supplier_id: string | null;
        lot_code: string | null;
        expires_on: string | null;
        initial_quantity: number;
        remaining_quantity: number;
        notes: string | null;
        received_at: string;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      inventory_categories: Row<{
        id: string;
        restaurant_id: string;
        name: string;
        description: string | null;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      inventory_zones: Row<{
        id: string;
        restaurant_id: string;
        name: string;
        description: string | null;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      inventory_item_zones: Row<{
        id: string;
        restaurant_id: string;
        inventory_item_id: string;
        zone_id: string;
        stock: number;
        updated_at: string;
      }>;
      product_suppliers: Row<{
        id: string;
        restaurant_id: string;
        product_id: string;
        supplier_id: string;
        notes: string | null;
        created_at: string;
      }>;
      inventory_suppliers: Row<{
        id: string;
        restaurant_id: string;
        name: string;
        phone: string | null;
        notes: string | null;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      product_ingredients: Row<{
        id: string;
        restaurant_id: string;
        product_id: string;
        inventory_item_id: string;
        quantity: number;
        waste_factor: number;
        notes: string | null;
        created_at: string;
        updated_at: string;
      }>;
      inventory_counts: Row<{
        id: string;
        restaurant_id: string;
        status: "open" | "closed";
        opened_by: string | null;
        closed_by: string | null;
        opened_at: string;
        closed_at: string | null;
        notes: string | null;
      }>;
      inventory_count_lines: Row<{
        id: string;
        inventory_count_id: string;
        restaurant_id: string;
        inventory_item_id: string;
        expected_stock: number;
        counted_stock: number;
        difference_stock: number;
        notes: string | null;
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
        additional_restaurant_price_monthly: number;
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
      restaurant_platform_billing: Row<{
        id: string;
        restaurant_id: string;
        billing_anchor_date: string;
        next_due_date: string;
        reminder_days: number;
        platform_qr_url: string | null;
        platform_qr_note: string | null;
        created_at: string;
        updated_at: string;
      }>;
      restaurant_platform_payment_cycles: Row<{
        id: string;
        restaurant_id: string;
        due_date: string;
        proof_url: string | null;
        proof_uploaded_at: string | null;
        proof_verified_at: string | null;
        proof_verified_by: string | null;
        paid_at: string | null;
        paid_by: string | null;
        notes: string | null;
        created_at: string;
        updated_at: string;
      }>;
      restaurant_owner_change_requests: Row<{
        id: string;
        restaurant_id: string;
        requested_by: string;
        current_owner_name: string | null;
        current_owner_email: string | null;
        requested_owner_name: string;
        requested_owner_email: string;
        reason: string | null;
        eligible_at: string;
        status: Database["public"]["Enums"]["owner_change_request_status"];
        approved_at: string | null;
        approved_by: string | null;
        rejected_at: string | null;
        rejected_by: string | null;
        resolution_notes: string | null;
        created_at: string;
        updated_at: string;
      }>;
      admin_audit_logs: Row<{
        id: string;
        actor_user_id: string | null;
        actor_email: string | null;
        restaurant_id: string | null;
        restaurant_name_snapshot: string | null;
        action: string;
        entity_type: string;
        entity_id: string | null;
        severity: "info" | "warning" | "critical";
        ip_address: string | null;
        user_agent: string | null;
        metadata: Json;
        created_at: string;
      }>;
      admin_message_templates: Row<{
        id: string;
        title: string;
        body: string;
        is_active: boolean;
        created_by: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      support_tickets: Row<{
        id: string;
        restaurant_id: string | null;
        restaurant_name_snapshot: string | null;
        title: string;
        description: string | null;
        category: "access" | "billing" | "orders" | "cash" | "inventory" | "incident" | "other";
        priority: "low" | "medium" | "high" | "urgent";
        status: "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
        created_by: string | null;
        assigned_to: string | null;
        resolved_by: string | null;
        first_response_at: string | null;
        resolved_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      support_ticket_attachments: Row<{
        id: string;
        ticket_id: string;
        restaurant_id: string | null;
        file_url: string;
        file_name: string;
        file_size: number;
        uploaded_by: string | null;
        created_at: string;
      }>;
      support_ai_requests: Row<{
        id: string;
        restaurant_id: string;
        user_id: string;
        category: "access" | "billing" | "orders" | "cash" | "inventory" | "incident" | "other";
        question: string;
        answer: string | null;
        resolved_by_ai: boolean;
        ticket_id: string | null;
        created_at: string;
      }>;
      menu_import_ai_attempts: Row<{
        id: string;
        restaurant_id: string;
        user_id: string;
        file_name: string | null;
        file_type: string | null;
        file_size: number;
        status: "success" | "failed";
        error_code: string | null;
        created_at: string;
      }>;
      platform_incidents: Row<{
        id: string;
        affected_restaurant_id: string | null;
        affected_restaurant_snapshot: string | null;
        title: string;
        description: string | null;
        impact_area: "platform" | "public_menu" | "orders" | "cash" | "kitchen" | "inventory" | "storage" | "supabase" | "other";
        severity: "minor" | "major" | "critical";
        status: "investigating" | "identified" | "monitoring" | "resolved";
        reported_by: string | null;
        resolved_by: string | null;
        started_at: string;
        resolved_at: string | null;
        postmortem: string | null;
        created_at: string;
        updated_at: string;
      }>;
      restaurant_access_sessions: Row<{
        id: string;
        restaurant_id: string;
        user_id: string;
        role: Database["public"]["Enums"]["app_role"];
        ip_address: string | null;
        user_agent: string | null;
        status: "active" | "released" | "expired" | "blocked";
        opened_at: string;
        last_seen_at: string;
        expires_at: string;
        released_at: string | null;
        release_reason: string | null;
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
      create_public_order_transaction: {
        Args: {
          p_items: Json;
          p_order: Json;
          p_request_id: string;
        };
        Returns: {
          id: string;
          tracking_token: string;
        }[];
      };
      resolve_owner_branch_capacity_request: {
        Args: {
          p_approve: boolean;
          p_approved_limit?: number | null;
          p_request_id: string;
          p_resolution_notes?: string | null;
        };
        Returns: undefined;
      };
      consume_request_rate_limit: {
        Args: {
          p_block_seconds: number;
          p_identifier_hash: string;
          p_max_attempts: number;
          p_scope: string;
          p_window_seconds: number;
        };
        Returns: boolean;
      };
      clear_request_rate_limit: {
        Args: {
          p_identifier_hash: string;
          p_scope: string;
        };
        Returns: undefined;
      };
      cash_expected_amount: {
        Args: {
          p_cash_session_id: string;
        };
        Returns: number;
      };
      apply_order_inventory_usage: {
        Args: {
          p_order_id: string;
        };
        Returns: undefined;
      };
      create_default_inventory_zone: {
        Args: {
          p_restaurant_id: string;
        };
        Returns: string;
      };
      charge_order_with_cash_movement: {
        Args: {
          p_order_id: string;
          p_payment_method: Database["public"]["Enums"]["payment_method_type"];
          p_receipt_reference?: string | null;
          p_receipt_url?: string | null;
          p_restaurant_id: string;
        };
        Returns: string;
      };
      close_cash_session_atomic: {
        Args: {
          p_counted_amount: number;
          p_notes?: string | null;
          p_restaurant_id: string;
        };
        Returns: {
          session_id: string;
          expected_amount: number;
          counted_amount: number;
          difference_amount: number;
        }[];
      };
      close_inventory_count_atomic: {
        Args: {
          p_notes?: string | null;
          p_restaurant_id: string;
        };
        Returns: string;
      };
      create_pos_sale_with_cash_movement: {
        Args: {
          p_customer_phone?: string | null;
          p_customer_name?: string | null;
          p_items?: Json;
          p_order_origin?: Database["public"]["Enums"]["order_origin"];
          p_order_number: string;
          p_payment_method: Database["public"]["Enums"]["payment_method_type"];
          p_receipt_reference?: string | null;
          p_receipt_url?: string | null;
          p_restaurant_id: string;
        };
        Returns: string;
      };
      has_open_cash_session_public: {
        Args: {
          p_restaurant_id: string;
        };
        Returns: boolean;
      };
      open_cash_session_atomic: {
        Args: {
          p_notes?: string | null;
          p_opening_amount: number;
          p_restaurant_id: string;
        };
        Returns: string;
      };
      open_inventory_count_atomic: {
        Args: {
          p_notes?: string | null;
          p_restaurant_id: string;
        };
        Returns: string;
      };
      record_inventory_count_line_atomic: {
        Args: {
          p_counted_stock: number;
          p_inventory_item_id: string;
          p_notes?: string | null;
          p_restaurant_id: string;
        };
        Returns: string;
      };
      register_cash_movement_atomic: {
        Args: {
          p_amount: number;
          p_description: string;
          p_payment_method: Database["public"]["Enums"]["payment_method_type"];
          p_restaurant_id: string;
          p_type: Database["public"]["Enums"]["cash_movement_type"];
        };
        Returns: string;
      };
      register_inventory_movement_atomic: {
        Args: {
          p_from_zone_id?: string | null;
          p_inventory_item_id: string;
          p_lot_code?: string | null;
          p_expires_on?: string | null;
          p_quantity: number;
          p_reason: string;
          p_restaurant_id: string;
          p_supplier_id?: string | null;
          p_to_zone_id?: string | null;
          p_type: Database["public"]["Enums"]["inventory_movement_type"];
        };
        Returns: string;
      };
      reverse_order_inventory_usage: {
        Args: {
          p_order_id: string;
          p_reason?: string | null;
        };
        Returns: undefined;
      };
      transfer_inventory_zone_atomic: {
        Args: {
          p_from_zone_id: string;
          p_inventory_item_id: string;
          p_quantity: number;
          p_reason: string;
          p_restaurant_id: string;
          p_to_zone_id: string;
        };
        Returns: string;
      };
      refund_order_atomic: {
        Args: {
          p_order_id: string;
          p_reason: string;
          p_restaurant_id: string;
        };
        Returns: string;
      };
      transfer_inventory_branch_atomic: {
        Args: {
          p_from_inventory_item_id: string;
          p_from_restaurant_id: string;
          p_quantity: number;
          p_reason: string;
          p_to_inventory_item_id: string;
          p_to_restaurant_id: string;
        };
        Returns: string;
      };
      get_public_order: {
        Args: {
          p_order_id: string;
          p_tracking_token: string;
        };
        Returns: Json;
      };
      get_public_order_lookup: {
        Args: {
          p_customer_phone: string;
          p_order_number: string;
          p_restaurant_id: string;
        };
        Returns: Json;
      };
      get_public_order_queue_state: {
        Args: {
          p_order_id: string;
          p_tracking_token: string;
        };
        Returns: Json;
      };
      get_delivery_order: {
        Args: {
          p_delivery_token: string;
        };
        Returns: Json;
      };
      mark_delivery_order_delivered: {
        Args: {
          p_delivery_token: string;
        };
        Returns: Json;
      };
      mark_delivery_order_arrived: {
        Args: {
          p_delivery_token: string;
        };
        Returns: Json;
      };
      archive_restaurant: {
        Args: {
          p_restaurant_id: string;
        };
        Returns: undefined;
      };
      restore_restaurant: {
        Args: {
          p_restaurant_id: string;
        };
        Returns: undefined;
      };
      set_restaurant_status: {
        Args: {
          p_restaurant_id: string;
          p_status: Database["public"]["Enums"]["restaurant_status"];
        };
        Returns: undefined;
      };
      permanently_delete_restaurant: {
        Args: {
          p_confirmation_slug: string;
          p_restaurant_id: string;
        };
        Returns: undefined;
      };
      write_admin_audit: {
        Args: {
          p_action: string;
          p_entity_id?: string | null;
          p_entity_type?: string;
          p_ip_address?: string | null;
          p_metadata?: Json;
          p_restaurant_id?: string | null;
          p_severity?: string;
          p_user_agent?: string | null;
        };
        Returns: string;
      };
      expire_stale_restaurant_access_sessions: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      claim_restaurant_access_session: {
        Args: {
          p_ip_address?: string | null;
          p_restaurant_id: string;
          p_user_agent?: string | null;
        };
        Returns: {
          allowed: boolean;
          session_id: string | null;
          restaurant_id: string;
          restaurant_name: string;
          active_restaurant_id: string | null;
          active_restaurant_name: string | null;
          active_ip_address: string | null;
          active_last_seen_at: string | null;
          message: string;
        }[];
      };
      release_restaurant_access_session: {
        Args: {
          p_reason?: string | null;
          p_restaurant_id: string;
        };
        Returns: undefined;
      };
      release_restaurant_access_session_by_id: {
        Args: {
          p_reason?: string | null;
          p_session_id: string;
        };
        Returns: undefined;
      };
      release_all_restaurant_access_sessions: {
        Args: {
          p_reason?: string | null;
        };
        Returns: undefined;
      };
      expire_old_delivery_links: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "superadmin" | "restaurant_admin" | "cashier" | "kitchen" | "waiter";
      business_type: "food" | "fashion" | "footwear" | "pharmacy" | "market" | "beauty" | "home" | "electronics" | "services" | "other";
      restaurant_status: "active" | "inactive" | "suspended";
      order_origin: "pos_counter" | "table_qr" | "web_checkout" | "phone_whatsapp" | "external_platform";
      owner_change_request_status: "pending" | "approved" | "rejected" | "cancelled";
      order_status: "pending" | "accepted" | "preparing" | "ready" | "delivered" | "cancelled";
      payment_method_type: "cash" | "qr" | "bank_transfer" | "card" | "other";
      cash_session_status: "open" | "closed";
      cash_movement_type: "sale" | "expense" | "income" | "adjustment" | "opening" | "closing";
      inventory_movement_type: "in" | "out" | "adjustment" | "waste" | "sale_usage";
      subscription_status: "trialing" | "active" | "past_due" | "cancelled";
    };
  };
};
