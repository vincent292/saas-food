import type { SupportTicketCategory, SupportTicketPriority } from "@/types/superadmin.types";

export type SupportAiCategory = SupportTicketCategory;

export type SupportAiAnswer = {
  answer: string;
  resolved: boolean;
  ticketTitle: string;
  ticketDescription: string;
  ticketPriority: SupportTicketPriority;
  ticketCategory: SupportTicketCategory;
};

export type SupportAiResult =
  | {
      ok: true;
      answer: string;
      resolved: boolean;
      remainingToday: number;
      ticketId?: string;
      ticketTitle?: string;
    }
  | {
      ok: false;
      error: string;
      remainingToday?: number;
    };
