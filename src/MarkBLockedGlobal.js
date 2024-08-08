//<nowiki>
/* global mw */
(() => {
	const moduleName = 'ext.gadget.MarkBLocked-core';
	const loadModule = () => {
		mw.loader.using(moduleName)
			.then((req) => {
				const MarkBLocked = req(moduleName);
				MarkBLocked.init({
					defaultOptions: {
						localips: false,
						globalusers: true,
						globalips: false
					},
					optionKey: 'userjs-markblockedglobal-config',
					globalize: true
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
})();
//</nowiki>