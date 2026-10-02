// Dữ liệu sống lấy từ bot-panel qua /api của chính site (Vercel function, cache
// ~1 phút ở edge — xem api/_panel.js). Nếu panel không trả lời, hoặc trang chạy
// bằng server tĩnh không có /api, thì dùng bản chụp tĩnh data/*.json.
const SOURCES = {
    decors: ["api/decors", "data/decors.json"],
    categories: ["api/decors/categories", "data/categories.json"],
};

let _cache = null;

async function fetchFirst(urls) {
    let lastError;
    for (const url of urls) {
        try {
            const res = await fetch(url);
            if (res.ok) return await res.json();
            lastError = new Error(`API error: ${res.status}`);
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError;
}

async function getAllDecors() {
    if (_cache) return _cache;
    _cache = await fetchFirst(SOURCES.decors);
    return _cache;
}

// Danh sách mục (kèm banner). Trả [] nếu chưa có dữ liệu —
// site sẽ tự fallback về dạng lưới phẳng.
async function getDecorCategories() {
    try {
        return await fetchFirst(SOURCES.categories);
    } catch {
        return [];
    }
}
