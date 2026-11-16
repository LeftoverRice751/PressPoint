// Masonite's `strong` rule defaults, which PasswordResetController enforces
// and app/services/PasswordChange.py spells out. The reset page's meter used to
// check one digit and one symbol and ignore case entirely, so it called
// "Password1!" strong while the server refused it — the user saw a green bar and
// a "must be strong" error. tests/js/password-policy.test.mjs pins these to the
// Python constants.
export const MIN_LENGTH = 8;
export const MIN_UPPER = 2;
export const MIN_LOWER = 2;
export const MIN_DIGITS = 2;
export const MIN_SYMBOLS = 2;
export const RULE_COUNT = 5;

function count(str, test) {
  let n = 0;
  for (const c of str) if (test(c)) n++;
  return n;
}

// Same tests as PasswordChange.policy_errors (str.isupper/islower/isdigit and
// "not alphanumeric" for symbols, which is Masonite's [^A-Za-z0-9] for ASCII).
export function missingRules(password) {
  const pw = password || '';
  const missing = [];
  if (pw.length < MIN_LENGTH) missing.push(MIN_LENGTH + '+ characters');
  if (count(pw, (c) => c !== c.toLowerCase() && c === c.toUpperCase()) < MIN_UPPER) {
    missing.push(MIN_UPPER + ' uppercase');
  }
  if (count(pw, (c) => c !== c.toUpperCase() && c === c.toLowerCase()) < MIN_LOWER) {
    missing.push(MIN_LOWER + ' lowercase');
  }
  if (count(pw, (c) => /\d/.test(c)) < MIN_DIGITS) missing.push(MIN_DIGITS + ' numbers');
  if (count(pw, (c) => /[^A-Za-z0-9]/.test(c)) < MIN_SYMBOLS) {
    missing.push(MIN_SYMBOLS + ' symbols');
  }
  return missing;
}
