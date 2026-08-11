export type PanelNotificationTone = "info" | "success" | "warning" | "danger";

export type PanelNotification = {
  id: string;
  title: string;
  description: string;
  href: string;
  createdAt: string;
  tone: PanelNotificationTone;
};
