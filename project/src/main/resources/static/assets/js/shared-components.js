class SugarHeader extends HTMLElement {
    connectedCallback() {
        const activePage = this.getAttribute("active") || "";
        
        // Bổ sung lại mục Home vào danh sách điều hướng
        // i18nKey: khóa dịch trong assets/js/i18n.js
        const navigationItems = [
            { key: "home", label: "Home", href: "/home", i18nKey: "nav.home" },
            { key: "about", label: "About Us", href: "/pages/about-us.html", i18nKey: "nav.about" },
            { key: "menu", label: "Menu", href: "/products", i18nKey: "nav.menu" },
            { key: "special-orders", label: "Special Orders", href: "/special-orders", i18nKey: "nav.specialOrders" },
            { key: "contact", label: "Contact", href: "/contact", i18nKey: "nav.contact" },
        ];
        
        const navigationMarkup = navigationItems.map((item) => {
            // Xử lý riêng cho mục Menu (vì file HTML của bạn đang dùng active="products")
            const isActive = item.key === activePage || (item.key === "menu" && activePage === "products");
            const activeClass = isActive ? " class=\"active\"" : "";
            const currentPage = isActive ? " aria-current=\"page\"" : "";

            return `<a${activeClass}${currentPage} href="${item.href}" data-i18n="${item.i18nKey}">${item.label}</a>`;
        }).join("");
        
        const profileClass = activePage === "profile"
            ? "profile-link active-profile"
            : "profile-link";

        this.style.display = "contents";
        
        this.innerHTML = `
            <header class="site-header">
                <a class="brand" href="/home" aria-label="Sugar Bliss home">
                    <img src="/assets/icons/logo.png" alt="Sugar Bliss logo">
                    <span>Sugar Bliss</span>
                </a>

                <nav class="main-nav" aria-label="Main navigation">
                    ${navigationMarkup}
                </nav>

                <div class="header-actions" style="display: flex; align-items: center; gap: 24px;">
                    <a href="/search" aria-label="Search" style="color: #555; display: flex; transition: color 0.3s;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                    </a>
                    
                    <a href="/cart" aria-label="Cart" style="color: #555; display: flex; transition: color 0.3s;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <path d="M16 10a4 4 0 0 1-8 0"></path>
                        </svg>
                    </a>

                    <button type="button" class="lang-switch" aria-label="Language / Ngôn ngữ">
                        <span class="lang-code" data-lang-code>VI</span>
                    </button>

                    <a class="${profileClass}" href="/profile" aria-label="Account"></a>
                </div>
            </header>
        `;

        // Kich hoat nut chuyen ngon ngu + dich noi dung header
        this.setupLanguageSwitch();
    }

    setupLanguageSwitch() {
        if (!window.SugarI18n) {
            return; // i18n.js chua duoc nap thi bo qua an toan
        }

        const button = this.querySelector(".lang-switch");
        const codeEl = this.querySelector("[data-lang-code]");

        const refreshCode = () => {
            if (codeEl) {
                // Hien thi ngon ngu se chuyen sang (goi y hanh dong)
                codeEl.textContent = window.SugarI18n.getLang() === "vi" ? "EN" : "VI";
            }
        };

        if (button) {
            button.addEventListener("click", () => {
                window.SugarI18n.toggleLang();
                refreshCode();
            });
        }

        // Dich header ngay khi render + cap nhat nhan nut
        window.SugarI18n.apply(this);
        refreshCode();

        // Neu ngon ngu doi tu noi khac, dich lai header
        window.addEventListener("sugarbliss:lang-changed", () => {
            window.SugarI18n.apply(this);
            refreshCode();
        });
    }
}

class SugarFooter extends HTMLElement {
    connectedCallback() {
        const variant = this.getAttribute("variant");
        const footerClass = variant === "reset"
            ? "reset-footer"
            : `site-footer${variant === "form" ? " form-footer" : ""}`;
        const brandHref = variant === "reset" ? "/login" : "/home";

        this.style.display = "contents";
        this.innerHTML = `
            <footer class="${footerClass}">
                <div class="footer-brand">
                    <a class="footer-logo" href="${brandHref}" aria-label="Sugar Bliss home">
                        <img src="/assets/icons/logo.png" alt="Sugar Bliss logo">
                        <span>Sugar Bliss</span>
                    </a>
                    <p data-i18n="footer.tagline">Crafting bliss in every single bite.</p>
                </div>

                <div class="footer-visit">
                    <h2 data-i18n="footer.visitUs">Visit Us</h2>
                    <p><span class="footer-icon location" aria-hidden="true"></span>123 HaNoi VietNam</p>
                    <p><span class="footer-icon phone" aria-hidden="true"></span>0123456789</p>
                </div>
            </footer>
        `;

        // Dich footer + cap nhat khi doi ngon ngu
        if (window.SugarI18n) {
            window.SugarI18n.apply(this);
            window.addEventListener("sugarbliss:lang-changed", () => window.SugarI18n.apply(this));
        }
    }
}

if (!customElements.get("sugar-header")) {
    customElements.define("sugar-header", SugarHeader);
}

if (!customElements.get("sugar-footer")) {
    customElements.define("sugar-footer", SugarFooter);
}