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

dist/%.js: src/%.js src/common/* src/%/*
	mkdir -p dist
	browserify src/$*.js --standalone $(shell echo $* | tr a-z A-Z) > $@

dist/%.min.js: dist/%.js
	echo '/* $(shell echo $* | tr a-z A-Z) v$(shell jq -r .version -- package.json) https://github.com/curiousdannii/ifvms.js */' > $@
	babili dist/$*.js >> $@

lint:
	eslint --ignore-path .gitignore .

tests/regtest.py:
	$(CURL) -o tests/regtest.py https://raw.githubusercontent.com/erkyrath/plotex/master/regtest.py

# Run the test suite
test: dist/zvm.min.js tests/regtest.py
	cd tests && python regtest.py praxix.regtest
	cd tests && python regtest.py praxix-bundled.regtest
	cd tests && python regtest.py curses.regtest
