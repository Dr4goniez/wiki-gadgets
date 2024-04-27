// @ts-check
/* eslint-disable @typescript-eslint/no-this-alias */
/* global mw, OO */
//<nowiki>
module.exports = /** @class */ (function() {
// var MarkBLocked = /** @class */ (function() {

	/** @readonly */
	var defaultOptionKey = 'userjs-markblocked-config';

	/**
	 * @typedef UserOptions
	 * @type {object}
	 * @property {boolean} localips
	 * @property {boolean} globalusers
	 * @property {boolean} globalips
	 */
	/**
	 * @typedef ConstructorConfig
	 * @type {object}
	 * @property {UserOptions} [defaultOptions] Configured default option values. (Default: all `false`).
	 * @property {string} [optionKey] The key of `mw.user.options`, defaulted to `userjs-markblocked-config`.
	 * @property {boolean} [globalize] If `true`, save the options as global preferences.
	 * @property {Object.<string, Lang>} [i18n] A language object to merge to {@link MarkBLocked.i18n}. Using this config makes
	 * it possible to configure the default interface messages and add a new interface language (for the latter, a value needs
	 * to be passed to the {@link lang} parameter.)
	 * @property {string} [lang] The code of the language to use in the interface messages, defaulted to `en`.
	 * @property {string[]} [contribsCA] Special page aliases for Contributions and CentralAuth in the local language (no need
	 * to pass `Contributions`, `Contribs`, `CentralAuth`, `CA`, and  `GlobalAccount`). If not provided, aliases are fetched from
	 * the API.
	 * @property {string[]} [groupsAHL] Local user groups with the `apihighlimits` user right, defaulted to `['sysop', 'bot']`.
	 */
	/**
	 * Initialize the properties of the `MarkBLocked` class. This is only to be called by `MarkBLocked.init`.
	 * @param {ConstructorConfig} [config]
	 * @constructor
	 * @requires mw.user
	 */
	function MarkBLocked(config) {

		var cfg = config || {};

		// Warn if the config has any invalid property
		var validKeys = ['defaultOptions', 'optionKey', 'globalize', 'i18n', 'lang', 'contribsCA', 'groupsAHL'];
		var invalidKeys = Object.keys(cfg).reduce(/** @param {string[]} acc */ function(acc, key) {
			if (validKeys.indexOf(key) === -1 && acc.indexOf(key) === -1) {
				acc.push(key);
			}
			return acc;
		}, []);
		if (invalidKeys.length) {
			console.error('MarkBLocked: Detected invalid constructor options: ' + invalidKeys.join(', '));
		}

		// User options
		var defaultOptions = cfg.defaultOptions || {
			localips: false,
			globalusers: false,
			globalips: false
		};
		/**
		 * The key of `mw.user.options`.
		 * @readonly
		 */
		this.optionKey = cfg.optionKey || defaultOptionKey;
		var /** @type {string} */ optionsStr = mw.user.options.get(this.optionKey) || '{}';
		var /** @type {UserOptions} */ options;
		try {
			options = JSON.parse(optionsStr);
		}
		catch(err) {
			console.error(err);
			options = defaultOptions;
		}
		/** @type {UserOptions} */
		this.options = $.extend(defaultOptions, options);
		/** @type {boolean} */
		this.globalize = !!cfg.globalize;
		console.log('MarkBLocked globalization: ' + this.globalize);

		// Language options
		if (cfg.i18n) {
			$.extend(MarkBLocked.i18n, cfg.i18n);
		}
		var langCode = 'en';
		if (cfg.lang) {
			if (Object.keys(MarkBLocked.i18n).indexOf(cfg.lang) !== -1) {
				langCode = cfg.lang;
			} else {
				console.error('"' + cfg.lang  + '" is not available as the interface language of MarkBLocked.');
			}
		}
		/** @type {Lang} */
		this.msg = MarkBLocked.i18n[langCode];

		// Regex to collect user links
		var wgNamespaceIds = mw.config.get('wgNamespaceIds'); // {"special": -1, "user": 2, ...}
		var /** @type {string[]} */ specialAliases = [];
		var /** @type {string[]} */ userAliases = [];
		for (var alias in wgNamespaceIds) {
			var namespaceId = wgNamespaceIds[alias];
			switch(namespaceId) {
				case -1:
					specialAliases.push(alias);
					break;
				case 2:
				case 3:
					userAliases.push(alias);
					break;
				default:
			}
		}
		var rContribsCA = cfg.contribsCA && cfg.contribsCA.length ? '|' + cfg.contribsCA.join('|') : '';
		rContribsCA = '(?:' + specialAliases.join('|') + '):(?:contrib(?:ution)?s|ca|centralauth|globalaccount' + rContribsCA + ')';
		var rUser = '(?:' + userAliases.join('|') + '):';
		/**
		 * Regular expressions to collect user links.
		 * @typedef LinkRegex
		 * @type {object}
		 * @property {RegExp} article `/wiki/PAGENAME`: $1: PAGENAME
		 * @property {RegExp} script `/w/index.php?title=PAGENAME`: $1: PAGENAME
		 * @property {RegExp} contribsCA `^Special:(?:Contribs|CA)($|/)`
		 * @property {RegExp} user `^(?:Special:.../|User:)(USERNAME|CIDR)`: $1: USERNAME or CIDR
		 */
		/** @type {LinkRegex} */
		this.regex = {
			article: new RegExp(mw.config.get('wgArticlePath').replace('$1', '([^#?]+)')),
			script: new RegExp(mw.config.get('wgScript') + '\\?title=([^#&]+)'),
			contribsCA: new RegExp('^' + rContribsCA + '($|/)', 'i'),
			user: new RegExp('^(?:' + rContribsCA + '/|' + rUser + ')([^/#]+|[a-f\\d:\\.]+/\\d\\d)$', 'i')
		};

		// Validate apihighlimits
		var groupsAHLLocal = cfg.groupsAHL || ['sysop', 'bot'];
		var groupsAHLGlobal = [
			'apihighlimits-requestor',
			'founder',
			'global-bot',
			// 'global-sysop',
			'staff',
			'steward',
			'sysadmin',
			'wmf-researcher'
		];
		var groupsAHL = groupsAHLLocal.concat(groupsAHLGlobal);
		// @ts-ignore
		var hasAHL = mw.config.get('wgUserGroups').concat(mw.config.get('wgGlobalGroups') || []).some(function(group) {
			return groupsAHL.indexOf(group) !== -1;
		});
		/**
		 * The maximum number of batch parameter values for the API.
		 * @type {500|50}
		 */
		this.apilimit = hasAHL ? 500 : 50;

	}

	/**
	 * @typedef Lang
	 * @type {object}
	 * @property {string} config-notify-notloaded A `mw.notify` message to show when failed to load the config interface.
	 * @property {string} config-label-heading The heading text of the config interface.
	 * @property {string} config-label-fieldset The fieldset legend's text of the config interface.
	 * @property {string} config-label-localips Option label to mark up IPs in locally blocked IP ranges.
	 * @property {string} config-label-globalusers Option label to mark up globally locked users.
	 * @property {string} config-label-globalips Option label to mark up globally blocked IPs.
	 * @property {string} config-label-save The text of the save button.
	 * @property {string} config-label-saving The text of the save button when saving options.
	 * @property {string} config-notify-savedone A `mw.notify` message to show when done with saving options.
	 * @property {string} config-notify-savefailed A `mw.notify` message to show when failed to save options.
	 * @property {string} portlet-text The text of the portlet link to the config page.
	 * @property {string} toggle-title-enabled The title attribute of the RCW toggle button when MBL is enabled.
	 * @property {string} toggle-title-disabled The title attribute of the RCW toggle button when MBL is temporarily disabled.
	 * @property {string} toggle-notify-enabled A `mw.notify` message to show when MBL gets enabled on RCW.
	 * @property {string} toggle-notify-disabled A `mw.notify` message to show when MBL gets disabled on RCW.
	 */
	/**
	 * @type {Object.<string, Lang>}
	 * @static
	 */
	MarkBLocked.i18n = {
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
	 * Get an interface message of MarkBLocked.
	 * @param {keyof Lang} key
	 * @returns {string}
	 */
	MarkBLocked.prototype.getMessage = function(key) {
		return this.msg[key];
	};

	/**
	 * @type {mw.Api}
	 * @readonly
	 */
	var api;
	/**
	 * Initialize `MarkBLocked`.
	 * @param {ConstructorConfig} [config]
	 * @returns {JQueryPromise<MarkBLocked>}
	 * @static
	 */
	MarkBLocked.init = function(config) {

		// @ts-ignore
		if (window.MarkBLockedLoaded) {
			mw.notify('Looks like MarkBLocked is loaded from multiple sources.', {type: 'error', autoHideSeconds: 'long'});
		} else {
			$.extend(window, {MarkBLockedLoaded: true});
		}

		var cfg = config || {};

		// Wait for dependent modules to get ready
		var modules = [
			'mediawiki.user',
			'mediawiki.api',
			'mediawiki.util',
			'oojs-ui',
			'oojs-ui.styles.icons-moderation',
		];
		var onConfig = mw.config.get('wgNamespaceNumber') === -1 && /^(markblockedconfig|mblc)$/i.test(mw.config.get('wgTitle'));
		var isRCW = ['Recentchanges', 'Watchlist'].indexOf(mw.config.get('wgCanonicalSpecialPageName') || '') !== -1;
		if (!onConfig && !isRCW) {
			modules.splice(3);
		}
		return mw.loader.using(modules).then(function() { // When ready

			api = new mw.Api();

			// For backwards compatibility, clear old config if any
			var oldOptionKey = 'userjs-gmbl-preferences';
			var /** @type {string?} */ oldCfgStr = mw.user.options.get(oldOptionKey);
			var /** @type {JQueryPromise<void>} */ backwards;
			if (oldCfgStr && (cfg.optionKey === void 0 || cfg.optionKey === defaultOptionKey) && !mw.user.options.get(defaultOptionKey)) {
				var /** @type {Record<string, string?>} */ params = {};
				params[oldOptionKey] = null;
				params[defaultOptionKey] = oldCfgStr;
				backwards = api.saveOptions(params).then(function() {
					mw.user.options.set(oldOptionKey, null);
					mw.user.options.set(defaultOptionKey, oldCfgStr);
				});
			} else {
				backwards = $.Deferred().resolve();
			}

			// Entry point
			var /** @type {JQueryPromise<string[]?>} */ ccaDeferred =
				onConfig ?
				$.Deferred().resolve([]) :
				cfg.contribsCA ?
				$.Deferred().resolve(cfg.contribsCA) :
				MarkBLocked.getContribsCA();
			return $.when(ccaDeferred, backwards, $.ready).then(function(contribsCA) { // contribsCA and backwards are resolved, and the DOM is ready

				if (contribsCA) {
					cfg.contribsCA = contribsCA;
				} else {
					console.warn('MarkBLocked: Failed to get special page aliases.');
					cfg.contribsCA = [];
				}

				var mbl = new MarkBLocked(cfg);
				if (onConfig) {
					mbl.createConfigInterface();
				} else {

					mbl.createPortletLink();

					// wikipage.content hook handler
					/**
					 * @type {NodeJS.Timeout=}
					 */
					var hookTimeout;
					/**
					 * @param {JQuery<HTMLElement>} [$content] Fall back to `.mw-body-content`
					 */
					var markup = function($content) {
						hookTimeout = void 0; // Reset the value of `hookTimeout`
						api.abort(); // Prevent the old HTTP requests from being taken over to the new markup procedure
						mbl.markup($content || $('.mw-body-content'));
					};
					/**
					 * A callback to `mw.hook('wikipage.content').add`.
					 * @param {JQuery<HTMLElement>} $content
					 * @see https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.hook-event-wikipage_content
					 */
					var hookHandler = function($content) {
						var isConnected = !!$(document).find($content).length;
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
						createToggleButton(mbl, hookHandler);
					}

				}
				return mbl;

			});

		});

		/**
		 * Create a button to enable/disable MarkBLocked (for Special:Recentchanges and Special:Watchlist, on which `markup`
		 * is recursively called when the page content is updated.)
		 * @param {MarkBLocked} mbl An instance of MarkBLocked.
		 * @param {($content: JQuery<HTMLElement>) => void} hookHandler A function to (un)bind to the `wikipage.content` hook.
		 */
		function createToggleButton(mbl, hookHandler) {

			// Create toggle button
			var toggle = new OO.ui.ButtonWidget({
				id: 'mbl-toggle',
				label: 'MBL',
				icon: 'unLock',
				flags: 'progressive',
				title: mbl.getMessage('toggle-title-enabled')
			});
			toggle.$element.off('click').on('click', function() {
				var disable = toggle.getFlags().indexOf('progressive') !== -1;
				var icon, title, hookToggle, msg;
				if (disable) {
					icon = 'lock';
					title = mbl.getMessage('toggle-title-disabled');
					hookToggle = mw.hook('wikipage.content').remove;
					msg = mbl.getMessage('toggle-notify-disabled');
					$('.mbl-userlink').removeClass(function(_, className) { // Remove all mbl- classes from user links
						return (className.match(/(^|\s)mbl-\S+/) || []).join(' ');
					});
				} else {
					icon = 'unLock';
					title = mbl.getMessage('toggle-title-enabled');
					hookToggle = mw.hook('wikipage.content').add;
					msg = mbl.getMessage('toggle-notify-enabled');
					// Hook.add fires the `wikipage.content` hook, meaning that `markup` is automatically called and classes are reassigned
				}
				toggle
					.setFlags({progressive: !disable, destructive: disable})
					.setIcon(icon)
					.setTitle(title);
				hookToggle(hookHandler);
				mw.notify(msg);
			});
			var $wrapper = $('<div>')
				.addClass('mw-rcfilters-ui-cell')
				.prop('id', 'mbl-toggle-wrapper')
				.append(toggle.$element);

			// Append the toggle button
			var spName = mw.config.get('wgCanonicalSpecialPageName');
			var selector = '';
			if (spName === 'Recentchanges') {
				selector = '.mw-rcfilters-ui-cell.mw-rcfilters-ui-rcTopSectionWidget-savedLinks';
				$(selector).eq(0).before($wrapper);
			} else if (spName === 'Watchlist') {
				selector = '.mw-rcfilters-ui-cell.mw-rcfilters-ui-watchlistTopSectionWidget-savedLinks';
				$(selector).eq(0).after($wrapper);
				$wrapper.css('margin-right', '1em');
			}

		}

	};

	/**
	 * Get special page aliases for `Contributions` and `CentralAuth`.
	 * @returns {JQueryPromise<string[]?>}
	 * @requires mediawiki.api
	 * @static
	 */
	MarkBLocked.getContribsCA = function() {
		return api.get({
			action: 'query',
			meta: 'siteinfo',
			siprop: 'specialpagealiases',
			formatversion: '2'
		}).then(function(res) {
			var resSpa = res && res.query && res.query.specialpagealiases;
			if (Array.isArray(resSpa)) {
				return resSpa.reduce(
					/**
					 * @param {string[]} acc
					 * @param {{realname: string; aliases: string[];}} obj
					 * @returns {string[]}
					 */
					function(acc, obj) {
						var /** @type {string[]} */ exclude = [];
						switch(obj.realname) {
							case 'Contributions':
								exclude.push('Contributions', 'Contribs');
								break;
							case 'CentralAuth':
								exclude.push('CentralAuth', 'CA', 'GlobalAccount');
						}
						if (exclude.length) {
							obj.aliases.forEach(function(alias) {
								if (exclude.indexOf(alias) === -1) {
									acc.push(alias);
								}
							});
						}
						return acc;
					},
					[]
				);
			} else {
				return null;
			}
		}).catch(function(_, err) {
			console.warn(err);
			return null;
		});
	};

	/**
	 * Replace the page content with the MarkBLocked config interface.
	 * @returns {void}
	 * @requires oojs-ui
	 * @requires oojs-ui.styles.icons-moderation
	 * @requires mediawiki.api
	 * @requires mediawiki.user
	 */
	MarkBLocked.prototype.createConfigInterface = function() {

		document.title = 'MarkBLockedConfig - ' + mw.config.get('wgSiteName');

		// Collect DOM elements
		var $heading = $('.mw-first-heading');
		var $body = $('.mw-body-content');
		if (!$heading.length || !$body.length) {
			mw.notify(this.getMessage('config-notify-notloaded'));
			return;
		}
		$heading.text(this.getMessage('config-label-heading'));

		// Config container
		var $container = $('<div>').prop('id', 'mblc-container');
		$body.empty().append($container);

		// Transparent overlay of the container used to make elements in it unclickable
		var $overlay = $('<div>').prop('id', 'mblc-container-overlay').hide();
		$container.after($overlay);

		// Option container fieldset
		var fieldset = new OO.ui.FieldsetLayout({
			id: 'mblc-optionfield',
			label: this.getMessage('config-label-fieldset')
		});
		$container.append(fieldset.$element);

		// Options
		var localIps = new OO.ui.CheckboxInputWidget({
			selected: this.options.localips
		});
		var globalUsers = new OO.ui.CheckboxInputWidget({
			selected: this.options.globalusers
		});
		var globalIps = new OO.ui.CheckboxInputWidget({
			selected: this.options.globalips
		});
		fieldset.addItems([
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
		]);

		// Save button
		var saveButton = new OO.ui.ButtonWidget({
			id: 'mblc-save',
			label: this.getMessage('config-label-save'),
			icon: 'bookmarkOutline',
			flags: ['primary', 'progressive']
		});
		$container.append(saveButton.$element);
		var _this = this;
		saveButton.$element.off('click').on('click', function() {

			$overlay.show();

			// Change the save button's label
			var $img = $('<img>')
				.prop('src', '//upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif')
				.css({
					verticalAlign: 'middle',
					height: '1em',
					border: '0',
					marginRight: '1em'
				});
			var $label = $('<span>').append($img);
			var textNode = document.createTextNode(_this.getMessage('config-label-saving'));
			$label.append(textNode);
			saveButton.setIcon(null).setLabel($label);

			// Get config
			var /** @type {UserOptions} */ cfg = {
				localips: localIps.isSelected(),
				globalusers: globalUsers.isSelected(),
				globalips: globalIps.isSelected()
			};
			var cfgStr = JSON.stringify(cfg);

			// Save config
			api.postWithToken('csrf', {
				action: _this.globalize ? 'globalpreferences' : 'options',
				optionname: _this.optionKey,
				optionvalue: cfgStr,
				formatversion:'2'
			}).then(function() {
				mw.user.options.set(_this.optionKey, cfgStr);
				return null;
			}).catch(/** @param {string} code */ function(code, err) {
				console.warn(err);
				return code;
			})
			.then(/** @param {string?} err */ function(err) {
				if (err) {
					mw.notify(_this.getMessage('config-notify-savefailed') + '(' + err + ')', {type: 'error'});
				} else {
					mw.notify(_this.getMessage('config-notify-savedone'), {type: 'success'});
				}
				saveButton.setIcon('bookmarkOutline').setLabel(_this.getMessage('config-label-save'));
				$overlay.hide();
			});

		});

	};

	/**
	 * Create a portlet link to the config page.
	 * @returns {void}
	 * @requires mediawiki.util
	 */
	MarkBLocked.prototype.createPortletLink = function() {
		var portlet = mw.util.addPortletLink(
			document.getElementById('p-tb') ? 'p-tb' : 'p-personal', // p-tb doesn't exist on minerva
			mw.util.getUrl('Special:MarkBLockedConfig'),
			this.getMessage('portlet-text'),
			'ca-mblc'
		);
		if (!portlet) {
			console.error('Failed to create a portlet link for MarkBLocked.');
		}
	};

	/**
	 * Mark up user links.
	 * @param {JQuery<HTMLElement>} $content
	 * @returns {void}
	 * @requires mediawiki.util
	 * @requires mediawiki.api
	 */
	MarkBLocked.prototype.markup = function($content) {

		var collected = this.collectLinks($content);
		var userLinks = collected.userLinks;
		if ($.isEmptyObject(userLinks)) {
			console.log('MarkBLocked', {
				$content: $content,
				links: 0
			});
			return;
		}
		var users = collected.users;
		var ips = collected.ips;
		var allUsers = users.concat(ips);
		var options = this.options;

		this.markBlockedUsers(userLinks, allUsers).then(function(markedUsers) {

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
			var ipsThatMightBeBlocked = ips.filter(function(ip) {
				return markedUsers.indexOf(ip) === -1;
			});
			var /** @type {BatchObject[]} */ batchArray = [];
			if (options.localips && ipsThatMightBeBlocked.length) {
				ipsThatMightBeBlocked.forEach(function(ip) {
					batchArray.push({
						params: {
							action: 'query',
							list: 'blocks',
							bkip: ip,
							bkprop: 'user|expiry|restrictions',
							formatversion: '2'
						},
						callback: function(res) {
							// An IP may have multiple blocks
							/** @type {ApiResponseQueryListBlocks[]} */
							var resBlk = res && res.query && res.query.blocks || [];
							var resObj = resBlk.reduce(/** @param {ApiResponseQueryListBlocks?} acc */ function(acc, obj, i) {
								if (i === 0) {
									acc = obj; // Just save the object in the first loop
								} else {
									// If the IP has multiple blocks, filter out the narrowest one CIDR-wise
									var m;
									var lastRange = acc && (m = acc.user.match(/\/(\d+)$/)) ? parseInt(m[1]) : 128;
									var thisRange = (m = obj.user.match(/\/(\d+)$/)) !== null ? parseInt(m[1]) : 128;
									if (thisRange > lastRange) { // e.g., /24 is narrower than /23
										acc = obj; // Overwrite the previously substituted object
									}
								}
								return acc;
							}, null);
							if (resObj) {
								var partialBlk = resObj.restrictions && !Array.isArray(resObj.restrictions);
								var clss;
								if (/^in/.test(resObj.expiry)) {
									clss = partialBlk ? 'mbl-blocked-partial' : 'mbl-blocked-indef';
								} else {
									clss = partialBlk ? 'mbl-blocked-partial' : 'mbl-blocked-temp';
								}
								addClass(userLinks, ip, clss);
							}
						}
					});
				});
			}
			if (options.globalusers && users.length) {
				users.forEach(function(user) {
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
						callback: function(res) {
							/** @typedef {{locked?: string;}} ApiResponseQueryListGlobalallusers */
							var /** @type {ApiResponseQueryListGlobalallusers[]=} */ resLck = res && res.query && res.query.globalallusers;
							var /** @type {ApiResponseQueryListGlobalallusers=} */ resObj;
							if (resLck && (resObj = resLck[0]) && resObj.locked === '') {
								addClass(userLinks, user, 'mbl-globally-locked');
							}
						}
					});
				});
			}
			if (options.globalips && ips.length) {
				ips.forEach(function(ip) {
					batchArray.push({
						params: {
							action: 'query',
							list: 'globalblocks',
							bgip: ip,
							bgprop: 'address|expiry',
							formatversion: '2'
						},
						callback: function(res) {
							/** @typedef {{address: string; expiry: string;}} ApiResponseQueryListGlobalblocks */
							/** @type {ApiResponseQueryListGlobalblocks[]} */
							var resGblk = res && res.query && res.query.globalblocks || [];
							var resObj = resGblk.reduce(/** @param {ApiResponseQueryListGlobalblocks?} acc */ function(acc, obj, i) {
								if (i === 0) {
									acc = obj;
								} else {
									var m;
									var lastRange = acc && (m = acc.address.match(/\/(\d+)$/)) ? parseInt(m[1]) : 128;
									var thisRange = (m = obj.address.match(/\/(\d+)$/)) !== null ? parseInt(m[1]) : 128;
									if (thisRange > lastRange) {
										acc = obj;
									}
								}
								return acc;
							}, null);
							if (resObj) {
								var clss = /^in/.test(resObj.expiry) ? 'mbl-globally-blocked-indef' : 'mbl-globally-blocked-temp';
								addClass(userLinks, ip, clss);
							}
						}
					});
				});
			}

			if (batchArray.length) {
				batchRequest(batchArray);
			}

		});

	};

	/**
	 * Object that stores collected user links, keyed by usernames and valued by an array of anchors.
	 * @typedef {Object.<string, HTMLAnchorElement[]>} UserLinks
	 */
	/**
	 * Collect user links to mark up.
	 * @param {JQuery<HTMLElement>} $content
	 * @returns {{userLinks: UserLinks; users: string[]; ips: string[];}}
	 * @requires mediawiki.util
	 */
	MarkBLocked.prototype.collectLinks = function($content) {

		// Get all anchors in the content
		var $anchors = $content.find('a');
		var $pNamespaces = $('#p-associated-pages, #p-namespaces, .skin-monobook #ca-nstab-user, .skin-monobook #ca-talk');
		if ($pNamespaces.length && !$content.find($pNamespaces).length && [2, 3].indexOf(mw.config.get('wgNamespaceNumber')) !== -1) {
			$anchors = $anchors.add($pNamespaces.find('a'));
		}
		var $contribsTools = $('.mw-special-Contributions, .mw-special-DeletedContributions').find('#mw-content-subtitle');
		if ($contribsTools.length && !$content.find($contribsTools).length) {
			$anchors = $anchors.add($contribsTools.find('a'));
		}

		// Set up variables
		var _this = this;
		var /** @type {string[]} */ users = [];
		var /** @type {string[]} */ ips = [];
		var ignoredClassesPr = /\b(mw-rollback-|autocomment)/;
		var /** @type {UserLinks} */ userLinks = {};

		// Filter out user links
		$anchors.each(function(_, a) {

			// Ignore some anchors
			var href = a.href;
			var pr = a.parentElement;
			if (
				!href ||
				href[0] === '#' ||
				mw.util.getParamValue('action', href) && !mw.util.getParamValue('redlink', href) ||
				mw.util.getParamValue('diff', href) ||
				mw.util.getParamValue('oldid', href) ||
				a.role === 'button' ||
				a.classList.contains('ext-discussiontools-init-timestamplink') ||
				pr && ignoredClassesPr.test(pr.className)
			) {
				return;
			}

			// Get the associated pagetitle
			var /** @type {RegExpExecArray?} */ m,
				/** @type {string} */ pagetitle;
			if ((m = _this.regex.article.exec(href))) {
				pagetitle = m[1];
			} else if ((m = _this.regex.script.exec(href))) {
				pagetitle = m[1];
			} else {
				return;
			}
			pagetitle = decodeURIComponent(pagetitle).replace(/ /g, '_');

			// Extract a username from the pagetitle
			var tar, username;
			if (_this.regex.contribsCA.test(pagetitle) && (tar = mw.util.getParamValue('target', href))) {
				// If the parsing title is one for a special page, check whether there's a valid &target= query parameter.
				// This parameter's value is prioritized than the subpage name, if any, hence "Special:CA/Foo?target=Bar"
				// shows CentralAuth for User:Bar, not User:Foo.
				username = tar;
			} else if ((m = _this.regex.user.exec(pagetitle))) {
				// If the condition above isn't met, just parse out a username from the pagetitle
				username = m[1];
			} else {
				return;
			}
			username = username.replace(/_/g, ' ').trim();
			var /** @type {string[]} */ arr;
			if (mw.util.isIPAddress(username, true)) {
				// @ts-ignore
				username = mw.util.sanitizeIP(username) || username; // The right operand is never reached
				arr = ips;
			} else if (/[/@#<>[\]|{}:]|^(\d{1,3}\.){3}\d{1,3}$/.test(username)) {
				// Ensure the username doesn't contain characters that can't be used for usernames (do this here or block status query might fail)
				console.log('MarkBLocked: Unprocessable username: ' + username);
				return;
			} else {
				arr = users;
				if (!/^[\u10A0-\u10FF]/.test(username)) { // ucFirst, except for Georgean letters
					username = username.charAt(0).toUpperCase() + username.slice(1);
				}
			}
			if (arr.indexOf(username) === -1) {
				arr.push(username);
			}

			a.classList.add('mbl-userlink');
			if (userLinks[username]) {
				userLinks[username].push(a);
			} else {
				userLinks[username] = [a];
			}

		});

		return {
			userLinks: userLinks,
			users: users,
			ips: ips
		};

	};

	/**
	 * @typedef ApiResponseQueryListBlocks
	 * @type {object}
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
	MarkBLocked.prototype.markBlockedUsers = function(userLinks, usersArr) {

		if (!usersArr.length) {
			return $.Deferred().resolve([]);
		} else {
			usersArr = usersArr.slice(); // Deep copy
		}

		var /** @type {string[]} */ marked = [];
		var aborted = false;
		/**
		 * @param {string[]} users
		 * @returns {JQueryPromise<void>}
		 */
		var req = function(users) {
			return api.post({ // This MUST be a POST request because the parameters can exceed the word count limit of URI
				action: 'query',
				list: 'blocks',
				bklimit: 'max',
				bkusers: users.join('|'),
				bkprop: 'user|expiry|restrictions',
				formatversion: '2'
			}).then(function(res){
				var /** @type {ApiResponseQueryListBlocks[]=} */ resBlk = res && res.query && res.query.blocks;
				if (resBlk) {
					resBlk.forEach(function(obj) {
						var partialBlk = obj.restrictions && !Array.isArray(obj.restrictions); // Boolean: True if partial block
						var clss;
						if (/^in/.test(obj.expiry)) {
							clss = partialBlk ? 'mbl-blocked-partial' : 'mbl-blocked-indef';
						} else {
							clss = partialBlk ? 'mbl-blocked-partial' : 'mbl-blocked-temp';
						}
						var markedUser = addClass(userLinks, obj.user, clss);
						if (markedUser) {
							marked.push(markedUser);
						}
					});
				}
				return void 0;
			}).catch(function(_, err) {
				// @ts-ignore
				if (err.exception === 'abort') {
					aborted = true;
				} else {
					console.error(err);
				}
				return void 0;
			});
		};

		// API calls
		var /** @type {JQueryPromise<void>[]} */ deferreds = [];
		while (usersArr.length) {
			deferreds.push(req(usersArr.splice(0, this.apilimit)));
		}
		return $.when.apply($, deferreds).then(function() {
			return aborted ? null : marked;
		});

	};

	/**
	 * Add a class to all anchors associated with a certain username.
	 * @param {UserLinks} userLinks
	 * @param {string} userName
	 * @param {string} className
	 * @returns {string?} The username if any link is marked up, or else `null`.
	 */
	function addClass(userLinks, userName, className) {
		var links = userLinks[userName]; // Get all links related to the user
		if (links) {
			for (var i = 0; links && i < links.length; i++) {
				links[i].classList.add(className);
			}
			return userName;
		} else {
			console.error('MarkBLocked: There\'s no link for User:' + userName);
			return null;
		}
	}

	/**
	 * @typedef {Object.<string, any>} DynamicObject
	 */
	/**
	 * @typedef BatchObject
	 * @type {object}
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
	function batchRequest(batchArray) {

		// Unflatten the array of objects to an array of arrays of objects
		var unflattened = batchArray.reduce(/** @param {BatchObject[][]} acc */ function(acc, obj) {
			var len = acc.length - 1;
			if (Array.isArray(acc[len]) && acc[len].length < 1000) {
				acc[len].push(obj);
			} else {
				acc[len + 1] = [obj];
			}
			return acc;
		}, [[]]);

		var aborted = false;
		/**
		 * Send an API request.
		 * @param {BatchObject} batchObj
		 * @returns {JQueryPromise<void>}
		 */
		var req = function(batchObj) {
			return api.get(batchObj.params)
				.then(batchObj.callback)
				.catch(function(_, err) {
					// @ts-ignore
					if (err.exception === 'abort') {
						aborted = true;
					} else {
						console.error(err);
					}
					return void 0;
				});
		};
		/**
		 * Send batched API requests.
		 * @param {number} index
		 * @returns {JQueryPromise<void>}
		 */
		var batch = function(index) {
			var batchElementArray = unflattened[index];
			var /** @type {JQueryPromise<void>[]} */ deferreds = [];
			batchElementArray.forEach(function(batchObj) {
				deferreds.push(req(batchObj));
			});
			return $.when.apply($, deferreds).then(function() {
				console.log('MarkBLocked batch count: ' + deferreds.length);
				index++;
				if (!aborted && unflattened[index]) {
					return batch(index);
				} else {
					return void 0;
				}
			});
		};

		return batch(0);

	}

	return MarkBLocked;

})();
//</nowiki>