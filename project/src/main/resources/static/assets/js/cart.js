const CART_API_BASE_URL = window.SugarBlissApi.baseUrl;
let cartItems = [];
let deliveryMethods = [];
let selectedDeliveryMethod = "standard";

document.addEventListener("DOMContentLoaded", () => {
    document.querySelector("[data-cart-list]")?.addEventListener("click", handleCartAction);
    document.querySelector("[data-cart-checkout]")?.addEventListener("click", checkoutCart);
    document.querySelector("[data-delivery-method]")?.addEventListener("change", handleDeliveryMethodChange);
    loadCart();
});

async function loadCart() {
    const token = localStorage.getItem("sugarBlissToken");

    if (!token) {
        window.location.href = "/login";
        return;
    }

    try {
        const requestOptions = { headers: { Authorization: `Bearer ${token}` } };
        const [cartResponse, deliveryResponse] = await Promise.all([
            fetch(`${CART_API_BASE_URL}/api/users/me/cart`, requestOptions),
            fetch(`${CART_API_BASE_URL}/api/orders/delivery-methods`, requestOptions)
        ]);
        const [cartData, deliveryData] = await Promise.all([
            cartResponse.json(),
            deliveryResponse.json()
        ]);

        if (cartResponse.status === 401 || deliveryResponse.status === 401) {
            clearCartSession();
            return;
        }

        if (!cartResponse.ok) {
            throw new Error(cartData.message || "Cannot load your cart.");
        }

        if (!deliveryResponse.ok) {
            throw new Error(deliveryData.message || "Cannot load delivery methods.");
        }

        deliveryMethods = Array.isArray(deliveryData) ? deliveryData : [];
        if (!deliveryMethods.some((method) => method.code === selectedDeliveryMethod)) {
            selectedDeliveryMethod = deliveryMethods[0]?.code || "standard";
        }

        renderDeliveryMethods();
        setCartItems(Array.isArray(cartData) ? cartData : []);
    } catch (error) {
        const state = document.querySelector("[data-cart-state]");
        state.hidden = false;
        state.classList.add("is-error");
        state.textContent = error.message;
    }
}

function setCartItems(items) {
    cartItems = items;
    renderCart();
    window.dispatchEvent(new CustomEvent("sugarbliss:cart-updated", {
        detail: { count: cartItems.length }
    }));
}

function renderCart() {
    const list = document.querySelector("[data-cart-list]");
    const state = document.querySelector("[data-cart-state]");
    const checkoutButton = document.querySelector("[data-cart-checkout]");
    const subtotal = cartItems.reduce((sum, item) => {
        return sum + Number(item.product?.price || 0) * Number(item.quantity || 0);
    }, 0);
    const deliveryFee = Number(getSelectedDeliveryMethod()?.fee) || 0;

    document.querySelector("[data-cart-record-count]").textContent = `(${cartItems.length})`;
    document.querySelector("[data-cart-subtotal]").textContent = formatCartPrice(subtotal);
    document.querySelector("[data-cart-delivery]").textContent = deliveryFee === 0
        ? "Free"
        : formatCartPrice(deliveryFee);
    document.querySelector("[data-cart-total]").textContent = formatCartPrice(subtotal + deliveryFee);
    checkoutButton.disabled = cartItems.length === 0;

    if (cartItems.length === 0) {
        list.replaceChildren();
        state.hidden = false;
        state.classList.remove("is-error");
        state.innerHTML = 'Your cart is empty. <a href="/products">Browse our products</a>.';
        return;
    }

    state.hidden = true;
    list.innerHTML = cartItems.map(renderCartItem).join("");
}

function handleDeliveryMethodChange(event) {
    selectedDeliveryMethod = event.target.value;
    renderCart();
}

function renderDeliveryMethods() {
    const select = document.querySelector("[data-delivery-method]");

    select.replaceChildren();
    deliveryMethods.forEach((method) => {
        const option = document.createElement("option");
        option.value = method.code;
        option.textContent = `${method.label} - ${Number(method.fee) === 0 ? "Free" : formatCartPrice(method.fee)}`;
        option.selected = method.code === selectedDeliveryMethod;
        select.appendChild(option);
    });
    select.disabled = deliveryMethods.length === 0;
}

function getSelectedDeliveryMethod() {
    return deliveryMethods.find((method) => method.code === selectedDeliveryMethod);
}

function renderCartItem(item) {
    const product = item.product || {};
    const productId = String(product._id || product.id || "");
    const quantity = Number(item.quantity) || 1;
    const lineTotal = Number(product.price || 0) * quantity;

    return `
        <article class="cart-item" data-cart-product="${escapeCartHtml(productId)}">
            <a class="cart-item-image" href="/product-detail?id=${encodeURIComponent(productId)}">
                <img src="${escapeCartHtml(resolveCartImage(product.images?.[0] || product.image))}" alt="${escapeCartHtml(product.name || "Sugar Bliss product")}">
            </a>
            <div class="cart-item-info">
                <h2>${escapeCartHtml(product.name || "Sugar Bliss Product")}</h2>
                <p>${product.weightGram ? `Weight: ${escapeCartHtml(product.weightGram)}g` : escapeCartHtml(product.category || "Freshly baked")}</p>
                <button class="remove-cart-item" type="button" data-cart-remove="${escapeCartHtml(productId)}">Remove item</button>
            </div>
            <strong class="cart-line-total">${formatCartPrice(lineTotal)}</strong>
            <div class="cart-quantity" aria-label="Quantity for ${escapeCartHtml(product.name || "product")}">
                <button type="button" data-cart-decrease="${escapeCartHtml(productId)}" aria-label="Decrease quantity" ${quantity <= 1 ? "disabled" : ""}>&minus;</button>
                <span>${quantity}</span>
                <button type="button" data-cart-increase="${escapeCartHtml(productId)}" aria-label="Increase quantity">+</button>
            </div>
        </article>
    `;
}

function handleCartAction(event) {
    const removeButton = event.target.closest("[data-cart-remove]");
    const decreaseButton = event.target.closest("[data-cart-decrease]");
    const increaseButton = event.target.closest("[data-cart-increase]");

    if (removeButton) {
        removeCartItem(removeButton.dataset.cartRemove, removeButton);
        return;
    }

    const quantityButton = decreaseButton || increaseButton;
    if (!quantityButton) {
        return;
    }

    const productId = decreaseButton?.dataset.cartDecrease || increaseButton.dataset.cartIncrease;
    const item = cartItems.find((cartItem) => String(cartItem.product?._id || cartItem.product?.id) === String(productId));
    const change = decreaseButton ? -1 : 1;

    if (item) {
        updateCartQuantity(productId, Number(item.quantity) + change, quantityButton);
    }
}

async function updateCartQuantity(productId, quantity, button) {
    if (quantity < 1) {
        return;
    }

    button.disabled = true;

    try {
        const response = await fetch(`${CART_API_BASE_URL}/api/users/me/cart/${productId}`, {
            method: "PATCH",
            headers: getCartHeaders(true),
            body: JSON.stringify({ quantity })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Cannot update quantity.");
        }

        setCartItems(Array.isArray(data) ? data : []);
    } catch (error) {
        alert(error.message);
        button.disabled = false;
    }
}

async function removeCartItem(productId, button) {
    button.disabled = true;

    try {
        const response = await fetch(`${CART_API_BASE_URL}/api/users/me/cart/${productId}`, {
            method: "DELETE",
            headers: getCartHeaders()
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Cannot remove this item.");
        }

        setCartItems(Array.isArray(data) ? data : []);
    } catch (error) {
        alert(error.message);
        button.disabled = false;
    }
}

async function checkoutCart() {
    const button = document.querySelector("[data-cart-checkout]");
    const originalText = button.innerHTML;

    button.disabled = true;
    button.textContent = "Creating order...";

    try {
        const response = await fetch(`${CART_API_BASE_URL}/api/orders`, {
            method: "POST",
            headers: getCartHeaders(true),
            body: JSON.stringify({ deliveryMethod: selectedDeliveryMethod })
        });
        const data = await response.json();

        if (response.status === 401) {
            clearCartSession();
            return;
        }

        if (!response.ok) {
            throw new Error(data.message || "Cannot create your order.");
        }

        setCartItems([]);
        window.location.href = "/orders";
    } catch (error) {
        alert(error.message);
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

function getCartHeaders(includeJson = false) {
    const headers = { Authorization: `Bearer ${localStorage.getItem("sugarBlissToken")}` };

    if (includeJson) {
        headers["Content-Type"] = "application/json";
    }

    return headers;
}

function resolveCartImage(image) {
    if (!image) {
        return "/assets/images/cake2.png";
    }

    return image.startsWith("/uploads") ? `${CART_API_BASE_URL}${image}` : image;
}

function formatCartPrice(value) {
    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

function clearCartSession() {
    localStorage.removeItem("sugarBlissToken");
    localStorage.removeItem("sugarBlissUser");
    window.location.href = "/login";
}

function escapeCartHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
