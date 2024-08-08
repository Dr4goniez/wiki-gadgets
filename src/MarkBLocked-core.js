// @ts-check
/// <reference path="./window/MarkBLocked.d.ts" />
/* global mw, OO */
//<nowiki>
module.exports = class MarkBLocked {

	/**
	 * @type {Record<string, Lang>}
	 */
	static i18n = {
		en: {
			'config-label-heading': 'Configure MarkBLocked',
			'config-label-fieldset': 'Markup settings',
			'config-label-localips': 'Mark up IPs in locally blocked IP ranges',
			'config-label-globalusers': 'Mark up globally locked users',
			'config-label-globalips': 'Mark up globally blocked IPs',
			'config-label-save': 'Save settings',
			'config-label-saving': 'Saving settings...',
			'config-notify-notloaded': 'Failed to load the interface.',
			'config-notify-savedone': 'Sucessfully saved the settings.',
			'config-notify-savefailed': 'Failed to save the settings. ',
			'portlet-text': 'Configure MarkBLocked',
			'toggle-title-enabled': 'MarkBLocked is enabled. Click to disable it temporarily.',
			'toggle-title-disabled': 'MarkBLocked is temporarily disabled. Click to enable it again.',
			'toggle-notify-enabled': 'Enabled MarkBLocked.',
			'toggle-notify-disabled': 'Temporarily disabled MarkBLocked.'
		},
		ja: {
			'config-label-heading': 'MarkBLockedの設定',
			'config-label-fieldset': 'マークアップ設定',
			'config-label-localips': 'ブロックされたIPレンジに含まれるIPをマークアップ',
			'config-label-globalusers': 'グローバルロックされた利用者をマークアップ',
			'config-label-globalips': 'グローバルブロックされたIPをマークアップ',
			'config-label-save': '設定を保存',
			'config-label-saving': '設定を保存中...',
			'config-notify-notloaded': 'インターフェースの読み込みに失敗しました。',
			'config-notify-savedone': '設定の保存に成功しました。',
			'config-notify-savefailed': '設定の保存に失敗しました。',
			'portlet-text': 'MarkBLockedの設定',
			'toggle-title-enabled': 'MarkBLockedが有効化されています。クリックすると一時的に無効化します。',
			'toggle-title-disabled': 'MarkBLockedが一時的に無効化されています。クリックすると再有効化します。',
			'toggle-notify-enabled': 'MarkBLockedを有効化しました。',
			'toggle-notify-disabled': 'MarkBLockedを一時的に無効化しました。'
		}
	};

	/**
	 * @typedef {object} UserOptions
	 * @property {boolean} localips
	 * @property {boolean} globalusers
	 * @property {boolean} globalips
	 */
	/**
	 * @typedef {object} ConstructorConfig
	 * @property {UserOptions} [defaultOptions] Configured default option values. (Default: all `false`).
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
			'mediawiki.util',
			'oojs-ui',
			'oojs-ui.styles.icons-moderation',
		];
		const onConfig = mw.config.get('wgNamespaceNumber') === -1 && /^(markblockedconfig|mblc)$/i.test(mw.config.get('wgTitle'));
		const isRCW = ['Recentchanges', 'Watchlist'].indexOf(mw.config.get('wgCanonicalSpecialPageName') || '') !== -1;
		if (!onConfig && !isRCW) {
			modules.splice(3);
		}
		return mw.loader.using(modules).then(() => { // When ready

			// For backwards compatibility, clear old config if any
			/** @type {JQueryPromise<void>} */
			const backwards = (() => {
				const oldOptionKey = 'userjs-gmbl-preferences';
				/** @type {string?} */
				const oldCfgStr = mw.user.options.get(oldOptionKey);
				if (oldCfgStr && (cfg.optionKey === void 0 || cfg.optionKey === this.defaultOptionKey) && !mw.user.options.get(this.defaultOptionKey)) {
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

	/** @readonly */
	static defaultOptionKey = 'userjs-markblocked-config';

	/**
	 * @typedef {object} ApiOptions
	 * @property {number} [timeout]
	 * @property {boolean} [nonwritepost] Whether the instance is used only to read data though it issues POST requests
	 */
	/**
	 * @param {ApiOptions} [options]
	 */
	static getApiOptions(options = {}) {
		const ret = {
			ajax: {
				headers: {
					'Api-User-Agent': 'MarkBLocked-core (https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MarkBLocked-core.js)'
				}
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
	 */
	static getContribsCA() {
		return new mw.Api(this.getApiOptions()).get({
			action: 'query',
			meta: 'siteinfo',
			siprop: 'specialpagealiases',
			formatversion: '2'
		}).then((res) => {
			/** @type {{realname: string; aliases: string[];}[]=} */
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
			const defaultOptions = cfg.defaultOptions || {
				localips: false,
				globalusers: false,
				globalips: false
			};
			/** @type {string} */
			const optionsStr = mw.user.options.get(this.optionKey) || '{}';
			let /** @type {UserOptions} */ options;
			try {
				options = JSON.parse(optionsStr);
			}
			catch(err) {
				console.error(err);
				options = defaultOptions;
			}
			return Object.assign(defaultOptions, options);
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
				if (Object.keys(MarkBLocked.i18n).indexOf(cfg.lang) !== -1) {
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

		// Options
		const localIps = new OO.ui.CheckboxInputWidget({
			selected: this.options.localips
		});
		const globalUsers = new OO.ui.CheckboxInputWidget({
			selected: this.options.globalusers
		});
		const globalIps = new OO.ui.CheckboxInputWidget({
			selected: this.options.globalips
		});

		// Option container fieldset
		const fieldset = new OO.ui.FieldsetLayout({
			id: 'mblc-optionfield',
			label: this.getMessage('config-label-fieldset'),
			items: [
				new OO.ui.FieldLayout(localIps, {
					label: this.getMessage('config-label-localips'),
					align: 'inline'
				}),
				new OO.ui.FieldLayout(globalUsers, {
					label: this.getMessage('config-label-globalusers'),
					align: 'inline'
				}),
				new OO.ui.FieldLayout(globalIps, {
					label: this.getMessage('config-label-globalips'),
					align: 'inline'
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
				localips: localIps.isSelected(),
				globalusers: globalUsers.isSelected(),
				globalips: globalIps.isSelected()
			};
			const cfgStr = JSON.stringify(cfg);

			// Save config
			this.api.postWithToken('csrf', {
				action: this.globalize ? 'globalpreferences' : 'options',
				optionname: this.optionKey,
				optionvalue: cfgStr,
				formatversion:'2'
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
					fieldset.$element,
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
		const portlet = mw.util.addPortletLink(
			document.getElementById('p-tb') ? 'p-tb' : 'p-personal', // p-tb doesn't exist on minerva
			mw.util.getUrl('Special:MarkBLockedConfig'),
			this.getMessage('portlet-text'),
			'ca-mblc'
		);
		if (!portlet) {
			console.error('Failed to create a portlet link for MarkBLocked.');
		}
	}

	/**
	 * Abort all unfinished requests issued by the MarkBLocked class instance.
	 * @returns {MarkBLocked}
	 */
	abort() {
		this.api.abort();
		this.readApi.abort();
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
	 */
	markup($content) {

		const {userLinks, users, ips} = this.collectLinks($content);
		if ($.isEmptyObject(userLinks)) {
			console.log('MarkBLocked', {
				$content: $content,
				links: 0
			});
			return;
		}
		const allUsers = users.concat(ips);

		this.markBlockedUsers(userLinks, allUsers).then((markedUsers) => {

			if (markedUsers === null) { // Aborted
				return;
			} else {
				console.log('MarkBLocked', {
					$content: $content,
					links: $('.mbl-userlink').length,
					user_registered: users.length,
					user_anonymous: ips.length
				});
			}

			// Create a batch array for additional markups
			const ipsThatMightBeBlocked = ips.filter((ip) => markedUsers.indexOf(ip) === -1);
			const /** @type {BatchObject[]} */ batchArray = [];
			if (this.options.localips && ipsThatMightBeBlocked.length) {
				ipsThatMightBeBlocked.forEach((ip) => {
					batchArray.push({
						params: {
							action: 'query',
							list: 'blocks',
							bkip: ip,
							bkprop: 'user|expiry|restrictions',
							formatversion: '2'
						},
						callback: (res) => {
							// An IP may have multiple blocks
							/** @type {ApiResponseQueryListBlocks[]} */
							const resBlk = res && res.query && res.query.blocks || [];
							const resObj = resBlk.reduce(/** @param {ApiResponseQueryListBlocks?} acc */ (acc, obj, i) => {
								if (i === 0) {
									acc = obj; // Just save the object in the first loop
								} else {
									// If the IP has multiple blocks, filter out the narrowest one CIDR-wise
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
								const partialBlk = resObj.restrictions && !Array.isArray(resObj.restrictions);
								let clss;
								if (/^in/.test(resObj.expiry)) {
									clss = partialBlk ? 'mbl-blocked-partial' : 'mbl-blocked-indef';
								} else {
									clss = partialBlk ? 'mbl-blocked-partial' : 'mbl-blocked-temp';
								}
								MarkBLocked.addClass(userLinks, ip, clss);
							}
						}
					});
				});
			}
			if (this.options.globalusers && users.length) {
				users.forEach((user) => {
					batchArray.push({
						params: {
							action: 'query',
							list: 'globalallusers',
							agulimit: 1,
							agufrom: user,
							aguto: user,
							aguprop: 'lockinfo',
							formatversion: '2'
						},
						callback: (res) => {
							/** @typedef {{locked?: string;}} ApiResponseQueryListGlobalallusers */
							const /** @type {ApiResponseQueryListGlobalallusers[]=} */ resLck = res && res.query && res.query.globalallusers;
							let /** @type {ApiResponseQueryListGlobalallusers=} */ resObj;
							if (resLck && (resObj = resLck[0]) && resObj.locked === '') {
								MarkBLocked.addClass(userLinks, user, 'mbl-globally-locked');
							}
						}
					});
				});
			}
			if (this.options.globalips && ips.length) {
				ips.forEach((ip) => {
					batchArray.push({
						params: {
							action: 'query',
							list: 'globalblocks',
							bgip: ip,
							bgprop: 'target|expiry',
							formatversion: '2'
						},
						callback: (res) => {
							/** @typedef {{target: string; expiry: string;}} ApiResponseQueryListGlobalblocks */
							/** @type {ApiResponseQueryListGlobalblocks[]} */
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
								const clss = /^in/.test(resObj.expiry) ? 'mbl-globally-blocked-indef' : 'mbl-globally-blocked-temp';
								MarkBLocked.addClass(userLinks, ip, clss);
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

		// Filter out user links
		/** @type {LinkObject} */
		const ret = {
			userLinks: Object.create(null),
			users: [],
			ips: []
		};
		return Array.from($anchors).reduce((acc, a) => {

			// Ignore some anchors
			const href = a.href;
			const pr = a.parentElement;
			if (
				!href ||
				href[0] === '#' ||
				a.role === 'button' ||
				$(a).is('.mbl-userlink, .ext-discussiontools-init-timestamplink') ||
				pr && /\b((mw|twg?)-rollback-|autocomment)/.test(pr.className) ||
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
	 * @typedef {object} ApiResponseQueryListBlocks
	 * @property {[]|{}} [restrictions]
	 * @property {string} expiry
	 * @property {string} user
	 */
	/**
	 * Mark up locally blocked registered users and single IPs (this can't detect single IPs included in blocked IP ranges)
	 * @param {UserLinks} userLinks
	 * @param {string[]} usersArr
	 * @returns {JQueryPromise<string[]?>} Usernames whose links are marked up (`null` if aborted).
	 * @requires mediawiki.api
	 */
	markBlockedUsers(userLinks, usersArr) {

		if (!usersArr.length) {
			return $.Deferred().resolve([]);
		}

		const /** @type {string[]} */ marked = [];
		let aborted = false;
		/**
		 * @param {string[]} users
		 * @returns {JQueryPromise<void>}
		 */
		const req = (users) => {
			return this.readApi.post({ // This MUST be a POST request because the parameters can exceed the word count limit of URI
				action: 'query',
				list: 'blocks',
				bklimit: 'max',
				bkusers: users.join('|'),
				bkprop: 'user|expiry|restrictions',
				formatversion: '2'
			}).then((res) =>{
				const /** @type {ApiResponseQueryListBlocks[]=} */ resBlk = res && res.query && res.query.blocks;
				if (resBlk) {
					resBlk.forEach((obj) => {
						const partialBlk = obj.restrictions && !Array.isArray(obj.restrictions); // Boolean: True if partial block
						let clss;
						if (/^in/.test(obj.expiry)) {
							clss = partialBlk ? 'mbl-blocked-partial' : 'mbl-blocked-indef';
						} else {
							clss = partialBlk ? 'mbl-blocked-partial' : 'mbl-blocked-temp';
						}
						const markedUser = MarkBLocked.addClass(userLinks, obj.user, clss);
						if (markedUser) {
							marked.push(markedUser);
						}
					});
				}
			}).catch((_, err) => {
				if (err['exception'] === 'abort') {
					aborted = true;
				} else {
					console.error(err);
				}
			});
		};

		// API calls
		const /** @type {JQueryPromise<void>[]} */ deferreds = [];
		usersArr = usersArr.slice();
		while (usersArr.length) {
			deferreds.push(req(usersArr.splice(0, this.apilimit)));
		}
		return $.when(...deferreds).then(() => aborted ? null : marked);

	}

	/**
	 * Add a class to all anchors associated with a certain username.
	 * @param {UserLinks} userLinks
	 * @param {string} userName
	 * @param {string} className
	 * @returns {string?} The username if any link is marked up, or else `null`.
	 */
	static addClass(userLinks, userName, className) {
		const links = userLinks[userName]; // Get all links related to the user
		if (links) {
			for (let i = 0; i < links.length; i++) {
				links[i].classList.add(className);
			}
			return userName;
		} else {
			console.error('MarkBLocked: There\'s no link for User:' + userName);
			return null;
		}
	}

	/**
	 * @typedef {Record<string, any>} DynamicObject
	 */
	/**
	 * @typedef {object} BatchObject
	 * @property {DynamicObject} params
	 * @property {(res?: DynamicObject) => void} callback
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
			return this.api.get(batchObj.params)
				.then(batchObj.callback)
				.catch((_, err) => {
					if (err['exception'] === 'abort') {
						aborted = true;
					} else {
						console.error(err);
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

};
//</nowiki>