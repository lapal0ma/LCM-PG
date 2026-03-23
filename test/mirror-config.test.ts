import { describe, expect, it } from "vitest";
import { resolveLcmMirrorConfig } from "../src/mirror/config.js";

describe("resolveLcmMirrorConfig shared knowledge defaults", () => {
  it("disables shared knowledge features when mirror is disabled", () => {
    const cfg = resolveLcmMirrorConfig(
      {
        LCM_MIRROR_ENABLED: "false",
      } as NodeJS.ProcessEnv,
      {},
    );
    expect(cfg.enabled).toBe(false);
    expect(cfg.sharedKnowledgeEnabled).toBe(false);
    expect(cfg.assembleSharedKnowledge).toBe(false);
  });

  it("enables shared knowledge defaults when mirror is enabled", () => {
    const cfg = resolveLcmMirrorConfig(
      {
        LCM_MIRROR_ENABLED: "true",
        LCM_MIRROR_DATABASE_URL: "postgresql://main:test@localhost:5432/lcm",
      } as NodeJS.ProcessEnv,
      {},
    );
    expect(cfg.enabled).toBe(true);
    expect(cfg.sharedKnowledgeEnabled).toBe(true);
    expect(cfg.assembleSharedKnowledge).toBe(true);
    expect(cfg.assembleSharedKnowledgeLimit).toBe(5);
    expect(cfg.assembleSharedKnowledgeMaxTokens).toBe(2000);
    expect(cfg.assembleSharedKnowledgeTimeoutMs).toBe(500);
    expect(cfg.adminRoleName).toBe("admin");
    expect(cfg.roleBootstrapMap.main).toContain("admin");
    expect(cfg.roleBootstrapMap.research).toContain("researcher");
    expect(cfg.roleBootstrapMap.email).toContain("personal-ops");
  });

  it("applies bootstrap admin ids and role bootstrap map overrides", () => {
    const cfg = resolveLcmMirrorConfig(
      {
        LCM_MIRROR_ENABLED: "true",
        LCM_MIRROR_DATABASE_URL: "postgresql://main:test@localhost:5432/lcm",
        LCM_ADMIN_ROLE_NAME: "ops-admin",
        LCM_ADMIN_AGENT_IDS: "main,security",
        LCM_ROLE_BOOTSTRAP_MAP: JSON.stringify({
          security: ["compliance"],
        }),
      } as NodeJS.ProcessEnv,
      {},
    );
    expect(cfg.adminRoleName).toBe("ops-admin");
    expect(cfg.bootstrapAdminAgentIds).toEqual(["main", "security"]);
    expect(cfg.roleBootstrapMap.main).toContain("ops-admin");
    expect(cfg.roleBootstrapMap.security).toEqual(expect.arrayContaining(["compliance", "ops-admin"]));
  });
});
