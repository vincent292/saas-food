import { defaultRestaurantPalette } from "@/lib/theme/design-tokens";
import { formatShortTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import type { Order } from "@/types/order.types";
import { groupKitchenOrderItems, orderSourceLabel, orderStatusLabels, paymentMethodLabels } from "./orderPresentation";

export type PrintFormat = "thermal_58" | "thermal_80" | "large";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function isPrintImage(value?: string) {
  return Boolean(value && (value.startsWith("http") || value.startsWith("/")) && !value.includes("imagendefault"));
}

function formatTitle(format: PrintFormat) {
  if (format === "thermal_58") {
    return "Ticket térmico 58 mm";
  }

  if (format === "thermal_80") {
    return "Ticket térmico 80 mm";
  }

  return "Formato grande";
}

export function buildOrderTicketHtml({
  order,
  restaurantName,
  restaurantLogoUrl,
  format,
  printLogo = true,
}: {
  order: Order;
  restaurantName: string;
  restaurantLogoUrl?: string;
  format: PrintFormat;
  printLogo?: boolean;
}) {
  const isThermal = format !== "large";
  const contentWidth = format === "thermal_58" ? "54mm" : format === "thermal_80" ? "76mm" : "210mm";
  const safeRestaurant = escapeHtml(restaurantName);
  const safeLogoUrl = isPrintImage(restaurantLogoUrl) ? escapeHtml(restaurantLogoUrl ?? "") : "";
  const printBackground = defaultRestaurantPalette.surfaceColor;
  const printText = defaultRestaurantPalette.textColor;
  const printMuted = defaultRestaurantPalette.mutedColor;
  const items = groupKitchenOrderItems(order.items)
    .map(
      (item) => `
        <tr>
          <td>${item.quantity}x</td>
          <td>
            <strong>${escapeHtml(item.productName)}</strong>
            ${
              item.details.length
                ? item.details
                    .map((detail) => `<small>${detail.quantity}x ${escapeHtml(detail.label)}</small>`)
                    .join("")
                : ""
            }
          </td>
          <td class="right">${formatMoney(item.subtotal)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(order.orderNumber)} - ${formatTitle(format)}</title>
        <style>
          @page {
            size: ${isThermal ? "auto" : "A4"};
            margin: ${isThermal ? "2mm" : "14mm"};
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            background: ${printBackground};
            color: ${printText};
            font-family: Arial, sans-serif;
            font-size: ${isThermal ? "11px" : "14px"};
          }

          .ticket {
            width: ${contentWidth};
            max-width: 100%;
            margin: 0 auto;
            padding: ${isThermal ? "0" : "16px"};
          }

          .center {
            text-align: center;
          }

          h1 {
            margin: 0 0 4px;
            font-size: ${isThermal ? "18px" : "28px"};
            line-height: 1;
            text-transform: uppercase;
          }

          .logo {
            display: block;
            width: ${isThermal ? "34px" : "58px"};
            height: ${isThermal ? "34px" : "58px"};
            object-fit: contain;
            margin: 0 auto 6px;
          }

          h2 {
            margin: 8px 0 4px;
            font-size: ${isThermal ? "14px" : "20px"};
          }

          p {
            margin: 2px 0;
          }

          .divider {
            border-top: 1px dashed ${printText};
            margin: 5px 0;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          td {
            padding: 4px 0;
            vertical-align: top;
          }

          td:first-child {
            width: 28px;
          }

          .right {
            text-align: right;
            white-space: nowrap;
          }

          small {
            display: block;
            margin-top: 2px;
            color: ${printMuted};
            font-size: ${isThermal ? "10px" : "12px"};
          }

          .total {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            font-size: ${isThermal ? "15px" : "20px"};
            font-weight: 800;
          }

          .notes {
            border: 1px solid ${printText};
            padding: 6px;
            margin-top: 8px;
          }

          @media print {
            button {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <main class="ticket">
          <section class="center">
            <img alt="yopido.shop" src="https://www.yopido.shop/brand/yopido-logo-monochrome-blue.png" style="display:block;width:32mm;max-width:90%;height:auto;margin:0 auto 5px" />
            ${printLogo && safeLogoUrl ? `<img alt="${safeRestaurant}" class="logo" src="${safeLogoUrl}" />` : ""}
            <h1>${safeRestaurant}</h1>
            <p>${escapeHtml(orderSourceLabel(order))}</p>
            <p><strong>Pedido ${escapeHtml(order.orderNumber)}</strong></p>
          </section>

          <div class="divider"></div>

          <p><strong>Estado:</strong> ${escapeHtml(orderStatusLabels[order.status])}</p>
          <p><strong>Hora:</strong> ${escapeHtml(formatShortTime(order.createdAt))}</p>
          <p><strong>Cliente:</strong> ${escapeHtml(order.customerName || "Cliente")}</p>
          ${order.customerPhone ? `<p><strong>WhatsApp:</strong> ${escapeHtml(order.customerPhone)}</p>` : ""}
          <p><strong>Pago:</strong> ${escapeHtml(paymentMethodLabels[order.paymentMethod])} · <strong>${order.paymentStatus === "paid" ? "PAGADO" : "PENDIENTE DE COBRO"}</strong></p>
          ${order.paymentMethod === "cash" && order.paymentStatus === "pending" ? `<p><strong>${order.orderType === "table" ? "COBRAR AL CERRAR LA CUENTA" : "COBRAR ANTES DE ENTREGAR"}</strong></p>` : ""}

          <div class="divider"></div>
          <h2>Productos</h2>
          <table>
            <tbody>${items}</tbody>
          </table>
          <div class="divider"></div>
          <div class="total">
            <span>Total</span>
            <span>${formatMoney(order.total)}</span>
          </div>
          ${order.bankGroupSessionId ? `<div class="notes">QR verificado: ${formatMoney(order.groupPrepaidAmount ?? 0)}<br />Saldo efectivo: ${formatMoney(order.paymentStatus === "paid" ? 0 : order.groupCashDue ?? 0)}<br />Delivery separado. No volver a cobrar lo pagado por QR.</div>` : ""}
          ${order.notes ? `<div class="notes"><strong>Notas:</strong><br />${escapeHtml(order.notes)}</div>` : ""}
        </main>
      </body>
    </html>
  `;
}

export function printOrderTicket({
  order,
  restaurantName,
  restaurantLogoUrl,
  format,
  printLogo = true,
}: {
  order: Order;
  restaurantName: string;
  restaurantLogoUrl?: string;
  format: PrintFormat;
  printLogo?: boolean;
}) {
  const html = buildOrderTicketHtml({
    order,
    restaurantName,
    restaurantLogoUrl,
    format,
    printLogo,
  });

  const printWindow = window.open("", "_blank", "width=420,height=720");
  if (!printWindow) {
    return false;
  }

  printWindow.addEventListener("load", () => {
    if (format !== "large") {
      const ticket = printWindow.document.querySelector(".ticket");
      if (ticket) {
        const heightMm = Math.max(25, Math.ceil(ticket.getBoundingClientRect().height * 25.4 / 96 + 4));
        const style = printWindow.document.createElement("style");
        style.textContent = `@page { size: ${format === "thermal_58" ? 58 : 80}mm ${heightMm}mm; margin: 2mm; }`;
        printWindow.document.head.appendChild(style);
      }
    }
    printWindow.print();
  }, { once: true });
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  return true;
}
