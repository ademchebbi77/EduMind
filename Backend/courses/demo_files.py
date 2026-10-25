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
