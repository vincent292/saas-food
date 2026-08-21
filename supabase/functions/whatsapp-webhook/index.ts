// @ts-expect-error -- Supabase Edge Functions resolve remote Deno imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const GRAPH_API_VERSION = "v26.0";

type JsonObject = Record<string, unknown>;

type WhatsAppMessageRow = {
  message_id: string;
  from_phone: string;
  to_phone_number_id: string | null;
  to_display_phone: string | null;
  contact_name: string | null;
  message_type: string;
  message_text: string | null;
  payload: JsonObject;
  whatsapp_timestamp: string | null;
  received_at: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (request) => {
  try {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (request.method === "GET") {
      return verifyMetaWebhook(request);
    }

    if (request.method === "POST") {
      return receiveWhatsAppWebhook(request);
    }

    return jsonResponse({ error: "method_not_allowed" }, 405);
  } catch (error) {
    console.error("whatsapp-webhook error", error);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});

function verifyMetaWebhook(request: Request) {
  const verifyToken = Deno.env.get("VERIFY_TOKEN");

  if (!verifyToken) {
    return new Response("VERIFY_TOKEN is not configured", {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  return new Response("Forbidden", {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "text/plain" },
  });
}

async function receiveWhatsAppWebhook(request: Request) {
  const payload = await request.json();
  const rows = extractIncomingMessageRows(payload);

  if (rows.length === 0) {
    return jsonResponse({ ok: true, saved: 0 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("whatsapp_messages")
    .upsert(rows, { onConflict: "message_id", ignoreDuplicates: true });

  if (error) {
    console.error("Could not save WhatsApp messages", error);
    return jsonResponse({ error: "database_insert_failed" }, 500);
  }

  // Future auto-reply hook:
  // await sendWhatsAppTextMessage({ to: rows[0].from_phone, body: "Gracias por escribir a YoPido.shop." });

  return jsonResponse({ ok: true, saved: rows.length });
}

function createSupabaseAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function extractIncomingMessageRows(payload: JsonObject) {
  const rows: WhatsAppMessageRow[] = [];
  const entries = recordArray(payload.entry);

  for (const entry of entries) {
    const changes = recordArray(entry.changes);

    for (const change of changes) {
      const value = objectValue(change.value);
      const messages = recordArray(value.messages);
      const contacts = recordArray(value.contacts);
      const metadata = objectValue(value.metadata);

      for (const message of messages) {
        const messageId = stringValue(message.id);
        const fromPhone = stringValue(message.from);

        if (!messageId || !fromPhone) {
          continue;
        }

        const contact = contacts.find((item) => stringValue(item.wa_id) === fromPhone);

        rows.push({
          message_id: messageId,
          from_phone: fromPhone,
          to_phone_number_id: stringValue(metadata.phone_number_id) ?? Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? null,
          to_display_phone: stringValue(metadata.display_phone_number),
          contact_name: stringValue(objectValue(contact?.profile).name),
          message_type: stringValue(message.type) ?? "unknown",
          message_text: extractMessageText(message),
          payload: {
            object: payload.object ?? null,
            entry_id: entry.id ?? null,
            change_field: change.field ?? null,
            value,
            message,
          },
          whatsapp_timestamp: parseWhatsAppTimestamp(stringValue(message.timestamp)),
          received_at: new Date().toISOString(),
        });
      }
    }
  }

  return rows;
}

function extractMessageText(message: JsonObject) {
  if (message.type === "text") {
    return stringValue(objectValue(message.text).body);
  }

  if (message.type === "button") {
    const button = objectValue(message.button);
    return stringValue(button.text) ?? stringValue(button.payload);
  }

  if (message.type === "interactive") {
    const interactive = objectValue(message.interactive);
    const buttonReply = objectValue(interactive.button_reply);
    const listReply = objectValue(interactive.list_reply);

    return (
      stringValue(buttonReply.title) ??
      stringValue(buttonReply.id) ??
      stringValue(listReply.title) ??
      stringValue(listReply.id) ??
      null
    );
  }

  if (message.type === "image") {
    return stringValue(objectValue(message.image).caption);
  }

  if (message.type === "video") {
    return stringValue(objectValue(message.video).caption);
  }

  if (message.type === "document") {
    const document = objectValue(message.document);
    return stringValue(document.caption) ?? stringValue(document.filename);
  }

  if (message.type === "reaction") {
    return stringValue(objectValue(message.reaction).emoji);
  }

  return null;
}

function parseWhatsAppTimestamp(timestamp: string | null) {
  if (!timestamp) {
    return null;
  }

  const seconds = Number(timestamp);

  if (!Number.isFinite(seconds)) {
    return null;
  }

  return new Date(seconds * 1000).toISOString();
}

function objectValue(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function recordArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(objectValue).filter((item) => Object.keys(item).length > 0) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export async function sendWhatsAppTextMessage({
  to,
  body,
  previewUrl = false,
  phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID"),
}: {
  to: string;
  body: string;
  previewUrl?: boolean;
  phoneNumberId?: string;
}) {
  const token = Deno.env.get("WHATSAPP_TOKEN");

  if (!token || !phoneNumberId) {
    throw new Error("WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required");
  }

  const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body,
        preview_url: previewUrl,
      },
    }),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("Meta WhatsApp send failed", result);
    throw new Error("whatsapp_send_failed");
  }

  return result;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
