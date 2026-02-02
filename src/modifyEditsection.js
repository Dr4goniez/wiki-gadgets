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
 * @version 2.0.2
 */
// @ts-check
/* global mw, OO */
// <nowiki>
(() => {
// *******************************************************************************************

const VERSION = '2.0.2';

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

		const mes = new this();
		await mes.execute(editSectionLinks);
	}

	static async loadMessagesIfMissing() {
		const required = [
			'view',
			'history_small',
			'watch',
			'unwatch',
			'purge',
			'addedwatchexpirytext',
			'addedwatchexpirytext-talk',
			'addedwatchindefinitelytext',
			'addedwatchindefinitelytext-talk',
			'removedwatchtext',
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
				}
				missing.delete(key);
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
	 * @property {HTMLAnchorElement} anchor
	 * @property {mw.Title} title
	 * @property {boolean} watched
	 * @property {boolean} processing
	 * @property {JQuery<HTMLAnchorElement>} $view
	 * @property {JQuery<HTMLAnchorElement>} $history
	 * @property {JQuery<HTMLAnchorElement>} $watch
	 * @property {JQuery<HTMLElement>} $watchContainer
	 * @property {JQuery<HTMLAnchorElement>} $unwatch
	 * @property {JQuery<HTMLElement>} $unwatchContainer
	 * @property {JQuery<HTMLAnchorElement>} $purge
	 */
	constructor() {
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
	}

	/**
	 * @param {NodeListOf<HTMLAnchorElement>} editSectionLinks
	 */
	async execute(editSectionLinks) {
		const rArticle = new RegExp(mw.config.get('wgArticlePath').replace('$1', '([^?]+)'));
		/**
		 * @type {Map<string, number>}
		 */
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
			const prefixedTitle = t.getPrefixedText();
			const seenLevel = levelMap.get(prefixedTitle);
			if (seenLevel !== undefined && level > seenLevel) {
				continue;
			}
			levelMap.set(prefixedTitle, level);

			this.registerExpandedLinks(a, t);
		}
		if (!this.expanded.size) {
			return;
		}

		// Initialize the `watched` property
		await this.initializeWatchedStates();

		/**
		 * @param {JQuery.ClickEvent<HTMLAnchorElement, undefined, HTMLAnchorElement, HTMLAnchorElement>} e
		 * @param {boolean} unwatch
		 * @param {ExpandedSectionLink} obj
		 * @param {string} title
		 */
		const clickHandler = async (e, unwatch, obj, title) => {
			e.preventDefault();
			e.stopPropagation();
			if (obj.processing) {
				return;
			}
			obj.processing = true;
			// handleWatchLinkClick() should never reject by design, but we take the *safest* approach here
			try {
				await this.handleWatchLinkClick(unwatch, obj, title);
			} finally {
				obj.processing = false;
			}
		};

		// All preparations are complete; actually expand the edit section links
		for (const [title, obj] of this.expanded) {
			$(obj.anchor).after(
				ModifyEditSection.wrap(obj.$view),
				ModifyEditSection.wrap(obj.$history),
				obj.$watchContainer.toggle(!obj.watched),
				obj.$unwatchContainer.toggle(obj.watched),
				ModifyEditSection.wrap(obj.$purge)
			);

			obj.$watch.off('click').on('click', (e) => clickHandler(e, false, obj, title));
			obj.$unwatch.off('click').on('click', (e) => clickHandler(e, true, obj, title));
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
	registerExpandedLinks(a, title) {
		const prefixedTitle = title.getPrefixedText();

		/** @type {JQuery<HTMLAnchorElement>} */
		const $view = $('<a>');
		$view.prop({ href: mw.util.getUrl(prefixedTitle) }).text(lcFirst(mw.msg('view')));

		/** @type {JQuery<HTMLAnchorElement>} */
		const $history = $('<a>');
		$history.prop({ href: mw.util.getUrl(prefixedTitle, { action: 'history' }) }).text(mw.msg('history_small'));

		/** @type {JQuery<HTMLAnchorElement>} */
		const $watch = $('<a>');
		$watch.prop({ href: mw.util.getUrl(prefixedTitle, { action: 'watch' }) }).text(lcFirst(mw.msg('watch')));
		const $watchContainer = ModifyEditSection.wrap($watch);

		/** @type {JQuery<HTMLAnchorElement>} */
		const $unwatch = $('<a>');
		$unwatch.prop({ href: mw.util.getUrl(prefixedTitle, { action: 'unwatch' }) }).text(lcFirst(mw.msg('unwatch')));
		const $unwatchContainer = ModifyEditSection.wrap($unwatch);

		/** @type {JQuery<HTMLAnchorElement>} */
		const $purge = $('<a>');
		$purge.prop({ href: mw.util.getUrl(prefixedTitle, { action: 'purge' }) }).text(lcFirst(mw.msg('purge')));

		this.expanded.set(prefixedTitle, {
			anchor: a,
			title,
			watched: false,
			processing: false,
			$view,
			$history,
			$watch,
			$watchContainer,
			$unwatch,
			$unwatchContainer,
			$purge
		});
	}

	/**
	 * Checks all titles in {@link expanded} for whether the user is currently
	 * watching them, and updates the {@link ExpandedSectionLink.watched} property.
	 */
	initializeWatchedStates() {
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
		return Promise.all(batch);
	}

	/**
	 * @typedef {object} Expiry
	 * @property {string} label
	 * @property {string} data
	 */
	/**
	 * @param {boolean} unwatch
	 * @param {ExpandedSectionLink} obj
	 * @param {string} title
	 * @param {Expiry} [expiryObj]
	 */
	async handleWatchLinkClick(unwatch, obj, title, expiryObj) {
		let [$msg] = await Promise.all([
			this.watchPage(unwatch, title, expiryObj && expiryObj.data),
			mw.loader.using(['oojs-ui', 'mediawiki.jqueryMsg'])
		]);

		if ($msg) {
			mw.notify($msg, { type: 'error' });
			return;
		}

		const msgKey = ModifyEditSection.getMessageKeyForSuccessfulWatch(unwatch, obj, expiryObj && expiryObj.data);
		$msg = $('<div>').append(mw.message(msgKey, title, expiryObj && expiryObj.label).parse());

		/** @type {?OO.ui.DropdownWidget} */
		let dropdown = null;
		while (!unwatch) {
			dropdown = ModifyEditSection.createWatchlistExpiryDropdown();
			if (!dropdown) {
				break;
			}
			dropdown.getMenu().selectItemByData(expiryObj ? expiryObj.data : 'infinity');
			$msg.append(dropdown.$element.css({ 'margin-top': '1em' }));
			break;
		}

		const notif = await mw.notify($msg);
		if (dropdown) {
			dropdown.on('labelChange', async () => {
				if (obj.processing) {
					return;
				}
				obj.processing = true;
				try {
					await this.handleExpiryDropdownChange(notif, obj, title, dropdown);
				} finally {
					obj.processing = false;
				}
			});
		}

		obj.$watchContainer.toggle(unwatch);
		obj.$unwatchContainer.toggle(!unwatch);
	}

	/**
	 * @param {boolean} unwatch
	 * @param {string} title
	 * @param {string} [expiry]
	 * @returns {JQuery.Promise<?JQuery<HTMLElement>>}
	 */
	watchPage(unwatch, title, expiry) {
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
		});
	}

	/**
	 * @param {boolean} unwatch
	 * @param {ExpandedSectionLink} obj
	 * @param {string} [expiry]
	 * @returns {string}
	 */
	static getMessageKeyForSuccessfulWatch(unwatch, obj, expiry = 'infinity') {
		const isTalkPage = obj.title.isTalkPage();
		if (unwatch) {
			return isTalkPage ? 'removedwatchtext-talk' : 'removedwatchtext';
		} else if (mw.util.isInfinity(expiry)) {
			return isTalkPage ? 'addedwatchindefinitelytext-talk' : 'addedwatchindefinitelytext';
		} else {
			return isTalkPage ? 'addedwatchexpirytext-talk' : 'addedwatchexpirytext';
		}
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
	 * @param {Awaited<ReturnType<mw['notify']>>} notif
	 * @param {ExpandedSectionLink} obj
	 * @param {string} title
	 * @param {OO.ui.DropdownWidget} dropdown
	 */
	async handleExpiryDropdownChange(notif, obj, title, dropdown) {
		notif.pause();

		const item = /** @type {OO.ui.OptionWidget} */ (dropdown.getMenu().findSelectedItem());
		const expiryObj = {
			data: /** @type {string} */ (item.getData()),
			label: /** @type {string} */ (item.getLabel()),
		};
		let $msg = await this.watchPage(false, title, expiryObj.data);

		if ($msg) {
			mw.notify($msg, { type: 'error' });
			notif.resume();
			return;
		}

		const msgKey = ModifyEditSection.getMessageKeyForSuccessfulWatch(false, obj, expiryObj.data);
		$msg = $('<div>').append(
			mw.message(msgKey, title, expiryObj.label).parse(),
			dropdown.$element
		);
		notif.$notification.empty().append($msg);
		notif.resume();
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