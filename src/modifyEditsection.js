/**
 * modifyEditsection
 *
 * Expands "edit section" links generated for transcluded sections.
 *
 * @author dbenzhuser ([[de:Benutzer:Dbenzhuser]])
 * @author Alex Smotrov ([[en:User:Alex Smotrov]])
 * @author TheDJ ([[en:User:TheDJ]])
 * @author mizusumashi ([[ja:User:Mizusumashi]])
 * @author cpro ([[ja:User:Cpro]])
 *
 * @author Dragoniez ([[ja:User:Dragoniez]])
 * - Rewritten completely in Feb 2026; added AJAX watchlist updates
 *
 * @version 2.0.0
 */
// @ts-check
/* global mw, OO */
// <nowiki>
(() => {
// *******************************************************************************************

const VERSION = '2.0.0';

class ModifyEditSection {

	static async init() {
		const wgNamespaceNumber = mw.config.get('wgNamespaceNumber');
		if (
			mw.config.get('wgAction') !== 'view' ||
			!(wgNamespaceNumber === 4 || wgNamespaceNumber % 2 === 1)
		) {
			return;
		}

		await $.when($.ready);

		/** @type {NodeListOf<HTMLAnchorElement>} */
		const editSectionLinks = document.querySelectorAll('.mw-editsection > a[href*="section=T-"]');
		if (!editSectionLinks.length) {
			return;
		}

		await mw.loader.using(['mediawiki.storage', 'mediawiki.util', 'mediawiki.api', 'mediawiki.Title']);
		await this.loadMessagesIfMissing();
		this.addStyleTag();

		const modifyEditSection = new this(editSectionLinks);
		if (!modifyEditSection.expanded.size) {
			return;
		}
		modifyEditSection.initializeWatchLinks();
	}

	static async loadMessagesIfMissing() {
		const required = [
			'view',
			'history_small',
			'watch',
			'unwatch',
			'purge',
			// "\"[[:$1]]\" and its discussion page have been added to your [[Special:Watchlist|watchlist]]."
			'addedwatchtext',
			// "\"[[:$1]]\" and its associated page have been added to your [[Special:Watchlist|watchlist]]."
			'addedwatchtext-talk',
			// "\"[[:$1]]\" and its discussion page have been removed from your [[Special:Watchlist|watchlist]]."
			'removedwatchtext',
			// "\"[[:$1]]\" and its associated page have been removed from your [[Special:Watchlist|watchlist]]."
			'removedwatchtext-talk',
			'protect-expiry-options',
			'infiniteblock'
		];
		const missing = new Set(required.filter(msg => !mw.message(msg).exists()));
		if (!missing.size) {
			return;
		}

		const userLang = mw.config.get('wgUserLanguage');
		const storageKey = 'userjs-modifyeditsection-' + userLang;
		/**
		 * @type {Record<string, string>|false|null}
		 */
		const json = mw.storage.getObject(storageKey);
		if (json) {
			for (const [key, value] of Object.entries(json)) {
				if (!mw.message(key).exists()) {
					mw.messages.set(key, value);
					missing.delete(key);
				}
			}
		}
		if (!missing.size) {
			return;
		}

		// Intentionally omitting catch(); the execution should stop on failure
		await new mw.Api().loadMessagesIfMissing(Array.from(missing));

		const newData = Object.create(null);
		for (const key of required) {
			/** @type {?string} */
			const msg = mw.messages.get(key);
			if (msg === null) {
				throw new Error(`The message "${key}" is not loaded`);
			}
			newData[key] = msg;
		}

		mw.storage.setObject(storageKey, newData, 60 * 60 * 24 * 7); // 1 week
	}

	static addStyleTag() {
		const style = document.createElement('style');
		style.textContent = `
			.mw-editsection-expanded::before {
				content: " | ";
			}
		`.replace(/[\t\r\n]/g, '');
		document.head.appendChild(style);
	}

	/**
	 * @typedef {object} ExpandedSectionLink
	 * @property {mw.Title} title
	 * @property {boolean} watched
	 * @property {boolean} processing
	 * @property {JQuery<HTMLAnchorElement>} $watch
	 * @property {JQuery<HTMLElement>} $watchContainer
	 * @property {JQuery<HTMLAnchorElement>} $unwatch
	 * @property {JQuery<HTMLElement>} $unwatchContainer
	 */
	/**
	 * @param {NodeListOf<HTMLAnchorElement>} editSectionLinks
	 */
	constructor(editSectionLinks) {
		/**
		 * Mapping from title strings (as in API responses) to objects that store
		 * expanded section links.
		 *
		 * @type {Map<string, ExpandedSectionLink>}
		 * @readonly
		 */
		this.expanded = new Map();
		/**
		 * @type {mw.Api}
		 * @readonly
		 */
		this.api = new mw.Api({
			ajax: {
				headers: {
					'Api-User-Agent': `modifyEditsection/${VERSION} (https://ja.wikipedia.org/wiki/MediaWiki:Gadget-modifyEditsection.js)`
				}
			},
			parameters: {
				action: 'query',
				format: 'json',
				formatversion: '2'
			}
		});

		this.build(editSectionLinks);
	}

	/**
	 * @param {NodeListOf<HTMLAnchorElement>} editSectionLinks
	 */
	build(editSectionLinks) {
		const rArticle = new RegExp(mw.config.get('wgArticlePath').replace('$1', '([^?]+)'));
		/** @type {Map<String, number>} */
		const levelMap = new Map();

		for (const a of editSectionLinks) {
			const section = mw.util.getParamValue('section', a.href);
			if (!section || !/^T-\d+$/.test(section)) {
				continue;
			}

			let title = mw.util.getParamValue('title', a.href);
			if (!title) {
				const m = rArticle.exec(a.href);
				if (m) {
					title = decodeURIComponent(m[1]);
				}
			}
			if (!title) {
				console.warn('Title query parameter missing:', a);
				continue;
			}

			const headingDiv = a.closest('.mw-heading');
			if (!headingDiv) {
				console.warn('Could not find .mw-heading for an edit section link:', a);
				continue;
			}

			const m = headingDiv.className.match(/(?:^|\b)mw-heading([1-5])(?:$|\b)/);
			if (!m) {
				console.warn('The heading <div> does not contain a .mw-headingN class attribute', headingDiv);
				continue;
			}
			const level = +m[1];

			const t = mw.Title.newFromText(title);
			if (!t) {
				console.warn('Could not parse title:', title);
				continue;
			} else if (t.getNamespaceId() < 0) {
				// Extra layer of safety
				continue;
			}

			// Skip this editsection link if we've already expanded another for the same page
			// with a smaller heading level
			const dbKey = t.getPrefixedDb();
			const seenLevel = levelMap.get(dbKey);
			if (seenLevel !== undefined && level > seenLevel) {
				continue;
			}
			levelMap.set(dbKey, level);

			this.expandSectionLink(a, t);
		}
	}

	/**
	 * @param {JQuery<HTMLAnchorElement>} $a
	 * @returns {JQuery<HTMLElement>}
	 */
	static wrap($a) {
		return $('<span>').addClass('mw-editsection-expanded').append($a);
	}

	/**
	 * @param {HTMLAnchorElement} a
	 * @param {mw.Title} title
	 */
	expandSectionLink(a, title) {
		const prefixedTitle = title.getPrefixedText();

		/**
		 * @type {JQuery<HTMLAnchorElement>}
		 */
		const $view = $('<a>');
		$view.prop({ href: mw.util.getUrl(prefixedTitle) }).text(lcFirst(mw.msg('view')));

		/**
		 * @type {JQuery<HTMLAnchorElement>}
		 */
		const $history = $('<a>');
		$history.prop({ href: mw.util.getUrl(prefixedTitle, { action: 'history' }) }).text(mw.msg('history_small'));

		/**
		 * @type {JQuery<HTMLAnchorElement>}
		 */
		const $watch = $('<a>');
		$watch.prop({ href: mw.util.getUrl(prefixedTitle, { action: 'watch' }) }).text(lcFirst(mw.msg('watch')));
		const $watchContainer = ModifyEditSection.wrap($watch);

		/**
		 * @type {JQuery<HTMLAnchorElement>}
		 * @readonly
		 */
		const $unwatch = $('<a>');
		$unwatch.prop({ href: mw.util.getUrl(prefixedTitle, { action: 'unwatch' }) }).text(lcFirst(mw.msg('unwatch')));
		const $unwatchContainer = ModifyEditSection.wrap($unwatch);

		/**
		 * @type {JQuery<HTMLAnchorElement>}
		 */
		const $purge = $('<a>');
		$purge.prop({ href: mw.util.getUrl(prefixedTitle, { action: 'purge' }) }).text(lcFirst(mw.msg('purge')));

		$(a).after(
			ModifyEditSection.wrap($view),
			ModifyEditSection.wrap($history),
			$watchContainer,
			$unwatchContainer.hide(),
			ModifyEditSection.wrap($purge)
		);

		this.expanded.set(prefixedTitle, {
			title,
			watched: false,
			processing: false,
			// $view,
			// $history,
			$watch,
			$watchContainer,
			$unwatch,
			$unwatchContainer,
			// $purge
		});
	}

	async initializeWatchLinks() {
		if (!this.expanded.size) {
			return;
		}

		// Get the user's API limit
		const groupsWithApiHighLimits = new Set([
			'sysop', 'bot', 'apihighlimits-requestor', 'global-bot',
			'staff', 'steward', 'sysadmin', 'wmf-researcher'
		]);
		// @ts-expect-error
		const groups = (mw.config.get('wgUserGroups') || []).concat(mw.config.get('wgGlobalGroups') || []);
		const apiLimit = groups.some(g => groupsWithApiHighLimits.has(g)) ? 500 : 50;

		// Unflatten the titles array respecting the API limit
		const titleBatch = [...this.expanded.keys()].reduce((acc, title) => {
			if (acc[acc.length - 1].length >= apiLimit) {
				acc.push([]);
			}
			acc[acc.length - 1].push(title);
			return acc;
		}, /** @type {string[][]} */ ([[]]));

		// Check the watched state of each title
		const batch = [];
		for (const titles of titleBatch) {
			// XXX: A lazy check of the URI length
			let request, options;
			if (titles.join(',').length > 1800) {
				request = this.api.post.bind(this.api);
				options = {
					ajax: {
						headers: {
							'Promise-Non-Write-API-Action': 1
						}
					}
				};
			} else {
				request = this.api.get.bind(this.api);
				options = Object.create(null);
			}

			const req = request({
				titles,
				prop: 'info',
				inprop: 'watched',
			}, options).then((res) => {
				const pages = res && res.query && res.query.pages;
				if (!Array.isArray(pages)) {
					return;
				}
				for (const { title, watched } of pages) {
					if (!title) {
						console.warn('The title property is undefined');
						continue;
					}
					if (typeof watched !== 'boolean') {
						console.warn('The watched property is not a boolean');
						continue;
					}
					const obj = this.expanded.get(title);
					if (!obj) {
						console.error(`"${title}" not found in expanded`);
						continue;
					}
					obj.watched = watched;
				}
			}).catch((_, err) => {
				console.warn(err);
			});
			batch.push(req);
		}
		await Promise.all(batch);

		for (const [title, obj] of this.expanded) {
			// If the user is already watching the linked title, change the "watch" label to "unwatch"
			if (obj.watched) {
				obj.$watchContainer.hide();
				obj.$unwatchContainer.show();
			}

			obj.$watch.off('click').on('click', (e) => this.watchLinkHandler(e, false, obj, title));
			obj.$unwatch.off('click').on('click', (e) => this.watchLinkHandler(e, true, obj, title));
		}
	}

	/**
	 * @param {JQuery.ClickEvent<HTMLAnchorElement, undefined, HTMLAnchorElement, HTMLAnchorElement>|null} e
	 * @param {boolean} unwatch
	 * @param {ExpandedSectionLink} obj
	 * @param {string} title
	 * @param {string} [expiry]
	 */
	async watchLinkHandler(e, unwatch, obj, title, expiry) {
		if (e) {
			e.preventDefault();
			e.stopPropagation();
		}
		if (obj.processing) {
			return;
		}
		obj.processing = true;
		await mw.loader.using(['oojs-ui', 'mediawiki.jqueryMsg']);

		return this.api.postWithToken('watch', {
			action: 'watch',
			expiry,
			unwatch,
			titles: title,
			errorformat: 'html',
			errorlang: mw.config.get('wgUserLanguage'),
			errorsuselocal: true,
		}).then(() => null)
		.catch((_, err) => {
			console.warn(err);
			return this.api.getErrorMessage(err);
		}).then(/** @param {?JQuery<HTMLElement>} $msg */ ($msg) => {
			if ($msg) {
				mw.notify($msg, { type: 'error' });
				return;
			}

			let msgKey;
			if (unwatch) {
				msgKey = obj.title.isTalkPage() ? 'removedwatchtext-talk' : 'removedwatchtext';
			} else {
				msgKey = obj.title.isTalkPage() ? 'addedwatchtext-talk' : 'addedwatchtext';
			}
			$msg = $('<div>').append(mw.message(msgKey, title).parse());

			/** @type {?OO.ui.DropdownWidget} */
			let dropdown = null;
			while (!unwatch) {
				dropdown = ModifyEditSection.createWatchlistExpiryDropdown();
				if (!dropdown) {
					break;
				}
				dropdown.getMenu().selectItemByData(expiry || 'infinity');
				$msg.append(dropdown.$element.css({ 'margin-top': '1em' }));
				break;
			}

			mw.notify($msg);
			if (dropdown) {
				dropdown.on('labelChange', () => this.expiryDropdownChangeHandler(obj, title, dropdown));
			}
		}).then(() => {
			obj.processing = false;
			if (unwatch) {
				obj.$watchContainer.show();
				obj.$unwatchContainer.hide();
			} else {
				obj.$watchContainer.hide();
				obj.$unwatchContainer.show();
			}
		});
	}

	static createWatchlistExpiryDropdown() {
		let expiryOptions = ModifyEditSection.expiryOptions;
		if (expiryOptions === false) {
			return null;
		}
		if (expiryOptions === null) {
			// XXX: There's no built-in message that defines watchlist expiry options
			const rawOptions = mw.msg('protect-expiry-options');
			if (rawOptions === '-') {
				ModifyEditSection.expiryOptions = false;
				return null;
			}

			/**
			 * Parser logic adapted from `XmlSelect::parseOptionsMessage`.
			 * @type {OO.ui.MenuOptionWidget.ConfigOptions[]}
			 */
			const options = [];
			let infinityFound = false;
			for (let el of rawOptions.split(',').map(clean)) {
				// Normalize options that only have one part
				if (!el.includes(':')) {
					el = `${el}:${el}`;
				}

				// Extract the two parts
				const [label, data] = el.split(':').map(clean);
				if (!infinityFound && mw.util.isInfinity(data)) {
					// Use infinity as the first option
					options.unshift({ label, data: 'infinity' });
					infinityFound = true;
				} else if (!/week|month|year/i.test(data)) {
					// Filter out expiries that are too short
					continue;
				} else {
					options.push({ label, data });
				}
			}

			if (options.length < 2) {
				return null;
			}

			// In case infinity wasn't found, hardcode it
			if (!infinityFound) {
				options.unshift({ label: mw.msg('infiniteblock'), data: 'infinity' });
			}

			ModifyEditSection.expiryOptions = options;
			expiryOptions = options;
		}

		return new OO.ui.DropdownWidget({
			menu: {
				items: expiryOptions.map(cfg => new OO.ui.MenuOptionWidget(cfg))
			}
		});
	}

	/**
	 * @param {ExpandedSectionLink} obj
	 * @param {string} title
	 * @param {OO.ui.DropdownWidget} dropdown
	 */
	expiryDropdownChangeHandler(obj, title, dropdown) {
		dropdown.$element.remove();

		const expiry = /** @type {string} */ (
			/** @type {OO.ui.OptionWidget} */ (dropdown.getMenu().findSelectedItem())
			.getData()
		);
		this.watchLinkHandler(null, false, obj, title, expiry);
	}

}
/**
 * @type {OO.ui.MenuOptionWidget.ConfigOptions[]|false|null}
 * `false` if no parsable messages exist.
 */
ModifyEditSection.expiryOptions = null;

/**
 * @param {string} str
 * @returns {string}
 */
function lcFirst(str) {
	return !/^[\u10A0-\u10FF]/.test(str)
		? str.charAt(0).toLowerCase() + str.slice(1)
		: str;
}

/**
 * @param {string} str
 * @returns {string}
 */
function clean(str) {
	return str.replace(/[\u200E\u200F\u202A-\u202E]+/g, '').trim();
}

// *******************************************************************************************

ModifyEditSection.init();

// *******************************************************************************************
})();
// </nowiki>