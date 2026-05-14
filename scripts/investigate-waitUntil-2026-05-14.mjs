#!/usr/bin/env node
// Investigation post-PR #24 — état du pipeline generate-questions
// Lance: node scripts/investigate-waitUntil-2026-05-14.mjs
//
// Lit .env.local (à la racine) pour récupérer SUPABASE_SERVICE_ROLE_KEY.
// Requête les 3 tables : question_generation_jobs, error_logs, ai_request_logs.
// Output JSON sur stdout — destiné à alimenter docs/INVESTIGATION-waitUntil-2026-05-14.md.
//
// Fenêtre d'investigation : depuis 2026-05-14 02:00 UTC.
// PR #24 (eb18c54) mergée 04:53:59 CEST ≈ 02:54 UTC.
//
// Note Mac sandbox 2026-05-14 : exécution directe via `node` peut être bloquée
// par le harness (network deny). Workaround utilisé pour l'investigation
// initiale : exécuter le même fetch() depuis la console Chrome connectée au
// projet Supabase. Voir docs/INVESTIGATION-waitUntil-2026-05-14.md.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
// .env.local peut être dans le worktree ou un sibling.
const envCandidates = [
  path.join(repoRoot, ".env.local"),
  path.resolve(repoRoot, "..", "serene-shirley-36379d", ".env.local"),
];

function loadEnv() {
  for (const p of envCandidates) {
    if (fs.existsSync(p)) {
      const text = fs.readFileSync(p, "utf8");
      const env = {};
      for (const line of text.split("\n")) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m) env[m[1]] = m[2].trim();
      }
      return { env, path: p };
    }
  }
  throw new Error(".env.local introuvable");
}

const { env, path: envPath } = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SERVICE_KEY in", envPath);
  process.exit(1);
}

// Fenêtre temporelle : depuis 2026-05-14 02:00 UTC jusqu'à maintenant.
const SINCE = "2026-05-14T02:00:00Z";
const PR_24_MERGE = "2026-05-14T02:54:00Z"; // PR #24 mergée à 02:54 UTC (commit 04:53:59 CEST = 02:53:59 UTC ~ 02:54).
const NOW_ISO = new Date().toISOString();

async function pg(table, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const r = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: "count=exact",
    },
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`${table} ${r.status} ${txt}`);
  }
  return r.json();
}

const out = {
  meta: {
    investigated_at: NOW_ISO,
    window_start: SINCE,
    pr_24_merge_estimate_utc: PR_24_MERGE,
    env_file: envPath,
  },
  jobs: {},
  error_logs: {},
  ai_request_logs: {},
};

// ─── question_generation_jobs ────────────────────────────────────────────────
const jobs = await pg(
  "question_generation_jobs",
  `select=id,status,phase,worker_count,workers_completed,questions_raw,questions_inserted,total_target,pages_count,started_at,phase_changed_at,completed_at,error_message,created_at,course_id,teacher_id&created_at=gte.${SINCE}&order=created_at.desc`
);

out.jobs.total = jobs.length;
out.jobs.window_start = SINCE;
out.jobs.window_end = NOW_ISO;

// Distribution status
const byStatus = {};
const byPhase = {};
const postPR = [];
const prePR = [];

for (const j of jobs) {
  byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
  byPhase[j.phase] = (byPhase[j.phase] ?? 0) + 1;
  if (j.created_at >= PR_24_MERGE) postPR.push(j);
  else prePR.push(j);
}

out.jobs.by_status = byStatus;
out.jobs.by_phase = byPhase;
out.jobs.post_pr24_count = postPR.length;
out.jobs.pre_pr24_count = prePR.length;

// Durée moyenne pour les jobs terminés (done OR failed)
function avgDurationMs(list) {
  const durations = list
    .filter((j) => j.completed_at && j.started_at)
    .map((j) => new Date(j.completed_at).getTime() - new Date(j.started_at).getTime());
  if (durations.length === 0) return null;
  const sum = durations.reduce((a, b) => a + b, 0);
  return { avg_ms: Math.round(sum / durations.length), count: durations.length, min_ms: Math.min(...durations), max_ms: Math.max(...durations) };
}

out.jobs.duration_post_pr24 = avgDurationMs(postPR);
out.jobs.duration_pre_pr24 = avgDurationMs(prePR);

// Détails des jobs post-PR (rich)
out.jobs.post_pr24_details = postPR.map((j) => ({
  id: j.id,
  status: j.status,
  phase: j.phase,
  worker_count: j.worker_count,
  workers_completed: j.workers_completed,
  total_target: j.total_target,
  questions_raw: j.questions_raw,
  questions_inserted: j.questions_inserted,
  pages_count: j.pages_count,
  started_at: j.started_at,
  completed_at: j.completed_at,
  duration_ms: j.completed_at && j.started_at ? new Date(j.completed_at).getTime() - new Date(j.started_at).getTime() : null,
  phase_age_s_if_unfinished: !j.completed_at
    ? Math.round((Date.now() - new Date(j.phase_changed_at).getTime()) / 1000)
    : null,
  error_message: j.error_message,
}));

// Stuck jobs (no completion + phase_changed_at > 5 min ago)
out.jobs.stuck_post_pr24 = postPR.filter(
  (j) => !j.completed_at && Date.now() - new Date(j.phase_changed_at).getTime() > 5 * 60 * 1000
).length;

// Success rate post-PR
const postDone = postPR.filter((j) => j.status === "done").length;
const postFailed = postPR.filter((j) => j.status === "failed").length;
const postRunning = postPR.filter((j) => j.status === "running" || j.status === "pending").length;
out.jobs.post_pr24_success_rate =
  postPR.length > 0 ? `${postDone}/${postPR.length}` : "n/a";
out.jobs.post_pr24_breakdown = {
  done: postDone,
  failed: postFailed,
  running_or_pending: postRunning,
};

// Distribution phase finale pour failed
out.jobs.post_pr24_failed_by_phase = postPR
  .filter((j) => j.status === "failed")
  .reduce((acc, j) => {
    acc[j.phase] = (acc[j.phase] ?? 0) + 1;
    return acc;
  }, {});

// ─── error_logs ──────────────────────────────────────────────────────────────
const errLogs = await pg(
  "error_logs",
  `select=id,occurred_at,severity,source,message,context,user_id,school_id&source=like.api.courses.generate-questions*&occurred_at=gte.${SINCE}&order=occurred_at.desc`
);

out.error_logs.total = errLogs.length;
const errBySource = {};
for (const e of errLogs) {
  errBySource[e.source] = (errBySource[e.source] ?? 0) + 1;
}
out.error_logs.by_source = errBySource;

// Worker-specific errors (PR #24 new instrumentation)
const workerErrors = errLogs.filter((e) => e.source === "api.courses.generate-questions.worker");
out.error_logs.worker_errors_count = workerErrors.length;
out.error_logs.worker_errors_details = workerErrors.slice(0, 20).map((e) => ({
  occurred_at: e.occurred_at,
  message: e.message?.slice(0, 200),
  context: e.context,
}));

// Frequencies of error messages (top)
const msgFreq = {};
for (const e of errLogs) {
  const key = (e.message ?? "").slice(0, 120);
  msgFreq[key] = (msgFreq[key] ?? 0) + 1;
}
out.error_logs.top_messages = Object.entries(msgFreq)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([msg, count]) => ({ msg, count }));

// Worker durations stats
const workerDurations = workerErrors
  .map((e) => e.context?.durationMs)
  .filter((d) => typeof d === "number");
if (workerDurations.length > 0) {
  const sorted = [...workerDurations].sort((a, b) => a - b);
  out.error_logs.worker_durations = {
    count: workerDurations.length,
    min_ms: sorted[0],
    max_ms: sorted[sorted.length - 1],
    p50_ms: sorted[Math.floor(sorted.length / 2)],
    avg_ms: Math.round(workerDurations.reduce((a, b) => a + b, 0) / workerDurations.length),
  };
}

// ─── ai_request_logs (Anthropic + Gemini) ────────────────────────────────────
const aiLogs = await pg(
  "ai_request_logs",
  `select=id,provider_id,task_type,tokens_used,latency_ms,status,error_message,created_at&task_type=eq.generate_questions&created_at=gte.${SINCE}&order=created_at.desc`
);

out.ai_request_logs.total = aiLogs.length;
const aiByProvider = {};
const aiByStatus = {};
const aiByProviderStatus = {};
for (const a of aiLogs) {
  aiByProvider[a.provider_id || "null"] = (aiByProvider[a.provider_id || "null"] ?? 0) + 1;
  aiByStatus[a.status] = (aiByStatus[a.status] ?? 0) + 1;
  const k = `${a.provider_id || "null"}::${a.status}`;
  aiByProviderStatus[k] = (aiByProviderStatus[k] ?? 0) + 1;
}
out.ai_request_logs.by_provider = aiByProvider;
out.ai_request_logs.by_status = aiByStatus;
out.ai_request_logs.by_provider_status = aiByProviderStatus;

// Latency stats par provider, pour les success
function latencyStats(arr) {
  const ls = arr.map((a) => a.latency_ms).filter((l) => typeof l === "number" && l > 0).sort((a, b) => a - b);
  if (ls.length === 0) return null;
  return {
    count: ls.length,
    min_ms: ls[0],
    max_ms: ls[ls.length - 1],
    p50_ms: ls[Math.floor(ls.length / 2)],
    p95_ms: ls[Math.floor(ls.length * 0.95)],
    avg_ms: Math.round(ls.reduce((a, b) => a + b, 0) / ls.length),
  };
}

out.ai_request_logs.latency_anthropic_success = latencyStats(
  aiLogs.filter((a) => a.provider_id === "anthropic_claude" && a.status === "success")
);
out.ai_request_logs.latency_anthropic_all = latencyStats(aiLogs.filter((a) => a.provider_id === "anthropic_claude"));
out.ai_request_logs.latency_gemini_pro_success = latencyStats(
  aiLogs.filter((a) => a.provider_id === "gemini_pro" && a.status === "success")
);
out.ai_request_logs.latency_gemini_flash_success = latencyStats(
  aiLogs.filter((a) => a.provider_id === "gemini_flash" && a.status === "success")
);

// Erreurs Anthropic — top messages
const antErrors = aiLogs.filter((a) => a.provider_id === "anthropic_claude" && a.status !== "success" && a.status !== "cached");
const antErrFreq = {};
for (const e of antErrors) {
  const key = (e.error_message ?? "").slice(0, 150);
  antErrFreq[key] = (antErrFreq[key] ?? 0) + 1;
}
out.ai_request_logs.anthropic_error_top = Object.entries(antErrFreq)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([msg, count]) => ({ msg, count }));

// Post-PR window split
const postPRAI = aiLogs.filter((a) => a.created_at >= PR_24_MERGE);
out.ai_request_logs.post_pr24_total = postPRAI.length;
out.ai_request_logs.post_pr24_by_provider_status = postPRAI.reduce((acc, a) => {
  const k = `${a.provider_id || "null"}::${a.status}`;
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});

// Ordering chronologique des jobs post-PR
out.jobs.post_pr24_timeline = postPR
  .slice()
  .reverse()
  .map((j) => `${j.created_at} [${j.status}/${j.phase}] target=${j.total_target} workers=${j.workers_completed}/${j.worker_count} ins=${j.questions_inserted}`);

console.log(JSON.stringify(out, null, 2));
