(function () {
    const passwordInput = document.getElementById('password');
    const confirmInput = document.getElementById('password_confirmation');
    const bar = document.getElementById('password-strength-bar');
    const label = document.getElementById('password-strength-label');
    const toggles = Array.from(document.querySelectorAll('.password-toggle'));

    function evaluatePassword(password) {
        const requirements = {
            length: password.length >= 8,
            number: /\d/.test(password),
            special: /[^A-Za-z0-9]/.test(password),
        };

        const score = Object.values(requirements).filter(Boolean).length;
        return { requirements: requirements, score: score };
    }

    function updateStrength() {
        const password = passwordInput.value || '';
        const evaluation = evaluatePassword(password);
        const score = evaluation.score;

        const width = score === 0 ? 0 : score === 1 ? 33 : score === 2 ? 66 : 100;
        const color = score < 2 ? '#dc2626' : score === 2 ? '#d97706' : '#16a34a';

        bar.style.width = width + '%';
        bar.style.backgroundColor = color;

        const missing = [];
        if (!evaluation.requirements.length) missing.push('8+ chars');
        if (!evaluation.requirements.number) missing.push('number');
        if (!evaluation.requirements.special) missing.push('special char');

        if (score === 3) {
            label.textContent = 'Strong password.';
            label.style.color = '#166534';
        } else {
            label.textContent = 'Needs: ' + missing.join(', ');
            label.style.color = '#6b7280';
        }
    }

    toggles.forEach(function (toggle) {
        toggle.addEventListener('click', function () {
            const targetId = toggle.getAttribute('data-password-toggle');
            const target = document.getElementById(targetId);
            if (!target) {
                return;
            }

            const showing = target.type === 'text';
            target.type = showing ? 'password' : 'text';
            toggle.textContent = showing ? 'See' : 'Hide';
        });
    });

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
