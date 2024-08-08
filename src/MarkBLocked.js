//<nowiki>
/* global mw */
(() => {
	const moduleName = 'ext.gadget.MarkBLocked-core';
	const loadModule = () => {
		mw.loader.using(moduleName)
			.then((req) => {
				const MarkBLocked = req(moduleName);
				MarkBLocked.init({
					lang: 'ja',
					contribsCA: [
						'投稿記録',
						'アカウント統一管理',
						'統一ログインの管理'
					]
				});
			})
			.catch(console.error);
	};
	if (!mw.loader.getState(moduleName)) { // Module doesn't exist locally
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