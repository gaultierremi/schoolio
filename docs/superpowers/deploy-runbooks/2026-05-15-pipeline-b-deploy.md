# Pipeline B Deploy Runbook (2026-05-15)

## Pré-vérifications

- [ ] PR mergée sur schoolio main
- [ ] Aucun job `question_generation_jobs` en cours (`status in ('pending','running')`)
- [ ] Backup DB pris (Supabase Dashboard → Backups → "Now")

## Séquence ordonnée

### Automatique (recommandé)
```bash
./scripts/deploy.sh
```

### Manuel (pour debug)
1. `supabase db push --linked` — applique migrations
2. Vérifier colonnes en prod : Supabase dashboard → Tables → `teacher_questions`
3. `git push origin main` — pousse code sur schoolio
4. `git push maia origin/main:main` — sync to maia (déclenche Vercel build ~2-3min)
5. `npx trigger.dev@latest deploy --env prod` — redéploie le runner

## Rollback

| Composant | Commande |
|---|---|
| Code | `git revert <commit> && git push origin main && git push maia origin/main:main` |
| Migration | `supabase db push --revert` (irréversible si data utilisé) |
| Trigger.dev | `npx trigger.dev rollback --env prod` |
| Feature flag | Vercel dashboard → Settings → Environment → `PIPELINE_B_ENABLED=false` (effet ~30s) |

## Smoke test

1. Login en tant que prof test
2. Upload syllabus chimie 3ème (corpus FWB)
3. Observer progression stepper (Extraction → Analyse → Génération → Validation)
4. Vérifier au moins 10 questions générées
5. Si pipeline B activé : vérifier au moins 1 question avec `image_url` non-null
