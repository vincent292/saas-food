import { formatShortTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import type { Order } from "@/types/order.types";
import { orderSourceLabel, orderStatusLabels, paymentMethodLabels } from "./orderPresentation";

export type PrintFormat = "thermal_58" | "thermal_80" | "large";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
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

export function printOrderTicket({
  order,
  restaurantName,
  format,
}: {
  order: Order;
  restaurantName: string;
  format: PrintFormat;
}) {
  const isThermal = format !== "large";
  const paperWidth = format === "thermal_58" ? "58mm" : format === "thermal_80" ? "80mm" : "210mm";
  const safeRestaurant = escapeHtml(restaurantName);
  const items = order.items
    .map(
      (item) => `
        <tr>
          <td>${item.quantity}x</td>
          <td>
            <strong>${escapeHtml(item.productName)}</strong>
            ${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ""}
          </td>
          <td class="right">${formatMoney(item.subtotal)}</td>
        </tr>
      `,
    )
    .join("");

  const html = `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(order.orderNumber)} - ${formatTitle(format)}</title>
        <style>
          @page {
            size: ${isThermal ? paperWidth : "A4"};
            margin: ${isThermal ? "4mm" : "14mm"};
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            background: #fff;
            color: #111;
            font-family: Arial, sans-serif;
            font-size: ${isThermal ? "11px" : "14px"};
          }

          .ticket {
            width: ${paperWidth};
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

          h2 {
            margin: 8px 0 4px;
            font-size: ${isThermal ? "14px" : "20px"};
          }

          p {
            margin: 2px 0;
          }

          .divider {
            border-top: 1px dashed #111;
            margin: 8px 0;
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
            color: #444;
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
            border: 1px solid #111;
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
            <h1>${safeRestaurant}</h1>
            <p>${escapeHtml(orderSourceLabel(order))}</p>
            <p><strong>Pedido ${escapeHtml(order.orderNumber)}</strong></p>
          </section>

          <div class="divider"></div>

          <p><strong>Estado:</strong> ${escapeHtml(orderStatusLabels[order.status])}</p>
          <p><strong>Hora:</strong> ${escapeHtml(formatShortTime(order.createdAt))}</p>
          <p><strong>Cliente:</strong> ${escapeHtml(order.customerName || "Cliente")}</p>
          ${order.customerPhone ? `<p><strong>WhatsApp:</strong> ${escapeHtml(order.customerPhone)}</p>` : ""}
          <p><strong>Pago:</strong> ${escapeHtml(paymentMethodLabels[order.paymentMethod])}</p>

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
          ${order.notes ? `<div class="notes"><strong>Notas:</strong><br />${escapeHtml(order.notes)}</div>` : ""}
        </main>
        <script>
          window.addEventListener("load", () => {
            window.print();
          });
        </script>
      </body>
    </html>
  `;

  const printWindow = window.open("", "_blank", "width=420,height=720");
  if (!printWindow) {
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
