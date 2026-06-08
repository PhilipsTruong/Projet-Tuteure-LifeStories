# Documentation Technique - LifeStories

## 1. Architecture et Stack Technologique
L'application est une Single Page Application (SPA) basée sur des technologies web modernes et légères pour assurer des performances optimales et une compatibilité hors-ligne.
- **Framework / Bundler :** Vite (pour un démarrage serveur rapide et un build optimisé).
- **Moteur de Formulaire :** Enketo Core (pour le rendu HTML/XML interactif du standard XForms généré par KoboToolbox).
- **Bibliothèque de Visualisation :** Vis-timeline (pour le rendu du calendrier des trajectoires).
- **Gestionnaire de Mise en Page :** Split.js (pour gérer les panneaux redimensionnables entre le formulaire et la timeline).

## 2. Structure des Fichiers Clés
- `index.html` : Contient la structure globale du DOM (panneau gauche `#questionnaire`, panneau droit `#trajectories`), ainsi que la configuration CSS injectée (design moderne "Premium", variables de couleurs, scrollbars customisées).
- `src/main.js` : Le cœur logique de l'application. Ce script initialise Enketo, configure la timeline, parse le modèle XML en temps réel et implémente toute la logique métier de synchronisation.
- `output_model.xml` : Le modèle de données XML natif (généré depuis KoboToolbox). Il sert de base de structure pour Enketo.
- `semantic_model.json` : Fichier de configuration sémantique crucial. Il relie les variables brutes du questionnaire XML (ex: `Q_commune_n`) à des éléments visuels structurés en "Trajectoires" et "Attributs" sur la timeline.

## 3. Logique de Traitement Principal (main.js)

### 3.1. Parsing et Écoute des Événements
Le script écoute les événements `change` et `input` sur le formulaire DOM (`formEl`). À chaque modification par l'utilisateur, la fonction `updateTimeline()` est déclenchée. Elle récupère la chaîne XML à jour via `form.getDataStr()` et la parse en `DOMParser` XML pour la manipulation.

### 3.2. Mécanisme de Fallback (Calcul des Dates & Valeurs)
Les enquêtes biographiques exigent souvent l'âge d'un événement au lieu de sa date précise.
- **Dates :** Si le nœud de date principal (ex: `SD_cn`) est vide, le système fouille dans les nœuds enfants du même groupe. S'il détecte un champ d'âge (ex: `age_arrivee...`), il calcule l'année exacte via la formule : `Année de début = Année de naissance + Âge entré`.
- **Valeurs (Content Fallback) :** Si la valeur cible est vide (fréquent avec les menus déroulants Kobo), le code scanne les éléments du groupe pour y déceler la première chaîne de caractères textuelle saisie en excluant les ID et codes régionaux (`d_`, `id_`).
- **Nettoyage (formatLabel) :** Les préfixes internes (ex: `A_`, `T_`) sont ignorés via une expression régulière, et les labels sont automatiquement formatés en Title Case pour un affichage propre sur l'UI.

### 3.3. Post-Processing et Blocs Continus (Ranges)
Pour représenter correctement les durées de vie :
1. Les éléments (items) créés sont regroupés par identifiant d'attribut (ex: `Commune`).
2. Ils sont ensuite triés par ordre chronologique selon leur date de début.
3. Le script assigne automatiquement la date de début de l'élément *n+1* comme date de fin de l'élément *n*.
4. Le dernier élément d'un groupe se voit attribuer la date du jour (`new Date()`) comme fin, produisant ainsi des blocs graphiques parfaitement contigus sans trous injustifiés.

### 3.4. Outil "Synthèse"
La logique de la synthèse repose sur l'événement `timechange` de la bibliothèque vis-timeline.
- La barre verticale (Custom Time Bar) retourne un temps `snappedTime` (qui s'accroche dynamiquement à une grille).
- Une boucle vérifie la présence de chevauchement entre ce temps et le début/fin de tous les éléments de la timeline (`snappedTime >= itemStart && snappedTime <= itemEnd`).
- Si une collision est détectée :
  - La classe `.highlight` est ajoutée à l'élément sur la timeline (pour un feedback visuel immédiat).
  - Un bloc HTML stylisé (une carte de Synthèse) est injecté à la volée dans le conteneur DOM `#moreInfos`.

## 4. Installation et Commandes
Pour déployer et développer le projet localement :
1. Installer Node.js.
2. Lancer l'installation des dépendances dans le répertoire racine :
   ```bash
   npm install
   ```
3. Démarrer le serveur de développement (Vite inclut le hot-reload) :
   ```bash
   npm run dev
   ```
4. Construire l'application pour la production (génère un dossier `/dist`) :
   ```bash
   npm run build
   ```
