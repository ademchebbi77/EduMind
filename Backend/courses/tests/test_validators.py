from django.core.exceptions import ValidationError
from django.test import SimpleTestCase, override_settings

from courses.validators import validate_course_file

from .utils import (
    m4a_upload,
    mp3_upload,
    ogg_upload,
    pdf_upload,
    wav_upload,
)


class CourseFileValidatorTests(SimpleTestCase):
    def test_accepts_valid_pdf(self):
        file = pdf_upload()

        validate_course_file(file)

        self.assertEqual(file.tell(), 0)

    def test_accepts_uppercase_pdf_extension(self):
        validate_course_file(pdf_upload(name="DOCUMENT.PDF"))

    def test_accepts_supported_audio_formats(self):
        for file in (wav_upload(), mp3_upload(), m4a_upload(), ogg_upload()):
            with self.subTest(file=file.name):
                validate_course_file(file)

    def test_rejects_unsupported_extension(self):
        file = pdf_upload(name="notes.txt", content_type="text/plain")

        with self.assertRaisesMessage(ValidationError, "Unsupported extension"):
            validate_course_file(file)

    def test_rejects_empty_file(self):
        file = pdf_upload(content=b"")

        with self.assertRaisesMessage(ValidationError, "The file is empty"):
            validate_course_file(file)

    def test_rejects_file_above_size_limit(self):
        file = pdf_upload(content=b"%PDF-1.4\n" + b"0" * (1024 * 1024))

        with override_settings(
            MAX_UPLOAD_SIZE_MB=1,
            MAX_UPLOAD_SIZE_BYTES=1024 * 1024,
        ):
            with self.assertRaisesMessage(ValidationError, "maximum allowed size"):
                validate_course_file(file)

    def test_rejects_declared_mime_type_mismatch(self):
        file = pdf_upload(content_type="image/png")

        with self.assertRaisesMessage(ValidationError, "declared MIME type"):
            validate_course_file(file)

    def test_accepts_generic_declared_mime_type(self):
        validate_course_file(pdf_upload(content_type="application/octet-stream"))

    def test_rejects_content_not_matching_extension(self):
        file = pdf_upload(content=b"\x89PNG\r\n\x1a\n" + b"0" * 100)

        with self.assertRaisesMessage(ValidationError, "does not match"):
            validate_course_file(file)

    def test_rejects_unknown_content(self):
        file = pdf_upload(content=b"random bytes without a known signature")

        with self.assertRaisesMessage(ValidationError, "Unable to verify"):
            validate_course_file(file)

    def test_rejects_pdf_content_with_audio_extension(self):
        file = pdf_upload(name="fake.mp3", content_type="audio/mpeg")

        with self.assertRaisesMessage(ValidationError, "does not match"):
            validate_course_file(file)
