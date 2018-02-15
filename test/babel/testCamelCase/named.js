import {assert} from "chai";

import {ANOTHER_COOL_VAR, COPY_VAR} from "./camel.sass";

test("named import", () => {
    assert.equal(ANOTHER_COOL_VAR, "turquoise");
    assert.equal(COPY_VAR, "red");
});
