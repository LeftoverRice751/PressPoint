# All Python runs through the in-repo virtualenv; there is no activation step.
# `python` bare used to be enough only if you had already sourced venv/bin/activate,
# which is why `make lint` behaved differently for different people.
PY := venv/bin/python

.PHONY: init init-dev lint format test test-js assets serve ci

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

# What CI runs, so it can be reproduced locally in one command.
ci: lint test test-js
