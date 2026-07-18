export type SupportManual = {
  id: "inventario" | "caja" | "pedidos";
  title: string;
  description: string;
  href: string;
  updatedLabel: string;
  highlights: string[];
};

export const supportManuals: SupportManual[] = [
  {
    id: "inventario",
    title: "Manual de inventario",
    description: "Entradas, salidas, recetas, productos terminados, vencimientos, conteos y transferencias entre sucursales.",
    href: "/manuales/manual-inventario.pdf",
    updatedLabel: "Actualizado con sucursales y vencimientos",
    highlights: ["Stock simple por sucursal", "Recetas y descuento por venta", "Lotes, vencimientos y conteos"],
  },
  {
    id: "caja",
    title: "Manual de caja",
    description: "Apertura, cobros, pedidos por aprobar, delivery, recojo, arqueo, cierre y movimientos auditables.",
    href: "/manuales/manual-caja.pdf",
    updatedLabel: "Actualizado con flujo de pedidos",
    highlights: ["Apertura y cierre", "Aprobacion de pedidos", "Reportes y arqueo"],
  },
  {
    id: "pedidos",
    title: "Manual de pedidos",
    description: "Recepcion, aprobacion, cocina, despacho, seguimiento del cliente y pedidos desde mesa.",
    href: "/manuales/manual-pedidos.pdf",
    updatedLabel: "Actualizado con mesas y seguimiento",
    highlights: ["Pedidos web y mesa", "Estados operativos", "Alertas y seguimiento"],
  },
];
