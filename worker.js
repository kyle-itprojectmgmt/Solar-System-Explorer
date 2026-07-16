/**
 * Request router (v10.0.14).
 *
 * Workers Static Assets matches on PATH ONLY — the query string is ignored —
 * so `/` and `/?system=mars` resolve to the same asset. Serving the solar map
 * at bare `/` while `/?system=X` still boots the simulator therefore needs a
 * request-time decision, which is what this Worker exists for.
 *
 * SCOPE — this file is routing ONLY. Security headers live in public/_headers
 * and nowhere else (v7 discovery: wrangler.toml has no [[headers]] support for
 * Workers Static Assets). Responses here come straight from env.ASSETS, which
 * applies _headers on the way out. Never set a header in this file.
 *
 * wrangler.toml pairs this with `run_worker_first = ["/"]`. Without that, an
 * asset that exists at the requested path is served WITHOUT invoking the
 * Worker — index.html would win at `/` and the map would never appear.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/' && !url.searchParams.has('system')) {
      return env.ASSETS.fetch(new URL('/solar-map.html', url));
    }

    return env.ASSETS.fetch(request);
  },
};
