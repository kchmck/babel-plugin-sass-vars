## v0.2.0 - 2018-03-12

### Fixes

- Now works with node-sass@4.8.0/libsass@3.5.0, which fixes "Please check validity of the
  block" errors.

### Breaking changes

- Quoted SASS vars no longer contain unnecessary surrounding quotes in their javascript
  representation. For example, the variable `$myvar: "a b c"` used to be output as `const
  myvar = '"a b c"'`, but is now output as `const myvar = 'a b c'`.

## v0.1.1 - 2018-02-28

- Initial release.
