from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from datetime import datetime

def generate_pdf(data):
    filename = f"reports/report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    c = canvas.Canvas(filename, pagesize=A4)
    
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, 800, "Plant Disease Detection Report")
    c.setFont("Helvetica", 12)
    c.drawString(50, 770, f"Plant: {data['plant']}")
    c.drawString(50, 750, f"Disease: {data['disease']}")
    c.drawString(50, 730, f"Confidence: {data['confidence']}%")
    c.drawString(50, 710, f"Severity: {data['advisory']['severity_level']}")
    # ... add all advisory sections
    c.save()
    return filename