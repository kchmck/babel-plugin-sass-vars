import {assert} from "chai";

import {coolVarBro} from "./styles.scss";

test("named import", () => {
    assert.equal(coolVarBro, "#FF00FF");
});
