/**********************************************************************\

	AjaxBlock
	Block/unblock users via a dialog without having to visit the
	special page.

	@author [[User:Dragoniez]]
	@version 2.0.0
	@see https://meta.wikimedia.org/wiki/User:Dragoniez/AjaxBlock

\**********************************************************************/
//<nowiki>
// @ts-check
/* global mw, OO */
(() => {
//**********************************************************************

const VERSION = '2.0.0';
const SCRIPT_NAME = 'AjaxBlock';
const DEBUG_MODE = false;

// Disallow duplicate runs
if (window.ajaxBlockLoaded) {
	console.error('AjaxBlock is loaded from multiple places.');
	return;
}
window.ajaxBlockLoaded = true;

// Ensure the user is registered
if (!mw.config.get('wgUserId') || mw.config.get('wgUserIsTemp')) {
	return;
}

// Run the script only on /wiki/$1 or /w/index.php
if (
	!location.pathname.startsWith(mw.config.get('wgArticlePath').replace('$1', '')) &&
	location.pathname !== mw.config.get('wgScript')
) {
	return;
}

// Don't run the script on Special:Block and Special:Unblock
const wgCanonicalSpecialPageName = mw.config.get('wgCanonicalSpecialPageName');
if (wgCanonicalSpecialPageName === 'Block' || wgCanonicalSpecialPageName === 'Unblock') {
	return;
}

const wgUserName = /** @type {string} */ (mw.config.get('wgUserName'));
const wgNamespaceIds = mw.config.get('wgNamespaceIds');
let wgEnableMultiBlocks = false;
const EXPIRY_INFINITE = 'infinity';

class AjaxBlock {

	static async init() {
		// Load modules needed for getInitializer()
		await mw.loader.using(['mediawiki.api', 'mediawiki.storage', 'mediawiki.util', 'mediawiki.user']);

		const configStore = new AjaxBlockConfigStore();
		Messages.loadInternalMessages(configStore);
		const cfgContentPromise = AjaxBlockConfig.isConfigPage() && AjaxBlockConfig.preparePage();

		AjaxBlock.api = new mw.Api({
			ajax: {
				headers: {
					'Api-User-Agent': 'AjaxBlock/2.0.0 (https://meta.wikimedia.org/wiki/User:Dragoniez/AjaxBlock.js)'
				}
			},
			parameters: {
				action: 'query',
				format: 'json',
				formatversion: '2',
				errorformat: 'html',
				errorlang: configStore.getLanguage(),
				errorsuselocal: true,
			}
		});

		// Fetch initialization data (user rights, aliases, configuration)
		let /** @type {PrematureInitializer} */ prematureInitializer;
		try {
			prematureInitializer = await toNativePromise(this.getInitializer());
		} catch (e) {
			// Indicate initialization failure using the logo
			console.error(toErrorTuple(e)[1]);
			await new AjaxBlockLogo().insert().setError().remove(800);
			return;
		}
		const permissionManager = new PermissionManager(prematureInitializer.userRights);
		if (!permissionManager.canBlock() && !cfgContentPromise) {
			return;
		}
		wgEnableMultiBlocks = prematureInitializer.multiBlocksEnabled;

		/** @type {Initializer} */
		const initializer = Object.assign(
			{ permissionManager, configStore },
			prematureInitializer
		);

		// Run the script
		await Promise.all([
			this.loadDependencies(initializer),
			$.ready
		]);
		this.addStyleTag();

		// Build the config interface if the user is on the config page
		if (cfgContentPromise) {
			cfgContentPromise.then((content) => {
				if (!content) {
					// Failure is handled in AjaxBlockConfig.preparePage()
					return;
				}
				AjaxBlockConfig.init(/** @type {FullInitializer} */ (initializer), content);
			});
			return;
		}
		BlockLinkUtil.getSpinner(); // Preload the image

		/** @type {?AjaxBlock} */
		let ajaxBlock = null;
		let isFirstRun = true;

		mw.hook('wikipage.content').add(async ($content) => {
			let content;
			if (isFirstRun) {
				// On first run, allow collectBlockLinks() to scan the full document (#bodyContent)
				content = undefined;
				isFirstRun = false;
			} else {
				content = $content[0];
				if (!content || !content.isConnected || !content.querySelector('a')) {
					return;
				}
			}

			// Parse block/unblock links
			const { links, users, ids } = this.collectBlockLinks(initializer, content);
			if (ajaxBlock) {
				// Reuse previously tracked links that are no longer present in the new scan
				const anchorSet = new Set(links.map(obj => obj.anchor));
				for (const prevLinks of ajaxBlock.linkMap.values()) {
					for (const prev of prevLinks) {
						if (!prev.anchor.isConnected || anchorSet.has(prev.anchor)) {
							// Skip detached anchors and those already collected in this run
							continue;
						}
						links.push(prev);

						const username = prev.target.getUsername();
						if (username) {
							users.add(username);
							continue;
						}
						const id = prev.target.getId();
						if (id) {
							ids.add(id);
						}
					}
				}
			}
			if (!links.length) {
				return;
			}

			// Show logo while loading
			const logo = new AjaxBlockLogo().insert();

			let /** @type {BlockLookup} */ blockLookup;
			try {
				blockLookup = await toNativePromise(BlockLookup.newFromTargets(permissionManager, users, ids));
			} catch (e) {
				console.error(toErrorTuple(e)[1]);
				await logo.setError().remove(800);
				return;
			}

			const linkMap = this.injectBlockInfo(links, blockLookup);
			if (linkMap.size) {
				if (!ajaxBlock) {
					ajaxBlock = new AjaxBlock(initializer, linkMap, blockLookup);
					ajaxBlock.initialize();
				} else {
					ajaxBlock.initialize({ linkMap, blockLookup });
				}
			}
			logo.remove(1000);
		});
	}

	/**
	 * @typedef {PrematureInitializer & {
	 *   permissionManager: PermissionManager;
	 *   configStore: AjaxBlockConfigStore;
	 * }} Initializer
	 */
	/**
	 * @returns {JQuery.Promise<PrematureInitializer>}
	 * @private
	 */
	static getInitializer() {
		const /** @type {Partial<PrematureInitializer>} */ data = {
			blockPageAliases: undefined,
			specialNamespaceAliases: undefined,
			userRights: undefined,
			actionRestrictions: undefined,
			multiBlocksEnabled: undefined,
		};

		// Special namespace aliases (always local)
		const specialNamespaceAliases = [];
		for (const [alias, ns] of Object.entries(wgNamespaceIds)) {
			if (ns === -1) {
				specialNamespaceAliases.push(alias);
			}
		}
		data.specialNamespaceAliases = specialNamespaceAliases;

		// Cached block page aliases
		const cachedAliases = mw.storage.getObject(this.storageKeys.blockPageAliases);
		if (
			cachedAliases &&
			Array.isArray(cachedAliases.Block) &&
			Array.isArray(cachedAliases.Unblock)
		) {
			data.blockPageAliases = cachedAliases;
		}

		// Cached user rights
		const cachedRights = mw.storage.getObject(this.storageKeys.userRights);
		if (Array.isArray(cachedRights) && cachedRights.every(r => typeof r === 'string')) {
			data.userRights = new Set(cachedRights);
		}

		// Cached action restrictions
		const cachedRestrictions = mw.storage.getObject(this.storageKeys.actionRestrictions);
		if (Array.isArray(cachedRestrictions) && cachedRestrictions.every(r => typeof r === 'string')) {
			data.actionRestrictions = cachedRestrictions;
		}

		// Cached multiblocks configuration
		const cachedMbEnabled = mw.storage.get(this.storageKeys.enableMultiblocks);
		if (typeof cachedMbEnabled === 'string') {
			data.multiBlocksEnabled = cachedMbEnabled === '1';
		}

		// Cached language information
		const cachedLangs = mw.storage.getObject(this.storageKeys.langs);
		if ($.isPlainObject(cachedLangs) && AjaxBlockConfigLanguageOptions.supported.every(code => typeof cachedLangs[code] === 'string')) {
			data.langs = cachedLangs;
		}

		/** @type {JQuery.Promise<void>[]} */
		const requests = [];

		// Query siteinfo/userinfo if needed
		const needsLangInfo = AjaxBlockConfig.isConfigPage();
		if (!data.blockPageAliases || !data.userRights || (!data.langs && needsLangInfo)) {
			const params = Object.create(null);
			params.meta = [];

			if (!data.blockPageAliases) {
				params.meta.push('siteinfo');
				params.siprop = 'specialpagealiases';
			}

			if (!data.userRights) {
				params.meta.push('userinfo');
				params.uiprop = 'rights';
			}

			if (!data.langs && needsLangInfo) {
				params.meta.push('languageinfo');
				params.liprop = 'autonym';
				params.licode = AjaxBlockConfigLanguageOptions.supported.join('|');
			}

			requests.push(
				this.api.get(params).then(/** @param {ApiResponse} res */ (res, jqXHR) => {
					if (!res || !res.query) {
						return failAsEmptyResult(res, jqXHR);
					}
					const { specialpagealiases, userinfo, languageinfo } = res.query;

					// Block aliases
					if (Array.isArray(specialpagealiases)) {
						const map = /** @type {PrematureInitializer['blockPageAliases']} */ (Object.create(null));

						for (const { realname, aliases } of specialpagealiases) {
							if (realname !== 'Block' && realname !== 'Unblock') {
								continue;
							}
							const canonical = /** @type {BlockPageNames} */ (realname);
							const lc = realname.toLowerCase();
							map[canonical] = aliases.filter(a => a === realname || a.toLowerCase() !== lc) ;
						}

						const targets = /** @type {BlockPageNames[]} */ (['Block', 'Unblock']);
						if (targets.every(name => Array.isArray(map[name]) && map[name].length)) {
							mw.storage.setObject(this.storageKeys.blockPageAliases, map, daysInSeconds(3));
							data.blockPageAliases = map;
						}
					}

					// User rights
					const rights = userinfo && userinfo.rights;
					if (Array.isArray(rights)) {
						mw.storage.setObject(this.storageKeys.userRights, rights, daysInSeconds(1));
						data.userRights = new Set(rights);
					}

					if (languageinfo) {
						const langMap = Object.create(null);
						for (const [code, { autonym }] of Object.entries(languageinfo)) {
							langMap[code] = autonym;
						}
						if (AjaxBlockConfigLanguageOptions.supported.every(code => typeof langMap[code] === 'string')) {
							mw.storage.setObject(this.storageKeys.langs, langMap, daysInSeconds(14));
							data.langs = langMap;
						}
					}

					if (!data.blockPageAliases || !data.userRights || (!data.langs && needsLangInfo)) {
						return failAsEmptyResult(res, jqXHR);
					}
				})
			);
		}

		// Fetch paraminfo if needed
		if (!data.actionRestrictions || typeof data.multiBlocksEnabled !== 'boolean') {
			requests.push(
				this.api.get({
					action: 'paraminfo',
					modules: 'block',
				}).then(/** @param {ApiResponse} res */ (res, jqXHR) => {
					const mod = res && res.paraminfo && res.paraminfo.modules && res.paraminfo.modules[0];
					if (!mod || mod.name !== 'block') {
						return failAsEmptyResult(res, jqXHR);
					}

					const done = () => {
						return !!data.actionRestrictions && typeof data.multiBlocksEnabled === 'boolean';
					};
					for (const { name, type, limit } of mod.parameters) {
						if (name === 'pagerestrictions' && typeof limit === 'number') {
							// Hack: There's no other way to retrieve the value of wgEnableMultiBlocks (T404508),
							// but the limit of page restrictions is 50 when multiblocks is enabled, otherwise 10
							if (limit !== 10 && limit !== 50) {
								console.warn('Unexpected pagerestrictions limit:', limit);
							}
							const multiBlocksEnabled = limit === 50;
							mw.storage.set(
								this.storageKeys.enableMultiblocks,
								multiBlocksEnabled ? '1' : '0',
								daysInSeconds(7)
							);
							data.multiBlocksEnabled = multiBlocksEnabled;
						}
						if (name === 'actionrestrictions' && Array.isArray(type)) {
							const actions = type;
							mw.storage.setObject(this.storageKeys.actionRestrictions, actions, daysInSeconds(7));
							data.actionRestrictions = actions;
						}
						if (done()) {
							break;
						}
					}
					if (!done()) {
						return failAsEmptyResult(res, jqXHR);
					}
				})
			);
		}

		// Everything cached
		if (!requests.length) {
			return $.Deferred().resolve(/** @type {PrematureInitializer} */ (data)).promise();
		}

		return $.when(...requests).then(() => /** @type {PrematureInitializer} */ (data));
	}

	/**
	 * @param {Initializer} init
	 * @param {ParentNode} [content] Optional root node to limit scanning (used for dynamically injected content).
	 * @return {{ links: BlockLink[]; users: Set<string>; ids: Set<number>; }}
	 * @private
	 */
	static collectBlockLinks(init, content) {
		const wgScript = mw.config.get('wgScript');
		/**
		 * @param {readonly string[]} arr
		 * @returns {string}
		 */
		const toEscaped = (arr) => arr.map(mw.util.escapeRegExp).join('|');
		this.regex = this.regex || {
			article: new RegExp(
				mw.util.escapeRegExp(mw.config.get('wgArticlePath')).replace('\\$1', '([^#?]+)')
			),
			special: new RegExp('^(?:' + toEscaped(init.specialNamespaceAliases) + '):([^/]+)(?:/([^#]+))?', 'i'),
			block: new RegExp('^(' + toEscaped(init.blockPageAliases.Block) + ')$', 'i'),
			unblock: new RegExp('^(' + toEscaped(init.blockPageAliases.Unblock) + ')$', 'i'),
		};

		const /** @type {BlockLink[]} */ links = [];
		const /** @type {Set<string>} */ users = new Set();
		const /** @type {Set<number>} */ ids = new Set();

		/** @type {NodeListOf<HTMLAnchorElement>} */
		const anchors = content ? content.querySelectorAll('a') : document.querySelectorAll('#bodyContent a');
		const currentHost = location.host;

		for (const a of anchors) {
			let href = a.href;
			if (
				!href ||
				a.getAttribute('href') === '#' ||
				a.role === 'button' ||
				a.host !== currentHost
			) {
				continue;
			}

			// Get prefixed title from the href
			const mArticle = this.regex.article.exec(href);
			let rawTitle = '';
			let needsDecode = true;
			if (mArticle) {
				rawTitle = mArticle[1];
			} else if (a.pathname === wgScript) {
				rawTitle = mw.util.getParamValue('title', href) || '';
				needsDecode = false; // getParamValue() calls decodeURIComponent()
			}
			if (!rawTitle || !rawTitle.includes(':')) {
				// Optimization: Ensure the presence of a namespace-title separator
				continue;
			}

			// Regular expressions for page aliases use underscores
			const prefixedTitle = (needsDecode ? decodeURIComponent(rawTitle) : rawTitle).replace(/ /g, '_');

			// Check whether this is a link to Special:Block or Special:Unblock
			const mSpecial = this.regex.special.exec(prefixedTitle);
			if (!mSpecial) {
				continue;
			}
			const rootPageName = mSpecial[1];
			let /** @type {BlockPageNames} */ specialPageName;
			if (this.regex.block.test(rootPageName)) {
				specialPageName = 'Block';
			} else if (this.regex.unblock.test(rootPageName)) {
				specialPageName = 'Unblock';
			} else {
				continue;
			}

			// Extract query parameters
			const query = new URLSearchParams(a.search);
			const isUnblockLink = specialPageName === 'Unblock' || query.get('remove') === '1';
			const linkType = isUnblockLink ? 'unblock' : 'block';
			// Class attributes used here:
			// - ajaxblock-blocklink
			// - ajaxblock-unblocklink
			a.classList.add(`ajaxblock-${linkType}link`);

			// Extract target
			const subpage = mSpecial[2] || null;
			const [id, username] = BlockTarget.validate(subpage, query);
			if (!id && !username) {
				this.markLinkAsUnprocessable(a);
				continue;
			} else if (username) {
				users.add(username);
			} else if (id) {
				ids.add(id);
			}

			// Register the valid link
			const target = new BlockTarget(id, username);
			const params = isUnblockLink
				? ParamApplier.createUnbBlockParamsFromSearchParams(query)
				: ParamApplier.createBlockParamsFromSearchParams(query, target.getType(), init);
			links.push({
				anchor: a,
				params,
				target,
				type: linkType,
				locked: false,
			});
		}

		return { links, users, ids };
	}

	/**
	 * @param {HTMLAnchorElement} anchor
	 * @returns {void}
	 * @private
	 */
	static markLinkAsUnprocessable(anchor) {
		const clss = 'ajaxblock-unprocessable';
		if (anchor.classList.contains(clss)) {
			return;
		}
		anchor.classList.add(clss);

		if (!this.unprocessableLinkTitleAttr) {
			this.unprocessableLinkTitleAttr =
				Messages.plain('word-separator') +
				Messages.plain('parentheses', [
					Messages.get('ajaxblock-link-title-unprocessable', [SCRIPT_NAME])
				]);
		}

		anchor.title += this.unprocessableLinkTitleAttr;
	}

	/**
	 * @param {Initializer} initializer
	 * @returns {Promise<void>}
	 * @private
	 */
	static async loadDependencies(initializer) {
		await Promise.all([
			mw.loader.using([
				'oojs-ui',
				'mediawiki.widgets.TitlesMultiselectWidget',
				'mediawiki.widgets.NamespacesMultiselectWidget',
				// For safety: Already required by mediawiki.api
				'mediawiki.Title',
				'mediawiki.jqueryMsg',
				...AjaxBlockConfig.getDependencies(),
			]),
			Messages.loadMessagesIfMissing(initializer, [
				'colon-separator',
				'parentheses-start',
				'parentheses-end',

				'block',
				'block-target',
				'block-expiry',
				'infiniteblock',
				'ipboptions',
				'ipbother',
				'ipbreason-dropdown',
				'htmlform-selectorother-other',
				'block-reason-other',

				'ipb-pages-label',
				'block-pages-placeholder',
				'ipb-namespaces-label',
				'block-namespaces-placeholder',

				'block-details',
				'ipbcreateaccount',
				'ipbemailban',
				'ipb-disableusertalk',

				'block-options',
				'ipb-hardblock',
				'ipbhidename',
				'ipbwatchuser',
				'watchlist-expiry-options',
				'block-create',

				'unblock',
				'block-reason',
				'block-removal-reason-placeholder',

				// Used in TargetField.init()
				'apierror-modify-autoblock',
				'autoblockid',

				'confirm',
				'cancel',

				// Copied from InvestigateHelper
				'logentry-block-block',
				'logentry-block-block-multi',
				'logentry-block-reblock',
				'logentry-partialblock-block',
				'logentry-partialblock-block-multi',
				'logentry-partialblock-reblock',
				'logentry-non-editing-block-block',
				'logentry-non-editing-block-block-multi',
				'logentry-non-editing-block-reblock',
				'block-log-flags-angry-autoblock',
				'block-log-flags-anononly',
				'block-log-flags-hiddenname',
				'block-log-flags-noautoblock',
				'block-log-flags-nocreate',
				'block-log-flags-noemail',
				'block-log-flags-nousertalk',
				'parentheses',
				'comma-separator',
				'and',
				'word-separator',
				'blanknamespace',
				'logentry-partialblock-block-page',
				'logentry-partialblock-block-ns',
				'logentry-partialblock-block-action',

				'blocked-notice-logextract',
				'blocked-notice-logextract-anon',

				// Messages used here:
				// - ipb-action-create
				// - ipb-action-move
				// - ipb-action-thanks
				// - ipb-action-upload
				// @ts-expect-error
				...initializer.actionRestrictions.map(r => `ipb-action-${r}`),
			])
		]);
	}

	/**
	 * Injects block information to the given array of {@link BlockLink} objects returned by
	 * {@link collectBlockLinks}, and returns a {@link BlockLinkMap} keyed by usernames (preferred),
	 * or by block IDs when handling autoblock unblock links.
	 *
	 * @param {BlockLink[]} blockLinks
	 * @param {BlockLookup} blockLookup
	 * @returns {BlockLinkMap}
	 * @private
	 */
	static injectBlockInfo(blockLinks, blockLookup) {
		const /** @type {BlockLinkMap} */ linkMap = new Map();

		for (const obj of blockLinks) {
			const id = obj.target.getId();
			const username = obj.target.getUsername();
			let /** @type {string | number | null} */ key = null;

			if (id && username) {
				key = username;
			} else if (id) {
				// ID-based (un)block links must have associated active blocks
				const block = blockLookup.getBlockById(id);
				if (block) {
					if (block.user) {
						key = block.user;
						obj.target.setUsername(key);
					} else if (block.automatic && obj.type === 'unblock') {
						key = id;
					}
				}
			} else if (username) {
				// We don't try to associate the username to block IDs here
				// That should be handled in TargetField.init()
				key = username;
			} else {
				// collectBlockLinks() should have already handled this path
				throw new Error('Logic exception', { cause: obj });
			}
			if (key === null) {
				this.markLinkAsUnprocessable(obj.anchor);
				continue;
			}

			if (!linkMap.has(key)) {
				linkMap.set(key, []);
			}
			/** @type {BlockLink[]} */ (linkMap.get(key)).push(obj);
		}

		return linkMap;
	}

	/**
	 * @private
	 */
	static addStyleTag() {
		const id = 'ajaxblock-styles';
		if (document.getElementById(id)) {
			return;
		}
		const style = document.createElement('style');
		style.id = id;
		style.textContent = `
			.ajaxblock-unprocessable {
				text-decoration-line: underline;
				text-decoration-style: dotted;
			}
			.ajaxblock-hiddenlink {
				display: none;
			}
			${/* Format processed links (used for anchors' containers) */''}
			.ajaxblock-processed::before {
				content: "[";
			}
			.ajaxblock-processed::after {
				content: "]";
			}
			.ajaxblock-processed-success {
				background-color: lightgreen;
			}
			@media screen {
				html.skin-theme-clientpref-night .ajaxblock-processed-success {
					background-color: #099979;
				}
			}
			@media screen and (prefers-color-scheme: dark) {
				html.skin-theme-clientpref-os .ajaxblock-processed-success {
					background-color: #099979;
				}
			}
			.ajaxblock-processed-failure {
				background-color: lightpink;
			}
			@media screen {
				html.skin-theme-clientpref-night .ajaxblock-processed-failure {
					background-color: #f54739;
				}
			}
			@media screen and (prefers-color-scheme: dark) {
				html.skin-theme-clientpref-os .ajaxblock-processed-failure {
					background-color: #f54739;
				}
			}
			${/* Style the loading icon */''}
			.ajaxblock-loading {
				vertical-align: middle;
				height: 1em;
				border: 0;
			}
			${/* Dialog content overlay to disallow user interaction */''}
			.ajaxblock-dialog .ajaxblock-dialog-overlay-container {
				position: relative;
			}
			.ajaxblock-dialog-overlay {
				position: absolute;
				top: 0;
				right: 0;
				bottom: 0;
				left: 0;
				z-index: 1000;
			}
			${/* Reduce padding for MessageWidget */''}
			.ajaxblock-dialog .ajaxblock-message-container,
			.ajaxblock-config-content .ajaxblock-message-container {
				padding: 8px 12px;
			}
			.ajaxblock-dialog .ajaxblock-message-container.oo-ui-messageWidget.oo-ui-messageWidget-block > .oo-ui-iconElement-icon,
			.ajaxblock-config-content .ajaxblock-message-container.oo-ui-messageWidget.oo-ui-messageWidget-block > .oo-ui-iconElement-icon {
				background-position: 0 8px;
			}
			${/* Limit the height of the block selector box */''}
			.ajaxblock-dialog-blockselector {
				max-height: 9.3em;
				overflow-y: auto;
			}
			.ajaxblock-dialog-blockselector > .oo-ui-radioOptionWidget > .oo-ui-radioInputWidget {
				vertical-align: middle;
			}
			${/* Increase spacing between log lines in the dialog */''}
			.ajaxblock-dialog-logline {
				padding: 4px 0;
			}
			.ajaxblock-dialog-logline:first-child {
				padding-top: 0;
			}
			.ajaxblock-dialog-logline-header {
				display: inline-block;
				margin-bottom: 0.5em;
			}
			${/* Reduce vertical spacing between field items */''}
			.ajaxblock-dialog .oo-ui-fieldLayout:not(:first-child),
			.ajaxblock-config-content .oo-ui-fieldLayout:not(:first-child) {
				margin-top: 6px;
			}
			${/* Increase the default width (60%) of fields with a horizontally aligned label */''}
			.ajaxblock-dialog .ajaxblock-horizontalfield .oo-ui-fieldLayout-field,
			.ajaxblock-config-content .ajaxblock-horizontalfield .oo-ui-fieldLayout-field {
				width: 80% !important;
			}
			${/* Vertically align the FieldLayout text field with its label */''}
			.ajaxblock-dialog .ajaxblock-targetlabel {
				display: block;
				padding-top: 4px;
			}
			${/* Halve the default top margin for fieldset:not(:first-child) */''}
			.ajaxblock-dialog .ajaxblock-field-content > fieldset:not(:first-child),
			.ajaxblock-config-content .ajaxblock-field-content > fieldset:not(:first-child) {
				margin-top: 12px;
			}
			${/* Make non-primary legends less prominent */''}
			.ajaxblock-dialog .ajaxblock-field-content > fieldset:not(:first-child) > legend > .oo-ui-labelElement-label,
			.ajaxblock-config-content .ajaxblock-field-content > fieldset:not(:first-child) > legend > .oo-ui-labelElement-label {
				font-weight: normal;
				font-style: italic;
				font-size: 1.1em;
			}
			${/* Special:AjaxBlockConfig */''}
			${/* Preset block reason options */''}
			.ajaxblock-config-content .ajaxblock-collapsiblefieldset-container {
				padding: 8px 12px;
				margin: 0 0 12px 0;
			}
			${/* Warning options */''}
			.ajaxblock-config-options-warnings > tbody > tr:nth-child(2n + 1) {
				background-color: var(--background-color-neutral, #eaecf0);
			}
			.ajaxblock-config-options-warnings th,
			.ajaxblock-config-options-warnings td {
				padding-left: 0.5em;
				padding-right: 0.5em;
			}
			.ajaxblock-config-options-warnings > thead > tr > th {
				font-weight: normal;
				font-style: italic;
			}
			.ajaxblock-config-options-warnings > tbody > tr > td:not(:first-child) {
				text-align: center;
				padding-top: 0.2em;
				padding-bottom: 0.2em;
			}
			${/* Limit width to match OO.ui.FieldLayout */''}
			.ajaxblock-config-fields--constrained {
				max-width: 50em;
			}
		`.replace(/[\t\n\r]+/g, '');
		document.head.appendChild(style);
	}

	/**
	 * @param {Initializer} initializer
	 * @param {BlockLinkMap} linkMap
	 * @param {BlockLookup} blockLookup
	 * @private
	 */
	constructor(initializer, linkMap, blockLookup) {
		/**
		 * @type {Initializer}
		 * @readonly
		 */
		this.initializer = initializer;
		/**
		 * @type {BlockLinkMap}
		 * @private
		 */
		this.linkMap = linkMap;
		/**
		 * @type {BlockLookup}
		 */
		this.blockLookup = blockLookup;
		/**
		 * @type {boolean}
		 * @private
		 */
		this.processingOneClickEvent = false;
		/**
		 * @type {Promise<void>}
		 * @private
		 */
		this.lastExecution = Promise.resolve();
		/**
		 * @type {number}
		 * @private
		 */
		this.pendingCount = 0;
		/**
		 * @type {number}
		 * @private
		 */
		this.executionGeneration = 0;

		const AjaxBlockDialog = AjaxBlockDialogFactory();
		/**
		 * @type {InstanceType<ReturnType<typeof AjaxBlockDialogFactory>>}
		 * @private
		 * @readonly
		 */
		this.dialog = new AjaxBlockDialog(this, {
			$element: $('<div>').css({ 'font-size': '90%' }),
			classes: ['ajaxblock-dialog'],
			size: 'large',
		});
		AjaxBlockDialog.windowManager.addWindows([this.dialog]);
	}

	/**
	 * Initializes block links by attaching AjaxBlock functionality to them.
	 *
	 * If `updater` is provided, re-initializes internal data before performing the attachment.
	 *
	 * @param {object} [updater]
	 * @param {BlockLinkMap} updater.linkMap
	 * @param {BlockLookup} updater.blockLookup
	 * @returns {void}
	 * @private
	 */
	initialize(updater) {
		if (updater) {
			this.executionGeneration++;
			this.linkMap = updater.linkMap;
			this.blockLookup = updater.blockLookup;
		}

		// Add a click event to each link
		for (const [_key, links] of this.linkMap) {
			for (const data of links) {
				if (data.anchor.dataset.ajaxblockBound) {
					continue;
				}
				data.anchor.addEventListener('click', (e) => this.handleClick(e, data));
				data.anchor.dataset.ajaxblockBound = '1';
			}
		}
	}

	/**
	 * @param {PointerEvent} e
	 * @param {BlockLink} data
	 * @private
	 */
	handleClick(e, data) {
		if (data.anchor.classList.contains('ajaxblock-hiddenlink')) {
			// Unexpected click on the hidden anchor
			e.preventDefault();
			e.stopPropagation();
			mw.notify(Messages.get('ajaxblock-notify-error-processing'), { type: 'error' });
			return;
		}

		let callback;
		if (e.shiftKey && e.ctrlKey) {
			// One click execution with all warnings suppressed
			callback = () => this.executeOneClick(data, true);
		} else if (e.shiftKey) {
			// One click execution with warnings
			callback = () => this.executeOneClick(data, false);
		} else if (e.ctrlKey) {
			// Navigate to the linked page
			return;
		} else {
			// Open the dialog
			callback = () => this.openDialogIfAllSettled(data);
		}

		e.preventDefault();
		e.stopPropagation();
		if (!this.dialog.presetsReady()) {
			mw.notify(Messages.get('ajaxblock-notify-error-paramapplier-presetsnotready'), { type: 'error' });
			return;
		}
		callback();
	}

	/**
	 * @private
	 */
	isAllSettled() {
		return this.pendingCount === 0;
	}

	/**
	 * Opens the AjaxBlock dialog if there are no pending operations currently being processed.
	 * If the dialog cannot be opened, this issues a `mw.notify` error notification unless
	 * `errorMsg` is provided as `null`.
	 *
	 * The purpose of this method is to prevent race conditions. `AjaxBlockDialog` may, in its
	 * initialization process, refer to the data in the `BlockLookup` instance, which may be
	 * updated by the pending operations. The dialog should be opened only after those operations
	 * are finished, to prevent data corruption.
	 *
	 * @param {BlockLink} data
	 * @param {?keyof LoadedMessages} [errorMsg] The key of the message to use for a `mw.notify`
	 * error notification. If `null` is provided, no notification will be issued. (default:
	 * `ajaxblock-notify-error-cannotopendialog`)
	 * @returns {void}
	 * @private
	 */
	openDialogIfAllSettled(data, errorMsg = 'ajaxblock-notify-error-cannotopendialog') {
		if (this.isAllSettled()) {
			this.dialog.updateSize().open(data);
		} else if (errorMsg !== null) {
			mw.notify(Messages.get(errorMsg, [SCRIPT_NAME]), { type: 'warn' });
		}
	}

	/**
	 * @param {BlockLink} data
	 * @param {boolean} suppressWarnings
	 * @returns {Promise<void>}
	 * @private
	 */
	async executeOneClick(data, suppressWarnings) {
		if (this.processingOneClickEvent) {
			// Disallow concurrent operations while collecting data from the dialog
			return;
		}
		this.processingOneClickEvent = true;

		/** @type {AbortCallback} */
		const onAbort = (reason) => {
			this.dialog.resetDialog();
			this.processingOneClickEvent = false;

			/** @type {keyof LoadedMessages | false} */
			let errorMsg = false;
			switch (reason) {
				case 'nooneclick':
				case 'invalidparams':
					errorMsg = 'ajaxblock-notify-error-cannotopendialog-oneclick';
					break;
				case 'unconfirmed-dialog':
					errorMsg = 'ajaxblock-notify-error-cannotopendialog';
			}
			if (errorMsg !== false) {
				this.openDialogIfAllSettled(data, errorMsg);
			}
		};

		const processable = this.dialog.prepareDialog(data);
		if (!processable) {
			// When prepareDialog() returns false, it issues error notifications to
			// indicate that the (un)block link is completely unprocessable
			onAbort('unprocessable');
			return;
		}

		const field = this.dialog.getActiveField();
		if (!field.getTargetField().isOneClickAllowed()) {
			// When one-click execution is disallowed, the (un)block must be executed
			// via the dialog
			onAbort('nooneclick');
			return;
		}

		return this.runExecution(data, field, {
			suppressWarnings,
			warningContext: 'oneclick',
			onAbort,
			onBeforeExecute: () => {
				// IMPORTANT:
				// We must reset the dialog here because it is reused to build params
				// and concurrent executions may call prepareDialog() before this one finishes.
				//
				// This effectively detaches execution from dialog state. Nothing after
				// buildParams() should depend on the dialog.
				//
				// If future logic requires dialog state post-execution, this flow must
				// be refactored to avoid early reset.
				this.dialog.resetDialog();
				this.processingOneClickEvent = false;
			},
		});
	}

	/**
	 * @param {BlockLink} data
	 * @param {BlockUser | UnblockUser} field
	 * @param {object} options
	 * @param {boolean} options.suppressWarnings Whether to suppress warnings (default: `false`)
	 * @param {WarningContext} options.warningContext The warning context passed to {@link confirmWarnings}.
	 * @param {AbortCallback} options.onAbort Callback executed when the process is aborted.
	 * @param {() => void} options.onBeforeExecute Callback executed right before performing a block/unblock request.
	 * @returns {Promise<void>}
	 */
	async runExecution(data, field, { suppressWarnings, warningContext, onAbort, onBeforeExecute }) {
		const paramObj = field.buildParams(data, warningContext);
		if (!paramObj) {
			// When buildParams() returns null, it issues mw.notify messages to indicate
			// that something needs to be modified on the dialog
			onAbort('invalidparams');
			return;
		}

		const { params, warnings } = paramObj;
		console.log(params, warnings);
		if (warnings.length && !suppressWarnings) {
			const confirmed = await AjaxBlock.confirmWarnings(warnings, data, warningContext);
			if (!confirmed) {
				const reason = confirmed === null ? 'unconfirmed-dialog' : 'unconfirmed';
				onAbort(reason);
				return;
			}
		}

		return this.executeInternal(
			data,
			params,
			onAbort,
			onBeforeExecute,
		);
	}

	/**
	 * @param {BlockLink} data
	 * @param {BlockParams | UnblockParams} params
	 * @param {AbortCallback} onAbort
	 * @param {() => void} onBeforeExecute
	 * @returns {Promise<void>}
	 * @private
	 */
	async executeInternal(data, params, onAbort, onBeforeExecute) {
		// Username is always set unless this is an unblock link for an autoblock
		const key = data.target.getUsername() || /** @type {number} */ (data.target.getId());
		const links = this.linkMap.get(key);
		if (!links) {
			mw.notify(
				Messages.get('internalerror_info', [Messages.get('ajaxblock-notify-error-noblocklinks')]),
				{ type: 'error' }
			);
			onAbort('noblocklinks');
			return;
		}

		let existingTimeout = AjaxBlock.linkRestorationTimeoutMap.get(key);
		if (existingTimeout !== undefined) {
			clearTimeout(existingTimeout);
			AjaxBlock.linkRestorationTimeoutMap.delete(key);
		}

		const /** @type {ProcessingBlockLink[]} */ processing = [];
		for (const linkObj of links) {
			if (!linkObj.locked) {
				processing.push(BlockLinkUtil.insertSpinner(linkObj));
			}
		}
		if (!processing.length) {
			mw.notify(
				Messages.get('internalerror_info', [Messages.get('ajaxblock-notify-error-noblocklinks')]),
				{ type: 'error' }
			);
			onAbort('noblocklinks');
			return;
		}

		// Allow concurrent operations again now that all required data has been collected
		// from the dialog. Note that it's safe to release the lock here because (un)block
		// links are bundled by usernames or block IDs (for autoblocks), meaning `links`
		// is always disjoint even on concurrent operations.
		//
		// The remaining race conditions to handle are:
		// - Execute (un)block operations sequentially to keep the BlockLookup index maps
		//   in a consistent state
		// - Clear any existing link restoration timeout before interacting with (un)block
		//   links (handled above)
		onBeforeExecute();

		this.pendingCount++;
		const generation = this.executionGeneration;

		const current = this.lastExecution
			// Note: lastExecution could become rejected; always chain from it using .catch()
			// to avoid breaking the execution chain.
			.catch((e) => { console.warn('Previous execution failed', e); })
			.then(() => {
				if (generation !== this.executionGeneration) {
					// This execution is stale; skip it
					return;
				}
				return this.executeInternalDoRequest(data, params, key, processing, generation);
			});
		this.lastExecution = current;

		const finalize = () => { this.pendingCount--; };
		return current.then(finalize, finalize);
	}

	/**
	 * @param {BlockLink} data
	 * @param {BlockParams | UnblockParams} params
	 * @param {string | number} key
	 * @param {ProcessingBlockLink[]} processing
	 * @param {number} gen
	 * @returns {Promise<void>}
	 * @private
	 */
	async executeInternalDoRequest(data, params, key, processing, gen) {
		// Perform the block/unblock
		const request = DEBUG_MODE ? AjaxBlock.testExecute : AjaxBlock.execute;
		let code = '';
		/** @type {JQuery<HTMLElement> | ApiResponseBlock | ApiResponseUnblock} */
		// @ts-expect-error
		const result = await request(params, data).catch((c, err) => {
			code = c;
			console.error(err);
			return AjaxBlock.api.getErrorMessage(err);
		});
		if (gen !== this.executionGeneration) {
			// This instance has been re-initialized: skip post-processing since blockLookup
			// is no longer up-to-date
			return;
		}

		// Process the result
		let /** @type {ProcessedBlockLink[]} */ processed;
		if (result instanceof $) {
			const linksRestorable = params.action === 'block'
				? this.blockLookup.updateFromFailedBlock(code, params)
				: this.blockLookup.updateFromFailedUnblock(code, params);

			mw.notify(result, { type: 'error', autoHideSeconds: 'long' });
			processed = AjaxBlock.postProcessLinks(processing, params, { code, shouldLock: !linksRestorable });
		} else {
			let otherBlocks;
			if (params.action === 'block') {
				// @ts-expect-error
				const res = /** @type {ApiResponseBlock} */ (result);
				otherBlocks = this.blockLookup.updateFromSuccessfulBlock(res);
			} else {
				// @ts-expect-error
				const res = /** @type {ApiResponseUnblock} */ (result);
				otherBlocks = this.blockLookup.updateFromSuccessfulUnblock(res);
			}

			const shouldLock = !otherBlocks
				? false
				: /** @type {(obj: ProcessedBlockLink) => boolean} */ ({ link }) => {
					// Find (un)block links that target an ID of a still active block
					const targetId = link.target.getId();
					return targetId !== null && otherBlocks.some((obj) => obj.id === targetId);
				};
			processed = AjaxBlock.postProcessLinks(processing, params, { shouldLock });
		}

		const restorable = processed.filter(({ link }) => !link.locked);
		if (!restorable.length) {
			return;
		}

		const existingTimeout = AjaxBlock.linkRestorationTimeoutMap.get(key);
		if (existingTimeout !== undefined) {
			clearTimeout(existingTimeout);
			AjaxBlock.linkRestorationTimeoutMap.delete(key);
		}
		AjaxBlock.linkRestorationTimeoutMap.set(
			key,
			setTimeout(() => {
				restorable.forEach(BlockLinkUtil.restoreLink);
				AjaxBlock.linkRestorationTimeoutMap.delete(key);
			}, 5000)
		);
	}

	/**
	 * @param {ProcessingBlockLink[]} processing
	 * @param {BlockParams | UnblockParams} params
	 * @param {object} options
	 * @param {string} [options.code] An error code on failure
	 * @param {boolean | ((obj: ProcessedBlockLink) => boolean)} options.shouldLock
	 * A boolean indicating whether the processed link should be locked (i.e., excluded
	 * from future processing and not restored), or a function returning such a boolean
	 * @returns {ProcessedBlockLink[]}
	 * @private
	 */
	static postProcessLinks(processing, params, options) {
		const { code, shouldLock } = options;
		const processed = [];

		for (const obj of processing) {
			const { link } = obj;

			// Should we mark this link as processed?
			let targetId;
			if (
				// The action matches, and
				link.type === params.action && (
					// The operation is username-based (a username-based operation indicates
					// the target wasn't blocked, or adding a new block; see TargetField.init)
					params.user !== undefined ||
					// --- The operation is ID-based ---
					// The link doesn't target a block ID (i.e., targets the username)
					(targetId = link.target.getId()) === null ||
					// The link targets the same block ID
					params.id === targetId
				)
				// Note: this condition also matches the originally clicked link
			) {
				const result = code === undefined
					? BlockLinkUtil.markAsSuccess(obj, params.action)
					: BlockLinkUtil.markAsFailure(obj, params.action, code);
				if (typeof shouldLock === 'function' ? shouldLock(result) : shouldLock) {
					result.link.locked = true;
				}
				processed.push(result);
				continue;
			}
			BlockLinkUtil.restoreLink(obj);
		}

		return processed;
	}

	/**
	 * @param {(keyof LoadedMessages)[]} warnings
	 * @param {BlockLink} data
	 * @param {WarningContext} warningContext If `dialog`, omit the "open dialog when cancelled" option
	 * @returns {JQuery.Promise<?boolean>} `null` if cancelled AND the AjaxBlockDialog should be opened
	 */
	static confirmWarnings(warnings, data, warningContext) {
		// Not using OO.ui.confirm to set the disabled state of the Confirm button
		const deferred = $.Deferred();

		const dialog = new OO.ui.MessageDialog({
			$element: $('<div>').css({ 'font-size': '90%', 'z-index': 9999 }),
			classes: ['ajaxblock-dialog'],
		});
		const $message = $('<div>').addClass('ajaxblock-field-content');

		// Add an instruction message
		const /** @type {OO.ui.FieldLayout[]} */ items = [
			new OO.ui.FieldLayout(
				new OO.ui.MessageWidget({
					classes: ['ajaxblock-message-container'],
					label: new OO.ui.HtmlSnippet(Messages.get('ajaxblock-confirm-dialog-label-instruction')),
					type: 'warning',
				}),
				{
					$element: $('<div>').css({ 'margin-bottom': '0.5em' })
				}
			)
		];

		// Add warning checkboxes
		const /** @type {OO.ui.CheckboxInputWidget[]} */ checkboxes = [];
		for (const w of warnings) {
			const cb = new OO.ui.CheckboxInputWidget();
			cb.on('change', (selected) => {
				dialog.getActions().setAbilities({
					// Micro optimization to avoid array iteration when deselected
					accept: !!selected && checkboxes.every(box => box.isSelected()),
					reject: true,
				});
			});
			checkboxes.push(cb);

			items.push(
				new OO.ui.FieldLayout(cb, {
					label: $('<span>').append(Messages.get(w)),
					align: 'inline',
				})
			);
		}

		$message.append(
			new OO.ui.FieldsetLayout({ items }).$element
		);

		// Add the "open dialog when cancelled" option if the context isn't "dialog"
		const cbOpenDialog = new OO.ui.CheckboxInputWidget({
			selected: true,
		});
		if (warningContext !== 'dialog') {
			$message.append(
				new OO.ui.FieldsetLayout({
					label: Messages.get('block-options'),
					items: [
						new OO.ui.FieldLayout(cbOpenDialog, {
							label: Messages.get('ajaxblock-confirm-dialog-label-opendialog', [SCRIPT_NAME]),
							align: 'inline',
						})
					],
				}).$element
			);
		}

		const windowManager = this.getConfirmWindowManager();
		windowManager.addWindows([dialog]);
		const window = windowManager.openWindow(dialog, {
			actions: [
				{ action: 'accept', label: Messages.get('confirm'), flags: ['primary', 'progressive'] },
				{ action: 'reject', label: Messages.get('cancel'), flags: 'safe' }
			],
			message: $message,
			size: 'medium',
			// Messages used here:
			// - ajaxblock-confirm-dialog-title-block
			// - ajaxblock-confirm-dialog-title-unblock
			title: Messages.get(`ajaxblock-confirm-dialog-title-${data.type}`),
		});
		window.opening.then(() => {
			dialog.getActions().setAbilities({
				accept: false,
				reject: true,
			});
		});
		window.closed.then(/** @param {any} [data] */ (data) => {
			/** @type {?boolean} */
			let confirmed = !!(data && data.action === 'accept');
			if (!confirmed && cbOpenDialog.isVisible() && cbOpenDialog.isSelected()) {
				confirmed = null;
			}
			windowManager.clearWindows();
			deferred.resolve(confirmed);
		});

		return deferred.promise();
	}

	/**
	 * @returns {OO.ui.WindowManager}
	 * @private
	 */
	static getConfirmWindowManager() {
		if (!this.confirmWindowManager) {
			this.confirmWindowManager = new OO.ui.WindowManager();
			$(document.body).append(this.confirmWindowManager.$element);
		}
		return this.confirmWindowManager;
	}

	/**
	 * @overload
	 * @param {BlockParams} params
	 * @param {BlockLink} _data
	 * @returns {JQuery.Promise<ApiResponseBlock>}
	 */
	/**
	 * @overload
	 * @param {UnblockParams} params
	 * @param {BlockLink} _data
	 * @returns {JQuery.Promise<ApiResponseUnblock>}
	 */
	/**
	 * @param {import('ts-essentials').XOR<BlockParams, UnblockParams>} params
	 * @param {BlockLink} _data
	 * @returns {JQuery.Promise<import('ts-essentials').XOR<ApiResponseBlock, ApiResponseUnblock>>}
	 * @private
	 */
	static execute(params, _data) {
		return AjaxBlock.api.postWithEditToken(Object.assign(
			{ curtimestamp: true },
			params
		)).then(/** @param {ApiResponse} res */ (res, jqXHR) => {
			if (res) {
				if (res.block) {
					return Object.assign(res.block, { timestamp: res.curtimestamp });
				} else if (res.unblock) {
					return res.unblock;
				}
			}
			return failAsEmptyResult(res, jqXHR);
		});
	}

	/**
	 * @overload
	 * @param {BlockParams} params
	 * @param {BlockLink} data
	 * @returns {JQuery.Promise<ApiResponseBlock>}
	 */
	/**
	 * @overload
	 * @param {UnblockParams} params
	 * @param {BlockLink} data
	 * @returns {JQuery.Promise<ApiResponseUnblock>}
	 */
	/**
	 * @param {import('ts-essentials').XOR<BlockParams, UnblockParams>} params
	 * @param {BlockLink} data
	 * @returns {JQuery.Promise<import('ts-essentials').XOR<ApiResponseBlock, ApiResponseUnblock>>}
	 * @private
	 */
	static testExecute(params, data) {
		const def = $.Deferred();

		const rand = Math.random();
		const mockApiResponse = () => {
			if (rand < 0.1) {
				const code = 'mockederror';
				const info = 'An error has been fabricated.';
				def.reject(code, info, { error: { code, info } });
				return;
			}

			const username = /** @type {string} */ (data.target.getUsername());
			if (params.action === 'block') {
				/** @type {ApiResponseBlock} */
				const resBlock = {
					user: params.user || username,
					userID: 7777,
					timestamp: new Date().toISOString(),
					expiry: params.expiry,
					id: params.id || Math.floor(rand * 1000),
					reason: params.reason,
					anononly: !!params.anononly,
					nocreate: !!params.nocreate,
					autoblock: !!params.autoblock,
					noemail: !!params.noemail,
					hidename: !!params.hidename,
					allowusertalk: !!params.allowusertalk,
					watchuser: !!params.watchuser,
					partial: !!params.partial,
					pagerestrictions: params.pagerestrictions ? params.pagerestrictions : [],
					namespacerestrictions: params.namespacerestrictions ? params.namespacerestrictions.map(n => +n) : [],
					actionrestrictions: params.actionrestrictions ? params.actionrestrictions : [],
				};
				if (params.watchlistexpiry) {
					resBlock.watchlistexpiry = params.watchlistexpiry;
				}
				def.resolve({
					block: resBlock,
				});
			} else {
				const isAutoblock = !data.target.getUsername() && !!data.target.getId();
				/** @type {ApiResponseUnblock} */
				const resUnblock = {
					user: isAutoblock ? '' : (params.user || username),
					userid: isAutoblock ? 0 : 7777,
					expiry: 'Unknown expiry',
					id: params.id || Math.floor(rand * 1000),
					reason: params.reason,
					watchuser: !!params.watchuser,
				};
				if (params.watchlistexpiry) {
					resUnblock.watchlistexpiry = params.watchlistexpiry;
				}
				def.resolve({
					unblock: resUnblock
				});
			}
		};

		setTimeout(mockApiResponse, 500 + rand * 1000);

		return def.promise();
	}

}
/**
 * @type {mw.Api}
 */
AjaxBlock.api = Object.create(null);
AjaxBlock.storageKeys = {
	blockPageAliases: 'mw-AjaxBlock-blockPageAliases',
	userRights: 'mw-AjaxBlock-userRights',
	enableMultiblocks: 'mw-AjaxBlock-enableMultiblocks',
	actionRestrictions: 'mw-AjaxBlock-actionRestrictions',
	langs: 'mw-AjaxBlock-langs',
};
/**
 * @type {?import('./window/AjaxBlock').AjaxBlockRegex}
 */
AjaxBlock.regex = null;
/**
 * @type {?string}
 */
AjaxBlock.unprocessableLinkTitleAttr = null;
/**
 * @type {?OO.ui.WindowManager}
 */
AjaxBlock.confirmWindowManager = null;
/**
 * @type {Map<string | number, NodeJS.Timeout>}
 */
AjaxBlock.linkRestorationTimeoutMap = new Map();

class BlockLinkUtil {

	static getSpinner() {
		const spinner = new Image();
		spinner.src = '//upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif';
		spinner.classList.add('ajaxblock-loading');
		return spinner;
	}

	/**
	 * @typedef {object} ProcessingBlockLink
	 * @prop {BlockLink} link
	 * @prop {HTMLSpanElement} wrapper
	 * @prop {HTMLImageElement} spinner
	 */
	/**
	 * @typedef {object} ProcessedBlockLink
	 * @prop {BlockLink} link
	 * @prop {HTMLSpanElement} wrapper
	 * @prop {HTMLElement} result
	 */
	/**
	 * Inserts a loading spinner before the given (un)block link, wrapping both in a span element.
	 *
	 * The (un)block link will only be hidden and not removed from the DOM.
	 *
	 * @param {BlockLink} linkObj
	 * @returns {ProcessingBlockLink}
	 */
	static insertSpinner(linkObj) {
		// If the link is already wrapped, reset it to the original shape
		if (linkObj.anchor.classList.contains('ajaxblock-hiddenlink') && linkObj.anchor.parentElement) {
			linkObj.anchor.parentElement.before(linkObj.anchor);
			linkObj.anchor.parentElement.remove();
		}

		// Create a <span> element with a loading spinner
		const wrapper = document.createElement('span');
		const spinner = this.getSpinner();
		wrapper.appendChild(spinner);

		// Insert the <span> immediately before the anchor and also move the anchor into the span
		linkObj.anchor.before(wrapper);
		linkObj.anchor.classList.add('ajaxblock-hiddenlink'); // Hide the anchor
		wrapper.appendChild(linkObj.anchor);

		return {
			link: linkObj,
			wrapper,
			spinner,
		};
	}

	/**
	 * Restores a (un)block link previously wrapped by {@link insertSpinner},
	 * removing the wrapper span and loading spinner.
	 *
	 * @param {ProcessingBlockLink | ProcessedBlockLink} linkObj
	 * @returns {void}
	 */
	static restoreLink(linkObj) {
		const { link, wrapper } = linkObj;
		wrapper.before(link.anchor);
		wrapper.remove();
		link.anchor.classList.remove('ajaxblock-hiddenlink');
	}

	/**
	 * Marks the given (un)block link currently being processed as failure.
	 *
	 * @param {ProcessingBlockLink} linkObj
	 * @param {BlockLink['type']} action
	 * @param {string} code
	 * @returns {ProcessedBlockLink}
	 */
	static markAsFailure(linkObj, action, code) {
		if (this.messageCache.failure[action] === null) {
			// Messages used here:
			// - ajaxblock-result-block-failure
			// - ajaxblock-result-unblock-failure
			this.messageCache.failure[action] = Messages.get(`ajaxblock-result-${action}-failure`);
		}
		const errorMsg = mw.format(this.messageCache.failure[action], code);

		const { link, spinner, wrapper } = linkObj;
		wrapper.classList.add('ajaxblock-processed');
		const result = document.createElement('span');
		result.classList.add('ajaxblock-processed-failure');
		result.textContent = errorMsg;
		spinner.replaceWith(result);

		return { link, wrapper, result };
	}

	/**
	 * Marks the given (un)block link currently being processed as success.
	 *
	 * @param {ProcessingBlockLink} linkObj
	 * @param {BlockLink['type']} action
	 * @returns {ProcessedBlockLink}
	 */
	static markAsSuccess(linkObj, action) {
		if (this.messageCache.success[action] === null) {
			// Messages used here:
			// - ajaxblock-result-block-success
			// - ajaxblock-result-unblock-success
			this.messageCache.success[action] = Messages.get(`ajaxblock-result-${action}-success`);
		}
		const successMsg = this.messageCache.success[action];

		const { link, spinner, wrapper } = linkObj;
		wrapper.classList.add('ajaxblock-processed');
		const result = document.createElement('span');
		result.classList.add('ajaxblock-processed-success');
		result.textContent = successMsg;
		spinner.replaceWith(result);

		return { link, wrapper, result };
	}

}
/**
 * @type {Record<'failure' | 'success', Record<BlockLink['type'], ?string>>}
 */
BlockLinkUtil.messageCache = {
	failure: {
		block: null,
		unblock: null,
	},
	success: {
		block: null,
		unblock: null,
	},
};

class PermissionManager {

	/**
	 * @param {Set<string>} permissions
	 */
	constructor(permissions) {
		if (DEBUG_MODE) {
			permissions.add('block');
			permissions.add('hideuser');
		}

		/**
		 * @type {Set<string>}
		 * @readonly
		 * @private
		 */
		this.permissions = permissions;
	}

	/**
	 * @param {string} permission
	 * @returns {boolean}
	 */
	isAllowed(permission) {
		return this.permissions.has(permission);
	}

	canBlock() {
		return this.isAllowed('block');
	}

	canHideUser() {
		return this.isAllowed('hideuser');
	}

	getApiLimit() {
		return this.isAllowed('apihighlimits') ? 500 : 50;
	}

}

class BlockLookup {

	/**
	 * @param {PermissionManager} permissionManager
	 * @param {Set<string>} users
	 * @param {Set<number>} ids
	 * @returns {JQuery.Promise<ApiResponseQueryListBlocks[]>}
	 * @private
	 */
	static fetch(permissionManager, users, ids) {
		const apilimit = permissionManager.getApiLimit();
		const ajaxOptions = nonwritePost();
		/**
		 * @param {(string | number)[]} batch
		 * @param {'ids' | 'users'} batchParam
		 * @param {ApiResponseQueryListBlocks[]} [ret]
		 * @param {number} [offset]
		 * @returns {JQuery.Promise<ApiResponseQueryListBlocks[]>}
		 */
		const request = (batch, batchParam, /** @private */ ret = [], /** @private */ offset = 0) => {
			if (offset >= batch.length) {
				return $.Deferred().resolve(ret).promise();
			}

			return AjaxBlock.api.post({
				list: 'blocks',
				[`bk${batchParam}`]: batch.slice(offset, offset + apilimit).join('|'),
				bklimit: 'max',
				bkprop: 'id|user|by|timestamp|expiry|reason|flags|restrictions',
			}, ajaxOptions).then(/** @param {ApiResponse} res */ (res, jqXHR) => {
				if (res && res.query && Array.isArray(res.query.blocks)) {
					ret.push(...res.query.blocks);
				} else {
					return failAsEmptyResult(res, jqXHR);
				}
				return request(batch, batchParam, ret, offset + apilimit);
			});
		};
		/**
		 * @param {Set<string> | Set<number>} batchSet
		 * @param {'ids' | 'users'} batchParam
		 * @returns {JQuery.Promise<ApiResponseQueryListBlocks[]>}
		 */
		const requestSafe = (batchSet, batchParam) => {
			return batchSet.size ? request([...batchSet], batchParam) : $.Deferred().resolve([]).promise();
		};

		return $.when(
			requestSafe(users, 'users'),
			requestSafe(ids, 'ids')
		).then((...args) => {
			/**
			 * @type {ApiResponseQueryListBlocks[]}
			 */
			const data = [];
			/**
			 * @type {Set<number>}
			 */
			const seen = new Set();

			// Flatten args and deduplicate data
			for (const list of args) {
				for (const block of list) {
					if (seen.has(block.id)) {
						continue;
					}
					data.push(block);
					seen.add(block.id);
				}
			}

			return data;
		});
	}

	/**
	 * @param {PermissionManager} permissionManager
	 * @param {Set<string>} users
	 * @param {Set<number>} ids
	 * @returns {JQuery.Promise<BlockLookup>}
	 */
	static newFromTargets(permissionManager, users, ids) {
		return this.fetch(permissionManager, users, ids).then((blocks) => {
			return new this(permissionManager, blocks);
		});
	}

	/**
	 * @param {PermissionManager} permissionManager
	 * @param {ApiResponseQueryListBlocks[]} data
	 * @private
	 */
	constructor(permissionManager, data) {
		/**
		 * @type {PermissionManager}
		 * @readonly
		 * @private
		 */
		this.permissionManager = permissionManager;
		/**
		 * @type {ApiResponseQueryListBlocks[]}
		 * @private
		 */
		this.data = data;
		/**
		 * @type {Map<number, number>}
		 * @private
		 */
		this.idMap;
		/**
		 * @type {Map<string, number[]>}
		 * @private
		 */
		this.usernameMap;

		this.mapData();
	}

	/**
	 * @private
	 */
	mapData() {
		this.idMap = new Map();
		this.usernameMap = new Map();

		this.data.forEach(({ id, user }, i) => {
			this.idMap.set(id, i);
			if (!user) {
				return;
			}
			if (!this.usernameMap.has(user)) {
				this.usernameMap.set(user, []);
			}
			/** @type {number[]} */ (this.usernameMap.get(user)).push(i);
		});
	}

	/**
	 * @param {number} id
	 * @returns {?ApiResponseQueryListBlocks}
	 */
	getBlockById(id) {
		const index = this.idMap.get(id);
		if (index === undefined) {
			return null;
		}
		return this.data[index];
	}

	/**
	 * @param {string} username
	 * @returns {?ApiResponseQueryListBlocks[]}
	 */
	getBlocksByUsername(username) {
		const indexes = this.usernameMap.get(username);
		if (indexes === undefined) {
			return null;
		}
		return indexes.map(i => this.data[i]);
	}

	/**
	 * @param {ApiResponseBlock} res
	 * @returns {?ApiResponseQueryListBlocks[]} Other active blocks, or null if none
	 */
	updateFromSuccessfulBlock(res) {
		const datum = BlockLookup.convertBlockResponseToQueryBlocksResponse(res);

		const index = this.idMap.get(res.id);
		if (index === undefined) {
			// New block
			this.data.push(datum);
			this.mapData();
		} else {
			// Reblock
			this.data[index] = datum;
		}

		// Does the user have other active blocks?
		const blocks = /** @type {ApiResponseQueryListBlocks[]} */ (this.getBlocksByUsername(res.user))
			.filter(obj => obj.id !== datum.id);
		return blocks.length ? blocks : null;
	}

	/**
	 * @param {ApiResponseBlock} res
	 * @returns {ApiResponseQueryListBlocks}
	 * @private
	 */
	static convertBlockResponseToQueryBlocksResponse(res) {
		/** @type {ApiResponseQueryListBlocks} */
		const ret = {
			id: res.id,
			user: res.user,
			by: wgUserName,
			timestamp: res.timestamp, // TODO: The API module should itself return this
			expiry: res.expiry,
			// 'duration-l10n': string; // Cannot be fabricated from ApiResponseBlock
			reason: res.reason,
			automatic: false,
			anononly: res.anononly,
			nocreate: res.nocreate,
			autoblock: res.autoblock,
			noemail: res.noemail,
			hidden: res.hidename,
			allowusertalk: res.allowusertalk,
			partial: res.partial,
			restrictions: [],
		};
		if (res.pagerestrictions || res.namespacerestrictions || res.actionrestrictions) {
			/** @type {ApiResponseQueryListBlocksRestrictions} */
			const restr = Object.create(null);
			if (res.pagerestrictions) {
				restr.pages = res.pagerestrictions.map((page) => {
					const title = new mw.Title(page);
					return { ns: title.getNamespaceId(), title: title.getPrefixedText() };
				});
			}
			if (res.namespacerestrictions) {
				restr.namespaces = res.namespacerestrictions;
			}
			if (res.actionrestrictions) {
				restr.actions = res.actionrestrictions;
			}
			ret.restrictions = restr;
		}
		return ret;
	}

	/**
	 * @param {ApiResponseUnblock} res
	 * @returns {?ApiResponseQueryListBlocks[]} Other active blocks, or null if none
	 */
	updateFromSuccessfulUnblock(res) {
		const { id, user } = res;

		const index = this.idMap.get(id);
		if (index === undefined) {
			console.warn(`Block with ID #${id} not found`);
			return null;
		}

		// Remove the lifted block entry
		this.data.splice(index, 1);
		this.mapData();

		// Does the user have other active blocks?
		if (!user) {
			// `user` is an empty string when lifting an autoblock
			return null;
		}
		return this.getBlocksByUsername(user);
	}

	/**
	 * @param {string} code
	 * @param {BlockParams} _params
	 * @returns {boolean} Whether failed links should be restored after a delay,
	 * allowing the user to retry the operation. `false` indicates a terminal failure.
	 */
	updateFromFailedBlock(code, _params) {
		return BlockLookup.retryableBlockErrors.has(code);
	}

	/**
	 * @param {string} code
	 * @param {UnblockParams} params
	 * @returns {boolean} Whether failed links should be restored after a delay,
	 * allowing the user to retry the operation. `false` indicates a terminal failure.
	 */
	updateFromFailedUnblock(code, params) {
		if (!BlockLookup.retryableUnblockErrors.has(code)) {
			return false;
		}

		if (code === 'nosuchblockid') {
			if (params.id === undefined) {
				// For type safety; not expected to reach this code path
				return false;
			}
			const index = this.idMap.get(params.id);
			if (index !== undefined) {
				this.data.splice(index, 1);
				this.mapData();
			}
		} else if (code === 'ipb_cant_unblock') {
			if (params.id !== undefined) {
				const index = this.idMap.get(params.id);
				if (index !== undefined) {
					this.data.splice(index, 1);
					this.mapData();
				}
			} else {
				const indexes = this.usernameMap.get(params.user);
				if (indexes !== undefined) {
					const indexSet = new Set(indexes);
					this.data = this.data.filter((_, i) => !indexSet.has(i));
					this.mapData();
				}
			}
		}

		return true;
	}

	/**
	 * Fetches the latest blocks for the given user and updates the internal data.
	 *
	 * @param {string} username
	 * @returns {JQuery.Promise<?ApiResponseQueryListBlocks[]>} Currently active blocks, or null if none
	 */
	refreshDataByUsername(username) {
		return BlockLookup.fetch(this.permissionManager, new Set([username]), new Set()).then((blocks) => {
			const currentIndexes = this.usernameMap.get(username);
			if (currentIndexes !== undefined) {
				const indexSet = new Set(currentIndexes);
				this.data = this.data.filter((_, i) => !indexSet.has(i));
			}

			this.data.push(...blocks);
			this.mapData();

			return blocks.length ? blocks : null;
		});
	}

}
BlockLookup.retryableBlockErrors = new Set([
	'http',
	// Requires user modifications via the dialog
	'ipb_expiry_invalid',
	'ipb_expiry_old',
	'cant-block-nonexistent-page',

	// Note: "ipb_already_blocked" is NOT retryable. This error occurs when:
	// 1. Another user has blocked the target after the page was loaded, or
	// 2. The requested block does not change any existing restrictions
	//
	// - Case #1 would require fetching the latest block state asynchronously,
	//   which is not currently supported.
	// - Case #2 is prevented by validation, so it should not occur.
]);
BlockLookup.retryableUnblockErrors = new Set([
	'http',
	// The block ID is incorrect or the block with the ID has already been lifted
	'nosuchblockid',
	// The block may have already been lifted
	'ipb_cant_unblock',
]);

class BlockTarget {

	/**
	 * @param {?string} subpage
	 * @param {URLSearchParams} query Underscores must be replaced with spaces
	 * @returns {[?number, ?string]} [id, username]
	 * @see SpecialBlock::getTargetInternal
	 */
	static validate(subpage, query) {
		let id = this.validateBlockId(query.get('id'));

		const possibleTargets = [
			query.get('wpTarget'),
			subpage,
			query.get('ip'),
			query.get('wpBlockAddress'), // B/C @since 1.18
		];
		/** @type {?string} */
		let target = null;
		for (const t of possibleTargets) {
			if (t && /^#\d+$/.test(t)) {
				if (!id) {
					id = this.validateBlockId(t.slice(1));
				}
				continue;
			}
			const validated = this.validateUsername(t);
			if (validated !== null) { // Note: this is never an empty string
				target = validated;
				break;
			}
		}

		return [id, target];
	}

	/**
	 * @param {string | number | null} id
	 * @returns {?number}
	 * @private
	 */
	static validateBlockId(id) {
		id = String(id);
		if (!/^\d+$/.test(id)) {
			return null;
		}
		const blockId = parseInt(id);
		return blockId > 0 ? blockId : null;
	}

	/**
	 * @param {?string} username
	 * @returns {?string}
	 * @private
	 */
	static validateUsername(username) {
		if (!username) {
			return null;
		}
		username = username
			.replace(/@global$/, '')
			.replace(/_/g, ' ');
		username = clean(username);
		if (mw.util.isIPAddress(username, true)) {
			username = /** @type {string} */ (mw.util.sanitizeIP(username));
		} else if (!username || this.regex.invalidUsername.test(username)) {
			return null;
		} else if (!this.regex.firstGeorgian.test(username)) {
			username = Messages.ucFirst(username);
		}
		return username;
	}

	/**
	 * Both arguments must already be validated via {@link validate}.
	 *
	 * @param {?number} id
	 * @param {?string} username
	 */
	constructor(id, username) {
		if (!id && !username) {
			throw new Error('id or username must be non-null');
		}
		/**
		 * @type {?number}
		 * @private
		 */
		this.id = id;
		/**
		 * @type {?string}
		 * @private
		 */
		this.username = username;
		/**
		 * @type {BlockTargetType}
		 * @private
		 */
		this.type = null;

		this.setType();
	}

	/**
	 * Gets the block ID.
	 *
	 * @returns {?number}
	 */
	getId() {
		return this.id;
	}

	/**
	 * Gets the block target's username.
	 *
	 * @returns {?string}
	 */
	getUsername() {
		return this.username;
	}

	/**
	 * Sets a block target's username.
	 *
	 * @param {string} username
	 * @returns {this}
	 */
	setUsername(username) {
		const u = BlockTarget.validateUsername(username);
		if (!u) {
			throw new Error('Invalid username: ' + username);
		}
		this.username = u;
		this.setType();
		return this;
	}

	/**
	 * Gets the user type of the block target.
	 *
	 * @returns {BlockTargetType}
	 */
	getType() {
		return this.type;
	}

	/**
	 * Internally called after {@link setUsername} is called.
	 *
	 * @private
	 */
	setType() {
		/**
		 * @type {BlockTargetType}
		 */
		let t;
		if (!this.username) {
			t = null;
		} else if (mw.util.isIPAddress(this.username, true)) {
			t = 'ip';
		} else if (mw.util.isTemporaryUser(this.username)) {
			t = 'temp';
		} else {
			t = 'named';
		}
		this.type = t;
	}

	/**
	 * @param {number} id
	 * @returns {HTMLAnchorElement}
	 */
	static createBlockListLink(id) {
		const anchor = document.createElement('a');
		anchor.href = mw.util.getUrl('Special:BlockList', { wpTarget: '#' + id });
		anchor.target = '_blank';
		anchor.textContent = String(id);
		return anchor;
	}

}
BlockTarget.regex = {
	invalidUsername: /[/@#<>[\]|{}:]|^(\d{1,3}\.){3}\d{1,3}$/,
	firstGeorgian: /^[\u10A0-\u10FF]/,
};

class Messages {

	/**
	 * @param {AjaxBlockConfigStore} configStore
	 */
	static loadInternalMessages(configStore) {
		const lang = configStore.getLanguage();
		const i18n = Messages.i18n[lang];
		if (lang === mw.config.get('wgUserLanguage')) {
			// If AjaxBlock's interface language matches wgUserLanguage, reuse mw.messages
			// as the internal message store. Otherwise, use an independent mw.Map instance,
			// since we should not reuse messages already loaded for wgUserLanguage when
			// they differ from AjaxBlock's interface language.
			Messages.map = mw.messages;
		}
		Messages.map.set(/** @type {any} */ (i18n));
	}

	/**
	 * Loads a set of messages via the MediaWiki API and stores them in `Messages.map`.
	 * Missing messages and any nested `{{int:...}}` dependencies are fetched recursively.
	 *
	 * All successfully loaded (and parsed) messages are cached in local storage.
	 *
	 * @param {Initializer} initializer
	 * @param {(keyof MediaWikiMessages)[]} messages List of message keys to ensure they are available.
	 * @returns {JQuery.Promise<boolean>} Resolves to `true` if any new messages were added; otherwise `false`.
	 */
	static loadMessagesIfMissing(initializer, messages) {
		const userLang = initializer.configStore.getLanguage();
		const storageKey = this.storageKey + '-' + userLang;

		// Hydrate cache
		/** @type {Record<string, string> | false | null} */
		const cached = mw.storage.getObject(storageKey);
		if (cached && Object.values(cached).every(val => typeof val === 'string')) {
			this.map.set(cached);
		}

		const /** @type {Set<string>} */ queue = new Set();
		const /** @type {Set<string>} */ seen = new Set();
		const /** @type {Set<string>} */ containsInt = new Set();

		// Seed queue
		for (const key of messages) {
			const msg = this.map.get(key);

			if (msg !== null) {
				// Resolve `{{int:...}}` and collect any missing dependencies
				const unparsed = this.parseInt(msg, key);
				if (unparsed.size > 0) {
					containsInt.add(key);
					for (const dep of unparsed) {
						if (!this.map.exists(dep)) {
							queue.add(dep);
						}
					}
				}
			} else {
				// Fully missing message
				queue.add(key);
			}
		}

		if (!queue.size) {
			return $.Deferred().resolve(false).promise();
		}

		const apilimit = initializer.permissionManager.getApiLimit();
		const /** @type {Record<string, string>} */ loadedMessages = Object.create(null);

		return (
			/**
			 * Recursively loads missing messages in batches, respecting the API limit.
			 *
			 * @param {string[]} keys List of message keys to load.
			 * @param {number} index Starting index for the current batch.
			 * @returns {JQuery.Promise<boolean>}
			 */
			function execute(keys, index) {
				const batch = keys.slice(index, index + apilimit);

				let request, ajaxOptions;
				if (batch.length <= 50) {
					request = AjaxBlock.api.get.bind(AjaxBlock.api);
					ajaxOptions = {};
				} else {
					request = AjaxBlock.api.post.bind(AjaxBlock.api);
					ajaxOptions = nonwritePost();
				}

				return request({
					meta: 'allmessages',
					ammessages: batch,
					amlang: userLang,
				}, ajaxOptions).then(/** @param {ApiResponse} res */ (res) => {
					const allmessages = res && res.query && res.query.allmessages || [];
					let added = false;

					for (const { name, content, missing } of allmessages) {
						if (seen.has(name)) {
							continue;
						}
						seen.add(name);

						if (!missing && content) {
							// Add to Messages.map; track whether any new message was added
							added = Messages.map.set(name, content) || added;

							// Parse and store final value
							const unparsed = Messages.parseInt(content, name);
							const finalValue = Messages.map.get(name);
							if (finalValue !== null) {
								loadedMessages[name] = finalValue;
							}

							if (unparsed.size > 0) {
								containsInt.add(name);
								for (const dep of unparsed) {
									if (!Messages.map.exists(dep) && !seen.has(dep)) {
										keys.push(dep);
									}
								}
							}
						} else {
							console.warn('Message not found: ' + name);
						}
					}

					index += apilimit;

					if (keys[index] !== undefined) {
						// More messages to load
						return execute(keys, index);
					}

					// Re-parse messages that had dependencies
					for (const key of containsInt) {
						const msg = Messages.map.get(key);
						if (msg !== null) {
							Messages.parseInt(msg, key);
						}
					}

					// Merge and save cache
					const newCache = Object.assign(
						{},
						cached && typeof cached === 'object' ? cached : null,
						loadedMessages
					);

					// Ensure requested messages are included
					for (const key of messages) {
						const value = Messages.map.get(key);
						if (value !== null) {
							newCache[key] = value;
						}
					}

					if (!$.isEmptyObject(newCache)) {
						mw.storage.setObject(storageKey, newCache, daysInSeconds(1));
					}

					return added;
				});
			}
		)(Array.from(queue), 0);
	}

	/**
	 * Parses a message string and replaces any `{{int:messageKey}}` magic words with
	 * resolved messages from `Messages.map`, if available. If not available, the
	 * message key is returned so it can be loaded later.
	 *
	 * If any substitutions are made, the parsed version is stored back into
	 * `Messages.map` under the original key.
	 *
	 * @param {string} msg The raw message string to parse.
	 * @param {string} key The message key associated with `msg`.
	 * @returns {Set<string>} A set of message keys that were referenced but missing.
	 * @private
	 */
	static parseInt(msg, key) {
		const original = msg;
		/** @type {Set<string>} */
		const missingKeys = new Set();

		msg = msg.replace(/\{\{\s*int:([^}]+)\}\}/g, /** @param {string} rawKey */ (match, rawKey) => {
			const parsedKey = this.lcFirst(clean(rawKey));
			/** @type {?string} */
			const replacement = this.map.get(parsedKey);
			if (replacement !== null) {
				return replacement;
			} else {
				missingKeys.add(parsedKey);
				return match;
			}
		});

		// Update the message only if it was modified
		if (msg !== original) {
			this.map.set(key, msg);
		}

		return missingKeys;
	}

	/**
	 * Gets an interface message from `Messages.map`.
	 *
	 * @template {keyof LoadedMessages} K
	 * @param {K} key Key of the message to retrieve.
	 * @param {(string|number)[]} [params] Positional parameters for replacements.
	 * @param {object} [options] Additional options.
	 * @param {import('./window/AjaxBlock').StringMethodKeys<mw.Message>} [options.method='text']
	 * Method of `mw.message` to use. Defaults to `text`.
	 * @param {boolean} [options.restoreTags=false] For `method='parse'`, whether to restore angle brackets
	 * to use the message as raw HTML. Defaults to `false`.
	 * @returns {LoadedMessages[K]} The message as a string.
	 * @todo Parsed messages should be cached
	 */
	static get(key, params = [], options = {}) {
		const { method = 'text', restoreTags = false } = options;
		let ret = new mw.Message(this.map, key, params)[method]();
		const unparsable = Array.from(ret.match(/⧼[^⧽]+⧽/g) || []);
		if (unparsable.length) {
			throw new Error('Encountered unparsable message(s): ' + unparsable.join(', '));
		}
		if (/<a[\s>]/.test(ret)) {
			// Set `target="_blank"` on all anchors if `ret` contains any links
			const $html = $('<div>').html(ret);
			$html.find('a').each((_, a) => {
				if (a.role !== 'button' && a.href && !(a.getAttribute('href') || '').startsWith('#')) {
					a.target = '_blank';
				}
			});
			ret = $html.html();
		}
		if (method === 'parse' && restoreTags) {
			ret = ret
				// .replace(/&#039;/g, '\'')
				// .replace(/&quot;/g, '"')
				.replace(/&lt;/g, '<')
				.replace(/&gt;/g, '>');
				// .replace(/&amp;/g, '&');
		}
		return ret;
	}

	/**
	 * @template {keyof LoadedMessages} K
	 * @param {K} key Key of the message to retrieve.
	 * @param {(string|number)[]} [params] Positional parameters for replacements.
	 * @returns {LoadedMessages[K]} The message as a string.
	 */
	static plain(key, params) {
		return this.get(key, params, { method: 'plain' });
	}

	/**
	 * @param {string} message
	 * @returns {string}
	 */
	static ucFirst(message) {
		return message.charAt(0).toUpperCase() + message.slice(1);
	}

	/**
	 * @param {string} message
	 * @returns {string}
	 */
	static lcFirst(message) {
		return message.charAt(0).toLowerCase() + message.slice(1);
	}

	/**
	 * Parses the `ipbreason-dropdown` message to an array of `OO.ui.MenuOptionWidget` instances.
	 *
	 * @returns {OO.ui.MenuOptionWidget[]}
	 */
	static parseBlockReasonDropdown() {
		// Adapted from Html::listDropdownOptions
		let /** @type {CachedMessage['ipbreason-dropdown']} */ options = Object.create(null);
		let /** @type {string | false} */ optgroup = false;

		const msgKey = 'ipbreason-dropdown';
		if (this.cache[msgKey]) {
			options = this.cache[msgKey];
		} else {
			for (const rawOption of this.get(msgKey, [], { method: 'plain' }).split('\n')) {
				const value = clean(rawOption);
				if (value === '') {
					continue;
				}

				if (value.startsWith('*') && !value.startsWith('**')) {
					// A new group is starting...
					const groupLabel = value.slice(1).trim();
					if (groupLabel !== '') {
						optgroup = groupLabel;
					} else {
						optgroup = false;
					}
				} else if (value.startsWith('**')) {
					// Group member
					const opt = value.slice(2).trim();
					if (optgroup === false) {
						options[opt] = opt;
					} else {
						if (typeof options[optgroup] !== 'object' || options[optgroup] === null) {
							options[optgroup] = {};
						}
						// @ts-expect-error
						options[optgroup][opt] = opt;
					}
				} else {
					// Groupless reason list
					optgroup = false;
					options[value] = value;
				}
			}
			this.cache[msgKey] = options;
		}

		// Adapted from listDropdownOptionsOoui
		const /** @type {OO.ui.MenuOptionWidget[]} */ items = [
			new OO.ui.MenuOptionWidget({ data: '', label: this.get('htmlform-selectorother-other') })
		];
		for (const [text, value] of Object.entries(options)) {
			if (typeof value === 'object') {
				items.push(new OO.ui.MenuSectionOptionWidget({ label: text }));
				for (const [text2, value2] of Object.entries(value)) {
					items.push(new OO.ui.MenuOptionWidget({ data: value2, label: text2 }));
				}
			} else {
				items.push(new OO.ui.MenuOptionWidget({ data: value, label: text }));
			}
		}
		return items;
	}

	/**
	 * Creates a wikilink to a local title as raw HTML.
	 *
	 * @param {string} title The title of the page to link to.
	 * @param {string} [display] The display text of the link. If omitted, `title` is used.
	 * @param {Record<string, string | number>} [query]
	 * @returns {string} An `<a>` tag as raw HTML.
	 */
	static wikilink(title, display, query) {
		const anchor = document.createElement('a');
		anchor.href = mw.util.getUrl(title, query || { noredirect: 1 });
		anchor.target = '_blank';
		anchor.textContent = display || title;
		return anchor.outerHTML;
	}

	/**
	 * Parse labels and values out of a comma- and colon-separated list of options, such as is
	 * used for expiry and duration lists.
	 *
	 * This method is adapted from `XmlSelect::parseOptionsMessage`.
	 * @param {'ipboptions' | 'watchlist-expiry-options'} msgKey The key of the message to parse as a list.
	 * @returns {Map<string, string>}
	 */
	static parseOptionsMessage(msgKey) {
		if (this.cache[msgKey]) {
			return this.cache[msgKey];
		}

		const message = clean(this.get(msgKey, [], { method: 'plain' }));
		/** @type {Map<string, string>} */
		const ret = new Map();
		if (message === '-') {
			return ret;
		}
		message.split(',').forEach((el) => {
			// Normalize options that only have one part
			if (!el.includes(':')) {
				el = `${el}:${el}`;
			}
			// Extract the two parts.
			let [label, value] = el.split(':');
			label.trim();
			value.trim();
			if (mw.util.isInfinity(value)) {
				// Consistently use 'infinity' for a value of infinity
				value = EXPIRY_INFINITE;
			}
			ret.set(label, value);
		});

		this.cache[msgKey] = ret;
		return ret;
	}

	// /**
	//  * Translates an expiry value to its localized label if available.
	//  *
	//  * @param {string} expiry
	//  * @returns {string} The localized label for the input expiry value, or the input expiry value
	//  * as-is if no translation is available.
	//  */
	// static translateBlockExpiry(expiry) {
	// 	const map = this.parseOptionsMessage('ipboptions');
	// 	const isInputIndef = mw.util.isInfinity(expiry);
	// 	for (const [label, value] of map) {
	// 		if (expiry === value || isInputIndef && mw.util.isInfinity(value)) {
	// 			return label;
	// 		}
	// 	}
	// 	return expiry;
	// }

	// /**
	//  * Parses a summary via the API.
	//  *
	//  * @param {string} summary The summary to parse.
	//  * @returns {JQuery.Promise<?string>}
	//  */
	// static parseSummary(summary) {
	// 	return api.get({
	// 		action: 'parse',
	// 		formatversion: '2',
	// 		summary,
	// 		prop: ''
	// 	}).then(/** @param {ApiResponse} res */ (res) => {
	// 		const parsedsummary = res && res.parse && res.parse.parsedsummary;
	// 		return typeof parsedsummary === 'string' ? parsedsummary : null;
	// 	}).catch((_, err) => {
	// 		console.log('Failed to parse summary:', err);
	// 		return null;
	// 	});
	// }

	/**
	 * Takes a list of strings and build a locale-friendly comma-separated list, using the local
	 * comma-separator message. The last two strings are chained with an "and".
	 *
	 * This method is adapted from `Language::listToText` in MediaWiki-core.
	 *
	 * @param {string[]} list
	 * @return {string}
	 */
	static listToText(list) {
		const itemCount = list.length;
		if (!itemCount) {
			return '';
		}
		let text = /** @type {string} */ (list.pop());
		if (itemCount > 1) {
			const and = Messages.plain('and');
			const space = Messages.plain('word-separator');
			let comma = '';
			if (itemCount > 2) {
				comma = Messages.plain('comma-separator');
			}
			text = list.join(comma) + and + space + text;
		}
		return text;
	}

}
/**
 * @type {Record<AjaxBlockLanguages, AjaxBlockMessages>}
 */
Messages.i18n = {
	en: {
		'ajaxblock-link-title-unprocessable': '$1 cannot process this link',
		'ajaxblock-dialog-button-label-block': 'Block',
		'ajaxblock-dialog-button-label-unblock': 'Unblock',
		'ajaxblock-dialog-button-label-docs': 'Docs',
		'ajaxblock-dialog-button-label-config': 'Config',
		'ajaxblock-dialog-block-placeholder-preset': 'Select a preset to load',
		'ajaxblock-notify-block-placeholder-preset': 'Loaded preset "$1"',
		'ajaxblock-dialog-block-label-reason1': 'Reason 1',
		'ajaxblock-dialog-block-label-reason2': 'Reason 2',
		'ajaxblock-dialog-block-label-customreasons': 'Custom block reasons',
		'ajaxblock-dialog-block-label-partial': 'Partial block',
		'ajaxblock-dialog-block-label-option-autoblock': 'Apply autoblock',
		'ajaxblock-dialog-message-nonactive-id': 'The block with ID <b>#$1</b> specified by this link is no longer active and has been ignored.',
		'ajaxblock-dialog-message-existingblocks': '<b>This user already has active block(s).</b> Select the block you want to update.',
		'ajaxblock-dialog-message-existingblocks-canadd': '<b>This user already has active block(s).</b> Select the block you want to update, or check "{{int:block-create}}" to add a new block.',
		'ajaxblock-dialog-message-existingblocks-unblock': 'Select the block you want to remove.',
		'ajaxblock-dialog-message-existingblocks-dialogonly': '<b>This action must be performed via this dialog.</b> One-click execution is not supported.',
		'ajaxblock-dialog-message-predefinedparams-block': 'This link contains predefined block parameters.',
		'ajaxblock-dialog-message-predefinedparams-unblock': 'This link contains predefined unblock parameters.',
		'ajaxblock-dialog-message-applyparams-short': 'apply',
		'ajaxblock-dialog-message-applyparams-long': 'apply parameters',
		'ajaxblock-dialog-message-blocklog-missing': 'Failed to load the log for the block with ID <b>#$1</b>',
		'ajaxblock-notify-error-loadblocklogs': 'Failed to load block information ($1)',
		'ajaxblock-notify-error-idinactivenousername': 'This link cannot be processed because the block with ID <b>#$1</b> is no longer active and no username is specified.',
		'ajaxblock-notify-error-cannotunblock': '<b>$1</b> does not have any active blocks and cannot be unblocked.',
		'ajaxblock-notify-error-ambiguousblock': 'Select the block you want to update.',
		'ajaxblock-notify-error-ambiguousblock-canadd': 'Select the block you want to update, or check "{{int:block-create}}" to add a new block.',
		'ajaxblock-notify-error-notarget': 'This (un)block operation cannot be processed.',
		'ajaxblock-notify-error-emptyblock': 'This would result in an empty block. Please add restrictions or uncheck "{{int:ajaxblock-dialog-block-label-partial}}".',
		'ajaxblock-notify-error-processing': 'This link is temporarily unprocessable because another operation is currently processing it.',
		'ajaxblock-notify-error-noblocklinks': 'No associated block links found.',
		'ajaxblock-notify-error-cannotopendialog': 'Unable to open the $1 dialog because there are pending operations currently being processed. Please wait for them to finish and try again.',
		'ajaxblock-notify-error-cannotopendialog-oneclick': 'This link must be executed via the dialog, but could not open it because there are pending operations currently being processed. Please wait for them to finish and try again.',
		'ajaxblock-notify-error-paramapplier-presetsnotready': 'AjaxBlock is still loading block presets. Please try again in a few seconds. If this error occurs frequently, consider removing page restrictions from your presets.',
		'ajaxblock-notify-warning-paramapplier-filtered-top': 'Filtered invalid block parameter values:',
		'ajaxblock-notify-warning-paramapplier-filtered-pages': 'Page restrictions',
		'ajaxblock-notify-warning-paramapplier-filtered-namespaces': 'Namespace restrictions',
		'ajaxblock-confirm-block-noreason': 'Block with <b>no reason</b> specified',
		'ajaxblock-confirm-block-noexpiry': 'Block with <b>no expiry</b> specified (defaults to "{{int:infiniteblock}}")',
		'ajaxblock-confirm-block-hardblock': 'Apply a <b>hardblock</b>',
		'ajaxblock-confirm-block-hideuser': 'Block with <b>"Hide user" enabled</b>',
		'ajaxblock-confirm-block-reblock': '<b>Overwrite</b> the existing block',
		'ajaxblock-confirm-block-newblock': '<b>Add</b> a new block',
		'ajaxblock-confirm-block-self': 'Block <b>yourself</b>',
		'ajaxblock-confirm-block-ignorepredefined': 'Block while <b>ignoring predefined parameters</b>',
		'ajaxblock-confirm-unblock': '<b>Unblock</b> the user',
		'ajaxblock-confirm-unblock-noreason': 'Unblock with <b>no reason</b> specified',
		'ajaxblock-confirm-unblock-self': 'Unblock <b>yourself</b>',
		'ajaxblock-confirm-unblock-ignorepredefined': 'Unblock while <b>ignoring predefined parameters</b>',
		'ajaxblock-confirm-dialog-title-block': 'Confirm block',
		'ajaxblock-confirm-dialog-title-unblock': 'Confirm unblock',
		'ajaxblock-confirm-dialog-label-instruction': 'Please confirm the following warnings by <b>checking all the associated checkboxes</b> to proceed.',
		'ajaxblock-confirm-dialog-label-opendialog': 'Open the $1 dialog when cancelled',
		'ajaxblock-result-block-success': 'blocked',
		'ajaxblock-result-block-failure': 'block failed ($1)',
		'ajaxblock-result-unblock-success': 'unblocked',
		'ajaxblock-result-unblock-failure': 'unblock failed ($1)',
		'ajaxblock-config-title': 'Configure AjaxBlock',
		'ajaxblock-config-loading': 'Loading',
		'ajaxblock-config-loading-failure': 'Failed to initialize the AjaxBlock config interface',
		'ajaxblock-config-label-tab-common': 'Common',
		'ajaxblock-config-label-tab-global': 'Global',
		'ajaxblock-config-label-tab-local': 'Local',
		'ajaxblock-config-label-tab-misc': 'Miscellaneous',
		'ajaxblock-config-label-default': 'Default',
		'ajaxblock-config-label-languages-layout': 'Language options',
		'ajaxblock-config-label-languages-used': 'Used languages',
		'ajaxblock-config-placeholder-languages-used': 'Add languages',
		'ajaxblock-config-help-languages-used': 'Used when the interface language in use matches one of the selected languages.',
		'ajaxblock-config-label-languages-default': 'Default language',
		'ajaxblock-config-help-languages-default': 'Used when the interface language in use does not match any language selected in "{{int:ajaxblock-config-label-languages-used}}".',
		'ajaxblock-config-label-warning-layout': 'Warning options',
		'ajaxblock-config-label-warning-th-oneclick': 'One click',
		'ajaxblock-config-label-warning-th-dialog': 'Dialog',
		'ajaxblock-config-label-warning-block-noreason': 'When performing a block with no reason specified',
		'ajaxblock-config-label-warning-block-noexpiry': 'When performing a block with no expiry specified',
		'ajaxblock-config-label-warning-block-hardblock': 'When performing a hardblock',
		'ajaxblock-config-label-warning-block-hideuser': 'When performing a hideuser block',
		'ajaxblock-config-label-warning-block-reblock': 'When overwriting an existing block',
		'ajaxblock-config-label-warning-block-newblock': 'When adding a new block',
		'ajaxblock-config-label-warning-block-self': 'When performing a block on the performer themselves',
		'ajaxblock-config-label-warning-block-ignorepredefined': 'When not using predefined block parameters',
		'ajaxblock-config-label-warning-unblock': 'When performing an unblock',
		'ajaxblock-config-label-warning-unblock-noreason': 'When performing an unblock with no reason specified',
		'ajaxblock-config-label-warning-unblock-self': 'When performing an unblock on the performer themselves',
		'ajaxblock-config-label-warning-unblock-ignorepredefined': 'When not using predefined unblock parameters',
		'ajaxblock-config-label-reset': 'Reset',
		'ajaxblock-config-label-presetreasons-layout': 'Preset block options',
		'ajaxblock-config-label-presetreasons-name': 'Preset',
		'ajaxblock-config-placeholder-presetreasons-name': 'Enter a preset name',
		'ajaxblock-config-label-presetreasons-target-named': 'Registered users',
		'ajaxblock-config-label-presetreasons-target-temp': 'Temporary users',
		'ajaxblock-config-label-presetreasons-target-ip': 'IP users',
		'ajaxblock-config-placeholder-presetreasons-target': 'Add user types',
		'ajaxblock-config-notice-presetreasons-additionaloptions': 'In the dialog, some of the options below may be hidden depending on the target and user permissions.',
		'ajaxblock-config-label-presetreasons-add': 'Add preset',
		'ajaxblock-config-label-presetreasons-delete': 'Delete preset',
		'ajaxblock-config-placeholder-customreasons': 'Enter reasons separated by line breaks',
		'ajaxblock-config-label-customreasons-block-layout': 'Custom block reason options',
		'ajaxblock-config-label-customreasons-unblock-layout': 'Custom unblock reason options',
		'ajaxblock-config-help-customreasons-block': 'Reasons specified here will be added to the block reason dropdown',
		'ajaxblock-config-help-customreasons-unblock': 'Reasons specified here will be shown as autocomplete suggestions in the unblock reason textbox',
	},
	ja: {
		'ajaxblock-link-title-unprocessable': '$1非対応のリンク',
		'ajaxblock-dialog-button-label-block': 'ブロック',
		'ajaxblock-dialog-button-label-unblock': 'ブロック解除',
		'ajaxblock-dialog-button-label-docs': '解説',
		'ajaxblock-dialog-button-label-config': '設定',
		'ajaxblock-dialog-block-placeholder-preset': '読み込むプリセットを選択',
		'ajaxblock-notify-block-placeholder-preset': 'プリセット「$1」を読み込みました',
		'ajaxblock-dialog-block-label-reason1': '理由1',
		'ajaxblock-dialog-block-label-reason2': '理由2',
		'ajaxblock-dialog-block-label-customreasons': 'カスタムブロック理由',
		'ajaxblock-dialog-block-label-partial': '部分ブロック',
		'ajaxblock-dialog-block-label-option-autoblock': '自動ブロックを適用',
		'ajaxblock-dialog-message-nonactive-id': 'このリンクで指定されたID <b>#$1</b> のブロックは既に解除されているため、無視されました。',
		'ajaxblock-dialog-message-existingblocks': '<b>この利用者は既にブロックされています。</b>更新するブロックを選択してください。',
		'ajaxblock-dialog-message-existingblocks-canadd': '<b>この利用者は既にブロックされています。</b>更新するブロックを選択するか、「{{int:block-create}}」をチェックして新しいブロックを追加してください。',
		'ajaxblock-dialog-message-existingblocks-unblock': '解除するブロックを選択してください。',
		'ajaxblock-dialog-message-existingblocks-dialogonly': '<b>この操作はダイアログから行う必要があります。</b>ワンクリック操作は実行できません。',
		'ajaxblock-dialog-message-predefinedparams-block': 'このリンクには事前定義されたブロックパラメータがあります。',
		'ajaxblock-dialog-message-predefinedparams-unblock': 'このリンクには事前定義されたブロック解除パラメータがあります。',
		'ajaxblock-dialog-message-applyparams-short': '反映',
		'ajaxblock-dialog-message-applyparams-long': 'パラメータを反映',
		'ajaxblock-dialog-message-blocklog-missing': 'ID <b>#$1</b> に紐付けられたブロック記録を取得できませんでした',
		'ajaxblock-notify-error-loadblocklogs': 'ブロック情報の取得に失敗しました ($1)',
		'ajaxblock-notify-error-idinactivenousername': 'このリンクに紐付けられたID <b>#$1</b> のブロックは既に解除されており、利用者名も指定されていないため処理できません。',
		'ajaxblock-notify-error-cannotunblock': '<b>$1</b> は現在ブロックされていないため、ブロックを解除できません。',
		'ajaxblock-notify-error-ambiguousblock': '更新するブロックを選択してください。',
		'ajaxblock-notify-error-ambiguousblock-canadd': '更新するブロックを選択するか、「{{int:block-create}}」をチェックして新しいブロックを追加してください。',
		'ajaxblock-notify-error-notarget': 'このブロック・ブロック解除操作は処理できません。',
		'ajaxblock-notify-error-emptyblock': 'このブロック設定では制限される操作がありません。制限を追加するか、「{{int:ajaxblock-dialog-block-label-partial}}」のチェックを外してください。',
		'ajaxblock-notify-error-processing': '別プロセスがこのリンクを処理中のため、操作が一時的に無効化されています。',
		'ajaxblock-notify-error-noblocklinks': '関連するブロックリンクが存在しません。',
		'ajaxblock-notify-error-cannotopendialog': '実行中の処理が存在するため、$1ダイアログを開けません。処理の完了後に再度お試しください。',
		'ajaxblock-notify-error-cannotopendialog-oneclick': 'このリンクはダイアログからの実行が必要ですが、実行中の処理が存在するためダイアログを開けませんでした。処理の完了後に再度お試しください。',
		'ajaxblock-notify-error-paramapplier-presetsnotready': 'AjaxBlockはブロックプリセットを読み込み中です。数秒おいてからもう一度お試しください。このエラーが頻繁に発生する場合、プリセットからページ制限を除去することを検討してください。',
		'ajaxblock-notify-warning-paramapplier-filtered-top': '無効なブロック設定の値を除外しました:',
		'ajaxblock-notify-warning-paramapplier-filtered-pages': 'ページ制限',
		'ajaxblock-notify-warning-paramapplier-filtered-namespaces': '名前空間制限',
		'ajaxblock-confirm-block-noreason': '<b>理由未指定</b>でブロック',
		'ajaxblock-confirm-block-noexpiry': '<b>有効期限未指定</b>でブロック（既定値「{{int:infiniteblock}}」）',
		'ajaxblock-confirm-block-hardblock': '<b>ハードブロック</b>を適用',
		'ajaxblock-confirm-block-hideuser': '<b>「利用者名を隠す」</b>を有効にしてブロック',
		'ajaxblock-confirm-block-reblock': '既存のブロックを<b>上書き</b>',
		'ajaxblock-confirm-block-newblock': '新しいブロックを<b>追加</b>',
		'ajaxblock-confirm-block-self': '<b>自分自身</b>をブロック',
		'ajaxblock-confirm-block-ignorepredefined': '<b>事前定義された設定を無視</b>してブロック',
		'ajaxblock-confirm-unblock': '利用者の<b>ブロックを解除</b>',
		'ajaxblock-confirm-unblock-noreason': '<b>理由未指定</b>でブロックを解除',
		'ajaxblock-confirm-unblock-self': '<b>自分自身</b>のブロックを解除',
		'ajaxblock-confirm-unblock-ignorepredefined': '<b>事前定義された設定を無視</b>してブロックを解除',
		'ajaxblock-confirm-dialog-title-block': 'ブロックの確認',
		'ajaxblock-confirm-dialog-title-unblock': 'ブロック解除の確認',
		'ajaxblock-confirm-dialog-label-instruction': '以下の警告を確認し、操作を続行するには<b>該当するすべてのチェックボックスをチェック</b>してください。',
		'ajaxblock-confirm-dialog-label-opendialog': 'キャンセル時に$1ダイアログを開く',
		'ajaxblock-result-block-success': 'ブロック済み',
		'ajaxblock-result-block-failure': 'ブロック失敗 ($1)',
		'ajaxblock-result-unblock-success': 'ブロック解除済み',
		'ajaxblock-result-unblock-failure': 'ブロック解除失敗 ($1)',
		'ajaxblock-config-title': 'AjaxBlockの設定',
		'ajaxblock-config-loading': '読み込み中',
		'ajaxblock-config-loading-failure': 'AjaxBlockの設定インターフェースの読み込みに失敗しました',
		'ajaxblock-config-label-tab-common': '共通',
		'ajaxblock-config-label-tab-global': 'グローバル',
		'ajaxblock-config-label-tab-local': 'ローカル',
		'ajaxblock-config-label-tab-misc': 'その他',
		'ajaxblock-config-label-default': '規定値',
		'ajaxblock-config-label-languages-layout': '言語設定',
		'ajaxblock-config-label-languages-used': '使用言語',
		'ajaxblock-config-placeholder-languages-used': '言語を追加',
		'ajaxblock-config-help-languages-used': '使用中のインターフェース言語が選択されたいずれかの言語と一致する場合に使用されます。',
		'ajaxblock-config-label-languages-default': '既定言語',
		'ajaxblock-config-help-languages-default': '使用中のインターフェース言語が「{{int:ajaxblock-config-label-languages-used}}」のいずれとも一致しない場合に使用されます。',
		'ajaxblock-config-label-warning-layout': '警告設定',
		'ajaxblock-config-label-warning-th-oneclick': 'ワンクリック',
		'ajaxblock-config-label-warning-th-dialog': 'ダイアログ',
		'ajaxblock-config-label-warning-block-noreason': '理由を指定せずにブロックを実行する場合',
		'ajaxblock-config-label-warning-block-noexpiry': '有効期限を指定せずにブロックを実行する場合',
		'ajaxblock-config-label-warning-block-hardblock': 'ハードブロックを実行する場合',
		'ajaxblock-config-label-warning-block-hideuser': '利用者名を非表示にするブロックを実行する場合',
		'ajaxblock-config-label-warning-block-reblock': '既存のブロックを上書きする場合',
		'ajaxblock-config-label-warning-block-newblock': '新たにブロックを追加する場合',
		'ajaxblock-config-label-warning-block-self': '実行者自身をブロックする場合',
		'ajaxblock-config-label-warning-block-ignorepredefined': '事前定義されたブロック設定を無視する場合',
		'ajaxblock-config-label-warning-unblock': 'ブロック解除を実行する場合',
		'ajaxblock-config-label-warning-unblock-noreason': '理由を指定せずにブロック解除を実行する場合',
		'ajaxblock-config-label-warning-unblock-self': '実行者自身のブロックを解除する場合',
		'ajaxblock-config-label-warning-unblock-ignorepredefined': '事前定義されたブロック解除設定を無視する場合',
		'ajaxblock-config-label-reset': 'リセット',
		'ajaxblock-config-label-presetreasons-layout': 'プリセットブロック設定',
		'ajaxblock-config-label-presetreasons-name': 'プリセット',
		'ajaxblock-config-placeholder-presetreasons-name': 'プリセット名を入力',
		'ajaxblock-config-label-presetreasons-target-named': '登録利用者',
		'ajaxblock-config-label-presetreasons-target-temp': '仮利用者',
		'ajaxblock-config-label-presetreasons-target-ip': 'IP利用者',
		'ajaxblock-config-placeholder-presetreasons-target': '利用者種別を追加',
		'ajaxblock-config-notice-presetreasons-additionaloptions': 'ダイアログ上では、対象と利用者権限に応じて以下のオプションのいくつかは非表示になる場合があります。',
		'ajaxblock-config-label-presetreasons-add': 'プリセットを追加',
		'ajaxblock-config-label-presetreasons-delete': 'プリセットを削除',
		'ajaxblock-config-placeholder-customreasons': '理由を改行区切りで入力',
		'ajaxblock-config-label-customreasons-block-layout': 'カスタムブロック理由設定',
		'ajaxblock-config-label-customreasons-unblock-layout': 'カスタムブロック解除理由設定',
		'ajaxblock-config-help-customreasons-block': 'ここで指定した理由はブロック理由ドロップダウンに追加されます',
		'ajaxblock-config-help-customreasons-unblock': 'ここで指定した理由はブロック解除理由入力欄のオートコンプリート候補として表示されます',
	},
};
/**
 * Key for `mw.storage` to cache some messages.
 */
Messages.storageKey = 'mw-AjaxBlock-messages';
/**
 * @type {CachedMessage}
 */
Messages.cache = Object.create(null);
/**
 * Internal message store abstraction.
 *
 * This may either reference `mw.messages` or an independent `mw.Map` depending on the interface language.
 * See also {@link Messages.loadInternalMessages}.
 *
 * @type {mw.Map<Record<string, string>>}
 */
Messages.map = new mw.Map();

class DropdownUtil {

	/**
	 * @param {OO.ui.DropdownWidget} dropdown
	 * @private
	 */
	static assertOneOptionSelected(dropdown) {
		const selected = dropdown.getMenu().findSelectedItems();
		if (selected === null) {
			throw new Error('No option is selected');
		} else if (Array.isArray(selected)) {
			throw new Error('Multiple options are selected');
		}
	}

	/**
	 * @param {OO.ui.DropdownWidget} dropdown
	 */
	static selectInfinity(dropdown) {
		dropdown.getMenu().selectItemByData(EXPIRY_INFINITE);
		this.assertOneOptionSelected(dropdown);
	}

	/**
	 * @param {OO.ui.DropdownWidget} dropdown
	 */
	static selectOther(dropdown) {
		dropdown.getMenu().selectItemByData('');
		this.assertOneOptionSelected(dropdown);
	}

	/**
	 * Parses the `ipboptions` message to an array of `OO.ui.MenuOptionWidget` instances.
	 *
	 * @param {'ipboptions' | 'watchlist-expiry-options'} key
	 * @returns {OO.ui.MenuOptionWidget[]}
	 */
	static getDurationMenuOptions(key) {
		/** @type {OO.ui.MenuOptionWidget[]} */
		const options = [];
		if (key === 'ipboptions') {
			options.push(
				new OO.ui.MenuOptionWidget({
					label: Messages.get('ipbother').replace(/[:：]$/, ''),
					data: ''
				})
			);
		}

		const map = Messages.parseOptionsMessage(key);
		let indefFound = false;
		for (const [label, value] of map) {
			indefFound = indefFound || value === EXPIRY_INFINITE;
			options.push(
				new OO.ui.MenuOptionWidget({ label, data: value })
			);
		}
		if (!indefFound) {
			// Ensure the presence of an "indefinite" option
			options.push(
				new OO.ui.MenuOptionWidget({ label: Messages.get('infiniteblock'), data: EXPIRY_INFINITE })
			);
		}

		return options;
	}

	/**
	 * Gets the string data of the first selected item in the given dropdown.
	 *
	 * Notes:
	 * - At least one option must be selected; otherwise, throws an Error.
	 * - `getData()` must return a string; otherwise, throws a TypeError.
	 * - If `getData()` returns an empty string (indicating that the "other"
	 *   option is selected), returns null.
	 *
	 * @param {OO.ui.DropdownWidget} dropdown
	 * @returns {?string} `null` if the "other" option is selected
	 */
	static getSelectedOptionValue(dropdown) {
		const item = dropdown.getMenu().findFirstSelectedItem();
		if (item === null) {
			throw new Error('No option is selected');
		}
		const value = item.getData();
		if (typeof value !== 'string') {
			throw new TypeError('The selected dropdown option has data of type ' + typeof value);
		}
		return value === '' ? null : value;
	}

	/**
	 * Gets the string data of the first selected item in the given dropdown.
	 *
	 * Same as {@link getSelectedOptionValue}, but throws an Error if the selected
	 * option corresponds to the "other" value.
	 *
	 * @param {OO.ui.DropdownWidget} dropdown
	 * @returns {string}
	 * @throws {Error} If the "other" option is selected
	 */
	static getSelectedOptionValueThrow(dropdown) {
		const value = this.getSelectedOptionValue(dropdown);
		if (value === null) {
			throw new Error('The "other" option cannot be selected');
		}
		return value;
	}

	/**
	 * @param {OO.ui.DropdownWidget} dropdown
	 * @param {(item: OO.ui.MenuOptionWidget, index: number, array: readonly OO.ui.MenuOptionWidget[]) => boolean} callback
	 * @returns {?OO.ui.MenuOptionWidget}
	 */
	static findItemByCallback(dropdown, callback) {
		const items = /** @type {OO.ui.MenuOptionWidget[]} */ (dropdown.getMenu().getItems());
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (callback(item, i, items)) {
				return item;
			}
		}
		return null;
	}

	/**
	 * @param {OO.ui.MenuSelectWidget} menu
	 * @param {string} groupLabel
	 * @returns {?OO.ui.OptionWidget[]}
	 */
	static findGroupedOptions(menu, groupLabel) {
		let /** @type {?number} */ start = null;
		let /** @type {?number} */ end = null;
		const options = /** @type {OO.ui.OptionWidget[]} */ (menu.getItems());

		for (let i = 0; i < options.length; i++) {
			const option = options[i];
			if (option instanceof OO.ui.MenuSectionOptionWidget) {
				if (start === null && option.getLabel() === groupLabel) {
					start = i;
				} else if (start !== null) {
					end = i;
					break;
				}
			}
		}

		return (start !== null && end !== null) ? options.slice(start, end) : null;
	}

}

function AjaxBlockDialogFactory() {
	/**
	 * @constructor
	 * @param {OO.ui.ProcessDialog.ConfigOptions} [config]
	 */
	function ProcessDialog(config) {
		// @ts-expect-error
		ProcessDialog.super.call(this, config);
	}
	OO.inheritClass(ProcessDialog, OO.ui.ProcessDialog);

	/**
	 * @extends OO.ui.ProcessDialog
	 */
	class AjaxBlockDialog extends ProcessDialog {

		/**
		 * @param {AjaxBlock} ajaxBlock
		 * @param {OO.ui.ProcessDialog.ConfigOptions} [config]
		 */
		constructor(ajaxBlock, config) {
			super(config);

			/**
			 * @type {AjaxBlock}
			 * @readonly
			 * @private
			 */
			this.ajaxBlock = ajaxBlock;
			/**
			 * @type {?BlockLogGenerator}
			 * @private
			 */
			this.blockLogGenerator = null;
			/**
			 * @type {BlockUser}
			 * @readonly
			 * @private
			 */
			this.blockNamed = new BlockUser(this, 'named');
			/**
			 * @type {BlockUser}
			 * @readonly
			 * @private
			 */
			this.blockTemp = new BlockUser(this, 'temp');
			/**
			 * @type {BlockUser}
			 * @readonly
			 * @private
			 */
			this.blockIp = new BlockUser(this, 'ip');
			/**
			 * @type {UnblockUser}
			 * @readonly
			 * @private
			 */
			this.unblockUser = new UnblockUser(this);
			/**
			 * @type {AjaxBlockDialogBodyOverlay}
			 * @readonly
			 */
			this.overlay = new AjaxBlockDialogBodyOverlay();
			/**
			 * @type {?BlockLink}
			 * @private
			 */
			this.currentData = null;
			/**
			 * @type {boolean}
			 * @private
			 */
			this.locked = false;
			/**
			 * Map of block target types to promises that resolve when preset parameters
			 * have been fully applied to the corresponding BlockUser instance.
			 *
			 * Populated during {@link initialize}. Promises never reject.
			 *
			 * @type {Partial<Record<NonNullable<BlockTargetType>, JQuery.Promise<void>>>}
			 * @private
			 */
			this.paramApplierPromiseMap = Object.create(null);
			/**
			 * @type {OO.ui.PanelLayout}
			 * @readonly
			 * @private
			 */
			this.content = new OO.ui.PanelLayout({
				$element: $('<div>').addClass('ajaxblock-dialog-overlay-container'),
				padded: true,
				expanded: false
			});

			this.content.$element.append(
				this.overlay.$element,
				this.blockNamed.$element,
				this.blockTemp.$element,
				this.blockIp.$element,
				this.unblockUser.$element
			);
		}

		getInitializer() {
			return this.ajaxBlock.initializer;
		}

		getBlockLookup() {
			return this.ajaxBlock.blockLookup;
		}

		getCurrentData() {
			if (this.currentData === null) {
				throw new Error('Dialog data has not been initialized');
			}
			return this.currentData;
		}

		presetsReady() {
			if (!this.isInitialized()) {
				return false;
			}
			return Object.values(this.paramApplierPromiseMap).every(promise => promise.state() === 'resolved');
		}

		/**
		 * @inheritdoc
		 * @override
		 */
		initialize() {
			// @ts-expect-error
			super.initialize.apply(this, arguments);

			// @ts-expect-error
			this.$body.append(this.content.$element);

			// Apply preset block options
			const presets = this.getInitializer().configStore.getPresets('merged');
			this.paramApplierPromiseMap = [this.blockNamed, this.blockTemp, this.blockIp].reduce((acc, blockUser) => {
				const targetType = blockUser.getPresetType();
				const preset = presets.get(targetType);
				if (!preset) {
					console.error(`Preset "${targetType}" is not found`);
					return acc;
				}
				acc[targetType] = ParamApplier.applyBlockParams(preset.getParams(), blockUser, {
					hooks: { targetType },
					context: { preset: targetType, scriptName: true },
					notification: { autoHideSeconds: undefined, autoHide: false },
				});
				return acc;
			}, /** @type {Record<NonNullable<BlockTargetType>, JQuery.Promise<void>>} */ (Object.create(null)));

			return this;
		}

		/**
		 * @inheritdoc
		 * @override
		 * @param {BlockLink} data
		 */
		getSetupProcess(data) {
			return super.getSetupProcess(data).next(() => {
				const proceed = this.prepareDialog(data);
				if (!proceed) {
					return false;
				}
				ParamApplier.addSearchParamApplier(this, data);
				if (this.blockLogGenerator) {
					this.pushPending();
					this.content.toggle(false);
				}
				return true;
			});
		}

		/**
		 * @param {BlockLink} data
		 * @returns {boolean}
		 */
		prepareDialog(data) {
			// Set mode and determine which buttons/fields to show
			this.currentData = data;
			this.getActions().setMode(data.type);
			const field = this.setActiveField().getActiveField();
			field.getTargetField().reset();
			this.blockLogGenerator = null;
			this.popPending();
			this.content.toggle(true);

			// Set target and check if any additional processes should be handled to open the dialog
			const targetHandler = field.initTarget(data.target);
			if (targetHandler.type === 'message') {
				// There's a blocker to open the dialog
				mw.notify(
					$('<span>').append(targetHandler.message()),
					{ type: 'error' }
				);
				return false;
			} else if (targetHandler.type === 'log') {
				// Block log lines should be generated asynchronously
				this.blockLogGenerator = targetHandler.log;
			}
			return true;
		}

		/**
		 * Sets the visibility of dialog fields based on the given data and flags a field as active.
		 *
		 * **This method is for use only by {@link prepareDialog}**.
		 *
		 * @returns {this}
		 * @private
		 */
		setActiveField() {
			const data = this.getCurrentData();
			const targetType = data.target.getType();
			const isBlock = data.type === 'block';

			this.blockNamed.toggle(isBlock && targetType === 'named');
			this.blockTemp.toggle(isBlock && targetType === 'temp');
			this.blockIp.toggle(isBlock && targetType === 'ip');
			this.unblockUser.toggle(!isBlock);

			return this;
		}

		/**
		 * @returns {BlockUser | UnblockUser}
		 */
		getActiveField() {
			const data = this.getCurrentData();
			if (data.type === 'block') {
				switch (data.target.getType()) {
					case 'named': return this.blockNamed;
					case 'temp': return this.blockTemp;
					case 'ip': return this.blockIp;
					default: throw new Error('Logic exception');
				}
			} else {
				return this.unblockUser;
			}
		}

		/**
		 * @inheritdoc
		 * @override
		 * @param {BlockLink} _data
		 */
		getReadyProcess(_data) {
			const process = super.getReadyProcess(_data);
			const generator = this.blockLogGenerator;
			if (!generator) {
				this.updateSize();
				return process;
			}

			// @ts-expect-error Promise<void, any, any> -> Promise<void>
			return process.next(async () => {
				let options;
				try {
					options = await toNativePromise(generator());
				} catch (err) {
					const [code, info] = toErrorTuple(err);
					mw.notify(Messages.get('ajaxblock-notify-error-loadblocklogs', [code]), { type: 'error' });
					this.content.toggle(true);
					this.popPending();
					throw info;
				} finally {
					this.blockLogGenerator = null;
				}
				if (!options) {
					return;
				}
				this.addBlockLogs(options);
			}).next(() => {
				this.content.toggle(true);
				this.updateSize().popPending();
			});
		}

		/**
		 * @param {JQuery<HTMLElement> | OO.ui.RadioOptionWidget[]} options
		 * @returns {void}
		 * @private
		 */
		addBlockLogs(options) {
			const data = this.getCurrentData();
			const field = this.getActiveField();

			let /** @type {keyof LoadedMessages} */ msgKey;
			let /** @type {OO.ui.MessageWidget.ConfigOptions['type']} */ msgType;
			let /** @type {JQuery<HTMLElement>} */ $logLines;
			if (Array.isArray(options)) {
				msgKey = data.type === 'unblock'
					? 'ajaxblock-dialog-message-existingblocks-unblock'
					: (wgEnableMultiBlocks
					? 'ajaxblock-dialog-message-existingblocks-canadd'
					: 'ajaxblock-dialog-message-existingblocks'
					);
				msgType = 'warning';
				const blockSelector = field.getTargetField().setBlockSelector({
					classes: ['ajaxblock-dialog-blockselector'],
					items: options,
				});
				$logLines = blockSelector.$element;
			} else {
				msgKey = data.target.getType() === 'ip'
					? 'blocked-notice-logextract-anon'
					: 'blocked-notice-logextract';
				msgType = 'notice';
				$logLines = options;
			}

			const $label = $('<span>').append(
				$('<span>')
					.addClass('ajaxblock-dialog-logline-header')
					.append(
						Messages.get(msgKey, [/** @type {string} */ (data.target.getUsername())])
					),
				document.createElement('br'),
				$logLines
			);
			if (field.getTargetField().getBlockSelector()) {
				field.getTargetField().addMessage({
					label: new OO.ui.HtmlSnippet(Messages.get('ajaxblock-dialog-message-existingblocks-dialogonly')),
					type: 'warning',
				});
			}
			field.getTargetField().addMessage({
				label: $label,
				type: msgType,
			});
		}

		/**
		 * @inheritdoc
		 * @override
		 * @param {string} [action]
		 */
		getActionProcess(action) {
			return new OO.ui.Process(() => {
				switch (action) {
					case 'block':
					case 'unblock': {
						if (this.isLocked()) {
							// Disallow execution if the dialog is considered locked
							return;
						}
						this.setLocked(true);

						const data = this.getCurrentData();
						const field = this.getActiveField();
						this.ajaxBlock.runExecution(data, field, {
							suppressWarnings: false,
							warningContext: 'dialog',
							onAbort: () => { this.setLocked(false); },
							onBeforeExecute: () => { this.close(data); },
						});
						break;
					}
					case 'documentation':
						window.open('https://meta.wikimedia.org/wiki/Special:MyLanguage/User:Dragoniez/AjaxBlock', '_blank');
						break;
					case 'config':
						window.open(mw.util.getUrl('Special:AjaxBlockConfig'), '_blank');
						break;
					default:
						if (this.canClose()) {
							this.close(this.getCurrentData());
						}
				}
			});
		}

		/**
		 * @param {boolean} locked
		 * @returns
		 */
		setLocked(locked) {
			this.locked = locked;
			return this;
		}

		/**
		 * Checks whether there is any blocker to perform the (un)block action.
		 *
		 * @returns {boolean}
		 */
		isLocked() {
			// Consider the dialog to be locked if:
			// - `locked` is explicitly set to true, or
			// - the dialog is still getting ready, or
			// - the overlay is shown
			return this.locked || this.hasPendingBlockLog() || this.overlay.isShown();
		}

		/**
		 * @returns {boolean}
		 * @private
		 */
		hasPendingBlockLog() {
			return !!this.blockLogGenerator;
		}

		canClose() {
			const field = this.getActiveField();

			if (field instanceof BlockUser) {
				// Disallow settings that would result in an ipb-empty-block error
				if (
					field.cbPartialBlock.isSelected() &&
					field.getPageRestrictions().length === 0 &&
					field.getNamespaceRestrictions().length === 0 &&
					field.getActionRestrictions().length === 0 &&
					!field.cbCreateAccount.isSelected() &&
					!field.cbSendEmail.isSelected() &&
					!field.cbUserTalk.isSelected()
				) {
					mw.notify(Messages.get('ajaxblock-notify-error-emptyblock'), { type: 'error' });
					return false;
				}
			}

			return true;
		}

		/**
		 * @inheritdoc
		 * @override
		 * @param {BlockLink} [data]
		 */
		getHoldProcess(data) {
			return super.getHoldProcess(data).next(() => {
				if (!data) {
					return;
				}

				const field = this.getActiveField();
				if (field instanceof BlockUser) {
					// Clear the inputs for partial block restrictions, because a remaining value
					// indicates that validation failed (getValue() doesn't pick up such values, though)
					field.partialBlockPages.clearFlags().clearInput();
					field.partialBlockNamespaces.clearFlags().clearInput();
				}
			});
		}

		/**
		 * @inheritdoc
		 * @override
		 * @param {BlockLink} [data]
		 */
		getTeardownProcess(data) {
			return super.getTeardownProcess(data).next(() => {
				if (!data) {
					return;
				}
				this.resetDialog();
			});
		}

		resetDialog() {
			// IMPORTANT: currentData must not be reset before calling getActiveField()
			this.getActiveField().getTargetField().reset();
			this.currentData = null;
			this.setLocked(false);
			this.blockLogGenerator = null;
			this.popPending();
			this.content.toggle(true);
		}

	}

	AjaxBlockDialog.static.name = SCRIPT_NAME;
	AjaxBlockDialog.static.title = $('<label>').append(
		`${SCRIPT_NAME} (`,
		$('<a>')
			.prop({
				target: '_blank',
				href: 'https://meta.wikimedia.org/w/index.php?title=User:Dragoniez/AjaxBlock.js&action=history'
			})
			.text(`v${VERSION}`),
		')'
	);
	AjaxBlockDialog.static.actions = [
		{
			action: 'block',
			label: Messages.get('ajaxblock-dialog-button-label-block'),
			flags: ['primary', 'progressive'],
			modes: ['block']
		},
		{
			action: 'unblock',
			label: Messages.get('ajaxblock-dialog-button-label-unblock'),
			flags: ['primary', 'progressive'],
			modes: ['unblock']
		},
		{
			action: 'documentation',
			label: Messages.get('ajaxblock-dialog-button-label-docs'),
			modes: ['block', 'unblock']
		},
		{
			action: 'config',
			label: Messages.get('ajaxblock-dialog-button-label-config'),
			modes: ['block', 'unblock']
		},
		{
			action: 'close',
			flags: ['safe', 'close'],
			modes: ['block', 'unblock']
		}
	];
	AjaxBlockDialog.windowManager = (() => {
		const windowManager = new OO.ui.WindowManager();
		$(document.body).append(windowManager.$element);
		return windowManager;
	})();

	return AjaxBlockDialog;
}

class AjaxBlockDialogBodyOverlay {

	constructor() {
		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 */
		this.$element = $('<div>').addClass('ajaxblock-dialog-overlay').hide();
		/**
		 * @type {boolean}
		 * @private
		 */
		this.shown = false;
	}

	/**
	 * @param {boolean} show
	 * @returns {this}
	 */
	toggle(show) {
		this.shown = show;
		this.$element.toggle(show);
		return this;
	}

	isShown() {
		return this.shown;
	}

}

// Note: The following typedef shouldn't be moved to d.ts to keep it possible to
// reference the doc comment from type signatures in this .js file
/**
 * @typedef {() => void} OnResize
 * Callback invoked when the field container resizes.
 */
/**
 * @requires oojs-ui
 */
class WatchUserField {

	/**
	 * @param {Initializer} initializer
	 * @param {OnResize} onResize
	 */
	constructor(initializer, onResize) {
		/**
		 * @type {Initializer}
		 * @readonly
		 */
		this.initializer = initializer;
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 * @private
		 */
		this.cbWatchUser = new OO.ui.CheckboxInputWidget();
		/**
		 * @type {OO.ui.FieldLayout}
		 * @readonly
		 * @private
		 */
		this.watchUserLayout = new OO.ui.FieldLayout(this.cbWatchUser, {
			label: Messages.get('ipbwatchuser'),
			align: 'inline',
		});
		/**
		 * @type {OO.ui.DropdownWidget}
		 * @readonly
		 * @private
		 */
		this.watchlistExpiry = new OO.ui.DropdownWidget({
			menu: {
				items: DropdownUtil.getDurationMenuOptions('watchlist-expiry-options'),
			}
		});
		/**
		 * @type {OO.ui.FieldLayout}
		 * @readonly
		 * @private
		 */
		this.watchlistExpiryLayout = new OO.ui.FieldLayout(this.watchlistExpiry, {
			$element: $('<div>').css({ 'margin-left': '1.8em', 'margin-top': '8px' }),
		});
		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 */
		this.$element = $('<div>').addClass('ajaxblock-field-content');
		/**
		 * @type {OO.ui.FieldsetLayout}
		 * @readonly
		 * @protected
		 */
		this.optionsFieldset = new OO.ui.FieldsetLayout({
			label: Messages.get('block-options'),
			items: [this.watchUserLayout, this.watchlistExpiryLayout],
		});

		// Initialize fields
		this.$element.append(this.optionsFieldset.$element);
		DropdownUtil.selectInfinity(this.watchlistExpiry);
		this.watchlistExpiryLayout.toggle(false); // Hide the expiry field (since the checkbox isn't checked)

		// When the "watch user" checkbox is checked/unchecked, show/hide the expiry field
		this.cbWatchUser.on('change', (selected) => {
			const checked = !!selected;
			this.watchlistExpiryLayout.toggle(checked);
			onResize();
		});
	}

	/**
	 * @param {boolean} show
	 * @return {this}
	 */
	toggle(show) {
		this.$element.toggle(show);
		return this;
	}

	getWatchUser() {
		return this.cbWatchUser.isSelected();
	}

	/**
	 * @param {?boolean} watch If `null`, preserves the current checked state.
	 * @returns {this}
	 */
	setWatchUser(watch) {
		watch = watch === null ? this.getWatchUser() : watch;
		this.cbWatchUser.setSelected(watch);
		return this;
	}

	getWatchlistExpiry() {
		return DropdownUtil.getSelectedOptionValueThrow(this.watchlistExpiry);
	}

	/**
	 * @param {?string} expiry If `null`, preserves the current value.
	 * @returns {this}
	 */
	setWatchlistExpiry(expiry) {
		if (expiry === null) {
			return this;
		}
		const menu = this.watchlistExpiry.getMenu();
		const item = /** @type {?OO.ui.MenuOptionWidget} */ (menu.findItemFromData(expiry));
		if (item) {
			menu.selectItem(item);
		} else {
			DropdownUtil.selectInfinity(this.watchlistExpiry);
		}
		return this;
	}

	getWatchUserParams() {
		/** @type {WatchUserParams} */
		const params = Object.create(null);
		if (!this.getWatchUser()) {
			return params;
		}
		params.watchuser = true;
		params.watchlistexpiry = this.getWatchlistExpiry();
		return params;
	}

}

/**
 * @requires oojs-ui
 * @requires mediawiki.widgets.TitlesMultiselectWidget
 * @requires mediawiki.widgets.NamespacesMultiselectWidget
 */
class BlockField extends WatchUserField {

	/**
	 * @param {Initializer} initializer
	 * @param {object} [options]
	 * @param {OnResize} [options.onResize]
	 * @param {boolean} [options.omitMainLabel]
	 */
	constructor(initializer, options = {}) {
		const { onResize = () => {}, omitMainLabel = false } = options;
		super(initializer, onResize);

		/** @type {OO.ui.Element[]} */
		let items = [];

		/**
		 * @type {OO.ui.DropdownWidget}
		 * @readonly
		 * @private
		 */
		this.expiry = new OO.ui.DropdownWidget({
			menu: {
				items: DropdownUtil.getDurationMenuOptions('ipboptions'),
			}
		});
		DropdownUtil.selectInfinity(this.expiry);
		items.push(
			new OO.ui.FieldLayout(this.expiry, {
				classes: ['ajaxblock-horizontalfield'],
				label: Messages.get('block-expiry'),
				align: 'left',
			})
		);

		/**
		 * @type {OO.ui.TextInputWidget}
		 * @readonly
		 * @private
		 */
		this.expiryOther = new OO.ui.TextInputWidget({
			placeholder: Messages.get('ipbother').replace(/[:：]$/, ''),
		});
		items.push(
			new OO.ui.FieldLayout(this.expiryOther, {
				classes: ['ajaxblock-horizontalfield'],
				label: $('<span>'), // Blank label
				align: 'left',
			})
		);

		/**
		 * @type {OO.ui.DropdownWidget}
		 * @readonly
		 * @private
		 */
		this.reason1 = new OO.ui.DropdownWidget({
			menu: {
				items: Messages.parseBlockReasonDropdown()
			}
		});
		DropdownUtil.selectOther(this.reason1);
		items.push(
			new OO.ui.FieldLayout(this.reason1, {
				classes: ['ajaxblock-horizontalfield'],
				label: Messages.get('ajaxblock-dialog-block-label-reason1'),
				align: 'left',
			})
		);

		/**
		 * @type {OO.ui.DropdownWidget}
		 * @readonly
		 * @private
		 */
		this.reason2 = new OO.ui.DropdownWidget({
			menu: {
				items: Messages.parseBlockReasonDropdown()
			}
		});
		DropdownUtil.selectOther(this.reason2);
		items.push(
			new OO.ui.FieldLayout(this.reason2, {
				classes: ['ajaxblock-horizontalfield'],
				label: Messages.get('ajaxblock-dialog-block-label-reason2'),
				align: 'left',
			})
		);

		/**
		 * @type {OO.ui.TextInputWidget}
		 * @readonly
		 * @private
		 */
		this.reasonOther = new OO.ui.TextInputWidget({
			placeholder: Messages.get('block-reason-other'),
		});
		items.push(
			new OO.ui.FieldLayout(this.reasonOther, {
				classes: ['ajaxblock-horizontalfield'],
				label: $('<span>'),
				align: 'left',
			})
		);

		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 */
		this.cbPartialBlock = new OO.ui.CheckboxInputWidget();
		items.push(
			new OO.ui.FieldLayout(this.cbPartialBlock, {
				label: Messages.get('ajaxblock-dialog-block-label-partial'),
				align: 'inline',
			})
		);

		/**
		 * @type {OO.ui.FieldsetLayout}
		 * @readonly
		 * @private
		 */
		this.partialBlockLayout = new OO.ui.FieldsetLayout();
		this.partialBlockLayout.$element.css({ 'margin-left': '1.8em' });
		this.partialBlockLayout.toggle(this.cbPartialBlock.isSelected());

		/** @type {OO.ui.Element[]} */
		const partialBlockLayoutItems = [];

		/**
		 * @type {mw.widgets.TitlesMultiselectWidget}
		 * @readonly
		 */
		this.partialBlockPages = new mw.widgets.TitlesMultiselectWidget({
			api: AjaxBlock.api,
			placeholder: Messages.get('block-pages-placeholder'),
			showMissing: false,
			tagLimit: wgEnableMultiBlocks ? 50 : 10,
		});
		partialBlockLayoutItems.push(
			new OO.ui.FieldLayout(this.partialBlockPages, {
				label: Messages.get('ipb-pages-label'),
				align: 'top',
			})
		);

		/**
		 * @type {mw.widgets.NamespacesMultiselectWidget}
		 * @readonly
		 */
		this.partialBlockNamespaces = new mw.widgets.NamespacesMultiselectWidget({
			placeholder: Messages.get('block-namespaces-placeholder'),
		});
		partialBlockLayoutItems.push(
			new OO.ui.FieldLayout(this.partialBlockNamespaces, {
				label: Messages.get('ipb-namespaces-label'),
				align: 'top',
			})
		);

		/**
		 * @type {Record<string, OO.ui.CheckboxInputWidget>}
		 * @readonly
		 */
		this.partialBlockActions = this.initializer.actionRestrictions.reduce((acc, action) => {
			const checkbox = new OO.ui.CheckboxInputWidget({ data: action });
			partialBlockLayoutItems.push(
				new OO.ui.FieldLayout(checkbox, {
					// Messages used here:
					// - ipb-action-create
					// - ipb-action-move
					// - ipb-action-thanks
					// - ipb-action-upload
					// @ts-expect-error
					label: Messages.get(`ipb-action-${action}`),
					align: 'inline',
				})
			);
			acc[action] = checkbox;
			return acc;
		}, /** @type {Record<string, OO.ui.CheckboxInputWidget>} */ (Object.create(null)));

		this.partialBlockLayout.addItems(partialBlockLayoutItems);
		items.push(this.partialBlockLayout);

		/**
		 * @type {OO.ui.FieldsetLayout}
		 * @protected
		 */
		this.mainFieldset = new OO.ui.FieldsetLayout({
			label: omitMainLabel? undefined : Messages.get('block'),
		});
		this.mainFieldset.addItems(items);

		items = [];
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 */
		this.cbCreateAccount = new OO.ui.CheckboxInputWidget();
		items.push(
			new OO.ui.FieldLayout(this.cbCreateAccount, {
				label: Messages.get('ipbcreateaccount'),
				align: 'inline',
			})
		);
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 */
		this.cbSendEmail = new OO.ui.CheckboxInputWidget();
		items.push(
			new OO.ui.FieldLayout(this.cbSendEmail, {
				label: Messages.get('ipbemailban'),
				align: 'inline',
			})
		);
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 */
		this.cbUserTalk = new OO.ui.CheckboxInputWidget();
		items.push(
			new OO.ui.FieldLayout(this.cbUserTalk, {
				label: Messages.get('ipb-disableusertalk'),
				align: 'inline',
			})
		);

		const detailsFieldset = new OO.ui.FieldsetLayout({
			label: Messages.get('block-details'),
		});
		detailsFieldset.addItems(items);

		items = [];
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 */
		this.cbAutoblock = new OO.ui.CheckboxInputWidget();
		/**
		 * @type {OO.ui.FieldLayout}
		 * @readonly
		 * @protected
		 */
		this.cbAutoblockContainer = new OO.ui.FieldLayout(this.cbAutoblock, {
			label: Messages.get('ajaxblock-dialog-block-label-option-autoblock'),
			align: 'inline',
		});
		items.push(this.cbAutoblockContainer);

		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 */
		this.cbHardblock = new OO.ui.CheckboxInputWidget();
		/**
		 * @type {OO.ui.FieldLayout}
		 * @readonly
		 * @protected
		 */
		this.cbHardblockContainer = new OO.ui.FieldLayout(this.cbHardblock, {
			label: Messages.get('ipb-hardblock'),
			align: 'inline',
		});
		items.push(this.cbHardblockContainer);

		/**
		 * @type {boolean}
		 * @private
		 */
		this.hideUserLocked = false;
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 */
		this.cbHideUser = new OO.ui.CheckboxInputWidget();
		/**
		 * @type {OO.ui.FieldLayout}
		 * @readonly
		 * @protected
		 */
		this.cbHideUserContainer = new OO.ui.FieldLayout(this.cbHideUser, {
			label: $('<b>').text(Messages.get('ipbhidename')),
			align: 'inline',
		});
		items.push(this.cbHideUserContainer);

		this.$element.prepend(
			this.mainFieldset.$element,
			detailsFieldset.$element
		);
		this.optionsFieldset.addItems(items, 0);

		this.setUpEventListeners(onResize);
		this.insertCustomReasons();
	}

	/**
	 * @param {string[]} [customReasons]
	 * @returns {this}
	 */
	insertCustomReasons(customReasons) {
		customReasons = customReasons || this.initializer.configStore.getCustomReasons('block');
		const groupLabel = Messages.plain('ajaxblock-dialog-block-label-customreasons');
		const currentReason = this.getReason();

		for (const dropdown of [this.reason1, this.reason2]) {
			const menu = dropdown.getMenu();
			const grouped = DropdownUtil.findGroupedOptions(menu, groupLabel);

			// Always remove existing group if present
			if (grouped) {
				menu.removeItems(grouped);
			}

			// Only re-add if we actually have reasons
			if (customReasons.length) {
				menu.addItems([
					new OO.ui.MenuSectionOptionWidget({ label: groupLabel }),
					...customReasons.map(r => new OO.ui.MenuOptionWidget({ label: r })),
				], 1);
			}
		}

		return this.setReason(currentReason);
	}

	/**
	 * @param {OnResize} onResize
	 * @returns {void}
	 * @private
	 */
	setUpEventListeners(onResize) {
		this.cbPartialBlock.on('change', (selected) => {
			this.partialBlockLayout.toggle(!!selected);
			onResize();

			// ipb-prevent-user-talk-edit:
			// `!allowusertalk` can be applied only if sitewide, or partial affecting NS_USER_TALK
			if (selected && !this.getNamespaceRestrictions().includes(wgNamespaceIds.user_talk.toString())) {
				this.cbUserTalk.setSelected(false).setDisabled(true);
			} else {
				this.cbUserTalk.setDisabled(false);
			}

			// ipb_hide_partial: A "hide user" block must be sitewide
			this.setHideUserAvailability(!selected);
		});

		this.partialBlockNamespaces.on('change', (items) => {
			// ipb-prevent-user-talk-edit
			if (this.cbPartialBlock.isSelected() && !items.map(item => item.getData()).includes(wgNamespaceIds.user_talk.toString())) {
				this.cbUserTalk.setSelected(false).setDisabled(true);
			} else {
				this.cbUserTalk.setDisabled(false);
			}
		});

		this.cbHideUser.on('change', (selected) => {
			// ipb_hide_partial
			// ipb_expiry_temp: A "hide user" block must have an indefinite expiry
			if (selected) {
				this.cbPartialBlock.setSelected(false).setDisabled(true);

				this.setExpiry(EXPIRY_INFINITE);
				this.expiry.setDisabled(true);
				this.expiryOther.setDisabled(true);
			} else {
				this.cbPartialBlock.setDisabled(false);

				this.expiry.setDisabled(false);
				this.expiryOther.setDisabled(false);
			}
		});

		this.expiry.on('labelChange', () => {
			const selected = DropdownUtil.getSelectedOptionValue(this.expiry);
			if (selected) {
				this.expiryOther.setValue('');
			}

			// ipb_expiry_temp
			this.setHideUserAvailability(this.getExpiry() === EXPIRY_INFINITE);
		});

		this.expiryOther.on('change', (value) => {
			if (clean(value)) {
				DropdownUtil.selectOther(this.expiry);
			}

			// ipb_expiry_temp
			this.setHideUserAvailability(this.getExpiry() === EXPIRY_INFINITE);
		});
	}

	/**
	 * @param {boolean} available
	 * @returns {this}
	 * @protected
	 */
	setHideUserAvailability(available) {
		if (available && !this.hideUserLocked) {
			this.cbHideUser.setDisabled(false);
		} else {
			this.cbHideUser.setSelected(false).setDisabled(true);
		}
		return this;
	}

	/**
	 * @param {boolean} locked
	 * @returns {this}
	 * @protected
	 */
	setHideUserLocked(locked) {
		this.hideUserLocked = locked;
		return this;
	}

	getExpiry() {
		const selected = DropdownUtil.getSelectedOptionValue(this.expiry);
		if (selected) {
			return selected;
		} else {
			let input = clean(this.expiryOther.getValue());
			if (mw.util.isInfinity(input)) {
				input = EXPIRY_INFINITE;
			}
			return input;
		}
	}

	/**
	 * @param {string} expiry
	 * @return {this}
	 */
	setExpiry(expiry) {
		expiry = clean(expiry);
		if (mw.util.isInfinity(expiry)) {
			expiry = EXPIRY_INFINITE;
		}

		const menu = this.expiry.getMenu();
		let selected = false;
		for (const item of /** @type {OO.ui.MenuOptionWidget[]} */ (menu.getItems())) {
			if (item.getData() === expiry) {
				menu.selectItem(item);
				selected = true;
				break;
			}
		}
		if (selected) {
			this.expiryOther.setValue('');
		} else {
			DropdownUtil.selectOther(this.expiry);
			this.expiryOther.setValue(expiry);
		}

		return this;
	}

	getReason() {
		const sep = Messages.plain('colon-separator');
		const main = [
			DropdownUtil.getSelectedOptionValue(this.reason1),
			DropdownUtil.getSelectedOptionValue(this.reason2),
		].filter(Boolean).join(sep);
		let other = clean(this.reasonOther.getValue());
		/**
		 * Good patterns:
		 * - `<!---->`
		 * - `<!--a-->`
		 * - `<!--a--><!--a-->`
		 * - `<!--a--> <!--a-->`
		 *
		 * Bad patterns:
		 * - `<!-->`
		 * - `<!--a-->aa`
		 * - `aa<!--a-->`
		 * - `<!--a-->aa<!--a-->`
		 * - `<!--a-->aa-->`
		 */
		const isOtherCommentOnly = /^(?:<!--(?:(?!-->).)*-->\s*)+$/.test(other);
		if (main && other && !isOtherCommentOnly) {
			// Add the separator if the "other" reason is not a comment tag only
			other = sep + other;
		}
		return main + other;
	}

	/**
	 * @param {string} reason
	 * @return {this}
	 */
	setReason(reason) {
		const rSep = new RegExp('^' + mw.util.escapeRegExp(Messages.plain('colon-separator')));
		let item = DropdownUtil.findItemByCallback(this.reason1, (option) => {
			const data = /** @type {string} */ (option.getData());
			return data !== '' && reason.startsWith(data);
		});
		if (!item) {
			[this.reason1, this.reason2].forEach((dropdown) => {
				DropdownUtil.selectOther(dropdown);
			});
			this.reasonOther.setValue(reason);
			return this;
		} else {
			this.reason1.getMenu().selectItem(item);
			reason = reason
				.replace(/** @type {string} */ (item.getData()), '')
				.replace(rSep, '');
		}

		item = DropdownUtil.findItemByCallback(this.reason2, (option) => {
			const data = /** @type {string} */ (option.getData());
			return data !== '' && reason.startsWith(data);
		});
		if (!item) {
			DropdownUtil.selectOther(this.reason2);
		} else {
			this.reason2.getMenu().selectItem(item);
			reason = reason
				.replace(/** @type {string} */ (item.getData()), '')
				.replace(rSep, '');
		}

		this.reasonOther.setValue(reason);
		return this;
	}

	getPartialBlockParams() {
		if (!this.cbPartialBlock.isSelected()) {
			return { partial: false };
		}

		/** @type {PartialBlockParams} */
		const options = Object.create(null);
		options.partial = true;

		const pages = this.getPageRestrictions();
		if (pages.length) {
			options.pagerestrictions = /** @type {string[]} */ (pages);
		}

		const namespaces = this.getNamespaceRestrictions();
		if (namespaces.length) {
			options.namespacerestrictions = /** @type {string[]} */ (namespaces);
		}

		const actions = this.getActionRestrictions();
		if (actions.length) {
			options.actionrestrictions = actions;
		}

		return options;
	}

	getPageRestrictions() {
		return /** @type {string[]} */ (this.partialBlockPages.getValue());
	}

	getNamespaceRestrictions() {
		return /** @type {string[]} */ (this.partialBlockNamespaces.getValue());
	}

	getActionRestrictions() {
		return Object.entries(this.partialBlockActions).reduce((acc, [action, checkbox]) => {
			if (checkbox.isSelected()) {
				acc.push(action);
			}
			return acc;
		}, /** @type {string[]} */ ([]));
	}

}

class UnblockField extends WatchUserField {

	/**
	 * @param {Initializer} initializer
	 * @param {OnResize} [onResize]
	 */
	constructor(initializer, onResize = () => {}) {
		super(initializer, onResize);

		/** @type {OO.ui.Element[]} */
		const items = [];

		/**
		 * @type {OO.ui.ComboBoxInputWidget}
		 * @readonly
		 * @private
		 */
		this.reason = new OO.ui.ComboBoxInputWidget({
			placeholder: Messages.get('block-removal-reason-placeholder'),
			options: this.initializer.configStore.getCustomReasons('unblock').map(r => ({ data: r })),
		});
		items.push(
			new OO.ui.FieldLayout(this.reason, {
				classes: ['ajaxblock-horizontalfield'],
				label: Messages.get('block-reason'),
				align: 'left',
			})
		);

		/**
		 * @type {OO.ui.FieldsetLayout}
		 * @protected
		 */
		this.mainFieldset = new OO.ui.FieldsetLayout({
			label: Messages.get('unblock'),
		});
		this.mainFieldset.addItems(items);

		this.$element.prepend(
			this.mainFieldset.$element
		);
	}

	getReason() {
		return clean(this.reason.getValue());
	}

	/**
	 * @param {string} reason
	 * @returns {this}
	 */
	setReason(reason) {
		this.reason.setValue(reason);
		return this;
	}

}

/**
 * @requires oojs-ui
 * @requires mediawiki.widgets.TitlesMultiselectWidget
 * @requires mediawiki.widgets.NamespacesMultiselectWidget
 */
class BlockUser extends BlockField {

	/**
	 * @param {InstanceType<ReturnType<typeof AjaxBlockDialogFactory>>} dialog
	 * @param {NonNullable<BlockTargetType>} presetType
	 */
	constructor(dialog, presetType) {
		const onResize = () => dialog.updateSize();
		super(dialog.getInitializer(), { onResize });

		/**
		 * @type {InstanceType<ReturnType<typeof AjaxBlockDialogFactory>>}
		 * @readonly
		 * @private
		 */
		this.dialog = dialog;
		/**
		 * @type {NonNullable<BlockTargetType>}
		 * @readonly
		 * @private
		 */
		this.presetType = presetType;
		/**
		 * @type {TargetField}
		 * @readonly
		 * @private
		 */
		this.targetField = new TargetField(this, this.mainFieldset);
		/**
		 * @type {OO.ui.DropdownWidget}
		 * @readonly
		 * @private
		 */
		this.presetSelector = new OO.ui.DropdownWidget({
			label: Messages.get('ajaxblock-dialog-block-placeholder-preset'),
			menu: {
				items: BlockPreset.createMenuOptions(this.initializer.configStore),
			},
		});
		/**
		 * @type {OO.ui.FieldLayout}
		 * @readonly
		 * @private
		 */
		this.presetSelectorContainer = new OO.ui.FieldLayout(this.presetSelector, {
			classes: ['ajaxblock-horizontalfield'],
			label: Messages.get('ajaxblock-config-label-presetreasons-name'),
			align: 'left',
		});
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 */
		this.cbAddBlock = new OO.ui.CheckboxInputWidget();
		/**
		 * @type {OO.ui.FieldLayout}
		 * @readonly
		 * @protected
		 */
		this.cbAddBlockContainer = new OO.ui.FieldLayout(this.cbAddBlock, {
			label: $('<b>').text(Messages.get('block-create')),
			align: 'inline',
		});

		this.initialize();
	}

	/**
	 * @private
	 */
	initialize() {
		this.optionsFieldset.addItems([this.cbAddBlockContainer]);

		// When "add block" is checked and a block selector exists, deselect radio options
		// in it since `newblock` cannot be used together with `id` (= data of the options)
		this.cbAddBlock.on('change', (selected) => {
			const blockSelector = this.targetField.getBlockSelector();
			if (selected && blockSelector) {
				blockSelector.selectItem();
			}
		});

		// Insert the preset selector field
		const targetFieldIndex = this.mainFieldset.getItemIndex(this.targetField.container);
		if (targetFieldIndex === -1) {
			throw new Error('Target field not found');
		}
		this.mainFieldset.addItems([this.presetSelectorContainer], targetFieldIndex + 1);

		// Call ParamApplier when a preset is selected
		this.presetSelector.on('labelChange', () => {
			const menu = this.presetSelector.getMenu();
			const option = menu.findFirstSelectedItem();
			if (!option) {
				return;
			}
			menu.selectItem(); // Deselect
			this.presetSelector.setLabel(Messages.get('ajaxblock-dialog-block-placeholder-preset'));
			const preset = /** @type {BlockPreset} */ (option.getData());
			ParamApplier.applyBlockParams(preset.getParams(), this, {
				hooks: this.getParamApplierOptions(this.presetType),
			}).then(() => {
				mw.notify(Messages.get('ajaxblock-notify-block-placeholder-preset', [preset.getName()]));
			});
		});
	}

	getPresetType() {
		return this.presetType;
	}

	getTargetField() {
		return this.targetField;
	}

	/**
	 * @param {BlockTarget} target
	 * @returns {TargetHandler}
	 */
	initTarget(target) {
		const handler = this.targetField.init(target, this.dialog.getBlockLookup());
		this.optionsFieldset.toggle(!this.targetField.isAutoBlock());

		// Adjust the visibility of field items
		const targetType = target.getType();
		if (targetType === 'ip') {
			this.cbAutoblockContainer.toggle(false);
			this.cbAutoblock.setSelected(false);
			this.cbHardblockContainer.toggle(true);
			this.cbHideUserContainer.toggle(false);
			this.cbHideUser.setSelected(false);
		} else {
			this.cbAutoblockContainer.toggle(true);
			this.cbHardblockContainer.toggle(false);
			this.cbHardblock.setSelected(false);
			if (this.initializer.permissionManager.canHideUser()) {
				this.cbHideUserContainer.toggle(true);
			} else {
				this.cbHideUserContainer.toggle(false);
				this.cbHideUser.setSelected(false);
			}
		}
		this.cbAddBlockContainer.toggle(this.targetField.canAddBlock());
		this.cbAddBlock.setSelected(false);

		// Adjust the visibility of preset options
		let applicablePresetExists = false;
		const options = /** @type {OO.ui.MenuOptionWidget[]} */ (this.presetSelector.getMenu().getItems());
		for (const option of options) {
			const preset = /** @type {BlockPreset} */ (option.getData());
			const isApplicable = preset.supportsTarget(targetType);
			option.toggle(isApplicable);
			if (isApplicable) {
				applicablePresetExists = true;
			}
		}
		this.presetSelectorContainer.toggle(applicablePresetExists);

		return handler;
	}

	/**
	 * Builds parameters to the unblock API.
	 *
	 * @param {BlockLink} data
	 * @param {WarningContext} context
	 * @returns {?{ params: BlockParams; warnings: (keyof LoadedMessages)[]; }}
	 */
	buildParams(data, context) {
		const base = this.targetField.buildParams(data);
		if (!base) {
			return null;
		}
		const configStore = this.initializer.configStore;
		const params = /** @type {BlockParams} */ (base.params);
		const warnings = base.warnings;

		// Note:
		// - Incompatible fields are hidden and deselected by AjaxBlockDialog.setActiveField()
		//   called in .prepareDialog()
		// - Inverted booleans used as additional options need an extra condition so that
		//   mw.Api.preprocessParameters filter out `false` properties
		Object.assign(
			params,
			{
				nocreate: this.cbCreateAccount.isSelected(),
				noemail: this.cbSendEmail.isSelected(),
				allowusertalk: !this.cbUserTalk.isSelected(),
				newblock: this.cbAddBlock.isSelected(),
			},
			this.getPartialBlockParams(),
			this.getWatchUserParams(),
		);

		if (
			params.partial && !params.pagerestrictions && !params.namespacerestrictions && !params.actionrestrictions &&
			!params.nocreate && !params.noemail && params.allowusertalk
		) {
			mw.notify(Messages.get('ajaxblock-notify-error-emptyblock'), { type: 'error' });
			return null;
		}

		const userType = data.target.getType();
		if (userType === null) {
			throw new Error('BlockTarget.getType() expectedly returned null');
		}
		if (userType === 'ip') {
			params.anononly = !this.cbHardblock.isSelected();
		}
		if (userType !== 'ip') {
			params.autoblock = this.cbAutoblock.isSelected();
		}

		if (params.newblock && !params.user) {
			delete params.id;
			const username = this.targetField.getCurrentUsername();
			if (!username) {
				// There's a bug in TargetField.init()
				mw.notify(
					Messages.get('internalerror_info', ['The "user" parameter must be non-null.']),
					{ type: 'error' }
				);
				return null;
			}
			params.user = username;
		}

		const blockLookup = this.dialog.getBlockLookup();
		if (params.user && !params.newblock) {
			const blocks = blockLookup.getBlocksByUsername(params.user);
			if (blocks && blocks.length === 1) {
				params.reblock = true;
			}
		}

		const reason = this.getReason();
		if (!reason && configStore.isWarningEnabled('block-noreason', context)) {
			warnings.push('ajaxblock-confirm-block-noreason');
		}
		params.reason = reason;

		let expiry = this.getExpiry();
		if (!expiry && configStore.isWarningEnabled('block-noexpiry', context)) {
			warnings.push('ajaxblock-confirm-block-noexpiry');
			expiry = EXPIRY_INFINITE;
		}
		params.expiry = expiry;

		if (!params.anononly && configStore.isWarningEnabled('block-hardblock', context)) {
			warnings.push('ajaxblock-confirm-block-hardblock');
		}

		while (this.initializer.permissionManager.canHideUser() && userType === 'named') {
			params.hidename = this.cbHideUser.isSelected();
			if (!params.hidename) {
				break;
			}

			// Will this block newly hide the user?
			let needsWarning = false;
			if (params.id !== undefined) {
				const block = blockLookup.getBlockById(params.id);
				if (block) {
					needsWarning = !block.hidden;
				} else {
					// Logic exception (TargetField.init should have already handled this)
					console.error('Block ID found, but block not found', data);
				}
			} else {
				const blocks = blockLookup.getBlocksByUsername(params.user);
				if (blocks) {
					// Logic exception (TargetField.init should have already handled this)
					console.error('Ambiguous blocks found', data, blocks);
				} else {
					needsWarning = true; // Not blocked
				}
			}

			if (needsWarning && configStore.isWarningEnabled('block-hideuser', context)) {
				warnings.push('ajaxblock-confirm-block-hideuser');
			}
		}

		if (params.reblock && configStore.isWarningEnabled('block-reblock', context)) {
			warnings.push('ajaxblock-confirm-block-reblock');
		}

		if (params.newblock && configStore.isWarningEnabled('block-newblock', context)) {
			warnings.push('ajaxblock-confirm-block-newblock');
		}

		if (data.target.getUsername() === wgUserName && configStore.isWarningEnabled('block-self', context)) {
			warnings.push('ajaxblock-confirm-block-self');
		}

		if (ParamApplier.blockParamsDiffer(params, data.params) && configStore.isWarningEnabled('block-ignorepredefined', context)) {
			warnings.push('ajaxblock-confirm-block-ignorepredefined');
		}

		return { params, warnings };
	}

	/**
	 * @param {NonNullable<BlockTargetType>} [targetType]
	 * @returns {BlockParamApplierHookOptions}
	 */
	getParamApplierOptions(targetType) {
		return {
			onAfterApply: () => {
				// Deselect "add block" since the existing settings will be reused
				this.cbAddBlock.setSelected(false);
			},
			onBeforePromise: () => {
				// Show the pending animation and "lock" the dialog using the overlay
				this.dialog.pushPending();
				this.dialog.overlay.toggle(true);
			},
			onAfterPromise: () => {
				// Unlock the pending again when all promises resolve
				this.dialog.popPending();
				this.dialog.overlay.toggle(false);
			},
			targetType,
		};
	}

}

/**
 * @requires oojs-ui
 * @requires mediawiki.widgets.TitlesMultiselectWidget
 * @requires mediawiki.widgets.NamespacesMultiselectWidget
 */
class UnblockUser extends UnblockField {

	/**
	 * @param {InstanceType<ReturnType<typeof AjaxBlockDialogFactory>>} dialog
	 */
	constructor(dialog) {
		const onResize = () => dialog.updateSize();
		super(dialog.getInitializer(), onResize);

		/**
		 * @type {InstanceType<ReturnType<typeof AjaxBlockDialogFactory>>}
		 * @readonly
		 * @private
		 */
		this.dialog = dialog;
		/**
		 * @type {TargetField}
		 * @readonly
		 * @private
		 */
		this.targetField = new TargetField(this, this.mainFieldset);
	}

	getTargetField() {
		return this.targetField;
	}

	/**
	 * @param {BlockTarget} target
	 * @returns {TargetHandler}
	 */
	initTarget(target) {
		const handler = this.targetField.init(target, this.dialog.getBlockLookup());
		this.optionsFieldset.toggle(!this.targetField.isAutoBlock());
		return handler;
	}

	/**
	 * Builds parameters to the unblock API.
	 *
	 * @param {BlockLink} data
	 * @param {WarningContext} context
	 * @returns {?{ params: UnblockParams; warnings: (keyof LoadedMessages)[]; }}
	 */
	buildParams(data, context) {
		const base = this.targetField.buildParams(data);
		if (!base) {
			return null;
		}
		const configStore = this.initializer.configStore;
		const params = /** @type {UnblockParams} */ (base.params);
		const warnings = base.warnings;

		if (configStore.isWarningEnabled('unblock', context)) {
			warnings.push('ajaxblock-confirm-unblock');
		}

		const reason = this.getReason();
		if (!reason && configStore.isWarningEnabled('unblock-noreason', context)) {
			warnings.push('ajaxblock-confirm-unblock-noreason');
		}
		params.reason = reason;

		if (data.target.getUsername() === wgUserName && configStore.isWarningEnabled('unblock-self', context)) {
			warnings.push('ajaxblock-confirm-unblock-self');
		}

		if (!this.targetField.isAutoBlock()) {
			Object.assign(params, this.getWatchUserParams());
		}

		if (ParamApplier.unblockParamsDiffer(params, data.params) && configStore.isWarningEnabled('unblock-ignorepredefined', context)) {
			warnings.push('ajaxblock-confirm-unblock-ignorepredefined');
		}

		return { params, warnings };
	}

}

/**
 * @requires oojs-ui
 */
class TargetField {

	/**
	 * @param {BlockUser | UnblockUser} parent
	 * @param {OO.ui.FieldsetLayout} prependTo
	 */
	constructor(parent, prependTo) {
		/**
		 * @type {BlockUser | UnblockUser}
		 * @readonly
		 * @private
		 */
		this.parent = parent;
		/**
		 * @type {OO.ui.Element}
		 * @readonly
		 * @private
		 */
		this.messageContainer = new OO.ui.Element({
			$element: $('<div>')
		});
		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 * @private
		 */
		this.$mainLabel = $('<b>');
		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 * @private
		 */
		this.$auxLabel = $('<span>');
		/**
		 * @type {[?number, ?string]}
		 * @private
		 */
		this.current = [null, null];
		/**
		 * @type {boolean}
		 * @private
		 */
		this.oneClickAllowed = true;
		/**
		 * @type {boolean}
		 * @private
		 */
		this.addBlockAllowed = false;
		/**
		 * @type {?OO.ui.RadioSelectWidget}
		 * @private
		 */
		this.blockSelector = null;
		/**
		 * @type {boolean}
		 * @private
		 */
		this.autoBlock = false;
		/**
		 * @type {OO.ui.FieldLayout}
		 * @readonly
		 */
		this.container = new OO.ui.FieldLayout(
			new OO.ui.LabelWidget({
				label: $('<span>')
					.addClass('ajaxblock-targetlabel')
					.append(
						this.$mainLabel,
						Messages.plain('word-separator'),
						this.$auxLabel
					)
			}),
			{
				classes: ['ajaxblock-horizontalfield'],
				label: Messages.get('block-target'),
				align: 'left',
			}
		);
		prependTo.addItems([this.messageContainer, this.container], 0);
	}

	/**
	 * @param {OO.ui.MessageWidget.ConfigOptions} [config]
	 * @return {this}
	 */
	addMessage(config = {}) {
		// TODO: Should we shallow-copy the array before mutating it?
		config.classes = config.classes || [];
		config.classes.push('ajaxblock-message-container');

		const message = new OO.ui.MessageWidget(config);
		this.messageContainer.$element.append(message.$element);
		return this;
	}

	/**
	 * @private
	 */
	clearMessages() {
		this.messageContainer.$element.empty();
		return this;
	}

	/**
	 * Gets the block ID of the current target.
	 *
	 * @returns {?number}
	 */
	getCurrentId() {
		return this.current[0];
	}

	/**
	 * Gets the username of the current target.
	 *
	 * @returns {?string}
	 */
	getCurrentUsername() {
		return this.current[1];
	}

	/**
	 * Resets the current target.
	 *
	 * @returns {this}
	 */
	reset() {
		this.current = [null, null];
		this.oneClickAllowed = true;
		this.addBlockAllowed = false;
		this.clearMessages();
		this.blockSelector = null;
		this.autoBlock = false;
		return this;
	}

	/**
	 * @returns {?boolean} `false` means unprocessable, `null` means the dialog should be opened.
	 */
	isOneClickAllowed() {
		return this.oneClickAllowed;
	}

	canAddBlock() {
		return this.addBlockAllowed;
	}

	getBlockSelector() {
		return this.blockSelector;
	}

	/**
	 * @param {OO.ui.RadioSelectWidget.ConfigOptions} [config]
	 * @returns {OO.ui.RadioSelectWidget}
	 */
	setBlockSelector(config) {
		this.blockSelector = new OO.ui.RadioSelectWidget(config);
		return this.blockSelector;
	}

	isAutoBlock() {
		return this.autoBlock;
	}

	/**
	 * Initializes the current target.
	 *
	 * @param {BlockTarget} target
	 * @param {BlockLookup} blockLookup
	 * @returns {TargetHandler}
	 */
	init(target, blockLookup) {
		const id = target.getId();
		const username = target.getUsername();
		const blocks = username ? blockLookup.getBlocksByUsername(username) : null;
		const blockUser = this.parent instanceof BlockUser ? this.parent : undefined;
		const configStore = this.parent.initializer.configStore;

		if (id !== null) {
			const block = blockLookup.getBlockById(id);
			if (block) {
				// The block associated with this ID exists
				if (username && blocks && blocks.length > 1) {
					// Other blocks also exist
					this.initInternal(null, username, false, true);
					return { type: 'log', log: () => BlockLog.generate(username, blockLookup, configStore, { radio: true, blockUser }) };
				} else if (block.user) {
					// Unambiguous block
					this.initInternal(id, block.user, true, true);
					return { type: 'log', log: () => BlockLog.generate(/** @type {string} */ (block.user), blockLookup, configStore, { blockUser }) };
				} else {
					// Autoblock
					if (blockUser) {
						// Cannot reblock
						this.initInternal(null, null, false, false);
						return { type: 'message', message: () => Messages.get('apierror-modify-autoblock') };
					} else {
						this.initInternal(id, null, true, false);
					}
				}
			} else if (username !== null) {
				// ID no longer active: Ignore ID and use username
				this.addMessage({
					label: new OO.ui.HtmlSnippet(
						Messages.get('ajaxblock-dialog-message-nonactive-id', [BlockTarget.createBlockListLink(id).outerHTML])
					),
					type: 'notice',
				});
				if (Array.isArray(blocks)) {
					// If other active blocks exist, allow the user to choose which one to update
					this.initInternal(null, username, false, true);
					return { type: 'log', log: () => BlockLog.generate(username, blockLookup, configStore, { radio: true, blockUser }) };
				} else {
					// No other active blocks
					if (blockUser) {
						// Allow a username-based block
						this.initInternal(null, username, true, false);
					} else {
						// Cannot be unblocked
						this.initInternal(null, username, false, false);
						return { type: 'message', message: () => Messages.get('ajaxblock-notify-error-cannotunblock', [username]) };
					}
				}
			} else {
				// ID no longer active, no username: unprocessable
				this.initInternal(null, null, false, false);
				return { type: 'message', message: () => Messages.get('ajaxblock-notify-error-idinactivenousername', [id]) };
			}
			return { type: 'none' };
		}

		if (username !== null) {
			if (Array.isArray(blocks)) {
				if (blocks.length > 1) {
					// Multiple active blocks
					this.initInternal(null, username, false, true);
					return { type: 'log', log: () => BlockLog.generate(username, blockLookup, configStore, { radio: true, blockUser }) };
				} else {
					// Single active block
					this.initInternal(blocks[0].id, username, true, true);
					return { type: 'log', log: () => BlockLog.generate(username, blockLookup, configStore, { blockUser }) };
				}
			} else {
				// No active blocks
				if (blockUser) {
					this.initInternal(null, username, true, false);
				} else {
					this.initInternal(null, username, false, false);
					return { type: 'message', message: () => Messages.get('ajaxblock-notify-error-cannotunblock', [username]) };
				}
			}
			return { type: 'none' };
		}

		this.initInternal(null, null, false, false);
		throw new Error('Either the ID or username must be non-null');
	}

	/**
	 * @param {?number} id
	 * @param {?string} username
	 * @param {boolean} oneClick Whether the target can be processed in the one-click mode.
	 * @param {boolean} addBlock Whether to show the "Add block" checkbox.
	 *
	 * Note: This is coerced into false if {@link parent} isn't an instance of {@link BlockUser} or
	 * `wgEnableMultiBlocks` is false, even if true is passed.
	 * @returns {this}
	 * @private
	 */
	initInternal(id, username, oneClick, addBlock) {
		if (id && username) {
			this.$mainLabel.text(username);
			this.$auxLabel.empty().append(
				Messages.plain('parentheses-start'),
				'#',
				BlockTarget.createBlockListLink(id),
				Messages.plain('parentheses-end')
			);
		} else if (id) {
			// Autoblock
			if (this.parent instanceof BlockUser) {
				throw new Error('An autoblock can only be removed and cannot be updated');
			}
			this.autoBlock = true;
			this.$mainLabel.empty().append(
				Messages.get('autoblockid', [BlockTarget.createBlockListLink(id).outerHTML])
			);
			this.$auxLabel.empty();
		} else if (username) {
			this.$mainLabel.text(username);
			this.$auxLabel.empty();
		} else {
			this.$mainLabel.text('');
			this.$auxLabel.empty();
		}

		this.current = [id, username];
		this.oneClickAllowed = oneClick;
		this.addBlockAllowed = addBlock && this.parent instanceof BlockUser && wgEnableMultiBlocks;

		return this;
	}

	/**
	 * Builds base parameters to the API.
	 *
	 * @param {BlockLink} data
	 * @returns {?{ params: BaseParams; warnings: (keyof LoadedMessages)[]; }}
	 */
	buildParams(data) {
		let /** @type {?number} */ id = null;
		let /** @type {?string} */ user = null;
		const /** @type {BaseParams} */ params = Object.create(null);

		params.action = data.type;
		const isUnblock = data.type === 'unblock';

		if (this.blockSelector) {
			const item = this.blockSelector.findFirstSelectedItem();
			if (!item) {
				// When the block selector is present, the target of the (un)block must be selected
				const msgKey = isUnblock || !wgEnableMultiBlocks
					? 'ajaxblock-notify-error-ambiguousblock'
					: 'ajaxblock-notify-error-ambiguousblock-canadd';
				mw.notify(Messages.get(msgKey), { type: 'error' });
				return null;
			}
			id = /** @type {number} */ (item.getData());
		}

		// Use the dialog's current target instead of data.target here to reflect
		// what's been set by TargetField.init()
		id = id || this.getCurrentId();
		if (!id) {
			user = this.getCurrentUsername();
		}

		if (id) {
			params.id = id;
		} else if (user) {
			params.user = user;
		} else {
			// This code path should never be reached
			mw.notify(
				$('<span>').append(
					mw.message(
						'internalerror_info',
						Messages.get('ajaxblock-notify-error-notarget')
					).parseDom()
				),
				{ type: 'error' }
			);
			return null;
		}

		return { params, warnings: [] };
	}

}

/**
 * Class that generates block loglines for a given blocked user.
 */
class BlockLog {

	/**
	 * @param {string} username
	 * @param {BlockLookup} blockLookup
	 * @param {AjaxBlockConfigStore} configStore
	 * @param {object} [options]
	 * @param {boolean} [options.radio] Whether to use OO.ui.RadioSelectWidget in the logs:
	 * - `true`: Returns `OO.ui.RadioOptionWidget[]` with no option selected so that
	 *   the user can choose which block to update.
	 * - `false`: Returns `JQuery<HTMLDivElement>` with a block log, **only if**
	 *   there is only one active block.
	 * @param {BlockUser} [options.blockUser] Add a param applier to each log entry if provided.
	 * @returns {JQuery.Promise<OO.ui.RadioOptionWidget[] | JQuery<HTMLElement> | null>}
	 * `null` if the user does not have any active blocks.
	 */
	static generate(username, blockLookup, configStore, options = {}) {
		const { radio = false, blockUser } = options;

		const currentBlocks = blockLookup.getBlocksByUsername(username);
		let /** @type {number=} */ earliestTimestamp = undefined;
		if (currentBlocks) {
			for (const { timestamp } of currentBlocks) {
				const unixTsInSeconds = Date.parse(timestamp) / 1000;
				if (!earliestTimestamp || earliestTimestamp > unixTsInSeconds) {
					earliestTimestamp = unixTsInSeconds;
				}
			}
		}

		return $.when(
			blockLookup.refreshDataByUsername(username),
			this.getEntries(username, configStore)
		).then((blocks, logevents) => {
			if (blocks === null) {
				return null;
			}
			/** @type {Map<number, ApiResponseQueryListBlocks>} */
			const blockIdMap = new Map();
			for (const block of blocks) {
				blockIdMap.set(block.id, block);
			}

			const logMap = this.getLogMap(username, blockIdMap, logevents);
			/**
			 * @param {number} id
			 * @param {ApiResponseQueryListBlocks} block
			 * @returns {JQuery<HTMLElement>}
			 */
			const getLabel = (id, block) => {
				const logData = logMap.get(id);
				const $label = $('<span>').append(this.getLogLine(logData, id));
				if (blockUser) {
					const { wrapper } = ParamApplier.generateBlockInfoApplier(blockUser, block);
					$label.append(' ', wrapper);
				}
				return $label;
			};

			// TODO: Log entries should be cached
			if (radio || blockIdMap.size > 1) {
				const options = /** @type {OO.ui.RadioOptionWidget[]} */ ([]);
				for (const [id, block] of blockIdMap) {
					const $label = getLabel(id, block);
					$label.find('a').each((_, a) => {
						// Prevent radio option selection when clicking links inside labels
						if (a.classList.contains('ajaxblock-paramapplier')) {
							// The param applier button itself should still work as a radio selector
							// because we apply parameters for a specific block
							return;
						}
						a.addEventListener('mousedown', (e) => e.stopImmediatePropagation());
					});

					options.push(
						new OO.ui.RadioOptionWidget({
							data: id,
							label: $label,
						})
					);
				}
				return options;
			} else {
				const $wrapper = $('<div>');
				for (const [id, block] of blockIdMap) {
					$wrapper.append(
						$(`<div data-blockid="${id}">`)
							.addClass('ajaxblock-dialog-logline')
							.append(getLabel(id, block))
					);
				}
				return $wrapper;
			}
		});
	}

	/**
	 * @param {string} username
	 * @param {AjaxBlockConfigStore} configStore
	 * @param {number} [earliestTimestamp]
	 * @returns {JQuery.Promise<ApiResponseQueryListLogevents[]>}
	 * @private
	 */
	static getEntries(username, configStore, earliestTimestamp) {
		return AjaxBlock.api.get({
			list: 'logevents',
			leprop: 'user|type|timestamp|parsedcomment|details',
			letype: 'block',
			leend: earliestTimestamp,
			letitle: `User:${username}`,
			lelimit: 'max',
			uselang: configStore.getLanguage(),
		}).then(/** @param {ApiResponse} res */ (res, jqXHR) => {
			if (res && res.query && res.query.logevents) {
				return res.query.logevents;
			}
			return failAsEmptyResult(res, jqXHR);
		});
	}

	/**
	 * @param {string} username
	 * @param {Map<number, ApiResponseQueryListBlocks>} blockIdMap
	 * @param {readonly ApiResponseQueryListLogevents[]} logevents
	 * @returns {BlockLogMap}
	 * @private
	 */
	static getLogMap(username, blockIdMap, logevents) {
		/**
		 * @type {BlockLogMap}
		 */
		const ret = new Map();
		/**
		 * Given a block log entry, attempts to find its corresponding active block
		 * by matching the block timestamp.
		 *
		 * @param {ApiResponseQueryListLogevents} log A block log entry from the API.
		 * @returns {number=} The matching block ID, or `undefined` if no match was found.
		 */
		const findId = (log) => {
			for (const [id, { timestamp, by }] of blockIdMap) {
				if (
					// Exact match, or
					timestamp === log.timestamp ||
					// Allow a 1-second delay between the block and the log generation following it
					// as long as the blocking sysop is identical
					(Date.parse(timestamp) === (Date.parse(log.timestamp) - 1000) && by === log.user)
				) {
					return id;
				}
			}
			return undefined;
		};
		const rIsoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

		for (let i = 0; i < logevents.length; i++) {
			let log = logevents[i];
			let blockId = log.params.blockId;

			// Log entries generated before the rollout of multiblocks lack a `blockId` property
			// Plus, `list=blocks` returned information about the initial block even if it was
			// later updated by a reblock (see also [[phab:T313661]])
			if (typeof blockId !== 'number') {
				// If the log entry has no `blockId`, try to infer it by matching against
				// `list=blocks` data or traversing older logs depending on the action
				switch (log.action) {
					case 'block':
						// For a block/block entry: check if it corresponds to an active block
						// Note that `findId` is designed specifically for the bug mentioned above
						blockId = findId(log);
						break;
					case 'reblock': {
						// For a block/reblock entry: walk forward through older logs until the
						// initial block is found. Because logs are anti-chronological, we must
						// search toward larger indexes.
						// - If we encounter another "reblock", skip it and keep searching.
						// - If we encounter a "block", that’s the original → capture its ID.
						// - If we encounter an "unblock" first, it may correspond to a different
						//   earlier block, so the chain is ambiguous → stop searching.
						let j = i + 1;
						let done = false;
						while (j < logevents.length && !done) {
							const laterLog = logevents[j];
							switch (laterLog.action) {
								case 'block':
									blockId = findId(laterLog);
									done = true;
									break;
								case 'reblock':
									break; // Ignore and keep searching
								case 'unblock':
									done = true; // Ambiguous case, stop here
									break;
							}
							j++;
						}
						// Skip ahead so the outer loop doesn’t re-process logs we already examined
						i = j;
						break;
					}
					case 'unblock':
						// For "unblock" entries: skip, since they cannot represent an active block
						continue;
				}
			}
			if (typeof blockId !== 'number' || !blockIdMap.has(blockId) || log.action === 'unblock') {
				continue;
			}
			const { params, action, user, timestamp, parsedcomment } = log;
			const { duration, flags, restrictions, finalTargetCount, sitewide, 'duration-l10n': duration_l10n } = params;
			ret.set(blockId, {
				subtype: action,
				timestamp: timestamp.replace(/Z$/, ''),
				sitewide,
				count: finalTargetCount !== undefined ? finalTargetCount : 0,
				performer: user,
				target: username,
				// `duration` being an ISO 8601 timestamp means either that an absolute time was specified
				// for a new block, or that the expiry wasn't updated for a reblock. The latter case isn't
				// 100% accurate though, as it's possible to specify an absolute time for a reblock. But
				// this should be sufficient for the purpose here, because we would otherwise have to look
				// for the initial block log overwritten by the reblock.
				duration: rIsoTimestamp.test(duration)
					? duration.replace(/Z$/, '') // Use the ISO 8601 timestamp as the block duration
					: duration_l10n,
				flags,
				restrictions,
				parsedcomment
			});
		}

		return ret;
	}

	/**
	 * @param {BlockLogMapValue | undefined} logData
	 * @param {number} id
	 * @returns {string}
	 * @private
	 */
	static getLogLine(logData, id) {
		if (logData !== undefined) {
			return BlockLog.create(id, logData);
		} else {
			const line = Messages.get('ajaxblock-dialog-message-blocklog-missing', [BlockTarget.createBlockListLink(id).outerHTML]);
			return `<span style="color: var(--color-icon-error, #f54739);">${line}</span>`;
		}
	}

	// ---- Copied from InvestigateHelper ----

	/**
	 * Creates a block log line as raw HTML.
	 *
	 * **Messages**:
	 * * `logentry-block-block`
	 *   * `"$1 {{GENDER:$2|blocked}} {{GENDER:$4|$3}} with an expiration time of $5 $6"`
	 * * `logentry-block-block-multi`
	 *   * `"$1 {{GENDER:$2|added}} a block for {{GENDER:$4|$3}} with an expiration time of $5 $6"`
	 * * `logentry-block-reblock`
	 *   * `"$1 {{GENDER:$2|changed}} block settings for {{GENDER:$4|$3}} with an expiration time of $5 $6"`
	 *
	 * * `logentry-partialblock-block`
	 *   * `"$1 {{GENDER:$2|blocked}} {{GENDER:$4|$3}} from $7 with an expiration time of $5 $6"`
	 * * `logentry-partialblock-block-multi`
	 *   * `"$1 {{GENDER:$2|added}} a block for {{GENDER:$4|$3}} from $7 with an expiration time of $5 $6"`
	 * * `logentry-partialblock-reblock`
	 *   * `"$1 {{GENDER:$2|changed}} block settings for {{GENDER:$4|$3}} blocking $7 with an expiration time of $5 $6"`
	 *
	 * * `logentry-non-editing-block-block`
	 *   * `"$1 {{GENDER:$2|blocked}} {{GENDER:$4|$3}} from specified non-editing actions with an expiration time of $5 $6"`
	 * * `logentry-non-editing-block-block-multi`
	 *   * `"$1 {{GENDER:$2|added}} a block for {{GENDER:$4|$3}} from specified non-editing actions with an expiration time of $5 $6"`
	 * * `logentry-non-editing-block-reblock`
	 *   * `"$1 {{GENDER:$2|changed}} block settings for {{GENDER:$4|$3}} for specified non-editing actions with an expiration time of $5 $6"`
	 *
	 * **Parameters**:
	 * * `$1` - link to the user page of the user who performed the action
	 * * `$2` - username of the user who performed the action (to be used with GENDER)
	 * * `$3` - link to the affected page
	 * * `$4` - username for gender or empty string for autoblocks
	 * * `$5` - the block duration, localized and formatted with the English tooltip
	 * * `$6` - block detail flags or empty string
	 * * `$7` - restrictions list – any of:
	 *   * `logentry-partialblock-block-page` (`"the {{PLURAL:$1|page|pages}} $2"`)
	 *     * `$1` - number of pages
	 *     * `$2` - list of pages
	 *   * `logentry-partialblock-block-ns` (`"the {{PLURAL:$1|namespace|namespaces}} $2"`)
	 *     * `$1` - number of namespaces
	 *     * `$2` - list of namespaces
	 *   * `logentry-partialblock-block-action` (`"the {{PLURAL:$1|action|actions}} $2"`)
	 *     * `$1` - number of actions
	 *     * `$2` - list of actions
	 *
	 * @param {number} blockId
	 * @param {BlockLogMapValue} data
	 * @returns {string}
	 * @private
	 */
	static create(blockId, data) {
		const { subtype, timestamp, sitewide, count, performer, target, duration, flags, restrictions, parsedcomment } = data;

		/** @type {[string, string, string, string, string, string, string?]} */
		const parameters = [
			Messages.wikilink(`User:${performer}`, performer),
			performer,
			Messages.wikilink(`User:${target}`, target),
			target,
			duration,
			this.formatFlags(flags)
		];

		// Adapted from BlockLogFormatter::getMessageKey
		const type = 'block';
		let key = `logentry-${type}-${subtype}`;
		if ((subtype === 'block' || subtype === 'reblock') && !sitewide) {
			// message changes depending on whether there are editing restrictions or not
			if (restrictions) {
				key = `logentry-partial${type}-${subtype}`;
				parameters.push(
					Messages.listToText(this.formatRestrictions(restrictions))
				);
			} else {
				key = `logentry-non-editing-${type}-${subtype}`;
			}
		}
		if (subtype === 'block' && count > 1 ) {
			// logentry-block-block-multi, logentry-partialblock-block-multi,
			// logentry-non-editing-block-block-multi
			key += '-multi';
		}

		// @ts-expect-error
		const logline = Messages.get(key, parameters);
		const comment = parsedcomment && Messages.plain('parentheses', [parsedcomment]);
		const idLink = Messages.plain('parentheses', [
			`<b>${BlockTarget.createBlockListLink(blockId).outerHTML}</b>`
		]);

		const ret = [timestamp, logline, comment, idLink].filter(Boolean);
		return ret.join('&nbsp;');
	}

	/**
	 * Converts block flags to a human-readble string.
	 *
	 * @param {BlockFlags[]} flags
	 * @returns {string}
	 * @private
	 */
	static formatFlags(flags) {
		const formatted = flags.map((f) => Messages.get(`block-log-flags-${f}`));
		if (!formatted.length) return '';
		return Messages.plain('parentheses', [formatted.join(Messages.plain('comma-separator'))]);
	}

	/**
	 * Converts partial block restrictions to human-readble strings.
	 *
	 * @param {ApiResponseQueryListLogeventsParamsRestrictions} restrictions
	 * @returns {string[]}
	 * @private
	 */
	static formatRestrictions(restrictions) {
		/** @type {string[]} */
		const $7 = [];
		const { pages, namespaces, actions } = restrictions;
		if (pages && pages.length) {
			const num = String(pages.length);
			const list = pages.map(({ page_title }) => Messages.wikilink(page_title));
			const msg = Messages.get('logentry-partialblock-block-page', [num, Messages.listToText(list)]);
			$7.push(msg);
		}
		if (namespaces && namespaces.length) {
			const num = String(namespaces.length);
			const nsMap = Object.assign({}, mw.config.get('wgFormattedNamespaces'));
			nsMap[0] = Messages.get('blanknamespace');
			const list = namespaces.map((ns) => nsMap[ns]);
			const msg = Messages.get('logentry-partialblock-block-ns', [num, Messages.listToText(list)]);
			$7.push(msg);
		}
		if (actions && actions.length) {
			const num = String(actions.length);
			// Messages used here:
			// - ipb-action-create
			// - ipb-action-move
			// - ipb-action-thanks
			// - ipb-action-upload
			// @ts-expect-error
			const list = actions.map((action) => Messages.get(`ipb-action-${action}`));
			const msg = Messages.get('logentry-partialblock-block-action', [num, Messages.listToText(list)]);
			$7.push(msg);
		}
		return $7;
	}

	// ---- Copy end ----

}

class ParamApplier {

	/**
	 * @param {string} paramKey
	 * @returns {boolean}
	 * @private
	 */
	static isBlockSearchParamSupported(paramKey) {
		return this.supportedSearchParams.block.has(paramKey);
	}

	/**
	 * @param {string} paramKey
	 * @returns {boolean}
	 * @private
	 */
	static isUnblockSearchParamSupported(paramKey) {
		return this.supportedSearchParams.unblock.has(paramKey);
	}

	/**
	 * @param {InstanceType<ReturnType<AjaxBlockDialogFactory>>} dialog
	 * @param {BlockLink} data
	 * @returns {void}
	 */
	static addSearchParamApplier(dialog, data) {
		const { params, type } = data;
		if (!params) {
			return;
		}
		const { wrapper, applier } = this.generateApplierLink('short');
		const field = dialog.getActiveField();

		applier.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			console.log(params);
			if (field instanceof BlockUser && 'expiry' in params) {
				this.applyBlockParams(params, field, {
					hooks: field.getParamApplierOptions(field.getPresetType()),
				});
			} else if (field instanceof UnblockUser && !('expiry' in params)) {
				this.applyUnblockParams(params, field);
			} else {
				throw new Error('Logic exception');
			}
		});

		// Messages used here:
		// - ajaxblock-dialog-message-predefinedparams-block
		// - ajaxblock-dialog-message-predefinedparams-unblock
		const mainMsg = Messages.get(`ajaxblock-dialog-message-predefinedparams-${type}`);
		// eslint-disable-next-line no-control-regex
		const isLastCharFullWidth = !!mainMsg && /[^\u0000-\u00ff]$/.test(mainMsg);
		field.getTargetField().addMessage({
			label: $('<span>').append(
				mainMsg,
				isLastCharFullWidth ? Messages.plain('word-separator') : '',
				wrapper
			),
			type: 'notice',
		});
	}

	/**
	 * @param {BlockUser} blockUser
	 * @param {ApiResponseQueryListBlocks} block
	 * @returns {ReturnType<typeof ParamApplier.generateApplierLink>}
	 */
	static generateBlockInfoApplier(blockUser, block) {
		const params = this.createBlockParamsFromApiResponse(block);
		const link = this.generateApplierLink('long');

		link.applier.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.applyBlockParams(params, blockUser, {
				hooks: blockUser.getParamApplierOptions(blockUser.getPresetType()),
			});
		});

		return link;
	}

	/**
	 * @param {'short' | 'long'} type
	 * @returns {{ wrapper: HTMLElement; applier: HTMLAnchorElement; }}
	 * @private
	 */
	static generateApplierLink(type) {
		const applier = document.createElement('a');
		applier.classList.add('ajaxblock-paramapplier');
		applier.role = 'button';
		applier.href = '#';
		// Messages used here:
		// - ajaxblock-dialog-message-applyparams-short
		// - ajaxblock-dialog-message-applyparams-long
		applier.textContent = Messages.get(`ajaxblock-dialog-message-applyparams-${type}`);
		applier.style.fontWeight = 'bold';

		const wrapper = document.createElement('span');
		wrapper.appendChild(document.createTextNode(Messages.plain('parentheses-start')));
		wrapper.appendChild(applier);
		wrapper.appendChild(document.createTextNode(Messages.plain('parentheses-end')));

		return { wrapper, applier };
	}

	/**
	 * @param {URLSearchParams} params
	 * @param {BlockTargetType} targetType
	 * @param {Initializer} initializer
	 * @returns {?ParamApplierBlockParams}
	 */
	static createBlockParamsFromSearchParams(params, targetType, initializer) {
		const map = /** @type {Map<string, string>} */ (new Map());
		for (const [key, value] of params.entries()) {
			if (this.isBlockSearchParamSupported(key)) {
				map.set(key, clean(value));
			}
		}
		if (!map.size) {
			return null;
		}

		const isPartial = params.get('wpEditingRestriction') === 'partial';
		/**
		 * @param {string} paramKey
		 * @returns {string[]}
		 */
		const getRetrictionArray = (paramKey) => {
			let val = params.get(paramKey);
			if (!val || !isPartial) {
				return [];
			}

			// XXX: Only cast the string to an array of strings here and validate the elements in applyBlockParams()
			// so that we can mw.notify invalid values in it
			val = clean(val.replace(/_/g, ' '));
			return val.split('\n').filter(v => v.trim());
		};

		let r;
		return {
			expiry: params.get('wpExpiry') || '',
			reason: [
				(r = params.get('wpReason')) === 'other' ? '' : r,
				params.get('wpReason-other')
			].filter(Boolean).join(Messages.plain('colon-separator')),
			hardblock: targetType === 'ip' && toPHPBool(params.get('wpHardBlock')),
			nocreate: toPHPBool(params.get('wpCreateAccount')),
			autoblock: targetType !== 'ip' && toPHPBool(params.get('wpAutoBlock')),
			noemail: toPHPBool(params.get('wpDisableEmail')),
			hidden: initializer.permissionManager.canHideUser() && toPHPBool(params.get('wpHideUser')),
			nousertalk: toPHPBool(params.get('wpDisableUTEdit')),
			partial: isPartial,
			pagerestrictions: getRetrictionArray('wpPageRestrictions'),
			namespacerestrictions: getRetrictionArray('wpNamespaceRestrictions'),
			actionrestrictions: [],
			watchuser: toPHPBool(params.get('wpWatch')),
			watchlistexpiry: null,
		};
	}

	/**
	 * @param {URLSearchParams} params
	 * @returns {?ParamApplierUnblockParams}
	 */
	static createUnbBlockParamsFromSearchParams(params) {
		const map = /** @type {Map<string, string>} */ (new Map());
		for (const [key, value] of params.entries()) {
			if (this.isUnblockSearchParamSupported(key)) {
				map.set(key, clean(value));
			}
		}
		if (!map.size) {
			return null;
		}

		return {
			reason: params.get('wpRemovalReason') || params.get('wpReason') || '',
			watchuser: toPHPBool(params.get('wpWatch')),
			watchlistexpiry: null,
		};
	}

	/**
	 * @param {Omit<ApiResponseQueryListBlocks, 'id' | 'by' | 'timestamp'> & Partial<AjaxBlockLegacyConfigWatchOptions>} block
	 * @returns {ParamApplierBlockParams}
	 */
	static createBlockParamsFromApiResponse(block) {
		const restr = Array.isArray(block.restrictions) ? {} : block.restrictions;
		return {
			expiry: block.expiry,
			reason: block.reason,
			hardblock: !block.anononly,
			nocreate: block.nocreate,
			autoblock: block.autoblock,
			noemail: block.noemail,
			hidden: block.hidden,
			nousertalk: !block.allowusertalk,
			partial: block.partial,
			pagerestrictions: restr.pages ? restr.pages.map(obj => obj.title) : [],
			namespacerestrictions: restr.namespaces || [],
			actionrestrictions: restr.actions || [],
			watchuser: block.watchlist !== undefined ? block.watchlist : null,
			watchlistexpiry: block.watchlistexpiry !== undefined ? block.watchlistexpiry : null,
		};
	}

	/**
	 * @param {ParamApplierBlockParams} params
	 * @param {BlockField} blockField
	 * @param {object} [options]
	 * @param {BlockParamApplierHookOptions} [options.hooks]
	 * @param {BlockParamApplierContextOptions} [options.context]
	 * @param {mw.notification.NotificationOptions} [options.notification] Default: `{ type: 'warn', autoHideSeconds: 'long' }`
	 * @returns {JQuery.Promise<void>} This method never rejects.
	 */
	static applyBlockParams(params, blockField, options = {}) {
		const noop = () => {};
		const { hooks = {}, context = {}, notification } = options;
		const {
			onAfterApply = noop,
			onBeforePromise = noop,
			onAfterPromise = noop,
			targetType,
		} = hooks;
		const translatorOptions = targetType && {
			targetType,
			permissionManager: blockField.initializer.permissionManager
		};
		const /** @type {BlockParamApplierInvalidRestrictionMap} */ invalidRestrictions = Object.create(null);

		/**
		 * @type {BlockParamApplierHandler}
		 */
		const paramMap = {
			expiry: {
				setter: blockField.setExpiry.bind(blockField),
			},
			reason: {
				setter: blockField.setReason.bind(blockField),
			},
			hardblock: {
				getter: v => this.translateBoolForTarget(v, 'hardblock', translatorOptions),
				setter: blockField.cbHardblock.setSelected.bind(blockField.cbHardblock),
			},
			nocreate: {
				setter: blockField.cbCreateAccount.setSelected.bind(blockField.cbCreateAccount),
			},
			autoblock: {
				getter: v => this.translateBoolForTarget(v, 'autoblock', translatorOptions),
				setter: blockField.cbAutoblock.setSelected.bind(blockField.cbAutoblock),
			},
			noemail: {
				setter: blockField.cbSendEmail.setSelected.bind(blockField.cbSendEmail),
			},
			hidden: {
				getter: v => this.translateBoolForTarget(v, 'hidden', translatorOptions),
				setter: blockField.cbHideUser.setSelected.bind(blockField.cbHideUser),
			},
			nousertalk: {
				setter: blockField.cbUserTalk.setSelected.bind(blockField.cbUserTalk),
			},
			partial: {
				setter: blockField.cbPartialBlock.setSelected.bind(blockField.cbPartialBlock),
			},
			pagerestrictions: {
				getter: (values) => {
					const tempValues = /** @type {Set<string>} */ new Set();
					const invalidValues = /** @type {Set<string>} */ new Set();

					for (let t of values) {
						const title = mw.Title.newFromText(t);
						if (title && title.getNamespaceId() >= 0) {
							tempValues.add(title.getPrefixedText());
						} else {
							invalidValues.add(t);
						}
					}

					if (!tempValues.size) {
						if (invalidValues.size) {
							invalidRestrictions.pages = invalidValues;
						}
						return /** @type {string[]} */ ([]);
					}

					const apilimit = blockField.initializer.permissionManager.getApiLimit();
					const ajaxOptions = nonwritePost();
					return (
						/**
						 * @param {string[]} batch
						 * @param {number} offset
						 * @param {Set<string>} ret
						 * @returns {JQuery.Promise<string[]>}
						 */
						function request(batch, offset, ret = new Set()) {
							const titles = batch.slice(offset, offset + apilimit);
							return AjaxBlock.api.post({
								titles,
							}, ajaxOptions).then(/** @param {ApiResponse} res */ (res, jqXHR) => {
								let pages = res && res.query && res.query.pages;
								const interwiki = res && res.query && res.query.interwiki;
								if (!Array.isArray(pages) && !Array.isArray(interwiki)) {
									return failAsEmptyResult(res, jqXHR);
								}
								pages = pages || [];
								if (Array.isArray(interwiki)) {
									pages.push(...interwiki);
								}
								for (const page of pages) {
									const { invalid, iw, missing, special, title } = page;
									if (invalid || iw || missing || special) {
										invalidValues.add(title);
										continue;
									}
									ret.add(title);
								}
								offset += apilimit;
								if (batch[offset]) {
									return request(batch, offset, ret);
								}
								return [...ret];
							});
						}
					)(Array.from(tempValues), 0).then((titles) => {
						if (invalidValues.size) {
							invalidRestrictions.pages = invalidValues;
						}
						return titles.slice(0, blockField.partialBlockPages.limit);
					});
				},
				setter: (values) => {
					const menu = blockField.partialBlockPages.getMenu();
					const items = [];
					for (const title of values) {
						if (!menu.findItemFromData(title)) {
							items.push(
								blockField.partialBlockPages.createMenuOptionWidget(title)
							);
						}
					}
					menu.addItems(items);
					blockField.partialBlockPages.setValue(values);
					menu.removeItems(items);
				},
			},
			namespacerestrictions: {
				getter: (namespaces) => {
					/**
					 * @type {Set<string>}
					 * XXX: MwWidgetsNamespacesMenuOptionWidget.data is a string
					 */
					let values = new Set();

					if (isNumberArray(namespaces)) {
						values = new Set(namespaces.map(String));
					} else {
						// Array of numeral strings parsed from a URL query param
						values = new Set();
						const /** @type {Set<string>} */ invalidValues = new Set();
						for (let ns of namespaces) {
							ns = ns.trim();
							if (/^\d+$/.test(ns) && this.isValidNamespaceRestrictionValue(+ns)) {
								values.add(ns); // Namespace IDs are stored as strings
							} else {
								invalidValues.add(ns);
							}
						}
						if (invalidValues.size) {
							invalidRestrictions.namespaces = invalidValues;
						}
					}

					return [...values];
				},
				setter: blockField.partialBlockNamespaces.setValue.bind(blockField.partialBlockNamespaces),
			},
			actionrestrictions: {
				setter: (values) => {
					const valueSet = new Set(values);
					for (const [action, checkbox] of Object.entries(blockField.partialBlockActions)) {
						const selected = valueSet.has(action);
						checkbox.setSelected(selected);
					}
				}
			},
			watchuser: {
				setter: blockField.setWatchUser.bind(blockField),
			},
			watchlistexpiry: {
				setter: blockField.setWatchlistExpiry.bind(blockField),
			},
		};

		// Apply values
		const entries = typedEntries(params);
		const iPartial = entries.findIndex(([key]) => key === 'partial');
		if (iPartial !== -1) {
			// Move `partial` to last so that the event listener of the field is called last
			entries.push(entries.splice(iPartial, 1)[0]);
		}

		const promises = /** @type {JQuery.Promise<?JQuery<HTMLElement>>[]} */ ([]);
		/**
		 * @param {string} _
		 * @param {any} res
		 * @returns {JQuery<HTMLElement>}
		 */
		const catchHandler = (_, res) => AjaxBlock.api.getErrorMessage(res);

		for (const [key, value] of entries) {
			const { getter, setter } = paramMap[key];
			const val = typeof getter === 'function'
				// @ts-expect-error
				? getter(value)
				: value;
			if (isObject(val) && typeof val.then === 'function') {
				const p = val
					.then(/** @param {any} v */ (v) => {
						// @ts-expect-error
						setter(v);
						return null;
					})
					.catch(catchHandler);
				promises.push(p);
			} else {
				// @ts-expect-error
				setter(val);
			}
		}

		onAfterApply();

		if (promises.length) {
			onBeforePromise();

			// Note: Promise.all will never reject since all async failures are
			// converted into resolved error elements
			return $.when(...promises).then((...results) => {
				results.forEach(($err) => {
					if (!$err) {
						return;
					}
					mw.notify($err, { type: 'error', autoHideSeconds: 'long' });
				});
				onAfterPromise();
			}).catch(() => {
				// This should never normally happen, but guarantees symmetry
				onAfterPromise();
			}).then(() => {
				if (!$.isEmptyObject(invalidRestrictions)) {
					this.notifyInvalidRestrictions(invalidRestrictions, context, notification);
				}
			});
		}

		if (!$.isEmptyObject(invalidRestrictions)) {
			this.notifyInvalidRestrictions(invalidRestrictions, context, notification);
		}
		return $.Deferred().resolve().promise();
	}

	/**
	 * @param {boolean} value
	 * @param {'hardblock' | 'autoblock' | 'hidden'} paramKey
	 * @param {{ targetType: NonNullable<BlockTargetType>; permissionManager: PermissionManager }} [options]
	 * @returns {boolean}
	 * @private
	 */
	static translateBoolForTarget(value, paramKey, options) {
		if (!options) {
			return value;
		}
		const { targetType, permissionManager } = options;
		switch (paramKey) {
			case 'hardblock': return targetType === 'ip' && value;
			case 'autoblock': return (targetType === 'named' || targetType === 'temp') && value;
			case 'hidden': return targetType === 'named' && permissionManager.canHideUser() && value;
			default: throw new Error('Invalid param key: ' + paramKey);
		}
	}

	/**
	 * @param {ParamApplierUnblockParams} params
	 * @param {UnblockField} unblockField
	 * @returns {void}
	 * @private
	 */
	static applyUnblockParams(params, unblockField) {
		unblockField
			.setReason(params.reason)
			.setWatchUser(params.watchuser)
			.setWatchlistExpiry(params.watchlistexpiry);
	}

	/**
	 * @param {BlockParamApplierInvalidRestrictionMap} invalidValues
	 * @param {BlockParamApplierContextOptions} contextOptions
	 * @param {mw.notification.NotificationOptions} [notifOptions] Default: `{ type: 'warn', autoHideSeconds: 'long' }`
	 * @returns {void}
	 * @private
	 */
	static notifyInvalidRestrictions(invalidValues, contextOptions, notifOptions) {
		if ($.isEmptyObject(invalidValues)) {
			throw new Error('invalidValues is empty');
		}

		const separator = {
			comma: Messages.plain('comma-separator'),
			colon: Messages.plain('colon-separator'),
			word: Messages.plain('word-separator'),
		};
		const $ul = $('<ul>');
		const { preset, domain, scriptName } = contextOptions;

		// Add "Preset: <preset> (<domain>)"
		if (preset) {
			const $li = $('<li>').append(
				Messages.get('ajaxblock-config-label-presetreasons-name'),
				separator.colon,
				$('<code>').text(preset)
			);
			if (domain) {
				$li.append(
					separator.word,
					Messages.plain('parentheses', [Messages.get(`ajaxblock-config-label-tab-${domain}`)])
				);
			}
			$ul.append($li);
		}

		// Add filtered values
		for (const [restriction, invalidSet] of typedEntries(invalidValues)) {
			if (!invalidSet) {
				continue;
			}
			$ul.append(
				$('<li>').append(
					// Messages used here:
					// - ajaxblock-notify-warning-paramapplier-filtered-pages
					// - ajaxblock-notify-warning-paramapplier-filtered-namespaces
					Messages.get(`ajaxblock-notify-warning-paramapplier-filtered-${restriction}`),
					separator.colon,
					Messages.listToText([...invalidSet].map(val => `<code>${val}</code>`))
				)
			);
		}

		const $msg = $('<div>');
		if (scriptName) {
			$msg.append(SCRIPT_NAME, separator.colon);
		}
		$msg.append(
			Messages.get('ajaxblock-notify-warning-paramapplier-filtered-top'),
			$ul
		);
		mw.notify($msg, Object.assign({ type: 'warn', autoHideSeconds: 'long' }, notifOptions));
	}

	/**
	 * @param {number} namespace
	 * @returns {boolean}
	 * @private
	 */
	static isValidNamespaceRestrictionValue(namespace) {
		return this.validNamespaceRestrictionValues.has(namespace);
	}

	/**
	 * @param {BlockParams} params
	 * @param {BlockLink['params']} predefinedParams
	 * @returns {boolean}
	 */
	static blockParamsDiffer(params, predefinedParams) {
		if (!predefinedParams) {
			return false;
		} else if (!('expiry' in predefinedParams)) {
			console.error('Encountered unblock parameters for action="block"', predefinedParams);
			return false;
		}
		return params.expiry !== predefinedParams.expiry ||
			params.reason !== predefinedParams.reason ||
			params.nocreate !== predefinedParams.nocreate ||
			params.noemail !== predefinedParams.noemail ||
			params.allowusertalk !== !predefinedParams.nousertalk ||
			(params.anononly !== undefined && params.anononly !== !predefinedParams.hardblock) ||
			(params.autoblock !== undefined && params.autoblock !== predefinedParams.autoblock) ||
			(params.hidename !== undefined && params.hidename !== predefinedParams.hidden) ||
			(predefinedParams.watchuser !== null && !!params.watchuser !== predefinedParams.watchuser) ||
			params.partial !== predefinedParams.partial ||
			this.restrictionsDiffer(params.pagerestrictions, predefinedParams.pagerestrictions) ||
			this.restrictionsDiffer(params.namespacerestrictions, predefinedParams.namespacerestrictions);
			// this.restrictionsDiffer(params.actionrestrictions, predefinedParams.actionrestrictions);
	}

	/**
	 * @param {UnblockParams} params
	 * @param {BlockLink['params']} predefinedParams
	 * @returns {boolean}
	 */
	static unblockParamsDiffer(params, predefinedParams) {
		if (!predefinedParams) {
			return false;
		} else if ('expiry' in predefinedParams) {
			console.error('Encountered block parameters for action="unblock"', predefinedParams);
			return false;
		}
		return params.reason !== predefinedParams.reason ||
			(predefinedParams.watchuser !== null && !!params.watchuser !== predefinedParams.watchuser);
	}

	/**
	 * @param {string[] | undefined} paramValues
	 * @param {string[] | number[]} predefined
	 * @returns {boolean}
	 * @private
	 */
	static restrictionsDiffer(paramValues, predefined) {
		paramValues = paramValues || [];
		if (isNumberArray(predefined)) {
			predefined = predefined.map(String);
		}
		if (paramValues.length !== predefined.length) {
			return true;
		}
		const paramValueSet = new Set(paramValues);
		return predefined.every(v => paramValueSet.has(v));
	}

}
ParamApplier.supportedSearchParams = {
	block: new Set([
		'wpExpiry',
		'wpReason',
		'wpReason-other',
		// 'wpRemovalReason', // Handled in UnblockUser instead
		'wpEditingRestriction',
		'wpPageRestrictions',
		'wpNamespaceRestrictions',
		'wpCreateAccount', // Default: true
		'wpDisableEmail',
		'wpDisableUTEdit',
		'wpAutoBlock',
		'wpHideUser',
		'wpHardBlock',
		'wpWatch',
	]),
	unblock: new Set([
		'wpRemovalReason', // XXX: This is actually for Special:Block
		'wpReason',
		'wpWatch',
	]),
};
ParamApplier.validNamespaceRestrictionValues = new Set(
	Object.keys(mw.config.get('wgFormattedNamespaces')).reduce((acc, ns) => {
		const num = Number(ns);
		if (num >= 0) {
			acc.push(num);
		}
		return acc;
	}, /** @type {number[]} */ ([]))
);

class BlockPreset {

	/**
	 * @overload
	 * @param {BlockPresetJson['name']} nameOrObj
	 * @param {BlockPresetJson['targets']} targets
	 * @param {BlockPresetJson['params']} params
	 */
	/**
	 * @overload
	 * @param {BlockPresetJson} nameOrObj
	 */
	/**
	 * @param {BlockPresetJson['name'] | BlockPresetJson} nameOrObj
	 * @param {BlockPresetJson['targets']} [targets]
	 * @param {BlockPresetJson['params']} [params]
	 */
	constructor(nameOrObj, targets, params) {
		let /** @type {string} */ name;
		if (typeof nameOrObj === 'string') {
			name = nameOrObj;
		} else {
			name = nameOrObj.name;
			targets = nameOrObj.targets;
			params = nameOrObj.params;
		}
		if (typeof name !== 'string') {
			throw new TypeError('Expected string for "name", but got ' + typeof name, { cause: name });
		}
		if (!Array.isArray(targets)) {
			throw new TypeError('Expected array for "targets", but got ' + typeof targets, { cause: targets });
		}
		if (!isObject(params)) {
			throw new TypeError('Expected object for "params", but got ' + typeof params, { cause: params });
		}

		/**
		 * @type {string}
		 * @readonly
		 * @private
		 */
		this.name = name;
		/**
		 * @type {Set<NonNullable<BlockTargetType>>}
		 * @readonly
		 * @private
		 */
		this.targets = new Set(targets);
		/**
		 * @type {ParamApplierBlockParams}
		 * @readonly
		 * @private
		 */
		this.params = params;
	}

	getName() {
		return this.name;
	}

	getTargets() {
		return this.targets;
	}

	/**
	 * @param {BlockTargetType} target
	 * @returns {boolean}
	 */
	supportsTarget(target) {
		// TODO: Add guard against null?
		return this.targets.has(/** @type {any} */ (target));
	}

	getParams() {
		return this.params;
	}

	/**
	 * Returns a user-facing preset name, optionally augmented with a localized target label
	 * (e.g. "named - Registered users").
	 *
	 * If the preset name corresponds to a known block target type ("named", "temp", "ip"),
	 * a localized label is appended. Otherwise, the original preset name is returned unchanged.
	 *
	 * @param {string} presetName Raw preset identifier
	 * @return {string} Display-ready preset name
	 */
	static getDisplayName(presetName) {
		if (presetName === 'named' || presetName === 'temp' || presetName === 'ip') {
			// Messages used here:
			//  - ajaxblock-config-label-presetreasons-target-named
			//  - ajaxblock-config-label-presetreasons-target-temp
			//  - ajaxblock-config-label-presetreasons-target-ip
			presetName += ' - ' + Messages.get(`ajaxblock-config-label-presetreasons-target-${presetName}`);
		}
		return presetName;
	}

	static getDefaultAsMap() {
		const /** @type {Map<string, BlockPreset>} */ map = new Map();
		for (const [preset, params] of typedEntries(this.default)) {
			map.set(preset, new BlockPreset(preset, [preset], params));
		}
		return map;
	}

	/**
	 * @param {AjaxBlockConfigStore} configStore
	 * @returns {OO.ui.MenuOptionWidget[]}
	 */
	static createMenuOptions(configStore) {
		const /** @type {OO.ui.MenuOptionWidget[]} */ options = [];
		for (const [name, instance] of configStore.getPresets('merged')) {
			options.push(
				new OO.ui.MenuOptionWidget({
					label: BlockPreset.getDisplayName(name),
					data: instance,
				})
			);
		}
		return options;
	}

}
/**
 * @type {Record<NonNullable<BlockTargetType>, ParamApplierBlockParams>}
 */
BlockPreset.default = {
	named: {
		expiry: EXPIRY_INFINITE,
		reason: '',
		hardblock: false,
		nocreate: true,
		autoblock: true,
		noemail: false,
		hidden: false,
		nousertalk: false,
		partial: false,
		pagerestrictions: [],
		namespacerestrictions: [],
		actionrestrictions: [],
		watchuser: false,
		watchlistexpiry: EXPIRY_INFINITE,
	},
	temp: {
		expiry: '3 months',
		reason: '',
		hardblock: false,
		nocreate: true,
		autoblock: true,
		noemail: false,
		hidden: false,
		nousertalk: false,
		partial: false,
		pagerestrictions: [],
		namespacerestrictions: [],
		actionrestrictions: [],
		watchuser: false,
		watchlistexpiry: EXPIRY_INFINITE,
	},
	ip: {
		expiry: '1 week',
		reason: '',
		hardblock: false,
		nocreate: true,
		autoblock: false,
		noemail: false,
		hidden: false,
		nousertalk: false,
		partial: false,
		pagerestrictions: [],
		namespacerestrictions: [],
		actionrestrictions: [],
		watchuser: false,
		watchlistexpiry: EXPIRY_INFINITE,
	},
};
/**
 * @requires mediawiki.user This class must not depend on any other modules
 */
class AjaxBlockConfigStore {

	/**
	 * @private
	 */
	static getLegacy() {
		return {
			local: /** @type {?AjaxBlockLegacyConfigLocal} */ (this.getParsed('legacy', 'local')) || undefined,
			global: /** @type {?AjaxBlockLegacyConfigGlobal} */ (this.getParsed('legacy', 'global')) || undefined,
		};
	}

	/**
	 * @template T
	 * @param {AjaxBlockConfigVersions} version
	 * @param {AjaxBlockConfigDomains} domain
	 * @returns {?T}
	 * @private
	 */
	static getParsed(version, domain) {
		const cfgStr = mw.user.options.get(this.optionKeys[version][domain], null);
		if (!cfgStr) {
			return null;
		}
		try {
			const parsed = JSON.parse(cfgStr);
			if (!$.isPlainObject(parsed)) {
				throw new Error(`Encountered a non-plain object as the ${domain} ${version} config`);
			}
			return parsed;
		} catch (e) {
			console.error(e, cfgStr);
			return null;
		}
	}

	constructor() {
		const legacy = AjaxBlockConfigStore.getLegacy();

		const userLang = /** @type {AjaxBlockLanguages} */ (mw.config.get('wgUserLanguage').replace(/-.*$/, ''));
		/**
		 * @type {AjaxBlockLanguageConfig}
		 * @readonly
		 * @private
		 */
		this.configuredLanguages = AjaxBlockConfigLanguageOptions.getMerged(legacy.local, legacy.global);
		/**
		 * @type {AjaxBlockLanguages}
		 * @readonly
		 * @private
		 */
		this.language = this.configuredLanguages.used.includes(userLang)
			? userLang
			: this.configuredLanguages.default || 'en';
		/**
		 * @type {AjaxBlockWarningConfig}
		 * @readonly
		 * @private
		 */
		this.warnings = AjaxBlockConfigWarningOptions.getMerged(legacy.local);
		/**
		 * @type {ReturnType<typeof AjaxBlockConfigBlockPresetOptions.getMerged>}
		 * @readonly
		 * @private
		 */
		this.presets = AjaxBlockConfigBlockPresetOptions.getMerged(undefined, undefined, legacy.local);
		/**
		 * @type {ReturnType<typeof AjaxBlockConfigCustomReasonOptions.getMerged>}
		 * @readonly
		 * @private
		 */
		this.customReasons = AjaxBlockConfigCustomReasonOptions.getMerged(legacy.local, legacy.global);
	}

	getUsedLanguages() {
		return this.configuredLanguages.used;
	}

	getDefaultLanguage() {
		return this.configuredLanguages.default;
	}

	getLanguage() {
		return this.language;
	}

	getWarningOptions() {
		return this.warnings;
	}

	/**
	 * @param {WarningKeys} key
	 * @param {WarningContext} context
	 * @returns {boolean}
	 */
	isWarningEnabled(key, context) {
		return this.warnings[key][context];
	}

	/**
	 * @param {AjaxBlockConfigDomains | 'merged'} format
	 * @returns {Map<string, BlockPreset>}
	 */
	getPresets(format) {
		if (format in this.presets) {
			return this.presets[format];
		}
		throw new Error('Invalid format: ' + format);
	}

	/**
	 * @param {BlockActions} action
	 * @param {AjaxBlockConfigDomains} [domain]
	 * @returns {string[]}
	 */
	getCustomReasons(action, domain) {
		/** @type {string[]} */
		const reasons = [];

		if (domain) {
			reasons.push(...this.customReasons[domain][action]);
		} else {
			reasons.push(
				...this.customReasons.local[action],
				...this.customReasons.global[action]
			);
		}

		return Array.from(new Set(reasons));
	}

}
/**
 * @type {Record<AjaxBlockConfigVersions, Record<AjaxBlockConfigDomains, string>>}
 */
AjaxBlockConfigStore.optionKeys = {
	current: {
		local: 'userjs-ajaxblock2',
		global: 'userjs-ajaxblock2-global',
	},
	legacy: {
		local: 'userjs-ajaxblock',
		global: 'userjs-ajaxblock-global',
	},
};

class AjaxBlockConfig {

	static isConfigPage() {
		return mw.config.get('wgNamespaceNumber') === -1 && /^(?:AjaxBlockConfig|ABC)$/i.test(mw.config.get('wgTitle'));
	}

	static getDependencies() {
		return !this.isConfigPage() ? [] : [
			'jquery.makeCollapsible',
			'oojs-ui.styles.icons-movement'
		];
	}

	static preparePage() {
		return $.ready.then(() => {
			const title = Messages.get('ajaxblock-config-title');
			document.title = title + ' - ' + mw.config.get('wgSiteName');

			const heading = document.querySelector('.mw-first-heading');
			const content = document.querySelector('.mw-body-content');
			if (!heading || !content) {
				this.fail(content);
				return null;
			}
			heading.textContent = title;

			const spinner = BlockLinkUtil.getSpinner();
			spinner.style.marginLeft = '0.5em';
			content.replaceChildren(
				Messages.get('ajaxblock-config-loading'),
				spinner
			);

			return content;
		});
	}

	/**
	 * @param {?Element} content
	 * @returns {void}
	 * @private
	 */
	static fail(content) {
		const msg = Messages.get('ajaxblock-config-loading-failure');
		mw.notify(msg, { type: 'error' });
		console.error(msg);

		if (content) {
			const span = document.createElement('span');
			span.style.color = 'var(--color-icon-error, #f54739)';
			span.textContent = msg;

			content.replaceChildren(span);
		}
	}

	/**
	 * @typedef {Required<Initializer>} FullInitializer
	 */
	/**
	 * @param {FullInitializer} initializer
	 * @param {Element} content
	 * @returns {void}
	 */
	static init(initializer, content) {
		if (!initializer.langs) {
			this.fail(content);
			return;
		}

		const ajaxBlockConfig = new AjaxBlockConfig(initializer);
		const paramApplierPromises = [
			...ajaxBlockConfig.localDialogOptions.blockPresetOptions.getFields().map(field => field.paramApplierPromise),
			...ajaxBlockConfig.globalDialogOptions.blockPresetOptions.getFields().map(field => field.paramApplierPromise)
		];
		$.when(...paramApplierPromises).then(() => {
			$(content).addClass('ajaxblock-config-content').empty().append(ajaxBlockConfig.$element);
		});
	}

	/**
	 * @param {FullInitializer} initializer
	 * @private
	 */
	constructor(initializer) {
		/**
		 * @type {AjaxBlockConfigLanguageOptions}
		 * @readonly
		 * @private
		 */
		this.languageOptions = new AjaxBlockConfigLanguageOptions(initializer);
		/**
		 * @type {AjaxBlockConfigWarningOptions}
		 * @readonly
		 * @private
		 */
		this.warningOptions = new AjaxBlockConfigWarningOptions(initializer);

		const commonTabPanel = new OO.ui.TabPanelLayout('Common', {
			expanded: false,
			label: Messages.get('ajaxblock-config-label-tab-common'),
			scrollable: false
		});
		commonTabPanel.$element.append(
			this.languageOptions.$element,
			this.warningOptions.$element
		);

		const localTabPanel = new OO.ui.TabPanelLayout('Local', {
			expanded: false,
			label: Messages.get('ajaxblock-config-label-tab-local'),
			scrollable: false
		});
		/**
		 * @type {AjaxBlockConfigDialogOptions}
		 * @readonly
		 * @private
		 */
		this.localDialogOptions = new AjaxBlockConfigDialogOptions(initializer, 'local', localTabPanel);

		const globalTabPanel = new OO.ui.TabPanelLayout('Global', {
			expanded: false,
			label: Messages.get('ajaxblock-config-label-tab-global'),
			scrollable: false
		});
		/**
		 * @type {AjaxBlockConfigDialogOptions}
		 * @readonly
		 * @private
		 */
		this.globalDialogOptions = new AjaxBlockConfigDialogOptions(initializer, 'global', globalTabPanel);

		const miscTabPanel = new OO.ui.TabPanelLayout('Misc', {
			expanded: false,
			label: Messages.get('ajaxblock-config-label-tab-misc'),
			scrollable: false
		});

		const panels = [commonTabPanel, localTabPanel, globalTabPanel, miscTabPanel];
		const index = new OO.ui.IndexLayout({
			expanded: false,
			framed: false
		}).addTabPanels(panels, 0);

		/**
		 * @type {JQuery<HTMLElement}
		 * @readonly
		 */
		this.$element = index.$element;

		// const $overlay = $('<div>').addClass('sr-config-overlay').hide();
		// $content.empty().append(
			// $overlay,
		// 	index.$element
		// );
		// 	.css({ position: 'relative' });

		// const miscTab = new SelectiveRollbackConfigMisc($overlay);
		// const globalTab = new this('global', $overlay, miscTab);
		// const localTab = new this('local', $overlay, miscTab);

		// globalTabPanel.$element.append(
		// 	new OO.ui.MessageWidget({
		// 		classes: ['sr-config-notice'],
		// 		type: 'notice',
		// 		label: msg['config-notice-global']
		// 	}).$element,
		// 	globalTab.$element
		// );
		// localTabPanel.$element.append(
		// 	new OO.ui.MessageWidget({
		// 		classes: ['sr-config-notice'],
		// 		type: 'notice',
		// 		label: msg['config-notice-local']
		// 	}).$element,
		// 	localTab.$element
		// );
		// miscTabPanel.$element.append(
		// 	miscTab.$element
		// );

		// const dirMismatch = document.dir !== dir;
		// if (dirMismatch) {
		// 	this.handleDirMismatch();
		// }

		// const beforeunloadMap = {
		// 	local: localTab,
		// 	global: globalTab
		// };
		// window.onbeforeunload = (e) => {
		// 	const unsaved = Object.entries(beforeunloadMap).some(([k, field]) => {
		// 		const key = /** @type {'local' | 'global'} */ (k);
		// 		return !objectsEqual(this.get(key), field.retrieve());
		// 	});
		// 	if (unsaved) {
		// 		e.preventDefault();
		// 		e.returnValue = 'You have unsaved changes. Do you want to leave the page?';
		// 	}
		// };

		this.registerEvents(panels);
	}

	/**
	 * @param {OO.ui.TabPanelLayout[]} panels
	 * @private
	 */
	registerEvents(panels) {
		// On panel activation, clear any automatically assigned focus within the panel
		panels.forEach((panel) => {
			panel.on('active', (activated) => {
				if (activated) {
					requestAnimationFrame(() => {
						const activeEl = document.activeElement;
						if (activeEl instanceof HTMLElement && panel.$element.has(activeEl).length) {
							activeEl.blur();
						}
					});
				}
			});
		});

		// Debounced update of block reason dropdown options when custom reasons change
		const updateReasons = () => {
			const globalCustomReasons = this.globalDialogOptions.blockReasonOptions.build(false);
			const localCustomReasons = this.localDialogOptions.blockReasonOptions.build(false);
			const combinedCustomReasons = Array.from(
				new Set([...localCustomReasons, ...globalCustomReasons])
			);

			// Apply global-only
			this.globalDialogOptions.blockPresetOptions.getFields().forEach((field) => {
				field.insertCustomReasons(globalCustomReasons);
			});

			// Apply combined to local
			this.localDialogOptions.blockPresetOptions.getFields().forEach((field) => {
				field.insertCustomReasons(combinedCustomReasons);
			});
		};
		const onChange = OO.ui.debounce(updateReasons, 1000);
		this.globalDialogOptions.blockReasonOptions.getTextInput().on('change', onChange);
		this.localDialogOptions.blockReasonOptions.getTextInput().on('change', onChange);
	}

}

class AjaxBlockConfigLanguageOptions {

	/**
	 * @param {FullInitializer} initializer
	 */
	constructor(initializer) {
		const { configStore } = initializer;

		const getLanguageOptions = () => {
			return typedEntries(initializer.langs).map(([code, autonym]) => {
				return {
					label: `${code} - ${autonym}`,
					data: code,
				};
			});
		};

		/**
		 * @type {OO.ui.MenuTagMultiselectWidget}
		 * @readonly
		 * @private
		 */
		this.ddUsedLanguages = new OO.ui.MenuTagMultiselectWidget({
			inputPosition: 'inline',
			options: getLanguageOptions(),
			placeholder: Messages.get('ajaxblock-config-placeholder-languages-used'),
		});
		this.ddUsedLanguages.setValue(configStore.getUsedLanguages());

		/**
		 * @type {OO.ui.DropdownWidget}
		 * @readonly
		 * @private
		 */
		this.ddDefaultLanguage = new OO.ui.DropdownWidget({
			menu: {
				items: getLanguageOptions().map(cfg => new OO.ui.MenuOptionWidget(cfg)),
			},
		});
		this.ddDefaultLanguage.getMenu().selectItemByData(configStore.getDefaultLanguage() || 'en');

		const layout = new OO.ui.FieldsetLayout({
			label: Messages.get('ajaxblock-config-label-languages-layout'),
			items: [
				new OO.ui.FieldLayout(this.ddUsedLanguages, {
					$element: $('<div>').addClass('ajaxblock-config-fields--constrained'),
					align: 'top',
					label: Messages.plain('ajaxblock-config-label-languages-used'),
					help: Messages.get('ajaxblock-config-help-languages-used'),
					helpInline: true,
				}),
				new OO.ui.FieldLayout(this.ddDefaultLanguage, {
					$element: $('<div>').addClass('ajaxblock-config-fields--constrained'),
					align: 'top',
					label: Messages.plain('ajaxblock-config-label-languages-default'),
					help: Messages.get('ajaxblock-config-help-languages-default'),
					helpInline: true,
				}),
			]
		});
		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 */
		this.$element = layout.$element;
	}

	/**
	 * @returns {AjaxBlockLanguageConfig}
	 */
	build() {
		return {
			used: /** @type {AjaxBlockLanguages[]} */ (this.ddUsedLanguages.getValue()),
			default: /** @type {AjaxBlockLanguages} */ (DropdownUtil.getSelectedOptionValueThrow(this.ddDefaultLanguage)),
		};
	}

	/**
	 * @param {AjaxBlockLegacyConfigLocal} [legacyLocalCfg]
	 * @param {AjaxBlockLegacyConfigGlobal} [legacyGlobalCfg]
	 * @returns {AjaxBlockLanguageConfig}
	 * Note: This method must not depend on any modules.
	 */
	static getMerged(legacyLocalCfg, legacyGlobalCfg) {
		/**
		 * @param {string} lang
		 * @returns {AjaxBlockLanguages}
		 */
		const typeGuard = (lang) => /** @type {AjaxBlockLanguages} */ (lang);

		for (const legacyCfg of [legacyLocalCfg, legacyGlobalCfg]) {
			if (!legacyCfg) {
				continue;
			}
			const lang = legacyCfg.lang || 'en';
			if (lang in Messages.i18n) {
				return { used: [typeGuard(lang)], default: typeGuard(lang) };
			}
		}

		return { used: [], default: null };
	}

}
/**
 * @type {AjaxBlockLanguages[]}
 */
AjaxBlockConfigLanguageOptions.supported = ['en', 'ja'];

class AjaxBlockConfigWarningOptions {

	/**
	 * @param {FullInitializer} initializer
	 */
	constructor(initializer) {
		const { configStore } = initializer;
		/**
		 * @type {Record<WarningKeys, Record<'cbOneClick' | 'cbDialog', OO.ui.CheckboxInputWidget>>}
		 * @readonly
		 * @private
		 */
		this.map = Object.create(null);
		/**
		 * @type {boolean}
		 * @private
		 */
		this.pauseEvents = false;
		/**
		 * @type {OO.ui.ButtonWidget}
		 * @readonly
		 * @private
		 */
		this.resetButton = new OO.ui.ButtonWidget({
			label: Messages.get('ajaxblock-config-label-reset'),
			flags: ['destructive'],
			disabled: OO.compare(
				AjaxBlockConfigWarningOptions.defaults.enabled,
				configStore.getWarningOptions()
			),
		});

		const $tbody = $('<tbody>');
		for (const [key, enabled] of typedEntries(configStore.getWarningOptions())) {
			const disabled = AjaxBlockConfigWarningOptions.defaults.disabled[key];

			const cbOneClick = new OO.ui.CheckboxInputWidget({
				selected: AjaxBlockConfigWarningOptions.verifyEnabled(key, 'oneclick', enabled.oneclick),
				disabled: disabled.oneclick,
			});
			const cbDialog = new OO.ui.CheckboxInputWidget({
				selected: AjaxBlockConfigWarningOptions.verifyEnabled(key, 'dialog', enabled.dialog),
				disabled: disabled.dialog,
			});

			this.map[key] = { cbOneClick, cbDialog };

			$tbody.append(
				$('<tr>').append(
					// Messages used here:
					// - ajaxblock-config-label-warning-block-noreason
					// - ajaxblock-config-label-warning-block-noexpiry
					// - ajaxblock-config-label-warning-block-hardblock
					// - ajaxblock-config-label-warning-block-hideuser
					// - ajaxblock-config-label-warning-block-reblock
					// - ajaxblock-config-label-warning-block-newblock
					// - ajaxblock-config-label-warning-block-self
					// - ajaxblock-config-label-warning-block-ignorepredefined
					// - ajaxblock-config-label-warning-unblock
					// - ajaxblock-config-label-warning-unblock-noreason
					// - ajaxblock-config-label-warning-unblock-self
					// - ajaxblock-config-label-warning-unblock-ignorepredefined
					$('<td>').text(Messages.get(`ajaxblock-config-label-warning-${key}`)),
					$('<td>').append(cbOneClick.$element),
					$('<td>').append(cbDialog.$element)
				)
			);
		}

		const table = new OO.ui.Widget({
			$element: $('<table>'),
			classes: ['ajaxblock-config-options-warnings'],
		});
		table.$element.append(
			$('<thead>').append(
				$('<tr>').append(
					$('<th>'),
					$('<th>').text(Messages.get('ajaxblock-config-label-warning-th-oneclick')),
					$('<th>').text(Messages.get('ajaxblock-config-label-warning-th-dialog'))
				)
			),
			$tbody
		);

		const layout = new OO.ui.FieldsetLayout({
			label: Messages.get('ajaxblock-config-label-warning-layout'),
			items: [
				new OO.ui.FieldLayout(table),
				new OO.ui.FieldLayout(this.resetButton)
			]
		});
		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 */
		this.$element = layout.$element;

		this.registerEvents();
	}

	/**
	 * @private
	 */
	registerEvents() {
		// Enable or disable the reset button when checkboxes change,
		// depending on whether the current settings differ from the defaults
		for (const { cbOneClick, cbDialog } of Object.values(this.map)) {
			for (const cb of [cbOneClick, cbDialog]) {
				cb.on('change', () => {
					if (this.pauseEvents) {
						return;
					}
					const differ = !$.isEmptyObject(this.build());
					this.resetButton.setDisabled(!differ);
				});
			}
		}

		// Reset settings to their default values when the reset button is clicked
		this.resetButton.on('click', () => {
			this.pauseEvents = true;

			const defaults = AjaxBlockConfigWarningOptions.defaults.enabled;
			for (const [key, { cbOneClick, cbDialog }] of typedEntries(this.map)) {
				const def = defaults[key];
				if (cbOneClick.isSelected() !== def.oneclick) {
					cbOneClick.setSelected(def.oneclick);
				}
				if (cbDialog.isSelected() !== def.dialog) {
					cbDialog.setSelected(def.dialog);
				}
			}

			this.pauseEvents = false;
			this.resetButton.setDisabled(true);
		});
	}

	build() {
		/** @type {import('ts-essentials').DeepPartial<AjaxBlockWarningConfig>} */
		const cfg = Object.create(null);
		const defaults = AjaxBlockConfigWarningOptions.defaults.enabled;

		for (const [key, { cbOneClick, cbDialog }] of typedEntries(this.map)) {
			for (const context of AjaxBlockConfigWarningOptions.contexts) {
				const cb = context === 'oneclick' ? cbOneClick : cbDialog;
				const checked = AjaxBlockConfigWarningOptions.verifyEnabled(key, context, cb.isSelected());
				if (checked !== defaults[key][context]) {
					OO.setProp(cfg, key, context, checked);
				}
			}
		}

		return cfg;
	}

	/**
	 * @param {WarningKeys} key
	 * @param {WarningContext} context
	 * @param {boolean} enabled
	 * @returns {boolean}
	 * @private
	 */
	static verifyEnabled(key, context, enabled) {
		const isCheckboxDisabled = this.defaults.disabled[key][context];
		return isCheckboxDisabled ? this.defaults.enabled[key][context] : enabled;
	}

	/**
	 * @param {AjaxBlockLegacyConfigLocal} [legacyCfg]
	 * @returns {AjaxBlockWarningConfig}
	 * Note: This method must not depend on any modules.
	 */
	static getMerged(legacyCfg) {
		return $.extend(
			true,
			{},
			AjaxBlockConfigWarningOptions.defaults.enabled,
			AjaxBlockConfigWarningOptions.mapLegacyConfig(legacyCfg && legacyCfg.warning)
		);
	}

	/**
	 * @param {AjaxBlockLegacyConfigLocal['warning']} [cfg]
	 * @returns {Partial<AjaxBlockWarningConfig> | undefined}
	 * @private
	 * Note: This method must not depend on any modules.
	 */
	static mapLegacyConfig(cfg) {
		if (!cfg) {
			return;
		}

		/** @type {Record<keyof AjaxBlockLegacyConfigWarning, WarningKeys[]>} */
		const map = {
			noReason: ['block-noreason', 'unblock-noreason'],
			noExpiry: ['block-noexpiry'],
			noPartialSpecs: [],
			willHardblock: ['block-hardblock'],
			willHideUser: ['block-hideuser'],
			willOverwrite: ['block-reblock'],
			willIgnorePredefined: ['block-ignorepredefined', 'unblock-ignorepredefined'],
			willBlockSelf: ['block-self', 'unblock-self'],
			willUnblock: ['unblock'],
		};

		const /** @type {Partial<AjaxBlockWarningConfig>} */ ret = Object.create(null);
		for (const [context, config] of typedEntries(cfg)) {
			for (const [legacyKey, enabled] of typedEntries(config)) {
				const keys = map[legacyKey];
				for (const key of keys) {
					setProp(ret, key, context, this.verifyEnabled(key, context, enabled));
				}
			}
		}
		return ret;
	}

}
/**
 * @type {WarningContext[]}
 */
AjaxBlockConfigWarningOptions.contexts = ['oneclick', 'dialog'];
/**
 * @type {Record<'enabled' | 'disabled', AjaxBlockWarningConfig>}
 */
AjaxBlockConfigWarningOptions.defaults = {
	enabled: {
		'block-noreason': {
			oneclick: true,
			dialog: true,
		},
		'block-noexpiry': {
			oneclick: true,
			dialog: true,
		},
		'block-hardblock': {
			oneclick: false,
			dialog: false,
		},
		'block-hideuser': {
			oneclick: true,
			dialog: true,
		},
		'block-reblock': {
			oneclick: true,
			dialog: false,
		},
		'block-newblock': {
			oneclick: false,
			dialog: true,
		},
		'block-self': {
			oneclick: true,
			dialog: true,
		},
		'block-ignorepredefined': {
			oneclick: true,
			dialog: false,
		},
		'unblock': {
			oneclick: true,
			dialog: false,
		},
		'unblock-noreason': {
			oneclick: true,
			dialog: true,
		},
		'unblock-self': {
			oneclick: true,
			dialog: true,
		},
		'unblock-ignorepredefined': {
			oneclick: true,
			dialog: false,
		},
	},
	disabled: {
		'block-noreason': {
			oneclick: false,
			dialog: false,
		},
		'block-noexpiry': {
			oneclick: false,
			dialog: false,
		},
		'block-hardblock': {
			oneclick: false,
			dialog: false,
		},
		'block-hideuser': {
			oneclick: true,
			dialog: true,
		},
		'block-reblock': {
			oneclick: false,
			dialog: false,
		},
		'block-newblock': {
			oneclick: true,
			dialog: false,
		},
		'block-self': {
			oneclick: false,
			dialog: false,
		},
		'block-ignorepredefined': {
			oneclick: false,
			dialog: false,
		},
		'unblock': {
			oneclick: false,
			dialog: false,
		},
		'unblock-noreason': {
			oneclick: false,
			dialog: false,
		},
		'unblock-self': {
			oneclick: false,
			dialog: false,
		},
		'unblock-ignorepredefined': {
			oneclick: false,
			dialog: false,
		},
	},
};

class AjaxBlockConfigDialogOptions {

	/**
	 * @param {FullInitializer} initializer
	 * @param {AjaxBlockConfigDomains} domain
	 * @param {OO.ui.TabPanelLayout} tabPanel
	 */
	constructor(initializer, domain, tabPanel) {
		/**
		 * @type {AjaxBlockConfigBlockPresetOptions}
		 * @readonly
		 */
		this.blockPresetOptions = new AjaxBlockConfigBlockPresetOptions(initializer, domain);
		/**
		 * @type {AjaxBlockConfigCustomReasonOptions}
		 * @readonly
		 */
		this.blockReasonOptions = new AjaxBlockConfigCustomReasonOptions(initializer, 'block', domain, tabPanel);
		/**
		 * @type {AjaxBlockConfigCustomReasonOptions}
		 * @readonly
		 */
		this.unblockReasonOptions = new AjaxBlockConfigCustomReasonOptions(initializer, 'unblock', domain, tabPanel);

		tabPanel.$element.append(
			this.blockPresetOptions.$element,
			this.blockReasonOptions.$element,
			this.unblockReasonOptions.$element
		);
	}

}

class AjaxBlockConfigBlockPresetOptions {

	/**
	 * @param {FullInitializer} initializer
	 * @param {AjaxBlockConfigDomains} domain
	 */
	constructor(initializer, domain) {
		/**
		 * @type {FullInitializer}
		 * @readonly
		 * @private
		 */
		this.initializer = initializer;
		/**
		 * @type {AjaxBlockConfigBlockPresetOptionsField[]}
		 * @private
		 */
		this.fields = [];
		/**
		 * @type {OO.ui.Widget}
		 * @readonly
		 * @private
		 */
		this.fieldContainer = new OO.ui.Widget({
			$element: $('<div>').addClass('ajaxblock-config-fields--constrained'),
		});

		for (const [key, params] of typedEntries(BlockPreset.default)) {
			this.addField({
				collapsed: true,
				presetName: key,
				targets: [key],
				lockPreset: true,
				params,
				domain,
			});
		}

		const layout = new OO.ui.FieldsetLayout({
			label: Messages.get('ajaxblock-config-label-presetreasons-layout'),
		});

		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 */
		this.$element = layout.$element;
		/**
		 * @type {OO.ui.ButtonWidget}
		 * @readonly
		 * @private
		 */
		this.addButton = new OO.ui.ButtonWidget({
			label: Messages.get('ajaxblock-config-label-presetreasons-add'),
			flags: ['progressive'],
		});

		layout.addItems([
			new OO.ui.FieldLayout(this.fieldContainer, {
				align: 'top',
				invisibleLabel: true,
			}),
			new OO.ui.FieldLayout(this.addButton, {
				$element: $('<div>').css({ marginTop: 0 }),
			}),
		]);

		this.registerEvents();
	}

	/**
	 * @private
	 */
	registerEvents() {
		this.fields.forEach((field) => {
			field.onPresetDelete(() => {
				const index = this.fields.indexOf(field);
				if (index === -1) {
					throw new Error('Field not found');
				}
				this.fields.splice(index, 1);
			});
		});

		this.addButton.on('click', () => this.addField());
	}

	/**
	 * @param {BlockPresetOptionsFieldOptions} [options]
	 * @private
	 */
	addField(options = {}) {
		const field = new AjaxBlockConfigBlockPresetOptionsField(this.initializer, options);
		this.fields.push(field);
		this.fieldContainer.$element.append(field.$container);
	}

	getFields() {
		return /** @type {readonly AjaxBlockConfigBlockPresetOptionsField[]} */ (this.fields);
	}

	/**
	 * @param {BlockPresetJson[]} [localCfg]
	 * @param {BlockPresetJson[]} [globalCfg]
	 * @param {AjaxBlockLegacyConfigLocal} [legacyCfg]
	 * @returns {Record<AjaxBlockConfigDomains | 'merged', Map<string, BlockPreset>>}
	 */
	static getMerged(localCfg, globalCfg, legacyCfg) {
		/** @type {ReturnType<typeof AjaxBlockConfigBlockPresetOptions.getMerged>} */
		const ret = {
			local: BlockPreset.getDefaultAsMap(),
			global: BlockPreset.getDefaultAsMap(),
			merged: BlockPreset.getDefaultAsMap(),
		};

		if (legacyCfg) {
			for (const [key, obj] of typedEntries(legacyCfg.preset.block)) {
				const block = Object.assign({}, obj, { hidden: !!obj.hidden });
				const params = ParamApplier.createBlockParamsFromApiResponse(block);
				const preset = key === 'user' ? 'named' : key;
				ret.local.set(preset, new BlockPreset(preset, [preset], params));
			}
		}

		for (const [domain, presetData] of typedEntries({ local: localCfg, global: globalCfg })) {
			if (!presetData) {
				continue;
			}
			for (const json of presetData) {
				ret[domain].set(json.name, new BlockPreset(json));
			}
		}

		// Merge: global -> local (local overrides)
		for (const [preset, instance] of ret.global) {
			ret.merged.set(preset, instance);
		}
		for (const [preset, instance] of ret.local) {
			ret.merged.set(preset, instance);
		}

		return ret;
	}

}

class AjaxBlockConfigBlockPresetOptionsField extends BlockField {

	/**
	 * @param {FullInitializer} initializer
	 * @param {BlockPresetOptionsFieldOptions} [options]
	 */
	constructor(initializer, options = {}) {
		super(initializer, { omitMainLabel: true });

		const {
			collapsed = false,
			presetName = '',
			targets = typedKeys(BlockPreset.default),
			lockPreset = false,
		} = options;

		/**
		 * @type {OO.ui.TextInputWidget}
		 * @readonly
		 * @private
		 */
		this.presetNameInput = new OO.ui.TextInputWidget({
			placeholder: Messages.get('ajaxblock-config-placeholder-presetreasons-name'),
			value: presetName,
			disabled: lockPreset,
		});
		/**
		 * @type {OO.ui.MenuTagMultiselectWidget}
		 * @readonly
		 * @private
		 */
		this.targetSelector = new OO.ui.MenuTagMultiselectWidget({
			inputPosition: 'inline',
			options: [
				{ data: 'named', label: Messages.get('ajaxblock-config-label-presetreasons-target-named') },
				{ data: 'temp', label: Messages.get('ajaxblock-config-label-presetreasons-target-temp') },
				{ data: 'ip', label: Messages.get('ajaxblock-config-label-presetreasons-target-ip') },
			],
			placeholder: Messages.get('ajaxblock-config-placeholder-presetreasons-target'),
			selected: targets,
			disabled: lockPreset,
		});

		const forcedBaseColor = { color: 'var(--color-base, #202122)' };
		this.mainFieldset.addItems([
			new OO.ui.FieldLayout(this.presetNameInput, {
				classes: ['ajaxblock-horizontalfield'],
				align: 'left',
				label: $('<b>').text(Messages.get('ajaxblock-config-label-presetreasons-name')).css(forcedBaseColor),
			}),
			new OO.ui.FieldLayout(this.targetSelector, {
				classes: ['ajaxblock-horizontalfield'],
				align: 'left',
				label: $('<b>').text(Messages.get('block-target')).css(forcedBaseColor),
			}),
		], 0);

		this.optionsFieldset.addItems([
			new OO.ui.MessageWidget({
				classes: ['ajaxblock-message-container'],
				label: Messages.get('ajaxblock-config-notice-presetreasons-additionaloptions'),
				type: 'notice',
			})
		], 0);

		/**
		 * @type {OO.ui.ButtonWidget}
		 * @readonly
		 * @private
		 */
		this.deleteButton = new OO.ui.ButtonWidget({
			label: Messages.get('ajaxblock-config-label-presetreasons-delete'),
			flags: ['destructive'],
		});
		/**
		 * @type {(() => void)[]}
		 * @readonly
		 * @private
		 */
		this.onPresetDeleteCallbacks = [];

		this.optionsFieldset.addItems([
			new OO.ui.FieldLayout(this.deleteButton, {
				$element: $('<div>').css({ marginTop: '0.8em' }),
			}),
		]);

		/**
		 * @type {CollapsibleFieldset}
		 * @readonly
		 * @private
		 */
		this.collapsibleFieldset = new CollapsibleFieldset(collapsed, presetName);
		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 */
		this.$container = this.collapsibleFieldset.$element;

		this.collapsibleFieldset.$content.append(
			this.$element
		);

		/**
		 * @type {JQuery.Promise<void>}
		 * @readonly
		 */
		this.paramApplierPromise = options.params
			? ParamApplier.applyBlockParams(options.params, this, {
				context: { preset: options.presetName, domain: options.domain },
			})
			: $.Deferred().resolve().promise();

		this.registerEvents();
	}

	/**
	 * @private
	 */
	registerEvents() {
		this.presetNameInput.on('change', (value) => {
			this.collapsibleFieldset.setPresetName(value);
		});

		this.targetSelector.on('change', (items) => {
			const targets = items.map(item => /** @type {NonNullable<BlockTargetType>} */ (item.getData()));
			this.initFieldAccessibility(targets);
		});
		this.initFieldAccessibility(this.getTargets());

		this.deleteButton.on('click', () => {
			this.onPresetDeleteCallbacks.forEach(cb => cb());
		});

		if (this.isLocked()) {
			this.deleteButton.toggle(false);
		}

		this.onPresetDelete(() => {
			this.$container.remove();
		});
	}

	/**
	 * @param {NonNullable<BlockTargetType>[]} targets
	 * @returns {this}
	 */
	initFieldAccessibility(targets) {
		const targetSet = new Set(targets);

		this.cbAutoblock.setDisabled(!(targetSet.has('named') || targetSet.has('temp')));
		if (this.cbAutoblock.isDisabled()) {
			this.cbAutoblock.setSelected(false);
		}

		this.cbHardblock.setDisabled(!targetSet.has('ip'));
		if (this.cbHardblock.isDisabled()) {
			this.cbHardblock.setSelected(false);
		}

		if (!targetSet.has('named')) {
			this.setHideUserAvailability(false);
			this.setHideUserLocked(true);
		} else {
			this.setHideUserLocked(false);
			this.setHideUserAvailability(!this.cbPartialBlock.isSelected() && this.getExpiry() === EXPIRY_INFINITE);
		}

		return this;
	}

	getFieldName() {
		const value = clean(this.presetNameInput.getValue());
		this.presetNameInput.setValue(value);
		return value;
	}

	isLocked() {
		return this.presetNameInput.isDisabled();
	}

	getTargets() {
		return /** @type {NonNullable<BlockTargetType>[]} */ (this.targetSelector.getValue());
	}

	/**
	 * @param {() => void} callback
	 * @returns {this}
	 */
	onPresetDelete(callback) {
		this.onPresetDeleteCallbacks.push(callback);
		return this;
	}

	/**
	 * @returns {BlockPresetJson}
	 */
	build() {
		return {
			name: this.getFieldName(),
			targets: this.getTargets(),
			params: {
				expiry: this.getExpiry(),
				reason: this.getReason(),
				hardblock: this.cbHardblock.isSelected(),
				nocreate: this.cbCreateAccount.isSelected(),
				autoblock: this.cbAutoblock.isSelected(),
				noemail: this.cbSendEmail.isSelected(),
				hidden: this.cbHideUser.isSelected(),
				nousertalk: this.cbUserTalk.isSelected(),
				partial: this.cbPartialBlock.isSelected(),
				pagerestrictions: this.getPageRestrictions(),
				namespacerestrictions: this.getNamespaceRestrictions(),
				actionrestrictions: this.getActionRestrictions(),
				watchuser: this.getWatchUser(),
				watchlistexpiry: this.getWatchlistExpiry(),
			},
		};
	}

}

/**
 * @see https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/refs/heads/master/includes/htmlform/CollapsibleFieldsetLayout.php
 */
class CollapsibleFieldset {

	constructor(collapsed = true, presetName = '') {
		presetName = BlockPreset.getDisplayName(presetName);

		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 */
		this.$element = $('<div>').addClass('ajaxblock-collapsiblefieldset-container');
		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 */
		this.$content = $('<div>').addClass('mw-collapsible-content').css({ marginTop: '0.5em' });
		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 * @private
		 */
		this.$presetName = $('<span>');
		/**
		 * @type {OO.ui.FieldsetLayout}
		 * @readonly
		 * @private
		 */
		this.fieldset = new OO.ui.FieldsetLayout({
			$content: this.$content,
			classes: ['mw-collapsibleFieldsetLayout', 'mw-collapsible'].concat(collapsed ? ['mw-collapsed'] : []),
			label: $('<span>').append(
				Messages.get('ajaxblock-config-label-presetreasons-name'),
				Messages.plain('word-separator'),
				Messages.plain('parentheses-start'),
				this.$presetName.text(presetName),
				Messages.plain('parentheses-end')
			),
			icon: collapsed ? 'expand' : 'collapse',
		});

		const wrapper = new OO.ui.PanelLayout({
			$element: this.$element,
			expanded: false,
			framed: true,
			padded: true,
		});
		wrapper.$element.append(this.fieldset.$element);

		const $legend = this.fieldset.$element.children('legend'); // header
		$legend
			.attr({ role: 'button' })
			.addClass('mw-collapsible-toggle')
			// Change the icon when the fieldset is expanded/collapsed
			.off('click')
			.on('click', () => {
				this.fieldset.setIcon(this.fieldset.$element.hasClass('mw-collapsed') ? 'collapse' : 'expand');
			});
		$legend.children('.oo-ui-labelElement-label')
			.css({ marginBottom: 0 });

		this.fieldset.$element.makeCollapsible();
	}

	/**
	 * @param {string} name
	 * @returns {this}
	 */
	setPresetName(name) {
		this.$presetName.text(name);
		return this;
	}

	/**
	 * @param {boolean} collapse
	 * @returns {this}
	 */
	setCollapsed(collapse) {
		const isCollapsed = this.fieldset.$element.hasClass('mw-collapsed');
		if (isCollapsed !== collapse) {
			this.fieldset.$element.trigger('click');
		}
		return this;
	}

}

class AjaxBlockConfigCustomReasonOptions {

	/**
	 * @param {Initializer} initializer
	 * @param {BlockActions} action
	 * @param {AjaxBlockConfigDomains} domain
	 * @param {OO.ui.TabPanelLayout} tabPanel
	 */
	constructor(initializer, action, domain, tabPanel) {
		const { configStore } = initializer;

		/**
		 * @type {OO.ui.MultilineTextInputWidget}
		 * @readonly
		 * @private
		 */
		this.input = new OO.ui.MultilineTextInputWidget({
			autosize: true,
			rows: 1,
			maxRows: 10,
			placeholder: Messages.get('ajaxblock-config-placeholder-customreasons'),
			value: configStore.getCustomReasons(action, domain).join('\n'),
		});

		const layout = new OO.ui.FieldsetLayout({
			// Messages used here:
			// - ajaxblock-config-label-customreasons-block-layout
			// - ajaxblock-config-label-customreasons-unblock-layout
			label: Messages.get(`ajaxblock-config-label-customreasons-${action}-layout`),
			items: [
				new OO.ui.FieldLayout(this.input, {
					align: 'top',
					invisibleLabel: true,
					// Messages used here:
					// - ajaxblock-config-help-customreasons-block
					// - ajaxblock-config-help-customreasons-unblock
					help: Messages.get(`ajaxblock-config-help-customreasons-${action}`),
					helpInline: true,
				})
			]
		});
		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 */
		this.$element = layout.$element;

		this.registerEvents(tabPanel);
	}

	/**
	 * @param {OO.ui.TabPanelLayout} tabPanel
	 * @private
	 */
	registerEvents(tabPanel) {
		// Work around OOUI autosize issue:
		// adjustSize() relies on layout measurements (innerHeight, scrollHeight, etc.),
		// which are incorrect while the widget is inside a hidden tab (`display: none`).
		// Recalculate after the tab becomes visible.
		tabPanel.once('active', () => {
			requestAnimationFrame(() => this.input.adjustSize(true));
		});
	}

	/**
	 * @param {boolean} [setValue] Whether to set the return value to the input (default: `true`)
	 * @returns
	 */
	build(setValue = true) {
		const valueSet = new Set(
			clean(this.input.getValue()).split('\n').map(v => v.trim()).filter(Boolean)
		);
		const values = [...valueSet];
		if (setValue) {
			this.input.setValue(values.join('\n'));
		}
		return values;
	}

	getTextInput() {
		return this.input;
	}

	/**
	 * @param {AjaxBlockLegacyConfigLocal} [legacyLocalCfg]
	 * @param {AjaxBlockLegacyConfigGlobal} [legacyGlobalCfg]
	 * @returns {Record<AjaxBlockConfigDomains, Record<BlockActions, string[]>>}
	 * Note: This method must not depend on any modules.
	 */
	static getMerged(legacyLocalCfg, legacyGlobalCfg) {
		/** @type {ReturnType<typeof AjaxBlockConfigCustomReasonOptions.getMerged>} */
		const ret = {
			local: {
				block: [],
				unblock: [],
			},
			global: {
				block: [],
				unblock: [],
			},
		};

		if (legacyLocalCfg && legacyLocalCfg.dropdown.local.length) {
			ret.local.block.push(...legacyLocalCfg.dropdown.local.filter(Boolean));
		}
		if (legacyGlobalCfg && legacyGlobalCfg.dropdown.length) {
			ret.global.block.push(...legacyGlobalCfg.dropdown.filter(Boolean));
		}

		if (legacyLocalCfg && legacyLocalCfg.preset.unblock.reason) {
			ret.local.unblock.push(legacyLocalCfg.preset.unblock.reason);
		}

		return ret;
	}

}

/**
 * Removes unicode bidirectional characters from the given string and trims it.
 * @param {string} str
 * @returns {string}
 */
function clean(str) {
	return str.replace(/[\u200E\u200F\u202A-\u202E]+/g, '').trim();
}

/**
 * @param {number} milliseconds Nagative values are rounded up to 0.
 * @returns {Promise<void>}
 */
function sleep(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
}

/**
 * Gets a `{ 'Promise-Non-Write-API-Action': '1' }` header for a non-write POST request.
 * @returns
 */
function nonwritePost() {
	return {
		headers: {
			'Promise-Non-Write-API-Action': '1'
		}
	};
}

/**
 * @param {ApiResponse} res
 * @param {JQuery.jqXHR<ApiResponse>} jqXHR
 * @returns {JQuery.Promise<any, any, any>} A rejected $.Deferred
 */
function failAsEmptyResult(res, jqXHR) {
	return $.Deferred().reject(
		'ok-but-empty',
		'OK response but empty result (check HTTP headers?)',
		res,
		jqXHR
	);
}

/**
 * @template T
 * @param {JQuery.Promise<T>} p
 * @returns {Promise<T>}
 */
function toNativePromise(p) {
	return new Promise((resolve, reject) => {
		p.then(resolve, (...args) => reject(args));
	});
}

/**
 * @param {unknown} e
 * @returns {[string, any]}
 */
function toErrorTuple(e) {
	return /** @type {[string, any]} */ (e);
}

/**
 * @param {number} days
 * @returns {number}
 */
function daysInSeconds(days) {
	return days * 24 * 60 * 60;
}

/**
 * Replicates PHP `(bool)$string`.
 *
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
function toPHPBool(value) {
	if (value === null || value === undefined) {
		return false;
	}
	return value !== '' && value !== '0';
}

/**
 * Checks whether a value is an object. Arrays and `null` are not considered objects.
 *
 * @param {unknown} value
 * @returns {value is Record<string | number | symbol, unknown>}
 */
function isObject(value) {
	return typeof value === 'object' && !Array.isArray(value) && value !== null;
}

/**
 * @param {unknown[]} arr
 * @returns {arr is number[]}
 * @todo Should this check all elements?
 */
function isNumberArray(arr) {
	return typeof arr[0] === 'number';
}

/**
 * @template T
 * @typedef {Array<
 *   Exclude<{ [K in keyof T]: [K, T[K]] }[keyof T], undefined>
 * >} Entries
 */
/**
 * @template {object} T
 * @param {T} obj
 * @returns {Entries<T>}
 */
function typedEntries(obj) {
	return /** @type {any} */ (Object.entries(obj));
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
 * Copy of `OO.setProp`.
 *
 * @link https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/34875dec1fdedbcf52e2d1a026c2f5562de2c4e4/resources/lib/oojs/oojs.js#215
 * @param {Record<string, any>} obj
 * @param {...any} keys The last element is used as the value.
 * @returns {void}
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setProp(obj, ...keys) {
	if ( Object( obj ) !== obj || arguments.length < 2 ) {
		return;
	}
	var prop = obj;
	for ( var i = 1; i < arguments.length - 2; i++ ) {
		if ( prop[ arguments[ i ] ] === undefined ) {
			prop[ arguments[ i ] ] = {};
		}
		if ( Object( prop[ arguments[ i ] ] ) !== prop[ arguments[ i ] ] ) {
			return;
		}
		prop = prop[ arguments[ i ] ];
	}
	prop[ arguments[ arguments.length - 2 ] ] = arguments[ arguments.length - 1 ];
}

class AjaxBlockLogo {

	constructor() {
		/**
		 * @type {HTMLElement}
		 * @readonly
		 * @private
		 */
		this.logo = document.createElement('span');
		Object.assign(this.logo.style, {
			position: 'fixed',
			bottom: '2em',
			right: '2em',
			height: '3em',
			display: 'inline-block',
			color: 'var(--color-base, #202122)',
		});
		this.logo.innerHTML = AjaxBlockLogo.svg;

		/**
		 * @type {number}
		 * @private
		 */
		this.inserted = 0;
	}

	/**
	 * Inserts the logo to the DOM.
	 *
	 * @returns {this}
	 */
	insert() {
		document.body.appendChild(this.logo);
		this.inserted = Date.now();
		return this;
	}

	setError() {
		if (!this.logo.isConnected) {
			this.insert();
		}
		this.inserted = Date.now();
		this.logo.style.color = 'var(--color-icon-error, #f54739)';
		return this;
	}

	/**
	 * Remove the logo, ensuring it has been shown for the given duration.
	 *
	 * @param {number} minimumDuration In milliseconds
	 * @returns {Promise<void>}
	 */
	async remove(minimumDuration) {
		await sleep(minimumDuration - (Date.now() - this.inserted));
		this.logo.remove();
	}

}
AjaxBlockLogo.svg =
`<svg
	style="height: 100%; width: auto;"
	version="1.1"
	viewBox="0 0 510 140"
	xmlns="http://www.w3.org/2000/svg"
	xmlns:svg="http://www.w3.org/2000/svg">

	<g>
		<path
		style="fill:currentColor;stroke=currentColor;stroke-width:1.33333"
		d="m 89.666665,124.65225 c -4.125273,-2.93829 -3.756857,-4.65225 1,-4.65225 5.459431,0 13.823605,-8.54291 18.731395,-19.13167 5.49993,-11.866335 14.98528,-50.63367 14.27011,-58.323041 -0.42536,-4.573494 0.0503,-6.886632 1.88125,-9.147712 C 126.89724,31.733093 128,28.637713 128,26.518955 c 0,-5.030778 3.57065,-5.152094 5.46334,-0.185622 1.84772,4.848428 0.83074,9.301691 -4.5915,20.105878 -6.52396,12.99942 -9.34403,25.43465 -8.45924,37.301333 0.56649,7.597689 0.15387,11.410905 -1.87561,17.333336 -2.88151,8.40879 -9.18518,18.39095 -13.7824,21.8251 -4.62502,3.4549 -11.566418,4.26152 -15.087925,1.75327 z M 80.544563,114.1626 c -0.387792,-1.01057 -0.167285,-3.86057 0.490013,-6.33333 1.051279,-3.95492 1.695616,-4.47305 5.354494,-4.30577 4.673605,0.21368 3.256582,4.34168 11.507669,-33.5235 1.757784,-8.066667 3.001501,-14.865279 2.763811,-15.108027 -0.23769,-0.242748 -1.730433,0.253454 -3.31721,1.102671 -3.913317,2.094344 -6.962423,0.701359 -6.436857,-2.94068 0.523236,-3.625895 11.914617,-12.531792 18.660087,-14.588652 7.35033,-2.241295 9.10278,-0.988801 9.0846,6.492841 -0.0199,8.179366 -9.64102,45.605771 -14.03317,54.589239 C 99.990004,109.01325 92.064299,116 85.954311,116 c -2.766904,0 -4.99508,-0.75679 -5.409748,-1.8374 z m 56.075807,-14.04751 c -1.49212,-0.632566 -3.51559,-2.117242 -4.49659,-3.299274 -1.58975,-1.915535 -1.2057,-2.149149 3.53315,-2.149149 3.22572,0 6.59795,-1.007768 8.57432,-2.562383 3.21335,-2.527623 3.27925,-2.527623 4.85777,0 2.22344,3.560288 13.93986,3.551071 19.78912,-0.01557 4.15824,-2.53552 4.24092,-2.535456 6.53999,0.0049 3.56464,3.938885 15.2456,3.594471 20.11389,-0.593061 l 3.68072,-3.166028 2.4904,3.166028 c 2.02536,2.574874 3.7296,3.166084 9.12651,3.166084 3.64985,0 8.47525,-0.951059 10.72309,-2.113464 2.93835,-1.519475 4.49362,-1.706842 5.53379,-0.666667 2.43339,2.433385 47.89581,1.907673 53.95629,-0.623933 C 286.73913,88.883121 292.56749,83.771115 296.16396,78 l 2.49273,-4 0.005,8.265479 c 0.005,7.787862 -0.24948,8.459568 -4.39872,11.624345 -8.0678,6.153616 -16.09001,6.761916 -60.92962,4.620123 -1.83334,-0.08757 -5.73334,0.499706 -8.66667,1.305061 -4.31261,1.184042 -6.52248,1.044532 -11.54671,-0.728951 -5.7971,-2.046301 -6.70004,-2.040154 -13.4779,0.09175 -6.8121,2.142663 -7.61222,2.145873 -12.84656,0.05151 -5.11576,-2.046922 -6.18836,-2.060983 -12.84144,-0.168346 -5.548,1.578269 -8.4278,1.742539 -12.21526,0.696766 -4.60048,-1.270254 -8.10353,-1.123382 -18.40546,0.771683 -2.2,0.4047 -5.22083,0.21825 -6.71296,-0.41432 z m 176.81825,-0.450803 c -4.90176,-2.527211 -4.72426,-4.548262 0.47352,-5.391747 2.57362,-0.41764 7.49434,-2.696144 10.93495,-5.063341 l 6.25564,-4.303998 3.22263,3.74652 3.22261,3.74652 -6.44065,3.664316 c -8.12604,4.623193 -13.54494,5.727823 -17.6687,3.60173 z m 37.72906,0.22079 c -2.29111,-0.664265 -4.91458,-2.110152 -5.82992,-3.213082 -1.45355,-1.751403 -0.50399,-2.009036 7.49898,-2.034611 10.666,-0.03408 17.60724,-2.700639 25.43228,-9.770093 l 5.23701,-4.731327 2.08998,4.610997 2.08997,4.610998 -5.33268,4.22356 c -8.28318,6.560411 -21.25573,9.182551 -31.18562,6.303558 z m 54.83231,0.540293 c -1.46666,-0.29964 -4.16666,-1.704589 -6,-3.122106 l -3.33333,-2.577301 8.66667,-0.03251 c 7.03476,-0.02639 10.11026,-0.79346 16.33333,-4.073757 7.02595,-3.70351 7.66667,-3.828346 7.66667,-1.493732 0,4.600353 3.37288,5.984081 12.36189,5.071473 6.44821,-0.654655 8.90091,-1.546481 10.97144,-3.989336 l 2.66667,-3.146196 3.67026,4.322832 3.67027,4.322832 -5.36391,2.146215 c -6.63092,2.653166 -14.46749,2.698626 -17.89813,0.103813 -3.38712,-2.561897 -6.52329,-2.417608 -15.41183,0.709067 -6.98858,2.458346 -12.12097,2.959806 -18,1.758706 z m 63.1928,-2.163929 -5.85946,-2.928108 6.17533,-0.710424 c 6.96047,-0.800748 18.37963,-7.219606 20.53509,-11.543045 1.08046,-2.167189 1.93855,-2.529104 3.68248,-1.553151 3.26092,1.824907 2.85824,8.144672 -0.72624,11.397739 -8.65821,7.857678 -15.63378,9.421428 -23.8072,5.336989 z M 20.296674,97.924395 c -5.158456,-3.613123 -3.290366,-4.591062 8.769992,-4.591062 7.348148,0 12.331313,-0.59798 13.333333,-1.6 2.235394,-2.235393 2.000236,-11.747769 -0.354749,-14.349998 -1.725885,-1.907082 -1.650125,-2.660887 0.647068,-6.438322 2.119377,-3.485036 3.454107,-4.278346 7.198233,-4.278346 3.524087,0 4.807463,0.664953 5.501048,2.850248 0.697331,2.197094 -0.04593,3.59418 -3.243482,6.096637 -3.391095,2.653929 -4.148118,4.205376 -4.148118,8.501177 0,2.890134 0.75,6.485724 1.666667,7.990202 1.442317,2.367201 1.242955,3.082682 -1.481045,5.315241 -4.142178,3.394878 -23.268265,3.740678 -27.888947,0.504223 z m 41.333333,0 c -1.629837,-1.141583 -2.963341,-2.641583 -2.963341,-3.333334 0,-0.712429 6.407034,-1.257728 14.777777,-1.257728 11.226071,0 14.64586,0.400568 14.228896,1.666667 -0.301884,0.916667 -2.001884,1.867472 -3.777777,2.112901 -1.775894,0.24543 -3.798896,0.99543 -4.495563,1.666667 C 77.31016,100.79313 64.871034,100.1945 61.630007,97.924395 Z M 126.67799,87.044893 c -2.38875,-3.036804 -2.71299,-4.705784 -2.00751,-10.333333 1.1605,-9.257272 4.15256,-19.355981 6.99279,-23.601812 1.30866,-1.956305 5.64391,-6.156305 9.63391,-9.333333 L 148.55172,38 160.984,37.913351 c 14.39378,-0.10032 16.16234,0.892009 13.76852,7.725462 C 173.50637,49.196085 168,72.617509 168,74.360757 c 0,0.267086 1.22878,0.09561 2.73065,-0.381065 3.00741,-0.954515 6.60268,1.316455 6.60268,4.170613 0,2.612695 -11.87005,10.962268 -17.01461,11.968338 C 154.63488,91.230172 152,88.943563 152,82.899477 v -4.774005 l -5,4.779621 c -9.24288,8.835495 -15.60838,10.132211 -20.32201,4.1398 z M 151.26261,63.89348 c 4.54452,-8.34978 6.30311,-14.259148 4.56337,-15.334359 -2.61029,-1.613246 -7.51824,0.816104 -8.93752,4.423919 -1.74044,4.424188 -5.55513,19.377149 -5.55513,21.775172 0,2.878257 6.05607,-3.748363 9.92928,-10.864732 z m 29.00405,25.173187 c -0.88,-0.88 -1.6,-3.619446 -1.6,-6.087655 0,-8.178941 4.20232,-12.221605 7.97675,-7.673696 2.2132,2.666741 5.62787,0.72788 9.36363,-5.316705 2.66061,-4.30497 2.77454,-5.284956 1.31952,-11.3502 -1.62542,-6.77548 -3.69186,-8.214687 -6.6599,-4.638411 -2.13929,2.577688 -4.55809,2.540668 -6.75244,-0.103347 -1.46613,-1.766585 -1.22542,-3.069394 1.50342,-8.137084 3.37768,-6.272665 6.75989,-8.426236 13.23352,-8.426236 4.6762,0 12.0155,5.884827 12.0155,9.634315 0,2.287681 1.0721,1.727776 6.60955,-3.451859 4.80692,-4.496308 7.69459,-6.182456 10.58797,-6.182456 5.1665,0 5.75694,1.189564 4.66736,9.403228 -0.99192,7.477398 -3.20336,9.40103 -7.62972,6.636723 -2.4393,-1.523375 -3.1619,-1.247556 -6.49004,2.477275 -4.13406,4.626825 -4.45312,6.823538 -2.25746,15.54324 l 1.48764,5.907985 3.69706,-2.183908 c 7.53811,-4.452869 10.94768,1.662111 4.32764,7.761521 -5.9262,5.460146 -10.0295,7.78727 -13.73092,7.78727 -4.08577,0 -8.6939,-4.47925 -9.99326,-9.713766 l -0.92188,-3.713765 -3.21483,4.380432 c -6.13816,8.36366 -13.49769,11.488515 -17.53911,7.447099 z m 124,0 c -2.74585,-2.745848 -1.79578,-11.564284 4.1688,-38.694483 l 5.76882,-26.239676 -3.43548,-0.399588 c -4.24543,-0.493795 -5.5004,-5.571407 -1.84971,-7.483935 4.1958,-2.198102 21.72876,-4.801132 23.10031,-3.429586 0.79456,0.794557 -1.19074,12.12097 -5.35564,30.554926 -7.64983,33.858236 -7.56278,33.209712 -4.17372,31.093212 3.21636,-2.008644 6.84329,-0.595825 6.84329,2.665698 0,4.209066 -14.00972,13.533432 -20.33379,13.533432 -1.72308,0 -3.85288,-0.72 -4.73288,-1.6 z m 38.9175,0.293241 c -5.69827,-2.302357 -8.51804,-7.782736 -8.51006,-16.53972 0.0107,-11.477793 2.0573,-17.560088 8.12438,-24.142092 14.11698,-15.315117 36.99401,-14.970245 41.19229,0.620976 1.53717,5.708609 -0.12934,17.780099 -3.40859,24.690644 -2.62081,5.522931 -10.7555,12.336119 -17.68276,14.810119 -5.54261,1.979493 -15.50201,2.262421 -19.71526,0.560073 z m 20.9502,-16.686449 c 4.80778,-10.868804 4.98528,-23.446859 0.35594,-25.223304 -5.61252,-2.153723 -11.29632,7.269545 -13.30413,22.057126 -0.70669,5.204863 -0.38989,6.622331 2.01833,9.030558 3.8305,3.830489 7.5161,1.852986 10.92986,-5.86438 z m -7.78744,-3.649576 c 0.82881,-8.030374 4.33042,-16.253354 6.38142,-14.985764 1.38552,0.856301 0.81839,4.405218 -2.28196,14.279532 -2.93213,9.338584 -5.02765,9.69959 -4.09946,0.706232 z m 38.72083,19.031942 c -5.73765,-3.498464 -7.46489,-10.003066 -5.64953,-21.275492 1.7018,-10.567204 3.83871,-14.754693 10.22063,-20.028436 8.4524,-6.98469 15.64674,-9.826486 23.07096,-9.113114 9.24982,0.888792 11.06529,2.767586 9.93812,10.284812 -1.24286,8.288769 -2.89244,10.990682 -6.40482,10.49065 -2.03793,-0.290125 -3.03436,-1.493801 -3.32553,-4.01722 -0.46123,-3.997074 -3.92785,-5.76851 -8.86417,-4.52957 -5.41368,1.358746 -10.75423,19.840341 -7.49368,25.932737 2.00197,3.740724 4.74688,3.615519 13.2116,-0.602628 5.6193,-2.80022 7.34081,-3.154364 8.92845,-1.83674 3.03184,2.516204 2.36801,4.864176 -2.40437,8.504249 -11.18918,8.534402 -23.41042,10.95721 -31.22766,6.190752 z m 38.72031,0.539334 c -0.44613,-1.162595 1.07181,-10.622114 3.3732,-21.021151 3.34711,-15.12416 8.17207,-40.560673 8.17207,-43.081995 C 445.33333,24.221405 443.8145,24 441.95815,24 c -3.96053,0 -5.79092,-3.458303 -3.14048,-5.933572 2.99378,-2.795923 22.32952,-6.78589 24.1351,-4.980321 1.42613,1.426132 0.70925,5.488737 -6.63139,37.58056 -0.6488,2.836432 0.46499,2.19909 7.47155,-4.275443 8.01853,-7.409661 13.74737,-9.974085 19.74058,-8.836565 5.48675,1.041393 2.98159,13.493166 -2.62508,13.047842 -5.60224,-0.444972 -8.26706,0.142922 -11.3302,2.49958 l -3.08842,2.376119 3.94769,9.927567 3.94769,9.927566 h 5.8074 c 4.91718,0 5.86974,0.437095 6.214,2.851406 0.316,2.216125 -1.30853,3.924222 -7.29162,7.666666 -8.15086,5.098396 -13.74234,6.075756 -16.40496,2.867496 -0.88907,-1.07127 -3.30683,-6.292278 -5.37279,-11.602241 l -3.75629,-9.654477 -1.34758,5.268909 c -0.74116,2.897899 -1.73544,7.177449 -2.2095,9.510111 -1.0818,5.323105 -2.60235,6.511165 -9.72426,7.597921 -4.51962,0.689665 -5.86841,0.431992 -6.51153,-1.243965 z M 11.206816,87.484428 C 10.114637,84.638257 12.900788,80.251561 16.113018,79.759784 18.157265,79.44682 23.923968,70.994917 37.782608,48 l 18.884058,-31.333333 5.847819,-0.418848 c 3.216298,-0.230368 6.397155,0.130493 7.06857,0.801904 0.671413,0.671413 2.967229,13.159896 5.101812,27.752181 5.513385,37.690229 4.818672,34.962055 9.026409,35.447171 3.04282,0.35081 3.622056,1.057269 3.622056,4.417592 v 4 H 70.666666 53.999999 v -4 c 0,-3.381463 0.572211,-4.065743 3.700411,-4.425152 3.635553,-0.417702 3.686249,-0.546232 2.892464,-7.333334 C 59.361446,62.379105 59.65553,62.666667 50.119058,62.666667 h -8.6313 L 36.78024,71 l -4.70752,8.333333 3.630306,0.679762 c 2.990581,0.559974 3.630307,1.382325 3.630307,4.666666 v 3.986906 L 25.64282,89.046908 c -11.011126,0.305823 -13.836414,2.8e-5 -14.436004,-1.56248 z M 57.200426,49 c -0.07309,-2.383333 -0.52404,-5.722731 -1.002092,-7.420884 -0.786016,-2.792116 -1.277032,-2.377475 -5.131521,4.333333 l -4.262336,7.420884 h 5.264428 c 5.077729,0 5.259714,-0.153678 5.131521,-4.333333 z M 231.14884,87.333333 c -1.13367,-2.954261 0.49664,-6.156941 3.53914,-6.952574 1.47099,-0.384672 2.96682,-1.977708 3.32407,-3.540082 0.92631,-4.050985 8.65461,-48.568213 8.65461,-49.853016 0,-0.588332 -1.84626,-1.766584 -4.10282,-2.618338 -3.1966,-1.206582 -4.0065,-2.228288 -3.66667,-4.62565 0.43124,-3.042288 0.66935,-3.081582 21.10283,-3.482589 12.06413,-0.236759 22.70702,0.189517 25.5684,1.024083 7.20964,2.102796 11.76493,8.16594 11.76493,15.659238 0,5.37651 -0.65,6.716256 -5.66667,11.679764 L 286,50.230795 l 3.61766,2.945428 c 7.50264,6.108506 6.53495,19.022038 -2.07028,27.627269 -7.34609,7.346095 -12.26672,8.51348 -35.92256,8.522405 -16.29345,0.0061 -19.8415,-0.339122 -20.47598,-1.992564 z m 40.99045,-10.792726 c 2.83323,-2.56403 4.52181,-9.725043 3.37275,-14.303256 C 274.622,58.691139 269.6737,56 264.0432,56 c -4.07464,0 -4.17971,0.217653 -6.11403,12.666667 -0.45577,2.933333 -1.10124,6.334534 -1.43436,7.558225 -1.15985,4.260624 11.01393,4.506299 15.64448,0.315715 z m -10.08796,-4.207274 c 0.25759,-1.283333 0.82348,-4.556034 1.25755,-7.272669 0.6269,-3.9236 1.25894,-4.776403 3.07349,-4.147019 3.37385,1.17024 5.54188,4.374562 4.65672,6.88262 -1.28321,3.635926 -4.63563,6.870402 -7.12092,6.870402 -1.51352,0 -2.17039,-0.821018 -1.86684,-2.333334 z m 7.57603,-27.059253 c 2.72837,-0.757744 5.87837,-2.687901 7,-4.28924 2.55702,-3.65068 2.64512,-10.822205 0.15828,-12.886101 -2.37754,-1.973175 -11.45178,-3.510016 -11.45388,-1.939862 -8.7e-4,0.645951 -0.83116,5.524456 -1.8451,10.841123 -2.02708,10.629111 -2.08038,10.557289 6.1407,8.27408 z m -1.60916,-6.940747 c 0.0417,-3.819057 1.74401,-7.666666 3.39194,-7.666666 3.00319,0 3.5857,2.632349 1.34071,6.058634 -2.29577,3.503792 -4.76251,4.341927 -4.73265,1.608032 z M 83.938571,75 C 83.904786,74.45 82.169028,62.6 80.081332,48.666667 77.993636,34.733333 76.535564,23.069048 76.841172,22.746032 c 0.30561,-0.323016 1.470011,0.327057 2.587562,1.444608 1.339357,1.339357 3.29316,10.514931 5.732349,26.920635 C 88.672782,74.730552 88.737542,76 86.43076,76 85.093842,76 83.972356,75.55 83.938571,75 Z M 410.36171,72.583941 c -0.8317,-0.831702 1.94299,-13.840897 3.48384,-16.334045 1.49215,-2.414355 3.48778,-1.887851 3.48778,0.920177 0,1.376875 0.8842,3.237227 1.96488,4.134118 1.73058,1.436252 1.72893,2.086996 -0.0139,5.457068 -2.37172,4.586405 -7.08393,7.66145 -8.92269,5.822682 z M 174.79466,66.333333 c 0.22098,-5.179385 3.53686,-16.72753 3.71362,-12.933333 0.228,4.894419 2.5775,6.6 9.09172,6.6 4.78241,0 5.73333,0.428383 5.73333,2.582839 0,2.215056 -0.67533,2.473249 -4.74265,1.813214 -4.06058,-0.658941 -4.84996,-0.35925 -5.48884,2.083827 -0.54483,2.083437 -1.78364,2.853453 -4.59068,2.853453 -3.13592,0 -3.82091,-0.552928 -3.7165,-3 z m 44.91347,-0.153012 c -0.93371,-4.884365 1.84557,-7.513654 7.94227,-7.513654 6.20981,0 7.75585,-1.433118 9.057,-8.395504 0.52032,-2.784195 1.20214,-4.80606 1.51517,-4.493036 0.31303,0.313024 -0.16628,4.56038 -1.06512,9.438569 -1.60603,8.716181 -1.73675,8.914767 -7.56535,11.493036 -7.65317,3.385361 -9.15094,3.305137 -9.88397,-0.529411 z m 79.05503,-2.883646 c -0.054,-3.756042 -1.00746,-8.003903 -2.16839,-9.66137 -1.92799,-2.752593 -1.83539,-3.268126 1.33333,-7.422529 2.7295,-3.578549 3.40523,-5.970199 3.40523,-12.052209 0,-7.174554 0.1452,-7.510011 2.66667,-6.160567 3.54376,1.896564 3.37596,5.212396 -1.28203,25.333333 -3.40687,14.71654 -3.8696,15.882327 -3.95481,9.963342 z m 176.58806,1.20716 c -3.42604,-8.199672 -2.33553,-9.837168 6.55117,-9.837168 4.62974,0 7.83042,-2.639308 9.38638,-7.740063 1.18373,-3.880564 3.65821,-3.135305 5.33386,1.606445 1.8297,5.177636 -1.36498,10.354784 -7.46653,12.09994 -5.58672,1.597902 -9.15611,4.273591 -9.15611,6.863604 0,3.509787 -2.64268,1.808499 -4.64877,-2.992758 z m -148.66458,1.829498 c 0.0315,-2.627512 10.49706,-47.96149 11.24476,-48.709178 1.60792,-1.60792 4.73526,3.08386 4.73526,7.104052 0,7.353644 -3.0094,18.372105 -6.18057,22.629272 -1.64868,2.21328 -3.7144,7.01328 -4.59048,10.666666 -0.87609,3.653387 -1.79216,7.392522 -2.03573,8.309188 C 329.6163,67.25 328.7982,68 328.04184,68 c -0.75635,0 -1.36619,-0.75 -1.3552,-1.666667 z m 102.18357,-0.04271 c -1.9651,-1.457638 -1.84866,-1.781802 1.1369,-3.165176 2.90175,-1.344543 3.32622,-1.226971 3.32622,0.921306 0,3.312504 -1.80146,4.218198 -4.46312,2.243866 z m 35.59721,-30.568635 c 0.44405,-1.680427 1.51601,-6.205321 2.38215,-10.055321 1.65792,-7.369568 4.01917,-8.938458 6.49376,-4.314648 2.5556,4.775174 0.2445,11.567746 -4.98572,14.653657 l -4.69756,2.771632 z m -355.5941,-4.82698 c -3.20377,-3.54012 -2.7851,-9.886749 0.87928,-13.32926 C 115.80646,11.878449 124,15.313741 124,23.539236 c 0,7.889195 -10.16887,12.834096 -15.12668,7.355776 z"
		/>
	</g>
</svg>`;

//**********************************************************************

/**
 * @typedef {import('./window/AjaxBlock').BlockPageNames} BlockPageNames
 * @typedef {import('./window/AjaxBlock').BlockActions} BlockActions
 * @typedef {import('./window/AjaxBlock').PrematureInitializer} PrematureInitializer
 * @typedef {import('./window/AjaxBlock').ApiResponse} ApiResponse
 * @typedef {import('./window/AjaxBlock').ApiResponseBlock} ApiResponseBlock
 * @typedef {import('./window/AjaxBlock').ApiResponseUnblock} ApiResponseUnblock
 * @typedef {import('./window/AjaxBlock').ApiResponseQueryListBlocks} ApiResponseQueryListBlocks
 * @typedef {import('./window/AjaxBlock').ApiResponseQueryListBlocksRestrictions} ApiResponseQueryListBlocksRestrictions
 * @typedef {import('./window/AjaxBlock').AjaxBlockMessages} AjaxBlockMessages
 * @typedef {import('./window/AjaxBlock').MediaWikiMessages} MediaWikiMessages
 * @typedef {import('./window/AjaxBlock').LoadedMessages} LoadedMessages
 * @typedef {import('./window/AjaxBlock').CachedMessage} CachedMessage
 * @typedef {import('./window/AjaxBlock').BlockTargetType} BlockTargetType
 * @typedef {import('./window/AjaxBlock').PartialBlockParams} PartialBlockParams
 * @typedef {import('./window/AjaxBlock').WatchUserParams} WatchUserParams
 * @typedef {import('./window/AjaxBlock').BaseParams} BaseParams
 * @typedef {import('./window/AjaxBlock').BlockParams} BlockParams
 * @typedef {import('./window/AjaxBlock').UnblockParams} UnblockParams
 * @typedef {import('./window/AjaxBlock').AbortCallback} AbortCallback
 * @typedef {import('./window/AjaxBlock').WarningContext} WarningContext
 * @typedef {import('./window/AjaxBlock').BlockLogGenerator} BlockLogGenerator
 * @typedef {import('./window/AjaxBlock').TargetHandler} TargetHandler
 * @typedef {import('./window/AjaxBlock').ParamApplierBlockParams} ParamApplierBlockParams
 * @typedef {import('./window/AjaxBlock').ParamApplierUnblockParams} ParamApplierUnblockParams
 * @typedef {import('./window/AjaxBlock').BlockParamApplierHandler} BlockParamApplierHandler
 * @typedef {import('./window/AjaxBlock').BlockParamApplierHookOptions} BlockParamApplierHookOptions
 * @typedef {import('./window/AjaxBlock').BlockParamApplierContextOptions} BlockParamApplierContextOptions
 * @typedef {import('./window/AjaxBlock').BlockParamApplierInvalidRestrictionMap} BlockParamApplierInvalidRestrictionMap
 * @typedef {import('./window/AjaxBlock').BlockPresetJson} BlockPresetJson
 * @typedef {import('./window/AjaxBlock').AjaxBlockLanguages} AjaxBlockLanguages
 * @typedef {import('./window/AjaxBlock').AjaxBlockConfigVersions} AjaxBlockConfigVersions
 * @typedef {import('./window/AjaxBlock').AjaxBlockConfigDomains} AjaxBlockConfigDomains
 * @typedef {import('./window/AjaxBlock').AjaxBlockLegacyConfigLocal} AjaxBlockLegacyConfigLocal
 * @typedef {import('./window/AjaxBlock').AjaxBlockLegacyConfigWatchOptions} AjaxBlockLegacyConfigWatchOptions
 * @typedef {import('./window/AjaxBlock').AjaxBlockLegacyConfigGlobal} AjaxBlockLegacyConfigGlobal
 * @typedef {import('./window/AjaxBlock').AjaxBlockLegacyConfigWarning} AjaxBlockLegacyConfigWarning
 * @typedef {import('./window/AjaxBlock').AjaxBlockLanguageConfig} AjaxBlockLanguageConfig
 * @typedef {import('./window/AjaxBlock').WarningKeys} WarningKeys
 * @typedef {import('./window/AjaxBlock').AjaxBlockWarningConfig} AjaxBlockWarningConfig
 * @typedef {import('./window/AjaxBlock').BlockPresetOptionsFieldOptions} BlockPresetOptionsFieldOptions
 * @typedef {import('./window/InvestigateHelper').ApiResponseQueryListLogevents} ApiResponseQueryListLogevents
 * @typedef {import('./window/InvestigateHelper').ApiResponseQueryListLogeventsParamsRestrictions} ApiResponseQueryListLogeventsParamsRestrictions
 * @typedef {import('./window/InvestigateHelper').BlockLogMap} BlockLogMap
 * @typedef {import('./window/InvestigateHelper').BlockLogMapValue} BlockLogMapValue
 * @typedef {import('./window/InvestigateHelper').BlockFlags} BlockFlags
 */
/**
 * @typedef {object} BlockLink
 * @prop {HTMLAnchorElement} anchor
 * @prop {ParamApplierBlockParams | ParamApplierUnblockParams | null} params
 * @prop {BlockTarget} target
 * @prop {BlockActions} type
 * @prop {boolean} locked Whether the link is permanently locked and excluded from future processing
 */
/**
 * The keys are usernames as strings or block IDs as numbers.
 * A number key always indicates it's mapped to autoblock-unblock links.
 *
 * @typedef {Map<string | number, BlockLink[]>} BlockLinkMap
 */

AjaxBlock.init();

//**********************************************************************
})();