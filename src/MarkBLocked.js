//<nowiki>
/* global mw */
(function() {
	var domain = 'ja.' + mw.config.get('wgNoticeProject') + '.org';
	if (domain === mw.config.get('wgServerName')) {
		var moduleName = 'ext.gadget.MarkBLocked-core';
		var loadModule = function() {
			mw.loader.using(moduleName)
				.then(function(require) {
					var MarkBLocked = require(moduleName);
					MarkBLocked.init({
						// The options below are specific to Japanese projects
						lang: 'ja',
						contribs_CA: [
							'投稿記録',
							'アカウント統一管理',
							'統一ログインの管理'
						]
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
	} else {
		console.error(
			'MarkBLocked: This gadget, when loaded externally, runs only on sister projects of jawiki on the WMF server. ' +
			'Consider using MarkBLockedGlobal instead (https://meta.wikimedia.org/wiki/User:Dragoniez/MarkBLockedGlobal).'
		);
	}
})();
//</nowiki>