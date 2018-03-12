import {assert} from "chai";

import sty from "./camel.sass";

test("default import", () => {
    assert.deepEqual(sty, {
        MY_VAR: "1rem",
        ANOTHER_COOL_VAR: "turquoise",
        RED_VAR: "red",
        COPY_VAR: "red",
        TEST_VAR: "red; blue",
        LIST_VAR: "red green blue",
        FONT_VAR: "1em Pine Sans, Abc Xyz, sans-serif",
    });
});
