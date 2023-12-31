//<nowiki>
/* global mw */
(function() {
	var moduleName = 'ext.gadget.MarkBLocked-core';
	var loadModule = function() {
		mw.loader.using(moduleName)
			.then(function(require) {
				var MarkBLocked = require(moduleName);
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
	if (mw.loader.getModuleNames().indexOf(moduleName) === -1) { // Module doesn't exist locally
		mw.loader.getScript('https://ja.wikipedia.org/w/load.php?modules=' + moduleName) // Import the module
			.then(loadModule)
			.catch(console.error);
	} else {
		loadModule();
	}
})();
//</nowiki>
