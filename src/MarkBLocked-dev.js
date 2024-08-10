/* global mw, MarkBLocked */
//<nowiki>
mw.loader.getScript('http://127.0.0.1:5500/src/MarkBLocked-core.js').then(() => {
	mw.loader.load('http://127.0.0.1:5500/src/MarkBLocked-core.css', 'text/css');
	// @ts-ignore
	MarkBLocked.init({
		defaultOptions: {
			g_locks: true,
			g_blocks: true
		},
		optionKey: 'userjs-markblockedglobal-config',
		globalize: true
	});
});
//</nowiki>