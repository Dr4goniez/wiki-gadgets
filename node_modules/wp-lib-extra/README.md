# wp-lib-extra

The source code and TypeScript definitions for [ja:MediaWiki:Gadget-WpLibExtra.js](https://ja.wikipedia.org/wiki/MediaWiki:Gadget-WpLibExtra.js).

This package is distributed for the purposes of providing developers with a development environment to create Wikipedia gadgets/user scripts that use the library as their module. Because the library is a front-end program, please be noted that you cannot use it as a back-end module.

For the functionalities of this library, see the [API documentation](https://dr4goniez.github.io/wp-lib-extra/index.html).

## Usage

To use the type definitions of the library, run:
```bash
npm i -D wp-lib-extra
```
and edit your `tsconfig.json` so that it includes:
```
"types": [
	"wp-lib-extra"
]
```
Then, the `WpLibExtra` interface should be available globally:
![A sample image of referencing the interface named "WpLibExtra".](assets/images/types.png)

As noted above, this is a helper package for you to develop gadgets/user scripts for (front-end) Wikimedia projects. You cannot do something like `import * as lib from "wp-lib-extra"` because `import` expressions are transpiled into `Object.defineProperty(exports, "__esModules", {value: true})`, and `exports` causes `Uncaught ReferenceError: exports is not defined`: It is necessary to call either `require` in a gadget or `mw.loader.using` in a user script in order to use the library. By specifying the `types` option in `tsconfig.json` to apply the typings globally, you can free yourself from the burden of removing JS expressions that don't work in Wikimedia scripts after transpilation.

Note finally that it is recommended that you create a brand-new workspace when you install this package, to prevent potential pollution in the global namespace.