⚠️ DRAFT — à valider par un juriste belge avant déploiement pilote école payant. Le texte ci-dessous est un projet de travail et ne constitue pas un conseil juridique.

Version du 15 mai 2026 — Sprint 1 RGPD

# Politique cookies — Maïa

La présente politique décrit les cookies et technologies similaires utilisés par la plateforme Maïa (ci-après la « Plateforme »), accessible à l'adresse https://maia.app, en application de l'article 129 de la loi belge du 13 juin 2005 relative aux communications électroniques, de la directive 2002/58/CE (ePrivacy) et du Règlement (UE) 2016/679 (RGPD).

## 1. Qu'est-ce qu'un cookie ?

Un cookie est un petit fichier texte déposé sur votre terminal (ordinateur, tablette, smartphone) par le serveur du site que vous visitez ou par un service tiers. Il permet, durant sa durée de validité, de reconnaître votre navigateur ou de stocker certaines informations relatives à votre navigation.

Le terme « cookie » est employé ici au sens large : il couvre également des mécanismes assimilés tels que le `localStorage`, le `sessionStorage` ou les pixels invisibles.

On distingue généralement :

- les **cookies strictement nécessaires** (ou « essentiels ») au fonctionnement du service, qui sont exemptés de consentement préalable au sens de l'article 129, §1er, de la loi du 13 juin 2005 ;
- les **cookies de préférence**, qui mémorisent des choix utilisateur (langue, thème) ;
- les **cookies de mesure d'audience**, qui peuvent être exemptés de consentement lorsqu'ils respectent les critères fixés par les autorités de protection des données (anonymisation, absence de croisement avec d'autres traitements, finalité strictement limitée) ;
- les **cookies tiers** (publicité, réseaux sociaux), qui requièrent un consentement préalable.

## 2. Cookies utilisés par Maïa

À ce jour, la Plateforme utilise exclusivement des cookies et stockages strictement nécessaires à son fonctionnement ou correspondant à une préférence explicite de l'utilisateur. Le tableau ci-dessous en présente le détail.

| Nom | Type | Émetteur | Finalité | Durée |
| --- | --- | --- | --- | --- |
| `sb-access-token` / `sb-refresh-token` (ou équivalents) | Cookie de session — strictement nécessaire | Supabase (sous-traitant) | Maintien de la session authentifiée de l'utilisateur après connexion SSO | Durée de la session ; rafraîchissement périodique. Suppression à la déconnexion. |
| `theme` (clé `next-themes`) | localStorage — préférence | Maïa (premier niveau) | Mémorisation de la préférence de thème (clair / sombre / système) choisie par l'utilisateur | Persistant tant que l'utilisateur ne l'efface pas depuis son navigateur |
| Cookies techniques d'équilibrage / sécurité plateforme | Strictement nécessaire | Vercel (hébergeur) | Routage, prévention des attaques (rate-limiting), maintien de l'intégrité des requêtes | Durée de session ou courte durée technique |

Si l'analytique Vercel Analytics venait à être activée à l'avenir :

| Vercel Analytics | Mesure d'audience anonyme | Vercel | Comptage agrégé de pages vues, sans identifiant utilisateur, sans empreinte numérique permettant un suivi inter-sites | Sans dépôt de cookie persistant identifiant ; conforme à la documentation officielle de Vercel décrivant un fonctionnement exempté de bannière de consentement |

Aucun cookie publicitaire, aucun cookie de réseau social et aucun cookie de tiers à finalité marketing n'est utilisé.

## 3. Conséquence : absence de bannière de consentement

Compte tenu de la nature exclusivement essentielle ou strictement préférentielle des cookies utilisés, et conformément à l'article 129, §1er, alinéa 2, 2° de la loi du 13 juin 2005, l'Éditeur n'affiche pas de bannière de consentement préalable. Les utilisateurs sont néanmoins informés via la présente politique, accessible à tout moment depuis le pied de page de la Plateforme.

Cette analyse sera réévaluée si la Plateforme intègre, à l'avenir, un outil d'analyse non exempté, des cookies tiers ou des fonctionnalités de réseaux sociaux nécessitant le dépôt de traceurs.

## 4. Comment refuser ou supprimer les cookies ?

L'utilisateur peut à tout moment configurer son navigateur pour refuser tout ou partie des cookies, ou pour les supprimer après navigation. Les modalités varient selon le navigateur :

- **Mozilla Firefox** : Paramètres > Vie privée et sécurité > Cookies et données de sites.
- **Google Chrome** : Paramètres > Confidentialité et sécurité > Cookies et autres données des sites.
- **Microsoft Edge** : Paramètres > Cookies et autorisations de site.
- **Apple Safari** : Préférences > Confidentialité.

Le refus du cookie de session Supabase rend la Plateforme inutilisable, dans la mesure où ce cookie est indispensable au maintien de la session authentifiée. La suppression du stockage `theme` entraîne uniquement le retour à la préférence système.

## 5. Cookies tiers

À la date de la présente politique, la Plateforme n'utilise aucun cookie tiers à finalité publicitaire, comportementale ou marketing. En particulier, ni Google Analytics, ni Meta Pixel, ni équivalent ne sont déployés.

Les seuls tiers techniques intervenant indirectement par leurs services sont :

- **Supabase** : dépôt de cookies de session strictement nécessaires (cf. tableau ci-dessus).
- **Vercel** : cookies techniques de plateforme strictement nécessaires.

Ces traitements relèvent de leur qualité de sous-traitant de l'Éditeur et sont décrits dans la Politique de confidentialité.

## 6. Modifications

La présente politique cookies peut être mise à jour pour refléter l'évolution de la Plateforme, des technologies utilisées ou du cadre légal. Toute modification substantielle est portée à la connaissance des utilisateurs par notification dans l'interface et/ou par email. La date de la dernière mise à jour figure en tête du présent document.

## 7. Contact

Pour toute question relative à la présente politique cookies :

- DPO : dpo@maia.app
- Contact général : pilotes@maia.app

L'utilisateur dispose également du droit d'introduire une réclamation auprès de l'Autorité de Protection des Données (APD), rue de la Presse 35, 1000 Bruxelles, https://www.autoriteprotectiondonnees.be.
