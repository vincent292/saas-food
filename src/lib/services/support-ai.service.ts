import type { SupportAiAnswer } from "@/types/support-ai.types";

const defaultModel = "gemini-3.6-flash";

const supportAiSchema = {
  type: "object",
  properties: {
    answer: { type: "string" },
    resolved: { type: "boolean" },
    ticketTitle: { type: "string" },
    ticketDescription: { type: "string" },
    ticketPriority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    ticketCategory: { type: "string", enum: ["access", "billing", "orders", "cash", "inventory", "incident", "other"] },
  },
  required: ["answer", "resolved", "ticketTitle", "ticketDescription", "ticketPriority", "ticketCategory"],
};

type GeminiInteractionResponse = {
  output_text?: string;
  outputText?: string;
  steps?: Array<{
    content?: Array<{ text?: string }>;
  }>;
};

export type SupportAiContext = {
  restaurantName: string;
  category: string;
  question: string;
  orderContext?: string;
};

export async function answerSupportQuestionWithAi(context: SupportAiContext): Promise<SupportAiAnswer> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("gemini-not-configured");
  }

  const model = process.env.SUPPORT_AI_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || defaultModel;
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          type: "text",
          text: buildSupportPrompt(context),
        },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: supportAiSchema,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`gemini-request-${response.status}`);
  }

  const payload = (await response.json()) as GeminiInteractionResponse;
  const text = extractGeminiText(payload);
  if (!text) {
    throw new Error("gemini-empty-response");
  }

  return normalizeSupportAiAnswer(JSON.parse(text) as Partial<SupportAiAnswer>);
}

function buildSupportPrompt(context: SupportAiContext) {
  return [
    "Eres el asistente de soporte operativo de un SaaS de restaurantes.",
    "Responde en espanol, maximo 900 caracteres, con pasos concretos.",
    "No eres chat general. No respondas temas fuera del sistema.",
    "No aceptes ni pidas imagenes, PDF, archivos, codigo, llaves API, passwords ni datos sensibles.",
    "No generes recomendaciones de menu ni analisis comercial en este chat.",
    "No prometas cambios de codigo, despliegues, pushes, migraciones ni acceso directo a base de datos.",
    "Si el caso requiere superadmin, revision humana, cambio de cuenta, pago, bug, datos faltantes o no se puede resolver con pasos claros, resolved=false y prepara ticket.",
    "Si hay contexto de pedido, usalo solo para orientar estado y siguiente paso operativo.",
    "",
    `Restaurante: ${context.restaurantName}`,
    `Categoria seleccionada: ${context.category}`,
    context.orderContext ? `Contexto de pedido:\n${context.orderContext}` : "Contexto de pedido: no provisto",
    `Problema:\n${context.question}`,
  ].join("\n");
}

function extractGeminiText(payload: GeminiInteractionResponse) {
  const directText = payload.output_text ?? payload.outputText;
  if (directText?.trim()) {
    return directText.trim();
  }

  return payload.steps?.at(-1)?.content?.map((part) => part.text ?? "").join("").trim() ?? "";
}

function normalizeSupportAiAnswer(input: Partial<SupportAiAnswer>): SupportAiAnswer {
  const answer = normalizeText(input.answer, "No pude resolverlo con seguridad. Voy a abrir un ticket para soporte.", 900);
  const ticketTitle = normalizeText(input.ticketTitle, "Soporte operativo", 90);
  const ticketDescription = normalizeText(input.ticketDescription, answer, 1400);
  const ticketPriority = ["low", "medium", "high", "urgent"].includes(String(input.ticketPriority)) ? input.ticketPriority : "medium";
  const ticketCategory = ["access", "billing", "orders", "cash", "inventory", "incident", "other"].includes(String(input.ticketCategory))
    ? input.ticketCategory
    : "other";

  return {
    answer,
    resolved: input.resolved === true,
    ticketTitle,
    ticketDescription,
    ticketPriority: ticketPriority as SupportAiAnswer["ticketPriority"],
    ticketCategory: ticketCategory as SupportAiAnswer["ticketCategory"],
  };
}

function normalizeText(value: unknown, fallback: string, maxLength: number) {
  return (typeof value === "string" ? value : fallback).replace(/\s+/g, " ").trim().slice(0, maxLength);
}
