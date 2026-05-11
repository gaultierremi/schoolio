# Claudy — règles système Schoolio

## Avant CHAQUE tâche qui touche le code

1. *Lis d'abord les helpers existants.* Cours :
ls lib/api/
cat lib/api/auth.ts lib/api/respond.ts

Si tu écris auth.getUser() à la main dans une route, tu as raté requireUser().
Si tu écris NextResponse.json({error}, {status}), tu as raté apiError().
Si tu fais un check admin email à la main, tu as raté requireAdmin() / requireSuperAdmin().

2. *Audit récent ouvre la voie.* Avant chaque grosse tâche :
git log main --since="14 days ago" --diff-filter=A -- lib/ app/api/
gh pr list --state merged --limit 10 --json title,body

Lis les commits "feat(api):" et "feat(security):" récents — c'est là qu'Alex pose les patterns.

3. *Si tu manipules user_metadata pour autre chose que de l'affichage*, STOP. Le rôle, les permissions, tout ce qui gate l'accès va dans app_metadata (writable seulement par service role). Voir [middleware.ts:36](middleware.ts#L36) pour le pattern de read.

## Pour les routes API

4. *Tout endpoint qui fait un side effect non-trivial (write DB, appel AI, fetch externe) doit avoir un check d'auth en première instruction du handler.* Pas de "j'ajouterai après". Pas d'exception sauf endpoint public explicitement documenté.

5. *N'utilise JAMAIS body.user_id, body.email, body.role dans une route auth-protégée.* Toujours auth.user.id, auth.user.email. Le body est attaquant-controlé.

6. *Toute response d'erreur doit utiliser apiError(message, status) ou safeError(err, "tag")* — JAMAIS retourner err.message au client (leak de schema PG).

7. *Body validation sur CHAQUE champ* : type + length + pattern si applicable. Spécifiquement :
- String fields : if (typeof x !== "string" || x.length > N) return apiError(...).
- Email : utilise une vraie regex, pas .includes("@").
- UUID : /^[0-9a-f-]{36}$/i.test(x).
- Number : Number.isFinite(x) puis range check.

## Pour les migrations

8. *RLS enabled sur TOUTE nouvelle table.* Sans exception. Si la table n'a que des écrits service-role, ajoute WITH CHECK (false) sur INSERT/UPDATE pour bloquer toute écriture côté anon — RLS doit être actif même si vide.

9. *Codes / tokens / secrets : gen_random_bytes() (extension pgcrypto), JAMAIS RANDOM()* côté Postgres. Côté Node : crypto.randomBytes().

10. *CHECK constraints sur les colonnes enum-like (status, source, type, role).* Sans exception.

11. *FK avec ON DELETE explicite.* RGPD : un user doit pouvoir être supprimé. SET NULL ou CASCADE selon la sémantique. *Jamais omis* (default = NO ACTION = bloque la suppression).

12. *Trigger functions SECURITY DEFINER → toujours SET search_path = ''* dans le corps. Sinon Supabase linter flag (et c'est un vecteur d'escalation connu).

## Pour les composants

13. *Pas de dangerouslySetInnerHTML.* Si tu en as besoin, justifie en commentaire et passe le contenu par DOMPurify.

14. *window.open(url, "_blank") doit avoir "noopener,noreferrer" en 3ème arg.* Sans exception.

15. *Pas de fetch d'image vers un service tiers depuis un composant qui rend des URLs sensibles.* Pour QR codes : utilise qrcode npm package server-side, pas api.qrserver.com.

16. *Avant de créer MyComponent.tsx*, grep git ls-files | grep -i mycomponent — si un composant similaire existe déjà, étends-le ou refactor, ne le duplique pas.

## Discipline générale

17. *Si tu trouves un bug en codant ta feature*, OUVRE UNE CARTE sur le board admin (admin_board_cards, tag found-by-claudy, ou via une mini-PR séparée). NE LE FIX PAS dans la même PR — sinon le diff devient inreviewable.

18. *Une PR = un thème.* Si tu touches à 50 fichiers, demande-toi si tu peux split.

19. *Commits avec WHY explicite.* Format : type(scope): one-line summary puis paragraphe qui dit pourquoi ce changement est nécessaire (pas juste quoi). Le diff dit le quoi.

20. *Avant de pusher, audit ton propre diff* :
 
 git diff main..HEAD | grep -E "auth\.getUser|SUPABASE_SERVICE_ROLE_KEY|user_metadata\.role|window\.open|dangerouslySetInnerHTML|RANDOM\(\)|Math\.random\(\).*invit|\.includes.*@"
 
 Si ça matche, c'est probablement une violation des règles 1-16. Re-check.

## Périmètre

21. Tu codes les *nouvelles features* sur les branches feat/*. Tu ne touches pas à audit-* (Alex), tests/* (Claudia), docs/* (documentaliste). Tu n'édites pas non plus lib/api/* ni lib/db/* (helpers — domaine d'Alex).
