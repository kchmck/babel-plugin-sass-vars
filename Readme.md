# babel-plugin-sass-vars [![npm](https://img.shields.io/npm/v/babel-plugin-sass-vars.svg)](https://www.npmjs.com/package/babel-plugin-sass-vars)

Extract [sass/scss](https://sass-lang.com) variables at build time.

```javascript
import styles from "style.scss";
import {primaryColor} from "style.scss";
```

## Features

- Import all global sass variables, across all `@import`ed files
- All sass functions, variable substitutions, etc. are evaluated by the official
  [node-sass](https://github.com/sass/node-sass) compiler
- Both sass and scss are supported and can be intermingled to the extent [supported by
  node-sass](http://sass-lang.com/documentation/file.SASS_REFERENCE.html#syntax)

## Install

This package is available on npm and can be installed with

```
npm install -D babel-plugin-sass-vars
```

Note that the package is a [babel](https://babeljs.io) plugin and must be used as part of
a babel build step.

## Babel configuration

This plugin can be activated by adding it to the `plugins` array within babel's
[config](https://babeljs.io/docs/usage/babelrc/). For example,

```javascript
{
    "plugins": [
        ["babel-plugin-sass-vars", {
            "sassCase": // ...
            "outputCase": // ...
        }]
    ]
}
```

## Usage

The plugin transforms certain `import` and `require` statements and in general has the
following behavior:

- The target filename must contain an `.scss` or `.sass` extension to be considered
- All sass values are stringified without further processing, so for example `$var: 42`
  becomes `var: "42"`, `$var: 42px` becomes `var: "42px"`, and `$var: "hello"` becomes
  `var: '"hello"'`

### Default import

To extract all global variables into a single object, just import the "default export" of
the stylesheet:
```javascript
import STYLE from "./styles.scss";
```
This import statement will then be replaced with an assignment like
```javascript
const STYLE = Object.freeze({
    var: "value",
    // ...
});
```
so that each variable can be accessed through `STYLE`.

### Named imports

To import just a known subset of variables, the named form can be applied as usual:
```javascript
import {myVar, otherVar as coolVar} from "./styles.scss";
```
This statement will then be replaced with assignments like
```javascript
const myVar = "...";
const coolVar = "...";
```
Note that both import forms can be used together if desired:
```javascript
import STYLE, {myVar} from "./styles.scss";
```

### CommonJS `require` import

The CommonJS import form is also supported:
```javascript
let myStyles = require("./styles.scss");
```
This will then be transformed to something like
```javascript
let myStyles = Object.freeze({
    var: "value",
    // ...
});
```

## Options

The options object for the plugin can contain the following parameters.

### `sassCase`

This option identifies the casing format of the variables within any imported stylesheets.
All named import identifiers will be converted to this case before looking them up in the
stylesheet. This means that variables written in camelCase in the javascript file can
correspond to variables written in param-case in the stylesheet.

If only the default-import form is used, this option has no effect and can be left unset.

The value should be a string corresponding to one of the top-level functions of the
[`change-case`](https://www.npmjs.com/package/change-case) package, for example
`"paramCase"` or `"camelCase"`.

### `outputCase`

This option identifies how the casing of sass variables should be transformed when they're
exported to javascript via the default-import object or a named import variable. Note that
when using the named-import form, the named identifiers must also be in this case style.

Its value should be given in the same format as `sassCase`.

## Examples

### Basic examples

These examples assume a stylesheet with the contents
```sass
$primary-color: turqoise;
$secondary-color: salmon;
$alt-color: $primary-color;
$main-padding: 32;
$main-border: 1px solid #000;
```
is stored at the location `../styles/app.scss` relative to the javascript files.

Then with the following plugin options,
```javascript
{
    sassCase: "paramCase",
    outputCase: "camelCase",
}
```

the following input
```javascript
import styles from "../styles/app.scss"
import {primaryColor, secondaryColor as SECONDARY_COLOR} from "../styles/app.scss";
```
would be transformed to something like this output:
```javascript
const styles = Object.freeze({
    primaryColor: "turqoise",
    secondaryColor: "salmon",
    altColor: "turqoise",
    mainPadding: "32",
    mainBorder: "1px solid #000",
});

const primaryColor = "turqoise";

const SECONDARY_COLOR = "salmon";
```

Alternatively, if the babel options were set to output in constant case:
```javascript
{
    sassCase: "paramCase",
    outputCase: "constantCase",
}
```
then the input file
```javascript
import styles from "../styles/app.scss"
import {PRIMARY_COLOR, SECONDARY_COLOR as secondary} from "../styles/app.scss";
```
would be transformed to something like
```javascript
const styles = Object.freeze({
    PRIMARY_COLOR: "turqoise",
    SECONDARY_COLOR: "salmon",
    ALT_COLOR: "turqoise",
    MAIN_PADDING: "32",
    MAIN_BORDER: "1px solid #000",
});

const PRIMARY_COLOR = "turqoise";

const secondary = "salmon";
```

### CSS framework example

This example shows how the plugin can be applied to a project that uses a large CSS
framework. In this case, we'll consider a stylesheet that pulls in
[bulma](https://bulma.io):
```sass
$primary: aqua;

@import "../node_modules/bulma/bulma.sass";
```
Since bulma uses param-case for its variables, we set `sassCase` to `paramCase`, and
arbitrarily choose `camelCase` for `outputCase`:
```javascript
{
    sassCase: "paramCase",
    outputCase: "camelCase",
}
```
With this configuration, the following input file
```javascript
import styles, {primary, info, familyMonospace} from "../styles/app.scss";
```
would be transformed to something like the following:
```javascript
const styles = Object.freeze({
  "primary": "aqua",
  "black": "#0a0a0a",
  "greyDarker": "#363636",
  "greyDark": "#4a4a4a",
  "grey": "#7a7a7a",
  "greyLight": "#b5b5b5",
  "greyLighter": "#dbdbdb",
  "familyMonospace": "monospace",
  "renderMode": "optimizeLegibility",
  "light": "whitesmoke",
  "dark": "#363636",
  "orangeInvert": "#fff",
  "info": "#3273dc",
  // All other bulma variables...
});

const primary = "aqua";

const info = "#3273dc";

const familyMonospace = "monospace";
```

## How it works

This plugin is pretty much a hack, but there doesn't seem to be any existing interface
provided by node-sass for getting at variable assignments. As such, the following
procedure is used to extract these variables indirectly:

1. Create a set of desired variables:
    - If the default-import form is used, we need to find all global variables that could
      be accessed. To do so, the root stylesheet and any further imported stylesheets are
      traversed and parsed (using [gonzales-pe](https://github.com/tonyganch/gonzales-pe))
      to extract variable names defined at the top level.
    - If the named-import form is used, then the given names are simply transformed to
      sass case and used as the set.
2. Generate a stylesheet that `@import`s the root stylesheet and assigns each desired
   sass variable to an associated "unique" [custom property](https://developer.mozilla.org/en-US/docs/Web/CSS/--*).
3. Transform this generated stylesheet to a CSS stylesheet using node-sass, which performs
   function evaluation, variable substitution, and all its other processing and assigns
   each custom property the final value of each variable.
4. Parse this CSS stylesheet (using gonzales-pe), extract each custom property, and
   associate the value with each corresponding sass variable.
