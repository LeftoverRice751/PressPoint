import { missingRules, RULE_COUNT } from './password-policy.mjs';

(function () {
    var passwordInput = document.getElementById('password');
    var confirmInput  = document.getElementById('password_confirmation');
    var bar           = document.getElementById('password-strength-bar');
    var label         = document.getElementById('password-strength-label');

    function updateStrength() {
        var password = passwordInput.value || '';
        var missing  = missingRules(password);
        var met      = RULE_COUNT - missing.length;

        var width = password ? (met / RULE_COUNT) * 100 : 0;
        // Token names, not hexes: an inline style resolves var() against the element,
        // so the meter follows [data-theme="gears"] like everything else.
        var color = met < 3 ? 'var(--danger)' : met < RULE_COUNT ? 'var(--warn)' : 'var(--ok)';

        bar.style.width           = width + '%';
        bar.style.backgroundColor = color;

        if (!missing.length) {
            label.textContent = 'Strong password.';
            label.style.color = 'var(--ok)';
        } else {
            label.textContent = 'Needs: ' + missing.join(', ');
            label.style.color = '';
        }

        // Block a submit the server would refuse, instead of round-tripping to
        // an error page.
        passwordInput.setCustomValidity(
            password && missing.length ? 'Password needs: ' + missing.join(', ') + '.' : ''
        );
    }

    function updateMatch() {
        if (!passwordInput.value || !confirmInput.value) {
            confirmInput.setCustomValidity('');
            return;
        }
        confirmInput.setCustomValidity(
            passwordInput.value === confirmInput.value ? '' : 'Passwords do not match.'
        );
    }

    if (passwordInput) {
        passwordInput.addEventListener('input', updateStrength);
        updateStrength();
    }

    if (confirmInput) {
        confirmInput.addEventListener('input', updateMatch);
        // Editing the first field after the second must re-check the match too.
        if (passwordInput) passwordInput.addEventListener('input', updateMatch);
    }
})();
