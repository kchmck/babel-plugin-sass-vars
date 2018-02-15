export PATH := $(PWD)/node_modules/.bin/:$(PATH)

MOCHA = NODE_TEST=1 mocha --recursive

TEST_DIRS = $(wildcard test/babel/*)

all: build

lib/index.js: $(wildcard src/*)
	rollup -c

build: lib/index.js

test: $(TEST_DIRS)
	$(MOCHA) --require .babel-mocha -u qunit src

$(TEST_DIRS): build
	$(MOCHA) --require $@/.babel -u qunit $@

lint:
	eslint src

.PHONY: all build test lint $(TEST_DIRS)
