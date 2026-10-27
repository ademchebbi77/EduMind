"""Demo course catalogue created by ``manage.py seed_courses``.

Every lesson has real paragraphs so that the PDF text can be used by the
quiz generator, the summaries, the course chat and the recommendations.
"""

DEMO_CATEGORIES = (
    {
        "name": "Intelligence artificielle",
        "description": "Apprentissage automatique, réseaux de neurones et IA appliquée.",
        "color": "#4338ca",
    },
    {
        "name": "Développement web",
        "description": "Frontend, backend et API pour le web moderne.",
        "color": "#0f766e",
    },
    {
        "name": "Bases de données",
        "description": "Modélisation, SQL et performance des bases relationnelles.",
        "color": "#b45309",
    },
    {
        "name": "Data science",
        "description": "Analyse, nettoyage et visualisation de données.",
        "color": "#7c3aed",
    },
    {
        "name": "Génie logiciel",
        "description": "Méthodes, outils et bonnes pratiques pour livrer du logiciel de qualité.",
        "color": "#1d4ed8",
    },
    {
        "name": "Cybersécurité",
        "description": "Protéger les systèmes, les données et les utilisateurs.",
        "color": "#be123c",
    },
)

# Categories and metadata for the courses created by ``seed_demo``.
EXISTING_DEMO_COURSES = {
    "Introduction à l'apprentissage automatique": {
        "category": "Intelligence artificielle",
        "difficulty": "beginner",
        "tags": "machine learning, apprentissage supervisé, ia",
    },
    "Python pour l'intelligence artificielle": {
        "category": "Intelligence artificielle",
        "difficulty": "beginner",
        "tags": "python, numpy, ia",
    },
    "Podcast : l'IA dans l'éducation": {
        "category": "Intelligence artificielle",
        "difficulty": "beginner",
        "tags": "ia, éducation, éthique",
    },
    "Les réseaux de neurones expliqués": {
        "category": "Intelligence artificielle",
        "difficulty": "intermediate",
        "tags": "réseaux de neurones, deep learning, rétropropagation",
    },
}

DEMO_CATALOG = (
    {
        "title": "Développement web avec React",
        "description": (
            "Construisez des interfaces modernes avec React : composants, JSX, état, "
            "hooks, routage et communication avec une API REST."
        ),
        "category": "Développement web",
        "difficulty": "intermediate",
        "tags": "react, javascript, frontend, hooks",
        "max_students": 40,
        "lessons": (
            {
                "title": "Composants et JSX",
                "duration_minutes": 35,
                "sections": (
                    (
                        "Qu'est-ce qu'un composant ?",
                        (
                            "Un composant React est une fonction JavaScript qui retourne une "
                            "description de l'interface. Une application React est un arbre de "
                            "composants : chaque composant gère une petite partie de l'écran, "
                            "comme un bouton, un formulaire ou une page entière.",
                            "Les composants reçoivent des données par leurs props. Les props sont "
                            "en lecture seule : un composant ne modifie jamais ses props, il les "
                            "utilise pour décider de ce qu'il affiche.",
                        ),
                    ),
                    (
                        "La syntaxe JSX",
                        (
                            "JSX est une extension de JavaScript qui ressemble à du HTML. Le code "
                            "JSX est transformé en appels de fonctions par le compilateur, par "
                            "exemple Vite ou Babel. On utilise className à la place de class, et "
                            "les accolades permettent d'insérer une expression JavaScript.",
                            "Pour afficher une liste, on utilise la méthode map et on donne à "
                            "chaque élément une prop key unique et stable. La clé aide React à "
                            "savoir quels éléments ont changé entre deux rendus.",
                        ),
                    ),
                ),
            },
            {
                "title": "État et hooks",
                "duration_minutes": 45,
                "sections": (
                    (
                        "Le hook useState",
                        (
                            "L'état est une donnée qui appartient à un composant et qui peut "
                            "changer dans le temps. Le hook useState retourne la valeur actuelle "
                            "et une fonction pour la mettre à jour. Chaque mise à jour de l'état "
                            "provoque un nouveau rendu du composant.",
                            "Il ne faut jamais modifier l'état directement. Pour un objet ou un "
                            "tableau, on crée une nouvelle copie avec l'opérateur de décomposition, "
                            "puis on passe cette copie à la fonction de mise à jour.",
                        ),
                    ),
                    (
                        "Le hook useEffect",
                        (
                            "Le hook useEffect sert à synchroniser un composant avec un système "
                            "extérieur : un appel réseau, un minuteur ou un abonnement. Le tableau "
                            "de dépendances indique quand l'effet doit être relancé.",
                            "Un effet peut retourner une fonction de nettoyage. React l'appelle "
                            "avant de relancer l'effet et quand le composant disparaît, ce qui "
                            "évite les fuites de mémoire et les requêtes obsolètes.",
                        ),
                    ),
                ),
            },
            {
                "title": "Routage et appels API",
                "duration_minutes": 40,
                "sections": (
                    (
                        "React Router",
                        (
                            "React Router associe une adresse URL à un composant. Le composant "
                            "Routes contient des Route, chacune avec un chemin et un élément à "
                            "afficher. Le composant Link permet de naviguer sans recharger la page.",
                            "Les paramètres d'URL, comme l'identifiant d'un cours, sont lus avec "
                            "le hook useParams. Le hook useNavigate permet de rediriger "
                            "l'utilisateur après une action, par exemple après une connexion.",
                        ),
                    ),
                    (
                        "Communiquer avec une API",
                        (
                            "Une application React récupère ses données auprès d'une API REST avec "
                            "fetch ou axios. Il faut toujours gérer trois états : le chargement, "
                            "le succès et l'erreur, pour que l'utilisateur sache ce qui se passe.",
                            "Avec une authentification par session, le navigateur envoie le cookie "
                            "automatiquement. Les requêtes qui modifient des données doivent aussi "
                            "envoyer le jeton CSRF dans un en-tête.",
                        ),
                    ),
                ),
            },
        ),
    },
    {
        "title": "Créer une API REST avec Django",
        "description": (
            "Concevez une API REST sécurisée avec Django et Django REST Framework : "
            "modèles, sérialiseurs, vues, authentification et permissions."
        ),
        "category": "Développement web",
        "difficulty": "intermediate",
        "tags": "django, python, api rest, backend",
        "max_students": 35,
        "lessons": (
            {
                "title": "Modèles et migrations",
                "duration_minutes": 40,
                "sections": (
                    (
                        "L'ORM de Django",
                        (
                            "Un modèle Django est une classe Python qui décrit une table de la "
                            "base de données. Chaque attribut, comme CharField ou ForeignKey, "
                            "devient une colonne. L'ORM permet de lire et d'écrire des données "
                            "sans écrire de SQL.",
                            "Une ForeignKey crée une relation plusieurs-à-un. L'option on_delete "
                            "indique ce qui se passe quand l'objet lié est supprimé : CASCADE "
                            "supprime aussi les objets dépendants, SET_NULL vide la relation.",
                        ),
                    ),
                    (
                        "Les migrations",
                        (
                            "Une migration est un fichier qui décrit une modification du schéma "
                            "de la base. La commande makemigrations crée ces fichiers à partir "
                            "des modèles, et la commande migrate les applique à la base.",
                            "Les migrations sont versionnées avec le code. Chaque membre de "
                            "l'équipe applique les mêmes migrations, ce qui garantit que toutes "
                            "les bases ont la même structure.",
                        ),
                    ),
                ),
            },
            {
                "title": "Sérialiseurs et vues",
                "duration_minutes": 50,
                "sections": (
                    (
                        "Les sérialiseurs",
                        (
                            "Un sérialiseur convertit des objets Python en JSON et valide les "
                            "données reçues. Le ModelSerializer génère automatiquement les champs "
                            "à partir d'un modèle et fournit les méthodes create et update.",
                            "La validation se fait champ par champ avec les méthodes validate_nom, "
                            "puis globalement avec la méthode validate. Une erreur de validation "
                            "produit une réponse 400 avec le détail des champs invalides.",
                        ),
                    ),
                    (
                        "Les ViewSets",
                        (
                            "Un ViewSet regroupe les actions d'une ressource : list, retrieve, "
                            "create, update et destroy. Un routeur génère automatiquement les "
                            "URL correspondantes. Le décorateur action ajoute des routes "
                            "personnalisées, comme une route de génération ou d'export.",
                            "La méthode get_queryset filtre les objets visibles selon "
                            "l'utilisateur connecté. C'est une protection essentielle pour "
                            "qu'un étudiant ne voie jamais les données d'un autre.",
                        ),
                    ),
                ),
            },
            {
                "title": "Authentification et permissions",
                "duration_minutes": 45,
                "sections": (
                    (
                        "Authentification",
                        (
                            "L'authentification consiste à vérifier l'identité d'un utilisateur. "
                            "Django propose une authentification par session : après la connexion, "
                            "un cookie de session identifie l'utilisateur à chaque requête.",
                            "La protection CSRF empêche un site malveillant d'envoyer une requête "
                            "à la place de l'utilisateur. Le client lit le cookie csrftoken et le "
                            "renvoie dans l'en-tête X-CSRFToken.",
                        ),
                    ),
                    (
                        "Permissions",
                        (
                            "L'autorisation consiste à décider ce qu'un utilisateur a le droit de "
                            "faire. Dans Django REST Framework, une classe de permission retourne "
                            "vrai ou faux pour une requête et éventuellement pour un objet.",
                            "Une bonne pratique est le principe du moindre privilège : chaque rôle, "
                            "étudiant, enseignant ou administrateur, reçoit uniquement les droits "
                            "nécessaires à ses tâches.",
                        ),
                    ),
                ),
            },
        ),
    },
    {
        "title": "Bases de données relationnelles et SQL",
        "description": (
            "Apprenez à modéliser des données et à les interroger avec SQL : tables, clés, "
            "jointures, agrégations, normalisation et index."
        ),
        "category": "Bases de données",
        "difficulty": "beginner",
        "tags": "sql, postgresql, modélisation, bases de données",
        "max_students": 50,
        "lessons": (
            {
                "title": "Le modèle relationnel",
                "duration_minutes": 30,
                "sections": (
                    (
                        "Tables, lignes et colonnes",
                        (
                            "Une base de données relationnelle organise les données en tables. "
                            "Chaque ligne représente un enregistrement et chaque colonne un "
                            "attribut avec un type précis, comme un entier, un texte ou une date.",
                            "La clé primaire est une colonne qui identifie chaque ligne de façon "
                            "unique. La clé étrangère est une colonne qui fait référence à la clé "
                            "primaire d'une autre table et crée ainsi une relation.",
                        ),
                    ),
                    (
                        "Les types de relations",
                        (
                            "Une relation un-à-plusieurs relie par exemple un enseignant à ses "
                            "cours. Une relation plusieurs-à-plusieurs, comme entre étudiants et "
                            "cours, nécessite une table d'association, ici la table des inscriptions.",
                        ),
                    ),
                ),
            },
            {
                "title": "Requêtes SELECT et jointures",
                "duration_minutes": 45,
                "sections": (
                    (
                        "Interroger une table",
                        (
                            "La requête SELECT lit des données. La clause WHERE filtre les lignes, "
                            "ORDER BY trie les résultats et LIMIT restreint leur nombre. Les "
                            "fonctions d'agrégation COUNT, SUM et AVG résument plusieurs lignes.",
                            "La clause GROUP BY regroupe les lignes qui partagent une valeur, par "
                            "exemple pour compter les inscrits de chaque cours. La clause HAVING "
                            "filtre ensuite les groupes.",
                        ),
                    ),
                    (
                        "Les jointures",
                        (
                            "Une jointure combine les lignes de deux tables. INNER JOIN garde "
                            "uniquement les lignes qui ont une correspondance dans les deux tables. "
                            "LEFT JOIN garde toutes les lignes de la table de gauche, même sans "
                            "correspondance.",
                        ),
                    ),
                ),
            },
            {
                "title": "Normalisation et index",
                "duration_minutes": 35,
                "sections": (
                    (
                        "La normalisation",
                        (
                            "La normalisation est une méthode qui réduit la redondance des données. "
                            "La première forme normale impose des valeurs atomiques. La deuxième et "
                            "la troisième forme normale éliminent les dépendances partielles et "
                            "transitives.",
                        ),
                    ),
                    (
                        "Les index",
                        (
                            "Un index est une structure, souvent un arbre B, qui accélère la "
                            "recherche dans une colonne. Il rend les lectures plus rapides mais "
                            "ralentit légèrement les insertions et occupe de l'espace disque.",
                            "On crée un index sur les colonnes utilisées dans les filtres et les "
                            "jointures. La commande EXPLAIN montre le plan d'exécution et indique "
                            "si un index est utilisé.",
                        ),
                    ),
                ),
            },
        ),
    },
    {
        "title": "Analyse de données avec Pandas",
        "description": (
            "Chargez, nettoyez, transformez et visualisez des données avec Python, "
            "Pandas et Matplotlib."
        ),
        "category": "Data science",
        "difficulty": "intermediate",
        "tags": "pandas, python, data science, visualisation",
        "max_students": 40,
        "lessons": (
            {
                "title": "Series et DataFrame",
                "duration_minutes": 35,
                "sections": (
                    (
                        "Les structures de Pandas",
                        (
                            "Pandas est une bibliothèque Python dédiée à l'analyse de données. Une "
                            "Series est un tableau à une dimension avec un index. Un DataFrame est "
                            "un tableau à deux dimensions dont chaque colonne est une Series.",
                            "La fonction read_csv charge un fichier CSV dans un DataFrame. Les "
                            "méthodes head, info et describe donnent un premier aperçu des données "
                            "et de leurs statistiques.",
                        ),
                    ),
                    (
                        "Sélectionner des données",
                        (
                            "L'accesseur loc sélectionne par étiquette et l'accesseur iloc par "
                            "position. Une condition booléenne, comme df[df['note'] > 10], filtre "
                            "les lignes qui respectent un critère.",
                        ),
                    ),
                ),
            },
            {
                "title": "Nettoyage des données",
                "duration_minutes": 40,
                "sections": (
                    (
                        "Valeurs manquantes et doublons",
                        (
                            "Les données réelles contiennent souvent des valeurs manquantes. La "
                            "méthode isna les détecte, dropna supprime les lignes incomplètes et "
                            "fillna remplace les valeurs manquantes par une valeur choisie.",
                            "La méthode drop_duplicates supprime les doublons. Il faut aussi "
                            "vérifier les types avec astype et corriger les formats de dates avec "
                            "to_datetime.",
                        ),
                    ),
                    (
                        "Valeurs aberrantes",
                        (
                            "Une valeur aberrante est une observation très éloignée des autres. "
                            "On peut la détecter avec l'écart interquartile ou un diagramme en "
                            "boîte, puis décider de la corriger, de la garder ou de l'exclure.",
                        ),
                    ),
                ),
            },
            {
                "title": "Agrégation et visualisation",
                "duration_minutes": 45,
                "sections": (
                    (
                        "Grouper et agréger",
                        (
                            "La méthode groupby regroupe les lignes par catégorie, puis une "
                            "fonction comme mean ou count calcule un résultat par groupe. La "
                            "méthode pivot_table produit un tableau croisé dynamique.",
                        ),
                    ),
                    (
                        "Visualiser",
                        (
                            "Matplotlib et Seaborn transforment un DataFrame en graphique. Un "
                            "histogramme montre une distribution, un nuage de points une relation "
                            "entre deux variables et un diagramme en barres une comparaison.",
                            "Un bon graphique a un titre, des axes nommés avec leurs unités et une "
                            "légende lisible. Il répond à une seule question précise.",
                        ),
                    ),
                ),
            },
        ),
    },
    {
        "title": "Git et GitHub pour le travail en équipe",
        "description": (
            "Versionnez votre code, travaillez en branches, relisez avec les pull requests "
            "et automatisez les vérifications avec l'intégration continue."
        ),
        "category": "Génie logiciel",
        "difficulty": "beginner",
        "tags": "git, github, collaboration, ci",
        "max_students": None,
        "lessons": (
            {
                "title": "Les bases de Git",
                "duration_minutes": 30,
                "sections": (
                    (
                        "Dépôt et commits",
                        (
                            "Git est un système de gestion de versions distribué. Un dépôt contient "
                            "tout l'historique du projet. Un commit est un instantané des fichiers, "
                            "accompagné d'un message qui explique la modification.",
                            "Le cycle de travail est simple : on modifie des fichiers, on les "
                            "ajoute à l'index avec git add, puis on enregistre un commit avec "
                            "git commit. La commande git status montre l'état actuel.",
                        ),
                    ),
                    (
                        "Le fichier .gitignore",
                        (
                            "Le fichier .gitignore liste les fichiers que Git doit ignorer, comme "
                            "les dépendances installées ou le fichier .env. Un secret, par exemple "
                            "une clé d'API, ne doit jamais être commité.",
                        ),
                    ),
                ),
            },
            {
                "title": "Branches et fusions",
                "duration_minutes": 35,
                "sections": (
                    (
                        "Travailler en branches",
                        (
                            "Une branche est une ligne de développement indépendante. Chaque "
                            "fonctionnalité est développée dans sa propre branche, ce qui laisse la "
                            "branche principale stable.",
                            "La fusion, ou merge, intègre les commits d'une branche dans une autre. "
                            "Un conflit apparaît quand deux branches modifient les mêmes lignes ; "
                            "il faut alors choisir manuellement la bonne version.",
                        ),
                    ),
                ),
            },
            {
                "title": "Pull requests et intégration continue",
                "duration_minutes": 40,
                "sections": (
                    (
                        "La revue de code",
                        (
                            "Une pull request propose de fusionner une branche. Les membres de "
                            "l'équipe relisent le code, laissent des commentaires et approuvent la "
                            "modification avant la fusion.",
                        ),
                    ),
                    (
                        "L'intégration continue",
                        (
                            "L'intégration continue exécute automatiquement les tests, le linter et "
                            "le build à chaque push. GitHub Actions décrit ces étapes dans un "
                            "fichier YAML placé dans le dossier .github/workflows.",
                            "Un outil d'analyse comme SonarQube mesure la qualité du code : bugs, "
                            "vulnérabilités, duplication et couverture des tests.",
                        ),
                    ),
                ),
            },
        ),
    },
    {
        "title": "Docker et déploiement d'applications",
        "description": (
            "Conteneurisez une application web, orchestrez plusieurs services avec Docker "
            "Compose et préparez un déploiement fiable."
        ),
        "category": "Génie logiciel",
        "difficulty": "advanced",
        "tags": "docker, devops, déploiement, conteneurs",
        "max_students": 30,
        "lessons": (
            {
                "title": "Images et conteneurs",
                "duration_minutes": 40,
                "sections": (
                    (
                        "Concepts clés",
                        (
                            "Docker est une plateforme qui exécute des applications dans des "
                            "conteneurs. Une image est un modèle en lecture seule qui contient "
                            "l'application et ses dépendances. Un conteneur est une instance en "
                            "cours d'exécution d'une image.",
                            "Le Dockerfile décrit la construction d'une image, instruction par "
                            "instruction : FROM choisit l'image de base, COPY ajoute des fichiers, "
                            "RUN exécute une commande et CMD définit le processus principal.",
                        ),
                    ),
                    (
                        "Bonnes pratiques",
                        (
                            "On copie d'abord le fichier des dépendances pour profiter du cache "
                            "des couches. On exécute l'application avec un utilisateur non root et "
                            "on exclut les fichiers inutiles avec .dockerignore.",
                        ),
                    ),
                ),
            },
            {
                "title": "Docker Compose",
                "duration_minutes": 40,
                "sections": (
                    (
                        "Plusieurs services",
                        (
                            "Docker Compose décrit une application composée de plusieurs services "
                            "dans un fichier YAML : par exemple une base PostgreSQL, un cache "
                            "Redis, une API Django et un frontend servi par Nginx.",
                            "Les services communiquent par leur nom sur un réseau commun. Les "
                            "volumes conservent les données, comme la base de données, même quand "
                            "les conteneurs sont recréés.",
                        ),
                    ),
                ),
            },
            {
                "title": "Déployer en production",
                "duration_minutes": 45,
                "sections": (
                    (
                        "Configuration",
                        (
                            "En production, la configuration passe par des variables "
                            "d'environnement : clé secrète, adresse de la base, hôtes autorisés. "
                            "Le mode debug doit être désactivé et le trafic doit passer en HTTPS.",
                        ),
                    ),
                    (
                        "Surveillance",
                        (
                            "Un contrôle de santé, ou healthcheck, vérifie régulièrement que "
                            "l'application répond. Les journaux et des outils comme Prometheus et "
                            "Grafana aident à détecter les problèmes avant les utilisateurs.",
                        ),
                    ),
                ),
            },
        ),
    },
    {
        "title": "Introduction à la cybersécurité",
        "description": (
            "Comprenez les principes de la sécurité informatique, les attaques les plus "
            "courantes et les bonnes pratiques pour protéger une application web."
        ),
        "category": "Cybersécurité",
        "difficulty": "beginner",
        "tags": "sécurité, owasp, web, mots de passe",
        "max_students": 45,
        "lessons": (
            {
                "title": "Les principes de la sécurité",
                "duration_minutes": 30,
                "sections": (
                    (
                        "La triade CIA",
                        (
                            "La sécurité de l'information repose sur trois propriétés. La "
                            "confidentialité garantit que seules les personnes autorisées accèdent "
                            "aux données. L'intégrité garantit que les données ne sont pas "
                            "modifiées sans autorisation. La disponibilité garantit que le service "
                            "reste accessible.",
                            "La défense en profondeur consiste à empiler plusieurs protections "
                            "indépendantes, pour qu'une seule faille ne suffise pas à compromettre "
                            "le système.",
                        ),
                    ),
                ),
            },
            {
                "title": "Les attaques courantes",
                "duration_minutes": 45,
                "sections": (
                    (
                        "Attaques contre les applications web",
                        (
                            "L'injection SQL consiste à insérer du code SQL dans un champ de "
                            "saisie. On s'en protège avec des requêtes paramétrées ou un ORM. Le "
                            "cross-site scripting, ou XSS, injecte du JavaScript dans une page ; "
                            "on s'en protège en échappant les données affichées.",
                            "Le CSRF force un utilisateur connecté à envoyer une requête qu'il n'a "
                            "pas voulue. Un jeton CSRF vérifié par le serveur bloque cette attaque.",
                        ),
                    ),
                    (
                        "Attaques contre les utilisateurs",
                        (
                            "L'hameçonnage, ou phishing, imite un site ou un message de confiance "
                            "pour voler des identifiants. La force brute essaie de nombreux mots de "
                            "passe ; on la limite en bloquant temporairement les tentatives répétées.",
                        ),
                    ),
                ),
            },
            {
                "title": "Bonnes pratiques",
                "duration_minutes": 35,
                "sections": (
                    (
                        "Protéger les comptes et les secrets",
                        (
                            "Les mots de passe ne sont jamais stockés en clair : ils sont hachés "
                            "avec un algorithme lent comme PBKDF2 ou Argon2. L'authentification à "
                            "deux facteurs ajoute une protection supplémentaire.",
                            "Les clés d'API et les mots de passe de base de données restent dans "
                            "des variables d'environnement et ne sont jamais publiés dans le code "
                            "source.",
                        ),
                    ),
                    (
                        "Mettre à jour et surveiller",
                        (
                            "Les dépendances doivent être mises à jour régulièrement, car les "
                            "failles connues sont rapidement exploitées. Les journaux de sécurité "
                            "permettent de détecter une activité suspecte.",
                        ),
                    ),
                ),
            },
        ),
    },
    {
        "title": "Algorithmique et structures de données",
        "description": (
            "Analysez la complexité des algorithmes et choisissez les bonnes structures : "
            "tableaux, listes, piles, files, arbres et algorithmes de tri."
        ),
        "category": "Génie logiciel",
        "difficulty": "intermediate",
        "tags": "algorithmique, complexité, tri, structures de données",
        "max_students": 60,
        "lessons": (
            {
                "title": "La complexité des algorithmes",
                "duration_minutes": 40,
                "sections": (
                    (
                        "La notation grand O",
                        (
                            "La complexité mesure comment le temps d'exécution d'un algorithme "
                            "évolue avec la taille des données. La notation grand O décrit le pire "
                            "cas. Une recherche dans un tableau non trié est en O(n), une recherche "
                            "dichotomique en O(log n).",
                            "Une double boucle sur les mêmes données est généralement en O(n²). "
                            "Pour de grandes quantités de données, la différence entre O(n log n) "
                            "et O(n²) devient énorme.",
                        ),
                    ),
                ),
            },
            {
                "title": "Piles, files et listes",
                "duration_minutes": 35,
                "sections": (
                    (
                        "Structures linéaires",
                        (
                            "Une pile suit le principe LIFO : le dernier élément ajouté est le "
                            "premier retiré. Elle sert par exemple à gérer l'historique d'annulation "
                            "ou les appels de fonctions.",
                            "Une file suit le principe FIFO : le premier élément ajouté est le "
                            "premier retiré, comme une file d'attente. Une liste chaînée relie des "
                            "nœuds par des pointeurs, ce qui rend l'insertion rapide.",
                        ),
                    ),
                    (
                        "Les tables de hachage",
                        (
                            "Une table de hachage associe une clé à une valeur grâce à une fonction "
                            "de hachage. La recherche, l'insertion et la suppression se font en "
                            "temps constant en moyenne. Le dictionnaire Python en est un exemple.",
                        ),
                    ),
                ),
            },
            {
                "title": "Algorithmes de tri",
                "duration_minutes": 45,
                "sections": (
                    (
                        "Trier efficacement",
                        (
                            "Le tri par insertion est simple et efficace pour de petites listes, "
                            "mais il est en O(n²). Le tri fusion divise la liste en deux, trie "
                            "chaque moitié puis fusionne les résultats ; il est en O(n log n).",
                            "Le tri rapide choisit un pivot et sépare les éléments plus petits et "
                            "plus grands. Il est très rapide en moyenne, mais son pire cas est en "
                            "O(n²) si le pivot est mal choisi.",
                        ),
                    ),
                ),
            },
        ),
    },
    {
        "title": "Apprentissage profond et vision par ordinateur",
        "description": (
            "Découvrez les réseaux de neurones convolutifs, leur architecture et les "
            "techniques pour les entraîner sur des images."
        ),
        "category": "Intelligence artificielle",
        "difficulty": "advanced",
        "tags": "deep learning, cnn, vision, réseaux de neurones",
        "max_students": 25,
        "lessons": (
            {
                "title": "Les convolutions",
                "duration_minutes": 40,
                "sections": (
                    (
                        "Pourquoi des convolutions ?",
                        (
                            "Une image est une grille de pixels. Un réseau de neurones convolutif, "
                            "ou CNN, applique de petits filtres qui glissent sur l'image pour "
                            "détecter des motifs locaux, comme des contours ou des textures.",
                            "Le partage des poids réduit fortement le nombre de paramètres : le "
                            "même filtre est utilisé à chaque position de l'image.",
                        ),
                    ),
                    (
                        "Le pooling",
                        (
                            "Le pooling réduit la taille des cartes de caractéristiques. Le max "
                            "pooling garde la valeur maximale de chaque zone, ce qui rend le réseau "
                            "plus robuste aux petits décalages.",
                        ),
                    ),
                ),
            },
            {
                "title": "Architecture d'un CNN",
                "duration_minutes": 45,
                "sections": (
                    (
                        "Empiler les couches",
                        (
                            "Un CNN enchaîne des couches de convolution, des fonctions "
                            "d'activation ReLU et des couches de pooling. Les premières couches "
                            "détectent des formes simples, les couches profondes des objets entiers.",
                            "À la fin, des couches entièrement connectées et une fonction softmax "
                            "produisent une probabilité pour chaque classe.",
                        ),
                    ),
                    (
                        "L'apprentissage par transfert",
                        (
                            "L'apprentissage par transfert réutilise un réseau déjà entraîné sur un "
                            "grand jeu de données, comme ImageNet. On remplace seulement les "
                            "dernières couches, ce qui demande beaucoup moins de données.",
                        ),
                    ),
                ),
            },
            {
                "title": "Entraîner et évaluer",
                "duration_minutes": 50,
                "sections": (
                    (
                        "Éviter le surapprentissage",
                        (
                            "Le surapprentissage apparaît quand le modèle mémorise les données "
                            "d'entraînement au lieu de généraliser. Le dropout, l'augmentation de "
                            "données et l'arrêt précoce limitent ce problème.",
                        ),
                    ),
                    (
                        "Évaluer un modèle",
                        (
                            "On sépare les données en ensembles d'entraînement, de validation et de "
                            "test. La précision, le rappel et la matrice de confusion montrent les "
                            "classes que le modèle confond.",
                        ),
                    ),
                ),
            },
        ),
    },
)

# Demo student enrollments: course title -> number of completed lessons.
DEMO_ENROLLMENTS = {
    "Développement web avec React": 2,
    "Bases de données relationnelles et SQL": 3,
    "Git et GitHub pour le travail en équipe": 1,
    "Introduction à la cybersécurité": 0,
}
