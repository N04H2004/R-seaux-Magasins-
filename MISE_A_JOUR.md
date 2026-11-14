# Mise à jour hebdomadaire de Mes Réseaux

Instructions suivies par la tâche planifiée « MAJ Magasins ».

Le site (statistiques Instagram de deux magasins à Nice) est hébergé sur Vercel depuis ce dépôt, branche `claude/exciting-darwin-jm5s48` : chaque push redéploie le site.

## Fichiers
- `data.json` : toutes les données des statistiques (JSON indenté, 1 espace). C'est le seul fichier que tu modifies. L'appli est protégée par une connexion : `index.html` ne contient plus aucune donnée, elle les charge depuis `/api/data`, qui lit `data.json`. Ne touche pas à `index.html`, ni aux dossiers `api/` et `assets/`.

## Étapes
1. Travaille sur la branche `claude/exciting-darwin-jm5s48`. Lis `data.json` pour connaître le schéma exact et le ton des textes actuels.
2. Récupère les chiffres avec `node scripts/fetch-instagram.js` (environ 1 à 2 minutes). Il interroge l'API de Meta (Instagram Graph API) pour les deux comptes et écrit `scripts/out/instagram.json` : fenêtre des 30 derniers jours complets se terminant hier (heure de Paris), et les 30 jours d'avant pour la comparaison. N'utilise plus Supermetrics (l'abonnement a pris fin). La clé d'accès est ajoutée automatiquement par le proxy réseau de la session : ne la cherche pas et ne la demande pas.
   - Code de sortie 2 (« ÉCHEC ») : une donnée principale manque, voir « En cas de problème ».
   - Les lignes `warnings` listent les données secondaires illisibles : signale-les dans ton résumé final.
3. Reporte dans `data.json`, pour chaque magasin (`stores.netto`, `stores.cessole` du fichier produit), sans recalculer les chiffres :
   - `followers`, `mediaCount`, `daily` et `compare` tels quels ;
   - `posts` : reprends les publications produites (déjà triées par vues décroissantes) en remplissant `title` : un titre court en français tiré de `caption`, dans le même style que les titres actuels (« Photo sans légende (JJ mois) » si la légende est vide). Ne garde pas le champ `caption` dans `data.json` ;
   - `audience` : `hours`, `ages`, `cities`. Ces données sont secondaires : si l'une vaut `null`, garde la valeur actuelle de `data.json` pour celle-là (ou `null` s'il n'y en a pas) et continue. Ne t'arrête jamais pour l'audience.
   Garde inchangés `id`, `name`, `handle`, `place`, `brand` de chaque magasin, `plan`, et mets `source` à « Instagram Insights (API Meta) ».
4. Mets à jour `updated` (date du jour) et `period` (`start`/`end`).
4bis. Mets à jour la **note du mois** de chaque magasin (tableau `months`, voir la section « Note du mois » plus bas).
4ter. Lance `node scripts/history.js` (après avoir mis à jour `period`, `daily`, `posts` et `months`). Il met à jour dans `weeks` chaque semaine complète du lundi au dimanche (la réunion présente la semaine complète qui précède) et, pour chaque mois qui vient d'être clôturé (`final`), ouvre `reports["AAAA-MM"]` avec ses 3 meilleurs posts. S'il affiche « rapports à rédiger », écris pour chaque magasin listé, dans `reports["AAAA-MM"].stores.<magasin>` :
   - `summary` : 3 à 4 constats sur le mois clôturé (note en étoiles, objectifs atteints ou manqués avec leurs chiffres `actual`/`goals`, meilleurs posts, évolution par rapport au mois d'avant) ;
   - `priorities` : 2 à 4 priorités courtes pour le mois qui commence.
   Même ton que `summary` et `recos` ; chaque chiffre doit venir de `data.json`. Ne modifie jamais un rapport déjà rédigé. L'appli s'en sert pour la présentation de la réunion et le rapport mensuel.
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

Les valeurs `actual` sont déjà calculées par `scripts/fetch-instagram.js` : `stores.<magasin>.months["AAAA-MM"]` donne `through` et `actual` pour le mois en cours (jusqu'à hier) et pour le mois précédent (complet, pour le clôturer). Reporte-les telles quelles, sans les recalculer ni additionner de valeurs journalières.

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
Arrête-toi sans rien pousser seulement si une donnée **principale** manque : `scripts/fetch-instagram.js` sort en « ÉCHEC » (clé Meta refusée ou expirée, API inaccessible, compte illisible), ou un compte n'a pas ses chiffres journaliers (`daily`), ses totaux (`compare`, `months`), son nombre d'abonnés ou ses publications. Si l'API répond que la clé est invalide, indique qu'il faut régénérer le jeton de l'utilisateur système « mes-reseaux-stats » (portefeuille Meta « Mes Réseaux ») et le réenregistrer pour graph.facebook.com dans l'environnement Claude. N'invente jamais un chiffre. Explique alors clairement ce qui bloque et comment le corriger.

Une donnée **secondaire** manquante (âges, villes ou heures de l'audience, temps de visionnage d'un Reel isolé) ne bloque pas la mise à jour : garde la valeur précédente comme indiqué plus haut, pousse le reste, et signale-le en une ligne dans ton résumé final.

Termine par un résumé de 2-3 lignes : période couverte, vues et abonnés de chaque magasin, commit poussé.
