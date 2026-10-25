# Insta Magasins

Tableau de bord des statistiques Instagram des magasins (Netto Temple, Intermarché Cessole), 30 derniers jours.

Site statique, sans build : `index.html` contient la page et les données. `data.json` est la copie brute des mêmes données (source : Instagram Insights via Supermetrics).

## Déploiement Vercel

1. Sur [vercel.com/new](https://vercel.com/new), importer le dépôt GitHub `N04H2004/R-seaux-Magasins-`.
2. Framework Preset : **Other**. Laisser Build Command et Output Directory vides.
3. Deploy. Chaque push sur la branche de production redéploie le site automatiquement.
