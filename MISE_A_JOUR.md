# Mise à jour hebdomadaire d'Insta Magasins

Instructions suivies par la tâche planifiée « Mise à jour Insta Magasins ».

Le site (statistiques Instagram de deux magasins à Nice) est hébergé sur Vercel depuis ce dépôt, branche `claude/exciting-darwin-jm5s48` : chaque push redéploie le site.

## Fichiers
- `index.html` : page statique autonome. Toutes les données sont dans `<script id="data" type="application/json">…</script>` (un seul objet JSON sur une ligne). Ne touche pas au reste de la page (CSS, JS, structure).
- `data.json` : copie lisible (indentée, 1 espace) du même objet JSON. Les deux doivent rester identiques.

## Étapes
1. Travaille sur la branche `claude/exciting-darwin-jm5s48`. Lis `data.json` pour connaître le schéma exact et le ton des textes actuels.
2. Fenêtre : les 30 derniers jours complets se terminant hier (heure de Paris), et la période de 30 jours précédente pour la comparaison. Utilise `get_today` de Supermetrics pour les dates.
3. Récupère les données avec le connecteur Supermetrics (outil `instagram_insights`, ds_id `IGI`). Comptes : netto.temple = `17841432089005834`, intermarche.cessole = `17841444946262250`. Utilise `field_discovery` pour les ID de champs ; n'invente jamais un ID ni une valeur. Il te faut, pour chaque magasin :
   - `followers`, `mediaCount` (valeurs actuelles du profil) ;
   - `daily` : une ligne par jour de la fenêtre avec `date`, `followers` (nouveaux abonnés du jour, `null` si Instagram ne le fournit pas, c'est le cas sous 100 abonnés), `reach`, `views`, `engaged` (comptes ayant interagi) ;
   - `compare` : totaux `views`/`engaged` sur la fenêtre et `viewsPrev`/`engagedPrev` sur la période précédente ;
   - `posts` : les publications du fil (Reel, Photo, Carrousel), triées par vues décroissantes, avec `id`, `time` (« AAAA-MM-JJ HH:MM », heure de Paris), `format`, `title` (titre court en français tiré de la légende ; « Photo sans légende (JJ mois) » s'il n'y en a pas), `views`, `reach`, `interactions`, `likes`, `comments`, `saves`, `shares`, `link`, `watch` (temps de visionnage moyen en secondes, Reels seulement, sinon null) et `skip` (taux de passage en %, Reels seulement, sinon null). Publications des 2 derniers mois environ ;
   - `audience` : `hours` (24 valeurs, abonnés en ligne par heure, heure de Paris), `ages` ([tranche, nombre]), `cities` (8 premières [ville, nombre]), ou `null` si Instagram ne les fournit pas (moins de 100 abonnés).
   Garde inchangés `id`, `name`, `handle`, `place`, `brand` de chaque magasin, et `source`.
4. Mets à jour `updated` (date du jour) et `period` (`start`/`end`).
5. Réécris pour chaque magasin, à partir des nouveaux chiffres uniquement, `summary` (4 constats courts) et `recos` (5 à 7 paires [titre, explication]), en français, tutoiement, même style concret que les textes actuels. Chaque affirmation doit être vérifiable dans les données.
6. Écris `data.json` (indenté, `ensure_ascii=False`) et remplace le contenu du `<script id="data">` d'`index.html` par le même JSON sur une ligne (`json.dumps(..., ensure_ascii=False)`). Vérifie que `index.html` s'ouvre sans erreur JavaScript (Playwright : charge `file://…/index.html`, aucun `pageerror`, le `h1` affiche un nom de magasin).
7. Commit (« Mise à jour des statistiques au JJ/MM/AAAA ») et `git push -u origin claude/exciting-darwin-jm5s48`. Pas de pull request, aucune autre branche.

## En cas de problème
Si le connecteur Supermetrics n'est pas disponible, demande une reconnexion, ou si un compte ne renvoie aucune donnée : ne pousse rien de partiel ou d'inventé. Arrête-toi et explique clairement ce qui bloque et comment le corriger.

Termine par un résumé de 2-3 lignes : période couverte, vues et abonnés de chaque magasin, commit poussé.
