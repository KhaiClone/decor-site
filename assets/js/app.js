const ITEMS_PER_PAGE = 24;

const TYPE_INFO = {
    0: { label: "Avatar Deco", color: "avatar" },
    1: { label: "Profile Effect", color: "profile" },
    2: { label: "Nameplate", color: "nameplate" },
    1000: { label: "Bundle", color: "bundle" },
};

let allDecors = [];
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
    /* const overlay = document.createElement("img");
    overlay.src = assetURL[1];
    overlay.className = "bundle-img-overlay";
    overlay.alt = ""; */
    wrap.appendChild(base);
    /* wrap.appendChild(overlay); */
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

    sorted.forEach((effect) => {
        const img = document.createElement("img");
        img.src = effect.src;
        img.alt = "";
        img.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:${effect.zIndex};opacity:0;`;
        wrap.appendChild(img);

        setTimeout(() => {
            img.style.opacity = "1";
            if (!effect.loop) {
                setTimeout(() => {
                    img.style.opacity = "0";
                }, effect.duration);
            }
        }, effect.start);
    });

    return wrap;
}

// ─── Discord profile mockup ────────────────────────────

const USER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5.33 0-8 2.67-8 4v1h16v-1c0-1.33-2.67-4-8-4z"/></svg>`;

function createDiscordProfileMock(decor, forCard = false) {
    // TYPE 0: avatar circle behind decoration
    if (decor.type === 0) {
        const wrap = document.createElement("div");
        wrap.className = "dp-avatar-preview";

        const avatarBg = document.createElement("div");
        avatarBg.className = "dp-avatar-base";

        const iconWrap = document.createElement("div");
        iconWrap.className = "dp-avatar-icon";
        iconWrap.innerHTML = USER_ICON_SVG;
        avatarBg.appendChild(iconWrap);

        const status = document.createElement("span");
        status.className = "dp-status--avatar";
        avatarBg.appendChild(status);

        wrap.appendChild(avatarBg);

        if (decor.assetURL) {
            const deco = document.createElement("img");
            deco.src = decor.assetURL;
            deco.className = "dp-deco-img";
            deco.alt = "";
            wrap.appendChild(deco);
        }

        return wrap;
    }

    // TYPE 2: Discord DM-list style with nameplate row
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

        // Nameplate row
        const mainRow = document.createElement("div");
        mainRow.className = "dp-chat-row dp-chat-row--main";

        const mainAv = document.createElement("div");
        mainAv.className = "dp-chat-av dp-chat-av--main";
        const avIcon = document.createElement("div");
        avIcon.className = "dp-avatar-icon";
        avIcon.innerHTML = USER_ICON_SVG;
        mainAv.appendChild(avIcon);
        const avStatus = document.createElement("span");
        avStatus.className = "dp-status";
        mainAv.appendChild(avStatus);
        mainRow.appendChild(mainAv);

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
        const pill = document.createElement("span");
        pill.className = "dp-nameplate-pill";
        pill.textContent = "DiscordUser";
        npArea.appendChild(pill);
        mainRow.appendChild(npArea);

        wrap.appendChild(mainRow);
        wrap.appendChild(dimRow(["50%", "75%"]));

        return wrap;
    }

    // TYPE 1: full profile popup
    const hasEffects = decor.effects && decor.effects.length;

    const mock = document.createElement("div");
    mock.className = "discord-profile-mock";

    if (hasEffects) {
        const effectBg = createProfileEffectWrap(decor.effects, "");
        effectBg.style.cssText = "position:absolute;inset:0;overflow:hidden;z-index:0;";
        mock.appendChild(effectBg);

        const overlay = document.createElement("div");
        overlay.className = "dp-effect-overlay";
        mock.appendChild(overlay);
    }

    const banner = document.createElement("div");
    banner.className = hasEffects ? "dp-banner dp-banner--transparent" : "dp-banner";
    if (!hasEffects && decor.staticURL) {
        const img = document.createElement("img");
        img.src = decor.staticURL;
        img.alt = "";
        img.style.cssText = "width:100%;height:100%;object-fit:cover;";
        banner.appendChild(img);
    }
    mock.appendChild(banner);

    const body = document.createElement("div");
    body.className = hasEffects ? "dp-body dp-body--elevated" : "dp-body";

    const avatarRow = document.createElement("div");
    avatarRow.className = "dp-avatar-row";

    const avatar = document.createElement("div");
    avatar.className = "dp-avatar";
    const iconWrap = document.createElement("div");
    iconWrap.className = "dp-avatar-icon";
    iconWrap.innerHTML = USER_ICON_SVG;
    avatar.appendChild(iconWrap);
    const status = document.createElement("span");
    status.className = "dp-status";
    avatar.appendChild(status);
    avatarRow.appendChild(avatar);
    body.appendChild(avatarRow);

    const nameSection = document.createElement("div");
    nameSection.className = "dp-name-section";
    const username = document.createElement("span");
    username.className = "dp-username";
    username.textContent = "DiscordUser";
    nameSection.appendChild(username);
    const tag = document.createElement("span");
    tag.className = "dp-tag";
    tag.textContent = "#0000";
    nameSection.appendChild(tag);
    body.appendChild(nameSection);

    const about = document.createElement("div");
    about.className = "dp-about";
    const aboutTitle = document.createElement("div");
    aboutTitle.className = "dp-about-title";
    aboutTitle.textContent = "Giới thiệu";
    about.appendChild(aboutTitle);
    const lines = document.createElement("div");
    lines.className = "dp-about-lines";
    [100, 72].forEach((w) => {
        const line = document.createElement("div");
        line.className = "dp-about-line";
        line.style.width = w + "%";
        lines.appendChild(line);
    });
    about.appendChild(lines);
    body.appendChild(about);
    mock.appendChild(body);

    // Card: wrap in square crop container to show only the top portion
    if (forCard) {
        const crop = document.createElement("div");
        crop.className = "dp-profile-crop";
        crop.appendChild(mock);
        return crop;
    }

    return mock;
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
        imgWrap.appendChild(createBundleImgWrap(decor.assetURL, "bundle-img-wrap"));
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

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageDecors = filteredDecors.slice(start, start + ITEMS_PER_PAGE);

    grid.innerHTML = "";
    const fragment = document.createDocumentFragment();
    pageDecors.forEach((d) => fragment.appendChild(renderCard(d)));
    grid.appendChild(fragment);

    renderPagination(total);
}

// ─── Pagination ────────────────────────────────────────

function renderPagination(total) {
    const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
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

function openModal(decor) {
    const typeInfo = TYPE_INFO[decor.type] ?? {
        label: "Unknown",
        color: "avatar",
    };
    const isBundle = decor.type === 1000 && Array.isArray(decor.assetURL);
    const isImported = decor.decorFrom === "importedDecors";

    const imgNode = isBundle
        ? createBundleImgWrap(decor.assetURL, "modal-bundle-img")
        : createDiscordProfileMock(decor);

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
                <a href="https://discord.com/shop#itemSkuId=${decor.sku_id}"
                   target="_blank"
                   rel="noopener noreferrer"
                   class="discord-link">
                    Xem trên Discord Shop ↗
                </a>
            </div>
        </div>`;

    document.getElementById("modalImgSlot").appendChild(imgNode);

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

async function init() {
    try {
        allDecors = await getAllDecors();
        loadingState.classList.add("hidden");
        applyFilters();
    } catch (err) {
        console.error(err);
        loadingState.classList.add("hidden");
        errorState.classList.remove("hidden");
    }
}

init();
