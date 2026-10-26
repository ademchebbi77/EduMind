"""Measure the local quiz generator: speed, validity and grounding of its output.

    python manage.py evaluate_quiz_generator
    python manage.py evaluate_quiz_generator --file notes.pdf --runs 5 --output report.md
"""

import time
from collections import Counter
from pathlib import Path
from statistics import mean, median

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError

from courses.models import Course

from ...generation.extraction import ExtractionError, extract_course, extract_file
from ...generation.generator import GenerationError, generate_quiz
from ...generation.service import compute_metrics, is_grounded, validate_questions
from ...models import QuizGenerationJob

SAMPLES_DIR = Path(__file__).resolve().parents[2] / "generation" / "samples"


def _percentile(values, fraction):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(fraction * (len(ordered) - 1)))]


def _pct(value):
    return "—" if value is None else f"{value * 100:.1f} %"


class Command(BaseCommand):
    help = "Evaluate the local quiz generator on sample documents and existing courses."

    def add_arguments(self, parser):
        parser.add_argument("--file", action="append", default=[], help="Extra document to evaluate.")
        parser.add_argument("--runs", type=int, default=3, help="Generations per document.")
        parser.add_argument("--questions", type=int, default=10, help="Questions requested per run.")
        parser.add_argument("--no-samples", action="store_true", help="Skip the bundled samples.")
        parser.add_argument("--no-courses", action="store_true", help="Skip courses in the database.")
        parser.add_argument("--output", help="Write a Markdown report to this path.")

    def _sources(self, options):
        sources = []
        if not options["no_samples"]:
            for path in sorted(SAMPLES_DIR.glob("*.txt")):
                sources.append((f"sample: {path.name}", lambda path=path: _read_path(path)))
        for name in options["file"]:
            path = Path(name)
            if not path.exists():
                raise CommandError(f"File not found: {path}")
            sources.append((f"file: {path.name}", lambda path=path: _read_path(path)))
        if not options["no_courses"]:
            for course in Course.objects.select_related("transcript").order_by("title"):
                sources.append((f"course: {course.title}", lambda course=course: extract_course(course)))
        return sources

    def handle(self, *args, **options):
        runs, requested = max(1, options["runs"]), options["questions"]
        rows, totals, skipped = [], Counter(), []
        timings = []

        for label, read in self._sources(options):
            try:
                started = time.perf_counter()
                text = read()
                extraction_ms = (time.perf_counter() - started) * 1000
            except ExtractionError as error:
                skipped.append((label, str(error)))
                continue

            durations, generated, valid, grounded, kinds = [], 0, 0, 0, Counter()
            language = engine = "?"
            for run in range(runs):
                started = time.perf_counter()
                try:
                    result = generate_quiz(text, num_questions=requested, seed=run)
                except GenerationError as error:
                    skipped.append((label, str(error)))
                    break
                elapsed = (time.perf_counter() - started) * 1000 + extraction_ms
                data = result.as_dict()
                questions, _invalid = validate_questions(data["questions"])
                durations.append(elapsed)
                generated += len(data["questions"])
                valid += len(questions)
                grounded += sum(1 for question in questions if is_grounded(question))
                kinds.update(question["kind"] for question in questions)
                language, engine = result.language, result.engine
            if not durations:
                continue

            timings.extend(durations)
            totals.update(
                requested=requested * len(durations), generated=generated, valid=valid, grounded=grounded
            )
            totals.update(kinds)
            rows.append(
                {
                    "source": label,
                    "language": language,
                    "engine": engine,
                    "words": len(text.split()),
                    "median_ms": median(durations),
                    "generated": generated / len(durations),
                    "valid": valid / generated if generated else 0,
                    "grounded": grounded / valid if valid else 0,
                    "kinds": dict(kinds),
                }
            )

        if not rows:
            raise CommandError("No document could be evaluated.")

        report = self._report(rows, totals, timings, skipped, runs, requested)
        self.stdout.write(report)
        if options["output"]:
            Path(options["output"]).write_text(report, encoding="utf-8")
            self.stdout.write(self.style.SUCCESS(f"Report written to {options['output']}"))

    def _report(self, rows, totals, timings, skipped, runs, requested):
        lines = [
            "# Local quiz generator — evaluation",
            "",
            f"{len(rows)} documents · {runs} runs each · {requested} questions requested per run",
            "",
            "| Source | Lang | Engine | Words | Median time | Questions / run | Valid | Grounded |",
            "|---|---|---|---:|---:|---:|---:|---:|",
        ]
        for row in rows:
            lines.append(
                f"| {row['source']} | {row['language']} | {row['engine']} | {row['words']} "
                f"| {row['median_ms']:.0f} ms | {row['generated']:.1f} | {_pct(row['valid'])} "
                f"| {_pct(row['grounded'])} |"
            )
        kinds = {kind: totals[kind] for kind in ("definition", "cloze", "true_false", "enumeration")}
        lines += [
            "",
            "## Overall",
            "",
            f"- Response time (extraction + generation): median {median(timings):.0f} ms, "
            f"p95 {_percentile(timings, 0.95):.0f} ms, mean {mean(timings):.0f} ms, max {max(timings):.0f} ms",
            f"- Fill rate (questions produced / requested): {_pct(totals['generated'] / totals['requested'])}",
            f"- Valid rate (accepted by the quiz API validation): {_pct(totals['valid'] / totals['generated'] if totals['generated'] else None)}",
            f"- Grounded rate (correct answer found in the source sentence, no wrong option in it): "
            f"{_pct(totals['grounded'] / totals['valid'] if totals['valid'] else None)}",
            f"- Question kinds: {', '.join(f'{kind} {count}' for kind, count in kinds.items())}",
        ]

        jobs = compute_metrics(QuizGenerationJob.objects.all())
        review = jobs["teacher_review"]
        lines += [
            "",
            "## Real usage (background jobs in the database)",
            "",
            f"- Jobs: {jobs['jobs']} (completed {jobs['completed']}, failed {jobs['failed']}, "
            f"success rate {_pct(jobs['success_rate'])})",
            f"- Processing time: median {jobs['processing_ms']['median'] or '—'} ms, "
            f"p95 {jobs['processing_ms']['p95'] or '—'} ms; queue wait median {jobs['queue_ms']['median'] or '—'} ms",
            f"- Teacher review: {review['quizzes']} quizzes, {review['questions']} generated questions — "
            f"accepted {_pct(review['acceptance_rate'])} (unchanged {_pct(review['unchanged_rate'])}, "
            f"edited {_pct(review['edited_rate'])})",
        ]
        if skipped:
            lines += ["", "## Skipped", ""] + [f"- {label}: {reason}" for label, reason in skipped]
        return "\n".join(lines) + "\n"


def _read_path(path):
    with path.open("rb") as handle:
        return extract_file(File(handle, name=path.name), path.name)
