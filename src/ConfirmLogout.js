/*****************************************************************************************\

	ConfirmLogout

	Shows a confirmation popup when a logged-in user attempts to log out.

	@version 1.1.0
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

const userLang = mw.config.get('wgUserLanguage');

/**
 * Object mapping from language codes to message objects.
 *
 * * `expiry`: UNIX timestamp representing when the cached message expires.
 * * `message`: The localized `userlogout-continue` interface message.
 *
 * @typedef {Record<string, { expiry: number; message: string; }>} Cache
 */
/**
 * Class to cache the `userlogout-continue` interface message using `localStorage`.
 *
 * The message is not bundled with most pages and must be loaded manually. Since the logout link
 * appears on every page, fetching this message every time would increase server load. To prevent
 * that, we cache the message locally for up to 3 days.
 */
class LogoutMessage {

	/**
	 * @param {string} message
	 */
	constructor(message) {
		/**
		 * @type {string}
		 * @private
		 * @readonly
		 */
		this.message = message;
	}

	/**
	 * Gets the logout confirmation message in the user's language.
	 *
	 * @returns {string}
	 */
	get() {
		return this.message;
	}

	/**
	 * Asynchronously creates a new `LogoutMessage` instance.
	 *
	 * Attempts to retrieve the message from `mw.messages`, then from `localStorage`,
	 * and finally from the API. Falls back to a hardcoded message if all else fails.
	 *
	 * @returns {JQueryPromise<LogoutMessage>}
	 */
	static new() {
		/** @type {?string} */
		let msg = mw.messages.get(this.key);
		if (msg) {
			this.saveToStorage(msg);
			return $.Deferred().resolve(new this(msg));
		}
		msg = this.loadFromStorage();
		if (msg) {
			mw.messages.set(this.key, msg);
			return $.Deferred().resolve(new this(msg));
		}

		return new mw.Api().getMessages(this.key).then(({ [this.key]: message }) => {
			if (message) {
				mw.messages.set(this.key, message);
				this.saveToStorage(message);
				return message;
			}
			return null;
		}).catch((_, err) => {
			console.warn('Failed to fetch logout message:', err);
			return null;
		}).then(/** @param {?string} message */ (message) => {
			if (!message) {
				message = userLang === 'ja'
					? 'ログアウトしますか？'
					: 'Do you want to log out?';
			}
			return new this(message);
		});
	}

	/**
	 * Loads the logout confirmation message from `localStorage`.
	 *
	 * @returns {?string}
	 * @private
	 */
	static loadFromStorage() {
		const cache = this.getCache();
		if (!cache[userLang]) {
			return null;
		}
		if (cache[userLang].expiry < Date.now()) {
			delete cache[userLang];
			localStorage.setItem(this.storageKey, JSON.stringify(cache));
			return null;
		}
		return cache[userLang].message;
	}

	/**
	 * Saves the given messsage to `localStorage`.
	 *
	 * @param {string} message
	 * @returns {void}
	 * @private
	 */
	static saveToStorage(message) {
		const cache = this.getCache();
		cache[userLang] = {
			expiry: Date.now() + 3 * 24 * 60 * 60 * 1000, // 3 days from now
			message
		};
		localStorage.setItem(this.storageKey, JSON.stringify(cache));
	}

	/**
	 * Retrieves the message cache object from localStorage.
	 *
	 * @returns {Cache}
	 * @private
	 */
	static getCache() {
		const cacheStr = localStorage.getItem(this.storageKey);
		if (!cacheStr) {
			return {};
		}
		try {
			const cache = /** @type {Cache} */ (JSON.parse(cacheStr));
			return typeof cache === 'object' && !Array.isArray(cache) && cache !== null
				? cache
				: {};
		} catch (_) {
			return {};
		}
	}

}
LogoutMessage.key = 'userlogout-continue';
LogoutMessage.storageKey = 'confirmlogout-message';

// Start loading OOUI in the background for a faster start-up
const ooui = mw.loader.using('oojs-ui');

mw.loader.using('mediawiki.api').then(() => {
	return $.when(
		LogoutMessage.new(),
		ooui,
		$.ready
	);
}).then((msg) => {

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

		OO.ui.confirm(msg.get()).then((confirmed) => {
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