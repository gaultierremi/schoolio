⚠️ DRAFT — à valider par un juriste belge avant déploiement pilote école payant. Le texte ci-dessous est un projet de travail et ne constitue pas un conseil juridique.

Version du 15 mai 2026 — Sprint 1 RGPD

# Politique de confidentialité — Maïa

## Préambule

La présente politique de confidentialité (ci-après la « Politique ») a pour objet d'informer les utilisateurs de la plateforme Maïa (ci-après la « Plateforme »), accessible à l'adresse https://maia.app, sur la manière dont leurs données à caractère personnel sont collectées et traitées, conformément au Règlement (UE) 2016/679 du 27 avril 2016 relatif à la protection des personnes physiques à l'égard du traitement des données à caractère personnel (ci-après le « RGPD ») et à la loi belge du 30 juillet 2018 relative à la protection des personnes physiques à l'égard des traitements de données à caractère personnel.

La Plateforme est un outil pédagogique destiné aux établissements d'enseignement secondaire de la Fédération Wallonie-Bruxelles. Elle est utilisée par des élèves (majoritairement mineurs), des professeurs et des directions d'établissement. À ce titre, l'Éditeur accorde une attention particulière à la protection des données des mineurs, conformément à l'article 8 du RGPD.

## 1. Responsable du traitement

Le responsable du traitement des données à caractère personnel est :

- [ÉDITEUR : forme juridique + adresse + RCS]
- Adresse email de contact général : pilotes@maia.app
- Délégué à la protection des données (DPO) : dpo@maia.app

Pour toute question, demande d'exercice de droits ou réclamation relative à la présente Politique, l'utilisateur peut s'adresser au DPO à l'adresse email indiquée ci-dessus.

## 2. Données à caractère personnel collectées

L'Éditeur collecte et traite les catégories de données suivantes.

### 2.1 Données de compte (toutes catégories d'utilisateurs)

- Adresse email (transmise par le fournisseur d'identité tiers : Google, Microsoft ou SmartSchool).
- Prénom et/ou pseudonyme choisi par l'utilisateur.
- Identifiant utilisateur unique (UUID interne).
- Rôle : élève ou professeur.
- Établissement de rattachement (le cas échéant).
- Hachage bcrypt (cost factor 12) du code PIN à quatre chiffres défini par l'utilisateur. Le code PIN en clair n'est jamais stocké et ne peut être consulté par l'Éditeur.
- Date et heure de création du compte, dernière connexion, fuseau horaire.

L'Éditeur ne stocke aucun mot de passe utilisateur : l'authentification primaire est intégralement déléguée au fournisseur d'identité.

### 2.2 Données d'usage pédagogique

- Appartenance à une ou plusieurs classes, statut au sein de la classe (actif, retiré).
- Participations à des sessions d'apprentissage, scores, réponses détaillées aux questions de quiz et d'évaluations formatives.
- Niveaux de maîtrise par concept (mastery scores) calculés à partir des réponses.
- Plans de travail personnalisés générés pour l'élève.
- Productions textuelles ou indices demandés au tuteur intégré (Maïa).

### 2.3 Données techniques

- Adresse IP, durant la session, à des fins de sécurité et de prévention de la fraude (logs serveur).
- Type de navigateur, système d'exploitation, langue, fuseau horaire.
- Cookies essentiels de session (cf. Politique cookies).
- Logs d'audit des actions sensibles (création de classe, modification de membres, export de données, suppression).

### 2.4 Données relatives au consentement parental (mineurs de moins de 16 ans)

Lorsque l'utilisateur est âgé de moins de 16 ans, l'Éditeur collecte les éléments suivants à des fins exclusives de recueil du consentement du titulaire de l'autorité parentale (article 8 RGPD) :

- Hachage cryptographique (SHA-256 ou bcrypt) de l'adresse email du parent. L'adresse email du parent n'est **jamais** stockée en clair après l'envoi du lien de signature.
- Date et heure de l'envoi de la demande de consentement.
- Hachage cryptographique immuable de la signature électronique du parent, horodaté.
- Statut du consentement (en attente, accordé, refusé, retiré).

L'enregistrement du consentement parental est conservé dans une table dédiée (`consent_records`) protégée par les mécanismes de sécurité décrits à la section 6.

### 2.5 Données sensibles

L'Éditeur ne collecte **aucune** donnée relevant des catégories particulières mentionnées à l'article 9 du RGPD (origine raciale ou ethnique, opinions politiques, convictions religieuses ou philosophiques, appartenance syndicale, données génétiques, données biométriques aux fins d'identifier une personne physique de manière unique, données concernant la santé, la vie sexuelle ou l'orientation sexuelle).

## 3. Finalités et bases légales du traitement

Les données sont traitées pour les finalités suivantes, sur les bases légales énumérées à l'article 6 du RGPD :

| Finalité | Base légale | Référence RGPD |
| --- | --- | --- |
| Création et gestion du compte utilisateur, authentification, sécurité (PIN) | Exécution du contrat (CGU) | Art. 6(1)(b) |
| Mise à disposition des contenus pédagogiques, sessions, suivi des compétences | Exécution du contrat (CGU) | Art. 6(1)(b) |
| Génération de plans de travail personnalisés | Exécution du contrat (CGU) | Art. 6(1)(b) |
| Communications transactionnelles (consentement parental, notifications de classe) | Exécution du contrat / intérêt légitime | Art. 6(1)(b) / Art. 6(1)(f) |
| Sécurité de la Plateforme, prévention de la fraude, journalisation d'audit | Intérêt légitime | Art. 6(1)(f) |
| Statistiques pédagogiques agrégées pour la direction d'établissement | Intérêt légitime | Art. 6(1)(f) |
| Traitement des données d'un mineur de moins de 16 ans | Consentement du titulaire de l'autorité parentale | Art. 6(1)(a) + Art. 8 |
| Respect des obligations légales (réquisition judiciaire, etc.) | Obligation légale | Art. 6(1)(c) |
| Amélioration continue du service par analyse de données pseudonymisées | Intérêt légitime, avec possibilité d'opposition | Art. 6(1)(f) |

L'intérêt légitime invoqué est notamment celui de l'Éditeur à fournir un service pédagogique fiable, sécurisé et amélioré itérativement, sans préjudice des intérêts ou droits et libertés fondamentaux des personnes concernées. Une analyse d'équilibre des intérêts (LIA) est tenue à disposition des autorités de contrôle sur demande.

## 4. Durées de conservation

Les durées de conservation sont déterminées en fonction de la finalité du traitement et des obligations légales applicables.

| Catégorie de données | Durée de conservation |
| --- | --- |
| Données de compte (utilisateur actif) | Pendant toute la durée d'utilisation de la Plateforme |
| Données de compte (compte inactif) | Anonymisation après 24 mois d'inactivité, sauf demande de suppression anticipée |
| Données pédagogiques d'usage (sessions, réponses, scores) | Conservées tant que la classe est active, puis pseudonymisées à des fins statistiques longitudinales (cf. section 4.1) |
| Logs d'audit des actions sensibles | 24 mois |
| Logs techniques (IP, navigateur) | 12 mois maximum |
| Hachage de l'email parent et signature électronique (consentement) | Jusqu'à la majorité de l'élève + 5 ans (prescription civile belge) |
| Données de facturation (lors de la sortie de phase pilote) | 7 ans (article III.86 du Code de droit économique belge) |
| Sauvegardes techniques chiffrées | 35 jours rolling |

### 4.1 Principe d'intégrité des données longitudinales

À des fins de mesure de la qualité pédagogique sur plusieurs années (taux de réussite par chapitre, identification de baisses de performance par classe ou par cours), certaines données événementielles (sessions live, complétions de quiz, réponses aux questions) ne sont **pas supprimées** lorsqu'un élève quitte une classe : son statut est mis à jour (par exemple `status='removed'`), mais la trace pédagogique demeure dans la base, pseudonymisée à terme.

Cette politique est strictement limitée aux usages statistiques agrégés. L'élève (ou son représentant légal s'il est mineur) conserve l'intégralité de ses droits RGPD, notamment le droit à l'effacement (cf. section 7), dont l'exercice entraîne la pseudonymisation irréversible des lignes le concernant lorsque la conservation n'est pas nécessaire au respect d'une obligation légale.

## 5. Sous-traitants et destinataires des données

L'Éditeur fait appel aux sous-traitants suivants, dont chacun est lié par un accord de traitement de données conforme à l'article 28 du RGPD.

| Sous-traitant | Rôle | Localisation des traitements | Base légale du transfert |
| --- | --- | --- | --- |
| Supabase Inc. | Base de données (PostgreSQL), authentification, stockage de fichiers | Frankfurt, Allemagne (UE) | Traitement intra-UE — aucun mécanisme de transfert international requis |
| Vercel Inc. | Hébergement de l'application web (Functions, Edge, statique) | Régions de l'Union européenne configurées par défaut lorsque possible ; certaines opérations d'administration peuvent transiter via les États-Unis | Clauses Contractuelles Types (CCT) approuvées par la Commission européenne, conformément à l'art. 46(2)(c) RGPD |
| Anthropic, PBC | Modèle d'intelligence artificielle « Claude » pour la génération assistée de contenus pédagogiques (traitement en **batch uniquement**, jamais en runtime côté élève) | États-Unis | Clauses Contractuelles Types (CCT) approuvées par la Commission européenne, conformément à l'art. 46(2)(c) RGPD. Aucune donnée nominative d'élève n'est envoyée à Anthropic. |
| Trigger.dev | Orchestration de tâches asynchrones (génération de plans, batchs de contenus) | Configuration UE prioritaire | Si traitement hors UE : Clauses Contractuelles Types, art. 46(2)(c) RGPD |
| Resend ou Postmark (à confirmer) | Envoi d'emails transactionnels (consentement parental, notifications) | [À COMPLÉTER : prestataire retenu + localisation] | Si hors UE : Clauses Contractuelles Types, art. 46(2)(c) RGPD |

Aucune donnée à caractère personnel n'est transmise à des partenaires commerciaux à des fins de prospection ou de publicité. L'Éditeur ne procède à aucune vente, location ou échange de données.

L'Éditeur tient à jour la liste exhaustive et actualisée des sous-traitants et peut la communiquer sur simple demande adressée à dpo@maia.app.

### 5.1 Transferts vers les États-Unis

Le recours à Anthropic (États-Unis) pour la génération assistée de contenus pédagogiques en batch implique un transfert de données vers un pays tiers. Ce transfert est encadré par les Clauses Contractuelles Types adoptées par la Commission européenne (décision d'exécution (UE) 2021/914 du 4 juin 2021), conformément à l'article 46(2)(c) du RGPD.

Les données transmises à Anthropic sont :

- des fragments de contenus pédagogiques publics ou produits par les professeurs (par exemple, un extrait de syllabus officiel de la Fédération Wallonie-Bruxelles) ;
- aucune donnée nominative d'élève (ni email, ni prénom, ni identifiant), ni résultat individuel.

L'Éditeur a procédé à une analyse d'impact relative à la protection des données (AIPD / DPIA) tenant compte de la jurisprudence Schrems II (CJUE C-311/18) et a retenu des mesures techniques et organisationnelles complémentaires (minimisation, pseudonymisation, contrôle d'accès).

## 6. Sécurité des données

L'Éditeur met en œuvre les mesures techniques et organisationnelles appropriées, conformément à l'article 32 du RGPD, et notamment :

- chiffrement TLS 1.3 (ou supérieur) pour l'ensemble des échanges entre les utilisateurs et la Plateforme ;
- chiffrement au repos de la base de données et des sauvegardes (AES-256 côté Supabase) ;
- politique de Row Level Security (RLS) activée sur toutes les tables, avec des règles d'accès cloisonnant les données par classe et par établissement ;
- hachage bcrypt (cost factor 12) du code PIN, irréversible ;
- hachage cryptographique (SHA-256 ou bcrypt) de l'adresse email parent et de la signature électronique, conservés de manière immuable ;
- journal d'audit (audit log) des actions sensibles, en lecture seule et immuable au niveau de la base de données ;
- contrôle d'accès strict : les membres de l'équipe Maïa autorisés à accéder à la base ne le sont qu'en cas de nécessité opérationnelle (incident, support utilisateur), sur la base d'une autorisation tracée ;
- politique de mots de passe forts et authentification à deux facteurs pour le personnel ;
- revues régulières du code, tests automatisés et procédures de revue par les pairs ;
- séparation des environnements (développement, recette, production) ;
- procédure de gestion des violations de données conforme aux articles 33 et 34 du RGPD : notification à l'APD dans un délai de 72 heures et information des personnes concernées lorsque les conditions sont réunies.

## 7. Droits des personnes concernées

Conformément aux articles 15 à 22 du RGPD, l'utilisateur (ou son représentant légal s'il est mineur) dispose des droits suivants :

- **Droit d'accès** (art. 15) : obtenir confirmation que des données le concernant sont traitées et en obtenir une copie.
- **Droit de rectification** (art. 16) : faire rectifier des données inexactes ou incomplètes.
- **Droit à l'effacement** (« droit à l'oubli », art. 17) : obtenir la suppression de ses données, sous réserve des obligations légales de conservation et des exigences d'intégrité longitudinale rappelées en section 4.1 (la suppression effective prend alors la forme d'une pseudonymisation irréversible).
- **Droit à la limitation du traitement** (art. 18).
- **Droit à la portabilité** (art. 20) : recevoir ses données dans un format structuré, couramment utilisé et lisible par machine, ou les faire transmettre à un autre responsable de traitement.
- **Droit d'opposition** (art. 21), notamment pour les traitements fondés sur l'intérêt légitime.
- **Droit de retirer son consentement** à tout moment, lorsque le traitement est fondé sur celui-ci (art. 7(3)), sans que ce retrait n'affecte la licéité du traitement effectué antérieurement.
- **Droit de ne pas faire l'objet d'une décision exclusivement automatisée** produisant des effets juridiques (art. 22). La Plateforme ne prend aucune décision exclusivement automatisée à l'égard des élèves : les évaluations et orientations pédagogiques demeurent la prérogative du professeur.
- **Droit d'introduire une réclamation** auprès de l'Autorité de Protection des Données (APD) :
  - Adresse : rue de la Presse 35, 1000 Bruxelles
  - Site internet : https://www.autoriteprotectiondonnees.be
  - Téléphone : +32 (0)2 274 48 00

L'utilisateur peut exercer ses droits en adressant une demande à dpo@maia.app. Une pièce d'identité peut être demandée en cas de doute raisonnable sur l'identité du demandeur. L'Éditeur répond dans un délai d'un mois à compter de la réception de la demande, prolongeable de deux mois en cas de complexité ou de pluralité de demandes (art. 12(3) RGPD).

## 8. Cas particulier des mineurs de moins de 16 ans

L'âge du consentement numérique en Belgique est fixé à 13 ans par la loi belge du 30 juillet 2018 (article 7), en deçà du seuil de 16 ans laissé par défaut par l'article 8 du RGPD aux États membres. Par mesure de prudence et compte tenu du public scolaire concerné, l'Éditeur a fait le choix d'appliquer le seuil de 16 ans pour requérir un consentement parental, sauf instruction contraire de l'établissement scolaire.

Pour les élèves de moins de 16 ans :

1. Lors de la première connexion, l'élève renseigne l'adresse email d'un titulaire de l'autorité parentale.
2. Cette adresse email est immédiatement hachée (SHA-256 ou bcrypt) ; elle n'est **jamais stockée en clair**.
3. Un email contenant un lien sécurisé de signature est envoyé directement au parent, sans persistance de l'adresse en clair côté serveur.
4. Le parent signe électroniquement (acceptation explicite assortie d'un horodatage et d'une empreinte cryptographique).
5. La signature, sous forme hachée, est conservée de manière immuable dans la table `consent_records`.

Le parent peut retirer son consentement à tout moment en contactant dpo@maia.app. Le retrait entraîne la suspension de l'accès de l'élève et l'enclenchement de la procédure de suppression / pseudonymisation des données décrite en section 7.

## 9. Cookies et technologies similaires

L'utilisation des cookies et technologies similaires fait l'objet d'une politique dédiée, accessible à l'adresse https://maia.app/politique-cookies. À ce jour, la Plateforme n'utilise que des cookies strictement nécessaires au fonctionnement du service, exemptés de consentement préalable au sens de l'article 129 de la loi belge du 13 juin 2005 relative aux communications électroniques.

## 10. Profilage et décisions automatisées

La Plateforme calcule, à partir des réponses fournies par l'élève, des niveaux de maîtrise par concept (mastery scores) et propose des plans de travail personnalisés. Ces traitements n'emportent **aucune décision juridique** à l'égard de l'élève : ils ne fondent ni évaluation officielle, ni orientation, ni sanction. Le professeur conserve la pleine responsabilité pédagogique.

L'utilisateur peut, à tout moment, demander une explication relative au fonctionnement des recommandations à dpo@maia.app.

## 11. Modifications de la présente Politique

La présente Politique est susceptible d'être modifiée pour s'adapter à l'évolution légale, réglementaire ou fonctionnelle de la Plateforme. Toute modification substantielle est portée à la connaissance des utilisateurs par notification dans l'interface et/ou par email, avec un préavis raisonnable avant entrée en vigueur. La date de la dernière mise à jour figure en tête du présent document.

## 12. Contact

Pour toute question, demande d'exercice de droits ou réclamation :

- DPO : dpo@maia.app
- Contact général : pilotes@maia.app
- Adresse postale : [À COMPLÉTER : adresse postale de l'Éditeur]

En cas de désaccord persistant, l'utilisateur peut introduire une réclamation auprès de l'Autorité de Protection des Données (APD), rue de la Presse 35, 1000 Bruxelles, https://www.autoriteprotectiondonnees.be.
