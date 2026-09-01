(function () {
    var passwordInput = document.getElementById('password');
    var confirmInput  = document.getElementById('password_confirmation');
    var bar           = document.getElementById('password-strength-bar');
    var label         = document.getElementById('password-strength-label');

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
        // Token names, not hexes: an inline style resolves var() against the element,
        // so the meter follows [data-theme="gears"] like everything else.
        var color = score < 2 ? 'var(--danger)' : score === 2 ? 'var(--warn)' : 'var(--ok)';

        bar.style.width           = width + '%';
        bar.style.backgroundColor = color;

        var missing = [];
        if (!evaluation.requirements.length)  missing.push('8+ chars');
        if (!evaluation.requirements.number)  missing.push('number');
        if (!evaluation.requirements.special) missing.push('special char');

        if (score === 3) {
            label.textContent  = 'Strong password.';
            label.style.color  = 'var(--ok)';
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
