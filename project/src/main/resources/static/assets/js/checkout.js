(() => {
    "use strict";

    const API = window.SugarBlissApi.baseUrl;
    const query = new URLSearchParams(window.location.search);
    const state = { items: [], methods: [], method: query.get("delivery") || "standard", user: {}, quote: null,
        pending: null, busy: false, quoting: false, quoteVersion: 0, quoteTimer: null, storageKey: "",
        selectedAddress: "", suggestions: [], addressSearchTimer: null, addressSearchController: null,
        contactQuoteTimer: null, quoteError: false, quoteQueued: false,
        voucher: null, voucherBusy: false, voucherVersion: 0, ownedVouchers: [], paymentMethod: 'COD', paymentMethods: [], paymentPollTimer: null, lastOrder: null };
    const $ = (selector) => document.querySelector(selector);
    const t = (key, fallback) => {
        if (window.SugarI18n) {
            const value = window.SugarI18n.translate(key);
            if (value !== null) return value;
        }
        return fallback;
    };
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
        $("[data-voucher-remove]")?.addEventListener("click", removeVoucher);
        $("[data-voucher-input]")?.addEventListener("input", handleVoucherInput);
        $("[data-voucher-owned]")?.addEventListener("change", (event) => {
            if (!event.target.value || state.busy || state.pending) return;
            $("[data-voucher-input]").value = event.target.value;
            handleVoucherInput();
            applyVoucher();
        });
        $("[data-voucher-input]")?.addEventListener("keydown", (event) => {
            if (event.key === "Enter") { event.preventDefault(); applyVoucher(); }
        });
        $("[data-checkout-result]").addEventListener("click", handleResultAction);
        $("[data-payment-options]").addEventListener("change", handlePaymentChange);
        window.addEventListener('pagehide', () => window.clearTimeout(state.paymentPollTimer));
        document.addEventListener("click", (event) => {
            if (!event.target.closest(".checkout-address-search")) closeAddressSuggestions();
        });
        // Dich lai man hinh dang hien thi khi nguoi dung doi ngon ngu.
        window.addEventListener("sugarbliss:lang-changed", () => {
            if (state.lastOrder) {
                renderOrder(state.lastOrder);
            } else if (!$("[data-checkout-review]").hidden) {
                renderReview();
            } else if (!$("[data-checkout-loading]").hidden) {
                if (state.items.length === 0) showEmptyCart();
            }
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
            const error = new Error(t("checkout.connectionInterrupted", "Connection interrupted. We could not confirm the server response."));
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
                const id = encodeURIComponent(query.get("order"));
                let order = await request(`/api/orders/${id}`);
                if (order.paymentProvider === 'zalopay' && ['Pending', 'Failed'].includes(order.paymentStatus) && order.status !== 'Cancelled') {
                    try {
                        await request(paymentPath(order.id || order._id, order.paymentMethod, 'status'));
                        order = await request(`/api/orders/${id}`);
                    } catch (error) { order.payment = { ...order.payment, error: error.message }; }
                }
                renderOrder(order);
                if (query.get('payment') === 'return') pollPayment(order, 0);
                return;
            }
            const [user, cart, methods, paymentMethods] = await Promise.all([
                request("/api/users/me"), request("/api/users/me/cart"), request("/api/orders/delivery-methods"), request('/api/payments/methods')
            ]);
            state.user = user;
            state.storageKey = `sugarBlissCheckout:${user._id || user.id}`;
            state.items = (Array.isArray(cart) ? cart : []).map((item) => ({
                name: item.product?.name, price: item.product?.price, quantity: item.quantity,
                image: item.product?.images?.[0] || item.product?.image, weightGram: item.product?.weightGram,
                product: item.product?._id || item.product?.id
            }));
            state.methods = (Array.isArray(methods) ? methods : []).filter((item) => !item.hidden && item.code !== "lalamove");
            state.paymentMethods = Array.isArray(paymentMethods) ? paymentMethods : [];
            if (state.method === "lalamove") state.method = "standard";
            if (!method()) state.method = state.methods[0]?.code || "standard";
            restorePending();
            fillAddress(state.pending?.address || { recipientName: user.name, phone: user.phone, address: user.address });
            renderReview();
            loadOwnedVouchers();
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
            state.paymentMethod = pending.body.paymentMethod || 'COD';
            state.items = pending.items || state.items;
            state.voucher = pending.voucher || null;
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
            <img src="${escape(imageUrl(item.image))}" alt="${escape(item.name || t("checkout.treatFallback", "Sugar Bliss treat"))}">
            <div class="checkout-item-info"><h3>${escape(item.name || t("checkout.treatFallback", "Sugar Bliss treat"))}</h3>
            <p>${item.weightGram ? `${escape(t("checkout.weight", "Weight"))}: ${escape(item.weightGram)}g` : escape(t("checkout.freshlyBaked", "Freshly baked for a sweeter day"))}</p><small>${escape(t("checkout.qty", "Qty {count}").replace("{count}", item.quantity || 1))}</small></div>
            <strong>${money(item.lineTotal ?? Number(item.price || 0) * Number(item.quantity || 0))}</strong></article>`).join("");
    }

    function renderReview() {
        state.lastOrder = null;
        $("[data-checkout-loading]").hidden = true;
        $("[data-checkout-result]").hidden = true;
        $("[data-checkout-review]").hidden = false;
        $("[data-checkout-items]").innerHTML = renderItems(state.items);
        $("[data-address-form]").hidden = state.method === "pickup";
        $("[data-method-name]").textContent = method()?.label || t("checkout.methodNameDefault", "Standard Delivery");
        $("[data-method-description]").textContent = needsQuote()
            ? t("checkout.methodDescQuote", "Delivered by Lalamove. Get your delivery fee before placing the order.")
            : state.method === "pickup" ? t("checkout.methodDescPickup", "Collect your treats at the store.") : t("checkout.methodDescIncluded", "Delivery fee is included in your order total.");
        renderPaymentMethods();
        updateSummary();
    }

    function paymentLabel(code) {
        return ({ COD: state.method === 'pickup' ? t("checkout.payAtStore", "Pay at store") : t("checkout.payCod", "Cash on delivery"), ZaloPay: 'ZaloPay', Visa: t("checkout.payVisa", "Visa / international card") })[code] || code;
    }

    function renderPaymentMethods() {
        $("[data-payment-options]").innerHTML = state.paymentMethods.map((option) => {
            const selected = option.code === state.paymentMethod;
            return `<label class="checkout-payment-option"><input type="radio" name="paymentMethod" value="${escape(option.code)}" ${selected ? 'checked' : ''} ${!option.available || state.busy || state.pending ? 'disabled' : ''}>
                <span class="checkout-icon">${icon('wallet')}</span><span><strong>${escape(option.code === 'COD' ? paymentLabel('COD') : option.label)}</strong>${option.environment ? `<small>${escape(t("checkout.sandbox", "Sandbox"))}</small>` : ''}</span>
                <span class="checkout-selected">${!option.available ? escape(t("checkout.optionUnavailable", "Unavailable")) : selected ? escape(t("checkout.optionSelected", "Selected")) : ''}</span></label>`;
        }).join('');
    }

    async function handlePaymentChange(event) {
        if (state.busy || state.pending || event.target.name !== 'paymentMethod') return;
        const option = state.paymentMethods.find((entry) => entry.code === event.target.value);
        if (!option?.available) return;
        const changedCollection = (state.paymentMethod === 'COD') !== (option.code === 'COD');
        state.paymentMethod = option.code;
        renderPaymentMethods();
        if (needsQuote() && changedCollection) {
            invalidateQuote(t("checkout.recalcPayment", 'Recalculating delivery fee for the selected payment method...'));
            await quoteSavedAddress();
        }
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

    async function loadOwnedVouchers() {
        try {
            const result = await request('/api/vouchers/mine');
            state.ownedVouchers = result.vouchers || [];
            const select = $('[data-voucher-owned]');
            if (!select) return;
            select.innerHTML = `<option value="">${escape(t("checkout.chooseVoucher", "Choose a voucher"))}</option>` + state.ownedVouchers.map((voucher) => {
                const unavailable = !voucher.active || !voucher.expiresAt || (voucher.startsAt && Date.parse(voucher.startsAt) > Date.now()) ||
                    (voucher.expiresAt && Date.parse(voucher.expiresAt) <= Date.now()) || subtotal() < voucher.minOrder ||
                    (voucher.usageLimit > 0 && voucher.usedCount >= voucher.usageLimit);
                const amount = voucher.type === 'percent' ? `${voucher.value}%` : money(voucher.value);
                return `<option value="${escape(voucher.code)}" ${unavailable ? 'disabled' : ''}>${escape(voucher.code)} - ${escape(amount)}</option>`;
            }).join('');
            $('[data-voucher-count]').textContent = String(result.voucherCount || 0);
            updateSummary();
        } catch (error) { voucherStatus(error.message || t("checkout.voucherLoadError", 'Unable to load your vouchers.'), 'error'); }
    }

    function handleVoucherInput() {
        if (state.busy || state.pending) return;
        state.voucherVersion += 1;
        if (state.voucher && $('[data-voucher-input]').value.trim().toUpperCase() === state.voucher.code) return;
        state.voucher = null;
        voucherStatus('', null);
        updateSummary();
    }

    function removeVoucher() {
        if (state.busy || state.pending) return;
        state.voucherVersion += 1;
        state.voucher = null;
        $('[data-voucher-input]').value = '';
        if ($('[data-voucher-owned]')) $('[data-voucher-owned]').value = '';
        voucherStatus('', null);
        updateSummary();
    }

    async function applyVoucher() {
        const input = $("[data-voucher-input]");
        const code = (input?.value || "").trim();
        if (state.voucherBusy || state.busy || state.pending) return;
        const version = ++state.voucherVersion;
        const amount = subtotal();

        // Bo trong -> go voucher dang ap
        if (!code) {
            state.voucher = null;
            voucherStatus("", null);
            updateSummary();
            return;
        }
        if (!state.items.length) {
            voucherStatus(t("checkout.cartEmpty", "Your cart is empty."), "error");
            return;
        }

        state.voucherBusy = true;
        state.voucher = null;
        voucherStatus(t("checkout.voucherChecking", "Checking..."), null);
        updateSummary();

        try {
            const result = await request("/api/vouchers/validate", {
                method: "POST",
                body: JSON.stringify({ code, subtotal: amount }),
            });
            if (version !== state.voucherVersion || amount !== subtotal()) return;
            state.voucher = { code: result.code, type: result.type, value: result.value, discount: result.discount, expiresAt: result.expiresAt };
            input.value = result.code;
            const expiry = result.expiresAt ? t("checkout.voucherValidUntil", " | Valid until {time}").replace("{time}", new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(result.expiresAt))) : '';
            voucherStatus(`${result.code}: - ${money(result.discount)}${expiry}`, "success");
            updateSummary();
        } catch (error) {
            if (version !== state.voucherVersion) return;
            state.voucher = null;
            voucherStatus(error.message || t("checkout.voucherCannotApply", "This voucher cannot be applied."), "error");
            updateSummary();
        } finally {
            state.voucherBusy = false;
            updateSummary();
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
        $("[data-checkout-fee]").textContent = state.quoting ? t("checkout.calculatingFee", "Calculating delivery fee...")
            : fee === null ? t("checkout.selectAddress", "Select an address") : Number(fee) === 0 ? t("checkout.free", "Free") : money(fee);

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
        $("[data-get-quote]").textContent = state.quoting ? t("checkout.calculatingFee", "Calculating delivery fee...")
            : state.quoteError ? t("checkout.retryFee", "Retry delivery fee") : t("checkout.calculateFee", "Calculate delivery fee");
        $("[data-place-order]").disabled = state.busy || state.quoting || state.voucherBusy || !state.items.length || method()?.available === false ||
            state.paymentMethods.find((option) => option.code === state.paymentMethod)?.available !== true ||
            (needsQuote() && (!state.selectedAddress || !quoteValid()));
        $("[data-place-order]").textContent = state.busy ? t("checkout.placingOrder", "Placing your order...") : `${state.paymentMethod === 'COD' ? t("checkout.placeOrder", 'Place order') : t("checkout.continuePayment", 'Continue to payment')}${fee === null ? "" : ` · ${money(total)}`}`;
        $("[data-payment-note]").innerHTML = `${icon('shield')}${state.paymentMethod === 'COD' ? escape(paymentLabel('COD')) : `${escape(t("checkout.sandbox", "Sandbox"))} · ${escape(paymentLabel(state.paymentMethod))}`}`;
        $(".checkout-payment").disabled = state.busy || Boolean(state.pending);
        $("[data-quote-status]").hidden = !needsQuote();
        if (method()?.available === false) {
            $("[data-quote-status]").hidden = false;
            quoteMessage(t("checkout.methodUnavailable", "This delivery method is currently unavailable. Please return to your cart to choose another method."), true);
        }
        $("[data-address-form] fieldset").disabled = state.method === 'pickup' || state.busy || Boolean(state.pending);
        const voucherLocked = state.busy || Boolean(state.pending);
        if ($('[data-voucher-input]')) $('[data-voucher-input]').disabled = voucherLocked;
        if ($('[data-voucher-apply]')) $('[data-voucher-apply]').disabled = voucherLocked || state.voucherBusy;
        if ($('[data-voucher-remove]')) {
            $('[data-voucher-remove]').hidden = !state.voucher;
            $('[data-voucher-remove]').disabled = voucherLocked;
        }
        if ($('[data-voucher-owned]')) $('[data-voucher-owned]').disabled = voucherLocked || state.voucherBusy;
        document.querySelectorAll("[data-edit-cart]").forEach((link) => link.setAttribute("aria-disabled", String(state.busy || Boolean(state.pending))));
    }

    function quoteMessage(message, error = false) {
        $("[data-quote-status]").textContent = message;
        $("[data-quote-status]").classList.toggle("is-error", error);
    }

    function invalidateQuote(message = t("checkout.selectVerified", "Select a verified address to calculate delivery.")) {
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
            setAddressStatus(t("checkout.noAddressMatch", "No matching address found. Try adding the district or city."), true);
            return;
        }
        list.innerHTML = suggestions.map((suggestion, index) => `
            <button class="checkout-address-option" type="button" role="option" data-address-index="${index}">
                ${icon("pin")}<span>${escape(suggestion.address)}</span>
            </button>`).join("");
        list.hidden = false;
        $("[data-address-search]").setAttribute("aria-expanded", "true");
        setAddressStatus(t("checkout.selectFromSuggestions", "Select an address from the suggestions."));
    }

    function handleAddressInput(event) {
        if (state.busy || state.pending) return;
        state.selectedAddress = "";
        state.suggestions = [];
        window.clearTimeout(state.addressSearchTimer);
        state.addressSearchController?.abort();
        closeAddressSuggestions();
        invalidateQuote(t("checkout.selectVerified", "Select a verified address to calculate delivery."));
        const value = event.target.value.trim();
        if (value.length < 3) {
            setAddressStatus(t("checkout.typeThreeChars", "Type at least 3 characters, then select a verified address."));
            setAddressSearching(false);
            return;
        }
        setAddressStatus(t("checkout.searchingAddresses", "Searching addresses..."));
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
        setAddressStatus(t("checkout.addressSelected", "Verified delivery address selected."), false, true);
        invalidateQuote(t("checkout.calculatingFee", "Calculating delivery fee..."));
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
        invalidateQuote(t("checkout.detailsChanged", "Delivery details changed. Recalculating the delivery fee..."));
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
            setAddressStatus(t("checkout.savedCheckContact", "Saved address found. Check the recipient name and phone number to calculate delivery."));
            quoteMessage(t("checkout.enterValidContact", "Enter valid delivery contact details to calculate the fee."), true);
            updateSummary();
            return;
        }
        setAddressStatus(t("checkout.verifyingSaved", "Verifying your saved delivery address..."));
        await requestQuoteForCurrentAddress();
    }

    async function requestQuoteForCurrentAddress() {
        if (state.busy || state.pending || !needsQuote()) return;
        const input = $("[data-address-search]");
        const address = input.value.trim();
        if (address.length < 3) {
            state.selectedAddress = "";
            setAddressStatus(t("checkout.enterThreeChars", "Enter at least 3 characters of the delivery address."), true);
            quoteMessage(t("checkout.enterAddressFirst", "Enter a delivery address before calculating the fee."), true);
            updateSummary();
            input.focus();
            return;
        }
        state.selectedAddress = address;
        closeAddressSuggestions();
        setAddressStatus(t("checkout.verifyingAddress", "Verifying delivery address..."));
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
            setAddressStatus(t("checkout.selectVerifiedSuggestion", "Select a verified address from the suggestions."), true);
            quoteMessage(t("checkout.selectVerifiedBefore", "Select a verified address before calculating delivery."), true);
            return;
        }
        if (!$("[data-address-form]").reportValidity()) {
            updatePhoneStatus(true);
            return;
        }
        invalidateQuote(t("checkout.calculatingFee", "Calculating delivery fee..."));
        const version = state.quoteVersion;
        const address = readAddress();
        state.quoting = true;
        state.quoteError = false;
        updateSummary();
        quoteMessage(t("checkout.calculatingYourFee", "Calculating your delivery fee..."));
        try {
            const quote = await request("/api/delivery/quote", { method: "POST", body: JSON.stringify({ ...address, paymentMethod: state.paymentMethod }) });
            if (version !== state.quoteVersion) return;
            const remaining = Date.parse(quote.expiresAt) - Date.now();
            if (!quote.id || !(remaining > 0) || !Number.isFinite(Number(quote.fee))) throw new Error(t("checkout.feeExpiredNew", "This delivery fee has expired. Please request a new fee."));
            state.quote = quote;
            state.selectedAddress = quote.address || state.selectedAddress;
            $("[data-address-search]").value = state.selectedAddress;
            setAddressStatus(t("checkout.addressSelected", "Verified delivery address selected."), false, true);
            quoteMessage(t("checkout.feeConfirmedUntil", "Delivery fee confirmed until {time}.").replace("{time}", new Date(quote.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })));
            state.quoteTimer = window.setTimeout(() => {
                if (!state.pending && !state.busy) {
                    invalidateQuote(t("checkout.feeExpired", "Your delivery fee has expired."));
                    state.quoteError = true;
                    quoteMessage(t("checkout.feeExpiredContinue", "Your delivery fee has expired. Get an updated fee to continue."), true);
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
        if (state.busy || state.quoting || state.voucherBusy) return;
        if (!state.pending) {
            if (!state.items.length || method()?.available === false || (state.method !== 'pickup' && !$("[data-address-form]").reportValidity())) return;
            if (state.paymentMethods.find((option) => option.code === state.paymentMethod)?.available !== true) return;
            if (needsQuote() && (!state.selectedAddress || $("[data-address-search]").value.trim() !== state.selectedAddress || !quoteValid())) {
                invalidateQuote();
                quoteMessage(t("checkout.selectWaitFee", "Select a verified address and wait for the delivery fee before placing your order."), true);
                return;
            }
            const address = state.method === 'pickup' ? {} : readAddress();
            if (state.paymentMethod !== 'COD' && typeof window.crypto?.randomUUID !== 'function') {
                quoteMessage(t("checkout.httpsRequired", 'Open checkout over HTTPS or localhost to use sandbox online payment.'), true);
                $('[data-quote-status]').hidden = false;
                return;
            }
            state.pending = { attempted: true, quote: state.quote, address, items: state.items, voucher: state.voucher,
                body: { deliveryMethod: state.method, paymentMethod: state.paymentMethod,
                    ...(state.paymentMethod !== 'COD' ? { checkoutKey: window.crypto.randomUUID() } : {}),
                    ...(state.voucher ? { voucherCode: state.voucher.code } : {}),
                    ...(needsQuote() ? { shippingQuoteId: state.quote.id } : state.method === 'pickup' ? {} : { shippingAddress: address }) } };
            if (!persistPending()) {
                state.pending = null;
                quoteMessage(t("checkout.allowSession", "Please allow this site's session storage before placing an order so your checkout can be recovered if the connection drops."), true);
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
                const error = new Error(t("checkout.orderNoNumber", "Your checkout was submitted, but its order number could not be read. Check the same request again."));
                error.uncertain = true;
                throw error;
            }
            state.pending = null;
            persistPending();
            window.clearTimeout(state.quoteTimer);
            window.history.replaceState(null, "", `/checkout?order=${encodeURIComponent(order.id || order._id)}`);
            window.dispatchEvent(new CustomEvent("sugarbliss:cart-updated", { detail: { count: 0 } }));
            renderOrder(order);
            if (order.paymentProvider === 'zalopay' && order.paymentStatus === 'Pending') await beginPayment(order.id || order._id, order.paymentMethod);
        } catch (error) {
            if (!error.uncertain) {
                state.pending = null;
                persistPending();
            }
            if (String(error.data?.code || '').startsWith('VOUCHER_')) {
                state.pending = null;
                persistPending();
                state.voucher = null;
                renderReview();
                voucherStatus(error.message, 'error');
                loadOwnedVouchers();
            } else {
                renderFailure(error.message, Boolean(error.uncertain));
            }
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
        return `<dl class="checkout-totals"><div><dt>${escape(t("checkout.subtotal", "Subtotal"))}</dt><dd>${money(order.subtotal)}</dd></div>${Number(order.discount) > 0 ? `<div><dt>${escape(t("checkout.discount", "Discount"))}</dt><dd>- ${money(order.discount)}</dd></div>` : ''}<div><dt>${escape(t("checkout.delivery", "Delivery"))}</dt><dd>${Number(order.shippingFee) === 0 ? escape(t("checkout.free", "Free")) : money(order.shippingFee)}</dd></div><div class="checkout-total"><dt>${escape(t("checkout.total", "Total"))}</dt><dd><strong>${money(order.total)}</strong><small>VND</small></dd></div></dl>`;
    }

    function addressDetails(address = {}) {
        return `<div class="checkout-detail-row"><span class="checkout-icon">${icon("pin")}</span><div><span class="checkout-detail-label">${escape(t("checkout.shipTo", "Ship to"))}</span><strong>${escape(address.recipientName || t("checkout.recipient", "Recipient"))}</strong><p>${escape(address.phone || "")}</p><p>${escape(address.address || "")}</p>${address.note ? `<p>${escape(t("checkout.note", "Note"))}: ${escape(address.note)}</p>` : ""}</div></div>`;
    }

    function fulfillmentDetails(order) {
        return order.deliveryMethod === 'pickup'
            ? `<div class="checkout-detail-row"><span class="checkout-icon">${icon('pin')}</span><div><span class="checkout-detail-label">${escape(t("checkout.storePickup", "Store Pickup"))}</span><strong>Sugar Bliss</strong><p>${escape(t("checkout.pickupEmail", "We will email you when your order is ready to collect."))}</p></div></div>`
            : addressDetails(order.shippingAddress);
    }

    function deliveryLabel(value) {
        return ({ standard: t("checkout.methodStandard", "Standard Delivery"), lalamove: t("checkout.methodStandard", "Standard Delivery"), express: t("checkout.methodExpress", "Express Delivery"), pickup: t("checkout.storePickup", "Store Pickup") })[value] || t("checkout.methodDelivery", "Delivery");
    }

    function shippingLabel(value) {
        return ({ CREATING: t("checkout.shipCreating", "Confirming delivery"), UNKNOWN: t("checkout.shipUnknown", "Awaiting delivery confirmation"), FAILED: t("checkout.shipFailed", "Delivery booking needs attention"),
            ASSIGNING_DRIVER: t("checkout.shipAssigning", "Finding a driver"), ON_GOING: t("checkout.shipOngoing", "Driver assigned"), PICKED_UP: t("checkout.shipPickedUp", "On the way"), COMPLETED: t("checkout.shipCompleted", "Delivered"),
            CANCELED: t("checkout.shipCanceled", "Delivery cancelled"), REJECTED: t("checkout.shipRejected", "No driver available"), EXPIRED: t("checkout.shipExpired", "Delivery expired") })[value] || t("checkout.shipUnknown", "Awaiting delivery confirmation");
    }

    function trackingLink(value) {
        try {
            const url = new URL(value);
            if (url.protocol !== "https:" || !["share.lalamove.com", "share.sandbox.lalamove.com"].includes(url.hostname)) return "";
            return `<a class="checkout-button checkout-button-secondary" href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${escape(t("checkout.trackDelivery", "Track delivery"))}</a>`;
        } catch { return ""; }
    }

    function renderOrder(order) {
        state.lastOrder = order;
        state.method = order.deliveryMethod || state.method;
        if (order.status === 'Failed' || order.paymentStatus === 'Failed') {
            renderFailedPayment(order);
            return;
        }
        if (order.paymentProvider === 'zalopay' && order.paymentStatus === 'Pending' && order.status !== 'Cancelled') {
            renderPendingPayment(order);
            return;
        }
        const online = order.paymentProvider === 'zalopay';
        const cancelled = order.status === "Cancelled";
        const pending = order.shippingProvider === "lalamove" && (Boolean(order.shippingError) || !order.shippingOrderId ||
            ["CREATING", "UNKNOWN", "FAILED", "CANCELED", "REJECTED", "EXPIRED"].includes(order.shippingStatus));
        const needsAttention = pending || cancelled;
        const customer = order.shippingAddress?.recipientName?.split(" ").filter(Boolean)[0] || t("checkout.customerFallback", "friend");
        const status = cancelled ? t("checkout.statusCancelled", "Order cancelled") : pending ? t("checkout.statusPending", "Order saved · Delivery needs confirmation") : t("checkout.statusConfirmed", "Order confirmed");
        const titleEn = cancelled ? "This order has been cancelled." : pending ? "Your order is saved." : "Order confirmed";
        const title = cancelled ? t("checkout.titleCancelled", "This order has been cancelled.") : pending ? t("checkout.titlePending", "Your order is saved.") : t("checkout.titleConfirmed", "Thanks, {name} — it's confirmed.").replace("{name}", customer);
        const description = cancelled ? t("checkout.descCancelled", "View your order details below or return to the menu.")
            : pending ? t("checkout.descPending", "Your order is recorded. Delivery is still being confirmed; check its status below or contact the store.")
                : online ? t("checkout.descOnline", "Payment received via {method}. No cash payment is due.").replace("{method}", paymentLabel(order.paymentMethod)) : order.deliveryMethod === 'pickup' ? t("checkout.descPickup", "Your treats are on our list. Pay at the store when you collect your order.") : t("checkout.descCod", "Your sweet treats are on our list. Pay cash when you receive your order.");
        showResult(`<header class="checkout-result-heading ${needsAttention ? "is-pending" : ""}">
            <div class="checkout-result-icon">${icon(needsAttention ? "clock" : "check")}</div>
            <span class="checkout-badge">${icon(needsAttention ? "clock" : "shield")}${escape(status)}</span>
            <h1>${escape(title)}</h1><p>${escape(description)}</p>
            <div class="checkout-result-meta"><span>${escape(t("checkout.orderLabel", "Order"))} &nbsp;<strong>${escape(order.orderNumber || order.id)}</strong></span><span>${escape(order.shippingProvider === "lalamove" ? shippingLabel(order.shippingStatus) : order.status)}</span></div>
            <div class="checkout-result-actions"><a class="checkout-button checkout-button-primary" href="/products">${escape(t("checkout.continueShopping", "Continue shopping"))}</a><a class="checkout-button checkout-button-secondary" href="/orders">${escape(t("checkout.viewOrders", "View orders"))}</a></div>
        </header>
        <div class="checkout-result-layout"><div class="checkout-stack">
            <section class="checkout-card"><h2>${escape(needsAttention ? t("checkout.whatNext", "What happens next") : t("checkout.blissOnWay", "A little bliss is on its way"))}</h2>
                <div class="checkout-next"><span>1</span><div><strong>${escape(needsAttention ? t("checkout.checkDeliveryStatus", "Check delivery status") : t("checkout.wePrepare", "We prepare your order"))}</strong><p>${escape(needsAttention ? t("checkout.useRefreshBelow", "Use Refresh delivery below to check the latest status of this order.") : order.deliveryMethod === 'pickup' ? t("checkout.pickupEmailReady", "We will email you when your treats are ready to collect.") : t("checkout.storeConfirm", "The store will confirm and prepare your treats for delivery."))}</p></div></div>
                <div class="checkout-next"><span>2</span><div><strong>${cancelled ? escape(t("checkout.browseOrders", "Browse your orders")) : online ? escape(t("checkout.paidOnline", 'Paid online')) : escape(paymentLabel('COD'))}</strong><p>${cancelled ? escape(t("checkout.ordersInclude", "Your order history includes the latest order and delivery details.")) : online ? escape(t("checkout.paidVia", "{amount} paid via {method}.").replace("{amount}", money(order.total)).replace("{method}", paymentLabel(order.paymentMethod))) : escape(t("checkout.haveReady", "Have {amount} ready when you receive your order.").replace("{amount}", money(order.total)))}</p></div></div>
            </section>
            <section class="checkout-card"><h2>${escape(order.deliveryMethod === 'pickup' ? t("checkout.storePickup", 'Store Pickup') : t("checkout.methodDelivery", 'Delivery'))}</h2>${fulfillmentDetails(order)}
                <div class="checkout-detail-row"><span class="checkout-icon">${icon("truck")}</span><div><span class="checkout-detail-label">${escape(t("checkout.methodWord", "Method"))}</span><strong>${escape(deliveryLabel(order.deliveryMethod))}</strong><p>${escape(order.shippingProvider === "lalamove" ? `Lalamove · ${shippingLabel(order.shippingStatus)}` : order.status)}</p>${order.shippingOrderId ? `<p>${escape(t("checkout.deliveryNumber", "Delivery"))} #${escape(order.shippingOrderId)}</p>` : ""}</div></div>
                ${order.shippingError ? `<p class="checkout-error-copy">${escape(order.shippingError)}</p>` : ""}
                ${order.shippingProvider === "lalamove" ? `<div class="checkout-result-actions"><button class="checkout-button checkout-button-secondary" type="button" data-refresh-order="${escape(order.id || order._id)}" data-has-booking="${Boolean(order.shippingOrderId)}">${escape(t("checkout.refreshDelivery", "Refresh delivery"))}</button>${trackingLink(order.shippingTrackingUrl)}</div><p class="checkout-quote-status" data-refresh-status role="status"></p>` : ""}
            </section>
        </div><section class="checkout-card"><div class="checkout-card-heading"><h2>${escape(t("checkout.orderDetails", "Order details"))}</h2><span class="checkout-detail-label">${escape(order.orderedOn || "")}</span></div>
            ${renderItems(order.items || [])}<div class="checkout-order-footer"><div class="checkout-detail-row"><span class="checkout-icon">${icon("wallet")}</span><div><span class="checkout-detail-label">${escape(t("checkout.paymentMethodWord", "Payment method"))}</span><strong>${escape(paymentLabel(order.paymentMethod))}</strong><p>${order.paymentStatus === "Paid" ? escape(t("checkout.paid", "Paid")) : cancelled ? escape(order.paymentStatus || t("checkout.pending", "Pending")) : escape(t("checkout.payOnReceive", "Pay when you receive your order"))}</p>${order.payment?.error ? `<p class="checkout-error-copy">${escape(order.payment.error)}</p>` : ''}</div></div>${totals(order)}</div>
        </section></div>`);
        document.title = `Sugar Bliss | ${titleEn}`;
    }

    function renderFailedPayment(order) {
        const paid = order.paymentStatus === 'Paid';
        const message = order.payment?.error || (paid
            ? t("checkout.payAfterClosed", 'Payment arrived after this checkout closed. Contact the store for a refund.')
            : t("checkout.payNotCompleted", 'Payment was not completed. This order will not be prepared or dispatched.'));
        showResult(`<header class="checkout-result-heading is-pending">
            <div class="checkout-result-icon">${icon('alert')}</div>
            <span class="checkout-badge">${escape(t("checkout.failed", "Failed"))}</span>
            <h1>${paid ? escape(t("checkout.payNeedsReview", 'Your payment needs review.')) : escape(t("checkout.payFailed", 'Payment failed.'))}</h1>
            <p>${escape(message)}</p><p>${escape(t("checkout.orderLabel", "Order"))} ${escape(order.orderNumber || order.id || order._id)}</p>
            <div class="checkout-result-actions"><a class="checkout-button checkout-button-primary" href="/orders">${escape(t("checkout.viewOrderHistory", "View order history"))}</a>
                <a class="checkout-button checkout-button-secondary" href="${paid ? '/contact' : '/products'}">${paid ? escape(t("checkout.contactStore", 'Contact the store')) : escape(t("checkout.continueShopping", 'Continue shopping'))}</a></div>
        </header><div class="checkout-layout"><section class="checkout-card"><h2>${escape(t("checkout.yourItems", "Your items"))}</h2>${renderItems(order.items || [])}</section>
            <aside class="checkout-card checkout-summary"><h2>${escape(t("checkout.orderSummary", "Order summary"))}</h2>${totals(order)}
                <p class="checkout-error-copy">${paid ? escape(t("checkout.refundNeeded", 'Payment received. Refund assistance is required; do not pay again.')) : escape(t("checkout.noPaymentDue", 'No payment is due for this failed order.'))}</p>
                ${!paid && order.paymentProvider === 'zalopay' ? `<button class="checkout-button checkout-button-secondary" type="button" data-refresh-payment="${escape(order.id || order._id)}" data-payment-method="${escape(order.paymentMethod)}">${escape(t("checkout.checkPaymentStatus", "Check payment status"))}</button>
                    <p class="checkout-quote-status is-error" data-payment-status role="status"></p>` : ''}
            </aside></div>`);
        document.title = 'Sugar Bliss | Payment failed';
    }

    function renderPendingPayment(order) {
        const id = escape(order.id || order._id);
        const checking = ['Creating', 'Unknown'].includes(order.payment?.state) ||
            Boolean(order.payment?.expiresAt && Date.parse(order.payment.expiresAt) <= Date.now());
        showResult(`<header class="checkout-heading"><p class="checkout-eyebrow">${escape(t("checkout.sandboxPayment", "Sandbox payment"))}</p><h1>${escape(t("checkout.awaitingPayment", "Awaiting payment"))}</h1>
            <p>${escape(t("checkout.orderLabel", "Order"))} ${escape(order.orderNumber)} · ${escape(paymentLabel(order.paymentMethod))}</p></header>
            <div class="checkout-layout"><section class="checkout-card"><h2>${escape(t("checkout.yourItems", "Your items"))}</h2>${renderItems(order.items || [])}
                <div class="checkout-order-footer">${fulfillmentDetails(order)}</div></section>
            <aside class="checkout-card checkout-summary"><h2>${escape(t("checkout.paymentSummary", "Payment summary"))}</h2>${totals(order)}
                <p class="checkout-quote-status">${order.payment?.expiresAt ? escape(t("checkout.paymentWindowEnds", "Payment window ends at {time}.").replace("{time}", new Date(order.payment.expiresAt).toLocaleTimeString())) : escape(t("checkout.awaitingGateway", 'Awaiting gateway confirmation.'))}</p>
                ${!checking ? `<button class="checkout-button checkout-button-primary" type="button" data-pay-order="${id}" data-payment-method="${escape(order.paymentMethod)}">${escape(t("checkout.continueTo", "Continue to {method}").replace("{method}", paymentLabel(order.paymentMethod)))}</button>` : ''}
                <button class="checkout-button checkout-button-secondary" type="button" data-refresh-payment="${id}" data-payment-method="${escape(order.paymentMethod)}">${escape(t("checkout.refreshPayment", "Refresh payment"))}</button>
                <p class="checkout-quote-status is-error" data-payment-status role="status">${escape(order.payment?.error || '')}</p>
                <a href="/orders">${escape(t("checkout.viewOrderHistory", "View order history"))}</a></aside></div>`);
        document.title = 'Sugar Bliss | Awaiting payment';
    }

    function paymentPath(id, method, action) {
        return `/api/payments/${method === 'Visa' ? 'visa/' : ''}${encodeURIComponent(id)}/${action}`;
    }

    async function beginPayment(id, method) {
        const button = $('[data-pay-order]');
        if (button) button.disabled = true;
        try {
            const payment = await request(paymentPath(id, method, 'checkout'), { method: 'POST' });
            if (payment.status === 'Paid') {
                renderOrder(await request(`/api/orders/${encodeURIComponent(id)}`));
                return;
            }
            const url = new URL(payment.url);
            if (!['https://qcgateway.zalopay.vn', 'https://sbgateway.zalopay.vn', 'https://sbpayment.zalopay.vn'].includes(url.origin) || url.username || url.password) {
                throw new Error(t("checkout.invalidPaymentUrl", 'The sandbox payment URL is invalid. Refresh payment status.'));
            }
            window.location.assign(url.href);
        } catch (error) {
            if (error.uncertain) {
                try {
                    const saved = await request(`/api/orders/${encodeURIComponent(id)}`);
                    renderOrder(saved);
                    if (saved.paymentStatus === 'Paid') return;
                } catch { /* Keep the saved order visible until connectivity recovers. */ }
            }
            if ($('[data-payment-status]')) $('[data-payment-status]').textContent = error.message;
            const retry = $('[data-pay-order]');
            if (retry) retry.disabled = false;
        }
    }

    async function pollPayment(order, attempt) {
        window.clearTimeout(state.paymentPollTimer);
        if (order.paymentProvider !== 'zalopay' || order.paymentStatus !== 'Pending' || order.status === 'Cancelled' || attempt >= 12) return;
        state.paymentPollTimer = window.setTimeout(async () => {
            try {
                const id = encodeURIComponent(order.id || order._id);
                await request(paymentPath(order.id || order._id, order.paymentMethod, 'status'));
                const updated = await request(`/api/orders/${id}`);
                renderOrder(updated);
                pollPayment(updated, attempt + 1);
            } catch (error) { if ($('[data-payment-status]')) $('[data-payment-status]').textContent = error.message; }
        }, 5000);
    }

    function renderFailure(message, uncertain) {
        const recoverable = uncertain && Boolean(state.pending?.body.shippingQuoteId || state.pending?.body.checkoutKey);
        const address = state.pending?.address || readAddress();
        const fee = Number(state.quote?.fee ?? method()?.fee ?? 0);
        showResult(`<section class="checkout-card checkout-error-banner"><div class="checkout-result-icon">${icon("alert")}</div><div>
            <span class="checkout-badge">${icon("clock")}${escape(uncertain ? t("checkout.confirmationNeeded", "Confirmation needed") : t("checkout.checkoutIncomplete", "Checkout incomplete"))}</span>
            <h1>${escape(uncertain ? t("checkout.checkingOrder", "We're checking your order.") : t("checkout.couldNotPlace", "We couldn't place your order."))}</h1><p>${escape(message)}</p>
        </div></section><div class="checkout-layout"><section class="checkout-card"><div class="checkout-card-heading"><h2>${escape(t("checkout.orderReview", "Your order review"))}</h2><span class="checkout-badge">${escape(paymentLabel(state.pending?.body.paymentMethod || state.paymentMethod))}</span></div>
            ${renderItems(state.items)}<div class="checkout-order-footer">${fulfillmentDetails({ deliveryMethod: state.method, shippingAddress: address })}${totals({ subtotal: subtotal(), discount: discountAmount(), shippingFee: fee, total: Math.max(0, subtotal() - discountAmount()) + fee })}</div></section>
            <aside class="checkout-stack"><section class="checkout-card checkout-error-card"><h2>${escape(uncertain ? t("checkout.checkYourOrder", "Check your order") : t("checkout.letsTryAgain", "Let's try again"))}</h2><p class="checkout-error-copy">${escape(uncertain ? t("checkout.confirmInterrupted", "The confirmation was interrupted. Check this checkout request or your order history before starting another order.") : t("checkout.reviewTryAgain", "Review your address and delivery fee, then try placing your order again."))}</p>
                ${recoverable ? `<button class="checkout-button checkout-button-primary" type="button" data-retry-order>${escape(t("checkout.checkOrderAgain", "Check this order again"))}</button>` : !uncertain ? `<button class="checkout-button checkout-button-primary" type="button" data-return-review>${escape(t("checkout.returnToCheckout", "Return to checkout"))}</button>` : ""}
                <a class="checkout-button checkout-button-secondary" href="/orders">${escape(t("checkout.viewOrderHistory", "View order history"))}</a><p class="checkout-payment-note">${icon("wallet")}${escape(paymentLabel(state.pending?.body.paymentMethod || state.paymentMethod))}</p></section>
                <section class="checkout-card checkout-error-card"><h2>${escape(t("checkout.needHand", "Need a hand?"))}</h2><p class="checkout-error-copy">${escape(t("checkout.storeCanHelp", "Our store can help with your order or delivery details."))}</p><a class="checkout-button checkout-button-secondary" href="/contact">${escape(t("checkout.contactStore", "Contact the store"))}</a></section></aside></div>`);
        document.title = "Sugar Bliss | Checkout confirmation";
    }

    async function handleResultAction(event) {
        const pay = event.target.closest('[data-pay-order]');
        if (pay) { await beginPayment(pay.dataset.payOrder, pay.dataset.paymentMethod); return; }
        const paymentRefresh = event.target.closest('[data-refresh-payment]');
        if (paymentRefresh) {
            paymentRefresh.disabled = true;
            try {
                const id = encodeURIComponent(paymentRefresh.dataset.refreshPayment);
                await request(paymentPath(paymentRefresh.dataset.refreshPayment, paymentRefresh.dataset.paymentMethod, 'status'));
                renderOrder(await request(`/api/orders/${id}`));
            } catch (error) {
                if ($('[data-payment-status]')) $('[data-payment-status]').textContent = error.message;
                paymentRefresh.disabled = false;
            }
            return;
        }
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
        $("[data-checkout-loading]").innerHTML = `${escape(t("checkout.emptyText", "Your cart is empty."))} <a href="/products">${escape(t("checkout.emptyLink", "Choose something sweet"))}</a>`;
    }

    function showLoadError(message) {
        $("[data-checkout-loading]").hidden = false;
        $("[data-checkout-loading]").innerHTML = `${escape(message)}<br><a href="${query.get("order") ? "/orders" : "/cart"}">${escape(query.get("order") ? t("checkout.viewOrderHistory", "View order history") : t("checkout.backToCart", "Back to your cart"))}</a>`;
    }
})();
