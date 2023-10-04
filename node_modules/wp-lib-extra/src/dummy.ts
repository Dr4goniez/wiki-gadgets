// This file just contains comments to be added to the top of the transpiled version of wp-lib-extra
// and a dummy export to be imported from other files so that they are recognized as modules.
export {};

// What to do before/after `npm run build`

// 1. Comment out `export {};` at the bottom of src/wp-lib-extra.ts

// 2. `npm run build`

// 3. Un-comment out `export {};` at the bottom of src/wp-lib-extra.ts

/**
 *	4. Comment out the following in types/wp-lib-extra.d.ts
 *	- interface MwString
 *	- declare const mwString
 */

// 5. Add the following to the bottom of types/wp-lib-extra.d.ts

/** The object exported by `ext.gadget.WpLibExtra`. */
// declare global {
//     interface WpLibExtra {
//         load: typeof load;
//         sleep: typeof sleep;
//         continuedRequest: typeof continuedRequest;
//         massRequest: typeof massRequest;
//         clean: typeof clean;
//         arraysEqual: typeof arraysEqual;
//         arraysDiff: typeof arraysDiff;
//         Template: typeof Template;
//         Wikitext: typeof Wikitext;
//     }
// }
// export {};

// (Add the following to the top of MediaWiki:Gadget-WpLibExtra.js)
/**
 * This gadget is transpiled from TypeScript. You can find the source code at
 * @link https://github.com/Dr4goniez/wp-lib-extra/blob/main/src/wp-lib-extra.ts
 * and an API documentation at
 * @link https://dr4goniez.github.io/wp-lib-extra/index.html
 * The type definitions of the library are also available at
 * @link https://www.npmjs.com/package/wp-lib-extra
 * 
 * @author [[User:Dragoniez]]
 * @license CC-BY-SA-4.0
 * @version 1.0.12
 */