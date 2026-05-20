function handleSuggestion(suggestionId, action) {
        const btn = event.target;
        const card = document.getElementById('suggestion-' + suggestionId);
        const title = card ? card.querySelector('.suggestion-card__title').textContent : '';

        if (action === 'accept') {
            showConfirmModal('Принять предложение', 'Создать задачу «' + title + '» из предложения?', function () {
                doSuggestionAction(suggestionId, action, btn);
            }, 'Принять', 'success');
            return;
        }
        if (action === 'reject') {
            showConfirmModal('Отклонить предложение', 'Отклонить предложение «' + title + '»?', function () {
                doSuggestionAction(suggestionId, action, btn);
            }, 'Отклонить', 'danger');
            return;
        }
    }

    function doSuggestionAction(suggestionId, action, btn) {
        btn.disabled = true;
        const oldText = btn.textContent;
        btn.textContent = '...';

        const pageCfg = window.SUGGESTIONS_PAGE || {};
        fetch(pageCfg.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': pageCfg.csrfToken,
            },
            body: JSON.stringify({
                suggestion_id: suggestionId,
                action: action
            })
        })
        .then(r => r.json())
        .then(data => {
            if (data.ok) {
                const card = document.getElementById('suggestion-' + suggestionId);
                card.remove();
                showToast(data.message, 'success');
                // Обновляем счётчик в Прогрессе
                const remaining = document.querySelectorAll('.suggestion-card').length;
                const counterEls = document.querySelectorAll('[data-counter="suggestions_count"]');
                counterEls.forEach(function (el) { el.textContent = remaining; });
                if (remaining === 0) {
                    location.reload();
                }
            } else {
                btn.disabled = false;
                btn.textContent = oldText;
                showToast('Ошибка при обработке предложения', 'danger');
            }
        })
        .catch(() => {
            btn.disabled = false;
            btn.textContent = oldText;
            showToast('Ошибка соединения с сервером', 'danger');
        });
    }

    function showToast(message, type) {
        const area = document.getElementById('toast-area');
        if (!area) return;
        const icons = {
            success: '<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd"/>',
            danger: '<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>',
        };
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <svg class="toast__icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">${icons[type] || icons.success}</svg>
            <span class="toast__body">${message}</span>
            <button type="button" class="toast__close" aria-label="Закрыть">×</button>
        `;
        toast.querySelector('.toast__close').addEventListener('click', function () { window.dismissToast(toast); });
        area.appendChild(toast);
        setTimeout(function () { if (toast.isConnected) window.dismissToast(toast); }, 4200);
    }
