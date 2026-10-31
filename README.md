# Mes Réseaux

Tableau de bord des statistiques Instagram des magasins (Netto Temple, Intermarché Cessole), 30 derniers jours.

Site statique, sans build : `index.html` contient la page et les données. `data.json` est la copie brute des mêmes données (source : Instagram Insights via Supermetrics).

L'appli demande une connexion (prénom + code personnel). Pour créer un compte, on choisit « Première connexion » et on entre un code d'invitation : il fixe le rôle, direction ou community manager. Une fois connecté, on le reste sur le téléphone (cookie de session d'un an).

- **Statistiques** : chargées depuis `/api/data` (fichier `data.json`, non accessible publiquement), mises à jour chaque lundi par la tâche planifiée (voir `MISE_A_JOUR.md`).
- **Planning** : la timesheet du community manager. Il saisit ses shifts et peut les modifier jusqu'au dimanche 23 h 59 ; la direction consulte, modifie tout et propose des shifts que le CM accepte ou refuse.
- **Stockage** : Upstash Redis branché sur le projet Vercel (comptes, sessions, shifts, abonnements aux notifications).

## Déploiement Vercel

1. Sur [vercel.com/new](https://vercel.com/new), importer le dépôt GitHub `N04H2004/R-seaux-Magasins-`.
2. Framework Preset : **Other**. Laisser Build Command et Output Directory vides.
3. Ajouter le stockage Upstash Redis et la variable `VAPID_PRIVATE_KEY`, puis déployer. Chaque push sur la branche de production redéploie le site.
