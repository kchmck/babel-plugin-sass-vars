import {assert} from "chai";

import sty from "./testScss.scss";

import {mapvar} from "./testScss.scss";

import styles, {sassvar, scssvar} from "../../testScss.scss";

test("default import", () => {
    assert.deepEqual(sty, {
        scssvar: "69em",
        mapvar: "(abc: 123)",
        sassvar: "42",
    });
});

test("named import", () => {
    assert.equal(mapvar, "(abc: 123)");
});

test("mixed import", () => {
    assert.deepEqual(styles, {
        scssvar: "69",
        mapvar: "(abc: 123)",
        sassvar: "42",
        ambigvar: "green",
    });

    assert.equal(sassvar, "42");
    assert.equal(scssvar, "69");
});
