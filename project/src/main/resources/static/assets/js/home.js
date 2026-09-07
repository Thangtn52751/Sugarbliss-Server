const feedbackItems = [
    {
        quote: "The cake was beautiful, fluffy, and perfectly sweet. It made our birthday table feel extra special.",
        name: "Georgia Grimes"
    },
    {
        quote: "Sugar Bliss handled our custom order with so much care. The colors matched our theme and every guest loved it.",
        name: "Amelia Parker"
    },
    {
        quote: "The pastries tasted fresh and looked adorable. Ordering was easy, and everything arrived right on time.",
        name: "Sophie Bennett"
    }
];

const feedbackQuote = document.querySelector("[data-feedback-quote]");
const feedbackName = document.querySelector("[data-feedback-name]");
const previousButton = document.querySelector("[data-feedback-prev]");
const nextButton = document.querySelector("[data-feedback-next]");
const dotButtons = document.querySelectorAll("[data-feedback-dot]");

let activeFeedbackIndex = 0;

function showFeedback(index) {
    activeFeedbackIndex = (index + feedbackItems.length) % feedbackItems.length;
    const feedback = feedbackItems[activeFeedbackIndex];

    feedbackQuote.textContent = feedback.quote;
    feedbackName.textContent = feedback.name;

    dotButtons.forEach((button, buttonIndex) => {
        button.classList.toggle("active", buttonIndex === activeFeedbackIndex);
    });
}

if (feedbackQuote && feedbackName && previousButton && nextButton) {
    previousButton.addEventListener("click", () => {
        showFeedback(activeFeedbackIndex - 1);
    });

    nextButton.addEventListener("click", () => {
        showFeedback(activeFeedbackIndex + 1);
    });

    dotButtons.forEach((button) => {
        button.addEventListener("click", () => {
            showFeedback(Number(button.dataset.feedbackDot));
        });
    });
}
