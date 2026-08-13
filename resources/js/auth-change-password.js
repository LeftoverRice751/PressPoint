(function () {
    var EYE_OPEN  = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    var EYE_SLASH = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';

    var passwordInput = document.getElementById('password');
    var confirmInput  = document.getElementById('password_confirmation');
    var bar           = document.getElementById('password-strength-bar');
    var label         = document.getElementById('password-strength-label');

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

    function evaluatePassword(password) {
        var requirements = {
            length:  password.length >= 8,
            number:  /\d/.test(password),
            special: /[^A-Za-z0-9]/.test(password),
        };
        var score = Object.values(requirements).filter(Boolean).length;
        return { requirements: requirements, score: score };
    }

    function updateStrength() {
        var password   = passwordInput.value || '';
        var evaluation = evaluatePassword(password);
        var score      = evaluation.score;

        var width = score === 0 ? 0 : score === 1 ? 33 : score === 2 ? 66 : 100;
        var color = score < 2 ? '#B11E2A' : score === 2 ? '#E89A1C' : '#2E7D32';

        bar.style.width           = width + '%';
        bar.style.backgroundColor = color;

        var missing = [];
        if (!evaluation.requirements.length)  missing.push('8+ chars');
        if (!evaluation.requirements.number)  missing.push('number');
        if (!evaluation.requirements.special) missing.push('special char');

        if (score === 3) {
            label.textContent  = 'Strong password.';
            label.style.color  = '#2E7D32';
        } else {
            label.textContent = 'Needs: ' + missing.join(', ');
            label.style.color = '';
        }
    }

    if (passwordInput) {
        passwordInput.addEventListener('input', updateStrength);
        updateStrength();
    }

    if (confirmInput) {
        confirmInput.addEventListener('input', function () {
            if (!passwordInput.value || !confirmInput.value) {
                confirmInput.setCustomValidity('');
                return;
            }
            confirmInput.setCustomValidity(
                passwordInput.value === confirmInput.value ? '' : 'Passwords do not match.'
            );
        });
    }
})();
