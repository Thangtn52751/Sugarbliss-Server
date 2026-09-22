const RESET_API_BASE_URL = window.SugarBlissApi.baseUrl;
const RESET_EMAIL_KEY = "sugarBlissResetEmail";
const RESET_TOKEN_KEY = "sugarBlissResetToken";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("[data-reset-page]");
    const page = form?.dataset.resetPage;

    if (!form) {
        return;
    }

    if (page === "forgot") {
        form.addEventListener("submit", handleForgotPassword);
    }

    if (page === "otp") {
        setupOtpInputs();
        form.addEventListener("submit", handleOtpVerification);
        document.querySelector("[data-resend-otp]")?.addEventListener("click", resendOtp);
    }

    if (page === "new-password") {
        guardNewPasswordPage();
        form.addEventListener("submit", handleNewPassword);
    }
});

async function handleForgotPassword(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const email = new FormData(form).get("email").trim().toLowerCase();

    try {
        setResetLoading(form, true);
        const data = await sendOtp(email);
        sessionStorage.setItem(RESET_EMAIL_KEY, email);
        showResetMessage(data.devOtp ? `Development OTP: ${data.devOtp}` : "OTP sent successfully.", true);
        setTimeout(() => {
            window.location.href = "/otp-verification";
        }, data.devOtp ? 900 : 450);
    } catch (error) {
        showResetMessage(error.message, false);
    } finally {
        setResetLoading(form, false);
    }
}

async function handleOtpVerification(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const email = sessionStorage.getItem(RESET_EMAIL_KEY);
    const otp = getOtpValue();

    if (!email) {
        window.location.href = "/forgot-password";
        return;
    }

    if (otp.length !== 6) {
        showResetMessage("Please enter the 6-digit code.", false);
        return;
    }

    try {
        setResetLoading(form, true);
        const response = await fetch(`${RESET_API_BASE_URL}/api/users/verify-otp`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email,
                otp,
                purpose: "reset-password"
            })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Cannot verify OTP.");
        }

        sessionStorage.setItem(RESET_TOKEN_KEY, data.resetToken);
        showResetMessage("Code verified successfully.", true);
        setTimeout(() => {
            window.location.href = "/new-password";
        }, 450);
    } catch (error) {
        showResetMessage(error.message, false);
    } finally {
        setResetLoading(form, false);
    }
}

async function resendOtp() {
    const email = sessionStorage.getItem(RESET_EMAIL_KEY);

    if (!email) {
        window.location.href = "/forgot-password";
        return;
    }

    try {
        const data = await sendOtp(email);
        showResetMessage(data.devOtp ? `Development OTP: ${data.devOtp}` : "A new OTP has been sent.", true);
    } catch (error) {
        showResetMessage(error.message, false);
    }
}

async function handleNewPassword(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = sessionStorage.getItem(RESET_EMAIL_KEY);
    const resetToken = sessionStorage.getItem(RESET_TOKEN_KEY);
    const password = formData.get("password");
    const confirmPassword = formData.get("confirmPassword");

    if (!email || !resetToken) {
        window.location.href = "/forgot-password";
        return;
    }

    if (password !== confirmPassword) {
        showResetMessage("Passwords do not match.", false);
        return;
    }

    try {
        setResetLoading(form, true);
        const response = await fetch(`${RESET_API_BASE_URL}/api/users/reset-password`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email,
                resetToken,
                password
            })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Cannot reset password.");
        }

        sessionStorage.removeItem(RESET_EMAIL_KEY);
        sessionStorage.removeItem(RESET_TOKEN_KEY);
        showResetMessage("Password reset successfully.", true);
        setTimeout(() => {
            window.location.href = "/login";
        }, 700);
    } catch (error) {
        showResetMessage(error.message, false);
    } finally {
        setResetLoading(form, false);
    }
}

async function sendOtp(email) {
    const response = await fetch(`${RESET_API_BASE_URL}/api/users/send-otp`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            email,
            purpose: "reset-password"
        })
    });
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Cannot send OTP.");
    }

    return data;
}

function setupOtpInputs() {
    const inputs = Array.from(document.querySelectorAll("[data-otp-inputs] input"));

    inputs[0]?.focus();
    inputs.forEach((input, index) => {
        input.addEventListener("input", () => {
            input.value = input.value.replace(/\D/g, "").slice(0, 1);

            if (input.value && inputs[index + 1]) {
                inputs[index + 1].focus();
            }
        });

        input.addEventListener("keydown", (event) => {
            if (event.key === "Backspace" && !input.value && inputs[index - 1]) {
                inputs[index - 1].focus();
            }
        });

        input.addEventListener("paste", (event) => {
            event.preventDefault();
            const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, inputs.length);

            pasted.split("").forEach((digit, digitIndex) => {
                if (inputs[digitIndex]) {
                    inputs[digitIndex].value = digit;
                }
            });

            inputs[Math.min(pasted.length, inputs.length) - 1]?.focus();
        });
    });
}

function guardNewPasswordPage() {
    if (!sessionStorage.getItem(RESET_EMAIL_KEY) || !sessionStorage.getItem(RESET_TOKEN_KEY)) {
        window.location.href = "/forgot-password";
    }
}

function getOtpValue() {
    return Array.from(document.querySelectorAll("[data-otp-inputs] input"))
        .map((input) => input.value.trim())
        .join("");
}

function setResetLoading(form, loading) {
    const button = form.querySelector("button[type='submit']");

    if (!button) {
        return;
    }

    if (!button.dataset.defaultText) {
        button.dataset.defaultText = button.textContent;
    }

    button.disabled = loading;
    button.textContent = loading ? "Please wait..." : button.dataset.defaultText;
}

function showResetMessage(message, success) {
    const element = document.querySelector("[data-reset-message]");

    if (!element) {
        return;
    }

    element.textContent = message;
    element.classList.toggle("is-success", success);
    element.classList.toggle("is-error", !success);
}
