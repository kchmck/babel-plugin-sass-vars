require("@babel/register")({
    presets: [
        ["@babel/preset-env", {
            targets: {node: "current"},
            useBuiltIns: "usage",
            shippedProposals: true,
        }],
    ],
    plugins: [
        ["@babel/plugin-proposal-object-rest-spread", {useBuiltIns: true}]
    ],
});
