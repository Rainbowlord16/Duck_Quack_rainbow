// Connect the game to its anonymous Cloudflare Worker backend.
window.DUCK_QUACK_API_URL = "https://duck-quack-api.herish-kondeti.workers.dev";

import("./client.js").then(async ({ createDuckQuackApi }) => {
  const api = createDuckQuackApi(window.DUCK_QUACK_API_URL);
  window.DuckQuackApi = api;
  try {
    const player = await api.ensureIdentity();
    window.applyDuckQuackPlayer?.(player);
    window.dispatchEvent(new CustomEvent("duckquack:connected", { detail: { player } }));
  } catch (error) {
    console.error("Duck Quack player connection failed:", error);
    window.dispatchEvent(new CustomEvent("duckquack:connection-error", { detail: { message: error?.message || "Connection failed" } }));
  }
}).catch((error) => console.error("Duck Quack API client could not be loaded:", error));
