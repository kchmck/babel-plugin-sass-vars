import {assert} from "chai";

import styles from "./styles.scss";

test("default import", () => {
    assert.deepEqual(styles, {
        coolVarBro: "#FF00FF",
        darkVar: "black",
    });
});
