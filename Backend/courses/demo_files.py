import io
import math
import struct
import unicodedata
import wave


def _ascii(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text or "")
    return normalized.encode("ascii", "ignore").decode("ascii")


def _pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_pdf(title: str, description: str = "") -> bytes:
    """Build a small, valid one-page PDF for demo courses."""
    title = _pdf_escape(_ascii(title)[:70])
    body = _pdf_escape(_ascii(description)[:110])

    stream_lines = [
        "BT",
        "/F1 24 Tf",
        "72 760 Td",
        "(EduMind AI) Tj",
        "0 -44 Td",
        "/F1 18 Tf",
        f"({title}) Tj",
        "0 -32 Td",
        "/F1 12 Tf",
        f"({body}) Tj",
        "ET",
    ]
    stream = "\n".join(stream_lines).encode("latin-1", "replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
        ),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        (
            f"<< /Length {len(stream)} >>\nstream\n".encode("ascii")
            + stream
            + b"\nendstream"
        ),
    ]

    pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for index, body_bytes in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += f"{index} 0 obj\n".encode("ascii") + body_bytes + b"\nendobj\n"

    xref_offset = len(pdf)
    pdf += f"xref\n0 {len(objects) + 1}\n".encode("ascii")
    pdf += b"0000000000 65535 f \n"
    for offset in offsets:
        pdf += f"{offset:010d} 00000 n \n".encode("ascii")
    pdf += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n"
    ).encode("ascii")
    return bytes(pdf)


def build_wav(seconds: float = 2.0, frequency: float = 330.0) -> bytes:
    """Build a short mono WAV tone for demo audio courses."""
    sample_rate = 22050
    frame_count = int(seconds * sample_rate)
    frames = bytearray()

    for index in range(frame_count):
        sample = int(0.22 * 32767 * math.sin(2 * math.pi * frequency * index / sample_rate))
        frames += struct.pack("<h", sample)

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(bytes(frames))
    return buffer.getvalue()


def _wrap_pdf_text(text, width):
    import textwrap

    return textwrap.wrap(text, width=width) or [""]


def build_document_pdf(title, sections):
    """Build a readable multi-page PDF from ``(heading, paragraphs)`` sections.

    Uses the standard Helvetica fonts with WinAnsi encoding, so French accents
    survive text extraction (pypdf), which the quiz and summary features rely on.
    """
    margin, top, bottom = 72, 770, 72
    # (font, size, leading, text) lines, laid out from top to bottom.
    lines = [("F2", 20, 30, line) for line in _wrap_pdf_text(title, 45)]
    lines.append(("F1", 11, 12, ""))
    for heading, paragraphs in sections:
        lines.append(("F1", 11, 10, ""))
        lines.extend(("F2", 14, 20, line) for line in _wrap_pdf_text(heading, 60))
        for paragraph in paragraphs:
            lines.extend(("F1", 11, 15, line) for line in _wrap_pdf_text(paragraph, 80))
            lines.append(("F1", 11, 8, ""))

    pages, current, y = [], [], top
    for font, size, leading, text in lines:
        if y - leading < bottom and current:
            pages.append(current)
            current, y = [], top
        y -= leading
        if text:
            escaped = _pdf_escape(text)
            current.append(f"BT /{font} {size} Tf {margin} {y} Td ({escaped}) Tj ET")
    pages.append(current)

    font_objects = [
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ]
    first_page = 3 + len(font_objects)
    kids = " ".join(f"{first_page + 2 * index} 0 R" for index in range(len(pages)))
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode("ascii"),
        *font_objects,
    ]
    for index, commands in enumerate(pages):
        stream = "\n".join(commands).encode("cp1252", "replace")
        objects.append(
            (
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
                "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> "
                f"/Contents {first_page + 2 * index + 1} 0 R >>"
            ).encode("ascii")
        )
        objects.append(
            f"<< /Length {len(stream)} >>\nstream\n".encode("ascii") + stream + b"\nendstream"
        )

    pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for index, body_bytes in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += f"{index} 0 obj\n".encode("ascii") + body_bytes + b"\nendobj\n"

    xref_offset = len(pdf)
    pdf += f"xref\n0 {len(objects) + 1}\n".encode("ascii")
    pdf += b"0000000000 65535 f \n"
    for offset in offsets:
        pdf += f"{offset:010d} 00000 n \n".encode("ascii")
    pdf += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n"
    ).encode("ascii")
    return bytes(pdf)


def build_thumbnail(title, label, color):
    """Build a 1280x720 PNG cover: a colour gradient with the course title."""
    import textwrap

    from PIL import Image, ImageDraw, ImageFont

    width, height = 1280, 720
    red, green, blue = (int(color.lstrip("#")[i : i + 2], 16) for i in (0, 2, 4))
    image = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        shade = 1 - 0.45 * y / height
        draw.line(
            [(0, y), (width, y)],
            fill=(int(red * shade), int(green * shade), int(blue * shade)),
        )

    label_font = ImageFont.load_default(size=34)
    title_font = ImageFont.load_default(size=72)
    draw.text((90, 110), label.upper(), font=label_font, fill=(255, 255, 255, 200))
    y = 200
    for line in textwrap.wrap(title, width=26)[:4]:
        draw.text((90, y), line, font=title_font, fill="white")
        y += 92
    draw.text((90, height - 110), "EduMind AI", font=label_font, fill="white")

    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
