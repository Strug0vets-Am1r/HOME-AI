function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    function updateSidebarCounters(counters) {
        if (!counters) return;
        const map = {
            'suggestions_count': 'suggestions_count',
            'active_count': 'active_count',
            'planned_count': 'planned_count',
            'favorites_count': 'favorites_count',
            'urgent_count': 'urgent_count',
            'overdue_count': 'overdue_count',
            'completed_count': 'completed_count',
        };
        Object.keys(map).forEach(key => {
            const els = document.querySelectorAll(`[data-counter="${key}"]`);
            els.forEach(el => { el.textContent = counters[key] ?? el.textContent; });
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        // Toast notification function
        function showToast(message, type = 'success') {
            const toastArea = document.getElementById('toast-area');
            if (!toastArea) return;

            const icons = {
                success: '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>',
                danger: '<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>',
                warning: '<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>',
                info: '<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>'
            };

            const toast = document.createElement('div');
            toast.className = `toast toast--${type}`;
            toast.role = 'alert';
            toast.innerHTML = `
                <svg class="toast__icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    ${icons[type] || icons.info}
                </svg>
                <span class="toast__body">${message}</span>
                <button type="button" class="toast__close" aria-label="Закрыть">
                    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                    </svg>
                </button>
            `;

            toastArea.appendChild(toast);

            const closeBtn = toast.querySelector('.toast__close');
            if (closeBtn) {
                closeBtn.addEventListener('click', function () { window.dismissToast(toast); });
            }

            setTimeout(function () {
                if (toast.isConnected) { window.dismissToast(toast); }
            }, 5000);
        }

        // Parse task data
        const tasksDataEl = document.getElementById('tasks-data');
        let tasksData = tasksDataEl ? JSON.parse(tasksDataEl.textContent) : { now: new Date().toISOString(), tasks: [], completed_tasks: [] };
        let now = new Date(tasksData.now);

        // Check if we need to open a modal after reload
        const taskIdToOpen = sessionStorage.getItem('openTaskModal');
        if (taskIdToOpen) {
            sessionStorage.removeItem('openTaskModal');
        }

        function openTaskModal(modal) {
            if (!modal) return;
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }

        function closeTaskModal(modal) {
            if (!modal) return;
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            sessionStorage.removeItem('openedTaskId');
        }

        function onToggleSubtask(data, checkboxEl) {
            if (data.status !== 'success') return;
            var row = document.querySelector('[data-subtask-row][data-subtask-id="' + checkboxEl.dataset.subtaskId + '"]');
            if (row) {
                row.classList.toggle('is-completed', data.is_completed);
                var badge = row.querySelector('[data-subtask-badge]');
                if (badge) {
                    badge.className = data.is_completed ? 'badge badge--success' : 'badge badge--muted';
                    badge.textContent = data.is_completed ? 'Выполнено' : 'Не выполнено';
                }
                var text = row.querySelector('[data-subtask-text]');
                if (text) {
                    text.style.textDecoration = data.is_completed ? 'line-through' : 'none';
                    text.style.opacity = data.is_completed ? '0.72' : '1';
                }
            }
            var ptId = parseInt(checkboxEl.dataset.parentTaskId);
            var taskItem = tasksData.tasks.find(function (t) { return t.id === ptId; });
            if (!taskItem) taskItem = tasksData.completed_tasks.find(function (t) { return t.id === ptId; });
            if (taskItem) taskItem.pending_subtask_count = data.pending_count;
            var currentView = sessionStorage.getItem('selectedTaskView');
            if (currentView && currentView !== 'tiles') showFilteredView(currentView);
            fetch('/api/tasks-data/')
                .then(function (r) { return r.json(); })
                .then(function (d) { if (d.status === 'success') updateSidebarCounters(d.counters); })
                .catch(function () {});
        }

        function openTaskModalWithData(task) {
            const container = document.getElementById('task-modals-container');
            const modalId = `task-modal-${task.id}`;
            let modal = document.getElementById(modalId);

            if (!modal) {
                const listLabels = { active: 'Активная задача', planned: 'В планах', urgent: 'Срочная задача', favorites: 'Избранная задача', overdue: 'Просроченная задача', completed: 'Выполненная задача' };
                const listColors = { active: 'var(--success)', planned: 'var(--primary)', urgent: '#d946ef', favorites: 'var(--warning)', overdue: 'var(--danger)', completed: 'var(--text-secondary)' };
                const taskTypeLabel = task.is_completed
                    ? 'Выполненная задача'
                    : (listLabels[task.task_list] || 'Активная задача');
                const labelColor = task.is_completed
                    ? 'var(--text-secondary)'
                    : (listColors[task.task_list] || 'var(--primary)');
                const favoriteFlag = task.is_favorite
                    ? `<svg style="width:16px;height:16px;flex-shrink:0;" fill="none" stroke="var(--warning)" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`
                    : '';

                const descriptionContent = task.description
                    ? `<div style="max-height:200px;overflow-y:auto;"><p class="task-modal__description" style="margin:0;">${escHtml(task.description)}</p></div>`
                    : '';

                const subtasksContent = task.subtasks && task.subtasks.length > 0
                    ? `<div class="subtasks">
                        ${task.subtasks.map(subtask => `
                            <div class="subtask subtask--checkable ${subtask.is_completed ? 'is-completed' : ''}" data-subtask-row data-subtask-id="${subtask.id}" data-parent-task-id="${task.id}">
                                <div class="subtask__left">
                                    <input type="checkbox" class="subtask-checkbox" data-subtask-id="${subtask.id}" data-parent-task-id="${task.id}" ${subtask.is_completed ? 'checked' : ''}>
                                    <span class="subtask__text" data-subtask-text>${subtask.title}</span>
                                </div>
                                <span class="badge ${subtask.is_completed ? 'badge--success' : 'badge--muted'}" data-subtask-badge>
                                    ${subtask.is_completed ? 'Выполнено' : 'Не выполнено'}
                                </span>
                            </div>
                        `).join('')}
                      </div>`
                    : '<p class="muted" style="margin: 0;">У этой задачи пока нет подзадач.</p>';

                const subtasksScrolled = `<div style="max-height:200px;overflow-y:auto;">${subtasksContent}</div>`;

                const completeButton = task.is_completed
                    ? `<button type="button" class="button button--success button--small js-complete-task-modal" data-task-id="${task.id}">Восстановить</button>`
                    : `<button type="button" class="button button--success button--small js-complete-task-modal" data-task-id="${task.id}">Завершить задачу</button>`;

                const modalHtml = `
                    <div class="modal-backdrop task-modal" id="${modalId}" aria-hidden="true">
                        <div class="modal-dialog modal-dialog--task panel panel--glass" role="dialog" aria-modal="true" aria-labelledby="task-modal-title-${task.id}">
                            <div class="panel__body task-modal__body">
                                <div class="task-modal__header">
                                    <div class="task-modal__header-main">
                                        <div style="display:flex;align-items:center;gap:6px;width:fit-content;">
                                            <span class="badge" style="background:color-mix(in srgb, ${labelColor} 20%, transparent);color:${labelColor};border:1px solid ${labelColor};">
                                                ${taskTypeLabel}
                                            </span>
                                            ${favoriteFlag}
                                        </div>
                                        <h3 id="task-modal-title-${task.id}" class="task-modal__title">
                                            ${task.title}
                                        </h3>
                                        <p class="task-modal__time">
                                            ${task.due_date_display}
                                        </p>
                                    </div>
                                    <button type="button" class="modal-close-button js-close-task-modal" aria-label="Закрыть окно">×</button>
                                </div>
                                <div class="task-modal__content">
                                    <div class="task-modal__block">
                                        <div class="task-modal__label">Описание</div>
                                        ${descriptionContent || '<p class="muted" style="margin: 0;">Нет описания</p>'}
                                    </div>
                                    <div class="task-modal__block">
                                        <div class="task-modal__label">Подзадачи</div>
                                        ${subtasksScrolled}
                                    </div>
                                    <div class="task-modal__actions">
                                        ${completeButton}
                                        <a href="/task/${task.id}/edit/" class="button button--primary button--small">Редактировать</a>
                                        <button type="button" class="button button--primary button--small js-generate-subtasks" data-task-id="${task.id}" data-task-title="${task.title.replace(/"/g, '&quot;')}">Сгенерировать подзадачи</button>
                                        <button type="button" class="button button--danger button--small js-delete-task-modal" data-task-id="${task.id}">Удалить</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                container.insertAdjacentHTML('beforeend', modalHtml);
                modal = document.getElementById(modalId);

                modal.querySelector('.js-close-task-modal').addEventListener('click', function () {
                    closeTaskModal(modal);
                });

                modal.addEventListener('click', function (event) {
                    if (event.target === modal) {
                        closeTaskModal(modal);
                    }
                });

                // Attach subtask checkbox listeners
                modal.querySelectorAll('.subtask-checkbox').forEach(function (checkbox) {
                    checkbox.addEventListener('click', function (event) {
                        event.stopPropagation();
                    });

                    checkbox.addEventListener('change', function () {
                        fetch(`/subtask/${this.dataset.subtaskId}/toggle/`, {
                            method: 'POST',
                            headers: { 'X-CSRFToken': getCookie('csrftoken') }
                        })
                        .then(response => response.json())
                        .then(data => onToggleSubtask(data, this));
                    });
                });

                // Attach generate subtasks handler
                const generateBtn = modal.querySelector('.js-generate-subtasks');
                if (generateBtn) {
                    generateBtn.addEventListener('click', function (event) {
                        event.preventDefault();
                        event.stopPropagation();

                        const taskId = this.dataset.taskId;
                        const taskTitle = this.dataset.taskTitle;
                        const oldText = this.textContent;

                        this.disabled = true;
                        this.textContent = 'Генерация...';

                        fetch((window.HOME_PAGE_CONFIG || {}).generateSubtasksUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-CSRFToken': getCookie('csrftoken')
                            },
                            body: JSON.stringify({
                                task_id: taskId,
                                task_title: taskTitle
                            })
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.status === 'pending') {
                                // Polling статуса задачи
                                const celeryTaskId = data.task_id;
                                const pollInterval = setInterval(() => {
                                    fetch(`/api/subtasks/status/${celeryTaskId}/`)
                                        .then(r => r.json())
                                        .then(statusData => {
                                            if (statusData.status === 'success') {
                                                clearInterval(pollInterval);
                                                showToast('Подзадачи успешно сгенерированы!', 'success');
                                                this.disabled = false;
                                                this.textContent = oldText;
                                                return fetch(`/api/tasks/${taskId}/subtasks/`);
                                            } else if (statusData.status === 'error') {
                                                clearInterval(pollInterval);
                                                showToast('Ошибка генерации: ' + statusData.message, 'danger');
                                                this.disabled = false;
                                                this.textContent = oldText;
                                            }
                                        })
                                        .catch(err => {
                                            clearInterval(pollInterval);
                                            showToast('Ошибка опроса статуса', 'danger');
                                            this.disabled = false;
                                            this.textContent = oldText;
                                        });
                                }, 1000);
                            } else if (data.status === 'success') {
                                // Синхронный ответ (для случая без task_id)
                                showToast('Подзадачи успешно сгенерированы!', 'success');
                                this.disabled = false;
                                this.textContent = oldText;
                                return fetch(`/api/tasks/${taskId}/subtasks/`);
                            } else {
                                throw new Error(data.message || 'Ошибка генерации подзадач.');
                            }
                        })
                        .then(response => response.json())
                        .then(subtasksData => {
                            // Update task data with new subtasks
                            const taskIndex = tasksData.tasks.findIndex(t => t.id === parseInt(taskId));
                            if (taskIndex >= 0) {
                                tasksData.tasks[taskIndex].subtasks = subtasksData.subtasks;
                                // Update pending subtask count
                                const pendingCount = subtasksData.subtasks.filter(s => !s.is_completed).length;
                                tasksData.tasks[taskIndex].pending_subtask_count = pendingCount;

                                // Update task item in the list if it's visible
                                const taskItemInList = document.querySelector(`.js-task-open[data-modal-target="task-modal-${taskId}"]`);
                                if (taskItemInList) {
                                    const task = tasksData.tasks[taskIndex];
                                    const badgeHtml = pendingCount > 0
                                        ? `<span class="badge badge--muted">Подзадач: ${pendingCount}</span>`
                                        : `<span class="badge badge--success">Готово к выполнению</span>`;
                                    const bottomSection = taskItemInList.querySelector('.task-item__bottom');
                                    if (bottomSection) {
                                        bottomSection.innerHTML = badgeHtml + '<span>Нажми, чтобы открыть</span>';
                                    }
                                }
                            }

                            // Update subtasks content in the modal without closing it
                            const contentBlock = modal.querySelector('.task-modal__content');
                            const blocks = contentBlock ? contentBlock.querySelectorAll('.task-modal__block') : [];
                            const subtasksBlock = blocks.length > 1 ? blocks[1] : null;

                            if (subtasksBlock) {
                                const subtasksContent = subtasksData.subtasks && subtasksData.subtasks.length > 0
                                    ? `<div class="subtasks">
                                        ${subtasksData.subtasks.map(subtask => `
                                            <div class="subtask subtask--checkable ${subtask.is_completed ? 'is-completed' : ''}" data-subtask-row data-subtask-id="${subtask.id}" data-parent-task-id="${taskId}">
                                                <div class="subtask__left">
                                                    <input type="checkbox" class="subtask-checkbox" data-subtask-id="${subtask.id}" data-parent-task-id="${taskId}" ${subtask.is_completed ? 'checked' : ''}>
                                                    <span class="subtask__text" data-subtask-text>${subtask.title}</span>
                                                </div>
                                                <span class="badge ${subtask.is_completed ? 'badge--success' : 'badge--muted'}" data-subtask-badge>
                                                    ${subtask.is_completed ? 'Выполнено' : 'Не выполнено'}
                                                </span>
                                            </div>
                                        `).join('')}
                                      </div>`
                                    : '<p class="muted" style="margin: 0;">У этой задачи пока нет подзадач.</p>';

                                subtasksBlock.innerHTML = `<div class="task-modal__label">Подзадачи</div><div style="max-height:200px;overflow-y:auto;">${subtasksContent}</div>`;

                                // Re-attach checkbox listeners for new subtasks
                                subtasksBlock.querySelectorAll('.subtask-checkbox').forEach(function (checkbox) {
                                    checkbox.addEventListener('click', function (event) {
                                        event.stopPropagation();
                                    });

                                    checkbox.addEventListener('change', function () {
                                        fetch(`/subtask/${this.dataset.subtaskId}/toggle/`, {
                                            method: 'POST',
                                            headers: {
                                                'X-CSRFToken': getCookie('csrftoken')
                                            }
                                        })
                                        .then(response => response.json())
                                        .then(data => onToggleSubtask(data, this));
                                    });
                                });
                            }
                        })
                        .catch((error) => {
                            showToast('Ошибка при генерации подзадач.', 'danger');
                        })
                        .finally(() => {
                            this.disabled = false;
                            this.textContent = oldText;
                        });
                    });
                }
            }

            // Attach complete task handler (outside if block so it works for existing modals too)
            const completeBtn = modal.querySelector('.js-complete-task-modal');
            if (completeBtn) {
                completeBtn.addEventListener('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();

                    const taskId = parseInt(this.dataset.taskId);
                    const wasCompleted = task.is_completed;

                    closeTaskModal(modal);

                    const endpoint = wasCompleted ? 'restore' : 'complete';
                    fetch(`/task/${taskId}/${endpoint}/`, {
                        method: 'POST',
                        headers: { 
                            'X-Requested-With': 'XMLHttpRequest',
                            'X-CSRFToken': getCookie('csrftoken') 
                        }
                    })
                    .then(response => response.json())
                    .then(function (data) {
                        if (data.status === 'success') {
                            showToast(data.message, 'success');
                        }
                        // Update local data
                        var allTasks = tasksData.tasks.concat(tasksData.completed_tasks);
                        var t = allTasks.find(function (t) { return t.id === taskId; });
                        if (t) {
                            t.is_completed = !t.is_completed;
                            tasksData.tasks = allTasks.filter(function (t) { return !t.is_completed; });
                            tasksData.completed_tasks = allTasks.filter(function (t) { return t.is_completed; });
                        }
                        var currentView = sessionStorage.getItem('selectedTaskView');
                        if (currentView && currentView !== 'tiles') {
                            showFilteredView(currentView);
                        }
                        fetch('/api/tasks-data/')
                            .then(function (r) { return r.json(); })
                            .then(function (d) { if (d.status === 'success') updateSidebarCounters(d.counters); })
                            .catch(function () {});
                    })
                    .catch(function () {});
                });
            }

            const deleteBtn = modal.querySelector('.js-delete-task-modal');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    showConfirmModal(
                        'Удаление задачи',
                        `Вы уверены, что хотите удалить задачу «${task.title}»? Это действие необратимо.`,
                        function () {
                            fetch(`/task/${task.id}/delete/`, {
                                method: 'POST',
                                headers: { 'X-CSRFToken': getCookie('csrftoken') }
                            })
                            .then(() => {
                                closeTaskModal(modal);
                                tasksData.tasks = tasksData.tasks.filter(t => t.id !== task.id);
                                tasksData.completed_tasks = tasksData.completed_tasks.filter(t => t.id !== task.id);
                                const currentView = sessionStorage.getItem('selectedTaskView');
                                if (currentView && currentView !== 'tiles') {
                                    showFilteredView(currentView);
                                } else {
                                    const tilesView = document.getElementById('task-tiles-view');
                                    const listView = document.getElementById('task-list-view');
                                    if (tilesView) tilesView.style.display = 'grid';
                                    if (listView) listView.style.display = 'none';
                                }
                                showToast(`Задача «${task.title}» удалена!`, 'success');
                                fetch('/api/tasks-data/')
                                    .then(function (r) { return r.json(); })
                                    .then(function (data) { updateSidebarCounters(data.counters); })
                                    .catch(function () {});
                            })
                            .catch(err => {
                                showToast('Ошибка при удалении задачи.', 'danger');
                            });
                        }
                    );
                });
            }

            // Save opened task ID for restoration on page reload
            sessionStorage.setItem('openedTaskId', task.id.toString());
            openTaskModal(modal);
        }

        function getTaskDayOnly(dateStr) {
            const d = new Date(dateStr);
            return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        }

        const nowDate = new Date(now);
        const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());

        function getTasksForView(viewType) {
            const allTasks = [...tasksData.tasks, ...tasksData.completed_tasks];

            switch (viewType) {
                case 'active':
                    return allTasks.filter(t => {
                        if (t.is_completed || t.task_list !== 'active') return false;
                        const dueDay = getTaskDayOnly(t.due_date);
                        return dueDay >= today;
                    });

                case 'planned':
                    return allTasks.filter(t => {
                        if (t.is_completed || t.task_list !== 'planned') return false;
                        const dueDay = getTaskDayOnly(t.due_date);
                        return dueDay >= today;
                    });

                case 'favorites':
                    return allTasks.filter(t => !t.is_completed && t.is_favorite);

                case 'urgent':
                    return allTasks.filter(t => {
                        if (t.is_completed || t.task_list !== 'urgent') return false;
                        const dueDay = getTaskDayOnly(t.due_date);
                        return dueDay >= today;
                    });

                case 'completed':
                    return allTasks.filter(t => t.is_completed);

                case 'overdue':
                    return allTasks.filter(t => {
                        if (t.is_completed) return false;
                        const dueDay = getTaskDayOnly(t.due_date);
                        return dueDay < today;
                    });

                default:
                    return [];
            }
        }

        function renderTaskItem(task) {
            const badgeHtml = task.pending_subtask_count > 0
                ? `<span class="badge badge--muted">Подзадач: ${task.pending_subtask_count}</span>`
                : `<span class="badge badge--success">Готово к выполнению</span>`;

            const titleClass = task.is_completed ? 'task-item--completed' : '';

            const favoriteFlag = task.is_favorite ? `<svg style="width: 18px; height: 18px; flex-shrink: 0;" fill="none" stroke="var(--warning)" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>` : '';

            const html = `
                <article class="task-item ${titleClass} js-task-open" data-modal-target="task-modal-${task.id}" tabindex="0">
                    <div class="task-item__top">
                        <div class="task-item__title-wrap">
                            <h3 class="task-item__title">${task.is_completed ? '<s>' : ''}${task.title}${task.is_completed ? '</s>' : ''}</h3>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            ${favoriteFlag}
                            <time class="task-item__time">${task.due_date_display}</time>
                        </div>
                    </div>
                    <div class="task-item__bottom">
                        ${badgeHtml}
                        <span>Нажми, чтобы открыть</span>
                    </div>
                </article>
            `;
            return html;
        }

        function showTiles() {
            const tilesView = document.getElementById('task-tiles-view');
            const listView = document.getElementById('task-list-view');
            const topbarTitle = document.getElementById('topbar-title');
            const closeBtn = document.getElementById('topbar-close-btn');

            if (tilesView) tilesView.style.display = 'grid';
            if (listView) listView.style.display = 'none';
            if (topbarTitle) topbarTitle.textContent = 'Задачи';
            if (closeBtn) closeBtn.style.display = 'none';
            window.scrollTo(0, 0);
        }

        function showFilteredView(viewType) {
            const tilesView = document.getElementById('task-tiles-view');
            const listView = document.getElementById('task-list-view');
            const filteredTasks = document.getElementById('filtered-tasks');
            const viewTitle = document.getElementById('view-title');
            const topbarTitle = document.getElementById('topbar-title');
            const closeBtn = document.getElementById('topbar-close-btn');
            const clearBtn = document.getElementById('clear-completed-btn');

            const viewLabels = {
                'active': 'Активные',
                'planned': 'В планах',
                'favorites': 'Избранные',
                'urgent': 'Срочные',
                'completed': 'Выполненные',
                'overdue': 'Просроченные'
            };

            const tasks = getTasksForView(viewType);

            if (tilesView) tilesView.style.display = 'none';
            if (listView) listView.style.display = 'block';

            const label = viewLabels[viewType] || 'Задачи';
            viewTitle.textContent = label;
            if (topbarTitle) topbarTitle.textContent = 'Задачи (' + label + ')';
            if (closeBtn) closeBtn.style.display = 'flex';
            if (clearBtn) clearBtn.style.display = viewType === 'completed' ? 'inline-flex' : 'none';

            if (tasks.length === 0) {
                filteredTasks.innerHTML = `
                    <div class="empty-state">
                        <svg class="empty-state__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0Z"/></svg>
                        <h3 class="empty-state__title">Нет задач</h3>
                        <p class="empty-state__text">В этом списке пока нет задач</p>
                    </div>
                `;
            } else {
                filteredTasks.innerHTML = `<div class="task-list">${tasks.map(renderTaskItem).join('')}</div>`;

                // Re-attach event listeners for newly rendered tasks
                filteredTasks.querySelectorAll('.js-task-open').forEach(function (card) {
                    card.addEventListener('click', function () {
                        const taskId = this.dataset.modalTarget.split('-').pop();
                        const task = [...tasksData.tasks, ...tasksData.completed_tasks].find(t => t.id === parseInt(taskId));
                        if (task) {
                            openTaskModalWithData(task);
                        }
                    });
                });
            }

            window.scrollTo(0, 0);
        }

        // Tile click handlers
        document.querySelectorAll('.task-tile').forEach(function (tile) {
            tile.addEventListener('click', function () {
                const viewType = this.dataset.view;
                sessionStorage.setItem('selectedTaskView', viewType);
                showFilteredView(viewType);
            });
        });

        // Restore previous view and modal on page load (synchronously, no setTimeout to avoid flashing)
        const reloadFromSubtaskGen = sessionStorage.getItem('reloadFromSubtaskGen');
        const viewToShow = sessionStorage.getItem('selectedTaskView');
        const openedTaskId = sessionStorage.getItem('openedTaskId');

        if (reloadFromSubtaskGen) {
            // After subtask generation - always restore the view
            sessionStorage.removeItem('reloadFromSubtaskGen');
            if (viewToShow) {
                showFilteredView(viewToShow);

                // If there was an open modal, restore it
                if (openedTaskId) {
                    const task = [...tasksData.tasks, ...tasksData.completed_tasks].find(t => t.id === parseInt(openedTaskId));
                    if (task) {
                        openTaskModalWithData(task);
                    }
                }
            }
        } else if (taskIdToOpen) {
            // Open modal if specified (legacy, shouldn't happen)
            const task = [...tasksData.tasks, ...tasksData.completed_tasks].find(t => t.id === parseInt(taskIdToOpen));
            if (task) {
                openTaskModalWithData(task);
            }
        } else if (openedTaskId) {
            // Restore opened task modal on page reload
            if (viewToShow) {
                showFilteredView(viewToShow);

                // Open the modal
                const task = [...tasksData.tasks, ...tasksData.completed_tasks].find(t => t.id === parseInt(openedTaskId));
                if (task) {
                    openTaskModalWithData(task);
                }
            } else {
                // If no view saved, open the modal directly
                const task = [...tasksData.tasks, ...tasksData.completed_tasks].find(t => t.id === parseInt(openedTaskId));
                if (task) {
                    openTaskModalWithData(task);
                }
            }
        } else if (viewToShow) {
            // Restore previously viewed list on normal page load
            showFilteredView(viewToShow);
        } else {
            // Default: show tiles
            showTiles();
        }

        // Back button handler (hidden now)
        const backButton = document.getElementById('back-to-tiles');
        if (backButton) {
            backButton.addEventListener('click', function () {
                const tilesView = document.getElementById('task-tiles-view');
                const listView = document.getElementById('task-list-view');
                tilesView.style.display = 'grid';
                listView.style.display = 'none';
                sessionStorage.removeItem('selectedTaskView');
                window.scrollTo(0, 0);
            });
        }

        // Close list view button handler (topbar close button)
        const closeListBtn = document.getElementById('topbar-close-btn');
        if (closeListBtn) {
            closeListBtn.addEventListener('click', function () {
                showTiles();
                sessionStorage.removeItem('selectedTaskView');
            });
        }

        document.querySelectorAll('.js-close-task-modal').forEach(function (button) {
            button.addEventListener('click', function () {
                closeTaskModal(button.closest('.task-modal'));
            });
        });

        document.querySelectorAll('.task-modal').forEach(function (modal) {
            modal.addEventListener('click', function (event) {
                if (event.target === modal) {
                    closeTaskModal(modal);
                }
            });
        });

        document.querySelectorAll('.subtask-checkbox').forEach(function (checkbox) {
            checkbox.addEventListener('click', function (event) {
                event.stopPropagation();
            });

            checkbox.addEventListener('change', function () {
                fetch(`/subtask/${this.dataset.subtaskId}/toggle/`, {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': getCookie('csrftoken')
                    }
                })
                .then(response => response.json())
                .then(data => onToggleSubtask(data, this));
            });
        });

        document.querySelectorAll('.js-generate-subtasks').forEach(function (button) {
            button.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();

                const taskId = this.dataset.taskId;
                const taskTitle = this.dataset.taskTitle;
                const oldText = this.textContent;

                this.disabled = true;
                this.textContent = 'Генерация...';

                fetch((window.HOME_PAGE_CONFIG || {}).generateSubtasksUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCookie('csrftoken')
                    },
                    body: JSON.stringify({
                        task_id: taskId,
                        task_title: taskTitle
                    })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        showToast('Подзадачи успешно сгенерированы!', 'success');
                    } else {
                                    showToast('Ошибка', 'danger');
                    }
                })
                .catch(() => {
                                showToast('Ошибка', 'danger');
                })
                .finally(() => {
                    this.disabled = false;
                    this.textContent = oldText;
                });
            });
        });

        const clearCompletedBtn = document.getElementById('clear-completed-btn');
        if (clearCompletedBtn) {
            clearCompletedBtn.addEventListener('click', function () {
                showConfirmModal(
                    'Очистить список',
                    'Вы уверены? Все выполненные задачи будут удалены.',
                    function () {
                        fetch((window.HOME_PAGE_CONFIG || {}).clearCompletedUrl, {
                            method: 'POST',
                            headers: { 'X-CSRFToken': getCookie('csrftoken') }
                        })
                        .then(response => response.text())
                        .then(() => {
                            const completedCount = tasksData.completed_tasks.length;

                            // Update data
                            tasksData.completed_tasks = [];

                            // Update tile counter for completed tasks
                            const completedTile = document.querySelector('.task-tile--completed');
                            if (completedTile) {
                                const countEl = completedTile.querySelector('.task-tile__count');
                                if (countEl) {
                                    countEl.textContent = '0';
                                }
                            }

                            // Re-render current view if showing completed list
                            const currentView = sessionStorage.getItem('selectedTaskView');
                            if (currentView === 'completed') {
                                showFilteredView('completed');
                            }

                            showToast(`Удалено ${completedCount} задач!`, 'success');
                            fetch('/api/tasks-data/')
                                .then(function (r) { return r.json(); })
                                .then(function (data) { updateSidebarCounters(data.counters); })
                                .catch(function () {});
                        })
                        .catch(err => {
                            showToast('Ошибка при очистке списка.', 'danger');
                        });
                    },
                    'Очистить',
                    'danger'
                );
            });
        }

        // Check every minute if date changed and sync tasks with database
        let lastCheckedDate = today;
        setInterval(function () {
            const nowDate = new Date(now);
            const currentDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());

            if (currentDate > lastCheckedDate) {
                lastCheckedDate = currentDate;
                today = currentDate;

                // Update overdue tasks in database
                fetch((window.HOME_PAGE_CONFIG || {}).updateOverdueUrl, {
                    method: 'POST',
                    headers: { 'X-CSRFToken': getCookie('csrftoken') }
                })
                .catch(err => {});
            }

            // Refresh task data from database every minute
            fetch((window.HOME_PAGE_CONFIG || {}).tasksDataUrl)
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    tasksData.tasks = data.tasks;
                    tasksData.completed_tasks = data.completed_tasks;
                    now = new Date(data.now);

                    // Get current view and refresh it
                    const currentView = sessionStorage.getItem('selectedTaskView');
                    if (currentView && currentView !== 'tiles') {
                        showFilteredView(currentView);
                    }

                    // Update all tile counters
                    const tiles = {
                        'active': document.querySelector('.task-tile[data-view="active"] .task-tile__count'),
                        'planned': document.querySelector('.task-tile[data-view="planned"] .task-tile__count'),
                        'urgent': document.querySelector('.task-tile[data-view="urgent"] .task-tile__count'),
                        'favorites': document.querySelector('.task-tile[data-view="favorites"] .task-tile__count'),
                        'completed': document.querySelector('.task-tile[data-view="completed"] .task-tile__count'),
                        'overdue': document.querySelector('.task-tile[data-view="overdue"] .task-tile__count')
                    };

                    Object.keys(tiles).forEach(viewType => {
                        const countEl = tiles[viewType];
                        if (countEl) {
                            const count = getTasksForView(viewType).length;
                            countEl.textContent = count;
                        }
                    });

                    // Update sidebar counters
                    updateSidebarCounters(data.counters);
                }
            })
            .catch(err => {});
        }, 60000); // Check every 60 seconds

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                document.querySelectorAll('.task-modal').forEach(function (modal) {
                    closeTaskModal(modal);
                });
            }
        });

    });
