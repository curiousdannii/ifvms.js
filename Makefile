# Makefile for testing ifvms.js

# Default to running multiple jobs
JOBS := $(shell nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)
MAKEFLAGS = "-j $(JOBS)"

# Location of the project so we don't cross-wire relative paths.
BASE := $(shell cd "$(shell dirname $(lastword $(MAKEFILE_LIST)))/" && pwd)

CURL = curl -L -s -S

# Mark which rules are not actually generating files
.PHONY: all clean test

all: test

clean:

# Download Praxix and regtest
tests/praxix.z5:
	$(CURL) -o tests/praxix.z5 https://github.com/curiousdannii/if/raw/gh-pages/tests/praxix.z5

tests/regtest.py:
	$(CURL) -o tests/regtest.py https://raw.githubusercontent.com/erkyrath/plotex/master/regtest.py

# Run the test suite
test: tests/praxix.z5 tests/regtest.py
	cd tests && python regtest.py praxix.regtest
