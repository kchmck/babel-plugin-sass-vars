import {readFileSync, existsSync} from "fs";
import {resolve, dirname, extname} from "path";

import changeCase from "change-case";
import memoize from "fast-memoize";
import {parse} from "gonzales-pe";
import {renderSync} from "node-sass";
import serialize from "babel-literal-to-ast";
import uuid from "uuid/v4";

// Matches supported extensions.
const EXT_RE = /(?:\.scss|\.sass)$/;

// Random string to make CSS properties "unique".
const RAND = uuid();

// Default babel options.
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
    let baseDir = opts.baseDir ?
        opts.baseDir : "";

    let lookup = new VarLookup(sassCase, outputCase);

    let visitor = {
        ImportDeclaration(astPath, {file}) {
            let importPath = astPath.node.source.value;

            if (!EXT_RE.test(importPath)) {
                return;
            }

            let absPath = resolveAbsPath(resolve(file.opts.filename, baseDir), importPath);
            let specs = astPath.node.specifiers;
            let replace = [];

            if (t.isImportDefaultSpecifier(specs[0])) {
                let vars = lookup.extractAllVars(absPath);

                replace.push(t.variableDeclaration("const", [
                    t.variableDeclarator(specs[0].local, createVarsObject(t, vars)),
                ]));

                specs.shift();
            }

            if (specs.length > 0) {
                let names = specs.map(node => node.imported.name);
                let vars = lookup.extractVars(absPath, names);

                specs.forEach(node => {
                    replace.push(t.variableDeclaration("const", [
                        t.variableDeclarator(
                            node.local,
                            serialize(vars[node.imported.name])
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
            let vars = lookup.extractAllVars(absPath);

            astPath.replaceWith(createVarsObject(t, vars));
        }
    };

    return {visitor};
}

class VarLookup {
    constructor(sassCase, outputCase) {
        this._sassCase = sassCase;
        this._outputCase = outputCase;

        // Maps filenames to a dictionary of known variable name/value pairs from that
        // file.
        //
        // Each variable name is in `outputCase`.
        this._fileVars = {};

        this.extractAllVars = memoize(this._extractAllVars.bind(this));
    }

    _extractAllVars(absPath) {
        return this._extractVars(absPath, this._extractNames(absPath));
    }

    _extractNames(absPath) {
        return genCssProps(new VarNames(absPath).extract());
    }

    extractVars(absPath, names) {
        let knownVars = this._lookupVars(absPath);

        let unknownNames = [...names].filter(name => (
            !knownVars.hasOwnProperty(name)
        ));

        if (unknownNames.length === 0) {
            return knownVars;
        }

        let props = genCssProps(unknownNames.map(this._sassCase));
        let vars = this._extractVars(absPath, props);

        if (!unknownNames.every(name => vars.hasOwnProperty(name))) {
            throw new Error("import names must be in the same case as `outputCase`");
        }

        return vars;
    }

    _extractVars(absPath, props) {
        let vars = new SassVars(absPath, props, this._outputCase).extract();
        let knownVars = this._lookupVars(absPath);

        Object.assign(knownVars, vars);

        return knownVars;
    }

    _lookupVars(absPath) {
        if (!this._fileVars.hasOwnProperty(absPath)) {
            this._fileVars[absPath] = {};
        }

        return this._fileVars[absPath];
    }
}

class SassVars {
    constructor(initPath, nameProps, caseFn) {
        this._initPath = initPath;
        this._namesProps = nameProps;
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
        parse(buf).traverse((node, idx, parent) => {
            if (node.type !== "customProperty") {
                return;
            }

            let ident = node.content[0].content;
            let name = this._namesProps[ident];

            if (!name) {
                return;
            }

            let str = parent.content[parent.content.length - 1].toString();
            let val = str.substring(1, str.length - 1);

            this._vars[this._caseFn(name)] = val;
        });
    }

    _buildSassData() {
        let str = [];

        str.push(`@import "${this._initPath}";\n`);
        str.push(`#vars_${RAND} {\n`);

        Object.entries(this._namesProps).forEach(([prop, name]) => {
            str.push(`--${prop}: "#{$${name}}";\n`);
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
        let [fullPath, syntax] = fileSyntax(filePath);
        let contents = readFileSync(fullPath, {encoding: "utf8"});

        parse(contents, {syntax}).forEach(node => {
            switch (node.type) {
            case "atrule":
                this._processImport(node, fullPath);
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

        let identNode = kwNode.content[0];

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

function createVarsObject(t, vars) {
    return t.callExpression(
        t.memberExpression(
            t.identifier("Object"),
            t.identifier("freeze")
        ),
        [serialize(vars)]
    );
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
        props[`${name}_${RAND}`] = name;
    });

    return props;
}

function sameCase(x) {
    return x;
}

if (process.env.NODE_TEST) {
    let {assert} = require("chai");
    let path = require("path");

    test("fileSyntax", () => {
        assert.deepEqual(fileSyntax("abc.scss"), ["abc.scss", "scss"]);
        assert.deepEqual(fileSyntax("abc.sass"), ["abc.sass", "sass"]);

        assert.deepEqual(fileSyntax(path.join(__dirname, "../test/testSass")),
            [path.join(__dirname, "../test/testSass.sass"), "sass"]);
        assert.deepEqual(fileSyntax(path.join(__dirname, "../test/testScss")),
            [path.join(__dirname, "../test/testScss.scss"), "scss"]);
        assert.deepEqual(fileSyntax(path.join(__dirname, "../test/testAmbig")),
            [path.join(__dirname, "../test/testAmbig.sass"), "sass"]);

        assert.throws(() => fileSyntax("abc.html"));
    });

    test("VarNames", () => {
        let vars = new VarNames(path.join(__dirname, "../test/testScss.scss")).extract();

        assert.equal(vars.size, 4);
        assert.isTrue(vars.has("scssvar"));
        assert.isTrue(vars.has("sassvar"));
        assert.isTrue(vars.has("ambigvar"));
        assert.isTrue(vars.has("mapvar"));
    });

    test("SassVars", () => {
        let props = genCssProps(["scssvar", "sassvar", "ambigvar", "mapvar"]);
        let vars = new SassVars(path.join(__dirname, "../test/testScss.scss"),
                                props, changeCase.camelCase).extract();

        assert.deepEqual(vars, {
            sassvar: "42",
            scssvar: "69",
            ambigvar: "green",
            mapvar: "(abc: 123)",
        });
    });

    test("VarLookup", () => {
        let lookup = new VarLookup(changeCase.paramCase, changeCase.constantCase);

        let vars = lookup.extractAllVars(path.join(__dirname, "../test/testScss.scss"));
        assert.deepEqual(vars, {
            SASSVAR: "42",
            SCSSVAR: "69",
            AMBIGVAR: "green",
            MAPVAR: "(abc: 123)",
        });

        vars = lookup.extractVars(path.join(__dirname, "../test/testScss.scss"),
            ["SASSVAR", "MAPVAR"]);
        assert.deepEqual(vars, {
            SASSVAR: "42",
            SCSSVAR: "69",
            AMBIGVAR: "green",
            MAPVAR: "(abc: 123)",
        });

        lookup = new VarLookup(changeCase.paramCase, changeCase.constantCase);

        vars = lookup.extractVars(path.join(__dirname, "../test/testVars.scss"),
            ["MY_VAR", "ANOTHER_COOL_VAR"]);
        assert.deepEqual(vars, {
            MY_VAR: "42",
            ANOTHER_COOL_VAR: "69",
        });

        lookup = new VarLookup(changeCase.paramCase, changeCase.camelCase);

        vars = lookup.extractVars(path.join(__dirname, "../test/testVars.scss"),
            ["myVar", "sassvar"]);
        assert.deepEqual(vars, {
            myVar: "42",
            sassvar: "42",
        });
    });
}
