// @ts-check
/* eslint-disable @typescript-eslint/no-this-alias */
/* global mw, OO */
//<nowiki>
module.exports = /** @class */ (function() {

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
	 * @property {string} [optionKey]  The key of `mw.user.options`, defaulted to `userjs-markblocked-config`.
	 * @property {Object.<string, Lang>} [i18n] A language object to merge to {@link MarkBLocked.i18n}. Using this config makes
	 * it possible to configure the default interface messages and add a new interface language (for the latter, a value needs
	 * to be passed to the {@link lang} parameter.)
	 * @property {string} [lang] The code of the language to use in the interface messages, defaulted to `en`.
	 * @property {string[]} [contribs_CA] Special page aliases for Contributions and CentralAuth in the local language (no need
	 * to pass `Contributions`, `Contribs`, `CentralAuth`, `CA`, and  `GlobalAccount`). If not provided, aliases are fetched from
	 * the API.
	 * @property {string[]} [groupsAHL] Local user groups with the `apihighlimits` user right, defaulted to `['sysop', 'bot']`;
	 */
	/**
	 * Initialize the properties of the `MarkBLocked` class. This is only to be called by `MarkBLocked.init`.
	 * @param {ConstructorConfig} [config]
	 * @constructor
	 * @requires mw.user
	 */
	function MarkBLocked(config) {

		var cfg = config || {};

		// User options
		var defaultOptions = {
			localips: false,
			globalusers: true,
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
		var rContribsCA = cfg.contribs_CA && cfg.contribs_CA.length ? '|' + cfg.contribs_CA.join('|') : '';
		rContribsCA = '(?:' + specialAliases.join('|') + '):(?:contrib(?:ution)?s|ca|centralauth|globalaccount' + rContribsCA + ')/';
		var rUser = '(?:' + userAliases.join('|') + '):';
		/**
		 * Regular expressions to collect user links.
		 * @typedef LinkRegex
		 * @type {object}
		 * @property {RegExp} article `/wiki/PAGENAME`: $1: PAGENAME
		 * @property {RegExp} script `/w/index.php?title=PAGENAME`: $1: PAGENAME
		 * @property {RegExp} user `User:(USERNAME|CIDR)`: $1: USERNAME or CIDR
		 */
		/** @type {LinkRegex} */
		this.regex = {
			article: new RegExp(mw.config.get('wgArticlePath').replace('$1', '([^#?]+)')), // '/wiki/PAGENAME'
			script: new RegExp(mw.config.get('wgScript') + '\\?title=([^#&]+)'), // '/w/index.php?title=PAGENAME'
			user: new RegExp('^(?:' + rContribsCA + '|' + rUser + ')([^/#]+|[a-f\\d:\\.]+/\\d\\d)$', 'i')
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
	 * @property {string} config-notloaded
	 * @property {string} config-heading
	 * @property {string} config-label-fieldset
	 * @property {string} config-label-localips
	 * @property {string} config-label-globalusers
	 * @property {string} config-label-globalips
	 * @property {string} config-label-save
	 * @property {string} config-label-saving
	 * @property {string} config-label-savedone
	 * @property {string} config-label-savefailed
	 * @property {string} portlet-text
	 */
	/**
	 * @type {Object.<string, Lang>}
	 * @static
	 */
	MarkBLocked.i18n = {
		en: {
			'config-notloaded': 'Failed to load the interface.',
			'config-heading': 'Configure MarkBLocked',
			'config-label-fieldset': 'Markup settings',
			'config-label-localips': 'Mark up IPs in locally blocked IP ranges',
			'config-label-globalusers': 'Mark up globally locked users',
			'config-label-globalips': 'Mark up globally blocked IPs',
			'config-label-save': 'Save settings',
			'config-label-saving': 'Saving settings...',
			'config-label-savedone': 'Sucessfully saved the settings.',
			'config-label-savefailed': 'Failed to save the settings. ',
			'portlet-text': 'Configure MarkBLocked'
		},
		ja: {
			'config-notloaded': 'インターフェースの読み込みに失敗しました。',
			'config-heading': 'MarkBLockedの設定',
			'config-label-fieldset': 'マークアップ設定',
			'config-label-localips': 'ブロックされたIPレンジに含まれるIPをマークアップ',
			'config-label-globalusers': 'グローバルロックされた利用者をマークアップ',
			'config-label-globalips': 'グローバルブロックされたIPをマークアップ',
			'config-label-save': '設定を保存',
			'config-label-saving': '設定を保存中...',
			'config-label-savedone': '設定の保存に成功しました。',
			'config-label-savefailed': '設定の保存に失敗しました。',
			'portlet-text': 'MarkBLockedの設定'
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
	 */
	MarkBLocked.init = function(config) {

		var cfg = config || {};

		// Wait for dependent modules and the DOM to get ready
		return $.when(
			mw.loader.using([
				'mediawiki.user',
				'mediawiki.api',
				'mediawiki.util',
				'oojs-ui',
				'oojs-ui.styles.icons-moderation',
			]),
			$.ready
		).then(function() { // When ready

			api = new mw.Api();

			// For backwards compatibility, clear old config if any
			var oldOptionKey = 'userjs-gmbl-preferences';
			var /** @type {string?} */ oldCfgStr = mw.user.options.get(oldOptionKey);
			if (oldCfgStr) {
				if (!mw.user.options.get(defaultOptionKey)) {
					mw.user.options.set(defaultOptionKey, oldCfgStr);
				}
				api.saveOption(oldOptionKey, null).then(function() {
					mw.user.options.set(oldOptionKey, null);
				});
			}

			// Entry point
			var onConfig = mw.config.get('wgNamespaceNumber') === -1 && /^(markblockedconfig|mblc)$/i.test(mw.config.get('wgTitle'));
			var /** @type {JQueryPromise<string[]?>} */ ccaDeferred =
				onConfig ?
				$.Deferred().resolve([]) :
				cfg.contribs_CA ?
				$.Deferred().resolve(cfg.contribs_CA) :
				MarkBLocked.getContribsCA();
			return ccaDeferred.then(function(contribs_CA) {

				if (contribs_CA) {
					cfg.contribs_CA = contribs_CA;
				} else {
					console.warn('MarkBLocked: Failed to get special page aliases.');
					cfg.contribs_CA = [];
				}

				var MBL = new MarkBLocked(cfg);
				if (onConfig) {
					MBL.createConfigInterface();
				} else {
					MBL.createPortletLink();
					var /** @type {NodeJS.Timeout} */ hookTimeout;
					mw.hook('wikipage.content').add(function() {
						clearTimeout(hookTimeout); // Prevent hook from being triggered multiple times
						hookTimeout = setTimeout(function() {
							api.abort(); // Prevent the old HTTP requests from being taken over to the new markup procedure
							MBL.markup();
						}, 100);
					});
				}
				return MBL;

			});

		});

	};

	/**
	 * Get special page aliases for `Contributions` and `CentralAuth`.
	 * @returns {JQueryPromise<string[]?>}
	 * @requires mediawiki.api
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
					 * @returns
					 */
					function(acc, obj) {
						var /** @type {string[]} */ exclude = [];
						switch(obj.realname) {
							case 'Contributions':
								exclude = ['Contributions', 'Contribs'];
								break;
							case 'CentralAuth':
								exclude = ['CentralAuth', 'CA', 'GlobalAccount'];
						}
						if (exclude.length) {
							var aliases = obj.aliases.filter(function(alias) {
								return exclude.indexOf(alias) === -1;
							});
							acc.concat(aliases);
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
			mw.notify(this.getMessage('config-notloaded'));
			return;
		}
		$heading.text(this.getMessage('config-heading'));

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
			var strCfg = JSON.stringify(cfg);

			// Save config
			api.saveOption(_this.optionKey, strCfg)
				.then(function() {
					mw.user.options.set(_this.optionKey, strCfg);
					return null;
				})
				.catch(/** @param {string} code */ function(code, err) {
					console.warn(err);
					return code;
				})
				// @ts-ignore
				.then(/** @param {string?} err */ function(err) {
					if (err) {
						mw.notify(_this.getMessage('config-label-savefailed') + '(' + err + ')', {type: 'error'});
					} else {
						mw.notify(_this.getMessage('config-label-savedone'), {type: 'success'});
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
			'p-tb',
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
	 * @returns {void}
	 */
	MarkBLocked.prototype.markup = function() {

		var collected = this.collectLinks();
		if (!collected) {
			return;
		}
		var userLinks = collected.userLinks;
		if ($.isEmptyObject(userLinks)) {
			console.log('MarkBLocked', {
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
							bklimit: 1,
							bkip: ip,
							bkprop: 'user|expiry|restrictions',
							formatversion: '2'
						},
						callback: function(res) {
							var /** @type {ApiResponseQueryListBlocks[]=} */ resBlk = res && res.query && res.query.blocks;
							var /** @type {ApiResponseQueryListBlocks=} */ resObj;
							if (resBlk && (resObj = resBlk[0])) {
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
							bglimit: 1,
							bgprop: 'address|expiry',
							formatversion: '2'
						},
						callback: function(res) {
							/** @typedef {{expiry: string;}} ApiResponseQueryListGlobalblocks */
							var /** @type {ApiResponseQueryListGlobalblocks[]=} */ resGblk = res && res.query && res.query.globalblocks;
							var /** @type {ApiResponseQueryListGlobalblocks=} */ resObj;
							if (resGblk && (resObj = resGblk[0])) {
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
	 * @returns {{userLinks: UserLinks; users: string[]; ips: string[];}|void}
	 * @requires mediawiki.util
	 */
	MarkBLocked.prototype.collectLinks = function() {

		// Get all anchors in the page content
		var body = document.querySelector('.mw-body-content');
		if (!body) {
			console.error('MarkBLocked: ".mw-body-content" does not exist in the DOM.');
			return;
		}
		var /** @type {HTMLAnchorElement[]} */ anchors = Array.prototype.slice.call(body.getElementsByTagName('a'));
		var pNamespacesId = '#p-associated-pages';
		var pNamespaces = document.querySelector(pNamespacesId);
		if (pNamespaces && !body.querySelector(pNamespacesId)) { // Add links in left navigation
			anchors = Array.prototype.slice.call(pNamespaces.getElementsByTagName('a')).concat(anchors);
		}

		// Set up variables
		var _this = this;
		var /** @type {string[]} */ users = [];
		var /** @type {string[]} */ ips = [];
		var ignoredClassesPr = /\b(mw-rollback-|autocomment)/;
		var /** @type {UserLinks} */ userLinks = {};

		// Filter out user links
		anchors.forEach(function(a) {

			// Ignore some anchors
			var href = a.href;
			var pr = a.parentElement;
			if (
				!href ||
				href[0] === '#' ||
				mw.util.getParamValue('action', href) && !mw.util.getParamValue('redlink', href) ||
				mw.util.getParamValue('diff', href) ||
				mw.util.getParamValue('oldid', href) ||
				a.type === 'button' ||
				a.role === 'button' ||
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
			m = _this.regex.user.exec(pagetitle);
			if (!m) {
				return;
			}
			var username = m[1].replace(/_/g, ' ').trim();
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