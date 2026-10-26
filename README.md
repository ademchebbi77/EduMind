# EduMind AI

Plateforme éducative permettant à une équipe pédagogique de publier et de consulter
des supports de cours PDF et audio, avec une authentification par email et une gestion
des accès par rôle.

Cette itération couvre **l'authentification, les utilisateurs, les rôles et la gestion
complète des cours** (création, consultation, modification, suppression, recherche et
téléversement de fichiers).

---

## Périmètre

### Inclus

- Inscription (étudiant ou enseignant), connexion et déconnexion par email + mot de passe.
- Gestion du profil : photo, coordonnées et changement de mot de passe.
- Trois rôles : **étudiant**, **enseignant**, **administrateur**.
- Gestion des comptes par un administrateur : recherche, filtres, modification du
  nom et de l'email, changement de rôle, activation et désactivation.
- Catalogue de cours avec recherche, filtre par type, tri et pagination.
- CRUD des cours avec téléversement d'un fichier PDF ou audio.
- Téléchargement et lecture des fichiers protégés par l'authentification.
- Interface Django d'administration pour les comptes et les cours (staff uniquement).
- API JSON, validation des fichiers, limitation des tentatives de connexion.
- Interface React responsive, en français, accessible au clavier et conforme aux
  contrastes WCAG AA.
- Recommandations de sessions, score d'urgence et catégorisation automatique des
  annonces, détection des étudiants à risque et prévision de remplissage, calculés
  localement (TF-IDF, similarité cosinus, lexiques et règles à seuils), sans service
  externe ni modèle entraîné.
- Suggestion des créneaux horaires qui ont le mieux rempli les sessions passées.
- Tests automatisés backend et frontend, couverture mesurée.

### Hors périmètre (volontairement absent)

Aucun stub ni écran factice n'a été ajouté pour les fonctionnalités suivantes, qui
pourront être développées dans des applications Django séparées :

- modèles d'IA entraînés (classification, régression, détection d'anomalies) ;
- reconnaissance faciale et gestion de présence ;
- visioconférence et parcours de formation ;
- files de tâches asynchrones (Celery) et Redis ;
- déploiement en production.

---

## Stack technique

| Couche | Technologies |
| --- | --- |
| Backend | Python 3.11, Django 5.2 LTS, Django REST Framework 3.18, PostgreSQL 18 |
| Authentification | Sessions Django + CSRF, cookies `HttpOnly` |
| Fichiers | `filetype` (signature binaire), stockage privé, réponses HTTP Range |
| Frontend | React 19, Vite 8, React Router 7, Axios, Tailwind CSS 4 |
| Icônes | `lucide-react` uniquement (aucun framework UI lourd) |
| Tests backend | Django TestCase, coverage.py (couverture de branches) |
| Tests frontend | Vitest, Testing Library, jsdom |
| Qualité | ESLint 9 (react, hooks, jsx-a11y), build Vite de production |

Versions épinglées côté backend dans `Backend/requirements.txt` ; versions frontend
dans `Frontend/package.json` et `package-lock.json`.

---

## Structure du dépôt

```text
EduMind/
├── Backend/
│   ├── accounts/          # utilisateur, rôles, auth API, throttling, seed_demo
│   ├── courses/           # modèle Course, API, validateurs, service de fichiers
│   ├── config/            # settings, URLs, erreurs JSON, pagination
│   ├── media/             # fichiers téléversés (privés, ignorés par Git)
│   ├── manage.py
│   └── requirements.txt
├── Frontend/
│   ├── src/
│   │   ├── api/           # appels Axios (auth, cours, comptes)
│   │   ├── components/    # UI, layout, cours, admin, gardes de routes
│   │   ├── context/       # authentification, notifications
│   │   ├── hooks/         # configuration API, debounce, titre de page
│   │   ├── lib/           # client API, formats, rôles, erreurs
│   │   ├── pages/         # dashboard, profil, 404
│   │   │   ├── admin/     # liste et modification des comptes
│   │   │   ├── auth/      # connexion, inscription
│   │   │   └── courses/   # catalogue, détail, formulaire
│   └── package.json
├── monitoring/            # Prometheus + Grafana (datasource et tableau de bord)
├── docker-compose.monitoring.yml
├── .env.example
└── README.md
```

Les dossiers `.env`, `media/`, `node_modules/`, `dist/`, les caches et le dossier
`.qoder/` ne sont jamais versionnés (voir `.gitignore`).

---

## Prérequis

- **Python 3.11** (version validée : 3.11.9). Vérifiez avec `python --version`.
- **Node.js 20.19+ ou 22.12+** (version validée : 26.3.0) et npm.
- **PostgreSQL 18** installé et démarré sur le port **5432** (version validée sur
  cette machine : 18.3).
- Git Bash, PowerShell ou tout terminal équivalent.

Sur Windows, préfixez les commandes Python par `PYTHONUTF8=1` (Git Bash) ou
définissez `$env:PYTHONUTF8=1` (PowerShell) afin d'éviter les erreurs d'encodage
des messages accentués dans la console.

---

## Démarrage rapide

Toutes les commandes backend s'exécutent depuis `Backend/`, les commandes frontend
depuis `Frontend/`. Le fichier `.env` se trouve à la racine du dépôt.

### 1. Configuration

```bash
cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Copiez la valeur générée dans `SECRET_KEY` du fichier `.env`. Django refuse de
démarrer si `SECRET_KEY` est absent.

| Variable | Valeur locale typique | Rôle |
| --- | --- | --- |
| `SECRET_KEY` | chaîne aléatoire longue | Clé cryptographique Django (obligatoire) |
| `DEBUG` | `True` | Mode développement ; `False` par défaut dans le code |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1,host.docker.internal` | Hôtes autorisés |
| `CSRF_TRUSTED_ORIGINS` | `http://localhost:5173` | Origines autorisées pour le CSRF |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Origines autorisées pour l'API |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `edumind` / `edumind` / mot de passe local | Identifiants PostgreSQL |
| `DB_HOST` / `DB_PORT` | `localhost` / `5432` | Connexion PostgreSQL locale |
| `MAX_UPLOAD_SIZE_MB` | `50` | Taille maximale d'un fichier de cours |
| `AVATAR_MAX_SIZE_MB` | `5` | Taille maximale d'une photo de profil |
| `COOKIE_SECURE` | `False` | Cookies `Secure` (obligatoire derrière HTTPS) |
| `LOGIN_THROTTLE_ATTEMPTS` | `5` | Échecs autorisés par fenêtre |
| `LOGIN_THROTTLE_WINDOW_SECONDS` | `60` | Durée de la fenêtre de limitation |
| `METRICS_TOKEN` | `edumind-dev-metrics-token` | Jeton Bearer de `/metrics/` ; vide = endpoint désactivé |
| `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` | `admin` / `edumind` | Identifiants Grafana (premier démarrage) |

La base utilise l'instance PostgreSQL 18 locale sur le port **5432**. Renseignez
`DB_PASSWORD` avec le mot de passe du rôle `edumind` créé ci-dessous.

### 2. PostgreSQL local

PostgreSQL 18 doit être installé et démarré sur le port **5432** (service Windows
`postgresql-x64-18`). Créez le rôle et la base une seule fois, avec pgAdmin
(**Query Tool**) ou `psql`, connecté en superutilisateur `postgres` :

```sql
CREATE USER edumind WITH PASSWORD '<mot_de_passe_local>' CREATEDB;
CREATE DATABASE edumind OWNER edumind;
```

Le privilège `CREATEDB` est obligatoire : Django crée une base temporaire
`test_edumind` lorsqu'il exécute les tests. Reportez le mot de passe choisi dans
`DB_PASSWORD` du fichier `.env`.

Avec `psql` :

```bash
psql -U postgres -h localhost -p 5432
```

Si le rôle ou la base existent déjà, alignez simplement le mot de passe
(`ALTER USER edumind WITH PASSWORD '<mot_de_passe_local>';`) et vérifiez que
`CREATEDB` est accordé.

### 3. Backend

```bash
cd Backend
python -m venv .venv
source .venv/Scripts/activate        # Git Bash
# .\.venv\Scripts\Activate.ps1       # PowerShell

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

PYTHONUTF8=1 python manage.py migrate
PYTHONUTF8=1 python manage.py seed_demo
PYTHONUTF8=1 python manage.py runserver
```

Le serveur écoute sur `http://127.0.0.1:8000`. L'administration Django est
disponible sur `http://127.0.0.1:8000/admin/` (comptes staff uniquement).

`seed_demo` est idempotent : il crée ou met à jour les comptes de démonstration et
régénère les fichiers de cours manquants. Il crée quatre cours d'exemple
(deux PDF, deux audio).

Pour visualiser les scores d'urgence, `python manage.py seed_announcements` crée
12 annonces de démonstration (dates relatives au jour d'exécution, inscriptions
confirmées) et affiche leur score calculé.

`python manage.py seed_session_history` alimente les analyses locales avec un
historique idempotent de sessions passées et à venir, d'inscriptions confirmées, de
tentatives de quiz et d'un exercice en retard. La commande affiche ensuite les
prévisions de remplissage et les meilleurs créneaux calculés.

Les analyses sont ensuite visibles dans l'interface :

- **Annonces** : champ de catégorie dans le formulaire (Automatique par défaut,
  ou Formation, Évaluation, Administratif, Événement, Rappel, Autre), badge et
  filtre dédiés ; détail avec catégorie et confiance (ou mention « Manuelle »).
- **Nouvelle annonce / modification** (enseignants et administrateurs) : carte
  repliable « Remplir automatiquement à partir d'un texte ». On colle une description
  libre en français, l'analyse propose chaque champ avec sa confiance et l'extrait qui
  l'a motivé, on coche les champs à appliquer, et une confirmation est demandée avant
  de remplacer une valeur déjà saisie.
- **Sessions** (enseignants et administrateurs) : prévision de remplissage des
  prochaines sessions, avec fourchette et niveau de confiance.
- **Nouvelle session** : carte « Créneaux suggérés » avec application en un clic de
  la date et de l'heure.
- **Étudiants à risque** (enseignants et administrateurs) : score, niveau, signaux
  explicables (moyenne aux quiz, inactivité, exercices en retard) et filtre par
  niveau.

### 4. Frontend

```bash
cd Frontend
npm install
npm run dev
```

Ouvrez **http://localhost:5173** (utilisez `localhost`, et non `127.0.0.1`, car les
origines CSRF/CORS configurées ciblent `http://localhost:5173`). Vite redirige les
appels `/api` vers `http://127.0.0.1:8000`.

### 5. Build de production local

```bash
cd Frontend
npm run build
npm run preview -- --port 4173
```

Le serveur de prévisualisation reprend le proxy `/api` et sert le bundle sur
`http://localhost:4173`.

### 6. Monitoring (optionnel) : Prometheus + Grafana

L'API expose `GET /metrics/` au format Prometheus : nombre d'enseignants, nombre
d'étudiants et nombre de cours. L'endpoint est **désactivé (404)** tant que
`METRICS_TOKEN` est vide ; sinon, il exige `Authorization: Bearer <jeton>` (401
sinon). Il n'est pas sous `/api/` et n'est jamais accessible sans le jeton.

1. Vérifiez ces variables dans le `.env` de la racine :

   ```bash
   ALLOWED_HOSTS=localhost,127.0.0.1,host.docker.internal
   METRICS_TOKEN=edumind-dev-metrics-token
   GRAFANA_ADMIN_USER=admin
   GRAFANA_ADMIN_PASSWORD=edumind
   ```

2. Démarrez Django en écoutant sur toutes les interfaces, sinon le conteneur
   Prometheus ne peut pas joindre le serveur :

   ```bash
   cd Backend
   PYTHONUTF8=1 python manage.py runserver 0.0.0.0:8000
   ```

3. Avec Docker Desktop démarré, lancez la pile depuis la racine :

   ```bash
   docker compose -f docker-compose.monitoring.yml up -d
   ```

4. Ouvrez :

   - **Grafana** : `http://localhost:3000` — tableau de bord **EduMind overview**
     (dossier *EduMind*), avec les tuiles **Teachers**, **Students** et **Courses** ;
   - **Prometheus** : `http://localhost:9090` — cible `edumind-backend` et état des
     scrapes dans *Status → Targets*.

Vérification manuelle de l'endpoint :

```bash
curl -H "Authorization: Bearer edumind-dev-metrics-token" http://127.0.0.1:8000/metrics/
```

Docker Compose transmet le `METRICS_TOKEN` du `.env` à Prometheus : les deux
valeurs restent donc synchronisées. Les ports 3000 et 9090 sont publiés sur
`127.0.0.1` uniquement. Les données sont conservées dans les volumes
`edumind-monitoring_*` ; `docker compose -f docker-compose.monitoring.yml down -v`
les supprime et réinitialise Grafana (le mot de passe admin n'est appliqué qu'à la
création du volume). Pour arrêter sans perte : `docker compose -f
docker-compose.monitoring.yml down`.

Le jeton et le mot de passe proposés conviennent au développement local ; changez-les
avant tout partage de la machine.

---

## Après un `git pull` : lancer tous les modules

À faire après chaque `git pull` qui modifie le projet. Ces étapes couvrent aussi les
modules **Quiz & exercices**, **Générateur de quiz (IA)**, **Questions vocales** et le
panneau **Accessibility**. Commandes PowerShell, depuis la racine `EduMind`.

### 1. Mettre à jour les dépendances et la base

```powershell
cd Backend
.\.venv\Scripts\python -m pip install -r requirements.txt   # celery, redis, httpx, openai-whisper...
$env:PYTHONUTF8=1
.\.venv\Scripts\python manage.py migrate
cd ..\Frontend
npm install
```

`openai-whisper` installe PyTorch : la première installation peut prendre quelques
minutes.

### 2. Compléter son `.env` (une seule fois)

Comparer son `.env` avec `.env.example` et ajouter les variables manquantes, en
particulier :

```bash
CELERY_BROKER_URL=redis://127.0.0.1:6379/0
VOICE_QA_TRANSCRIPTION_PROVIDER=local     # Whisper local, gratuit
VOICE_QA_WHISPER_MODEL=base
GEMINI_API_KEY=...                        # sa propre clé gratuite : https://aistudio.google.com/apikey
GEMINI_MODEL=gemini-3.5-flash
GEMINI_FALLBACK_MODEL=gemini-3.1-flash-lite
```

Chacun crée **sa propre clé Gemini** : ne jamais partager une clé ni la committer
(`.env` est ignoré par Git). Sans clé Gemini, tout fonctionne sauf les réponses des
questions vocales et les fonctions IA des résumés.

### 3. Lancer l'application (2 terminaux)

Ouvrir **Docker Desktop** (une fois par session), puis :

```powershell
# Terminal 1 — API Django (démarre aussi Redis et le worker Celery)
cd Backend; $env:PYTHONUTF8=1
.\.venv\Scripts\python manage.py runserver

# Terminal 2 — interface
cd Frontend
npm run dev
```

Ouvrir **http://localhost:5173**. Au démarrage, `runserver` affiche des lignes `[EduMind]` :

- **Redis** : s'il ne répond pas, le conteneur Docker `edumind-redis` est démarré
  (ou créé la première fois) automatiquement ;
- **Celery** : un worker est lancé avec le serveur et **relancé à chaque rechargement**
  (code modifié, `git pull`), donc toujours à jour ;
- **sans Docker** (non installé ou Docker Desktop fermé) : les tâches s'exécutent dans
  le serveur web — tout fonctionne, mais les pages attendent la fin des traitements IA.

Ce démarrage automatique ne concerne que `runserver` en développement (`DEBUG=True`) ; il
se désactive avec `AUTO_START_BACKGROUND_SERVICES=False` (lancer alors Redis et
`celery -A config worker --pool=solo` soi-même).

La première question vocale télécharge le modèle Whisper (~140 Mo, une seule fois,
connexion Internet nécessaire) ; elle peut prendre une minute, les suivantes quelques
secondes.

### 4. Vérifier

| Module | Comment tester |
| --- | --- |
| Quiz & exercices | *Quizzes & exercises* : créer un quiz (enseignant), le passer (étudiant) |
| Générateur de quiz | *Teaching → Generate a quiz* → *Upload a document* → `Backend/assessments/generation/samples/apprentissage-automatique.txt` |
| Questions vocales | *Voice questions* : choisir un cours avec un vrai PDF, enregistrer une question |
| Accessibilité | Bouton *Accessibility* (barre latérale) : taille du texte, contraste élevé |

Tests : `.\.venv\Scripts\python manage.py test` (Redis non nécessaire) et
`npm test` dans `Frontend`.

### En cas de problème

| Symptôme | Cause / solution |
| --- | --- |
| `ModuleNotFoundError` (celery, numpy, whisper…) | Relancer `pip install -r requirements.txt` dans le venv |
| « The background worker is unavailable » (503) | Redis arrêté : ouvrir Docker Desktop puis relancer `runserver` |
| Génération bloquée sur « Waiting for a worker » | `AUTO_START_BACKGROUND_SERVICES=False` : lancer le worker soi-même |
| Ligne `[EduMind] Docker Desktop is not running` | Ouvrir Docker Desktop et relancer `runserver` (sinon mode sans Redis) |
| « Voice questions are not available yet » | `GEMINI_API_KEY` absente du `.env`, puis redémarrer Django et le worker |
| « The AI service is temporarily unavailable » | Gemini saturé : réessayer (*Retry*) ; le modèle de repli est déjà utilisé |
| Port 8000 déjà utilisé | Arrêter l'autre serveur (ex. un autre projet) avant `runserver` |

---

## Comptes de démonstration

| Rôle | Email | Mot de passe |
| --- | --- | --- |
| Administrateur | `admin@edumind.local` | `EduMind!2026` |
| Enseignant | `teacher@edumind.local` | `EduMind!2026` |
| Étudiant | `student@edumind.local` | `EduMind!2026` |

> Ces identifiants sont réservés aux démonstrations locales. `seed_demo` refuse de
> s'exécuter lorsque `DEBUG=False` et lève une `CommandError`.

L'auto-inscription n'autorise que les rôles **étudiant** et **enseignant**. Il est
impossible de créer un compte administrateur via l'API publique ; les comptes admin
sont créés par `seed_demo`, `createsuperuser` ou l'administration Django.

---

## API

L'API est servie sous `/api/` et renvoie du JSON. L'authentification utilise la
session Django : les requêtes mutantes exigent le cookie CSRF et l'en-tête
`X-CSRFToken`. Le frontend récupère le cookie via `GET /api/auth/csrf/`.

### Points d'entrée

| Méthode | Chemin | Accès | Description |
| --- | --- | --- | --- |
| `GET` | `/api/auth/csrf/` | Public | Définit le cookie CSRF |
| `POST` | `/api/auth/register/` | Public | Inscription étudiant/enseignant, connexion automatique |
| `POST` | `/api/auth/login/` | Public | Connexion par email + mot de passe |
| `POST` | `/api/auth/logout/` | Authentifié | Déconnexion |
| `GET` | `/api/auth/me/` | Authentifié | Profil courant |
| `PATCH` | `/api/auth/me/` | Authentifié | Mise à jour du profil (prénom, nom, email, photo) |
| `GET` | `/api/auth/me/avatar/` | Authentifié | Photo de profil privée |
| `POST` | `/api/auth/me/password/` | Authentifié | Changement de mot de passe |
| `GET` | `/api/auth/users/` | Administrateur | Liste paginée, filtrable et triable des comptes |
| `GET` | `/api/auth/users/{id}/` | Administrateur | Détail d'un compte |
| `PATCH` | `/api/auth/users/{id}/` | Administrateur | Nom, email, rôle et statut d'un compte |
| `DELETE` | `/api/auth/users/{id}/` | Administrateur | Suppression définitive du compte, de ses cours et fichiers |
| `GET` | `/api/config/` | Public | Limites de téléversement et extensions autorisées |
| `GET` | `/metrics/` | Jeton Bearer (`METRICS_TOKEN`) | Métriques Prometheus : effectifs et cours |
| `GET` | `/api/courses/` | Authentifié | Liste paginée, filtrable et triable |
| `POST` | `/api/courses/` | Enseignant / admin | Création d'un cours |
| `GET` | `/api/courses/{id}/` | Authentifié | Détail d'un cours |
| `PATCH` / `PUT` | `/api/courses/{id}/` | Propriétaire enseignant / admin | Modification |
| `DELETE` | `/api/courses/{id}/` | Propriétaire enseignant / admin | Suppression |
| `GET` | `/api/courses/{id}/file/` | Authentifié | Lecture du fichier (inline, Range) |
| `GET` | `/api/courses/{id}/download/` | Authentifié | Téléchargement du fichier |

Toute autre route `/api/...` renvoie une erreur JSON 404.

### Droits par rôle

| Action | Étudiant | Enseignant | Administrateur |
| --- | --- | --- | --- |
| Consulter les cours | Oui | Oui | Oui |
| Lire/télécharger un fichier | Oui | Oui | Oui |
| Créer un cours | Non | Oui | Oui |
| Modifier/supprimer | Non | Ses propres cours | Tous les cours |
| Gérer les comptes | Non | Non | Oui |
| Administration Django | Non | Non | Oui (staff) |

### Gestion des comptes

Les routes `/api/auth/users/` sont réservées aux comptes dont le rôle est
`administrateur`. Elles acceptent :

- `search` : nom, prénom ou adresse email ;
- `role` : `student`, `teacher` ou `admin` ;
- `is_active` : `true` ou `false` ;
- `ordering` : `first_name`, `last_name`, `email`, `role`, `is_active`,
  `date_joined`, précédé de `-` pour l'ordre décroissant (par défaut
  `-date_joined`) ;
- `page` : numéro de page.

Seuls le prénom, le nom, l'email, le rôle et le statut sont modifiables. Le mot de
passe et la photo de profil restent gérés par l'utilisateur depuis son profil. La
route `DELETE` supprime définitivement le compte ainsi que ses cours et leurs
fichiers PDF ou audio ; l'interface affiche un avertissement explicite avant
confirmation. Trois protections s'appliquent côté serveur :

1. un administrateur ne peut ni modifier son propre rôle, ni désactiver son compte,
   ni supprimer son propre compte ;
2. le rôle d'un superutilisateur ne peut pas être changé (Django le force à
   `admin`) ;
3. le dernier administrateur actif ne peut être ni rétrogradé, ni désactivé, ni
   supprimé.

Les emails sont comparés sans tenir compte de la casse ; un doublon renvoie une
erreur de validation **400** dans `fields.email`.

### Catalogue

- `search` : recherche insensible à la casse dans le titre et la description.
- `type` : `pdf` ou `audio`.
- `ordering` : `title`, `type`, `created_at`, `updated_at`, précédé de `-` pour
  l'ordre décroissant. Par défaut : `-created_at` (plus récents d'abord).
- `page` : numéro de page. `page_size` : 12 par défaut, 50 maximum.

Exemple :

```text
GET /api/courses/?search=python&type=pdf&ordering=-created_at&page=2
```

### Téléversement des fichiers

Formats acceptés : **PDF, MP3, WAV, M4A, OGG**. Le backend vérifie :

1. l'extension du nom de fichier ;
2. la taille (fichier non vide, 50 Mo maximum par défaut) ;
3. le type MIME déclaré, s'il est fourni ;
4. la signature binaire réelle via `filetype`, qui doit correspondre à l'extension.

Les fichiers sont renommés avec un UUID et stockés dans `Backend/media/courses/`.
La limite et les extensions sont exposées par `GET /api/config/` ; l'interface lit
ces valeurs et ne les duplique pas en dur.

### Photo de profil

`PATCH /api/auth/me/` accepte un fichier `avatar` en `multipart/form-data`.
Formats : **JPEG, PNG, WebP** ; 5 Mo maximum (`AVATAR_MAX_SIZE_MB`). Le type réel
est vérifié par signature binaire, puis l'image est renommée avec un UUID et
stockée dans `Backend/media/avatars/`. Elle n'est servie que par
`GET /api/auth/me/avatar/`, réservé au propriétaire du compte et renvoyé avec
`Cache-Control: private, no-store`.

### Mot de passe

`POST /api/auth/me/password/` exige `current_password`, `new_password` et
`new_password_confirm`. Le mot de passe actuel est vérifié, les validateurs Django
s'appliquent, et la session courante reste active après le changement.

### Fichiers privés

Il n'existe **aucune route publique `/media/`**. Un fichier ne peut être lu que via
`/api/courses/{id}/file/` ou `/api/courses/{id}/download/`, après authentification et
vérification des droits. Les réponses prennent en charge l'en-tête `Range` pour la
lecture audio/PDF. Les liens stockés ne permettent donc pas de deviner une URL
publique.

### Format d'erreur

Toutes les erreurs de l'API, y compris les 404 et 500, partagent la forme suivante :

```json
{
  "error": {
    "code": "validation_error",
    "message": "Les données fournies sont invalides.",
    "fields": {
      "file": ["Le contenu du fichier ne correspond pas à son extension."]
    }
  }
}
```

Le champ `fields` est optionnel. Principaux codes : `validation_error`,
`invalid_credentials`, `authentication_required`, `permission_denied`, `not_found`,
`method_not_allowed`, `throttled`, `parse_error`, `unsupported_media_type`,
`csrf_failed`, `server_error`.

---

## Générateur de quiz local (IA)

Un enseignant génère un quiz à partir d'un cours PDF, de la transcription d'un cours
audio/vidéo, ou d'un document téléversé (PDF, DOCX, TXT, MD). Les questions s'ouvrent
dans l'éditeur de quiz : rien n'est enregistré avant validation par l'enseignant.

- **100 % local** : aucune API d'IA externe, aucune clé, aucun accès Internet à
  l'exécution. Le code se trouve dans `Backend/assessments/generation/`.
- **Pipeline** : extraction du texte (`pypdf`, DOCX lu en XML) → détection de la langue
  (français/anglais) → découpage en phrases → extraction de termes clés (TF-IDF par
  document, filtres de groupes nominaux) → questions à choix unique (définitions, textes
  à trous), à choix multiple (énumérations) et vrai/faux. Chaque bonne réponse provient
  d'une phrase du document, affichée comme explication ; les distracteurs sont d'autres
  termes du document choisis par similarité de contexte.
- **spaCy optionnel** : si `spacy` et un modèle (`fr_core_news_sm`, `en_core_web_sm`…)
  sont déjà installés, ils sont utilisés ; sinon le moteur pur Python prend le relais.
  Aucun modèle n'est téléchargé automatiquement.
- **Asynchrone** : la génération s'exécute dans un worker **Celery** avec **Redis**
  (`POST /api/quiz-generator/jobs/` répond 202, l'interface suit la progression).

### Lancer Redis et le worker

```bash
docker run -d --name edumind-redis -p 6379:6379 redis:7-alpine   # une seule fois
docker start edumind-redis                                       # les fois suivantes

cd Backend
PYTHONUTF8=1 .venv/Scripts/celery -A config worker --pool=solo --loglevel=info
```

`--pool=solo` est nécessaire sous Windows. Sans Redis, l'API répond **503** avec un
message explicite. Pour le développement uniquement, `CELERY_TASK_ALWAYS_EAGER=True`
dans `.env` exécute les tâches dans le processus web.

### Points d'entrée

| Méthode | Chemin | Description |
| --- | --- | --- |
| `GET` | `/api/quiz-generator/sources/` | Cours utilisables et raison si indisponible |
| `POST` | `/api/quiz-generator/jobs/` | Lance une génération (`course` ou `file`, `num_questions`, `difficulty`, `question_types`) |
| `GET` | `/api/quiz-generator/jobs/{id}/` | Statut, étape, progression et résultat |
| `GET` | `/api/quiz-generator/metrics/` | Métriques de qualité et de performance |

Réservé aux enseignants (sur leurs propres cours) et aux administrateurs.

### Métriques

```bash
cd Backend
PYTHONUTF8=1 .venv/Scripts/python manage.py evaluate_quiz_generator --runs 3 --output rapport-ia.md
```

Le rapport mesure le temps de réponse (médiane, p95), le taux de remplissage, le taux
de questions **valides** (acceptées par la validation de l'API) et le taux de questions
**ancrées** (bonne réponse présente dans la phrase source, aucun distracteur dedans).
Il inclut aussi l'usage réel : temps d'attente et de traitement des jobs Celery, et le
**taux d'acceptation par les enseignants** (questions conservées ou modifiées lors de
l'enregistrement du quiz).

---

## Questions vocales et réponses IA

Page **Voice questions** (barre latérale, tous les rôles) : l'utilisateur choisit un cours,
enregistre sa question au micro (MediaRecorder du navigateur, 3 min max) ou téléverse un
fichier audio, relit et corrige la transcription, puis reçoit une réponse personnalisée.

- **Transcription** : **Whisper** (modèle open source `base`) exécuté **localement et
  gratuitement** sur le serveur ; l'audio est décodé avec le ffmpeg fourni par
  `imageio-ffmpeg`. Le modèle (~140 Mo) est téléchargé une seule fois au premier usage,
  puis tout fonctionne hors ligne. Langue détectée ou imposée (français, anglais, arabe).
  L'API payante OpenAI Whisper reste disponible avec `VOICE_QA_TRANSCRIPTION_PROVIDER=openai`.
  Formats : WEBM, OGG, MP3, WAV, M4A, MP4, MPEG, FLAC — 25 Mo max, signature binaire vérifiée.
- **Réponse** : API **Google Gemini**. Le prompt contient les passages du cours les plus
  proches de la question (texte du PDF ou transcription du cours), le prénom de
  l'étudiant, sa moyenne aux quiz du cours et ses dernières questions sur ce cours (suivi
  de conversation). Réponse dans la langue de la question ; l'arabe s'affiche de droite à
  gauche.
- **Asynchrone** : transcription et réponse sont deux tâches **Celery** ; l'interface suit
  l'avancement, affiche les erreurs et propose « Retry ».
- **Confidentialité** : chaque utilisateur ne voit que son propre historique (même un
  administrateur ne peut pas lire celui d'un étudiant via l'API) ; l'audio est privé et
  supprimé avec la question.
- **Sécurité** : les clés restent côté serveur ; les erreurs des fournisseurs sont
  converties en messages sûrs (aucune clé ni réponse brute renvoyée au navigateur).

### Configuration

Dans `.env` (puis redémarrer Django **et** le worker Celery) :

```bash
GEMINI_API_KEY=...                         # gratuit : https://aistudio.google.com/apikey
VOICE_QA_TRANSCRIPTION_PROVIDER=local      # Whisper local gratuit (par défaut)
VOICE_QA_WHISPER_MODEL=base                # tiny (rapide) · base · small (plus précis)
# Optionnel : GEMINI_MODEL=gemini-3.5-flash, GEMINI_FALLBACK_MODEL=gemini-3.1-flash-lite
# (repli automatique si le modèle principal est saturé)
# API payante : VOICE_QA_TRANSCRIPTION_PROVIDER=openai + OPENAI_API_KEY=sk-...
```

| Méthode | Chemin | Description |
| --- | --- | --- |
| `GET` | `/api/voice-questions/config/` | Limites, formats, langues et état de la configuration |
| `GET` | `/api/voice-questions/` | Historique de l'utilisateur (`?course=`) |
| `POST` | `/api/voice-questions/` | Envoi de l'audio (`course`, `audio`, `language`) → transcription |
| `GET` | `/api/voice-questions/{id}/` | Statut, transcription et réponse |
| `POST` | `/api/voice-questions/{id}/ask/` | Question (corrigée) envoyée à Gemini |
| `POST` | `/api/voice-questions/{id}/retry/` | Relance l'étape en échec |
| `GET` | `/api/voice-questions/{id}/audio/` | Écoute de l'enregistrement (propriétaire uniquement) |
| `DELETE` | `/api/voice-questions/{id}/` | Supprime la question et l'audio |

## Extraction locale des champs d'une annonce

`POST /api/announcements/extract/` avec `{"text": "..."}` (15 à 5000 caractères)
renvoie, pour chaque champ du formulaire d'annonce, `value`, `label`, `confidence`
(0 à 100), `detected` et `source` (extrait du texte qui justifie la valeur). Réservé
aux enseignants et administrateurs (mêmes droits que la publication, CSRF exigé).
Rien n'est enregistré : la réponse est une proposition que l'utilisateur valide.

Module `Backend/announcements/extraction.py`, déterministe et 100 % local (aucune API
externe, aucun appel réseau, aucune nouvelle dépendance, aucune migration) :

| Champ | Méthode |
| --- | --- |
| Titre / contenu | ligne « Titre : » ou « Objet : », sinon première ligne courte, sinon première phrase ; le contenu est le texte sans la ligne de titre |
| Audience | lexique (« réservé aux étudiants », « destiné aux enseignants », « ouvert à tous »…) |
| Catégorie | réutilise `categorization.categorize()` (lexique pondéré existant) |
| Date | « 12 novembre 2026 », « 1er déc. », « 12/11 », « 2026-11-12 », « demain », « lundi prochain »… ; une date précédée de « avant le » ou « date limite » est traitée comme une échéance |
| Heure | « 14h30 », « 9 h », « 18:45 », « à midi » ; les durées (« pendant 3h ») sont ignorées |
| Lien | URL validée ; les liens Meet, Zoom, Teams, Webex et Jitsi sont prioritaires |
| Places | « 30 places », « limité à 12 », « capacité : 40 », « vingt places », « places illimitées » |
| Session liée | similarité **TF-IDF** (scikit-learn, déjà utilisé par les recommandations) entre le texte et le titre + la description des sessions planifiées ou en cours, avec bonus si le titre est cité ou si la date correspond |

Les chiffres contenus dans les liens sont masqués avant l'analyse des dates, heures
et places. Lorsqu'une session est appliquée, la date, l'heure et le lien encore vides
sont complétés depuis la session, comme lors d'une sélection manuelle.

## Résumés et ressources IA

Page **Summaries & resources** (barre latérale, tous les rôles), application Django `summaries`.

- **CRUD manuel** : résumés (titre, texte, notions clés) et ressources pédagogiques (lien web
  ou fichier PDF/audio/vidéo). Les contenus d'un enseignant ou d'un admin sont partagés avec
  tous ; ceux d'un étudiant sont des **notes privées**. Modification : l'auteur, l'enseignant
  propriétaire du cours ou un admin.
- **Génération automatique** (`GeminiService`) : Gemini lit le texte complet du cours (PDF ou
  transcription) et renvoie un JSON structuré (titre, synthèse en sections, 5 à 10 notions
  clés) enregistré dans PostgreSQL. Si un modèle est saturé, le suivant est essayé.
- **Illustration en 2 étapes** : Gemini rédige un prompt visuel à partir du résumé, puis
  `ImageGeneratorService` dessine l'image (Pollinations.ai, gratuit et sans clé ; ou un
  modèle d'image Gemini avec `SUMMARIES_IMAGE_PROVIDER=gemini` et une clé facturée). L'image
  est vérifiée avec Pillow, ré-encodée en JPEG et liée au résumé.
- **Assistant du cours (micro-RAG)** : chat sur la page du résumé ; Gemini répond avec le
  texte complet du cours et le résumé comme contexte, plus les derniers échanges.
  Chaque utilisateur ne voit que sa conversation.
- **Synthèse vocale** : lecteur Play/Pause/Stop avec vitesse, via la Web Speech API du
  navigateur (gratuit, rien n'est envoyé à un serveur), voix choisie selon la langue.
- **Limitation** : 60 appels IA par utilisateur et par heure (`SUMMARIES_AI_REQUESTS_PER_HOUR`).

| Méthode | Chemin | Description |
| --- | --- | --- |
| `GET/POST` | `/api/summaries/` | Liste (`?course=`, `?search=`) / création manuelle |
| `GET/PATCH/PUT/DELETE` | `/api/summaries/{id}/` | Détail, modification, suppression |
| `POST` | `/api/summaries/generate/` | Résumé + notions clés générés par Gemini (`course`) |
| `GET/POST/DELETE` | `/api/summaries/{id}/illustration/` | Voir, générer ou supprimer l'illustration |
| `GET/POST/DELETE` | `/api/summaries/{id}/chat/` | Historique, question à l'assistant, effacer |
| `GET/POST` | `/api/resources/` | Liste / ajout (`kind` = `link` ou `file`) |
| `GET/PATCH/PUT/DELETE` | `/api/resources/{id}/` | Détail, modification, suppression |
| `GET` | `/api/resources/{id}/file/` | Fichier de la ressource |

---

## Sécurité

- **Sessions et CSRF** : cookies de session `HttpOnly`, `SameSite=Lax` ; jeton CSRF
  transmis par en-tête pour les requêtes mutantes. Une requête non authentifiée
  renvoie **401** (et non 403), avec un corps JSON normalisé.
- **Mots de passe** : validateurs Django (longueur, similarité, mots de passe
  courants, entièrement numérique).
- **Inscription** : rôles `student` et `teacher` uniquement ; aucun auto-passage en
  administrateur.
- **Limitation de connexion** : 5 échecs par minute et par couple IP + email, puis
  réponse **429**. Le cache `LocMemCache` est **par processus** : cette protection
  convient au développement local. En production, configurez un cache partagé
  (Redis ou Memcached) pour un comportement cohérent entre workers.
- **Fichiers** : liste blanche d'extensions, contrôle MIME, vérification de la
  signature binaire, taille limitée, stockage privé et noms UUID.
- **En-têtes** : `X-Content-Type-Options: nosniff`, politique de référent
  `same-origin`, `X-Frame-Options: SAMEORIGIN` pour permettre l'affichage des PDF.
- **Administration** : accessible uniquement aux comptes `is_staff`.
- **Comptes** : la gestion des utilisateurs est réservée au rôle `admin` ; un
  administrateur ne peut ni changer son propre rôle, ni désactiver ou supprimer son
  compte, et le dernier administrateur actif est protégé. La suppression d'un compte
  entraîne celle de ses cours et de leurs fichiers, après confirmation explicite.

### Durcissement avant production

1. `DEBUG=False` et `ALLOWED_HOSTS` limité aux domaines réels.
2. `SECRET_KEY` unique, stockée hors du dépôt.
3. HTTPS obligatoire, `COOKIE_SECURE=True`, `CSRF_TRUSTED_ORIGINS` et
   `CORS_ALLOWED_ORIGINS` restreints.
4. Cache partagé pour la limitation des tentatives de connexion.
5. Reverse proxy servant le build frontend et transmettant `/api` à Django, sans
   exposer `Backend/media/`.
6. `seed_demo` reste désactivé (il refuse déjà de s'exécuter avec `DEBUG=False`).

---

## Tests et qualité

### Backend

La suite exige **PostgreSQL** (aucun repli SQLite). La base de test
`test_<DB_NAME>` est créée automatiquement : l'utilisateur PostgreSQL doit disposer
du droit `CREATEDB` (accordé au rôle `edumind` par la commande `CREATE USER`
ci-dessus).

```bash
cd Backend
source .venv/Scripts/activate
PYTHONUTF8=1 python manage.py check
PYTHONUTF8=1 python manage.py makemigrations --check --dry-run
PYTHONUTF8=1 python manage.py test
PYTHONUTF8=1 coverage run manage.py test
PYTHONUTF8=1 coverage report
PYTHONUTF8=1 coverage html        # rapport détaillé dans htmlcov/
```

Résultat actuel : **270 tests OK** sur les applications `accounts`, `courses`,
`announcements`, `sessions` et `assessments`. Le seuil minimal configuré dans
`.coveragerc` est de 85 %.

### Frontend

```bash
cd Frontend
npm run lint
npm test
npm run coverage
npm run build
```

Résultat actuel : **126 tests Vitest OK**, build de production réussi. ESLint
signale 14 erreurs historiques (`react-hooks/set-state-in-effect`) dans des pages
antérieures aux modules d'analyse. La couverture frontend n'a pas de seuil imposé ;
l'objectif de 85 % portait sur les applications backend `accounts` et `courses`.

### Audits Lighthouse

Audits réalisés sur le build de production (`npm run preview`) :

| Page | Accessibilité | Performance | SEO |
| --- | --- | --- | --- |
| Connexion (mobile et bureau) | 100 | 98–100 | 100 |
| Inscription | 100 | — | — |
| Dashboard (authentifié) | 100 | — | — |
| Catalogue (authentifié) | 100 | 100 | 63 (voir note) |
| Détail d'un cours | 100 | — | — |
| Formulaire de cours | 100 | — | — |

Notes :

- Les pages authentifiées sont volontairement bloquées par `robots.txt`
  (`/dashboard` et `/courses`), ce qui abaisse leur score SEO Lighthouse : le
  contenu privé ne doit pas être indexé.
- Le score « best practices » de la page de connexion est de 96 : le 401 initial de
  `GET /api/auth/me/` est attendu avant connexion.
- En mode headless, Chrome n'affiche pas le lecteur PDF intégré ; l'interface propose
  toujours « Ouvrir le PDF dans un nouvel onglet ».

---

## Accessibilité et expérience utilisateur

- Interface entièrement en français, avec `lang="fr"`.
- Structure de page avec lien d'évitement, repères `<main>` et titres hiérarchisés.
- Formulaires avec libellés explicites, messages d'erreur reliés aux champs et
  annonces `aria-live`.
- Navigation clavier complète, focus visible, piège de focus dans les modales.
- Contrastes WCAG AA, y compris les badges et les liens.
- Respect de `prefers-reduced-motion`.
- Mise en page responsive (catalogue, formulaires, lecteur audio/PDF).

### Panneau « Accessibility »

Un bouton **Accessibility** (barre latérale, en-tête mobile et pages de connexion)
ouvre un panneau de réglages appliqués immédiatement à **toute l'application** :

| Réglage | Effet |
| --- | --- |
| Taille du texte | Normale, grande (112,5 %) ou très grande (125 %) ; toute l'interface s'adapte (unités `rem`) |
| Contraste élevé | Textes plus foncés, bordures visibles, fonds blancs, focus plus épais |
| Lecture adaptée à la dyslexie | Police **OpenDyslexic** (embarquée localement), espacements et interlignage augmentés |
| Souligner les liens | Liens reconnaissables sans dépendre de la couleur |

Les réglages sont mémorisés dans le navigateur (`localStorage`) et appliqués avant
l'affichage de la page (script dans `index.html`) pour éviter tout clignotement. Le
panneau est une boîte de dialogue accessible : ouverture au clavier, focus piégé,
fermeture avec Échap, interrupteurs `role="switch"` et boutons radio pour la taille.
Vérifié avec **axe-core** (aucune violation WCAG A/AA dans chaque mode) ; code dans
`Frontend/src/components/accessibility/` et `Frontend/src/lib/accessibility.js`.

---

## Grille d'acceptation

| Exigence | État | Mise en œuvre |
| --- | --- | --- |
| Connexion par email et mot de passe | OK | `accounts` + pages React |
| Rôles et permissions | OK | Groupes Django, `CanManageCourse`, gardes de routes |
| Inscription sans compte admin | OK | `RegisterSerializer` limite les rôles |
| CRUD complet des cours | OK | `CourseViewSet`, pages catalogue/détail/éditeur |
| Téléversement PDF et audio | OK | Validateurs extension/MIME/signature/taille |
| Limite de 50 Mo configurable | OK | `MAX_UPLOAD_SIZE_MB` + `/api/config/` |
| Fichiers non publics | OK | Routes authentifiées, aucun `/media/` public |
| Recherche, filtre, tri, pagination | OK | DRF `SearchFilter`, `OrderingFilter`, pagination |
| Erreurs JSON homogènes | OK | Gestionnaire DRF + 404/500/CSRF |
| Gestion des comptes par l'admin | OK | API `users`, écran React, protections serveur |
| Suppression des comptes | OK | `DELETE` admin, cascade cours/fichiers, confirmation |
| Tests et couverture backend ≥ 85 % | OK | 270 tests |
| Tests frontend et lint | OK | 126 tests, build réussi |
| Accessibilité WCAG AA | OK | Audit Lighthouse 100 |
| Documentation en français | OK | Ce fichier |
| Absence de stubs hors périmètre | OK | Aucun écran ni endpoint factice |

---

## Dépannage

**`KeyError: 'SECRET_KEY'` au démarrage**
Le fichier `.env` est absent ou incomplet. Copiez `.env.example` vers `.env` et
renseignez une clé.

**Connexion PostgreSQL refusée**
Vérifiez que le service PostgreSQL 18 est démarré (`Get-Service postgresql-x64-18`
sous PowerShell) et qu'il écoute sur le port 5432. Contrôlez `DB_HOST`, `DB_PORT`
et `DB_NAME` dans `.env`. Vous pouvez aussi tester la connexion depuis pgAdmin.

**`password authentication failed for user "edumind"`**
Le mot de passe de `DB_PASSWORD` ne correspond pas à celui du rôle PostgreSQL.
Alignez les deux valeurs : mettez à jour `.env`, ou exécutez en tant que `postgres`
`ALTER USER edumind WITH PASSWORD '<mot_de_passe_local>';`.

**`permission denied to create database` pendant les tests**
Le rôle utilisé par Django doit pouvoir créer la base temporaire `test_edumind`.
Exécutez en tant que `postgres` : `ALTER USER edumind CREATEDB;`.

**Caractères accentués illisibles ou erreurs Unicode sous Windows**
Relancez la commande avec `PYTHONUTF8=1` (Git Bash) ou `$env:PYTHONUTF8=1`
(PowerShell).

**Erreur de version de Node.js**
Vite 8 exige Node.js 20.19+ ou 22.12+. Mettez Node à jour puis réinstallez les
dépendances avec `npm install`.

**403 CSRF dans le navigateur**
Ouvrez l'application via `http://localhost:5173`, vérifiez que
`CSRF_TRUSTED_ORIGINS` contient bien cette origine, puis rechargez la page pour
obtenir un nouveau jeton.

**401 sur `/api/auth/me/` à l'ouverture**
Comportement normal pour un visiteur non connecté : le frontend traite ce cas comme
un état « anonyme ».

---

## Feuille de route

Les fonctionnalités hors périmètre pourront être ajoutées sans refonte : le backend
est déjà découpé en applications (`accounts`, `courses`) et le frontend en modules
(`api`, `pages`, `components`). Les prochains chantiers naturels sont les quiz,
les parcours de formation, les statistiques et les fonctions d'IA.
