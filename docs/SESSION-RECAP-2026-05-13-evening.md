# Session recap — 13 mai 2026 soir

## État du projet

Sprint 0 + 0.5 + 1 mergés. Pipeline ingestion architecture finale (PR #11) : Anthropic PDF → markdown stocké → Claude adaptive sections → theory generation. Mission Control restauré + 26 cartes seedées qui reflètent l'état réel.

## Source de vérité

**Tout l'état détaillé du projet est sur `/admin/board`** (https://schoolio-two.vercel.app/admin/board). 26 cartes : 10 done + 5 in-progress + 10 backlog.

Pour le reste, lit ce qui est utile au moment où c'est utile :
- Code state → `git log main --oneline -20`
- DB state → `curl POST api.supabase.com/v1/projects/zaazzzhonlgicctrewqn/database/query` (token sous `.env.local`)
- Specs → `docs/superpowers/specs/2026-05-13-maia-mvp-design.md`
- Plans sprints → `docs/superpowers/plans/2026-05-13-maia-sprint*.md`

## Prochaine action

**Priorité 1** : Alex doit tester E2E ingestion sur `~/Desktop/jury-histoire.pdf` (114KB, 27 pages, sans markers UAA — c'est le bon stress-test pour la détection adaptive). Path : `/school/syllabus/upload` → Histoire CESS G → upload → Mode rapide coché → submit → status page poll. Si done + theory_blocks remplis → Sprint 1 vraiment livré.

**Priorité 2 (si Priorité 1 OK)** : écrire plan Sprint 2 — curation prof.

## Prompt suggéré pour la nouvelle session

```
Lis docs/SESSION-RECAP-2026-05-13-evening.md.
Reprends par tester E2E ingestion sur jury-histoire.pdf, sinon plan Sprint 2.
```

(~50 lignes max, contre 200+ avant. Le détail est sur le kanban + dans le code + dans les memory files.)
