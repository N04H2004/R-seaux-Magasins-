# Mise à jour hebdomadaire de Mes Réseaux

Instructions suivies par la tâche planifiée « MAJ Magasins ».

Le site (statistiques Instagram de deux magasins à Nice) est hébergé sur Vercel depuis ce dépôt, branche `claude/exciting-darwin-jm5s48` : chaque push redéploie le site.

## Fichiers
- `data.json` : toutes les données des statistiques (JSON indenté, 1 espace). C'est le seul fichier que tu modifies. L'appli est protégée par une connexion : `index.html` ne contient plus aucune donnée, elle les charge depuis `/api/data`, qui lit `data.json`. Ne touche pas à `index.html`, ni aux dossiers `api/` et `assets/`.

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
4bis. Mets à jour la **note du mois** de chaque magasin (tableau `months`, voir la section « Note du mois » plus bas).
5. Réécris pour chaque magasin, à partir des nouveaux chiffres uniquement, `summary` (4 constats courts) et `recos` (5 à 7 paires [titre, explication]), en français, tutoiement, même style concret que les textes actuels. Chaque affirmation doit être vérifiable dans les données.
6. Écris `data.json` (indenté, `ensure_ascii=False`), puis lance `node scripts/check-data.js` : il doit afficher « data.json OK ». S'il signale un problème, corrige `data.json` et relance.
7. Commit (« Mise à jour des statistiques au JJ/MM/AAAA ») et `git push -u origin claude/exciting-darwin-jm5s48`. Pas de pull request, aucune autre branche.

## Note du mois (`months`)
Chaque magasin a un tableau `months`, du plus ancien au plus récent. Chaque entrée :
`{"month": "AAAA-MM", "status": "reference" | "in_progress" | "final", "through": "AAAA-MM-JJ", "actual": {...}, "goals": {...} | null}`.
`actual` a les clés `posts`, `views`, `engaged`, `topReel`, `followers`, `watch`, `reels`. `goals` a 5 clés : `posts`, `views`, `topReel`, `followers`, `watch` pour un magasin qui a un `plan` (depuis novembre 2026 « Le Reel qui perce » remplace « Réactions ») ; `posts`, `views`, `engaged`, `followers`, `watch` pour un magasin sans `plan`. La page calcule les étoiles elle-même : une étoile par clé présente dans `goals` où `actual >= goals` (pour `watch`, il faut aussi `reels > 0`). Remplis toujours toutes les clés de `actual`, même celles qui n'ont pas d'objectif.

Ne modifie jamais une entrée `reference` ou `final`. Chaque lundi :
1. **Si le mois de l'entrée `in_progress` est terminé** (on est déjà dans le mois suivant) : recalcule son `actual` sur le mois complet (du 1er au dernier jour), mets `through` au dernier jour du mois et passe `status` à `final`. Puis crée l'entrée du nouveau mois avec ses `goals` (règles ci-dessous) et `status: "in_progress"`.
2. **Sinon** : recalcule l'`actual` du mois en cours, du 1er du mois jusqu'à hier, et mets `through` à la date d'hier.

Comment calculer `actual` pour un mois (Supermetrics, ds_id `IGI`, fuseau `Europe/Paris`, plage personnalisée du 1er du mois à la fin de la période) :
- `views` et `engaged` : une seule requête par compte, sans dimension de date, avec les champs `profile_views` et `accounts_engaged`. Ne fais jamais la somme de valeurs journalières de `accounts_engaged`.
- `posts` : nombre de publications du fil (Reels, photos, carrousels ; pas les stories) publiées dans le mois. Champs `media_id`, `timestamp`, `media_product_type` ; exclue `STORY`.
- `topReel` : vues (`media_views`) du Reel publié dans le mois qui en a le plus, mesurées au moment de la mise à jour ; `null` s'il n'y a aucun Reel.
- `reels` et `watch` : nombre de Reels publiés dans le mois, et moyenne de `media_reel_avg_watch_time` (en secondes, une décimale) sur ces Reels ; `watch` vaut `null` s'il n'y a aucun Reel.
- `followers` : nombre total d'abonnés à la fin de la période. Pour un mois qui vient de se terminer : abonnés actuels moins les nouveaux abonnés depuis le 1er du nouveau mois (`follower_count` journalier) ; si ce détail n'est pas disponible (moins de 100 abonnés), prends le nombre actuel.

**Si le magasin a un `plan`** (cible à long terme, objet `plan` du magasin) et que `plan.months` contient le nouveau mois : les `goals` du nouveau mois sont ceux de `plan.months[mois]`. Exception : si l'`actual` du mois qui vient de se terminer dépasse déjà l'objectif prévu pour le nouveau mois, prends pour `views`, `topReel` et `followers` la plus grande des deux valeurs entre l'objectif prévu et `actual du mois terminé × 1,10` (arrondi comme ci-dessous). Ne modifie jamais `plan` toi-même.

**Sinon** (pas de `plan`, ou mois au-delà de la cible), règles des objectifs (`goals`) du nouveau mois, à partir de l'`actual` du mois qui vient de se terminer :
- `posts` : 4 publications par semaine, soit `round(4 × nombre de jours du mois / 7)`.
- `views` : 10 % de plus que le mois précédent, arrondi à la dizaine.
- `engaged` : 10 % de plus que le mois précédent, arrondi à l'unité.
- `followers` : `max(100, round(abonnés fin du mois précédent × 1,10))`.
- `watch` : `min(20, round(watch du mois précédent) + 2)` en secondes ; si le mois précédent n'avait aucun Reel, reprends l'objectif précédent.

Ne change pas ces règles toi-même. Si l'utilisateur a demandé d'autres objectifs, il les aura écrits ici.

Contexte pour les recommandations : à Intermarché Cessole, un QR code Instagram est déjà affiché en caisse. Ne le recommande pas comme une nouveauté (tu peux proposer de le rendre plus visible ou de l'animer).

## En cas de problème
Si le connecteur Supermetrics n'est pas disponible, demande une reconnexion, ou si un compte ne renvoie aucune donnée : ne pousse rien de partiel ou d'inventé. Arrête-toi et explique clairement ce qui bloque et comment le corriger.

Termine par un résumé de 2-3 lignes : période couverte, vues et abonnés de chaque magasin, commit poussé.
