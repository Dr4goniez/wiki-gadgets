/* global mw, MarkBLocked */
//<nowiki>
mw.loader.getScript('http://localhost:5500/src/MarkBLocked-core.js').then(() => {
	mw.loader.load('http://localhost:5500/src/MarkBLocked-core.css', 'text/css');
	// @ts-ignore
	MarkBLocked.init({
		// lang: 'ja',
		defaultOptions: {
			g_locks: true,
			g_blocks: true
		},
		optionKey: 'userjs-markblockedglobal-config',
		globalize: true
	});
});
//</nowiki>