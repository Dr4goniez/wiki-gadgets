/* global mw, MarkBLocked */
//<nowiki>
mw.loader.getScript('http://127.0.0.1:5500/src/MarkBLocked-core.js').then(function() {
	mw.loader.load('http://127.0.0.1:5500/src/MarkBLocked-core.css', 'text/css');
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