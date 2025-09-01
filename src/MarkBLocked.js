/**
 * To load this gadget using `mw.loader`, use:
 *
 * ```js
 * mw.loader.load('https://ja.wikipedia.org/w/load.php?modules=ext.gadget.MarkBLocked');
 * ```
 *
 * Note: the `index.php` path cannot be used because `require()` is not supported
 * in the global namespace.
 *
 * If you want to run MarkBLocked with customized constructor configurations, you must
 * load the core module using `mw.loader.using`. For an example, see:
 *
 * @see https://meta.wikimedia.org/wiki/User:Dragoniez/MarkBLockedGlobal.js
 *
 * For constructor configuration options, refer to `ConstructorConfig` in:
 *
 * @see https://github.com/Dr4goniez/wiki-gadgets/blob/main/src/window/MarkBLocked.d.ts
 * @see https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MarkBLocked-core.js
 */
const MarkBLocked = require('./MarkBLocked-core.js');
MarkBLocked.init({
	lang: 'ja'
});