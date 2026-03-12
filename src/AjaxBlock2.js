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

const version = '2.0.0';
const scriptName = 'AjaxBlock';

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

let /** @type {mw.Api} */ api;
const wgUserLanguage = mw.config.get('wgUserLanguage');
let wgEnableMultiBlocks = false;
const infinity = 'infinity';

class AjaxBlock {

	static async init() {
		// Load modules needed for getInitializer()
		await mw.loader.using(['mediawiki.api', 'mediawiki.storage', 'mediawiki.util']);

		api = new mw.Api({
			ajax: {
				headers: {
					'Api-User-Agent': 'AjaxBlock/2.0.0 (https://meta.wikimedia.org/wiki/User:Dragoniez/AjaxBlock.js)'
				}
			},
			parameters: {
				action: 'query',
				format: 'json',
				formatversion: '2'
			}
		});

		// Check user rights, special namespace aliases, and block/unblock special page aliases
		let initPromises;
		try {
			initPromises = await Promise.all([this.getInitializer(api), $.when($.ready)]);
		} catch (e) {
			// Visualize initialization failure using the logo
			await new AjaxBlockLogo().insert().setError().remove(800);
			return;
		}
		const [initializer] = initPromises;
		const permissionManager = new PermissionManager(initializer.userRights);
		if (!permissionManager.isAllowed('block')) {
			return;
		}

		// Parse block/unblock links
		const linkMaps = this.collectBlockLinks(initializer);
		if (linkMaps.every((map) => $.isEmptyObject(map))) {
			return;
		}

		// Extract block targets and block IDs
		const /** @type {Set<string>} */ users = new Set();
		const /** @type {Set<string>} */ ids = new Set();
		linkMaps.forEach((map) => {
			Object.keys(map).forEach((key) => {
				if (key.startsWith('#')) {
					ids.add(key.slice(1));
				} else {
					users.add(key);
				}
			});
		});

		// Show logo while loading
		const logo = new AjaxBlockLogo().insert();

		// Continue preparation:
		// - Check if multiblocks is enabled on this site
		// - Check the block statuses of the users/IDs extracted from block/unblock links
		// - Load modules used by AjaxBlockDialog
		// - Load missing interface messages
		let dataPromises;
		try {
			dataPromises = await Promise.all([
				this.fetchMultiBlockSettings(),
				BlockLookup.fetch(permissionManager, users, ids),
				mw.loader.using([
					'oojs-ui',
					'mediawiki.widgets.TitlesMultiselectWidget',
					'mediawiki.widgets.NamespacesMultiselectWidget'
				]),
				Messages.loadMessagesIfMissing(permissionManager, [
					'colon-separator',
					'parentheses-start',
					'parentheses-end',

					'block',
					'block-target',
					'autoblockid',
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
					'ipb-action-create',
					'ipb-action-move',
					'ipb-action-upload',
					'ipb-action-thanks',

					'block-details',
					'ipbcreateaccount',
					'ipbemailban',
					'ipb-disableusertalk',

					'block-options',
					'ipb-hardblock',
					'ipbhidename',
					'ipbwatchuser',
					'block-create',

					'unblock',
					'block-reason',
					'block-removal-reason-placeholder',

					// Used in setTarget()
					'apierror-modify-autoblock',

					// For BlockLog
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
					'block-log-flags-nousertalk', // "{{int:Blocklist-nousertalk}}"
					// 'blocklist-nousertalk', // Used by block-log-flags-nousertalk
					'parentheses',
					'comma-separator',
					'and',
					'word-separator',
					'blanknamespace',
					'ipb-action-create',
					'ipb-action-move',
					'ipb-action-thanks',
					'ipb-action-upload',
					'logentry-partialblock-block-page',
					'logentry-partialblock-block-ns',
					'logentry-partialblock-block-action',
				])
			]);
		} catch (e) {
			console.error(e);
			await logo.setError().remove(800);
			return;
		}
		const [multiBlocksEnabled, blockLookup] = dataPromises;
		wgEnableMultiBlocks = multiBlocksEnabled;

		// Update the title attributes of unprocessable (un)block links as messages are now ready
		/** @type {NodeListOf<HTMLAnchorElement>} */
		const unprocessableLinks = document.querySelectorAll(
			'.ajaxblock-blocklink-unprocessable, .ajaxblock-unblocklink-unprocessable'
		);
		const titleAttr = Messages.get('word-separator') + Messages.get('ajaxblock-title-unprocessable');
		for (const a of unprocessableLinks) {
			a.title += titleAttr;
		}

		// Create an AjaxBlock instance
		this.addStyleTag();
		new this(permissionManager, linkMaps, blockLookup);
		logo.remove(1200);
	}

	/**
	 * @param {mw.Api} api
	 * @returns {JQuery.Promise<Initializer>}
	 * @private
	 */
	static getInitializer(api) {
		const specialNamespaceAliases = [];
		for (const [alias, ns] of Object.entries(mw.config.get('wgNamespaceIds'))) {
			if (ns !== -1) {
				continue;
			}
			specialNamespaceAliases.push(alias);
		}

		/** @type {Initializer} */
		const data = {
			blockPageAliases: {
				'Block': ['Block', 'BlockIP', 'BlockUser'],
				'Unblock': ['Unblock'],
			},
			specialNamespaceAliases,
			userRights: new Set()
		};
		const params = Object.create(null);
		params.meta = [];

		/** @type {Initializer['blockPageAliases'] | false | null} */
		const cachedAliases = mw.storage.getObject(this.storageKeys.blockPageAliases);
		if (cachedAliases && $.isPlainObject(cachedAliases.Block) && $.isPlainObject(cachedAliases.Unblock)) {
			data.blockPageAliases = cachedAliases;
		} else {
			params.meta.push('siteinfo');
			params.siprop = 'specialpagealiases';
		}

		/** @type {string[] | false | null} */
		const cachedRights = mw.storage.getObject(this.storageKeys.userRights);
		if (Array.isArray(cachedRights) && cachedRights.every(el => typeof el === 'string')) {
			data.userRights = new Set(cachedRights);
		} else {
			params.meta.push('userinfo');
			params.uiprop = 'rights';
		}

		if (!params.meta.length) {
			return $.Deferred().resolve(data).promise();
		}

		return api.get(params).then(/** @param {ApiResponse} res */ ({ query }) => {
			if (!query) {
				return data;
			}

			if (Array.isArray(query.specialpagealiases)) {
				const targets = new Set(['Block', 'Unblock']);
				const map = Object.create(null);
				let processed = 0;
				for (const { realname, aliases } of query.specialpagealiases) {
					if (targets.has(realname)) {
						const lcRealName = realname.toLowerCase();
						map[realname] = aliases.filter(el => el.toLowerCase() !== lcRealName || el === realname);
						processed++;
					}
					if (processed === targets.size) {
						break;
					}
				}
				// Edge case guard: Incomplete data shouldn't be cached or set
				if ([...targets].every(realname => Array.isArray(map[realname]) && map[realname].length)) {
					mw.storage.setObject(this.storageKeys.blockPageAliases, map, 3 * 24 * 60 * 60); // 3 days
					data.blockPageAliases = map;
				}
			}

			const userRights = query.userinfo && query.userinfo.rights;
			if (Array.isArray(userRights)) {
				mw.storage.setObject(this.storageKeys.userRights, userRights, 24 * 60 * 60); // 1 day
				data.userRights = new Set(userRights);
			}

			return data;
		}).catch((_, err) => {
			console.warn(err);
			return data;
		});
	}

	/**
	 * @param {Initializer} init
	 * @return {[BlockLinkMap, UnblockLinkMap]}
	 * @private
	 */
	static collectBlockLinks(init) {
		const wgScript = mw.config.get('wgScript');
		/**
		 * @param {string[]} arr
		 * @returns {string}
		 */
		const toEscaped = (arr) => arr.map(mw.util.escapeRegExp).join('|');
		const regex = {
			/**
			 * * `$0` - `/wiki/<title>`
			 * * `$1` - `<title>`
			 */
			article: new RegExp(
				mw.util.escapeRegExp(mw.config.get('wgArticlePath')).replace('\\$1', '([^#?]+)')
			),
			/**
			 * * `$0` - `Special:<root>/<subpage>`
			 * * `$1` - `<root>`
			 * * `$2`? - `<subpage>`
			 */
			special: new RegExp('^(?:' + toEscaped(init.specialNamespaceAliases) + '):([^/]+)(?:/([^#]+))?', 'i'),
			/**
			 * * `$0` - `Block` (+aliases, case-insensitive)
			 */
			block: new RegExp('^(' + toEscaped(init.blockPageAliases.Block) + ')$', 'i'),
			/**
			 * * `$0` - `Unblock` (+aliases, case-insensitive)
			 */
			unblock: new RegExp('^(' + toEscaped(init.blockPageAliases.Unblock) + ')$', 'i'),
		};
		/** @type {BlockLinkMap} */
		const blockLinkMap = Object.create(null);
		/** @type {UnblockLinkMap} */
		const unblockLinkMap = Object.create(null);

		for (const a of /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll('#bodyContent a'))) {
			let href = a.href;
			if (
				!href ||
				a.role === 'button' ||
				a.host !== location.host
			) {
				continue;
			}

			// Get prefixed title from the href
			const mArticle = regex.article.exec(href);
			let prefixedTitle = '';
			if (mArticle) {
				prefixedTitle = decodeURIComponent(mArticle[1]);
			} else if (a.pathname === wgScript) {
				prefixedTitle = mw.util.getParamValue('title', href) || '';
			}
			if (!prefixedTitle) {
				continue;
			}

			// Regular expressions for page aliases use underscores
			prefixedTitle = prefixedTitle.replace(/ /g, '_');

			// Check whether this is a link to Special:Block or Special:Unblock
			const mSpecial = regex.special.exec(prefixedTitle);
			if (!mSpecial) {
				continue;
			}
			const rootPageName = mSpecial[1];
			let isUnblockLink;
			if (regex.block.test(rootPageName)) {
				isUnblockLink = false;
			} else if (regex.unblock.test(rootPageName)) {
				isUnblockLink = true;
			} else {
				continue;
			}

			// Extract query parameters
			// TODO: Filter this to effective params only
			const query = new URLSearchParams(a.search);
			if (query.get('remove') === '1') {
				isUnblockLink = true;
			}
			const linkType = isUnblockLink ? 'unblock' : 'block';
			const clss = `ajaxblock-${linkType}link`;
			a.classList.add(clss);

			// Extract target (subpage (i.e., username) is normalized in BlockTarget.validate())
			const subpage = mSpecial[2] ? decodeURIComponent(mSpecial[2]) : null;
			const [id, username] = BlockTarget.validate(subpage, query);
			if (!id && !username) {
				a.classList.add(clss + '-unprocessable');
				continue;
			}

			// Register the valid link
			// TODO: Do we need two separate maps for block and unblock links?
			const key = /** @type {string} */ (id ? `#${id}` : username); // Prioritize block ID
			const map = isUnblockLink ? unblockLinkMap : blockLinkMap;
			map[key] = map[key] || [];
			map[key].push({
				anchor: a,
				query,
				target: new BlockTarget(id, username),
				type: isUnblockLink ? 'unblock' : 'block',
			});
		}

		return [blockLinkMap, unblockLinkMap];
	}

	/**
	 * Retrieves the configuration value of `wgEnableMultiBlocks`.
	 *
	 * @returns {JQuery.Promise<boolean>}
	 * @private
	 * @todo Do we need to check this at all?
	 */
	static fetchMultiBlockSettings() {
		const cache = mw.storage.get(this.storageKeys.enableMultiblocks);
		if (typeof cache === 'string') {
			return $.Deferred().resolve(cache === '1').promise();
		}

		const m = /(?:^|\b)1\.(\d+)/.exec(mw.config.get('wgVersion'));
		const minor = m ? Number(m[1]) : 0;
		if (minor < 44) {
			// No multiblocks in MW < 1.44
			return $.Deferred().resolve(false).promise();
		}

		// XXX: There's no other way to retrieve the value of wgEnableMultiBlocks (see also T404508)
		return $.get(mw.util.getUrl('Special:Block', { usecodex: 1 })).then((html) => {
			if (typeof html !== 'string') {
				return false;
			}

			const doc = Document.parseHTMLUnsafe(html);
			for (const script of doc.querySelectorAll('script')) {
				const text = script.textContent || '';
				if (!text.includes('blockEnableMultiblocks')) {
					continue;
				}

				// We intentionally search only for the single config key instead of parsing
				// the full RLCONF object to reduce fragility if the bootstrap format changes.
				const match = text.match(/["']?blockEnableMultiblocks["']?\s*:\s*(true|false)\b/);
				if (!match) {
					continue;
				}

				const enabled = match[1] === 'true';
				mw.storage.set(
					this.storageKeys.enableMultiblocks,
					enabled ? '1' : '0',
					(enabled ? 7 : 3) * 24 * 60 * 60 // A 7-day expiry if enabled, 3 days otherwise
				);
				return enabled;
			}

			console.warn('blockEnableMultiblocks not found');
			return false;
		}).catch((jqXHR) => {
			console.error(jqXHR);
			return false;
		});
	}

	/**
	 * @private
	 */
	static addStyleTag() {
		const style = document.createElement('style');
		style.id = 'ajaxblock-styles';
		style.textContent = `
			.ajaxblock-blocklink-unprocessable,
			.ajaxblock-unblocklink-unprocessable {
				text-decoration-line: underline;
				text-decoration-style: dotted;
			}
			${/* Style the logo */''}
			.ajaxblock-logo {
				position: fixed;
				bottom: 2em;
				right: 2em;
				height: 3em;
				display: inline-block;
				color: var(--color-base, #202122);
			}
			.ajaxblock-logo svg {
				height: 100%;
				width: auto;
			}
			${/* Reduce padding for MessageWidget in the dialog */''}
			.ajaxblock-dialog .ajaxblock-dialog-message {
				padding: 8px 12px;
			}
			.ajaxblock-dialog .oo-ui-messageWidget.oo-ui-messageWidget-block > .oo-ui-iconElement-icon {
				background-position: 0 8px;
			}
			${/* Reduce vertical spacing between field items */''}
			.ajaxblock-dialog .oo-ui-fieldLayout:not(:first-child) {
				margin-top: 6px;
			}
			${/* Increase the default width (60%) of fields with a horizontally aligned label */''}
			.ajaxblock-dialog .ajaxblock-horizontalfield .oo-ui-fieldLayout-field {
				width: 80% !important;
			}
			${/* Vertically align the FieldLayout text field with its label */''}
			.ajaxblock-dialog .ajaxblock-targetlabel {
				display: block;
				padding-top: 4px;
			}
			${/* Halve the default top margin for fieldset:not(:first-child) */''}
			.ajaxblock-dialog .ajaxblock-dialog-content > fieldset:not(:first-child) {
				margin-top: 12px;
			}
			${/* Make non-primary legends less prominent */''}
			.ajaxblock-dialog .ajaxblock-dialog-content > fieldset:not(:first-child) > legend > .oo-ui-labelElement-label {
				font-weight: normal;
				font-style: italic;
				font-size: 1.1em;
			}
			${/* Override a top alignment for given radio options */''}
			.ajaxblock-dialog .ajaxblock-dialog-radiooption-middlealigned .oo-ui-radioInputWidget {
				vertical-align: middle;
			}
		`.replace(/[\t\n\r]+/g, '');
		document.head.appendChild(style);
	}

	/**
	 * @param {PermissionManager} permissionManager
	 * @param {[BlockLinkMap, UnblockLinkMap]} linkMaps
	 * @param {BlockLookup} blockLookup
	 * @private
	 */
	constructor(permissionManager, linkMaps, blockLookup) {
		this.permissionManager = permissionManager;
		this.linkMaps = linkMaps;
		this.blockLookup = blockLookup;

		// Add a click event to each link
		linkMaps.forEach((linkMap) => {
			Object.values(linkMap).forEach((arr) => {
				arr.forEach((obj) => {
					obj.anchor.addEventListener('click', (e) => this.handleClick(e, obj));
				});
			});
		});

		const AjaxBlockDialog = AjaxBlockDialogFactory();
		this.dialog = new AjaxBlockDialog(permissionManager, blockLookup, {
			$element: $('<div>').css({ 'font-size': '90%' }),
			classes: ['ajaxblock-dialog'],
			size: 'large',
		});
		AjaxBlockDialog.windowManager.addWindows([this.dialog]);
		console.log('AjaxBlock has been loaded');
	}

	/**
	 * @param {PointerEvent} e
	 * @param {BlockLink} obj
	 * @private
	 */
	handleClick(e, obj) {
		let callback;
		if (e.shiftKey && e.ctrlKey) {
			// One click execution with all warnings suppressed
			callback = () => this.execute(obj, true);
		} else if (e.shiftKey) {
			// One click execution with warnings
			callback = () => this.execute(obj, false);
		} else if (e.ctrlKey) {
			// Navigate to the linked page
			return;
		} else {
			// Open the dialog
			callback = () => this.dialog.open(obj);
		}

		e.preventDefault();
		e.stopPropagation();
		callback();
	}

	/**
	 * @param {BlockLink} link
	 * @param {boolean} suppressWarnings
	 * @private
	 */
	execute(link, suppressWarnings) {

	}

	/**
	 * Gets a `{ 'Promise-Non-Write-API-Action': '1' }` header for a non-write POST request.
	 * @returns
	 */
	static nonwritePost() {
		return {
			headers: {
				'Promise-Non-Write-API-Action': '1'
			}
		};
	}

}
AjaxBlock.storageKeys = {
	blockPageAliases: 'mw-AjaxBlock-blockPageAliases',
	userRights: 'mw-AjaxBlock-userRights',
	enableMultiblocks: 'mw-AjaxBlock-enableMultiblocks',
};

class PermissionManager {

	/**
	 * @param {Set<string>} permissions
	 */
	constructor(permissions) {
		/**
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

	getApiLimit() {
		return this.isAllowed('apihighlimits') ? 500 : 50;
	}

}

class BlockLookup {

	/**
	 * @param {PermissionManager} permissionManager
	 * @param {Set<string>} users
	 * @param {Set<string>} ids
	 * @returns {JQuery.Promise<BlockLookup>}
	 */
	static fetch(permissionManager, users, ids) {
		// TODO: `users` and `ids` should instead be `targets` as a single argument
		const apilimit = permissionManager.getApiLimit();
		const ajaxOptions = AjaxBlock.nonwritePost();
		/**
		 * @param {string[]} batch
		 * @param {'ids' | 'users'} batchParam
		 * @param {ApiResponseQueryListBlocks[]} [ret]
		 * @param {number} [offset]
		 * @returns {JQuery.Promise<ApiResponseQueryListBlocks[]>}
		 */
		const request = (batch, batchParam, /** @private */ ret = [], /** @private */ offset = 0) => {
			if (offset >= batch.length) {
				return $.Deferred().resolve(ret).promise();
			}

			return api.post({
				list: 'blocks',
				[`bk${batchParam}`]: batch.slice(offset, offset + apilimit).join('|'),
				bklimit: 'max',
				bkprop: 'id|user|by|timestamp|expiry|reason|flags|restrictions',
			}, ajaxOptions).then(/** @param {ApiResponse} res */ (res, jqXHR) => {
				if (res && res.query && Array.isArray(res.query.blocks)) {
					ret.push(...res.query.blocks);
				} else {
					return $.Deferred().reject(
						'ok-but-empty',
						'OK response but empty result',
						res,
						jqXHR
					).promise();
				}
				return request(batch, batchParam, ret, offset + apilimit);
			});
		};
		/**
		 * @param {Set<string>} batchSet
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

			return new this(data);
		});
	}

	/**
	 * @param {ApiResponseQueryListBlocks[]} data
	 */
	constructor(data) {
		/**
		 * @private
		 */
		this.data = data;
		/**
		 * @type {Map<number, number>}
		 * @private
		 */
		this.idMap = new Map();
		/**
		 * @type {Map<string, number[]>}
		 * @private
		 */
		this.usernameMap = new Map();

		data.forEach(({ id, user }, i) => {
			this.idMap.set(id, i);
			if (!user) {
				return;
			}
			if (!this.usernameMap.has(user)) {
				this.usernameMap.set(user, []);
			}
			/** @type {number[]} */ (this.usernameMap.get(user)).push(i);
		});
		console.log(this);
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
		return this.data.filter((_, i) => indexes.includes(i));
	}

	/**
	 * @param {Required<ApiResponseQueryListBlocks>[]} blocks The `user` property must be defined
	 * (i.e., no autoblock entries)
	 * @returns {BlockIdMapValue}
	 */
	static toIdMap(blocks) {
		/**
		 * @type {BlockIdMapValue['ids']}
		 */
		const ids = new Map();
		/**
		 * @type {number[]}
		 */
		const unixTimes = [];

		for (const obj of blocks) {
			unixTimes.push(Date.parse(obj.timestamp) / 1000);
			ids.set(obj.id, obj);
		}

		return { ids, earliestTimestamp: Math.min(...unixTimes) };
	}

}

class BlockTarget {

	/**
	 * @param {?string} subpage
	 * @param {URLSearchParams} query Underscores must be replaced with spaces
	 * @returns {[?number, ?string]} [id, username]
	 * @see SpecialBlock::getTargetInternal
	 */
	static validate(subpage, query) {
		const id = this.validateBlockId(query.get('id'));

		const possibleTargets = [
			query.get('wpTarget'),
			subpage,
			query.get('ip'),
			query.get('wpBlockAddress'), // B/C @since 1.18
		];
		/** @type {?string} */
		let target = null;
		for (const t of possibleTargets) {
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
	 * @param {?number} id
	 * @param {?string} username A value of null must indicate an autoblock
	 */
	constructor(id, username) {
		if (!id && !username) {
			throw new Error('id or username must be non-null');
		}
		/**
		 * @private
		 */
		this.id = id;
		/**
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
	 * Sets a block ID.
	 *
	 * @param {number} id
	 * @returns {this}
	 */
	setId(id) {
		const num = BlockTarget.validateBlockId(id);
		if (!num) {
			throw new Error('Invalid block ID: ' + id);
		}
		this.id = num;
		return this;
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
			t = 'anon';
		} else if (mw.util.isTemporaryUser(this.username)) {
			t = 'temp';
		} else {
			t = 'named';
		}
		this.type = t;
	}

	/**
	 * @param {string | number} id `'#ID` as a string or a block ID as a number.
	 * @returns {HTMLAnchorElement}
	 */
	static createBlockListLink(id) {
		const wpTarget = typeof id === 'string'
			? id
			: '#' + id;
		const anchor = document.createElement('a');
		anchor.href = mw.util.getUrl('Special:BlockList', { wpTarget });
		anchor.target = '_blank';
		anchor.textContent = wpTarget;
		return anchor;
	}

}
BlockTarget.regex = {
	invalidUsername: /[/@#<>[\]|{}:]|^(\d{1,3}\.){3}\d{1,3}$/,
	firstGeorgian: /^[\u10A0-\u10FF]/,
};

class Messages {

	/**
	 * Loads a set of messages via the MediaWiki API and adds them to `mw.messages`,
	 * but only if they are missing or depend on other missing `{{int:...}}` messages.
	 *
	 * Unlike `mw.Api.loadMessagesIfMissing`, this version supports API continuation
	 * using batches of 500 messages per request (instead of 50), improving performance.
	 *
	 * @param {PermissionManager} permissionManager
	 * @param {(keyof MediaWikiMessages)[]} messages List of message keys to ensure they are available.
	 * @returns {JQuery.Promise<boolean>} Resolves to `true` if any new messages were added; otherwise `false`.
	 */
	static loadMessagesIfMissing(permissionManager, messages) {
		const userLang = /** @type {keyof typeof Messages.i18n} */ (wgUserLanguage.replace(/-.*$/, ''));
		const i18n = Messages.i18n[userLang] || Messages.i18n.en;
		mw.messages.set(/** @type {any} */ (i18n));

		/**
		 * Messages that are missing and need to be fetched
		 * @type {Set<string>}
		 */
		const missingMessages = new Set();
		/**
		 * Message keys from the input that contain `{{int:...}}` and need re-parsing after dependencies are loaded
		 * @type {Set<string>}
		 */
		const containsInt = new Set();

		// Retrieve cached messages if there's any
		const storageKey = this.storageKey + '-' + userLang;
		/** @type {Record<string, string> | false | null} */
		const cached = mw.storage.getObject(storageKey);
		if (cached && Object.values(cached).every(val => typeof val === 'string')) {
			mw.messages.set(cached);
		}

		for (const key of messages) {
			/** @type {?string} */
			const msg = mw.messages.get(key);

			if (msg !== null) {
				// Parse `{{int:...}}` and track unresolved dependencies
				const unparsed = this.parseInt(msg, key);
				if (unparsed.size > 0) {
					containsInt.add(key);
					for (const dep of unparsed) {
						missingMessages.add(dep);
					}
				}
			} else {
				// Fully missing message
				missingMessages.add(key);
			}
		}

		if (!missingMessages.size) {
			return $.Deferred().resolve(false).promise();
		}

		const apilimit = permissionManager.getApiLimit();
		return (
		/**
		 * Recursively loads missing messages in batches of up to 500.
		 *
		 * @param {string[]} keys List of message keys to load.
		 * @param {number} index Starting index for the current batch.
		 * @returns {JQuery.Promise<boolean>}
		 */
		function execute(keys, index) {
			const batch = keys.slice(index, index + apilimit);
			let request, ajaxOptions;
			if (batch.length <= 50) {
				request = api.get.bind(api);
				ajaxOptions = {};
			} else {
				request = api.post.bind(api);
				ajaxOptions = AjaxBlock.nonwritePost();
			}

			return request({
				meta: 'allmessages',
				ammessages: batch,
				amlang: wgUserLanguage,
			}, ajaxOptions).then(/** @param {ApiResponse} res */ (res) => {
				const allmessages = res && res.query && res.query.allmessages || [];
				let added = false;
				/** @type {Set<string>} */
				const containsIntAndMissing = new Set();

				for (const { name, content, missing } of allmessages) {
					if (!missing && content) {
						// Add to mw.messages; track whether any new message was added
						added = mw.messages.set(name, content) || added;

						const unparsed = Messages.parseInt(content, name);
						if (unparsed.size > 0) {
							containsInt.add(name);
							for (const dep of unparsed) {
								if (!mw.messages.exists(dep)) {
									containsIntAndMissing.add(dep);
								}
							}
						}
					} else {
						console.warn('Message not found: ' + name);
					}
				}

				index += apilimit;

				// Recursively process messages that contain {{int:...}}
				if (containsIntAndMissing.size) {
					if (keys[index] === undefined) {
						let i = index;
						for (const key of containsIntAndMissing) {
							keys[i] = key;
							i++;
						}
					} else {
						keys.push(...containsIntAndMissing);
					}
					for (const el of containsIntAndMissing) {
						missingMessages.add(el);
					}
				}

				if (keys[index] !== undefined) {
					// More messages to load
					return execute(keys, index);
				}

				// Re-parse original messages that contained unresolved `{{int:...}}`
				for (const key of containsInt) {
					const msg = mw.messages.get(key);
					if (msg !== null) {
						Messages.parseInt(msg, key);
					}
				}

				// Save cache
				const newCache = Object.create(null);
				for (const key of missingMessages) {
					/** @type {?string} */
					const value = mw.messages.get(key);
					if (value !== null) {
						newCache[key] = value;
					}
				}
				if (!$.isEmptyObject(newCache)) {
					mw.storage.setObject(storageKey, newCache, 24 * 60 * 60); // 1-day expiry
				}

				return added;
			});
		})(Array.from(missingMessages), 0);
	}

	/**
	 * Parses a message string and replaces any `{{int:messageKey}}` magic words with
	 * resolved messages from `mw.messages`, if available. If not available, the message
	 * key is returned so it can be loaded later.
	 *
	 * If any substitutions are made, the parsed version is stored in `mw.messages`
	 * under the original key.
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
			const replacement = mw.messages.get(parsedKey);
			if (replacement !== null) {
				return replacement;
			} else {
				missingKeys.add(parsedKey);
				return match;
			}
		});

		// Update the message only if it was modified
		if (msg !== original) {
			mw.messages.set(key, msg);
		}

		return missingKeys;
	}

	/**
	 * Gets an interface message.
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
	 */
	static get(key, params = [], options = {}) {
		const { method = 'text', restoreTags = false } = options;
		let ret = mw.message(key, ...params)[method]();
		const unparsable = Array.from(ret.match(/⧼[^⧽]+⧽/g) || []);
		if (unparsable.length) {
			throw new Error('Encountered unparsable message(s): ' + unparsable.join(', '));
		}
		if (/<a[\s>]/.test(ret)) {
			// Set `target="_blank"` on all anchors if `ret` contains any links
			const $html = $('<div>').html(ret);
			$html.find('a').each((_, a) => {
				if (a.role !== 'button' && a.href && !a.href.startsWith('#')) {
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

	// /**
	//  * *[This method is currently not used in any logic.]*
	//  *
	//  * Parses and caches MediaWiki interface messages using the parse API. Cached values are reused via `mw.storage`.
	//  *
	//  * @param {(keyof LoadedMessages)[]} keys List of message keys to parse.
	//  * @returns {JQuery.Promise<void>} A promise that resolves when parsing and caching are complete.
	//  */
	// static parse(keys) {
	// 	// FIXME: The storage key may need to be changed if we use this method again
	// 	/**
	// 	 * @type {Partial<LoadedMessages>}
	// 	 */
	// 	const cache = mw.storage.getObject(this.storageKey) || {};

	// 	const $messages = $('<div>');
	// 	let setCount = 0;

	// 	// Retrieve all from the storage or re-parse all via the API
	// 	// This non-partial approach makes it possible to manage the cache as one object
	// 	for (const key of keys) {
	// 		if (cache[key]) {
	// 			mw.messages.set(key, cache[key]);
	// 			setCount++;
	// 		}
	// 		$messages.append(
	// 			$('<div>').prop('id', key).text(this.get(key))
	// 		);
	// 	}
	// 	if (keys.length === setCount) {
	// 		return $.Deferred().resolve().promise();
	// 	}

	// 	return api.post({
	// 		action: 'parse',
	// 		formatversion: '2',
	// 		text: $messages.html(),
	// 		prop: 'text',
	// 		disablelimitreport: true,
	// 		disableeditsection: true,
	// 		disabletoc: true,
	// 		contentmodel: 'wikitext'
	// 	}, AjaxBlock.nonwritePost()).then((res) => {
	// 		const $res = $(res.parse.text);
	// 		const toCache = Object.create(null);

	// 		for (const key of keys) {
	// 			const $key = $res.find(`#${key}`);
	// 			if ($key.length) {
	// 				const parsed = $key.html();
	// 				mw.messages.set(key, parsed);
	// 				toCache[key] = parsed;
	// 			}
	// 		}

	// 		if (!$.isEmptyObject(toCache)) {
	// 			mw.storage.set(this.storageKey, JSON.stringify(toCache), 3 * 24 * 60 * 60); // 3-day expiry
	// 		}
	// 	});
	// }

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
	 * @returns {string} An `<a>` tag as raw HTML.
	 */
	static wikilink(title, display) {
		const anchor = document.createElement('a');
		anchor.href = mw.util.getUrl(title, { noredirect: 1 });
		anchor.target = '_blank';
		anchor.textContent = display || title;
		return anchor.outerHTML;
	}

	/**
	 * Parse labels and values out of a comma- and colon-separated list of options, such as is
	 * used for expiry and duration lists.
	 *
	 * This method is adapted from `XmlSelect::parseOptionsMessage`.
	 * @param {'ipboptions'} msgKey The key of the message to parse as a list.
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
				value = infinity;
			}
			ret.set(label, value);
		});

		this.cache[msgKey] = ret;
		return ret;
	}

	/**
	 * Parses the `ipboptions` message to an array of `OO.ui.MenuOptionWidget` instances.
	 *
	 * @returns {OO.ui.MenuOptionWidget[]}
	 */
	static getBlockDurations() {
		const map = this.parseOptionsMessage('ipboptions');
		/** @type {OO.ui.MenuOptionWidget[]} */
		const options = [
			new OO.ui.MenuOptionWidget({
				label: this.get('ipbother').replace(/[:：]$/, ''),
				data: ''
			})
		];
		let indefFound = false;
		for (const [label, value] of map) {
			indefFound = indefFound || value === infinity;
			options.push(
				new OO.ui.MenuOptionWidget({ label, data: value })
			);
		}
		if (!indefFound) {
			// Ensure the presence of an "indefinite" option
			options.push(
				new OO.ui.MenuOptionWidget({ label: Messages.get('infiniteblock'), data: infinity })
			);
		}
		return options;
	}

	// /**
	//  * Translates an expiry value to its localized label if available.
	//  *
	//  * @param {string} expiry
	//  * @returns {string} The localized label for the input expiry value, or the input expiry value
	//  * as-is if no translation is available.
	//  */
	// static translateBlockExpiry(expiry) {
	// 	const map = this.parseOptionsMessage(this.get('ipboptions'));
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
			const and = Messages.get('and');
			const space = Messages.get('word-separator');
			let comma = '';
			if (itemCount > 2) {
				comma = Messages.get('comma-separator');
			}
			text = list.join(comma) + and + space + text;
		}
		return text;
	}

}
/**
 * @type {Record<'en' | 'ja', AjaxBlockMessages>}
 */
Messages.i18n = {
	en: {
		'ajaxblock-title-unprocessable': '(link cannot be processed by AjaxBlock)',
		'ajaxblock-dialog-button-label-block': 'Block',
		'ajaxblock-dialog-button-label-unblock': 'Unblock',
		'ajaxblock-dialog-button-label-docs': 'Docs',
		'ajaxblock-dialog-button-label-config': 'Config',
		'ajaxblock-dialog-block-label-reason1': 'Reason 1',
		'ajaxblock-dialog-block-label-reason2': 'Reason 2',
		'ajaxblock-dialog-block-label-partial': 'Partial block',
		'ajaxblock-dialog-block-label-option-autoblock': 'Apply autoblock',
		'ajaxblock-dialog-message-nonactive-id': 'The block ID <b>#$1</b> specified by this link is no longer active and hence disregarded.',
		'ajaxblock-dialog-message-existingblocks': '<b>This user has active block(s).</b> Select a block you want to update, or check "{{int:block-create}}" to add a new block.',
		'ajaxblock-notify-error-loadblocklogs': 'Failed to load block information ($1)',
		'ajaxblock-notify-error-idinactivenousername': 'This link cannot be processed because the block for ID <b>#$1</b> is no longer active and also no username is specified.',
	},
	ja: {
		'ajaxblock-title-unprocessable': '(AjaxBlock非対応のリンク)',
		'ajaxblock-dialog-button-label-block': 'ブロック',
		'ajaxblock-dialog-button-label-unblock': 'ブロック解除',
		'ajaxblock-dialog-button-label-docs': '解説',
		'ajaxblock-dialog-button-label-config': '設定',
		'ajaxblock-dialog-block-label-reason1': '理由1',
		'ajaxblock-dialog-block-label-reason2': '理由2',
		'ajaxblock-dialog-block-label-partial': '部分ブロック',
		'ajaxblock-dialog-block-label-option-autoblock': '自動ブロックを適用',
		'ajaxblock-dialog-message-nonactive-id': 'このリンクにより指定されているID <b>#$1</b> のブロックは、既に解除されているため無視されています。',
		'ajaxblock-dialog-message-existingblocks': '<b>この利用者は既にブロックされています。</b>更新するブロックを選択するか、「{{int:block-create}}」をチェックしてください。',
		'ajaxblock-notify-error-loadblocklogs': 'ブロック情報の取得に失敗しました ($1)',
		'ajaxblock-notify-error-idinactivenousername': 'このリンクに紐付けられたID <b>#$1</b> のブロックは、既に解除されているかつ利用者名も指定されていないため処理できません。',
	}
};
/**
 * Key for `mw.storage` to cache some messages.
 */
Messages.storageKey = 'mw-AjaxBlock-messages';
/**
 * @type {CachedMessage}
 */
Messages.cache = Object.create(null);

// class AjaxBlockConfig {

// }

class DropdownUtil {

	/**
	 * @param {OO.ui.DropdownWidget} dropdown
	 * @private
	 */
	static assertOneOptionIsSelected(dropdown) {
		const selected = dropdown.getMenu().findSelectedItems();
		if (selected === null) {
			throw new Error('All options were deselected');
		} else if (Array.isArray(selected)) {
			throw new Error('Multiple options are selected');
		}
	}

	/**
	 * @param {OO.ui.DropdownWidget} dropdown
	 */
	static selectInfinity(dropdown) {
		dropdown.getMenu().selectItemByData(infinity);
		this.assertOneOptionIsSelected(dropdown);
	}

	/**
	 * @param {OO.ui.DropdownWidget} dropdown
	 */
	static selectOther(dropdown) {
		dropdown.getMenu().selectItemByData('');
		this.assertOneOptionIsSelected(dropdown);
	}

	/**
	 * @param {OO.ui.DropdownWidget} dropdown
	 * @returns {string}
	 */
	static getSelectedOptionValue(dropdown) {
		const selected = dropdown.getMenu().findFirstSelectedItem();
		if (selected === null) {
			throw new Error('No option is selected');
		}
		const value = selected.getData();
		if (typeof value !== 'string') {
			throw new TypeError('The selected dropdown option has data of type ' + typeof value);
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
		 * @param {PermissionManager} permissionManager
		 * @param {BlockLookup} blockLookup
		 * @param {OO.ui.ProcessDialog.ConfigOptions} [config]
		 */
		constructor(permissionManager, blockLookup, config) {
			super(config);

			this.permissionManager = permissionManager;
			this.blockLookup = blockLookup;

			this.blockUser = new BlockUser(this);
			this.unblockUser = new UnblockUser(this);
			/**
			 * The currently active field, and a callback registered in {@link getSetupProcess} and
			 * executed in {@link getReadyProcess}.
			 *
			 * @type {?{ field: BlockUser | UnblockUser; callback: () => ReturnType<typeof BlockLog['new']>; }}
			 * @private
			 */
			this.readyProcessStore = null;

			this.content = new OO.ui.PanelLayout({
				padded: true,
				expanded: false
			});
			this.content.$element.append(
				this.blockUser.$element,
				this.unblockUser.$element
			);
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

			return this;
		}

		/**
		 * @inheritdoc
		 * @override
		 * @param {BlockLink} data
		 */
		getSetupProcess(data) {
			return super.getSetupProcess().next(() => {
				// Set mode to determine which buttons to show
				this.getActions().setMode(data.type);

				// Set up the visibility of dialog items
				this.blockUser.toggle(data.type === 'block');
				this.unblockUser.toggle(data.type === 'unblock');

				// Set target and check if any additional processes should be handled
				// to open the dialog
				const field = data.type === 'block' ? this.blockUser : this.unblockUser;
				field.blockSelector = null;
				const genBlockLogs = field.setTarget(data.target);

				if (Array.isArray(genBlockLogs)) {
					// There's a blocker to open the dialog
					const args = genBlockLogs;
					mw.notify(
						$('<span>').append(Messages.get(...args)),
						{ type: 'error' }
					);
					return false;
				} else if (genBlockLogs) {
					// Block log lines should be generated asynchronously
					this.readyProcessStore = {
						field,
						callback: genBlockLogs,
					};
					this.pushPending();
					this.content.toggle(false);
				}
			});
		}

		/**
		 * @inheritdoc
		 * @override
		 * @param {BlockLink} _data
		 */
		getReadyProcess(_data) {
			// @ts-expect-error
			return super.getReadyProcess().next(async () => {
				if (this.readyProcessStore) {
					const start = Date.now();
					const { field, callback } = this.readyProcessStore;
					await this.getReadyProcessInternal(field, callback);
					const end = Date.now();

					// Prevent the pending animation from showing for a too short time
					await sleep(1000 - (end - start));

					this.content.toggle(true);
					this.updateSize().popPending();
					this.readyProcessStore = null;
				}
			});
		}

		/**
		 * @param {BlockUser | UnblockUser} field
		 * @param {() => Promise<string | BlockLoglineMap>} genBlockLogs
		 * @returns {Promise<void>}
		 * @private
		 */
		async getReadyProcessInternal(field, genBlockLogs) {
			const blockLoglineMap = await genBlockLogs();
			if (typeof blockLoglineMap === 'string') {
				const err =
					scriptName + Messages.get('colon-separator') +
					Messages.get('ajaxblock-notify-error-loadblocklogs', [blockLoglineMap]);
				mw.notify(err, { type: 'error' });
				throw new Error(err);
			}

			/** @type {OO.ui.RadioOptionWidget[]} */
			const options = [];
			for (const [id, logline] of blockLoglineMap) {
				options.push(
					new OO.ui.RadioOptionWidget({
						classes: ['ajaxblock-dialog-radiooption-middlealigned'],
						data: id,
						label: new OO.ui.HtmlSnippet(logline),
					})
				);
			}
			field.blockSelector = new OO.ui.RadioSelectWidget({
				items: options,
			});

			const selectorId = 'ajaxblock-blockselector';
			field.addMessage({
				label: $('<span>').prop('id', selectorId),
				type: 'warning',
			});
			$(`#${selectorId}`).append(
				$('<span>')
					.append(Messages.get('ajaxblock-dialog-message-existingblocks'))
					.css({
						'display': 'inline-block',
						'margin-bottom': '0.5em',
					}),
				document.createElement('br'),
				field.blockSelector.$element
			);
		}

		/**
		 * @inheritdoc
		 * @override
		 * @param {string} [action]
		 */
		getActionProcess(action) {
			return new OO.ui.Process(() => {
				switch (action) {
					case 'execute': {
						if (this.readyProcessStore) {
							// No-op if the dialog is still getting ready
							return;
						}
						break;
					}
					case 'documentation':
						window.open('https://meta.wikimedia.org/wiki/Special:MyLanguage/User:Dragoniez/AjaxBlock', '_blank');
						break;
					case 'config':
						window.open(mw.util.getUrl('Special:AjaxBlockConfig'), '_blank');
						break;
					default: this.close();
				}
			});
		}

	}

	AjaxBlockDialog.static.name = scriptName;
	AjaxBlockDialog.static.title = $('<label>').append(
		`${scriptName} (`,
		$('<a>')
			.prop({
				target: '_blank',
				href: 'https://meta.wikimedia.org/w/index.php?title=User:Dragoniez/AjaxBlock.js&action=history'
			})
			.text(`v${version}`),
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

/**
 * @requires oojs-ui
 */
class AjaxBlockDialogContent {

	constructor() {
		this.$element = $('<div>').addClass('ajaxblock-dialog-content');

		this.messageContainer = new OO.ui.Element({
			$element: $('<div>')
		});
		/**
		 * @type {?boolean} `false` means unprocessable, `null` means the dialog should be opened.
		 * @protected
		 */
		this.oneClickAllowed = null;
		/**
		 * @type {?OO.ui.RadioSelectWidget}
		 */
		this.blockSelector = null;

		const $targetContainer = $('<span>').addClass('ajaxblock-targetlabel');
		this.$target = $('<b>');
		this.$targetAux = $('<span>');
		$targetContainer.append(
			this.$target,
			Messages.get('word-separator'),
			this.$targetAux
		);
		this.target = new OO.ui.LabelWidget({
			label: $targetContainer
		});
		/**
		 * @type {Target}
		 * @readonly
		 * @protected
		 */
		this.currentTarget = {
			id: null,
			username: null,
		};

		this.watchUser = new OO.ui.CheckboxInputWidget();

		this.watchlistExpiry = new OO.ui.DropdownWidget({
			menu: {
				items: Messages.getBlockDurations().filter((option) => {
					// Filter out expiries that are too short or too long
					const expiry = /** @type {string} */ (option.getData());
					return /^(\d+\s*weeks?|\d+\s*months?|1\s*year|infinity)$/.test(expiry);
				})
			}
		});
		DropdownUtil.selectInfinity(this.watchlistExpiry);
	}

	/**
	 * @param {boolean} show
	 * @return {this}
	 */
	toggle(show) {
		this.$element.toggle(show);
		return this;
	}

	/**
	 * @param {OO.ui.MessageWidget.ConfigOptions} [config]
	 * @return {this}
	 */
	addMessage(config = {}) {
		if (config.classes) {
			config.classes.push('ajaxblock-dialog-message');
		} else {
			config = Object.assign({ classes: ['ajaxblock-dialog-message'] }, config);
		}
		const message = new OO.ui.MessageWidget(config);
		this.messageContainer.$element.append(message.$element);
		return this;
	}

	clearMessages() {
		this.messageContainer.$element.empty();
		return this;
	}

	/**
	 * @returns {OO.ui.FieldLayout}
	 * @protected For a subclass's constructor only
	 */
	getTargetField() {
		return new OO.ui.FieldLayout(this.target, {
			classes: ['ajaxblock-horizontalfield'],
			label: Messages.get('block-target'),
			align: 'left',
		});
	}

	getTarget() {
		return Object.assign({}, this.currentTarget);
	}

	/**
	 * @returns {?boolean} `false` means unprocessable, `null` means the dialog should be opened.
	 */
	isOneClickAllowed() {
		return this.oneClickAllowed;
	}

	/**
	 * @returns {OO.ui.FieldLayout}
	 * @protected For a subclass's constructor only
	 */
	getWatchUserLayout() {
		return new OO.ui.FieldLayout(this.watchUser, {
			label: Messages.get('ipbwatchuser'),
			align: 'inline',
		});
	}

	/**
	 * @param {InstanceType<ReturnType<AjaxBlockDialogFactory>>} dialog
	 * @returns {OO.ui.FieldLayout}
	 * @protected For a subclass's constructor only
	 */
	getWatchlistExpiryLayout(dialog) {
		const layout = new OO.ui.FieldLayout(this.watchlistExpiry);
		layout.$element.css({ 'margin-left': '1.8em', 'margin-top': '8px' });
		this.watchUser.on('change', (selected) => {
			layout.toggle(!!selected);
			dialog.updateSize();
		});
		layout.toggle(this.watchUser.isSelected());
		return layout;
	}

	getWatchUserParams() {
		/** @type {WatchUserParams} */
		const params = Object.create(null);
		if (!this.watchUser.isSelected()) {
			return params;
		}
		params.watchuser = true;
		params.watchlistexpiry = DropdownUtil.getSelectedOptionValue(this.watchlistExpiry);
		return params;
	}

}

/**
 * @requires oojs-ui
 * @requires mediawiki.widgets.TitlesMultiselectWidget
 * @requires mediawiki.widgets.NamespacesMultiselectWidget
 */
class BlockUser extends AjaxBlockDialogContent {

	/**
	 * @param {InstanceType<ReturnType<AjaxBlockDialogFactory>>} dialog
	 */
	constructor(dialog) {
		super();
		this.dialog = dialog;

		/** @type {OO.ui.Element[]} */
		let items = [
			this.messageContainer,
			this.getTargetField(),
		];

		this.expiry = new OO.ui.DropdownWidget({
			menu: {
				items: Messages.getBlockDurations()
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
		this.expiryOther.on('change', (value) => {
			if (!clean(value)) {
				return;
			}
			DropdownUtil.selectOther(this.expiry);
		});

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

		this.partialBlock = new OO.ui.CheckboxInputWidget();
		items.push(
			new OO.ui.FieldLayout(this.partialBlock, {
				label: Messages.get('ajaxblock-dialog-block-label-partial'),
				align: 'inline',
			})
		);

		const partialBlockLayout = new OO.ui.FieldsetLayout();
		partialBlockLayout.$element.css({ 'margin-left': '1.8em' });
		this.partialBlock.on('change', (selected) => {
			partialBlockLayout.toggle(!!selected);
			this.dialog.updateSize();
		});
		partialBlockLayout.toggle(this.partialBlock.isSelected());

		/** @type {OO.ui.Element[]} */
		const partialBlockLayoutItems = [];

		this.partialBlockPages = new mw.widgets.TitlesMultiselectWidget({
			api,
			placeholder: Messages.get('block-pages-placeholder'),
			showMissing: false,
			tagLimit: 50,
		});
		partialBlockLayoutItems.push(
			new OO.ui.FieldLayout(this.partialBlockPages, {
				label: Messages.get('ipb-pages-label'),
				align: 'top',
			})
		);

		this.partialBlockNamespaces = new mw.widgets.NamespacesMultiselectWidget({
			placeholder: Messages.get('block-namespaces-placeholder'),
		});
		partialBlockLayoutItems.push(
			new OO.ui.FieldLayout(this.partialBlockNamespaces, {
				label: Messages.get('ipb-namespaces-label'),
				align: 'top',
			})
		);

		this.partialBlockUpload = new OO.ui.CheckboxInputWidget();
		partialBlockLayoutItems.push(
			new OO.ui.FieldLayout(this.partialBlockUpload, {
				label: Messages.get('ipb-action-upload'),
				align: 'inline',
			})
		);

		this.partialBlockMove = new OO.ui.CheckboxInputWidget();
		partialBlockLayoutItems.push(
			new OO.ui.FieldLayout(this.partialBlockMove, {
				label: Messages.get('ipb-action-move'),
				align: 'inline',
			})
		);

		this.partialBlockCreate = new OO.ui.CheckboxInputWidget();
		partialBlockLayoutItems.push(
			new OO.ui.FieldLayout(this.partialBlockCreate, {
				label: Messages.get('ipb-action-create'),
				align: 'inline',
			})
		);

		this.partialBlockThanks = new OO.ui.CheckboxInputWidget();
		partialBlockLayoutItems.push(
			new OO.ui.FieldLayout(this.partialBlockThanks, {
				label: Messages.get('ipb-action-thanks'),
				align: 'inline',
			})
		);

		partialBlockLayout.addItems(partialBlockLayoutItems);
		items.push(partialBlockLayout);

		const mainFieldset = new OO.ui.FieldsetLayout({
			label: Messages.get('block'),
		});
		mainFieldset.addItems(items);
		this.$element.append(mainFieldset.$element);
		items = [];

		this.cbCreateAccount = new OO.ui.CheckboxInputWidget();
		items.push(
			new OO.ui.FieldLayout(this.cbCreateAccount, {
				label: Messages.get('ipbcreateaccount'),
				align: 'inline',
			})
		);

		this.cbSendEmail = new OO.ui.CheckboxInputWidget();
		items.push(
			new OO.ui.FieldLayout(this.cbSendEmail, {
				label: Messages.get('ipbemailban'),
				align: 'inline',
			})
		);

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
		this.$element.append(detailsFieldset.$element);
		items = [];

		this.cbAutoblock = new OO.ui.CheckboxInputWidget();
		this.cbAutoblockContainer = new OO.ui.FieldLayout(this.cbAutoblock, {
			label: Messages.get('ajaxblock-dialog-block-label-option-autoblock'),
			align: 'inline',
		});
		items.push(this.cbAutoblockContainer);

		this.cbHardblock = new OO.ui.CheckboxInputWidget();
		this.cbHardblockContainer = new OO.ui.FieldLayout(this.cbHardblock, {
			label: Messages.get('ipb-hardblock'),
			align: 'inline',
		});
		items.push(this.cbHardblockContainer);

		this.cbHideName = new OO.ui.CheckboxInputWidget();
		this.cbHideNameContainer = new OO.ui.FieldLayout(this.cbHideName, {
			label: $('<b>').text(Messages.get('ipbhidename')),
			align: 'inline',
		});
		items.push(this.cbHideNameContainer);

		items.push(
			this.getWatchUserLayout(),
			this.getWatchlistExpiryLayout(dialog)
		);

		this.cbAddBlock = new OO.ui.CheckboxInputWidget();
		this.cbAddBlockContainer = new OO.ui.FieldLayout(this.cbAddBlock, {
			label: $('<b>').text(Messages.get('block-create')),
			align: 'inline',
		});
		items.push(this.cbAddBlockContainer);

		const optionsFieldset = new OO.ui.FieldsetLayout({
			label: Messages.get('block-options'),
		});
		optionsFieldset.addItems(items);
		this.$element.append(optionsFieldset.$element);
	}

	/**
	 * Sets a target to the target field.
	 *
	 * @param {BlockTarget} target
	 * @returns {(() => ReturnType<typeof BlockLog['new']>) | Parameters<typeof Messages['get']> | null} One of the following:
	 * - `null`: No blocker to open the dialog.
	 * - `function`: A callback to generate block log lines.
	 * - `array`: Arguments for {@link Messages.get} that explains why the block cannot be processed.
	 */
	setTarget(target) {
		// Adjust the visibility of field items
		if (target.getType() === 'anon') {
			this.cbAutoblockContainer.toggle(false);
			this.cbAutoblock.setSelected(false);
			this.cbHardblockContainer.toggle(true);
			this.cbHideNameContainer.toggle(false);
			this.cbHideName.setSelected(false);
		} else {
			this.cbAutoblockContainer.toggle(true);
			this.cbHardblockContainer.toggle(false);
			this.cbHardblock.setSelected(false);
			if (this.dialog.permissionManager.isAllowed('hideuser')) {
				this.cbHideNameContainer.toggle(true);
			} else {
				this.cbHideNameContainer.toggle(false);
				this.cbHideName.setSelected(false);
			}
		}

		const id = target.getId();
		const username = target.getUsername();
		const blocks = username ? this.dialog.blockLookup.getBlocksByUsername(username) : null;
		this.clearMessages(); // Don't inherit the previous message

		if (id !== null) {
			const block = this.dialog.blockLookup.getBlockById(id);
			if (block) {
				// The block associated with this ID exists
				if (username && blocks && blocks.length > 1) {
					// Other blocks also exist
					this.setTargetInternal({
						target: [username],
						targetAux: [''],
						id: null,
						username,
						oneClick: null,
						addBlock: true,
					});
					const idMap = BlockLookup.toIdMap(
						// `user` is never missing for non-autoblocks
						/** @type {Required<ApiResponseQueryListBlocks>[]} */ (blocks)
					);
					return () => BlockLog.new(username, idMap);
				} else if (block.user) {
					// Ordinary block
					this.setTargetInternal({
						target: [block.user],
						targetAux: [
							Messages.get('parentheses-start'),
							BlockTarget.createBlockListLink(id),
							Messages.get('parentheses-end'),
						],
						id,
						username: block.user,
						oneClick: true,
						addBlock: true,
					});
				} else {
					// Autoblock (this code path is presumably never reached)
					if (!block.automatic) {
						console.error('The associated block is not an autoblock.', block);
					}
					this.setTargetInternal({
						target: [''],
						targetAux: [''],
						id,
						username: '',
						oneClick: false,
						addBlock: false,
					});
					return ['apierror-modify-autoblock'];
				}
			} else {
				// ID no longer active
				if (username !== null) {
					// Ignore ID and use username
					this.addMessage({
						label: new OO.ui.HtmlSnippet(
							Messages.get('ajaxblock-dialog-message-nonactive-id', [id])
								.replace(`#${id}`, BlockTarget.createBlockListLink(id).outerHTML)
						),
						type: 'notice',
					});
					if (Array.isArray(blocks)) {
						// If other active blocks exist, allow the user to choose which one to update
						this.setTargetInternal({
							target: [username],
							targetAux: [''],
							id: null,
							username,
							oneClick: null,
							addBlock: true,
						});
						const idMap = BlockLookup.toIdMap(
							// `user` is never missing for non-autoblocks
							/** @type {Required<ApiResponseQueryListBlocks>[]} */ (blocks)
						);
						return () => BlockLog.new(username, idMap);
					} else {
						// No other active blocks either
						this.setTargetInternal({
							target: [username],
							targetAux: [''],
							id: null,
							username,
							oneClick: true,
							addBlock: false,
						});
					}
				} else {
					// ID no longer active, no username: unprocessable
					this.setTargetInternal({
						target: [''],
						targetAux: [''],
						id,
						username: '',
						oneClick: false,
						addBlock: false,
					});
					return ['ajaxblock-notify-error-idinactivenousername', [id]];
				}
			}
			return null;
		}

		if (username !== null) {
			if (Array.isArray(blocks)) {
				if (blocks.length > 1) {
					// Multiple active blocks
					this.setTargetInternal({
						target: [username],
						targetAux: [''],
						id: null,
						username,
						oneClick: null,
						addBlock: true,
					});
					const idMap = BlockLookup.toIdMap(
						// `user` is never missing for non-autoblocks
						/** @type {Required<ApiResponseQueryListBlocks>[]} */ (blocks)
					);
					return () => BlockLog.new(username, idMap);
				} else {
					// Single active block
					this.setTargetInternal({
						target: [username],
						targetAux: [
							Messages.get('parentheses-start'),
							BlockTarget.createBlockListLink(blocks[0].id),
							Messages.get('parentheses-end'),
						],
						id: blocks[0].id,
						username,
						oneClick: true,
						addBlock: true,
					});
				}
			} else {
				// No active blocks
				this.setTargetInternal({
					target: [username],
					targetAux: [''],
					id: null,
					username,
					oneClick: true,
					addBlock: false,
				});
			}
			return null;
		}

		this.setTargetInternal({
			target: [''],
			targetAux: [''],
			id: null,
			username: null,
			oneClick: false,
			addBlock: false,
		});
		throw new Error('Either the ID or username must be non-null');
	}

	/**
	 * @param {object} data
	 * @param {[text: string | number | boolean]} data.target Parameters for JQuery.text, which sets
	 * the main target text for {@link $target}.
	 * @param {Array<JQuery.htmlString | JQuery.TypeOrArray<JQuery.Node | JQuery<JQuery.Node>>>} data.targetAux
	 * Parameters for JQuery.append, which sets the auxiliary target text for {@link $targetAux}.
	 * @param {?number} data.id The block ID of the target.
	 * @param {?string} data.username The username of the target.
	 * @param {?boolean} data.oneClick Whether the target can be processed in the one-click mode:
	 * - `true`: No blocker for a one-click processing.
	 * - `false`: The target cannot be processed.
	 * - `null`: There is a blocker for a one-click processing (i.e., warnings).
	 * @param {boolean} data.addBlock Whether to show the "Add block" checkbox.
	 * @returns {this}
	 * @private
	 */
	setTargetInternal({ target, targetAux, id, username, oneClick, addBlock }) {
		this.$target.text(...target);
		this.$targetAux.empty().append(...targetAux);
		this.currentTarget.id = id;
		this.currentTarget.username = username;
		this.oneClickAllowed = oneClick;
		if (wgEnableMultiBlocks) {
			this.cbAddBlockContainer.toggle(addBlock);
		} else {
			// In MW >= 1.44, the block API accepts the `newblock` parameter but "add block" fails
			// if wgEnableMultiBlocks is disabled (see BlockUser::placeBlockInternal)
			this.cbAddBlockContainer.toggle(false);
		}
		this.cbAddBlock.setSelected(false);

		return this;
	}

	// /**
	//  * @param {URLSearchParams} query
	//  * @returns {this}
	//  */
	// applyParams(query) {
	// 	const supportedQueryParameters = new Set([
	// 		'wpExpiry',
	// 		'wpReason',
	// 		'wpReason-other',
	// 		'wpRemovalReason',
	// 		'wpEditingRestriction',
	// 		'wpPageRestrictions',
	// 		'wpNamespaceRestrictions',
	// 		'wpActionRestrictions', // ?
	// 		'wpCreateAccount', // Default: true
	// 		'wpDisableEmail',
	// 		'wpDisableUTEdit',
	// 		'wpAutoBlock',
	// 		'wpHideUser',
	// 		'wpHardBlock',
	// 		'wpWatch',
	// 	]);
		// if (query.wpExpiry) {
		// 	this.setExpiry(query.wpExpiry);
		// }

		// const partial = query.wpEditingRestriction === 'partial';
		// this.partialBlock.setSelected(partial);
		// if (partial) {

		// }

		// $this->codexFormData[ 'blockTypePreset' ] =
		// 	$request->getRawVal( 'wpEditingRestriction' ) === 'partial' ?
		// 	'partial' :
		// 	'sitewide';
		// $reasonPreset = $request->getVal( 'wpReason' );
		// $reasonOtherPreset = $request->getVal( 'wpReason-other' );
		// if ( $reasonPreset && $reasonOtherPreset ) {
		// 	$this->codexFormData[ 'blockReasonPreset' ] = $reasonPreset .
		// 		$this->msg( 'colon-separator' )->text() . $reasonOtherPreset;
		// } else {
		// 	$this->codexFormData[ 'blockReasonPreset' ] =
		// 		$reasonPreset ?: $reasonOtherPreset ?: '';
		// }
		// $this->codexFormData[ 'blockRemovalReasonPreset' ] = $request->getVal( 'wpRemovalReason' );
		// $blockAdditionalDetailsPreset = $blockDetailsPreset = [];
		// // Default is to always block account creation.
		// if ( $request->getBool( 'wpCreateAccount', true ) ) {
		// 	$blockDetailsPreset[] = 'wpCreateAccount';
		// }
		// if ( $request->getBool( 'wpDisableEmail' ) ) {
		// 	$blockDetailsPreset[] = 'wpDisableEmail';
		// }
		// if ( $request->getBool( 'wpDisableUTEdit' ) ) {
		// 	$blockDetailsPreset[] = 'wpDisableUTEdit';
		// }
		// if ( $request->getRawVal( 'wpAutoBlock' ) !== '0' ) {
		// 	$blockAdditionalDetailsPreset[] = 'wpAutoBlock';
		// }
		// if ( $request->getBool( 'wpWatch' ) ) {
		// 	$blockAdditionalDetailsPreset[] = 'wpWatch';
		// }
		// if ( $request->getBool( 'wpHideUser' ) ) {
		// 	$blockAdditionalDetailsPreset[] = 'wpHideUser';
		// }
		// if ( $request->getBool( 'wpHardBlock' ) ) {
		// 	$blockAdditionalDetailsPreset[] = 'wpHardBlock';
		// }
		// $this->codexFormData[ 'blockDetailsPreset' ] = $blockDetailsPreset;
		// $this->codexFormData[ 'blockAdditionalDetailsPreset' ] = $blockAdditionalDetailsPreset;
		// $this->codexFormData[ 'blockPageRestrictions' ] = $request->getVal( 'wpPageRestrictions' );
		// $this->codexFormData[ 'blockNamespaceRestrictions' ] = $request->getVal( 'wpNamespaceRestrictions' );
	// }

	getExpiry() {
		const selected = DropdownUtil.getSelectedOptionValue(this.expiry);
		if (selected) {
			return selected;
		} else {
			return clean(this.expiryOther.getValue());
		}
	}

	/**
	 * @param {string} expiry
	 * @return {this}
	 */
	setExpiry(expiry) {
		expiry = clean(expiry);
		if (mw.util.isInfinity(expiry)) {
			expiry = infinity;
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
		const sep = Messages.get('colon-separator');
		const main = [
			DropdownUtil.getSelectedOptionValue(this.reason1),
			DropdownUtil.getSelectedOptionValue(this.reason2),
		].filter(Boolean).join(sep);
		let other = clean(this.reasonOther.getValue());
		const isOtherCommentOnly = other.startsWith('<!--') && other.endsWith('-->');
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
		const rSep = new RegExp('^' + mw.util.escapeRegExp(Messages.get('colon-separator')));
		let item = DropdownUtil.findItemByCallback(this.reason1, (option) => {
			return reason.startsWith(/** @type {string} */ (option.getData()));
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
			return reason.startsWith(/** @type {string} */ (option.getData()));
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
		if (!this.partialBlock.isSelected()) {
			return { partial: false };
		}

		/** @type {PartialBlockParams} */
		const options = Object.create(null);
		options.partial = true;

		const pages = this.partialBlockPages.getValue();
		if (pages.length) {
			options.pagerestrictions = pages.join('|');
		}

		const namespaces = this.partialBlockNamespaces.getValue();
		if (namespaces.length) {
			options.namespacerestrictions = namespaces.join('|');
		}

		const actionMap = {
			partialBlockUpload: 'upload',
			partialBlockCreate: 'create',
			partialBlockMove: 'move',
			partialBlockThanks: 'thanks',
		};
		const actions = Object.entries(actionMap).reduce((acc, [key, action]) => {
			const prop = /** @type {keyof typeof actionMap} */ (key);
			if (this[prop].isSelected()) {
				acc.push(action);
			}
			return acc;
		}, /** @type {string[]} */ ([]));
		if (actions.length) {
			options.actionrestrictions = actions.join('|');
		}

		return options;
	}

}

class UnblockUser extends AjaxBlockDialogContent {

	/**
	 * @param {InstanceType<ReturnType<AjaxBlockDialogFactory>>} dialog
	 */
	constructor(dialog) {
		super();
		this.dialog = dialog;

		/** @type {OO.ui.Element[]} */
		let items = [
			this.messageContainer,
			this.getTargetField()
		];

		this.reason = new OO.ui.TextInputWidget({
			placeholder: Messages.get('block-removal-reason-placeholder')
		});
		items.push(
			new OO.ui.FieldLayout(this.reason, {
				classes: ['ajaxblock-horizontalfield'],
				label: Messages.get('block-reason'),
				align: 'left',
			})
		);

		const mainFieldset = new OO.ui.FieldsetLayout({
			label: Messages.get('unblock'),
		});
		mainFieldset.addItems(items);
		this.$element.append(mainFieldset.$element);
		items = [];

		items.push(
			this.getWatchUserLayout(),
			this.getWatchlistExpiryLayout(dialog)
		);

		const optionsFieldset = new OO.ui.FieldsetLayout({
			label: Messages.get('block-options'),
		});
		optionsFieldset.addItems(items);
		this.$element.append(optionsFieldset.$element);
	}

	/**
	 * @param {BlockTarget} target
	 * @returns {?(() => ReturnType<typeof BlockLog['new']>)} `null` or a callback function
	 * @todo Define this method
	 */
	setTarget(target) {
		return null;
	}

	getReason() {
		return clean(this.reason.getValue());
	}

}

/**
 * Class that generates block loglines for a given blocked user.
 */
class BlockLog {

	/**
	 * Retrieves detailed log entries for the given user's active blocks.
	 *
	 * @param {string} username The name of the user whose block logs are being retrieved.
	 * @param {BlockIdMapValue} data The user's active block data (IDs and earliest block timestamp).
	 * @returns {JQuery.Promise<BlockLogMap | string>} A Promise resolving to a Map of block IDs to block log details,
	 * or to an API error code string if the request fails.
	 * @private
	 */
	static getEntries(username, data) {
		const { ids, earliestTimestamp } = data;
		return api.get({
			action: 'query',
			formatversion: '2',
			list: 'logevents',
			leprop: 'user|type|timestamp|parsedcomment|details',
			letype: 'block',
			leend: earliestTimestamp,
			letitle: `User:${username}`,
			lelimit: 'max',
			uselang: wgUserLanguage
		}).then(/** @param {ApiResponse} res */ (res) => {
			const logevents = res && res.query && res.query.logevents || [];
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
				for (const [id, block] of ids) {
					if (block.timestamp === log.timestamp) {
						return id;
					}
				}
				return void 0;
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
				if (typeof blockId !== 'number' || !ids.has(blockId) || log.action === 'unblock') {
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
		}).catch((code, err) => {
			console.warn(err);
			return /** @type {string} */ (code);
		});
	}

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
	 * @param {BlockLogMapValue} data
	 * @returns {string}
	 */
	static create(data) {
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
		const comment = parsedcomment && Messages.get('parentheses', [parsedcomment]);

		const ret = [timestamp, logline, comment].filter(Boolean);
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
		return Messages.get('parentheses', [formatted.join(Messages.get('comma-separator'))]);
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
			const list = actions.map((action) => Messages.get(`ipb-action-${action}`));
			const msg = Messages.get('logentry-partialblock-block-action', [num, Messages.listToText(list)]);
			$7.push(msg);
		}
		return $7;
	}

	/**
	 * @param {string} username
	 * @param {BlockIdMapValue} data
	 * @returns {Promise<BlockLoglineMap | string>}
	 */
	static async new(username, data) {
		const entry = await this.getEntries(username, data);
		if (typeof entry === 'string') {
			return entry;
		}
		if (!entry.size) {
			const code = `Block log query for ${username} returned an empty response.`;
			console.warn(code);
			return code;
		}

		/** @type {BlockLoglineMap} */
		const loglineMap = new Map();
		for (const [id, builder] of entry) {
			loglineMap.set(id, this.create(builder));
		}
		return loglineMap; // Return type modified
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

class AjaxBlockLogo {

	constructor() {
		/** @private */
		this.logo = document.createElement('span');
		this.logo.classList.add('ajaxblock-logo');
		this.logo.innerHTML = AjaxBlockLogo.svg;
		/** @private */
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
AjaxBlockLogo.svg = `
<svg
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
	</svg>
`;

//**********************************************************************

/**
 * @typedef {import('./window/AjaxBlock').Initializer} Initializer
 * @typedef {import('./window/AjaxBlock').ApiResponse} ApiResponse
 * @typedef {import('./window/AjaxBlock').ApiResponseQueryListBlocks} ApiResponseQueryListBlocks
 * @typedef {import('./window/AjaxBlock').BlockLink} BlockLink
 * @typedef {import('./window/AjaxBlock').BlockLinkMap} BlockLinkMap
 * @typedef {import('./window/AjaxBlock').UnblockLink} UnblockLink
 * @typedef {import('./window/AjaxBlock').UnblockLinkMap} UnblockLinkMap
 * @typedef {import('./window/AjaxBlock').AjaxBlockMessages} AjaxBlockMessages
 * @typedef {import('./window/AjaxBlock').MediaWikiMessages} MediaWikiMessages
 * @typedef {import('./window/AjaxBlock').LoadedMessages} LoadedMessages
 * @typedef {import('./window/AjaxBlock').CachedMessage} CachedMessage
 * @typedef {import('./window/AjaxBlock').BlockTargetType} BlockTargetType
 * @typedef {import('./window/AjaxBlock').Target} Target
 * @typedef {import('./window/AjaxBlock').PartialBlockParams} PartialBlockParams
 * @typedef {import('./window/AjaxBlock').WatchUserParams} WatchUserParams
 * @typedef {import('./window/InvestigateHelper').ApiResponseQueryListLogevents} ApiResponseQueryListLogevents
 * @typedef {import('./window/InvestigateHelper').ApiResponseQueryListLogeventsParamsRestrictions} ApiResponseQueryListLogeventsParamsRestrictions
 * @typedef {import('./window/InvestigateHelper').BlockIdMapValue} BlockIdMapValue
 * @typedef {import('./window/InvestigateHelper').BlockLogMap} BlockLogMap
 * @typedef {import('./window/InvestigateHelper').BlockLogMapValue} BlockLogMapValue
 * @typedef {import('./window/InvestigateHelper').BlockLoglineMap} BlockLoglineMap
 * @typedef {import('./window/InvestigateHelper').BlockFlags} BlockFlags
 */

AjaxBlock.init();

//**********************************************************************
})();