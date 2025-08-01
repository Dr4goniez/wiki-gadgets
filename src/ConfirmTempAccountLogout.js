/*****************************************************************************************\

	ConfirmTempAccountLogout

	Shows a confirmation (warning) popup when a temporary user attempts to log out.

	@version 1.0.1
	@author [[User:Dragoniez]]

\*****************************************************************************************/
// @ts-check
/* global mw, OO */
//<nowiki>
(() => {
// ***************************************************************************************

if (!mw.config.get('wgUserIsTemp')) {
	return;
}

$.when(
	mw.loader.using(['mediawiki.util', 'oojs-ui']),
	$.ready
).then(() => {

	/**
	 * Selector for the logout button, defined in `resources/Resources.php`.
	 * Only the Minerva skin overrides this in its own `Hooks.php`.
	 *
	 * @see https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/refs/heads/master/resources/Resources.php
	 * @see https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/skins/MinervaNeue/+/refs/heads/master/includes/Hooks.php
	 * @see https://codesearch.wmcloud.org/search/?q=%5CbselectorLogoutLink%5Cb
	 */
	const selectorLogoutLink = mw.config.get('skin') === 'minerva'
		? 'a.menu__item--logout[data-mw="interface"]'
		: '#pt-logout a[data-mw="interface"]';

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
				'<b>仮アカウントからのログアウトは推奨されていません。</b>一度仮アカウントからログアウトすると、' +
				'再度ログインすることはできなくなります。今後も編集を行う場合は、ログイン状態を維持してください。' +
			'</p>' +
			'<p>' +
				`ログアウトする場合、${rawLinks.scrutiny}を行わないよう十二分に注意してください。` +
				`${rawLinks.sock}とみなされた場合、${rawLinks.block}の対象となることがあります。` +
			'</p>' +
			'<p>本当にログアウトしますか？</p>' +
		'</div>'
	);

	$logout.on('click', function(event) {
		event.preventDefault(); // Cancel default anchor navigation

		OO.ui.confirm($warning, { size: 'large' }).then((confirmed) => {
			if (confirmed) {
				// Re-fire the logout hook with the href manually
				mw.hook('skin.logout').fire(this.href);
			}
		});
	});

});

// ***************************************************************************************
})();
//</nowiki>