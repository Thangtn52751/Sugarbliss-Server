document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('[data-bliss-form="special-order"]');

    if (!form) return;

    const messageEl = form.querySelector('[data-form-message]');
    const submitBtn = form.querySelector('.submit-button');
    const deliverySelect = form.querySelector('[data-delivery-select]');
    const addressGroups = form.querySelectorAll('[data-address-fields]');
    const API_BASE_URL = window.SugarBlissApi ? window.SugarBlissApi.baseUrl : 'http://localhost:3000';

    const getField = (name) => form.elements.namedItem(name);

    const showFormMessage = (text, type) => {
        if (!messageEl) return;
        messageEl.textContent = text;
        messageEl.className = `form-message is-${type}`;
        messageEl.style.display = 'block';
    };

    const clearFormMessage = () => {
        if (!messageEl) return;
        messageEl.textContent = '';
        messageEl.className = 'form-message';
        messageEl.style.display = 'none';
    };

    const needsAddress = () => {
        const value = deliverySelect?.value;
        return Boolean(value) && value !== 'pickup';
    };

    const syncDeliveryOption = () => {
        if (!deliverySelect) return;

        deliverySelect.classList.toggle('has-value', Boolean(deliverySelect.value));

        const requireAddress = needsAddress();
        const hideAddress = deliverySelect.value === 'pickup';

        addressGroups.forEach((group) => {
            group.classList.toggle('is-hidden', hideAddress);
            group.hidden = hideAddress;
        });

        ['address1', 'city', 'zipCode'].forEach((fieldName) => {
            const field = getField(fieldName);
            if (field) {
                field.required = requireAddress;
            }
        });
    };

    const prefillFromLoggedInUser = () => {
        try {
            const user = JSON.parse(localStorage.getItem('sugarBlissUser') || 'null');
            if (!user) return;

            const emailField = getField('email');
            const nameField = getField('name');
            const phoneField = getField('phone');

            if (emailField && !emailField.value && user.email) {
                emailField.value = user.email;
            }
            if (nameField && !nameField.value && user.name) {
                nameField.value = user.name;
            }
            if (phoneField && !phoneField.value && user.phone) {
                phoneField.value = user.phone;
            }
        } catch (error) {
            console.warn('Cannot prefill special order form.', error);
        }
    };

    const buildPayload = () => {
        const formData = new FormData(form);
        const deliveryOption = String(formData.get('deliveryOption') || '').trim();
        const payload = {
            name: String(formData.get('name') || '').trim(),
            email: String(formData.get('email') || '').trim(),
            phone: String(formData.get('phone') || '').trim(),
            deliveryOption,
            address1: String(formData.get('address1') || '').trim(),
            address2: String(formData.get('address2') || '').trim(),
            city: String(formData.get('city') || '').trim(),
            zipCode: String(formData.get('zipCode') || '').trim(),
            orderDetails: String(formData.get('orderDetails') || '').trim(),
        };

        if (deliveryOption === 'pickup') {
            payload.address1 = '';
            payload.address2 = '';
            payload.city = '';
            payload.zipCode = '';
        }

        return payload;
    };

    const validatePayload = (payload) => {
        if (!payload.name || !payload.email || !payload.phone || !payload.deliveryOption || !payload.orderDetails) {
            return 'Please fill in name, email, phone, delivery option, and order details.';
        }

        if (!/^\S+@\S+\.\S+$/.test(payload.email)) {
            return 'Please enter a valid email address.';
        }

        if (payload.deliveryOption !== 'pickup' && (!payload.address1 || !payload.city || !payload.zipCode)) {
            return 'Delivery address, city, and zip code are required for delivery orders.';
        }

        return '';
    };

    deliverySelect?.addEventListener('change', syncDeliveryOption);
    prefillFromLoggedInUser();
    syncDeliveryOption();

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearFormMessage();

        const payload = buildPayload();
        const validationError = validatePayload(payload);

        if (validationError) {
            if (!form.checkValidity()) {
                form.reportValidity();
            }
            showFormMessage(validationError, 'error');
            return;
        }

        const originalBtnText = submitBtn.textContent;
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;

        try {
            const headers = { 'Content-Type': 'application/json' };
            const token = localStorage.getItem('sugarBlissToken');
            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            const response = await fetch(`${API_BASE_URL}/api/special-orders`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });
            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(result.message || 'We could not send your request. Please try again.');
            }

            const requestNumber = result.specialOrder?.requestNumber;
            showFormMessage(
                requestNumber
                    ? `Thank you. Request ${requestNumber} has been sent. We will contact you within 24 hours.`
                    : (result.message || 'Thank you. Your special order request has been sent.'),
                'success'
            );
            form.reset();
            syncDeliveryOption();
        } catch (error) {
            console.error('Special order submit error:', error);
            showFormMessage(error.message || 'Cannot connect to server.', 'error');
        } finally {
            submitBtn.textContent = originalBtnText;
            submitBtn.disabled = false;
        }
    });
});
