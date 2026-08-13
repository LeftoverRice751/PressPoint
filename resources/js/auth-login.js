(function () {
    var EYE_OPEN  = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    var EYE_SLASH = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';

    function updateIcon(toggle, showing) {
        var svg = toggle.querySelector('svg');
        if (svg) svg.innerHTML = showing ? EYE_SLASH : EYE_OPEN;
        toggle.setAttribute('aria-label', showing ? 'Hide password' : 'Show password');
    }

    Array.from(document.querySelectorAll('[data-password-toggle]')).forEach(function (toggle) {
        var targetId = toggle.getAttribute('data-password-toggle');
        var input = document.getElementById(targetId);
        if (!toggle || !input) return;

        toggle.addEventListener('click', function () {
            var showing = input.type === 'text';
            input.type = showing ? 'password' : 'text';
            updateIcon(toggle, !showing);
        });
    });

    // "Show password" checkbox — toggles one or more password inputs
    // (space-separated ids in data-toggle-password) between hidden/visible.
    Array.from(document.querySelectorAll('[data-toggle-password]')).forEach(function (checkbox) {
        var ids = (checkbox.getAttribute('data-toggle-password') || '').split(/\s+/).filter(Boolean);
        var inputs = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
        if (!inputs.length) return;

        checkbox.addEventListener('change', function () {
            inputs.forEach(function (input) {
                input.type = checkbox.checked ? 'text' : 'password';
            });
        });
    });
})();
