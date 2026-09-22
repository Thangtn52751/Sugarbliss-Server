const PROFILE_API_BASE_URL = window.SugarBlissApi.baseUrl;
let favoriteProductsById = new Map();

document.addEventListener("DOMContentLoaded", () => {
    loadProfile();

    const form = document.querySelector("[data-profile-form]");
    const cancelButton = document.querySelector("[data-profile-cancel]");
    const avatarButton = document.querySelector("[data-profile-avatar]");
    const avatarInput = document.querySelector("[data-avatar-input]");

    form?.addEventListener("submit", saveProfile);
    cancelButton?.addEventListener("click", loadProfile);
    avatarButton?.addEventListener("click", () => avatarInput?.click());
    avatarInput?.addEventListener("change", uploadAvatar);
    document.querySelector("[data-profile-favorites]")?.addEventListener("click", handleFavoriteClick);
    document.addEventListener("keydown", handleFavoriteDetailEscape);
});

async function loadProfile() {
    const token = localStorage.getItem("sugarBlissToken");

    if (!token) {
        window.location.href = "/login";
        return;
    }

    try {
        const response = await fetch(`${PROFILE_API_BASE_URL}/api/users/me/profile`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Cannot load profile.");
        }

        localStorage.setItem("sugarBlissUser", JSON.stringify(data.user));
        renderProfile(data.user);
        renderOrders(data.recentOrders || []);
        renderFavorites(data.favorites || []);
    } catch (error) {
        showProfileMessage(error.message, false);
    }
}

async function saveProfile(event) {
    event.preventDefault();

    const token = localStorage.getItem("sugarBlissToken");
    const form = event.currentTarget;
    const formData = Object.fromEntries(new FormData(form).entries());
    const name = [formData.firstName, formData.lastName].map((value) => value.trim()).filter(Boolean).join(" ");

    try {
        const response = await fetch(`${PROFILE_API_BASE_URL}/api/users/me`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                name,
                phone: formData.phone,
                address: formData.address,
                dateOfBirth: formData.dateOfBirth
            })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Cannot update profile.");
        }

        localStorage.setItem("sugarBlissUser", JSON.stringify(data));
        renderProfile(data);
        showProfileMessage("Profile updated successfully.", true);
    } catch (error) {
        showProfileMessage(error.message, false);
    }
}

async function uploadAvatar(event) {
    const token = localStorage.getItem("sugarBlissToken");
    const file = event.target.files?.[0];

    if (!file || !token) {
        return;
    }

    const formData = new FormData();
    formData.append("avatar", file);

    try {
        showProfileMessage("Uploading avatar...", true);

        const response = await fetch(`${PROFILE_API_BASE_URL}/api/users/me/avatar`, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${token}`
            },
            body: formData
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Cannot upload avatar.");
        }

        localStorage.setItem("sugarBlissUser", JSON.stringify(data));
        renderProfile(data);
        applyHeaderAvatar(data.avatar);
        showProfileMessage("Avatar updated successfully.", true);
    } catch (error) {
        showProfileMessage(error.message, false);
    } finally {
        event.target.value = "";
    }
}

function renderProfile(user) {
    const [firstName, ...lastNameParts] = splitName(user.name);
    const lastName = lastNameParts.join(" ");
    const avatar = document.querySelector("[data-profile-avatar]");

    document.querySelector("[data-profile-name]").textContent = user.name || "Sugar Bliss Customer";
    document.querySelector("[data-profile-email]").textContent = user.email || "";

    if (avatar) {
        avatar.textContent = getInitials(user.name || user.email || "SB");

        if (user.avatar) {
            avatar.style.backgroundImage = `url("${resolveImageUrl(user.avatar)}")`;
            avatar.classList.add("has-image");
        } else {
            avatar.style.backgroundImage = "";
            avatar.classList.remove("has-image");
        }
    }

    setInputValue("firstName", firstName);
    setInputValue("lastName", lastName);
    setInputValue("email", user.email || "");
    setInputValue("phone", user.phone || "");
    setInputValue("address", user.address || "");
    setInputValue("dateOfBirth", toDateInputValue(user.dateOfBirth));
}

function renderOrders(orders) {
    const container = document.querySelector("[data-profile-orders]");

    if (orders.length === 0) {
        container.innerHTML = '<p class="profile-empty">No orders yet.</p>';
        return;
    }

    container.innerHTML = orders.map((order) => `
        <article class="order-row">
            <div>
                <p class="order-name">${escapeHtml(truncate(order.productName, 24))}</p>
                <p class="order-date">Ordered on ${escapeHtml(order.orderedOn)}</p>
            </div>
            <span class="order-status ${order.status === "In Progress" ? "is-progress" : ""}">${escapeHtml(order.status)}</span>
            <strong class="order-total">${formatVnd(order.total)}</strong>
        </article>
    `).join("");
}

function renderFavorites(products) {
    const container = document.querySelector("[data-profile-favorites]");
    favoriteProductsById = new Map(products.map((product) => [String(product._id || product.id || ""), product]));

    if (products.length === 0) {
        container.innerHTML = '<p class="profile-empty">No favorites yet.</p>';
        return;
    }

    container.innerHTML = products.slice(0, 4).map((product) => `
        <button class="favorite-item" type="button" data-favorite-id="${escapeHtml(product._id || product.id || "")}">
            <img src="${escapeHtml(resolveImageUrl(product.images?.[0] || product.image))}" alt="${escapeHtml(product.name)}">
            <div class="favorite-info">
                <h3>${escapeHtml(truncate(product.name, 28))}</h3>
                <p>${formatVnd(product.price)}</p>
            </div>
        </button>
    `).join("");
}

function handleFavoriteClick(event) {
    const item = event.target.closest("[data-favorite-id]");

    if (!item) {
        return;
    }

    showFavoriteDetail(item.dataset.favoriteId);
}

function showFavoriteDetail(productId) {
    const product = favoriteProductsById.get(String(productId));

    if (!product) {
        return;
    }

    const modal = ensureFavoriteDetailModal();
    const ingredients = Array.isArray(product.ingredients) && product.ingredients.length > 0
        ? product.ingredients.join(", ")
        : "Updating";
    const allergens = Array.isArray(product.allergens) && product.allergens.length > 0
        ? product.allergens.join(", ")
        : "None listed";

    modal.querySelector("[data-favorite-detail-image]").src = resolveImageUrl(product.images?.[0] || product.image);
    modal.querySelector("[data-favorite-detail-image]").alt = product.name || "Sugar Bliss product";
    modal.querySelector("[data-favorite-detail-name]").textContent = product.name || "Sugar Bliss Product";
    modal.querySelector("[data-favorite-detail-price]").textContent = formatVnd(product.price);
    modal.querySelector("[data-favorite-detail-description]").textContent = product.description || "No description available.";
    modal.querySelector("[data-favorite-detail-category]").textContent = product.category || "Other";
    modal.querySelector("[data-favorite-detail-stock]").textContent = product.stock ?? "Updating";
    modal.querySelector("[data-favorite-detail-ingredients]").textContent = ingredients;
    modal.querySelector("[data-favorite-detail-allergens]").textContent = allergens;
    modal.classList.add("is-open");
    document.body.classList.add("has-favorite-modal");
}

function ensureFavoriteDetailModal() {
    const existingModal = document.querySelector("[data-favorite-detail-modal]");

    if (existingModal) {
        return existingModal;
    }

    const modal = document.createElement("div");
    modal.className = "favorite-detail-modal";
    modal.dataset.favoriteDetailModal = "";
    modal.innerHTML = `
        <div class="favorite-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="favorite-detail-title">
            <button class="favorite-detail-close" type="button" aria-label="Close detail" data-favorite-detail-close></button>
            <img class="favorite-detail-image" src="" alt="" data-favorite-detail-image>
            <div class="favorite-detail-content">
                <h2 id="favorite-detail-title" data-favorite-detail-name></h2>
                <p class="favorite-detail-price" data-favorite-detail-price></p>
                <p class="favorite-detail-description" data-favorite-detail-description></p>
                <dl class="favorite-detail-list">
                    <div><dt>Category</dt><dd data-favorite-detail-category></dd></div>
                    <div><dt>Stock</dt><dd data-favorite-detail-stock></dd></div>
                    <div><dt>Ingredients</dt><dd data-favorite-detail-ingredients></dd></div>
                    <div><dt>Allergens</dt><dd data-favorite-detail-allergens></dd></div>
                </dl>
            </div>
        </div>
    `;

    modal.addEventListener("click", (event) => {
        if (event.target === modal || event.target.closest("[data-favorite-detail-close]")) {
            closeFavoriteDetail();
        }
    });

    document.body.appendChild(modal);
    return modal;
}

function closeFavoriteDetail() {
    const modal = document.querySelector("[data-favorite-detail-modal]");

    if (!modal) {
        return;
    }

    modal.classList.remove("is-open");
    document.body.classList.remove("has-favorite-modal");
}

function handleFavoriteDetailEscape(event) {
    if (event.key === "Escape") {
        closeFavoriteDetail();
    }
}

function splitName(name = "") {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length <= 1) {
        return [parts[0] || "", ""];
    }

    return [parts[0], parts.slice(1).join(" ")];
}

function getInitials(value) {
    return value
        .split(/\s+|@/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("");
}

function setInputValue(name, value) {
    const input = document.querySelector(`[name="${name}"]`);

    if (input) {
        input.value = value;
    }
}

function toDateInputValue(value) {
    if (!value) {
        return "";
    }

    return new Date(value).toISOString().slice(0, 10);
}

function showProfileMessage(message, success) {
    const element = document.querySelector("[data-profile-message]");

    element.textContent = message;
    element.classList.toggle("is-success", success);
}

function resolveImageUrl(image) {
    if (!image) {
        return "/assets/images/cake2.png";
    }

    if (image.startsWith("http://") || image.startsWith("https://")) {
        return image;
    }

    if (image.startsWith("/uploads")) {
        return `${PROFILE_API_BASE_URL}${image}`;
    }

    return image;
}

function formatVnd(value) {
    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

function truncate(value, maxLength) {
    const text = String(value || "");

    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
