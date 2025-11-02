/***************************************************************************************************\

	Selective Rollback

	@author [[User:Dragoniez]]
	@version 5.0.6
	@see https://meta.wikimedia.org/wiki/User:Dragoniez/Selective_Rollback

	Some functionalities of this script are adapted from:
	@link https://meta.wikimedia.org/wiki/User:Hoo_man/smart_rollback.js
	@link https://en.wikipedia.org/wiki/User:DannyS712/AjaxRollback.js

\***************************************************************************************************/
// @ts-check
/* global mw, OO */
//<nowiki>
(() => {
//**************************************************************************************************

/**
 * @type {mw.Api}
 */
let api;
/**
 * Whether the user is on Recentchanges or Watchlist.
 */
const isOnRCW = ['Recentchanges', 'Watchlist'].includes(mw.config.get('wgCanonicalSpecialPageName') || '');

class SelectiveRollback {

	static async init() {
		await $.when(
			mw.loader.using(['mediawiki.api', 'mediawiki.storage', 'mediawiki.util', 'oojs-ui']),
			$.ready
		);

		// Set up variables
		api = new mw.Api(this.apiOptions());
		const cfg = this.getConfig();
		this.appendStyleTag(cfg);

		// Get localized message object
		let /** @type {Messages} */ msg;
		let langSwitch = /** @type {Languages} */ (
			// Fall back to the user's language in preferences
			(cfg.lang || mw.config.get('wgUserLanguage')).replace(/-.*$/, '')
		);
		if (langSwitch in this.i18n) {
			msg = this.i18n[langSwitch];
		} else {
			if (cfg.lang) {
				console.error(`[SR] Sorry, Selective Rollback does not support ${cfg.lang} as its interface language.`);
			}
			msg = this.i18n.en;
			langSwitch = 'en';
		}
		/** @type {'ltr' | 'rtl'} */
		const dir = langSwitch === 'ar' ? 'rtl' : 'ltr';

		// Fetch metadata for script initialization
		const meta = await this.getMetaInfo();
		this.createCachePurger(msg);

		// Stop running the script if the user doesn't have rollback rights or there're no visible rollback links
		// However, keep it running on RCW even when the no-link condition is met, since rollback links may not
		// exist at page load but can be added dynamically later through AJAX updates
		if (!meta.rights.has('rollback') || (!this.collectLinks().length && !isOnRCW)) {
			return;
		}

		// Create a SelectiveRollbackDialog instance
		const parentNode = this.getParentNode();
		const SelectiveRollbackDialog = SelectiveRollbackDialogFactory(cfg, msg, dir, meta, parentNode);
		const autocompleteSources = await this.getAutocompleteSourcesForJawiki();
		const dialog = new SelectiveRollbackDialog({
			$element: $('<div>').attr({ dir }),
			classes: ['sr-dialog'],
			size: 'large'
		}, autocompleteSources);
		SelectiveRollbackDialog.windowManager.addWindows([dialog]);
		const sr = new this(dialog, cfg, msg, parentNode);
		dialog.bindSR(sr);

		// Set up a hook for page content updates
		const hook = mw.hook('wikipage.content');
		let /** @type {NodeJS.Timeout} */ hookTimeout;
		const hookCallback = () => {
			clearTimeout(hookTimeout);
			hookTimeout = setTimeout(() => {
				if (dialog.isDestroyed()) {
					hook.remove(hookCallback);
				} else {
					sr.initializeLinks();
				}
			}, 100);
		};
		hook.add(hookCallback);
	}

	/**
	 * Collects visible rollback links as a jQuery object.
	 * @returns {JQuery<HTMLSpanElement>}
	 */
	static collectLinks() {
		return $('.mw-rollback-link:visible');
	}

	/**
	 * @returns {ParentNode}
	 * @throws {Error} If the parent node cannot be defined
	 * @private
	 */
	static getParentNode() {
		const spName = mw.config.get('wgCanonicalSpecialPageName');
		let /** @type {ParentNode} */ parentNode;
		if (isOnRCW) {
			parentNode = null;
		} else if (
			mw.config.get('wgAction') === 'history' ||
			(spName && ['Contributions', 'IPContributions', 'GlobalContributions'].includes(spName))
		) {
			parentNode = 'li';
		} else if (typeof mw.config.get('wgDiffNewId') === 'number') {
			parentNode = '#mw-diff-ntitle2';
		} else if (document.querySelector('.mw-changeslist-line')) {
			// SR checkboxes shouldn't be generated when Special:Recentchanges is transcluded
			parentNode = false;
		} else {
			const date = new Date().toJSON().replace(/T[^T]+$/, '').replace(/-/g, '');
			const err = '[SR] Parent node could not be defined.';
			mw.notify(
				$('<div>').append(
					err + ' This is likely a bug of Selective Rollback. (',
					$('<a>')
						.prop({
							href: '//meta.wikimedia.org' + mw.util.getUrl('User_talk:Dragoniez/Selective_Rollback', {
									action: 'edit',
									section: 'new',
									preloadtitle: `Error report (${date})`,
									preload: 'User:Dragoniez/preload'
								}) +
								'&preloadparams%5B%5D=a%20parentNode%20error' +
								'&preloadparams%5B%5D=' + encodeURIComponent(location.href),
							target: '_blank'
						})
						.text('Report the error'),
					')'
				),
				{ type: 'error', autoHideSeconds: 'long' }
			);
			throw new Error(err);
		}
		return parentNode;
	}

	/**
	 * Generates options for the `mw.Api` constructor.
	 * @param {boolean} [readOnlyPost] Whether to add the `Promise-Non-Write-API-Action` header.
	 * (Default: `false`)
	 * @returns {mw.Api.Options}
	 */
	static apiOptions(readOnlyPost = false) {
		/** @type {mw.Api.Options} */
		const options = {
			ajax: {
				headers: {
					'Api-User-Agent': 'Selective_Rollback/5.0.6 (https://meta.wikimedia.org/wiki/User:Dragoniez/Selective_Rollback.js)'
				}
			},
			parameters: {
				action: 'query',
				format: 'json',
				formatversion: '2'
			}
		};
		if (readOnlyPost) {
			// @ts-expect-error
			options.ajax.headers['Promise-Non-Write-API-Action'] = true;
		}
		return options;
	}

	/**
	 * Retrieves confugiration settings merged with the user config.
	 * @returns {SelectiveRollbackConfig}
	 * @private
	 */
	static getConfig() {
		/** @type {SelectiveRollbackConfig} */
		const cfg = {
			lang: '',
			editSummaries: {},
			showKeys: false,
			specialExpressions: {},
			markBot: true,
			watchPage: false,
			watchExpiry: 'indefinite',
			confirm: 'never',
			mobileConfirm: 'always',
			checkboxLabelColor: 'orange'
		};

		// Sanitize and merge user config
		/**
		 * Checks whether a config value is of the expected type.
		 * @type {IsOfType}
		 */
		const isOfType = (expectedType, value, key) => {
			const valType = value === null ? 'null' : typeof value;
			if (valType !== expectedType) {
				console.error(`[SR] TypeError: ${expectedType} expected for "${key}", ${valType} given`);
				return false;
			} else {
				return true;
			}
		};
		/**
		 * @param {string} key
		 * @param {unknown} value
		 */
		const errKeyVal = (key, value) => {
			console.error(`[SR] Invalid config value for "${key}"`, value);
		};

		const userCfg = window.selectiveRollbackConfig;
		if (typeof userCfg === 'object' && userCfg !== null) {
			const confirmVals = new Set(['never', 'always', 'RCW', 'nonRCW']);
			for (let [key, val] of Object.entries(userCfg)) {
				key = clean(key);

				// Strict type check
				if (val === null || val === undefined) {
					errKeyVal(key, val);
					continue;
				}
				switch (key) {
					case 'lang':
					case 'watchExpiry':
					case 'checkboxLabelColor':
						if (!isOfType('string', val, key)) continue;
						break;
					case 'confirm':
					case 'mobileConfirm':
						if (!isOfType('string', val, key)) continue;
						if (!confirmVals.has(/** @type {any} */ (val))) {
							errKeyVal(key, val);
							continue;
						}
						break;
					case 'editSummaries':
					case 'specialExpressions':
						if (!isOfType('object', val, key)) continue;
						break;
					case 'showKeys':
					case 'markBot':
					case 'watchPage':
						if (!isOfType('boolean', val, key)) continue;
						break;
					default:
						console.error(`[SR] Invalid config key: ${key}`);
						continue;
				}

				if (key === 'watchExpiry') { // Some typo fix
					let v = clean(String(val));
					let m;
					if (/^\s*(in|never)/.test(v)) {
						v = 'indefinite';
					} else if ((m = /^\s*1\s*(week|month|year)/.exec(v))) {
						v = '1 ' + m[1];
					} else if ((m = /^\s*([36])\s*month/.exec(v))) {
						v = m[1] + ' months';
					} else {
						errKeyVal(key, val);
						continue;
					}
					// @ts-expect-error
					userCfg[key] = v;
				}

				// @ts-expect-error
				cfg[key] = userCfg[key];
			}
		}

		return cfg;
	}

	/**
	 * Appends to the document head a \<style> tag for SR.
	 * @param {SelectiveRollbackConfig} cfg
	 * @returns {void}
	 * @private
	 */
	static appendStyleTag(cfg) {
		const style = document.createElement('style');
		style.textContent =
			'.sr-rollback {' +
				'display: inline-block;' +
				'margin: 0 0.5em;' +
			'}' +
			'.sr-checkbox-wrapper {' +
				'display: inline-block;' +
			'}' +
			'.sr-checkbox {' +
				'margin: 0 4px 2px;' +
				'vertical-align: middle;' +
			'}' +
			'.sr-rollback-label {' +
				'font-weight: bold;' +
				`color: ${cfg.checkboxLabelColor};` +
			'}' +
			'.sr-dialog .oo-ui-inline-help code {' +
				'color: inherit;' +
			'}' +
			'#sr-summarypreview {' +
				'background-color: var(--background-color-neutral-subtle, #f8f9fa);' +
				'color: var(--color-emphasized, #000);' +
				'margin: 0;' +
				'border: 1px solid var(--border-color-base, #a2a9b1);' +
				'border-radius: 2px;' +
				'padding: 5px 8px;' +
				'font-size: inherit;' +
				'font-family: inherit;' +
				'line-height: 1.42857143em;' +
				'width: 100%;' +
				'box-sizing: border-box;' +
				'vertical-align: middle;' +
				'max-width: 50em;' +
				'min-height: 2.2857143em;' +
			'}' +
			'.sr-rollback-link-success {' +
				'background-color: lightgreen;' +
			'}' +
			'@media screen {' +
				'html.skin-theme-clientpref-night .sr-rollback-link-success {' +
					'background-color: #099979;' +
				'}' +
			'}' +
			'@media screen and (prefers-color-scheme: dark) {' +
				'html.skin-theme-clientpref-os .sr-rollback-link-success {' +
					'background-color: #099979;' +
				'}' +
			'}' +
			'.sr-rollback-link-fail {' +
				'background-color: lightpink;' +
			'}' +
			'@media screen {' +
				'html.skin-theme-clientpref-night .sr-rollback-link-fail {' +
					'background-color: #f54739;' +
				'}' +
			'}' +
			'@media screen and (prefers-color-scheme: dark) {' +
				'html.skin-theme-clientpref-os .sr-rollback-link-fail {' +
					'background-color: #f54739;' +
				'}' +
			'}' +
			'';
		document.head.appendChild(style);
	}

	/**
	 * Retrieves the default rollback summary and the current user's user rights on the local wiki.
	 * @returns {Promise<MetaInfo>}
	 * @private
	 */
	static async getMetaInfo() {
		const params = Object.create(null);
		params.meta = [];

		let summary = mw.storage.get(this.storageKeys.summary);
		if (typeof summary !== 'string') {
			params.meta.push('allmessages');
			Object.assign(params, {
				ammessages: 'revertpage',
				amlang: mw.config.get('wgContentLanguage') // the language of the wiki
			});
		}

		/** @type {string[] | null | false} */
		let rights = mw.storage.getObject(this.storageKeys.rights);
		if (!Array.isArray(rights) || !rights.every(v => typeof v === 'string')) {
			params.meta.push('userinfo');
			params.uiprop = 'rights';
		}

		/**
		 * Extracts the fallback ("other") form from a `'{{PLURAL:$7|...}}'` expression.
		 * Only the last non-numeric form is used.
		 * @param {string} str
		 * @returns {string}
		 */
		const parsePluralOther = (str) => {
			return str.replace(/\{\{\s*PLURAL:\s*\$7\s*\|([^}]+?)\}\}/gi, (match, forms) => {
				const formList = /** @type {string} */ (forms).split('|').map((f) => f.trim());
				for (let i = formList.length - 1; i >= 0; i--) {
					const form = formList[i];
					if (!/^\d+\s*=/.test(form)) {
						return form;
					}
				}
				return match;
			});
		};
		if (typeof summary === 'string' && rights) {
			return {
				summary,
				parsedsummary: parsePluralOther(summary),
				fetched: true,
				rights: new Set(rights)
			};
		}

		/** @type {ApiResponse} */
		const { query } = await api.get(params).catch((_, err) => {
			console.warn(err);
			return /** @type {ApiResponse} */ ({ query: void 0 });
		});

		const { allmessages = [], userinfo } = query || {};
		if (allmessages[0] && typeof allmessages[0].content === 'string') {
			summary = allmessages[0].content;
			mw.storage.set(this.storageKeys.summary, summary, 3 * 24 * 60 * 60); // 3 days
		}
		if (userinfo && userinfo.rights) {
			rights = userinfo.rights;
			mw.storage.setObject(this.storageKeys.rights, rights, 24 * 60 * 60); // 1 day
		}

		let fetched = false;
		if (typeof summary === 'string') {
			fetched = true;
		} else {
			summary = 'Reverted edits by [[Special:Contributions/$2|$2]] ([[User talk:$2|talk]]) to last revision by [[User:$1|$1]]';
		}
		return {
			summary,
			parsedsummary: parsePluralOther(summary),
			fetched,
			rights: rights ? new Set(rights) : new Set()
		};
	}

	/**
	 * Generates a portlet link that triggers a process of purging `mw.storage` cache.
	 * @param {Messages} msg
	 * @returns {void}
	 * @private
	 */
	static createCachePurger(msg) {
		if (!Object.values(this.storageKeys).some(key => mw.storage.get(key))) {
			// Don't generate the portlet link if no cache exists
			return;
		}
		const portlet = mw.util.addPortletLink(
			mw.config.get('skin') === 'minerva' ? 'p-personal' : 'p-cactions',
			'#',
			msg['portletlink-uncacher-label'],
			'ca-sr-uncache',
			msg['portletlink-uncacher-label'],
			void 0,
			'#ca-move'
		);
		if (!portlet) {
			return;
		}
		portlet.addEventListener('click', (e) => {
			e.preventDefault();
			for (const key of Object.values(this.storageKeys)) {
				mw.storage.remove(key);
			}
			location.reload();
		});
	}

	/**
	 * @returns {JQuery.Promise<string[]>}
	 * @private
	 */
	static getAutocompleteSourcesForJawiki() {
		const moduleName = 'ext.gadget.WpLibExtra';
		if (mw.config.get('wgWikiID') !== 'jawiki' || !new Set(mw.loader.getModuleNames()).has(moduleName)) {
			return $.Deferred().resolve([]).promise();
		}

		/** @type {string[] | false | null} */
		const cache = mw.storage.getObject(this.storageKeys.autocomplete);
		if (Array.isArray(cache) && cache.every(el => typeof el === 'string')) {
			return $.Deferred().resolve(cache).promise();
		}

		return mw.loader.using(moduleName).then((require) => {
			const /** @type {WpLibExtra} */ lib = require(moduleName);
			return $.when(lib.getVipList('wikilink'), lib.getLtaList('wikilink')).then((vipList, ltaList) => {
				const list = vipList.concat(ltaList);
				mw.storage.setObject(this.storageKeys.autocomplete, list, 24 * 60 * 60); // 1 day
				return list;
			});
		});
	}

	/**
	 * @param {InstanceType<ReturnType<typeof SelectiveRollbackDialogFactory>>} dialog
	 * @param {SelectiveRollbackConfig} cfg
	 * @param {Messages} msg
	 * @param {ParentNode} parentNode
	 */
	constructor(dialog, cfg, msg, parentNode) {
		/**
		 * @type {InstanceType<ReturnType<typeof SelectiveRollbackDialogFactory>>}
		 * @readonly
		 * @private
		 */
		this.dialog = dialog;
		/**
		 * @type {Messages}
		 * @readonly
		 * @private
		 */
		this.msg = msg;
		/**
		 * @type {ParentNode}
		 * @readonly
		 * @private
		 */
		this.parentNode = parentNode;
		/**
		 * @type {SRConfirm}
		 * @readonly
		 * @private
		 */
		this.confirmation = SelectiveRollback.regex.mobile.test(navigator && navigator.userAgent || '')
			? cfg.mobileConfirm
			: cfg.confirm;
		/**
		 * Mapping from indexes as strings to rollback links and their associated SR checkboxes.
		 *
		 * Selective Rollback assigns each rbspan a `data-sr-index` attribute, which corresponds to
		 * a key of this object. This index attribute is referred to when marking a specific SR-ized
		 * rollback link as resolved and unbind it from this instance.
		 *
		 * The actual (un)binding happens via {@link initializeLinks}, which should be called each time
		 * when the `wikipage_content` hook is fired.
		 *
		 * @type {RollbackLinkMap}
		 */
		this.links = Object.create(null);
	}

	initializeLinks() {
		// Remove detached rollback links
		for (const [index, { rbspan }] of Object.entries(this.links)) {
			if (!rbspan.isConnected) {
				delete this.links[index];
			}
		}

		// Collect all rollback links again and SR-ize those that have not yet been SR-ized
		const clss = 'sr-rollback-link';
		SelectiveRollback.collectLinks().each((_, rbspan) => {
			// Set up data for the wrapper span
			const $rbspan = $(rbspan);
			if ($rbspan.hasClass(clss)) {
				return;
			}
			$rbspan.addClass(clss).attr('data-sr-index', (++SelectiveRollback.index));

			// Add an SR checkbox
			let /** @type {?SRBox} */ box = null;
			if (this.parentNode && (box = SelectiveRollback.createCheckbox())) {
				$rbspan.closest(this.parentNode).append(box.$wrapper);
			}
			this.links[SelectiveRollback.index] = { rbspan, box };

			// Bind AJAX rollback as a click event
			$rbspan.off('click').on('click', (e) => this.clickEvent(e, $rbspan, box));
		});
	}

	/**
	 * Creates an SR checkbox.
	 * @returns {SRBox}
	 */
	static createCheckbox() {
		const /** @type {JQuery<HTMLSpanElement>} */ $wrapper = $('<span>');
		const /** @type {JQuery<HTMLLabelElement>} */ $label = $('<label>');
		const /** @type {JQuery<HTMLInputElement>} */ $checkbox = $('<input>');
		$wrapper
			.addClass('sr-rollback')
			.append(
				$('<b>').text('['),
				$label
					.addClass('sr-checkbox-wrapper')
					.append(
						$checkbox
							.prop({ type: 'checkbox' })
							.addClass('sr-checkbox'),
						$('<span>')
							.text('SR')
							.addClass('sr-rollback-label')
					),
				$('<b>').html('&nbsp;]')
			);
		return { $wrapper, $label, $checkbox };
	}

	/**
	 * Selects all the SR checkboxes.
	 * @returns {this}
	 */
	selectAll() {
		let count = 0;
		for (const { box } of Object.values(this.links)) {
			if (box) {
				box.$checkbox.prop('checked', true);
				count++;
			}
		}
		if (!count) {
			mw.notify(this.msg['msg-linksresolved'], { type: 'warn' });
		}
		return this;
	}

	/**
	 * The click event callback for rollback links that internally calls {@link ajaxRollback}.
	 * @param {JQuery.ClickEvent<HTMLSpanElement, undefined, HTMLSpanElement, HTMLSpanElement>} e
	 * @param {JQuery<HTMLSpanElement>} $rbspan
	 * @param {?SRBox} box
	 * @returns {Promise<void>}
	 * @private
	 */
	async clickEvent(e, $rbspan, box) {
		e.preventDefault();
		if (e.ctrlKey) {
			// If CTRL key is pressed down, just open the dialog, not executing rollback
			this.dialog.open();
			return;
		} else if (
			// Confirm rollback per config
			!e.shiftKey && (
				this.confirmation === 'always' ||
				isOnRCW && this.confirmation === 'RCW' ||
				!isOnRCW && this.confirmation === 'nonRCW'
			)
		) {
			// Visualize which rollback link has been clicked
			$rbspan.css({ border: '1px dotted var(--color-emphasized, #000)' });
			const confirmed = await OO.ui.confirm(this.msg['msg-confirm'], { size: 'medium' });
			$rbspan.css({ border: '' });
			if (!confirmed) return;
		}
		this.ajaxRollback($rbspan[0], box);
	}

	/**
	 * Performs AJAX rollback on a rollback link.
	 * @param {HTMLSpanElement} rbspan The wrapper span of the rollback link.
	 * @param {?SRBox} box The SR checkbox object. (**Note: this method removes the box unconditionally.**)
	 * @param {RollbackParams} [params] Parameters for the rollback API. Retrieved from the dialog if omitted.
	 * @returns {Promise<boolean>} Whether the rollback succeeded.
	 */
	async ajaxRollback(rbspan, box, params) {
		if (box) box.$wrapper.remove();
		params = params || this.dialog.getParams();

		// Collect required parameters to action=rollback from the rollback link internal to the rbspan
		const rblink = rbspan.querySelector('a');
		const href = rblink && rblink.href;
		let /** @type {?string} */ title = null;
		let /** @type {?string} */ user = null;
		if (href) {
			title = mw.util.getParamValue('title', href);
			if (!title) {
				const articleMatch = SelectiveRollback.regex.article.exec(href);
				if (articleMatch && articleMatch[1]) {
					try {
						title = decodeURIComponent(articleMatch[1]);
					} catch (_) { /**/ }
				}
			}
			user = mw.util.getParamValue('from', href);
		}

		let /** @type {?[string, string]} */ error = null;
		if (!rblink) {
			error = [
				'[SR] Error: Anchor tag is missing in the rollback link for some reason.',
				'linkmissing'
			];
		} else if (!href) {
			error = [
				'[SR] Error: The rollback link lacks an href attribute.',
				'hrefmissing'
			];
		} else if (!title) {
			error = [
				'[SR] Error: The rollback link does not have a "title" query parameter.',
				'titlemissing'
			];
		} else if (!user) {
			error = [
				'[SR] Error: The rollback link does not have a "from" query parameter.',
				'usermissing'
			];
		}
		if (error) {
			console.error(error[0], rbspan);
			this.processRollbackLink(rbspan, error[1]);
			return false;
		}

		// Perform AJAX rollback
		this.processRollbackLink(rbspan);
		const safeTitle = /** @type {string} */ (title);
		const safeUser = /** @type {string} */ (user);
		const code = await SelectiveRollback.doRollback(safeTitle, safeUser, params);
		this.processRollbackLink(rbspan, code);
		return code === true;
	}

	/**
	 * Pre- or post-processes the given rollback link for an {@link ajaxRollback} call.
	 *
	 * This method:
	 * * Replaces the innerHTML of the rollback link with a spinner icon for a pre-process,
	 *   or with the result of a rollback for a post-process.
	 * * Removes click event handlers on the rollback link once called.
	 * * Unbinds the rollback link from the instance for a post-process.
	 *
	 * @param {HTMLSpanElement} rbspan
	 * @param {string | boolean} [result]
	 * * `string` - The error code on failure.
	 * * `true` - On success.
	 * * `false` (default) - For a spinner icon.
	 * @returns {void}
	 * @private
	 */
	processRollbackLink(rbspan, result = false) {
		const $rbspan = $(rbspan);
		$rbspan.off('click');
		if (result === false) {
			// Replace the innerHTML of the rbspan with a spinner icon
			$rbspan
				.empty()
				.append(
					$('<img>')
						.prop({ src: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif' })
						.css({
							verticalAlign: 'middle',
							height: '1em',
							border: 0
						})
				);
		} else {
			// Replace the innerHTML of the rbspan with the rollback result
			const isFailure = typeof result === 'string';
			$rbspan
				.empty()
				.append(
					document.createTextNode('['),
					$('<span>')
						.text(isFailure ? `${this.msg['rbstatus-failed']} (${result})` : this.msg['rbstatus-reverted'])
						.addClass(isFailure ? 'sr-rollback-link-fail' : 'sr-rollback-link-success'),
					document.createTextNode(']')
				)
				.removeClass('mw-rollback-link')
				.addClass('sr-rollback-link-resolved');

			// Unbind the rbspan from the class
			const index = /** @type {string} */ ($rbspan.attr('data-sr-index'));
			delete this.links[index];

			// If no rbspan is bound to the instance any longer, remove the dialog and the portlet link
			// unless the user is on RCW, where new rollback links may be generated on page content updates
			if (!isOnRCW && $.isEmptyObject(this.links)) {
				this.dialog.destroy();
			}
		}
	}

	/**
	 * Issues an `action=rollback` HTTP request.
	 * @param {string} title
	 * @param {string} user
	 * @param {RollbackParams} params
	 * @returns {JQuery.Promise<string | true>} `true` on success, or an error code as a string.
	 */
	static doRollback(title, user, params) {
		return api.rollback(title, user, /** @type {any} */ (params)).then(() => true).catch((code, err) => {
			console.warn(err);
			return code;
		});
	}

	/**
	 * Performs selective rollback on the given links.
	 * @param {RollbackLink[]} selectedLinks
	 * @returns {Promise<void>}
	 */
	async selectiveRollback(selectedLinks) {
		const params = this.dialog.getParams();
		this.dialog.close();
		const batches = selectedLinks.map(({ box, rbspan }) => {
			return this.ajaxRollback(rbspan, box, params);
		});

		const results = await Promise.all(batches);
		let success = 0, fail = 0;
		for (const bool of results) {
			bool ? success++ : fail++;
		}
		mw.notify(
			$('<div>').append(
				`Selective Rollback (${success + fail})`,
				$('<ul>').append(
					$('<li>').text(`${this.msg['rbstatus-notify-success']}: ${success}`),
					$('<li>').text(`${this.msg['rbstatus-notify-failure']}: ${fail}`)
				)
			),
			{ type: 'success' }
		);
	}

	/**
	 * Retrieves selected RollbackLink objects as an array.
	 * @returns {RollbackLink[]}
	 */
	getSelected() {
		return Object.values(this.links).reduce((acc, obj) => {
			if (obj.box && obj.box.$checkbox.is(':checked')) {
				acc.push(obj);
			}
			return acc;
		}, /** @type {RollbackLink[]} */ ([]));
	}

}
/** @type {Record<Languages, Messages>} */
SelectiveRollback.i18n = {
	ja: {
		'scriptname': 'Selective Rollback', // Added in v5.0.1
		'portletlink-main-tooltip': 'Selective Rollbackのダイアログを開く',
		'portletlink-uncacher-label': 'Selective Rollbackのキャッシュを破棄', // v4.4.3
		'summary-label-primary': '編集要約',
		'summary-option-default': '既定の編集要約',
		'summary-option-custom': 'カスタム',
		'summary-label-custom': 'カスタム編集要約',
		'summary-help-$0': '<code>$0</code>は既定の編集要約に置換されます。',
		'summary-help-$0-error': '<code>$0</code>は<b>英語の</b>既定編集要約に置換されます。',
		'summary-help-specialexpressions': '置換表現', // Deprecated since v5.0.0
		'summary-label-preview': '要約プレビュー', // v4.0.0
		'summary-help-preview': '<code>{{PLURAL:$7}}</code>は置換されます。', // Updated in v5.0.0
		'markbot-label': 'ボット編集として巻き戻し',
		'watchlist-label': '対象ページをウォッチリストに追加',
		'watchlist-expiry-label': '期間', // Deprecated since v5.0.0
		'watchlist-expiry-indefinite': '無期限',
		'watchlist-expiry-1week': '1週間',
		'watchlist-expiry-1month': '1か月',
		'watchlist-expiry-3months': '3か月',
		'watchlist-expiry-6months': '6か月',
		'watchlist-expiry-1year': '1年',
		'button-rollback': '巻き戻し', // Updated in v5.0.0
		'button-documentation': '解説', // Added in v5.0.0
		'button-selectall': '全選択', // Updated in v5.0.0
		'button-close': '閉じる', // Deprecated since v5.0.0
		'msg-nonechecked': 'チェックボックスがチェックされていません。',
		'msg-linksresolved': 'このページの巻き戻しリンクは全て解消済みです。',
		'msg-confirm': '巻き戻しを実行しますか？',
		'rbstatus-reverted': '巻き戻し済',
		'rbstatus-failed': '巻き戻し失敗',
		'rbstatus-notify-success': '成功', // v4.0.0
		'rbstatus-notify-failure': '失敗' // v4.0.0
	},
	en: {
		'scriptname': 'Selective Rollback', // Added in v5.0.1
		'portletlink-main-tooltip': 'Open the Selective Rollback dialog',
		'portletlink-uncacher-label': 'Purge cache for Selective Rollback', // v4.4.3
		'summary-label-primary': 'Edit summary',
		'summary-option-default': 'Default edit summary',
		'summary-option-custom': 'Custom',
		'summary-label-custom': 'Custom edit summary',
		'summary-help-$0': '<code>$0</code> will be replaced with the default rollback summary.',
		'summary-help-$0-error': '<code>$0</code> will be replaced with the default rollback summary <b>in English</b>.',
		'summary-help-specialexpressions': 'Replacement expressions', // Deprecated since v5.0.0
		'summary-label-preview': 'Summary preview', // v4.0.0
		'summary-help-preview': '<code>{{PLURAL:$7}}</code> will be replaced.', // Updated in v5.0.0
		'markbot-label': 'Mark rollbacks as bot edits',
		'watchlist-label': 'Add the target pages to watchlist',
		'watchlist-expiry-label': 'Expiry', // Deprecated since v5.0.0
		'watchlist-expiry-indefinite': 'Indefinite',
		'watchlist-expiry-1week': '1 week',
		'watchlist-expiry-1month': '1 month',
		'watchlist-expiry-3months': '3 months',
		'watchlist-expiry-6months': '6 months',
		'watchlist-expiry-1year': '1 year',
		'button-rollback': 'Rollback', // Updated in v5.0.0
		'button-documentation': 'Docs', // Added in v5.0.0
		'button-selectall': 'Select all', // Updated in v5.0.0
		'button-close': 'Close', // Deprecated since v5.0.0
		'msg-nonechecked': 'No checkbox is checked.',
		'msg-linksresolved': 'Rollback links on this page have all been resolved.',
		'msg-confirm': 'Are you sure you want to rollback this edit?',
		'rbstatus-reverted': 'reverted',
		'rbstatus-failed': 'rollback failed',
		'rbstatus-notify-success': 'Success', // v4.0.0
		'rbstatus-notify-failure': 'Failure' // v4.0.0
	},
	/**
	 * @author [[User:User xyBW847toYwJSYpc]] (formerly known as PAVLOV)
	 * @since 1.2.3
	 */
	zh: {
		'scriptname': 'Selective Rollback', // Added in v5.0.1
		'portletlink-main-tooltip': '打开Selective Rollback日志',
		'portletlink-uncacher-label': '清除Selective Rollback缓存', // v4.4.3
		'summary-label-primary': '编辑摘要',
		'summary-option-default': '默认编辑摘要',
		'summary-option-custom': '自定义',
		'summary-label-custom': '自定义编辑摘要',
		'summary-help-$0': '<code>$0</code>将会被默认编辑摘要替代。',
		'summary-help-$0-error': '<code>$0</code>将会被默认编辑摘要为<b>英文</b>替代。',
		'summary-help-specialexpressions': '替换表达', // Deprecated since v5.0.0
		'summary-label-preview': '编辑摘要的预览', // v4.0.0
		'summary-help-preview': '<code>{{PLURAL:$7}}</code>将被替换。', // Updated in v5.0.0
		'markbot-label': '标记为机器人编辑',
		'watchlist-label': '将目标页面加入监视页面',
		'watchlist-expiry-label': '时间', // Deprecated since v5.0.0
		'watchlist-expiry-indefinite': '不限期',
		'watchlist-expiry-1week': '1周',
		'watchlist-expiry-1month': '1个月',
		'watchlist-expiry-3months': '3个月',
		'watchlist-expiry-6months': '6个月',
		'watchlist-expiry-1year': '1年',
		'button-rollback': '回退', // Updated in v5.0.0
		'button-documentation': '文档', // Added in v5.0.0
		'button-selectall': '全选', // Updated in v5.0.0
		'button-close': '关闭', // Deprecated since v5.0.0
		'msg-nonechecked': '未选择任何勾选框。',
		'msg-linksresolved': '与该页面相关的回退全部完成。',
		'msg-confirm': '您确定要回退该编辑吗?',
		'rbstatus-reverted': '已回退',
		'rbstatus-failed': '回退失败',
		'rbstatus-notify-success': '成功', // v4.0.0
		'rbstatus-notify-failure': '失败' // v4.0.0
	},
	/**
	 * @author [[User:Codename Noreste]]
	 * @since 3.2.0
	 */
	es: {
		'scriptname': 'Selective Rollback', // Added in v5.0.1
		'portletlink-main-tooltip': 'Abrir el cuadro de diálogo para Selective Rollback',
		'portletlink-uncacher-label': 'Vaciar caché de Selective Rollback', // v4.4.3
		'summary-label-primary': 'Resumen de edición',
		'summary-option-default': 'Resumen de edición predeterminado',
		'summary-option-custom': 'Personalizado',
		'summary-label-custom': 'Resumen de edición personalizada',
		'summary-help-$0': '<code>$0</code> será reemplazado con el resumen de edición predeterminado.',
		'summary-help-$0-error': '<code>$0</code> será reemplazado con él resumen de edición predeterminado <b>en inglés</b>.',
		'summary-help-specialexpressions': 'Expresiones de reemplazo', // Deprecated since v5.0.0
		'summary-label-preview': 'Vista previa del resumen', // v4.0.0
		'summary-help-preview': '<code>{{PLURAL:$7}}</code> será reemplazado.', // Updated in v5.0.0
		'markbot-label': 'Marcar las reversiones como ediciones del bot',
		'watchlist-label': 'Añadir las páginas de destino a la lista de seguimiento',
		'watchlist-expiry-label': 'Expiración', // Deprecated since v5.0.0
		'watchlist-expiry-indefinite': 'Siempre',
		'watchlist-expiry-1week': '1 semana',
		'watchlist-expiry-1month': '1 mes',
		'watchlist-expiry-3months': '3 meses',
		'watchlist-expiry-6months': '6 meses',
		'watchlist-expiry-1year': '1 años',
		'button-rollback': 'Revertir', // Updated in v5.0.0
		'button-documentation': 'Documentación', // Added in v5.0.0
		'button-selectall': 'Seleccionar todo', // Updated in v5.0.0
		'button-close': 'Cerrar', // Deprecated since v5.0.0
		'msg-nonechecked': 'No hay ninguna casilla de verificación marcada.',
		'msg-linksresolved': 'Los enlaces de reversión en esta página se han resuelto todos.',
		'msg-confirm': '¿Estás seguro de que quieres revertir esta edición?',
		'rbstatus-reverted': 'revertido',
		'rbstatus-failed': 'la reversión falló',
		'rbstatus-notify-success': 'Éxito', // v4.0.0
		'rbstatus-notify-failure': 'Falla' // v4.0.0
	},
	/**
	 * @author [[User:NGC 54]]
	 * @since 3.3.0
	 */
	ro: {
		'scriptname': 'Selective Rollback', // Added in v5.0.1
		'portletlink-main-tooltip': 'Deschide dialogul Selective Rollback',
		'portletlink-uncacher-label': 'Șterge memoria cache pentru Selective Rollback', // v4.4.3
		'summary-label-primary': 'Descrierea modificării',
		'summary-option-default': 'Descrierea implicită a modificării',
		'summary-option-custom': 'Personalizat',
		'summary-label-custom': 'Descriere personalizată a modificării',
		'summary-help-$0': '<code>$0</code> va fi înlocuit cu descrierea implicită a revenirii.',
		'summary-help-$0-error': '<code>$0</code> va fi înlocuit cu descrierea implicită a revenirii <b>în engleză</b>.',
		'summary-help-specialexpressions': 'Expresii de înlocuire', // Deprecated since v5.0.0
		'summary-label-preview': 'Previzualizare descriere', // v4.0.0
		'summary-help-preview': '<code>{{PLURAL:$7}}</code> va fi înlocuit.', // Updated in v5.0.0
		'markbot-label': 'Marchează revenirile drept modificări făcute de robot',
		'watchlist-label': 'Adaugă paginile țintă la pagini urmărite',
		'watchlist-expiry-label': 'Expiră', // Deprecated since v5.0.0
		'watchlist-expiry-indefinite': 'Nelimitat',
		'watchlist-expiry-1week': '1 săptămână',
		'watchlist-expiry-1month': '1 lună',
		'watchlist-expiry-3months': '3 luni',
		'watchlist-expiry-6months': '6 luni',
		'watchlist-expiry-1year': '1 an',
		'button-rollback': 'Revino', // Updated in v5.0.0
		'button-documentation': 'Documentație', // Added in v5.0.0
		'button-selectall': 'Selectează tot', // Updated in v5.0.0
		'button-close': 'Închide', // Deprecated since v5.0.0
		'msg-nonechecked': 'Nu este bifată nicio căsuță bifabilă.',
		'msg-linksresolved': 'Toate legăturile de revenire de pe această pagină au fost utilizate.',
		'msg-confirm': 'Ești sigur(ă) că vrei să revii asupra acestei modificări?',
		'rbstatus-reverted': 'revenit',
		'rbstatus-failed': 'revenire eșuată',
		'rbstatus-notify-success': 'Succes', // v4.0.0
		'rbstatus-notify-failure': 'Eșec' // v4.0.0
	},
	/**
	 * @author [[User:Hide on Rosé]]
	 * @since 4.1.0
	 */
	vi: {
		'scriptname': 'Selective Rollback', // Added in v5.0.1
		'portletlink-main-tooltip': 'Mở hộp thoại Selective Rollback',
		'portletlink-uncacher-label': 'Xóa bộ nhớ đệm Selective Rollback', // v4.4.3
		'summary-label-primary': 'Tóm lược sửa đổi',
		'summary-option-default': 'Tóm lược sửa đổi mặc định',
		'summary-option-custom': 'Tuỳ chỉnh',
		'summary-label-custom': 'Tóm lược tuỳ chỉnh',
		'summary-help-$0': '<code>$0</code> sẽ được thay bằng tóm lược sửa đổi mặc định.',
		'summary-help-$0-error': '<code>$0</code> sẽ được thay bằng tóm lược sửa đổi mặc định <b>trong tiếng Anh</b>.',
		'summary-help-specialexpressions': 'Thay thế biểu thức', // Deprecated since v5.0.0
		'summary-label-preview': 'Xem trước tóm lược', // v4.0.0
		'summary-help-preview': '<code>{{PLURAL:$7}}</code> sẽ được thay thế.', // Updated in v5.0.0
		'markbot-label': 'Đánh dấu là sửa đổi bot',
		'watchlist-label': 'Thêm trang mục tiêu vào danh sách theo dõi',
		'watchlist-expiry-label': 'Thời hạn', // Deprecated since v5.0.0
		'watchlist-expiry-indefinite': 'Vô hạn',
		'watchlist-expiry-1week': '1 tuần',
		'watchlist-expiry-1month': '1 tháng',
		'watchlist-expiry-3months': '3 tháng',
		'watchlist-expiry-6months': '6 tháng',
		'watchlist-expiry-1year': '1 năm',
		'button-rollback': 'Lùi sửa', // Updated in v5.0.0
		'button-documentation': 'Tài liệu', // Added in v5.0.0
		'button-selectall': 'Chọn tất cả', // Updated in v5.0.0
		'button-close': 'Đóng', // Deprecated since v5.0.0
		'msg-nonechecked': 'Chưa chọn sửa đổi.',
		'msg-linksresolved': 'Đã xử lý tất cả liên kết lùi sửa.',
		'msg-confirm': 'Bạn có muốn lùi sửa sửa đổi này không?',
		'rbstatus-reverted': 'đã lùi sửa',
		'rbstatus-failed': 'lùi lại không thành công',
		'rbstatus-notify-success': 'Thành công', // v4.0.0
		'rbstatus-notify-failure': 'Không thành công' // v4.0.0
	},
	/**
	 * @author [[User:Gerges]]
	 * @since 5.0.1
	 */
	ar: {
		'scriptname': 'للتراجع الانتقائي', // Added in v5.0.1
		'portletlink-main-tooltip': 'فتح نافذة التراجع الانتقائي',
		'portletlink-uncacher-label': 'تطهير ذاكرة التخزين المؤقت للتراجع الانتقائي', // v4.4.3
		'summary-label-primary': 'ملخص التعديل',
		'summary-option-default': 'ملخص التعديل الافتراضي',
		'summary-option-custom': 'مخصص',
		'summary-label-custom': 'ملخص تعديل مخصص',
		'summary-help-$0': '<code>$0</code> سيتم استبداله بملخص التراجع الافتراضي.',
		'summary-help-$0-error': '<code>$0</code> سيتم استبداله بملخص التراجع الافتراضي <b>باللغة الإنجليزية</b>.',
		'summary-help-specialexpressions': 'عبارات الاستبدال', // Deprecated since v5.0.0
		'summary-label-preview': 'معاينة الملخص', // v4.0.0
		'summary-help-preview': 'سيتم استبدال الكلمات السحرية (مثل <code>{{PLURAL:$7}}</code>).', // Updated in v5.0.0
		'markbot-label': 'تمييز التراجعات كتحريرات بوت',
		'watchlist-label': 'إضافة الصفحات المستهدفة إلى قائمة المراقبة',
		'watchlist-expiry-label': 'مدة الصلاحية', // Deprecated since v5.0.0
		'watchlist-expiry-indefinite': 'غير محددة',
		'watchlist-expiry-1week': 'أسبوع واحد',
		'watchlist-expiry-1month': 'شهر واحد',
		'watchlist-expiry-3months': '3 أشهر',
		'watchlist-expiry-6months': '6 أشهر',
		'watchlist-expiry-1year': 'سنة واحدة',
		'button-rollback': 'تراجع عن العناصر المحددة', // Updated in v5.0.0
		'button-documentation': 'التوثيق', // Added in v5.0.0
		'button-selectall': 'تحديد الكل', // Updated in v5.0.0
		'button-close': 'إغلاق', // Deprecated since v5.0.0
		'msg-nonechecked': 'لم يتم تحديد أي مربع اختيار.',
		'msg-linksresolved': 'تم حل جميع روابط التراجع في هذه الصفحة.',
		'msg-confirm': 'هل أنت متأكد أنك تريد التراجع عن هذا التعديل؟',
		'rbstatus-reverted': 'تم التراجع',
		'rbstatus-failed': 'فشل التراجع',
		'rbstatus-notify-success': 'تم بنجاح', // v4.0.0
		'rbstatus-notify-failure': 'فشل' // v4.0.0
	}
};
SelectiveRollback.regex = {
	/** Adapted from {@link https://github.com/wikimedia/mediawiki-extensions-MobileDetect/blob/master/src/Hooks.php}. */
	mobile: new RegExp(
		// iPod/iPhone
		'ipod|iphone|' +
		// Android
		'android|' +
		// Opera Mini/Mobile
		'opera mini|' +
		// Blackberry
		'blackberry|' +
		// Palm OS
		'pre/|palm os|palm|hiptop|avantgo|plucker|xiino|blazer|elaine|' +
		// Windows Mobile
		'iris|3g_t|windows ce|opera mobi|windows ce; smartphone;|windows ce; iemobile|' +
		// Other generic terms
		'mini 9.5|vx1000|lge|m800|e860|u940|ux840|compal|wireless|mobi|ahong|lg380|lgku|lgu900|lg210|lg47|lg920|lg840|lg370|sam-r|mg50|s55|g83|t66|vx400|mk99|d615|d763|el370|sl900|mp500|samu3|samu4|vx10|xda_|samu5|samu6|samu7|samu9|a615|b832|m881|s920|n210|s700|c-810|_h797|mob-x|sk16d|848b|mowser|s580|r800|471x|v120|rim8|c500foma:|160x|x160|480x|x640|t503|w839|i250|sprint|w398samr810|m5252|c7100|mt126|x225|s5330|s820|htil-g1|fly v71|s302|-x113|novarra|k610i|-three|8325rc|8352rc|sanyo|vx54|c888|nx250|n120|mtk|c5588|s710|t880|c5005|i;458x|p404i|s210|c5100|teleca|s940|c500|s590|foma|samsu|vx8|vx9|a1000|_mms|myx|a700|gu1100|bc831|e300|ems100|me701|me702m-three|sd588|s800|8325rc|ac831|mw200|brew|d88|htc/|htc_touch|355x|m50|km100|d736|p-9521|telco|sl74|ktouch|m4u/|me702|8325rc|kddi|phone|lg|sonyericsson|samsung|240x|x320|vx10|nokia|sony cmd|motorola|up.browser|up.link|mmp|symbian|smartphone|midp|wap|vodafone|o2|pocket|kindle|mobile|psp|treo|' +
		// First 4 letters
		'^(1207|3gso|4thp|501i|502i|503i|504i|505i|506i|6310|6590|770s|802s|a wa|acer|acs-|airn|alav|asus|attw|au-m|aur |aus |abac|acoo|aiko|alco|alca|amoi|anex|anny|anyw|aptu|arch|argo|bell|bird|bw-n|bw-u|beck|benq|bilb|blac|c55/|cdm-|chtm|capi|cond|craw|dall|dbte|dc-s|dica|ds-d|ds12|dait|devi|dmob|doco|dopo|el49|erk0|esl8|ez40|ez60|ez70|ezos|ezze|elai|emul|eric|ezwa|fake|fly-|fly_|g-mo|g1 u|g560|gf-5|grun|gene|go.w|good|grad|hcit|hd-m|hd-p|hd-t|hei-|hp i|hpip|hs-c|htc |htc-|htca|htcg|htcp|htcs|htct|htc_|haie|hita|huaw|hutc|i-20|i-go|i-ma|i230|iac|iac-|iac/|ig01|im1k|inno|iris|jata|java|kddi|kgt|kgt/|kpt |kwc-|klon|lexi|lg g|lg-a|lg-b|lg-c|lg-d|lg-f|lg-g|lg-k|lg-l|lg-m|lg-o|lg-p|lg-s|lg-t|lg-u|lg-w|lg/k|lg/l|lg/u|lg50|lg54|lge-|lge/|lynx|leno|m1-w|m3ga|m50/|maui|mc01|mc21|mcca|medi|meri|mio8|mioa|mo01|mo02|mode|modo|mot |mot-|mt50|mtp1|mtv |mate|maxo|merc|mits|mobi|motv|mozz|n100|n101|n102|n202|n203|n300|n302|n500|n502|n505|n700|n701|n710|nec-|nem-|newg|neon|netf|noki|nzph|o2 x|o2-x|opwv|owg1|opti|oran|p800|pand|pg-1|pg-2|pg-3|pg-6|pg-8|pg-c|pg13|phil|pn-2|pt-g|palm|pana|pire|pock|pose|psio|qa-a|qc-2|qc-3|qc-5|qc-7|qc07|qc12|qc21|qc32|qc60|qci-|qwap|qtek|r380|r600|raks|rim9|rove|s55/|sage|sams|sc01|sch-|scp-|sdk/|se47|sec-|sec0|sec1|semc|sgh-|shar|sie-|sk-0|sl45|slid|smb3|smt5|sp01|sph-|spv |spv-|sy01|samm|sany|sava|scoo|send|siem|smar|smit|soft|sony|t-mo|t218|t250|t600|t610|t618|tcl-|tdg-|telm|tim-|ts70|tsm-|tsm3|tsm5|tx-9|tagt|talk|teli|topl|hiba|up.b|upg1|utst|v400|v750|veri|vk-v|vk40|vk50|vk52|vk53|vm40|vx98|virg|vite|voda|vulc|w3c |w3c-|wapj|wapp|wapu|wapm|wig |wapi|wapr|wapv|wapy|wapa|waps|wapt|winc|winw|wonu|x700|xda2|xdag|yas-|your|zte-|zeto|acs-|alav|alca|amoi|aste|audi|avan|benq|bird|blac|blaz|brew|brvw|bumb|ccwa|cell|cldc|cmd-|dang|doco|eml2|eric|fetc|hipt|http|ibro|idea|ikom|inno|ipaq|jbro|jemu|java|jigs|kddi|keji|kyoc|kyok|leno|lg-c|lg-d|lg-g|lge-|libw|m-cr|maui|maxo|midp|mits|mmef|mobi|mot-|moto|mwbp|mywa|nec-|newt|nok6|noki|o2im|opwv|palm|pana|pant|pdxg|phil|play|pluc|port|prox|qtek|qwap|rozo|sage|sama|sams|sany|sch-|sec-|send|seri|sgh-|shar|sie-|siem|smal|smar|sony|sph-|symb|t-mo|teli|tim-|tosh|treo|tsm-|upg1|upsi|vk-v|voda|vx52|vx53|vx60|vx61|vx70|vx80|vx81|vx83|vx85|wap-|wapa|wapi|wapp|wapr|webc|whit|winw|wmlb|xda-)',
		'i'
	),
	/**
	 * * `$0` - `'/wiki/<title>'`
	 * * `$1` - `'<title>'`
	 */
	article: new RegExp(mw.config.get('wgArticlePath').replace('$1', '([^#?]+)'))
};
/**
 * Index assigned to each rollback link.
 */
SelectiveRollback.index = -1;
/**
 * Keys for `mw.storage`.
 */
SelectiveRollback.storageKeys = {
	autocomplete: 'mw-SelectiveRollback-autocomplete',
	summary: 'mw-SelectiveRollback-summary',
	rights: 'mw-SelectiveRollback-rights'
};

/**
 * Removes unicode bidirectional characters from the given string and trims it.
 * @param {string} str
 * @returns {string}
 */
function clean(str) {
	return str.replace(/[\u200E\u200F\u202A-\u202E]+/g, '').trim();
}

/**
 * Returns the SelectiveRollbackDialog class.
 * @param {SelectiveRollbackConfig} cfg
 * @param {Messages} msg
 * @param {'ltr' | 'rtl'} dir
 * @param {MetaInfo} meta
 * @param {ParentNode} parentNode
 * @returns
 */
function SelectiveRollbackDialogFactory(cfg, msg, dir, meta, parentNode) {
	const previewApi = new mw.Api(SelectiveRollback.apiOptions(true));
	let /** @type {NodeJS.Timeout} */ previewTimeout;

	const dirMismatch = document.dir !== dir;
	const uiStart = dir === 'rtl' ? 'right' : 'left';
	const uiEnd = dir === 'rtl' ? 'left' : 'right';

	/**
	 * @param {OO.ui.DropdownWidget} dropdown
	 * @returns {string}
	 */
	const getDropdownValue = (dropdown) => {
		return /** @type {string} */ (
			/** @type {OO.ui.OptionWidget} */ (dropdown.getMenu().findSelectedItem()).getData()
		);
	};

	class SelectiveRollbackDialog extends OO.ui.ProcessDialog {

		/**
		 * @param {OO.ui.ProcessDialog.ConfigOptions} [config]
		 * @param {string[]} [autocompleteSources]
		 */
		constructor(config, autocompleteSources = []) {
			super(config);

			/**
			 * A {@link SelectiveRollback} instance for the dialog instance.
			 *
			 * Must be lazy-bound via {@link bindSR} because the SR class's constructor
			 * also requires a dialog instance for initialization.
			 * @type {SelectiveRollback}
			 * @private
			 */
			this.sr = Object.create(null);

			/**
			 * @type {boolean}
			 * @private
			 */
			this.destroyed = false;

			/**
			 * @type {?HTMLLIElement}
			 * @readonly
			 * @private
			 */
			this.portlet = mw.util.addPortletLink(
				mw.config.get('skin') === 'minerva' ? 'p-personal' : 'p-cactions',
				'#',
				msg.scriptname,
				'ca-sr',
				msg['portletlink-main-tooltip'],
				void 0,
				document.getElementById('ca-sr-uncache') || '#ca-move'
			);

			if (this.portlet) {
				this.portlet.addEventListener('click', (e) => {
					e.preventDefault();
					this.open();
				});
			} else {
				console.error('[SR] Failed to create a portlet link.');
			}

			/** @type {OO.ui.Element[]} */
			const items = [];

			if (parentNode) {
				const selectAll = new OO.ui.ButtonWidget({
					flags: ['progressive'],
					label: msg['button-selectall']
				});
				selectAll.on('click', () => this.sr.selectAll());
				const saLayout = new OO.ui.FieldLayout(selectAll);
				saLayout.$element.css({
					margin: dir === 'ltr' ? '0 0 -1em auto' : '0 auto -1em 0',
					width: 'min-content'
				});
				items.push(saLayout);
			}

			/**
			 * @type {OO.ui.DropdownWidget}
			 * @readonly
			 * @private
			 */
			this.summaryList = new OO.ui.DropdownWidget({
				$overlay: this.$overlay,
				menu: {
					items: [
						new OO.ui.MenuOptionWidget({ data: '', label: msg['summary-option-default'] }),
						...Object.entries(cfg.editSummaries).map(([key, value]) => {
							return new OO.ui.MenuOptionWidget({ data: value, label: cfg.showKeys ? key : value });
						}),
						new OO.ui.MenuOptionWidget({ data: 'other', label: msg['summary-option-custom'] }),
					]
				}
			});

			this.summaryList.on('labelChange', () => this.previewSummary());
			this.summaryList.getMenu().selectItemByData(''); // Select default summary
			items.push(
				new OO.ui.FieldLayout(this.summaryList, {
					align: 'top',
					label: $('<b>').text(msg['summary-label-primary'])
				})
			);

			/**
			 * @type {OO.ui.ComboBoxInputWidget}
			 * @readonly
			 * @private
			 */
			this.summary = new OO.ui.ComboBoxInputWidget({
				$overlay: this.$overlay,
				menu: {
					filterFromInput: true,
					items: Object.keys(cfg.specialExpressions).concat(autocompleteSources).map((source) => {
						return new OO.ui.MenuOptionWidget({ data: source, label: source });
					})
				},
				placeholder: msg['summary-label-custom']
			});

			let /** @type {NodeJS.Timeout} */ summaryTimeout;
			this.summary.on('change', (value) => {
				this.previewSummary();
				clearTimeout(summaryTimeout);
				summaryTimeout = setTimeout(() => {
					value = clean(value);
					this.summaryList.getMenu().selectItemByData(value ? 'other' : '');
				}, 100);
			});

			items.push(
				new OO.ui.FieldLayout(this.summary, {
					align: 'top',
					help: new OO.ui.HtmlSnippet(msg[meta.fetched ? 'summary-help-$0' : 'summary-help-$0-error']),
					helpInline: true,
					invisibleLabel: true
				})
			);

			/**
			 * @type {OO.ui.Element}
			 * @readonly
			 * @private
			 */
			this.summaryPreview = new OO.ui.Element({
				$element: $('<div>'),
				id: 'sr-summarypreview'
			});

			items.push(
				new OO.ui.LabelWidget({
					$element: $('<div>').css({ 'margin-top': '8px', 'margin-bottom': '4px' }),
					label: $('<b>').text(msg['summary-label-preview'])
				}),
				this.summaryPreview,
				new OO.ui.LabelWidget({
					$element: $('<div>').css({ 'margin-top': '4px' }),
					classes: ['oo-ui-inline-help'],
					label: new OO.ui.HtmlSnippet(msg['summary-help-preview'])
				})
			);

			/**
			 * @type {OO.ui.CheckboxInputWidget}
			 * @readonly
			 */
			this.markBot = new OO.ui.CheckboxInputWidget();

			if (meta.rights.has('markbotedits')) {
				items.push(
					new OO.ui.FieldLayout(this.markBot, {
						label: msg['markbot-label'],
						align: 'inline'
					})
				);
				this.markBot.setSelected(cfg.markBot);
			}

			/**
			 * @type {OO.ui.CheckboxInputWidget}
			 * @readonly
			 */
			this.watch = new OO.ui.CheckboxInputWidget({
				selected: cfg.watchPage
			});

			items.push(
				new OO.ui.FieldLayout(this.watch, {
					label: msg['watchlist-label'],
					align: 'inline'
				}),
			);

			/**
			 * @type {OO.ui.DropdownWidget}
			 * @readonly
			 */
			this.watchExpiry = new OO.ui.DropdownWidget({
				$overlay: this.$overlay,
				menu: {
					items: [
						new OO.ui.MenuOptionWidget({ data: 'indefinite', label: msg['watchlist-expiry-indefinite'] }),
						new OO.ui.MenuOptionWidget({ data: '1 week', label: msg['watchlist-expiry-1week'] }),
						new OO.ui.MenuOptionWidget({ data: '1 month', label: msg['watchlist-expiry-1month'] }),
						new OO.ui.MenuOptionWidget({ data: '3 months', label: msg['watchlist-expiry-3months'] }),
						new OO.ui.MenuOptionWidget({ data: '6 months', label: msg['watchlist-expiry-6months'] }),
						new OO.ui.MenuOptionWidget({ data: '1 year', label: msg['watchlist-expiry-1year'] })
					]
				}
			});
			this.watchExpiry.getMenu().selectItemByData(cfg.watchExpiry);

			const weLayout = new OO.ui.FieldLayout(this.watchExpiry);
			weLayout.$element.css({ 'margin-left': '1.8em', 'margin-top': '8px' });
			items.push(weLayout);
			this.watch.on('change', (selected) => {
				weLayout.toggle(!!selected);
				this.updateSize();
			});
			weLayout.toggle(this.watch.isSelected());

			/**
			 * @type {OO.ui.FieldsetLayout}
			 * @readonly
			 * @private
			 */
			this.fieldset = new OO.ui.FieldsetLayout();
			this.fieldset.addItems(items);
		}

		/**
		 * @inheritdoc
		 * @override
		 */
		initialize() {
			// @ts-expect-error
			super.initialize.apply(this, arguments);

			this.content = new OO.ui.PanelLayout({
				padded: true,
				expanded: false
			});
			this.content.$element.append(this.fieldset.$element);
			// @ts-expect-error
			this.$body.append(this.content.$element);

			if (!dirMismatch) {
				return this;
			}

			// If the interface language direction differs from the document direction
			// (e.g., SR uses an RTL interface on an LTR wiki or vice versa), apply
			// manual style overrides for layout elements that MediaWiki's OOUI doesn't
			// automatically mirror. This remaps left/right-related properties to logical
			// "start" and "end" positions based on the interface direction.
			const $el = this.$element;
			$el.find('.oo-ui-processDialog-actions-safe').css({
				[uiStart]: '0',
				[uiEnd]: 'unset'
			});
			$el.find('.oo-ui-processDialog-actions-primary').css({
				[uiStart]: 'unset',
				[uiEnd]: '0'
			});
			$el.find('.oo-ui-comboBoxInputWidget .oo-ui-inputWidget-input').css({
				[`border-top-${uiStart}-radius`]: 'unset',
				[`border-bottom-${uiStart}-radius`]: 'unset',
				[`border-${uiStart}-width`]: '1px',
				[`border-top-${uiEnd}-radius`]: '0',
				[`border-bottom-${uiEnd}-radius`]: '0',
				[`border-${uiEnd}-width`]: '0'
			});
			$el.find('.oo-ui-fieldLayout.oo-ui-labelElement.oo-ui-fieldLayout-align-inline > .oo-ui-fieldLayout-body > .oo-ui-fieldLayout-header').css({
				[`padding-${uiStart}`]: '6px',
				[`padding-${uiEnd}`]: 'unset'
			});

			return this;
		}

		/**
		 * @inheritdoc
		 * @override
		 */
		getSetupProcess() {
			return super.getSetupProcess().next(() => {
				this.getActions().setMode(parentNode ? 'nonRCW' : 'RCW');
			});
		}

		/**
		 * @inheritdoc
		 * @override
		 */
		getReadyProcess() {
			return super.getReadyProcess().next(() => {
				if (dirMismatch) {
					this.$element.find('.oo-ui-processDialog-actions-other .oo-ui-actionWidget > .oo-ui-buttonElement-button').css({
						[`border-${uiStart}-color`]: 'transparent',
						[`border-${uiEnd}-color`]: 'var(--border-color-subtle,#c8ccd1)'
					});
				}
			});
		}

		/**
		 * @inheritdoc
		 * @param {string} [action]
		 * @override
		 */
		getActionProcess(action) {
			return new OO.ui.Process(() => {
				switch (action) {
					case 'execute': {
						const selectedLinks = this.sr.getSelected();
						if (!selectedLinks.length) {
							mw.notify(msg['msg-nonechecked'], { type: 'warn' });
							return;
						}
						this.close();
						this.sr.selectiveRollback(selectedLinks);
						break;
					}
					case 'documentation':
						window.open('https://meta.wikimedia.org/wiki/Special:MyLanguage/User:Dragoniez/Selective_Rollback', '_blank');
						break;
					case 'selectall':
						this.sr.selectAll();
						break;
					default: this.close();
				}
			});
		}

		/**
		 * Lazy-binds a SelectiveRollback instance.
		 * @param {SelectiveRollback} sr
		 */
		bindSR(sr) {
			this.sr = sr;
		}

		/**
		 * Destroys the dialog.
		 */
		destroy() {
			SelectiveRollbackDialog.windowManager.destroy();
			if (this.portlet) {
				this.portlet.remove();
			}
			this.destroyed = true;
		}

		/**
		 * Checks whether the dialog has been destroyed.
		 * @returns {boolean}
		 */
		isDestroyed() {
			return this.destroyed;
		}

		/**
		 * Gets the summary.
		 * @returns {string} Can return an empty string if:
		 * * the default option is selected, or
		 * * the custom option is selected but the input for a custom summary is empty.
		 *
		 * Note that the rollback API uses the default summary if:
		 * * the `summary` parameter is unspecified, or
		 * * it is specified as an empty string.
		 */
		getSummary() {
			const dropdownValue = getDropdownValue(this.summaryList);
			let summary = dropdownValue === 'other' ? clean(this.summary.getValue()) : dropdownValue;

			// Process $0
			if (summary === '$0') {
				// If the summary is customized but is only of "$0", alter it with an empty string
				// so that the API uses the default summary
				summary = '';
			} else {
				// Replace $0 with the default summary
				summary = summary.replace('$0', meta.parsedsummary);
			}

			// Process special expressions defined by the user
			if (!$.isEmptyObject(cfg.specialExpressions)) {
				for (const [key, value] of Object.entries(cfg.specialExpressions)) {
					summary = summary.split(key).join(value);
				}
			}

			return summary;
		}

		/**
		 * Gets the `markbot` option value.
		 * @returns {boolean}
		 */
		getMarkBot() {
			return this.markBot.isSelected();
		}

		/**
		 * Gets the `watchlist` option value.
		 * @returns {'watch' | 'nochange'}
		 */
		getWatchlist() {
			return this.watch.isSelected() ? 'watch' : 'nochange';
		}

		/**
		 * Gets the `watchlistexpiry` option value.
		 * @returns {string | undefined} `undefined` if the watch-page box isn't checked.
		 */
		getWatchlistExpiry() {
			return this.watch.isSelected() && getDropdownValue(this.watchExpiry) || void 0;
		}

		/**
		 * Retrieves parameters for the rollback API from the dialog.
		 * @returns {RollbackParams}
		 */
		getParams() {
			return {
				summary: this.getSummary(),
				markbot: this.getMarkBot(),
				watchlist: this.getWatchlist(),
				watchlistexpiry: this.getWatchlistExpiry()
			};
		}

		/**
		 * Previews the summary.
		 * @private
		 */
		previewSummary() {
			clearTimeout(previewTimeout);
			const summary = this.getSummary() || meta.summary;
			previewTimeout = setTimeout(() => {
				previewApi.abort();
				previewApi.post({
					action: 'parse',
					summary,
					prop: ''
				}).then(/** @param {ApiResponse} res */ ({ parse }) => {
					return parse ? parse.parsedsummary : null;
				}).catch(/** @param {Record<string, any>} err */ (_, err) => {
					if (err && err.exception !== 'abort') {
						console.warn(err);
					}
					return null;
				}).then(/** @param {?string} parsedsummary */ (parsedsummary) => {
					parsedsummary = parsedsummary !== null ? parsedsummary : '???';
					this.summaryPreview.$element.html(parsedsummary);
					this.updateSize();
				});
			}, 500);
		}

	}

	SelectiveRollbackDialog.static.name = 'Selective Rollback';
	SelectiveRollbackDialog.static.title = `${msg.scriptname} (v5.0.6)`;
	SelectiveRollbackDialog.static.actions = [
		{
			action: 'execute',
			label: msg['button-rollback'],
			flags: ['primary', 'progressive'],
			modes: ['nonRCW']
		},
		{
			action: 'documentation',
			label: msg['button-documentation'],
			modes: ['RCW', 'nonRCW']
		},
		{
			action: 'selectall',
			label: msg['button-selectall'],
			flags: ['progressive'],
			modes: ['nonRCW']
		},
		{
			flags: ['safe', 'close'],
			modes: ['RCW', 'nonRCW']
		}
	];
	SelectiveRollbackDialog.windowManager = (() => {
		const windowManager = new OO.ui.WindowManager();
		$(document.body).append(windowManager.$element);
		return windowManager;
	})();

	return SelectiveRollbackDialog;
}

//**************************************************************************************************

/**
 * @typedef {import('./window/Selective Rollback.d.ts').ParentNode} ParentNode
 * @typedef {import('./window/Selective Rollback.d.ts').SelectiveRollbackConfig} SelectiveRollbackConfig
 * @typedef {import('./window/Selective Rollback.d.ts').IsOfType} IsOfType
 * @typedef {import('./window/Selective Rollback.d.ts').SRConfirm} SRConfirm
 * @typedef {import('./window/Selective Rollback.d.ts').Languages} Languages
 * @typedef {import('./window/Selective Rollback.d.ts').Messages} Messages
 * @typedef {import('./window/Selective Rollback.d.ts').MetaInfo} MetaInfo
 * @typedef {import('./window/Selective Rollback.d.ts').ApiResponse} ApiResponse
 * @typedef {import('./window/Selective Rollback.d.ts').SRBox} SRBox
 * @typedef {import('./window/Selective Rollback.d.ts').RollbackLink} RollbackLink
 @typedef {import('./window/Selective Rollback.d.ts').RollbackLinkMap} RollbackLinkMap
 * @typedef {import('./window/Selective Rollback.d.ts').RollbackParams} RollbackParams
 */

SelectiveRollback.init();

//**************************************************************************************************
})();
//</nowiki>