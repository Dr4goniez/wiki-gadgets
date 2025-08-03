//<nowiki>
/* global mw */
(() => {
	const moduleName = 'ext.gadget.MarkBLocked-core';
	const loadModule = () => {
		mw.loader.using(moduleName)
			.then((req) => {
				const MarkBLocked = req(moduleName);
				MarkBLocked.init({
					lang: 'ja'
				});
			})
			.catch(console.error);
	};
	if (!new Set(mw.loader.getModuleNames()).has(moduleName)) { // Module doesn't exist locally
		mw.loader.getScript('https://ja.wikipedia.org/w/load.php?modules=' + moduleName) // Import the module
			.then(loadModule)
			.catch(console.error);
	} else {
		loadModule();
	}
	const lang = mw.config.get('wgContentLanguage');
	if (lang !== 'ja') {
		console.warn(
			'Language mismatch: [[w:ja:MediaWiki:Gadget-MarkBLocked.js]] is configured specifically for Japanese wikis, ' +
			`but this wiki uses "${lang}" as its content language.`
		);
	}
})();
//</nowiki>