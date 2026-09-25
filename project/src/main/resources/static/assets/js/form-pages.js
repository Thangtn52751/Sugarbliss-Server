document.addEventListener("DOMContentLoaded", () => {
    const API_BASE_URL = window.SugarBlissApi.baseUrl;
    const form = document.querySelector("[data-bliss-form]");
    const message = document.querySelector("[data-form-message]");
    const deliverySelect = document.querySelector("[data-delivery-select]");

    if (deliverySelect) {
        const syncSelectColor = () => {
            deliverySelect.classList.toggle("has-value", Boolean(deliverySelect.value));

            const needsAddress = deliverySelect.value !== "pickup";
            ["address1", "city", "zipCode"].forEach((fieldName) => {
                const field = form?.elements.namedItem(fieldName);

                if (field) {
                    field.required = needsAddress;
                }
            });
        };

        deliverySelect.addEventListener("change", syncSelectColor);
        syncSelectColor();
    }

    if (!form || !message || form.dataset.blissForm === "special-order" || form.dataset.blissForm === "contact") {
        return;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        message.textContent = "";
        message.className = "form-message";

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const isSpecialOrder = form.dataset.blissForm === "special-order";
        const endpoint = isSpecialOrder ? "/api/special-orders" : "/api/contact";
        const submitButton = form.querySelector("button[type='submit']");
        const originalButtonText = submitButton.textContent;
        const payload = Object.fromEntries(new FormData(form).entries());

        submitButton.disabled = true;
        submitButton.textContent = "Sending...";

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.message || "We could not send your request. Please try again.");
            }

            message.textContent = isSpecialOrder
                ? `Thank you. Request ${data.specialOrder.requestNumber} has been sent. We will contact you within 24 hours.`
                : `Thank you. Message ${data.contactMessage.ticketNumber} is waiting for our team to review.`;
            message.classList.add("is-success");
            form.reset();

            if (deliverySelect) {
                deliverySelect.classList.remove("has-value");
            }
        } catch (error) {
            message.textContent = error.message;
            message.classList.add("is-error");
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
    });
});
