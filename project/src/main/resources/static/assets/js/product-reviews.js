(function configureProductReviews() {
    'use strict';
    const productId = new URLSearchParams(window.location.search).get('id');
    const baseUrl = window.SugarBlissApi.baseUrl;
    const state = { 
        canReview: false, 
        reason: 'CHECKING', 
        busy: false, 
        rating: 0, 
        files: [], 
        photoError: false, 
        previews: [], 
        version: 0, 
        product: { reviews: [] } 
    };
    const $ = id => document.getElementById(id);
    const text = (key, fallback) => window.SugarI18n?.translate(key) || fallback;
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
    const token = () => localStorage.getItem('sugarBlissToken');

    function feedback(message = '', error = false) {
        const node = $('review-feedback');
        node.textContent = message;
        node.hidden = !message;
        node.classList.toggle('is-error', error);
    }

    function syncControls() {
        $('review-fields').disabled = !state.canReview || state.busy;
        $('btn-submit-review').disabled = !state.canReview || state.busy || state.photoError || !state.rating;
        $('review-clear-photos').hidden = !state.files.length && !state.photoError;
        $('btn-submit-review').textContent = state.busy ? text('detail.reviewSending', 'Sending...') : text('detail.submitReview', 'Submit Review');
        
        const messages = {
            CHECKING: text('detail.reviewChecking', 'Checking review eligibility...'),
            LOGIN_REQUIRED: text('detail.reviewLogin', 'Sign in to review this product.'),
            PURCHASE_REQUIRED: text('detail.reviewPurchaseRequired', 'Reviewing is available after a successful order for this product. Online payment must be confirmed.'),
            ALREADY_REVIEWED: text('detail.reviewAlreadyReviewed', 'You have already reviewed this product.'),
            ERROR: text('detail.reviewCheckError', 'Cannot check review eligibility. Please try again.'),
        };
        
        $('review-permission').textContent = messages[state.reason] || '';$('review-permission').hidden = state.canReview;
        $('review-permission-retry').hidden = state.reason !== 'ERROR';
        
        document.querySelectorAll('[data-delete-review]').forEach(button => { button.disabled = state.busy; });
        
        document.querySelectorAll('#write-stars button').forEach(button => {
            button.classList.toggle('active', Number(button.dataset.value) <= state.rating);
            button.setAttribute('aria-pressed', String(Number(button.dataset.value) === state.rating));
        });
    }

    async function checkEligibility() {
        if (state.busy) return;
        const version = ++state.version;
        state.canReview = false;
        state.reason = token() ? 'CHECKING' : 'LOGIN_REQUIRED';
        syncControls();
        if (!token() || !productId) return;
        try {
            const response = await fetch(`${baseUrl}/api/products/${encodeURIComponent(productId)}/reviews/eligibility`, {
                headers: { Authorization: `Bearer ${token()}` }, signal: AbortSignal.timeout(15000),
            });
            if (version !== state.version) return;
            if (response.status === 401) { state.reason = 'LOGIN_REQUIRED'; return; }
            if (!response.ok) throw new Error('Cannot check review eligibility.');
            const permission = await response.json();
            if (version !== state.version) return;
            state.canReview = permission.canReview === true;
            state.reason = state.canReview ? null : ['ALREADY_REVIEWED', 'PURCHASE_REQUIRED'].includes(permission.reason) ? permission.reason : 'ERROR';
        } catch (error) { 
            if (version === state.version) state.reason = 'ERROR'; 
        } finally { 
            if (version === state.version) syncControls(); 
        }
    }

    function releasePreviews() {
        state.previews.forEach(url => URL.revokeObjectURL(url));
        state.previews = [];
    }

    function renderPreviews() {
        releasePreviews();
        $('review-photo-previews').innerHTML = state.files.map((file, index) => {
            const url = URL.createObjectURL(file);
            state.previews.push(url);
            return `<div class="review-photo-preview"><img src="${escape(url)}" alt="${escape(file.name)}"><button type="button" data-remove-review-photo="${index}" aria-label="${escape(text('detail.reviewRemovePhoto', 'Remove photo'))}: ${escape(file.name)}" title="${escape(text('detail.reviewRemovePhoto', 'Remove photo'))}">&times;</button></div>`;
        }).join('');
    }

    function validFiles(files) {
        return files.length <= 5 && files.every(file => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= 5 * 1024 * 1024);
    }

    function choosePhotos() {
        if (!state.canReview || state.busy) return;
        const files = Array.from($('review-photos').files || []);$('review-photos').value = '';
        if (!validFiles(files)) {
            state.photoError = true;
            feedback(text('detail.reviewPhotoError', 'Choose up to 5 JPG, PNG or WebP photos, each no larger than 5 MB.'), true);
            syncControls();
            return;
        }
        state.files = files;
        state.photoError = false;
        feedback();
        renderPreviews();
        syncControls();
    }

    async function refreshReviews() {
        const response = await fetch(`${baseUrl}/api/products/${encodeURIComponent(productId)}`, {
            headers: { Authorization: `Bearer ${token()}` }, signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(text('detail.reviewRefreshError', 'Review saved, but the list could not be refreshed. Reload the page.'));
        render(await response.json());
    }

    async function submit() {
        if (!state.canReview || state.busy || state.photoError || !token()) return;
        const comment = $('review-comment').value.trim();
        if (!state.rating || !comment || comment.length > 1000) {
            feedback(text('detail.reviewInputError', 'Select a rating and write a review of 1 to 1000 characters.'), true);
            return;
        }
        if (!validFiles(state.files)) { 
            feedback(text('detail.reviewPhotoError', 'Invalid review photos.'), true); 
            return; 
        }
        const body = new FormData();
        body.append('rating', String(state.rating));
        body.append('comment', comment);
        state.files.forEach(file => body.append('images', file, file.name));
        state.busy = true;
        ++state.version;
        syncControls();
        feedback();
        try {
            const response = await fetch(`${baseUrl}/api/products/${encodeURIComponent(productId)}/reviews`, {
                method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body, signal: AbortSignal.timeout(60000),
            });
            const data = await response.json();
            if (!response.ok) {
                if (response.status === 401 || ['REVIEW_ALREADY_REVIEWED', 'REVIEW_PURCHASE_REQUIRED'].includes(data.code)) {
                    state.canReview = false;
                    state.reason = response.status === 401 ? 'LOGIN_REQUIRED' : data.code === 'REVIEW_ALREADY_REVIEWED' ? 'ALREADY_REVIEWED' : 'PURCHASE_REQUIRED';
                }
                throw new Error(data.message || text('detail.reviewSubmitError', 'Cannot submit review.'));
            }
            state.canReview = false;
            state.reason = 'ALREADY_REVIEWED';
            state.rating = 0;
            state.files = [];
            state.photoError = false;
            $('review-comment').value = '';$('review-photos').value = '';
            if ($('review-char-count'))$('review-char-count').textContent = '0';
            renderPreviews();
            await refreshReviews();
            feedback(text('detail.reviewThanks', 'Thank you for your review.'));
        } catch (error) { 
            feedback(error.message, true); 
        } finally { 
            state.busy = false; 
            syncControls(); 
        }
    }

    async function deleteReview(id) {
        if (state.busy || !token() || !/^[a-f\d]{24}$/i.test(id) || !window.confirm(text('detail.reviewDeleteConfirm', 'Delete this review?'))) return;
        state.busy = true;
        ++state.version;
        syncControls();
        try {
            const response = await fetch(`${baseUrl}/api/products/${encodeURIComponent(productId)}/reviews/${id}`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${token()}` }, signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) throw new Error((await response.json()).message || 'Cannot delete review.');
            await refreshReviews();
            feedback(text('detail.reviewDeleted', 'Review deleted.'));
        } catch (error) { 
            feedback(error.message, true); 
        } finally { 
            state.busy = false; 
            await checkEligibility(); 
        }
    }

    function renderBreakdown(reviews) {
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const total = reviews.length;
        
        reviews.forEach(r => {
            const rating = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0)));
            counts[rating] = (counts[rating] || 0) + 1;
        });

        for (let star = 1; star <= 5; star++) {
            const row = document.querySelector(`.breakdown-row[data-star="${star}"]`);
            if (row) {
                const count = counts[star] || 0;
                const percent = total > 0 ? (count / total) * 100 : 0;
                const fill = row.querySelector('.bar-fill');
                const label = row.querySelector('.count-label');
                if (fill) fill.style.width = `${percent}%`;
                if (label) label.textContent = String(count);
            }
        }
    }

    function render(product) {
        state.product = product;
        const reviews = Array.isArray(product.reviews) ? product.reviews : [];
        const serverAverage = Number(product.ratingAverage);
        const average = !reviews.length ? 0 : Number.isFinite(serverAverage) && serverAverage > 0 && serverAverage <= 5
            ? serverAverage : reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length;
            
        $('summary-score').textContent = average.toFixed(1);
        
        const roundedAvg = Math.round(average);
        const starsOverview = $('summary-stars-overview');
        if (starsOverview) {
            starsOverview.textContent = '★'.repeat(roundedAvg) + '☆'.repeat(5 - roundedAvg);
        }

        $('summary-count').textContent = text(reviews.length === 1 ? 'detail.reviewCountOne' : 'detail.reviewCount',
            reviews.length === 1 ? 'Based on {count} review' : 'Based on {count} reviews').replace('{count}', String(reviews.length));
            
        renderBreakdown(reviews);

        let user = {};
        try { user = JSON.parse(localStorage.getItem('sugarBlissUser') || '{}') || {}; } catch (error) { /* Ignore invalid profile */ }
        
        $('product-reviews-list').innerHTML = reviews.map(review => {
            const name = review.user?.name || review.name || 'Customer';
            const id = String(review._id || review.id || '');
            const own = String(review.user?._id || review.user) === String(user._id || user.id);
            const rating = Math.max(0, Math.min(5, Math.round(Number(review.rating) || 0)));
            const images = (Array.isArray(review.images) ? review.images : []).filter(image => /^\/uploads\/reviews\/[a-f\d-]{36}\.(jpg|png|webp)$/.test(image)).slice(0, 5);
            
            return `<article class="review-card">
                <div class="review-header">
                    <div class="review-user">
                        <div class="review-avatar">${escape(name.charAt(0).toUpperCase())}</div>
                        <div class="review-user-info">
                            <div class="review-name">${escape(name)}</div>
                            <span class="review-verified-tag">✓ Verified Buyer</span>
                        </div>
                    </div>
                    <div class="review-meta">
                        <div class="review-stars" aria-label="${rating}/5">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</div>
                        ${own && /^[a-f\d]{24}$/i.test(id) ? `<button class="btn-delete-review" type="button" data-delete-review="${escape(id)}">${escape(text('detail.reviewDelete', 'Delete'))}</button>` : ''}
                    </div>
                </div>
                <p class="review-text">${escape(review.comment)}</p>
                ${images.length ? `<div class="review-photo-gallery">${images.map(image => `<a href="${escape(baseUrl + image)}" data-modal-img="${escape(baseUrl + image)}"><img src="${escape(baseUrl + image)}" alt="${escape(text('detail.reviewPhoto', 'Customer review photo'))}" loading="lazy"></a>`).join('')}</div>` : ''}
            </article>`;
        }).join('') || `<p class="reviews-empty">${escape(text('detail.reviewEmpty', 'No reviews yet for this product.'))}</p>`;
        
        syncControls();
    }

    function initModal() {
        const modal = $('review-image-modal');
        const modalImg = $('review-modal-img');
        const closeBtn = $('review-modal-close');
        
        if (!modal) return;
        
        document.addEventListener('click', event => {
            const targetAnchor = event.target.closest('[data-modal-img]');
            if (targetAnchor) {
                event.preventDefault();
                modalImg.src = targetAnchor.dataset.modalImg;
                modal.hidden = false;
            }
        });

        if (closeBtn) {
            closeBtn.addEventListener('click', () => { modal.hidden = true; });
        }
        
        modal.addEventListener('click', event => {
            if (event.target === modal) modal.hidden = true;
        });
    }

    function init() {
        $('btn-submit-review').addEventListener('click', submit);
        $('review-permission-retry').addEventListener('click', checkEligibility);$('review-photos').addEventListener('change', choosePhotos);
        
        const reviewComment = $('review-comment');
        if (reviewComment) {
            reviewComment.addEventListener('input', () => {
                const charCounter = $('review-char-count');
                if (charCounter) charCounter.textContent = String(reviewComment.value.length);
            });
        }

        $('review-clear-photos').addEventListener('click', () => {
            if (!state.canReview || state.busy) return;
            state.files = [];
            state.photoError = false;
            $('review-photos').value = '';
            feedback();
            renderPreviews();
            syncControls();
        });

        // Hover effect trên sao chọn đánh giá
        const writeStars = $('write-stars');
        if (writeStars) {
            writeStars.addEventListener('mouseover', event => {
                const button = event.target.closest('[data-value]');
                if (!button || !state.canReview || state.busy) return;
                const val = Number(button.dataset.value);
                writeStars.querySelectorAll('button').forEach(btn => {
                    btn.classList.toggle('hover-active', Number(btn.dataset.value) <= val);
                });
            });

            writeStars.addEventListener('mouseout', () => {
                writeStars.querySelectorAll('button').forEach(btn => btn.classList.remove('hover-active'));
            });

            writeStars.addEventListener('click', event => {
                const button = event.target.closest('[data-value]');
                if (!button || !state.canReview || state.busy) return;
                state.rating = Number(button.dataset.value);
                syncControls();
            });
        }

        $('review-photo-previews').addEventListener('click', event => {
            const button = event.target.closest('[data-remove-review-photo]');
            if (!button || !state.canReview || state.busy) return;
            state.files.splice(Number(button.dataset.removeReviewPhoto), 1);
            state.photoError = false;
            feedback();
            renderPreviews();
            syncControls();
        });

        $('product-reviews-list').addEventListener('click', event => {
            const button = event.target.closest('[data-delete-review]');
            if (button && !button.disabled) deleteReview(button.dataset.deleteReview);
        });

        window.addEventListener('sugarbliss:lang-changed', () => { render(state.product); });
        window.addEventListener('pageshow', event => { if (event.persisted) { renderPreviews(); checkEligibility(); } });
        window.addEventListener('pagehide', releasePreviews);
        
        initModal();
        checkEligibility();
    }

    window.SugarBlissReviews = { init, render };
}());