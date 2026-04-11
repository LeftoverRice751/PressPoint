(function () {
    const hiddenOtp = document.getElementById('otp');
    const inputs = Array.from(document.querySelectorAll('.otp-digit'));
    const form = hiddenOtp ? hiddenOtp.form : null;

    function syncOtp() {
        hiddenOtp.value = inputs.map(function (input) {
            return (input.value || '').trim();
        }).join('');
    }

    function focusNext(currentIndex) {
        if (inputs[currentIndex + 1]) {
            inputs[currentIndex + 1].focus();
        }
    }

    function focusPrevious(currentIndex) {
        if (inputs[currentIndex - 1]) {
            inputs[currentIndex - 1].focus();
        }
    }

    inputs.forEach(function (input, index) {
        input.addEventListener('input', function () {
            input.value = (input.value || '').replace(/\D/g, '').slice(0, 1);
            syncOtp();

            if (input.value) {
                focusNext(index);
            }
        });

        input.addEventListener('keydown', function (event) {
            if (event.key === 'Backspace' && !input.value) {
                focusPrevious(index);
            }
        });

        input.addEventListener('paste', function (event) {
            event.preventDefault();
            const pasted = (event.clipboardData || window.clipboardData).getData('text') || '';
            const digits = pasted.replace(/\D/g, '').slice(0, inputs.length).split('');

            digits.forEach(function (digit, digitIndex) {
                if (inputs[digitIndex]) {
                    inputs[digitIndex].value = digit;
                }
            });

            syncOtp();

            const nextEmpty = inputs.find(function (field) {
                return !field.value;
            });

            if (nextEmpty) {
                nextEmpty.focus();
            }
        });
    });

    if (form) {
        form.addEventListener('submit', function () {
            syncOtp();
        });
    }

    if (inputs[0]) {
        inputs[0].focus();
    }
})();
