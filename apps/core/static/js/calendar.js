(function () {
    const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    const DAYS_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

    let allTasks = [];
    let currentView = 'month';
    let cursor = new Date();
    cursor.setDate(1);
    cursor.setHours(0,0,0,0);
    let selectedDate = null;

    const grid       = document.getElementById('cal-grid');
    const weekdaysEl = document.getElementById('cal-weekdays');
    const titleEl    = document.getElementById('cal-title');
    const sidebar    = document.getElementById('cal-sidebar');
    const sidebarDate = document.getElementById('sidebar-date');
    const sidebarBody = document.getElementById('sidebar-body');
    const taskModal  = document.getElementById('task-modal');
    const taskModalBody = document.getElementById('task-modal-body');

    // данные загружаются ниже, после объявления всех функций

    // ── Helpers ──
    function toKey(y, m, d) {
        return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }

    function tasksByDate() {
        const map = {};
        allTasks.forEach(t => {
            if (!map[t.date]) map[t.date] = [];
            map[t.date].push(t);
        });
        return map;
    }



     function pad(n) { return String(n).padStart(2,'0'); }

     // ── Helpers for chip colors ──
      function chipColor(task) {
         const listColors = { active: 'var(--success)', planned: 'var(--primary)', urgent: '#d946ef', favorites: 'var(--warning)', overdue: 'var(--danger)', completed: 'var(--text-secondary)' };
         const c = listColors[task.task_list] || 'var(--primary)';
         return `color-mix(in srgb, ${c} 20%, var(--surface))`;
     }
     function chipBorderColor(task) {
         const listColors = { active: 'var(--success)', planned: 'var(--primary)', urgent: '#d946ef', favorites: 'var(--warning)', overdue: 'var(--danger)', completed: 'var(--text-secondary)' };
         const c = listColors[task.task_list] || 'var(--primary)';
         return c;
     }

     // ── Render ──
    function render() {
        currentView === 'month' ? renderMonth() : renderWeek();
        updateWeekdayLabels();
        grid.classList.toggle('is-week-view', currentView === 'week');
        weekdaysEl.classList.toggle('is-week-view', currentView === 'week');
    }

    let _weekScrollWrap = null;

    function _ensureWeekScroll() {
        if (_weekScrollWrap) return;
        _weekScrollWrap = document.createElement('div');
        _weekScrollWrap.className = 'cal-grid-scroll';
        grid.parentNode.insertBefore(_weekScrollWrap, grid);
        _weekScrollWrap.appendChild(grid);
    }
    function _removeWeekScroll() {
        if (!_weekScrollWrap) return;
        _weekScrollWrap.parentNode.insertBefore(grid, _weekScrollWrap);
        _weekScrollWrap.parentNode.removeChild(_weekScrollWrap);
        _weekScrollWrap = null;
        weekdaysEl.style.paddingRight = '';
    }
    function _syncHeaderWidth() {
        if (!_weekScrollWrap) return;
        const sb = _weekScrollWrap.offsetWidth - _weekScrollWrap.clientWidth;
        weekdaysEl.style.paddingRight = sb ? sb + 'px' : '';
    }

    function updateWeekdayLabels() {
        if (currentView === 'week') return; // renderWeek сам рисует заголовки
        weekdaysEl.style.gridTemplateColumns = '';
        weekdaysEl.innerHTML = DAYS_SHORT.map((d,i) =>
            `<span class="${i >= 5 ? 'cal-weekend' : ''}">${d}</span>`
        ).join('');
    }

    function renderMonth() {
        _removeWeekScroll();
        const y = cursor.getFullYear(), m = cursor.getMonth();
        titleEl.textContent = `${MONTHS[m]} ${y}`;

        const map = tasksByDate();
        const today = new Date(); today.setHours(0,0,0,0);

        // First cell: Monday of the week containing the 1st
        const first = new Date(y, m, 1);
        const dow = first.getDay() === 0 ? 7 : first.getDay(); // 1=Mon..7=Sun
        const startDate = new Date(y, m, 1 - (dow - 1));

        grid.innerHTML = '';
        grid.style.gridTemplateColumns = 'repeat(7, minmax(0, 1fr))';
        grid.style.gridAutoRows = '';
        weekdaysEl.style.gridTemplateColumns = '';

        // 6 weeks = 42 cells
        for (let i = 0; i < 42; i++) {
            const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
            const key = toKey(d.getFullYear(), d.getMonth(), d.getDate());
            const tasks = map[key] || [];
            const isToday = d.getTime() === today.getTime();
            const isOther = d.getMonth() !== m;
            const isSelected = selectedDate === key;

            const cell = document.createElement('div');
            cell.className = 'cal-cell' +
                (isToday ? ' is-today' : '') +
                (isOther ? ' is-other-month' : '') +
                (isSelected ? ' is-selected' : '') +
                (tasks.length ? ' has-events' : '');
            cell.dataset.date = key;

            const numEl = document.createElement('div');
            numEl.className = 'cal-cell__num';
            numEl.textContent = d.getDate();
            cell.appendChild(numEl);

            const eventsEl = document.createElement('div');
            eventsEl.className = 'cal-cell__events';

            const MAX_CHIPS = 3;
            tasks.sort((a,b) => a.time.localeCompare(b.time));
            tasks.slice(0, MAX_CHIPS).forEach(t => {
                const chip = document.createElement('span');
                chip.className = 'cal-chip' + (t.is_completed ? ' cal-chip--done' : '');
                chip.textContent = t.time + ' ' + t.title;
                chip.style.background = chipColor(t);
                chip.style.borderColor = chipBorderColor(t);
                chip.style.borderLeft = `3px solid ${chipBorderColor(t)}`;
                chip.dataset.taskId = t.id;
                chip.addEventListener('click', e => { e.stopPropagation(); openTaskModal(t); });
                eventsEl.appendChild(chip);
            });

            if (tasks.length > MAX_CHIPS) {
                const more = document.createElement('span');
                more.className = 'cal-chip cal-chip--more';
                more.textContent = `+${tasks.length - MAX_CHIPS} ещё`;
                eventsEl.appendChild(more);
            }

            cell.appendChild(eventsEl);
            cell.addEventListener('click', () => selectDay(key, d, tasks));
            grid.appendChild(cell);
        }
    }

    function renderWeek() {
        _ensureWeekScroll();
        const today = new Date(); today.setHours(0,0,0,0);
        const dow = cursor.getDay() === 0 ? 7 : cursor.getDay();
        const monday = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - (dow - 1));
        const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);

        const mStr = `${monday.getDate()} ${MONTHS_GEN[monday.getMonth()]}`;
        const sStr = `${sunday.getDate()} ${MONTHS_GEN[sunday.getMonth()]} ${sunday.getFullYear()}`;
        titleEl.textContent = `${mStr} — ${sStr}`;

        const map = tasksByDate();

        // Заголовки дней (с временной колонкой-заглушкой)
        const todayDate = new Date(); todayDate.setHours(0,0,0,0);
        weekdaysEl.innerHTML =
            `<span class="cal-time-gutter"></span>` +
            Array.from({length:7}, (_,i) => {
                const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
                const isWe = i >= 5;
                const isToday = d.getTime() === todayDate.getTime();
                return `<div class="cal-weekday-cell${isWe ? ' is-weekend' : ''}${isToday ? ' is-today' : ''}"><span>${DAYS_SHORT[i]} / ${d.getDate()}</span></div>`;
            }).join('');
        weekdaysEl.style.gridTemplateColumns = 'var(--gutter-w) repeat(7, minmax(0,1fr))';

        // Показываем все часы от 00:00 до 23:00
        var hours = Array.from({length:24}, function(_, i) { return i; });

        grid.innerHTML = '';
        grid.style.gridTemplateColumns = 'var(--gutter-w) repeat(7, minmax(0,1fr))';


        hours.forEach(hour => {
            // Метка времени
            const gutter = document.createElement('div');
            gutter.className = 'cal-week-gutter';
            gutter.textContent = `${pad(hour)}:00`;
            grid.appendChild(gutter);

            for (let i = 0; i < 7; i++) {
                const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
                const key = toKey(d.getFullYear(), d.getMonth(), d.getDate());
                const dayTasks = (map[key] || [])
                    .filter(t => Number(t.time.split(':')[0]) === hour)
                    .sort((a,b) => a.time.localeCompare(b.time));
                const isToday = d.getTime() === today.getTime();
                const isSelected = selectedDate === key;

                const cell = document.createElement('div');
                cell.className = 'cal-cell cal-cell--week-row' +
                    (isToday ? ' is-today' : '') +
                    (isSelected ? ' is-selected' : '');
                cell.dataset.date = key;

                const eventsEl = document.createElement('div');
                eventsEl.className = 'cal-cell__events';

                const MAX_CHIPS = 3;
                dayTasks.slice(0, MAX_CHIPS).forEach(t => {
                    const chip = document.createElement('span');
                    chip.className = 'cal-chip' + (t.is_completed ? ' cal-chip--done' : '');
                    chip.innerHTML = `<span style="opacity:.7;font-size:.9em;margin-right:3px;">${t.time}</span>${escHtml(t.title)}`;
                    chip.style.background = chipColor(t);
                    chip.style.borderColor = chipBorderColor(t);
                    chip.style.borderLeft = `3px solid ${chipBorderColor(t)}`;
                    chip.addEventListener('click', e => { e.stopPropagation(); openTaskModal(t); });
                    eventsEl.appendChild(chip);
                });

                if (dayTasks.length > MAX_CHIPS) {
                    const more = document.createElement('span');
                    more.className = 'cal-chip cal-chip--more';
                    more.textContent = `+${dayTasks.length - MAX_CHIPS} ещё`;
                    eventsEl.appendChild(more);
                }

                cell.appendChild(eventsEl);
                cell.addEventListener('click', () => {
                    const allDayTasks = (map[key] || []).sort((a,b) => a.time.localeCompare(b.time));
                    selectDay(key, d, allDayTasks);
                });
                grid.appendChild(cell);
            }
        });
        _syncHeaderWidth();
    }

    // ── Select day → sidebar ──
    function selectDay(key, date, tasks) {
        selectedDate = key;
        render();

        const dayLabel = `${date.getDate()} ${MONTHS_GEN[date.getMonth()]} ${date.getFullYear()}`;
        sidebarDate.textContent = dayLabel;
        sidebar.classList.remove('is-hidden');

        renderSidebarTasks(tasks);
    }

    // ── Refresh sidebar tasks ──
    function refreshSidebar() {
        if (!selectedDate) return;

        const tasksForDate = allTasks.filter(t => t.date === selectedDate);
        renderSidebarTasks(tasksForDate);
    }

    // ── Render sidebar tasks ──
    function renderSidebarTasks(tasks) {
        sidebarBody.innerHTML = '';

        if (!tasks.length) {
            sidebarBody.innerHTML = '<p class="cal-sidebar__empty">Нет задач в этот день</p>';
            return;
        }

        const sorted = [...tasks].sort((a,b) => a.time.localeCompare(b.time));
        sorted.forEach(t => {
            const card = document.createElement('div');
            card.className = 'cal-task-card' + (t.is_completed ? ' cal-task-card--done' : '');
            card.dataset.taskId = t.id;

             const listBorderColors = { active: 'var(--success)', planned: 'var(--primary)', urgent: '#d946ef', favorites: 'var(--warning)', overdue: 'var(--danger)', completed: 'var(--text-secondary)' };
             const listColor = listBorderColors[t.task_list] || 'var(--primary)';
             card.style.borderLeftColor = listColor;

            const subtaskBadge = !t.is_completed && t.pending_subtasks > 0
                ? `<span class="badge badge--muted" style="font-size:0.72rem;padding:1px 6px;">Подзадач: ${t.pending_subtasks}</span>`
                : '';

            const favoriteFlag = t.is_favorite
                ? `<svg style="width:16px;height:16px;flex-shrink:0;" fill="none" stroke="var(--warning)" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`
                : '';

            card.innerHTML = `
                <p class="cal-task-card__title" style="display:flex;align-items:flex-start;gap:8px;">
                    <span style="flex:1;min-width:0;">${escHtml(t.title)}</span>
                    ${favoriteFlag}
                </p>
                <div class="cal-task-card__meta">
                    <span class="cal-task-card__time">${t.time}</span>
                    ${subtaskBadge}
                    ${t.is_completed ? '<span class="badge badge--success" style="font-size:0.72rem;padding:1px 6px;">Выполнено</span>' : ''}
                </div>
            `;

            card.addEventListener('click', () => openTaskModal(t));
            sidebarBody.appendChild(card);
        });
    }

    // ── Task modal ──
    function openTaskModal(task) {
        const listLabels = { active: 'Активная задача', planned: 'В планах', urgent: 'Срочная задача', favorites: 'Избранная задача', overdue: 'Просроченная задача' };
        const listColors = { active: 'var(--success)', planned: 'var(--primary)', urgent: '#d946ef', favorites: 'var(--warning)', overdue: 'var(--danger)' };
        const taskTypeLabel = task.is_completed
            ? 'Выполненная задача'
            : (listLabels[task.task_list] || 'Активная задача');
        const labelColor = task.is_completed
            ? 'var(--text-secondary)'
            : (listColors[task.task_list] || 'var(--primary)');
        const favoriteFlag = task.is_favorite
            ? `<svg style="width:16px;height:16px;flex-shrink:0;" fill="none" stroke="var(--warning)" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`
            : '';

        function renderModalBody(subtasks) {
            const hasSubtasks = subtasks && subtasks.length > 0;

            const subtasksContent = hasSubtasks
                ? `<div class="subtasks">
                    ${subtasks.map(subtask => `
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

            const descriptionContent = task.description
                ? `<div style="max-height:200px;overflow-y:auto;"><p class="task-modal__description" style="margin:0;">${escHtml(task.description)}</p></div>`
                : '';

            const completeButton = task.is_completed
                ? `<button type="button" class="button button--success button--small js-complete-task-modal" data-task-id="${task.id}">Восстановить</button>`
                : `<button type="button" class="button button--success button--small js-complete-task-modal" data-task-id="${task.id}">Завершить задачу</button>`;

            taskModalBody.innerHTML = `
                <div class="task-modal__header">
                    <div class="task-modal__header-main">
                        <div style="display:flex;align-items:center;gap:6px;width:fit-content;">
                            <span class="badge" style="background:color-mix(in srgb, ${labelColor} 14%, transparent);color:${labelColor};border:1px solid color-mix(in srgb, ${labelColor} 24%, transparent);">
                                ${taskTypeLabel}
                            </span>
                            ${favoriteFlag}
                        </div>
                        <h3 id="task-modal-title-${task.id}" class="task-modal__title">${escHtml(task.title)}</h3>
                        <p class="task-modal__time">${task.date.split('-').reverse().join('.')} в ${task.time}</p>
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
                        <button type="button" class="button button--primary button--small js-generate-subtasks" data-task-id="${task.id}" data-task-title="${escHtml(task.title)}">Сгенерировать подзадачи</button>
                        <button type="button" class="button button--danger button--small js-delete-task-modal" data-task-id="${task.id}">Удалить</button>
                    </div>
                </div>
            `;

            attachEventHandlers();

            const modalContent = taskModalBody.querySelector('.task-modal__content');
            if (modalContent) {
                const subtasksBlock = modalContent.querySelectorAll('.task-modal__block');
                if (subtasksBlock.length > 0) {
                    attachSubtaskCheckboxListeners(subtasksBlock[subtasksBlock.length - 1]);
                }
            }
        }

        function attachSubtaskCheckboxListeners(container) {
            container.querySelectorAll('.subtask-checkbox').forEach(function (checkbox) {
                checkbox.addEventListener('click', function (event) {
                    event.stopPropagation();
                });
                checkbox.addEventListener('change', function () {
                    const subtaskId = this.dataset.subtaskId;
                    fetch(`/subtask/${subtaskId}/toggle/`, {
                        method: 'POST',
                        headers: { 'X-CSRFToken': getCookie('csrftoken') }
                    })
                    .then(r => r.json())
                .then(data => {
                    if (data.status === 'success') {
                        const row = document.querySelector(`[data-subtask-row][data-subtask-id="${subtaskId}"]`);
                        if (row) {
                            row.classList.toggle('is-completed', data.is_completed);
                            const badge = row.querySelector('[data-subtask-badge]');
                            if (badge) {
                                badge.className = data.is_completed ? 'badge badge--success' : 'badge badge--muted';
                                badge.textContent = data.is_completed ? 'Выполнено' : 'Не выполнено';
                            }
                            const text = row.querySelector('[data-subtask-text]');
                            if (text) {
                                text.style.textDecoration = data.is_completed ? 'line-through' : 'none';
                                text.style.opacity = data.is_completed ? '0.72' : '1';
                            }
                        }
                        refreshCalendar();
                    }
                });
                });
            });
        }

        function attachEventHandlers() {
            const closeBtn = taskModalBody.querySelector('.js-close-task-modal');
            if (closeBtn) {
                closeBtn.addEventListener('click', closeTaskModal);
            }

            const generateBtn = taskModalBody.querySelector('.js-generate-subtasks');
            if (generateBtn) {
                generateBtn.addEventListener('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    const taskId = this.dataset.taskId;
                    const taskTitle = this.dataset.taskTitle;
                    const oldText = this.textContent;
                    this.disabled = true;
                    this.textContent = 'Генерация...';

                    fetch('/api/generate-subtasks/', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': getCookie('csrftoken')
                        },
                        body: JSON.stringify({ task_id: taskId, task_title: taskTitle })
                    })
                    .then(r => r.json())
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
                                        // Если pending - продолжаем опрос
                                    })
                                    .catch(err => {
                                        clearInterval(pollInterval);
                                        showToast('Ошибка опроса статуса', 'danger');
                                        this.disabled = false;
                                        this.textContent = oldText;
                                    });
                            }, 1000); // Опрос каждую секунду
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
                    .then(r => r.json())
                    .then(subtasksData => {
                        const subtasks = subtasksData.subtasks || [];
                        const subtasksBlock = taskModalBody.querySelectorAll('.task-modal__block');
                        if (subtasksBlock.length > 0) {
                            const block = subtasksBlock[subtasksBlock.length - 1];
                            const subtasksContent = subtasks.length > 0
                                ? `<div class="subtasks">
                                    ${subtasks.map(s => `
                                        <div class="subtask subtask--checkable ${s.is_completed ? 'is-completed' : ''}" data-subtask-row data-subtask-id="${s.id}" data-parent-task-id="${taskId}">
                                            <div class="subtask__left">
                                                <input type="checkbox" class="subtask-checkbox" data-subtask-id="${s.id}" data-parent-task-id="${taskId}" ${s.is_completed ? 'checked' : ''}>
                                                <span class="subtask__text" data-subtask-text>${s.title}</span>
                                            </div>
                                            <span class="badge ${s.is_completed ? 'badge--success' : 'badge--muted'}" data-subtask-badge>
                                                ${s.is_completed ? 'Выполнено' : 'Не выполнено'}
                                            </span>
                                        </div>
                                    `).join('')}
                                  </div>`
                                : '<p class="muted" style="margin: 0;">У этой задачи пока нет подзадач.</p>';
                            block.innerHTML = `<div class="task-modal__label">Подзадачи</div><div style="max-height:200px;overflow-y:auto;">${subtasksContent}</div>`;
                            attachSubtaskCheckboxListeners(block);
                        }
                    })
                    .catch(error => {
                        showToast('Ошибка при генерации подзадач.', 'danger');
                    })
                    .finally(() => {
                        this.disabled = false;
                        this.textContent = oldText;
                    });
                });
            }

            const completeBtn = taskModalBody.querySelector('.js-complete-task-modal');
            if (completeBtn) {
                completeBtn.addEventListener('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    const taskId = this.dataset.taskId;
                    const wasCompleted = task.is_completed;
                    closeTaskModal();
                    const endpoint = wasCompleted ? 'restore' : 'complete';
                    fetch(`/task/${taskId}/${endpoint}/`, {
                        method: 'POST',
                        headers: { 'X-CSRFToken': getCookie('csrftoken') }
                    }).then(() => {
                        refreshCalendar();
                        refreshSidebar();
                        showToast(`Задача «${task.title}» ${wasCompleted ? 'восстановлена!' : 'выполнена!'}`, 'success');
                    }).catch(function () {});
                });
            }

            const deleteBtn = taskModalBody.querySelector('.js-delete-task-modal');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    showConfirmModal(
                        'Удаление задачи',
                        'Вы уверены, что хотите удалить задачу «' + task.title + '»? Это действие необратимо.',
                        function () {
                            const taskId = deleteBtn.dataset.taskId;
                            closeTaskModal();
                            fetch(`/task/${taskId}/delete/`, {
                                method: 'POST',
                                headers: { 'X-CSRFToken': getCookie('csrftoken') }
                            }).then(() => {
                                refreshCalendar();
                                refreshSidebar();
                            }).catch(function () {});
                        }
                    );
                });
            }
        }

        // Fetch subtasks and render
        fetch(`/api/tasks/${task.id}/subtasks/`)
            .then(r => r.json())
            .then(data => {
                const subtasks = data.subtasks || [];
                renderModalBody(subtasks);
                taskModal.classList.add('is-open');
                taskModal.setAttribute('aria-hidden', 'false');
                document.body.style.overflow = 'hidden';
            })
            .catch(() => {
                renderModalBody([]);
                taskModal.classList.add('is-open');
                taskModal.setAttribute('aria-hidden', 'false');
                document.body.style.overflow = 'hidden';
            });
    }

    function closeTaskModal() {
        taskModal.classList.remove('is-open');
        taskModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
    }

    function showToast(message, type) {
        const area = document.getElementById('toast-area');
        if (!area) return;
        const icons = {
            success: '<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd"/>',
            danger: '<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>',
        };
        const toast = document.createElement('div');
        toast.className = 'toast toast--' + type;
        toast.innerHTML = '<svg class="toast__icon" viewBox="0 0 20 20" fill="currentColor">' + (icons[type] || icons.success) + '</svg><span class="toast__body">' + message + '</span><button type="button" class="toast__close" aria-label="Закрыть">\u00d7</button>';
        area.appendChild(toast);
        setTimeout(function () { if (toast.isConnected) { toast.classList.add('is-hiding'); toast.addEventListener('animationend', function () { toast.remove(); }, { once: true }); } }, 4200);
    }

    taskModal.addEventListener('click', e => { if (e.target === taskModal) closeTaskModal(); });

    // ── Escape ──
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.task-modal').forEach(function (modal) {
                closeTaskModal();
            });
        }
    });

    // ── Navigation ──
    document.getElementById('cal-prev').addEventListener('click', () => {
        if (currentView === 'month') {
            cursor.setMonth(cursor.getMonth() - 1);
        } else {
            cursor.setDate(cursor.getDate() - 7);
        }
        render();
    });

    document.getElementById('cal-next').addEventListener('click', () => {
        if (currentView === 'month') {
            cursor.setMonth(cursor.getMonth() + 1);
        } else {
            cursor.setDate(cursor.getDate() + 7);
        }
        render();
    });

    document.getElementById('cal-today').addEventListener('click', () => {
        const now = new Date();
        if (currentView === 'week') {
            cursor = now;
        } else {
            cursor = new Date(now.getFullYear(), now.getMonth(), 1);
        }
        render();
        const key = toKey(now.getFullYear(), now.getMonth(), now.getDate());
        const map = tasksByDate();
        selectDay(key, now, map[key] || []);
    });

    document.getElementById('btn-month').addEventListener('click', () => {
        currentView = 'month';
        cursor.setDate(1);
        document.getElementById('btn-month').classList.add('is-active');
        document.getElementById('btn-week').classList.remove('is-active');
        render();
    });

    document.getElementById('btn-week').addEventListener('click', () => {
        currentView = 'week';
        cursor = new Date();
        document.getElementById('btn-week').classList.add('is-active');
        document.getElementById('btn-month').classList.remove('is-active');
        render();
    });

    document.getElementById('sidebar-close').addEventListener('click', () => {
        selectedDate = null;
        sidebar.classList.add('is-hidden');
        render();
    });

    // ── Utils ──
    function escHtml(s) {
        return String(s ?? '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    const _t = new Date();
    const todayKey = toKey(_t.getFullYear(), _t.getMonth(), _t.getDate());

    fetch('/api/tasks/')
        .then(r => r.json())
        .then(data => {
            allTasks = data;
            render();
            const todayTasks = data.filter(t => t.date === todayKey);
            selectDay(todayKey, new Date(), todayTasks);
        });

    // Update sidebar counters every 60 seconds
    function updateSidebarCounters(counters) {
        if (!counters) return;
        Object.keys(counters).forEach(key => {
            const els = document.querySelectorAll(`[data-counter="${key}"]`);
            els.forEach(el => { el.textContent = counters[key] ?? el.textContent; });
        });
    }

     function toTaskEvent(t) {
         var d = new Date(t.due_date);
         var y = d.getFullYear();
         var m = String(d.getMonth() + 1).padStart(2,'0');
         var day = String(d.getDate()).padStart(2,'0');
         var h = String(d.getHours()).padStart(2,'0');
         var min = String(d.getMinutes()).padStart(2,'0');
         var now = new Date();
         var isOverdue = !t.is_completed && d < now;
         return {
             id: t.id,
             title: t.title,
             description: t.description || '',
             date: y + '-' + m + '-' + day,
             time: h + ':' + min,
             is_completed: t.is_completed,
             pending_subtasks: t.pending_subtask_count,
             edit_url: '/task/' + t.id + '/edit/',
             task_list: t.task_list,
             is_favorite: t.is_favorite,
             is_overdue: isOverdue
         };
     }

    function refreshCalendar() {
        fetch('/api/tasks-data/')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.status === 'success') {
                    var mapped = data.tasks.map(toTaskEvent).concat(data.completed_tasks.map(toTaskEvent));
                    allTasks = mapped;
                    render();
                    updateSidebarCounters(data.counters);
                    refreshSidebar();
                }
            })
            .catch(function () {});
    }

    // Обновление просроченных задач при загрузке
    fetch('/update-overdue-tasks/', {
        method: 'POST',
        headers: { 'X-CSRFToken': getCookie('csrftoken') }
    }).then(refreshCalendar).catch(function () {});

    // Обновление каждые 60 секунд (резерв для edge cases)
    setInterval(refreshCalendar, 60000);

    // Мгновенное обновление при возвращении на вкладку
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) refreshCalendar();
    });
})();
