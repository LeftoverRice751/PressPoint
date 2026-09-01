/* Reveal/hide the password from a button inside the field.
 *
 * Loaded from templates/auth/base.html rather than from each page, so any auth
 * page that grows a password field gets the behaviour without remembering a
 * script tag -- the same reason auth-shell.css is loaded from the shell. On the
 * pages with no password field (forgot-password, otp-code) the querySelectorAll
 * finds nothing and this costs one empty loop.
 *
 * `aria-pressed` is the single source of truth for the state: the glyph swap and
 * the maroon "visible" chip are both CSS off that attribute (auth-shell.css), so
 * what the button looks like and what a screen reader is told cannot drift
 * apart. It replaces a checkbox that sat in a row below the field and, on the
 * change-password page, revealed both fields at once -- so you could not check a
 * typo in Confirm without exposing the password above it.
 */
(function () {
    Array.from(document.querySelectorAll('[data-password-toggle]')).forEach(function (toggle) {
        var input = document.getElementById(toggle.getAttribute('data-password-toggle'));
        if (!input) return;

        toggle.addEventListener('click', function () {
            var showing = toggle.getAttribute('aria-pressed') === 'true';
            input.type = showing ? 'password' : 'text';
            toggle.setAttribute('aria-pressed', String(!showing));
            // The label names the ACTION the button performs, not the state it
            // is in -- that is what a screen reader reads out before the click.
            toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        });
    });
})();
