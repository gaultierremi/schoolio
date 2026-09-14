-- Seed board : findings de l'audit du parcours "rejoindre une classe" (5 cartes).
--
-- Contexte : la PR feat/sso-join-class ajoute le rattachement SSO via
-- /join/[token]. En instrumentant ce parcours, cinq problèmes sont apparus qui
-- ne sont PAS du ressort de cette PR (règle 17 : un bug trouvé en codant une
-- feature ouvre une carte, il n'est pas corrigé dans le même diff). Ils sont
-- tracés ici pour ne pas se perdre.
--
-- La carte 1 est une faille de sécurité réelle, pas un durcissement théorique.
-- Les cartes 1 et 2 se recouvrent : supprimer le code mort de la carte 2 ferme
-- la faille de la carte 1. Traiter la 2 EN PREMIER si personne ne peut
-- confirmer rapidement qu'aucun client hors repo n'appelle ces routes.
--
-- Même pattern d'idempotence que 20260902000000 et 20260902010000 : UUID
-- épinglés + ON CONFLICT (id) DO NOTHING (rejeu du fichier), et WHERE NOT
-- EXISTS sur le titre (carte déjà saisie à la main — title n'a pas de
-- contrainte UNIQUE).
--
-- Aucun schéma touché.

BEGIN;

WITH payload (id, type, title, description, priority, tags) AS (
  VALUES
  (
    '7d1e2b4a-0002-4000-8000-000000000001'::uuid,
    'bug',
    'SECURITE — /api/classes/validate-code est un oracle vers invite_link_token',
    $md$FAILLE REELLE, exploitable aujourd'hui. Pas un durcissement theorique.

POST /api/classes/validate-code (app/api/classes/validate-code/route.ts) :
- est PUBLIC : aucun requireUser(), aucun check d'auth, contrairement a la regle 4 ;
- n'a AUCUN rate-limit ;
- prend un invite_code de 6 caracteres ;
- et renvoie invite_link_token EN CLAIR dans sa reponse (ligne 54), en plus de
  classId, className et du nom du prof.

ENTROPIE DU SECRET DEVINE :
generateCode() (app/api/classes/route.ts:18-23 et regenerate-code/route.ts:17-23)
tire sur l'alphabet ABCDEFGHJKMNPQRSTUVWXYZ23456789 = 31 caracteres, longueur 6.
Soit 31^6 = 887 503 681 combinaisons, environ 2^29,7.

Un attaquant qui enumere cet espace recupere le invite_link_token de n'importe
quelle classe, sans jamais s'authentifier. Le token est un uuid v4 (non
devinable), mais cette route le DONNE. C'est un oracle : elle transforme un
secret faible et enumerable en secret fort.

Avec /join/[token] (PR feat/sso-join-class), ce token suffit a rejoindre la
classe. L'attaquant se retrouve dans la classe d'un tiers, avec acces aux
devoirs et a la liste des eleves.

DOUBLE VIOLATION DE LA REGLE 9 au passage : generateCode() utilise
Math.random(), pas crypto.randomBytes(). Math.random() n'est pas
cryptographiquement sur — l'etat du PRNG V8 est reconstructible a partir de
quelques sorties observees. L'entropie REELLE est donc inferieure aux 29,7 bits
theoriques pour qui observe plusieurs codes.

AGGRAVANT : la colonne invite_code est DEPRECATED depuis
20260520400000_deprecate_invite_code.sql, remplacee par invitation_code (8
chars). Le COMMENT de cette migration justifie de garder la colonne « pour
retro-compat des API legacy /api/classes/validate-code etc. » — or cette route
n'a AUCUN appelant dans le repo (cf. carte « validate-token + validate-code =
code mort »). La justification de la deprecation est donc perimee.

CORRECTIF LE PLUS SIMPLE : supprimer la route (voir la carte code mort). Si on
la garde, il faut CUMULATIVEMENT : requireUser() en premiere instruction,
rate-limit par IP et par compte, et surtout ARRETER de renvoyer
invite_link_token dans la reponse — rien ne le justifie, l'appelant a deja
classId.

Trouve en codant feat/sso-join-class. Non corrige dans cette PR : regle 17
(un fix de securite ne se cache pas dans le diff d'une feature) et regle 22
(surface differente).$md$,
    'critical',
    ARRAY['found-by-claudy', 'security', 'join-flow']::text[]
  ),
  (
    '7d1e2b4a-0002-4000-8000-000000000002'::uuid,
    'task',
    'validate-token + validate-code = code mort (zero appelant)',
    $md$Les deux routes n'ont AUCUN appelant dans le repo. Verifie :

  grep -rn "validate-code\|validate-token" --include=*.ts --include=*.tsx .

ne remonte que leurs propres lignes console.error et les artefacts de build
.next/types/. Zero fetch, zero import, zero reference.

FICHIERS :
- app/api/classes/validate-code/route.ts
- app/api/classes/validate-token/route.ts

Ils datent du parcours « code a 6 caracteres puis formulaire email/mot de
passe », abandonne depuis. validate-token est integralement remplace par la
lecture serveur de app/join/[token]/page.tsx ; validate-code n'a plus de front
du tout.

POURQUOI CETTE CARTE EST PRIORITAIRE MALGRE SON TYPE : supprimer validate-code
FERME la faille critique decrite dans la carte « SECURITE — validate-code est
un oracle vers invite_link_token ». C'est le correctif le moins cher de cette
faille. A traiter EN PREMIER, sauf si quelqu'un peut confirmer qu'un client
hors repo (script, Postman, appli mobile) les appelle — auquel cas basculer
sur le durcissement decrit dans la carte securite.

A verifier avant suppression : aucun appel hors repo. Le COMMENT de
20260520400000_deprecate_invite_code.sql invoque justement ces routes pour
justifier de garder la colonne invite_code — mettre ce COMMENT a jour dans la
meme PR, sinon la prochaine personne qui lit la migration croira que la
retro-compat est encore necessaire.$md$,
    'medium',
    ARRAY['found-by-claudy', 'dead-code', 'join-flow']::text[]
  ),
  (
    '7d1e2b4a-0002-4000-8000-000000000003'::uuid,
    'bug',
    'Open redirect : safeNextPath manquant sur 3 points de redirection',
    $md$lib/auth/safe-redirect.ts existe depuis l'audit hard 2026-05-25 (P1) et
documente precisement le probleme : le pattern
`typeof x === "string" && x.startsWith("/")` accepte `//evil.com`, qu'un
navigateur interprete comme `https://evil.com`. Risque de phishing post-auth :
l'utilisateur vient de s'authentifier, il fait confiance a ce qui s'affiche.

Le helper est deja utilise par les routes PIN et consent
(app/api/auth/pin/setup/route.ts:59, pin/verify/route.ts:61,
api/consent/give/route.ts:80). Trois points de redirection l'ont manque et
utilisent encore le pattern vulnerable :

1. app/auth/callback/route.ts:112
     if (next && next.startsWith("/")) { destination = next; }
   LE PLUS GRAVE des trois : c'est le retour d'OAuth, le `next` vient d'un
   parametre d'URL que l'attaquant controle entierement dans le lien qu'il
   envoie a la victime, et la redirection a lieu juste apres l'authentification
   reussie.

2. app/login/LoginClient.tsx:15
     if (nextParam && nextParam.startsWith("/"))
   Construit le redirectTo passe a signInWithOAuth.

3. app/onboarding/name/OnboardingNameClient.tsx:39
     const destination = nextParam && nextParam.startsWith("/") ? nextParam : "/accueil";

CORRECTIF : remplacer les trois par safeNextPath(x, "/accueil"). Le helper est
deja teste (tests/lib/safe-redirect.test.ts). Changement mecanique, faible
risque.

Note : les trois sont sur le chemin d'auth, donc a faire dans une PR dediee et
non melangee a une feature — c'est le genre de diff qui doit etre lisible d'un
coup d'oeil.

Trouve en codant feat/sso-join-class (ce parcours passe par /login?next=).$md$,
    'high',
    ARRAY['found-by-claudy', 'security', 'auth']::text[]
  ),
  (
    '7d1e2b4a-0002-4000-8000-000000000004'::uuid,
    'task',
    'Nettoyer le sous-arbre email/mot de passe orphelin + /signup dans PUBLIC_PATHS',
    $md$Le parcours « inscription eleve par email + mot de passe » a ete abandonne au
profit du SSO Google, mais son code est reste. La PR feat/sso-join-class a
retire le dernier appelant vivant (app/join/[token]/page.tsx n'importe plus
JoinTokenClient) sans supprimer les fichiers — volontairement, pour garder le
diff reviewable (regle 17/18). Cette carte solde la dette.

A SUPPRIMER, apres verification des appelants au cas par cas :
- app/join/[token]/JoinTokenClient.tsx — plus aucun appelant depuis
  feat/sso-join-class.
- components/classes/JoinClassForm.tsx — le formulaire email/mdp. ATTENTION :
  ne PAS confondre avec app/join/JoinClassForm.tsx, qui est le formulaire de
  saisie de code, lui bien vivant (utilise par app/join/page.tsx:43).
- app/api/classes/[id]/join-full/route.ts — cree un compte par
  admin.auth.admin.createUser() avec mot de passe. A verifier : c'est la route
  qui a produit les comptes « membres sans profil ni app_metadata.role » que
  feat/sso-join-class doit backfiller. Verifier qu'aucun de ces comptes n'est
  encore cree avant de la retirer.

A CORRIGER dans la foulee :
- middleware.ts:10 — PUBLIC_PATHS contient "/signup" alors que le repertoire
  app/signup n'existe pas (verifie). Un path public declare vers une page
  inexistante, c'est de la surface d'attaque gratuite et une fausse piste pour
  la prochaine personne qui lit le middleware.

Le commentaire de middleware.ts:7-9 dit deja que /join est passe en
auth-required ; le « /signup » restant est un vestige de la meme epoque.$md$,
    'low',
    ARRAY['found-by-claudy', 'dead-code', 'join-flow']::text[]
  ),
  (
    '7d1e2b4a-0002-4000-8000-000000000005'::uuid,
    'task',
    'Unifier les deux chemins de join (a froid, apres le pilote)',
    $md$Il existe maintenant DEUX routes qui font le meme rattachement eleve-classe :

- POST /api/join — indexe sur classes.invitation_code (code a 8 caracteres)
- POST /api/join/link — indexe sur classes.invite_link_token (QR code / lien),
  ajoutee par feat/sso-join-class

Elles dupliquent : les gates (archivee / inscriptions fermees / lien expire /
introuvable), le backfill de app_metadata.role, le upsert de user_profiles, le
upsert de class_memberships et le logActivity. C'est assume et documente par un
commentaire de renvoi croise dans chaque fichier — pas une extraction oubliee.

POURQUOI NE PAS AVOIR EXTRAIT TOUT DE SUITE : l'extraction naturelle serait un
lib/join-student.ts, or lib/ est le domaine d'Alex (regle 22) et le sprint
imposait une route auto-portee. Extraire a chaud aurait aussi mis les deux
parcours en production sur du code neuf le meme jour.

IMPORTANT — LES DEUX NE SONT PAS EQUIVALENTES. /api/join/link est la version
durcie ; /api/join a conserve trois defauts que la review Claudia a fait
corriger dans la nouvelle route seulement :
1. Aucune erreur d'ecriture n'est testee (lignes 73, 90, 106, 111) : la route
   peut renvoyer 200 { ok: true } sans qu'aucune membership soit ecrite.
   L'eleve lit « Tu as rejoint la classe », le prof ne le voit jamais
   apparaitre. C'est le bug le plus concret des trois.
2. `!cls || cls.archived_at` (ligne 45) collapse « classe archivee » en 404, et
   l'erreur du select n'est pas distinguee de « pas de resultat » : une panne
   DB s'affiche comme « code invalide ».
3. Early-return sur already_member (ligne 63) AVANT de garantir le profil et
   app_metadata.role : un compte deja membre mais sans role reste sans role et
   retombe sur UnknownRoleScreen.

L'unification doit donc porter /api/join AU NIVEAU de /api/join/link, pas
l'inverse, et surtout pas prendre une moyenne des deux. Si l'unification est
repoussee, traiter au minimum le point 1 separement : il fait diverger ce que
voit l'eleve et ce que voit le prof.

A FAIRE A FROID, apres le pilote. En attendant, tout fix de gate ou d'ecriture
dans une route doit etre repercute dans l'autre (les commentaires de renvoi
croise le rappellent aux deux endroits).$md$,
    'medium',
    ARRAY['found-by-claudy', 'refacto', 'join-flow']::text[]
  )
)
INSERT INTO public.admin_board_cards (id, created_by, type, title, description, priority, status, tags)
SELECT
  p.id,
  'claudy',
  p.type,
  p.title,
  p.description,
  p.priority,
  'backlog',
  p.tags
FROM payload p
WHERE NOT EXISTS (
  SELECT 1 FROM public.admin_board_cards c WHERE c.title = p.title
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
