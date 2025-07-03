//<nowiki>
(() => {
	if (!mw) {
		alert('このスクリプトはウィキペディア上で使用してください。');
	}
	$.when(
		mw.loader.using(['mediawiki.api', 'oojs-ui']),
		$.ready
	).then(() => {
		OO.ui.confirm('SpurLinkコンフィグを削除します。よろしいですか？').then((confirmed) => {
			if (!confirmed) {
				return;
			}
			new mw.Api().saveOptions({ 'userjs-sl-config': null, 'userjs-sl-history': null })
			.then(() => {
				OO.ui.alert('SpurLinkコンフィグを削除しました。');
			})
			.catch((_, err) => {
				console.error(err);
				OO.ui.alert('SpurLinkコンフィグの削除に失敗しました。もう一度やり直してください。');
			});
		});
	});
})();
//</nowiki>