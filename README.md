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
- Tests automatisés backend et frontend, couverture mesurée.

### Hors périmètre (volontairement absent)

Aucun stub ni écran factice n'a été ajouté pour les fonctionnalités suivantes, qui
pourront être développées dans des applications Django séparées :

- fonctionnalités d'intelligence artificielle ;
- quiz et évaluations ;
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
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Hôtes autorisés |
| `CSRF_TRUSTED_ORIGINS` | `http://localhost:5173` | Origines autorisées pour le CSRF |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Origines autorisées pour l'API |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `edumind` / `edumind` / mot de passe local | Identifiants PostgreSQL |
| `DB_HOST` / `DB_PORT` | `localhost` / `5432` | Connexion PostgreSQL locale |
| `MAX_UPLOAD_SIZE_MB` | `50` | Taille maximale d'un fichier de cours |
| `AVATAR_MAX_SIZE_MB` | `5` | Taille maximale d'une photo de profil |
| `COOKIE_SECURE` | `False` | Cookies `Secure` (obligatoire derrière HTTPS) |
| `LOGIN_THROTTLE_ATTEMPTS` | `5` | Échecs autorisés par fenêtre |
| `LOGIN_THROTTLE_WINDOW_SECONDS` | `60` | Durée de la fenêtre de limitation |

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

Résultat actuel : **93 tests OK**, **92 % de couverture** (branches incluses) sur
`accounts` et `courses`. Le seuil minimal configuré dans `.coveragerc` est de 85 %.
La suite dure environ 70 secondes.

### Frontend

```bash
cd Frontend
npm run lint
npm test
npm run coverage
npm run build
```

Résultat actuel : **ESLint sans erreur**, **44 tests Vitest OK**, build de production
réussi. La couverture frontend n'a pas de seuil imposé ; l'objectif de 85 % portait
sur les applications backend `accounts` et `courses`.

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
| Tests et couverture backend ≥ 85 % | OK | 143 tests, 93 % |
| Tests frontend et lint | OK | 74 tests, ESLint sans erreur |
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
