const ITEMS_PER_PAGE = 24;
const CATEGORIES_PER_PAGE = 8;

const TYPE_INFO = {
    0: { label: "Avatar Deco", color: "avatar" },
    1: { label: "Profile Effect", color: "profile" },
    2: { label: "Nameplate", color: "nameplate" },
    3: { label: "Frame", color: "frame" },
    1000: { label: "Bundle", color: "bundle" },
};

// profile.png: 900 x 1760
const PROFILE_ASPECT = 1760 / 900;
// Frame preview: chỉ hiện nửa trên của profile để frame to, dễ nhìn hơn
// (frame Discord tự co theo chiều cao profile nên cắt ngắn vẫn hợp lệ).
const FRAME_PROFILE_CROP = 0.5;

let allDecors = [];
let allCategories = [];
let filteredDecors = [];
let currentPage = 1;
let currentFilter = "all";
let searchQuery = "";

const $ = (id) => document.getElementById(id);
const grid = $("grid");
const pagination = $("pagination");
const searchInput = $("searchInput");
const totalCount = $("totalCount");
const loadingState = $("loadingState");
const errorState = $("errorState");
const emptyState = $("emptyState");
const modal = $("modal");
const modalClose = $("modalClose");
const modalContent = $("modalContent");

// ─── Helpers ──────────────────────────────────────────

function formatMoney(amount) {
    if (!amount && amount !== 0) return "?";
    return new Intl.NumberFormat("vi-VN").format(amount) + "đ";
}

function getMinPrice(decor) {
    return decor.sellingPrices?.loginWithNitro ?? 0;
}

function createBundleImgWrap(assetURL, cls) {
    const wrap = document.createElement("div");
    wrap.className = cls;
    const base = document.createElement("img");
    base.src = assetURL[0];
    base.className = "bundle-img-base";
    base.alt = "";
    const overlay = document.createElement("img");
    overlay.src = assetURL[1];
    overlay.className = "bundle-img-overlay";
    overlay.alt = "";
    wrap.appendChild(base);
    wrap.appendChild(overlay);
    return wrap;
}

// Full timing animation cho profile effect (type 1)
// effects[x].src là ảnh (PNG/WebP/APNG) từ Discord CDN
function createProfileEffectWrap(effects, cls) {
    const wrap = document.createElement("div");
    wrap.className = cls;
    wrap.style.cssText =
        "position:relative;width:100%;height:100%;overflow:hidden;";

    if (!effects || !effects.length) return wrap;

    const sorted = [...effects].sort((a, b) => a.zIndex - b.zIndex);
    const entries = sorted.map((effect) => {
        const img = document.createElement("img");
        const sep = effect.src.includes("?") ? "&" : "?";
        img.src = effect.loop
            ? effect.src
            : `${effect.src}${sep}_t=${Date.now()}`;
        img.alt = "";
        img.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:${effect.zIndex};opacity:0;transition:opacity 0.4s ease;`;
        wrap.appendChild(img);
        return { img, effect };
    });

    const playCycle = () => {
        if (!wrap.isConnected) return;
        entries.forEach(({ img, effect }) => {
            img.style.opacity = "0";
            setTimeout(() => {
                if (!wrap.isConnected) return;
                img.style.opacity = "1";
                if (!effect.loop) {
                    setTimeout(() => {
                        if (!wrap.isConnected) return;
                        img.style.opacity = "0";
                    }, effect.duration);
                }
            }, effect.start);
        });
    };

    setTimeout(playCycle, 0);
    return wrap;
}

// ─── Frame preview (type 3) ────────────────────────────
// Ghép các layer của frame quanh profile.png giống cách Discord render:
// layer URL = .../collectibles-shop/{sku_id}/{layer.id}/static, định vị
// bằng inner_width + overflow_* (đều là px theo bề rộng chuẩn của profile).
function createFramePreview(decor) {
    const outer = document.createElement("div");
    outer.className = "dp-frame-outer";

    const f = decor.frame;
    if (!f || !Array.isArray(f.layers) || f.layers.length === 0) {
        // Record cũ / frame import thủ công: chỉ có ảnh /preview
        const img = document.createElement("img");
        img.src = decor.staticURL;
        img.className = "dp-frame-fallback";
        img.alt = "";
        outer.appendChild(img);
        return outer;
    }

    const iw = f.inner_width;
    const ot = f.overflow_top;
    const ob = f.overflow_bottom;
    const oh = f.overflow_horizontal;

    const stage = document.createElement("div");
    stage.className = "dp-frame-stage";
    stage.style.setProperty("--iw", iw);
    stage.style.setProperty("--ot", ot);
    stage.style.setProperty("--ob", ob);
    stage.style.setProperty("--oh", oh);

    // Thu nhỏ stage để cả profile + phần frame tràn ra vừa khít ô vuông:
    // tổng bề rộng = w*(1 + 2*oh/iw), tổng chiều cao = w*(aspect + (ot+ob)/iw)
    const croppedAspect = PROFILE_ASPECT * FRAME_PROFILE_CROP;
    const totalW = 1 + (2 * oh) / iw;
    const totalH = croppedAspect + (ot + ob) / iw;
    const wPct = Math.min(100 / totalW, 100 / totalH) * 0.96;
    stage.style.width = `${wPct}%`;
    // Layer absolute không tính vào layout nên phải bù margin để phần
    // tràn trên/dưới không bị flex-center cắt mất (margin % = theo bề
    // rộng của outer).
    stage.style.marginTop = `${(wPct * ot) / iw}%`;
    stage.style.marginBottom = `${(wPct * ob) / iw}%`;

    const profileWrap = document.createElement("div");
    profileWrap.className = "dp-frame-profile";
    profileWrap.style.aspectRatio = `1 / ${croppedAspect}`;
    const profileImg = document.createElement("img");
    profileImg.src = "assets/img/profile.png";
    profileImg.alt = "";
    profileWrap.appendChild(profileImg);
    stage.appendChild(profileWrap);

    for (const layer of f.layers) {
        const img = document.createElement("img");
        img.src = `https://cdn.discordapp.com/media/v1/collectibles-shop/${decor.sku_id}/${layer.id}/static`;
        img.alt = "";
        img.className = `dp-frame-layer dp-frame-layer--${
            layer.anchor === "top"
                ? "top"
                : layer.anchor === "bottom"
                  ? "bottom"
                  : "center"
        } dp-frame-layer--${layer.order === "front" ? "front" : "back"}`;
        stage.appendChild(img);
    }

    outer.appendChild(stage);
    return outer;
}

// ─── Discord profile mockup ────────────────────────────

function createDiscordProfileMock(decor, forCard = false) {
    // TYPE 3: frame layers bao quanh ảnh demo profile
    if (decor.type === 3) {
        return createFramePreview(decor);
    }

    // TYPE 0: avatar.png template + decoration overlay
    if (decor.type === 0) {
        const wrap = document.createElement("div");
        wrap.className = "dp-avatar-preview";

        const base = document.createElement("img");
        base.src = "assets/img/avatar.png";
        base.className = "dp-avatar-base-img";
        base.alt = "";
        wrap.appendChild(base);

        if (decor.assetURL) {
            const deco = document.createElement("img");
            deco.src = decor.assetURL;
            deco.className = "dp-deco-img";
            deco.alt = "";
            wrap.appendChild(deco);
        }

        return wrap;
    }

    // TYPE 2: nameplate.png as avatar in DM-list chat row
    if (decor.type === 2) {
        const wrap = document.createElement("div");
        wrap.className = "dp-chat-preview";

        const dimRow = (lineWidths) => {
            const row = document.createElement("div");
            row.className = "dp-chat-row dp-chat-row--dim";
            const av = document.createElement("div");
            av.className = "dp-chat-av dp-chat-av--dim";
            row.appendChild(av);
            const linesWrap = document.createElement("div");
            linesWrap.className = "dp-chat-lines";
            lineWidths.forEach((w) => {
                const l = document.createElement("div");
                l.className = "dp-chat-line";
                l.style.width = w;
                linesWrap.appendChild(l);
            });
            row.appendChild(linesWrap);
            return row;
        };

        wrap.appendChild(dimRow(["65%", "40%"]));

        const mainRow = document.createElement("div");
        mainRow.className = "dp-chat-row dp-chat-row--main";

        const npArea = document.createElement("div");
        npArea.className = "dp-nameplate-bg";

        if (decor.assetURL) {
            const video = document.createElement("video");
            video.src = decor.assetURL;
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            npArea.appendChild(video);
        }

        const npAv = document.createElement("div");
        npAv.className = "dp-nameplate-av";
        const avImg = document.createElement("img");
        avImg.src = "assets/img/nameplate.png";
        avImg.alt = "";
        npAv.appendChild(avImg);
        npArea.appendChild(npAv);

        const npName = document.createElement("div");
        npName.className = "dp-nameplate-name";
        npArea.appendChild(npName);

        mainRow.appendChild(npArea);

        wrap.appendChild(mainRow);
        wrap.appendChild(dimRow(["50%", "75%"]));

        return wrap;
    }

    // TYPE 1: profile.png template + effect layer (multiply blend makes white transparent)
    const preview = document.createElement("div");
    preview.className = "dp-profile-preview";

    const effectLayer = document.createElement("div");
    effectLayer.className = "dp-effect-layer";

    const loadLoop = () => {
        effectLayer.innerHTML = "";
        const loopEffects = (decor.effects || []).filter((e) => e.loop);
        if (!loopEffects.length) {
            if (decor.staticURL) {
                const img = document.createElement("img");
                img.src = decor.staticURL;
                img.alt = "";
                img.style.cssText = "width:100%;height:100%;object-fit:cover;";
                effectLayer.appendChild(img);
            }
            return;
        }
        [...loopEffects]
            .sort((a, b) => a.zIndex - b.zIndex)
            .forEach((effect) => {
                const img = document.createElement("img");
                img.src = effect.src;
                img.alt = "";
                img.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:${effect.zIndex};`;
                effectLayer.appendChild(img);
            });
    };

    const loadAnimated = () => {
        effectLayer.innerHTML = "";
        if (!decor.effects || !decor.effects.length) {
            loadLoop();
            return;
        }
        const wrap = createProfileEffectWrap(decor.effects, "");
        wrap.style.cssText = "position:absolute;inset:0;overflow:hidden;";
        effectLayer.appendChild(wrap);
    };

    loadLoop();
    preview.appendChild(effectLayer);

    const profileImg = document.createElement("img");
    profileImg.src = "assets/img/profile.png";
    profileImg.className = "dp-profile-base";
    profileImg.alt = "";
    preview.appendChild(profileImg);

    if (!forCard) {
        loadAnimated();
        return preview;
    }

    const crop = document.createElement("div");
    crop.className = "dp-profile-crop";
    crop.appendChild(preview);
    crop.addEventListener("mouseenter", loadAnimated);
    crop.addEventListener("mouseleave", loadLoop);
    return crop;
}

// ─── Card rendering ────────────────────────────────────

function renderCard(decor) {
    const typeInfo = TYPE_INFO[decor.type] ?? {
        label: "Unknown",
        color: "avatar",
    };
    const isBundle = decor.type === 1000 && Array.isArray(decor.assetURL);

    const card = document.createElement("div");
    card.className = "card";
    card.addEventListener("click", () => openModal(decor));

    // Image area
    if (isBundle) {
        const imgWrap = document.createElement("div");
        imgWrap.className = "card-img-wrap";
        imgWrap.appendChild(
            createBundleImgWrap(decor.assetURL, "bundle-img-wrap"),
        );
        card.appendChild(imgWrap);
    } else {
        card.appendChild(createDiscordProfileMock(decor, true));
    }

    // Type badge (absolute, positioned relative to .card)
    const badgeWrap = document.createElement("div");
    badgeWrap.className = "card-badge";
    const badge = document.createElement("span");
    badge.className = `badge badge-${typeInfo.color}`;
    badge.textContent = typeInfo.label;
    badgeWrap.appendChild(badge);

    // Info
    const info = document.createElement("div");
    info.className = "card-info";

    const name = document.createElement("h3");
    name.className = "card-name";
    name.textContent = decor.name;

    const priceEl = document.createElement("div");
    priceEl.className = "card-price";
    const minPrice = getMinPrice(decor);
    priceEl.innerHTML = `<span class="price-label">Từ</span> <span class="price-value">${formatMoney(minPrice)}</span>`;

    info.appendChild(name);
    info.appendChild(priceEl);

    card.appendChild(badgeWrap);
    card.appendChild(info);
    return card;
}

// ─── Filter & render ───────────────────────────────────

function applyFilters() {
    const q = searchQuery.toLowerCase().trim();
    filteredDecors = allDecors.filter((d) => {
        const matchType =
            currentFilter === "all" || d.type === parseInt(currentFilter);
        const matchSearch = !q || d.name.toLowerCase().includes(q);
        return matchType && matchSearch;
    });
    currentPage = 1;
    render();
}

function render() {
    const total = filteredDecors.length;
    totalCount.textContent = `${total} item${total !== 1 ? "s" : ""}`;

    if (total === 0) {
        grid.classList.add("hidden");
        pagination.classList.add("hidden");
        emptyState.classList.remove("hidden");
        return;
    }

    emptyState.classList.add("hidden");
    grid.classList.remove("hidden");
    grid.innerHTML = "";

    if (allCategories.length) renderGrouped();
    else renderFlat();
}

// Lưới phẳng (fallback khi bot chưa có data categories)
function renderFlat() {
    grid.className = "grid";
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageDecors = filteredDecors.slice(start, start + ITEMS_PER_PAGE);
    const fragment = document.createDocumentFragment();
    pageDecors.forEach((d) => fragment.appendChild(renderCard(d)));
    grid.appendChild(fragment);
    renderPagination(Math.ceil(filteredDecors.length / ITEMS_PER_PAGE));
}

// Nhóm theo mục, phân trang theo số mục
function renderGrouped() {
    grid.className = "category-sections";

    const byCategory = new Map();
    for (const d of filteredDecors) {
        const key = d.category_sku_id || "__other";
        if (!byCategory.has(key)) byCategory.set(key, []);
        byCategory.get(key).push(d);
    }

    const sections = [];
    for (const cat of allCategories) {
        const items = byCategory.get(cat.sku_id);
        if (items?.length) sections.push({ cat, items });
        byCategory.delete(cat.sku_id);
    }
    // Deco không thuộc mục nào (import thủ công / record cũ) → "Khác"
    const leftovers = [...byCategory.values()].flat();
    if (leftovers.length) {
        sections.push({ cat: { name: "Khác", banner: null }, items: leftovers });
    }

    const totalPages = Math.ceil(sections.length / CATEGORIES_PER_PAGE);
    if (currentPage > totalPages) currentPage = 1;
    const start = (currentPage - 1) * CATEGORIES_PER_PAGE;
    const fragment = document.createDocumentFragment();
    for (const { cat, items } of sections.slice(
        start,
        start + CATEGORIES_PER_PAGE,
    )) {
        fragment.appendChild(renderCategorySection(cat, items));
    }
    grid.appendChild(fragment);
    renderPagination(totalPages);
}

function renderCategorySection(cat, items) {
    const section = document.createElement("section");
    section.className = "category-section";

    if (cat.banner) {
        // Banner Discord: desktop dùng catalog_banner_url, mobile dùng
        // mobile_banner_url
        const banner = document.createElement("div");
        banner.className = "category-banner";
        const picture = document.createElement("picture");
        if (cat.mobileBanner) {
            const source = document.createElement("source");
            source.media = "(max-width: 640px)";
            source.srcset = cat.mobileBanner;
            picture.appendChild(source);
        }
        const img = document.createElement("img");
        img.src = cat.banner;
        img.alt = cat.name;
        picture.appendChild(img);
        banner.appendChild(picture);
        section.appendChild(banner);
    } else {
        // Mục không có banner (Frames, Khác): header chữ
        const header = document.createElement("div");
        header.className = "category-header";
        const h = document.createElement("h2");
        h.className = "category-title";
        h.textContent = cat.name;
        const count = document.createElement("span");
        count.className = "category-count";
        count.textContent = `${items.length} item${items.length !== 1 ? "s" : ""}`;
        header.appendChild(h);
        header.appendChild(count);
        section.appendChild(header);
    }

    const g = document.createElement("div");
    g.className = "grid";
    items.forEach((d) => g.appendChild(renderCard(d)));
    section.appendChild(g);
    return section;
}

// ─── Pagination ────────────────────────────────────────

function renderPagination(totalPages) {
    if (totalPages <= 1) {
        pagination.classList.add("hidden");
        return;
    }

    pagination.classList.remove("hidden");
    pagination.innerHTML = "";

    const addBtn = (label, page, disabled = false, active = false) => {
        const btn = document.createElement("button");
        btn.className = `page-btn${active ? " active" : ""}`;
        btn.textContent = label;
        btn.disabled = disabled;
        btn.addEventListener("click", () => {
            currentPage = page;
            render();
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
        pagination.appendChild(btn);
    };

    addBtn("←", currentPage - 1, currentPage === 1);

    const pages = getPageRange(currentPage, totalPages);
    let prev = null;
    for (const p of pages) {
        if (prev !== null && p - prev > 1) {
            const dot = document.createElement("span");
            dot.className = "page-ellipsis";
            dot.textContent = "···";
            pagination.appendChild(dot);
        }
        addBtn(p, p, false, p === currentPage);
        prev = p;
    }

    addBtn("→", currentPage + 1, currentPage === totalPages);

    const goInput = document.createElement("input");
    goInput.type = "number";
    goInput.min = 1;
    goInput.max = totalPages;
    goInput.placeholder = currentPage;
    goInput.className = "page-go-input";
    goInput.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const val = parseInt(goInput.value);
        if (!val || val < 1 || val > totalPages) return;
        currentPage = val;
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
    pagination.appendChild(goInput);
}

function getPageRange(current, total) {
    const set = new Set([1, total]);
    for (
        let i = Math.max(1, current - 2);
        i <= Math.min(total, current + 2);
        i++
    ) {
        set.add(i);
    }
    return [...set].sort((a, b) => a - b);
}

// ─── Modal ─────────────────────────────────────────────

function buildPricesHTML(decor) {
    const isBundle = decor.type === 1000;
    const isImported = decor.decorFrom === "importedDecors";
    const sp = decor.sellingPrices || {};

    const row = (label, origVal, sellVal, noGift = false) => {
        const orig =
            origVal != null
                ? `<span class="price-original">${formatMoney(origVal)}</span><span class="price-arrow">→</span>`
                : "";
        const sell = noGift
            ? `<span class="price-limited">Decor giới hạn không có Gift</span>`
            : `<span class="price-sell">${formatMoney(sellVal)}</span>`;
        return `
            <div class="price-row">
                <span class="price-row-label">${label}</span>
                <div class="price-row-vals">${orig}${sell}</div>
            </div>`;
    };

    if (isBundle) {
        return [
            row(
                "🔵 Login (Có Nitro)",
                decor.prices?.withNitro,
                sp.loginWithNitro,
            ),
            row(
                "⚪ Login (Không Nitro)",
                decor.prices?.withoutNitro,
                sp.loginWithoutNitro,
            ),
            row("🎁 Gift Bundle", null, sp.giftBundle, isImported),
        ].join("");
    }

    return [
        row("🔵 Login (Có Nitro)", decor.prices?.withNitro, sp.loginWithNitro),
        row(
            "⚪ Login (Không Nitro)",
            decor.prices?.withoutNitro,
            sp.loginWithoutNitro,
        ),
        row("🎁 Gift", decor.prices?.withNitro, sp.gift, isImported),
    ].join("");
}

function buildBundleItemsHTML(decor) {
    if (
        decor.type !== 1000 ||
        !Array.isArray(decor.items) ||
        decor.items.length === 0
    ) {
        return "";
    }

    const rows = decor.items
        .filter(Boolean)
        .map((item) => {
            const t = TYPE_INFO[item.type] ?? {
                label: "Unknown",
                color: "avatar",
            };
            return `<li class="bundle-item">
                <span class="badge badge-${t.color} badge-sm">${t.label}</span>
                <span>${item.name}</span>
            </li>`;
        })
        .join("");

    return `
        <div class="modal-section">
            <h4 class="section-title">Bao gồm</h4>
            <ul class="bundle-list">${rows}</ul>
        </div>`;
}

function fallbackCopy(text, onSuccess) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
        document.execCommand("copy");
        onSuccess();
    } catch (_) {}
    document.body.removeChild(ta);
}

function openModal(decor) {
    const typeInfo = TYPE_INFO[decor.type] ?? {
        label: "Unknown",
        color: "avatar",
    };
    const isBundle = decor.type === 1000 && Array.isArray(decor.assetURL);
    const isImported = decor.decorFrom === "importedDecors";

    const limitedBadge = isImported
        ? `<span class="badge-limited">⚡ Decor Giới Hạn</span>`
        : "";

    const summaryEl = decor.summary
        ? `<p class="modal-summary">${decor.summary}</p>`
        : "";
    const labelEl = decor.label
        ? `<p class="modal-label">${decor.label}</p>`
        : "";

    modalContent.innerHTML = `
        <div class="modal-layout">
            <div class="modal-img-side">
                <div id="modalImgSlot" style="width:100%"></div>
                ${limitedBadge}
            </div>
            <div class="modal-info-side">
                <div class="modal-header">
                    <span class="badge badge-${typeInfo.color}">${typeInfo.label}</span>
                    <h2 class="modal-title">${decor.name}</h2>
                    ${labelEl}
                    ${summaryEl}
                </div>
                <div class="modal-section">
                    <h4 class="section-title">Giá</h4>
                    <div class="prices-table">${buildPricesHTML(decor)}</div>
                </div>
                ${buildBundleItemsHTML(decor)}
                <button id="shopCopyBtn" class="discord-link">
                    Sao chép link Discord Shop
                </button>
            </div>
        </div>`;

    const imgNode = isBundle
        ? createBundleImgWrap(decor.assetURL, "modal-bundle-img")
        : createDiscordProfileMock(decor);

    document.getElementById("modalImgSlot").appendChild(imgNode);

    const copyBtn = document.getElementById("shopCopyBtn");
    copyBtn.addEventListener("click", () => {
        const url = `https://discord.com/shop#itemSkuId=${decor.sku_id}`;
        const succeed = () => {
            copyBtn.textContent = "Đã sao chép ✓";
            setTimeout(() => {
                copyBtn.textContent = "Sao chép link Discord Shop";
            }, 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
                .writeText(url)
                .then(succeed)
                .catch(() => fallbackCopy(url, succeed));
        } else {
            fallbackCopy(url, succeed);
        }
    });

    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
}

function closeModal() {
    modal.classList.add("hidden");
    document.body.classList.remove("modal-open");
    modalContent.innerHTML = "";
}

// ─── Event listeners ───────────────────────────────────

searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    applyFilters();
});

document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document
            .querySelectorAll(".filter-btn")
            .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = btn.dataset.type;
        applyFilters();
    });
});

modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
});

// ─── Init ──────────────────────────────────────────────

// sku_id là Discord snowflake (chứa timestamp tạo) → dùng làm thứ tự ra mắt.
// So bằng BigInt vì id 19 chữ số vượt độ chính xác của Number.
function skuOrder(decor) {
    try {
        return BigInt(decor.sku_id);
    } catch {
        return 0n;
    }
}

async function init() {
    try {
        // typeof-guard: nếu trình duyệt còn cache api.js bản cũ (chưa có
        // getDecorCategories) thì vẫn chạy được ở dạng lưới phẳng.
        [allDecors, allCategories] = await Promise.all([
            getAllDecors(),
            typeof getDecorCategories === "function"
                ? getDecorCategories()
                : [],
        ]);
        // Mặc định: deco ra mắt gần đây nhất lên đầu
        allDecors.sort((a, b) => {
            const x = skuOrder(a), y = skuOrder(b);
            return x > y ? -1 : x < y ? 1 : 0;
        });
        loadingState.classList.add("hidden");
        applyFilters();
    } catch (err) {
        console.error(err);
        loadingState.classList.add("hidden");
        errorState.classList.remove("hidden");
    }
}

init();
