const form = document.querySelector("[data-auth-form]");
const message = document.querySelector("[data-form-message]");

if (form && message) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        message.textContent = "";
        message.className = "form-message";

        const payload = Object.fromEntries(new FormData(form).entries());

        if (form.dataset.authForm === "register") {
            if (payload.password !== payload.confirmPassword) {
                message.textContent = "Password confirmation does not match.";
                message.classList.add("is-error");
                return;
            }

            payload.name = payload.email.split("@")[0] || "Sugar Bliss Customer";
            delete payload.confirmPassword;
        }

        try {
            const response = await fetch(window.SugarBlissApi.url(form.getAttribute("action")), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            message.textContent = data.message || (response.ok ? "Request completed." : "Something went wrong.");
            message.classList.add(response.ok ? "is-success" : "is-error");

            if (response.ok && form.dataset.authForm === "register") {
                setTimeout(() => {
                    window.location.href = "/login";
                }, 900);
            }

            if (response.ok && form.dataset.authForm === "login") {
                localStorage.setItem("sugarBlissToken", data.token);
                localStorage.setItem("sugarBlissUser", JSON.stringify(data));

                setTimeout(() => {
                    window.location.href = "/home";
                }, 700);
            }
        } catch (error) {
            message.textContent = "Cannot connect to server.";
            message.classList.add("is-error");
        }
    });
}
