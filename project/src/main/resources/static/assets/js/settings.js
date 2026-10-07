/**
 * Trang Cai dat (Settings).
 * - Yeu cau dang nhap (neu khong co token -> chuyen ve /login)
 * - Chon ngon ngu: dong bo voi he thong i18n (SugarI18n) + nut VI/EN tren header
 * - Tuy chon thong bao: luu vao localStorage (muc 1, chua noi backend)
 * - Dang xuat: xoa token va chuyen ve /login
 */
const SETTINGS_NOTIF_KEY = "sugarBlissNotifPrefs";

document.addEventListener("DOMContentLoaded", () => {
    if (!localStorage.getItem("sugarBlissToken")) {
        window.location.href = "/login";
        return;
    }

    setupLanguageSetting();
    setupNotificationSettings();
    setupLogout();
});

/* ---------- Ngon ngu ---------- */
function setupLanguageSetting() {
    const select = document.querySelector("[data-settings-language]");
    if (!select || !window.SugarI18n) {
        return;
    }

    // Dong bo gia tri hien tai
    select.value = window.SugarI18n.getLang();

    select.addEventListener("change", () => {
        window.SugarI18n.setLang(select.value);
        showSaved();
    });

    // Neu doi ngon ngu tu noi khac (nut VI/EN tren header) -> cap nhat select
    window.addEventListener("sugarbliss:lang-changed", () => {
        select.value = window.SugarI18n.getLang();
    });
}

/* ---------- Thong bao (luu localStorage) ---------- */
function readNotifPrefs() {
    try {
        const stored = JSON.parse(localStorage.getItem(SETTINGS_NOTIF_KEY) || "null");
        return {
            order: stored?.order !== false, // mac dinh bat
            promo: stored?.promo === true,  // mac dinh tat
        };
    } catch (error) {
        return { order: true, promo: false };
    }
}

function writeNotifPrefs(prefs) {
    localStorage.setItem(SETTINGS_NOTIF_KEY, JSON.stringify(prefs));
}

function setupNotificationSettings() {
    const prefs = readNotifPrefs();
    const toggles = document.querySelectorAll("[data-settings-notif]");

    toggles.forEach((toggle) => {
        const key = toggle.getAttribute("data-settings-notif");
        toggle.checked = Boolean(prefs[key]);

        toggle.addEventListener("change", () => {
            const current = readNotifPrefs();
            current[key] = toggle.checked;
            writeNotifPrefs(current);
            showSaved();
        });
    });
}

/* ---------- Dang xuat ---------- */
function setupLogout() {
    const button = document.querySelector("[data-settings-logout]");
    button?.addEventListener("click", () => {
        localStorage.removeItem("sugarBlissToken");
        localStorage.removeItem("sugarBlissUser");
        window.location.href = "/login";
    });
}

/* ---------- Thong bao da luu ---------- */
let savedTimer = null;
function showSaved() {
    const banner = document.querySelector("[data-settings-saved]");
    if (!banner) {
        return;
    }
    banner.hidden = false;
    window.clearTimeout(savedTimer);
    savedTimer = window.setTimeout(() => {
        banner.hidden = true;
    }, 2000);
}
