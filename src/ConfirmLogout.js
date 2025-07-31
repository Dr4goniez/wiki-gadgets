/*****************************************************************************************\
	ConfirmLogout

	Shows a confirmation popup when a user attemps to log out.

	@version 1.0.0
	@author [[User:Dragoniez]]
\*****************************************************************************************/
// @ts-check
/* global mw, OO */
//<nowiki>
(() => {
// ***************************************************************************************

if (!(mw.config.get('wgUserGroups') || []).includes('user')) {
	return;
}

const ooui = mw.loader.using('oojs-ui');
const MSG_LOGOUT = 'userlogout-continue';

mw.loader.using('mediawiki.api').then(() => {
	return $.when(
		new mw.Api().loadMessagesIfMissing([MSG_LOGOUT]),
		ooui,
		$.ready
	);
}).then(() => {

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

	$logout.on('click', function(event) {
		event.preventDefault(); // Cancel default anchor navigation

		OO.ui.confirm(mw.messages.get(MSG_LOGOUT) || 'Are you sure you want to log out?').then((confirmed) => {
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