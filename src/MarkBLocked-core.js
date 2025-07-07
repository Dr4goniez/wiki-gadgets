/**
 * MarkBLocked-core
 * @author [[User:Dragoniez]]
 * @version 3.1.5
 *
 * @see https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MarkBLocked-core.css Style sheet
 * @see https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MarkBLocked.js Loader module
 *
 * Information:
 * @see https://ja.wikipedia.org/wiki/Help:MarkBLocked About the jawiki gadget
 *
 * Global user script that uses this module:
 * @see https://meta.wikimedia.org/wiki/User:Dragoniez/MarkBLockedGlobal.js
 * @see https://meta.wikimedia.org/wiki/User:Dragoniez/MarkBLockedGlobal English help page
 * @see https://meta.wikimedia.org/wiki/User:Dragoniez/MarkBLockedGlobal/ja Japanese help page
 *
 * You can import this gadget to your (WMF) wiki by preparing a loader module for it.
 * See the coding of the loader module above and `ConstructorConfig` below.
 *
 * You can also find helper type definitions on:
 * @link https://github.com/Dr4goniez/wiki-gadgets/blob/main/src/window/MarkBLocked.d.ts
 */
// @ts-check
/// <reference path="./window/MarkBLocked.d.ts" />
/* global mw, OO */
//<nowiki>
// const MarkBLocked = (() => {
module.exports = (() => {
class MarkBLocked {

	/**
	 * @typedef {object} UserOptions
	 * @property {boolean} genportlet
	 * @property {boolean} rangeblocks
	 * @property {boolean} g_locks
	 * @property {boolean} g_blocks
	 * @property {boolean} g_rangeblocks
	 */
	/**
	 * @typedef {object} ConstructorConfig
	 * @property {Partial<UserOptions>} [defaultOptions] Configured default option values, which will be merged into the
	 * default config options (i.e. supports partial overrides).
	 * @property {string} [optionKey] The key of `mw.user.options`, defaulted to `userjs-markblocked-config`.
	 * @property {boolean} [globalize] If `true`, save the options into global preferences.
	 * @property {Record<string, Lang>} [i18n] A language object to merge to {@link MarkBLocked.i18n}. Using this config makes
	 * it possible to configure the default interface messages and add a new interface language (for the latter to work, the
	 * {@link ConstructorConfig.lang|lang} config must also be configured.
	 * @property {string} [lang] The code of the language for the interface messages, defaulted to `en`.
	 * @property {string[]} [contribsCA] Special page aliases for Contributions and CentralAuth in the local language (no need
	 * to pass `Contributions`, `Contribs`, `CentralAuth`, `CA`, and `GlobalAccount`). If not provided, aliases are fetched from
	 * the API.
	 * @property {string[]} [groupsAHL] Local user groups with the `apihighlimits` user right, defaulted to `['sysop', 'bot']`.
	 */

	/**
	 * Initialize `MarkBLocked`.
	 * @param {ConstructorConfig} [config]
	 * @returns {JQueryPromise<MarkBLocked>}
	 */
	static init(config) {

		// Disallow a second run
		if (window.MarkBLockedLoaded) {
			const err = 'Looks like MarkBLocked is loaded from multiple sources.';
			mw.notify(err, {type: 'error', autoHideSeconds: 'long'});
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
			'jquery.ui',
			'oojs-ui',
			'oojs-ui.styles.icons-moderation',
		];
		const onConfig = mw.config.get('wgNamespaceNumber') === -1 && /^(markblockedconfig|mblc)$/i.test(mw.config.get('wgTitle'));
		const isRCW = ['Recentchanges', 'Watchlist'].indexOf(mw.config.get('wgCanonicalSpecialPageName') || '') !== -1;
		if (!onConfig && !isRCW) {
			modules.splice(5);
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
					(cfg.optionKey === void 0 || cfg.optionKey === MarkBLocked.defaultOptionKey) &&
					!mw.user.options.get(MarkBLocked.defaultOptionKey)
				) {
					const options = {
						[oldOptionKey]: null,
						[MarkBLocked.defaultOptionKey]: oldCfgStr
					};
					return new mw.Api(this.getApiOptions()).saveOptions(options).then(() => {
						mw.user.options.set(options);
					});
				} else {
					return $.Deferred().resolve();
				}
			})();

			// Entry point
			const /** @type {JQueryPromise<string[]?>} */ ccaDeferred =
				onConfig ?
				$.Deferred().resolve([]) :
				cfg.contribsCA ?
				$.Deferred().resolve(cfg.contribsCA) :
				this.getContribsCA();
			return $.when(ccaDeferred, backwards, $.ready).then((contribsCA) => { // contribsCA and backwards are resolved, and the DOM is ready

				if (contribsCA) {
					cfg.contribsCA = contribsCA;
				} else {
					console.warn('MarkBLocked: Failed to get special page aliases.');
					cfg.contribsCA = [];
				}

				const mbl = new MarkBLocked(cfg);
				if (onConfig) {
					mbl.createConfigInterface();
				} else {

					mbl.createPortletLink();

					// wikipage.content hook handler
					/**
					 * @type {NodeJS.Timeout=}
					 */
					let hookTimeout;
					/**
					 * @param {JQuery<HTMLElement>} [$content] Fall back to `.mw-body-content`
					 */
					const markup = ($content) => {
						hookTimeout = void 0; // Reset the value of `hookTimeout`
						mbl.abort().markup($content || $('.mw-body-content'));
					};
					/**
					 * A callback to `mw.hook('wikipage.content').add`.
					 * @param {JQuery<HTMLElement>} $content
					 * @see https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.hook-event-wikipage_content
					 */
					const hookHandler = ($content) => {
						const isConnected = !!$(document).find($content).length;
						if (isConnected) {
							// Ensure that $content is attached to the DOM. The same hook can be fired multiple times,
							// but in some of them the hook is fired on an element detached (and removed) from the DOM.
							// It's useless to parse links in the element in such cases because the links are inaccessible.
							clearTimeout(hookTimeout); // Clear the reserved `markup` call, if any
							if ($content.find('a').length) {
								markup($content);
							}
						} else if (typeof hookTimeout !== 'number') {
							// When the hook is fired (any number of times), we want to ensure that `markup` is called
							// at least once. Reserve a `markup` call for when the `isConnected` block is never reached
							// in the set of `wikipage.content` events.
							hookTimeout = setTimeout(markup, 100);
						}
					};
					mw.hook('wikipage.content').add(hookHandler);

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
	 * @typedef {object} ApiOptions
	 * @property {number} [timeout]
	 * @property {boolean} [nonwritepost] Whether the instance is used only to read data though it issues POST requests
	 */
	/**
	 * Get API options to initialize a `mw.Api` instance.
	 *
	 * This method adds a User-Agent header and sets the default query parameters of:
	 * ```
	 * {
	 * 	action: 'query',
	 * 	format: 'json',
	 * 	formatversion: '2'
	 * }
	 * ```
	 * @param {ApiOptions} [options]
	 */
	static getApiOptions(options = {}) {
		const ret = {
			ajax: {
				headers: {
					'Api-User-Agent': 'MarkBLocked-core/3.1.5 (https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MarkBLocked-core.js)'
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
			/** @see https://www.mediawiki.org/wiki/API:Etiquette#Other_notes */
			ret.ajax.headers['Promise-Non-Write-API-Action'] = true;
		}
		return ret;
	}

	/**
	 * Get special page aliases for `Contributions` and `CentralAuth`.
	 * @returns {JQueryPromise<string[]?>}
	 * @requires mediawiki.api
	 * @requires mediawiki.ForeignApi
	 */
	static getContribsCA() {
		return new mw.Api(this.getApiOptions()).get({
			meta: 'siteinfo',
			siprop: 'specialpagealiases'
		}).then(/** @param {ApiResponse} res */ (res) => {
			const resSpa = res && res.query && res.query.specialpagealiases;
			if (Array.isArray(resSpa)) {
				const defaults = ['Contributions', 'Contribs', 'CentralAuth', 'CA', 'GlobalAccount'];
				return resSpa.reduce(/** @param {string[]} acc */ (acc, {realname, aliases}) => {
					if (realname === 'Contributions' || realname === 'CentralAuth') {
						acc = acc.concat(aliases.filter(el => defaults.indexOf(el) === -1));
					}
					return acc;
				}, []);
			} else {
				return null;
			}
		}).catch((_, err) => {
			console.warn(err);
			return null;
		});
	}

	/**
	 * Initialize the properties of the `MarkBLocked` class. This is only to be called by {@link MarkBLocked.init}.
	 * @param {ConstructorConfig} [cfg]
	 * @requires mediawiki.api
	 * @requires mediawiki.ForeignApi
	 * @requires mediawiki.user
	 */
	constructor(cfg = {}) {

		/**
		 * @type {mw.Api}
		 */
		this.api = new mw.Api(MarkBLocked.getApiOptions({timeout: 60*1000}));
		/**
		 * @type {mw.Api}
		 */
		this.readApi = new mw.Api(MarkBLocked.getApiOptions({timeout: 60*1000, nonwritepost: true}));
		/**
		 * @type {mw.Api}
		 */
		this.metaApi = mw.config.get('wgWikiID') === 'metawiki' ?
			this.api :
			new mw.ForeignApi(
				'https://meta.wikimedia.org/w/api.php',
				/**
				 * On mobile devices, cross-origin requests may fail becase of a "badtoken" error related to
				 * `centralauthtoken`. This never happened with the `{anonymous: true}` option for `mw.ForeignApi`,
				 * hence included.
				 * @see https://doc.wikimedia.org/mediawiki-core/1.32.0/js/#!/api/mw.ForeignApi-method-constructor
				 * We will only need to send GET requests to fetch data, so this shouldn't be problematic.
				 */
				Object.assign(MarkBLocked.getApiOptions({timeout: 60*1000}), {anonymous: true})
			);

		// Show Warning if the config has any invalid property
		const validKeys = ['defaultOptions', 'optionKey', 'globalize', 'i18n', 'lang', 'contribsCA', 'groupsAHL'];
		const invalidKeys = Object.keys(cfg).reduce(/** @param {string[]} acc */ (acc, key) => {
			if (validKeys.indexOf(key) === -1) {
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
		 * Regular expressions to collect user links.
		 * @typedef {object} LinkRegex
		 * @property {RegExp} article `/wiki/PAGENAME`: $1: PAGENAME
		 * @property {RegExp} script `/w/index.php?title=PAGENAME`: $1: PAGENAME
		 * @property {RegExp} contribsCA `^Special:(?:Contribs|CA)($|/)`
		 * @property {RegExp} user `^(?:Special:.../|User:)(USERNAME|CIDR)`: $1: USERNAME or CIDR
		 */
		/**
		 * @type {LinkRegex}
		 */
		this.regex = (() => {

			const wgNamespaceIds = mw.config.get('wgNamespaceIds'); // {"special": -1, "user": 2, ...}
			const /** @type {string[]} */ specialAliases = [];
			const /** @type {string[]} */ userAliases = [];
			for (const alias in wgNamespaceIds) {
				const namespaceId = wgNamespaceIds[alias];
				switch(namespaceId) {
					case -1:
						specialAliases.push(alias);
						break;
					case 2:
					case 3:
						userAliases.push(alias);
				}
			}

			let rContribsCA = cfg.contribsCA && cfg.contribsCA.length ? '|' + cfg.contribsCA.join('|') : '';
			rContribsCA = '(?:' + specialAliases.join('|') + '):(?:contrib(?:ution)?s|ca|centralauth|globalaccount' + rContribsCA + ')';
			const rUser = '(?:' + userAliases.join('|') + '):';

			return {
				article: new RegExp(mw.config.get('wgArticlePath').replace('$1', '([^#?]+)')),
				script: new RegExp(mw.config.get('wgScript') + '\\?title=([^#&]+)'),
				contribsCA: new RegExp('^' + rContribsCA + '($|/)', 'i'),
				user: new RegExp('^(?:' + rContribsCA + '/|' + rUser + ')([^/#]+|[a-f\\d:\\.]+/\\d\\d)$', 'i')
			};

		})();

		/**
		 * The maximum number of batch parameter values for the API.
		 * @type {500|50}
		 */
		this.apilimit = (() => {

			const groupsAHLLocal = cfg.groupsAHL || ['sysop', 'bot'];
			const groupsAHLGlobal = [
				'apihighlimits-requestor',
				'founder',
				'global-bot',
				// 'global-sysop',
				'staff',
				'steward',
				'sysadmin',
				'wmf-researcher'
			];
			const groupsAHL = groupsAHLLocal.concat(groupsAHLGlobal);
			// @ts-ignore
			const hasAHL = mw.config.get('wgUserGroups', []).concat(mw.config.get('wgGlobalGroups', [])).some((group) => groupsAHL.indexOf(group) !== -1);

			return hasAHL ? 500 : 50;

		})();

	}

	/**
	 * Replace the page content with the MarkBLocked config interface.
	 * @returns {void}
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
					mw.notify(this.getMessage('config-notify-savefailed') + '(' + err + ')', {type: 'error'});
				} else {
					mw.notify(this.getMessage('config-notify-savedone'), {type: 'success'});
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
	 * Get an interface message of MarkBLocked.
	 * @param {keyof Lang} key
	 * @returns {string}
	 */
	getMessage(key) {
		return this.msg[key];
	}

	/**
	 * Create a portlet link to the config page.
	 * @returns {void}
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
	 * Abort all unfinished requests issued by the MarkBLocked class instance.
	 * @returns {MarkBLocked}
	 */
	abort() {
		this.api.abort();
		this.readApi.abort();
		this.metaApi.abort();
		return this;
	}

	/**
	 * Create a button to enable/disable MarkBLocked (for Special:Recentchanges and Special:Watchlist, on which `markup`
	 * is recursively called when the page content is updated.)
	 * @param {($content: JQuery<HTMLElement>) => void} hookHandler A function to (un)bind to the `wikipage.content` hook.
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
			const disable = toggle.getFlags().indexOf('progressive') !== -1;
			let icon, title, hookToggle, msg;
			if (disable) {
				icon = 'lock';
				title = this.getMessage('toggle-title-disabled');
				hookToggle = mw.hook('wikipage.content').remove;
				msg = this.getMessage('toggle-notify-disabled');
				$('.mbl-userlink').removeClass((_, className) => { // Remove all mbl- classes from user links
					return (className.match(/(^|\s)mbl-\S+/) || []).join(' ');
				});
			} else {
				icon = 'unLock';
				title = this.getMessage('toggle-title-enabled');
				hookToggle = mw.hook('wikipage.content').add;
				msg = this.getMessage('toggle-notify-enabled');
				// Hook.add fires the `wikipage.content` hook, meaning that `markup` is automatically called and classes are reassigned
			}
			toggle
				.setFlags({progressive: !disable, destructive: disable})
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
			$wrapper.css('margin-left', 'auto');
		}

	}

	/**
	 * Mark up user links.
	 * @param {JQuery<HTMLElement>} $content
	 * @returns {void}
	 * @requires mediawiki.util
	 * @requires mediawiki.api
	 * @requires mediawiki.ForeignApi
	 */
	markup($content) {

		if (!this.options.g_blocks && this.options.g_rangeblocks) {
			throw new Error('g_rangeblocks is unexpectedly turned on when g_blocks is turned off.');
		}

		// Collect user links
		const {userLinks, users, ips} = this.collectLinks($content);
		if ($.isEmptyObject(userLinks)) {
			console.log('MarkBLocked', {
				$content,
				links: 0
			});
			return;
		}
		const allUsers = users.concat(ips);

		// Start markup
		$.when(
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
					user_registered: users.length,
					user_anonymous: ips.length
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
			if (this.options.rangeblocks && (remainingIps = ips.filter((ip) => markedUsers.indexOf(ip) === -1)).length) {
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
								const {user, by, expiry, reason, partial} = resObj;
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
			if (this.options.g_locks && users.length) {
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
										for (const {params, user, timestamp, comment} of resLgev) {
											if (!params) {
												// If the "params" property is missing, can't fetch the details of the lock
												break;
											} else if (
												// If "params" has an "added" array and a "removed" array, the former should
												// contain "locked" and the latter shouldn't
												(
													params.added && params.removed && (
														params.added.indexOf('locked') === -1 ||
														params.removed.indexOf('locked') !== -1
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
			if (this.options.g_rangeblocks && (remainingIps = ips.filter((ip) => g_markedUsers.indexOf(ip) === -1)).length) {
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
								const {target, by, expiry, reason} = resObj;
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
				this.batchRequest(batchArray);
			}

		});

	}

	/**
	 * Object that stores collected user links, keyed by usernames and valued by an array of anchors.
	 * @typedef {Record<string, HTMLAnchorElement[]>} UserLinks
	 */
	/**
	 * @typedef {{userLinks: UserLinks; users: string[]; ips: string[];}} LinkObject
	 */
	/**
	 * Collect user links to mark up.
	 * @param {JQuery<HTMLElement>} $content
	 * @returns {LinkObject}
	 * @requires mediawiki.util
	 */
	collectLinks($content) {

		// Get all anchors in the content
		let $anchors = $content.find('a');
		const $pNamespaces = $('#p-associated-pages, #p-namespaces, .skin-monobook #ca-nstab-user, .skin-monobook #ca-talk');
		if ($pNamespaces.length && !$content.find($pNamespaces).length && [2, 3].indexOf(mw.config.get('wgNamespaceNumber')) !== -1) {
			$anchors = $anchors.add($pNamespaces.find('a'));
		}
		const $contribsTools = $('.mw-special-Contributions, .mw-special-DeletedContributions').find('#mw-content-subtitle');
		if ($contribsTools.length && !$content.find($contribsTools).length) {
			$anchors = $anchors.add($contribsTools.find('a'));
		}

		// Find user links
		/** @type {LinkObject} */
		const ret = {
			userLinks: Object.create(null),
			users: [],
			ips: []
		};
		const prIgnore = /(^|\s)(twg?-rollback-\S+|autocomment|cd-commentLink-\S+)($|\s)/;
		return Array.from($anchors).reduce((acc, a) => {

			// Ignore some anchors
			const href = a.href;
			const pr = a.parentElement;
			if (
				!href ||
				(a.getAttribute('href') || '')[0] === '#' ||
				a.role === 'button' ||
				a.classList.contains('ext-discussiontools-init-timestamplink') ||
				pr && prIgnore.test(pr.className) ||
				mw.util.getParamValue('action', href) && !mw.util.getParamValue('redlink', href) ||
				mw.util.getParamValue('diff', href) ||
				mw.util.getParamValue('oldid', href)
			) {
				return acc;
			}

			// Get the associated pagetitle
			let /** @type {RegExpExecArray?} */ m,
				/** @type {string} */ pagetitle;
			if ((m = this.regex.article.exec(href))) {
				pagetitle = m[1];
			} else if ((m = this.regex.script.exec(href))) {
				pagetitle = m[1];
			} else {
				return acc;
			}
			pagetitle = decodeURIComponent(pagetitle).replace(/ /g, '_');

			// Extract a username from the pagetitle
			let tar, username;
			if (this.regex.contribsCA.test(pagetitle) && (tar = mw.util.getParamValue('target', href))) {
				// If the parsing title is one for a special page, check whether there's a valid &target= query parameter.
				// This parameter's value is prioritized than the subpage name, if any, hence "Special:CA/Foo?target=Bar"
				// shows CentralAuth for User:Bar, not User:Foo.
				username = tar;
			} else if ((m = this.regex.user.exec(pagetitle))) {
				// If the condition above isn't met, just parse out a username from the pagetitle
				username = m[1];
			} else {
				return acc;
			}
			username = username.replace(/_/g, ' ').replace(/@global$/, '').trim();
			let /** @type {string[]} */ arr;
			if (mw.util.isIPAddress(username, true)) {
				username = mw.util.sanitizeIP(username) || username; // The right operand is never reached
				arr = acc.ips;
			} else if (/[/@#<>[\]|{}:]|^(\d{1,3}\.){3}\d{1,3}$/.test(username)) {
				// Ensure the username doesn't contain characters that can't be used for usernames (do this here or block status query might fail)
				console.log('MarkBLocked: Unprocessable username: ' + username);
				return acc;
			} else {
				arr = acc.users;
				if (!/^[\u10A0-\u10FF]/.test(username)) { // ucFirst, except for Georgean letters
					username = username.charAt(0).toUpperCase() + username.slice(1);
				}
			}
			if (arr.indexOf(username) === -1) {
				arr.push(username);
			}

			a.classList.add('mbl-userlink');
			if (acc.userLinks[username]) {
				acc.userLinks[username].push(a);
			} else {
				acc.userLinks[username] = [a];
			}

			return acc;
		}, ret);

	}

	/**
	 * Mark up registered users and single IPs locally or globally blocked in bulk. This method does not
	 * deal with indirect range blocks.
	 * @param {"local"|"global"} domain
	 * @param {UserLinks} userLinks
	 * @param {string[]} usersArr
	 * @returns {JQueryPromise<string[]?>} Usernames whose links are marked up, or `null` if aborted
	 * @requires mediawiki.api
	 */
	bulkMarkup(domain, userLinks, usersArr) {

		if (!usersArr.length) {
			return $.Deferred().resolve([]);
		}
		usersArr = usersArr.slice();

		// API calls
		const /** @type {JQueryPromise<string[]?>[]} */ deferreds = [];
		while (usersArr.length) {
			if (domain === 'local') {
				deferreds.push(this.bulkMarkupLocal(userLinks, usersArr.splice(0, this.apilimit)));
			} else {
				deferreds.push(this.bulkMarkupGlobal(userLinks, usersArr.splice(0, this.apilimit)));
			}
		}
		return $.when(...deferreds).then((...args) => {
			const ret = [];
			for (let i = 0; i < args.length; i++) {
				const marked = args[i];
				if (marked !== null) {
					ret.push(...marked);
				} else {
					return null;
				}
			}
			return ret;
		});

	}

	/**
	 * @param {UserLinks} userLinks
	 * @param {string[]} users
	 * @returns {JQueryPromise<string[]?>} An array of marked users' names or `null` if aborted
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
			return resBlk.reduce(/** @param {string[]} acc */ (acc, {user, by, expiry, reason, partial}) => {
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
					acc.push(markedUser);
				}
				return acc;
			}, []);
		}).catch(/** @param {object} err */ (_, err) => {
			if (err.exception === 'abort') {
				return null;
			} else {
				console.error(err);
				return [];
			}
		});
	}

	/**
	 * @param {UserLinks} userLinks
	 * @param {string[]} users
	 * @returns {JQueryPromise<string[]?>} An array of marked users' names or `null` if aborted
	 * @private
	 */
	bulkMarkupGlobal(userLinks, users) {
		return this.readApi.post({
			list: 'globalblocks',
			bgtargets: users.join('|'),
			bgprop: 'target|by|expiry|reason'
		}).then(/** @param {ApiResponse} res */ (res) => {
			const resGblk = res && res.query && res.query.globalblocks || [];
			return resGblk.reduce(/** @param {string[]} acc */ (acc, {target, by, expiry, reason}) => {
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
					acc.push(markedUser);
				}
				return acc;
			}, []);
		}).catch(/** @param {object} err */ (_, err) => {
			if (err.exception === 'abort') {
				return null;
			} else {
				console.error(err);
				return [];
			}
		});
	}

	/**
	 * Add a class to all anchors associated with a certain username.
	 * @param {UserLinks} userLinks
	 * @param {string} userName
	 * @param {string} className
	 * @param {string} tooltip
	 * @returns {string?} The username if any link is marked up, or else `null`.
	 */
	static addClass(userLinks, userName, className, tooltip) {
		const links = userLinks[userName]; // Get all links related to the user
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
	 * Truncate [[wikilink]]s in a string by extracting their display texts.
	 * @param {string} str
	 * @returns {string}
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
	 * Add a tooltip to a user link.
	 * @param {HTMLAnchorElement} anchor
	 * @param {string} text
	 */
	static addTooltip(anchor, text) {
		if (typeof anchor.dataset.mblTooltip === 'string') {
			anchor.dataset.mblTooltip += '\n' + text;
		} else {
			$(anchor)
				.attr('data-mbl-tooltip', text)
				.tooltip({
					tooltipClass: 'mbl-tooltip',
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
	 * Send batched API requests.
	 *
	 * MarkBLocked has to send quite a few API requests when additional markup functionalities are enabled,
	 * and this can lead to an `net::ERR_INSUFFICIENT_RESOURCES` error if too many requests are sent all
	 * at once. This (private) function sends API requests by creating batches of 1000, where each batch is
	 * processed sequentially after the older batch is resolved.
	 * @param {BatchObject[]} batchArray
	 * @returns {JQueryPromise<void>}
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
		const batch = (index) => {
			return $.when(...unflattened[index].map(req)).then((...args) => {
				console.log('MarkBLocked batch count: ' + args.length);
				if (!aborted && unflattened[++index]) {
					return batch(index);
				}
			});
		};

		return batch(0);

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

return MarkBLocked;
})();
//</nowiki>