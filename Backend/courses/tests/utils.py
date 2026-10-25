import shutil
import tempfile
from io import BytesIO

from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from courses.demo_files import build_pdf, build_wav
from courses.models import Course

MP3_BYTES = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 100
OGG_BYTES = b"OggS" + b"\x00" * 100
M4A_BYTES = b"\x00\x00\x00\x20ftypM4A " + b"\x00" * 100
MP4_BYTES = b"\x00\x00\x00\x20ftypisom" + b"\x00" * 100
WEBM_BYTES = b"\x1aE\xdf\xa3\x42\x82\x84webm" + b"\x00" * 100
AVI_BYTES = b"RIFF\x00\x00\x00\x00AVI " + b"\x00" * 100


def pdf_upload(
    name="document.pdf",
    title="Cours de test",
    content_type="application/pdf",
    content=None,
):
    return SimpleUploadedFile(
        name,
        content if content is not None else build_pdf(title, "Description de test"),
        content_type=content_type,
    )


def wav_upload(name="audio.wav", content_type="audio/wav", content=None):
    return SimpleUploadedFile(name, content or build_wav(), content_type=content_type)


def mp3_upload(name="audio.mp3"):
    return SimpleUploadedFile(name, MP3_BYTES, content_type="audio/mpeg")


def m4a_upload(name="audio.m4a"):
    return SimpleUploadedFile(name, M4A_BYTES, content_type="audio/mp4")


def ogg_upload(name="audio.ogg"):
    return SimpleUploadedFile(name, OGG_BYTES, content_type="audio/ogg")


def mp4_upload(name="video.mp4"):
    return SimpleUploadedFile(name, MP4_BYTES, content_type="video/mp4")


def webm_upload(name="video.webm"):
    return SimpleUploadedFile(name, WEBM_BYTES, content_type="video/webm")


def avi_upload(name="video.avi"):
    return SimpleUploadedFile(name, AVI_BYTES, content_type="video/x-msvideo")


def image_upload(
    name="thumbnail.png",
    size=(800, 600),
    image_format="PNG",
    content_type="image/png",
):
    buffer = BytesIO()
    Image.new("RGB", size, color=(30, 90, 200)).save(buffer, format=image_format)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type=content_type)


def create_course(
    owner,
    title="Cours",
    description="",
    filename="cours.pdf",
    content=None,
):
    if content is None:
        content = build_pdf(title, description) if filename.endswith(".pdf") else build_wav()
    course = Course(title=title, description=description, owner=owner)
    course.file.save(filename, ContentFile(content), save=False)
    course.save()
    return course


def stored_bytes(course):
    with course.file.storage.open(course.file.name, "rb") as handle:
        return handle.read()


class TemporaryMediaMixin:
    @classmethod
    def setUpClass(cls):
        cls._media_dir = tempfile.mkdtemp(prefix="edumind-test-media-")
        cls._media_override = override_settings(MEDIA_ROOT=cls._media_dir)
        cls._media_override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._media_override.disable()
        shutil.rmtree(cls._media_dir, ignore_errors=True)
