(function () {
    document.querySelectorAll('.profile-field input, .profile-field select, .profile-field textarea').forEach(function (el) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
            if (!el.classList.contains('input') && !el.classList.contains('textarea') && !el.classList.contains('select')) {
                if (el.type === 'checkbox') return;
                el.classList.add(el.tagName === 'TEXTAREA' ? 'textarea' : el.tagName === 'SELECT' ? 'select' : 'input');
            }
        }
    });

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

    window.exitEditMode = function() {
        document.getElementById('edit-mode').style.display = 'none';
        document.getElementById('view-mode').style.display = 'block';
    };
})();
