import assert from "assert";
import {readFileSync, existsSync} from "fs";
import {resolve, dirname, extname} from "path";

import changeCase from "change-case";
import memoize from "fast-memoize";
import {parse} from "gonzales-pe";
import {renderSync} from "node-sass";
import serialize from "babel-literal-to-ast";
import uuid from "uuid/v4";

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

    let lookup = new VarLookup(sassCase, outputCase);

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
                let vars = lookup.extractAllVars(absPath);

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

            astPath.replaceWith(serialize(vars));
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
        Object.entries(this._namesProps).forEach(([name, prop]) => {
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

        Object.entries(this._namesProps).forEach(([name, prop]) => {
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
    Object.assign(exports, {fileSyntax, genCssProps, VarNames, SassVars});
}
