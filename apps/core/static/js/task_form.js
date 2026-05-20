(function () {
        document.getElementById('browser-timezone').value = Intl.DateTimeFormat().resolvedOptions().timeZone;

        document.querySelectorAll('input, textarea, select').forEach(function (el) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
                el.classList.add('input');
            }
            if (el.tagName === 'TEXTAREA') {
                el.classList.add('textarea');
            }
        });

        const subtasksList = document.getElementById('subtasks-list');
        const addSubtaskBtn = document.getElementById('add-subtask-btn');
        const generateBtn = document.getElementById('generate-subtasks-btn');
        const formCfg = window.TASK_FORM_CONFIG || {};
        const titleInput = document.getElementById(formCfg.titleFieldId);
        const descriptionInput = document.getElementById(formCfg.descriptionFieldId);
        const dueDateInput = document.getElementById(formCfg.dueDateFieldId);
        const alertsContainer = document.getElementById('subtasks-alert-container');
        const MAX_SUBTASKS = 10;

        const modal = document.getElementById('mini-datetime-modal');
        const backdrop = document.getElementById('mini-datetime-backdrop');
        const closeButton = document.getElementById('mini-datetime-close');
        const cancelButton = document.getElementById('mini-datetime-cancel');
        const applyButton = document.getElementById('mini-datetime-apply');
        const prevMonthButton = document.getElementById('mini-prev-month');
        const nextMonthButton = document.getElementById('mini-next-month');
        const currentMonthLabel = document.getElementById('mini-current-month');
        const calendarGrid = document.getElementById('mini-calendar-grid');
        const hoursSelect = document.getElementById('mini-picker-hours');
        const minutesSelect = document.getElementById('mini-picker-minutes');
        const form = document.getElementById('task-form');

        function escapeHtml(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

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

        function showAlert(message, type) {
            const area = document.getElementById('toast-area');
            if (!area) return;

            const icons = {
                success: '<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd"/>',
                danger:  '<path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/>',
                warning: '<path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/>',
            };

            const toast = document.createElement('div');
            toast.className = `toast toast--${type}`;
            toast.setAttribute('role', 'alert');
            toast.style.cssText = 'position:relative;overflow:hidden;';
            toast.innerHTML = `
                <svg class="toast__icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">${icons[type] || icons.danger}</svg>
                <span class="toast__body">${escapeHtml(message)}</span>
                <button type="button" class="toast__close" aria-label="Закрыть">×</button>
                <span class="toast__progress"></span>
            `;

            toast.querySelector('.toast__close').addEventListener('click', function () { window.dismissToast(toast); });
            area.appendChild(toast);
            setTimeout(function () { if (toast.isConnected) window.dismissToast(toast); }, 4200);
        }

        function createSubtaskItem(value = '') {
            const wrapper = document.createElement('div');
            wrapper.className = 'subtask-editor';
            wrapper.innerHTML = `
                <input
                    type="text"
                    name="subtasks"
                    class="input"
                    placeholder="Введите подзадачу"
                    value="${escapeHtml(value)}"
                >
                <button type="button" class="button button--danger button--small js-remove-subtask">
                    Удалить
                </button>
            `;
            return wrapper;
        }

        function bindRemoveButtons() {
            subtasksList.querySelectorAll('.js-remove-subtask').forEach(function (button) {
                button.onclick = function () {
                    const items = subtasksList.querySelectorAll('.subtask-editor');
                    if (items.length === 1) {
                        const input = items[0].querySelector('input[name="subtasks"]');
                        if (input) input.value = '';
                        return;
                    }
                    button.closest('.subtask-editor').remove();
                };
            });
        }

        function normalizeSubtasks(items) {
            const seen = new Set();
            const result = [];

            items.forEach(function (item) {
                const value = String(item || '').trim();
                if (!value) return;

                const normalized = value.toLowerCase().replace(/[.,!?:;]+$/g, '');
                if (seen.has(normalized)) return;

                seen.add(normalized);
                result.push(value);
            });

            return result.slice(0, MAX_SUBTASKS);
        }

        if (titleInput) {
            titleInput.placeholder = 'Введите название задачи';
        }

        if (descriptionInput) {
            descriptionInput.placeholder = 'Описание поможет AI сгенерировать более точные подзадачи';
        }

        addSubtaskBtn.addEventListener('click', function () {
            const count = subtasksList.querySelectorAll('.subtask-editor').length;
            if (count >= MAX_SUBTASKS) {
                showAlert(`Можно добавить не более ${MAX_SUBTASKS} подзадач.`, 'warning');
                return;
            }

            subtasksList.appendChild(createSubtaskItem());
            bindRemoveButtons();
        });

        generateBtn.addEventListener('click', function () {
            const taskTitle = (titleInput?.value || '').trim();
            const taskDescription = (descriptionInput?.value || '').trim();

            if (!taskTitle) {
                showAlert('Сначала введи название задачи.', 'warning');
                return;
            }

            generateBtn.disabled = true;
            const oldText = generateBtn.innerHTML;
            generateBtn.innerHTML = 'Генерация...';

            fetch(formCfg.generateSubtasksUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({
                    task_title: taskTitle,
                    task_description: taskDescription
                })
            })
            .then(function (response) {
                return response.json().then(function (data) {
                    return { ok: response.ok, data: data };
                });
            })
            .then(function (result) {
                if (!result.ok) {
                    throw new Error(result.data.message || 'Не удалось сгенерировать подзадачи.');
                }

                // Поддержка как синхронного (success), так и асинхронного (pending) ответа
                if (result.data.status === 'pending') {
                    // Polling для асинхронного режима (не используется в форме, но на будущее)
                    showAlert('Генерация в процессе...', 'info');
                    return;
                }

                if (result.data.status !== 'success') {
                    throw new Error(result.data.message || 'Не удалось сгенерировать подзадачи.');
                }

                const subtasks = normalizeSubtasks(result.data.subtasks || []);
                if (!subtasks.length) {
                    throw new Error('AI не вернул подзадачи.');
                }

                subtasksList.innerHTML = '';
                subtasks.forEach(function (text) {
                    subtasksList.appendChild(createSubtaskItem(text));
                });

                bindRemoveButtons();
                showAlert('Подзадачи успешно сгенерированы.', 'success');
            })
            .catch(function (error) {
                showAlert('Ошибка при генерации подзадач.', 'danger');
            })
            .finally(function () {
                generateBtn.disabled = false;
                generateBtn.innerHTML = oldText;
            });
        });

        bindRemoveButtons();

        if (!dueDateInput) {
            return;
        }

        dueDateInput.classList.add('input');
        dueDateInput.readOnly = true;
        dueDateInput.setAttribute('autocomplete', 'off');

        const monthNames = [
            'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
            'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
        ];

        function pad(value) {
            return String(value).padStart(2, '0');
        }

        function getNow() {
            const now = new Date();
            now.setSeconds(0);
            now.setMilliseconds(0);
            return now;
        }

        function getMinSelectableDate() {
            const now = getNow();
            const rounded = new Date(now);
            const remainder = rounded.getMinutes() % 5;

            if (remainder !== 0) {
                rounded.setMinutes(rounded.getMinutes() + (5 - remainder));
            }

            if (rounded.getSeconds() !== 0 || rounded.getMilliseconds() !== 0) {
                rounded.setSeconds(0);
                rounded.setMilliseconds(0);
            }

            if (rounded.getTime() <= now.getTime()) {
                rounded.setMinutes(rounded.getMinutes() + 5);
            }

            rounded.setSeconds(0);
            rounded.setMilliseconds(0);
            return rounded;
        }

        function parseDateValue(value) {
            if (!value) {
                return null;
            }

            const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
            if (!match) {
                return null;
            }

            return new Date(
                Number(match[1]),
                Number(match[2]) - 1,
                Number(match[3]),
                Number(match[4]),
                Number(match[5]),
                0,
                0
            );
        }

        function formatDateValue(date) {
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
        }

        function startOfDay(date) {
            return new Date(date.getFullYear(), date.getMonth(), date.getDate());
        }

        function normalizeDraftAgainstMin() {
            const minDate = getMinSelectableDate();
            if (draftDate.getTime() < minDate.getTime()) {
                draftDate = new Date(minDate);
            }
        }

        function isInvalidPastDate(date) {
            return date.getTime() < getMinSelectableDate().getTime();
        }

        let selectedDate = parseDateValue(dueDateInput.value);
        let draftDate = selectedDate ? new Date(selectedDate) : new Date(getMinSelectableDate());

        normalizeDraftAgainstMin();

        let visibleMonth = new Date(draftDate.getFullYear(), draftDate.getMonth(), 1);

        dueDateInput.min = formatDateValue(getMinSelectableDate());

        function populateTimeOptions() {
            hoursSelect.innerHTML = '';
            minutesSelect.innerHTML = '';

            for (let i = 0; i < 24; i += 1) {
                const option = document.createElement('option');
                option.value = pad(i);
                option.textContent = pad(i);
                hoursSelect.appendChild(option);
            }

            for (let i = 0; i < 60; i += 5) {
                const option = document.createElement('option');
                option.value = pad(i);
                option.textContent = pad(i);
                minutesSelect.appendChild(option);
            }
        }

        function applyTimeRestrictions() {
            const minDate = getMinSelectableDate();
            const selectedDayStart = startOfDay(draftDate).getTime();
            const minDayStart = startOfDay(minDate).getTime();
            const isMinDay = selectedDayStart === minDayStart;

            Array.from(hoursSelect.options).forEach(function (option) {
                option.disabled = false;

                if (isMinDay && Number(option.value) < minDate.getHours()) {
                    option.disabled = true;
                }
            });

            const selectedHourOption = Array.from(hoursSelect.options).find(function (option) {
                return option.value === hoursSelect.value;
            });

            if (!selectedHourOption || selectedHourOption.disabled) {
                const firstAvailableHour = Array.from(hoursSelect.options).find(function (option) {
                    return !option.disabled;
                });
                if (firstAvailableHour) {
                    hoursSelect.value = firstAvailableHour.value;
                }
            }

            Array.from(minutesSelect.options).forEach(function (option) {
                option.disabled = false;

                if (
                    isMinDay &&
                    Number(hoursSelect.value) === minDate.getHours() &&
                    Number(option.value) < minDate.getMinutes()
                ) {
                    option.disabled = true;
                }
            });

            const selectedMinuteOption = Array.from(minutesSelect.options).find(function (option) {
                return option.value === minutesSelect.value;
            });

            if (!selectedMinuteOption || selectedMinuteOption.disabled) {
                const firstAvailableMinute = Array.from(minutesSelect.options).find(function (option) {
                    return !option.disabled;
                });

                if (firstAvailableMinute) {
                    minutesSelect.value = firstAvailableMinute.value;
                } else {
                    const nextAvailableHour = Array.from(hoursSelect.options).find(function (option) {
                        return !option.disabled && Number(option.value) > Number(hoursSelect.value);
                    });

                    if (nextAvailableHour) {
                        hoursSelect.value = nextAvailableHour.value;
                        Array.from(minutesSelect.options).forEach(function (option) {
                            option.disabled = false;
                        });
                        minutesSelect.value = '00';
                    }
                }
            }
        }

        function syncTimeSelectors() {
            normalizeDraftAgainstMin();
            hoursSelect.value = pad(draftDate.getHours());
            minutesSelect.value = pad(draftDate.getMinutes());
            applyTimeRestrictions();
        }

        function updateDraftTimeFromSelectors() {
            draftDate.setHours(Number(hoursSelect.value));
            draftDate.setMinutes(Number(minutesSelect.value));
            draftDate.setSeconds(0);
            draftDate.setMilliseconds(0);

            normalizeDraftAgainstMin();
            hoursSelect.value = pad(draftDate.getHours());
            minutesSelect.value = pad(draftDate.getMinutes());
            applyTimeRestrictions();
        }

        function renderCalendar() {
            currentMonthLabel.textContent = `${monthNames[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`;
            calendarGrid.innerHTML = '';

            const firstDayOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
            const firstWeekday = firstDayOfMonth.getDay() === 0 ? 7 : firstDayOfMonth.getDay();
            const startDate = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - (firstWeekday - 1));
            const minDayStart = startOfDay(getMinSelectableDate()).getTime();

            for (let i = 0; i < 42; i += 1) {
                const dayDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
                const dayButton = document.createElement('button');

                dayButton.type = 'button';
                dayButton.className = 'mini-calendar__day';
                dayButton.textContent = dayDate.getDate();

                if (dayDate.getMonth() !== visibleMonth.getMonth()) {
                    dayButton.classList.add('is-outside');
                }

                if (startOfDay(dayDate).getTime() < minDayStart) {
                    dayButton.classList.add('is-disabled');
                    dayButton.disabled = true;
                }

                if (startOfDay(dayDate).getTime() === startOfDay(getNow()).getTime()) {
                    dayButton.classList.add('is-today');
                }

                if (startOfDay(dayDate).getTime() === startOfDay(draftDate).getTime()) {
                    dayButton.classList.add('is-selected');
                }

                if (!dayButton.disabled) {
                    dayButton.addEventListener('click', function () {
                        draftDate = new Date(
                            dayDate.getFullYear(),
                            dayDate.getMonth(),
                            dayDate.getDate(),
                            Number(hoursSelect.value),
                            Number(minutesSelect.value),
                            0,
                            0
                        );

                        normalizeDraftAgainstMin();
                        syncTimeSelectors();
                        visibleMonth = new Date(draftDate.getFullYear(), draftDate.getMonth(), 1);
                        renderCalendar();
                    });
                }

                calendarGrid.appendChild(dayButton);
            }
        }

        function openModal() {
            dueDateInput.min = formatDateValue(getMinSelectableDate());

            selectedDate = parseDateValue(dueDateInput.value);
            draftDate = selectedDate ? new Date(selectedDate) : new Date(getMinSelectableDate());

            normalizeDraftAgainstMin();
            visibleMonth = new Date(draftDate.getFullYear(), draftDate.getMonth(), 1);
            syncTimeSelectors();
            renderCalendar();

            modal.hidden = false;
            document.body.style.overflow = 'hidden';
        }

        function closeModal() {
            modal.hidden = true;
            document.body.style.overflow = '';
        }

        populateTimeOptions();
        syncTimeSelectors();
        renderCalendar();

        // Override server-set value with device time for NEW tasks only
        if (formCfg.isNewTask) {
            const deviceMin = getMinSelectableDate();
            dueDateInput.value = formatDateValue(deviceMin);
            dueDateInput.min = formatDateValue(deviceMin);
            selectedDate = new Date(deviceMin);
            draftDate = new Date(deviceMin);
            visibleMonth = new Date(draftDate.getFullYear(), draftDate.getMonth(), 1);
            syncTimeSelectors();
            renderCalendar();
        }

        dueDateInput.addEventListener('click', function (event) {
            event.preventDefault();
            openModal();
        });

        dueDateInput.addEventListener('focus', function () {
            dueDateInput.blur();
        });

        dueDateInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openModal();
            }
        });

        backdrop.addEventListener('click', closeModal);
        closeButton.addEventListener('click', closeModal);
        cancelButton.addEventListener('click', closeModal);

        applyButton.addEventListener('click', function () {
            updateDraftTimeFromSelectors();

            if (isInvalidPastDate(draftDate)) {
                draftDate = new Date(getMinSelectableDate());
                syncTimeSelectors();
                renderCalendar();
                return;
            }

            dueDateInput.value = formatDateValue(draftDate);
            dueDateInput.min = formatDateValue(getMinSelectableDate());
            closeModal();
        });

        prevMonthButton.addEventListener('click', function () {
            const candidateMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
            const currentMonthStart = new Date(getMinSelectableDate().getFullYear(), getMinSelectableDate().getMonth(), 1);

            if (candidateMonth < currentMonthStart) {
                return;
            }

            visibleMonth = candidateMonth;
            renderCalendar();
        });

        nextMonthButton.addEventListener('click', function () {
            visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
            renderCalendar();
        });

        hoursSelect.addEventListener('change', function () {
            updateDraftTimeFromSelectors();
        });

        minutesSelect.addEventListener('change', function () {
            updateDraftTimeFromSelectors();
        });

        form.addEventListener('submit', function (event) {
            const parsed = parseDateValue(dueDateInput.value);
            const minDate = getMinSelectableDate();

            dueDateInput.min = formatDateValue(minDate);

            if (!parsed || isInvalidPastDate(parsed)) {
                event.preventDefault();
                dueDateInput.value = formatDateValue(minDate);
                selectedDate = new Date(minDate);
                draftDate = new Date(minDate);
                showAlert('Дата выполнения не может быть в прошлом. Выбери актуальную дату.', 'warning');
                dueDateInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && !modal.hidden) {
                closeModal();
            }
        });
    })();

    (function () {
        const isFavInput = document.getElementById('is-favorite-input');
        const favoriteBtn = document.getElementById('favorite-toggle-btn');
        const listTiles = document.querySelectorAll('.task-list-tile');
        const taskListInput = document.getElementById('selected-list');
        const favBtnText = favoriteBtn ? favoriteBtn.querySelector('span') : null;

        if (!favoriteBtn || !isFavInput) return;

        function updateFavoriteBtn() {
            const isFavorite = isFavInput.value === 'on';
            if (isFavorite) {
                favoriteBtn.classList.add('is-favorite');
                if (favBtnText) favBtnText.textContent = 'В избранном';
            } else {
                favoriteBtn.classList.remove('is-favorite');
                if (favBtnText) favBtnText.textContent = 'В избранное';
            }
        }

        function updateSelectedTile() {
            listTiles.forEach(function (tile) {
                tile.classList.remove('is-selected');
            });
            const selectedList = taskListInput.value;
            const selectedTile = document.querySelector(`.task-list-tile[data-list="${selectedList}"]`);
            if (selectedTile) {
                selectedTile.classList.add('is-selected');
            }
        }

        favoriteBtn.addEventListener('click', function (e) {
            e.preventDefault();
            isFavInput.value = isFavInput.value === 'on' ? 'off' : 'on';
            updateFavoriteBtn();
        });

        listTiles.forEach(function (tile) {
            tile.addEventListener('click', function (e) {
                e.preventDefault();
                taskListInput.value = tile.getAttribute('data-list');
                updateSelectedTile();
            });
        });

        updateFavoriteBtn();
        updateSelectedTile();
    })();

    // Update sidebar counters every 60 seconds
    (function () {
        function updateSidebarCounters(counters) {
            if (!counters) return;
            Object.keys(counters).forEach(function (key) {
                var els = document.querySelectorAll('[data-counter="' + key + '"]');
                els.forEach(function (el) { el.textContent = counters[key] ?? el.textContent; });
            });
        }
        setInterval(function () {
            fetch('/api/tasks-data/')
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data.status === 'success') updateSidebarCounters(data.counters);
                })
                .catch(function () {});
        }, 60000);
    })();

    (function () {
        function redirectHome() {
            window.location.replace('/');
        }

        var isBack = false;
        try {
            var e = performance.getEntriesByType('navigation');
            if (e.length && e[0].type === 'back_forward') isBack = true;
        } catch (_) {}
        if (!isBack && window.performance && window.performance.navigation) {
            if (window.performance.navigation.type === 2) isBack = true;
        }
        if (isBack) { redirectHome(); return; }

        window.addEventListener('pageshow', function (e) {
            if (e.persisted) redirectHome();
        });
    })();
