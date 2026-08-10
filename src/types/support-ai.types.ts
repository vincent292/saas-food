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

export type SupportAiTranscriptMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SupportAiResult =
  | {
      ok: true;
      answer: string;
      resolved: boolean;
      remainingToday: number;
      suggestedTicketTitle?: string;
      suggestedTicketDescription?: string;
      suggestedTicketPriority?: SupportTicketPriority;
      suggestedTicketCategory?: SupportTicketCategory;
    }
  | {
      ok: false;
      error: string;
      remainingToday?: number;
    };

export type SupportAiTicketResult =
  | {
      ok: true;
      ticketId: string;
      ticketTitle: string;
    }
  | {
      ok: false;
      error: string;
    };
