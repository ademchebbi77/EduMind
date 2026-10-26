"""Unit tests of the local quiz generator (no database, no network)."""

import io
import zipfile
from pathlib import Path

from django.core.files.base import ContentFile
from django.test import SimpleTestCase

from assessments.generation import extraction
from assessments.generation.extraction import ExtractionError
from assessments.generation.generator import (
    BLANK,
    MULTIPLE_CHOICE,
    SINGLE_CHOICE,
    TRUE_FALSE,
    GenerationError,
    generate_quiz,
)
from assessments.generation.keywords import analyse, fold, similarity
from assessments.generation.service import is_grounded
from assessments.generation.text import detect_language, is_usable_sentence, split_sentences

SAMPLES = Path(__file__).resolve().parents[1] / "generation" / "samples"
FRENCH = (SAMPLES / "apprentissage-automatique.txt").read_text(encoding="utf-8")
ENGLISH = (SAMPLES / "neural-networks.txt").read_text(encoding="utf-8")


def text_pdf(lines):
    """A valid PDF with one text line per entry (Helvetica, ASCII only)."""
    commands = ["BT", "/F1 11 Tf", "50 800 Td", "14 TL"]
    for line in lines:
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        commands.append(f"({escaped}) Tj T*")
    commands.append("ET")
    stream = "\n".join(commands).encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream",
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(pdf)
    pdf += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    pdf += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets)
    pdf += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(pdf)


def docx_bytes(paragraphs):
    ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    body = "".join(f"<w:p><w:r><w:t>{text}</w:t></w:r></w:p>" for text in paragraphs)
    document = f'<?xml version="1.0"?><w:document xmlns:w="{ns}"><w:body>{body}</w:body></w:document>'
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", document)
    return buffer.getvalue()


class TextTests(SimpleTestCase):
    def test_detects_language(self):
        self.assertEqual(detect_language(FRENCH), "fr")
        self.assertEqual(detect_language(ENGLISH), "en")
        self.assertEqual(detect_language(""), "en")

    def test_splits_sentences_without_breaking_abbreviations_or_decimals(self):
        sentences = split_sentences("The value is 3.14 here. See e.g. the figure. Next one!")
        self.assertEqual(
            sentences, ["The value is 3.14 here.", "See e.g. the figure.", "Next one!"]
        )

    def test_usable_sentence_rules(self):
        self.assertTrue(is_usable_sentence("Gradient descent updates the weights of the model."))
        self.assertFalse(is_usable_sentence("Too short."))
        self.assertFalse(is_usable_sentence("What is a neural network used for in practice?"))
        self.assertFalse(is_usable_sentence("SEE THE DOCUMENTATION AT THE END OF THIS CHAPTER NOW"))
        self.assertFalse(is_usable_sentence("Read more at https://example.com about this topic today."))

    def test_fold_merges_plurals(self):
        self.assertEqual(fold("Réseaux"), fold("réseau"))
        self.assertEqual(fold("networks"), fold("network"))
        self.assertEqual(fold("class"), "class")


class ExtractionTests(SimpleTestCase):
    def test_pdf_text(self):
        pdf = text_pdf(["Gradient descent is an optimisation algorithm.", "It updates weights."])
        text = extraction.extract_pdf(io.BytesIO(pdf))
        self.assertIn("Gradient descent is an optimisation algorithm.", text)

    def test_invalid_pdf(self):
        with self.assertRaises(ExtractionError):
            extraction.extract_pdf(io.BytesIO(b"%PDF-1.4 broken"))

    def test_pdf_without_text_reports_scanned_document(self):
        with self.assertRaisesMessage(ExtractionError, "scanned"):
            extraction.extract_pdf(io.BytesIO(text_pdf([])))

    def test_docx_text(self):
        text = extraction.extract_docx(io.BytesIO(docx_bytes(["First paragraph here.", "Second one."])))
        self.assertIn("First paragraph here.", text)
        self.assertIn("Second one.", text)

    def test_bad_docx(self):
        with self.assertRaises(ExtractionError):
            extraction.extract_docx(io.BytesIO(b"not a zip"))

    def test_plain_text_encodings(self):
        self.assertIn("été", extraction.extract_plain("Un été chaud.".encode("utf-8")))
        self.assertIn("été", extraction.extract_plain("Un été chaud.".encode("cp1252")))

    def test_extract_file_dispatches_on_extension(self):
        stored = ContentFile(b"Some course notes in a text file.", name="notes.md")
        self.assertIn("course notes", extraction.extract_file(stored, "notes.md"))
        with self.assertRaises(ExtractionError):
            extraction.extract_file(stored, "notes.exe")

    def test_clean_text_joins_hyphenation_and_wrapped_lines(self):
        cleaned = extraction.clean_text("L'appren-\ntissage est une\nbranche de l'IA.")
        self.assertEqual(cleaned, "L'apprentissage est une branche de l'IA.")

    def test_transcript_timestamps_removed(self):
        cleaned = extraction.clean_transcript("[00:01] Hello there.\n[00:05:10] Neural networks learn.")
        self.assertNotIn("00:", cleaned)
        self.assertIn("Neural networks learn.", cleaned)

    def test_repeated_headers_removed(self):
        pages = [f"Course header\nPage content number {index}.\n{index + 1}" for index in range(5)]
        cleaned = extraction.clean_text(extraction._clean_pages(pages))
        self.assertNotIn("Course header", cleaned)
        self.assertIn("Page content number 3.", cleaned)


class KeyPhraseTests(SimpleTestCase):
    def setUp(self):
        self.analysis = analyse(split_sentences(ENGLISH), "en", use_spacy=False)

    def test_finds_domain_terms_and_skips_verbs_and_fragments(self):
        keys = set(self.analysis.phrases)
        self.assertIn("learning rate", keys)
        self.assertIn("activation function", keys)
        self.assertNotIn("neural", keys)  # always followed by "network"
        self.assertNotIn("compute", keys)  # a verb, never used like a noun
        self.assertFalse(any("," in phrase.surface for phrase in self.analysis.phrases.values()))

    def test_specific_terms_rank_above_generic_ones(self):
        ranked = [phrase.key for phrase in self.analysis.ranked()]
        self.assertLess(ranked.index("learning rate"), ranked.index("network"))

    def test_similarity(self):
        phrases = self.analysis.phrases
        self.assertGreater(
            similarity(phrases["learning rate"], phrases["gradient descent"]),
            similarity(phrases["learning rate"], phrases["frank rosenblatt"]),
        )


class GeneratorTests(SimpleTestCase):
    def test_generates_requested_number_of_valid_grounded_questions(self):
        for text in (FRENCH, ENGLISH):
            result = generate_quiz(text, num_questions=10, seed=1)
            self.assertEqual(len(result.questions), 10)
            for question in result.as_dict()["questions"]:
                with self.subTest(question=question["text"]):
                    self.assertTrue(is_grounded(question))
                    texts = [option["text"].casefold() for option in question["options"]]
                    self.assertEqual(len(texts), len(set(texts)))
                    correct = sum(option["is_correct"] for option in question["options"])
                    if question["type"] == MULTIPLE_CHOICE:
                        self.assertGreaterEqual(correct, 2)
                    else:
                        self.assertEqual(correct, 1)

    def test_questions_follow_the_course_language(self):
        french = generate_quiz(FRENCH, num_questions=8, seed=1)
        english = generate_quiz(ENGLISH, num_questions=8, seed=1)
        self.assertEqual(french.language, "fr")
        self.assertTrue(french.title.startswith("Quiz :"))
        self.assertTrue(all(
            question.options[0]["text"] == "Vrai"
            for question in french.questions if question.type == TRUE_FALSE
        ))
        self.assertTrue(any(question.text.startswith("Complétez") for question in french.questions))
        self.assertTrue(any(question.text.startswith("Fill in the blank") for question in english.questions))

    def test_all_question_kinds_are_produced(self):
        result = generate_quiz(ENGLISH, num_questions=15, seed=4)
        self.assertEqual(
            {question.kind for question in result.questions},
            {"definition", "cloze", "true_false", "enumeration"},
        )

    def test_blank_answer_and_distractors(self):
        result = generate_quiz(ENGLISH, num_questions=10, types=[SINGLE_CHOICE], seed=2)
        cloze = [question for question in result.questions if question.kind == "cloze"]
        self.assertTrue(cloze)
        for question in cloze:
            self.assertIn(BLANK, question.text)
            source = question.source.casefold()
            for option in question.options:
                self.assertEqual(option["is_correct"], option["text"].casefold() in source)

    def test_true_false_answers_are_balanced_and_consistent(self):
        result = generate_quiz(FRENCH, num_questions=8, types=[TRUE_FALSE], seed=3)
        self.assertTrue(all(question.type == TRUE_FALSE for question in result.questions))
        truths = [question.options[0]["is_correct"] for question in result.questions]
        self.assertTrue(any(truths) and not all(truths))

    def test_type_filter(self):
        result = generate_quiz(ENGLISH, num_questions=5, types=[MULTIPLE_CHOICE, TRUE_FALSE], seed=1)
        self.assertNotIn(SINGLE_CHOICE, {question.type for question in result.questions})

    def test_difficulty_preference(self):
        beginner = generate_quiz(FRENCH, num_questions=6, difficulty="beginner", seed=1)
        advanced = generate_quiz(FRENCH, num_questions=6, difficulty="advanced", seed=1)
        rank = {"beginner": 0, "intermediate": 1, "advanced": 2}
        self.assertLess(
            sum(rank[q.difficulty] for q in beginner.questions),
            sum(rank[q.difficulty] for q in advanced.questions),
        )
        self.assertEqual(beginner.difficulty, "beginner")

    def test_same_seed_same_quiz(self):
        first = generate_quiz(ENGLISH, num_questions=8, seed=42).as_dict()["questions"]
        second = generate_quiz(ENGLISH, num_questions=8, seed=42).as_dict()["questions"]
        self.assertEqual(first, second)

    def test_no_duplicate_sentences_or_answers(self):
        result = generate_quiz(ENGLISH, num_questions=15, seed=5)
        self.assertEqual(len({q.sentence_index for q in result.questions}), len(result.questions))
        self.assertEqual(len({q.answer_key for q in result.questions}), len(result.questions))

    def test_short_text_is_rejected(self):
        with self.assertRaises(GenerationError):
            generate_quiz("Too short to make a quiz. Really.")

    def test_warns_when_fewer_questions_than_requested(self):
        result = generate_quiz(ENGLISH, num_questions=30, seed=1)
        self.assertLess(len(result.questions), 30)
        self.assertTrue(result.warnings)

    def test_reports_stages_and_stats(self):
        stages = []
        result = generate_quiz(ENGLISH, num_questions=5, seed=1, on_stage=stages.append)
        self.assertEqual(stages, ["analysing", "generating"])
        self.assertEqual(result.engine, "pure-python")
        self.assertGreater(result.stats["key_phrases"], 10)
        self.assertIn("analysis_ms", result.stats)

    def test_unknown_difficulty(self):
        with self.assertRaises(ValueError):
            generate_quiz(ENGLISH, difficulty="expert")
