import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const outputDir = path.join(process.cwd(), "public", "manuales");

const manuals = [
  {
    file: "manual-inventario.pdf",
    title: "Manual de inventario",
    subtitle: "Control simple para restaurantes y sucursales",
    sections: [
      ["Objetivo", ["Mantener stock real por sucursal sin convertir el sistema en inventario industrial.", "Usar inventario para saber que hay, que falta, que esta por vencer y que productos se pueden vender.", "Cada sucursal maneja su propio stock. Si un producto no esta disponible, la tienda puede sugerir otra sucursal compatible."]],
      ["Conceptos principales", ["Producto terminado: unidades listas para vender, por ejemplo galleta de chocolate o cheesecake.", "Insumo: materia prima usada en recetas, por ejemplo pan, carne, queso, leche o harina.", "Material: bolsas, empaques, vasos, servilletas u otros consumibles.", "Receta: relacion entre un producto de venta y los insumos que descuenta al aprobar/cobrar el pedido."]],
      ["Entrada de stock", ["Ingresa cantidad, proveedor si aplica, lote y fecha de vencimiento cuando corresponda.", "Usa notas claras: compra, produccion del dia, ajuste autorizado o transferencia recibida.", "Si el item vence, registra la fecha. El sistema lo marca en la vista Por vencer."]],
      ["Salidas y descuento por venta", ["Las salidas manuales sirven para merma, uso interno o correcciones autorizadas.", "Cuando una venta se registra en caja, el sistema descuenta los insumos ligados por receta.", "Si falta stock, la aprobacion puede bloquearse para evitar vender algo que no existe."]],
      ["Conteos por turno", ["Cuenta el stock fisico al inicio o cierre de turno.", "Registra diferencias con nota obligatoria si hay faltante o sobrante.", "Usa los conteos para detectar errores de produccion, pedidos mal registrados o mermas no anotadas."]],
      ["Transferencias entre sucursales", ["Solo mueve stock entre sucursales del mismo responsable y ciudad.", "Registra cantidad y motivo. La sucursal origen descuenta y la destino recibe.", "No uses transferencia para ocultar faltantes: si hubo perdida, registra salida o ajuste con motivo."]],
      ["Buenas practicas", ["Revisar bajo minimo al iniciar turno.", "Registrar vencimientos el mismo dia que entra la mercaderia.", "Mantener recetas simples y revisarlas cuando cambie la porcion.", "No editar stock directo si puedes explicar el movimiento con entrada, salida, conteo o transferencia."]],
    ],
  },
  {
    file: "manual-caja.pdf",
    title: "Manual de caja",
    subtitle: "Apertura, cobro, aprobacion y cierre",
    sections: [
      ["Objetivo", ["Caja controla el dinero del turno y aprueba pedidos que necesitan pago.", "Cada cobro debe quedar asociado a una venta, movimiento o pedido.", "La caja abierta es el punto de seguridad antes de procesar pedidos pendientes."]],
      ["Apertura de caja", ["Abre caja al iniciar turno con el efectivo inicial real.", "No apruebes pedidos si la caja esta cerrada.", "Si ya existe una caja abierta, continua con esa sesion o cierra correctamente antes de abrir otra."]],
      ["Pedidos por aprobar", ["Los pedidos web, recojo, delivery o mesa entran como pendientes.", "Revisa nombre, WhatsApp, total, metodo de pago y detalle del pedido.", "Para pedido de mesa, el cliente debe acercarse a caja si paga efectivo o QR segun configuracion.", "Aprueba solo cuando el pago este confirmado. Si no corresponde, rechaza con motivo."]],
      ["Cobros y comprobantes", ["Efectivo aumenta el efectivo esperado.", "QR, transferencia o tarjeta quedan como cobro digital.", "Si el pago requiere referencia, registra numero de comprobante o evidencia segun el flujo configurado."]],
      ["Movimientos", ["Registra egresos con motivo claro: compra menor, devolucion, ajuste autorizado.", "Evita borrar movimientos. Lo correcto es reversar o registrar un nuevo movimiento explicado.", "Los reportes dependen de motivos claros y montos correctos."]],
      ["Cierre y arqueo", ["Cuenta el efectivo fisico antes de cerrar.", "Compara con el efectivo esperado.", "Si hay diferencia, deja nota. No ajustes sin explicar.", "Despues del cierre, revisa reportes para detectar diferencias recurrentes."]],
      ["Buenas practicas", ["Mantener caja abierta solo durante el turno real.", "Aprobar pedidos en cuanto el pago este confirmado.", "No compartir usuarios entre cajeros.", "Usar buscador por numero, nombre o WhatsApp cuando haya muchos pedidos."]],
    ],
  },
  {
    file: "manual-pedidos.pdf",
    title: "Manual de pedidos",
    subtitle: "Recepcion, preparacion, despacho y seguimiento",
    sections: [
      ["Objetivo", ["Pedidos centraliza lo que entra desde tienda virtual, QR de mesa, recojo, delivery y POS.", "El objetivo es aprobar rapido, evitar pedidos perdidos y mantener seguimiento claro para el cliente."]],
      ["Estados principales", ["Pendiente: pedido recibido, falta aprobacion de caja o revision.", "Aceptado: pedido aprobado y listo para preparacion.", "Preparando: cocina o area operativa esta trabajando.", "Listo: el pedido esta listo para recoger, servir o despachar.", "Entregado: ciclo terminado. Ya no necesita refresco ni alerta.", "Cancelado: pedido rechazado o anulado con motivo."]],
      ["Flujo web, recojo y delivery", ["El cliente crea el pedido desde la tienda.", "Caja revisa pago y aprueba.", "Cocina prepara y marca listo.", "Para delivery, se asigna repartidor con QR/enlace y el seguimiento muestra su avance.", "Cuando se entrega, el pedido sale del flujo activo y queda en historial/reportes."]],
      ["Pedidos desde mesa", ["El cliente escanea el QR de mesa y arma su pedido.", "No se pide mapa ni direccion.", "Si requiere pago en caja, el sistema muestra aviso para acercarse a confirmar.", "Caja puede aprobar o eliminar de vista con motivo si el pedido fue incorrecto o nunca pagaron."]],
      ["Alertas", ["Cuando llega un pedido nuevo, el panel muestra alerta global en cualquier modulo administrativo.", "El sonido se repite hasta que el operador abre la alerta o marca que ya lo vio.", "Por seguridad del navegador, una persona debe pulsar Activar sonido una vez al abrir el panel."]],
      ["Cocina y despacho", ["Cocina trabaja en una vista limpia por estados.", "Los colores de tiempo ayudan a priorizar: verde a tiempo, amarillo demorado, rojo tarde.", "Al despachar o entregar, el pedido pasa a historial para mantener la pantalla limpia."]],
      ["Buenas practicas", ["No dejar pedidos pendientes sin revisar.", "Usar WhatsApp del cliente si falta confirmacion.", "Mantener abierta la pantalla de pedidos o cualquier modulo admin con sonido activo.", "Cerrar el ciclo del pedido cuando realmente fue entregado o retirado."]],
    ],
  },
];

function escapePdfText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function textLine(text, x, y, size, color = "0.12 0.16 0.22") {
  return `${color} rg BT /F1 ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`;
}

function buildPages(manual) {
  const pages = [];
  let commands = [];
  let y = 782;

  const newPage = () => {
    pages.push(commands.join("\n"));
    commands = [];
    y = 790;
  };

  const ensureSpace = (space) => {
    if (y < space) {
      newPage();
    }
  };

  commands.push("0.02 0.12 0.20 rg 0 760 595 82 re f");
  commands.push(textLine(manual.title, 48, 812, 22, "1 1 1"));
  commands.push(textLine(manual.subtitle, 48, 786, 12, "0.75 0.92 1"));
  y = 728;

  for (const [heading, items] of manual.sections) {
    ensureSpace(135);
    commands.push(textLine(heading, 48, y, 16, "0.02 0.12 0.20"));
    y -= 24;

    for (const item of items) {
      const lines = wrapText(item, 88);
      ensureSpace(40 + lines.length * 15);
      commands.push(textLine("•", 58, y, 11, "0.50 0.68 0.00"));
      lines.forEach((line, index) => {
        commands.push(textLine(line, 76, y - index * 15, 10.5, "0.20 0.24 0.30"));
      });
      y -= lines.length * 15 + 10;
    }

    y -= 10;
  }

  commands.push(textLine("Manual operativo SaaS Food", 48, 36, 9, "0.45 0.48 0.54"));
  pages.push(commands.join("\n"));
  return pages;
}

function buildPdf(manual) {
  const pageStreams = buildPages(manual);
  const objects = [];

  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];

  for (const stream of pageStreams) {
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "binary"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "binary");
}

mkdirSync(outputDir, { recursive: true });

for (const manual of manuals) {
  writeFileSync(path.join(outputDir, manual.file), buildPdf(manual));
  console.log(`Generated ${manual.file}`);
}
