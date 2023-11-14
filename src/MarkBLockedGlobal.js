//<nowiki>
/* global mw */
(function() {

	var moduleName = 'ext.gadget.MarkBLocked-core';
	var errHandler = function() {
		console.error(arguments);
	};
	var loadModule = function() {
		mw.loader.using(moduleName)
			.then(function(require) {
				var MBL = require(moduleName);
				MBL.init({
					optionKey: 'userjs-markblockedglobal-config'
				});
			})
			.catch(errHandler);
	};

	if (mw.loader.getModuleNames().indexOf(moduleName) === -1) { // Module doesn't exist locally
		mw.loader.getScript('https://test.wikipedia.org/w/load.php?modules=' + moduleName) // Import the module
			.then(loadModule)
			.catch(errHandler);
	} else {
		loadModule();
	}

})();
//</nowiki>