export PATH := $(PWD)/node_modules/.bin/:$(PATH)

all: build

build:
	babel -d lib src/index.js

test:
	NODE_ENV=test mocha --recursive --require .babel-mocha -u qunit src

lint:
	eslint src

.PHONY: all build test lint
