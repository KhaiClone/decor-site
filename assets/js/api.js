const API_BASE = "http://160.191.87.150:9550";

let _cache = null;

async function getAllDecors() {
    if (_cache) return _cache;
    const res = await fetch(`${API_BASE}/api/decors`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    _cache = await res.json();
    return _cache;
}
