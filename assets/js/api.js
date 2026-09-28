// Dữ liệu là bản chụp tĩnh (data/*.json) lấy từ API của ArnTo-assistant, deploy
// cùng trang — trang không phụ thuộc vào VPS nào còn sống.
const DATA_BASE = "data";

let _cache = null;

async function getAllDecors() {
    if (_cache) return _cache;
    const res = await fetch(`${DATA_BASE}/decors.json`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    _cache = await res.json();
    return _cache;
}

// Danh sách mục (kèm banner). Trả [] nếu chưa có dữ liệu —
// site sẽ tự fallback về dạng lưới phẳng.
async function getDecorCategories() {
    try {
        const res = await fetch(`${DATA_BASE}/categories.json`);
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}
