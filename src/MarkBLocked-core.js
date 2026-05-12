/**
 * MarkBLocked-core
 * @author [[User:Dragoniez]]
 * @version 3.3.2
 *
 * @see https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MarkBLocked-core.css – Style sheet
 * @see https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MarkBLocked.js – Loader module
 *
 * Additional information:
 * @see https://ja.wikipedia.org/wiki/Help:MarkBLocked – About the jawiki gadget
 *
 * Global user script that uses this module:
 * @see https://meta.wikimedia.org/wiki/User:Dragoniez/MarkBLockedGlobal.js – Loader script
 * @see https://meta.wikimedia.org/wiki/User:Dragoniez/MarkBLockedGlobal – English help page
 * @see https://meta.wikimedia.org/wiki/User:Dragoniez/MarkBLockedGlobal/ja – Japanese help page
 *
 * To use this gadget on another (WMF) wiki, prepare a loader script for it.
 * Refer to the example loaders linked above, and see `ConstructorConfig` in:
 *
 * @see https://github.com/Dr4goniez/wiki-gadgets/blob/main/src/window/MarkBLocked.d.ts
 */
// @ts-check
/* global mw, OO */
//<nowiki>
// const MarkBLocked = (() => {
module.exports = (() => {

class MarkBLocked {

	/**
	 * Initializes `MarkBLocked`.
	 *
	 * @param {ConstructorConfig} [cfg]
	 * @returns {JQuery.Promise<MarkBLocked>}
	 */
	static init(cfg = {}) {
		// Disallow a second run
		if (window.MarkBLockedLoaded) {
			throw new Error('MarkBLocked is loaded from multiple sources');
		} else {
			window.MarkBLockedLoaded = true;
		}

		// Wait for dependent modules to get ready
		const modules = [
			'mediawiki.user',
			'mediawiki.api',
			'mediawiki.ForeignApi',
			'mediawiki.storage',
			'mediawiki.util',
			'jquery.ui'
		];
		const isConfigPage = mw.config.get('wgNamespaceNumber') === -1 && /^(markblockedconfig|mblc)$/i.test(mw.config.get('wgTitle'));
		const isRCW = ['Recentchanges', 'Recentchangeslinked', 'Watchlist'].includes(mw.config.get('wgCanonicalSpecialPageName') || '');
		if (isConfigPage || isRCW) {
			modules.push(
				'oojs-ui',
				'oojs-ui.styles.icons-moderation'
			);
		}

		return mw.loader.using(modules).then(() => {
			MarkBLocked.api = new mw.Api(this.getApiOptions());
			MarkBLocked.metaApi = isMetaWiki()
				? MarkBLocked.api
				: new mw.ForeignApi('https://meta.wikimedia.org/w/api.php', this.getApiOptions());

			// For backwards compatibility, clear old config if any
			/** @type {JQuery.Promise<void>} */
			const backwards = (() => {
				const oldOptionKey = 'userjs-gmbl-preferences';
				/** @type {?string} */
				const oldCfgStr = mw.user.options.get(oldOptionKey);
				if (
					oldCfgStr &&
					(cfg.optionKey === undefined || cfg.optionKey === this.defaultOptionKey) &&
					!mw.user.options.get(this.defaultOptionKey)
				) {
					const options = {
						[oldOptionKey]: null,
						[this.defaultOptionKey]: oldCfgStr
					};
					return this.api.saveOptions(options).then(() => {
						mw.user.options.set(options);
					});
				} else {
					return $.Deferred().resolve().promise();
				}
			})();

			// Entry point
			return $.when(
				this.getInitializer(),
				backwards,
				$.ready
			);
		}).then((initializer) => {
			const mbl = new MarkBLocked(cfg, initializer);

			if (isConfigPage) {
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
					hookTimeout = undefined; // Clear the hook timeout reference
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

				mbl.handleIpReveals(initializer.userrights, isRCW);

				// Add a toggle button on RCW
				if (isRCW) {
					mbl.createToggleButton(hookHandler);
				}
			}

			return mbl;
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
	 *
	 * @returns {mw.Api.Options}
	 * @private
	 */
	static getApiOptions() {
		return {
			ajax: {
				headers: {
					'Api-User-Agent': 'MarkBLocked-core/3.3.2 (https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MarkBLocked-core.js)',
				},
			},
			parameters: {
				action: 'query',
				format: 'json',
				formatversion: '2',
			},
		};
	}

	/**
	 * Loads initial user and site metadata from cache or via MediaWiki API.
	 *
	 * Attempts to retrieve cached initializer values from `mw.storage`.
	 * If any are missing or invalid, it makes an API request to fetch the data.
	 *
	 * @returns {JQuery.Promise<Initializer>} A promise that resolves to the initializer object.
	 * @private
	 */
	static getInitializer() {
		const storageKeyPrefix = 'MarkBLocked-';
		const onMeta = isMetaWiki();

		/** @type {Initializer} */
		const initializer = {
			specialpagealiases: Object.create(null),
			userrights: new Set(),
			userrights_meta: new Set(),
		};

		/** @type {Set<keyof SpecialPageAliases>} */
		const canonicalSpecialPageNames = new Set([
			'Contributions',
			'IPContributions',
			'GlobalContributions',
			'CentralAuth'
		]);

		/**
		 * Cache validators for each initializer key.
		 *
		 * @type {CacheValidator}
		 */
		const cacheValidator = {
			// @ts-expect-error - Return type inferred as boolean instead of type guard
			specialpagealiases: (cache) => {
				if (!cache || typeof cache !== 'object') {
					return false;
				}
				for (const key of typedKeys(cache)) {
					if (
						!canonicalSpecialPageNames.has(key) ||
						!isStringArray(cache[key])
					) {
						return false;
					}
				}
				return true;
			},
			userrights: isStringArray,
			userrights_meta: isStringArray,
		};

		let needsSiteInfo = false;
		let needsUserRights = false;
		let needsMetaUserRights = false;

		// Attempt to load values from localStorage
		for (const key of typedKeys(initializer)) {
			const cache = mw.storage.getObject(storageKeyPrefix + key);

			switch (key) {
				case 'specialpagealiases':
					if (cacheValidator[key](cache)) {
						initializer[key] = cache;
					} else {
						needsSiteInfo = true;
					}
					break;
				case 'userrights':
				case 'userrights_meta':
					if (cacheValidator[key](cache)) {
						initializer[key] = new Set(cache);
					} else if (key === 'userrights') {
						needsUserRights = true;
					} else {
						needsMetaUserRights = true;
					}
			}
		}

		// On Meta-Wiki, both rights sets are identical
		if (onMeta && initializer.userrights.size && !initializer.userrights_meta.size) {
			initializer.userrights_meta = new Set(initializer.userrights);
			needsMetaUserRights = false;
		}

		/** @type {JQuery.Promise<void>[]} */
		const requests = [];

		if (needsSiteInfo || needsUserRights) {
			/**
			 * @type {{
			 *   meta?: ('siteinfo' | 'userinfo')[];
			 *   uiprop?: 'rights';
			 *   siprop?: 'specialpagealiases';
			 * }}
			 */
			const params = Object.create(null);

			if (needsSiteInfo) {
				params.meta = ['siteinfo'];
				params.siprop = 'specialpagealiases';
			}

			if (needsUserRights) {
				params.meta = params.meta || [];
				params.meta.push('userinfo');
				params.uiprop = 'rights';
			}

			requests.push(
				this.api.get(params).then(/** @param {ApiResponse} res */ ({ query }) => {
					if (!query) {
						return;
					}

					const specialpagealiases = query.specialpagealiases;
					if (specialpagealiases) {
						const data = initializer.specialpagealiases;

						specialpagealiases.forEach(({ realname, aliases }) => {
							const name = /** @type {keyof SpecialPageAliases} */ (realname);
							if (canonicalSpecialPageNames.has(name)) {
								data[name] = aliases.filter((el) => el !== name);
							}
						});

						mw.storage.set(
							`${storageKeyPrefix}specialpagealiases`,
							JSON.stringify(data),
							daysInSeconds(3)
						);
					}

					const userrights = query.userinfo && query.userinfo.rights;
					if (userrights) {
						initializer.userrights = new Set(userrights);

						mw.storage.set(
							`${storageKeyPrefix}userrights`,
							JSON.stringify(userrights),
							daysInSeconds(1)
						);

						// On Meta-Wiki, local and Meta rights are identical
						if (onMeta) {
							initializer.userrights_meta = new Set(userrights);

							mw.storage.set(
								`${storageKeyPrefix}userrights_meta`,
								JSON.stringify(userrights),
								daysInSeconds(1)
							);
						}
					}
				}).catch((_, err) => {
					console.error(err);
				})
			);
		}

		if (needsMetaUserRights && !onMeta) {
			requests.push(
				this.metaApi.get({
					meta: 'userinfo',
					uiprop: 'rights',
				}).then(/** @param {ApiResponse} res */ ({ query }) => {
					const userrights = query && query.userinfo && query.userinfo.rights;

					if (userrights) {
						initializer.userrights_meta = new Set(userrights);

						mw.storage.set(
							`${storageKeyPrefix}userrights_meta`,
							JSON.stringify(userrights),
							daysInSeconds(1)
						);
					}
				}).catch((_, err) => {
					console.error(err);
				})
			);
		}

		if (!requests.length) {
			return $.Deferred().resolve(initializer).promise();
		}

		return $.when(...requests).then(
			() => initializer,
			(_, err) => {
				console.warn('Failed to get user/site information:', err);
				return initializer;
			}
		);
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
			// @ts-expect-error
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
	 * @param {Initializer} initializer
	 * @private
	 * @requires mediawiki.api
	 * @requires mediawiki.ForeignApi
	 * @requires mediawiki.user
	 */
	constructor(cfg, initializer) {
		const {
			specialpagealiases: aliasMap,
			userrights,
			userrights_meta,
		} = initializer;

		if ($.isEmptyObject(aliasMap)) {
			// Defensive: This object should never be empty
			console.warn('Detected an empty object for "initializer.specialpagealiases".');
			Object.assign(aliasMap, {
				Contributions: ['Contribs'],
				CentralAuth: ['GlobalAccount', 'CA'],
				IPContributions: ['IPContribs'],
				GlobalContributions: ['GlobalContribs'],
			});
		}

		// Show warnings for invalid config properties, if any
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
		 *
		 * @type {string}
		 * @readonly
		 * @private
		 */
		this.optionKey = cfg.optionKey || MarkBLocked.defaultOptionKey;
		/**
		 * @type {UserOptions}
		 * @readonly
		 * @private
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
			} catch (err) {
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
		 * @readonly
		 * @private
		 */
		this.globalize = !!cfg.globalize;
		console.log('MarkBLocked globalization: ' + this.globalize);

		// Language options
		if ($.isPlainObject(cfg.i18n)) {
			Object.assign(MarkBLocked.i18n, cfg.i18n);
		}
		/**
		 * @type {Messages}
		 * @readonly
		 * @private
		 */
		this.msg = (() => {
			let langCode = 'en';
			if (cfg.lang !== undefined) {
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
		 * @type {LinkRegex}
		 * @readonly
		 * @private
		 */
		this.regex = (() => {
			// Collect namespace aliases
			const wgNamespaceIds = mw.config.get('wgNamespaceIds'); // { "special": -1, "user": 2, ... }
			const nsAliases = {
				special: /** @type {string[]} */ ([]),
				user: /** @type {string[]} */ ([]),
			};
			for (const alias in wgNamespaceIds) {
				const nsId = wgNamespaceIds[alias];
				const escaped = mw.util.escapeRegExp(alias);
				switch (nsId) {
					case -1:
						nsAliases.special.push(escaped);
						break;
					case 2:
					case 3:
						nsAliases.user.push(escaped);
				}
			}

			// Process special page aliases
			const /** @type {string[]} */ spAliases = [];
			const /** @type {string[]} */ spAliasesOverrideTarget = [];
			for (const realname of typedKeys(aliasMap)) {
				const aliases = aliasMap[realname];
				if (Array.isArray(aliases)) {
					const escaped = [realname, ...aliases].map(mw.util.escapeRegExp);
					spAliases.push(...escaped);
					if (realname === 'CentralAuth') {
						// The &target= query parameter is overridden by the subpage target on this page
						spAliasesOverrideTarget.push(...escaped);
					}
				}
			}

			const rSpecial = `(?:${nsAliases.special.join('|')}):(?:${spAliases.join('|')})`;
			const rSpecialNoTarget = `(?:${nsAliases.special.join('|')}):(?:${spAliasesOverrideTarget.join('|')})`;
			const rUser = `(?:${nsAliases.user.join('|')}):`;
			return {
				article: new RegExp(
					mw.util.escapeRegExp(mw.config.get('wgArticlePath')).replace('\\$1', '([^#?]+)')
				),
				script: new RegExp(mw.config.get('wgScript') + '\\?title=([^#&]+)'),
				special: new RegExp(`^${rSpecialNoTarget}($|/)`, 'i'),
				user: new RegExp(`^(?:${rSpecial}/|${rUser})([^/#]+|[a-f\\d:\\.]+/\\d\\d)$`, 'i')
			};
		})();

		/**
		 * The maximum number of batch parameter values for the API.
		 *
		 * @type {Record<'local' | 'meta', number>}
		 * @readonly
		 * @private
		 */
		this.apilimit = {
			local: userrights.has('apihighlimits') ? 500 : 50,
			meta: userrights_meta.has('apihighlimits') ? 500 : 50,
		};
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
		const heading = document.querySelector('.mw-first-heading');
		const content = document.querySelector('.mw-body-content');
		if (!(heading instanceof HTMLElement) || !(content instanceof HTMLElement)) {
			mw.notify(this.getMessage('config-notify-notloaded'));
			return;
		}
		heading.textContent = this.getMessage('config-label-heading');

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
				}),
			],
		});

		// Markup options
		const rangeblocks = new OO.ui.CheckboxInputWidget({
			selected: this.options.rangeblocks,
		});
		const g_locks = new OO.ui.CheckboxInputWidget({
			selected: this.options.g_locks,
		});
		const g_blocks = new OO.ui.CheckboxInputWidget({
			selected: this.options.g_blocks,
		});
		const g_rangeblocks = new OO.ui.CheckboxInputWidget({
			selected: this.options.g_rangeblocks,
			disabled: !g_blocks.isSelected(),
		});
		g_blocks.on('change', () => {
			if (!g_blocks.isSelected()) {
				g_rangeblocks.setSelected(false).setDisabled(true);
			} else {
				g_rangeblocks.setDisabled(false);
			}
		});
		/**
		 * @param {keyof Messages} key
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
					align: 'inline',
				}),
				new OO.ui.FieldLayout(g_locks, {
					label: getExclMessage('config-label-g_locks', true),
					align: 'inline',
				}),
				new OO.ui.FieldLayout(g_blocks, {
					label: getExclMessage('config-label-g_blocks', true),
					align: 'inline',
				}),
				new OO.ui.FieldLayout(g_rangeblocks, {
					label: getExclMessage('config-label-g_rangeblocks'),
					align: 'inline',
					help: this.getMessage('config-help-g_rangeblocks'),
					helpInline: true,
				}),
			],
		});

		// Save button
		const saveButton = new OO.ui.ButtonWidget({
			id: 'mblc-save',
			label: this.getMessage('config-label-save'),
			icon: 'bookmarkOutline',
			flags: ['primary', 'progressive'],
		}).on('click', () => {
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
				g_rangeblocks: g_rangeblocks.isSelected(),
			};
			const cfgStr = JSON.stringify(cfg);

			// Save config
			MarkBLocked.api.postWithToken('csrf', {
				action: this.globalize ? 'globalpreferences' : 'options',
				optionname: this.optionKey,
				optionvalue: cfgStr
			}).then(() => {
				mw.user.options.set(this.optionKey, cfgStr);
				return null;
			}).catch(/** @param {string} code */ (code, err) => {
				console.warn(err);
				return code;
			}).then(/** @param {?string} err */ (err) => {
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
		$(content).empty().append(
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
	 * @param {keyof Messages} key
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
		MarkBLocked.api.abort();
		if (MarkBLocked.metaApi !== MarkBLocked.api) {
			MarkBLocked.metaApi.abort();
		}
		MarkBLocked.abortHook.fire();
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
		let /** @type {?string} */ selector = null;
		switch (mw.config.get('wgCanonicalSpecialPageName')) {
			case 'Recentchanges':
				selector = '.mw-rcfilters-ui-cell.mw-rcfilters-ui-rcTopSectionWidget-savedLinks';
				break;
			case 'Recentchangeslinked':
				selector = '.mw-rcfilters-ui-cell.mw-rcfilters-ui-rclTopSectionWidget-savedLinks';
				break;
			case 'Watchlist':
				selector = '.mw-rcfilters-ui-cell.mw-rcfilters-ui-watchlistTopSectionWidget-savedLinks';
		}
		if (selector === null) {
			return;
		}

		const toggle = new OO.ui.ButtonWidget({
			id: 'mbl-toggle',
			label: 'MBL',
			icon: 'unLock',
			flags: 'progressive',
			title: this.getMessage('toggle-title-enabled'),
		}).on('click', () => {
			const disable = toggle.getFlags().includes('progressive');
			let icon, title, hookToggle, msg;
			if (disable) {
				icon = 'lock';
				title = this.getMessage('toggle-title-disabled');
				hookToggle = mw.hook('wikipage.content').remove;
				msg = this.getMessage('toggle-notify-disabled');
				$('.mbl-userlink').each(function() {
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

		$(selector).eq(0).before(
			$('<div>')
				.prop('id', 'mbl-toggle-wrapper')
				.append(toggle.$element)
		);
	}

	/**
	 * Marks up user links.
	 *
	 * @param {JQuery<HTMLElement>} $content
	 * @param {boolean} isRCW
	 * @returns {JQuery.Promise<void>}
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
		const { userLinks, users, ips, temps } = this.collectLinks($content, isRCW);
		if (!userLinks.size) {
			console.log('MarkBLocked', {
				$content,
				links: 0,
			});
			return $.Deferred().resolve();
		}
		const usersArr = [...users];
		const allUsers = usersArr.concat([...ips], [...temps]);

		// Start markup
		return $.when(
			this.bulkMarkupBlocks('local', userLinks, allUsers),
			this.bulkMarkupBlocks('global', userLinks, this.options.g_blocks ? allUsers : []),
			this.bulkMarkupGlobalLocks(userLinks, this.options.g_locks ? usersArr : [])
		).then((blockedUsers, globallyBlockedUsers, globallyLockedUsers) => {
			if (blockedUsers === null || globallyBlockedUsers === null || globallyLockedUsers === null) {
				// Aborted
				return;
			} else {
				console.log('MarkBLocked', {
					$content,
					links: Array.from(userLinks.values()).reduce((sum, arr) => sum + arr.length, 0),
					user_registered: users.size,
					user_ip: ips.size,
					user_temporary: temps.size,
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
			if (this.options.rangeblocks && (remainingIps = filterSet(ips, (ip) => !blockedUsers.has(ip))).size) {
				remainingIps.forEach((ip) => {
					batchArray.push({
						username: ip,
						params: {
							list: 'blocks',
							bkip: ip,
							bkprop: 'user|by|expiry|reason|flags',
						},
						callback: (res) => {
							// An IP may have multiple blocks
							const resBlk = res && res.query && res.query.blocks || [];
							const resObj = resBlk.reduce(/** @param {?ApiResponseQueryListBlocks} acc */ (acc, obj, i) => {
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
								MarkBLocked.applyMarkup(userLinks, ip, clss, tooltip);
							}
						},
					});
				});
			}
			if (this.options.g_rangeblocks && (remainingIps = filterSet(ips, (ip) => !globallyBlockedUsers.has(ip))).size) {
				remainingIps.forEach((ip) => {
					batchArray.push({
						username: ip,
						params: {
							list: 'globalblocks',
							bgip: ip,
							bgprop: 'target|by|expiry|reason',
						},
						callback: (res) => {
							const resGblk = res && res.query && res.query.globalblocks || [];
							const resObj = resGblk.reduce(/** @param {?ApiResponseQueryListGlobalblocks} acc */ (acc, obj, i) => {
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
								MarkBLocked.applyMarkup(userLinks, ip, clss, tooltip);
							}
						},
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
	 * @typedef {{ userLinks: UserLinks; users: Set<string>; ips: Set<string>; temps: Set<string>; }} LinkObject
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
			ips: new Set(),
			temps: new Set(),
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
			let /** @type {?RegExpExecArray} */ m,
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
				// Currently, on Special:CentralAuth, the &target= query parameter overrides the subpage.
				// If present, use its value instead of any subpage name. For example:
				// "Special:CentralAuth/Foo?target=Bar" displays CentralAuth for User:Bar, not User:Foo.
				username = tar;
			} else if ((m = this.regex.user.exec(pagetitle))) {
				// If the condition above isn't met, just parse out a username from the pagetitle
				username = m[1];
			} else {
				return;
			}
			username = username.replace(/_/g, ' ').replace(/@global$/, '').trim();
			let /** @type {keyof Omit<LinkObject, 'userLinks'>} */ key;
			if (mw.util.isIPAddress(username, true)) {
				username = mw.util.sanitizeIP(username) || username; // The right operand is never reached
				key = 'ips';
			} else if (mw.util.isTemporaryUser(username)) {
				key = 'temps';
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
	 * @param {'local' | 'global'} domain
	 * @param {UserLinks} userLinks The object containing user link references to be marked.
	 * @param {string[]} usersArr A list of usernames or IPs to process.
	 * @returns {JQuery.Promise<?Set<string>>} A promise resolving to the set of usernames/IPs whose links were marked,
	 * or `null` if the operation was aborted.
	 * @private
	 * @requires mediawiki.api
	 */
	bulkMarkupBlocks(domain, userLinks, usersArr) {
		if (!usersArr.length) {
			return $.Deferred().resolve(new Set()).promise();
		}
		usersArr = usersArr.slice();

		let request;
		switch (domain) {
			case 'local':
				request = this.bulkMarkupBlocksLocal.bind(this);
				break;
			case 'global':
				request = this.bulkMarkupBlocksGlobal.bind(this);
				break;
			default:
				throw new Error('Invalid domain: ' + domain);
		}

		const /** @type {JQuery.Promise<?Set<string>>[]} */ deferreds = [];
		while (usersArr.length) {
			deferreds.push(request(userLinks, usersArr.splice(0, this.apilimit.local)));
		}

		return $.when(...deferreds).then((...args) => {
			const /** @type {Set<string>} */ ret = new Set();
			for (let i = 0; i < args.length; i++) {
				const marked = args[i];
				if (!marked) {
					return null;
				}
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
	 * @param {boolean} [isRetry]
	 * @returns {JQuery.Promise<?Set<string>>} A set of marked users' names or `null` if aborted.
	 * @private
	 */
	bulkMarkupBlocksLocal(userLinks, users, isRetry = false) {
		return MarkBLocked.api.post({ // This MUST be a POST request because the parameters can exceed the word count limit of URI
			list: 'blocks',
			bklimit: 'max',
			bkusers: users.join('|'),
			bkprop: 'user|by|expiry|reason|flags',
			errorformat: 'raw',
		}, nonwritePost()).then(/** @param {ApiResponse} res */ (res) => {
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
				const markedUser = MarkBLocked.applyMarkup(userLinks, user, clss, tooltip);
				if (markedUser) {
					ret.add(markedUser);
				}
			}
			return ret;
		}).catch(/** @param {Record<string, any>} err */ (_, err) => {
			if (err.exception === 'abort') {
				return null;
			}

			// Check whether we've unexpectedly encountered unparsable usernames
			/** @type {{ code: string; params: { plaintext: string; }[]; }[]=} */
			const errors = err.errors;
			if (!isRetry && errors) {
				/** @type {Set<string>} */
				const badusers = new Set();

				// Collect unparsable usernames
				for (let i = 0; i < errors.length; i++) {
					const { code, params } = errors[i];
					if (code === 'baduser') {
						// Each error contains at most one actual bad username
						const baduser = params.find(p => p.plaintext !== 'bkusers');
						if (baduser && baduser.plaintext) {
							badusers.add(baduser.plaintext);
						}
					}
				}

				// Remove the unparsable usernames and retry, or fall through
				// TODO: Cache the unparsable usernames?
				if (badusers.size) {
					const filtered = users.filter(u => !badusers.has(u));
					if (filtered.length) {
						console.warn('Retrying query without unparsable username(s):', [...badusers]);
						return this.bulkMarkupBlocksLocal(userLinks, filtered, true);
					}
				}
			}

			console.error(err);
			return new Set();
		});
	}

	/**
	 * @param {UserLinks} userLinks
	 * @param {string[]} users
	 * @returns {JQuery.Promise<?Set<string>>} An array of marked users' names or `null` if aborted
	 * @private
	 */
	bulkMarkupBlocksGlobal(userLinks, users) {
		return MarkBLocked.api.post({
			list: 'globalblocks',
			bgtargets: users.join('|'),
			bgprop: 'target|by|expiry|reason',
			bglimit: 'max',
		}, nonwritePost()).then(/** @param {ApiResponse} res */ (res) => {
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
				const markedUser = MarkBLocked.applyMarkup(userLinks, target, clss, tooltip);
				if (markedUser) {
					ret.add(markedUser);
				}
			}
			return ret;
		}).catch(/** @param {Record<string, any>} err */ (_, err) => {
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
	 * @param {string[]} usersArr
	 * @returns {JQuery.Promise<?Set<string>>} An array of marked users' names or `null` if aborted
	 * @private
	 */
	bulkMarkupGlobalLocks(userLinks, usersArr) {
		if (!usersArr.length) {
			return $.Deferred().resolve(new Set()).promise();
		}
		usersArr = usersArr.slice();

		const className = 'mbl-globally-locked';
		const /** @type {Set<string>} */ marked = new Set();

		/**
		 * @param {string[]} users
		 * @returns {JQuery.Promise<?Record<number, string>>}
		 */
		const getLockLogids = (users) => {
			return MarkBLocked.api.post({
				list: 'globalusers',
				gususers: users.join('|'),
				gusprop: 'locked',
			}, nonwritePost()).then(/** @param {ApiResponse} res */ (res) => {
				const globalusers = res && res.query && res.query.globalusers || [];
				const /** @type {Record<number, string>} */ ret = Object.create(null);

				for (const obj of globalusers) {
					if (obj.invalid) {
						console.error('Invalid username:' + obj.name);
						continue;
					}
					if (obj.locked && obj.locklogid) {
						ret[obj.locklogid] = obj.name;
					}
					if (obj.locked) {
						const u = MarkBLocked.applyMarkup(userLinks, obj.name, className);
						if (u) {
							marked.add(u);
						}
					}
				}

				return ret;
			}).catch(/** @param {Record<string, any>} err */ (_, err) => {
				if (err.exception === 'abort') {
					return null;
				} else {
					console.error(err);
					return Object.create(null);
				}
			});
		};

		/**
		 * @param {string[]} logids
		 * @param {Record<number, string>} logidMap
		 * @returns {JQuery.Promise<boolean>} `false` if aborted
		 */
		const fetchAndAddTooltips = (logids, logidMap) => {
			// Temporary workaround for [[phab:T425972]]
			const batch = logids.join('|');
			const request = batch.length < 1800
				? MarkBLocked.metaApi.get.bind(MarkBLocked.metaApi)
				: MarkBLocked.metaApi.post.bind(MarkBLocked.metaApi);

			return request({
				list: 'logevents',
				leids: batch,
				leaction: 'globalauth/setstatus',
				leprop: 'ids|user|timestamp|comment|details',
				lelimit: 'max',
			}/*, nonwritePost()*/).then(/** @param {ApiResponse} res */ (res) => {
				const logevents = res && res.query && res.query.logevents || [];

				for (const log of logevents) {
					const target = logidMap[log.logid];
					if (!target) {
						console.error(`No corresponding username found for logid ${log.logid}`, log);
						continue;
					}

					// Evaluate log parameters
					if (!log.params) {
						// `actionhidden: true` and the client isn't allowed to see the log
						continue;
					}
					const isLockLog = log.params.added
						? log.params.added.includes('locked')
						: log.params['0'] === 'locked';
					if (!isLockLog) {
						// Not a global lock log (unexpected because ApiQueryGlobalUsers already ensures this)
						console.error('Unexpected log entry', log);
						continue;
					}

					/**
					 * - `$1` - Locking steward
					 * - `$2` - "Since" timestamp
					 * - `$3` - Reason
					 *
					 * @type {[string, string, string]}
					 */
					const titleVars = ['??', '??','??'];

					if (log.user) {
						titleVars[0] = log.user;
					}

					titleVars[1] = log.timestamp;

					if (typeof log.comment === 'string') {
						titleVars[2] = log.comment || '""';
					}

					const tooltip = mw.format(this.getMessage('title-locked'), ...titleVars);
					MarkBLocked.applyMarkup(userLinks, target, 'mbl-globally-locked', tooltip);
				}

				return true;
			}).catch(/** @param {Record<string, any>} err */ (_, err) => {
				if (err.exception === 'abort') {
					return false;
				} else {
					console.error(err);
					return true;
				}
			});
		};

		const /** @type {JQuery.Promise<?Record<number, string>>[]} */ defMarkLocked = [];
		while (usersArr.length) {
			defMarkLocked.push(getLockLogids(usersArr.splice(0, this.apilimit.local)));
		}

		return $.when(...defMarkLocked).then((...objects) => {
			// Conflate the array of objects to one object
			const /** @type {Record<number, string>} */ logidMap = Object.create(null);
			for (const obj of objects) {
				if (!obj) {
					return null;
				}
				Object.assign(logidMap, obj);
			}

			if ($.isEmptyObject(logidMap)) {
				return marked;
			}

			const logids = Object.keys(logidMap);
			const defTooltips = [];
			while (logids.length) {
				defTooltips.push(fetchAndAddTooltips(logids.splice(0, this.apilimit.meta), logidMap));
			}

			return $.when(...defTooltips).then((...results) => {
				if (results.includes(false)) {
					return null;
				}
				return marked;
			});
		});
	}

	/**
	 * Applies markup to all anchors associated with the given username.
	 *
	 * Adds the specified class to each link and optionally attaches a tooltip.
	 *
	 * @param {UserLinks} userLinks
	 * @param {string} userName
	 * @param {string} className
	 * @param {string} [tooltip]
	 * @returns {?string} The username if any link was marked up, or else `null`.
	 * @private
	 */
	static applyMarkup(userLinks, userName, className, tooltip) {
		const links = userLinks.get(userName); // Get all links related to the user
		if (!links) {
			console.error('MarkBLocked: There\'s no link for User:' + userName);
			return null;
		}

		if (tooltip) {
			tooltip = this.truncateWikilinks(tooltip).trim().replace(/\n/g, ' ');
		}

		for (const link of links) {
			link.classList.add(className);

			if (tooltip) {
				this.addTooltip(link, tooltip);
			}
		}

		return userName;
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
					},
				});
		}
	}

	/**
	 * @typedef {object} BatchObject
	 * @property {string} username
	 * @property {Record<string, any>} params
	 * @property {(res?: ApiResponse) => void} callback
	 */
	/**
	 * Sends batched API requests.
	 *
	 * When additional markup functionalities are enabled, MarkBLocked may need to send a large number
	 * of API requests. Sending too many at once can trigger a `net::ERR_INSUFFICIENT_RESOURCES` error.
	 * This private method mitigates that by dividing requests into batches of 500, processing each
	 * batch sequentially after the previous one has resolved.
	 *
	 * @param {BatchObject[]} batchArray An array of request batches to be processed.
	 * @returns {JQuery.Promise<void>} A promise that resolves when all batches have been processed.
	 * @private
	 * @requires mediawiki.api
	 */
	batchRequest(batchArray) {
		// Unflatten the array of objects to an array of arrays of objects
		const unflattened = batchArray.reduce(/** @param {BatchObject[][]} acc */ (acc, obj) => {
			const len = acc.length - 1;
			if (Array.isArray(acc[len]) && acc[len].length < 500) {
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
		 * @returns {JQuery.Promise<void>}
		 */
		const req = (batchObj) => {
			return MarkBLocked.api.get(batchObj.params, { timeout: 60 * 1000 })
				.then(batchObj.callback)
				.catch(/** @param {Record<string, any>} err */ (_, err) => {
					if (err.exception === 'abort') {
						aborted = true;
					} else {
						console.error(batchObj.username, err);
					}
				});
		};

		return (
			/**
			 * @param {number} index
			 * @returns {JQuery.Promise<void>}
			 */
			function batch(index) {
				return $.when(...unflattened[index].map(req)).then((...args) => {
					console.log('MarkBLocked batch count: ' + args.length);

					if (!aborted && unflattened[++index]) {
						const deferred = $.Deferred();

						// Throttle the next batch to avoid rate limiting (e.g., HTTP 429)
						console.log('Next batch scheduled in 10 seconds...');
						const batchTimeout = setTimeout(() => {
							MarkBLocked.abortHook.remove(hookHandler);
							deferred.resolve(batch(index));
						}, 10000);

						// If aborted before the timeout completes, cancel the delay and resolve early
						const hookHandler = () => {
							console.log('Batch aborted: request sequence cancelled');
							clearTimeout(batchTimeout);
							MarkBLocked.abortHook.remove(hookHandler);
							deferred.resolve();
						};
						MarkBLocked.abortHook.add(hookHandler);

						return deferred.promise();
					}

					// No more batches or processing was aborted; resolve to complete the chain
					return $.Deferred().resolve().promise();
				});
			}
		)(0);
	}

}
/**
 * @type {mw.Api}
 */
MarkBLocked.api = Object.create(null);
/**
 * @type {mw.Api}
 */
MarkBLocked.metaApi = Object.create(null);
/**
 * @type {Record<string, Messages>}
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
MarkBLocked.abortHook = mw.hook('userjs.markblocked.aborted');

function isMetaWiki() {
	return mw.config.get('wgWikiID') === 'metawiki';
}

function nonwritePost() {
	return {
		headers: {
			'Promise-Non-Write-API-Action': '1',
		},
	};
}

/**
 * @template {object} T
 * @param {T} obj
 * @returns {Array<Extract<keyof T, string>>}
 */
function typedKeys(obj) {
	return /** @type {Array<Extract<keyof T, string>>} */ (Object.keys(obj));
}

/**
 * @param {unknown} value
 * @returns {value is string[]}
 */
function isStringArray(value) {
	return Array.isArray(value) && value.every(el => typeof el === 'string');
}

/**
 * @param {number} days
 * @returns {number}
 */
function daysInSeconds(days) {
	return days * 24 * 60 * 60;
}

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

/**
 * @typedef {import('./window/MarkBLocked.d.ts').ConstructorConfig} ConstructorConfig
 * @typedef {import('./window/MarkBLocked.d.ts').UserOptions} UserOptions
 * @typedef {import('./window/MarkBLocked.d.ts').Messages} Messages
 * @typedef {import('./window/MarkBLocked.d.ts').Initializer} Initializer
 * @typedef {import('./window/MarkBLocked.d.ts').CacheValidator} CacheValidator
 * @typedef {import('./window/MarkBLocked.d.ts').SpecialPageAliases} SpecialPageAliases
 * @typedef {import('./window/MarkBLocked.d.ts').LinkRegex} LinkRegex
 * @typedef {import('./window/MarkBLocked.d.ts').ApiResponse} ApiResponse
 * @typedef {import('./window/MarkBLocked.d.ts').ApiResponseQueryListBlocks} ApiResponseQueryListBlocks
 * @typedef {import('./window/MarkBLocked.d.ts').ApiResponseQueryListGlobalblocks} ApiResponseQueryListGlobalblocks
 */

return MarkBLocked;
})();
//</nowiki>