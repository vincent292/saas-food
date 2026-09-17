export type WhatsAppConnectionStatus = {
  canManage: boolean;
  setupReady: boolean;
  connection: null | {
    displayPhone: string;
    verifiedName: string | null;
    status: 'pending' | 'connected' | 'disconnected' | 'needs_reconnect';
    coexistence: boolean;
    connectedAt: string | null;
    lastCheckedAt: string | null;
    lastError: string | null;
  };
};
