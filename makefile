# All Python runs through the in-repo virtualenv; there is no activation step.
# `python` bare used to be enough only if you had already sourced venv/bin/activate,
# which is why `make lint` behaved differently for different people.
PY := venv/bin/python

.PHONY: init init-dev lint format test test-js assets serve audit ci

init:
	$(PY) -m pip install -r requirements.txt

init-dev:
	$(PY) -m pip install -r requirements.txt -r requirements-dev.txt

lint:
	$(PY) -m flake8 .

format:
	$(PY) -m black .
	$(MAKE) lint

test:
	$(PY) -m pytest tests/unit -q

test-js:
	npm run test:js

# Production asset build. Needs Node 18 (.nvmrc); under a newer default node
# the build dies with "require is not defined in ES module scope" from yargs.
assets:
	npm run prod

serve:
	$(PY) craft serve

# Dependency and static security scans (SECURITY.md W6). The `security` CI job
# runs exactly this target, so a red job reproduces here in one command.
#
# Every ignored advisory is one this repo cannot fix and whose vulnerable code
# PressPoint never calls. Re-check each when the reason stops being true:
#   cryptography PYSEC-2026-3552  PKCS#7 decryption (pkcs7_decrypt_*): unused.
#   cryptography PYSEC-2026-3553  X.509 chain building in cryptography's own
#   cryptography PYSEC-2026-3554  verifier: unused -- outbound TLS goes through
#                                 the stdlib ssl module. All three are fixed in
#                                 cryptography>=49/50, which masonite-framework
#                                 5.4.1 caps at <49; drop them on that upgrade.
#   twisted GHSA-8pqf-f4m5-798g   IMAP4 server wildcard matching: unused. Twisted
#                                 arrives only via roslibpy (FusionServices); no
#                                 fixed release exists yet.
PIP_AUDIT_IGNORES := PYSEC-2026-3552 PYSEC-2026-3553 PYSEC-2026-3554 GHSA-8pqf-f4m5-798g

audit:
	$(PY) -m pip_audit -r requirements.txt -r requirements-dev.txt --progress-spinner off \
		$(foreach id,$(PIP_AUDIT_IGNORES),--ignore-vuln $(id))
	$(PY) -m bandit -r app -ll -q
	npm audit --omit=dev --audit-level=high

# What CI runs, so it can be reproduced locally in one command.
ci: lint test test-js audit
