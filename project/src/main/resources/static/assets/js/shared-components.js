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

// ==========================================
// THÀNH PHẦN AI CHATBOT MỚI
// ==========================================
class SugarChatbox extends HTMLElement {
    connectedCallback() {
        this.history = []; // Khởi tạo mảng lưu trữ ngữ cảnh chat
        this.API_BASE_URL = window.SugarBlissApi?.baseUrl || `${window.location.protocol}//${window.location.hostname}:3000`;

        // CSS và HTML giao diện Chatbot
        this.innerHTML = `
            <style>
                .sb-chat-wrapper { position: fixed; bottom: 24px; right: 24px; z-index: 9999; font-family: inherit; }
                .sb-chat-toggle { width: 56px; height: 56px; border-radius: 50%; background: #d94960; color: white; border: none; cursor: pointer; box-shadow: 0 4px 15px rgba(217,73,96,0.3); display: flex; align-items: center; justify-content: center; transition: transform 0.2s; }
                .sb-chat-toggle:hover { transform: scale(1.05); }
                .sb-chat-window { display: none; width: min(350px, calc(100vw - 48px)); height: min(500px, calc(100dvh - 124px)); background: white; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); flex-direction: column; overflow: hidden; position: absolute; bottom: 76px; right: 0; border: 1px solid #f3d9df; box-sizing: border-box; }
                .sb-chat-window.active { display: flex; animation: slideUpChat 0.3s ease; }
                .sb-chat-header { background: #d94960; color: white; padding: 16px 20px; font-weight: 800; font-size: 16px; display: flex; justify-content: space-between; align-items: center; }
                .sb-chat-close { background: none; border: none; color: white; font-size: 24px; line-height: 1; cursor: pointer; }
                .sb-chat-body { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; background: #fffafb; scroll-behavior: smooth; }
                .sb-msg { max-width: 85%; padding: 12px 16px; font-size: 14px; line-height: 1.5; word-wrap: break-word; }
                .sb-msg.user { align-self: flex-end; background: #d94960; color: white; border-radius: 16px 16px 2px 16px; }
                .sb-msg.assistant { align-self: flex-start; background: #ffffff; color: #2c2528; border: 1px solid #f3d9df; border-radius: 16px 16px 16px 2px; }
                .sb-msg.assistant.has-products { width: 100%; max-width: 100%; padding: 0; border: 0; border-radius: 0; background: transparent; box-sizing: border-box; }
                .sb-chat-reply-copy { margin: 0 0 10px; padding: 12px 16px; white-space: pre-wrap; background: white; border: 1px solid #f3d9df; border-radius: 16px 16px 16px 2px; overflow-wrap: anywhere; }
                .sb-chat-products { display: grid; gap: 8px; }
                .sb-chat-product-card { display: grid; grid-template-columns: 72px minmax(0, 1fr); align-items: center; gap: 12px; padding: 8px; color: #2c2528; background: white; border: 1px solid #f3d9df; border-radius: 8px; text-decoration: none; transition: background 0.15s, border-color 0.15s; }
                .sb-chat-product-card:hover { background: #fff1f4; border-color: #d94960; }
                .sb-chat-product-card:focus-visible { outline: 2px solid #d94960; outline-offset: 2px; }
                .sb-chat-product-media { display: flex; align-items: center; justify-content: center; width: 72px; aspect-ratio: 1; overflow: hidden; border-radius: 6px; background: #fff1f4; color: #d94960; font-weight: 700; }
                .sb-chat-product-media img { width: 100%; height: 100%; object-fit: cover; }
                .sb-chat-product-copy { display: grid; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
                .sb-chat-product-name { font-size: 14px; line-height: 1.4; }
                .sb-chat-product-category, .sb-chat-product-stock { font-size: 11px; color: #77696e; }
                .sb-chat-product-price { font-size: 13px; font-weight: 700; color: #d94960; }
                .sb-chat-footer { padding: 12px 16px; border-top: 1px solid #f3d9df; display: flex; gap: 8px; background: white; }
                .sb-chat-input { flex: 1; min-width: 0; padding: 10px 16px; border: 1px solid #ddd; border-radius: 999px; outline: none; font-size: 14px; transition: border-color 0.2s; font-family: inherit; }
                .sb-chat-input:focus { border-color: #d94960; }
                .sb-chat-send { background: #d94960; color: white; border: none; padding: 8px 16px; border-radius: 999px; cursor: pointer; font-weight: bold; }
                .sb-chat-send:disabled { background: #e0e0e0; cursor: not-allowed; color: #999; }
                .sb-chat-login { display: block; margin-top: 8px; color: #d94960; font-weight: 700; }
                @keyframes slideUpChat { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            </style>
            
            <div class="sb-chat-wrapper">
                <div class="sb-chat-window">
                    <div class="sb-chat-header">
                        <span>Sugar Bliss Assistant</span>
                        <button class="sb-chat-close" aria-label="Close chat">&times;</button>
                    </div>
                    <div class="sb-chat-body" id="sb-chat-body" role="log" aria-live="polite" aria-relevant="additions text">
                        <div class="sb-msg assistant">Hi! How can I help you find the perfect cake today?</div>
                    </div>
                    <form class="sb-chat-footer" id="sb-chat-form">
                        <input type="text" class="sb-chat-input" id="sb-chat-input" placeholder="Ask me anything..." aria-label="Message to Sugar Bliss Assistant" maxlength="1200" required autocomplete="off">
                        <button type="submit" class="sb-chat-send">Send</button>
                    </form>
                </div>
                <button class="sb-chat-toggle" aria-label="Open AI Assistant">
                    <svg width="28" height="28" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 5.92 2 10.75c0 2.8 1.54 5.3 3.96 6.87-.27 1.63-.97 3.32-1.02 3.45-.06.18-.02.39.1.53.13.14.33.19.51.13 3.12-1.01 5.34-2.5 6.42-3.32.65.11 1.33.17 2.03.17 5.52 0 10-3.92 10-8.75S17.52 2 12 2z"/>
                    </svg>
                </button>
            </div>
        `;

        this.bindEvents();
    }

    bindEvents() {
        const toggleBtn = this.querySelector('.sb-chat-toggle');
        const closeBtn = this.querySelector('.sb-chat-close');
        const windowEl = this.querySelector('.sb-chat-window');
        const form = this.querySelector('#sb-chat-form');
        const input = this.querySelector('#sb-chat-input');
        const bodyEl = this.querySelector('#sb-chat-body');
        const sendBtn = this.querySelector('.sb-chat-send');

        toggleBtn.addEventListener('click', () => windowEl.classList.add('active'));
        closeBtn.addEventListener('click', () => windowEl.classList.remove('active'));

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = input.value.trim();
            if (!text || this.isSending) return;

            const token = localStorage.getItem('sugarBlissToken');
            if (!token) {
                this.showLoginMessage(bodyEl);
                return;
            }

            this.addMessage(text, 'user', bodyEl);
            input.value = '';
            this.isSending = true;
            input.disabled = true;
            sendBtn.disabled = true;
            form.setAttribute('aria-busy', 'true');
            const loadingMsg = this.addMessage('...', 'assistant', bodyEl);

            try {
                const response = await fetch(`${this.API_BASE_URL}/api/chatbox/message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(65000),
                    body: JSON.stringify({
                        message: text,
                        history: this.history
                    })
                });
                const data = await response.json().catch(() => ({}));
                const reply = typeof data.reply === 'string' ? data.reply.trim() : '';

                if (response.ok && reply) {
                    this.addAssistantReply(reply, data.products, bodyEl);
                    this.history = [
                        ...this.history,
                        { role: 'user', content: text },
                        { role: 'assistant', content: reply.slice(0, 1200) },
                    ].slice(-12);
                } else {
                    this.showErrorMessage(response.status, data.code, bodyEl);
                    input.value = text;
                }
            } catch (error) {
                const message = ['AbortError', 'TimeoutError'].includes(error.name)
                    ? 'The AI request timed out. Please try again.'
                    : 'Unable to reach Sugar Bliss. Check your connection and try again.';
                this.addMessage(message, 'assistant', bodyEl);
                input.value = text;
            } finally {
                loadingMsg.remove();
                this.isSending = false;
                input.disabled = false;
                sendBtn.disabled = false;
                form.setAttribute('aria-busy', 'false');
                input.focus();
            }
        });
    }

    addAssistantReply(reply, products, container) {
        const catalog = new Map();
        if (Array.isArray(products)) {
            products.forEach((product) => {
                const id = String(product?.id || '').toLowerCase();
                if (/^[a-f\d]{24}$/.test(id)) catalog.set(`/products/${id}`, { ...product, id });
            });
        }

        if (!catalog.size) return this.addMessage(reply, 'assistant', container);

        const copy = reply.replace(/\[[^\]\n]*\]\((\/products\/[a-f\d]{24})\)|<?(\/products\/[a-f\d]{24})(?![a-z\d_/-])>?/gi,
            (match, markdownPath, plainPath) => catalog.has((markdownPath || plainPath).toLowerCase()) ? '' : match)
            .replace(/\(\s*\)/g, '')
            .replace(/^[ \t]*[-*][ \t]*$/gm, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        const msg = this.addMessage('', 'assistant has-products', container);
        if (copy) {
            const text = document.createElement('p');
            text.className = 'sb-chat-reply-copy';
            text.textContent = copy;
            msg.appendChild(text);
        }

        const cards = document.createElement('div');
        cards.className = 'sb-chat-products';
        catalog.forEach((product) => cards.appendChild(this.createProductCard(product)));
        msg.appendChild(cards);
        container.scrollTop = container.scrollHeight;
        return msg;
    }

    createProductCard(product) {
        const name = String(product.name || 'Sugar Bliss product');
        const card = document.createElement('a');
        card.className = 'sb-chat-product-card';
        card.href = `/products/${product.id}`;
        card.setAttribute('aria-label', `View ${name} details`);

        const media = document.createElement('span');
        media.className = 'sb-chat-product-media';
        const imageUrl = this.resolveChatProductImage(product.image);
        if (imageUrl) {
            const image = document.createElement('img');
            image.src = imageUrl;
            image.alt = name;
            image.loading = 'lazy';
            image.addEventListener('error', () => {
                image.remove();
                media.textContent = name.charAt(0).toUpperCase();
            }, { once: true });
            media.appendChild(image);
        } else {
            media.textContent = name.charAt(0).toUpperCase();
        }

        const details = document.createElement('span');
        details.className = 'sb-chat-product-copy';
        const title = document.createElement('strong');
        title.className = 'sb-chat-product-name';
        title.textContent = name;
        const category = document.createElement('span');
        category.className = 'sb-chat-product-category';
        category.textContent = String(product.category || '');
        const price = document.createElement('span');
        price.className = 'sb-chat-product-price';
        price.textContent = Number.isFinite(Number(product.price))
            ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(product.price))
            : 'Contact for price';
        details.appendChild(title);
        if (category.textContent) details.appendChild(category);
        details.appendChild(price);
        if (product.inStock === false) {
            const stock = document.createElement('span');
            stock.className = 'sb-chat-product-stock';
            stock.textContent = 'Out of stock';
            details.appendChild(stock);
        }
        card.appendChild(media);
        card.appendChild(details);
        return card;
    }

    resolveChatProductImage(image) {
        const value = String(image || '').trim();
        if (!value) return '';

        try {
            const base = value.startsWith('/uploads/') ? this.API_BASE_URL : window.location.origin;
            const url = new URL(value, base);
            return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
        } catch {
            return '';
        }
    }

    showLoginMessage(container) {
        const msg = this.addMessage('Please log in to chat with Sugar Bliss Assistant.', 'assistant', container);
        const link = document.createElement('a');
        link.className = 'sb-chat-login';
        link.href = '/login';
        link.textContent = 'Log in';
        msg.appendChild(link);
        container.scrollTop = container.scrollHeight;
    }

    showErrorMessage(status, code, container) {
        if (status === 401) {
            this.showLoginMessage(container);
            return;
        }

        let message = 'The AI service is temporarily unavailable. Please try again later.';
        if (code === 'AI_AUTHENTICATION_ERROR') {
            message = 'The AI service could not authenticate. Please contact Sugar Bliss.';
        } else if (status === 429) {
            message = 'Too many chat requests. Please wait a moment before trying again.';
        } else if (status === 504) {
            message = 'The AI request timed out. Please try again.';
        } else if (status === 403) {
            message = 'This account cannot use chat. Please contact Sugar Bliss.';
        } else if (status === 400) {
            message = 'Unable to send this message. Please shorten it and try again.';
        }
        this.addMessage(message, 'assistant', container);
    }

    addMessage(text, role, container) {
        const msg = document.createElement('div');
        msg.className = `sb-msg ${role}`;
        msg.textContent = text;
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight; 
        return msg;
    }
}

if (!customElements.get("sugar-header")) {
    customElements.define("sugar-header", SugarHeader);
}

if (!customElements.get("sugar-footer")) {
    customElements.define("sugar-footer", SugarFooter);
}
if (!customElements.get("sugar-chatbox")) {
    customElements.define("sugar-chatbox", SugarChatbox);
    
    document.addEventListener("DOMContentLoaded", () => {
        if (!document.querySelector('sugar-chatbox')) {
            document.body.appendChild(document.createElement("sugar-chatbox"));
        }
    });
}
