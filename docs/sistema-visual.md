# Sistema visual de Yopido

Dirección aprobada a partir del catálogo: una mesa de trabajo clara para operar un restaurante. La fotografía identifica productos; los estados, cifras y acciones ayudan a decidir. La interfaz conserva el azul/lima y Geist. Este documento sustituye la documentación del piloto de diseño.

## Identidad y jerarquía

| Uso | Decisión |
| --- | --- |
| Acción principal | Azul `#12355B`, texto blanco |
| Acento de marca | Lima `#C7F000`, texto azul; evitar texto blanco sobre lima |
| Superficies | Blanco sobre fondo `#F8FAFC`, borde `#E5E7EB` |
| Texto auxiliar | `#59677A`, también en placeholders y valores predeterminados del tema |
| Tipografía | Geist existente; títulos 20–30 px, contenido 14–16 px, metadatos 12 px |
| Controles / tarjetas / diálogos | Radios de 10 / 16 / 22 px; en celular el diálogo auxiliar usa 16 px |
| Espaciado | Escala de 4, 8, 12, 16, 24 y 32 px |
| Interacción | Áreas principales de al menos 44 px, foco visible, transición de color de 150–160 ms |

Los tokens viven en `src/app/globals.css`; los valores predeterminados de personalización viven en `src/lib/theme/design-tokens.ts`. No sustituir los colores que un local haya configurado. Los encabezados reciben una jerarquía común desde `ui-app` en el layout raíz, evitando repetir cambios en todas las rutas. Reservar sombras marcadas para elementos elevados.

## Componentes que se deben reutilizar

| Componente | Responsabilidad y contrato |
| --- | --- |
| `Button`, `buttonClasses` | Las cuatro variantes actuales, foco y estado deshabilitado. Conservan eventos, atributos y tipo de botón del consumidor. |
| `Input`, `Select`, `Textarea` | Medidas, borde, contraste y foco coherentes. Mantener etiquetas, nombres de campos, restricciones y validación nativa. |
| `PasswordInput`, `SearchableSelect` | Acciones auxiliares de 44 px y nombres accesibles. Mantienen su comportamiento de selección y revelado. |
| `Card`, `SectionTitle`, `StatCard`, `Badge` | Superficies discretas, títulos legibles, números tabulares y estados con texto. |
| `DataTable` | Tabla de escritorio con `scope="col"`; lista semántica `dl/dt/dd` en celular. Conserva los datos y acciones de las filas. Los números primitivos se alinean a la derecha. |
| `EmptyState` | Explicación contextual, sin aparentar que hubo un error o inventar registros. |
| `WorkspaceNotice` | Aviso con icono, título y contenido opcional. `error` anuncia `alert`; `success` e `info` anuncian `status`. |
| `WorkspaceDialog` | Marco nativo para formularios auxiliares: título, cierre, scroll interno, viewport visual, bloqueo del fondo y restauración del foco. Se utiliza en productos, mesas, inventario y confirmación de configuración. |
| `ProductEditorDialog` | Editor especializado con encabezado y pie fijos, secciones plegables y estado de guardado dentro del pie. |
| `FormSubmitButton`, `PendingSubmitButton` | Feedback de envío. Conservar el bloqueo de envíos duplicados y los cierres pendientes de cada flujo. |
| `BrandLoadingOverlay`, `AdminModuleLoading`, `PanelLoading` | Carga anunciada, contenido estable y movimiento reducido. No usar una carga de página para cada interacción menor. |

```tsx
<WorkspaceNotice title="Cambios guardados" tone="success">
  Los datos del local se actualizaron correctamente.
</WorkspaceNotice>

<WorkspaceDialog title="Nueva mesa" onClose={close}>
  {/* El formulario conserva su acción, campos y validaciones existentes. */}
</WorkspaceDialog>
```

`WorkspaceDialog` no incorpora datos ni acciones de negocio. Su cierre se mantiene bloqueado si un descendiente comunica `aria-busy="true"`. Para formularios que necesitan el botón de guardar siempre visible, usar un editor con pie fijo como el de productos. Los diálogos de cobro, comprobantes y clientes conservan sus controles especializados; no reemplazarlos mecánicamente por el marco auxiliar.

## Aplicación en módulos existentes

- **Administración y dueño:** shell persistente, título/contenido diferenciados, enlaces con `aria-current`, controles de navegación con nombre y estado. El menú cerrado no recibe foco en celular.
- **Productos:** categorías laterales en escritorio y desplazables en celular; búsqueda, estado y vista juntos; métricas en franja; nombre completo, precio y edición estables; fallback de imagen. Mantiene creación por categoría, solo lectura, variantes, horarios y acciones.
- **Inventario y mesas:** formularios auxiliares sobre el marco compartido; seis métricas equilibradas en inventario; avisos de mesa anunciados. Campos y acciones sin cambios.
- **Caja, pedidos, reparto y menú público:** heredan controles, tokens y jerarquía; los avisos existentes conservan sus condiciones y mensajes y añaden semántica accesible donde corresponde.
- **Cocina:** jerarquía común y tablero desplazable accesible por teclado, sin cambiar estados, tiempos ni alertas de pedidos.
- **Configuración y riders del dueño:** feedback común de error/éxito; confirmación de configuración mediante diálogo accesible.
- **CRM y demás rutas:** heredan los componentes y layouts compartidos. Las modificaciones funcionales del CRM que ya estaban pendientes se mantienen fuera de esta rama.

El alcance es transversal mediante primitivas y layouts; no se afirma que cada ruta tenga una composición nueva ni que se hayan navegado todas con datos de producción. Esta rama modifica la web. Las aplicaciones nativas requieren su adaptación correspondiente.

## Validación del 14 de noviembre de 2026

- Compilación de producción de Next.js, TypeScript y ESLint sobre los archivos modificados.
- 26 regresiones existentes: productos configurables, presentación opcional, liquidación de mesas, POS/cocina, verificación QR y navegación persistente.
- Playwright: 66 comprobaciones con componentes reales y adaptadores locales de datos/acciones. Productos, mesas, inventario, caja y cocina en 1440×1000, 390×844, 320×568 y 844×390, sin desborde horizontal de página.
- Navegación móvil y destino activo; límites y cierre del diálogo de mesa; restauración de foco; bloqueo del cierre mientras guarda; preferencia de movimiento reducido; carga, error, éxito, vacío y solo lectura del catálogo. Revisión adicional del shell del dueño y del formulario de inventario.
- axe WCAG A/AA/2.1 AA sin infracciones detectadas en los cinco módulos de esa muestra móvil después de corregir el contraste secundario y la región desplazable de cocina. No equivale a certificar todas las pantallas ni todos los estados.
- Comparación AST de los diez componentes principales: 241 sentencias de estado, cálculos y handlers anteriores al render permanecen idénticas. Sin cambios a acciones de servidor, API, servicios, permisos o esquema de base de datos.

El navegador usa datos ficticios y no ejecuta cobros ni guarda registros reales. Los adaptadores, capturas y servidor temporal permanecen fuera del repositorio y se detienen al terminar; no hay rutas de demostración nuevas en la aplicación. Las pruebas de regresión útiles se conservan.

## Trabajo y revisión de futuras mejoras

1. Partir de `main` actualizado y trabajar en una rama de funcionalidad aislada.
2. Cambiar el componente compartido cuando corresponda; evitar copiar una pantalla para mostrar una alternativa.
3. Verificar una ruta existente y sus estados con fixtures externos o pruebas de regresión, nunca con una nueva ruta pública de demostración.
4. Revisar el diff: componentes nuevos deben tener consumidores reales, sin dependencias ni archivos generados innecesarios.
5. Abrir PR hacia `main` con alcance y evidencia; integrar después de la revisión visual. El preview, si está configurado en el repositorio, debe usar las rutas reales de esa rama.

## POS operativo

El catálogo y el pedido se muestran en paralelo desde 1024 px. La altura se ajusta al espacio visible con `ResizeObserver`; solo las listas de productos y líneas del carrito desplazan su contenido. Total, origen, servicio y cobro permanecen fuera de esas listas. En pantallas estrechas, el acceso fijo «Ver pedido» abre el carrito; no simula un cobro.

Las fichas usan miniaturas de 72 px y nombres de hasta dos líneas. Búsqueda y categorías ocupan filas distintas para conservar el ancho de escritura. La cabecera de turno se mantiene compacta y se evita repetir el título de Venta POS. Se conserva el checkout existente con sus métodos y validaciones.

La validación visual utiliza seis productos en 1440×900, 1366×768, 1024×768, 390×844 y 320×568; comprueba que el botón de cobrar permanece visible y que se puede abrir y cerrar el checkout sin ejecutar pagos. Las pestañas anticipan su carga al recibir foco o intención del puntero; la prueba de navegación verifica que el indicador desaparece al llegar los datos.
