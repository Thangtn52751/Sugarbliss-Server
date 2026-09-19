const API_BASE_URL = "http://localhost:3000";
const preferredCategories = ["Cookies", "Waffles", "Macaroons", "Snacks", "Beverages"];
let productsById = new Map();
let favoriteProductIds = new Set();

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
        const [productsResponse, favoritesResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/api/products?status=all&limit=100`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }),
            fetch(`${API_BASE_URL}/api/users/me/favorites`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })
        ]);

        const productsData = await productsResponse.json();
        const favoritesData = await favoritesResponse.json();

        if (!productsResponse.ok) {
            throw new Error(productsData.message || "Cannot load products.");
        }

        if (!favoritesResponse.ok) {
            throw new Error(favoritesData.message || "Cannot load favorites.");
        }

        favoriteProductIds = new Set((Array.isArray(favoritesData) ? favoritesData : [])
            .map((product) => String(product._id || product.id || "")));
        renderProducts(Array.isArray(productsData.products) ? productsData.products : []);
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
    productsById = new Map(products.map((product) => [String(product._id || product.id || ""), product]));

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

    container.addEventListener("click", handleProductActionClick);
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
    const imageSrc = resolveImageUrl(product.images?.[0] || product.image);
    const price = formatPrice(product.price);
    const isFavorite = favoriteProductIds.has(String(productId));

    return `
        <article class="product-card">
            <button class="favorite-toggle ${isFavorite ? "is-saved" : ""}" type="button" data-favorite-toggle-id="${escapeHtml(productId)}" aria-label="${isFavorite ? "Remove from favorites" : "Add to favorites"}">
                ${isFavorite ? "Saved" : "Favorite"}
            </button>
            <button class="product-image-button" type="button" data-image-detail-id="${escapeHtml(productId)}" aria-label="View ${escapeHtml(product.name || "Sugar Bliss product")} detail" style="cursor: pointer; background: transparent; border: none; padding: 0;">
                <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(product.name || "Sugar Bliss product")}">
            </button>
       
            <h3>${escapeHtml(product.name || "Sugar Bliss Product")}</h3>
            <p class="product-price">${price}</p>
            <div class="product-actions">
                <button class="btn-detail" type="button" data-detail-id="${escapeHtml(productId)}">View Detail</button>
                <button class="btn-order" type="button" data-product-id="${escapeHtml(productId)}">Order Now</button>
            </div>
        </article>
    `;
}

function handleProductActionClick(event) {
    const favoriteButton = event.target.closest("[data-favorite-toggle-id]");
    if (favoriteButton) {
        toggleFavorite(favoriteButton.dataset.favoriteToggleId, favoriteButton);
        return;
    }

    const imageButton = event.target.closest("[data-image-detail-id]");
    if (imageButton) {
        window.location.href = `/pages/product-detail.html?id=${imageButton.dataset.imageDetailId}`;
        return;
    }

    const detailButton = event.target.closest("[data-detail-id]");
    if (detailButton) {
        window.location.href = `/pages/product-detail.html?id=${detailButton.dataset.detailId}`;
        return;
    }

    const orderButton = event.target.closest("[data-product-id]");
    if (orderButton) {
        createOrder(orderButton.dataset.productId, orderButton);
    }
}

async function toggleFavorite(productId, button) {
    const token = localStorage.getItem("sugarBlissToken");

    if (!token) {
        window.location.href = "/login";
        return;
    }

    const isFavorite = favoriteProductIds.has(String(productId));
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = isFavorite ? "Removing..." : "Saving...";

    try {
        const response = await fetch(`${API_BASE_URL}/api/users/me/favorites/${productId}`, {
            method: isFavorite ? "DELETE" : "POST",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Cannot update favorites.");
        }

        if (isFavorite) {
            favoriteProductIds.delete(String(productId));
        } else {
            favoriteProductIds.add(String(productId));
        }

        button.classList.toggle("is-saved", !isFavorite);
        button.textContent = isFavorite ? "Favorite" : "Saved";
        button.setAttribute("aria-label", isFavorite ? "Add to favorites" : "Remove from favorites");
    } catch (error) {
        alert(error.message);
        button.textContent = originalText;
    } finally {
        button.disabled = false;
    }
}

async function createOrder(productId, button) {
    const token = localStorage.getItem("sugarBlissToken");

    if (!token) {
        window.location.href = "/login";
        return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Ordering...";

    try {
        const response = await fetch(`${API_BASE_URL}/api/orders`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                productId,
                quantity: 1
            })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Cannot create order.");
        }

        button.textContent = "Ordered";
        setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
        }, 1200);
    } catch (error) {
        alert(error.message);
        button.textContent = originalText;
        button.disabled = false;
    }
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
