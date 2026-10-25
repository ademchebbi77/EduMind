"""Annonces de démonstration pour visualiser le score d'urgence.

Les dates sont relatives au jour d'exécution : le score dépend de la proximité
de l'événement, donc un jeu de données figé deviendrait trompeur après
quelques semaines.
"""

from __future__ import annotations

from datetime import time, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import Announcement, AnnouncementEnrollment
from .urgency import compute_urgency

DEMO_PASSWORD = "EduMind!2026"

DEMO_STUDENTS = (
    ("demo.etudiant1@edumind.local", "Lina", "Démo"),
    ("demo.etudiant2@edumind.local", "Adam", "Démo"),
    ("demo.etudiant3@edumind.local", "Nora", "Démo"),
    ("demo.etudiant4@edumind.local", "Yanis", "Démo"),
    ("demo.etudiant5@edumind.local", "Inès", "Démo"),
    ("demo.etudiant6@edumind.local", "Karim", "Démo"),
    ("demo.etudiant7@edumind.local", "Léa", "Démo"),
    ("demo.etudiant8@edumind.local", "Hugo", "Démo"),
)

# event_in_days négatif = événement passé ; created_days_ago = ancienneté.
DEMO_ANNOUNCEMENTS = (
    {
        "title": "Urgent : atelier de révision annulé ce soir",
        "content": (
            "L'atelier de révision prévu ce soir est annulé. Une nouvelle date "
            "sera communiquée demain. Merci de prévenir votre binôme."
        ),
        "target_audience": Announcement.TargetAudience.ALL,
        "is_pinned": True,
        "event_in_days": 0,
        "event_time": time(18, 30),
        "meeting_link": "https://meet.example.com/atelier-revision",
        "created_days_ago": 1,
        "confirmed": 0,
        "pending": 2,
    },
    {
        "title": "Dernier délai : dépôt des candidatures vendredi",
        "content": (
            "Dernier délai vendredi à 17h pour déposer votre candidature. "
            "Aucun report ne sera accordé passé cette échéance."
        ),
        "target_audience": Announcement.TargetAudience.STUDENTS,
        "is_pinned": False,
        "event_in_days": 2,
        "event_time": time(17, 0),
        "meeting_link": "",
        "created_days_ago": 1,
        "confirmed": 3,
        "pending": 1,
    },
    {
        "title": "Réunion pédagogique demain",
        "content": (
            "Réunion de coordination demain à 14h en salle B204. "
            "Merci d'apporter vos supports de cours."
        ),
        "target_audience": Announcement.TargetAudience.TEACHERS,
        "is_pinned": False,
        "event_in_days": 1,
        "event_time": time(14, 0),
        "meeting_link": "",
        "created_days_ago": 2,
        "confirmed": 0,
        "pending": 0,
    },
    {
        "title": "Date limite d'inscription : formation Python",
        "content": (
            "La date limite d'inscription à la formation Python est fixée à jeudi. "
            "Les places sont limitées à vingt participants."
        ),
        "target_audience": Announcement.TargetAudience.ALL,
        "is_pinned": False,
        "event_in_days": 6,
        "event_time": time(9, 0),
        "meeting_link": "",
        "created_days_ago": 12,
        "confirmed": 2,
        "pending": 1,
        "capacity": 20,
    },
    {
        "title": "Important : report de la soutenance",
        "content": (
            "La soutenance de mi-parcours est reportée à la semaine prochaine. "
            "Le nouveau calendrier est important à consulter avant lundi."
        ),
        "target_audience": Announcement.TargetAudience.STUDENTS,
        "is_pinned": False,
        "event_in_days": 4,
        "event_time": time(10, 30),
        "meeting_link": "",
        "created_days_ago": 6,
        "confirmed": 2,
        "pending": 0,
    },
    {
        "title": "Conférence IA et éducation — inscription ouverte",
        "content": (
            "Les inscriptions pour la conférence sur l'IA et l'éducation sont ouvertes. "
            "L'événement aura lieu le mois prochain dans l'amphithéâtre principal."
        ),
        "target_audience": Announcement.TargetAudience.ALL,
        "is_pinned": False,
        "event_in_days": 25,
        "event_time": time(16, 0),
        "meeting_link": "https://meet.example.com/conference-ia",
        "created_days_ago": 2,
        "confirmed": 5,
        "pending": 0,
        "capacity": 50,
    },
    {
        "title": "Attention : changement de salle",
        "content": (
            "Attention, le cours de demain change de salle. C'est important : "
            "rendez-vous en amphi C101."
        ),
        "target_audience": Announcement.TargetAudience.ALL,
        "is_pinned": False,
        "event_in_days": 1,
        "event_time": time(8, 30),
        "meeting_link": "",
        "created_days_ago": 1,
        "confirmed": 8,
        "pending": 0,
    },
    {
        "title": "Formation Deep Learning — places limitées",
        "content": (
            "Une formation Deep Learning est proposée aux étudiants avancés. "
            "Les places sont limitées à quinze participants."
        ),
        "target_audience": Announcement.TargetAudience.STUDENTS,
        "is_pinned": False,
        "event_in_days": 14,
        "event_time": time(9, 30),
        "meeting_link": "",
        "created_days_ago": 8,
        "confirmed": 4,
        "pending": 2,
        "capacity": 15,
    },
    {
        "title": "Rappel : remise des projets",
        "content": (
            "Rappel : les projets de fin de module sont à rendre avant la fin du mois. "
            "Un dépôt par groupe suffit."
        ),
        "target_audience": Announcement.TargetAudience.STUDENTS,
        "is_pinned": False,
        "event_in_days": 20,
        "event_time": time(23, 59),
        "meeting_link": "",
        "created_days_ago": 15,
        "confirmed": 1,
        "pending": 0,
    },
    {
        "title": "Inscriptions ouvertes : certification SQL",
        "content": (
            "Les inscriptions à la certification SQL sont ouvertes jusqu'à la fin du mois. "
            "Le passage se fait sur la plateforme habituelle."
        ),
        "target_audience": Announcement.TargetAudience.ALL,
        "is_pinned": False,
        "event_in_days": None,
        "event_time": None,
        "meeting_link": "",
        "created_days_ago": 9,
        "confirmed": 2,
        "pending": 0,
        "capacity": 30,
    },
    {
        "title": "Séance de rattrapage : annales disponibles",
        "content": (
            "Les annales de la séance de rattrapage sont disponibles dans l'espace "
            "de cours. Bon travail à toutes et à tous."
        ),
        "target_audience": Announcement.TargetAudience.ALL,
        "is_pinned": False,
        "event_in_days": -3,
        "event_time": time(15, 0),
        "meeting_link": "",
        "created_days_ago": 30,
        "confirmed": 0,
        "pending": 0,
    },
    {
        "title": "Nouveau podcast : l'IA dans l'éducation",
        "content": (
            "L'épisode de la semaine explore les usages responsables de l'IA en classe. "
            "Bonne écoute !"
        ),
        "target_audience": Announcement.TargetAudience.ALL,
        "is_pinned": False,
        "event_in_days": None,
        "event_time": None,
        "meeting_link": "",
        "created_days_ago": 20,
        "confirmed": 0,
        "pending": 0,
    },
)


def _seed_students():
    User = get_user_model()
    students = []
    for email, first_name, last_name in DEMO_STUDENTS:
        student, created = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": first_name,
                "last_name": last_name,
                "role": User.Role.STUDENT,
                "is_active": True,
            },
        )
        if created:
            student.set_password(DEMO_PASSWORD)
            student.save(update_fields=["password"])
        students.append(student)
    return students


def _seed_enrollments(announcement, students, *, confirmed, pending):
    for index, student in enumerate(students[: confirmed + pending]):
        status = (
            AnnouncementEnrollment.Status.CONFIRMED
            if index < confirmed
            else AnnouncementEnrollment.Status.PENDING
        )
        AnnouncementEnrollment.objects.update_or_create(
            announcement=announcement,
            student=student,
            defaults={
                "full_name": student.get_full_name() or student.email,
                "email": student.email,
                "phone": "",
                "message": "Inscription de démonstration.",
                "status": status,
            },
        )


def seed_announcements(*, today=None):
    """Crée ou met à jour les annonces de démonstration et leurs inscriptions.

    Retourne ``(annonces, creees, inscriptions)`` et la liste des urgence
    calculées, triée du score le plus élevé au plus faible.
    """
    today = today or timezone.localdate()
    now = timezone.now()

    User = get_user_model()
    author = (
        User.objects.filter(email="teacher@edumind.local", role=User.Role.TEACHER).first()
        or User.objects.filter(is_staff=True).order_by("pk").first()
    )
    if author is None:
        raise RuntimeError(
            "Aucun enseignant trouvé : lancez d'abord `python manage.py seed_demo`."
        )

    students = _seed_students()
    created_count = 0
    enrollment_count = 0

    for spec in DEMO_ANNOUNCEMENTS:
        event_date = (
            today + timedelta(days=spec["event_in_days"])
            if spec["event_in_days"] is not None
            else None
        )
        announcement, created = Announcement.objects.update_or_create(
            title=spec["title"],
            defaults={
                "content": spec["content"],
                "target_audience": spec["target_audience"],
                "author": author,
                "is_pinned": spec["is_pinned"],
                "event_date": event_date,
                "event_time": spec["event_time"],
                "meeting_link": spec["meeting_link"],
                "capacity": spec.get("capacity"),
            },
        )
        if created:
            created_count += 1

        timestamp = now - timedelta(days=spec["created_days_ago"])
        Announcement.objects.filter(pk=announcement.pk).update(created_at=timestamp)
        announcement.created_at = timestamp

        _seed_enrollments(
            announcement,
            students,
            confirmed=spec["confirmed"],
            pending=spec["pending"],
        )
        enrollment_count += spec["confirmed"] + spec["pending"]

    announcements = list(
        Announcement.objects.filter(
            title__in=[spec["title"] for spec in DEMO_ANNOUNCEMENTS]
        ).prefetch_related("enrollments")
    )
    scored = []
    for announcement in announcements:
        confirmed = sum(
            1 for enrollment in announcement.enrollments.all()
            if enrollment.status == AnnouncementEnrollment.Status.CONFIRMED
        )
        scored.append((announcement, compute_urgency(announcement, enrollment_count=confirmed)))
    scored.sort(key=lambda item: (-item[1].score, item[0].title))

    return len(announcements), created_count, enrollment_count, scored
