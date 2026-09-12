const API_BASE_URL = "http://localhost:3000";
const preferredCategories = ["Cookies", "Waffles", "Macaroons", "Snacks", "Beverages"];

document.addEventListener("DOMContentLoaded", () => {
    fetchProducts();
});

async function fetchProducts() {
    const container = document.querySelector("[data-products-container]");
    const categoryList = document.querySelector("[data-category-list]");
    const token = localStorage.getItem("sugarBlissToken");

    if (!container || !categoryList) {
        return;
    }

    if (!token) {
        container.innerHTML = `
            <div class="products-state">
                <p>Please log in to view our products.</p>
                <a href="/login">Login Now</a>
            </div>
        `;
        categoryList.innerHTML = "";
        return;
    }

    container.innerHTML = '<div class="products-state"><p>Loading products...</p></div>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/products?status=all&limit=100`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Cannot load products.");
        }

        renderProducts(Array.isArray(data.products) ? data.products : []);
    } catch (error) {
        container.innerHTML = `
            <div class="products-state is-error">
                <p>${escapeHtml(error.message)}</p>
                <a href="/login">Login Again</a>
            </div>
        `;
    }
}

function renderProducts(products) {
    const container = document.querySelector("[data-products-container]");
    const categoryList = document.querySelector("[data-category-list]");

    if (products.length === 0) {
        container.innerHTML = `
            <div class="products-state">
                <p>No products are available yet.</p>
            </div>
        `;
        categoryList.innerHTML = "";
        return;
    }

    const groupedProducts = groupProductsByCategory(products);
    const orderedCategories = getOrderedCategories(groupedProducts);

    categoryList.innerHTML = orderedCategories
        .map((category) => `<li><a href="#${toSectionId(category)}">${escapeHtml(category)}</a></li>`)
        .join("");

    container.innerHTML = orderedCategories
        .map((category) => renderCategorySection(category, groupedProducts[category]))
        .join("");

    container.addEventListener("click", handleOrderClick);
}

function groupProductsByCategory(products) {
    return products.reduce((groups, product) => {
        const category = product.category || "Other";

        if (!groups[category]) {
            groups[category] = [];
        }

        groups[category].push(product);
        return groups;
    }, {});
}

function getOrderedCategories(groupedProducts) {
    const categories = Object.keys(groupedProducts);
    const preferred = preferredCategories.filter((category) => categories.includes(category));
    const remaining = categories
        .filter((category) => !preferredCategories.includes(category))
        .sort((first, second) => first.localeCompare(second));

    return [...preferred, ...remaining];
}

function renderCategorySection(category, products) {
    return `
        <section class="category-section" id="${toSectionId(category)}">
            <h2>${escapeHtml(category)}</h2>
            <div class="products-grid-layout">
                ${products.map(renderProductCard).join("")}
            </div>
        </section>
    `;
}

function renderProductCard(product) {
    const productId = product._id || product.id || "";
    const imageSrc = resolveImageUrl(product.image);
    const price = formatPrice(product.price);

    return `
        <article class="product-card">
            <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(product.name || "Sugar Bliss product")}">
            <h3>${escapeHtml(product.name || "Sugar Bliss Product")}</h3>
            <p class="product-price">${price}</p>
            <button class="btn-order" type="button" data-product-id="${escapeHtml(productId)}">Order Now</button>
        </article>
    `;
}

function handleOrderClick(event) {
    const button = event.target.closest("[data-product-id]");

    if (!button) {
        return;
    }

    alert(`Product selected: ${button.dataset.productId}`);
}

function resolveImageUrl(image) {
    if (!image) {
        return "/assets/images/cake2.png";
    }

    if (image.startsWith("http://") || image.startsWith("https://")) {
        return image;
    }

    if (image.startsWith("/uploads")) {
        return `${API_BASE_URL}${image}`;
    }

    return image;
}

function formatPrice(price) {
    const value = Number(price);

    if (!Number.isFinite(value)) {
        return "Contact for price";
    }

    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0
    }).format(value);
}

function toSectionId(category) {
    return category
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
