/**
 * Sugar Bliss - He thong da ngon ngu (i18n) nhe, thuan JavaScript.
 *
 * Cach dung:
 *  1. Nap file nay TRUOC shared-components.js trong moi trang.
 *  2. Danh dau phan tu can dich bang thuoc tinh:
 *       - data-i18n="key"            -> dich phan text ben trong
 *       - data-i18n-attr="placeholder:key,title:key2" -> dich thuoc tinh
 *  3. Goi window.SugarI18n.apply() sau khi DOM/thanh phan duoc render.
 *
 * Ngon ngu dang chon duoc luu trong localStorage voi khoa "sugarBlissLang".
 */
(function () {
    const STORAGE_KEY = "sugarBlissLang";
    const DEFAULT_LANG = "vi";
    const SUPPORTED = ["vi", "en"];

    // Tu dien dich. Them key moi o day khi mo rong sang trang khac.
    const dictionary = {
        // ----- Header / Navigation -----
        "nav.home": { vi: "Trang chủ", en: "Home" },
        "nav.about": { vi: "Về chúng tôi", en: "About Us" },
        "nav.menu": { vi: "Thực đơn", en: "Menu" },
        "nav.specialOrders": { vi: "Đặt hàng đặc biệt", en: "Special Orders" },
        "nav.contact": { vi: "Liên hệ", en: "Contact" },
        "header.search": { vi: "Tìm kiếm", en: "Search" },
        "header.cart": { vi: "Giỏ hàng", en: "Cart" },
        "header.account": { vi: "Tài khoản", en: "Account" },

        // ----- Footer -----
        "footer.tagline": { vi: "Trọn vẹn ngọt ngào trong từng miếng bánh.", en: "Crafting bliss in every single bite." },
        "footer.visitUs": { vi: "Ghé thăm chúng tôi", en: "Visit Us" },

        // ----- Trang About Us -----
        "about.title": { vi: "Về chúng tôi", en: "About Us" },
        "about.intro": {
            vi: "Sugar Bliss là tiệm bánh ngọt mang đến những chiếc bánh tươi ngon, được làm thủ công mỗi ngày từ những nguyên liệu chọn lọc. Chúng tôi tin rằng mỗi chiếc bánh đều có thể mang lại niềm vui và sự ngọt ngào cho cuộc sống.",
            en: "Lorem ipsum dolor sit amet consectetur. Sagittis quis molestie id. Cras quis tempus elit tellus lacinia nibh commodo senectus id semper. Nulla ornare ut purus pellentesque magna convallis a cras."
        },
        "about.missionTitle": { vi: "Sứ mệnh của chúng tôi", en: "Our Mission" },
        "about.missionText": {
            vi: "Sứ mệnh của chúng tôi là mang đến những chiếc bánh chất lượng cao, an toàn và đẹp mắt, giúp mọi khoảnh khắc của bạn thêm trọn vẹn. Chúng tôi luôn đặt sự hài lòng của khách hàng lên hàng đầu.",
            en: "Lorem ipsum dolor sit amet consectetur. Sagittis quis lorem neque fermentum sit. Nullam habitant orci varius turpis vel nisl suspendisse. Sit et odio lacus sit hendrerit cras enim rhoncus."
        },
        "about.promiseTitle": { vi: "Cam kết của chúng tôi", en: "Our Promise" },
        "about.promiseText": {
            vi: "Chúng tôi cam kết sử dụng nguyên liệu tươi mới, quy trình chế biến sạch sẽ và giao hàng đúng hẹn. Sự tin tưởng của bạn là động lực để chúng tôi không ngừng hoàn thiện.",
            en: "Lorem ipsum dolor sit amet consectetur. Sagittis quis lorem neque fermentum sit. Nullam habitant orci varius turpis vel nisl suspendisse. Sit et odio lacus sit hendrerit cras enim rhoncus."
        },
        "about.ctaTitle": { vi: "Bạn muốn biết thêm về chúng tôi?", en: "Want To Know More About Us?" },
        "about.ctaButton": { vi: "Liên hệ ngay", en: "Contact Us" },

        // ----- Nhan chung -----
        "common.langLabel": { vi: "VI", en: "EN" }
    };

    function getLang() {
        const stored = localStorage.getItem(STORAGE_KEY);
        return SUPPORTED.includes(stored) ? stored : DEFAULT_LANG;
    }

    function setLang(lang) {
        if (!SUPPORTED.includes(lang)) {
            return;
        }
        localStorage.setItem(STORAGE_KEY, lang);
        document.documentElement.setAttribute("lang", lang);
        apply();
        // Bao cho cac thanh phan khac biet ngon ngu vua doi
        window.dispatchEvent(new CustomEvent("sugarbliss:lang-changed", { detail: { lang } }));
    }

    function toggleLang() {
        setLang(getLang() === "vi" ? "en" : "vi");
    }

    function translate(key, lang) {
        const entry = dictionary[key];
        if (!entry) {
            return null;
        }
        return entry[lang || getLang()] ?? entry[DEFAULT_LANG] ?? null;
    }

    // Quet toan bo DOM va thay text/thuoc tinh theo ngon ngu hien tai.
    function apply(root) {
        const lang = getLang();
        const scope = root || document;

        // Dich phan text ben trong
        scope.querySelectorAll("[data-i18n]").forEach((el) => {
            const key = el.getAttribute("data-i18n");
            const value = translate(key, lang);
            if (value !== null) {
                el.textContent = value;
            }
        });

        // Dich cac thuoc tinh (placeholder, title, aria-label...)
        scope.querySelectorAll("[data-i18n-attr]").forEach((el) => {
            const pairs = el.getAttribute("data-i18n-attr").split(",");
            pairs.forEach((pair) => {
                const [attr, key] = pair.split(":").map((s) => s.trim());
                const value = translate(key, lang);
                if (attr && value !== null) {
                    el.setAttribute(attr, value);
                }
            });
        });

        document.documentElement.setAttribute("lang", lang);
    }

    // Ap dung ngay khi DOM san sang (cho noi dung tinh trong HTML)
    document.addEventListener("DOMContentLoaded", () => apply());

    // Xuat API ra global de header/footer va cac trang dung
    window.SugarI18n = {
        apply,
        getLang,
        setLang,
        toggleLang,
        translate,
        supported: SUPPORTED
    };
})();
