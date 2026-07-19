const API_BASE = "";

let _cache = null;

async function getAllDecors() {
    if (_cache) return _cache;
    const res = await fetch(`${API_BASE}/api/decors`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    _cache = await res.json();
    return _cache;
}

// Danh sách mục (kèm banner). Trả [] nếu bot cũ chưa có endpoint —
// site sẽ tự fallback về dạng lưới phẳng.
async function getDecorCategories() {
    try {
        const res = await fetch(`${API_BASE}/api/decors/categories`);
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}
