(function () {
            var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (document.cookie.indexOf('browser_timezone=' + encodeURIComponent(tz)) === -1) {
                document.cookie = 'browser_timezone=' + encodeURIComponent(tz) + '; path=/; max-age=31536000';
            }
        })();

        window.dismissToast = function (el) {
            el.classList.add('is-hiding');
            el.addEventListener('animationend', function () { el.remove(); }, { once: true });
        };

        function escHtml(str) {
            if (!str) return '';
            var div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }

        (function () {
            const root = document.documentElement;
            const select = document.getElementById('themeSelect');
            const themeBtn = document.getElementById('theme-toggle-btn');
            const allowedThemes = ['light', 'dark'];
            const storedTheme = localStorage.getItem('home_ai_theme') || 'light';

            function applyTheme(theme) {
                const nextTheme = allowedThemes.includes(theme) ? theme : 'light';
                root.setAttribute('data-theme', nextTheme);
                if (select) {
                    select.value = nextTheme;
                }
                localStorage.setItem('home_ai_theme', nextTheme);
            }

            applyTheme(storedTheme);

            if (select) {
                select.addEventListener('change', function () {
                    applyTheme(this.value);
                });
            }

            if (themeBtn) {
                themeBtn.addEventListener('click', function () {
                    const currentTheme = root.getAttribute('data-theme') || 'light';
                    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
                    applyTheme(nextTheme);
                });
            }

            document.querySelectorAll('.toast').forEach(function (toast) {
                const closeBtn = toast.querySelector('.toast__close');
                if (closeBtn) {
                    closeBtn.addEventListener('click', function () { window.dismissToast(toast); });
                }
                setTimeout(function () {
                    if (toast.isConnected) { window.dismissToast(toast); }
                }, 4200);
            });
        })();

        (function () {
            const btn = document.getElementById('user-menu-btn');
            const dropdown = document.getElementById('user-menu-dropdown');
            if (!btn || !dropdown) return;

            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
            });

            document.addEventListener('click', function () {
                dropdown.style.display = 'none';
            });
        })();

        // Clear session storage when clicking on "Задачи" in sidebar
        document.addEventListener('DOMContentLoaded', function () {
            const cfg = window.HOME_AI_CONFIG || {};
            const homeLink = document.querySelector('a[href="' + cfg.homeUrl + '"]');
            if (homeLink) {
                homeLink.addEventListener('click', function () {
                    sessionStorage.removeItem('selectedTaskView');
                    sessionStorage.removeItem('openedTaskId');
                });
            }
        });

        // ── Notifications ──
        (function () {
            const userId = (window.HOME_AI_CONFIG || {}).userId;
            if (!userId) return;
            const notifBtn = document.getElementById('notif-btn');
            const notifDropdown = document.getElementById('notif-dropdown');
            const notifList = document.getElementById('notif-list');
            const notifBadge = document.getElementById('notif-badge');
            const notifClearAll = document.getElementById('notif-clear-all');

            if (!notifBtn) return;

            let notifications = [];
            let ws = null;
            let notifServiceAvailable = true;
            const NOTIF_TIMEOUT = 10000; // 10s

            // Notification service URL (port 8003 locally, proxied via nginx in prod)
            const notifBase = window.location.origin;
            const wsBase = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host;

            const NOTIF_ICONS = {
                'task.created': { icon: '📋', bg: 'color-mix(in srgb, var(--primary) 14%, var(--surface))', color: 'var(--primary)' },
                'task.completed': { icon: '✅', bg: 'color-mix(in srgb, var(--success) 14%, var(--surface))', color: 'var(--success)' },
                'subtask.generated': { icon: '🤖', bg: 'color-mix(in srgb, var(--warning) 14%, var(--surface))', color: 'var(--warning)' },
                'task.overdue': { icon: '⏰', bg: 'color-mix(in srgb, var(--danger) 14%, var(--surface))', color: 'var(--danger)' },
                'task.restored': { icon: '↩️', bg: 'color-mix(in srgb, var(--primary) 14%, var(--surface))', color: 'var(--primary)' },
                'task.updated': { icon: '✏️', bg: 'color-mix(in srgb, var(--primary) 14%, var(--surface))', color: 'var(--primary)' },
                'task.deleted': { icon: '🗑️', bg: 'color-mix(in srgb, var(--danger) 14%, var(--surface))', color: 'var(--danger)' },
                'tasks.cleared': { icon: '🧹', bg: 'color-mix(in srgb, var(--success) 14%, var(--surface))', color: 'var(--success)' },
                'task.reminder': { icon: '⏳', bg: 'color-mix(in srgb, var(--primary) 14%, var(--surface))', color: 'var(--primary)' },
                'suggestion.created': { icon: '💡', bg: 'color-mix(in srgb, var(--suggestions) 14%, var(--surface))', color: 'var(--suggestions)' },
            };
            const DEFAULT_ICON = { icon: '🔔', bg: 'color-mix(in srgb, var(--primary) 14%, var(--surface))', color: 'var(--primary)' };

            function getNotifIcon(type) {
                return NOTIF_ICONS[type] || DEFAULT_ICON;
            }

            function timeAgo(dateStr) {
                const now = new Date();
                const d = new Date(dateStr);
                const diff = Math.floor((now - d) / 1000);
                if (diff < 60) return 'только что';
                if (diff < 3600) return Math.floor(diff / 60) + 'м';
                if (diff < 86400) return Math.floor(diff / 3600) + 'ч';
                const days = Math.floor(diff / 86400);
                return days + 'д';
            }

            function updateBadge() {
                const unread = notifications.filter(function (n) { return !n.read; }).length;
                if (unread > 0) {
                    notifBadge.textContent = unread > 99 ? '99+' : unread;
                    notifBadge.classList.remove('is-hidden');
                } else {
                    notifBadge.classList.add('is-hidden');
                }
            }

            function renderNotifications() {
                if (notifications.length === 0) {
                    notifList.innerHTML = '<div class="notif-dropdown__empty">Нет уведомлений</div>';
                    return;
                }
                var html = '';
                notifications.forEach(function (n) {
                    var meta = getNotifIcon(n.type);
                    var cls = n.read ? '' : ' notif-item--unread';
                    html += '<div class="notif-item' + cls + '" data-notif-key="' + (n.id || '') + '">'
                        + '<div class="notif-item__icon" style="background:' + meta.bg + ';color:' + meta.color + ';">' + meta.icon + '</div>'
                        + '<div class="notif-item__body">'
                        + '<div class="notif-item__title">' + escHtml(n.title) + '</div>'
                        + '<p class="notif-item__message">' + escHtml(n.message) + '</p>'
                        + '</div>'
                        + '<span class="notif-item__time">' + timeAgo(n.created_at) + '</span>'
                        + '</div>';
                });
                notifList.innerHTML = html;
                updateBadge();
            }

            function addNotification(n) {
                notifications = notifications.filter(function (x) { return x.id !== n.id; });
                n.read = notifDropdown.classList.contains('is-open');
                notifications.unshift(n);
                renderNotifications();

                // Обновляем счётчик предложений в Прогрессе
                if (n.type === 'suggestion.created') {
                    var counterEls = document.querySelectorAll('[data-counter="suggestions_count"]');
                    counterEls.forEach(function (el) {
                        var cur = parseInt(el.textContent) || 0;
                        el.textContent = cur + 1;
                    });
                }
            }

            function fetchNotifications() {
                if (!notifServiceAvailable) return Promise.reject('service unavailable');
                return Promise.race([
                    fetch(notifBase + '/api/notifications/user/' + userId + '?limit=50'),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NOTIF_TIMEOUT))
                ])
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data.notifications) {
                        notifications = data.notifications.map(function (n) {
                            var key = n.user_id + ':' + n.created_at;
                            n.id = key;
                            return n;
                        });
                        renderNotifications();
                    }
                })
                .catch(function (err) {
                    notifServiceAvailable = false;
                    if (notifBadge) notifBadge.classList.add('is-hidden');
                    // Don't hide the button - keep it visible even if fetch fails
                });
            }

            function timedFetch(url, opts) {
                if (!notifServiceAvailable) return Promise.reject('service unavailable');
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), NOTIF_TIMEOUT);
                return fetch(url, { ...opts, signal: controller.signal })
                    .finally(() => clearTimeout(timeout));
            }

            function connectWebSocket() {
                if (!notifServiceAvailable) return;
                let wsTimeout = setTimeout(function () {
                    if (ws) { try { ws.close(); } catch (_) {} }
                    notifServiceAvailable = false;
                    // Don't hide the button - keep it visible even if WebSocket fails
                }, NOTIF_TIMEOUT);

                try {
                    ws = new WebSocket(wsBase + '/ws/notifications/' + userId);

                    ws.onopen = function () {
                        clearTimeout(wsTimeout);
                    };

                    ws.onerror = function (err) {
                        clearTimeout(wsTimeout);
                        notifServiceAvailable = false;
                        // Don't hide the button - keep it visible even if WebSocket fails
                        try { ws.close(); } catch (_) {}
                    };

                    ws.onclose = function () {
                        clearTimeout(wsTimeout);
                        ws = null;
                        if (notifServiceAvailable) {
                            setTimeout(connectWebSocket, 3000);
                        }
                    };

                    ws.onmessage = function (event) {
                        try {
                            var msg = JSON.parse(event.data);
                            if (msg.type === 'notification' && msg.notification) {
                                addNotification(msg.notification);
                            }
                        } catch (e) {}
                    };
                } catch (err) {
                    clearTimeout(wsTimeout);
                    notifServiceAvailable = false;
                    // Don't hide the button - keep it visible even if WebSocket fails
                }
            }

            function positionDropdown() {
                var rect = notifBtn.getBoundingClientRect();
                var top = rect.bottom + 8;
                var left = rect.left;
                // Don't go off-screen
                if (left + 340 > window.innerWidth) {
                    left = window.innerWidth - 340 - 8;
                }
                notifDropdown.style.top = top + 'px';
                notifDropdown.style.left = left + 'px';
            }

            function setupBellHandler() {
                notifBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var isOpen = notifDropdown.classList.contains('is-open');
                    if (isOpen) {
                        notifDropdown.classList.remove('is-open');
                    } else {
                        positionDropdown();
                        notifDropdown.classList.add('is-open');
                        notifications.forEach(function (n) { n.read = true; });
                        updateBadge();
                        timedFetch(notifBase + '/api/notifications/user/' + userId + '/read-all', { method: 'POST' }).catch(function () {});
                    }
                });
            }

            fetchNotifications().then(function () {
                setupBellHandler();
                if (notifServiceAvailable) {
                    connectWebSocket();
                }
            }).catch(function () {
                setupBellHandler();
                // WebSocket не подключаем — сервис недоступен
            });

            document.addEventListener('click', function (e) {
                if (!notifDropdown.contains(e.target) && e.target !== notifBtn && !notifBtn.contains(e.target)) {
                    notifDropdown.classList.remove('is-open');
                }
            });

            window.addEventListener('resize', function () {
                if (notifDropdown.classList.contains('is-open')) {
                    positionDropdown();
                }
            });
            window.addEventListener('scroll', function () {
                if (notifDropdown.classList.contains('is-open')) {
                    positionDropdown();
                }
            }, true);

            if (notifClearAll) {
                notifClearAll.addEventListener('click', function () {
                    notifications = [];
                    renderNotifications();
                    timedFetch(notifBase + '/api/notifications/user/' + userId, { method: 'DELETE' }).catch(function () {});
                    notifDropdown.classList.remove('is-open');
                });
            }
        })();

        // ── Confirm Modal (global) ──
        const confirmModal = document.getElementById('confirm-modal');
        if (confirmModal) {
            const confirmModalTitle = document.getElementById('confirm-modal-title');
            const confirmModalText = document.getElementById('confirm-modal-text');
            let confirmAction = null;

            window.showConfirmModal = function (title, text, onConfirm, confirmText, confirmClass) {
                confirmModalTitle.textContent = title;
                confirmModalText.textContent = text;
                confirmAction = onConfirm;
                var confirmBtn = document.getElementById('confirm-modal-confirm');
                confirmBtn.textContent = confirmText || 'Удалить';
                confirmBtn.className = 'button button--' + (confirmClass || 'danger');
                confirmModal.classList.add('is-open');
            };

            function closeConfirmModal() {
                confirmModal.classList.remove('is-open');
                confirmAction = null;
            }

            document.getElementById('confirm-modal-cancel').addEventListener('click', closeConfirmModal);
            document.getElementById('confirm-modal-confirm').addEventListener('click', function () {
                if (confirmAction) confirmAction();
                closeConfirmModal();
            });
            confirmModal.addEventListener('click', function (e) {
                if (e.target === confirmModal) closeConfirmModal();
            });
        }
