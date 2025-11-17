/***************************************************************************************************\

	Selective Rollback

	@author [[User:Dragoniez]]
	@version 5.1.2
	@see https://meta.wikimedia.org/wiki/User:Dragoniez/Selective_Rollback

	Some functionality in this script is adapted from:
	@link https://meta.wikimedia.org/wiki/User:Hoo_man/smart_rollback.js
	@link https://en.wikipedia.org/wiki/User:DannyS712/AjaxRollback.js

	See also the type definitions at:
	@link https://github.com/Dr4goniez/wiki-gadgets/blob/main/src/window/Selective%20Rollback.d.ts

\***************************************************************************************************/
// @ts-check
/* global mw, OO */
//<nowiki>
(() => {
//**************************************************************************************************

// Run this script only when on /wiki/$1 or /w/index.php
if (
	!location.pathname.startsWith(mw.config.get('wgArticlePath').replace('$1', '')) &&
	location.pathname !== mw.config.get('wgScript')
) {
	return;
}

// Ensure the user is logged in. String-casting is used for type safety
// in nested function scopes (to avoid inference as `string | null`).
const wgUserName = /** @type {string} */ (mw.config.get('wgUserName'));
if (wgUserName === null || mw.config.get('wgUserIsTemp')) {
	return;
}
const wgWikiID = mw.config.get('wgWikiID');

const version = '5.1.2';
/**
 * @type {mw.Api}
 */
let api;
/**
 * @type {Languages}
 */
let langSwitch;
/**
 * @type {Messages}
 */
let msg;
/**
 * @type {InterfaceDirection}
 */
let dir;
/**
 * Whether the user is on Recentchanges or Watchlist.
 */
const isOnRCW = ['Recentchanges', 'Recentchangeslinked', 'Watchlist'].includes(mw.config.get('wgCanonicalSpecialPageName') || '');
/**
 * Whether the user is on Special:SelectiveRollbackConfig.
 */
const isOnConfig = mw.config.get('wgNamespaceNumber') === -1 && /^(SelectiveRollbackConfig|SRC)$/i.test(mw.config.get('wgTitle'));

class SelectiveRollback {

	static async init() {
		const modules = [
			'mediawiki.api',
			'mediawiki.user',
			'mediawiki.util',
			'oojs-ui'
		];
		if (isOnConfig) {
			modules.push('mediawiki.ForeignApi');
		}
		await $.when(
			mw.loader.using(modules),
			$.ready
		);

		// Set up variables
		api = new mw.Api(this.apiOptions());
		const cfg = SelectiveRollbackConfig.getMerged();
		this.appendStyleTag(cfg);

		// Get localized message object
		langSwitch = /** @type {Languages} */ (
			// Fall back to the user's language in preferences
			(cfg.lang || mw.config.get('wgUserLanguage')).replace(/-.*$/, '')
		);
		if (!(langSwitch in this.i18n)) {
			if (cfg.lang) {
				console.error(`[SR] Sorry, Selective Rollback does not support ${cfg.lang} as its interface language.`);
			}
			langSwitch = 'en';
		}
		msg = this.i18n[langSwitch];
		dir = langSwitch === 'ar' ? 'rtl' : 'ltr';

		if (isOnConfig) {
			SelectiveRollbackConfig.init();
			return;
		}

		// Fetch metadata for script initialization
		const meta = await this.getMetaInfo();
		if (cfg.purgerLink) {
			this.createCachePurger();
		}
		if (cfg.configLink) {
			SelectiveRollbackConfig.createPortletLink();
		}

		// Stop running the script if the user doesn't have rollback rights or there're no visible rollback links
		// However, keep it running on RCW even when the no-link condition is met, since rollback links may not
		// exist at page load but can be added dynamically later through AJAX updates
		if (!meta.rights.has('rollback') || (!this.collectLinks().length && !isOnRCW)) {
			return;
		}

		// Create a SelectiveRollbackDialog instance
		const parentNode = this.getParentNode();
		const SelectiveRollbackDialog = SelectiveRollbackDialogFactory(cfg, meta, parentNode);
		const autocompleteSources = await this.getAutocompleteSourcesForJawiki();
		const dialog = new SelectiveRollbackDialog({
			$element: $('<div>').attr({ dir }),
			classes: ['sr-dialog'],
			size: 'large'
		}, autocompleteSources);
		SelectiveRollbackDialog.windowManager.addWindows([dialog]);
		const sr = new this(dialog, cfg, parentNode);
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
	 * @private
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
					'Api-User-Agent': `Selective_Rollback/${version} (https://meta.wikimedia.org/wiki/User:Dragoniez/Selective_Rollback.js)`
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
	 * Appends to the document head a \<style> tag for SR.
	 * @param {Required<SelectiveRollbackConfigObject>} cfg
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
				'margin: 0 4px 2px !important;' +
				'vertical-align: middle;' +
			'}' +
			'.sr-rollback-label {' +
				'font-weight: bold;' +
				`color: ${cfg.checkboxLabelColor};` +
			'}' +
			'.sr-dialog .oo-ui-inline-help code {' +
				'color: inherit;' +
			'}' +
			'.sr-selected-count {' +
				'padding-top: 6px !important;' +
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
			'.sr-config-overlay {' +
				'width: 100%;' +
				'height: 100%;' +
				'position: absolute;' +
				'top: 0;' +
				'left: 0;' +
				'z-index: 10000;' +
			'}' +
			'.sr-config-notice {' +
				'margin-bottom: 1em;' +
				'max-width: 50em;' +
			'}' +
			'.sr-config-headinglabel {' +
				'margin-top: 12px;' +
			'}' +
			'.oo-ui-fieldLayout.sr-config-propertyfield-buttoncontainer {' +
				'margin-top: 8px;' +
			'}' +
			'.sr-config-icon-container {' +
				'display: inline-block;' +
			'}' +
			'.sr-config-icon {' +
				'width: 1em;' +
				'vertical-align: middle;' +
				'border: 0;' +
			'}' +
			'.sr-config-icon-subtext {' +
				'margin-left: 0.2em;' +
			'}' +
			'.sr-config-icon-subtext-green {' +
				'color: var(--color-icon-success, #099979);' +
			'}' +
			'.sr-config-icon-subtext-red {' +
				'color: var(--color-icon-error, #f54739);' +
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
	 * @returns {void}
	 * @private
	 */
	static createCachePurger() {
		if (!Object.values(this.storageKeys).some(key => mw.storage.get(key))) {
			// Don't generate the portlet link if no cache exists
			return;
		}
		const portlet = mw.util.addPortletLink(
			mw.config.get('skin') === 'minerva' ? 'p-personal' : 'p-cactions',
			'#',
			msg['portlet-label-uncacher'],
			'ca-sr-uncacher',
			msg['portlet-label-uncacher'],
			void 0,
			'#ca-move'
		);
		if (!portlet) {
			return;
		}
		portlet.addEventListener('click', (e) => {
			e.preventDefault();
			this.purgeCache();
			location.reload();
		});
	}

	static purgeCache() {
		for (const key of Object.values(this.storageKeys)) {
			mw.storage.remove(key);
		}
	}

	/**
	 * @returns {JQuery.Promise<string[]>}
	 * @private
	 */
	static getAutocompleteSourcesForJawiki() {
		const moduleName = 'ext.gadget.WpLibExtra';
		if (wgWikiID !== 'jawiki' || !new Set(mw.loader.getModuleNames()).has(moduleName)) {
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
	 * @param {Required<SelectiveRollbackConfigObject>} cfg
	 * @param {ParentNode} parentNode
	 * @private
	 */
	constructor(dialog, cfg, parentNode) {
		/**
		 * @type {InstanceType<ReturnType<typeof SelectiveRollbackDialogFactory>>}
		 * @readonly
		 * @private
		 */
		this.dialog = dialog;
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
			: cfg.desktopConfirm;
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
		 * @readonly
		 * @private
		 */
		this.links = Object.create(null);
	}

	/**
	 * Binds/unbinds rollback links to this intance on page content updates.
	 * @private
	 */
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
	 * @private
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
	 * @returns {number}
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
			mw.notify(msg['rollback-notify-linksresolved'], { type: 'warn' });
		}
		return count;
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
			const confirmed = await OO.ui.confirm(msg['rollback-confirm'], { size: 'medium' });
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
	 * @private
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
							'vertical-align': 'middle',
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
						.text(isFailure ? `${msg['rollback-label-failure']} (${result})` : msg['rollback-label-success'])
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
	 * @private
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
				`${msg.scriptname} (${success + fail})`,
				$('<ul>').append(
					$('<li>').text(`${msg['rollback-notify-success']}: ${success}`),
					$('<li>').text(`${msg['rollback-notify-failure']}: ${fail}`)
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
		'portlet-tooltip-dialog': 'Selective Rollbackのダイアログを開く',
		'portlet-label-uncacher': 'Selective Rollbackのキャッシュを破棄', // v4.4.3
		'dialog-label-summary': '編集要約',
		'dialog-label-summary-default': '既定の編集要約',
		'dialog-label-summary-custom': 'カスタム',
		'dialog-label-summaryinput': 'カスタム編集要約',
		'dialog-help-summaryinput-$0': '<code>$0</code>は既定の編集要約に置換されます。',
		'dialog-help-summaryinput-$0-error': '<code>$0</code>は<b>英語の</b>既定編集要約に置換されます。',
		'dialog-label-summarypreview': '要約プレビュー', // v4.0.0
		'dialog-help-summarypreview': '<code>{{PLURAL:$7}}</code>は置換されます。', // Updated in v5.0.0
		'dialog-label-markbot': 'ボット編集として巻き戻し',
		'dialog-label-watchlist': '巻き戻し対象をウォッチリストに追加',
		'dialog-label-watchlistexpiry': '期間', // Deprecated since v5.0.0
		'dialog-label-watchlistexpiry-indefinite': '無期限',
		'dialog-label-watchlistexpiry-1week': '1週間',
		'dialog-label-watchlistexpiry-1month': '1か月',
		'dialog-label-watchlistexpiry-3months': '3か月',
		'dialog-label-watchlistexpiry-6months': '6か月',
		'dialog-label-watchlistexpiry-1year': '1年',
		'dialog-button-rollback': '巻き戻し', // Updated in v5.0.0
		'dialog-button-documentation': '解説', // Added in v5.0.0
		'dialog-button-config': '設定', // v5.1.0
		'dialog-button-selectall': '全選択', // Updated in v5.0.0
		'dialog-label-selectcount': '選択済み:', // Added in v5.0.7
		'dialog-button-close': '閉じる', // Deprecated since v5.0.0
		'rollback-notify-noneselected': 'チェックボックスがチェックされていません。',
		'rollback-notify-linksresolved': 'このページの巻き戻しリンクは全て解消済みです。',
		'rollback-confirm': '巻き戻しを実行しますか？',
		'rollback-label-success': '巻き戻し済',
		'rollback-label-failure': '巻き戻し失敗',
		'rollback-notify-success': '成功', // v4.0.0
		'rollback-notify-failure': '失敗', // v4.0.0
		// v5.1.0
		'config-title': 'Selective Rollbackの設定',
		'config-tab-local': 'ローカル',
		'config-tab-global': 'グローバル',
		'config-notice-local': 'ローカル設定はこのプロジェクトのみに適用され、グローバル設定が存在する場合はそれを（部分的に）上書きします。',
		'config-notice-global': 'グローバル設定はすべてのプロジェクトに適用され、ローカル設定が存在する場合は（部分的に）上書きされます。',
		'config-default': '規定値',
		'config-default-disabled': '無効',
		'config-default-enabled': '有効',
		'config-label-lang': '言語',
		'config-help-lang': '個人設定で指定された言語、または翻訳が利用できない場合は英語',
		'config-label-summary': '定型要約',
		'config-label-propertyinput-key': 'キー',
		'config-label-propertyinput-value': '値',
		'config-error-propertyinput-key-empty': 'キーを空にすることはできません。',
		'config-error-propertyinput-value-empty': '値を空にすることはできません。',
		'config-error-propertyinput-key-reserved': 'キー「$1」はシステムで予約されているため使用できません。',
		'config-error-propertyinput-key-duplicate': 'キーが重複しています。',
		'config-button-add': '追加',
		'config-button-remove': '除去',
		'config-button-deselectall': '全選択解除',
		'config-help-summary-$0': '<code>$0</code> — ローカルウィキの既定の巻き戻し要約',
		'config-help-summary-$1': '<code>$1</code> — 復元される編集の投稿者の利用者名',
		'config-help-summary-$2': '<code>$2</code> — 巻き戻される編集の投稿者の利用者名',
		'config-help-summary-$3': '<code>$3</code> — 巻き戻し先の版のID',
		'config-help-summary-$4': '<code>$4</code> — 巻き戻し先の版のタイムスタンプ',
		'config-help-summary-$5': '<code>$5</code> — 巻き戻し元の版のID',
		'config-help-summary-$6': '<code>$6</code> — 巻き戻し元の版のタイムスタンプ',
		'config-help-summary-$7': '<code>$7</code> — 巻き戻された版数',
		'config-label-showkeys': '値の代わりにキーをドロップダウンの項目として使用する',
		'config-label-mergesummaries': 'グローバル設定の要約を上書きせずに統合する',
		'config-label-replacer': '置換表現',
		'config-help-replacer': '置換表現は、巻き戻し要約で特定の文字列に置き換えられるキーワードです。意図しない置換を防ぐため、<b>常に</b><code>$</code>などの記号で始めることを推奨します。',
		'config-label-mergereplacers': 'グローバル設定の置換表現を上書きせずに統合する',
		'config-label-watchlist': 'ウォッチリスト',
		'config-label-watchlistexpiry': 'ウォッチリストの有効期限',
		'config-label-confirmation': '巻き戻し確認',
		'config-label-confirmation-desktop': 'デスクトップ',
		'config-label-confirmation-mobile': 'モバイル',
		'config-label-confirmation-always': '常に確認する',
		'config-label-confirmation-never': '確認しない',
		'config-label-confirmation-RCW': '最近の更新またはウォッチリスト上では確認する',
		'config-label-confirmation-nonRCW': '最近の更新またはウォッチリスト以外では確認する',
		'config-label-checkboxlabelcolor': 'チェックボックスのラベル色',
		'config-help-checkboxlabelcolor': 'プレビュー:',
		'config-label-miscellaneous': 'その他',
		'config-help-markbot': 'この設定は、必要な権限を持つ場合にのみ適用されます。',
		'config-label-configlink': '設定ページへのポートレットリンクを生成',
		'config-label-purger': 'キャッシュ破棄用のポートレットリンクを生成',
		'config-button-save': '保存',
		'config-notify-save-success': '設定を保存しました。',
		'config-notify-save-failure': '設定の保存に失敗しました: $1',
		'config-button-reset': 'リセット',
		'config-confirm-reset': '設定を既定値にリセットしますか？変更内容は手動で保存する必要があります。',
		'config-notify-reset': 'フィールドの値を既定値にリセットしました。',
		'config-label-deleteglobal': 'グローバル設定を削除',
		'config-help-deleteglobal-absent': 'グローバル設定は保存されていません。',
		'config-label-deletelocal': 'ローカル設定を削除',
		'config-help-deletelocal-absent': 'ローカル設定は保存されていません。',
		'config-label-deletelocalall': '他のすべてのプロジェクトのローカル設定を削除',
		'config-help-deletelocalall-present': 'この操作を行うには、$1でログインしている必要があります。',
		'config-help-deletelocalall-absent': 'ローカル設定が保存されている他プロジェクトはありません。',
		'config-label-deletedata': 'データを削除',
		'config-button-deletedata': '削除',
		'config-confirm-deletedata': '設定データを本当に削除しますか？この操作は元に戻せません。',
		'config-notify-deletedata-success': '指定された設定データを削除しました。',
		'config-notify-deletedata-failure': '指定された設定データの一部を削除できませんでした。',
	},
	en: {
		'scriptname': 'Selective Rollback', // Added in v5.0.1
		'portlet-tooltip-dialog': 'Open the Selective Rollback dialog',
		'portlet-label-uncacher': 'Purge cache for Selective Rollback', // v4.4.3
		'dialog-label-summary': 'Edit summary',
		'dialog-label-summary-default': 'Default edit summary',
		'dialog-label-summary-custom': 'Custom',
		'dialog-label-summaryinput': 'Custom edit summary',
		'dialog-help-summaryinput-$0': '<code>$0</code> will be replaced with the default rollback summary.',
		'dialog-help-summaryinput-$0-error': '<code>$0</code> will be replaced with the default rollback summary <b>in English</b>.',
		'dialog-label-summarypreview': 'Summary preview', // v4.0.0
		'dialog-help-summarypreview': '<code>{{PLURAL:$7}}</code> will be replaced.', // Updated in v5.0.0
		'dialog-label-markbot': 'Mark rollbacks as bot edits',
		'dialog-label-watchlist': 'Add rollback targets to watchlist',
		'dialog-label-watchlistexpiry': 'Expiry', // Deprecated since v5.0.0
		'dialog-label-watchlistexpiry-indefinite': 'Indefinite',
		'dialog-label-watchlistexpiry-1week': '1 week',
		'dialog-label-watchlistexpiry-1month': '1 month',
		'dialog-label-watchlistexpiry-3months': '3 months',
		'dialog-label-watchlistexpiry-6months': '6 months',
		'dialog-label-watchlistexpiry-1year': '1 year',
		'dialog-button-rollback': 'Rollback', // Updated in v5.0.0
		'dialog-button-documentation': 'Docs', // Added in v5.0.0
		'dialog-button-config': 'Config', // v5.1.0
		'dialog-button-selectall': 'Select all', // Updated in v5.0.0
		'dialog-label-selectcount': 'Selected:', // Added in v5.0.7
		'dialog-button-close': 'Close', // Deprecated since v5.0.0
		'rollback-notify-noneselected': 'No checkbox is checked.',
		'rollback-notify-linksresolved': 'Rollback links on this page have all been resolved.',
		'rollback-confirm': 'Are you sure you want to rollback this edit?',
		'rollback-label-success': 'reverted',
		'rollback-label-failure': 'rollback failed',
		'rollback-notify-success': 'Success', // v4.0.0
		'rollback-notify-failure': 'Failure', // v4.0.0
		// v5.1.0
		'config-title': 'Configure Selective Rollback',
		'config-tab-local': 'Local',
		'config-tab-global': 'Global',
		'config-notice-local': 'Local config applies only to this project and may (partially) override the global config if present.',
		'config-notice-global': 'Global config applies to all projects and may be (partially) overridden by the local config if present.',
		'config-default': 'Default',
		'config-default-disabled': 'Disabled',
		'config-default-enabled': 'Enabled',
		'config-label-lang': 'Language',
		'config-help-lang': 'The user\'s interface language as set in preferences, or English if translations are unavailable.',
		'config-label-summary': 'Preset summaries',
		'config-label-propertyinput-key': 'Key',
		'config-label-propertyinput-value': 'Value',
		'config-error-propertyinput-key-empty': 'The key must not be empty.',
		'config-error-propertyinput-value-empty': 'The value must not be empty.',
		'config-error-propertyinput-key-reserved': 'The key "$1" is reserved by the system and hence disallowed.',
		'config-error-propertyinput-key-duplicate': 'The key must be unique.',
		'config-button-add': 'Add',
		'config-button-remove': 'Remove',
		'config-button-deselectall': 'Deselect all',
		'config-help-summary-$0': '<code>$0</code> — default rollback summary on the local wiki',
		'config-help-summary-$1': '<code>$1</code> — username of the author of the edit that is being restored',
		'config-help-summary-$2': '<code>$2</code> — username of the author of the edits that are being reverted',
		'config-help-summary-$3': '<code>$3</code> — revision ID of the revision reverted to',
		'config-help-summary-$4': '<code>$4</code> — timestamp of the revision reverted to',
		'config-help-summary-$5': '<code>$5</code> — revision ID of the revision reverted from',
		'config-help-summary-$6': '<code>$6</code> — timestamp of the revision reverted from',
		'config-help-summary-$7': '<code>$7</code> — the number of edits that have been reverted',
		'config-label-showkeys': 'Use keys instead of values as dropdown options',
		'config-label-mergesummaries': 'Merge summaries from the global config instead of overriding them',
		'config-label-replacer': 'Replacement expressions',
		'config-help-replacer': 'Replacement expressions are keywords that will be replaced with certain texts in a rollback summary. It is recommended to <b>always prefix your expressions</b> with <code>$</code> or a similar symbol to avoid unintentional text replacements.',
		'config-label-mergereplacers': 'Merge replacement expressions from the global config instead of overriding them',
		'config-label-watchlist': 'Watchlist',
		'config-label-watchlistexpiry': 'Watchlist expiry',
		'config-label-confirmation': 'Rollback confirmation',
		'config-label-confirmation-desktop': 'Desktop',
		'config-label-confirmation-mobile': 'Mobile',
		'config-label-confirmation-always': 'Always',
		'config-label-confirmation-never': 'Never',
		'config-label-confirmation-RCW': 'If on Recentchanges or Watchlist',
		'config-label-confirmation-nonRCW': 'If not on Recentchanges or Watchlist',
		'config-label-checkboxlabelcolor': 'Checkbox label color',
		'config-help-checkboxlabelcolor': 'Preview:',
		'config-label-miscellaneous': 'Miscellaneous',
		'config-help-markbot': 'This option applies only when you have the required rights on the wiki.',
		'config-label-configlink': 'Generate a portlet link to the config page',
		'config-label-purger': 'Generate a portlet link to purge the cache',
		'config-button-save': 'Save',
		'config-notify-save-success': 'Saved the configurations.',
		'config-notify-save-failure': 'Failed to save the configurations: $1',
		'config-button-reset': 'Reset',
		'config-confirm-reset': 'Do you want to reset the configurations to their default values? Changes will need to be saved manually.',
		'config-notify-reset': 'Field values have been reset to their default values.',
		'config-label-deleteglobal': 'Delete global config',
		'config-help-deleteglobal-absent': 'You do not have any global settings configured.',
		'config-label-deletelocal': 'Delete local config',
		'config-help-deletelocal-absent': 'You do not have any local settings configured.',
		'config-label-deletelocalall': 'Delete local config on all other projects',
		'config-help-deletelocalall-present': 'To perform this action, you need to be logged in on $1.',
		'config-help-deletelocalall-absent': 'You do not have any local settings configured on other projects.',
		'config-label-deletedata': 'Delete data',
		'config-button-deletedata': 'Delete',
		'config-confirm-deletedata': 'Are you sure you want to delete configuration data? This cannot be undone.',
		'config-notify-deletedata-success': 'Deleted the specified configuration data.',
		'config-notify-deletedata-failure': 'Failed to delete some of the specified configuration data.',
	},
	/**
	 * @author [[User:User xyBW847toYwJSYpc]] (formerly known as PAVLOV)
	 * @since 1.2.3
	 */
	zh: {
		'scriptname': 'Selective Rollback', // Added in v5.0.1
		'portlet-tooltip-dialog': '打开Selective Rollback日志',
		'portlet-label-uncacher': '清除Selective Rollback缓存', // v4.4.3
		'dialog-label-summary': '编辑摘要',
		'dialog-label-summary-default': '默认编辑摘要',
		'dialog-label-summary-custom': '自定义',
		'dialog-label-summaryinput': '自定义编辑摘要',
		'dialog-help-summaryinput-$0': '<code>$0</code>将会被默认编辑摘要替代。',
		'dialog-help-summaryinput-$0-error': '<code>$0</code>将会被默认编辑摘要为<b>英文</b>替代。',
		'dialog-label-summarypreview': '编辑摘要的预览', // v4.0.0
		'dialog-help-summarypreview': '<code>{{PLURAL:$7}}</code>将被替换。', // Updated in v5.0.0
		'dialog-label-markbot': '标记为机器人编辑',
		'dialog-label-watchlist': '将回退目标加入监视列表', // Updated in v5.1.0
		'dialog-label-watchlistexpiry': '时间', // Deprecated since v5.0.0
		'dialog-label-watchlistexpiry-indefinite': '不限期',
		'dialog-label-watchlistexpiry-1week': '1周',
		'dialog-label-watchlistexpiry-1month': '1个月',
		'dialog-label-watchlistexpiry-3months': '3个月',
		'dialog-label-watchlistexpiry-6months': '6个月',
		'dialog-label-watchlistexpiry-1year': '1年',
		'dialog-button-rollback': '回退', // Updated in v5.0.0
		'dialog-button-documentation': '文档', // Added in v5.0.0
		'dialog-button-config': '配置', // v5.1.0
		'dialog-button-selectall': '全选', // Updated in v5.0.0
		'dialog-label-selectcount': '已选择:', // Added in v5.0.7
		'dialog-button-close': '关闭', // Deprecated since v5.0.0
		'rollback-notify-noneselected': '未选择任何勾选框。',
		'rollback-notify-linksresolved': '与该页面相关的回退全部完成。',
		'rollback-confirm': '您确定要回退该编辑吗?',
		'rollback-label-success': '已回退',
		'rollback-label-failure': '回退失败',
		'rollback-notify-success': '成功', // v4.0.0
		'rollback-notify-failure': '失败', // v4.0.0
		// v5.1.0 (review required)
		'config-title': '配置Selective Rollback',
		'config-tab-local': '本地',
		'config-tab-global': '全局',
		'config-notice-local': '本地设置仅适用于本项目，如存在全局设置，则可能（部分）覆盖全局设置。',
		'config-notice-global': '全局设置适用于所有项目，如存在本地设置，则可能被（部分）覆盖。',
		'config-default': '默认',
		'config-default-disabled': '已禁用',
		'config-default-enabled': '已启用',
		'config-label-lang': '语言',
		'config-help-lang': '用户在偏好中设置的界面语言；若无可用翻译，则使用英文。',
		'config-label-summary': '预设摘要',
		'config-label-propertyinput-key': '键',
		'config-label-propertyinput-value': '值',
		'config-error-propertyinput-key-empty': '键不能为空。',
		'config-error-propertyinput-value-empty': '值不能为空。',
		'config-error-propertyinput-key-reserved': '键"$1"是系统保留字，不能使用。',
		'config-error-propertyinput-key-duplicate': '键不能重复。',
		'config-button-add': '添加',
		'config-button-remove': '移除',
		'config-button-deselectall': '取消全选',
		'config-help-summary-$0': '<code>$0</code> — 本地维基的默认回退摘要',
		'config-help-summary-$1': '<code>$1</code> — 被恢复版本的作者用户名',
		'config-help-summary-$2': '<code>$2</code> — 被回退编辑的作者用户名',
		'config-help-summary-$3': '<code>$3</code> — 回退到的版本ID',
		'config-help-summary-$4': '<code>$4</code> — 回退到的版本时间戳',
		'config-help-summary-$5': '<code>$5</code> — 被回退版本的版本ID',
		'config-help-summary-$6': '<code>$6</code> — 被回退版本的时间戳',
		'config-help-summary-$7': '<code>$7</code> — 被回退的编辑数量',
		'config-label-showkeys': '在下拉菜单中显示键而非值',
		'config-label-mergesummaries': '合并全局配置中的摘要，而不是覆盖它们',
		'config-label-replacer': '替换表达',
		'config-help-replacer': '替换表达会在回退摘要中被替换为特定文本。建议<b>始终</b>以<code>$</code>或类似符号开头，以避免意外替换。',
		'config-label-mergereplacers': '合并全局配置中的置换表达，而不是覆盖它们',
		'config-label-watchlist': '监视列表',
		'config-label-watchlistexpiry': '监视列表过期时间',
		'config-label-confirmation': '回退确认',
		'config-label-confirmation-desktop': '桌面',
		'config-label-confirmation-mobile': '移动端',
		'config-label-confirmation-always': '总是确认',
		'config-label-confirmation-never': '从不确认',
		'config-label-confirmation-RCW': '在"最近更改"或"监视列表"页面时确认',
		'config-label-confirmation-nonRCW': '不在"最近更改"或"监视列表"页面时确认',
		'config-label-checkboxlabelcolor': '复选框标签颜色',
		'config-help-checkboxlabelcolor': '预览:',
		'config-label-miscellaneous': '其它',
		'config-help-markbot': '仅在您拥有所需权限时适用。',
		'config-label-configlink': '生成指向配置页面的端口链接',
		'config-label-purger': '生成清除缓存的端口栏链接',
		'config-button-save': '保存',
		'config-notify-save-success': '已保存设置。',
		'config-notify-save-failure': '保存设置失败：$1',
		'config-button-reset': '重置',
		'config-confirm-reset': '是否要将配置重置为默认值？更改需要手动保存。',
		'config-notify-reset': '字段值已重置为默认值。',
		'config-label-deleteglobal': '删除全局配置',
		'config-help-deleteglobal-absent': '您尚未设置任何全局配置。',
		'config-label-deletelocal': '删除本地配置',
		'config-help-deletelocal-absent': '您尚未设置任何本地配置。',
		'config-label-deletelocalall': '删除所有其他项目的本地配置',
		'config-help-deletelocalall-present': '要执行此操作，您需要登录到 $1。',
		'config-help-deletelocalall-absent': '您在其他项目上没有设置本地配置。',
		'config-label-deletedata': '删除数据',
		'config-button-deletedata': '删除',
		'config-confirm-deletedata': '确定要删除配置数据吗？此操作无法撤销。',
		'config-notify-deletedata-success': '已删除指定的配置数据。',
		'config-notify-deletedata-failure': '未能删除部分指定的配置数据。',
	},
	/**
	 * @author [[User:Codename Noreste]]
	 * @since 3.2.0
	 */
	es: {
		'scriptname': 'Selective Rollback', // Added in v5.0.1
		'portlet-tooltip-dialog': 'Abrir el cuadro de diálogo para Selective Rollback',
		'portlet-label-uncacher': 'Vaciar caché de Selective Rollback', // v4.4.3
		'dialog-label-summary': 'Resumen de edición',
		'dialog-label-summary-default': 'Resumen de edición predeterminado',
		'dialog-label-summary-custom': 'Personalizado',
		'dialog-label-summaryinput': 'Resumen de edición personalizada',
		'dialog-help-summaryinput-$0': '<code>$0</code> será reemplazado con el resumen de edición predeterminado.',
		'dialog-help-summaryinput-$0-error': '<code>$0</code> será reemplazado con él resumen de edición predeterminado <b>en inglés</b>.',
		'dialog-label-summarypreview': 'Vista previa del resumen', // v4.0.0
		'dialog-help-summarypreview': '<code>{{PLURAL:$7}}</code> será reemplazado.', // Updated in v5.0.0
		'dialog-label-markbot': 'Marcar las reversiones como ediciones del bot',
		'dialog-label-watchlist': 'Agregar objetivos de reversión a la lista de seguimiento', // Updated in v5.1.0
		'dialog-label-watchlistexpiry': 'Expiración', // Deprecated since v5.0.0
		'dialog-label-watchlistexpiry-indefinite': 'Siempre',
		'dialog-label-watchlistexpiry-1week': '1 semana',
		'dialog-label-watchlistexpiry-1month': '1 mes',
		'dialog-label-watchlistexpiry-3months': '3 meses',
		'dialog-label-watchlistexpiry-6months': '6 meses',
		'dialog-label-watchlistexpiry-1year': '1 años',
		'dialog-button-rollback': 'Revertir', // Updated in v5.0.0
		'dialog-button-documentation': 'Documentación', // Added in v5.0.0
		'dialog-button-config': 'Configurar', // v5.1.0
		'dialog-button-selectall': 'Seleccionar todo', // Updated in v5.0.0
		'dialog-label-selectcount': 'Seleccionado:', // Added in v5.0.7
		'dialog-button-close': 'Cerrar', // Deprecated since v5.0.0
		'rollback-notify-noneselected': 'No hay ninguna casilla de verificación marcada.',
		'rollback-notify-linksresolved': 'Los enlaces de reversión en esta página se han resuelto todos.',
		'rollback-confirm': '¿Estás seguro de que quieres revertir esta edición?',
		'rollback-label-success': 'revertido',
		'rollback-label-failure': 'la reversión falló',
		'rollback-notify-success': 'Éxito', // v4.0.0
		'rollback-notify-failure': 'Falla', // v4.0.0
		// v5.1.0 (review required)
		'config-title': 'Configurar Selective Rollback',
		'config-tab-local': 'Local',
		'config-tab-global': 'Global',
		'config-notice-local': 'La configuración local solo se aplica a este proyecto y puede (parcialmente) anular la configuración global si existe.',
		'config-notice-global': 'La configuración global se aplica a todos los proyectos y puede ser (parcialmente) anulada por la configuración local si existe.',
		'config-default': 'Predeterminado',
		'config-default-disabled': 'Desactivado',
		'config-default-enabled': 'Activado',
		'config-label-lang': 'Idioma',
		'config-help-lang': 'El idioma de la interfaz del usuario definido en las preferencias, o inglés si no hay traducciones disponibles.',
		'config-label-summary': 'Resúmenes predefinidos',
		'config-label-propertyinput-key': 'Clave',
		'config-label-propertyinput-value': 'Valor',
		'config-error-propertyinput-key-empty': 'La clave no puede estar vacía.',
		'config-error-propertyinput-value-empty': 'El valor no puede estar vacío.',
		'config-error-propertyinput-key-reserved': 'La clave "$1" está reservada por el sistema y no se permite usarla.',
		'config-error-propertyinput-key-duplicate': 'La clave no puede estar duplicada.',
		'config-button-add': 'Añadir',
		'config-button-remove': 'Eliminar',
		'config-button-deselectall': 'Deseleccionar todo',
		'config-help-summary-$0': '<code>$0</code> — resumen de reversión predeterminado del wiki local',
		'config-help-summary-$1': '<code>$1</code> — nombre de usuario del autor de la edición restaurada',
		'config-help-summary-$2': '<code>$2</code> — nombre de usuario del autor de las ediciones revertidas',
		'config-help-summary-$3': '<code>$3</code> — ID de la revisión a la que se vuelve',
		'config-help-summary-$4': '<code>$4</code> — marca de tiempo de la revisión a la que se vuelve',
		'config-help-summary-$5': '<code>$5</code> — ID de la revisión desde la cual se revierte',
		'config-help-summary-$6': '<code>$6</code> — marca de tiempo de la revisión desde la cual se revierte',
		'config-help-summary-$7': '<code>$7</code> — cantidad de ediciones revertidas',
		'config-label-showkeys': 'Usar claves en lugar de valores en las opciones del menú desplegable',
		'config-label-mergesummaries': 'Unir los resúmenes del ajuste global en lugar de reemplazarlos',
		'config-label-replacer': 'Expresiones de reemplazo',
		'config-help-replacer': 'Las expresiones de de reemplazo se sustituyen por textos específicos en un resumen de reversión. Se recomienda <b>siempre</b> comenzar con <code>$</code> u otro símbolo para evitar reemplazos accidentales.',
		'config-label-mergereplacers': 'Unir las expresiones de reemplazo del ajuste global en lugar de reemplazarlas',
		'config-label-watchlist': 'Lista de seguimiento',
		'config-label-watchlistexpiry': 'Caducidad de la lista de seguimiento',
		'config-label-confirmation': 'Confirmación de reversión',
		'config-label-confirmation-desktop': 'Escritorio',
		'config-label-confirmation-mobile': 'Móvil',
		'config-label-confirmation-always': 'Siempre confirmar',
		'config-label-confirmation-never': 'Nunca confirmar',
		'config-label-confirmation-RCW': 'Confirmar en CambiosRecientes o Seguimiento',
		'config-label-confirmation-nonRCW': 'Confirmar fuera de CambiosRecientes o Seguimiento',
		'config-label-checkboxlabelcolor': 'Color de la etiqueta del checkbox',
		'config-help-checkboxlabelcolor': 'Vista previa:',
		'config-label-miscellaneous': 'Varios',
		'config-help-markbot': 'Esta opción solo se aplica si tiene los permisos necesarios en el wiki.',
		'config-label-configlink': 'Generar un enlace de portlet a la página de configuración',
		'config-label-purger': 'Generar un enlace de portlet para limpiar la caché',
		'config-button-save': 'Guardar',
		'config-notify-save-success': 'Se guardó la configuración.',
		'config-notify-save-failure': 'No se pudo guardar la configuración: $1',
		'config-button-reset': 'Restablecer',
		'config-confirm-reset': '¿Deseas restablecer las configuraciones a sus valores predeterminados? Los cambios deberán guardarse manualmente.',
		'config-notify-reset': 'Los valores de los campos se han restablecido a sus valores predeterminados.',
		'config-label-deleteglobal': 'Eliminar configuración global',
		'config-help-deleteglobal-absent': 'No tienes ninguna configuración global establecida.',
		'config-label-deletelocal': 'Eliminar configuración local',
		'config-help-deletelocal-absent': 'No tienes ninguna configuración local establecida.',
		'config-label-deletelocalall': 'Eliminar configuración local en todos los demás proyectos',
		'config-help-deletelocalall-present': 'Para realizar esta acción, debes haber iniciado sesión en $1.',
		'config-help-deletelocalall-absent': 'No tienes configuraciones locales en otros proyectos.',
		'config-label-deletedata': 'Borrar datos',
		'config-button-deletedata': 'Borrar',
		'config-confirm-deletedata': '¿Seguro que deseas borrar los datos de configuración? Esta acción no se puede deshacer.',
		'config-notify-deletedata-success': 'Se eliminaron los datos de configuración especificados.',
		'config-notify-deletedata-failure': 'No se pudieron eliminar algunos de los datos de configuración especificados.',
	},
	/**
	 * @author [[User:NGC 54]]
	 * @since 3.3.0
	 */
	ro: {
		'scriptname': 'Selective Rollback', // Added in v5.0.1
		'portlet-tooltip-dialog': 'Deschide dialogul Selective Rollback',
		'portlet-label-uncacher': 'Șterge memoria cache pentru Selective Rollback', // v4.4.3
		'dialog-label-summary': 'Descrierea modificării',
		'dialog-label-summary-default': 'Descrierea implicită a modificării',
		'dialog-label-summary-custom': 'Personalizat',
		'dialog-label-summaryinput': 'Descriere personalizată a modificării',
		'dialog-help-summaryinput-$0': '<code>$0</code> va fi înlocuit cu descrierea implicită a revenirii.',
		'dialog-help-summaryinput-$0-error': '<code>$0</code> va fi înlocuit cu descrierea implicită a revenirii <b>în engleză</b>.',
		'dialog-label-summarypreview': 'Previzualizare descriere', // v4.0.0
		'dialog-help-summarypreview': '<code>{{PLURAL:$7}}</code> va fi înlocuit.', // Updated in v5.0.0
		'dialog-label-markbot': 'Marchează revenirile drept modificări făcute de robot',
		'dialog-label-watchlist': 'Adaugă țintele revenirii în lista de urmărire', // Updated in v5.1.0
		'dialog-label-watchlistexpiry': 'Expiră', // Deprecated since v5.0.0
		'dialog-label-watchlistexpiry-indefinite': 'Nelimitat',
		'dialog-label-watchlistexpiry-1week': '1 săptămână',
		'dialog-label-watchlistexpiry-1month': '1 lună',
		'dialog-label-watchlistexpiry-3months': '3 luni',
		'dialog-label-watchlistexpiry-6months': '6 luni',
		'dialog-label-watchlistexpiry-1year': '1 an',
		'dialog-button-rollback': 'Revino', // Updated in v5.0.0
		'dialog-button-documentation': 'Documentație', // Added in v5.0.0
		'dialog-button-config': 'Configurare', // v5.1.0
		'dialog-button-selectall': 'Selectează tot', // Updated in v5.0.0
		'dialog-label-selectcount': 'Selectat:', // Added in v5.0.7
		'dialog-button-close': 'Închide', // Deprecated since v5.0.0
		'rollback-notify-noneselected': 'Nu este bifată nicio căsuță bifabilă.',
		'rollback-notify-linksresolved': 'Toate legăturile de revenire de pe această pagină au fost utilizate.',
		'rollback-confirm': 'Ești sigur(ă) că vrei să revii asupra acestei modificări?',
		'rollback-label-success': 'revenit',
		'rollback-label-failure': 'revenire eșuată',
		'rollback-notify-success': 'Succes', // v4.0.0
		'rollback-notify-failure': 'Eșec', // v4.0.0
		// v5.1.0 (review required)
		'config-title': 'Configurare Selective Rollback',
		'config-tab-local': 'Local',
		'config-tab-global': 'Global',
		'config-notice-local': 'Configurația locală se aplică doar acestui proiect și poate (parțial) suprascrie configurația globală dacă există.',
		'config-notice-global': 'Configurația globală se aplică tuturor proiectelor și poate fi (parțial) suprascrisă de configurația locală dacă există.',
		'config-default': 'Implicit',
		'config-default-disabled': 'Dezactivat',
		'config-default-enabled': 'Activat',
		'config-label-lang': 'Limbă',
		'config-help-lang': 'Limba interfeței utilizatorului setată în preferințe sau engleza dacă traducerile nu sunt disponibile.',
		'config-label-summary': 'Rezumat predefinit',
		'config-label-propertyinput-key': 'Cheie',
		'config-label-propertyinput-value': 'Valoare',
		'config-error-propertyinput-key-empty': 'Cheia nu poate fi goală.',
		'config-error-propertyinput-value-empty': 'Valoarea nu poate fi goală.',
		'config-error-propertyinput-key-reserved': 'Cheia „$1” este rezervată de sistem și nu este permisă.',
		'config-error-propertyinput-key-duplicate': 'Cheia nu poate fi duplicată.',
		'config-button-add': 'Adaugă',
		'config-button-remove': 'Înlătură',
		'config-button-deselectall': 'Deselectează tot',
		'config-help-summary-$0': '<code>$0</code> — rezumatul implicit al revenirii pe wiki-ul local',
		'config-help-summary-$1': '<code>$1</code> — numele autorului reviziei restaurate',
		'config-help-summary-$2': '<code>$2</code> — numele autorului editărilor revinite',
		'config-help-summary-$3': '<code>$3</code> — ID-ul reviziei la care se revine',
		'config-help-summary-$4': '<code>$4</code> — timestampul reviziei la care se revine',
		'config-help-summary-$5': '<code>$5</code> — ID-ul reviziei de la care se revine',
		'config-help-summary-$6': '<code>$6</code> — timestampul reviziei de la care se revine',
		'config-help-summary-$7': '<code>$7</code> — numărul editărilor revinite',
		'config-label-showkeys': 'Folosește cheile în locul valorilor în opțiunile din meniu',
		'config-label-mergesummaries': 'Combină rezumatele din configurarea globală în loc să le înlocuiești',
		'config-label-replacer': 'Expresii de înlocuire',
		'config-help-replacer': 'Expresii de înlocuire sunt înlocuite cu texte specifice în rezumatul revenirii. Se recomandă <b>să înceapă întotdeauna</b> cu <code>$</code> sau un simbol similar pentru a evita înlocuirile nedorite.',
		'config-label-mergereplacers': 'Combină expresiile de înlocuire din configurarea globală în loc să le înlocuiești',
		'config-label-watchlist': 'Listă de urmărire',
		'config-label-watchlistexpiry': 'Expirarea listei de urmărire',
		'config-label-confirmation': 'Confirmare revenire',
		'config-label-confirmation-desktop': 'Desktop',
		'config-label-confirmation-mobile': 'Mobil',
		'config-label-confirmation-always': 'Confirmă întotdeauna',
		'config-label-confirmation-never': 'Nu confirma niciodată',
		'config-label-confirmation-RCW': 'Confirmă pe Schimbări recente sau Pagini urmărite',
		'config-label-confirmation-nonRCW': 'Confirmă în afara Schimbări recente sau Pagini urmărite',
		'config-label-checkboxlabelcolor': 'Culoarea etichetei checkbox-ului',
		'config-help-checkboxlabelcolor': 'Previzualizare:',
		'config-label-miscellaneous': 'Diverse',
		'config-help-markbot': 'Această opțiune se aplică doar dacă aveți drepturile necesare pe wiki.',
		'config-label-configlink': 'Generează un link de portlet către pagina de configurare',
		'config-label-purger': 'Genera un link de portlet pentru curățarea cache-ului',
		'config-button-save': 'Salvează',
		'config-notify-save-success': 'Configurările au fost salvate.',
		'config-notify-save-failure': 'Nu s-au putut salva configurările: $1',
		'config-button-reset': 'Resetați',
		'config-confirm-reset': 'Doriți să resetați configurațiile la valorile implicite? Modificările trebuie salvate manual.',
		'config-notify-reset': 'Valorile câmpurilor au fost resetate la valorile implicite.',
		'config-label-deleteglobal': 'Șterge configurația globală',
		'config-help-deleteglobal-absent': 'Nu ai nicio configurație globală setată.',
		'config-label-deletelocal': 'Șterge configurația locală',
		'config-help-deletelocal-absent': 'Nu ai nicio configurație locală setată.',
		'config-label-deletelocalall': 'Șterge configurația locală de pe toate celelalte proiecte',
		'config-help-deletelocalall-present': 'Pentru a efectua această acțiune, trebuie să fii autentificat pe $1.',
		'config-help-deletelocalall-absent': 'Nu ai nicio configurație locală pe alte proiecte.',
		'config-label-deletedata': 'Șterge datele',
		'config-button-deletedata': 'Șterge',
		'config-confirm-deletedata': 'Sigur vrei să ștergi datele de configurare? Această acțiune nu poate fi anulată.',
		'config-notify-deletedata-success': 'Datele de configurare specificate au fost șterse.',
		'config-notify-deletedata-failure': 'Nu s-au putut șterge unele dintre datele de configurare specificate.',
	},
	/**
	 * @author [[User:Hide on Rosé]]
	 * @since 4.1.0
	 */
	vi: {
		'scriptname': 'Selective Rollback', // Added in v5.0.1
		'portlet-tooltip-dialog': 'Mở hộp thoại Selective Rollback',
		'portlet-label-uncacher': 'Xóa bộ nhớ đệm Selective Rollback', // v4.4.3
		'dialog-label-summary': 'Tóm lược sửa đổi',
		'dialog-label-summary-default': 'Tóm lược sửa đổi mặc định',
		'dialog-label-summary-custom': 'Tuỳ chỉnh',
		'dialog-label-summaryinput': 'Tóm lược tuỳ chỉnh',
		'dialog-help-summaryinput-$0': '<code>$0</code> sẽ được thay bằng tóm lược sửa đổi mặc định.',
		'dialog-help-summaryinput-$0-error': '<code>$0</code> sẽ được thay bằng tóm lược sửa đổi mặc định <b>trong tiếng Anh</b>.',
		'dialog-label-summarypreview': 'Xem trước tóm lược', // v4.0.0
		'dialog-help-summarypreview': '<code>{{PLURAL:$7}}</code> sẽ được thay thế.', // Updated in v5.0.0
		'dialog-label-markbot': 'Đánh dấu là sửa đổi bot',
		'dialog-label-watchlist': 'Thêm mục tiêu hoàn tác vào danh sách theo dõi', // Updated in v5.1.0
		'dialog-label-watchlistexpiry': 'Thời hạn', // Deprecated since v5.0.0
		'dialog-label-watchlistexpiry-indefinite': 'Vô hạn',
		'dialog-label-watchlistexpiry-1week': '1 tuần',
		'dialog-label-watchlistexpiry-1month': '1 tháng',
		'dialog-label-watchlistexpiry-3months': '3 tháng',
		'dialog-label-watchlistexpiry-6months': '6 tháng',
		'dialog-label-watchlistexpiry-1year': '1 năm',
		'dialog-button-rollback': 'Lùi sửa', // Updated in v5.0.0
		'dialog-button-documentation': 'Tài liệu', // Added in v5.0.0
		'dialog-button-config': 'Cấu hình', // v5.1.0
		'dialog-button-selectall': 'Chọn tất cả', // Updated in v5.0.0
		'dialog-label-selectcount': 'Đã chọn:', // Added in v5.0.7
		'dialog-button-close': 'Đóng', // Deprecated since v5.0.0
		'rollback-notify-noneselected': 'Chưa chọn sửa đổi.',
		'rollback-notify-linksresolved': 'Đã xử lý tất cả liên kết lùi sửa.',
		'rollback-confirm': 'Bạn có muốn lùi sửa sửa đổi này không?',
		'rollback-label-success': 'đã lùi sửa',
		'rollback-label-failure': 'lùi lại không thành công',
		'rollback-notify-success': 'Thành công', // v4.0.0
		'rollback-notify-failure': 'Không thành công', // v4.0.0
		// v5.1.0 (review required)
		'config-title': 'Cấu hình Selective Rollback',
		'config-tab-local': 'Cục bộ',
		'config-tab-global': 'Toàn cục',
		'config-notice-local': 'Cài đặt cục bộ chỉ áp dụng cho dự án này và có thể (một phần) ghi đè cài đặt toàn cục nếu có.',
		'config-notice-global': 'Cài đặt toàn cục áp dụng cho tất cả dự án và có thể bị (một phần) ghi đè bởi cài đặt cục bộ nếu có.',
		'config-default': 'Mặc định',
		'config-default-disabled': 'Tắt',
		'config-default-enabled': 'Bật',
		'config-label-lang': 'Ngôn ngữ',
		'config-help-lang': 'Ngôn ngữ giao diện người dùng đã đặt trong Tùy chỉnh, hoặc tiếng Anh nếu không có bản dịch.',
		'config-label-summary': 'Tóm tắt đặt sẵn',
		'config-label-propertyinput-key': 'Khóa',
		'config-label-propertyinput-value': 'Giá trị',
		'config-error-propertyinput-key-empty': 'Khóa không được để trống.',
		'config-error-propertyinput-value-empty': 'Giá trị không được để trống.',
		'config-error-propertyinput-key-reserved': 'Khóa "$1" được hệ thống dành riêng nên không thể sử dụng.',
		'config-error-propertyinput-key-duplicate': 'Khóa không được trùng lặp.',
		'config-button-add': 'Thêm',
		'config-button-remove': 'Loại bỏ',
		'config-button-deselectall': 'Bỏ chọn tất cả',
		'config-help-summary-$0': '<code>$0</code> — tóm tắt hoàn tác mặc định của wiki cục bộ',
		'config-help-summary-$1': '<code>$1</code> — tên người dùng của tác giả bản sửa được khôi phục',
		'config-help-summary-$2': '<code>$2</code> — tên người dùng của tác giả các sửa bị hoàn tác',
		'config-help-summary-$3': '<code>$3</code> — ID phiên bản được hoàn tác tới',
		'config-help-summary-$4': '<code>$4</code> — thời gian của phiên bản được hoàn tác tới',
		'config-help-summary-$5': '<code>$5</code> — ID phiên bản bị hoàn tác',
		'config-help-summary-$6': '<code>$6</code> — thời gian của phiên bản bị hoàn tác',
		'config-help-summary-$7': '<code>$7</code> — số sửa bị hoàn tác',
		'config-label-showkeys': 'Dùng khóa thay vì giá trị trong menu thả xuống',
		'config-label-mergesummaries': 'Gộp các tóm tắt từ cấu hình toàn cục thay vì ghi đè chúng',
		'config-label-replacer': 'Thay thế biểu thức',
		'config-help-replacer': 'Thay thế biểu thức sẽ được đổi thành văn bản tương ứng trong tóm tắt hoàn tác. Khuyến nghị <b>luôn</b> bắt đầu bằng <code>$</code> hoặc ký hiệu tương tự để tránh thay thế ngoài ý muốn.',
		'config-label-mergereplacers': 'Gộp các biểu thức thay thế từ cấu hình toàn cục thay vì ghi đè chúng',
		'config-label-watchlist': 'Danh sách theo dõi',
		'config-label-watchlistexpiry': 'Thời hạn danh sách theo dõi',
		'config-label-confirmation': 'Xác nhận hoàn tác',
		'config-label-confirmation-desktop': 'Máy tính',
		'config-label-confirmation-mobile': 'Di động',
		'config-label-confirmation-always': 'Luôn xác nhận',
		'config-label-confirmation-never': 'Không bao giờ xác nhận',
		'config-label-confirmation-RCW': 'Xác nhận khi ở Thay đổi gần đây hoặc Trang tôi theo dõi',
		'config-label-confirmation-nonRCW': 'Xác nhận khi không ở Thay đổi gần đây hoặc Trang tôi theo dõi',
		'config-label-checkboxlabelcolor': 'Màu nhãn hộp kiểm',
		'config-help-checkboxlabelcolor': 'Xem trước:',
		'config-label-miscellaneous': 'Khác',
		'config-help-markbot': 'Tùy chọn này chỉ áp dụng khi bạn có quyền cần thiết trên wiki.',
		'config-label-configlink': 'Tạo liên kết portlet đến trang cấu hình',
		'config-label-purger': 'Tạo liên kết portlet để xóa bộ nhớ đệm',
		'config-button-save': 'Lưu',
		'config-notify-save-success': 'Đã lưu cấu hình.',
		'config-notify-save-failure': 'Không thể lưu cấu hình: $1',
		'config-button-reset': 'Đặt lại',
		'config-confirm-reset': 'Bạn có muốn đặt lại các cấu hình về giá trị mặc định không? Các thay đổi cần được lưu thủ công.',
		'config-notify-reset': 'Các giá trị của trường đã được đặt lại về giá trị mặc định.',
		'config-label-deleteglobal': 'Xóa cấu hình toàn cục',
		'config-help-deleteglobal-absent': 'Bạn chưa thiết lập bất kỳ cấu hình toàn cục nào.',
		'config-label-deletelocal': 'Xóa cấu hình cục bộ',
		'config-help-deletelocal-absent': 'Bạn chưa thiết lập bất kỳ cấu hình cục bộ nào.',
		'config-label-deletelocalall': 'Xóa cấu hình cục bộ trên tất cả các dự án khác',
		'config-help-deletelocalall-present': 'Để thực hiện thao tác này, bạn cần đăng nhập vào $1.',
		'config-help-deletelocalall-absent': 'Bạn không có cấu hình cục bộ nào trên các dự án khác.',
		'config-label-deletedata': 'Xóa dữ liệu',
		'config-button-deletedata': 'Xóa',
		'config-confirm-deletedata': 'Bạn có chắc chắn muốn xóa dữ liệu cấu hình không? Hành động này không thể hoàn tác.',
		'config-notify-deletedata-success': 'Đã xóa dữ liệu cấu hình được chỉ định.',
		'config-notify-deletedata-failure': 'Không thể xóa một số dữ liệu cấu hình được chỉ định.',
	},
	/**
	 * @author [[User:Gerges]]
	 * @since 5.0.1
	 */
	ar: {
		'scriptname': 'للتراجع الانتقائي', // Added in v5.0.1
		'portlet-tooltip-dialog': 'فتح نافذة التراجع الانتقائي',
		'portlet-label-uncacher': 'تطهير ذاكرة التخزين المؤقت للتراجع الانتقائي', // v4.4.3
		'dialog-label-summary': 'ملخص التعديل',
		'dialog-label-summary-default': 'ملخص التعديل الافتراضي',
		'dialog-label-summary-custom': 'مخصص',
		'dialog-label-summaryinput': 'ملخص تعديل مخصص',
		'dialog-help-summaryinput-$0': '<code>$0</code> سيتم استبداله بملخص التراجع الافتراضي.',
		'dialog-help-summaryinput-$0-error': '<code>$0</code> سيتم استبداله بملخص التراجع الافتراضي <b>باللغة الإنجليزية</b>.',
		'dialog-label-summarypreview': 'معاينة الملخص', // v4.0.0
		'dialog-help-summarypreview': 'سيتم استبدال الكلمات السحرية (مثل <code>{{PLURAL:$7}}</code>).', // Updated in v5.0.0
		'dialog-label-markbot': 'تمييز التراجعات كتحريرات بوت',
		'dialog-label-watchlist': 'أضف صفحات التراجع إلى قائمة المراقبة', // Updated in v5.1.0
		'dialog-label-watchlistexpiry': 'مدة الصلاحية', // Deprecated since v5.0.0
		'dialog-label-watchlistexpiry-indefinite': 'غير محددة',
		'dialog-label-watchlistexpiry-1week': 'أسبوع واحد',
		'dialog-label-watchlistexpiry-1month': 'شهر واحد',
		'dialog-label-watchlistexpiry-3months': '3 أشهر',
		'dialog-label-watchlistexpiry-6months': '6 أشهر',
		'dialog-label-watchlistexpiry-1year': 'سنة واحدة',
		'dialog-button-rollback': 'تراجع عن العناصر المحددة', // Updated in v5.0.0
		'dialog-button-documentation': 'التوثيق', // Added in v5.0.0
		'dialog-button-config': 'الإعداد', // v5.1.0
		'dialog-button-selectall': 'تحديد الكل', // Updated in v5.0.0
		'dialog-label-selectcount': 'المحدد:', // Added in v5.0.7
		'dialog-button-close': 'إغلاق', // Deprecated since v5.0.0
		'rollback-notify-noneselected': 'لم يتم تحديد أي مربع اختيار.',
		'rollback-notify-linksresolved': 'تم حل جميع روابط التراجع في هذه الصفحة.',
		'rollback-confirm': 'هل أنت متأكد أنك تريد التراجع عن هذا التعديل؟',
		'rollback-label-success': 'تم التراجع',
		'rollback-label-failure': 'فشل التراجع',
		'rollback-notify-success': 'تم بنجاح', // v4.0.0
		'rollback-notify-failure': 'فشل', // v4.0.0
		// v5.1.0 (review required)
		'config-title': 'تهيئة التراجع الانتقائي',
		'config-tab-local': 'محلي',
		'config-tab-global': 'عام',
		'config-notice-local': 'الإعدادات المحلية تنطبق فقط على هذا المشروع وقد (جزئياً) تتجاوز الإعدادات العامة إن وُجدت.',
		'config-notice-global': 'الإعدادات العامة تنطبق على جميع المشاريع وقد يتم (جزئياً) تجاوزها بواسطة الإعدادات المحلية إن وُجدت.',
		'config-default': 'افتراضي',
		'config-default-disabled': 'معطل',
		'config-default-enabled': 'مفعل',
		'config-label-lang': 'اللغة',
		'config-help-lang': 'لغة واجهة المستخدم كما هي في التفضيلات، أو الإنجليزية إذا لم تتوفر ترجمات.',
		'config-label-summary': 'ملخصات جاهزة',
		'config-label-propertyinput-key': 'المفتاح',
		'config-label-propertyinput-value': 'القيمة',
		'config-error-propertyinput-key-empty': 'يجب ألا يكون المفتاح فارغًا.',
		'config-error-propertyinput-value-empty': 'يجب ألا تكون القيمة فارغة.',
		'config-error-propertyinput-key-reserved': 'المفتاح "$1" محجوز من قبل النظام ولذلك لا يُسمح باستخدامه.',
		'config-error-propertyinput-key-duplicate': 'يجب ألا يكون المفتاح مكررًا.',
		'config-button-add': 'إضافة',
		'config-button-remove': 'إزالة',
		'config-button-deselectall': 'إلغاء تحديد الكل',
		'config-help-summary-$0': '<code>$0</code> — ملخص التراجع الافتراضي في هذا الويكي',
		'config-help-summary-$1': '<code>$1</code> — اسم مستخدم صاحب المراجعة المُستعادة',
		'config-help-summary-$2': '<code>$2</code> — اسم مستخدم صاحب المراجعات المُتراجَع عنها',
		'config-help-summary-$3': '<code>$3</code> — رقم المراجعة التي تم التراجع إليها',
		'config-help-summary-$4': '<code>$4</code> — الطابع الزمني للمراجعة التي تم التراجع إليها',
		'config-help-summary-$5': '<code>$5</code> — رقم المراجعة التي تم التراجع منها',
		'config-help-summary-$6': '<code>$6</code> — الطابع الزمني للمراجعة التي تم التراجع منها',
		'config-help-summary-$7': '<code>$7</code> — عدد التعديلات التي تم التراجع عنها',
		'config-label-showkeys': 'استخدم المفاتيح بدلاً من القيم في خيارات القائمة المنسدلة',
		'config-label-mergesummaries': 'دمج الملخصات من الإعدادات العالمية بدلاً من استبدالها',
		'config-label-replacer': 'عبارات الاستبدال',
		'config-help-replacer': 'تُستبدل الكلمات المفتاحية بنصوص معينة في ملخص التراجع. يُفضل <b>دائماً</b> أن تبدأ بـ <code>$</code> أو رمز مشابه لتجنب الاستبدالات غير المقصودة.',
		'config-label-mergereplacers': 'دمج تعبيرات الاستبدال من الإعدادات العالمية بدلاً من استبدالها',
		'config-label-watchlist': 'قائمة المراقبة',
		'config-label-watchlistexpiry': 'مدة قائمة المراقبة',
		'config-label-confirmation': 'تأكيد التراجع',
		'config-label-confirmation-desktop': 'سطح المكتب',
		'config-label-confirmation-mobile': 'الجوال',
		'config-label-confirmation-always': 'التأكيد دائماً',
		'config-label-confirmation-never': 'عدم التأكيد',
		'config-label-confirmation-RCW': 'التأكيد عند التواجد في أحدث التغييرات أو قائمة المراقبة',
		'config-label-confirmation-nonRCW': 'التأكيد عند عدم التواجد في أحدث التغييرات أو قائمة المراقبة',
		'config-label-checkboxlabelcolor': 'لون تسمية مربع الاختيار',
		'config-help-checkboxlabelcolor': 'معاينة:',
		'config-label-miscellaneous': 'متفرقات',
		'config-help-markbot': 'ينطبق هذا الخيار فقط إذا كان لديك الصلاحيات اللازمة في الويكي.',
		'config-label-configlink': 'إنشاء رابط منفذ إلى صفحة الإعدادات',
		'config-label-purger': 'إنشاء رابط بورتلت لمسح ذاكرة التخزين المؤقت',
		'config-button-save': 'حفظ',
		'config-notify-save-success': 'تم حفظ الإعدادات.',
		'config-notify-save-failure': 'فشل حفظ الإعدادات: $1',
		'config-button-reset': 'إعادة التعيين',
		'config-confirm-reset': 'هل تريد إعادة تعيين الإعدادات إلى القيم الافتراضية؟ يجب حفظ التغييرات يدويًا.',
		'config-notify-reset': 'تمت إعادة تعيين قيم الحقول إلى القيم الافتراضية.',
		'config-label-deleteglobal': 'حذف الإعدادات العامة',
		'config-help-deleteglobal-absent': 'ليس لديك أي إعدادات عامة مُكوّنة.',
		'config-label-deletelocal': 'حذف الإعدادات المحلية',
		'config-help-deletelocal-absent': 'ليس لديك أي إعدادات محلية مُكوّنة.',
		'config-label-deletelocalall': 'حذف الإعدادات المحلية في جميع المشاريع الأخرى',
		'config-help-deletelocalall-present': 'لإتمام هذه العملية، يجب أن تسجل الدخول في $1.',
		'config-help-deletelocalall-absent': 'ليس لديك أي إعدادات محلية في المشاريع الأخرى.',
		'config-label-deletedata': 'حذف البيانات',
		'config-button-deletedata': 'حذف',
		'config-confirm-deletedata': 'هل أنت متأكد أنك تريد حذف بيانات الإعداد؟ لا يمكن التراجع عن هذا الإجراء.',
		'config-notify-deletedata-success': 'تم حذف بيانات الإعداد المحددة.',
		'config-notify-deletedata-failure': 'فشل حذف بعض بيانات الإعداد المحددة.',
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

class SelectiveRollbackConfig {

	/**
	 * Creates a portlet link to the config page.
	 *
	 * This should be called after {@link SelectiveRollback.createCachePurger}.
	 */
	static createPortletLink() {
		mw.util.addPortletLink(
			mw.config.get('skin') === 'minerva' ? 'p-personal' : 'p-cactions',
			mw.util.getUrl('Special:SelectiveRollbackConfig'),
			msg['config-title'],
			'ca-sr-config',
			void 0,
			void 0,
			document.getElementById('ca-sr-uncacher') || '#ca-move'
		);
	}

	/**
	 * Returns the default configurations.
	 * @returns {Required<SelectiveRollbackConfigObject>}
	 * @private
	 */
	static get defaults() {
		return {
			lang: '',
			editSummaries: Object.create(null),
			showKeys: false,
			mergeSummaries: false,
			replacementExpressions: Object.create(null),
			mergeReplacers: false,
			watchlist: false,
			watchlistExpiry: 'indefinite',
			desktopConfirm: 'never',
			mobileConfirm: 'always',
			checkboxLabelColor: 'orange',
			markBot: true,
			configLink: false,
			purgerLink: false
		};
	}

	/**
	 * Returns a configuration object retrieved when all the field values are the default ones.
	 * @returns {Record<keyof SelectiveRollbackConfigObject, ?boolean>}
	 * @private
	 */
	get fieldDefaults() {
		return {
			lang: null,
			editSummaries: null,
			showKeys: false,
			mergeSummaries: false,
			replacementExpressions: null,
			mergeReplacers: false,
			watchlist: false,
			watchlistExpiry: null,
			desktopConfirm: null,
			mobileConfirm: null,
			checkboxLabelColor: null,
			markBot: true,
			configLink: false,
			purgerLink: false
		};
	}

	/**
	 * Retrieves `SelectiveRollbackConfigObject`, generated by merging all configuration objects.
	 * @returns {Required<SelectiveRollbackConfigObject>}
	 */
	static getMerged() {
		const local = this.get('local');
		const global = this.get('global');
		const legacy = global ? null : this.getLegacy(); // Disregard legacy config if already migrated
		const cfg = this.defaults;
		for (const obj of [legacy, global, local]) {
			if (!obj) {
				continue;
			}
			/**
			 * @param {string} key
			 * @returns {boolean}
			 */
			const shouldMergeObject = (key) => {
				return key !== 'editSummaries' ||
					('mergeSummaries' in obj && !!obj.mergeSummaries) ||
					('mergeReplacers' in obj && !!obj.mergeReplacers);
			};
			for (const [key, value] of Object.entries(obj)) {
				if (!(key in cfg)) {
					console.error('Unknown config key: ' + key);
					continue;
				}
				if (value === undefined || value === null) {
					continue;
				}
				if (isObject(value) && shouldMergeObject(key)) {
					// @ts-expect-error
					Object.assign(cfg[key], value);
				} else {
					// @ts-expect-error
					cfg[key] = value;
				}
			}
		}
		return cfg;
	}

	/**
	 * Retrieves `SelectiveRollbackConfigObject` for the given domain.
	 * @type {ConfigRetriever}
	 */
	static get(domain) {
		/** @type {?string} */
		let rawCfg = mw.user.options.get(this.keys[domain]);
		if (!rawCfg) {
			// @ts-expect-error
			return null;
		}
		try {
			return JSON.parse(rawCfg);
		} catch (_) {
			// @ts-expect-error
			return null;
		}
	}

	/**
	 * Sanitizes and retrieves the legacy config if defined by the user.
	 * @returns {?SelectiveRollbackConfigObjectLegacy}
	 * @private
	 */
	static getLegacy() {
		const userCfg = window.selectiveRollbackConfig;
		if (!isObject(userCfg)) {
			return null;
		}
		if (!this.deprecatedConfigWarned) {
			console.warn('Use of window.selectiveRollbackConfig has been deprecated. Please use Special:SelectiveRollbackConfig instead.');
			this.deprecatedConfigWarned = true;
		}

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
		const keyConvertMap = {
			specialExpressions:	'replacementExpressions',
			watchPage: 'watchlist',
			watchExpiry: 'watchlistExpiry',
			confirm: 'desktopConfirm'
		};

		/** @type {SelectiveRollbackConfigObjectLegacy} */
		const cfg = Object.create(null);
		const confirmVals = new Set(['never', 'always', 'RCW', 'nonRCW']);
		for (let [key, val] of Object.entries(userCfg)) {
			key = clean(key);
			if (typeof val === 'string') {
				val = clean(val);
			}

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
				let v = String(val);
				let m;
				if (/^(in|never)/.test(v)) {
					v = 'indefinite';
				} else if ((m = /^1\s*(week|month|year)/.exec(v))) {
					v = '1 ' + m[1];
				} else if ((m = /^([36])\s*month/.exec(v))) {
					v = m[1] + ' months';
				} else {
					errKeyVal(key, val);
					continue;
				}
				val = v;
			}

			// @ts-expect-error
			key = keyConvertMap[key] || key;
			// @ts-expect-error
			cfg[key] = val;
		}

		return cfg;
	}

	/**
	 * Initializes `Special:SelectiveRollbackConfig`.
	 * @returns {void}
	 */
	static init() {
		const pageName = msg['config-title'];
		document.title = pageName + ' - ' + mw.config.get('wgSiteName');
		const $heading = $('.mw-first-heading');
		const $content = $('.mw-body-content');
		if (!$heading.length || !$content.length) {
			return;
		}
		$heading.text(pageName).attr({ dir });
		$('.vector-page-toolbar').attr({ dir });
		$content.attr({ dir });

		const globalTabPanel = new OO.ui.TabPanelLayout('Global', {
			expanded: false,
			label: msg['config-tab-global'],
			scrollable: false
		});
		const localTabPanel = new OO.ui.TabPanelLayout('Local', {
			expanded: false,
			label: msg['config-tab-local'],
			scrollable: false
		});
		const miscTabPanel = new OO.ui.TabPanelLayout('Misc', {
			expanded: false,
			label: msg['config-label-miscellaneous'],
			scrollable: false
		});
		const index = new OO.ui.IndexLayout({
			expanded: false,
			framed: false
		}).addTabPanels([globalTabPanel, localTabPanel, miscTabPanel], 0);

		const $overlay = $('<div>').addClass('sr-config-overlay').hide();
		$content
			.empty()
			.append($overlay, index.$element)
			.css({ position: 'relative' });

		const miscTab = new SelectiveRollbackConfigMisc($overlay);
		const globalTab = new this('global', $overlay, miscTab);
		const localTab = new this('local', $overlay, miscTab);

		globalTabPanel.$element.append(
			new OO.ui.MessageWidget({
				classes: ['sr-config-notice'],
				type: 'notice',
				label: msg['config-notice-global']
			}).$element,
			globalTab.$element
		);
		localTabPanel.$element.append(
			new OO.ui.MessageWidget({
				classes: ['sr-config-notice'],
				type: 'notice',
				label: msg['config-notice-local']
			}).$element,
			localTab.$element
		);
		miscTabPanel.$element.append(
			miscTab.$element
		);

		const dirMismatch = document.dir !== dir;
		if (dirMismatch) {
			this.handleDirMismatch();
		}

		const beforeunloadMap = {
			local: localTab,
			global: globalTab
		};
		window.onbeforeunload = (e) => {
			const unsaved = Object.entries(beforeunloadMap).some(([k, field]) => {
				const key = /** @type {'local' | 'global'} */ (k);
				return !objectsEqual(this.get(key), field.retrieve());
			});
			if (unsaved) {
				e.preventDefault();
				e.returnValue = 'You have unsaved changes. Do you want to leave the page?';
			}
		};
	}

	/**
	 * @private
	 */
	static handleDirMismatch() {
		document.documentElement.classList.add('sr-config');
		const uiStart = dir === 'rtl' ? 'right' : 'left';
		const uiEnd = dir === 'rtl' ? 'left' : 'right';

		const style = document.createElement('style');
		if (langSwitch === 'ar') {
			style.textContent =
				'.sr-config .mw-page-container {' +
					'font-family: system-ui;' +
				'}';
		}
		style.textContent +=
			'.sr-config .vector-dropdown .vector-dropdown-checkbox {' +
				`${uiStart}: 0;` +
				`${uiEnd}: unset;` +
			'}' +
			'.sr-config #right-navigation .vector-dropdown-content {' +
				`${uiStart}: auto;` +
				`${uiEnd}: 0;` +
			'}' +
			'.sr-config .oo-ui-tabSelectWidget {' +
				'text-align: unset;' +
			'}' +
			'.sr-config .oo-ui-messageWidget > .oo-ui-labelElement-label {' +
				`margin-${uiStart}: 1.99999997em;` +
				`margin-${uiEnd}: unset;` +
			'}' +
			'.sr-config .oo-ui-fieldLayout .oo-ui-fieldLayout-help {' +
				`float: ${uiEnd};` +
			'}' +
			'.sr-config .oo-ui-fieldLayout.oo-ui-fieldLayout-align-top .oo-ui-fieldLayout-help,' +
			'.sr-config .oo-ui-fieldLayout.oo-ui-fieldLayout-align-inline .oo-ui-fieldLayout-help {' +
				`margin-${uiStart}: 0;` +
				`margin-${uiEnd}: -8px;` +
			'}' +
			'.sr-config .oo-ui-textInputWidget > .oo-ui-indicatorElement-indicator,' +
			'.sr-config .oo-ui-textInputWidget-labelPosition-after > .oo-ui-labelElement-label {' +
				`${uiStart}: unset;` +
				`${uiEnd}: 0;` +
			'}' +
			'.sr-config .sr-config-buttoncontainer > .oo-ui-buttonWidget {' +
				`margin-${uiStart}: unset;` +
				`margin-${uiEnd}: 8px;` +
			'}' +
			'.sr-config .oo-ui-fieldLayout.oo-ui-labelElement.oo-ui-fieldLayout-align-inline > .oo-ui-fieldLayout-body > .oo-ui-fieldLayout-header {' +
				`padding-${uiStart}: 6px;` +
				`padding-${uiEnd}: 0;` +
			'}' +
			'';
		document.head.appendChild(style);
	}

	/**
	 * @param {Exclude<ConfigDomain, 'localexists'>} domain
	 * @param {JQuery<HTMLElement>} $overlay
	 * @param {SelectiveRollbackConfigMisc} miscTab
	 * @private
	 */
	constructor(domain, $overlay, miscTab) {
		/** @type {SelectiveRollbackConfigObject} */
		const cfg = SelectiveRollbackConfig.get(domain) || Object.create(null);
		/** @type {OO.ui.Element[]} */
		const items = [];

		/** @param {keyof Messages} key */
		const helpTextForDefaultValueByKey = (key) => {
			return msg['config-default'] + ': ' + msg[key];
		};
		/** @param {string} value */
		const helpTextForDefaultValueByValue = (value) => {
			return msg['config-default'] + ': ' + value;
		};
		const defaultDropdownOption = () => {
			return new OO.ui.MenuOptionWidget({
				data: null,
				label: `(${msg['config-default']})`
			});
		};

		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 * @private
		 */
		this.$overlay = $overlay;
		/**
		 * @type {Exclude<ConfigDomain, 'localexists'>}
		 * @readonly
		 * @private
		 */
		this.domain = domain;
		const isLocal = domain === 'local';

		/**
		 * @type {SelectiveRollbackConfigMisc}
		 * @readonly
		 * @private
		 */
		this.miscTab = miscTab;
		this.miscTab.onConfigDeleted((types) => {
			if (types.includes(this.domain)) {
				this.resetFields();
			}
		});

		/**
		 * @type {OO.ui.DropdownWidget}
		 * @readonly
		 * @private
		 */
		this.lang = new OO.ui.DropdownWidget({
			menu: {
				items: [
					defaultDropdownOption(),
					...Object.keys(SelectiveRollback.i18n).map((key) => {
						return new OO.ui.MenuOptionWidget({ data: key, label: key });
					})
				]
			},
		});
		this.lang.getMenu().selectItemByData(cfg.lang || null);
		items.push(
			new OO.ui.FieldLayout(this.lang, {
				align: 'top',
				label: $headingLabel().text(msg['config-label-lang']),
				help: helpTextForDefaultValueByKey('config-help-lang'),
				helpInline: true
			})
		);

		/**
		 * @type {KeyValueCollection}
		 * @readonly
		 * @private
		 */
		this.editSummaries = new KeyValueCollection(new Set(['other']));

		if (cfg.editSummaries) {
			for (const [key, value] of Object.entries(cfg.editSummaries)) {
				this.editSummaries.add(key, value);
			}
		}
		items.push(
			new OO.ui.FieldLayout(this.editSummaries.widget, {
				align: 'top',
				help: new OO.ui.HtmlSnippet(
					'<ul>' +
					// @ts-expect-error
					[...Array(8)].map((_, i) => '<li>' + msg[`config-help-summary-$${i}`] + '</li>').join('') +
					'</ul>'
				),
				label: $headingLabel().text(msg['config-label-summary'])
			}),
			new OO.ui.FieldLayout(this.editSummaries.buttons, {
				classes: ['sr-config-propertyfield-buttoncontainer']
			})
		);

		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 * @private
		 */
		this.showKeys = new OO.ui.CheckboxInputWidget({
			selected: cfg.showKeys
		});
		items.push(
			new OO.ui.FieldLayout(this.showKeys, {
				align: 'inline',
				label: msg['config-label-showkeys'],
				help: helpTextForDefaultValueByKey('config-default-disabled'),
				helpInline: true
			})
		);

		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 * @private
		 */
		this.mergeSummaries = new OO.ui.CheckboxInputWidget({
			selected: cfg.mergeSummaries
		});
		if (isLocal) {
			items.push(
				new OO.ui.FieldLayout(this.mergeSummaries, {
					align: 'inline',
					label: msg['config-label-mergesummaries'],
					help: helpTextForDefaultValueByKey('config-default-disabled'),
					helpInline: true
				})
			);
		}

		/**
		 * @type {KeyValueCollection}
		 * @readonly
		 * @private
		 */
		this.replacementExpressions = new KeyValueCollection();

		if (cfg.replacementExpressions) {
			for (const [key, value] of Object.entries(cfg.replacementExpressions)) {
				this.replacementExpressions.add(key, value);
			}
		}
		items.push(
			new OO.ui.FieldLayout(this.replacementExpressions.widget, {
				align: 'top',
				label: $headingLabel().text(msg['config-label-replacer']),
				help: new OO.ui.HtmlSnippet(msg['config-help-replacer'])
			}),
			new OO.ui.FieldLayout(this.replacementExpressions.buttons, {
				classes: ['sr-config-propertyfield-buttoncontainer']
			})
		);

		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 * @private
		 */
		this.mergeReplacers = new OO.ui.CheckboxInputWidget({
			selected: cfg.mergeReplacers
		});
		if (isLocal) {
			items.push(
				new OO.ui.FieldLayout(this.mergeReplacers, {
					align: 'inline',
					label: msg['config-label-mergereplacers'],
					help: helpTextForDefaultValueByKey('config-default-disabled'),
					helpInline: true
				})
			);
		}

		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 * @private
		 */
		this.watchlist = new OO.ui.CheckboxInputWidget({
			selected: cfg.watchlist
		});
		items.push(
			new OO.ui.FieldLayout(
				new OO.ui.LabelWidget({
					label: $headingLabel().text(msg['config-label-watchlist'])
				})
			),
			new OO.ui.FieldLayout(this.watchlist, {
				align: 'inline',
				label: msg['dialog-label-watchlist'],
				help: helpTextForDefaultValueByKey('config-default-disabled'),
				helpInline: true
			})
		);

		/**
		 * @type {OO.ui.DropdownWidget}
		 * @readonly
		 * @private
		 */
		this.watchlistExpiry = new OO.ui.DropdownWidget({
			menu: {
				items: [
					defaultDropdownOption(),
					...getWatchlistExpiryOptions()
				]
			},
		});
		this.watchlistExpiry.getMenu().selectItemByData(cfg.watchlistExpiry || null);
		items.push(
			new OO.ui.FieldLayout(this.watchlistExpiry, {
				align: 'top',
				label: msg['config-label-watchlistexpiry'],
				help: helpTextForDefaultValueByKey('dialog-label-watchlistexpiry-indefinite'),
				helpInline: true
			})
		);

		const generateConfirmationOptions = () => {
			/** @type {SRConfirm[]} */
			const values = ['always', 'never', 'RCW', 'nonRCW'];
			const options = values.map((val) => {
				return new OO.ui.MenuOptionWidget({
					data: val,
					label: msg[`config-label-confirmation-${val}`]
				});
			});
			return [defaultDropdownOption()].concat(options);
		};

		/**
		 * @type {OO.ui.DropdownWidget}
		 * @readonly
		 * @private
		 */
		this.desktopConfirm = new OO.ui.DropdownWidget({
			menu: {
				items: generateConfirmationOptions()
			}
		});
		this.desktopConfirm.getMenu().selectItemByData(cfg.desktopConfirm || null);

		/**
		 * @type {OO.ui.DropdownWidget}
		 * @readonly
		 * @private
		 */
		this.mobileConfirm = new OO.ui.DropdownWidget({
			menu: {
				items: generateConfirmationOptions()
			}
		});
		this.mobileConfirm.getMenu().selectItemByData(cfg.mobileConfirm || null);

		items.push(
			new OO.ui.FieldLayout(
				new OO.ui.LabelWidget({
					label: $headingLabel().text(msg['config-label-confirmation'])
				})
			),
			new OO.ui.FieldLayout(this.desktopConfirm, {
				align: 'top',
				label: msg['config-label-confirmation-desktop'],
				help: helpTextForDefaultValueByKey('config-label-confirmation-never'),
				helpInline: true
			}),
			new OO.ui.FieldLayout(this.mobileConfirm, {
				align: 'top',
				label: msg['config-label-confirmation-mobile'],
				help: helpTextForDefaultValueByKey('config-label-confirmation-always'),
				helpInline: true
			})
		);

		/**
		 * @type {OO.ui.TextInputWidget}
		 * @readonly
		 * @private
		 */
		this.checkboxLabelColor = new OO.ui.TextInputWidget({
			value: cfg.checkboxLabelColor
		});

		const labelColorPreviewId = 'sr-config-labelcolor-preview-' + domain;
		let /** @type {NodeJS.Timeout} */ labelColorTimeout;
		this.checkboxLabelColor.on('change', (value) => {
			clearTimeout(labelColorTimeout);
			labelColorTimeout = setTimeout(() => {
				$('#' + labelColorPreviewId).css({ color: clean(value) || 'orange' });
			}, 500);
		});
		this.checkboxLabelColor.emit('change', this.checkboxLabelColor.getValue());

		items.push(
			new OO.ui.FieldLayout(this.checkboxLabelColor, {
				align: 'top',
				label: $headingLabel().text(msg['config-label-checkboxlabelcolor']),
				help: new OO.ui.HtmlSnippet(
					'(' + helpTextForDefaultValueByValue('orange') + ') ' +
					msg['config-help-checkboxlabelcolor'] + ` <b id="${labelColorPreviewId}">SR</b>`
				),
				helpInline: true
			})
		);

		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 * @private
		 */
		this.markBot = new OO.ui.CheckboxInputWidget({
			selected: typeof cfg.markBot === 'boolean' ? cfg.markBot : true
		});
		items.push(
			new OO.ui.FieldLayout(
				new OO.ui.LabelWidget({
					label: $headingLabel().text(msg['config-label-miscellaneous'])
				})
			),
			new OO.ui.FieldLayout(this.markBot, {
				align: 'inline',
				label: msg['dialog-label-markbot'],
				help: '(' + helpTextForDefaultValueByKey('config-default-enabled') + ') ' +
					msg['config-help-markbot'],
				helpInline: true
			})
		);

		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 * @private
		 */
		this.configLink = new OO.ui.CheckboxInputWidget({
			selected: cfg.configLink
		});
		items.push(
			new OO.ui.FieldLayout(this.configLink, {
				align: 'inline',
				label: msg['config-label-configlink'],
				help: helpTextForDefaultValueByKey('config-default-disabled'),
				helpInline: true
			})
		);

		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 * @private
		 */
		this.purgerLink = new OO.ui.CheckboxInputWidget({
			selected: cfg.purgerLink
		});
		items.push(
			new OO.ui.FieldLayout(this.purgerLink, {
				align: 'inline',
				label: msg['config-label-purger'],
				help: helpTextForDefaultValueByKey('config-default-disabled'),
				helpInline: true
			})
		);

		/**
		 * @type {InstanceType<ReturnType<PendingButtonWidgetFactory>>}
		 * @readonly
		 * @private
		 */
		this.saveButton = new (PendingButtonWidgetFactory())({
			flags: ['primary', 'progressive'],
			label: msg['config-button-save']
		});
		this.saveButton.on('click', () => this.save());

		/**
		 * @type {OO.ui.ButtonWidget}
		 * @readonly
		 * @private
		 */
		this.resetButton = new OO.ui.ButtonWidget({
			label: msg['config-button-reset']
		});
		this.resetButton.on('click', async () => {
			const confirmed = await OO.ui.confirm(
				$('<div>').text(msg['config-confirm-reset']),
				{ size: 'medium' }
			);
			if (confirmed) {
				this.resetFields();
				mw.notify(msg['config-notify-reset']);
			}
		});

		const buttonContainer = new OO.ui.Widget({
			$element: $('<div>').addClass('sr-config-buttoncontainer'),
			content: [
				this.saveButton,
				this.resetButton
			]
		});
		items.push(
			new OO.ui.FieldLayout(buttonContainer)
		);

		/**
		 * @type {OO.ui.FieldsetLayout}
		 * @readonly
		 * @private
		 */
		this.fieldset = new OO.ui.FieldsetLayout();
		this.fieldset.addItems(items);

		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 */
		this.$element = this.fieldset.$element;
	}

	/**
	 * Retrieves a SelectiveRollbackConfigObject from the fields.
	 * @returns {?SelectiveRollbackConfigObject} `null` if there is a blocker.
	 * @private
	 */
	retrieve() {
		const editSummaries = this.editSummaries.collect();
		if (!editSummaries) {
			return null;
		}
		const replacementExpressions = this.replacementExpressions.collect();
		if (!replacementExpressions) {
			return null;
		}

		/**
		 * @param {OO.ui.DropdownWidget} dropdown
		 * @returns {?string}
		 */
		const getDropdownValue = (dropdown) => {
			const selected = dropdown.getMenu().findFirstSelectedItem();
			if (!selected) {
				console.error('No dropdown option is selected.', dropdown);
			}
			return selected && /** @type {?string} */ (selected.getData());
		};

		/** @type {import('./window/Selective Rollback.d.ts').NullableNonBoolean<Required<SelectiveRollbackConfigObject>>} */
		const ret = {
			lang: getDropdownValue(this.lang),
			editSummaries: !$.isEmptyObject(editSummaries) ? editSummaries : null,
			showKeys: this.showKeys.isSelected(),
			mergeSummaries: this.mergeSummaries.isSelected(),
			replacementExpressions: !$.isEmptyObject(replacementExpressions) ? replacementExpressions : null,
			mergeReplacers: this.mergeReplacers.isSelected(),
			watchlist: this.watchlist.isSelected(),
			watchlistExpiry: /** @type {?WatchlistExpiry} */ (getDropdownValue(this.watchlistExpiry)),
			desktopConfirm: /** @type {?SRConfirm} */ (getDropdownValue(this.desktopConfirm)),
			mobileConfirm: /** @type {?SRConfirm} */ (getDropdownValue(this.mobileConfirm)),
			checkboxLabelColor: clean(this.checkboxLabelColor.getValue()) || null,
			markBot: this.markBot.isSelected(),
			configLink: this.configLink.isSelected(),
			purgerLink: this.purgerLink.isSelected()
		};

		// Return an empty object when all the field values are defaults, so that save()
		// will convert it to null to reset the option on the server
		const defaults = this.fieldDefaults;
		if (objectsEqual(ret, defaults)) {
			return Object.create(null);
		}

		// Strip boolean fields that match defaults
		for (const [key, defaultValue] of Object.entries(defaults)) {
			const k = /** @type {keyof SelectiveRollbackConfigObject} */ (key);
			if (typeof ret[k] === 'boolean' && ret[k] === defaultValue) {
				delete ret[k];
			}
		}

		// Return a SelectiveRollbackConfigObject without undefined or null values
		return Object.entries(ret).reduce((acc, [key, value]) => {
			if (value !== undefined && value !== null) {
				acc[key] = value;
			}
			return acc;
		}, Object.create(null));
	}

	/**
	 * Saves configurations as specified in the fields.
	 *
	 * This serves as a click handler for {@link saveButton}.
	 *
	 * @returns {Promise<void>}
	 * @private
	 */
	async save() {
		let options = this.retrieve();
		console.log(options); // TODO: Remove this
		if (!options) {
			return; // There is a blocker
		}

		this.saveButton.setPending();
		this.$overlay.show();
		if ($.isEmptyObject(options)) {
			options = null;
		}

		const /** @type {Record<string, ?string>} */ localChange = Object.create(null);
		const /** @type {Record<string, ?string>} */ globalChange = Object.create(null);
		const isLocal = this.domain === 'local';
		const key = SelectiveRollbackConfig.keys[this.domain];
		const value = options && JSON.stringify(options);
		const change = isLocal ? localChange : globalChange;
		change[key] = value;

		if (isLocal) {
			Object.assign(globalChange, SelectiveRollbackConfig.getWikiIdOptions(value ? 'add' : 'delete'));
		}

		const promises = [];
		if (!$.isEmptyObject(localChange)) {
			promises.push(SelectiveRollbackConfig.saveOptions(localChange, 'options'));
		}
		if (!$.isEmptyObject(globalChange)) {
			promises.push(SelectiveRollbackConfig.saveOptions(globalChange, 'globalpreferences'));
		}

		// Remove null (= success) from the results and deduplicate error codes
		const codes = (await Promise.all(promises)).filter((r, i, arr) => r !== null && arr.indexOf(r) === i);
		if (codes.length) {
			mw.notify(mw.format(msg['config-notify-save-failure'], codes.join(', ')), {
				type: 'error',
				autoHideSeconds: 'long'
			});
		} else {
			mw.notify(msg['config-notify-save-success'], { type: 'success' });
		}

		this.miscTab.updateCheckboxes();
		this.saveButton.unsetPending();
		this.$overlay.hide();
	}

	/**
	 * Returns an object keyed by `userjs-selectiverollback-localexists` for the GlobalPreferences API.
	 *
	 * This option tracks wikis where local options exist for Selective Rollback.
	 *
	 * @param {'add' | 'delete'} method How to handle the local wiki ID(s).
	 * @param {string[]} [wikiIDs] Optional wiki IDs to process in accordance with `method`. Defaults to
	 * the local wiki ID.
	 * @returns {Record<string, ?string>} An object in the form of:
	 * ```json
	 * {
	 * 	"userjs-selectiverollback-localexists": "Stringified `localexists` options or null"
	 * }
	 * ```
	 * where a `null` value means that the user option should be reset.
	 *
	 * If no change is needed, this method returns an empty object.
	 */
	static getWikiIdOptions(method, wikiIDs) {
		/** @type {Record<string, string>} */
		let cfg = this.get('localexists') || Object.create(null);
		if (wikiIDs && method !== 'delete') {
			throw new Error('Constructing API endpoints for foreign wikis is not supported.');
		}
		wikiIDs = wikiIDs || [wgWikiID];

		let changed = false;
		for (const wikiID of wikiIDs) {
			if ((method === 'add' && wikiID in cfg) || (method === 'delete' && !(wikiID in cfg))) {
				// No change needed
			} else if (method === 'add') {
				cfg[wikiID] = mw.config.get('wgServer') + mw.util.wikiScript('api');
				changed = true;
			} else if (method === 'delete') {
				delete cfg[wikiID];
				changed = true;
			}
		}

		if (!changed) {
			return Object.create(null); // No change needed
		}
		const value = $.isEmptyObject(cfg) ? null : JSON.stringify(cfg);
		return { [this.keys.localexists]: value };
	}

	/**
	 * Saves user options via the API.
	 *
	 * @param {Record<string, ?string>} change Object mapping from option keys to their values.
	 * Keys valued with `null` will be reset.
	 * @param {'options' | 'globalpreferences'} action
	 * @param {mw.ForeignApi} [foreignApi] Optional `mw.ForeignApi` instance to use, if the options
	 * should be saved to a foreign wiki instead of the local one.
	 * @returns {JQuery.Promise<?string>} `null` on success, or an error code on failure.
	 */
	static saveOptions(change, action, foreignApi) {
		if (foreignApi && action === 'globalpreferences') {
			console.error('There is no need to access the foreign API to save global preferences.');
		}
		return (foreignApi || api).postWithEditToken({
			action,
			change: Object.entries(change).reduce((acc, [key, value]) => {
				acc += '\u001F' + key;
				if (value !== null) {
					acc += '=' + value;
				}
				return acc;
			}, ''),
			assertuser: wgUserName
		}).then(() => {
			mw.user.options.set(change);
			return null;
		}).catch((code, err) => {
			console.warn(err);
			return code === 'assertuserfailed' ? 'notloggedin' : code;
		});
	}

	/**
	 * Resets the config fields with default values.
	 * @returns {void}
	 * @private
	 */
	resetFields() {
		const defaults = this.fieldDefaults;
		for (const key of /** @type {(keyof typeof defaults)[]} */ (Object.keys(defaults))) {
			if (!(key in this)) {
				continue;
			}
			const value = defaults[key];
			const widget = this[key];
			if (widget instanceof OO.ui.DropdownWidget) {
				widget.getMenu().selectItemByData(value);
			} else if (widget instanceof KeyValueCollection) {
				widget.removeAll();
			} else if (widget instanceof OO.ui.CheckboxInputWidget) {
				widget.setSelected(!!value);
			} else if (widget instanceof OO.ui.TextInputWidget) {
				widget.setValue('');
			} else {
				console.error('Encountered an unknown widget', widget);
			}
		}
	}

}
SelectiveRollbackConfig.keys = {
	local: 'userjs-selectiverollback-local',
	global: 'userjs-selectiverollback-global',
	localexists: 'userjs-selectiverollback-localexists'
};
SelectiveRollbackConfig.deprecatedConfigWarned = false;

/**
 * Performs a shallow-to-moderate structural equality check between two plain objects.
 *
 * **What this function supports**
 * - Plain objects (`Record<string, any>`).
 * - Primitive values.
 * - Arrays (shallow comparison only; elements must be strictly equal).
 * - Nested plain objects (recursively, with the same rules).
 *
 * **Limitations**
 * - Class instances, Dates, Maps, Sets, RegExps, and other non-plain objects are **not** supported.
 * - Arrays are compared **only shallowly** (no deep comparison of nested arrays).
 * - Prototype chains are ignored — only own, enumerable string keys are compared.
 * - Circular references are **not** supported and will cause infinite recursion.
 * - Objects must have exactly the same set of keys to be considered equal.
 *
 * **Null handling**
 * - Two `null` values are considered equal.
 * - A `null` value compared with a non-null object is considered unequal.
 *
 * @param {?Record<string, any>} obj1 The first object to compare.
 * @param {?Record<string, any>} obj2 The second object to compare.
 * @returns {boolean} `true` if both values are considered equal under the rules above.
 */
function objectsEqual(obj1, obj2) {
	if (obj1 === null && obj2 === null) {
		return true;
	}
	if (!isObject(obj1) || !isObject(obj2)) {
		return false;
	}

	const keys1 = Object.keys(obj1);
	const keys2 = Object.keys(obj2);
	if (keys1.length !== keys2.length) {
		return false;
	}

	return keys1.every(key => {
		if (!(key in obj2)) {
			return false;
		}
		const v1 = obj1[key];
		const v2 = obj2[key];

		// Array comparison
		if (Array.isArray(v1) || Array.isArray(v2)) {
			return (
				Array.isArray(v1) &&
				Array.isArray(v2) &&
				v1.length === v2.length &&
				v1.every((el, i) => el === v2[i])
			);
		}

		// Nested plain object
		if (isObject(v1) && isObject(v2)) {
			return objectsEqual(v1, v2);
		}

		// Primitive or mismatched types
		return v1 === v2;
	});
}

/**
 * @param {unknown} obj
 * @returns {obj is Record<string, any>}
 */
function isObject(obj) {
	return typeof obj === 'object' && !Array.isArray(obj) && obj !== null;
}

/**
 * Returns a jQuery object for the `label` parameter of `OO.ui.FieldLayout`.
 * @returns {JQuery<HTMLElement>}
 */
function $headingLabel() {
	return $('<b>').addClass('sr-config-headinglabel');
}

class SelectiveRollbackConfigMisc {

	/**
	 * @param {JQuery<HTMLElement>} $overlay
	 */
	constructor($overlay) {
		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 * @private
		 */
		this.$overlay = $overlay;
		/**
		 * @type {DeleteConfigCallback[]}
		 * @readonly
		 * @private
		 */
		this.deleteConfigCallbacks = [];

		/** @type {OO.ui.Element[]} */
		const items = [];

		items.push(
			new OO.ui.FieldLayout(new OO.ui.LabelWidget({
				label: $headingLabel().text(msg['config-label-deletedata'])
			}))
		);

		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 * @private
		 */
		this.purgeCache = new OO.ui.CheckboxInputWidget();
		items.push(
			new OO.ui.FieldLayout(this.purgeCache, {
				align: 'inline',
				label: msg['portlet-label-uncacher']
			})
		);

		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 * @private
		 */
		this.deleteGlobal = new OO.ui.CheckboxInputWidget();
		items.push(
			new OO.ui.FieldLayout(this.deleteGlobal, {
				align: 'inline',
				label: msg['config-label-deleteglobal'],
				help: new OO.ui.HtmlSnippet('<span id="sr-config-help-deleteglobal"></span>'),
				helpInline: true
			})
		);

		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 * @private
		 */
		this.deleteLocal = new OO.ui.CheckboxInputWidget();
		items.push(
			new OO.ui.FieldLayout(this.deleteLocal, {
				align: 'inline',
				label: msg['config-label-deletelocal'],
				help: new OO.ui.HtmlSnippet('<span id="sr-config-help-deletelocal"></span>'),
				helpInline: true
			})
		);

		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 * @private
		 */
		this.deleteLocalAll = new OO.ui.CheckboxInputWidget();
		items.push(
			new OO.ui.FieldLayout(this.deleteLocalAll, {
				align: 'inline',
				label: msg['config-label-deletelocalall'],
				help: new OO.ui.HtmlSnippet('<span id="sr-config-help-deletelocalall"></span>'),
				helpInline: true
			})
		);

		/**
		 * @type {InstanceType<ReturnType<typeof PendingButtonWidgetFactory>>}
		 * @readonly
		 * @private
		 */
		this.deleteButton = new (PendingButtonWidgetFactory())({
			flags: ['primary', 'destructive'],
			label: msg['config-button-deletedata']
		});
		this.deleteButton.on('click', async () => {
			const confirmed = await OO.ui.confirm(
				msg['config-confirm-deletedata'],
				{ size: 'medium' }
			);
			if (confirmed) {
				this.doDelete();
			}
		});
		items.push(
			new OO.ui.FieldLayout(this.deleteButton)
		);

		[
			this.purgeCache,
			this.deleteGlobal,
			this.deleteLocal,
			this.deleteLocalAll
		]
		.forEach((checkbox) => {
			checkbox.on('change', () => this.updateDeleteButtonAccessibility());
		});

		const fieldset = new OO.ui.FieldsetLayout();
		fieldset.addItems(items);

		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 */
		this.$element = fieldset.$element;

		// Must wait for the browser's repaint for the widgets just added,
		// to ensure updateCheckboxes() works properly
		window.requestAnimationFrame(() => this.updateCheckboxes());
	}

	/**
	 * @param {DeleteConfigCallback} callback
	 */
	onConfigDeleted(callback) {
		this.deleteConfigCallbacks.push(callback);
	}

	/**
	 * @private
	 */
	updateDeleteButtonAccessibility() {
		const enable = Object.values(this.collect()).some(Boolean);
		this.deleteButton.setDisabled(!enable);
	}

	/**
	 * Retrives an object mapping from checkbox property names in `this` to
	 * the checked states of the checkboxes.
	 * @private
	 */
	collect() {
		/** @param {OO.ui.CheckboxInputWidget} widget */
		const falseFallback = (widget) => {
			return !widget.isDisabled() ? widget.isSelected() : false;
		};
		return {
			purgeCache: falseFallback(this.purgeCache),
			deleteGlobal: falseFallback(this.deleteGlobal),
			deleteLocal: falseFallback(this.deleteLocal),
			deleteLocalAll: falseFallback(this.deleteLocalAll)
		};
	}

	/**
	 * Retrieves the given help element injected to `OO.ui.FieldLayout`.
	 *
	 * This serves as a workaround for the technical limitation that `OO.ui.FieldLayout` does not
	 * accept a jQuery object for its `help` configuration parameter, meaning no such jQuery objects
	 * can be registered as instance properties for this class.
	 *
	 * @param {'deleteglobal' | 'deletelocal' | 'deletelocalall' | 'deletelocalall-list'} target
	 * @returns {JQuery<HTMLElement>}
	 * @private
	 */
	getHelpElement(target) {
		const id = 'sr-config-help-' + target;
		const el = document.getElementById(id);
		if (!el) {
			console.error(`Could not find #${id}`);
		}
		return $(el || []);
	}

	/**
	 * Updates checkboxes used to specify what kind of data to delete:
	 * * Sets the `disabled` state depending on whether the corresponding config exists
	 *   in user options.
	 * * Rewrites the help text for each checkbox in accordance with the `disabled` state.
	 */
	updateCheckboxes() {
		const $deleteGlobalHelp = this.getHelpElement('deleteglobal');
		if (SelectiveRollbackConfig.get('global')) {
			this.deleteGlobal.setDisabled(false);
			$deleteGlobalHelp.text('');
		} else {
			this.deleteGlobal.setSelected(false).setDisabled(true);
			$deleteGlobalHelp.text(msg['config-help-deleteglobal-absent']);
		}

		const $deleteLocalHelp = this.getHelpElement('deletelocal');
		if (SelectiveRollbackConfig.get('local')) {
			this.deleteLocal.setDisabled(false);
			$deleteLocalHelp.text('');
		} else {
			this.deleteLocal.setSelected(false).setDisabled(true);
			$deleteLocalHelp.text(msg['config-help-deletelocal-absent']);
		}

		/** @type {Record<string, string>} */
		const wikiMap = SelectiveRollbackConfig.get('localexists') || Object.create(null);
		delete wikiMap[wgWikiID]; // The local wiki ID is irrelevant here
		const $deleteLocalAllHelp = this.getHelpElement('deletelocalall');
		if (!$.isEmptyObject(wikiMap)) {
			this.deleteLocalAll.setDisabled(false);
			const message = mw.format(
				msg['config-help-deletelocalall-present'],
				'<span id="sr-config-help-deletelocalall-list"></span>'
			);
			$deleteLocalAllHelp.html(message);

			const $deleteLocalAllHelpWikiList = this.getHelpElement('deletelocalall-list');
			let i = 0;
			for (const [wikiId, apiUrl] of Object.entries(wikiMap)) {
				/** @type {(string | JQuery<HTMLElement>)[]} */
				const elements = [];
				if (i !== 0) {
					elements.push(', ');
				}
				elements.push(SelectiveRollbackConfigMisc.getLinkFromWikiID(wikiId, apiUrl));
				$deleteLocalAllHelpWikiList.append(...elements);
			}
		} else {
			this.deleteLocalAll.setSelected(false).setDisabled(true);
			$deleteLocalAllHelp.html(msg['config-help-deletelocalall-absent']);
		}

		window.requestAnimationFrame(() => this.updateDeleteButtonAccessibility());
	}

	/**
	 * Generates a link to the given wiki, e.g. `enwiki` linking to `//en.wikipedia.org`.
	 * @param {string} wikiID
	 * @param {string} apiUrl
	 * @returns {JQuery<HTMLAnchorElement>}
	 * @private
	 */
	static getLinkFromWikiID(wikiID, apiUrl) {
		const regex = /^\/\/[^/]+/;
		const baseUrl = (apiUrl.match(regex) || [])[0] || apiUrl;
		return /** @type {JQuery<HTMLAnchorElement>} */ ($('<a>'))
			.prop({
				target: '_blank',
				href: baseUrl
			})
			.text(wikiID);
	}

	/**
	 * Deletes configuration data as specified in the misc field.
	 * @returns {Promise<void>}
	 * @private
	 */
	async doDelete() {
		this.$overlay.show();
		this.deleteButton.setPending();
		const deleteFor = this.collect();
		const keys = SelectiveRollbackConfig.keys;
		const /** @type {JQuery.Promise<?string>[]} */ promises = [];
		const /** @type {(keyof Messages)[]} */ executionKeys = [];
		const /** @type {Omit<ConfigDomain, 'localexists'>[]} */ deletionTypes = [];

		if (deleteFor.purgeCache) {
			SelectiveRollback.purgeCache();
			promises.push($.Deferred().resolve(null).promise());
			executionKeys.push('portlet-label-uncacher');
		}

		if (deleteFor.deleteGlobal) {
			const change = { [keys.global]: null };
			promises.push(SelectiveRollbackConfig.saveOptions(change, 'globalpreferences'));
			executionKeys.push('config-label-deleteglobal');
			deletionTypes.push('global');
		}

		if (deleteFor.deleteLocal) {
			const change = { [keys.local]: null };
			promises.push(SelectiveRollbackConfig.saveOptions(change, 'options'));
			executionKeys.push('config-label-deletelocal');
			deletionTypes.push('local');
		}

		const /** @type {[string, string][]} */ wikiIdMap = [];
		while (deleteFor.deleteLocalAll) {
			// Alternative to `if` so that we can use `break` when `localexists` is null

			const localexists = SelectiveRollbackConfig.get('localexists');
			if (!localexists) {
				break;
			}
			delete localexists[wgWikiID];

			for (const [wikiID, apiUrl] of Object.entries(localexists)) {
				const foreignApi = new mw.ForeignApi(apiUrl, SelectiveRollback.apiOptions());
				const change = { [keys.local]: null };
				promises.push(SelectiveRollbackConfig.saveOptions(change, 'options', foreignApi));
				wikiIdMap.push([wikiID, apiUrl]);
			}
			if (wikiIdMap.length) {
				executionKeys.push('config-label-deletelocalall');
			}
			break;
		}

		let errCount = 0;
		/**
		 * @param {string | JQuery<HTMLElement>} label
		 * @param {?string} [code]
		 * @returns {JQuery<HTMLElement>}
		 */
		const listItem = (label, code) => {
			const $li = $('<li>').append(label, ': ');
			if (code === undefined) {
				// Do nothing
			} else if (code) {
				$li.append(SelectiveRollbackConfigMisc.getIcon('cross', code));
				errCount++;
			} else {
				$li.append(SelectiveRollbackConfigMisc.getIcon('tick'));
			}
			return $li;
		};

		const results = await Promise.all(promises);
		const /** @type {string[]} */ wikiIDsConfigDeleted = [];
		let offset = Infinity;
		const $err = $('<ul>');
		for (let i = 0; i < results.length; i++) {
			const msgKey = executionKeys[i];
			/** @type {string | null | undefined} */
			let code = results[i];
			if (msgKey === 'config-label-deletelocal' && !code) {
				wikiIDsConfigDeleted.push(wgWikiID);
			} else if (msgKey === 'config-label-deletelocalall') {
				code = void 0;
				offset = i;
			}
			$err.append(listItem(msg[msgKey], code));
			if (offset !== Infinity) {
				break;
			}
		}

		const $errInner = $('<ul>');
		for (let i = offset; i < results.length; i++) {
			const [wikiID, apiUrl] = wikiIdMap[i - offset];
			const $link = SelectiveRollbackConfigMisc.getLinkFromWikiID(wikiID, apiUrl);
			const code = results[i];
			if (!code) {
				wikiIDsConfigDeleted.push(wikiID);
			}
			$errInner.append(listItem($link, code));

			if (i === results.length - 1) {
				$err.append($errInner);
			}
		}

		if (wikiIDsConfigDeleted.length) {
			const change = SelectiveRollbackConfig.getWikiIdOptions('delete', wikiIDsConfigDeleted);
			for (let i = 0; i <= 3; i++) {
				// This should not fail: Retry up to 3 times
				const code = await SelectiveRollbackConfig.saveOptions(change, 'globalpreferences');
				if (!code) {
					break;
				}
				if (i !== 3) {
					await sleep(5000);
				}
			}
		}

		if (deletionTypes.length) {
			this.deleteConfigCallbacks.forEach((callback) => callback(deletionTypes));
		}
		this.updateCheckboxes();
		this.$overlay.hide();
		this.deleteButton.unsetPending();
		if (errCount) {
			OO.ui.alert(
				$('<div>').append(msg['config-notify-deletedata-failure'], $err),
				{ size: 'medium' }
			);
		} else {
			mw.notify(msg['config-notify-deletedata-success'], { type: 'success' });
		}
	}

	/**
	 * Creates and retrieves an icon.
	 *
	 * @param {keyof typeof SelectiveRollbackConfigMisc.iconMap} iconName The name of the icon to get.
	 * @param {string} [subtext] Optional text shown next to the icon.
	 *
	 * The text is coloured in:
	 * * Green when `iconName` is `'tick'`.
	 * * Red when `iconName` is `'cross'`.
	 * @returns {HTMLSpanElement} The icon container.
	 * @private
	 */
	static getIcon(iconName, subtext) {
		const href = this.iconMap[iconName];
		const icon = new Image();
		icon.classList.add('sr-config-icon');
		icon.src = href;

		const container = document.createElement('span');
		container.classList.add('sr-config-icon-container');
		container.appendChild(icon);

		if (subtext) {
			const textElement = document.createElement('span');
			textElement.classList.add('sr-config-icon-subtext');
			textElement.textContent = subtext;
			if (iconName === 'tick') {
				textElement.classList.add('sr-config-icon-subtext-green');
			} else if (iconName === 'cross') {
				textElement.classList.add('sr-config-icon-subtext-red');
			}
			container.appendChild(textElement);
		}

		return container;
	}

}
SelectiveRollbackConfigMisc.iconMap = {
	tick: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Antu_mail-mark-notjunk.svg/30px-Antu_mail-mark-notjunk.svg.png',
	cross: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Cross_reject.svg/30px-Cross_reject.svg.png'
};

/**
 * @param {number} milliSeconds
 * @returns {Promise<void>}
 */
function sleep(milliSeconds) {
	return new Promise(resolve => setTimeout(resolve, milliSeconds));
}

class KeyValueCollection {

	/**
	 * @param {Set<string>} [badKeys] Additional keys to disallow.
	 */
	constructor(badKeys) {
		/**
		 * The container widget.
		 * @type {OO.ui.Widget}
		 * @readonly
		 */
		this.widget = new OO.ui.Widget();
		/**
		 * @type {KeyValueCollectionRow[]}
		 * @private
		 */
		this.rows = [];
		/**
		 * @type {Set<string>}
		 * @readonly
		 * @private
		 */
		this.badKeys = badKeys || new Set();

		/**
		 * @type {OO.ui.ButtonWidget}
		 * @readonly
		 * @private
		 */
		this.addButton = new OO.ui.ButtonWidget({
			flags: ['primary', 'progressive'],
			label: msg['config-button-add']
		});
		this.addButton.on('click', () => this.add());

		/**
		 * @type {OO.ui.ButtonWidget}
		 * @readonly
		 * @private
		 */
		this.removeButton = new OO.ui.ButtonWidget({
			disabled: true,
			flags: ['primary', 'destructive'],
			label: msg['config-button-remove']
		});
		this.removeButton.on('click', () => {
			for (let i = this.rows.length - 1; i >= 0; i--) {
				const { checkbox } = this.rows[i];
				if (checkbox.isSelected()) {
					this.remove(i);
				}
			}
		});

		/**
		 * @type {OO.ui.ButtonWidget}
		 * @readonly
		 * @private
		 */
		this.selectAllButton = new OO.ui.ButtonWidget({
			disabled: true,
			flags: ['progressive'],
			label: msg['dialog-button-selectall']
		});
		this.selectAllButton.on('click', () => {
			this.rows.forEach(({ checkbox }) => checkbox.setSelected(true));
		});

		/**
		 * @type {OO.ui.ButtonWidget}
		 * @readonly
		 * @private
		 */
		this.deselectAllButton = new OO.ui.ButtonWidget({
			disabled: true,
			flags: ['destructive'],
			label: msg['config-button-deselectall']
		});
		this.deselectAllButton.on('click', () => {
			this.rows.forEach(({ checkbox }) => checkbox.setSelected(false));
		});

		/**
		 * The button container widget.
		 * @type {OO.ui.Widget}
		 * @readonly
		 */
		this.buttons = new OO.ui.Widget({
			$element: $('<div>').addClass('sr-config-buttoncontainer'),
			content: [
				this.addButton,
				this.removeButton,
				this.selectAllButton,
				this.deselectAllButton
			]
		});
	}

	/**
	 * Adds a new property field item.
	 * @param {string} [initialKey]
	 * @param {string} [initialValue]
	 * @returns {KeyValueCollectionRow}
	 */
	add(initialKey, initialValue) {
		const checkbox = new OO.ui.CheckboxInputWidget();

		const keyInput = new OO.ui.TextInputWidget({
			label: msg['config-label-propertyinput-key'],
			validate: (val) => {
				val = clean(val);
				return val !== '' && !this.badKeys.has(val);
			},
			value: initialKey
		});
		const keyLayout = new OO.ui.FieldLayout(keyInput, {
			$element: $('<div>').css({ 'margin-top': '4px' }),
		});

		const valueInput = new OO.ui.TextInputWidget({
			label: msg['config-label-propertyinput-value'],
			validate: (val) => !!clean(val),
			value: initialValue
		});
		const valueLayout = new OO.ui.FieldLayout(valueInput, {
			$element: $('<div>').css({ 'margin-top': '4px' }),
		});

		const layout = new OO.ui.HorizontalLayout({
			$element: $('<div>').css({ 'max-width': '50em' }),
			items: [
				checkbox,
				new OO.ui.Widget({
					$element: $('<div>').css({ 'flex-grow': '1' }),
					content: [keyLayout, valueLayout]
				})
			]
		});
		this.widget.$element.append(layout.$element);

		[this.removeButton, this.selectAllButton, this.deselectAllButton].forEach((w) => {
			w.setDisabled(false);
		});

		const obj = { checkbox, keyInput, keyLayout, valueInput, valueLayout, layout };
		this.rows.push(obj);
		return obj;
	}

	/**
	 * @param {number} index
	 * @returns {this}
	 */
	remove(index) {
		const { layout } = this.rows[index];
		if (layout) {
			layout.$element.remove();
			this.rows.splice(index, 1);
		}
		if (!this.rows.length) {
			[this.removeButton, this.selectAllButton, this.deselectAllButton].forEach((w) => {
				w.setDisabled(true);
			});
		}
		return this;
	}

	/**
	 * @returns {this}
	 */
	removeAll() {
		for (let i = this.rows.length - 1; i >= 0; i--) {
			this.remove(i);
		}
		return this;
	}

	/**
	 * Collects field values as an object.
	 * @returns {?Record<string, string>} `null` if any input contains an invalid value.
	 */
	collect() {
		/**
		 * @type {Record<string, string>}
		 */
		const ret = Object.create(null);
		if (!this.rows.length) {
			return ret;
		}

		/**
		 * @type {Map<string, KeyValueCollectionDuplicateKey[]>}
		 */
		const seenKeys = new Map();
		/**
		 * @param {string} key
		 * @param {OO.ui.TextInputWidget} input
		 * @param {OO.ui.FieldLayout} layout
		 */
		const setSeen = (key, input, layout) => {
			if (!seenKeys.has(key)) {
				seenKeys.set(key, []);
			}
			/** @type {KeyValueCollectionDuplicateKey[]} */ (seenKeys.get(key)).push({ input, layout });
		};
		/**
		 * @type {number[]}
		 */
		const emptyFieldIndexes = [];
		/**
		 * @type {?OO.ui.TextInputWidget}
		 */
		let focusTarget = null;
		/**
		 * @type {KeyValueCollectionErrorDesc[]}
		 */
		const errors = [];

		// First pass: collect trimmed field values and record validation errors.
		// Only keys that are non-empty and not reserved ("other") are added to seenKeys.
		// Empty-value rows do not contribute to duplicates unless the key is valid.
		for (const [i, { keyInput, keyLayout, valueInput, valueLayout }] of Object.entries(this.rows)) {
			const key = clean(keyInput.getValue());
			const value = clean(valueInput.getValue());

			// Don't inherit errors from the previous run
			// @ts-expect-error Arguments for clearErrorsHandler() omitted
			[keyInput, valueInput].forEach((input) => input.off('change', KeyValueCollection.clearErrorsHandler));
			[keyLayout, valueLayout].forEach((layout) => layout.setErrors([]));

			// Put trimmed values back into widgets
			keyInput.setValue(key);
			valueInput.setValue(value);

			if (!key && !value) {
				// Both empty: Remove the field later
				emptyFieldIndexes.push(+i);
				continue;
			} else if (!key) {
				// Key empty
				errors.push({
					layout: keyLayout,
					input: keyInput,
					msgKey: 'config-error-propertyinput-key-empty',
					invalidValue: '',
					validator: function() {
						return clean(this.input.getValue()) === this.invalidValue
							? null
							: [{ layout: this.layout, input: this.input }];
					}
				});
				focusTarget = focusTarget || keyInput;
				continue;
			} else if (!value) {
				// Value empty
				errors.push({
					layout: valueLayout,
					input: valueInput,
					msgKey: 'config-error-propertyinput-value-empty',
					invalidValue: '',
					validator: function() {
						return clean(this.input.getValue()) === this.invalidValue
							? null
							: [{ layout: this.layout, input: this.input }];
					}
				});
				focusTarget = focusTarget || valueInput;
				if (!this.badKeys.has(key)) {
					// We know that the key is non-empty, thus is valid unless it's contained in `badKeys`.
					// Mark the valid key as seen, for the duplicate error logic to work as expected.
					setSeen(key, keyInput, keyLayout);
				}
				continue;
			}

			// Reserved key
			if (this.badKeys.has(key)) {
				errors.push({
					layout: keyLayout,
					input: keyInput,
					msgKey: 'config-error-propertyinput-key-reserved',
					invalidValue: key,
					validator: function() {
						return clean(this.input.getValue()) === this.invalidValue
							? null
							: [{ layout: this.layout, input: this.input }];
					}
				});
				focusTarget = focusTarget || keyInput;
				continue;
			}

			setSeen(key, keyInput, keyLayout);
			ret[key] = value;
		}

		// Second pass: detect duplicate keys. For each key with more than one valid row,
		// produce a duplicate-key error unless that row already has a more specific error.
		for (const [key, arr] of seenKeys.entries()) {
			if (arr.length < 2) {
				continue;
			}

			for (const keyField of arr) {
				// For each entry with duplicated key, only set duplicate error if that field
				// doesn't already have an error set (we avoid overwriting a more specific error).
				// @ts-expect-error Accessing private property
				if ((keyField.layout.errors || []).length) {
					continue;
				}

				// Add duplicate error descriptor with validator that checks live duplication state
				errors.push({
					layout: keyField.layout,
					input: keyField.input,
					msgKey: 'config-error-propertyinput-key-duplicate',
					invalidValue: key,
					validator: function(descs) {
						// Recompute whether this key is still duplicated in the current DOM
						const currentKey = clean(this.input.getValue());
						if (!currentKey) {
							return null; // No key: Handled by empty-key validator instead
						}

						/** @type {KeyValueCollectionDuplicateKey[]} */
						let clearTargets = [];
						if (descs.length < 2) {
							console.error('Expected 2 or more error descriptors, but got ' + descs.length);
							clearTargets = descs;
						} else if (descs.length === 2) {
							// If there are only two descriptors, clear both errors if
							// the input values don't match (i.e., deduplicated)
							const key1 = clean(descs[0].input.getValue());
							const key2 = clean(descs[1].input.getValue());
							if (key1 !== key2) {
								clearTargets = descs;
							}
						} else {
							// If there are more than two descriptors, find deduplicated fields
							for (const desc of descs) {
								if (clean(desc.input.getValue()) !== this.invalidValue) {
									clearTargets.push(desc);
								}
							}
							// If clearTargets contains `descs.length - 1` elements, the remaining
							// field has also been deduplicated
							if (clearTargets.length === descs.length - 1) {
								clearTargets = descs;
							}
						}

						return clearTargets.length ? clearTargets : null;
					}
				});
				focusTarget = focusTarget || keyField.input;
			}
		}

		// Apply errors to the UI and attach handlers
		const hadErrors = KeyValueCollection.applyErrors(errors);
		if (hadErrors) {
			// Focus the first failing input and return null to indicate failure
			if (focusTarget) {
				/** @type {OO.ui.TextInputWidget} */ (focusTarget).focus();
			}
			return null;
		}

		// Remove empty fields in reverse order to keep indices valid
		for (let i = emptyFieldIndexes.length - 1; i >= 0; i--) {
			this.remove(emptyFieldIndexes[i]);
		}

		return ret;
	}

	/**
	 * Applies the collected errors to the UI:
	 * - Displays error messages on each FieldLayout.
	 * - Marks the input as invalid.
	 * - Installs a change handler that re-validates the error using the descriptor's `validator()`.
	 *
	 * The change handler automatically clears the error and removes itself once the validator
	 * reports the error as resolved.
	 *
	 * @param {KeyValueCollectionErrorDesc[]} errorDescs
	 * @returns {boolean} `true` if any errors were applied, `false` otherwise.
	 * @private
	 */
	static applyErrors(errorDescs) {
		// If nothing to do, return false (no errors applied)
		if (!errorDescs.length) {
			return false;
		}

		for (const desc of errorDescs) {
			const err = mw.format(msg[desc.msgKey], desc.invalidValue);
			desc.layout.setErrors([err]);
			desc.input.setValidityFlag(false);

			// Attach change handler that removes error when validator returns an array.
			// Use a named handler so we can remove it later.
			desc.input.on('change', KeyValueCollection.clearErrorsHandler, [desc, errorDescs]);
		}

		return true;
	}

	/**
	 * @param {KeyValueCollectionErrorDesc} desc
	 * @param {KeyValueCollectionErrorDesc[]} allDescs
	 * @returns {void}
	 * @private
	 */
	static clearErrorsHandler(desc, allDescs) {
		const associatedDescs = desc.msgKey === 'config-error-propertyinput-key-duplicate'
			? allDescs.filter(d => d.msgKey === desc.msgKey && d.invalidValue === desc.invalidValue)
			: [desc];

		// @ts-expect-error Accessing private property
		const activeDescs = associatedDescs.filter(e => e.layout.errors.length);
		if (!activeDescs.length) {
			// @ts-expect-error Arguments omitted
			allDescs.forEach(d => d.input.off('change', KeyValueCollection.clearErrorsHandler));
			return;
		}

		const clearTargets = desc.validator.call(desc, activeDescs);
		if (clearTargets) {
			for (const target of clearTargets) {
				target.layout.setErrors([]);
				target.input.setValidityFlag(true);
				// @ts-expect-error Arguments omitted
				target.input.off('change', KeyValueCollection.clearErrorsHandler);
			}
		}
	}

}

/**
 * @returns {OO.ui.MenuOptionWidget[]}
 */
function getWatchlistExpiryOptions() {
	return [
		{ data: 'indefinite', label: msg['dialog-label-watchlistexpiry-indefinite'] },
		{ data: '1 week', label: msg['dialog-label-watchlistexpiry-1week'] },
		{ data: '1 month', label: msg['dialog-label-watchlistexpiry-1month'] },
		{ data: '3 months', label: msg['dialog-label-watchlistexpiry-3months'] },
		{ data: '6 months', label: msg['dialog-label-watchlistexpiry-6months'] },
		{ data: '1 year', label: msg['dialog-label-watchlistexpiry-1year'] }
	]
	.map((obj) => new OO.ui.MenuOptionWidget(obj));
}

function PendingButtonWidgetFactory() {
	const classPending = 'oo-ui-pendingElement-pending';
	return class PendingButtonWidget extends OO.ui.ButtonWidget {

		setPending() {
			this.setDisabled(true)
				.$element.children('.oo-ui-buttonElement-button').eq(0)
					.addClass(classPending);
			return this;
		}

		unsetPending() {
			this.setDisabled(false)
				.$element.children('.oo-ui-buttonElement-button').eq(0)
					.removeClass(classPending);
			return this;
		}

	};
}

/**
 * Returns the SelectiveRollbackDialog class.
 * @param {Required<SelectiveRollbackConfigObject>} cfg
 * @param {MetaInfo} meta
 * @param {ParentNode} parentNode
 * @returns
 */
function SelectiveRollbackDialogFactory(cfg, meta, parentNode) {
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
				msg['portlet-tooltip-dialog'],
				void 0,
				document.getElementById('ca-sr-config') || document.getElementById('ca-sr-uncacher') || '#ca-move'
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

			/**
			 * @type {JQuery<HTMLSpanElement>}
			 * @readonly
			 * @private
			 */
			this.$selectedCount = $('<span>');
			if (parentNode) {
				const selectAll = new OO.ui.ButtonWidget({
					flags: ['progressive'],
					label: msg['dialog-button-selectall']
				});
				selectAll.on('click', () => {
					const count = this.sr.selectAll();
					this.$selectedCount.text(count);
				});

				const saLayout = new OO.ui.FieldLayout(selectAll, {
					$label: $('<span>').addClass('sr-selected-count'), // Increase padding-top via class CSS
					align: dir === 'ltr' ? 'right' : 'left',
					label: $('<span>')
						.html(msg['dialog-label-selectcount'] + '&nbsp;')
						.append(this.$selectedCount),
				});
				saLayout.$element.css({ 'margin-bottom': '-1em' });
				saLayout.$header.css({ textAlign: uiEnd }); // Align the label in the same way as the button
				saLayout.$field.css({ width: 'unset' }); // Remove space leading the button
				saLayout.$label.off('click'); // Prevent label from interacting with the button

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
						new OO.ui.MenuOptionWidget({ data: '', label: msg['dialog-label-summary-default'] }),
						...Object.entries(cfg.editSummaries).map(([key, value]) => {
							return new OO.ui.MenuOptionWidget({ data: value, label: cfg.showKeys ? key : value });
						}),
						new OO.ui.MenuOptionWidget({ data: 'other', label: msg['dialog-label-summary-custom'] }),
					]
				}
			});

			this.summaryList.on('labelChange', () => this.previewSummary());
			this.summaryList.getMenu().selectItemByData(''); // Select default summary
			items.push(
				new OO.ui.FieldLayout(this.summaryList, {
					align: 'top',
					label: $('<b>').text(msg['dialog-label-summary'])
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
					items: Object.keys(cfg.replacementExpressions).concat(autocompleteSources).map((source) => {
						return new OO.ui.MenuOptionWidget({ data: source, label: source });
					})
				},
				placeholder: msg['dialog-label-summaryinput']
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
					$element: $('<div>').css({ 'margin-top': '8px' }),
					align: 'top',
					help: new OO.ui.HtmlSnippet(msg[meta.fetched ? 'dialog-help-summaryinput-$0' : 'dialog-help-summaryinput-$0-error']),
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
					$element: $('<div>').css({ 'margin-top': '12px', 'margin-bottom': '4px' }),
					label: $('<b>').text(msg['dialog-label-summarypreview'])
				}),
				this.summaryPreview,
				new OO.ui.LabelWidget({
					$element: $('<div>').css({ 'margin-top': '4px' }),
					classes: ['oo-ui-inline-help'],
					label: new OO.ui.HtmlSnippet(msg['dialog-help-summarypreview'])
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
						label: msg['dialog-label-markbot'],
						align: 'inline'
					})
				);
				this.markBot.setSelected(cfg.markBot);
			}

			/**
			 * @type {OO.ui.CheckboxInputWidget}
			 * @readonly
			 */
			this.watchlist = new OO.ui.CheckboxInputWidget({
				selected: cfg.watchlist
			});

			items.push(
				new OO.ui.FieldLayout(this.watchlist, {
					label: msg['dialog-label-watchlist'],
					align: 'inline'
				}),
			);

			/**
			 * @type {OO.ui.DropdownWidget}
			 * @readonly
			 */
			this.watchlistExpiry = new OO.ui.DropdownWidget({
				$overlay: this.$overlay,
				menu: {
					items: getWatchlistExpiryOptions()
				}
			});
			this.watchlistExpiry.getMenu().selectItemByData(cfg.watchlistExpiry);

			const weLayout = new OO.ui.FieldLayout(this.watchlistExpiry);
			weLayout.$element.css({ 'margin-left': '1.8em', 'margin-top': '8px' });
			items.push(weLayout);
			this.watchlist.on('change', (selected) => {
				weLayout.toggle(!!selected);
				this.updateSize();
			});
			weLayout.toggle(this.watchlist.isSelected());

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

			if (langSwitch === 'ar') {
				this.$element.css({ 'font-family': 'system-ui' });
			}

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
			const style = document.createElement('style');
			style.textContent =
				'.sr-dialog .oo-ui-processDialog-actions-safe {' +
					`${uiStart}: 0;` +
					`${uiEnd}: unset;` +
				'}' +
				'.sr-dialog .oo-ui-processDialog-actions-primary {' +
					`${uiStart}: unset;` +
					`${uiEnd}: 0;` +
				'}' +
				'.sr-dialog .oo-ui-fieldLayout.oo-ui-labelElement.oo-ui-fieldLayout-align-left > .oo-ui-fieldLayout-body > .oo-ui-fieldLayout-header > .sr-selected-count.oo-ui-labelElement-label,' +
				'.sr-dialog .oo-ui-fieldLayout.oo-ui-labelElement.oo-ui-fieldLayout-align-right > .oo-ui-fieldLayout-body > .oo-ui-fieldLayout-header > .sr-selected-count.oo-ui-labelElement-label {' +
					`margin-${uiStart}: unset;` +
					`margin-${uiEnd}: 6px;` +
				'}' +
				'.sr-dialog .oo-ui-comboBoxInputWidget .oo-ui-inputWidget-input {' +
					`border-top-${uiStart}-radius: unset;` +
					`border-bottom-${uiStart}-radius: unset;` +
					`border-${uiStart}-width: 1px;` +
					`border-top-${uiEnd}-radius: 0;` +
					`border-bottom-${uiEnd}-radius: 0;` +
					`border-${uiEnd}-width: 0;` +
				'}' +
				'.sr-dialog .oo-ui-fieldLayout.oo-ui-labelElement.oo-ui-fieldLayout-align-inline > .oo-ui-fieldLayout-body > .oo-ui-fieldLayout-header {' +
					`padding-${uiStart}: 6px;` +
					`padding-${uiEnd}: unset;` +
				'}' +
				'';
			document.head.appendChild(style);

			return this;
		}

		/**
		 * @inheritdoc
		 * @override
		 */
		getSetupProcess() {
			return super.getSetupProcess().next(() => {
				this.$selectedCount.text(this.sr.getSelected().length);
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
							mw.notify(msg['rollback-notify-noneselected'], { type: 'warn' });
							return;
						}
						this.close();
						this.sr.selectiveRollback(selectedLinks);
						break;
					}
					case 'documentation':
						window.open('https://meta.wikimedia.org/wiki/Special:MyLanguage/User:Dragoniez/Selective_Rollback', '_blank');
						break;
					case 'config':
						window.open(mw.util.getUrl('Special:SelectiveRollbackConfig'), '_blank');
						break;
					case 'selectall': {
						const count = this.sr.selectAll();
						this.$selectedCount.text(count);
						break;
					}
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
			if (!$.isEmptyObject(cfg.replacementExpressions)) {
				for (const [key, value] of Object.entries(cfg.replacementExpressions)) {
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
			return this.watchlist.isSelected() ? 'watch' : 'nochange';
		}

		/**
		 * Gets the `watchlistexpiry` option value.
		 * @returns {string | undefined} `undefined` if the watch-page box isn't checked.
		 */
		getWatchlistExpiry() {
			return this.watchlist.isSelected() && getDropdownValue(this.watchlistExpiry) || void 0;
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
	SelectiveRollbackDialog.static.title = $('<label>').append(
		`${msg.scriptname} (`,
		$('<a>')
			.prop({
				target: '_blank',
				href: 'https://meta.wikimedia.org/w/index.php?title=User:Dragoniez/Selective_Rollback.js&action=history'
			})
			.text(`v${version}`),
		')'
	);
	SelectiveRollbackDialog.static.actions = [
		{
			action: 'execute',
			label: msg['dialog-button-rollback'],
			flags: ['primary', 'progressive'],
			modes: ['nonRCW']
		},
		{
			action: 'documentation',
			label: msg['dialog-button-documentation'],
			modes: ['RCW', 'nonRCW']
		},
		{
			action: 'config',
			label: msg['dialog-button-config'],
			modes: ['RCW', 'nonRCW']
		},
		{
			action: 'selectall',
			label: msg['dialog-button-selectall'],
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
 * @typedef {import('./window/Selective Rollback.d.ts').WatchlistExpiry} WatchlistExpiry
 * @typedef {import('./window/Selective Rollback.d.ts').SelectiveRollbackConfigObjectLegacy} SelectiveRollbackConfigObjectLegacy
 * @typedef {import('./window/Selective Rollback.d.ts').SelectiveRollbackConfigObject} SelectiveRollbackConfigObject
 * @typedef {import('./window/Selective Rollback.d.ts').IsOfType} IsOfType
 * @typedef {import('./window/Selective Rollback.d.ts').SRConfirm} SRConfirm
 * @typedef {import('./window/Selective Rollback.d.ts').Languages} Languages
 * @typedef {import('./window/Selective Rollback.d.ts').Messages} Messages
 * @typedef {import('./window/Selective Rollback.d.ts').MetaInfo} MetaInfo
 * @typedef {import('./window/Selective Rollback.d.ts').ApiResponse} ApiResponse
 * @typedef {import('./window/Selective Rollback.d.ts').SRBox} SRBox
 * @typedef {import('./window/Selective Rollback.d.ts').RollbackLink} RollbackLink
 * @typedef {import('./window/Selective Rollback.d.ts').RollbackLinkMap} RollbackLinkMap
 * @typedef {import('./window/Selective Rollback.d.ts').RollbackParams} RollbackParams
 * @typedef {import('./window/Selective Rollback.d.ts').ConfigDomain} ConfigDomain
 * @typedef {import('./window/Selective Rollback.d.ts').DeleteConfigCallback} DeleteConfigCallback
 * @typedef {import('./window/Selective Rollback.d.ts').ConfigRetriever} ConfigRetriever
 * @typedef {import('./window/Selective Rollback.d.ts').KeyValueCollectionRow} KeyValueCollectionRow
 * @typedef {import('./window/Selective Rollback.d.ts').KeyValueCollectionDuplicateKey} KeyValueCollectionDuplicateKey
 * @typedef {import('./window/Selective Rollback.d.ts').KeyValueCollectionErrorDesc} KeyValueCollectionErrorDesc
 * @typedef {import('./window/Selective Rollback.d.ts').InterfaceDirection} InterfaceDirection
 */

SelectiveRollback.init();

//**************************************************************************************************
})();
//</nowiki>