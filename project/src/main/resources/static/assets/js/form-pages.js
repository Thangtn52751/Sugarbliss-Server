document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("[data-bliss-form]");
    const message = document.querySelector("[data-form-message]");
    const deliverySelect = document.querySelector("[data-delivery-select]");

    if (deliverySelect) {
        const syncSelectColor = () => {
            deliverySelect.classList.toggle("has-value", Boolean(deliverySelect.value));
        };

        deliverySelect.addEventListener("change", syncSelectColor);
        syncSelectColor();
    }

    if (!form || !message) {
        return;
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        message.textContent = "";
        message.className = "form-message";

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formName = form.dataset.blissForm === "special-order"
            ? "special order request"
            : "message";

        message.textContent = `Thank you. Your ${formName} has been sent. We will get back to you within 24 hours.`;
        message.classList.add("is-success");
        form.reset();

        if (deliverySelect) {
            deliverySelect.classList.remove("has-value");
        }
    });
});
