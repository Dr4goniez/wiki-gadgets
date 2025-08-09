/* ここにあるすべてのJavaScriptは、仮利用者のみに読み込まれます */
// @ts-check
/* global mw, OO */

/**
 * ConfirmTempAccountLogout
 *
 * Shows a confirmation (warning) popup when a temporary user attempts to log out.
 *
 * @version 1.1.0
 * @author [[User:Dragoniez]]
 */
const moduleName = 'ext.gadget.selectorLogoutLink';
$.when(
	mw.loader.using([moduleName, 'mediawiki.util', 'oojs-ui']),
	$.ready
).then((req) => {

	/**
	 * @type {string}
	 */
	const selectorLogoutLink = req(moduleName);
	/**
	 * @type {JQuery<HTMLAnchorElement>}
	 */
	const $logout = $(selectorLogoutLink);
	if (!$logout.length) {
		return;
	}

	// Remove MediaWiki's default click handler that fires the logout hook
	$logout.off('click');

	// Warning message shown in a confirmation dialog
	const rawLinks = {
		scrutiny: `<a href="${mw.util.getUrl('WP:SCRUTINY')}" target="_blank">投稿記録の分断</a>`,
		sock: `<a href="${mw.util.getUrl('WP:SOCK')}" target="_blank">多重アカウントの不正使用</a>`,
		block: `<a href="${mw.util.getUrl('WP:BLOCK')}" target="_blank">投稿ブロック</a>`
	};
	const $warning = $('<div>').html(
		'<h3 style="text-align:center;">警告</h3>' +
		'<div style="text-align:justify;">' +
			'<p>' +
				'ご利用中の端末を今後も継続して使用する場合、通常は仮アカウントからログアウトする必要はありません。' +
				'一度ログアウトすると、同じ仮アカウントに再度ログインすることはできなくなります。今後も編集を行う場合は、' +
				'ログイン状態を維持してください。' +
			'</p>' +
			'<p>' +
				`ログアウトする場合は、${rawLinks.scrutiny}を招かないよう十分に注意してください。${rawLinks.sock}と` +
				`みなされた場合、${rawLinks.block}の対象となることがあります。` +
			'</p>' +
			'<p>本当にログアウトしますか？</p>' +
		'</div>'
	);

	$logout.on('click', function(event) {
		event.preventDefault(); // Cancel default anchor navigation

		OO.ui.confirm($warning, { size: 'larger' }).then((confirmed) => {
			if (confirmed) {
				// Re-fire the logout hook with the href manually
				mw.hook('skin.logout').fire(this.href);
			}
		});
	});

});