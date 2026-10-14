"""Compact, visually reviewed report of the first QA pass."""
from pathlib import Path
from html import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf/yopido-informe-qa-2026-10-14.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
font_dir = Path('/System/Library/Fonts/Supplemental')
pdfmetrics.registerFont(TTFont('QAArial', str(font_dir / 'Arial.ttf')))
pdfmetrics.registerFont(TTFont('QAArialBold', str(font_dir / 'Arial Bold.ttf')))
pdfmetrics.registerFontFamily('QAArial', normal='QAArial', bold='QAArialBold')
navy, muted, light = [colors.HexColor(c) for c in ['#163859', '#596875', '#F0F5F8']]
styles = {
    'body': ParagraphStyle('body', fontName='QAArial', fontSize=11, leading=15, spaceAfter=11),
    'title': ParagraphStyle('title', fontName='QAArialBold', fontSize=24, leading=29, textColor=navy, spaceAfter=18),
    'h2': ParagraphStyle('h2', fontName='QAArialBold', fontSize=14, leading=18, textColor=navy, spaceAfter=9),
    'small': ParagraphStyle('small', fontName='QAArial', fontSize=9, leading=12, textColor=muted, spaceAfter=8),
}
story = []
def p(text, style='body'):
    story.append(Paragraph(escape(text).replace('\n', '<br/>'), styles[style]))
def heading(text):
    p(text, 'h2')
def page(text):
    if story:
        story.append(PageBreak())
    p(text, 'title')

page('Yopido / Informe de QA')
p('14 de octubre de 2026 - Primera fase técnica', 'small')
heading('Resultado: todavía no aprobar venta general')
p('El núcleo de cobro, mesa y estados pasó las pruebas SQL aisladas. Se reprodujeron dos problemas funcionales en la coordinación multi-local. No se modificó la lógica de la aplicación ni se enviaron pedidos a producción.')
heading('Comprobaciones ejecutadas')
rows = [[Paragraph('Verificación', styles['h2']), Paragraph('Resultado', styles['h2'])]]
for a, b in [
    ('Suite integrada', '120 pruebas: 113 pasan, 5 fallan, 2 omitidas'),
    ('Pruebas QA nuevas', '9 ejecutadas; 2 reproducen problemas conocidos'),
    ('TypeScript / build', 'Aprobados'),
    ('Seguridad estática / lint nuevo', 'Aprobados'),
    ('HTTP local sin sesión', '9 comprobaciones de acceso y validación'),
    ('Android / interfaz autenticada', 'No ejecutados: faltan dispositivos y acceso UI'),
    ('Supabase remoto', 'Lectura denegada con 403'),
]:
    rows.append([Paragraph(escape(a), styles['body']), Paragraph(escape(b), styles['body'])])
t = Table(rows, colWidths=[205, 302])
t.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,0), light), ('VALIGN', (0,0), (-1,-1), 'TOP'),
                      ('LEFTPADDING',(0,0),(-1,-1),9), ('RIGHTPADDING',(0,0),(-1,-1),9),
                      ('TOPPADDING',(0,0),(-1,-1),9), ('BOTTOMPADDING',(0,0),(-1,-1),5)]))
story += [t, Spacer(1, 18)]
heading('Cómo interpretar estos resultados')
p('Una prueba diagnóstica puede pasar porque logra reproducir un error. No significa que ese comportamiento sea correcto. La suite también conserva las cinco expectativas antiguas fallidas; no se maquillaron resultados.')
p('PGlite usa una conexión local y fixtures de identidad e inventario. No certifica permisos reales de la base, stock, capacidad de producción, notificaciones, banco ni teléfonos.', 'small')

page('Los cinco fallos anteriores')
p('Clasificación de la causa inmediata; no son cinco incidentes de producción confirmados.', 'small')
for title, desc in [
    ('1. Acceso y membresía', 'La prueba exige un patrón de cliente admin que ya no existe. El servicio actual comprueba usuario y membresía activa. Nueva prueba: sin membresía se redirige a no-access. Falta validar aislamiento/RLS en staging.'),
    ('2. Mensualidad', 'La prueba prohíbe la pestaña Operación. La pestaña vigente controla cocina/preparación, no el cobro mensual. La causa inmediata es una expectativa de UI obsoleta.'),
    ('3. Horarios del catálogo', 'La prueba espera rechazar hora final anterior a la inicial. Ahora se admiten horarios nocturnos. Se comprobó viernes 22:00 hasta sábado 02:00 y que los días vacíos no se convierten en domingo.'),
    ('4. Aviso ETA por WhatsApp', 'Espera un mensaje al cambiar el tiempo. El endpoint guarda el ajuste y lo omite por la política acordada para reducir mensajes. No hay que volver a enviar avisos redundantes solo para poner el test verde.'),
    ('5. Mensaje al preparar', 'Exige una rama de preparing que ya se retiró. La política actual omite preparar, ETA y entregado. La prueba funcional comprobó esa omisión sin contactar Meta.'),
]:
    heading(title)
    p(desc)
heading('Acción recomendada')
p('Actualizar las expectativas y añadir pruebas funcionales de autorización, horario y notificaciones. No borrar los controles ni tratar una expresión regular como certificación de seguridad.')

page('Problemas reproducidos')
heading('QA-01 / ALTA - El plan subestima la cocina')
p('Escenario: preparación 12 min, capacidad 3, 12 pedidos activos y 3 preparando. El pronóstico calcula 45 min de cola y 60 min hasta estar listo. La ruta toma 12 + 45 y usa 57 min.')
p('Esperado: conservar el pronóstico completo, incluido el ajuste por alta demanda y el mínimo de preparación de la cocina. Afecta tanto multi-local individual como grupal.')
p('Evidencia: kitchen-forecast.ts:43; multisite-planner.ts:92-93; diagnóstico QA nuevo. Estado: reproducido localmente, sin corrección en esta pasada.', 'small')
heading('QA-02 / ALTA - Preparación anticipada permitida')
p('Escenario: pedido aceptado con hora programada a 30 min. Al llamar la RPC de cambio de estado, accepted pasa a preparing inmediatamente: status_changed = true.')
p('Esperado para multi-local: coordinación de liberación respetada o excepción explícita y auditada. Guardar una hora sugerida no evita que la comida rápida se prepare demasiado pronto.')
p('Evidencia: RPC real de migración 0092 y campos guardados por creación multi-local. La prueba demuestra que la RPC no impone el horario; no demuestra cómo actuará cada cocinero.', 'small')
heading('Pendientes de verificación, no errores remotos confirmados')
p('La instalación remota de la corrección SQL 0119 no pudo comprobarse: Supabase rechazó la lectura con 403. Revisar también tickets antiguos, techo visible de 75 min y catálogo de locales suspendidos en staging.')
p('GPS multi-local en segundo plano y negociación cliente/rider necesitan APK reales. No se aprobaron por esta fase.', 'small')

page('Qué pasó y qué sigue')
heading('Núcleo SQL aprobado en aislamiento')
for line in [
    'Diez cobros repetidos: una sola venta de Bs 60; transiciones repetidas no vuelven a cambiar el estado.',
    'Sin sesión, mesero cobrando, caja cerrada, pedido cancelado o QR delivery sin prueba: rechazo sin ingresos.',
    'QR cobrado explícitamente por caja: prueba original conservada y un movimiento, aun al reintentar.',
    'Mesa: aprobar no cobra; cocinar y liquidar dos veces cobra una sola vez y libera la mesa.',
]:
    p('- ' + line)
heading('Smoke HTTP local')
p('Paneles /admin y /dueno: 307 a login. Login: 200. POS, ofertas/rutas rider y cron sin autorización: 401. Seguimiento con JSON inválido o vacío: 400. No se usaron sesiones válidas ni se pagó nada real.')
heading('Bloqueos para completar el piloto')
p('No aparecen dispositivos en adb. La herramienta de navegador falló al iniciar y no permite inspección de UI. La consulta remota de Supabase devuelve 403. Falta ambiente y cuentas autenticadas de prueba.')
heading('Orden de trabajo recomendado')
p('1. Autorizar la corrección de QA-01/QA-02 y las pruebas antiguas.\n2. Recuperar lectura de staging y comprobar despliegue/migraciones.\n3. Conectar cliente, rider y POS Android.\n4. Ejecutar pedido, grupo, oferta, códigos, QR, desconexión y cierre conciliado.')
p('Se añadieron solo pruebas y reportes. La lógica de negocio y producción permanecen sin cambios. Detalle reproducible: docs/qa-2026-10-14.md y tests/qa-core-workflow.test.mjs.', 'small')

def footer(c, doc):
    c.setStrokeColor(colors.HexColor('#D7E2EA'))
    c.line(44, 40, A4[0]-44, 40)
    c.setFillColor(muted)
    c.setFont('QAArial', 8)
    c.drawString(44, 26, 'Yopido | QA técnico | 14/10/2026 | Sin aprobación de venta general')
    c.drawRightString(A4[0]-44, 26, str(doc.page))

doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=44, rightMargin=44, topMargin=43, bottomMargin=57,
                        title='Yopido - Informe QA 14 octubre 2026', author='Yopido')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
