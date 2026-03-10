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

		// Check user rights, special namespace aliases, block/unblock special page aliases
		const [initializer] = await Promise.all([this.getInitializer(api), $.when($.ready)]);
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

		// Continue preparation:
		// - Check if multiblocks is enabled on this site
		// - Check the block statuses of the users/IDs extracted from block/unblock links
		// - Load oojs-ui-windows for AjaxBlockDialog
		// - Load missing interface messages
		const [multiBlocksEnabled, blockLookup] = await Promise.all([
			this.fetchMultiBlockSettings(),
			BlockLookup.fetch(permissionManager, users, ids),
			mw.loader.using('oojs-ui-windows'),
			Messages.loadMessagesIfMissing(permissionManager, [
				'colon-separator',

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

				'unblock',
				'block-reason',
				'block-removal-reason-placeholder',

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
		wgEnableMultiBlocks = multiBlocksEnabled;

		// Messages are now ready:
		// Update the title attributes of unprocessable (un)block links
		/** @type {NodeListOf<HTMLAnchorElement>} */
		const unprocessableLinks = document.querySelectorAll(
			'.ajaxblock-blocklink-unprocessable, .ajaxblock-unblocklink-unprocessable'
		);
		const unprocessableTitle = Messages.get('ajaxblock-title-unprocessable');
		for (const a of unprocessableLinks) {
			a.title += ' ' + unprocessableTitle;
		}

		// Create an AjaxBlock instance
		this.addStyleTag();
		new this(permissionManager, linkMaps, blockLookup);
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
			let m, prefixedTitle;
			if ((m = regex.article.exec(href))) {
				prefixedTitle = decodeURIComponent(m[1]);
			} else if (a.pathname === wgScript) {
				prefixedTitle = mw.util.getParamValue('title', href) || '';
				if (!prefixedTitle) {
					continue;
				}
			} else {
				continue;
			}
			prefixedTitle = prefixedTitle.replace(/_/g, ' ');

			// Check whether this is a link to Special:Block or Special:Unblock
			if (!(m = regex.special.exec(prefixedTitle))) {
				continue;
			}
			const title = m[1];
			let isUnblockLink;
			if (regex.block.test(title)) {
				isUnblockLink = false;
			} else if (regex.unblock.test(title)) {
				isUnblockLink = true;
			} else {
				continue;
			}

			// TODO: Should we really replace underscores here?
			const query = new URLSearchParams(clean(a.search.replace(/_/g, ' ')));
			if (query.get('remove') === '1') {
				isUnblockLink = true;
			}
			const linkType = isUnblockLink ? 'unblock' : 'block';
			const clss = `ajaxblock-${linkType}link`;
			a.classList.add(clss);

			// Extract target
			const par = m[2] ? decodeURIComponent(m[2]) : null;
			const [id, username] = BlockTarget.validate(par, query);
			if (!id && !username) {
				a.classList.add(clss + '-unprocessable');
				continue;
			}

			// TODO: IPs should be prettified
			const key = /** @type {string} */ (id ? '#' + id : username); // Prioritize block ID
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
			${/* Shrink padding for MessageWidget on the dialog */''}
			.ajaxblock-dialog .ajaxblock-dialog-message {
				padding: 8px 12px;
			}
			.ajaxblock-dialog .oo-ui-messageWidget.oo-ui-messageWidget-block > .oo-ui-iconElement-icon {
				background-position: 0 8px;
			}
			${/* Shrink vertical space between field items */''}
			.ajaxblock-dialog .oo-ui-fieldLayout:not(:first-child) {
				margin-top: 6px;
			}
			${/* Expand the default width of 60% */''}
			.ajaxblock-dialog .ajaxblock-horizontalfield .oo-ui-fieldLayout-field {
				width: 80% !important;
			}
			${/* Vertically align FieldLayout's text field with its header element */''}
			.ajaxblock-dialog .ajaxblock-targetlabel {
				display: block;
				padding-top: 4px;
			}
			${/* Halve the default margin top for fieldset:not(:first-child) */''}
			.ajaxblock-dialog .ajaxblock-dialog-content > fieldset:not(:first-child) {
				margin-top: 12px;
			}
			${/* Make non-primary legends less explicit */''}
			.ajaxblock-dialog .ajaxblock-dialog-content > fieldset:not(:first-child) > legend > .oo-ui-labelElement-label {
				font-weight: normal;
				font-style: italic;
				font-size: 1.1em;
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

		const AjaxBlockDialog = AjaxBlockDialogFactory(permissionManager, blockLookup);
		this.dialog = new AjaxBlockDialog({
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
				bkprop: 'user|by|expiry|reason|flags|restrictions',
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

		const reqUsers = users.size
			? request([...users], 'users')
			: ($.Deferred().resolve([]).promise());
		const reqIds = ids.size
			? request([...ids], 'ids')
			: /** @type {JQuery.Promise<ApiResponseQueryListBlocks[]>} */ ($.Deferred().resolve([]).promise());
		return $.when(reqUsers, reqIds).then((...args) => {
			// Filter out duplicate entries
			/**
			 * @type {ApiResponseQueryListBlocks[]}
			 */
			const data = [];
			/**
			 * @type {Set<number>}
			 */
			const seen = new Set();

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
	}

	get length() {
		return this.data.length;
	}

	/**
	 * @returns {readonly ApiResponseQueryListBlocks[]}
	 */
	getData() {
		return this.data;
	}

	/**
	 * @param {number} id
	 * @returns {?ApiResponseQueryListBlocks}
	 */
	getBlockById(id) {
		const index = this.idMap.get(id);
		if (!index) {
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
		if (!indexes) {
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
	 * @param {?string} par
	 * @param {URLSearchParams} query Underscores must be replaced with spaces
	 * @returns {[?number, ?string]} [id, username]
	 * @see SpecialBlock::getTargetInternal
	 */
	static validate(par, query) {
		const id = this.validateBlockId(query.get('id'));

		const possibleTargets = [
			query.get('wpTarget'),
			par,
			query.get('ip'),
			query.get('wpBlockAddress'), // B/C @since 1.18
		];
		/** @type {?string} */
		let target = null;
		for (let tar of possibleTargets) {
			tar = this.validateUsername(tar);
			if (!tar) {
				continue;
			}
			target = tar;
			break;
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
		username = clean(username.replace(/@global$/, ''));
		if (!username || this.regex.invalidUsername.test(username)) {
			return null;
		}
		if (!this.regex.firstGeorgian.test(username)) {
			username = username.charAt(0).toUpperCase() + username.slice(1);
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
	 * Gets the block ID in `#id` format.
	 *
	 * @returns {?string}
	 */
	getHashedId() {
		return this.id !== null ? `#${this.id}` : null;
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

	// /**
	//  * @param {string} message
	//  * @returns {string}
	//  */
	// static ucFirst(message) {
	// 	return message.charAt(0).toUpperCase() + message.slice(1);
	// }

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
		'ajaxblock-dialog-message-nonactive-id': 'The block ID #$1 specified by this link is no longer active; hence disregarded.',
		'ajaxblock-dialog-message-unprocessable-id': 'The block for ID #$1 cannot be processed because it is no longer active.',
		'ajaxblock-notify-error-loadblocklogs': 'Failed to load block information ($1)',
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
		'ajaxblock-dialog-message-nonactive-id': 'このリンクにより指定されているID #$1 のブロックは、既に解除されているため無視されています。',
		'ajaxblock-dialog-message-unprocessable-id': 'ID #$1 のブロックは既に解除されているため処理できません。',
		'ajaxblock-notify-error-loadblocklogs': 'ブロック情報の取得に失敗しました ($1)',
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

/**
 * @param {PermissionManager} permissionManager
 * @param {BlockLookup} blockLookup
 * @returns
 */
function AjaxBlockDialogFactory(permissionManager, blockLookup) {
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
		 * @param {OO.ui.ProcessDialog.ConfigOptions} [config]
		 */
		constructor(config) {
			super(config);

			/**
			 * @private
			 */
			this._ready = false;
			/**
			 * @type {InstanceType<ReturnType<BlockUserFactory>>}
			 */
			this.blockUser = Object.create(null);
			/**
			 * @type {InstanceType<ReturnType<UnblockUserFactory>>}
			 */
			this.unblockUser = Object.create(null);
		}

		/**
		 * @inheritdoc
		 * @override
		 */
		initialize() {
			// @ts-expect-error
			super.initialize.apply(this, arguments);

			this.pushPending();

			return this;
		}

		/**
		 * Lazy-construct the dialog elements.
		 *
		 * This avoids an unconditional load of dependent modules.
		 *
		 * @returns {JQuery.Promise<void>}
		 * @private
		 */
		prepareDialog() {
			if (this._ready) {
				return $.Deferred().resolve().promise();
			}
			this._ready = true;

			return mw.loader.using([
				'oojs-ui',
				'mediawiki.widgets.TitlesMultiselectWidget',
				'mediawiki.widgets.NamespacesMultiselectWidget'
			]).then(() => {
				const BlockUser = BlockUserFactory(permissionManager);
				this.blockUser = new BlockUser(this);

				const UnblockUser = UnblockUserFactory(permissionManager);
				this.unblockUser = new UnblockUser(this);

				const content = new OO.ui.PanelLayout({
					padded: true,
					expanded: false
				});
				content.$element.append(
					this.blockUser.$element,
					this.unblockUser.$element
				);

				// @ts-expect-error
				this.$body.append(content.$element);
				this.popPending();
				this.updateSize();
			});
		}

		isDialogReady() {
			return this._ready;
		}

		/**
		 * @inheritdoc
		 * @override
		 * @param {BlockLink} data
		 */
		getSetupProcess(data) {
			const process = super.getSetupProcess();

			if (!this.isDialogReady()) {
				process.next(() => this.prepareDialog());
			}

			// @ts-expect-error Promise<void> incompatible with Promise<void, any, any>
			process.next(() => this.prepareDisplay(data));

			return process;
		}

		/**
		 * @param {BlockLink} data
		 * @returns {Promise<void>}
		 * @private
		 */
		async prepareDisplay(data) {
			this.getActions().setMode(data.type);
			this.blockUser.blockSelector = null;

			let cb;
			switch (data.type) {
				case 'block':
					cb = this.blockUser.toggle(true).setTarget(data.target, blockLookup);
					this.unblockUser.toggle(false);
					break;
				case 'unblock':
					this.blockUser.toggle(false);
					cb = this.unblockUser.toggle(true).setTarget(data.target, blockLookup);
					break;
				default:
					throw new Error('Invalid data type: ' + data.type);
			}

			// TODO: Handle unblocks separately
			if (!cb) {
				return;
			}
			const blockLoglineMap = await cb();
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
						data: id,
						label: new OO.ui.HtmlSnippet(logline),
					})
				);
			}
			this.blockUser.blockSelector = new OO.ui.RadioSelectWidget({
				items: options,
			});

			const selectorId = 'ajaxblock-blockselector';
			this.blockUser.addMessage({
				label: $('<span>').prop('id', selectorId),
				type: 'warning',
			});
			$(`#${selectorId}`).append(this.blockUser.blockSelector.$element);
		}

		/**
		 * @inheritdoc
		 * @override
		 * @param {string} [action]
		 */
		getActionProcess(action) {
			return new OO.ui.Process(() => {
				switch (action) {
					// case 'execute': {
					// 	const selectedLinks = this.sr.getSelected();
					// 	if (!selectedLinks.length) {
					// 		mw.notify(msg['rollback-notify-noneselected'], { type: 'warn' });
					// 		return;
					// 	}
					// 	this.close();
					// 	this.sr.selectiveRollback(selectedLinks);
					// 	break;
					// }
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
		 * @private
		 */
		this.oneClickAllowed = null;
		/**
		 * @type {?OO.ui.RadioSelectWidget}
		 */
		this.blockSelector = null;

		const $targetContainer = $('<span>').addClass('ajaxblock-targetlabel');
		this.$target = $('<b>');
		this.$targetAux = $('<span>').css({ 'margin-left': '0.5em' });
		$targetContainer.append(
			this.$target,
			this.$targetAux
		);
		this.target = new OO.ui.LabelWidget({
			label: $targetContainer
		});
		/**
		 * @type {Target}
		 * @readonly
		 * @private
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

	/**
	 * @param {BlockTarget} target
	 * @param {BlockLookup} blockLookup
	 * @returns {?(() => ReturnType<typeof BlockLog['new']>)} `null` or a callback function
	 */
	setTarget(target, blockLookup) {
		const id = target.getId();
		const username = target.getUsername();
		const blocks = username ? blockLookup.getBlocksByUsername(username) : null;

		if (id !== null) {
			const block = blockLookup.getBlockById(id);
			if (block) {
				// The block associated with this ID exists
				if (block.user) {
					// Ordinary block
					this.$target.text(block.user);
					this.$targetAux.text(`(#${id})`);
					this.setTargetInternal(id, block.user, true);
				} else {
					// Autoblock
					if (!block.automatic) {
						// TODO: Replace this with console.error
						mw.notify('The associated block is not an autoblock.', { type: 'warn' });
					}
					this.$target.text(Messages.get('autoblockid', [id]));
					this.$targetAux.text('');
					this.setTargetInternal(id, null, true);
				}
			} else {
				// ID no longer active
				// TODO: Remove this
				mw.notify('The block ID is no longer effective.', { type: 'warn' });
				if (username !== null) {
					// Ignore ID and use username
					this.$target.text(username);
					this.$targetAux.text('');
					this.setTargetInternal(null, username, true).clearMessages().addMessage({
						label: Messages.get('ajaxblock-dialog-message-nonactive-id', [id]),
						type: 'notice',
					});

					// If other active blocks exist, allow the user to choose which to update
					if (Array.isArray(blocks)) {
						const idMap = BlockLookup.toIdMap(
							// `user` is never missing for non-autoblocks
							/** @type {Required<ApiResponseQueryListBlocks>[]} */ (blocks)
						);
						this.oneClickAllowed = null;
						return () => BlockLog.new(username, idMap);
					}
				} else {
					// ID no longer active, no username: unprocessable
					this.$target.text(`#${id}`);
					this.$targetAux.text('');
					this.setTargetInternal(id, null, false).clearMessages().addMessage({
						label: Messages.get('ajaxblock-dialog-message-unprocessable-id', [id]),
						type: 'error',
					});
				}
			}
			return null;
		}

		if (username !== null) {
			if (Array.isArray(blocks)) {
				if (blocks.length > 1) {
					// Multiple active blocks
					this.$target.text(username);
					this.$targetAux.text('');
					const idMap = BlockLookup.toIdMap(
						// `user` is never missing for non-autoblocks
						/** @type {Required<ApiResponseQueryListBlocks>[]} */ (blocks)
					);
					this.oneClickAllowed = null;
					return () => BlockLog.new(username, idMap);
				} else {
					// Single active block
					this.$target.text(username);
					this.$targetAux.text(`(#${blocks[0].id})`);
				}
			} else {
				// No active blocks
				this.$target.text(username);
				this.$targetAux.text('');
			}
			return null;
		}

		throw new Error('id or username must be non-null');
	}

	/**
	 * @param {?number} id
	 * @param {?string} username
	 * @param {?boolean} oneClick `false` means unprocessable, `null` means the dialog should be opened.
	 * @returns {this}
	 * @private
	 */
	setTargetInternal(id, username, oneClick) {
		this.currentTarget.id = id;
		this.currentTarget.username = username;
		this.oneClickAllowed = oneClick;
		return this;
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
 * @param {PermissionManager} permissionManager
 * @returns
 */
function BlockUserFactory(permissionManager) {
	return class BlockUser extends AjaxBlockDialogContent {

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

			const optionsFieldset = new OO.ui.FieldsetLayout({
				label: Messages.get('block-options'),
			});
			optionsFieldset.addItems(items);
			this.$element.append(optionsFieldset.$element);
		}

		/**
		 * @inheritdoc
		 * @override
		 * @param {BlockTarget} target
		 * @param {BlockLookup} blockLookup
		 */
		setTarget(target, blockLookup) {
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
				if (permissionManager.isAllowed('hideuser')) {
					this.cbHideNameContainer.toggle(true);
				} else {
					this.cbHideNameContainer.toggle(false);
					this.cbHideName.setSelected(false);
				}
			}
			return super.setTarget(target, blockLookup);
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

	};
}

/**
 * @param {PermissionManager} permissionManager
 * @returns
 */
function UnblockUserFactory(permissionManager) {
	return class UnblockUser extends AjaxBlockDialogContent {

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

		getReason() {
			return clean(this.reason.getValue());
		}

	};
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