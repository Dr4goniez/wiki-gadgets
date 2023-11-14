//<nowiki>
/* global mw */
var moduleName = 'ext.gadget.MarkBLocked-core';
mw.loader.using(moduleName).then(function(require) {
	var MarkBLocked = require(moduleName);
	MarkBLocked.init({
		lang: 'ja',
		contribs_CA: [
			'投稿記録',
			'アカウント統一管理',
			'統一ログインの管理'
		]
	});
});
//</nowiki>