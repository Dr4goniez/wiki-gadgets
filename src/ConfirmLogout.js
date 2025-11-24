/*****************************************************************************************\

	ConfirmLogout

	Displays a confirmation popup when a logged-in user attempts to log out.

	This gadget:
	- Supports all skins.
	- Supports all languages supported by MediaWiki.
	- Involves no DOM alterations or hardcoded logout logic (uses the built-in
	  `skin.logout` hook).
	- Can be loaded as a global script using:
	```
	mw.loader.load('https://ja.wikipedia.org/w/load.php?modules=ext.gadget.ConfirmLogout');
	```

	@version 1.1.3
	@author [[User:Dragoniez]]

\*****************************************************************************************/
// @ts-check
/* global mw, OO */
//<nowiki>
if ((mw.config.get('wgUserGroups') || []).includes('user')) {

	/** @type {string} */
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const selectorLogoutLink = require('./selectorLogoutLink.js');

	mw.loader.using([
		'mediawiki.storage',
		'mediawiki.api'
	]).then(() => {
		return $.when(
			getMessage(),
			$.ready
		);
	}).then((logoutMessage) => {

		/**
		 * @type {JQuery<HTMLAnchorElement>}
		 */
		const $logout = $(selectorLogoutLink);
		if (!$logout.length) {
			throw new Error(selectorLogoutLink + ' not found');
		}

		// Remove MediaWiki's default click handler that fires the logout hook
		$logout.off('click');

		$logout.on('click', function(event) {
			event.preventDefault(); // Cancel default anchor navigation

			mw.loader.using('oojs-ui-windows').then(() => {
				OO.ui.confirm(logoutMessage).then((confirmed) => {
					if (confirmed) {
						// Re-fire the logout hook with the href manually
						mw.hook('skin.logout').fire(this.href);
					}
				});
			});
		});

	});

}

/**
 * @returns {JQuery.Promise<string>}
 * @requires mediawiki.storage
 * @requires mediawiki.api
 */
function getMessage() {
	const userLang = mw.config.get('wgUserLanguage');
	const key = {
		message: 'userlogout-continue',
		storage: 'mw-ConfirmLogout-' + userLang
	};
	/**
	 * @param {string} msg
	 */
	const cache = (msg) => {
		mw.storage.remove(key.storage);
		mw.storage.set(key.storage, msg, 3 * 24 * 60 * 60); // 3 day expiry
	};

	/** @type {string | null | false} */
	let message = mw.messages.get(key.message);
	if (message) {
		cache(message);
		return $.Deferred().resolve(message).promise();
	}
	message = mw.storage.get(key.storage);
	if (message) {
		return $.Deferred().resolve(message).promise();
	}

	return new mw.Api().getMessages(key.message)
	.then(({ [key.message]: msg }) => {
		if (msg) {
			mw.messages.set(key.message, msg);
			cache(msg);
			return msg;
		}
		return null;
	}).catch((_, err) => {
		console.warn('Failed to fetch logout message:', err);
		return null;
	}).then(/** @param {?string} msg */ (msg) => {
		if (!msg) {
			msg = userLang === 'ja'
				? 'ログアウトしますか？'
				: 'Do you want to log out?';
		}
		return msg;
	});
}
//</nowiki>