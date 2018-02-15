import assert from "assert";
import {readFileSync, existsSync} from "fs";
import {resolve, dirname, extname} from "path";

import memoize from "fast-memoize";
import serialize from "babel-literal-to-ast";
import uuid from "uuid/v4";
import changeCase from "change-case";
import {parse} from "gonzales-pe";
import {renderSync} from "node-sass";

//
const EXT_RE = /\.scss|\.sass/;

//
const RAND = uuid();

//
const DEFAULT_OPTS = Object.freeze({
    sassCase: null,
    outputCase: null,
});

export default function({types: t}, opts) {
    opts = Object.assign({}, DEFAULT_OPTS, opts);

    let sassCase = opts.sassCase ?
        changeCase[opts.sassCase] : sameCase;
    let outputCase = opts.outputCase ?
        changeCase[opts.outputCase] : sameCase;

    let extractNames = memoize(absPath => (
        genCssProps(new VarNames(absPath).extract())
    ));

    let extractVars = memoize((absPath, names) => (
        new SassVars(absPath, names, outputCase).extract()
    ));

    let visitor = {
        ImportDeclaration(astPath, {file}) {
            let importPath = astPath.node.source.value;

            if (!EXT_RE.test(importPath)) {
                return;
            }

            let absPath = resolveAbsPath(file.opts.filename, importPath);
            let specs = astPath.node.specifiers;
            let replace = [];

            if (t.isImportDefaultSpecifier(specs[0])) {
                let names = extractNames(absPath);
                let vars = extractVars(absPath, names);

                replace.push(t.variableDeclaration("const", [
                    t.variableDeclarator(specs[0].local, t.callExpression(
                        t.memberExpression(
                            t.identifier("Object"),
                            t.identifier("freeze")
                        ),
                        [serialize(vars)]
                    )),
                ]));

                specs.shift();
            }

            if (specs.length > 0) {
                let names = genCssProps(specs.map(node => (
                    sassCase(node.imported.name)
                )));

                let vars = extractVars(absPath, names);

                specs.forEach(node => {
                    replace.push(t.variableDeclaration("const", [
                        t.variableDeclarator(
                            node.local,
                            serialize(vars[outputCase(node.imported.name)])
                        )
                    ]));
                });
            }

            astPath.replaceWithMultiple(replace);
        },
        CallExpression(astPath, {file}) {
            let calleeName = astPath.node.callee.name;

            if (calleeName !== "require") {
                return;
            }

            let args = astPath.node.arguments;

            if (args.length !== 1 || !t.isStringLiteral(args[0])) {
                return;
            }

            let importPath = args[0].value;

            if (!EXT_RE.test(importPath)) {
                return;
            }

            let absPath = resolveAbsPath(file.opts.filename, importPath);
            let names = extractNames(absPath);
            let vars = extractVars(absPath, names);

            astPath.replaceWith(serialize(vars));
        }
    };

    return {visitor};
}

class SassVars {
    constructor(initPath, names, caseFn) {
        this._initPath = initPath;
        this._names = names;
        this._caseFn = caseFn;
        this._vars = {};
    }

    extract() {
        let result = renderSync({
            data: this._buildSassData(),
            outputStyle: "expanded",
        });

        let output = result.css.toString();
        this._processOutput(output);

        return this._vars;
    }

    _processOutput(buf) {
        Object.entries(this._names).forEach(([name, prop]) => {
            let idx = buf.indexOf(prop);
            assert(idx >= 0);

            let end = idx + prop.length;
            assert(buf[end] === ":");

            let endIdx = buf.indexOf(";", idx);
            assert(endIdx >= 0);

            let val = buf.slice(end + 2, endIdx);
            this._vars[this._caseFn(name)] = val;
        });
    }

    _buildSassData() {
        let str = [];

        str.push(`@import "${this._initPath}";\n`);
        str.push(`#vars_${RAND} {\n`);

        Object.entries(this._names).forEach(([name, prop]) => {
            str.push(`${prop}: inspect($${name});\n`);
        });

        str.push("}");

        return str.join("");
    }

}

class VarNames {
    constructor(absPath) {
        this._initPath = absPath;
        this._names = new Set();
    }

    extract() {
        this._extractNames(this._initPath);
        return this._names;
    }

    _extractNames(filePath) {
        var [filePath, syntax] = fileSyntax(filePath);
        var contents = readFileSync(filePath, {encoding: "utf8"});

        parse(contents, {syntax}).forEach(node => {
            switch (node.type) {
            case "atrule":
                this._processImport(node, filePath);
            break;
            case "declaration":
                this._processDecl(node);
            break;
            }
        });
    }

    _processDecl(node) {
        let name = this._getName(node);
        this._names.add(name);
    }

    _getName(node) {
        let propNode = node.content[0];
        let varNode = propNode.content[0];
        let identNode = varNode.content[0];

        return identNode.content;
    }

    _processImport(node, filePath) {
        let kwNode = node.first("atkeyword");

        if (kwNode === null) {
            return;
        }

        let identNode = kwNode.content[0]

        if (identNode.content !== "import") {
            return;
        }

        let pathNode = node.first("string");

        if (pathNode === null) {
            return;
        }

        let importPath = pathNode.content.slice(1, -1);
        let absPath = resolveAbsPath(filePath, importPath);

        this._extractNames(absPath);
    }
}

function resolveAbsPath(requiringPath, importPath) {
    return resolve(dirname(requiringPath), importPath);
}

function fileSyntax(path) {
    let ext = extname(path);

    switch (ext) {
    case ".sass": return [path, "sass"];
    case ".scss": return [path, "scss"];
    case "":
        for (let testExt of ["sass", "scss"]) {
            let testPath = `${path}.${testExt}`;

            if (existsSync(testPath)) {
                return [testPath, testExt];
            }
        }

        throw new Error(`invalid import ${path}`);
    }

    throw new Error(`unknown file extension ${ext}`);
}

function genCssProps(names) {
    let props = {};

    names.forEach(name => {
        props[name] = `--${name}_${RAND}`;
    });

    return props;
}

function sameCase(x) {
    return x;
}

if (process.env.NODE_ENV === "test") {
    let {assert} = require("chai");

    test("fileSyntax", () => {
        assert.equal(fileSyntax("abc.scss"), "scss");
        assert.equal(fileSyntax("abc.sass"), "sass");
        assert.throws(() => fileSyntax("abc."));
        assert.throws(() => fileSyntax("abc.html"));
    });
}
