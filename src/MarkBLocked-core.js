/**
 * MarkBLocked-core
 * @author [[User:Dragoniez]]
 * @version 3.2.1
 *
 * @see https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MarkBLocked-core.css – Style sheet
 * @see https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MarkBLocked.js – Loader module
 *
 * Additional information:
 * @see https://ja.wikipedia.org/wiki/Help:MarkBLocked – About the jawiki gadget
 *
 * Global user script that uses this module:
 * @see https://meta.wikimedia.org/wiki/User:Dragoniez/MarkBLockedGlobal.js
 * @see https://meta.wikimedia.org/wiki/User:Dragoniez/MarkBLockedGlobal – English help page
 * @see https://meta.wikimedia.org/wiki/User:Dragoniez/MarkBLockedGlobal/ja – Japanese help page
 *
 * To use this gadget on another (WMF) wiki, prepare a loader module for it.
 * Refer to the example loader module linked above, and see `ConstructorConfig` below.
 *
 * Helper type definitions are available at:
 * @see https://github.com/Dr4goniez/wiki-gadgets/blob/main/src/window/MarkBLocked.d.ts
 */
// @ts-check
/// <reference path="./window/MarkBLocked.d.ts" />
/* global mw, OO */
//<nowiki>
// const MarkBLocked = (() => {
module.exports = (() => {

/**
 * A simple typed wrapper around localStorage that serializes to/from JSON.
 *
 * @template {Record<string, any>} T
 */
class Storage {
	/**
	 * @param {string} key The localStorage key to persist data under.
	 */
	constructor(key) {
		/**
		 * @type {string}
		 * @private
		 * @readonly
		 */
		this.key = key;

		if (!localStorage.getItem(key)) {
			localStorage.setItem(key, '{}');
		}
	}

	/**
	 * Returns the parsed value from localStorage, or an empty object if missing or invalid.
	 *
	 * @returns {T}
	 */
	get() {
		const raw = localStorage.getItem(this.key);
		if (!raw) {
			localStorage.setItem(this.key, '{}');
			return /** @type {T} */ ({});
		}

		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return parsed;
			}
		} catch (_) { /* empty */ }

		localStorage.setItem(this.key, '{}');
		return /** @type {T} */ ({});
	}

	/**
	 * Returns the value for the given key, or `null` if not present.
	 *
	 * @param {keyof T} key
	 * @returns {?T[keyof T]}
	 */
	getByKey(key) {
		const obj = this.get();
		return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : null;
	}

	/**
	 * Overwrites the entire object in storage.
	 *
	 * @param {T} data
	 * @returns {this}
	 */
	set(data) {
		localStorage.setItem(this.key, JSON.stringify(data));
		return this;
	}

	/**
	 * Sets a specific key in the stored object.
	 *
	 * @param {keyof T} key
	 * @param {T[keyof T]} value
	 * @returns {this}
	 */
	setByKey(key, value) {
		const obj = this.get();
		obj[key] = value;
		return this.set(obj);
	}

	/**
	 * Removes a specific key from the stored object.
	 *
	 * @param {keyof T} key
	 * @returns {this}
	 */
	removeByKey(key) {
		const obj = this.get();
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			delete obj[key];
			this.set(obj);
		}
		return this;
	}
}

class MarkBLocked {

	/**
	 * @typedef {object} UserOptions
	 * Options that control which types of user links are marked up based on block or lock status.
	 *
	 * @property {boolean} genportlet Whether to generate a portlet link to the config page.
	 * @property {boolean} rangeblocks Whether to mark up IPs that fall within locally blocked IP ranges.
	 * @property {boolean} g_locks Whether to mark up users who are globally locked.
	 * @property {boolean} g_blocks Whether to mark up users and IPs that are globally blocked.
	 * @property {boolean} g_rangeblocks Whether to mark up IPs that fall within globally blocked IP ranges.
	 */
	/**
	 * @typedef {object} ConstructorConfig
	 * @property {Partial<UserOptions>} [defaultOptions] Optional default values for user options. These will be merged into
	 * the built-in defaults (i.e. supports partial overrides).
	 * @property {string} [optionKey] The key used for `mw.user.options`, defaulting to `userjs-markblocked-config`.
	 * @property {boolean} [globalize] If `true`, saves the options in global preferences.
	 * @property {Record<string, Lang>} [i18n] A language object to merge into {@link MarkBLocked.i18n}. This allows
	 * customizing the default interface messages or adding new interface languages.
	 * For the latter to work, the {@link ConstructorConfig.lang | lang} property must also be set.
	 * @property {string} [lang] The language code to use for interface messages. Defaults to `en`.
	 */

	/**
	 * Initializes `MarkBLocked`.
	 *
	 * @param {ConstructorConfig} [config]
	 * @returns {JQueryPromise<MarkBLocked>}
	 */
	static init(config) {

		// Disallow a second run
		if (window.MarkBLockedLoaded) {
			const err = 'Looks like MarkBLocked is loaded from multiple sources.';
			mw.notify(err, { type: 'error', autoHideSeconds: 'long' });
			throw new Error(err);
		} else {
			window.MarkBLockedLoaded = true;
		}

		const cfg = config || {};

		// Wait for dependent modules to get ready
		const modules = [
			'mediawiki.user',
			'mediawiki.api',
			'mediawiki.ForeignApi',
			'mediawiki.util',
			'jquery.ui'
		];
		const onConfig = mw.config.get('wgNamespaceNumber') === -1 && /^(markblockedconfig|mblc)$/i.test(mw.config.get('wgTitle'));
		const isRCW = ['Recentchanges', 'Watchlist'].includes(mw.config.get('wgCanonicalSpecialPageName') || '');
		if (onConfig || isRCW) {
			modules.push(
				'oojs-ui',
				'oojs-ui.styles.icons-moderation'
			);
		}
		return mw.loader.using(modules).then(() => { // When ready

			// For backwards compatibility, clear old config if any
			/** @type {JQueryPromise<void>} */
			const backwards = (() => {
				const oldOptionKey = 'userjs-gmbl-preferences';
				/** @type {string?} */
				const oldCfgStr = mw.user.options.get(oldOptionKey);
				if (
					oldCfgStr &&
					(cfg.optionKey === void 0 || cfg.optionKey === this.defaultOptionKey) &&
					!mw.user.options.get(this.defaultOptionKey)
				) {
					const options = {
						[oldOptionKey]: null,
						[this.defaultOptionKey]: oldCfgStr
					};
					return new mw.Api(this.getApiOptions()).saveOptions(options).then(() => {
						mw.user.options.set(options);
					});
				} else {
					return $.Deferred().resolve();
				}
			})();

			// Entry point
			return $.when(
				this.getSpecialPageAliases(),
				this.getUserRights(),
				backwards,
				$.ready
			).then((aliases, rights) => {

				const mbl = new MarkBLocked(cfg, aliases, rights);
				if (onConfig) {
					mbl.createConfigInterface();
				} else {

					mbl.createPortletLink();

					// Handle the `wikipage.content` hook
					/**
					 * Timeout ID used to defer a `markup` call when needed.
					 * Cleared or reset depending on the DOM connection state of `$content`.
					 *
					 * @type {NodeJS.Timeout=}
					 */
					let hookTimeout;

					/**
					 * Applies user link markup to the given content container.
					 *
					 * @param {JQuery<HTMLElement>} [$content] Defaults to `.mw-body-content` if not provided.
					 */
					const run = ($content = $('.mw-body-content')) => {
						hookTimeout = void 0; // Clear the hook timeout reference
						if (isRCW) {
							// Abort in-flight requests only on Special:RecentChanges or Special:Watchlist, where
							// `$content` is fully replaced on each dynamic page update. In these cases, any
							// .mbl-userlink anchors from the previous DOM are lost, so keeping pending HTTP requests
							// serves no purpose. On other pages, full DOM replacement is rare, and aborting may
							// prevent some user links from being processed. `collectLinks()` skips anchors already
							// marked with `.mbl-userlink`, so duplicate processing is safely avoided.
							mbl.abort();
						}
						mbl.markup($content, isRCW);
					};

					/**
					 * Callback for `mw.hook('wikipage.content').add()`.
					 *
					 * @param {JQuery<HTMLElement>} $content The container with potentially updated content.
					 */
					const hookHandler = ($content) => {
						const isConnected = $content[0] && $content[0].isConnected;
						if (isConnected) {
							clearTimeout(hookTimeout); // Cancel any pending fallback `run()` call
							if ($content.find('a').length) {
								run($content);
							}
						} else if (typeof hookTimeout !== 'number') {
							// Ensure that `run()` is called at least once, even if all `wikipage.content` events
							// are triggered on disconnected elements
							hookTimeout = setTimeout(run, 100);
						}
					};

					mw.hook('wikipage.content').add(hookHandler);

					mbl.handleIpReveals(rights, isRCW);

					// Add a toggle button on RCW
					if (isRCW) {
						mbl.createToggleButton(hookHandler);
					}

				}
				return mbl;

			});

		});

	}

	/**
	 * Gets API options to initialize a `mw.Api` instance.
	 *
	 * This method adds an `Api-User-Agent` header and sets the default query parameters of:
	 * ```
	 * {
	 * 	action: 'query',
	 * 	format: 'json',
	 * 	formatversion: '2'
	 * }
	 * ```
	 * @param {object} [options] Addtional options to initialize the options object.
	 * @param {number} [options.timeout] Optional default timeout for HTTP requests.
	 * @param {boolean} [options.nonwritepost] Whether the instance is used for read-only POST requests.
	 * @returns {mw.Api.Options}
	 * @private
	 */
	static getApiOptions(options = {}) {
		const ret = {
			ajax: {
				headers: {
					'Api-User-Agent': 'MarkBLocked-core/3.2.1 (https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MarkBLocked-core.js)'
				}
			},
			parameters: {
				action: 'query',
				format: 'json',
				formatversion: '2'
			}
		};
		if (typeof options.timeout === 'number') {
			ret.ajax.timeout = options.timeout;
		}
		if (options.nonwritepost) {
			// See https://www.mediawiki.org/wiki/API:Etiquette#Other_notes
			ret.ajax.headers['Promise-Non-Write-API-Action'] = true;
		}
		return ret;
	}

	/**
	 * @typedef {object} SpecialPageAliases
	 * @property {number} _expiry
	 * @property {string[]} Contributions
	 * @property {string[]} IPContributions
	 * @property {string[]} GlobalContributions
	 * @property {string[]} CentralAuth
	 */
	/**
	 * Retrieves special page aliases related to link markups.
	 *
	 * @returns {JQueryPromise<SpecialPageAliases>}
	 * @private
	 */
	static getSpecialPageAliases() {
		/**
		 * @type {Storage<Record<string, SpecialPageAliases>>}
		 */
		const storage = new Storage('markblocked-specialpagealiases');
		const server = mw.config.get('wgServerName');

		// Define the expected structure and types
		/** @type {Record<keyof SpecialPageAliases, 'number' | 'object'>} */
		const expectedProps = {
			_expiry: 'number',
			Contributions: 'object',
			IPContributions: 'object',
			GlobalContributions: 'object',
			CentralAuth: 'object',
		};

		let data = storage.getByKey(server);
		const now = Date.now();
		if (
			data !== null &&
			Number.isInteger(data._expiry) && data._expiry > now &&
			Object.entries(expectedProps).every(([prop, expectedType]) => {
				const value = /** @type {SpecialPageAliases} */ (data)[prop];
				if (typeof value !== expectedType) return false;
				if (expectedType === 'object' && !Array.isArray(value)) return false;
				return true;
			})
		) {
			return $.Deferred().resolve(data);
		}

		data = {
			_expiry: now + 24 * 60 * 60 * 1000, // 1 day from now
			Contributions: [],
			IPContributions: [],
			GlobalContributions: [],
			CentralAuth: [],
		};
		return new mw.Api(this.getApiOptions()).get({
			meta: 'siteinfo',
			siprop: 'specialpagealiases'
		}).then(/** @param {ApiResponse} res */ (res) => {
			const specialpagealiases = res && res.query && res.query.specialpagealiases;
			if (specialpagealiases) {
				specialpagealiases.forEach(({ realname, aliases }) => {
					if (data[realname] && realname !== '_expiry') {
						data[realname].push(
							...aliases.filter(el => el !== realname)
						);
					}
				});
				storage.setByKey(server, data);
			} else {
				storage.removeByKey(server);
			}
			return data;
		}).catch((_, err) => {
			console.warn('Failed to special page aliases:', err);
			storage.removeByKey(server);
			return data;
		});
	}

	/**
	 * @typedef {object} UserRights
	 * @property {number} _expiry
	 * @property {string[]} rights
	 */
	/**
	 * Retrieves and caches user rights.
	 *
	 * @returns {JQueryPromise<Set<string>>}
	 * @private
	 */
	static getUserRights() {
		/**
		 * @type {Storage<Record<string, UserRights>>}
		 */
		const storage = new Storage('markblocked-userrights');
		const server = mw.config.get('wgServerName');

		let data = storage.getByKey(server);
		const now = Date.now();
		if (
			data !== null &&
			Number.isInteger(data._expiry) && data._expiry > now &&
			Array.isArray(data.rights) && data.rights.every(el => typeof el === 'string')
		) {
			return $.Deferred().resolve(new Set(data.rights));
		}

		data = {
			_expiry: now + 60 * 60 * 1000, // 1 hour from now
			rights: [],
		};
		return mw.user.getRights().then((rights) => {
			data.rights = rights;
			storage.setByKey(server, data);
			return new Set(data.rights);
		}).catch((...err) => {
			console.warn('Failed to get user rights:', err);
			storage.removeByKey(server);
			return new Set();
		});
	}

	/**
	 * Handles post-processing of temporary account IP reveals, allowing the script to mark revealed IPs.
	 *
	 * @param {Set<string>} rights
	 * @param {boolean} isRCW
	 * @private
	 */
	handleIpReveals(rights, isRCW) {
		if (!rights.has('checkuser-temporary-account')) {
			return;
		}

		// Override $.fn.replaceWith to intercept IP reveals
		const ipRevealHook = mw.hook('userjs.markblocked.ipreveal');
		const originalReplaceWith = $.fn.replaceWith;
		$.fn.replaceWith = function() {
			if (this.hasClass('ext-checkuser-tempaccount-reveal-ip-button')) {
				/** @type {JQuery<HTMLElement>} */
				const $arg0 = arguments[0];
				if (
					$arg0 instanceof $ &&
					$arg0.hasClass('ext-checkuser-tempaccount-reveal-ip') &&
					$arg0.children('a.ext-checkuser-tempaccount-reveal-ip-anchor').length
				) {
					ipRevealHook.fire($arg0);
				}
			}
			return originalReplaceWith.apply(this, arguments);
		};

		// Handle the IP reveal hook
		/**
		 * @type {NodeJS.Timeout=}
		 */
		let revealHookTimeout;
		/**
		 * @type {JQuery<HTMLElement>}
		 */
		let $batchRevealed = $([]);

		// When a new IP element is revealed, queue it for batch markup
		ipRevealHook.add(/** @param {JQuery<HTMLElement>} $element */ ($element) => {
			$batchRevealed = $batchRevealed.add($element);
			clearTimeout(revealHookTimeout);

			// Delay execution to allow batching multiple IP reveals within 100ms
			revealHookTimeout = setTimeout(() => {
				const $revealed = $batchRevealed;
				$batchRevealed = $([]);
				this.markup($revealed, isRCW);
			}, 100);
		});
	}

	/**
	 * Private constructor. Called only by {@link MarkBLocked.init}.
	 *
	 * @param {ConstructorConfig} cfg
	 * @param {SpecialPageAliases} aliasMap
	 * @param {Set<string>} rights
	 * @private
	 * @requires mediawiki.api
	 * @requires mediawiki.ForeignApi
	 * @requires mediawiki.user
	 */
	constructor(cfg, aliasMap, rights) {

		/**
		 * @type {mw.Api}
		 */
		this.api = new mw.Api(MarkBLocked.getApiOptions({ timeout: 60*1000 }));
		/**
		 * @type {mw.Api}
		 */
		this.readApi = new mw.Api(MarkBLocked.getApiOptions({ timeout: 60*1000, nonwritepost: true }));
		/**
		 * @type {mw.Api}
		 */
		this.metaApi = mw.config.get('wgWikiID') === 'metawiki' ?
			this.api :
			new mw.ForeignApi(
				'https://meta.wikimedia.org/w/api.php',
				/**
				 * On mobile devices, cross-origin requests may fail becase of a "badtoken" error related to
				 * `centralauthtoken`. This never happened with the `{ anonymous: true }` option for `mw.ForeignApi`,
				 * hence included.
				 * @see https://doc.wikimedia.org/mediawiki-core/1.32.0/js/#!/api/mw.ForeignApi-method-constructor
				 * We will only need to send GET requests to fetch data, so this shouldn't be problematic.
				 */
				Object.assign(MarkBLocked.getApiOptions({ timeout: 60*1000 }), { anonymous: true })
			);

		// Show Warning if the config has any invalid property
		const validKeys = new Set(['defaultOptions', 'optionKey', 'globalize', 'i18n', 'lang']);
		const invalidKeys = Object.keys(cfg).reduce(/** @param {string[]} acc */ (acc, key) => {
			if (!validKeys.has(key)) {
				acc.push(key);
			}
			return acc;
		}, []);
		if (invalidKeys.length) {
			console.error('MarkBLocked: Detected invalid constructor options: ' + invalidKeys.join(', '));
		}

		// User options
		/**
		 * The key of `mw.user.options`.
		 */
		this.optionKey = cfg.optionKey || MarkBLocked.defaultOptionKey;
		/**
		 * @type {UserOptions}
		 */
		this.options = (() => {
			const defaultOptions = Object.assign({
				genportlet: true,
				rangeblocks: false,
				g_locks: false,
				g_blocks: false,
				g_rangeblocks: false
			}, cfg.defaultOptions);
			/** @type {string} */
			const optionsStr = mw.user.options.get(this.optionKey) || '{}';
			/** @type {Record<string, boolean>} */
			let options;
			try {
				options = JSON.parse(optionsStr);
				// For backwards compatibility
				if (options.localips) {
					options.rangeblocks = options.localips;
					delete options.localips;
				}
				if (options.globalusers) {
					options.g_locks = options.globalusers;
					delete options.globalusers;
				}
				if (options.globalips) {
					options.g_rangeblocks = options.globalips;
					delete options.globalips;
				}
			} catch(err) {
				console.error(err);
				options = defaultOptions;
			}
			/** @type {UserOptions} */
			const ret = Object.assign(defaultOptions, options);
			if (ret.g_rangeblocks) {
				// g_blocks must be enabled when g_rangeblocks is enabled
				ret.g_blocks = true;
			}
			return ret;
		})();
		/**
		 * @type {boolean}
		 */
		this.globalize = !!cfg.globalize;
		console.log('MarkBLocked globalization: ' + this.globalize);

		// Language options
		if (typeof cfg.i18n === 'object' && !Array.isArray(cfg.i18n) && cfg.i18n !== null) {
			Object.assign(MarkBLocked.i18n, cfg.i18n);
		}
		/**
		 * @type {Lang}
		 */
		this.msg = (() => {
			let langCode = 'en';
			if (cfg.lang !== void 0) {
				cfg.lang = String(cfg.lang);
			}
			if (cfg.lang) {
				if (cfg.lang in MarkBLocked.i18n) {
					langCode = cfg.lang;
				} else {
					console.error(`MarkBLocked does not have "${cfg.lang}" language support for its interface.`);
				}
			}
			return MarkBLocked.i18n[langCode];
		})();

		/**
		 * Regular expressions to collect user-related links.
		 *
		 * @typedef {object} LinkRegex
		 * @property {RegExp} article `/wiki/PAGENAME`: $1: PAGENAME
		 * @property {RegExp} script `/w/index.php?title=PAGENAME`: $1: PAGENAME
		 * @property {RegExp} special `^Special:(?:Contribs|CA)($|/)`
		 * @property {RegExp} user `^(?:Special:.../|User:)(USERNAME|CIDR)`: $1: USERNAME or CIDR
		 */
		/**
		 * @type {LinkRegex}
		 */
		this.regex = (() => {
			// Collect namespace aliases
			const wgNamespaceIds = mw.config.get('wgNamespaceIds'); // { "special": -1, "user": 2, ... }
			const nsAliases = {
				special: /** @type {string[]} */ ([]),
				user: /** @type {string[]} */ ([])
			};
			for (const alias in wgNamespaceIds) {
				const nsId = wgNamespaceIds[alias];
				switch (nsId) {
					case -1:
						nsAliases.special.push(alias);
						break;
					case 2:
					case 3:
						nsAliases.user.push(alias);
				}
			}

			// Process special page aliases
			const /** @type {string[]} */ spAliases = [];
			const /** @type {string[]} */ spAliasesNoTarget = [];
			Object.entries(aliasMap).forEach(([realname, aliases]) => {
				if (Array.isArray(aliases)) {
					spAliases.push(realname, ...aliases);
					if (realname !== 'IPContributions' && realname !== 'GlobalContributions') {
						// For these pages, the &target= query does not override the subpage target (2025-08-02)
						spAliasesNoTarget.push(realname, ...aliases);
					}
				}
			});

			const rSpecial = `(?:${nsAliases.special.join('|')}):(?:${spAliases.join('|')})`;
			const rSpecialNoTarget = `(?:${nsAliases.special.join('|')}):(?:${spAliasesNoTarget.join('|')})`;
			const rUser = `(?:${nsAliases.user.join('|')}):`;
			return {
				article: new RegExp(mw.config.get('wgArticlePath').replace('$1', '([^#?]+)')),
				script: new RegExp(mw.config.get('wgScript') + '\\?title=([^#&]+)'),
				special: new RegExp(`^${rSpecialNoTarget}($|/)`, 'i'),
				user: new RegExp(`^(?:${rSpecial}/|${rUser})([^/#]+|[a-f\\d:\\.]+/\\d\\d)$`, 'i')
			};
		})();

		/**
		 * The maximum number of batch parameter values for the API.
		 * @type {500 | 50}
		 */
		this.apilimit = rights.has('apihighlimits') ? 500 : 50;

	}

	/**
	 * Replaces the page content with the MarkBLocked config interface.
	 *
	 * @returns {void}
	 * @private
	 * @requires oojs-ui
	 * @requires oojs-ui.styles.icons-moderation
	 * @requires mediawiki.api
	 * @requires mediawiki.user
	 */
	createConfigInterface() {

		document.title = 'MarkBLockedConfig - ' + mw.config.get('wgSiteName');

		// Collect DOM elements
		const $heading = $('.mw-first-heading');
		const $body = $('.mw-body-content');
		if (!$heading.length || !$body.length) {
			mw.notify(this.getMessage('config-notify-notloaded'));
			return;
		}
		$heading.text(this.getMessage('config-label-heading'));

		// Transparent overlay of the container used to make elements in it unclickable
		const $overlay = $('<div>');

		// General options
		const genportlet = new OO.ui.CheckboxInputWidget({
			selected: this.options.genportlet
		});
		const fsGeneral = new OO.ui.FieldsetLayout({
			label: this.getMessage('config-label-fsgeneral'),
			items: [
				new OO.ui.FieldLayout(genportlet, {
					label: this.getMessage('config-label-genportlet'),
					align: 'inline'
				})
			]
		});

		// Markup options
		const rangeblocks = new OO.ui.CheckboxInputWidget({
			selected: this.options.rangeblocks
		});
		const g_locks = new OO.ui.CheckboxInputWidget({
			selected: this.options.g_locks
		});
		const g_blocks = new OO.ui.CheckboxInputWidget({
			selected: this.options.g_blocks
		});
		const g_rangeblocks = new OO.ui.CheckboxInputWidget({
			selected: this.options.g_rangeblocks,
			disabled: !g_blocks.isSelected()
		});
		g_blocks.off('change').on('change', () => {
			if (!g_blocks.isSelected()) {
				g_rangeblocks.setSelected(false).setDisabled(true);
			} else {
				g_rangeblocks.setDisabled(false);
			}
		});
		/**
		 * @param {keyof Lang} key
		 * @param {boolean} [empty]
		 * @returns {JQuery<HTMLSpanElement>}
		 */
		const getExclMessage = (key, empty = false) => {
			return $('<span>').append(
				$('<b>')
					.addClass('mblc-exclamation')
					.text(empty ? '' : '!'),
				this.getMessage(key)
			);
		};
		const fsMarkup = new OO.ui.FieldsetLayout({
			label: this.getMessage('config-label-fsmarkup'),
			help: this.getMessage('config-help-resources'),
			helpInline: true,
			items: [
				new OO.ui.FieldLayout(rangeblocks, {
					label: getExclMessage('config-label-rangeblocks'),
					align: 'inline'
				}),
				new OO.ui.FieldLayout(g_locks, {
					label: getExclMessage('config-label-g_locks'),
					align: 'inline'
				}),
				new OO.ui.FieldLayout(g_blocks, {
					label: getExclMessage('config-label-g_blocks', true),
					align: 'inline'
				}),
				new OO.ui.FieldLayout(g_rangeblocks, {
					label: getExclMessage('config-label-g_rangeblocks'),
					align: 'inline',
					help: this.getMessage('config-help-g_rangeblocks'),
					helpInline: true
				})
			]
		});

		// Save button
		const saveButton = new OO.ui.ButtonWidget({
			id: 'mblc-save',
			label: this.getMessage('config-label-save'),
			icon: 'bookmarkOutline',
			flags: ['primary', 'progressive']
		}).off('click').on('click', () => {

			$overlay.show();

			// Change the save button's label
			saveButton.setIcon(null).setLabel(
				$('<span>')
					.append(
						$('<img>')
							.prop('src', '//upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif')
							.css({
								verticalAlign: 'middle',
								height: '1em',
								border: '0',
								marginRight: '1em'
							}),
							document.createTextNode(this.getMessage('config-label-saving'))
					)
			);

			// Get config
			const /** @type {UserOptions} */ cfg = {
				genportlet: genportlet.isSelected(),
				rangeblocks: rangeblocks.isSelected(),
				g_locks: g_locks.isSelected(),
				g_blocks: g_blocks.isSelected(),
				g_rangeblocks: g_rangeblocks.isSelected()
			};
			const cfgStr = JSON.stringify(cfg);

			// Save config
			this.api.postWithToken('csrf', {
				action: this.globalize ? 'globalpreferences' : 'options',
				optionname: this.optionKey,
				optionvalue: cfgStr
			}).then(() => {
				mw.user.options.set(this.optionKey, cfgStr);
				return null;
			}).catch(/** @param {string} code */ (code, err) => {
				console.warn(err);
				return code;
			}).then(/** @param {string?} err */ (err) => {
				if (err) {
					mw.notify(this.getMessage('config-notify-savefailed') + '(' + err + ')', { type: 'error' });
				} else {
					mw.notify(this.getMessage('config-notify-savedone'), { type: 'success' });
				}
				saveButton.setIcon('bookmarkOutline').setLabel(this.getMessage('config-label-save'));
				$overlay.hide();
			});

		});

		// Construct the config body
		$body.empty().append(
			$('<div>')
				.prop('id', 'mblc-container')
				.append(
					$('<div>')
						.prop('id', 'mblc-optionfield')
						.append(
							fsGeneral.$element,
							fsMarkup.$element
						),
					saveButton.$element
				),
			$overlay
				.prop('id', 'mblc-container-overlay')
				.hide()
		);

	}

	/**
	 * Gets an interface message.
	 *
	 * @param {keyof Lang} key
	 * @returns {string}
	 * @private
	 */
	getMessage(key) {
		return this.msg[key];
	}

	/**
	 * Creates a portlet link to the config page.
	 *
	 * @returns {void}
	 * @private
	 * @requires mediawiki.util
	 */
	createPortletLink() {
		if (this.options.genportlet) {
			const portlet = mw.util.addPortletLink(
				document.getElementById('p-tb') ? 'p-tb' : 'p-personal', // p-tb doesn't exist on minerva
				mw.util.getUrl('Special:MarkBLockedConfig'),
				this.getMessage('portlet-text'),
				'ca-mblc',
				this.getMessage('portlet-title')
			);
			if (!portlet) {
				console.error('Failed to create a portlet link for MarkBLocked.');
			}
		}
	}

	/**
	 * Aborts all unfinished requests issued by the MarkBLocked class instance.
	 *
	 * @returns {MarkBLocked}
	 * @private
	 */
	abort() {
		this.api.abort();
		this.readApi.abort();
		this.metaApi.abort();
		return this;
	}

	/**
	 * Creates a button to enable/disable MarkBLocked.
	 *
	 * This is for Special:Recentchanges and Special:Watchlist, where {@link markup} is called recursively when
	 * the page content is updated.
	 *
	 * @param {($content: JQuery<HTMLElement>) => void} hookHandler A function to (un)bind to the `wikipage.content` hook.
	 * @returns {void}
	 * @private
	 */
	createToggleButton(hookHandler) {

		// Create toggle button
		const toggle = new OO.ui.ButtonWidget({
			id: 'mbl-toggle',
			label: 'MBL',
			icon: 'unLock',
			flags: 'progressive',
			title: this.getMessage('toggle-title-enabled')
		}).off('click').on('click', () => {
			const disable = toggle.getFlags().includes('progressive');
			let icon, title, hookToggle, msg;
			if (disable) {
				icon = 'lock';
				title = this.getMessage('toggle-title-disabled');
				hookToggle = mw.hook('wikipage.content').remove;
				msg = this.getMessage('toggle-notify-disabled');
				$('.mbl-userlink').each(function () {
					const $el = $(this);

					// Remove all classes starting with 'mbl-'
					const mblClasses = this.className.match(/(^|\s)mbl-\S+/g);
					if (mblClasses) {
						$el.removeClass(mblClasses.map(el => el.trim()).join(' '));
					}

					// Destroy tooltip if present
					if (this.dataset.mblTooltip) {
						try {
							$el.tooltip('destroy');
						} catch (e) {
							console.warn('Tooltip destroy failed:', e);
						}
					}
				});
			} else {
				icon = 'unLock';
				title = this.getMessage('toggle-title-enabled');
				hookToggle = mw.hook('wikipage.content').add;
				msg = this.getMessage('toggle-notify-enabled');
			}
			toggle
				.setFlags({ progressive: !disable, destructive: disable })
				.setIcon(icon)
				.setTitle(title);
			hookToggle(hookHandler);
			mw.notify(msg);
		});
		const $wrapper = $('<div>')
			.prop('id', 'mbl-toggle-wrapper')
			.append(toggle.$element);

		// Append the toggle button
		const spName = mw.config.get('wgCanonicalSpecialPageName');
		let selector = '';
		if (spName === 'Recentchanges') {
			selector = '.mw-rcfilters-ui-cell.mw-rcfilters-ui-rcTopSectionWidget-savedLinks';
			$(selector).eq(0).before($wrapper);
		} else if (spName === 'Watchlist') {
			selector = '.mw-rcfilters-ui-cell.mw-rcfilters-ui-watchlistTopSectionWidget-savedLinks';
			$(selector).eq(0).before($wrapper);
		}

	}

	/**
	 * Marks up user links.
	 *
	 * @param {JQuery<HTMLElement>} $content
	 * @param {boolean} isRCW
	 * @returns {JQueryPromise<void>}
	 * @private
	 * @requires mediawiki.util
	 * @requires mediawiki.api
	 * @requires mediawiki.ForeignApi
	 */
	markup($content, isRCW) {

		if (!this.options.g_blocks && this.options.g_rangeblocks) {
			throw new Error('g_rangeblocks is unexpectedly turned on when g_blocks is turned off.');
		}

		// Collect user links
		const { userLinks, users, ips } = this.collectLinks($content, isRCW);
		if (!userLinks.size) {
			console.log('MarkBLocked', {
				$content,
				links: 0
			});
			return $.Deferred().resolve();
		}
		const allUsers = [...users].concat([...ips]);

		// Start markup
		return $.when(
			this.bulkMarkup('local', userLinks, allUsers),
			this.bulkMarkup('global', userLinks, this.options.g_blocks ? allUsers : [])
		).then((markedUsers, g_markedUsers) => {

			if (markedUsers === null && g_markedUsers === null) { // Aborted
				return;
			} else if (markedUsers === null || g_markedUsers === null) {
				// bulkMarkup uses the same mw.Api instance, so the code is never supposed to reach this block
				throw new Error('Unexpected abortion');
			} else {
				console.log('MarkBLocked', {
					$content,
					links: $('.mbl-userlink').length,
					user_registered: users.size,
					user_anonymous: ips.size
				});
			}

			// Create a batch array for additional markups
			/** @type {BatchObject[]} */
			const batchArray = [];
			/**
			 * An array of IP addresses that are not blocked in themselves. Using this array, we will check
			 * for range blocks affecting the IPs. IPs can have multiple blocks in theory, but we filter
			 * out those that are CIDR-wise not narrowest. This means that blocked IPs' user links will
			 * never be assigned more than one CSS class each, among `mbl-blocked-indef`, `mbl-blocked-temp`,
			 * and `mbl-blocked-partial`.
			 */
			let remainingIps;
			if (this.options.rangeblocks && (remainingIps = filterSet(ips, (ip) => !markedUsers.has(ip))).size) {
				remainingIps.forEach((ip) => {
					batchArray.push({
						username: ip,
						params: {
							list: 'blocks',
							bkip: ip,
							bkprop: 'user|by|expiry|reason|flags'
						},
						callback: (res) => {
							// An IP may have multiple blocks
							const resBlk = res && res.query && res.query.blocks || [];
							const resObj = resBlk.reduce(/** @param {ApiResponseQueryListBlocks?} acc */ (acc, obj, i) => {
								if (i === 0) {
									acc = obj; // Just save the object in the first loop
								} else {
									// If the IP has multiple blocks, find the narrowest one CIDR-wise
									let m;
									const lastRange = acc && (m = acc.user.match(/\/(\d+)$/)) ? parseInt(m[1]) : 128;
									const thisRange = (m = obj.user.match(/\/(\d+)$/)) !== null ? parseInt(m[1]) : 128;
									if (thisRange > lastRange) { // e.g., /24 is narrower than /23
										acc = obj; // Overwrite the previously substituted object
									}
								}
								return acc;
							}, null);
							if (resObj) {
								const { user, by, expiry, reason, partial } = resObj;
								let clss;
								const range = (user.match(/\/(\d+)$/) || ['', '??'])[1];
								// $1: Domain, $2: CIDR range, $3: Expiry, $4: Blocking admin, $5: Reason
								const titleVars = [this.getMessage('title-domain-local'), range, '', by, reason];
								if (/^in/.test(expiry)) {
									clss = partial ? 'mbl-blocked-partial' : 'mbl-blocked-indef';
									titleVars[2] = this.getMessage('title-expiry-indefinite');
								} else {
									clss = partial ? 'mbl-blocked-partial' : 'mbl-blocked-temp';
									titleVars[2] = this.getMessage('title-expiry-temporary').replace('$1', expiry);
								}
								const tooltip = mw.format(this.getMessage('title-rangeblocked'), ...titleVars);
								MarkBLocked.addClass(userLinks, ip, clss, tooltip);
							}
						}
					});
				});
			}
			if (this.options.g_locks && users.size) {
				users.forEach((user) => {
					batchArray.push({
						username: user,
						api: this.metaApi,
						params: {
							list: 'globalallusers|logevents',
							agulimit: 1,
							agufrom: user,
							aguto: user,
							aguprop: 'lockinfo',
							leaction: 'globalauth/setstatus',
							leprop: 'user|timestamp|comment|details',
							letitle: `User:${user}@global`
						},
						callback: (res) => {
							if (res && res.query) {
								const resLck = res.query.globalallusers;
								if (resLck && resLck[0] && resLck[0].locked === '') {
									const resLgev = res.query.logevents;
									// $1: Locking steward, $2: "Since" timestamp, $3: Reason
									// Note: logs can be revdeled or suppressed occasionally
									const titleVars = ['??', '??','??'];
									if (resLgev && resLgev.length) {
										/**
										 * The `params` property is an object with either the `added` and `removed` keys, or
										 * the `0` and `1` numeral keys (in the case of an old log entry):
										 * ```
										 * "params": {
										 *		"added": [
										 *			"locked"
										 *		],
										 *		"removed": []
										 *	}
										 * ```
										 * ```
										 * "params": {
										 *		"0": "locked",
										 *		"1": "(none)"
										 *	}
										 * ```
										 */
										for (const { params, user, timestamp, comment } of resLgev) {
											if (!params) {
												// If the "params" property is missing, can't fetch the details of the lock
												break;
											} else if (
												// If "params" has an "added" array and a "removed" array, the former should
												// contain "locked" and the latter shouldn't
												(
													params.added && params.removed && (
														!params.added.includes('locked') ||
														params.removed.includes('locked')
													)
												) ||
												// In the case of an old log entry, the numeral keys should have fixed values
												(
													params['0'] && params['0'] !== 'locked' ||
													params['1'] && params['1'] !== '(none)'
												)
											) {
												continue;
											}
											if (user) {
												titleVars[0] = user;
											}
											if (timestamp) {
												titleVars[1] = timestamp;
											}
											if (typeof comment === 'string') {
												titleVars[2] = comment || '""';
											}
											break;
										}
									}
									const tooltip = mw.format(this.getMessage('title-locked'), ...titleVars);
									MarkBLocked.addClass(userLinks, user, 'mbl-globally-locked', tooltip);
								}
							}
						}
					});
				});
			}
			if (this.options.g_rangeblocks && (remainingIps = filterSet(ips, (ip) => !g_markedUsers.has(ip))).size) {
				remainingIps.forEach((ip) => {
					batchArray.push({
						username: ip,
						params: {
							list: 'globalblocks',
							bgip: ip,
							bgprop: 'target|by|expiry|reason'
						},
						callback: (res) => {
							const resGblk = res && res.query && res.query.globalblocks || [];
							const resObj = resGblk.reduce(/** @param {ApiResponseQueryListGlobalblocks?} acc */ (acc, obj, i) => {
								if (i === 0) {
									acc = obj;
								} else {
									let m;
									const lastRange = acc && (m = acc.target.match(/\/(\d+)$/)) ? parseInt(m[1]) : 128;
									const thisRange = (m = obj.target.match(/\/(\d+)$/)) !== null ? parseInt(m[1]) : 128;
									if (thisRange > lastRange) {
										acc = obj;
									}
								}
								return acc;
							}, null);
							if (resObj) {
								const { target, by, expiry, reason } = resObj;
								let clss;
								const range = (target.match(/\/(\d+)$/) || ['', '??'])[1];
								// $1: Domain, $2: CIDR range, $3: Expiry, $4: Blocking admin, $5: Reason
								const titleVars = [this.getMessage('title-domain-global'), range, '', by, reason];
								if (/^in/.test(expiry)) {
									clss = 'mbl-globally-blocked-indef';
									titleVars[2] = this.getMessage('title-expiry-indefinite');
								} else {
									clss = 'mbl-globally-blocked-temp';
									titleVars[2] = this.getMessage('title-expiry-temporary').replace('$1', expiry);
								}
								const tooltip = mw.format(this.getMessage('title-rangeblocked'), ...titleVars);
								MarkBLocked.addClass(userLinks, ip, clss, tooltip);
							}
						}
					});
				});
			}

			if (batchArray.length) {
				return this.batchRequest(batchArray);
			}

		});

	}

	/**
	 * @typedef {Map<string, HTMLAnchorElement[]>} UserLinks
	 * @typedef {{ userLinks: UserLinks; users: Set<string>; ips: Set<string>; }} LinkObject
	 */
	/**
	 * Collects user links to mark up.
	 *
	 * @param {JQuery<HTMLElement>} $content
	 * @param {boolean} isRCW
	 * @returns {LinkObject}
	 * @private
	 * @requires mediawiki.util
	 */
	collectLinks($content, isRCW) {

		// Get all anchors in the content
		let $anchors = $content.find('a');
		const $pNamespaces = $('#p-associated-pages, #p-namespaces, .skin-monobook #ca-nstab-user, .skin-monobook #ca-talk');
		if ($pNamespaces.length && !$content.find($pNamespaces).length && [2, 3].includes(mw.config.get('wgNamespaceNumber'))) {
			$anchors = $anchors.add($pNamespaces.find('a'));
		}
		const $contribsTools = $('.mw-special-Contributions, .mw-special-DeletedContributions').find('#mw-content-subtitle');
		if ($contribsTools.length && !$content.find($contribsTools).length) {
			$anchors = $anchors.add($contribsTools.find('a'));
		}

		// Find user links
		/** @type {LinkObject} */
		const ret = {
			userLinks: new Map(),
			users: new Set(),
			ips: new Set()
		};
		const prIgnore = /(^|\s)(twg?-rollback-\S+|autocomment|cd-commentLink-\S+)($|\s)/;

		$anchors.each((_, a) => {

			// Ignore some anchors
			const href = a.href;
			const pr = a.parentElement;
			if (
				!href ||
				(a.getAttribute('href') || '')[0] === '#' ||
				a.role === 'button' ||
				// Skip processed links unless on RCW
				// On RCW, such links need to be re-processed for them to be marked up properly
				(!isRCW && a.classList.contains('mbl-userlink')) ||
				a.classList.contains('ext-discussiontools-init-timestamplink') ||
				(pr && prIgnore.test(pr.className)) ||
				(mw.util.getParamValue('action', href) && !mw.util.getParamValue('redlink', href)) ||
				mw.util.getParamValue('diff', href) ||
				mw.util.getParamValue('oldid', href)
			) {
				return;
			}

			// Get the associated pagetitle
			let /** @type {RegExpExecArray?} */ m,
				/** @type {string} */ pagetitle;
			if ((m = this.regex.article.exec(href))) {
				pagetitle = m[1];
			} else if ((m = this.regex.script.exec(href))) {
				pagetitle = m[1];
			} else {
				return;
			}
			pagetitle = decodeURIComponent(pagetitle).replace(/ /g, '_');

			// Extract a username from the pagetitle
			let tar, username;
			if (this.regex.special.test(pagetitle) && (tar = mw.util.getParamValue('target', href))) {
				// If the parsing title is one for a special page, check whether there's a valid &target= query parameter.
				// This parameter's value is prioritized than the subpage name, if any, hence "Special:CA/Foo?target=Bar"
				// shows CentralAuth for User:Bar, not User:Foo.
				username = tar;
			} else if ((m = this.regex.user.exec(pagetitle))) {
				// If the condition above isn't met, just parse out a username from the pagetitle
				username = m[1];
			} else {
				return;
			}
			username = username.replace(/_/g, ' ').replace(/@global$/, '').trim();
			let /** @type {"users" | "ips"} */ key;
			if (mw.util.isIPAddress(username, true)) {
				username = mw.util.sanitizeIP(username) || username; // The right operand is never reached
				key = 'ips';
			} else if (/[/@#<>[\]|{}:]|^(\d{1,3}\.){3}\d{1,3}$/.test(username)) {
				// Ensure the username doesn't contain characters that can't be used for usernames (do this here or block status query might fail)
				console.log('MarkBLocked: Unprocessable username: ' + username);
				return;
			} else {
				if (!/^[\u10A0-\u10FF]/.test(username)) { // ucFirst, except for Georgean letters
					username = username.charAt(0).toUpperCase() + username.slice(1);
				}
				key = 'users';
			}
			ret[key].add(username);

			a.classList.add('mbl-userlink');
			if (!ret.userLinks.has(username)) {
				ret.userLinks.set(username, []);
			}
			/** @type {HTMLAnchorElement[]} */ (ret.userLinks.get(username)).push(a);
		});

		return ret;
	}

	/**
	 * Marks up registered users and individual IPs that are locally or globally blocked, in bulk.
	 * This method does not handle indirect range blocks.
	 *
	 * @param {"local" | "global"} domain The block domain to query: `"local"` or `"global"`.
	 * @param {UserLinks} userLinks The object containing user link references to be marked.
	 * @param {string[]} usersArr A list of usernames or IPs to process.
	 * @returns {JQueryPromise<Set<string>?>} A promise resolving to the set of usernames/IPs whose links were marked,
	 * or `null` if the operation was aborted.
	 * @private
	 * @requires mediawiki.api
	 */
	bulkMarkup(domain, userLinks, usersArr) {
		if (!usersArr.length) return $.Deferred().resolve([]);
		usersArr = usersArr.slice();

		const /** @type {JQueryPromise<Set<string>?>[]} */ deferreds = [];
		const request = domain === 'local' ? this.bulkMarkupLocal.bind(this): this.bulkMarkupGlobal.bind(this);
		while (usersArr.length) {
			deferreds.push(request(userLinks, usersArr.splice(0, this.apilimit)));
		}

		return $.when(...deferreds).then((...args) => {
			const /** @type {Set<string>} */ ret = new Set();
			for (let i = 0; i < args.length; i++) {
				const marked = args[i];
				if (!marked) return null;
				for (const user of marked) {
					ret.add(user);
				}
			}
			return ret;
		});
	}

	/**
	 * @param {UserLinks} userLinks
	 * @param {string[]} users
	 * @returns {JQueryPromise<Set<string>?>} An array of marked users' names or `null` if aborted
	 * @private
	 */
	bulkMarkupLocal(userLinks, users) {
		return this.readApi.post({ // This MUST be a POST request because the parameters can exceed the word count limit of URI
			list: 'blocks',
			bklimit: 'max',
			bkusers: users.join('|'),
			bkprop: 'user|by|expiry|reason|flags'
		}).then(/** @param {ApiResponse} res */ (res) => {
			const resBlk = res && res.query && res.query.blocks || [];
			const /** @type {Set<string>} */ ret = new Set();
			for (const { user, by, expiry, reason, partial } of resBlk) {
				let clss;
				// $1: Domain, $2: Expiry, $3: Blocking admin, $4: Reason
				const titleVars = [this.getMessage('title-domain-local'), '', by, reason];
				if (/^in/.test(expiry)) {
					clss = partial ? 'mbl-blocked-partial' : 'mbl-blocked-indef';
					titleVars[1] = this.getMessage('title-expiry-indefinite');
				} else {
					clss = partial ? 'mbl-blocked-partial' : 'mbl-blocked-temp';
					titleVars[1] = this.getMessage('title-expiry-temporary').replace('$1', expiry);
				}
				const tooltip = mw.format(this.getMessage('title-blocked'), ...titleVars);
				const markedUser = MarkBLocked.addClass(userLinks, user, clss, tooltip);
				if (markedUser) {
					ret.add(markedUser);
				}
			}
			return ret;
		}).catch(/** @param {object} err */ (_, err) => {
			if (err.exception === 'abort') {
				return null;
			} else {
				console.error(err);
				return new Set();
			}
		});
	}

	/**
	 * @param {UserLinks} userLinks
	 * @param {string[]} users
	 * @returns {JQueryPromise<Set<string>?>} An array of marked users' names or `null` if aborted
	 * @private
	 */
	bulkMarkupGlobal(userLinks, users) {
		return this.readApi.post({
			list: 'globalblocks',
			bgtargets: users.join('|'),
			bgprop: 'target|by|expiry|reason'
		}).then(/** @param {ApiResponse} res */ (res) => {
			const resGblk = res && res.query && res.query.globalblocks || [];
			const /** @type {Set<string>} */ ret = new Set();
			for (const { target, by, expiry, reason } of resGblk) {
				let clss;
				// $1: Domain, $2: Expiry, $3: Blocking admin, $4: Reason
				const titleVars = [this.getMessage('title-domain-global'), '', by, reason];
				if (/^in/.test(expiry)) {
					clss = 'mbl-globally-blocked-indef';
					titleVars[1] = this.getMessage('title-expiry-indefinite');
				} else {
					clss = 'mbl-globally-blocked-temp';
					titleVars[1] = this.getMessage('title-expiry-temporary').replace('$1', expiry);
				}
				const tooltip = mw.format(this.getMessage('title-blocked'), ...titleVars);
				const markedUser = MarkBLocked.addClass(userLinks, target, clss, tooltip);
				if (markedUser) {
					ret.add(markedUser);
				}
			}
			return ret;
		}).catch(/** @param {object} err */ (_, err) => {
			if (err.exception === 'abort') {
				return null;
			} else {
				console.error(err);
				return new Set();
			}
		});
	}

	/**
	 * Adds a class to all anchors associated with the given username.
	 *
	 * @param {UserLinks} userLinks
	 * @param {string} userName
	 * @param {string} className
	 * @param {string} tooltip
	 * @returns {string?} The username if any link is marked up, or else `null`.
	 * @private
	 */
	static addClass(userLinks, userName, className, tooltip) {
		const links = userLinks.get(userName); // Get all links related to the user
		if (links) {
			tooltip = this.truncateWikilinks(tooltip).trim().replace(/\n/g, ' ');
			for (let i = 0; i < links.length; i++) {
				links[i].classList.add(className);
				this.addTooltip(links[i], tooltip);
			}
			return userName;
		} else {
			console.error('MarkBLocked: There\'s no link for User:' + userName);
			return null;
		}
	}

	/**
	 * Truncates [[wikilink]] markups in a string by extracting their display texts.
	 *
	 * @param {string} str
	 * @returns {string}
	 * @private
	 */
	static truncateWikilinks(str) {
		const regex = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;
		let ret = str;
		let m;
		while ((m = regex.exec(str))) {
			ret = ret.replace(m[0], m[2] || m[1]);
		}
		return ret;
	}

	/**
	 * Adds a tooltip to a user link.
	 *
	 * @param {HTMLAnchorElement} anchor
	 * @param {string} text
	 * @private
	 */
	static addTooltip(anchor, text) {
		if (typeof anchor.dataset.mblTooltip === 'string') {
			anchor.dataset.mblTooltip += '\n' + text;
		} else {
			$(anchor)
				.attr('data-mbl-tooltip', text)
				.tooltip({
					tooltipClass: 'mbl-tooltip',
					items: '[data-mbl-tooltip]',
					content: /** @this {HTMLAnchorElement} */ function() {
						const tt = this.dataset.mblTooltip;
						if (tt) {
							return $('<ul>').append(
								tt.split('\n').map((line) => $('<li>').text(line))
							);
						}
					},
					position: {
						my: 'left bottom',
						at: 'left top'
					}
				});
		}
	}

	/**
	 * @typedef {object} BatchObject
	 * @property {string} username
	 * @property {mw.Api} [api]
	 * @property {Record<string, any>} params
	 * @property {(res?: ApiResponse) => void} callback
	 */
	/**
	 * Sends batched API requests.
	 *
	 * When additional markup functionalities are enabled, MarkBLocked may need to send a large number
	 * of API requests. Sending too many at once can trigger a `net::ERR_INSUFFICIENT_RESOURCES` error.
	 * This private method mitigates that by dividing requests into batches of 1000, processing each
	 * batch sequentially after the previous one has resolved.
	 *
	 * @param {BatchObject[]} batchArray An array of request batches to be processed.
	 * @returns {JQueryPromise<void>} A promise that resolves when all batches have been processed.
	 * @private
	 * @requires mediawiki.api
	 */
	batchRequest(batchArray) {
		// Unflatten the array of objects to an array of arrays of objects
		const unflattened = batchArray.reduce(/** @param {BatchObject[][]} acc */ (acc, obj) => {
			const len = acc.length - 1;
			if (Array.isArray(acc[len]) && acc[len].length < 1000) {
				acc[len].push(obj);
			} else {
				acc[len + 1] = [obj];
			}
			return acc;
		}, [[]]);

		let aborted = false;
		/**
		 * Send an API request.
		 * @param {BatchObject} batchObj
		 * @returns {JQueryPromise<void>}
		 */
		const req = (batchObj) => {
			return (batchObj.api || this.api).get(batchObj.params)
				.then(batchObj.callback)
				.catch(/** @param {object} err */ (_, err) => {
					if (err.exception === 'abort') {
						aborted = true;
					} else {
						console.error(batchObj.username, err);
					}
				});
		};

		/**
		 * Send batched API requests.
		 * @param {number} index
		 * @returns {JQueryPromise<void>}
		 */
		return (function batch(index) {
			return $.when(...unflattened[index].map(req)).then((...args) => {
				console.log('MarkBLocked batch count: ' + args.length);
				if (!aborted && unflattened[++index]) {
					return batch(index);
				}
			});
		})(0);
	}

}

/**
 * @type {Record<string, Lang>}
 */
MarkBLocked.i18n = {
	en: {
		'config-label-heading': 'MarkBLocked configurations',
		'config-label-fsgeneral': 'General settings',
		'config-label-genportlet': 'Generate a portlet link to the config page',
		'config-label-fsmarkup': 'Markup settings',
		'config-help-resources': 'Features with an exclamation mark may consume server resources.',
		'config-label-rangeblocks': 'Mark up IPs in locally blocked IP ranges',
		'config-label-g_locks': 'Mark up globally locked users',
		'config-label-g_blocks': 'Mark up globally blocked users and IPs',
		'config-label-g_rangeblocks': 'Mark up IPs in globally blocked IP ranges',
		'config-help-g_rangeblocks': 'This option can be configured only when markup for global blocks is enabled.',
		'config-label-save': 'Save settings',
		'config-label-saving': 'Saving settings...',
		'config-notify-notloaded': 'Failed to load the interface.',
		'config-notify-savedone': 'Settings have been saved successfully.',
		'config-notify-savefailed': 'Failed to save the settings. ',
		'portlet-text': 'MBL config',
		'portlet-title': 'Open [[Special:MarkBLockedConfig]]',
		'toggle-title-enabled': 'MarkBLocked is enabled. Click to disable it temporarily.',
		'toggle-title-disabled': 'MarkBLocked is temporarily disabled. Click to enable it again.',
		'toggle-notify-enabled': 'Enabled MarkBLocked.',
		'toggle-notify-disabled': 'Temporarily disabled MarkBLocked.',
		'title-domain-local': 'Locally',
		'title-domain-global': 'Globally',
		'title-expiry-indefinite': 'indefinitely',
		'title-expiry-temporary': 'until $1',
		'title-blocked': '$1 blocked $2 by $3: $4',
		'title-rangeblocked': '$1 range-blocked in /$2 $3 by $4: $5',
		'title-locked': 'Globally locked by $1 since $2: $3'
	},
	ja: {
		'config-label-heading': 'MarkBLockedの設定',
		'config-label-fsgeneral': '一般設定',
		'config-label-genportlet': '設定ページへのポートレットリンクを生成',
		'config-label-fsmarkup': 'マークアップ設定',
		'config-help-resources': '感嘆符の付いた機能はサーバーリソースを消費します。',
		'config-label-rangeblocks': 'ブロックされたIPレンジに含まれるIPをマークアップ',
		'config-label-g_locks': 'グローバルロックされた利用者をマークアップ',
		'config-label-g_blocks': 'グローバルブロックされた利用者およびIPをマークアップ',
		'config-label-g_rangeblocks': 'グローバルブロックされたIPレンジに含まれるIPをマークアップ',
		'config-help-g_rangeblocks': 'この設定はグローバルブロックのマークアップが有効化されている場合のみ変更可能です。',
		'config-label-save': '設定を保存',
		'config-label-saving': '設定を保存中...',
		'config-notify-notloaded': 'インターフェースの読み込みに失敗しました。',
		'config-notify-savedone': '設定の保存に成功しました。',
		'config-notify-savefailed': '設定の保存に失敗しました。',
		'portlet-text': 'MarkBLockedの設定',
		'portlet-title': '[[特別:MarkBLockedConfig]]を開く',
		'toggle-title-enabled': 'MarkBLockedが有効化されています。クリックすると一時的に無効化します。',
		'toggle-title-disabled': 'MarkBLockedが一時的に無効化されています。クリックすると再有効化します。',
		'toggle-notify-enabled': 'MarkBLockedを有効化しました。',
		'toggle-notify-disabled': 'MarkBLockedを一時的に無効化しました。',
		'title-domain-local': 'ローカル',
		'title-domain-global': 'グローバル',
		'title-expiry-indefinite': '無期限',
		'title-expiry-temporary': '$1まで',
		'title-blocked': '$3により$2$1ブロック中: $4',
		'title-rangeblocked': '$4により/$2で$3$1レンジブロック中: $5',
		'title-locked': '$1により$2からグローバルロック中: $3'
	}
};

MarkBLocked.defaultOptionKey = 'userjs-markblocked-config';

/**
 * Creates a new Set containing only the elements that satisfy the provided predicate.
 *
 * This function behaves similarly to `Array.prototype.filter`, but for `Set` instances.
 *
 * @template T The type of elements in the input set.
 * @param {Set<T>} set The input `Set` to filter.
 * @param {(value: T) => boolean} predicate A function that is called for each element in the set.
 * If it returns `true`, the element is included in the result.
 * @returns {Set<T>} A new `Set` containing only the elements for which the predicate returned `true`.
 */
function filterSet(set, predicate) {
	const /** @type {Set<T>} */ result = new Set();
	for (const item of set) {
		if (predicate(item)) {
			result.add(item);
		}
	}
	return result;
}

return MarkBLocked;
})();
//</nowiki>