import logging
import os
import pickle
import threading
import time
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from django.conf import settings
from django.core.cache import cache
from django.db import close_old_connections
from django.db.models import Case, Count, F, IntegerField, Q, When
from django.utils import timezone
from scipy.sparse import csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .models import Course, Enrollment

logger = logging.getLogger(__name__)

MODEL_VERSION = 1
CACHE_KEY = "courses:ml-recommendations:model:v1"
COLLAB_WEIGHT = 0.6
CONTENT_WEIGHT = 0.4
DEFAULT_LIMIT = 5
MAX_LIMIT = 20
MAX_FEATURES = 1000

_LOAD_LOCK = threading.Lock()
_RETRAIN_LOCK = threading.Lock()


def _course_text(row):
    tags = row.get("tags")
    parts = (
        row.get("title"),
        row.get("description"),
        row.get("category__name"),
        tags.replace(",", " ") if isinstance(tags, str) else "",
    )
    return " ".join(
        value for value in parts if isinstance(value, str) and value.strip()
    )


def _normalize(scores, mask=None):
    values = np.asarray(scores, dtype=float)
    if mask is not None:
        values = np.where(mask, values, 0)
    positive = np.clip(values, 0, None)
    highest = positive.max() if positive.size else 0
    if highest <= 0:
        return np.zeros_like(positive)
    return positive / highest


def _preferred_categories(enrollments, courses):
    if enrollments.empty or courses.empty:
        return {}

    merged = enrollments.merge(
        courses[["id", "category__name"]],
        left_on="course_id",
        right_on="id",
        how="left",
    )
    preferred = {}
    for student_id, group in merged.groupby("student_id"):
        names = group["category__name"].dropna()
        if names.empty:
            continue
        counts = Counter(names)
        preferred[int(student_id)] = counts.most_common(1)[0][0]
    return preferred


def build_model_state():
    course_rows = list(
        Course.objects.select_related("category").values(
            "id",
            "title",
            "description",
            "tags",
            "type",
            "category__name",
            "max_students",
        )
    )
    enrollment_rows = list(
        Enrollment.objects.values_list("student_id", "course_id", "completed")
    )

    courses = pd.DataFrame(
        course_rows,
        columns=[
            "id",
            "title",
            "description",
            "tags",
            "type",
            "category__name",
            "max_students",
        ],
    )
    enrollments = pd.DataFrame(
        enrollment_rows,
        columns=["student_id", "course_id", "completed"],
    )

    course_ids = [int(value) for value in courses["id"].tolist()]
    course_count = len(course_ids)

    if enrollments.empty:
        popularity = np.zeros(course_count, dtype=float)
    else:
        counts = enrollments.groupby("course_id").size()
        popularity = (
            courses["id"].map(counts).fillna(0).to_numpy(dtype=float)
        )

    full_mask = np.zeros(course_count, dtype=bool)
    has_limit = courses["max_students"].notna().to_numpy()
    if has_limit.any():
        limits = courses["max_students"].to_numpy(dtype=float)
        full_mask[has_limit] = popularity[has_limit] >= limits[has_limit]

    student_ids = []
    interactions = csr_matrix((0, course_count), dtype=float)
    if not enrollments.empty and course_count:
        weights = np.where(
            enrollments["completed"].fillna(False).to_numpy(dtype=bool),
            1.5,
            1.0,
        )
        frame = pd.DataFrame(
            {
                "student_id": enrollments["student_id"].to_numpy(),
                "course_id": enrollments["course_id"].to_numpy(),
                "weight": weights,
            }
        )
        matrix = frame.pivot_table(
            index="student_id",
            columns="course_id",
            values="weight",
            aggfunc="sum",
            fill_value=0,
        ).reindex(columns=course_ids, fill_value=0)
        student_ids = [int(value) for value in matrix.index.tolist()]
        interactions = csr_matrix(matrix.to_numpy(dtype=float))

    user_similarity = (
        cosine_similarity(interactions)
        if interactions.shape[0]
        else np.zeros((0, 0), dtype=float)
    )

    texts = courses.apply(_course_text, axis=1).tolist()
    if texts:
        vectorizer = TfidfVectorizer(
            max_features=MAX_FEATURES,
            stop_words="english",
            ngram_range=(1, 2),
            sublinear_tf=True,
        )
        try:
            features = vectorizer.fit_transform(texts)
        except ValueError:
            features = csr_matrix((len(texts), 1), dtype=float)
    else:
        features = csr_matrix((0, 1), dtype=float)

    course_similarity = (
        cosine_similarity(features)
        if features.shape[0]
        else np.zeros((0, 0), dtype=float)
    )

    categories = [
        value if isinstance(value, str) else None
        for value in courses["category__name"].tolist()
    ]

    return {
        "version": MODEL_VERSION,
        "trained_at": timezone.now().isoformat(),
        "course_ids": course_ids,
        "course_titles": [str(value) for value in courses["title"].tolist()],
        "course_categories": categories,
        "course_popularity": popularity.tolist(),
        "full_mask": full_mask.tolist(),
        "student_ids": student_ids,
        "interactions": interactions,
        "user_similarity": user_similarity,
        "course_similarity": course_similarity,
        "preferred_categories": _preferred_categories(enrollments, courses),
        "course_count": course_count,
        "student_count": len(student_ids),
        "enrollment_count": len(enrollments),
    }


class CourseRecommender:
    def __init__(self, state):
        self.state = state
        self.course_ids = [int(value) for value in state.get("course_ids", [])]
        self.course_titles = list(state.get("course_titles", []))
        self.course_categories = list(state.get("course_categories", []))
        self.popularity = np.asarray(
            state.get("course_popularity", []), dtype=float
        )
        self.full_mask = np.asarray(state.get("full_mask", []), dtype=bool)
        self.student_ids = [
            int(value) for value in state.get("student_ids", [])
        ]
        self.student_index = {
            student_id: index
            for index, student_id in enumerate(self.student_ids)
        }

        interactions = state.get("interactions")
        self.interactions = (
            interactions
            if interactions is not None
            else csr_matrix((0, len(self.course_ids)), dtype=float)
        )
        self.user_similarity = np.asarray(
            state.get("user_similarity", np.zeros((0, 0))), dtype=float
        )
        self.course_similarity = np.asarray(
            state.get("course_similarity", np.zeros((0, 0))), dtype=float
        )
        self.preferred_categories = state.get("preferred_categories") or {}

    def recommend(self, student_id, limit=DEFAULT_LIMIT, exclude_ids=None):
        limit = max(1, min(int(limit), MAX_LIMIT))
        course_count = len(self.course_ids)
        if not course_count:
            return []

        student_id = int(student_id)
        student_row = self.student_index.get(student_id)
        history = np.zeros(course_count, dtype=bool)
        has_history = False
        if student_row is not None:
            row = self.interactions.getrow(student_row).toarray().ravel()
            has_history = bool(row.any())
            history = row > 0

        enrolled = history.copy()
        if exclude_ids:
            excluded = {int(value) for value in exclude_ids}
            enrolled |= np.array(
                [int(course_id) in excluded for course_id in self.course_ids],
                dtype=bool,
            )

        eligible = ~enrolled & ~self.full_mask
        if not eligible.any():
            return []

        if not has_history:
            return self._popular_recommendations(student_id, eligible, limit)

        weights = self.interactions.getrow(student_row).toarray().ravel()
        content_scores = weights @ self.course_similarity

        neighbours = self.user_similarity[student_row].copy()
        if neighbours.size:
            neighbours[student_row] = 0.0
        if neighbours.any():
            collaborative_scores = self.interactions.T.dot(neighbours)
        else:
            collaborative_scores = np.zeros(course_count, dtype=float)

        collaborative = _normalize(collaborative_scores, eligible)
        content = _normalize(content_scores, eligible)
        scores = COLLAB_WEIGHT * collaborative + CONTENT_WEIGHT * content
        scores[~eligible] = -np.inf

        order = np.lexsort((-self.popularity, -scores))
        recommendations = []
        for index in order:
            if not eligible[index] or not np.isfinite(scores[index]):
                continue
            if scores[index] <= 0:
                break
            recommendations.append(
                {
                    "course_id": int(self.course_ids[index]),
                    "confidence": round(float(scores[index]), 3),
                    "reason": self._reason(
                        index,
                        weights,
                        collaborative[index],
                        content[index],
                    ),
                }
            )
            if len(recommendations) >= limit:
                break

        if not recommendations:
            return self._popular_recommendations(
                student_id, eligible, limit
            )
        return recommendations

    def _reason(self, index, weights, collaborative_score, content_score):
        if (
            collaborative_score * COLLAB_WEIGHT
            >= content_score * CONTENT_WEIGHT
            and collaborative_score > 0
        ):
            return "Students with similar enrollments also took this course."

        enrolled_indices = np.flatnonzero(weights > 0)
        if enrolled_indices.size and self.course_similarity.size:
            similarities = self.course_similarity[index, enrolled_indices]
            anchor = enrolled_indices[int(np.argmax(similarities))]
            if anchor < len(self.course_titles):
                return f"Based on your enrollment in {self.course_titles[anchor]}."
        return "Popular with students."

    def _popular_recommendations(self, student_id, eligible, limit):
        indices = np.flatnonzero(eligible)
        if not indices.size:
            return []

        preferred = self.preferred_categories.get(int(student_id))
        in_preferred = np.array(
            [
                bool(preferred)
                and self.course_categories[index] == preferred
                for index in indices
            ],
            dtype=bool,
        )
        popularity = self.popularity[indices]
        preferred_rank = in_preferred.astype(float)
        order = np.lexsort((-popularity, -preferred_rank))

        highest = popularity.max() if popularity.size else 0
        recommendations = []
        for position in order[:limit]:
            index = int(indices[position])
            confidence = (
                round(float(self.popularity[index]) / float(highest), 3)
                if highest > 0
                else 0.0
            )
            if preferred and self.course_categories[index] == preferred:
                reason = f"Popular in {preferred}."
            else:
                reason = "Popular with students."
            recommendations.append(
                {
                    "course_id": int(self.course_ids[index]),
                    "confidence": confidence,
                    "reason": reason,
                }
            )
        return recommendations


def model_is_stale(state):
    trained_at = state.get("trained_at")
    if not trained_at:
        return True
    try:
        trained = datetime.fromisoformat(trained_at)
    except (TypeError, ValueError):
        return True
    if timezone.is_naive(trained):
        trained = timezone.make_aware(trained)
    max_age = timedelta(days=max(1, settings.RECOMMENDATION_RETRAIN_DAYS))
    return timezone.now() - trained > max_age


def _cache_key():
    path = Path(settings.RECOMMENDATION_MODEL_PATH)
    try:
        stamp = path.stat().st_mtime_ns
    except OSError:
        return f"{CACHE_KEY}:missing"
    return f"{CACHE_KEY}:{stamp}"


def _persist_state(state):
    path = Path(settings.RECOMMENDATION_MODEL_PATH)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f"{path.name}.tmp")
        with temporary.open("wb") as handle:
            pickle.dump(state, handle, protocol=pickle.HIGHEST_PROTOCOL)
        os.replace(temporary, path)
    except OSError:
        logger.exception(
            "Could not persist the recommendation model to %s", path
        )


def _load_persisted_state():
    path = Path(settings.RECOMMENDATION_MODEL_PATH)
    try:
        # Only artifacts written by this server are loaded from this path.
        with path.open("rb") as handle:
            state = pickle.load(handle)
    except FileNotFoundError:
        return None
    except (OSError, EOFError, pickle.UnpicklingError, AttributeError, ValueError):
        logger.exception("Could not load the persisted recommendation model.")
        return None

    if not isinstance(state, dict) or state.get("version") != MODEL_VERSION:
        return None
    return state


def train_recommender():
    started = time.perf_counter()
    state = build_model_state()
    _persist_state(state)
    cache.set(
        _cache_key(), state, settings.RECOMMENDATION_CACHE_TIMEOUT
    )
    logger.info(
        "Recommendation model trained in %.1f ms (%s courses, %s students)",
        (time.perf_counter() - started) * 1000,
        state["course_count"],
        state["student_count"],
    )
    return state


def _refresh_in_background():
    if not settings.RECOMMENDATION_AUTO_RETRAIN:
        return
    if not _RETRAIN_LOCK.acquire(blocking=False):
        return

    def run():
        close_old_connections()
        try:
            train_recommender()
        except Exception:
            logger.exception("Recommendation model retraining failed.")
        finally:
            close_old_connections()
            _RETRAIN_LOCK.release()

    threading.Thread(
        target=run,
        name="recommendation-retrain",
        daemon=True,
    ).start()


def get_recommender():
    cache_key = _cache_key()
    state = cache.get(cache_key)
    if state is not None:
        if model_is_stale(state):
            _refresh_in_background()
        return CourseRecommender(state)

    with _LOAD_LOCK:
        cache_key = _cache_key()
        state = cache.get(cache_key)
        if state is not None:
            return CourseRecommender(state)

        state = _load_persisted_state()
        if state is not None:
            cache.set(
                cache_key, state, settings.RECOMMENDATION_CACHE_TIMEOUT
            )
            if model_is_stale(state):
                _refresh_in_background()
            return CourseRecommender(state)

        return CourseRecommender(train_recommender())


def recommend_courses(student_id, limit=DEFAULT_LIMIT, exclude_ids=None):
    return get_recommender().recommend(
        student_id,
        limit=limit,
        exclude_ids=exclude_ids,
    )


def popular_course_recommendations(student_id, limit=DEFAULT_LIMIT):
    enrollments = Enrollment.objects.filter(student_id=student_id)
    enrolled_ids = list(enrollments.values_list("course_id", flat=True))

    preferred = (
        enrollments.filter(course__category__isnull=False)
        .values("course__category")
        .annotate(total=Count("id"))
        .order_by("-total")
        .values_list("course__category", flat=True)
        .first()
    )

    available = (
        Course.objects.select_related("category")
        .exclude(pk__in=enrolled_ids)
        .exclude(
            Q(max_students__isnull=False)
            & Q(enrolled_count__gte=F("max_students"))
        )
    )
    if preferred:
        available = available.annotate(
            preferred=Case(
                When(category_id=preferred, then=1),
                default=0,
                output_field=IntegerField(),
            )
        ).order_by("-preferred", "-enrolled_count", "-created_at")
    else:
        available = available.order_by("-enrolled_count", "-created_at")

    courses = list(available[:limit])
    highest = max(
        (course.enrolled_count for course in courses),
        default=0,
    )
    results = []
    for course in courses:
        confidence = (
            round(course.enrolled_count / highest, 3) if highest else 0.0
        )
        if preferred and course.category_id == preferred:
            reason = f"Popular in {course.category.name}."
        else:
            reason = "Popular with students."
        results.append(
            {
                "course_id": course.pk,
                "confidence": confidence,
                "reason": reason,
            }
        )
    return results
