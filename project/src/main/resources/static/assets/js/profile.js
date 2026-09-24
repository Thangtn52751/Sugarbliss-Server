const PROFILE_API_BASE_URL = window.SugarBlissApi.baseUrl;

document.addEventListener("DOMContentLoaded", () => {
    loadProfile();
    loadRecentOrders();

    const form = document.querySelector("[data-profile-form]");
    const cancelButton = document.querySelector("[data-profile-cancel]");
    const avatarButton = document.querySelector("[data-profile-avatar]");
    const avatarInput = document.querySelector("[data-avatar-input]");

    form?.addEventListener("submit", saveProfile);
    cancelButton?.addEventListener("click", loadProfile);
    avatarButton?.addEventListener("click", () => avatarInput?.click());
    avatarInput?.addEventListener("change", uploadAvatar);
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
        renderFavorites(data.favorites || []);
    } catch (error) {
        showProfileMessage(error.message, false);
    }
}

async function loadRecentOrders() {
    const token = localStorage.getItem("sugarBlissToken");
    const container = document.querySelector("[data-profile-orders]");

    if (!token) {
        window.location.href = "/login";
        return;
    }

    container.innerHTML = '<p class="profile-empty">Loading orders...</p>';

    try {
        const response = await fetch(`${PROFILE_API_BASE_URL}/api/orders/my`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const data = await response.json();

        if (response.status === 401) {
            localStorage.removeItem("sugarBlissToken");
            localStorage.removeItem("sugarBlissUser");
            window.location.href = "/login";
            return;
        }

        if (!response.ok) {
            throw new Error(data.message || "Cannot load orders.");
        }

        renderOrders(Array.isArray(data) ? data.slice(0, 3) : []);
    } catch (error) {
        container.innerHTML = `<p class="profile-empty is-error">${escapeHtml(error.message)}</p>`;
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
            <span class="order-status ${getOrderStatusClass(order.status)}">${escapeHtml(order.status)}</span>
            <strong class="order-total">${formatVnd(order.total)}</strong>
        </article>
    `).join("");
}

function getOrderStatusClass(status) {
    if (status === "In Progress") {
        return "is-progress";
    }

    if (status === "Cancelled") {
        return "is-cancelled";
    }

    return "is-delivered";
}

function renderFavorites(products) {
    const container = document.querySelector("[data-profile-favorites]");

    if (products.length === 0) {
        container.innerHTML = '<p class="profile-empty">No favorites yet.</p>';
        return;
    }

    container.innerHTML = products.slice(0, 4).map((product) => {
        const productId = encodeURIComponent(product._id || product.id || "");

        return `
        <a class="favorite-item" href="/product-detail?id=${productId}" aria-label="View ${escapeHtml(product.name || "Sugar Bliss product")} detail">
            <img src="${escapeHtml(resolveImageUrl(product.images?.[0] || product.image))}" alt="${escapeHtml(product.name)}">
            <div class="favorite-info">
                <h3>${escapeHtml(truncate(product.name, 28))}</h3>
                <p>${formatVnd(product.price)}</p>
            </div>
        </a>
    `;
    }).join("");
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
