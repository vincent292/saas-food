import type { WhatsAppConnectionStatus } from "./whatsapp-connection.types";

export type WhatsAppCrmMessageDirection = "inbound" | "outbound";

export type WhatsAppCrmMessage = {
  id: string;
  messageId: string;
  conversationId?: string;
  phone: string;
  direction: WhatsAppCrmMessageDirection;
  type: string;
  text: string;
  timestamp: string;
  source?: string;
};

export type WhatsAppCrmDraftSummary = {
  id: string;
  status: string;
  checkoutStep: string;
  customerName: string;
  customerAddress: string;
  orderType: "delivery" | "pickup" | null;
  totalItems: number;
  deliveryFee: number;
  requiresPrepayment: boolean;
  updatedAt: string;
};

export type WhatsAppCrmOrderSummary = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  origin: string;
  createdAt: string;
};

export type WhatsAppCrmConversation = {
  id: string;
  phone: string;
  displayName: string;
  state: string;
  channel: "branch" | "platform";
  canReply: boolean;
  lastIntent: string;
  lastMessageAt: string;
  updatedAt: string;
  lastMessage?: WhatsAppCrmMessage;
  activeDraft?: WhatsAppCrmDraftSummary;
  orderCount: number;
  whatsappOrderCount: number;
  totalSpent: number;
  activeOrder?: WhatsAppCrmOrderSummary;
  lastOrder?: WhatsAppCrmOrderSummary;
  needsReply: boolean;
  tags: string[];
  acquisitionSource: "meta_entry" | "direct";
  acquisitionDetail: string;
  freeWindowExpiresAt?: string;
};

export type WhatsAppCrmUsage = {
  apiMessagesThisMonth: number;
  receivedMessagesThisMonth: number;
  metaSentMessages: number | null;
  metaDeliveredMessages: number | null;
  adProtectedMessages: number | null;
  freeServiceMessagesLimit: number;
  freeServiceMessagesUsed: number | null;
  freeServiceMessagesRemaining: number | null;
  billableServiceMessages: number | null;
  billableMessages: number | null;
  estimatedServiceCostUsd: number | null;
  metaCost: number | null;
  metaCurrency: string | null;
  pricingStatus: "synced" | "unavailable";
  costStatus: "available" | "partner_billing" | "unavailable";
  lastSyncedAt: string | null;
  periodStart: string;
  conversationsFromMetaEntry: number;
  conversationsDirect: number;
};

export type WhatsAppCrmQuickReply = {
  id: string;
  title: string;
  body: string;
  category: string;
  updatedAt: string;
};

export type WhatsAppCrmBotTone = "friendly" | "direct" | "formal";

export type WhatsAppCrmBotSettings = {
  botEnabled: boolean;
  responseTone: WhatsAppCrmBotTone;
  greetingMessage: string;
  menuIntroMessage: string;
  checkoutMessage: string;
  locationRequestMessage: string;
  qrPaymentMessage: string;
  receiptRequestMessage: string;
  fallbackMessage: string;
  humanHandoffMessage: string;
  updatedAt?: string;
};

export type WhatsAppCrmStats = {
  activeConversations: number;
  needsReply: number;
  whatsappOrders: number;
  todayRevenue: number;
};

export type WhatsAppCrmWorkspace = {
  conversations: WhatsAppCrmConversation[];
  selectedConversation?: WhatsAppCrmConversation;
  messages: WhatsAppCrmMessage[];
  quickReplies: WhatsAppCrmQuickReply[];
  botSettings: WhatsAppCrmBotSettings;
  stats: WhatsAppCrmStats;
  usage: WhatsAppCrmUsage;
  whatsappConfigured: boolean;
  branchConnectionStatus: NonNullable<WhatsAppConnectionStatus["connection"]>["status"] | null;
};
