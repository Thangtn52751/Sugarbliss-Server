(() => {
    "use strict";

    const API = window.SugarBlissApi.baseUrl;
    const query = new URLSearchParams(window.location.search);
    const state = { items: [], methods: [], method: query.get("delivery") || "standard", user: {}, quote: null,
        pending: null, busy: false, quoting: false, quoteVersion: 0, quoteTimer: null, storageKey: "",
        selectedAddress: "", suggestions: [], addressSearchTimer: null, addressSearchController: null,
        contactQuoteTimer: null, quoteError: false, quoteQueued: false,
        voucher: null, voucherBusy: false };
    const $ = (selector) => document.querySelector(selector);
    const money = (value) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value) || 0);
    const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
    const iconPaths = {
        pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
        truck: '<path d="M3 5h11v12H3zM14 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
        wallet: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M15 15h3"/>',
        shield: '<path d="m12 3 8 4v6c0 5-8 8-8 8s-8-3-8-8V7zM8 12l3 3 5-5"/>',
        check: '<path d="m5 12 4 4L20 5"/>',
        alert: '<path d="m10 4-8 14a2 2 0 0 0 2 3h16a2 2 0 0 0 2-3L14 4a2 2 0 0 0-4 0ZM12 9v5M12 17h.01"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
    };
    const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.check}</svg>`;
    const method = () => state.methods.find((item) => item.code === state.method);
    const needsQuote = () => Boolean(method()?.requiresQuote);
    const subtotal = () => state.items.reduce((sum, item) => sum + Number(item.lineTotal ?? Number(item.price || 0) * Number(item.quantity || 0)), 0);
    const quoteValid = () => Boolean(state.quote && Date.parse(state.quote.expiresAt) > Date.now());

    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll("[data-icon]").forEach((element) => { element.innerHTML = icon(element.dataset.icon); });
        $("[data-address-form]").addEventListener("submit", (event) => { event.preventDefault(); requestQuoteForCurrentAddress(); });
        $("[data-address-search]").addEventListener("input", handleAddressInput);
        $("[data-address-search]").addEventListener("keydown", handleAddressKeydown);
        $("[data-address-search]").addEventListener("blur", () => window.setTimeout(() => {
            if (!document.activeElement.closest?.(".checkout-address-search")) closeAddressSuggestions();
        }, 150));
        $("[data-address-suggestions]").addEventListener("click", handleAddressSelection);
        $("[data-address-suggestions]").addEventListener("keydown", handleAddressKeydown);
        for (const name of ["recipientName", "phone", "note"]) {
            $("[data-address-form]").elements[name].addEventListener("input", handleCustomerDetailInput);
        }
        $("[data-address-form]").elements.phone.addEventListener("input", () => updatePhoneStatus(false));
        $("[data-address-form]").elements.phone.addEventListener("blur", () => updatePhoneStatus(true));
        $("[data-get-quote]").addEventListener("click", requestQuoteForCurrentAddress);
        $("[data-place-order]").addEventListener("click", placeOrder);
        $("[data-voucher-apply]")?.addEventListener("click", applyVoucher);
        $("[data-voucher-input]")?.addEventListener("keydown", (event) => {
            if (event.key === "Enter") { event.preventDefault(); applyVoucher(); }
        });
        $("[data-checkout-result]").addEventListener("click", handleResultAction);
        document.addEventListener("click", (event) => {
            if (!event.target.closest(".checkout-address-search")) closeAddressSuggestions();
        });
        initialize();
    });

    async function request(path, options = {}) {
        let response;
        try {
            response = await fetch(`${API}${path}`, { ...options, headers: {
                Authorization: `Bearer ${localStorage.getItem("sugarBlissToken")}`,
                ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers
            } });
        } catch (cause) {
            if (cause?.name === "AbortError") throw cause;
            const error = new Error("Connection interrupted. We could not confirm the server response.");
            error.uncertain = true;
            throw error;
        }
        if (response.status === 401) {
            localStorage.removeItem("sugarBlissToken");
            localStorage.removeItem("sugarBlissUser");
            window.location.href = "/login";
        }
        let data;
        try { data = await response.json(); } catch {
            const error = new Error("The server response could not be read. Check your order before trying again.");
            error.uncertain = true;
            throw error;
        }
        if (!response.ok) {
            const error = new Error(data.message || "The request could not be completed.");
            error.status = response.status;
            error.data = data;
            error.uncertain = response.status >= 500 || [408, 409, 429].includes(response.status);
            throw error;
        }
        return data;
    }

    async function initialize() {
        if (!localStorage.getItem("sugarBlissToken")) { window.location.href = "/login"; return; }
        try {
            if (query.get("order")) {
                renderOrder(await request(`/api/orders/${encodeURIComponent(query.get("order"))}`));
                return;
            }
            const [user, cart, methods] = await Promise.all([
                request("/api/users/me"), request("/api/users/me/cart"), request("/api/orders/delivery-methods")
            ]);
            state.user = user;
            state.storageKey = `sugarBlissCheckout:${user._id || user.id}`;
            state.items = (Array.isArray(cart) ? cart : []).map((item) => ({
                name: item.product?.name, price: item.product?.price, quantity: item.quantity,
                image: item.product?.images?.[0] || item.product?.image, weightGram: item.product?.weightGram,
                product: item.product?._id || item.product?.id
            }));
            state.methods = (Array.isArray(methods) ? methods : []).filter((item) => !item.hidden && item.code !== "lalamove");
            if (state.method === "lalamove") state.method = "standard";
            if (!method()) state.method = state.methods[0]?.code || "standard";
            restorePending();
            fillAddress(state.pending?.address || { recipientName: user.name, phone: user.phone, address: user.address });
            renderReview();
            if (state.pending) {
                renderFailure("A previous checkout is awaiting confirmation. Check the same order request to recover its result.", true);
            } else if (!state.items.length) {
                showEmptyCart();
            } else {
                quoteSavedAddress();
            }
        } catch (error) { showLoadError(error.message); }
    }

    function restorePending() {
        try {
            const pending = JSON.parse(sessionStorage.getItem(state.storageKey) || "null");
            if (!pending?.body || !pending?.attempted) return;
            state.pending = pending;
            state.quote = pending.quote;
            state.method = pending.body.deliveryMethod;
            state.items = pending.items || state.items;
        } catch { /* A malformed old draft does not prevent a fresh checkout. */ }
    }

    function persistPending() {
        try {
            if (state.pending) sessionStorage.setItem(state.storageKey, JSON.stringify(state.pending));
            else sessionStorage.removeItem(state.storageKey);
            return true;
        } catch { return false; }
    }

    function fillAddress(address) {
        const form = $("[data-address-form]");
        for (const field of ["recipientName", "phone", "address", "note"]) form.elements[field].value = address[field] || "";
        state.selectedAddress = state.pending?.quote && address.address ? address.address : "";
        if (state.selectedAddress) setAddressStatus("Verified delivery address selected.", false, true);
    }

    function readAddress() {
        const form = $("[data-address-form]");
        const value = (name) => form.elements[name].value.trim();
        return { recipientName: value("recipientName"), phone: value("phone"), address: value("address"), note: value("note") };
    }

    function imageUrl(value) {
        if (typeof value !== "string" || !value) return "/assets/images/cake2.png";
        return value.startsWith("/uploads") ? `${API}${value}` : value;
    }

    function renderItems(items) {
        return items.map((item) => `<article class="checkout-item">
            <img src="${escape(imageUrl(item.image))}" alt="${escape(item.name || "Sugar Bliss treat")}">
            <div class="checkout-item-info"><h3>${escape(item.name || "Sugar Bliss treat")}</h3>
            <p>${item.weightGram ? `Weight: ${escape(item.weightGram)}g` : "Freshly baked for a sweeter day"}</p><small>Qty ${escape(item.quantity || 1)}</small></div>
            <strong>${money(item.lineTotal ?? Number(item.price || 0) * Number(item.quantity || 0))}</strong></article>`).join("");
    }

    function renderReview() {
        $("[data-checkout-loading]").hidden = true;
        $("[data-checkout-result]").hidden = true;
        $("[data-checkout-review]").hidden = false;
        $("[data-checkout-items]").innerHTML = renderItems(state.items);
        $("[data-method-name]").textContent = method()?.label || "Standard Delivery";
        $("[data-method-description]").textContent = needsQuote()
            ? "Delivered by Lalamove. Get your delivery fee before placing the order."
            : state.method === "pickup" ? "Collect your treats at the store." : "Delivery fee is included in your order total.";
        updateSummary();
    }

    function voucherStatus(message, kind) {
        const el = $("[data-voucher-status]");
        if (!el) return;
        el.hidden = !message;
        el.textContent = message || "";
        el.classList.toggle("is-success", kind === "success");
        el.classList.toggle("is-error", kind === "error");
    }

    async function applyVoucher() {
        const input = $("[data-voucher-input]");
        const code = (input?.value || "").trim();
        if (state.voucherBusy) return;

        // Bo trong -> go voucher dang ap
        if (!code) {
            state.voucher = null;
            voucherStatus("", null);
            updateSummary();
            return;
        }
        if (!state.items.length) {
            voucherStatus("Your cart is empty.", "error");
            return;
        }

        state.voucherBusy = true;
        $("[data-voucher-apply]").disabled = true;
        voucherStatus("Checking...", null);

        try {
            const result = await request("/api/vouchers/validate", {
                method: "POST",
                body: JSON.stringify({ code, subtotal: subtotal() }),
            });
            state.voucher = { code: result.code, type: result.type, value: result.value, discount: result.discount };
            voucherStatus(`${result.code}: - ${money(result.discount)}`, "success");
            updateSummary();
        } catch (error) {
            state.voucher = null;
            voucherStatus(error.message || "This voucher cannot be applied.", "error");
            updateSummary();
        } finally {
            state.voucherBusy = false;
            $("[data-voucher-apply]").disabled = false;
        }
    }

    // So tien giam theo voucher dang ap (dua tren subtotal hien tai)
    function discountAmount() {
        if (!state.voucher) return 0;
        return Math.min(Number(state.voucher.discount) || 0, subtotal());
    }

    function updateSummary() {
        const fee = needsQuote() ? (state.quote?.fee ?? null) : Number(method()?.fee || 0);
        const typedAddress = $("[data-address-search]").value.trim();
        const discount = discountAmount();
        const total = Math.max(0, subtotal() - discount) + Number(fee || 0);
        $("[data-checkout-subtotal]").textContent = money(subtotal());
        $("[data-checkout-fee]").textContent = state.quoting ? "Calculating delivery fee..."
            : fee === null ? "Select an address" : Number(fee) === 0 ? "Free" : money(fee);

        // Dong giam gia: chi hien khi co voucher
        const discountRow = $("[data-discount-row]");
        if (discountRow) {
            discountRow.hidden = discount <= 0;
            const discountCell = $("[data-checkout-discount]");
            if (discountCell) discountCell.textContent = `- ${money(discount)}`;
        }
        $("[data-checkout-total]").textContent = money(total);
        $("[data-get-quote]").hidden = !needsQuote() || quoteValid() || typedAddress.length < 3;
        $("[data-get-quote]").disabled = state.busy || state.quoting || Boolean(state.pending) || method()?.available === false;
        $("[data-get-quote]").textContent = state.quoting ? "Calculating delivery fee..."
            : state.quoteError ? "Retry delivery fee" : "Calculate delivery fee";
        $("[data-place-order]").disabled = state.busy || state.quoting || !state.items.length || method()?.available === false ||
            (needsQuote() && (!state.selectedAddress || !quoteValid()));
        $("[data-place-order]").textContent = state.busy ? "Placing your order..." : `Place order${fee === null ? "" : ` · ${money(total)}`}`;
        $("[data-quote-status]").hidden = !needsQuote();
        if (method()?.available === false) {
            $("[data-quote-status]").hidden = false;
            quoteMessage("This delivery method is currently unavailable. Please return to your cart to choose another method.", true);
        }
        $("[data-address-form] fieldset").disabled = state.busy || Boolean(state.pending);
        document.querySelectorAll("[data-edit-cart]").forEach((link) => link.setAttribute("aria-disabled", String(state.busy || Boolean(state.pending))));
    }

    function quoteMessage(message, error = false) {
        $("[data-quote-status]").textContent = message;
        $("[data-quote-status]").classList.toggle("is-error", error);
    }

    function invalidateQuote(message = "Select a verified address to calculate delivery.") {
        if (state.busy || state.pending) return;
        state.quoteVersion += 1;
        state.quote = null;
        state.quoteError = false;
        window.clearTimeout(state.quoteTimer);
        quoteMessage(message);
        updateSummary();
    }

    function setAddressStatus(message, error = false, selected = false) {
        const status = $("[data-address-status]");
        status.textContent = message;
        status.classList.toggle("is-error", error);
        status.classList.toggle("is-selected", selected);
    }

    function setAddressSearching(searching) {
        $("[data-address-spinner]").hidden = !searching;
        $("[data-address-search]").setAttribute("aria-busy", String(searching));
    }

    function updatePhoneStatus(showError) {
        const phone = $("[data-address-form]").elements.phone;
        const invalid = phone.value.trim() !== "" && !phone.checkValidity();
        const visible = Boolean(showError && invalid);
        $("[data-phone-status]").hidden = !visible;
        phone.setAttribute("aria-invalid", String(visible));
    }

    function closeAddressSuggestions() {
        const list = $("[data-address-suggestions]");
        list.hidden = true;
        list.replaceChildren();
        $("[data-address-search]").setAttribute("aria-expanded", "false");
    }

    function renderAddressSuggestions(suggestions) {
        const list = $("[data-address-suggestions]");
        state.suggestions = suggestions;
        if (!suggestions.length) {
            closeAddressSuggestions();
            setAddressStatus("No matching address found. Try adding the district or city.", true);
            return;
        }
        list.innerHTML = suggestions.map((suggestion, index) => `
            <button class="checkout-address-option" type="button" role="option" data-address-index="${index}">
                ${icon("pin")}<span>${escape(suggestion.address)}</span>
            </button>`).join("");
        list.hidden = false;
        $("[data-address-search]").setAttribute("aria-expanded", "true");
        setAddressStatus("Select an address from the suggestions.");
    }

    function handleAddressInput(event) {
        if (state.busy || state.pending) return;
        state.selectedAddress = "";
        state.suggestions = [];
        window.clearTimeout(state.addressSearchTimer);
        state.addressSearchController?.abort();
        closeAddressSuggestions();
        invalidateQuote("Select a verified address to calculate delivery.");
        const value = event.target.value.trim();
        if (value.length < 3) {
            setAddressStatus("Type at least 3 characters, then select a verified address.");
            setAddressSearching(false);
            return;
        }
        setAddressStatus("Searching addresses...");
        state.addressSearchTimer = window.setTimeout(() => searchAddresses(value), 350);
    }

    async function searchAddresses(queryValue) {
        const input = $("[data-address-search]");
        if (input.value.trim() !== queryValue || state.busy || state.pending) return;
        state.addressSearchController?.abort();
        const controller = new AbortController();
        state.addressSearchController = controller;
        setAddressSearching(true);
        try {
            const result = await request(`/api/delivery/addresses?query=${encodeURIComponent(queryValue)}`, {
                signal: controller.signal,
            });
            if (input.value.trim() === queryValue) renderAddressSuggestions(Array.isArray(result.suggestions) ? result.suggestions : []);
        } catch (error) {
            if (error.name !== "AbortError" && input.value.trim() === queryValue) {
                closeAddressSuggestions();
                setAddressStatus(error.message, true);
            }
        } finally {
            if (state.addressSearchController === controller) setAddressSearching(false);
        }
    }

    function handleAddressSelection(event) {
        const option = event.target.closest("[data-address-index]");
        if (!option) return;
        const suggestion = state.suggestions[Number(option.dataset.addressIndex)];
        if (!suggestion?.address) return;
        const input = $("[data-address-search]");
        input.value = suggestion.address;
        state.selectedAddress = suggestion.address;
        closeAddressSuggestions();
        setAddressStatus("Verified delivery address selected.", false, true);
        invalidateQuote("Calculating delivery fee...");
        getQuote();
    }

    function handleAddressKeydown(event) {
        const options = [...$("[data-address-suggestions]").querySelectorAll("[data-address-index]")];
        if (event.key === "Escape") {
            closeAddressSuggestions();
            return;
        }
        if (!options.length || !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
        const active = document.activeElement.closest?.("[data-address-index]");
        if (event.key === "Enter" && !active) {
            event.preventDefault();
            options[0].click();
            return;
        }
        event.preventDefault();
        if (event.key === "Enter") {
            active.click();
            return;
        }
        const current = options.indexOf(active);
        const next = event.key === "ArrowDown"
            ? (current + 1) % options.length
            : (current <= 0 ? options.length - 1 : current - 1);
        options[next].focus();
    }

    function handleCustomerDetailInput() {
        if (state.busy || state.pending || !state.selectedAddress) return;
        invalidateQuote("Delivery details changed. Recalculating the delivery fee...");
        window.clearTimeout(state.contactQuoteTimer);
        state.contactQuoteTimer = window.setTimeout(() => {
            if (state.selectedAddress && $("[data-address-form]").checkValidity()) getQuote();
        }, 650);
    }

    async function quoteSavedAddress() {
        if (!needsQuote() || method()?.available === false || state.pending) return;
        const form = $("[data-address-form]");
        const address = form.elements.address.value.trim();
        if (address.length < 3) return;
        if (!form.checkValidity()) {
            updatePhoneStatus(true);
            setAddressStatus("Saved address found. Check the recipient name and phone number to calculate delivery.");
            quoteMessage("Enter valid delivery contact details to calculate the fee.", true);
            updateSummary();
            return;
        }
        setAddressStatus("Verifying your saved delivery address...");
        await requestQuoteForCurrentAddress();
    }

    async function requestQuoteForCurrentAddress() {
        if (state.busy || state.pending || !needsQuote()) return;
        const input = $("[data-address-search]");
        const address = input.value.trim();
        if (address.length < 3) {
            state.selectedAddress = "";
            setAddressStatus("Enter at least 3 characters of the delivery address.", true);
            quoteMessage("Enter a delivery address before calculating the fee.", true);
            updateSummary();
            input.focus();
            return;
        }
        state.selectedAddress = address;
        closeAddressSuggestions();
        setAddressStatus("Verifying delivery address...");
        await getQuote();
    }

    async function getQuote() {
        if (state.busy || state.pending || !needsQuote()) return;
        if (state.quoting) {
            state.quoteQueued = true;
            return;
        }
        state.quoteQueued = false;
        const currentAddress = $("[data-address-search]").value.trim();
        if (!state.selectedAddress || currentAddress !== state.selectedAddress) {
            setAddressStatus("Select a verified address from the suggestions.", true);
            quoteMessage("Select a verified address before calculating delivery.", true);
            return;
        }
        if (!$("[data-address-form]").reportValidity()) {
            updatePhoneStatus(true);
            return;
        }
        invalidateQuote("Calculating delivery fee...");
        const version = state.quoteVersion;
        const address = readAddress();
        state.quoting = true;
        state.quoteError = false;
        updateSummary();
        quoteMessage("Calculating your delivery fee...");
        try {
            const quote = await request("/api/delivery/quote", { method: "POST", body: JSON.stringify(address) });
            if (version !== state.quoteVersion) return;
            const remaining = Date.parse(quote.expiresAt) - Date.now();
            if (!quote.id || !(remaining > 0) || !Number.isFinite(Number(quote.fee))) throw new Error("This delivery fee has expired. Please request a new fee.");
            state.quote = quote;
            state.selectedAddress = quote.address || state.selectedAddress;
            $("[data-address-search]").value = state.selectedAddress;
            setAddressStatus("Verified delivery address selected.", false, true);
            quoteMessage(`Delivery fee confirmed until ${new Date(quote.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`);
            state.quoteTimer = window.setTimeout(() => {
                if (!state.pending && !state.busy) {
                    invalidateQuote("Your delivery fee has expired.");
                    state.quoteError = true;
                    quoteMessage("Your delivery fee has expired. Get an updated fee to continue.", true);
                    updateSummary();
                }
            }, Math.min(remaining, 2147483647));
        } catch (error) {
            if (version === state.quoteVersion) {
                state.quoteError = true;
                quoteMessage(error.message, true);
            }
        } finally {
            state.quoting = false;
            updateSummary();
            if (state.quoteQueued && !state.busy && !state.pending) {
                state.quoteQueued = false;
                window.setTimeout(getQuote, 0);
            }
        }
    }

    async function placeOrder() {
        if (state.busy || state.quoting) return;
        if (!state.pending) {
            if (!state.items.length || method()?.available === false || !$("[data-address-form]").reportValidity()) return;
            if (needsQuote() && (!state.selectedAddress || $("[data-address-search]").value.trim() !== state.selectedAddress || !quoteValid())) {
                invalidateQuote();
                quoteMessage("Select a verified address and wait for the delivery fee before placing your order.", true);
                return;
            }
            const address = readAddress();
            state.pending = { attempted: true, quote: state.quote, address, items: state.items,
                body: { deliveryMethod: state.method, paymentMethod: "COD",
                    ...(state.voucher ? { voucherCode: state.voucher.code } : {}),
                    ...(needsQuote() ? { shippingQuoteId: state.quote.id } : { shippingAddress: address }) } };
            if (!persistPending()) {
                state.pending = null;
                quoteMessage("Please allow this site's session storage before placing an order so your checkout can be recovered if the connection drops.", true);
                $("[data-quote-status]").hidden = false;
                return;
            }
        }
        state.busy = true;
        updateSummary();
        $("[data-retry-order]")?.setAttribute("disabled", "");
        try {
            const order = await request("/api/orders", { method: "POST", body: JSON.stringify(state.pending.body) });
            if (!order.id && !order._id) {
                const error = new Error("Your checkout was submitted, but its order number could not be read. Check the same request again.");
                error.uncertain = true;
                throw error;
            }
            state.pending = null;
            persistPending();
            window.clearTimeout(state.quoteTimer);
            window.history.replaceState(null, "", `/checkout?order=${encodeURIComponent(order.id || order._id)}`);
            window.dispatchEvent(new CustomEvent("sugarbliss:cart-updated", { detail: { count: 0 } }));
            renderOrder(order);
        } catch (error) {
            if (!error.uncertain) {
                state.pending = null;
                persistPending();
            }
            renderFailure(error.message, Boolean(error.uncertain));
        } finally {
            state.busy = false;
            updateSummary();
        }
    }

    function showResult(html) {
        $("[data-checkout-loading]").hidden = true;
        $("[data-checkout-review]").hidden = true;
        $("[data-checkout-result]").hidden = false;
        $("[data-checkout-result]").innerHTML = html;
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function totals(order) {
        return `<dl class="checkout-totals"><div><dt>Subtotal</dt><dd>${money(order.subtotal)}</dd></div><div><dt>Delivery</dt><dd>${Number(order.shippingFee) === 0 ? "Free" : money(order.shippingFee)}</dd></div><div class="checkout-total"><dt>Total</dt><dd><strong>${money(order.total)}</strong><small>VND</small></dd></div></dl>`;
    }

    function addressDetails(address = {}) {
        return `<div class="checkout-detail-row"><span class="checkout-icon">${icon("pin")}</span><div><span class="checkout-detail-label">Ship to</span><strong>${escape(address.recipientName || "Recipient")}</strong><p>${escape(address.phone || "")}</p><p>${escape(address.address || "")}</p>${address.note ? `<p>Note: ${escape(address.note)}</p>` : ""}</div></div>`;
    }

    function deliveryLabel(value) {
        return ({ standard: "Standard Delivery", lalamove: "Standard Delivery", express: "Express Delivery", pickup: "Store Pickup" })[value] || "Delivery";
    }

    function shippingLabel(value) {
        return ({ CREATING: "Confirming delivery", UNKNOWN: "Awaiting delivery confirmation", FAILED: "Delivery booking needs attention",
            ASSIGNING_DRIVER: "Finding a driver", ON_GOING: "Driver assigned", PICKED_UP: "On the way", COMPLETED: "Delivered",
            CANCELED: "Delivery cancelled", REJECTED: "No driver available", EXPIRED: "Delivery expired" })[value] || "Awaiting delivery confirmation";
    }

    function trackingLink(value) {
        try {
            const url = new URL(value);
            if (url.protocol !== "https:" || !["share.lalamove.com", "share.sandbox.lalamove.com"].includes(url.hostname)) return "";
            return `<a class="checkout-button checkout-button-secondary" href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">Track delivery</a>`;
        } catch { return ""; }
    }

    function renderOrder(order) {
        const cancelled = order.status === "Cancelled";
        const pending = order.shippingProvider === "lalamove" && (Boolean(order.shippingError) || !order.shippingOrderId ||
            ["CREATING", "UNKNOWN", "FAILED", "CANCELED", "REJECTED", "EXPIRED"].includes(order.shippingStatus));
        const needsAttention = pending || cancelled;
        const customer = order.shippingAddress?.recipientName?.split(" ").filter(Boolean)[0] || "friend";
        const status = cancelled ? "Order cancelled" : pending ? "Order saved · Delivery needs confirmation" : "Order confirmed";
        const title = cancelled ? "This order has been cancelled." : pending ? "Your order is saved." : `Thanks, ${customer} — it's confirmed.`;
        const description = cancelled ? "View your order details below or return to the menu."
            : pending ? "Your order is recorded. Delivery is still being confirmed; check its status below or contact the store."
                : "Your sweet treats are on our list. Pay cash when you receive your order.";
        showResult(`<header class="checkout-result-heading ${needsAttention ? "is-pending" : ""}">
            <div class="checkout-result-icon">${icon(needsAttention ? "clock" : "check")}</div>
            <span class="checkout-badge">${icon(needsAttention ? "clock" : "shield")}${escape(status)}</span>
            <h1>${escape(title)}</h1><p>${escape(description)}</p>
            <div class="checkout-result-meta"><span>Order &nbsp;<strong>${escape(order.orderNumber || order.id)}</strong></span><span>${escape(order.shippingProvider === "lalamove" ? shippingLabel(order.shippingStatus) : order.status)}</span></div>
            <div class="checkout-result-actions"><a class="checkout-button checkout-button-primary" href="/products">Continue shopping</a><a class="checkout-button checkout-button-secondary" href="/orders">View orders</a></div>
        </header>
        <div class="checkout-result-layout"><div class="checkout-stack">
            <section class="checkout-card"><h2>${needsAttention ? "What happens next" : "A little bliss is on its way"}</h2>
                <div class="checkout-next"><span>1</span><div><strong>${needsAttention ? "Check delivery status" : "We prepare your order"}</strong><p>${needsAttention ? "Use Refresh delivery below to check the latest status of this order." : "The store will confirm and prepare your treats for delivery."}</p></div></div>
                <div class="checkout-next"><span>2</span><div><strong>${cancelled ? "Browse your orders" : "Cash on delivery"}</strong><p>${cancelled ? "Your order history includes the latest order and delivery details." : `Have ${money(order.total)} ready when you receive your order.`}</p></div></div>
            </section>
            <section class="checkout-card"><h2>Delivery</h2>${addressDetails(order.shippingAddress)}
                <div class="checkout-detail-row"><span class="checkout-icon">${icon("truck")}</span><div><span class="checkout-detail-label">Method</span><strong>${escape(deliveryLabel(order.deliveryMethod))}</strong><p>${escape(order.shippingProvider === "lalamove" ? `Lalamove · ${shippingLabel(order.shippingStatus)}` : order.status)}</p>${order.shippingOrderId ? `<p>Delivery #${escape(order.shippingOrderId)}</p>` : ""}</div></div>
                ${order.shippingError ? `<p class="checkout-error-copy">${escape(order.shippingError)}</p>` : ""}
                ${order.shippingProvider === "lalamove" ? `<div class="checkout-result-actions"><button class="checkout-button checkout-button-secondary" type="button" data-refresh-order="${escape(order.id || order._id)}" data-has-booking="${Boolean(order.shippingOrderId)}">Refresh delivery</button>${trackingLink(order.shippingTrackingUrl)}</div><p class="checkout-quote-status" data-refresh-status role="status"></p>` : ""}
            </section>
        </div><section class="checkout-card"><div class="checkout-card-heading"><h2>Order details</h2><span class="checkout-detail-label">${escape(order.orderedOn || "")}</span></div>
            ${renderItems(order.items || [])}<div class="checkout-order-footer"><div class="checkout-detail-row"><span class="checkout-icon">${icon("wallet")}</span><div><span class="checkout-detail-label">Payment method</span><strong>${order.paymentMethod === "COD" ? "Cash on delivery" : escape(order.paymentMethod)}</strong><p>${order.paymentStatus === "Paid" ? "Paid" : cancelled ? escape(order.paymentStatus || "Pending") : "Pay when you receive your order"}</p></div></div>${totals(order)}</div>
        </section></div>`);
        document.title = `Sugar Bliss | ${status}`;
    }

    function renderFailure(message, uncertain) {
        const recoverable = uncertain && Boolean(state.pending?.body.shippingQuoteId);
        const address = state.pending?.address || readAddress();
        const fee = Number(state.quote?.fee ?? method()?.fee ?? 0);
        showResult(`<section class="checkout-card checkout-error-banner"><div class="checkout-result-icon">${icon("alert")}</div><div>
            <span class="checkout-badge">${icon("clock")}${uncertain ? "Confirmation needed" : "Checkout incomplete"}</span>
            <h1>${uncertain ? "We're checking your order." : "We couldn't place your order."}</h1><p>${escape(message)}</p>
        </div></section><div class="checkout-layout"><section class="checkout-card"><div class="checkout-card-heading"><h2>Your order review</h2><span class="checkout-badge">Cash on delivery</span></div>
            ${renderItems(state.items)}<div class="checkout-order-footer">${addressDetails(address)}${totals({ subtotal: subtotal(), shippingFee: fee, total: subtotal() + fee })}</div></section>
            <aside class="checkout-stack"><section class="checkout-card checkout-error-card"><h2>${uncertain ? "Check your order" : "Let's try again"}</h2><p class="checkout-error-copy">${uncertain ? "The confirmation was interrupted. Check this checkout request or your order history before starting another order." : "Review your address and delivery fee, then try placing your order again."}</p>
                ${recoverable ? '<button class="checkout-button checkout-button-primary" type="button" data-retry-order>Check this order again</button>' : !uncertain ? '<button class="checkout-button checkout-button-primary" type="button" data-return-review>Return to checkout</button>' : ""}
                <a class="checkout-button checkout-button-secondary" href="/orders">View order history</a><p class="checkout-payment-note">${icon("wallet")}Payment method: cash on delivery</p></section>
                <section class="checkout-card checkout-error-card"><h2>Need a hand?</h2><p class="checkout-error-copy">Our store can help with your order or delivery details.</p><a class="checkout-button checkout-button-secondary" href="/contact">Contact the store</a></section></aside></div>`);
        document.title = "Sugar Bliss | Checkout confirmation";
    }

    async function handleResultAction(event) {
        if (event.target.closest("[data-retry-order]")) { await placeOrder(); return; }
        if (event.target.closest("[data-return-review]")) {
            renderReview();
            if (needsQuote() && !quoteValid()) invalidateQuote();
            return;
        }
        const refresh = event.target.closest("[data-refresh-order]");
        if (!refresh) return;
        refresh.disabled = true;
        try {
            const path = `/api/orders/${encodeURIComponent(refresh.dataset.refreshOrder)}`;
            const order = await request(refresh.dataset.hasBooking === "true" ? `${path}/shipping/refresh` : path,
                refresh.dataset.hasBooking === "true" ? { method: "POST" } : {});
            renderOrder(order);
        } catch (error) {
            $("[data-refresh-status]").textContent = error.message;
            refresh.disabled = false;
        }
    }

    function showEmptyCart() {
        $("[data-checkout-review]").hidden = true;
        $("[data-checkout-loading]").hidden = false;
        $("[data-checkout-loading]").innerHTML = 'Your cart is empty. <a href="/products">Choose something sweet</a> to get started.';
    }

    function showLoadError(message) {
        $("[data-checkout-loading]").hidden = false;
        $("[data-checkout-loading]").innerHTML = `${escape(message)}<br><a href="${query.get("order") ? "/orders" : "/cart"}">${query.get("order") ? "View order history" : "Back to your cart"}</a>`;
    }
})();
