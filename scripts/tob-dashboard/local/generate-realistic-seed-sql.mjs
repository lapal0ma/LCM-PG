#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";

function expandHome(input) {
  if (!input) return input;
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return resolve(homedir(), input.slice(2));
  return resolve(input);
}

function parseArgs(argv) {
  const out = {
    corpus: ".demo-local/tob-dashboard/redacted-corpus.jsonl",
    outSql: ".demo-local/tob-dashboard/generated/realistic_seed_v1.demo.local.sql",
    mirrorRows: 320,
    sharedRows: 60,
    hours: 72,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--corpus" && next) {
      out.corpus = next;
      i += 1;
      continue;
    }
    if (token === "--out-sql" && next) {
      out.outSql = next;
      i += 1;
      continue;
    }
    if (token === "--mirror-rows" && next) {
      out.mirrorRows = Math.max(1, Number.parseInt(next, 10) || out.mirrorRows);
      i += 1;
      continue;
    }
    if (token === "--shared-rows" && next) {
      out.sharedRows = Math.max(1, Number.parseInt(next, 10) || out.sharedRows);
      i += 1;
      continue;
    }
    if (token === "--hours" && next) {
      out.hours = Math.max(1, Number.parseInt(next, 10) || out.hours);
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log(`Usage:
  node scripts/tob-dashboard/local/generate-realistic-seed-sql.mjs [options]

Options:
  --corpus <path>       Input redacted JSONL (default: .demo-local/tob-dashboard/redacted-corpus.jsonl)
  --out-sql <path>      Output SQL file (default: .demo-local/tob-dashboard/generated/realistic_seed_v1.demo.local.sql)
  --mirror-rows <n>     Target mirror rows (default: 320)
  --shared-rows <n>     Target shared knowledge rows (default: 60)
  --hours <n>           Time window in hours for generated timestamps (default: 72)
`);
      process.exit(0);
    }
  }
  return out;
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function uuidFromSeed(seed) {
  const h = stableHash(seed);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function sqlLiteral(value) {
  if (value == null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonLiteral(value) {
  return sqlLiteral(JSON.stringify(value));
}

function textArrayLiteral(items) {
  if (!items || items.length === 0) return "ARRAY[]::text[]";
  const body = items.map((item) => sqlLiteral(item)).join(", ");
  return `ARRAY[${body}]::text[]`;
}

function uuidArrayLiteral(items) {
  if (!items || items.length === 0) return "ARRAY[]::uuid[]";
  const body = items.map((item) => `${sqlLiteral(item)}::uuid`).join(", ");
  return `ARRAY[${body}]::uuid[]`;
}

function normalize(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function extractTags(text) {
  const t = text.toLowerCase();
  const out = new Set();
  const rules = [
    { tag: "latency", re: /\blatency\b|\bcold\s*start\b|\bp95\b|\bp50\b|\bresponse\b/ },
    { tag: "cost", re: /\bcost\b|\btco\b|\bpricing\b|\bbudget\b|\bspend\b/ },
    { tag: "compliance", re: /\bcompliance\b|\bsoc2\b|\bgdpr\b|\bhipaa\b|\bpolicy\b/ },
    { tag: "risk", re: /\brisk\b|\btrade[- ]?off\b|\bissue\b|\bgap\b/ },
    { tag: "timeline", re: /\btimeline\b|\bweek\b|\bmonth\b|\bdeadline\b/ },
    { tag: "migration", re: /\bmigration\b|\bmigrate\b|\brollout\b/ },
    { tag: "ops", re: /\bops\b|\boperation\b|\breliability\b|\bon[- ]?call\b/ },
    { tag: "security", re: /\bsecurity\b|\bsecret\b|\bauth\b|\baccess\b/ },
    { tag: "architecture", re: /\barchitecture\b|\bdesign\b|\bsystem\b|\bcomponent\b/ },
    { tag: "decision", re: /\bdecision\b|\brecommend\b|\bconclusion\b/ },
    { tag: "waf", re: /\bwaf\b|\bfirewall\b/ },
    { tag: "cold-start", re: /\bcold[- ]?start\b/ },
  ];

  for (const rule of rules) {
    if (rule.re.test(t)) out.add(rule.tag);
  }
  if (out.size === 0) out.add("ops");
  return [...out].slice(0, 3);
}

function visibilityForIndex(i) {
  if (i % 10 === 0) return "private";
  if (i % 10 <= 3) return "restricted";
  return "shared";
}

function roleForTags(tags) {
  if (tags.includes("compliance") || tags.includes("security")) return "compliance-reviewer";
  if (tags.includes("cost")) return "cost-analyst";
  return "researcher";
}

function titleFromTags(tags, index) {
  const first = tags[0] ?? "ops";
  return `Realistic Demo Knowledge ${index}: ${first}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const corpusPath = expandHome(args.corpus);
  const outSqlPath = expandHome(args.outSql);

  if (!existsSync(corpusPath)) {
    throw new Error(`Corpus not found: ${corpusPath}`);
  }

  const corpus = readFileSync(corpusPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((row) => typeof row.text === "string" && row.text.trim().length > 0);

  if (corpus.length === 0) {
    throw new Error("Corpus is empty after parsing/redaction.");
  }

  const now = Date.now();
  const mirrorRows = [];
  for (let i = 0; i < args.mirrorRows; i += 1) {
    const base = corpus[i % corpus.length];
    const tsOffsetMs = Math.floor((i / Math.max(1, args.mirrorRows - 1)) * args.hours * 3600 * 1000);
    const capturedAt = new Date(now - ((args.hours * 3600 * 1000) - tsOffsetMs));
    const agentId = String(base.agent_id || "main").trim() || "main";
    const convSeed = `${agentId}:${base.conversation_id ?? 0}:${Math.floor(i / 6)}`;
    const conversationId = Number.parseInt(stableHash(convSeed).slice(0, 12), 16) % 900000000;
    const summaryA = `sum_${stableHash(`${base.summary_id}:${i}:a`).slice(0, 12)}`;
    const summaryB = `sum_${stableHash(`${base.summary_id}:${i}:b`).slice(0, 12)}`;
    const content = normalize(
      `Agent ${agentId} synthesized update. ${base.text} Focus lane: ${extractTags(base.text).join(", ")}.`,
    );

    mirrorRows.push({
      sessionKey: `agent:${agentId}:realistic-demo-${(i % 6) + 1}`,
      conversationId,
      agentId,
      mode: i % 2 === 0 ? "latest_nodes" : "root_view",
      content,
      summaryIds: [summaryA, summaryB],
      contentHash: stableHash(`mirror|${conversationId}|${capturedAt.toISOString()}|${content}`).slice(0, 64),
      sessionId: `realistic-session-${agentId}-${(i % 6) + 1}`,
      capturedAt: capturedAt.toISOString(),
    });
  }

  const sharedRows = [];
  for (let i = 0; i < args.sharedRows; i += 1) {
    const base = corpus[(i * 3) % corpus.length];
    const tags = extractTags(base.text);
    const visibility = visibilityForIndex(i + 1);
    const ownerAgentId = String(base.agent_id || "main").trim() || "main";
    const visibleRole = roleForTags(tags);
    const knowledgeId = uuidFromSeed(`knowledge|${ownerAgentId}|${i}|${base.summary_id}`);
    const createdAt = new Date(now - (args.sharedRows - i) * 3600 * 1000);
    const updatedAt = new Date(createdAt.getTime() + 30 * 60 * 1000);

    sharedRows.push({
      knowledgeId,
      ownerAgentId,
      visibility,
      visibleTo: visibility === "restricted" ? [visibleRole] : [],
      editableBy: visibility === "private" ? [] : ["admin"],
      title: titleFromTags(tags, i + 1),
      content: normalize(
        `Curated from redacted workspace corpus. ${base.text} Recommended action: review with ${visibleRole}.`,
      ),
      sourceMirrorIds: [],
      tags,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  }

  const sql = [];
  sql.push("-- Generated by scripts/tob-dashboard/local/generate-realistic-seed-sql.mjs");
  sql.push("-- Local-only artifact. Do NOT commit generated realistic data.");
  sql.push("BEGIN;");
  sql.push("");
  sql.push("INSERT INTO knowledge_roles (agent_id, role) VALUES");
  sql.push("  ('main', 'admin'),");
  sql.push("  ('infra', 'researcher'),");
  sql.push("  ('finance', 'cost-analyst'),");
  sql.push("  ('security', 'compliance-reviewer')");
  sql.push("ON CONFLICT (agent_id, role) DO NOTHING;");
  sql.push("");
  sql.push("SELECT set_config('app.agent_id', 'main', true);");
  sql.push("SELECT set_config('app.admin_role', 'admin', true);");
  sql.push("");

  sql.push("INSERT INTO lcm_mirror (");
  sql.push("  session_key, conversation_id, agent_id, mode, content, summary_ids, content_hash, session_id, captured_at");
  sql.push(") VALUES");
  sql.push(
    mirrorRows
      .map((row) => {
        return `  (${[
          sqlLiteral(row.sessionKey),
          row.conversationId,
          sqlLiteral(row.agentId),
          sqlLiteral(row.mode),
          sqlLiteral(row.content),
          `${jsonLiteral(row.summaryIds)}::jsonb`,
          sqlLiteral(row.contentHash),
          sqlLiteral(row.sessionId),
          `${sqlLiteral(row.capturedAt)}::timestamptz`,
        ].join(", ")})`;
      })
      .join(",\n"),
  );
  sql.push("ON CONFLICT (conversation_id, content_hash) DO NOTHING;");
  sql.push("");

  sql.push("INSERT INTO shared_knowledge (");
  sql.push("  knowledge_id, owner_agent_id, visibility, visible_to, editable_by, title, content, source_mirror_ids, tags, created_at, updated_at");
  sql.push(") VALUES");
  sql.push(
    sharedRows
      .map((row) => {
        return `  (${[
          `${sqlLiteral(row.knowledgeId)}::uuid`,
          sqlLiteral(row.ownerAgentId),
          sqlLiteral(row.visibility),
          textArrayLiteral(row.visibleTo),
          textArrayLiteral(row.editableBy),
          sqlLiteral(row.title),
          sqlLiteral(row.content),
          uuidArrayLiteral(row.sourceMirrorIds),
          textArrayLiteral(row.tags),
          `${sqlLiteral(row.createdAt)}::timestamptz`,
          `${sqlLiteral(row.updatedAt)}::timestamptz`,
        ].join(", ")})`;
      })
      .join(",\n"),
  );
  sql.push("ON CONFLICT (knowledge_id) DO NOTHING;");
  sql.push("");
  sql.push("COMMIT;");
  sql.push("");
  sql.push("SELECT 'lcm_mirror_rows' AS metric, count(*)::bigint AS value FROM lcm_mirror");
  sql.push("UNION ALL");
  sql.push("SELECT 'shared_knowledge_rows' AS metric, count(*)::bigint AS value FROM shared_knowledge");
  sql.push("UNION ALL");
  sql.push("SELECT 'knowledge_roles_rows' AS metric, count(*)::bigint AS value FROM knowledge_roles;");

  mkdirSync(dirname(outSqlPath), { recursive: true });
  writeFileSync(outSqlPath, `${sql.join("\n")}\n`);

  console.log(`[lcm-pg] realistic SQL seed generated: ${outSqlPath}`);
  console.log(`[lcm-pg] mirror_rows=${mirrorRows.length} shared_rows=${sharedRows.length} corpus_rows=${corpus.length}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[lcm-pg] generate-realistic-seed-sql failed: ${message}`);
  process.exit(1);
}
