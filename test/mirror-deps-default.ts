import { resolveLcmMirrorConfig } from "../src/mirror/config.js";

/** Default mirror config for tests (PG mirror off). */
export const mirrorConfigDisabled = resolveLcmMirrorConfig({ LCM_MIRROR_ENABLED: "false" }, {});
