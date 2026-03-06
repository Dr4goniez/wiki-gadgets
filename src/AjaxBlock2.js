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

class AjaxBlock {

	static async init() {
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

		const [initializer] = await Promise.all([this.getInitializer(api), $.when($.ready)]);
		if (!initializer.userRights.has('block')) {
			return;
		}

		const data = this.collectBlockLinks(initializer);
		console.log(data);
		if ($.isEmptyObject(data.links)) {
			return;
		}
		this.addStyleTag();

		const userLang = /** @type {keyof typeof Messages.i18n} */ (wgUserLanguage.replace(/-.*$/, ''));
		const i18n = Messages.i18n[userLang] || Messages.i18n.en;
		mw.messages.set(/** @type {any} */ (i18n));

		await $.when(
			mw.loader.using('oojs-ui-windows'),
			Messages.loadMessagesIfMissing([
				'block',
				'block-target',
				'block-expiry',
				'ipboptions',
				'ipbother',
				'ipbreason-dropdown',
				'htmlform-selectorother-other',
				'block-reason',
				'block-reason-other',

				'unblock',
				'block-removal-reason-placeholder',
			], initializer.userRights)
		);
		new this(data);
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
	 * @return {{ users: { registered: Set<string>; anon: Set<string>; }; links: Record<string, BlockLink[]>; }}
	 * @private
	 */
	static collectBlockLinks(init) {
		const wgServerName = mw.config.get('wgServerName');
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
			article: new RegExp(mw.config.get('wgArticlePath').replace('$1', '([^#?]+)')),
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
			invalidUsername: /[/@#<>[\]|{}:]|^(\d{1,3}\.){3}\d{1,3}$/,
			firstGeorgian: /^[\u10A0-\u10FF]/,
			numeric: /^\d+$/,
		};

		const registered = new Set();
		const anon = new Set();
		/**
		 * @type {Record<string, BlockLink[]>}
		 */
		const linkMap = Object.create(null);

		let index = 0;
		for (const a of /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll('#bodyContent a'))) {
			const href = a.href;
			if (
				!href ||
				a.role === 'button' ||
				a.hostname !== wgServerName
			) {
				continue;
			}

			// Get prefixed title from the href
			let m, prefixedTitle;
			if ((m = regex.article.exec(href))) {
				prefixedTitle = decodeURIComponent(m[1]).replace(/[_+]/g, ' ');
			} else if (a.pathname === wgScript) {
				const t = mw.util.getParamValue('title', href);
				if (!t) {
					continue;
				}
				prefixedTitle = t.replace(/_/g, ' ');
			} else {
				continue;
			}

			// Check whether this is a link to Special:Block or Special:Unblock
			if (!(m = regex.special.exec(prefixedTitle))) {
				continue;
			}
			const title = decodeURIComponent(m[1]).replace(/[_+]/g, ' ');
			let isUnblockLink;
			if (regex.block.test(title)) {
				isUnblockLink = false;
			} else if (regex.unblock.test(title)) {
				isUnblockLink = true;
			} else {
				continue;
			}

			// Extract target
			let target = m[2]
				? decodeURIComponent(m[2]).replace(/[_+]/g, ' ')
				: mw.util.getParamValue('target', href);
			if (!target) {
				continue;
			}
			target = target.replace(/@global$/, '').trim();
			if (!target) {
				continue;
			}
			if (regex.invalidUsername.test(target)) {
				console.log('AjaxBlock: Unprocessable username: ' + target);
				continue;
			}
			if (!regex.firstGeorgian.test(target)) {
				target = target.charAt(0).toUpperCase() + target.slice(1);
			}
			if (mw.util.isIPAddress(target, true)) {
				anon.add(target);
			} else {
				registered.add(target);
			}

			// Extract query parameters
			/** @type {URLQueryParams} */
			const query = Object.create(null);
			for (const [key, value] of new URLSearchParams(a.search).entries()) {
				/** @type {string | number} */
				let val = value.trim();
				if (val === '') {
					continue;
				}
				if (regex.numeric.test(val)) {
					val = +val;
				}
				query[key] = val;
			}
			if (query.remove) {
				isUnblockLink = true;
			}

			const linkType = isUnblockLink ? 'unblock' : 'block';
			a.classList.add('ab-blocklink', `ab-blocklink-${linkType}`);

			if (!linkMap[target]) {
				linkMap[target] = [];
			}
			linkMap[target].push({
				index: index++,
				anchor: a,
				type: linkType,
				target,
				query,
			});
		}

		return {
			users: { registered, anon },
			links: linkMap,
		};
	}

	/**
	 * @private
	 */
	static addStyleTag() {
		const style = document.createElement('style');
		style.id = 'ajaxblock-styles';
		style.textContent = `
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
			${/* Disable the top margin for :not(:first-child) fieldsets */''}
			.ajaxblock-dialog .ajaxblock-fieldset {
				margin-top: 0px;
			}
		`.replace(/[\t\n\r]+/g, '');
		document.head.appendChild(style);
	}

	/**
	 * @param {ReturnType<AjaxBlock.collectBlockLinks>} linkObj
	 * @private
	 */
	constructor(linkObj) {
		this.registered = linkObj.users.registered;
		this.anon = linkObj.users.anon;
		this.links = linkObj.links;

		// Add a click event to each link
		Object.values(this.links).forEach((arr) => {
			arr.forEach((obj) => {
				obj.anchor.addEventListener('click', (e) => this.handleClick(e, obj));
			});
		});

		const AjaxBlockDialog = AjaxBlockDialogFactory();
		this.dialog = new AjaxBlockDialog({
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

	/**
	 * @param {string[]} batchArray
	 * @param {Record<string, string | number | boolean | string[] | File | number[] | undefined>} params
	 * @returns {mw.Api.AbortablePromise}
	 */
	static fetch(batchArray, params) {
		if (batchArray.length <= 50) {
			return api.get(params);
		} else {
			return api.post(params, this.nonwritePost());
		}
	}

}
AjaxBlock.storageKeys = {
	blockPageAliases: 'mw-AjaxBlock-blockPageAliases',
	userRights: 'mw-AjaxBlock-userRights'
};

class Messages {

	/**
	 * Loads a set of messages via the MediaWiki API and adds them to `mw.messages`,
	 * but only if they are missing or depend on other missing `{{int:...}}` messages.
	 *
	 * Unlike `mw.Api.loadMessagesIfMissing`, this version supports API continuation
	 * using batches of 500 messages per request (instead of 50), improving performance.
	 *
	 * @param {(keyof MediaWikiMessages)[]} messages List of message keys to ensure they are available.
	 * @param {Set<string>} userRights A list of permissions the user has.
	 * @returns {JQuery.Promise<boolean>} Resolves to `true` if any new messages were added; otherwise `false`.
	 */
	static loadMessagesIfMissing(messages, userRights) {
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
		/** @type {Record<string, string> | false | null} */
		const cached = mw.storage.getObject(this.storageKey);
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

		const apilimit = userRights.has('apihighlimits') ? 500 : 50;
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
			return AjaxBlock.fetch(batch, {
				meta: 'allmessages',
				ammessages: batch,
				amlang: wgUserLanguage,
			}).then(/** @param {ApiResponse} res */ (res) => {
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
					mw.storage.setObject(Messages.storageKey, newCache, 24 * 60 * 60); // 1-day expiry
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
			const parsedKey = this.lcFirst(rawKey.trim());
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
	 * @param {string[]} [params] Positional parameters for replacements.
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
				const value = rawOption.trim();
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

	// /**
	//  * Creates a wikilink to a local title as raw HTML.
	//  *
	//  * @param {string} title The title of the page to link to.
	//  * @param {string} [display] The display text of the link. If omitted, `title` is used.
	//  * @returns {string} An `<a>` tag as raw HTML.
	//  */
	// static wikilink(title, display) {
	// 	const anchor = document.createElement('a');
	// 	anchor.href = mw.util.getUrl(title, { noredirect: 1 });
	// 	anchor.target = '_blank';
	// 	anchor.textContent = display || title;
	// 	return anchor.outerHTML;
	// }

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

		const message = this.get(msgKey, [], { method: 'plain' });
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
			const [label, value] = el.split(':');
			ret.set(label.trim(), value.trim());
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
		for (const [label, value] of map) {
			options.push(
				new OO.ui.MenuOptionWidget({ label, data: value })
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

	// /**
	//  * Takes a list of strings and build a locale-friendly comma-separated list, using the local
	//  * comma-separator message. The last two strings are chained with an "and".
	//  *
	//  * This method is adapted from `Language::listToText` in MediaWiki-core.
	//  *
	//  * @param {string[]} list
	//  * @return {string}
	//  */
	// static listToText(list) {
	// 	const itemCount = list.length;
	// 	if (!itemCount) {
	// 		return '';
	// 	}
	// 	let text = /** @type {string} */ (list.pop());
	// 	if (itemCount > 1) {
	// 		const and = Messages.get('and');
	// 		const space = Messages.get('word-separator');
	// 		let comma = '';
	// 		if (itemCount > 2) {
	// 			comma = Messages.get('comma-separator');
	// 		}
	// 		text = list.join(comma) + and + space + text;
	// 	}
	// 	return text;
	// }

}
/**
 * @type {Record<'en' | 'ja', AjaxBlockMessages>}
 */
Messages.i18n = {
	en: {
		'ajaxblock-dialog-button-label-block': 'Block',
		'ajaxblock-dialog-button-label-unblock': 'Unblock',
		'ajaxblock-dialog-button-label-docs': 'Docs',
		'ajaxblock-dialog-button-label-config': 'Config',
	},
	ja: {
		'ajaxblock-dialog-button-label-block': 'ブロック',
		'ajaxblock-dialog-button-label-unblock': 'ブロック解除',
		'ajaxblock-dialog-button-label-docs': '解説',
		'ajaxblock-dialog-button-label-config': '設定',
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
				const BlockUser = BlockUserFactory();
				this.blockUser = new BlockUser(this);

				const UnblockUser = UnblockUserFactory();
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

			process.next(() => {
				this.setMode(data);
				return true;
			});

			return process;
		}

		/**
		 * @param {BlockLink} data
		 * @returns {void}
		 * @private
		 */
		setMode(data) {
			this.getActions().setMode(data.type);

			switch (data.type) {
				case 'block':
					this.blockUser.toggle(true).setTarget(data.target);
					this.unblockUser.toggle(false);
					break;
				case 'unblock':
					this.blockUser.toggle(false);
					this.unblockUser.toggle(true).setTarget(data.target);
					break;
				default:
					throw new Error('Invalid data type: ' + data.type);
			}
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
 * Returns an override-ready OO.ui.FieldsetLayout.
 */
function FieldsetLayoutFactory() {
	/**
	 * @constructor
	 * @param {OO.ui.FieldsetLayout.ConfigOptions} [config]
	 */
	function FieldsetLayout(config) {
		// @ts-expect-error
		FieldsetLayout.super.call(this, config);
	}
	OO.inheritClass(FieldsetLayout, OO.ui.FieldsetLayout);
	return FieldsetLayout;
}

function BlockUserFactory() {
	/**
	 * @extends OO.ui.FieldsetLayout
	 */
	class BlockUser extends FieldsetLayoutFactory() {

		/**
		 * @param {InstanceType<ReturnType<AjaxBlockDialogFactory>>} dialog
		 * @param {OO.ui.FieldsetLayout.ConfigOptions} [config]
		 */
		constructor(dialog, config) {
			config = config || {};
			config.classes = ['ajaxblock-fieldset'];
			config.label = Messages.get('block');
			super(config);

			this.dialog = dialog;

			/** @type {OO.ui.Element[]} */
			const items = [];

			this.$target = $('<span>').addClass('ajaxblock-targetlabel');
			this.target = new OO.ui.LabelWidget({
				label: this.$target
			});
			items.push(
				new OO.ui.FieldLayout(this.target, {
					classes: ['ajaxblock-horizontalfield'],
					label: Messages.get('block-target'),
					align: 'left',
				})
			);

			this.expiry = new OO.ui.DropdownWidget({
				menu: {
					items: Messages.getBlockDurations()
				}
			});
			for (const item of /** @type {OO.ui.MenuOptionWidget[]} */ (this.expiry.getMenu().getItems())) {
				if (mw.util.isInfinity(/** @type {string} */ (item.getData()))) {
					this.expiry.getMenu().selectItem(item);
					break;
				}
			}
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

			this.reason1 = new OO.ui.DropdownWidget({
				menu: {
					items: Messages.parseBlockReasonDropdown()
				}
			});
			this.reason1.getMenu().selectItemByData(''); // Select 'other'
			items.push(
				new OO.ui.FieldLayout(this.reason1, {
					classes: ['ajaxblock-horizontalfield'],
					label: Messages.get('block-reason'),
					align: 'left',
				})
			);

			this.reason2 = new OO.ui.DropdownWidget({
				menu: {
					items: Messages.parseBlockReasonDropdown()
				}
			});
			this.reason2.getMenu().selectItemByData(''); // Select 'other'
			items.push(
				new OO.ui.FieldLayout(this.reason2, {
					classes: ['ajaxblock-horizontalfield'],
					label: Messages.get('block-reason'),
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

			this.accountCreation = new OO.ui.CheckboxInputWidget();
			items.push(
				new OO.ui.FieldLayout(this.accountCreation, {
					label: 'Prevent account creation',
					align: 'inline',
				})
			);

			this.sendingEmails = new OO.ui.CheckboxInputWidget();
			items.push(
				new OO.ui.FieldLayout(this.sendingEmails, {
					label: 'Prevent the user from sending e-mails',
					align: 'inline',
				})
			);

			this.useOwnTalk = new OO.ui.CheckboxInputWidget();
			items.push(
				new OO.ui.FieldLayout(this.useOwnTalk, {
					label: 'Disallow the user to edit their own talk page',
					align: 'inline',
				})
			);

			this.autoBlock = new OO.ui.CheckboxInputWidget();
			items.push(
				new OO.ui.FieldLayout(this.autoBlock, {
					label: 'Auto-block',
					align: 'inline',
				})
			);

			this.partialBlock = new OO.ui.CheckboxInputWidget();
			items.push(
				new OO.ui.FieldLayout(this.partialBlock, {
					label: 'Partial block',
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

			this.partialBlockPages = new mw.widgets.TitlesMultiselectWidget({});
			partialBlockLayoutItems.push(
				new OO.ui.FieldLayout(this.partialBlockPages, {
					label: 'Pages',
					align: 'top',
				})
			);

			this.partialBlockNamespaces = new mw.widgets.NamespacesMultiselectWidget({});
			partialBlockLayoutItems.push(
				new OO.ui.FieldLayout(this.partialBlockNamespaces, {
					label: 'Namespaces',
					align: 'top',
				})
			);

			this.partialBlockUpload = new OO.ui.CheckboxInputWidget();
			partialBlockLayoutItems.push(
				new OO.ui.FieldLayout(this.partialBlockUpload, {
					label: 'Uploading files (including overwriting files)',
					align: 'inline',
				})
			);

			this.partialBlockMove = new OO.ui.CheckboxInputWidget();
			partialBlockLayoutItems.push(
				new OO.ui.FieldLayout(this.partialBlockMove, {
					label: 'Moving pages and files',
					align: 'inline',
				})
			);

			this.partialBlockCreate = new OO.ui.CheckboxInputWidget();
			partialBlockLayoutItems.push(
				new OO.ui.FieldLayout(this.partialBlockCreate, {
					label: 'Creating new pages and uploading new files',
					align: 'inline',
				})
			);

			this.partialBlockThanks = new OO.ui.CheckboxInputWidget();
			partialBlockLayoutItems.push(
				new OO.ui.FieldLayout(this.partialBlockThanks, {
					label: 'Sending thanks',
					align: 'inline',
				})
			);

			partialBlockLayout.addItems(partialBlockLayoutItems);
			items.push(partialBlockLayout);

			this.watchUser = new OO.ui.CheckboxInputWidget();
			items.push(
				new OO.ui.FieldLayout(this.watchUser, {
					label: 'Watch this user',
					align: 'inline',
				})
			);

			this.watchlistExpiry = new OO.ui.DropdownWidget({
				// $overlay: this.$overlay,
				// menu: {
				// 	items: getWatchlistExpiryOptions()
				// }
			});
			// this.watchlistExpiry.getMenu().selectItemByData(cfg.watchlistExpiry);

			const weLayout = new OO.ui.FieldLayout(this.watchlistExpiry);
			weLayout.$element.css({ 'margin-left': '1.8em', 'margin-top': '8px' });
			items.push(weLayout);
			this.watchUser.on('change', (selected) => {
				weLayout.toggle(!!selected);
				this.dialog.updateSize();
			});
			weLayout.toggle(this.watchUser.isSelected());

			this.addItems(items);
		}

		/**
		 * @param {string} target
		 * @returns {this}
		 */
		setTarget(target) {
			this.$target.text(target);
			return this;
		}

	}

	return BlockUser;
}

function UnblockUserFactory() {
	/**
	 * @extends OO.ui.FieldsetLayout
	 */
	class UnblockUser extends FieldsetLayoutFactory() {

		/**
		 * @param {InstanceType<ReturnType<AjaxBlockDialogFactory>>} dialog
		 * @param {OO.ui.FieldsetLayout.ConfigOptions} [config]
		 */
		constructor(dialog, config) {
			config = config || {};
			config.classes = ['ajaxblock-fieldset'];
			config.label = Messages.get('unblock');
			super(config);

			this.dialog = dialog;

			/** @type {OO.ui.Element[]} */
			const items = [];

			this.$target = $('<span>').addClass('ajaxblock-targetlabel');
			this.target = new OO.ui.LabelWidget({
				label: this.$target
			});
			items.push(
				new OO.ui.FieldLayout(this.target, {
					classes: ['ajaxblock-horizontalfield'],
					label: Messages.get('block-target'),
					align: 'left',
				})
			);

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

			this.addItems(items);
		}

		/**
		 * @param {string} target
		 * @returns {this}
		 */
		setTarget(target) {
			this.$target.text(target);
			return this;
		}

		getReason() {
			return this.reason.getValue().trim();
		}

	}

	return UnblockUser;
}

//**********************************************************************

/**
 * @typedef {import('./window/AjaxBlock').Initializer} Initializer
 * @typedef {import('./window/AjaxBlock').ApiResponse} ApiResponse
 * @typedef {import('./window/AjaxBlock').BlockLink} BlockLink
 * @typedef {import('./window/AjaxBlock').URLQueryParams} URLQueryParams
 * @typedef {import('./window/AjaxBlock').AjaxBlockMessages} AjaxBlockMessages
 * @typedef {import('./window/AjaxBlock').MediaWikiMessages} MediaWikiMessages
 * @typedef {import('./window/AjaxBlock').LoadedMessages} LoadedMessages
 * @typedef {import('./window/AjaxBlock').CachedMessage} CachedMessage
 */

AjaxBlock.init();

//**********************************************************************
})();