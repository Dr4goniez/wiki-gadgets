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
 * - Rewritten completely in Feb 2026; added AJAX watchlist and purge updates
 *
 * @version 2.0.5
 */
// @ts-check
/* global mw, OO */
// <nowiki>
(() => {
// *******************************************************************************************

const VERSION = '2.0.5';

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
			'infiniteblock',
			'confirm-purge-top',
			'confirmable-yes',
			'confirmable-no',
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
	 * @property {WrappedLink} view
	 * @property {WrappedLink} history
	 * @property {WrappedLink} watch
	 * @property {WrappedLink} unwatch
	 * @property {JQuery<HTMLImageElement>} $watchSpinner
	 * @property {WrappedLink} purge
	 * @property {JQuery<HTMLSpanElement>} $purgeSpinner
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
		/**
		 * Object keyed by link titles and valued by watchlist expiry dropdowns
		 * shown in mw.notify messages. Used to disable the dropdowns when
		 * they should no longer be accessible while they may still be visible
		 * on the UI.
		 *
		 * @type {Record<string, OO.ui.DropdownWidget>}
		 */
		this.notifDropdowns = Object.create(null);
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

			this.expanded.set(prefixedTitle, {
				anchor: a,
				title: t,
				watched: false,
				view: new WrappedLink(lcFirst(mw.msg('view')), prefixedTitle),
				history: new WrappedLink(mw.msg('history_small'), prefixedTitle, { action: 'history' }),
				watch: new WrappedLink(lcFirst(mw.msg('watch')), prefixedTitle, { action: 'watch' }),
				unwatch: new WrappedLink(lcFirst(mw.msg('unwatch')), prefixedTitle, { action: 'unwatch' }),
				$watchSpinner: WrappedLink.createSpinner().css({ 'margin-left': '0.2em' }),
				purge: new WrappedLink(lcFirst(mw.msg('purge')), prefixedTitle, { action: 'purge' }),
				$purgeSpinner: WrappedLink.wrap(WrappedLink.createSpinner()),
			});
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
			if (obj.$watchSpinner.is(':visible')) {
				return;
			}
			obj.$watchSpinner.show();
			// handleWatchLinkClick() should never reject by design, but we take the *safest* approach here
			try {
				await this.handleWatchLinkClick(unwatch, obj, title);
			} finally {
				// If the user's just unwatched the title and a previous watch notification is still shown,
				// disallow further interaction with the dropdown in it
				if (unwatch && this.notifDropdowns[title] && this.notifDropdowns[title].$element.is(':visible')) {
					this.notifDropdowns[title].setDisabled(true);
					delete this.notifDropdowns[title];
				}
				obj.$watchSpinner.hide();
			}
		};

		// All preparations are complete; actually expand the edit section links
		for (const [title, obj] of this.expanded) {
			$(obj.anchor).after(
				obj.view.$container,
				obj.history.$container,
				obj.watch.$container.toggle(!obj.watched),
				obj.unwatch.$container.toggle(obj.watched),
				obj.$watchSpinner.hide(),
				obj.purge.$container,
				obj.$purgeSpinner.hide()
			);

			obj.watch.$link.off('click').on('click', (e) => clickHandler(e, false, obj, title));
			obj.unwatch.$link.off('click').on('click', (e) => clickHandler(e, true, obj, title));
			obj.purge.$link.off('click').on('click', (e) => this.handlePurgeLinkClick(e, obj, title));
		}
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
			await mw.notify($msg, { type: 'error' });
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
			if (this.notifDropdowns[title] && this.notifDropdowns[title].$element.is(':visible')) {
				// If a previous watch notification is still shown, disallow further interaction
				// with the dropdown in it
				this.notifDropdowns[title].setDisabled(true);
			}
			this.notifDropdowns[title] = dropdown;
			dropdown.getMenu().selectItemByData(expiryObj ? expiryObj.data : 'infinity');
			$msg.append(dropdown.$element.css({ 'margin-top': '1em' }));
			break;
		}

		const notif = await mw.notify($msg);
		if (dropdown) {
			dropdown.on('labelChange', async () => {
				if (obj.$watchSpinner.is(':visible')) {
					return;
				}
				obj.$watchSpinner.show();
				try {
					await this.handleExpiryDropdownChange(notif, obj, title, dropdown);
				} finally {
					obj.$watchSpinner.hide();
				}
			});
		}

		obj.watch.$container.toggle(unwatch);
		obj.unwatch.$container.toggle(!unwatch);
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
			await mw.notify($msg, { type: 'error' });
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

	/**
	 * @param {JQuery.ClickEvent<HTMLAnchorElement, undefined, HTMLAnchorElement, HTMLAnchorElement>} e
	 * @param {ExpandedSectionLink} obj
	 * @param {string} title
	 */
	async handlePurgeLinkClick(e, obj, title) {
		e.preventDefault();
		e.stopPropagation();

		if (obj.$purgeSpinner.is(':visible')) {
			return;
		}
		obj.purge.$container.hide();
		obj.$purgeSpinner.show();

		await mw.loader.using('oojs-ui');

		const confirmed = await OO.ui.confirm(
			$('<div>').append(
				new OO.ui.MessageWidget({
					label: $('<a>').text(title).prop({
						href: mw.util.getUrl(title),
						target: '_blank'
					}),
					type: 'notice'
				}).$element.css({ 'margin': '0.5em 0' }),
				mw.msg('confirm-purge-top')
			),
			{
				actions: [
					{
						action: 'accept',
						label: mw.msg('confirmable-yes'),
						flags: ['primary', 'progressive']
					},
					{
						action: 'reject',
						label: mw.msg('confirmable-no'),
						flags: 'safe'
					}
				],
				size: 'medium',
				title: mw.msg('purge')
			}
		);
		if (!confirmed) {
			obj.purge.$container.show();
			obj.$purgeSpinner.hide();
			return;
		}

		/** @type {?JQuery<HTMLElement>} */
		const $msg = await this.api.post({
			action: 'purge',
			forcerecursivelinkupdate: 1,
			titles: title,
			redirects: 1,
			errorformat: 'html',
			errorlang: mw.config.get('wgUserLanguage'),
			errorsuselocal: true,
		}).then(() => null)
		.catch((_, err) => {
			console.warn(err);
			return this.api.getErrorMessage(err);
		});

		if ($msg) {
			await mw.notify($msg, { type: 'error' });
			obj.purge.$container.show();
			obj.$purgeSpinner.hide();
			return;
		}
		location.reload();
	}

}
/**
 * @type {OO.ui.MenuOptionWidget.ConfigOptions[]|false|null}
 * `false` if no parsable messages exist.
 */
ModifyEditSection.expiryOptions = null;

class WrappedLink {

	/**
	 * @param {string} text
	 * @param {string} title
	 * @param {Record<string, string | number | boolean>} [query]
	 */
	constructor(text, title, query) {
		/**
		 * @type {JQuery<HTMLAnchorElement>}
		 * @readonly
		 */
		this.$link = $('<a>');
		/**
		 * @type {JQuery<HTMLSpanElement>}
		 * @readonly
		 */
		this.$container = WrappedLink.wrap(this.$link);

		this.$link.prop({ href: mw.util.getUrl(title, query) }).text(text);
	}

	/**
	 * @param {JQuery<HTMLElement>} $el
	 * @returns {JQuery<HTMLSpanElement>}
	 */
	static wrap($el) {
		return $('<span>').addClass('mw-editsection-expanded').append($el);
	}

	static createSpinner() {
		const spinner = new Image();
		spinner.src = 'https://upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif';
		spinner.style.cssText = 'vertical-align: middle; height: 1em; border: 0;';
		return $(spinner);
	}

}

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