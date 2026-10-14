"""Render the existing release acceptance plan without changing application code."""
from pathlib import Path
import re
from html import escape
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, Flowable, KeepTogether
from reportlab.lib.styles import ParagraphStyle

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf/yopido-ruta-pruebas-venta.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
FONT = Path('/System/Library/Fonts/Supplemental')
pdfmetrics.registerFont(TTFont('Arial', str(FONT / 'Arial.ttf')))
pdfmetrics.registerFont(TTFont('ArialBold', str(FONT / 'Arial Bold.ttf')))
pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='ArialBold')
NAVY = colors.HexColor('#163859')
LIME = colors.HexColor('#C5EF00')
INK = colors.HexColor('#202A35')
MUTED = colors.HexColor('#596875')
LIGHT = colors.HexColor('#F0F5F8')
RED = colors.HexColor('#9F3333')
WIDTH = A4[0] - 88
styles = {
    'body': ParagraphStyle('body', fontName='Arial', fontSize=10.4, leading=14.2, textColor=INK),
    'small': ParagraphStyle('small', fontName='Arial', fontSize=9, leading=12.5, textColor=MUTED),
    'title': ParagraphStyle('title', fontName='ArialBold', fontSize=25, leading=29, textColor=NAVY, spaceAfter=14),
    'h2': ParagraphStyle('h2', fontName='ArialBold', fontSize=15, leading=19, textColor=NAVY, spaceAfter=9),
    'label': ParagraphStyle('label', fontName='ArialBold', fontSize=10.4, leading=14.2, textColor=NAVY),
}

def clean(text):
    return text.replace('—', '-').replace('→', ' > ').replace('«', '"').replace('»', '"').replace('–', '-')

def para(text, style='body'):
    text = escape(clean(text))
    text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    return Paragraph(text, styles[style])

class Box(Flowable):
    def __init__(self, content, color=LIGHT, text_color=INK):
        super().__init__()
        self.p = para(content)
        self.p.style = ParagraphStyle('box', parent=styles['body'], textColor=text_color)
        self.color = color
    def wrap(self, width, height):
        self.width = width
        _, ph = self.p.wrap(width - 26, height)
        self.height = ph + 24
        return self.width, self.height
    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.roundRect(0, 0, self.width, self.height, 8, fill=1, stroke=0)
        self.p.drawOn(self.canv, 13, 12)

class Check(Flowable):
    def __init__(self, code, text):
        super().__init__()
        self.p = para(f'**{code}**  {text}')
    def wrap(self, width, height):
        self.width = width
        _, ph = self.p.wrap(width - 25, height)
        self.ph = ph
        self.height = ph + 8
        return width, self.height
    def draw(self):
        self.canv.setStrokeColor(MUTED)
        self.canv.setLineWidth(.8)
        self.canv.rect(1, self.height - 13, 10, 10, fill=0, stroke=1)
        self.p.drawOn(self.canv, 25, 8)

class Roadmap(Flowable):
    def __init__(self, rows):
        super().__init__()
        self.rows = rows
    def wrap(self, width, height):
        self.width, self.height = width, len(self.rows) * 49
        return self.width, self.height
    def draw(self):
        c = self.canv
        c.setStrokeColor(colors.HexColor('#D7E2EA'))
        c.setLineWidth(2)
        c.line(17, 26, 17, self.height - 23)
        for n, (title, note) in enumerate(self.rows):
            y = self.height - n * 49 - 23
            c.setFillColor(LIME)
            c.circle(17, y, 15, fill=1, stroke=0)
            c.setFillColor(NAVY)
            c.setFont('ArialBold', 12)
            c.drawCentredString(17, y - 4, str(n))
            c.setFont('ArialBold', 12)
            c.drawString(45, y + 3, title)
            c.setFont('Arial', 9.5)
            c.setFillColor(MUTED)
            c.drawString(45, y - 12, note)

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.saved = []
    def showPage(self):
        self.saved.append(dict(self.__dict__))
        self._startPage()
    def save(self):
        total = len(self.saved)
        for state in self.saved:
            self.__dict__.update(state)
            self.setStrokeColor(colors.HexColor('#D7E2EA'))
            self.setLineWidth(.6)
            self.line(44, 40, A4[0] - 44, 40)
            self.setFont('Arial', 8)
            self.setFillColor(MUTED)
            self.drawString(44, 26, 'Yopido | Plan de aceptación | Edición 14/10/2026')
            self.drawRightString(A4[0] - 44, 26, f'{self._pageNumber} / {total}')
            super().showPage()
        super().save()

source = (ROOT / 'docs/ruta-pruebas-salida-venta.md').read_text()
parts = re.split(r'^## ', source, flags=re.M)
stages = []
for section in parts:
    title = section.splitlines()[0] if section else ''
    if not re.match(r'^[0-6]\. ', title):
        continue
    cases = re.findall(r'^- \[ \] ([A-Z]\d\d) (.+)$', section, flags=re.M)
    gate = re.search(r'\*\*Puerta de salida:\*\* (.+)', section)
    stages.append((title, cases, gate.group(1) if gate else 'Resolver o limitar explícitamente el alcance antes de vender multi-local.'))

story = [para('YOPIDO / LANZAMIENTO', 'label'), Spacer(1, 12),
         para('Ruta de pruebas<br/>para salir a la venta', 'title')]
# The heading is intentionally authored as markup, not escaped text.
story[-1] = Paragraph('Ruta de pruebas<br/>para salir a la venta', styles['title'])
story += [para('Web + cliente Android + caja/POS + riders + WhatsApp'), Spacer(1, 14),
          Roadmap([
              ('Preparar el piloto', 'Mismo ambiente, versiones y datos de prueba.'),
              ('Proteger accesos y catálogo', 'Permisos por rol y ningún acceso entre negocios.'),
              ('Validar pedidos, cocina y caja', 'Un pedido, un cobro y un cierre conciliado.'),
              ('Probar teléfonos y delivery', 'APK físico, red, notificaciones y recuperación.'),
              ('Coordinar grupales y multi-local', 'Colas, oferta del rider, recojos y entrega.'),
              ('Verificar integraciones y mensualidad', 'WhatsApp, QR, prórrogas y suspensión correcta.'),
              ('Piloto comercial y recuperación', 'Pico de trabajo, respaldo, soporte y aprobación.'),
          ]), Spacer(1, 18),
          Box('**Regla para vender:** cero fallos críticos en las funciones ofrecidas. Las pendientes no se prometen y deben quedar efectivamente deshabilitadas.'),
          Spacer(1, 12), para('Checklist de trabajo: marca cada caso tras ejecutarlo. Este documento no certifica que el sistema ya esté listo.', 'small'),
          Spacer(1, 10), para('Generado el 14/10/2026. Evidencia técnica disponible: revisión del 12/10/2026; no se repitió hoy.', 'small'), PageBreak()]

story += [para('Antes de comenzar', 'title'),
          para('Qué sabemos y qué falta verificar', 'h2'),
          Box('**Revisión del 12 de octubre:** TypeScript y controles estáticos de seguridad aprobados. Suite local: 111 pruebas; 104 aprobadas, 5 fallidas y 2 omitidas.'), Spacer(1, 14),
          para('Las cinco fallidas revisan permisos, mensualidad, días del catálogo y avisos WhatsApp/ETA. Son comprobaciones de código: pueden revelar un fallo o una prueba desactualizada. Hay que investigarlas, no ignorarlas.'), Spacer(1, 14),
          para('Alertas para el piloto', 'h2'),
          Check('01', 'El plan multi-local no incorpora todo el ajuste del pronóstico bajo demanda. La programación sugerida tampoco garantiza que cocina espere para preparar.'),
          Check('02', 'GPS multi-local en segundo plano y notificaciones deben validarse con APK y teléfonos reales.'),
          Check('03', 'La prueba de 1000 maestros / 2500 hijos fue local, con una conexión PGlite. No mide la capacidad de Vercel/Supabase.'),
          Check('04', 'Comprobar de nuevo despliegue, migraciones y cron del ambiente. Las pruebas Android con APIs simuladas no sustituyen un pedido real.'),
          Spacer(1, 14), para('Cómo dejar evidencia', 'h2'),
          Box('Por caso: **estado + versión APK/backend + ambiente + rol/local + ID del pedido + monto esperado/obtenido + captura + fecha/hora Bolivia**.'), Spacer(1, 12),
          para('Estados: pendiente / aprobado / fallido / no aplica al alcance vendido. Una prueba automática no aprueba por sí sola una prueba manual.'), Spacer(1, 14),
          para('Equipo de prueba', 'h2'),
          para('Tres locales del dueño A y uno del dueño B; dos clientes y dos riders para probar grupos y aceptación simultánea. Caja, cocina, mesero y superadmin pueden combinar web y POS Android según el flujo vendido.'), PageBreak()]

for index, (title, cases, gate) in enumerate(stages):
    story += [para(f'ETAPA {index} / CHECKLIST', 'label'), Spacer(1, 9), para(title.split('. ', 1)[1], 'title'),
              para('Fecha: __________________   Responsable: __________________', 'small'), Spacer(1, 15)]
    for code, text in cases:
        story.append(Check(code, text))
    story += [Spacer(1, 12), KeepTogether([para('Condición para pasar a la siguiente etapa', 'h2'), Box(gate)]),
              Spacer(1, 12), para('Resultado:  [ ] Aprobado   [ ] Pendiente   [ ] Fallido   [ ] No aplica', 'small'),
              Spacer(1, 9), para('Incidencias / evidencia: __________________________________________________', 'small'), PageBreak()]

story += [para('Decisión de salida', 'title'),
          para('Aprobar el alcance que realmente vamos a vender', 'h2'),
          Box('El núcleo POS / mesas / menú puede salir antes que multi-local o WhatsApp, únicamente si sus casos están aprobados y las funciones pendientes quedan deshabilitadas.'), Spacer(1, 18),
          Check('01', 'Todos los casos críticos del alcance vendido están aprobados con evidencia.'),
          Check('02', 'No hay pedidos perdidos, duplicados, cobros incorrectos ni acceso entre negocios.'),
          Check('03', 'El piloto incluyó un turno pico, entregas y cierre de caja conciliado.'),
          Check('04', 'Se ensayó recuperar el respaldo y volver a una versión estable.'),
          Check('05', 'Caja, cocina, rider y dueño tienen instrucciones; hay responsable de soporte.'),
          Spacer(1, 16), para('Piloto propuesto', 'h2'),
          para('Operación supervisada con tres locales, teléfonos físicos y pruebas de cada función ofrecida. Carga en staging progresiva: 10 > 25 > 50 usuarios; acordar límites y detener ante fallos críticos. No es una garantía de capacidad.'),
          Spacer(1, 20), para('Alcance aprobado: ____________________________________________________'), Spacer(1, 15),
          para('Funciones excluidas: __________________________________________________'), Spacer(1, 15),
          para('Responsable / fecha: __________________________________________________'), Spacer(1, 18),
          para('Fuente: ruta interna de pruebas del 12/10/2026 y documentos de verificación de Android, carga multi-local, mensualidad y WhatsApp. Edición visual: 14/10/2026. No se ejecutaron nuevas pruebas ni se modificó producción para generar este PDF.', 'small')]

doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=44, leftMargin=44,
                        topMargin=43, bottomMargin=57, title='Yopido - Ruta de pruebas para salir a la venta',
                        author='Yopido', pageCompression=1)
doc.build(story, canvasmaker=NumberedCanvas)
print(OUT)
