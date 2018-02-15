import {assert} from "chai";
import path from "path";
import {camelCase} from "change-case";

import {fileSyntax, genCssProps, VarNames, SassVars} from "../src";

test("fileSyntax", () => {
    assert.deepEqual(fileSyntax("abc.scss"), ["abc.scss", "scss"]);
    assert.deepEqual(fileSyntax("abc.sass"), ["abc.sass", "sass"]);

    assert.deepEqual(fileSyntax(path.join(__dirname, "testSass")),
        [path.join(__dirname, "testSass.sass"), "sass"]);
    assert.deepEqual(fileSyntax(path.join(__dirname, "testScss")),
        [path.join(__dirname, "testScss.scss"), "scss"]);
    assert.deepEqual(fileSyntax(path.join(__dirname, "testAmbig")),
        [path.join(__dirname, "testAmbig.sass"), "sass"]);

    assert.throws(() => fileSyntax("abc.html"));
});

test("VarNames", () => {
    let vars = new VarNames(path.join(__dirname, "testScss.scss")).extract();

    assert.equal(vars.size, 4);
    assert.isTrue(vars.has("scssvar"));
    assert.isTrue(vars.has("sassvar"));
    assert.isTrue(vars.has("ambigvar"));
    assert.isTrue(vars.has("mapvar"));
});

test("SassVars", () => {
    let props = genCssProps(["scssvar", "sassvar", "ambigvar", "mapvar"]);
    let vars = new SassVars(path.join(__dirname, "testScss.scss"),
                            props, camelCase).extract();

    assert.deepEqual(vars, {
        sassvar: "42",
        scssvar: "69",
        ambigvar: "green",
        mapvar: "(abc: 123)",
    });
});
