(function () {
    const toggle = document.querySelector('[data-password-toggle="password"]');
    const input = document.getElementById('password');

    if (!toggle || !input) {
        return;
    }

    toggle.addEventListener('click', function () {
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        toggle.textContent = showing ? 'See' : 'Hide';
    });
})();
