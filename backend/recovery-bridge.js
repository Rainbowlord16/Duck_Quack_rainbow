// Configure this after the Cloudflare Worker is deployed.
window.DUCK_QUACK_API_URL = window.DUCK_QUACK_API_URL || "";
if (window.DUCK_QUACK_API_URL) {
  import("./client.js").then(({ createDuckQuackApi }) => {
    window.DuckQuackApi = createDuckQuackApi(window.DUCK_QUACK_API_URL);
  }).catch(() => console.error("Duck Quack API client could not be loaded."));
}
