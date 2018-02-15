import {assert} from "chai";

const styles = require("./testScss.scss");

test("require form", () => {
    assert.deepEqual(styles, {
        scssvar: "69em",
        mapvar: "(abc: 123)",
        sassvar: "42",
    });
});
