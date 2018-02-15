import {assert} from "chai";

import styles, {coolVarBro, darkVar} from "./styles.scss";

test("default import", () => {
    assert.deepEqual(styles, {
        coolVarBro: "#FF00FF",
        darkVar: "black",
    });

    assert.equal(coolVarBro, "#FF00FF");
    assert.equal(darkVar, "black");
});
