import { createHash } from "node:crypto";
import type { SummaryStore } from "../store/summary-store.js";
import type { LcmMirrorMode, LcmMirrorRow } from "./types.js";

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Build canonical mirror payload from SQLite summaries / context_items.
 * Returns `null` when there is nothing to mirror.
 */
export async function extractMirrorPayload(params: {
  summaryStore: SummaryStore;
  conversationId: number;
  sessionKey: string;
  sessionId: string | undefined;
  agentId: string;
  mode: LcmMirrorMode;
  maxNodes: number;
}): Promise<LcmMirrorRow | null> {
  const { summaryStore, conversationId, sessionKey, sessionId, agentId, mode, maxNodes } = params;

  let summaryIds: string[] = [];
  let content = "";

  if (mode === "root_view") {
    const items = await summaryStore.getContextItems(conversationId);
    const summaryItems = items.filter((i) => i.itemType === "summary" && i.summaryId);
    if (summaryItems.length === 0) {
      return null;
    }
    const parts: string[] = [];
    for (const item of summaryItems) {
      if (!item.summaryId) {
        continue;
      }
      const rec = await summaryStore.getSummary(item.summaryId);
      if (!rec) {
        continue;
      }
      summaryIds.push(rec.summaryId);
      parts.push(rec.content.trim());
    }
    content = parts.filter(Boolean).join("\n\n---\n\n").trim();
  } else {
    const all = await summaryStore.getSummariesByConversation(conversationId);
    if (all.length === 0) {
      return null;
    }
    const sorted = [...all].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const pick = sorted.slice(-maxNodes);
    summaryIds = pick.map((s) => s.summaryId);
    content = pick
      .map((s) => s.content.trim())
      .filter(Boolean)
      .join("\n\n---\n\n")
      .trim();
  }

  if (!content) {
    return null;
  }

  const canonical = JSON.stringify({
    m: mode,
    ids: [...summaryIds].sort(),
    c: content,
  });
  const contentHash = sha256Hex(canonical);

  return {
    sessionKey,
    sessionId,
    conversationId,
    agentId,
    mode,
    content,
    summaryIds,
    contentHash,
    capturedAtIso: new Date().toISOString(),
  };
}
