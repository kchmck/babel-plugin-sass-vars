import babel from 'rollup-plugin-babel';
import replace from 'rollup-plugin-replace';

export default {
    input: "./src/index.js",
    output: {
        file: "./lib/index.js",
        format: "cjs",
    },
    plugins: [
        replace({
            "process.env.NODE_TEST": false,
        }),
        babel({
            presets: [
                ["@babel/preset-env", {
                    targets: {node: 8},
                    useBuiltins: "usage",
                    modules: false,
                }],
            ],
            plugins: [
                ["@babel/plugin-proposal-object-rest-spread", {useBuiltIns: true}],
            ],
        }),
    ],
}
