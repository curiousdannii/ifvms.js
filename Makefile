# Makefile for testing ifvms.js

# Default to running multiple jobs
JOBS := $(shell nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)
MAKEFLAGS = "-j $(JOBS)"

# Add node bin scripts to path
PATH := $(shell npm bin):$(PATH)

CURL = curl -L -s -S

# Mark which rules are not actually generating files
.PHONY: all clean lint test

all: lint test

clean:
	rm -rf dist
	rm tests/regtest.py

dist/zvm.js: src/zvm.js src/common/* src/zvm/*
	mkdir -p dist
	browserify src/zvm.js --standalone ZVM > dist/zvm.js

dist/zvm.min.js: dist/zvm.js
	uglifyjs dist/zvm.js -c warnings=false -m --preamble '/* ZVM v$(shell jq -r .version -- package.json) https://github.com/curiousdannii/ifvms.js */' > dist/zvm.min.js

lint:
	eslint --ignore-path .gitignore .

tests/regtest.py:
	$(CURL) -o tests/regtest.py https://raw.githubusercontent.com/erkyrath/plotex/master/regtest.py

# Run the test suite
test: dist/zvm.js tests/regtest.py
	cd tests && python regtest.py praxix.regtest
	cd tests && python regtest.py praxix-bundled.regtest
	cd tests && python regtest.py curses.regtest
