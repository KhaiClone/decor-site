const API_BASE = "http://localhost:7777";

let _cache = null;

async function getAllDecors() {
    if (_cache) return _cache;
    const res = await fetch(`${API_BASE}/api/decors`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    _cache = await res.json();
    return _cache;
}
