// ─────────────────────────────────────────────────────────────────────────────
//  Live decor data, straight from the bot-panel on every visit.
//
//  The panel can move between VPS, each with its own domain, so it is found the
//  way panel-launcher finds it: every domain answers GET /api/health, and the
//  active panel with the highest epoch wins. Its public, read-only
//  /api/public/decors routes then give the lists.
//
//  Vercel's edge keeps each answer CACHE_S seconds (and serves the last one
//  while refreshing), so a visit is fast and the panel is asked about once a
//  minute. If no panel answers, this returns 503 and the page falls back to the
//  data/*.json snapshot (assets/js/api.js).
//
//    PANEL_DOMAINS  optional: a.com,b.com — overrides DEFAULT_DOMAINS below
//                   (keep in step with panel-launcher's panels.json)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_DOMAINS = ["panel1.thunderbolt.io.vn", "panel2.thunderbolt.io.vn", "panel3.thunderbolt.io.vn", "panel4.thunderbolt.io.vn"];

const PROBE_TIMEOUT_MS = 3500;
const DATA_TIMEOUT_MS = 8000;
const LOCATE_CACHE_MS = 60_000; // a warm instance remembers where the panel was
const CACHE_S = 60;

const seeds = () =>
    (process.env.PANEL_DOMAINS ? process.env.PANEL_DOMAINS.split(",") : DEFAULT_DOMAINS)
        .map((d) => String(d).trim())
        .filter(Boolean)
        .map((d) => (/^https?:\/\//.test(d) ? d : `https://${d}`).replace(/\/+$/, ""));

const originOf = (u) => {
    try {
        const x = new URL(u);
        return x.protocol === "https:" || x.protocol === "http:" ? x.origin : null;
    } catch {
        return null;
    }
};

const probe = async (base) => {
    try {
        const res = await fetch(`${base}/api/health`, {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        const body = await res.json();
        return { state: body.state, epoch: Number(body.epoch) || 0, url: originOf(body.url) || originOf(res.url) };
    } catch {
        return null;
    }
};

let located = null;

/** Origin of the active panel (highest epoch), or null when none answers. */
const locate = async () => {
    if (located && Date.now() - located.at < LOCATE_CACHE_MS) return located.url;
    const answers = await Promise.all(seeds().map(probe));
    const best = answers.filter((a) => a?.state === "active" && a.url).sort((a, b) => b.epoch - a.epoch)[0];
    located = best ? { at: Date.now(), url: best.url } : null;
    return best?.url || null;
};

const fetchFromPanel = async (path) => {
    const base = await locate();
    if (!base) throw new Error("No panel is answering");
    const res = await fetch(`${base}/api/public/decors${path}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(DATA_TIMEOUT_MS),
    });
    if (!res.ok) {
        located = null; // ask every domain again next time
        throw new Error(`Panel answered ${res.status}`);
    }
    // A panel without these routes answers with its SPA's index.html (200).
    if (!/application\/json/.test(res.headers.get("content-type") || "")) {
        throw new Error("Panel has no /api/public/decors yet (update the panel)");
    }
    return res.text();
};

/** A Vercel function that passes /api/public/decors<path> through. */
const handler = (path) => async (req, res) => {
    try {
        const body = await fetchFromPanel(path);
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.setHeader("cache-control", `public, max-age=0, s-maxage=${CACHE_S}, stale-while-revalidate=86400`);
        res.statusCode = 200;
        res.end(body);
    } catch (err) {
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        res.statusCode = 503;
        res.end(JSON.stringify({ error: err.name === "TimeoutError" ? "Panel timed out" : err.message }));
    }
};

module.exports = { handler };
