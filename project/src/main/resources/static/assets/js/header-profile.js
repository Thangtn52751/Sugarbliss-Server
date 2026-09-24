const HEADER_PROFILE_API_BASE_URL = window.SugarBlissApi.baseUrl;
let headerCartRecordCount = 0;

document.addEventListener("DOMContentLoaded", () => {
    hydrateHeaderAvatar();
    attachProfileMenus();
    hydrateHeaderCartCount();
    window.addEventListener("sugarbliss:cart-updated", handleHeaderCartUpdate);
});

async function hydrateHeaderAvatar() {
    const profileLinks = document.querySelectorAll(".profile-link");

    if (profileLinks.length === 0) {
        return;
    }

    const cachedUser = readCachedUser();

    if (cachedUser) {
        updateProfileMenus(cachedUser);

        if (cachedUser.avatar) {
            applyHeaderAvatar(cachedUser.avatar);
            return;
        }
    }

    const token = localStorage.getItem("sugarBlissToken");

    if (!token) {
        return;
    }

    try {
        const response = await fetch(`${HEADER_PROFILE_API_BASE_URL}/api/users/me`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const user = await response.json();

        if (response.ok) {
            localStorage.setItem("sugarBlissUser", JSON.stringify(user));
            updateProfileMenus(user);

            if (user.avatar) {
                applyHeaderAvatar(user.avatar);
            }
        }
    } catch (error) {
        console.warn("Cannot load header avatar.", error);
    }
}

function attachProfileMenus() {
    document.querySelectorAll(".profile-link").forEach((link) => {
        if (link.closest(".profile-menu-wrap")) {
            return;
        }

        const wrapper = document.createElement("div");
        wrapper.className = "profile-menu-wrap";
        link.addEventListener("click", (event) => event.preventDefault());
        link.removeAttribute("href");
        link.tabIndex = 0;
        link.setAttribute("aria-haspopup", "true");
        link.setAttribute("aria-label", "Open profile menu");
        link.parentNode.insertBefore(wrapper, link);
        wrapper.appendChild(link);
        wrapper.appendChild(createProfileMenu(readCachedUser()));
    });
}

function createProfileMenu(user) {
    const menu = document.createElement("div");
    menu.className = "profile-menu";
    menu.innerHTML = getProfileMenuMarkup(user);
    menu.addEventListener("click", handleProfileMenuClick);
    return menu;
}

function updateProfileMenus(user) {
    document.querySelectorAll(".profile-menu").forEach((menu) => {
        menu.innerHTML = getProfileMenuMarkup(user);
    });
}

function getProfileMenuMarkup(user) {
    const displayName = user?.name || "Sugar Bliss Customer";
    const email = user?.email || "customer@sugarbliss.com";
    const avatar = user?.avatar ? resolveHeaderAvatarUrl(user.avatar) : "";
    const avatarStyle = avatar ? ` style="background-image: url('${escapeHeaderHtml(avatar)}')"` : "";
    const avatarClass = avatar ? " menu-avatar has-image" : " menu-avatar";

    return `
        <div class="profile-menu-user">
            <span class="${avatarClass}"${avatarStyle}>${escapeHeaderHtml(getInitials(displayName || email))}</span>
            <span>
                <strong>${escapeHeaderHtml(displayName)}</strong>
                <small>${escapeHeaderHtml(email)}</small>
            </span>
        </div>
        <a class="profile-menu-item" href="/profile">
            <span class="menu-icon" aria-hidden="true"><img src="/assets/icons/profile_ic.png" alt=""></span>
            <span>Profile</span>
            <span class="menu-chevron" aria-hidden="true"></span>
        </a>
        <a class="profile-menu-item" href="/orders">
            <span class="menu-icon" aria-hidden="true"><img src="/assets/icons/ic_mail.png" alt=""></span>
            <span>Order History</span>
            <span class="menu-chevron" aria-hidden="true"></span>
        </a>
        <a class="profile-menu-item" href="/cart">
            <span class="menu-icon" aria-hidden="true"><img src="/assets/icons/ic_cart.png" alt=""></span>
            <span class="menu-label-with-count">Your Cart <strong data-header-cart-count>${headerCartRecordCount}</strong></span>
            <span class="menu-chevron" aria-hidden="true"></span>
        </a>
        <div class="profile-menu-item is-static">
            <span class="menu-icon" aria-hidden="true"><img src="/assets/icons/ic_setting.png" alt=""></span>
            <span>Settings</span>
            <span class="menu-chevron" aria-hidden="true"></span>
        </div>
        <button class="profile-menu-item logout-item" type="button" data-header-logout>
            <span class="menu-icon" aria-hidden="true"><img src="/assets/icons/ic_logout.png" alt=""></span>
            <span>Logout</span>
        </button>
    `;
}

async function hydrateHeaderCartCount() {
    const token = localStorage.getItem("sugarBlissToken");

    if (!token) {
        setHeaderCartCount(0);
        return;
    }

    try {
        const response = await fetch(`${HEADER_PROFILE_API_BASE_URL}/api/users/me/cart`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const cart = await response.json();

        if (response.ok) {
            setHeaderCartCount(Array.isArray(cart) ? cart.length : 0);
        }
    } catch (error) {
        console.warn("Cannot load cart count.", error);
    }
}

function handleHeaderCartUpdate(event) {
    if (Number.isInteger(event.detail?.count)) {
        setHeaderCartCount(event.detail.count);
        return;
    }

    hydrateHeaderCartCount();
}

function setHeaderCartCount(count) {
    headerCartRecordCount = Math.max(Number(count) || 0, 0);
    document.querySelectorAll("[data-header-cart-count]").forEach((badge) => {
        badge.textContent = headerCartRecordCount;
        badge.setAttribute("aria-label", `${headerCartRecordCount} product records in cart`);
    });
}

function handleProfileMenuClick(event) {
    const logoutButton = event.target.closest("[data-header-logout]");

    if (!logoutButton) {
        return;
    }

    localStorage.removeItem("sugarBlissToken");
    localStorage.removeItem("sugarBlissUser");
    window.location.href = "/login";
}

function applyHeaderAvatar(avatar) {
    document.querySelectorAll(".profile-link").forEach((link) => {
        link.style.backgroundImage = `url("${resolveHeaderAvatarUrl(avatar)}")`;
        link.classList.add("has-avatar");
    });
}

function readCachedUser() {
    try {
        return JSON.parse(localStorage.getItem("sugarBlissUser") || "null");
    } catch (error) {
        return null;
    }
}

function getInitials(value) {
    return String(value || "SB")
        .split(/\s+|@/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("");
}

function escapeHeaderHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function resolveHeaderAvatarUrl(avatar) {
    if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
        return avatar;
    }

    if (avatar.startsWith("/uploads")) {
        return `${HEADER_PROFILE_API_BASE_URL}${avatar}`;
    }

    return avatar;
}
