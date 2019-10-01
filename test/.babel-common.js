module.exports = opts => {
    require("@babel/register")({
        cache: false,
        ignore: [/node_modules|lib/],
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
            ["./lib", opts],
        ],
    });
};
