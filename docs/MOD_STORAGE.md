# Hébergement des mods STRYKER

## Décision

L’application ne doit pas embarquer les gros mods. Elle contient uniquement le moteur, l’interface et les petits modules originaux STRYKER. Le site transmet un identifiant de mod et l’adresse du dépôt à l’application ; STRYKER télécharge ensuite l’archive à la demande, vérifie son empreinte SHA-256, inspecte la structure et installe le contenu dans son staging.

## Phase bêta

Les paquets vérifiés et autorisés sont placés dans une GitHub Release dédiée aux mods. GitHub accepte les fichiers de Release inférieurs à 2 Gio et n’annonce pas de limite globale de bande passante pour les assets de Release :

- documentation : https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
- catalogue signé par le dépôt source : `public/repository/api/catalog/<mod-id>`
- archive : GitHub Release `mods-2026.09`
- contrôle final : SHA-256 obligatoire avant installation

Cette phase évite d’utiliser la bande passante Netlify pour les archives. Sur les offres Netlify à crédits, les téléchargements de fichiers comptent dans la bande passante web, actuellement mesurée à 20 crédits par Go :

- documentation : https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/

## Phase Hub public

Lorsque les soumissions créateurs seront ouvertes à grande échelle :

- **Cloudflare R2** stockera les ZIP et captures ;
- **D1** stockera les fiches, versions, empreintes, droits, statuts de modération et signalements ;
- un domaine de dépôt séparé servira `/api/catalog`, les fiches et les téléchargements ;
- les archives resteront privées jusqu’à validation humaine et analyse antivirus ;
- les URL publiques seront versionnées et immuables ;
- le retrait d’un mod désactivera sa fiche sans casser les sauvegardes locales.

R2 est adapté aux archives car la sortie Internet directe n’est pas facturée et le palier gratuit Standard comprend actuellement 10 Go-mois de stockage, 1 million d’écritures et 10 millions de lectures :

- documentation : https://developers.cloudflare.com/r2/pricing/

## Règles de publication

1. aucune archive sans confirmation du droit de distribution ;
2. aucun exécutable ou script système dans un ZIP automatique ;
3. empreinte SHA-256 et taille publiées dans la fiche ;
4. crédits et source d’origine conservés ;
5. archive immuable : une mise à jour crée une nouvelle version ;
6. le site distingue paquet hébergé, source vérifiée et lien communautaire ;
7. les binaires tiers comme NVIDIA, ReShade ou RenoDX restent sur leur source officielle sauf licence explicite.
