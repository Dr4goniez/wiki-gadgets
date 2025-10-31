/***************************************************************************************************\

	Selective Rollback

	@author [[User:Dragoniez]]
	@version 4.4.4
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
			mw.loader.using(['mediawiki.api', 'mediawiki.storage', 'mediawiki.util', 'jquery.ui', 'oojs-ui-windows']),
			$.ready
		);

		// Set up variables
		api = new mw.Api(this.apiOptions());
		const cfg = this.getConfig();
		this.appendStyleTag(cfg);

		// Get localized message object
		let /** @type {Messages} */ msg;
		const langSwitch = /** @type {Languages} */ (
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
		}

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
		const SelectiveRollbackDialog = SelectiveRollbackDialogFactory(cfg, msg, meta);
		const dialog = new SelectiveRollbackDialog();
		const parentNode = this.getParentNode();
		const sr = new this(dialog, cfg, msg, parentNode);
		dialog.initializeButtons(sr, parentNode);

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
					'Api-User-Agent': 'Selective_Rollback/4.4.4 (https://meta.wikimedia.org/wiki/User:Dragoniez/Selective_Rollback.js)'
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
			'.sr-checkbox-wrapper {' +
				'display: inline-block;' +
			'}' +
			'.sr-checkbox {' +
				'margin-right: 0.5em;' +
				'vertical-align: middle;' +
			'}' +
			'.sr-rollback {' +
				'display: inline-block;' +
				'margin: 0 0.5em;' +
			'}' +
			'.sr-rollback-label {' +
				'font-weight: bold;' +
				`color: ${cfg.checkboxLabelColor};` +
			'}' +
			'.sr-dialog-borderbox {' +
				'display: block;' +
				'width: 100%;' +
				'box-sizing: border-box;' +
				'border: 1px solid #777;' +
				'border-radius: 1%;' +
				'padding: 2px 4px;' +
			'}' +
			'.sr-dialog-tooltip {' +
				'font-size: smaller;' +
				'margin: 0;' +
			'}' +
			'#sr-summarypreview {' +
				'max-height: 5em;' +
				'overflow: auto;' +
				'overflow-wrap: break-word;' +
				'word-wrap: break-word;' +
				'color: var(--color-base, white);' +
				'background-color: var(--background-color-neutral, #54595d);' +
			'}';
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
		 * @type {RollbackLink}
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
		const { $label, $checkbox } = createCheckbox('SR', 'sr-rollback-label');
		const /** @type {JQuery<HTMLSpanElement>} */ $wrapper = $('<span>')
			.addClass('sr-rollback')
			.append(
				$('<b>').text('['),
				$label,
				$('<b>').text(']')
			);
		$checkbox.css({ margin: '0 0.3em 0 0.2em' });
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
			$rbspan.css({ border: '1px dotted black' }); // Visualize which rollback link has been clicked
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
						.css({ backgroundColor: isFailure ? 'lightpink' : 'lightgreen' }),
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
	 * Performs selective rollback.
	 * @returns {Promise<void>}
	 */
	async selectiveRollback() {
		// Perform AJAX rollback on links whose associated SR checkboxes are checked
		const /** @type {Promise<boolean>[]} */ batches = [];
		const params = this.dialog.getParams();
		for (const { box, rbspan } of Object.values(this.links)) {
			if (box && box.$checkbox.is(':checked')) {
				batches.push(this.ajaxRollback(rbspan, box, params));
			}
		}

		// Post-procedures
		if (!batches.length) {
			// Show a message if no SR checkbox is checked
			mw.notify(this.msg['msg-nonechecked'], { type: 'warn' });
		} else {
			this.dialog.close();
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
	}

}
/** @type {Record<Languages, Messages>} */
SelectiveRollback.i18n = {
	ja: {
		'portletlink-main-tooltip': 'Selective Rollbackのダイアログを開く',
		'portletlink-uncacher-label': 'Selective Rollbackのキャッシュを破棄', // v4.4.3
		'summary-label-primary': '編集要約',
		'summary-option-default': '既定の編集要約',
		'summary-option-custom': 'カスタム',
		'summary-label-custom': 'カスタム編集要約',
		'summary-tooltip-$0': '($0は既定の編集要約に置換されます。)',
		'summary-tooltip-$0-error': '($0は<b>英語の</b>既定編集要約に置換されます。)',
		'summary-tooltip-specialexpressions': '置換表現',
		'summary-label-preview': '要約プレビュー', // v4.0.0
		'summary-tooltip-preview': '(マジックワードは置換されます。)', // v4.0.0
		'markbot-label': 'ボット編集として巻き戻し',
		'watchlist-label': '対象ページをウォッチリストに追加',
		'watchlist-expiry-label': '期間',
		'watchlist-expiry-indefinite': '無期限',
		'watchlist-expiry-1week': '1週間',
		'watchlist-expiry-1month': '1か月',
		'watchlist-expiry-3months': '3か月',
		'watchlist-expiry-6months': '6か月',
		'watchlist-expiry-1year': '1年',
		'watchlist-expiry-3years': '3年', // Not used
		'button-rollbackchecked': 'チェック項目を巻き戻し',
		'button-checkall': '全てチェック',
		'button-close': '閉じる',
		'msg-nonechecked': 'チェックボックスがチェックされていません。',
		'msg-linksresolved': 'このページの巻き戻しリンクは全て解消済みです。',
		'msg-confirm': '巻き戻しを実行しますか？',
		'rbstatus-reverted': '巻き戻し済',
		'rbstatus-failed': '巻き戻し失敗',
		'rbstatus-notify-success': '成功', // v4.0.0
		'rbstatus-notify-failure': '失敗' // v4.0.0
	},
	en: {
		'portletlink-main-tooltip': 'Open the Selective Rollback dialog',
		'portletlink-uncacher-label': 'Purge cache for Selective Rollback', // v4.4.3
		'summary-label-primary': 'Edit summary',
		'summary-option-default': 'Default edit summary',
		'summary-option-custom': 'Custom',
		'summary-label-custom': 'Custom edit summary',
		'summary-tooltip-$0': '($0 will be replaced with the default rollback summary.)',
		'summary-tooltip-$0-error': '($0 will be replaced with the default rollback summary <b>in English</b>.)',
		'summary-tooltip-specialexpressions': 'Replacement expressions',
		'summary-label-preview': 'Summary preview', // v4.0.0
		'summary-tooltip-preview': '(Magic words will be replaced.)', // v4.0.0
		'markbot-label': 'Mark rollbacks as bot edits',
		'watchlist-label': 'Add the target pages to watchlist',
		'watchlist-expiry-label': 'Expiry',
		'watchlist-expiry-indefinite': 'Indefinite',
		'watchlist-expiry-1week': '1 week',
		'watchlist-expiry-1month': '1 month',
		'watchlist-expiry-3months': '3 months',
		'watchlist-expiry-6months': '6 months',
		'watchlist-expiry-1year': '1 year',
		'watchlist-expiry-3years': '3 years', // Not used
		'button-rollbackchecked': 'Rollback checked',
		'button-checkall': 'Check all',
		'button-close': 'Close',
		'msg-nonechecked': 'No checkbox is checked.',
		'msg-linksresolved': 'Rollback links on this page have all been resolved.',
		'msg-confirm': 'Are you sure you want to rollback this edit?',
		'rbstatus-reverted': 'reverted',
		'rbstatus-failed': 'rollback failed',
		'rbstatus-notify-success': 'Success', // v4.0.0
		'rbstatus-notify-failure': 'Failure' // v4.0.0
	},
	zh: {
		'portletlink-main-tooltip': '打开Selective Rollback日志',
		'portletlink-uncacher-label': '清除Selective Rollback缓存', // v4.4.3
		'summary-label-primary': '编辑摘要',
		'summary-option-default': '默认编辑摘要',
		'summary-option-custom': '自定义',
		'summary-label-custom': '自定义编辑摘要',
		'summary-tooltip-$0': '($0将会被默认编辑摘要替代。)',
		'summary-tooltip-$0-error': '($0将会被默认编辑摘要为<b>英文</b>替代。)',
		'summary-tooltip-specialexpressions': '替换表达',
		'summary-label-preview': '编辑摘要的预览', // v4.0.0
		'summary-tooltip-preview': '(魔术字将被替换。)', // v4.0.0
		'markbot-label': '标记为机器人编辑',
		'watchlist-label': '将目标页面加入监视页面',
		'watchlist-expiry-label': '时间',
		'watchlist-expiry-indefinite': '不限期',
		'watchlist-expiry-1week': '1周',
		'watchlist-expiry-1month': '1个月',
		'watchlist-expiry-3months': '3个月',
		'watchlist-expiry-6months': '6个月',
		'watchlist-expiry-1year': '1年',
		'watchlist-expiry-3years': '3年', // Not used
		'button-rollbackchecked': '勾选回退',
		'button-checkall': '全选',
		'button-close': '关闭',
		'msg-nonechecked': '未选择任何勾选框。',
		'msg-linksresolved': '与该页面相关的回退全部完成。',
		'msg-confirm': '您确定要回退该编辑吗?',
		'rbstatus-reverted': '已回退',
		'rbstatus-failed': '回退失败',
		'rbstatus-notify-success': '成功', // v4.0.0
		'rbstatus-notify-failure': '失败' // v4.0.0
	},
	/** @author [[User:Codename Noreste]] */
	es: {
		'portletlink-main-tooltip': 'Abrir el cuadro de diálogo para Selective Rollback',
		'portletlink-uncacher-label': 'Vaciar caché de Selective Rollback', // v4.4.3
		'summary-label-primary': 'Resumen de edición',
		'summary-option-default': 'Resumen de edición predeterminado',
		'summary-option-custom': 'Personalizado',
		'summary-label-custom': 'Resumen de edición personalizada',
		'summary-tooltip-$0': '($0 será reemplazado con el resumen de edición predeterminado.)',
		'summary-tooltip-$0-error': '($0 será reemplazado con él resumen de edición predeterminado <b>en inglés</b>.)',
		'summary-tooltip-specialexpressions': 'Expresiones de reemplazo',
		'summary-label-preview': 'Vista previa del resumen', // v4.0.0
		'summary-tooltip-preview': '(Las palabras mágicas serán reemplazadas.)', // v4.0.0
		'markbot-label': 'Marcar las reversiones como ediciones del bot',
		'watchlist-label': 'Añadir las páginas de destino a la lista de seguimiento',
		'watchlist-expiry-label': 'Expiración',
		'watchlist-expiry-indefinite': 'Siempre',
		'watchlist-expiry-1week': '1 semana',
		'watchlist-expiry-1month': '1 mes',
		'watchlist-expiry-3months': '3 meses',
		'watchlist-expiry-6months': '6 meses',
		'watchlist-expiry-1year': '1 años',
		'watchlist-expiry-3years': '3 años', // Not used
		'button-rollbackchecked': 'Reversión marcada',
		'button-checkall': 'Marcar todo',
		'button-close': 'Cerrar',
		'msg-nonechecked': 'No hay ninguna casilla de verificación marcada.',
		'msg-linksresolved': 'Los enlaces de reversión en esta página se han resuelto todos.',
		'msg-confirm': '¿Estás seguro de que quieres revertir esta edición?',
		'rbstatus-reverted': 'revertido',
		'rbstatus-failed': 'la reversión falló',
		'rbstatus-notify-success': 'Éxito', // v4.0.0
		'rbstatus-notify-failure': 'Falla' // v4.0.0
	},
	/** @author [[User:NGC 54]] */
	ro: {
		'portletlink-main-tooltip': 'Deschide dialogul Selective Rollback',
		'portletlink-uncacher-label': 'Șterge memoria cache pentru Selective Rollback', // v4.4.3
		'summary-label-primary': 'Descrierea modificării',
		'summary-option-default': 'Descrierea implicită a modificării',
		'summary-option-custom': 'Personalizat',
		'summary-label-custom': 'Descriere personalizată a modificării',
		'summary-tooltip-$0': '($0 va fi înlocuit cu descrierea implicită a revenirii.)',
		'summary-tooltip-$0-error': '($0 va fi înlocuit cu descrierea implicită a revenirii <b>în engleză</b>.)',
		'summary-tooltip-specialexpressions': 'Expresii de înlocuire',
		'summary-label-preview': 'Previzualizare descriere', // v4.0.0
		'summary-tooltip-preview': '(Cuvintele magice vor fi înlocuite.)', // v4.0.0
		'markbot-label': 'Marchează revenirile drept modificări făcute de robot',
		'watchlist-label': 'Adaugă paginile țintă la pagini urmărite',
		'watchlist-expiry-label': 'Expiră',
		'watchlist-expiry-indefinite': 'Nelimitat',
		'watchlist-expiry-1week': '1 săptămână',
		'watchlist-expiry-1month': '1 lună',
		'watchlist-expiry-3months': '3 luni',
		'watchlist-expiry-6months': '6 luni',
		'watchlist-expiry-1year': '1 an',
		'watchlist-expiry-3years': '3 ani', // Not used
		'button-rollbackchecked': 'Revino asupra celor bifate',
		'button-checkall': 'Bifează tot',
		'button-close': 'Închide',
		'msg-nonechecked': 'Nu este bifată nicio căsuță bifabilă.',
		'msg-linksresolved': 'Toate legăturile de revenire de pe această pagină au fost utilizate.',
		'msg-confirm': 'Ești sigur(ă) că vrei să revii asupra acestei modificări?',
		'rbstatus-reverted': 'revenit',
		'rbstatus-failed': 'revenire eșuată',
		'rbstatus-notify-success': 'Succes', // v4.0.0
		'rbstatus-notify-failure': 'Eșec' // v4.0.0
	},
	/** @author [[User:Hide on Rosé]] */
	vi: {
		'portletlink-main-tooltip': 'Mở hộp thoại Lùi sửa theo lựa chọn',
		'portletlink-uncacher-label': 'Xóa bộ nhớ đệm cho Lùi sửa theo lựa chọn', // v4.4.3
		'summary-label-primary': 'Tóm lược sửa đổi',
		'summary-option-default': 'Tóm lược sửa đổi mặc định',
		'summary-option-custom': 'Tuỳ chỉnh',
		'summary-label-custom': 'Tóm lược tuỳ chỉnh',
		'summary-tooltip-$0': '($0 sẽ được thay bằng tóm lược sửa đổi mặc định.)',
		'summary-tooltip-$0-error': '($0 sẽ được thay bằng tóm lược sửa đổi mặc định <b>trong tiếng Anh</b>.)',
		'summary-tooltip-specialexpressions': 'Thay thế biểu thức',
		'summary-label-preview': 'Xem trước tóm lược', // v4.0.0
		'summary-tooltip-preview': '(Từ ma thuật sẽ được thay thế.)', // v4.0.0
		'markbot-label': 'Đánh dấu là sửa đổi bot',
		'watchlist-label': 'Thêm trang mục tiêu vào danh sách theo dõi',
		'watchlist-expiry-label': 'Hết hạn',
		'watchlist-expiry-indefinite': 'Vô hạn',
		'watchlist-expiry-1week': '1 tuần',
		'watchlist-expiry-1month': '1 tháng',
		'watchlist-expiry-3months': '3 tháng',
		'watchlist-expiry-6months': '6 tháng',
		'watchlist-expiry-1year': '1 năm',
		'watchlist-expiry-3years': '3 năm', // Not used
		'button-rollbackchecked': 'Đã chọn để lùi sửa',
		'button-checkall': 'Chọn tất cả',
		'button-close': 'Đóng',
		'msg-nonechecked': 'Chưa chọn sửa đổi.',
		'msg-linksresolved': 'Đã xử lý tất cả liên kết lùi sửa.',
		'msg-confirm': 'Bạn có muốn lùi sửa sửa đổi này không?',
		'rbstatus-reverted': 'đã lùi sửa',
		'rbstatus-failed': 'lùi lại không thành công',
		'rbstatus-notify-success': 'Thành công', // v4.0.0
		'rbstatus-notify-failure': 'Không thành công' // v4.0.0
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
 * Creates a labeled checkbox.
 * ```html
 * <label class="sr-checkbox-wrapper">
 * 	<input class="sr-checkbox" type="checkbox">
 * 	<span>LABELTEXT</span>
 * </label>
 * ```
 * @param {string} labelText
 * @param {string} [textClassNames] Optional class names to apply to the text of the label.
 * @returns {Box}
 */
function createCheckbox(labelText, textClassNames) {
	const /** @type {JQuery<HTMLLabelElement>} */ $label = $('<label>');
	const /** @type {JQuery<HTMLInputElement>} */ $checkbox = $('<input>');
	$label
		.addClass('sr-checkbox-wrapper')
		.append(
			$checkbox
				.prop({ type: 'checkbox' })
				.addClass('sr-checkbox'),
			$('<span>')
				.text(labelText)
				.addClass(textClassNames || '')
		);
	return { $label, $checkbox };
}

/**
 * Returns the SelectiveRollbackDialog class.
 * @param {SelectiveRollbackConfig} cfg
 * @param {Messages} msg
 * @param {MetaInfo} meta
 * @returns
 */
function SelectiveRollbackDialogFactory(cfg, msg, meta) {
	const previewApi = new mw.Api(SelectiveRollback.apiOptions(true));
	let /** @type {NodeJS.Timeout} */ previewTimeout;

	return class SelectiveRollbackDialog {

		constructor() {
			/**
			 * @type {JQuery<HTMLDivElement>}
			 * @readonly
			 * @private
			 */
			this.$dialog = $('<div>');
			this.$dialog
				.prop({ title: 'Selective Rollback' })
				.css({
					padding: '1em',
					maxWidth: '580px'
				})
				.dialog({
					dialogClass: 'sr-dialog',
					height: 'auto',
					width: 'auto',
					minWidth: 515,
					minHeight: 175,
					resizable: false,
					autoOpen: false,
					modal: true
				});

			let /** @type {JQuery<HTMLSelectElement>} */ $summaryList;
			let /** @type {JQuery<HTMLInputElement>} */ $summary;
			let /** @type {JQuery<HTMLDivElement>} */ $summaryPreview;
			let /** @type {JQuery<HTMLParagraphElement>} */ $summaryPreviewTooltip;
			const botBox = createCheckbox(msg['markbot-label']);
			const watchBox = createCheckbox(msg['watchlist-label']);
			let /** @type {JQuery<HTMLUListElement>} */ $watchUl;
			let /** @type {JQuery<HTMLSelectElement>} */ $watchExpiry;
			const psId = 'sr-presetsummary';
			const csId = 'sr-customsummary';
			let /** @type {JQuery<HTMLOptionElement>} */ $psOptCustom;

			// Create dialog contents
			this.$dialog.append(
				// Preset summary wrapper
				$('<div>')
					.prop({ id: 'sr-presetsummary-wrapper' })
					.css({ marginBottom: '0.5em' })
					.append(
						$('<label>')
							.prop({ htmlFor: psId })
							.text(msg['summary-label-primary']),
						($summaryList = $('<select>'))
							.prop({ id: psId })
							.addClass('sr-dialog-borderbox')
							.append(
								$('<option>')
									.prop({
										id: 'sr-presetsummary-default',
										value: ''
									})
									.text(msg['summary-option-default']),
								// Append user-defined edit summaries if there's any
								...Object.entries(cfg.editSummaries).map(([key, value]) => {
									return new Option(cfg.showKeys ? key : value, value);
								}),
								($psOptCustom = $('<option>'))
									.prop({
										id: 'sr-presetsummary-custom',
										value: 'other'
									})
									.text(msg['summary-option-custom'])
							)
							.off('change').on('change', () => this.previewSummary())
					),
				// Custom summary wrapper
				$('<div>')
					.prop({ id: 'sr-customsummary-wrapper' })
					.css({ marginBottom: '0.3em' })
					.append(
						$('<label>')
							.prop({ htmlFor: csId })
							.text(msg['summary-label-custom']),
						($summary = $('<input>'))
							.prop({ id: csId })
							.addClass('sr-dialog-borderbox')
							.off('focus').on('focus', () => {
								// When the custom summary field is focused, set the dropdown option to "other"
								const initiallySelected = $psOptCustom.is(':selected');
								$psOptCustom.prop('selected', true);
								if (!initiallySelected) {
									$summaryList.trigger('change');
								}
							})
							.off('input').on('input', () => this.previewSummary()),
						$('<p>')
							.prop({
								id: 'sr-customsummary-$0',
								innerHTML: msg[meta.fetched ? 'summary-tooltip-$0' : 'summary-tooltip-$0-error']
							})
							.addClass('sr-dialog-tooltip'),
						$('<p>')
							.prop({ id: 'sr-customsummary-$SE' })
							.addClass('sr-dialog-tooltip')
							.text(function() {
								// Show a list of special expressions if defined by the user
								if (!$.isEmptyObject(cfg.specialExpressions)) {
									const seTooltip = Object.keys(cfg.specialExpressions).join(', ');
									return `(${msg['summary-tooltip-specialexpressions']}: ${seTooltip})`;
								} else {
									$(this).hide();
									return '';
								}
							})
					),
				// Summary preview wrapper
				$('<div>')
					.prop({ id: 'sr-summarypreview-wrapper' })
					.append(
						document.createTextNode(msg['summary-label-preview']),
						($summaryPreview = $('<div>'))
							.prop({ id: 'sr-summarypreview' })
							.addClass('sr-dialog-borderbox'),
						($summaryPreviewTooltip = $('<p>'))
							.prop({ id: 'sr-summarypreview-tooltip' })
							.text(msg['summary-tooltip-preview'])
							.addClass('sr-dialog-tooltip')
							.hide()
					)
					.css({ marginBottom: '0.8em' }),
				// Markbot option wrapper
				$('<div>')
					.prop({ id: 'sr-bot-wrapper' })
					.append(botBox.$label)
					.css('display', () => {
						if (meta.rights.has('markbotedits')) {
							// If the current user has the "markbotedits" user right, show the checkbox
							// and initialize its checked state in accordance with the config
							botBox.$checkbox.prop('checked', cfg.markBot);
							return 'block';
						} else {
							return 'none'; // Hide the box if not
						}
					}),
				// Watchlist option wrapper
				$('<div>')
					.prop({ id: 'sr-watchlist-wrapper' })
					.append(
						watchBox.$label,
						($watchUl = $('<ul>'))
							.prop({ id: 'sr-watchlist-expiry' })
							.css({ marginTop: '0.2em' })
							.hide()
							.append(
								$('<li>')
									.append(
										document.createTextNode(msg['watchlist-expiry-label']),
										($watchExpiry = $('<select>'))
											.prop({ id: 'sr-watchlist-expiry-dropdown' })
											.css({ marginLeft: '0.5em' })
											.append(
												[
													{ value: 'indefinite', text: msg['watchlist-expiry-indefinite'] },
													{ value: '1 week', text: msg['watchlist-expiry-1week'] },
													{ value: '1 month', text: msg['watchlist-expiry-1month'] },
													{ value: '3 months', text: msg['watchlist-expiry-3months'] },
													{ value: '6 months', text: msg['watchlist-expiry-6months'] },
													{ value: '1 year', text: msg['watchlist-expiry-1year'] }
												]
												.map(({ value, text }) => $('<option>').prop({ value }).text(text))
											)
											.val(cfg.watchExpiry)
									)
							)
					)
			);

			// Initialize the watchlist checkbox
			watchBox.$checkbox
				.off('change').on('change', function() {
					// Show/hide the expiry dropdown when the checkbox is (un)checked
					$watchUl.toggle($(this).is(':checked'));
				})
				.prop('checked', cfg.watchPage)
				.trigger('change');

			// Define properties
			/**
			 * The summary dropdown.
			 * @type {JQuery<HTMLSelectElement>}
			 * @readonly
			 * @private
			 */
			this.$summaryList = $summaryList;
			/**
			 * The summary input.
			 * @type {JQuery<HTMLInputElement>}
			 * @readonly
			 * @private
			 */
			this.$summary = $summary;
			/**
			 * The div for summary preview.
			 * @type {JQuery<HTMLDivElement>}
			 * @readonly
			 * @private
			 */
			this.$summaryPreview = $summaryPreview;
			/**
			 * The div for summary preview tooltip (which says "Magic words will be replaced").
			 * @type {JQuery<HTMLDivElement>}
			 * @readonly
			 * @private
			 */
			this.$summaryPreviewTooltip = $summaryPreviewTooltip;
			/**
			 * The markbox checkbox.
			 * @type {JQuery<HTMLInputElement>}
			 * @readonly
			 * @private
			 */
			this.$markbot = botBox.$checkbox;
			/**
			 * The watch-page checkbox.
			 * @type {JQuery<HTMLInputElement>}
			 * @readonly
			 * @private
			 */
			this.$watch = watchBox.$checkbox;
			/**
			 * The watch-expiry dropdown.
			 * @type {JQuery<HTMLSelectElement>}
			 * @readonly
			 * @private
			 */
			this.$watchExpiry = $watchExpiry;

			/**
			 * The portlet link to open the SR dialog.
			 * @type {HTMLLIElement?}
			 * @readonly
			 * @private
			 */
			this.portlet = mw.util.addPortletLink(
				mw.config.get('skin') === 'minerva' ? 'p-personal' : 'p-cactions',
				'#',
				'Selective Rollback',
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

			/**
			 * Whether the dialog has been destroyed.
			 * @type {boolean}
			 * @private
			 */
			this.destroyed = false;

			// On jawp, set up autocomplete for the custom summary textbox
			const moduleName = 'ext.gadget.WpLibExtra';
			if (mw.config.get('wgWikiID') === 'jawiki' && new Set(mw.loader.getModuleNames()).has(moduleName)) {
				mw.loader.using(moduleName).then((require) => {
					const /** @type {WpLibExtra} */ lib = require(moduleName);
					$.when(lib.getVipList('wikilink'), lib.getLtaList('wikilink')).then((vipList, ltaList) => {
						const list = vipList.concat(ltaList);
						$summary.autocomplete({
							/**
							 * @param {{ term: string; }} req
							 * @param {(data: any) => void} res
							 */
							source: (req, res) => {
								// Limit the list to the maximum number of 10, or it can stick out of the viewport
								const results = $.ui.autocomplete.filter(list, req.term);
								res(results.slice(0, 10));
							},
							select: (_, ui) => {
								// When the event is triggered, getSummary picks up the value before selection
								// Because of this, pick up the autocompleted value and pass it to previewSummary
								const /** @type {string?} */ val = ui.item && ui.item.value;
								if (val) this.previewSummary(val);
							},
							position: {
								my: 'left bottom',
								at: 'left top'
							}
						});
					});
				});
			}

			// Initialize summary preview
			this.$summary.trigger('input');
		}

		/**
		 * Intializes the dialog's buttons by binding a SelectiveRollback instance to
		 * the current SelectiveRollbackDialog instance.
		 * @param {SelectiveRollback} sr
		 * @param {ParentNode} parentNode
		 * @returns {this}
		 */
		initializeButtons(sr, parentNode) {
			const buttons = [
				{	// "Rollback checked" button
					text: msg['button-rollbackchecked'],
					click: () => sr.selectiveRollback()
				},
				{	// "Check all" button
					text: msg['button-checkall'],
					click: () => sr.selectAll()
				},
				{	// "Close" button
					text: msg['button-close'],
					click: () => this.close()
				}
			];
			if (!parentNode) {
				buttons.splice(0, 2); // Only leave the "Close" button if parentNode is a falsy value
			}
			this.$dialog.dialog({ buttons });
			return this;
		}

		/**
		 * Opens the SelectiveRollbackDialog dialog.
		 * @returns {this}
		 */
		open() {
			this.$dialog.dialog('open');
			return this;
		}

		/**
		 * Closes the SelectiveRollbackDialog dialog.
		 * @returns {this}
		 */
		close() {
			this.$dialog.dialog('close');
			return this;
		}

		/**
		 * Destroys the dialog. This method also removes the portlet link.
		 * @returns {void}
		 */
		destroy() {
			this.$dialog.empty().dialog('destroy');
			this.destroyed = true;
			if (this.portlet) this.portlet.remove();
		}

		/**
		 * Checks whether the dialog has been destroyed via {@link destroy}.
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
			let summary = this.$summaryList.val() === 'other'
				? clean(this.$summary[0].value)
				: this.$summaryList[0].value;

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
			return this.$markbot.is(':checked');
		}

		/**
		 * Gets the `watchlist` option value.
		 * @returns {'watch' | 'nochange'}
		 */
		getWatchlist() {
			return this.$watch.is(':checked') ? 'watch' : 'nochange';
		}

		/**
		 * Gets the `watchlistexpiry` option value.
		 * @returns {string | undefined} `undefined` if the watch-page box isn't checked.
		 */
		getWatchlistExpiry() {
			return this.$watch.is(':checked') && this.$watchExpiry[0].value || void 0;
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
		 * @param {string} [summary] Falls back to the value from {@link getSummary}.
		 * @returns {void}
		 * @private
		 */
		previewSummary(summary = this.getSummary()) {
			clearTimeout(previewTimeout);

			// Get summary to preview
			let containsMagicWords = false;
			if (!summary) { // If the obtained summary is an empty string, preview the default summary
				summary = meta.summary; // Might contain magic words
				containsMagicWords = /\{\{plural:/i.test(summary);
			}

			// Preview
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
					this.$summaryPreview.html(parsedsummary);
					this.$summaryPreviewTooltip.toggle(containsMagicWords);
				});
			}, 500);
		}

	};
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
 * @typedef {import('./window/Selective Rollback.d.ts').Box} Box
 * @typedef {import('./window/Selective Rollback.d.ts').SRBox} SRBox
 * @typedef {import('./window/Selective Rollback.d.ts').RollbackLink} RollbackLink
 * @typedef {import('./window/Selective Rollback.d.ts').RollbackParams} RollbackParams
 */

SelectiveRollback.init();

//**************************************************************************************************
})();
//</nowiki>