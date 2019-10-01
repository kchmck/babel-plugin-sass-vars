require("@babel/register")({
    presets: [
        ["@babel/preset-env", {
            targets: {node: "current"},
            useBuiltIns: "usage",
            corejs: "3",
            shippedProposals: true,
        }],
    ],
    plugins: [
        ["@babel/plugin-proposal-object-rest-spread", {useBuiltIns: true}],
    ],
});
