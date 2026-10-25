"""Demo quizzes and exercises created by ``manage.py seed_demo``."""

from courses.models import Course

from .models import AnswerOption, Exercise, Question, Quiz

DEMO_QUIZZES = (
    {
        "course": "Introduction à l'apprentissage automatique",
        "title": "Machine learning fundamentals",
        "description": "Check your understanding of supervised and unsupervised learning.",
        "difficulty": "beginner",
        "duration_minutes": 10,
        "passing_score": 60,
        "questions": (
            (
                "Which kind of learning uses labelled examples?",
                "single_choice",
                2,
                "Supervised learning learns from inputs paired with expected outputs.",
                (("Supervised learning", True), ("Unsupervised learning", False), ("Clustering", False)),
            ),
            (
                "Select every unsupervised technique.",
                "multiple_choice",
                3,
                "Clustering and dimensionality reduction do not need labels.",
                (("k-means clustering", True), ("PCA", True), ("Linear regression", False)),
            ),
            (
                "Overfitting means the model performs well on new data but poorly on training data.",
                "true_false",
                1,
                "It is the opposite: overfitting fits the training data too closely.",
                (("True", False), ("False", True)),
            ),
        ),
    },
    {
        "course": "Python pour l'intelligence artificielle",
        "title": "Python data structures",
        "description": "Lists, dictionaries and tuples in practice.",
        "difficulty": "intermediate",
        "duration_minutes": None,
        "passing_score": 50,
        "questions": (
            (
                "Which structure maps keys to values?",
                "single_choice",
                1,
                "",
                (("list", False), ("dict", True), ("tuple", False)),
            ),
            (
                "Tuples are immutable.",
                "true_false",
                1,
                "",
                (("True", True), ("False", False)),
            ),
        ),
    },
)

DEMO_EXERCISES = (
    {
        "course": "Les réseaux de neurones expliqués",
        "title": "Explain backpropagation",
        "description": "A short written explanation of how neural networks learn.",
        "instructions": (
            "In about 200 words, explain how backpropagation updates the weights "
            "of a neural network. Mention the role of the loss function and the "
            "learning rate."
        ),
        "difficulty": "advanced",
        "points": 20,
    },
)


def seed_assessments():
    """Create the demo content once; return the number of new items."""
    courses = {course.title: course for course in Course.objects.all()}
    created = 0

    for spec in DEMO_QUIZZES:
        course = courses.get(spec["course"])
        if course is None or Quiz.objects.filter(course=course, title=spec["title"]).exists():
            continue
        quiz = Quiz.objects.create(
            course=course,
            title=spec["title"],
            description=spec["description"],
            difficulty=spec["difficulty"],
            duration_minutes=spec["duration_minutes"],
            passing_score=spec["passing_score"],
            is_published=True,
        )
        for position, (text, kind, points, explanation, options) in enumerate(spec["questions"]):
            question = Question.objects.create(
                quiz=quiz,
                text=text,
                type=kind,
                points=points,
                explanation=explanation,
                position=position,
            )
            AnswerOption.objects.bulk_create(
                AnswerOption(question=question, text=option, is_correct=correct, position=index)
                for index, (option, correct) in enumerate(options)
            )
        created += 1

    for spec in DEMO_EXERCISES:
        spec = dict(spec)
        course = courses.get(spec.pop("course"))
        if course is None or Exercise.objects.filter(course=course, title=spec["title"]).exists():
            continue
        Exercise.objects.create(course=course, is_published=True, **spec)
        created += 1

    return created
