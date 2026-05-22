from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
INPUT_MD = ROOT / "docs" / "FACILITY_OPERATIONS_FUTURE_ADVANCEMENTS_REPORT.md"
OUTPUT_PDF = ROOT / "docs" / "FACILITY_OPERATIONS_FUTURE_ADVANCEMENTS_REPORT.pdf"


def to_html_line(text: str) -> str:
    text = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return text


def build_pdf() -> None:
    if not INPUT_MD.exists():
        raise FileNotFoundError(f"Input markdown not found: {INPUT_MD}")

    styles = getSampleStyleSheet()
    body = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        spaceAfter=6,
    )
    heading1 = ParagraphStyle(
        "Heading1Custom",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=20,
        spaceBefore=10,
        spaceAfter=8,
    )
    heading2 = ParagraphStyle(
        "Heading2Custom",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        spaceBefore=8,
        spaceAfter=6,
    )
    bullet = ParagraphStyle(
        "BulletCustom",
        parent=body,
        leftIndent=14,
        bulletIndent=0,
    )

    story = []
    lines = INPUT_MD.read_text(encoding="utf-8").splitlines()

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            story.append(Spacer(1, 6))
            continue

        if line.startswith("# "):
            story.append(Paragraph(to_html_line(line[2:].strip()), heading1))
            continue

        if line.startswith("## "):
            story.append(Paragraph(to_html_line(line[3:].strip()), heading2))
            continue

        if line.startswith("### "):
            story.append(Paragraph(to_html_line(line[4:].strip()), heading2))
            continue

        if line.startswith("- "):
            story.append(Paragraph(to_html_line(line[2:].strip()), bullet, bulletText="\u2022"))
            continue

        # Basic numbered list support
        if len(line) > 2 and line[0].isdigit() and line[1] == ".":
            story.append(Paragraph(to_html_line(line), body))
            continue

        story.append(Paragraph(to_html_line(line), body))

    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title="Facility Operations Future Advancements Report",
    )
    doc.build(story)


if __name__ == "__main__":
    build_pdf()
    print(f"PDF generated: {OUTPUT_PDF}")

