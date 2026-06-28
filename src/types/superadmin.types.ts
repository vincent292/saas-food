import type { AppRole, PlanKey, RestaurantStatus } from "./restaurant.types";

export type SupportTicketStatus = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
export type SupportTicketPriority = "low" | "medium" | "high" | "urgent";
export type SupportTicketCategory = "access" | "billing" | "orders" | "cash" | "inventory" | "incident" | "other";

export type PlatformIncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
export type PlatformIncidentSeverity = "minor" | "major" | "critical";
export type PlatformIncidentArea = "platform" | "public_menu" | "orders" | "cash" | "kitchen" | "inventory" | "storage" | "supabase" | "other";

export type AuditSeverity = "info" | "warning" | "critical";

export type SupportTicket = {
  id: string;
  restaurantId?: string;
  restaurantName: string;
  title: string;
  description: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  createdBy?: string;
  createdByName?: string;
  createdByEmail?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  attachments: SupportTicketAttachment[];
};

export type SupportTicketAttachment = {
  id: string;
  ticketId: string;
  restaurantId?: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  uploadedBy?: string;
  createdAt: string;
};

export type PlatformIncident = {
  id: string;
  affectedRestaurantId?: string;
  affectedRestaurantName: string;
  title: string;
  description: string;
  impactArea: PlatformIncidentArea;
  severity: PlatformIncidentSeverity;
  status: PlatformIncidentStatus;
  startedAt: string;
  resolvedAt?: string;
  postmortem: string;
};

export type AdminAuditLog = {
  id: string;
  actorEmail: string;
  restaurantId?: string;
  restaurantName: string;
  action: string;
  entityType: string;
  severity: AuditSeverity;
  ipAddress: string;
  createdAt: string;
};

export type RestaurantAccessSession = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  userId: string;
  userEmail: string;
  userName: string;
  role: AppRole;
  ipAddress: string;
  userAgent: string;
  status: "active" | "released" | "expired" | "blocked";
  openedAt: string;
  lastSeenAt: string;
  expiresAt: string;
  releasedAt?: string;
  releaseReason?: string;
};

export type RestaurantOperationSummary = {
  id: string;
  name: string;
  slug: string;
  status: RestaurantStatus;
  ownerEmail: string;
  city: string;
  planKey?: PlanKey;
  activeModules: number;
  orders30d: number;
  revenue30d: number;
  lastOrderAt?: string;
  activeSessions: number;
};

export type SuperAdminDashboardSummary = {
  restaurantCount: number;
  activeRestaurantCount: number;
  suspendedRestaurantCount: number;
  archivedRestaurantCount: number;
  todayOrders: number;
  todayRevenue: number;
  openSupportTickets: number;
  openIncidents: number;
  activeAccessSessions: number;
  lowStockRestaurants: number;
  topRestaurants: RestaurantOperationSummary[];
  recentAuditLogs: AdminAuditLog[];
  urgentTickets: SupportTicket[];
  activeIncidents: PlatformIncident[];
};

export type SuperAdminReports = {
  totalOrders: number;
  paidOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  averageTicket: number;
  restaurantsWithOrders: RestaurantOperationSummary[];
  orderStatusCounts: Record<string, number>;
  paymentMethodRevenue: Record<string, number>;
  moduleUsage: Record<string, number>;
};
