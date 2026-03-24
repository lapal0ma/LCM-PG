#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { DatabaseSync } from "node:sqlite";

function expandHome(input) {
  if (!input) return input;
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return resolve(homedir(), input.slice(2));
  return resolve(input);
}

function parseArgs(argv) {
  const out = {
    sqlite: "~/.openclaw/lcm.db",
    out: ".demo-local/tob-dashboard/redacted-corpus.jsonl",
    limit: 180,
    minChars: 120,
    maxChars: 1200,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--sqlite" && next) {
      out.sqlite = next;
      i += 1;
      continue;
    }
    if (token === "--out" && next) {
      out.out = next;
      i += 1;
      continue;
    }
    if (token === "--limit" && next) {
      out.limit = Math.max(1, Number.parseInt(next, 10) || out.limit);
      i += 1;
      continue;
    }
    if (token === "--min-chars" && next) {
      out.minChars = Math.max(1, Number.parseInt(next, 10) || out.minChars);
      i += 1;
      continue;
    }
    if (token === "--max-chars" && next) {
      out.maxChars = Math.max(80, Number.parseInt(next, 10) || out.maxChars);
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log(`Usage:
  node scripts/tob-dashboard/local/extract-redacted-corpus.mjs [options]

Options:
  --sqlite <path>      Source LCM SQLite DB (default: ~/.openclaw/lcm.db)
  --out <path>         Output JSONL (default: .demo-local/tob-dashboard/redacted-corpus.jsonl)
  --limit <n>          Max summary rows to extract (default: 180)
  --min-chars <n>      Minimum source content length (default: 120)
  --max-chars <n>      Max chars per redacted snippet (default: 1200)
`);
      process.exit(0);
    }
  }
  return out;
}

function parseAgentId(sessionKey, sessionId) {
  if (typeof sessionKey === "string" && sessionKey.startsWith("agent:")) {
    const parts = sessionKey.split(":");
    if (parts.length >= 2 && parts[1]?.trim()) {
      return parts[1].trim();
    }
  }
  if (typeof sessionId === "string" && sessionId.trim()) {
    return "main";
  }
  return "unknown";
}

function normalizeText(input) {
  return String(input ?? "").replace(/\s+/g, " ").trim();
}

function redactText(input) {
  let text = normalizeText(input);
  if (!text) return text;

  const replacements = [
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]"],
    [/\bhttps?:\/\/[^\s/$.?#].[^\s]*/gi, "[REDACTED_URL]"],
    [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[REDACTED_IP]"],
    [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]"],
    [/\b(?:ghp|github_pat|xox[baprs]|sk|rk)-[A-Za-z0-9_\-]{16,}\b/g, "[REDACTED_SECRET]"],
    [/\b[a-f0-9]{32,}\b/gi, "[REDACTED_HASH]"],
    [/(?:\/Users\/[^\s"'`]+|\/home\/[^\s"'`]+|[A-Za-z]:\\[^\s"'`]+)/g, "[REDACTED_PATH]"],
    [/\b\d{7,}\b/g, "[REDACTED_NUMBER]"],
    [/\+?\d[\d\-\s().]{7,}\d/g, "[REDACTED_PHONE]"],
  ];

  for (const [pattern, token] of replacements) {
    text = text.replace(pattern, token);
  }

  return normalizeText(text);
}

function truncateText(input, maxChars) {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, Math.max(0, maxChars - 3))}...`;
}

function ensureTables(db) {
  const rows = db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type='table'
         AND name IN ('summaries', 'conversations')`,
    )
    .all();
  const names = new Set(rows.map((row) => String(row.name)));
  if (!names.has("summaries") || !names.has("conversations")) {
    throw new Error("Source SQLite DB does not look like an LCM database (missing summaries/conversations).");
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sqlitePath = expandHome(args.sqlite);
  const outPath = expandHome(args.out);

  if (!existsSync(sqlitePath)) {
    throw new Error(`SQLite DB not found: ${sqlitePath}`);
  }

  const db = new DatabaseSync(sqlitePath);
  ensureTables(db);

  const rows = db
    .prepare(
      `SELECT
         s.summary_id,
         s.conversation_id,
         s.kind,
         s.depth,
         s.content,
         s.created_at,
         c.session_key,
         c.session_id
       FROM summaries s
       JOIN conversations c
         ON c.conversation_id = s.conversation_id
       WHERE length(trim(s.content)) >= ?
       ORDER BY s.created_at DESC
       LIMIT ?`,
    )
    .all(args.minChars, args.limit);

  const outRows = [];
  for (const row of rows) {
    const redacted = truncateText(redactText(row.content), args.maxChars);
    if (!redacted) continue;
    const agentId = parseAgentId(row.session_key, row.session_id);
    outRows.push({
      record_id: `${agentId}:${row.summary_id}`,
      agent_id: agentId,
      summary_id: String(row.summary_id),
      conversation_id: Number(row.conversation_id),
      kind: String(row.kind ?? ""),
      depth: Number(row.depth ?? 0),
      created_at: String(row.created_at ?? ""),
      source: "openclaw-lcm-sqlite",
      text: redacted,
    });
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, outRows.map((r) => JSON.stringify(r)).join("\n") + (outRows.length ? "\n" : ""));

  const byAgent = new Map();
  for (const row of outRows) {
    byAgent.set(row.agent_id, (byAgent.get(row.agent_id) ?? 0) + 1);
  }

  console.log(`[lcm-pg] redacted corpus written: ${outPath}`);
  console.log(`[lcm-pg] rows=${outRows.length} (requested limit=${args.limit})`);
  for (const [agent, count] of [...byAgent.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`[lcm-pg] agent=${agent} rows=${count}`);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[lcm-pg] extract-redacted-corpus failed: ${message}`);
  process.exit(1);
}
