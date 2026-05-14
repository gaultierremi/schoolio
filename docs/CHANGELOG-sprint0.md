# Sprint 0 — Maïa Foundation — Changelog

> Records what was removed in Sprint 0 and why. See `docs/superpowers/specs/2026-05-13-maia-mvp-design.md` §2.2 for scope rationale.

## Features removed (out of MVP scope)

### Schoolio Listen — live transcription suggestions for teachers
**Rationale:** Live IA face to student is hors scope per spec §1 (0 IA runtime). Replaced by post-session loop in MVP + manual prof curation.

Files identified for removal (Task 11):
app/live/[code]/page.tsx
app/api/live-sessions/[id]/listen-toggle/route.ts
app/api/live-sessions/[id]/listen-heartbeat/route.ts
app/api/live-sessions/[id]/listen-suggestions/route.ts
app/api/live-sessions/[id]/end/route.ts
supabase/migrations/20260513150000_add_listening_active_to_live_sessions.sql
supabase/migrations/20260513000000_add_ai_listen_origin.sql
components/ui/ContextualQuestionCard.tsx
lib/contextual-questions.ts
components/listen/ListenSection.tsx

### Mission Control — internal admin kanban board
**Rationale:** Internal operations tool, not part of pedagogical product. Will be rebuilt externally if needed.

Files identified for removal (Task 11):
app/admin/board/CardModal.tsx
app/admin/board/page.tsx
app/api/admin/board/route.ts
app/api/admin/board/export/route.ts
app/api/admin/board/[id]/route.ts
app/api/admin/agent-status/route.ts
app/api/mc/update/route.ts
supabase/migrations/20260514000000_create_agent_status.sql
supabase/migrations/20260506000000_create_admin_board_cards.sql

### Beta whitelist + access requests
**Rationale:** Replaced by school-based tenanting + Google OAuth (Sprint 5). Schools onboard via FounderTestGround/explicit invite.

Files identified for removal (Task 10):
middleware.ts
app/join/page.tsx
app/admin/beta-whitelist/page.tsx
app/admin/beta-whitelist/BetaAdminClient.tsx
app/api/beta/request-access/route.ts
app/api/join/route.ts
app/api/admin/beta-whitelist/route.ts
app/api/admin/beta-whitelist/reject/[request_id]/route.ts
app/api/admin/beta-whitelist/approve/[request_id]/route.ts
app/api/admin/beta-whitelist/[id]/route.ts
app/beta-pending/page.tsx
supabase/migrations/20260511200000_beta_whitelist.sql

### Mode "light" — synthetic email accounts
**Rationale:** Replaced by Google OAuth (MVP, Sprint 5) + SSO école (post-MVP). Synthetic emails were a friction-reduction stopgap that adds RGPD risk.

Files identified for removal (Task 9):
app/join/[token]/JoinTokenClient.tsx
app/join/[token]/page.tsx
app/api/classes/route.ts
app/api/classes/validate-token/route.ts
app/api/classes/validate-code/route.ts
app/api/classes/[id]/route.ts
app/api/classes/[id]/assignments/[assignmentId]/details/route.ts
app/api/classes/[id]/assignments/[assignmentId]/dashboard/route.ts
app/api/classes/[id]/join-light/route.ts
app/school/classes/page.tsx
app/school/classes/[id]/page.tsx
supabase/migrations/20260508100000_create_classes_and_memberships.sql

## EU hosting verified (Sprint 0 Task 15)

- **Supabase region** : `eu-west-1` — West EU (Ireland). Instance tier `t4g.nano` (16/60 connections, 56 % RAM at verification time).
- **Vercel function region** : _to verify_ (expected `fra1` or `cdg1` once the project is reconnected to `gaultierremi/maia`).
- **Verified** : 2026-05-13.
- **Compliance** : RGPD data residency requirement satisfied for FW-B pilot.
- **Follow-up for prod** : the `t4g.nano` tier is sized for MVP / smoke-tests; consider scaling up before onboarding the first paying school (~50+ concurrent students).
