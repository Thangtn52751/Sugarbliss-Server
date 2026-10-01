(function initializeAdminShell() {
    const tokenKey = "sugarBlissToken";
    const userKey = "sugarBlissUser";

    function signOut() {
        localStorage.removeItem(tokenKey);
        localStorage.removeItem(userKey);
        window.location.replace("/login");
    }

    function assetUrl(value) {
        const url = String(value || "");
        if (url.startsWith("/uploads/")) return window.SugarBlissApi.url(url);
        if (url.startsWith("/assets/") || /^https?:\/\//i.test(url)) return url;
        return "";
    }

    class SugarAdminSidebar extends HTMLElement {
        connectedCallback() {
            const activePage = this.getAttribute("active") || "dashboard";
            const items = [
                { key: "dashboard", label: "Dashboard", icon: "ic_dashboard.png" },
                { key: "products", label: "Products", icon: "ic_product.png" },
                { key: "orders", label: "Orders", icon: "ic_orders.png" },
                { key: "customers", label: "Customers", icon: "ic_costumer.png" },
                { key: "special-orders", label: "Special Orders", icon: "ic_specialorder.png" },
            ];

            this.innerHTML = `
                <aside class="admin-sidebar" aria-label="Admin portal">
                    <a class="admin-brand" href="/admin/dashboard" aria-label="Sugar Bliss dashboard">
                        <img src="/assets/icons/logo.png" alt="">
                        <span><strong>Sugar<br>Bliss</strong><small>ADMIN PORTAL</small></span>
                    </a>
                    <nav class="admin-nav" aria-label="Admin navigation">
                        ${items.map((item) => `
                            <a href="/admin/${item.key}" ${item.key === activePage ? 'class="is-active" aria-current="page"' : ""}>
                                <img src="/assets/icons/${item.icon}" alt="">
                                <span>${item.label}</span>
                            </a>
                        `).join("")}
                    </nav>
                    <div class="admin-account">
                        <span class="admin-avatar"><img data-admin-avatar src="/assets/icons/profile_ic.png" alt=""></span>
                        <span class="admin-account-copy"><strong data-admin-name>Admin</strong><small>Manager</small></span>
                        <button class="admin-logout" type="button" title="Logout" aria-label="Logout">
                            <img src="/assets/icons/ic_logout.png" alt="">
                        </button>
                    </div>
                </aside>
            `;

            this.querySelector(".admin-logout").addEventListener("click", signOut);
        }

        updateAccount(user) {
            this.querySelector("[data-admin-name]").textContent = user.name || "Admin";
            const avatar = assetUrl(user.avatar);
            if (avatar) {
                const image = this.querySelector("[data-admin-avatar]");
                image.src = avatar;
                image.classList.add("has-photo");
                image.addEventListener("error", () => {
                    image.src = "/assets/icons/profile_ic.png";
                    image.classList.remove("has-photo");
                }, { once: true });
            }
        }
    }

    if (!customElements.get("sugar-admin-sidebar")) {
        customElements.define("sugar-admin-sidebar", SugarAdminSidebar);
    }

    async function request(path, options = {}) {
        const token = localStorage.getItem(tokenKey);
        if (!token) {
            signOut();
            return null;
        }

        const response = await fetch(window.SugarBlissApi.url(path), {
            ...options,
            headers: { ...options.headers, Authorization: `Bearer ${token}` },
            signal: options.signal || AbortSignal.timeout(15000),
        });

        if (response.status === 401) {
            signOut();
            return null;
        }
        if (response.status === 403) {
            window.location.replace("/home");
            return null;
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Unable to load admin data.");
        return data;
    }

    async function verifySession() {
        const accessState = document.querySelector("[data-admin-access-state]");
        try {
            const user = await request("/api/users/me");
            if (!user) return null;
            if (user.role !== "admin") {
                window.location.replace("/home");
                return null;
            }

            localStorage.setItem(userKey, JSON.stringify(user));
            document.querySelector("sugar-admin-sidebar").updateAccount(user);
            document.querySelector("[data-admin-content]").hidden = false;
            accessState.hidden = true;
            return user;
        } catch (error) {
            accessState.replaceChildren();
            const message = document.createElement("p");
            message.textContent = "Unable to connect to the server.";
            const retry = document.createElement("button");
            retry.type = "button";
            retry.className = "admin-retry";
            retry.textContent = "Try again";
            retry.addEventListener("click", () => window.location.reload());
            accessState.append(message, retry);
            return null;
        }
    }

    window.SugarBlissAdmin = { request, assetUrl, ready: verifySession() };
}());
