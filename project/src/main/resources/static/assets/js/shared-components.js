class SugarHeader extends HTMLElement {
    connectedCallback() {
        const activePage = this.getAttribute("active") || "";
        
        // Bổ sung lại mục Home vào danh sách điều hướng
        const navigationItems = [
            { key: "home", label: "Home", href: "/home" },
            { key: "about", label: "About Us", href: "/pages/about-us.html" }, 
            { key: "menu", label: "Menu", href: "/products" },
            { key: "special-orders", label: "Special Orders", href: "/special-orders" },
            { key: "contact", label: "Contact", href: "/contact" },
        ];
        const navigationMarkup = navigationItems.map((item) => {
            const isActive = item.key === activePage || (item.key === "menu" && activePage === "products");
            const activeClass = isActive ? " class=\"active\"" : "";
            const currentPage = isActive ? " aria-current=\"page\"" : "";

            return `<a${activeClass}${currentPage} href="${item.href}" data-i18n="${item.i18nKey}">${item.label}</a>`;
        }).join("");
        const profileClass = activePage === "profile"
            ? "profile-link active-profile"
            : "profile-link";

        this.ensureSearchStyles();
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

                <div class="header-actions">
                    <div class="header-search" data-header-search>
                        <button class="header-icon-button" type="button" data-header-search-toggle
                                aria-label="Search products" aria-expanded="false"
                                aria-controls="header-product-search-panel">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                        </button>

                        <div class="header-search-panel" id="header-product-search-panel"
                             data-header-search-panel aria-hidden="true">
                            <div class="header-search-field">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                </svg>
                                <label class="sr-only" for="header-product-search-input">Search products</label>
                                <input id="header-product-search-input" type="search" data-header-search-input
                                       placeholder="Search cakes and treats"
                                       autocomplete="off" spellcheck="false" role="combobox"
                                       aria-autocomplete="list" aria-expanded="false"
                                       aria-controls="header-product-search-results">
                                <button class="header-search-clear" type="button" data-header-search-clear
                                        aria-label="Clear search" hidden>&times;</button>
                            </div>
                            <div class="header-search-results" id="header-product-search-results"
                                 data-header-search-results role="listbox" aria-label="Product suggestions">
                                <p class="header-search-state" role="status">Type at least 2 characters to search.</p>
                            </div>
                        </div>
                    </div>

                    <a class="header-icon-link" href="/cart" aria-label="Cart">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
