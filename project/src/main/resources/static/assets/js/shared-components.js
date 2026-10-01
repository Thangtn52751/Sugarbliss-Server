class SugarHeader extends HTMLElement {
    connectedCallback() {
        const activePage = this.getAttribute("active") || "";

        const navigationItems = [
            { key: "home", label: "Home", href: "/home", i18nKey: "nav.home" },
            { key: "about", label: "About Us", href: "/pages/about-us.html", i18nKey: "nav.about" },
            { key: "menu", label: "Menu", href: "/products", i18nKey: "nav.menu" },
            { key: "special-orders", label: "Special Orders", href: "/special-orders", i18nKey: "nav.specialOrders" },
            { key: "contact", label: "Contact", href: "/contact", i18nKey: "nav.contact" },
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

        // Render the core header first so optional enhancements can never hide it.
        try {
            this.ensureSearchStyles();
            this.initializeProductSearch();
        } catch (error) {
            console.warn("Cannot initialize header product search.", error);
        }

        this.setupLanguageSwitch();
    }

    disconnectedCallback() {
        document.removeEventListener("pointerdown", this.outsideSearchHandler);
        window.removeEventListener("sugarbliss:lang-changed", this.languageChangedHandler);
        window.clearTimeout(this.searchDebounceTimer);
        this.searchAbortController?.abort();
    }

    ensureSearchStyles() {
        if (document.querySelector("link[data-sugar-header-styles]")) {
            return;
        }

        const stylesheet = document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = "/assets/css/header-search.css";
        stylesheet.dataset.sugarHeaderStyles = "true";
        document.head.appendChild(stylesheet);
    }

    initializeProductSearch() {
        this.searchRoot = this.querySelector("[data-header-search]");
        this.searchToggle = this.querySelector("[data-header-search-toggle]");
        this.searchPanel = this.querySelector("[data-header-search-panel]");
        this.searchInput = this.querySelector("[data-header-search-input]");
        this.searchClear = this.querySelector("[data-header-search-clear]");
        this.searchResults = this.querySelector("[data-header-search-results]");
        this.activeSuggestionIndex = -1;

        if (!this.searchRoot || !this.searchToggle || !this.searchPanel
            || !this.searchInput || !this.searchClear || !this.searchResults) {
            return;
        }

        this.searchToggle.addEventListener("click", () => {
            this.setSearchOpen(!this.searchRoot.classList.contains("is-open"));
        });
        this.searchInput.addEventListener("input", () => this.handleSearchInput());
        this.searchInput.addEventListener("keydown", (event) => this.handleSearchKeydown(event));
        this.searchClear.addEventListener("click", () => this.clearProductSearch());
        this.outsideSearchHandler = (event) => {
            if (!this.contains(event.target)) {
                this.setSearchOpen(false);
            }
        };
        document.addEventListener("pointerdown", this.outsideSearchHandler);
    }

    setSearchOpen(isOpen) {
        if (!this.searchRoot) {
            return;
        }

        this.searchRoot.classList.toggle("is-open", isOpen);
        this.searchToggle.setAttribute("aria-expanded", String(isOpen));
        this.searchPanel.setAttribute("aria-hidden", String(!isOpen));
        this.searchInput.setAttribute("aria-expanded", String(isOpen));

        if (isOpen) {
            window.requestAnimationFrame(() => this.searchInput.focus());
        } else {
            this.setActiveSuggestion(-1);
        }
    }

    handleSearchInput() {
        const query = this.searchInput.value.replace(/\s+/g, " ").trim();
        this.searchClear.hidden = query.length === 0;
        window.clearTimeout(this.searchDebounceTimer);
        this.searchAbortController?.abort();

        if (query.length < 2) {
            this.renderSearchState("Type at least 2 characters to search.");
            return;
        }

        this.renderSearchState("Searching products...", true);
        this.searchDebounceTimer = window.setTimeout(() => this.fetchProductSuggestions(query), 280);
    }

    async fetchProductSuggestions(query) {
        const token = localStorage.getItem("sugarBlissToken");

        if (!token) {
            this.renderSearchSignIn();
            return;
        }

        this.searchAbortController = new AbortController();
        const requestController = this.searchAbortController;
        const apiBaseUrl = window.SugarBlissApi?.baseUrl
            || `${window.location.protocol}//${window.location.hostname}:3000`;
        const params = new URLSearchParams({ q: query, limit: "6" });

        try {
            const response = await fetch(`${apiBaseUrl}/api/products/search?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: requestController.signal,
            });
            const data = await response.json().catch(() => ({}));

            if (requestController !== this.searchAbortController) {
                return;
            }

            if (response.status === 401) {
                this.renderSearchSignIn();
                return;
            }

            if (!response.ok) {
                throw new Error(data.message || "Product search failed.");
            }

            const currentQuery = this.searchInput.value.replace(/\s+/g, " ").trim();
            if (data.query !== currentQuery) {
                return;
            }

            this.renderProductSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
        } catch (error) {
            if (error.name === "AbortError") {
                return;
            }

            console.warn("Cannot search products.", error);
            this.renderSearchState("Search is unavailable. Please try again.");
        }
    }

    renderProductSuggestions(products) {
        this.searchResults.replaceChildren();
        this.searchResults.removeAttribute("aria-busy");
        this.activeSuggestionIndex = -1;

        if (products.length === 0) {
            this.renderSearchState("No matching products found.");
            return;
        }

        const fragment = document.createDocumentFragment();

        products.forEach((product, index) => {
            const option = document.createElement("a");
            option.className = "header-search-option";
            option.href = `/products/${encodeURIComponent(product.id)}`;
            option.id = `header-search-option-${index}`;
            option.setAttribute("role", "option");
            option.setAttribute("aria-selected", "false");

            const media = document.createElement("span");
            media.className = "header-search-option-media";

            if (product.image) {
                const image = document.createElement("img");
                image.src = this.resolveProductImage(product.image);
                image.alt = "";
                image.loading = "lazy";
                media.appendChild(image);
            } else {
                media.textContent = String(product.name || "S").charAt(0).toUpperCase();
            }

            const copy = document.createElement("span");
            copy.className = "header-search-option-copy";
            const name = document.createElement("strong");
            name.textContent = product.name || "Sugar Bliss product";
            const meta = document.createElement("span");
            const price = Number.isFinite(Number(product.price))
                ? `${new Intl.NumberFormat("vi-VN").format(Number(product.price))} \u20ab`
                : "Contact for price";
            meta.textContent = `${product.category || "Treat"} · ${price}`;
            copy.append(name, meta);

            const availability = document.createElement("span");
            availability.className = product.inStock
                ? "header-search-stock"
                : "header-search-stock is-unavailable";
            availability.textContent = product.inStock ? "In stock" : "Out of stock";

            option.append(media, copy, availability);
            option.addEventListener("pointerenter", () => this.setActiveSuggestion(index));
            option.addEventListener("click", () => this.setSearchOpen(false));
            fragment.appendChild(option);
        });

        this.searchResults.appendChild(fragment);
    }

    renderSearchState(message, isLoading = false) {
        const state = document.createElement("p");
        state.className = "header-search-state";
        state.setAttribute("role", "status");
        state.textContent = message;
        this.searchResults.replaceChildren(state);
        this.searchResults.toggleAttribute("aria-busy", isLoading);
        this.setActiveSuggestion(-1);
    }

    renderSearchSignIn() {
        const state = document.createElement("p");
        state.className = "header-search-state";
        state.append("Please ");
        const link = document.createElement("a");
        link.href = "/login";
        link.textContent = "log in";
        state.append(link, " to search products.");
        this.searchResults.replaceChildren(state);
        this.searchResults.removeAttribute("aria-busy");
        this.setActiveSuggestion(-1);
    }

    handleSearchKeydown(event) {
        const options = Array.from(this.searchResults.querySelectorAll(".header-search-option"));

        if (event.key === "Escape") {
            event.preventDefault();
            this.setSearchOpen(false);
            this.searchToggle.focus();
            return;
        }

        if (!options.length || !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
            return;
        }

        if (event.key === "Enter") {
            const selected = options[this.activeSuggestionIndex] || options[0];
            event.preventDefault();
            selected.click();
            return;
        }

        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = (this.activeSuggestionIndex + step + options.length) % options.length;
        this.setActiveSuggestion(nextIndex);
        options[nextIndex].scrollIntoView({ block: "nearest" });
    }

    setActiveSuggestion(index) {
        const options = this.searchResults
            ? Array.from(this.searchResults.querySelectorAll(".header-search-option"))
            : [];
        this.activeSuggestionIndex = index;

        options.forEach((option, optionIndex) => {
            const isActive = optionIndex === index;
            option.classList.toggle("is-active", isActive);
            option.setAttribute("aria-selected", String(isActive));
        });

        if (!this.searchInput) {
            return;
        }

        if (index >= 0 && options[index]) {
            this.searchInput.setAttribute("aria-activedescendant", options[index].id);
        } else {
            this.searchInput.removeAttribute("aria-activedescendant");
        }
    }

    clearProductSearch() {
        this.searchAbortController?.abort();
        this.searchInput.value = "";
        this.searchClear.hidden = true;
        this.renderSearchState("Type at least 2 characters to search.");
        this.searchInput.focus();
    }

    resolveProductImage(image) {
        if (/^https?:\/\//i.test(image)) {
            return image;
        }

        if (image.startsWith("/uploads")) {
            const apiBaseUrl = window.SugarBlissApi?.baseUrl
                || `${window.location.protocol}//${window.location.hostname}:3000`;
            return `${apiBaseUrl}${image}`;
        }

        return image;
    }

    setupLanguageSwitch() {
        if (!window.SugarI18n) {
            return;
        }

        const button = this.querySelector(".lang-switch");
        const codeElement = this.querySelector("[data-lang-code]");
        const refreshCode = () => {
            if (codeElement) {
                codeElement.textContent = window.SugarI18n.getLang() === "vi" ? "EN" : "VI";
            }
        };

        button?.addEventListener("click", () => {
            window.SugarI18n.toggleLang();
            refreshCode();
        });

        window.SugarI18n.apply(this);
        refreshCode();

        this.languageChangedHandler = () => {
            window.SugarI18n.apply(this);
            refreshCode();
        };
        window.addEventListener("sugarbliss:lang-changed", this.languageChangedHandler);
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
