document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.querySelector('[data-bliss-form="contact"]');
    
    if (!contactForm) return;

    const messageEl = contactForm.querySelector('[data-form-message]');
    const submitBtn = contactForm.querySelector('.submit-button');
    const API_BASE_URL = window.SugarBlissApi ? window.SugarBlissApi.baseUrl : 'http://localhost:3000';
    const token = localStorage.getItem("sugarBlissToken");
    if (!token) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Login to Submit';
        showFormMessage('You must be <a href="/login" style="text-decoration: underline; color: inherit;">logged in</a> to send us a message.', 'error');
    }

    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 

        if (!localStorage.getItem("sugarBlissToken")) {
            showFormMessage('You must be logged in to send us a message.', 'error');
            return;
        }

        if (messageEl && token) {
            messageEl.textContent = '';
            messageEl.className = 'form-message';
            messageEl.style.display = 'none';
        }

        const formData = new FormData(contactForm);
        const payload = {
            name: formData.get('name')?.trim() || '',
            email: formData.get('email')?.trim() || '',
            message: formData.get('message')?.trim() || ''
        };

        if (!payload.name || !payload.email || !payload.message) {
            showFormMessage('Please fill in all required fields.', 'error');
            return;
        }

        const originalBtnText = submitBtn.textContent;
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/api/contact`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(result.message || 'Failed to send message. Please try again later.');
            }

            showFormMessage('Thank you! Your message has been sent successfully.', 'success');
            contactForm.reset(); 

        } catch (error) {
            console.error("Lỗi gửi form liên hệ:", error);
            showFormMessage(error.message, 'error');
        } finally {
            submitBtn.textContent = originalBtnText;
            submitBtn.disabled = false;
        }
    });

    function showFormMessage(text, type) {
        if (!messageEl) return;
        messageEl.innerHTML = text; 
        messageEl.className = `form-message is-${type}`;
        messageEl.style.display = 'block';
    }
});