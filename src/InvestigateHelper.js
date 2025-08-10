/**
 * InvestigateHelper
 *
 * @version pre-release
 * @author [[User:Dragoniez]]
 */
// @ts-check
/* global mw, OO */
// <nowiki>
(() => {
// *******************************************************************************************************

/** @type {mw.Api} */
let api;

/** @type {IP} */
let IP = Object.create(null);

/**
 * Initializes the script.
 */
function init() {

	// Run the script only on Special:Investigate
	if (mw.config.get('wgCanonicalSpecialPageName') !== 'Investigate') {
		return;
	}

	$.when(
		loadIpWiki(), // This must be called before calling collectUsernames()
		mw.loader.using(['mediawiki.util', 'mediawiki.api', 'mediawiki.storage']),
		$.ready
	).then(() => {

		// Parse the "IPs & User agents" table
		const /** @type {JQuery<HTMLTableElement>} */ $table = $('.ext-checkuser-investigate-table');
		if (!$table.length) {
			return;
		}
		const names = collectUsernames($table);
		if (!names) {
			return;
		}

		// Initialize a mw.Api instance
		api = new mw.Api(getApiOptions());

		// Wait for dependent modules and messages to get ready
		$.when(
			mw.loader.using([
				'jquery.makeCollapsible',
				'oojs-ui',
				'oojs-ui.styles.icons-movement', // collapse, expand
				'oojs-ui.styles.icons-moderation', // trash
				'oojs-ui.styles.icons-editing-core', // edit
				'mediawiki.widgets.UsersMultiselectWidget'
			]),
			Messages.loadMessagesIfMissing([
				'tux-editor-translate-mode',
				'checkuser-helper-user',
				'sp-contributions-talk',
				'contribslink',
				'sp-contributions-logs',
				'sp-contributions-blocklog',
				'abusefilter-log-linkoncontribs',
				'checkuser-log-checks-on',
				'centralauth-contribs-link',
				'checkuser-global-contributions-link',
				'ooui-copytextlayout-copy',
				'checkuser-helper-copy-success',
				'checkuser-helper-copy-failed',

				'checkuser-investigate-compare-table-cell-actions',
				'checkuser-investigate-compare-table-cell-other-actions',

				'checkuser-investigate-compare-table-header-ip',
				'block',
				'checkuser-investigateblock-target',
				'mw-widgets-usersmultiselect-placeholder',
				'checkuser-investigate',

				'block-expiry',
				'ipboptions',
				'ipbother',

				'checkuser-investigateblock-reason',
				'ipbreason-dropdown',
				'htmlform-selectorother-other',

				'checkuser-investigateblock-actions',
				'ipbcreateaccount',
				'ipbemailban',
				'ipb-disableusertalk',
				'block-options',
				'htmlform-optional-flag',
				'ipbenableautoblock',
				'days',
				'ipbhidename',
				'ipb-hardblock',

				'blocklink',
				'wikimedia-checkuser-investigateblock-warning-ips-and-users-in-targets',
				'api-feed-error-title',
				'block-submit',
				'block-cancel',
				'block-removal-reason-placeholder',
				'historyempty',
				'block-create',
				'checkuser-investigateblock-reblock-label',
				'block-removal-confirm-yes',

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
				'ipb-action-create',
				'ipb-action-move',
				'ipb-action-thanks',
				'ipb-action-upload',
				'logentry-partialblock-block-page',
				'logentry-partialblock-block-ns',
				'logentry-partialblock-block-action',
			])
		).then(() => {
			return Messages.parse([
				'wikimedia-checkuser-investigateblock-warning-ips-and-users-in-targets'
			]);
		}).then(() => {

			const $content = $('.mw-body-content');
			createStyleTag();
			const { users, ips } = names;
			const /** @type {UserList} */ list = {};

			// Create a list of registered users
			if (users.length) {
				const userField = collapsibleFieldsetLayout($content, Messages.get('checkuser-helper-user'));
				list.user = [];
				for (const { user, ips } of users) {
					const item = new UserListItem(userField, user, 'user');
					ips.forEach(({ ip, actions, all }) => {
						item.addSublistItem($('<li>').append(
							ip,
							IPFieldContent.getActionCountText(actions),
							IPFieldContent.getAllActionCountText(all)
						));
					});
					list.user.push(item);
				}
			}

			// Create a list of IP addresses including common IP ranges
			if (ips.length) {
				const /** @type {IpInfo[]} */ v4s = [];
				const /** @type {IpInfo[]} */ v6s = [];
				for (const info of ips) {
					if (info.ip.version === 4) {
						v4s.push(info);
					} else {
						v6s.push(info);
					}
				}
				if (v4s.length) {
					const ipField = collapsibleFieldsetLayout($content, 'IPv4');
					list.ipv4 = new IPFieldContent(ipField, v4s);
				}
				if (v6s.length) {
					const ipField = collapsibleFieldsetLayout($content, 'IPv6');
					list.ipv6 = new IPFieldContent(ipField, v6s);
				}
			}

			UserListItem.checkExistence();

			const blockField = collapsibleFieldsetLayout($content, Messages.get('block'));
			new BlockField(blockField, list);

			mw.hook('wikipage.content').fire($content);

		}).catch(console.error);
	});
}

/**
 * Loads the `ip-wiki` module from the Japanese Wikipedia.
 *
 * @returns {JQueryPromise<void>}
 */
function loadIpWiki() {
	const moduleName = 'ext.gadget.ip-wiki';
	const loadModule = () => {
		return mw.loader.using(moduleName).then((req) => {
			IP = req(moduleName).IP;
		});
	};
	if (!mw.loader.getState(moduleName)) { // Module doesn't exist locally
		return mw.loader.getScript('https://ja.wikipedia.org/w/load.php?modules=' + moduleName) // Import the module
			.then(loadModule);
	} else {
		return loadModule();
	}
}

/**
 * Collects user names from the investigate table.
 *
 * @param {JQuery<HTMLTableElement>} $table
 * @returns {{ users: UserInfo[]; ips: IpInfo[]; } | null} `null` if both `users` and `ips` are empty.
 * The returned arrays are both sorted by username/IP address.
 */
function collectUsernames($table) {
	const USER_TARGET = 'td.ext-checkuser-compare-table-cell-user-target';
	const IP_TARGET = 'td.ext-checkuser-compare-table-cell-ip-target';

	const /** @type {Map<string, InstanceType<IP>>} */ rawIpMap = new Map();

	const /** @type {Map<string, Set<string>>} */ users = new Map();
	const /** @type {Map<string, IpInfo>} */ ips = new Map();

	$table.children('tbody').children('tr').each((_, tr) => {
		const $tr = $(tr);
		const username = $tr.children(USER_TARGET).attr('data-value') || null;
		const $ipTarget = $tr.children(IP_TARGET);
		const rawIp = $ipTarget.attr('data-value') || null;
		const actions = parseInt(/** @type {string} */ ($ipTarget.attr('data-actions')));
		const all = parseInt(/** @type {string} */ ($ipTarget.attr('data-all-actions')));
		const ip = rawIp ? (rawIpMap.get(rawIp) || IP.newFromText(rawIp)) : null;
		if (rawIp && ip && !rawIpMap.has(rawIp)) {
			rawIpMap.set(rawIp, ip); // Cache parsed IPs
		}

		if (username && !users.has(username)) {
			users.set(username, new Set());
		}
		if (ip) {
			const ipStr = ip.abbreviate();
			if (username) {
				/** @type {Set<string>} */ (users.get(username)).add(ipStr);
			}
			const ipInfo = ips.get(ipStr);
			if (ipInfo) {
				if (username) ipInfo.users.add(username);
				ipInfo.actions += actions;
			} else {
				const associatedUsers = new Set(username && [username]);
				ips.set(ipStr, { ip, users: associatedUsers, actions, all });
			}
		}
	});

	if (!users.size && !ips.size) {
		return null;
	}
	// Sort Map keys
	const /** @type {NonNullable<ReturnType<collectUsernames>>} */ ret = {
		users: [],
		ips: []
	};
	[...users.keys()].sort().forEach((username) => {
		const ipSet = users.get(username);
		if (!ipSet) throw new Error(`Unexpected missing user: ${username}`);
		ret.users.push({
			user: username,
			ips: [...ipSet].sort().map((ipStr) => {
				const info = ips.get(ipStr);
				if (!info) throw new Error(`Unexpected missing IP: ${ipStr}`);
				const { actions, all } = info;
				return { ip: ipStr, actions, all };
			})
		});
	});
	[...ips.keys()].sort().forEach((ipStr) => {
		const info = ips.get(ipStr);
		if (!info) throw new Error(`Unexpected missing IP: ${ipStr}`);
		ret.ips.push(info);
	});
	return ret;
}

/**
 * Gets an options object to initialize a `mw.Api` instance.
 * @returns
 */
function getApiOptions() {
	return {
		ajax: {
			headers: {
				'Api-User-Agent': 'InvestigateHelper/0.0.0 (https://meta.wikimedia.org/wiki/User:Dragoniez/InvestigateHelper.js)'
			}
		},
		parameters: {
			action: 'query',
			format: 'json',
			formatversion: '2'
		}
	};
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

class Messages {

	/**
	 * Loads a set of messages via the MediaWiki API and adds them to `mw.messages`,
	 * but only if they are missing or depend on other missing `{{int:...}}` messages.
	 *
	 * Unlike `mw.Api.loadMessagesIfMissing`, this version supports API continuation
	 * using batches of 500 messages per request (instead of 50), improving performance.
	 *
	 * @param {string[]} messages List of message keys to ensure they are available.
	 * @returns {JQueryPromise<boolean>} Resolves to `true` if any new messages were added; otherwise `false`.
	 */
	static loadMessagesIfMissing(messages) {
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

		/**
		 * Recursively loads missing messages in batches of up to 500.
		 *
		 * @param {string[]} keys List of message keys to load.
		 * @param {number} index Starting index for the current batch.
		 * @returns {JQueryPromise<boolean>}
		 */
		return (function execute(keys, index) {
			const batch = keys.slice(index, index + 500);
			const request = batch.length <= 50
				? (query) => api.get(query)
				: (query) => api.post(query, nonwritePost());

			return request({
				action: 'query',
				formatversion: '2',
				meta: 'allmessages',
				ammessages: batch,
				amlang: mw.config.get('wgUserLanguage')
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

				index += 500;

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
				}

				if (keys[index] !== undefined) {
					// More messages to load
					return execute(keys, index);
				}

				// Re-parse original messages that contained unresolved `{{int:...}}`
				// TODO: Recursively processed messages should be cached
				for (const key of containsInt) {
					const msg = mw.messages.get(key);
					if (msg !== null) {
						Messages.parseInt(msg, key);
					}
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
			rawKey = rawKey.trim();
			const parsedKey = rawKey.charAt(0).toLowerCase() + rawKey.slice(1);

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
	 * @param {K} key
	 * @returns {LoadedMessages[K]}
	 */
	static get(key) {
		let ret = mw.messages.get(key);
		if (ret === null) {
			throw new ReferenceError(`Message named ${key} is not found.`);
		}
		return ret;
	}

	/**
	 * Parses and caches MediaWiki interface messages using the parse API. Cached values are reused via `mw.storage`.
	 *
	 * @param {(keyof LoadedMessages)[]} keys List of message keys to parse.
	 * @returns {JQueryPromise<void>} A promise that resolves when parsing and caching are complete.
	 */
	static parse(keys) {
		/**
		 * @type {Partial<LoadedMessages>}
		 */
		const cache = mw.storage.getObject(this.storageKey) || {};

		const $messages = $('<div>');
		let setCount = 0;

		// Retrieve all from the storage or re-parse all via the API
		// This non-partial approach makes it possible to manage the cache as one object
		for (const key of keys) {
			if (cache[key]) {
				mw.messages.set(key, cache[key]);
				setCount++;
			}
			$messages.append(
				$('<div>').prop('id', key).text(Messages.get(key))
			);
		}
		if (keys.length === setCount) {
			return $.Deferred().resolve();
		}

		return api.post({
			action: 'parse',
			formatversion: '2',
			text: $messages.html(),
			prop: 'text',
			disablelimitreport: true,
			disableeditsection: true,
			disabletoc: true,
			contentmodel: 'wikitext'
		}, nonwritePost()).then((res) => {
			const $res = $(res.parse.text);
			const toCache = Object.create(null);

			for (const key of keys) {
				const $key = $res.find(`#${key}`);
				if ($key.length) {
					const parsed = $key.html();
					mw.messages.set(key, parsed);
					toCache[key] = parsed;
				}
			}

			if (!$.isEmptyObject(toCache)) {
				mw.storage.set(this.storageKey, JSON.stringify(toCache), 3 * 24 * 60 * 60); // 3-day expiry
			}
		});
	}

	/**
	 * @param {string} message
	 * @returns {string}
	 */
	static ucFirst(message) {
		return message.charAt(0).toUpperCase() + message.slice(1);
	}

	/**
	 * Parses all `{{PLURAL:$N|...}}` magic words in the text using the provided values.
	 *
	 * @param {string} text Input string possibly containing `{{PLURAL:$1|...}}` constructs.
	 * @param {...string} parameters Positional values used to resolve each $N.
	 * @returns {string} The processed string with all {{PLURAL}} replaced.
	 */
	static parsePlurals(text, ...parameters) {
		return text.replace(/\{\{\s*PLURAL:\s*\$(\d+)\s*\|([^}]+?)\}\}/gi, (match, numStr, forms) => {
			const index = parseInt(numStr, 10) - 1;
			const value = parseInt(parameters[index], 10);
			if (Number.isNaN(value)) return match;

			// Split into plural forms
			const formList = forms.split('|').map((f) => f.trim());
			// Reuse the first form if there's only one form given
			const chosenForm = value === 1 ? formList[0] : (formList[1] !== undefined ? formList[1] : formList[0]);
			return chosenForm;
		});
	}

	/**
	 * Replaces occurrences of the `{{GENDER:...}}` parser function based on a gender map.
	 *
	 * @param {string} text The text to parse for occurrences of the `GENDER` parser function.
	 * @returns {string} The parsed text with `GENDER` magic words replaced.
	 */
	static parseGenders(text) {
		// Match {{ GENDER:username | male | female | neutral }} allowing whitespace and optional parameters
		return text.replace(/\{\{\s*GENDER:\s*([^}]*)\}\}/g, (_, inner) => {
			const [usernameRaw, male, female, neutral] = /** @type {[string, string?, string?, string?]} */ (
				inner.split('|')
			);

			if (male === undefined) return ''; // No fallback, just username given
			if (female === undefined || neutral === undefined) return male.trim(); // Only male defined

			const username = usernameRaw.replace(/^[\s_]+|[\s_]+$/g, '');
			const gender = Messages.userGenderMap.get(username) || 'unknown';

			switch (gender) {
				case 'male': return male.trim();
				case 'female': return female.trim();
				default: return neutral.trim();
			}
		});
	}

	/**
	 * Parses the `ipbreason-dropdown` message to an array of `OO.ui.MenuOptionWidget` instances.
	 *
	 * @returns {OO.ui.MenuOptionWidget[]}
	 */
	static parseBlockReasonDropdown() {
		// Adapted from Html::listDropdownOptions
		const /** @type {Record<string, string | Record<string, string>>} */ options = {};
		let /** @type {string | false} */optgroup = false;

		for (const rawOption of Messages.get('ipbreason-dropdown').split('\n')) {
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
					options[optgroup][opt] = opt;
				}
			} else {
				// Groupless reason list
				optgroup = false;
				options[value] = value;
			}
		}

		// Adapted from listDropdownOptionsOoui
		const /** @type {OO.ui.MenuOptionWidget[]} */ items = [
			new OO.ui.MenuOptionWidget({ data: '', label: Messages.get('htmlform-selectorother-other') })
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
		return $('<a>')
			.prop({
				href: mw.util.getUrl(title, { noredirect: 1 }),
				target: '_blank'
			})
			.text(display || title)
			.prop('outerHTML');
	}

	/**
	 * Parse labels and values out of a comma- and colon-separated list of options, such as is
	 * used for expiry and duration lists.
	 *
	 * This method is adapted from `XmlSelect::parseOptionsMessage`.
	 * @param {string} message The message to parse as a list.
	 * @returns {Map<string, string>}
	 */
	static parseOptionsMessage(message) {
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
		return ret;
	}

	/**
	 * Parses the `ipboptions` message to an array of `OO.ui.MenuOptionWidget` instances.
	 *
	 * @returns {OO.ui.MenuOptionWidget[]}
	 */
	static getBlockDurations() {
		const map = this.parseOptionsMessage(this.get('ipboptions'));
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

	/**
	 * @param {unknown} value
	 * @returns {boolean}
	 */
	static isIndefExpiry(value) {
		return typeof value === 'string' && /^(infinite|indefinite|infinity|never)$/.test(value);
	}

	/**
	 * Translates an expiry value to its localized label if available.
	 *
	 * @param {string} expiry
	 * @returns {string} The localized label for the input expiry value, or the input expiry value
	 * as-is if no translation is available.
	 */
	static translateBlockExpiry(expiry) {
		const map = this.parseOptionsMessage(this.get('ipboptions'));
		const isInputIndef = this.isIndefExpiry(expiry);
		for (const [label, value] of map) {
			if (expiry === value || isInputIndef && this.isIndefExpiry(value)) {
				return label;
			}
		}
		return expiry;
	}

	/**
	 * Parses a summary via the API.
	 *
	 * @param {string} summary The summary to parse.
	 * @returns {JQueryPromise<?string>}
	 */
	static parseSummary(summary) {
		return api.get({
			action: 'parse',
			formatversion: '2',
			summary,
			prop: ''
		}).then(/** @param {ApiResponse} res */ (res) => {
			const parsedsummary = res && res.parse && res.parse.parsedsummary;
			return parsedsummary === 'string' ? parsedsummary : null;
		}).catch((_, err) => {
			console.log('Failed to parse summary:', err);
			return null;
		});
	}

}
/**
 * Map of usernames to their genders. This object is updated by {@link BlockField.checkBlocks}.
 *
 * @type {Map<string, Gender>}
 */
Messages.userGenderMap = new Map();
Messages.storageKey = 'mw-InvestigateHelper-messages';

/**
 * Creates a style tag for `InvestigateHelper` in the document header.
 */
function createStyleTag() {
	const style = document.createElement('style');
	style.id = 'ih-styles';
	style.textContent =
		// For inline elements that should be displayed as block elements
		'.ih-inlineblock {' +
			'display: block;' +
		'}' +
		// Allow user list items to have an unlimited width
		'.ih-username .oo-ui-fieldLayout-body {' +
			'max-width: initial !important;' +
		'}' +
		// Align the usernames of user list items to the first line
		'.ih-username .oo-ui-fieldLayout-header {' +
			'display: initial !important;' +
			'vertical-align: initial !important;' +
		'}' +
		// Enclose toollinks for user list items in parentheses
		'.ih-toollinks::before {' +
			'content: " (";' +
		'}' +
		'.ih-toollinks::after {' +
			'content: ")";' +
		'}' +
		'.ih-toollinks > span:not(:first-child)::before {' +
			'content: " | ";' +
		'}' +
		// For collapsible elements
		'.ih-userlistitem-collapsed {' +
			'display: none;' +
		'}' +
		'.ih-userlistitem-expanded {' +
			'display: block;' +
		'}' +
		// Left-align the label of FieldsetLayout in a collapsible FieldsetLayout
		'.ih-collapsible .mw-collapsible-content legend {' +
			'padding-left: 0 !important;' +
			'margin-bottom: 0 !important;' +
		'}' +
		// <hr> with broader margin
		'.ih-range-delimiter {' +
			'margin: 0.5em 0;' +
		'}' +
		// Reduce horizontal whitespace between FieldsetLayout instances in a collapsible FieldsetLayout
		'.ih-collapsible .mw-collapsible-content > .oo-ui-fieldsetLayout:not(:first-child) {' +
			'margin-top: 12px;' +
		'}' +
		'.ih-collapsible .oo-ui-fieldsetLayout-group > div.oo-ui-fieldLayout:not(:first-child) {' +
			'margin-top: 8px;' +
		'}' +
		// For OO.ui.confirm dialogs
		'.ih-confirm {' +
			'text-align: justify;' +
		'}' +
		// For block confirmation dialogs
		'.ih-dialog-subrow {' +
			'margin-left: 1.6em;' +
		'}' +
		'.ih-dialog-subrow tr > th:nth-child(-n + 2),' +
		'.ih-dialog-subrow tr > td:nth-child(-n + 2) {' +
			'padding-right: 0.5em;' +
		'}' +
		'.ih-dialog-addblock {' +
			'margin-top: 6px !important;' +
			'margin-bottom: 3px;' +
		'}' +
		'';
	document.head.appendChild(style);
}

/**
 * Creates a collapsible fieldset layout.
 *
 * @param {JQuery<HTMLElement>} $target The element to append the fieldset to.
 * @param {string} label The label of the fieldset.
 * @returns {OO.ui.FieldsetLayout}
 * @link https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/refs/heads/master/includes/htmlform/CollapsibleFieldsetLayout.php
 */
function collapsibleFieldsetLayout($target, label) {

	const wrapper = new OO.ui.PanelLayout({
		classes: ['ih-collapsible'],
		expanded: false,
		framed: true,
		padded: true
	});

	const fieldset = new OO.ui.FieldsetLayout({
		classes: ['mw-collapsibleFieldsetLayout', 'mw-collapsible', 'mw-collapsed'],
		label,
		icon: 'expand'
	});
	fieldset.$element
		.appendTo(wrapper.$element)
		// header
		.children('legend')
			.attr('role', 'button')
			.addClass('mw-collapsible-toggle')
			// Change the icon when the fieldset is expanded/collapsed
			.off('click').on('click', () => {
				fieldset.setIcon(fieldset.$element.hasClass('mw-collapsed') ? 'collapse' : 'expand');
			})
			// Remove the default space between the icon and the header text
			.children('.oo-ui-labelElement-label')
				.css('padding-left', 0)
				.end()
		// content
		.next('div')
			.addClass('mw-collapsible-content');

	$target.append(wrapper.$element);
	fieldset.$element.makeCollapsible();

	return fieldset;

}

/**
 * Class that generates a username label accompanied by a checkbox and toollinks.
 */
class UserListItem {

	/**
	 * Creates a new `UserListItem` instance.
	 *
	 * @param {OO.ui.FieldsetLayout} fieldset The FieldsetLayout widget to which the list item will be appended.
	 * @param {string} username The username label. IP addresses must be in abbreviated (normalized) format.
	 * @param {UserType} type The type of user.
	 */
	constructor(fieldset, username, type) {
		// Ensure IP addresses are in normalized form
		if (type !== 'user' && (
			// IPv4: any octet with leading zeros (e.g., 192.168.001.001)
			/\b0\d+\b/.test(username) ||
			// IPv6: any hextet with leading zeros (e.g., 00ff)
			/\b0[0-9a-fA-F]{2,}\b/.test(username) ||
			// IPv6: uncompressed zero run (e.g., :0:0:0:) without "::"
			/(^|:)0(:0){2,}(:|$)(?!:)/.test(username) && !username.includes('::')
		)) {
			throw new Error(`Non-user IP address must be in abbreviated form: ${username}`);
		}
		/**
		 * @type {string}
		 * @readonly
		 * @private
		 */
		this.username = username;
		/**
		 * @type {UserType}
		 * @readonly
		 * @private
		 */
		this.type = type;
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 */
		this.checkbox = new OO.ui.CheckboxInputWidget({ value: username });

		const layout = new OO.ui.FieldLayout(this.checkbox, {
			classes: ['ih-username'],
			label: $('<b>').text(username),
			align: 'inline'
		});

		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 */
		this.$body = layout.$body;
		/**
		 * @type {JQuery<HTMLDivElement>}
		 * @private
		 */
		this.$sublistWrapper = Object.create(null);
		/**
		 * @type {JQuery<HTMLUListElement>}
		 * @private
		 */
		this.$sublist = Object.create(null);
		/**
		 * @type {JQuery<HTMLElement>}
		 * @readonly
		 * @private
		 */
		this.$tools = UserListItem.createToolLinks(username, type);

		layout.$body.append(this.$tools);
		fieldset.addItems([layout]);
	}

	/**
	 * Creates user toollinks as an array.
	 *
	 * @param {string} username
	 * @param {UserType} type
	 * @returns
	 * @private
	 */
	static createToolLinks(username, type) {
		// (user | talk | contribs | logs | block log | filter log | CU log | global account | checkuser | investigate)
		const $tools = $('<span>').addClass('ih-toollinks');
		const /** @type {JQuery<HTMLElement>[]} */ anchors = [];
		if (type === 'user') {
			anchors.push(
				UserListItem.createInternalLink(Messages.get('checkuser-helper-user').toLowerCase(), `User:${username}`, { redirect: 'no' }, true)
			);
		}
		if (type !== 'cidr') {
			anchors.push(
				UserListItem.createInternalLink(Messages.get('sp-contributions-talk'), `User talk:${username}`, { redirect: 'no' }, true)
			);
		}
		anchors.push(
			UserListItem.createInternalLink(Messages.get('contribslink'), `Special:Contributions/${username}`),
			UserListItem.createInternalLink(Messages.get('sp-contributions-logs'), `Special:Log/${username}`),
			UserListItem.createInternalLink(Messages.get('sp-contributions-blocklog'), 'Special:Log/block', { page: `User:${username}` })
		);
		if (type !== 'cidr') {
			anchors.push(
				UserListItem.createInternalLink(Messages.get('abusefilter-log-linkoncontribs'), 'Special:AbuseLog', { wpSearchUser: username })
			);
		}
		anchors.push(
			UserListItem.createInternalLink(Messages.get('checkuser-log-checks-on'), 'Special:CheckUserLog', { cuSearch: username })
		);
		if (type === 'user') {
			anchors.push(
				UserListItem.createInternalLink(Messages.get('centralauth-contribs-link'), `Special:CentralAuth/${username}`)
			);
		} else {
			anchors.push(
				UserListItem.createExternalLink('APNIC', `https://wq.apnic.net/apnic-bin/whois.pl?searchtext=${username}`)
			);
		}
		anchors.push(
			UserListItem.createInternalLink(Messages.get('checkuser-global-contributions-link'), `Special:GlobalContributions/${username}`),
			UserListItem.createExternalLink('stalk toy', `https://meta3.toolforge.org/stalktoy/${username}`)
		);
		if (clipboardSupported()) {
			anchors.push(
				$('<span>').append($('<a>')
					.prop('role', 'button')
					.text(Messages.get('ooui-copytextlayout-copy').toLowerCase())
					.off('click').on('click', () => copy(username))
				)
			);
		}
		$tools.append(...anchors);
		return $tools;
	}

	/**
	 * Creates a link to the given wiki page.
	 *
	 * @param {string} label
	 * @param {string} page
	 * @param {Record<string, string>} [params]
	 * @param {boolean} [setTitle] Whether to set a `title` attribute on the link. (Default: `false`)
	 *
	 * If `true`, {@link CLS_EXISTENCE_UNKNOWN} class attribute is also added to the link so that the
	 * page's existence can later be checked by {@link checkExistence}.
	 * @returns {JQuery<HTMLElement>}
	 * @private
	 */
	static createInternalLink(label, page, params, setTitle = false) {
		const $a = $('<a>').prop({
				target: '_blank',
				href: mw.util.getUrl(page, params)
			})
			.text(label);
		if (setTitle) {
			$a.prop('title', page).addClass(this.CLS_EXISTENCE_UNKNOWN);
		}
		return $('<span>').append($a);
	}

	/**
	 * Creates a link to the given external URL.
	 *
	 * @param {string} label
	 * @param {string} url
	 * @returns {JQuery<HTMLElement>}
	 * @private
	 */
	static createExternalLink(label, url) {
		const $a = $('<a>')
			.prop({
				target: '_blank',
				href: url
			})
			.text(label);
		return $('<span>').append($a);
	}

	/**
	 * Checks the existence of pages linked from {@link CLS_EXISTENCE_UNKNOWN} anchors.
	 *
	 * @returns {JQueryPromise<void>}
	 */
	static checkExistence() {
		const /** @type {Map<string, HTMLAnchorElement[]>} */ linkMap = new Map();

		const links = /** @type {HTMLCollectionOf<HTMLAnchorElement>} */ (document.getElementsByClassName(this.CLS_EXISTENCE_UNKNOWN));
		for (const link of links) {
			const title = link.title;
			if (linkMap.has(title)) {
				/** @type {HTMLAnchorElement[]} */ (linkMap.get(title)).push(link);
			} else {
				linkMap.set(title, [link]);
			}
		}
		if (!linkMap.size) return $.Deferred().resolve();

		const apilimit = 500;
		const /** @type {string[][]} */ titleBatches = [];
		for (const [title] of linkMap) {
			if (!titleBatches.length || titleBatches[titleBatches.length - 1].length === apilimit) {
				titleBatches.push([]);
			}
			titleBatches[titleBatches.length - 1].push(title);
		}

		/**
		 * @param {string[][]} batches
		 * @param {number} iter
		 */
		return (function execute(batches, iter) {
			const titles = batches[iter];
			return api.post({
				action: 'query',
				formatversion: '2',
				titles
			}, nonwritePost()).then(/** @param {ApiResponse} res */ (res) => {
				const {
					normalized = [],
					pages = []
				} =  res && res.query || {};

				const /** @type {Map<string, string>} */ canonicalizedMap = new Map();
				for (const { from, to } of normalized) {
					canonicalizedMap.set(to, from);
				}

				for (const { title, missing, known } of pages) {
					const canonical = canonicalizedMap.get(title) || title;
					const links = linkMap.get(canonical);
					if (!links) {
						console.warn(`Could not find links for "${canonical}".`);
						continue;
					}
					links.forEach((a) => {
						a.classList.remove(UserListItem.CLS_EXISTENCE_UNKNOWN);
						a.classList.add(UserListItem.CLS_EXISTENCE_CHECKED);
						if (missing && !known) {
							a.classList.add('new');
						}
					});
				}

				if (batches[++iter]) {
					execute(batches, iter);
				}
			});
		})(titleBatches, 0);
	}

	/**
	 * Retrieves the username associated with the list item.
	 *
	 * @returns {string}
	 */
	getUsername() {
		return this.username;
	}

	/**
	 * Retrieves the type of the user associated with the list item.
	 *
	 * @returns {UserType}
	 */
	getType() {
		return this.type;
	}

	/**
	 * Toggles the checked state of the checkbox associated with the list item.
	 *
	 * @param {boolean} check Whether to check the checkbox.
	 * @return {this} The current instance for chaining.
	 */
	toggle(check) {
		this.checkbox.setSelected(check);
		return this;
	}

	/**
	 * Prepends a sublist toollink to the set of toollinks.
	 *
	 * @returns {this} The current instance for chaining.
	 * @throws If the instance's toollink already contains a sublist.
	 * @private
	 */
	createSublist() {
		if (this.hasSublist()) {
			throw new Error('The toollinks already contain a sublist.');
		}
		this.$sublistWrapper = $('<div>');
		this.$sublist = $('<ul>');
		this.$body.append(
			this.$sublistWrapper
				.addClass(UserListItem.CLS_COLLAPSED)
				.append(this.$sublist)
		);
		const $sublistButton = $('<span>')
			.append($('<a>')
				.prop('role', 'button')
				.text(Messages.get('tux-editor-translate-mode').toLowerCase())
			)
			.addClass(UserListItem.CLS_TOGGLE)
			.off('click').on('click', () => {
				const cls = this.$sublistWrapper.hasClass(UserListItem.CLS_COLLAPSED)
					? UserListItem.CLS_EXPANDED
					: UserListItem.CLS_COLLAPSED;
				this.$sublistWrapper.removeAttr('class').addClass(cls);
			});
		this.$tools.prepend($sublistButton);
		return this;
	}

	/**
	 * Checks whether the instance has a sublist.
	 *
	 * @returns {boolean}
	 * @private
	 */
	hasSublist() {
		return this.$sublistWrapper instanceof jQuery;
	}

	/**
	 * Adds an item to the sublist.
	 *
	 * @param {JQuery<HTMLElement>} $item The list item to add.
	 * @returns {this} The current instance for chaining.
	 */
	addSublistItem($item) {
		if (!this.hasSublist()) this.createSublist();
		this.$sublist.append($item);
		return this;
	}

}
/**
 * Class name for toollinks whose target page existence needs to be checked via the API.
 */
UserListItem.CLS_EXISTENCE_UNKNOWN = 'ih-existence-unknown';
/**
 * Class name for toollinks whose target page existence has been checked via the API.
 */
UserListItem.CLS_EXISTENCE_CHECKED = 'ih-existence-checked';
UserListItem.CLS_TOGGLE = 'ih-userlistitem-toggle';
UserListItem.CLS_COLLAPSED = 'ih-userlistitem-collapsed';
UserListItem.CLS_EXPANDED = 'ih-userlistitem-expanded';

/**
 * Checks whether clipboard copy is supported.
 *
 * @returns {boolean}
 */
function clipboardSupported() {
	return (
		typeof navigator.clipboard === 'object' &&
		typeof navigator.clipboard.writeText === 'function'
	) || (
		typeof document.queryCommandSupported === 'function' &&
		document.queryCommandSupported('copy')
	);
}

/**
 * Copies the given text to the clipboard with maximum compatibility.
 *
 * @param {string} text
 */
function copy(text) {
	if (typeof navigator.clipboard === 'object' && typeof navigator.clipboard.writeText === 'function') {
		navigator.clipboard.writeText(text).then(() => {
			mw.notify(Messages.get('checkuser-helper-copy-success'), { type: 'success' });
		}).catch((err) => {
			console.error('Clipboard copy failed:', err);
			mw.notify(Messages.get('checkuser-helper-copy-failed'), { type: 'error' });
		});
		return;
	}

	// Fallback using execCommand for older browsers
	const textarea = document.createElement('textarea');
	textarea.value = text;
	textarea.style.position = 'fixed'; // Prevent scrolling
	textarea.style.top = '-1000px';
	textarea.style.left = '-1000px';
	document.body.appendChild(textarea);

	textarea.focus();
	textarea.select();

	try {
		const success = document.execCommand('copy');
		if (success) {
			mw.notify(Messages.get('checkuser-helper-copy-success'), { type: 'success' });
		} else {
			throw new Error('execCommand failed');
		}
	} catch (err) {
		console.error('Clipboard copy failed:', err);
		mw.notify(Messages.get('checkuser-helper-copy-failed'), { type: 'error' });
	}

	document.body.removeChild(textarea);
}

class IPFieldContent {

	/**
	 * Constructs an IPFieldContent that organizes given IP info objects into hierarchical aggregation levels
	 * based on their CIDR containment relationships.
	 *
	 * @param {OO.ui.FieldsetLayout} ipField The UI fieldset layout to append the field content to.
	 * @param {IpInfo[]} info Array of IP info objects. This array must:
	 * - Be non-empty.
	 * - Only contain IPs of the same version (IPv4 or IPv6).
	 */
	constructor(ipField, info) {

		const isV6 = info[0].ip.isIPv6(true);

		// Level 1: Individual IPs, each with a 1-to-1 mapping
		const /** @type {IpInfoLevel[]} */ firstLevel = [];

		// Level 2 (IPv6 only): Group IPs by their /64 CIDRs
		const /** @type {IpInfoLevel[]} */ secondLevel = [];
		const /** @type {Map<string, number>} */ seenV6 = new Map();

		for (let i = 0; i < info.length; i++) {
			const { ip } = info[i];

			// Add each individual IP as a first-level entry
			firstLevel.push({ ip, covers: new Set([i]) });

			// For IPv6, create a /64 CIDR that covers this IP
			if (!isV6) continue;
			const cidr = IP.newFromRange(ip, 64);
			if (!cidr) { // This is basically never `null`
				console.warn(`${ip.abbreviate()} could not be converted to a /64 CIDR.`);
				continue;
			}

			const cidrStr = cidr.sanitize();
			if (!seenV6.has(cidrStr)) {
				seenV6.set(cidrStr, secondLevel.length);
				secondLevel.push({ ip: cidr, covers: new Set([i]) });
			} else {
				// CIDR already seen: add this IP's index to the covers set
				const index = /** @type {number} */ (seenV6.get(cidrStr));
				secondLevel[index].covers.add(i);
			}
		}

		// Initialize `allLevels`
		const allLevels = [IPFieldContent.sortLevel(firstLevel)];
		if (secondLevel.length) {
			allLevels.push(IPFieldContent.sortLevel(secondLevel));
		}

		// Iteratively generate higher-level aggregated CIDR ranges by intersecting existing levels
		let current = allLevels[allLevels.length - 1];
		while (current.length) {

			const /** @type {Set<string>} */ seen = new Set();
			const /** @type {IpInfoLevel[]} */ level = [];
			const /** @type {IpInfoLevel[]} */ noIntersection = [];

			// Attempt to find broader CIDRs by intersecting every unique pair in current level
			for (let i = 0; i < current.length; i++) {
				const source = current[i];

				for (let j = i + 1; j < current.length; j++) {
					const goal = current[j];

					const common = source.ip.intersect(goal.ip, IPFieldContent.intersectOptions);
					if (!common) {
						// Remember IPs without any intersection (deduplicated)
						const failed = [source, goal].filter(({ covers }) => !noIntersection.some(({ covers: covers2 }) => setEqual(covers, covers2)));
						failed.forEach((obj) => {
							noIntersection.push(obj);
						});
						continue;
					}
					const commonStr = common.sanitize();
					if (seen.has(commonStr)) continue; // Already processed this CIDR

					// Find all original IP indexes covered by the intersection CIDR
					const covered = new Set();
					info.forEach(({ ip }, k) => {
						if (common.contains(ip)) {
							covered.add(k);
						}
					});

					if (level.length) {
						// Check if this range covers or is covered by existing ranges in level

						// Is the new range broader than an existing range? (e.g., this: /35, prev: /39)
						const contains = level.find(({ covers }) => isSupersetOf(covered, covers, true));
						if (contains) {
							// Compute "overflown" ranges not included in this new broader range
							const diff = setDifference(covered, contains.covers);
							IPFieldContent.computeOverflownRanges(allLevels, diff, seen, level);
							continue;
						}

						// Is the new range narrower than an existing one? (e.g., this: /39, prev: /35)
						const containedIdx = level.findIndex(({ covers }) => isSupersetOf(covers, covered, true));
						if (containedIdx !== -1) {
							// Replace the broader range with this narrower range
							const contained = level[containedIdx];
							level[containedIdx] = { ip: common, covers: covered };
							seen.add(commonStr);

							// Compute overflown ranges for IPs not covered by new narrower range
							const diff = setDifference(contained.covers, covered);
							IPFieldContent.computeOverflownRanges(allLevels, diff, seen, level);
							continue;
						}

					}

					// If no overlap conditions met, add the new range normally
					seen.add(commonStr);
					level.push({ ip: common, covers: covered });
				}
			}

			// No new broader ranges found; aggregation complete
			if (!level.length) break;

			// Add completely disjoint IPs back in
			noIntersection.forEach(({ ip, covers }) => {
				if (seen.has(ip.sanitize())) return;
				const completelyDisjoint = !level.some(({ covers: covers2 }) => isSupersetOf(covers2, covers, true));
				if (completelyDisjoint) {
					level.push({ ip, covers: new Set(covers) });
				}
			});

			allLevels.push(IPFieldContent.sortLevel(level));
			current = level;
		}

		// Debug output
		// console.log(allLevels.map((arr) => arr.map(({ ip, covers }) => ({ ip: ip.abbreviate(), covers }))));

		// Convert `allLevels` (`IpInfoLevel[][]`) to `ExtendedIpInfo[][]`
		const /** @type {ExtendedIpInfo[][]} */ results = [];

		for (const level of allLevels) {
			const /** @type {ExtendedIpInfo[]} */ ipInfo = [];

			for (const { ip, covers } of level) {
				let actions = 0;
				let all = 0;
				const /** @type {Set<string>} */ users = new Set();
				const canContain = ip.isCIDR();

				// TODO: `contains` should be sorted
				// TODO: Add the IP range in the first line
				const /** @type {IpInfo[]} */ contains = [];
				for (const i of covers) {
					const { users: i_users, actions: i_actions, all: i_all } = info[i];
					actions += i_actions;
					all += i_all;
					for (const user of i_users) {
						users.add(user);
					}
					if (canContain) {
						contains.push(info[i]);
					}
				}

				const entry = { ip, users, actions, all };
				if (canContain) {
					entry.contains = contains;
				}
				ipInfo.push(entry);
			}

			results.push(ipInfo);
		}

		// console.log(results.map((arr) => arr.map(({ ip, actions, all }) => ({ ip: ip.abbreviate(), actions, all }))));

		// Create interface
		/**
		 * @type {UserListItem[]}
		 * @readonly
		 */
		this.items = [];
		for (let i = results.length - 1; i >= 0; i--) {
			results[i].forEach(({ ip, users, actions, all, contains }, j, arr) => {
				const item = new UserListItem(ipField, ip.abbreviate(), ip.isCIDR() ? 'cidr' : 'ip');
				item.$body.append(
					IPFieldContent.getActionCountText(actions),
					IPFieldContent.getAllActionCountText(all)
				);

				if (ip.isCIDR()) {
					const { first, last } = ip.getRange();
					item.addSublistItem($('<li>').html(`<i>${first} - ${last}</i>`));
				}

				if (users.size) {
					for (const user of users) {
						item.addSublistItem($('<li>').text(user));
					}
				}

				// Create a list of contained IPs
				if (contains) {
					for (const { ip: c_ip, actions: c_actions, all: c_all } of contains) {
						item.addSublistItem(
							$('<li>').append(
								c_ip.abbreviate(),
								IPFieldContent.getActionCountText(c_actions),
								IPFieldContent.getAllActionCountText(c_all)
							)
						);
					}
				}

				if (j === arr.length - 1 && i !== 0) {
					item.$body.after($('<hr>').addClass('ih-range-delimiter'));
				}

				this.items.push(item);
			});
		}

	}

	/**
	 * Sorts the given array of `IpInfoLevel` objects in-place by their sanitized IP string.
	 *
	 * @param {IpInfoLevel[]} level Array of IpInfoLevel to sort.
	 * @returns {IpInfoLevel[]} The same array, sorted in ascending order by IP.
	 * @private
	 */
	static sortLevel(level) {
		level.sort((a, b) => {
			const sa = a.ip.sanitize();
			const sb = b.ip.sanitize();
			return sa < sb ? -1 : sa > sb ? 1 : 0;
		});
		return level;
	}

	/**
	 * Registers ranges representing IPs or CIDRs "overflown" (excluded) from a broader range,
	 * by analyzing the difference `diff` (indexes of IPs/CIDRs outside the broader range).
	 *
	 * This method traverses all existing aggregation levels to find IPs or CIDRs
	 * corresponding to the `diff` indexes, then registers those as separate ranges
	 * in the current `level`.
	 *
	 * @param {IpInfoLevel[][]} allLevels All aggregation levels generated so far.
	 * @param {Set<number>} diff Set of indexes of IPs/CIDRs excluded from a broader range.
	 * @param {Set<string>} seen Set of sanitized IP strings already processed in the current level.
	 * @param {IpInfoLevel[]} level The current aggregation level to add overflown ranges to.
	 * @private
	 */
	static computeOverflownRanges(allLevels, diff, seen, level) {
		const /** @type {Record<number, IpInfoLevel>} */ overflown = {};

		for (let k = 0; k < allLevels.length; k++) {
			for (const { ip, covers } of allLevels[k]) {
				// Skip if `covers` do not completely fall under `diff`
				if (!isSupersetOf(diff, covers)) continue;

				if (covers.size <= 1) {
					// Single IP: register directly
					for (const index of covers) {
						overflown[index] = { ip, covers };
					}
				} else {
					// Multiple IPs: register at smallest index only, remove others
					let iter = 0;
					for (const index of Array.from(covers).sort()) {
						if (iter === 0) {
							overflown[index] = { ip, covers };
						} else {
							delete overflown[index];
						}
						iter++;
					}
				}
			}
		}

		// Add newly discovered overflown ranges to current level if not already seen
		for (const { ip, covers } of Object.values(overflown)) {
			const overflownStr = ip.sanitize();
			if (!seen.has(overflownStr)) {
				seen.add(overflownStr);
				level.push({ ip, covers: new Set(covers) });
			}
		}
	}

	/**
	 * Gets a `'<b>[$1 {{PLURAL:$1|action|actions}}]</b>'` message.
	 *
	 * @param {number} count
	 * @returns
	 */
	static getActionCountText(count) {
		let msg = Messages.get('checkuser-investigate-compare-table-cell-actions');
		const countStr = String(count);
		msg = mw.format(Messages.parsePlurals(msg, countStr), countStr);
		return '&nbsp;' + msg;
	}

	/**
	 * Gets a `'<i>(~$1 from all users)</i>'` message.
	 *
	 * @param {number} count
	 * @returns
	 */
	static getAllActionCountText(count) {
		let msg = Messages.get('checkuser-investigate-compare-table-cell-other-actions');
		const countStr = String(count);
		msg = mw.format(Messages.parsePlurals(msg, countStr), countStr);
		return '&nbsp;' + msg;
	}

}
/**
 * @type {import('ip-wiki').IntersectOptions}
 */
IPFieldContent.intersectOptions = {
	maxV4: 31,
	minV4: 16,
	maxV6: 63,
	minV6: 19,
	verbose: true
};

/**
 * Checks if the first set is a superset of the second.
 *
 * This function generalizes `Set.prototype.isSupersetOf` from ES2024 and adds support for checking
 * **proper supersets** via an optional flag.
 *
 * @template T
 * @param {Set<T>} superset The set that may contain all elements of the other.
 * @param {Set<T>} subset The set to test as a subset of the first.
 * @param {boolean} [proper=false] Whether to require the superset to be strictly larger (i.e. proper).
 * @returns {boolean} `true` if `superset` contains all elements of `subset`. If `proper` is `true`,
 * returns `false` for equal sets.
 */
function isSupersetOf(superset, subset, proper = false) {
	if (!(superset instanceof Set) || !(subset instanceof Set)) {
		throw new TypeError('Both arguments must be Set instances.');
	}
	if (proper && superset.size <= subset.size) {
		return false;
	}
	if (!proper && superset.size < subset.size) {
		return false;
	}
	for (const el of subset) {
		if (!superset.has(el)) {
			return false;
		}
	}
	return true;
}

/**
 * Returns a new set containing elements from `a` that are not in `b`.
 *
 * Equivalent to `Set.prototype.difference` from ES2024.
 *
 * @template T
 * @param {Set<T>} a The set to subtract from.
 * @param {Set<T>} b The set whose elements will be removed from `a`.
 * @returns {Set<T>} A new set with elements from `a` that are not in `b`.
 */
function setDifference(a, b) {
	if (!(a instanceof Set) || !(b instanceof Set)) {
		throw new TypeError('Both arguments must be Set instances.');
	}
	const result = new Set();
	for (const value of a) {
		if (!b.has(value)) {
			result.add(value);
		}
	}
	return result;
}

// /**
//  * Merges two sets and returns a new set containing all unique elements from both.
//  *
//  * This is equivalent to `Set.prototype.union` from ES2024.
//  *
//  * @template T
//  * @param {Set<T>} a The first set.
//  * @param {Set<T>} b The second set.
//  * @returns {Set<T>} A new set with all elements from both `a` and `b`.
//  */
// function setUnion(a, b) {
// 	if (!(a instanceof Set) || !(b instanceof Set)) {
// 		throw new TypeError('Both arguments must be Set instances.');
// 	}
// 	return new Set([...a, ...b]);
// }

/**
 * Checks whether two sets contain exactly the same elements (order-insensitive).
 *
 * @template T
 * @param {Set<T>} a The first set to compare.
 * @param {Set<T>} b The second set to compare.
 * @returns {boolean} `true` if both sets contain the same elements; otherwise, `false`.
 */
function setEqual(a, b) {
	if (!(a instanceof Set) || !(b instanceof Set)) {
		throw new TypeError('Both arguments must be Set instances.');
	}
	if (a.size !== b.size) {
		return false;
	}
	for (const el of a) {
		if (!b.has(el)) {
			return false;
		}
	}
	return true;
}

class BlockField {

	/**
	 * @param {OO.ui.FieldsetLayout} fieldset
	 * @param {UserList} list
	 */
	constructor(fieldset, list) {

		/**
		 * Maps from usernames to {@link UserListItem} instances.
		 *
		 * @type {Map<string, UserListItem[]>}
		 * @readonly
		 */
		this.checkboxMap = new Map();

		const /** @type {UserListItem[]} */ userList = [];
		if (list.user) userList.push(...list.user);
		if (list.ipv4) userList.push(...list.ipv4.items);
		if (list.ipv6) userList.push(...list.ipv6.items);
		for (const item of userList) {
			const username = item.getUsername();
			if (!this.checkboxMap.has(username)) {
				this.checkboxMap.set(username, []);
			}
			/** @type {UserListItem[]} */ (this.checkboxMap.get(username)).push(item);
		}

		// Block targets
		const targetField = new OO.ui.FieldsetLayout({
			label: Messages.get('checkuser-investigateblock-target')
		});
		const presetTargets = [ // For debugging
			'WXYZ-origin',
			'220.152.111.0/28',
			'220.152.111.0/24'
		];
		/**
		 * The target selector widget.
		 *
		 * @type {mw.widgets.UsersMultiselectWidget}
		 */
		this.target = new mw.widgets.UsersMultiselectWidget({
			inputPosition: 'outline',
			orientation: 'horizontal',
			placeholder: Messages.get('mw-widgets-usersmultiselect-placeholder'),
			api: new mw.Api(getApiOptions()),
			ipAllowed: true,
			ipRangeAllowed: true,
			selected: presetTargets
		});
		/**
		 * Tracks change events to the {@link target} widget, in order to prevent circular
		 * actions from taking place in its event handlers.
		 *
		 * @type {boolean}
		 */
		this.inChangeEvent = false;

		this.bindCheckboxesWithTags();

		const investigateButton = this.createInvestigateButton(!!presetTargets.length);
		targetField.addItems([
			new OO.ui.FieldLayout(this.target),
			new OO.ui.FieldLayout(investigateButton)
		]);

		// Block expiry
		const expiryField = new OO.ui.FieldsetLayout({
			label: Messages.get('block-expiry')
		});
		/**
		 * @type {OO.ui.DropdownWidget}
		 */
		this.expiry = new OO.ui.DropdownWidget({
			menu: {
				items: Messages.getBlockDurations()
			}
		});
		let indefData = '';
		for (const item of /** @type {OO.ui.MenuOptionWidget[]} */ (this.expiry.getMenu().getItems())) {
			indefData = /** @type {string} */ (item.getData());
			if (Messages.isIndefExpiry(indefData)) {
				break;
			}
		}
		if (indefData) {
			this.expiry.getMenu().selectItemByData(indefData);
		}
		/**
		 * @type {OO.ui.TextInputWidget}
		 */
		this.expiryCustom = new OO.ui.TextInputWidget({
			placeholder: Messages.get('ipbother').replace(/[:：]$/, '')
		});
		this.expiryCustom.on('change', (value) => {
			if (value) this.expiry.getMenu().selectItemByData('');
		});
		expiryField.addItems([
			new OO.ui.FieldLayout(this.expiry),
			new OO.ui.FieldLayout(this.expiryCustom)
		]);

		// Block reasons
		const reasonField = new OO.ui.FieldsetLayout({
			label: Messages.get('checkuser-investigateblock-reason')
		});
		/**
		 * @type {OO.ui.DropdownWidget}
		 */
		this.reason1 = new OO.ui.DropdownWidget({
			menu: {
				items: Messages.parseBlockReasonDropdown()
			}
		});
		this.reason1.getMenu().selectItemByData('');
		/**
		 * @type {OO.ui.DropdownWidget}
		 */
		this.reason2 = new OO.ui.DropdownWidget({
			menu: {
				items: Messages.parseBlockReasonDropdown()
			}
		});
		this.reason2.getMenu().selectItemByData('');
		/**
		 * @type {OO.ui.TextInputWidget}
		 */
		this.reasonC = new OO.ui.TextInputWidget();
		reasonField.addItems([
			new OO.ui.FieldLayout(this.reason1),
			new OO.ui.FieldLayout(this.reason2),
			new OO.ui.FieldLayout(this.reasonC)
		]);

		// Block actions
		const actionField = new OO.ui.FieldsetLayout({
			label: Messages.get('checkuser-investigateblock-actions')
		});

		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 */
		this.nocreate = new OO.ui.CheckboxInputWidget({ selected: true });
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 */
		this.noemail = new OO.ui.CheckboxInputWidget();
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 */
		this.nousertalk = new OO.ui.CheckboxInputWidget();
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 */
		this.autoblock = new OO.ui.CheckboxInputWidget({ selected: true });
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 */
		this.hidename = new OO.ui.CheckboxInputWidget();
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 */
		this.hardblock = new OO.ui.CheckboxInputWidget();

		const canSuppressGroups = new Set(['suppress', 'staff', 'steward']);
		const canSuppress =
			(mw.config.get('wgUserGroups') || [])
			.concat(/** @type {?string[]} */ (mw.config.get('wgGlobalGroups')) || [])
			.some((group) => canSuppressGroups.has(group));
		let hidename;
		actionField.addItems([
			new OO.ui.FieldLayout(this.nocreate, {
				label: Messages.get('ipbcreateaccount'),
				align: 'inline'
			}),
			new OO.ui.FieldLayout(this.noemail, {
				label: Messages.get('ipbemailban'),
				align: 'inline'
			}),
			new OO.ui.FieldLayout(this.nousertalk, {
				label: Messages.get('ipb-disableusertalk'),
				align: 'inline'
			}),
			new OO.ui.Element({
				$element: $('<span>')
					.addClass('ih-inlineblock')
					.css('padding', '8px 0')
					.html(`<b>${Messages.get('block-options')}</b>&nbsp;${Messages.get('htmlform-optional-flag')}`)
			}),
			new OO.ui.FieldLayout(this.autoblock, {
				label: mw.format(
					Messages.get('ipbenableautoblock'),
					mw.format(Messages.parsePlurals(Messages.get('days'), '1'), '1')
				),
				align: 'inline'
			}),
			(hidename = new OO.ui.FieldLayout(this.hidename, {
				label: Messages.get('ipbhidename'),
				align: 'inline'
			})),
			new OO.ui.FieldLayout(this.hardblock, {
				label: Messages.get('ipb-hardblock'),
				align: 'inline'
			})
		]);
		hidename.toggle(canSuppress);

		this.block = new OO.ui.ButtonWidget({
			label: Messages.ucFirst(Messages.get('blocklink')),
			flags: ['progressive', 'primary'],
			disabled: !presetTargets.length
		});
		this.block.off('click').on('click', () => this.blockUsers());

		const blockButtonLayout = new OO.ui.FieldLayout(this.block);
		blockButtonLayout.$element.css('margin-top', '0.5em');

		fieldset.addItems([
			targetField,
			expiryField,
			reasonField,
			actionField,
			blockButtonLayout
		]);

		// Define a "change" event listner for `target` in one place for better performance
		let /** @type {string[]} */ previousItems = [];

		this.target.on('change', () => {
			// Enable or disable the investigate button based on selection
			const selected = this.target.getSelectedUsernames();
			const deduplicated = BlockField.filterTargets(selected);
			investigateButton.setDisabled(!(deduplicated.length > 0 && deduplicated.length <= 10));

			// Enable or disable the block button based on selection
			this.block.setDisabled(!selected.length);

			// Bind changes in the tag selector widget to the checkboxes in the username list,
			// so that removing a tag unchecks the corresponding box, and adding a tag checks it
			const currentData = selected;
			if (this.inChangeEvent) {
				previousItems = currentData;
				return;
			}
			this.inChangeEvent = true;
			const removed = new Set(previousItems.filter((old) => !currentData.includes(old)));
			const added = new Set(currentData.filter((curr) => !previousItems.includes(curr)));
			if (removed.size || added.size) {
				for (const [username, items] of this.checkboxMap) {
					if (removed.has(username)) {
						items.forEach((item) => item.checkbox.setSelected(false));
					} else if (added.has(username)) {
						items.forEach((item) => item.checkbox.setSelected(true));
					}
				}
			}
			previousItems = currentData;
			this.inChangeEvent = false;
		});

		/**
		 * @type {ReturnType<BlockDialogFactory>}
		 */
		this.BlockDialog = BlockDialogFactory();
	}

	/**
	 * Binds changes in checkboxes in username lists with the tag selector widget,
	 * so that unchecking triggers tag removal and checking triggers tag addition.
	 *
	 * @private
	 */
	bindCheckboxesWithTags() {
		for (const [username, items] of this.checkboxMap) {
			this.target.addAllowedValue(username);
			items.forEach((item) => {
				item.checkbox.off('change').on('change', (selected) => {
					if (this.inChangeEvent) {
						return;
					}
					this.inChangeEvent = true;
					if (selected) {
						this.target.addTag(username, username);
					} else {
						this.target.removeTagByData(username);
					}
					this.inChangeEvent = false;
				});
			});
		}
	}

	/**
	 * Creates a button to open Special:Investigate on a new tab, inheriting usernames
	 * selected in {@link target}.
	 *
	 * @param {boolean} [disabled=true]
	 * @returns {OO.ui.ButtonWidget}
	 * @private
	 */
	createInvestigateButton(disabled) {
		const button = new OO.ui.ButtonWidget({
			label: Messages.get('checkuser-investigate'),
			disabled
		});
		button.off('click').on('click', () => {
			// Open Special:Investigate in a new tab with selected usernames
			// This presumes that the button is unclickable when no user is selected
			const selected = this.target.getSelectedUsernames();
			const targets = BlockField.filterTargets(selected);
			window.open(mw.util.getUrl('Special:Investigate', { targets: targets.join('\n') }), '_blank');
		});
		return button;
	}

	/**
	 * Returns the currently selected usernames, filtering out any IPs that are already covered
	 * by broader CIDRs among the selection.
	 *
	 * @param {string[]} selected The currently selected usernames.
	 * @returns {string[]} Filtered usernames.
	 * @private
	 */
	static filterTargets(selected) {
		if (!selected.length) return selected;

		/**
		 * Maps seen usernames to either an IP instance or `false` if not an IP.
		 *
		 * @type {Map<string, InstanceType<IP> | false>}
		 */
		const ipsSeen = new Map();

		// Find IPs covered by broader CIDRs
		const /** @type {Set<number>} */ nonIpIndexes = new Set();
		const /** @type {Map<number, InstanceType<IP>>} */ cidrs = new Map();
		outer: for (let i = 0; i < selected.length; i++) {
			const username = selected[i];
			const seen = ipsSeen.get(username);
			let /** @type {InstanceType<IP>?} */ ip = null;

			if (seen === false) { // Already known to be non-IP
				nonIpIndexes.add(i);
				continue;
			}
			if (seen instanceof IP) {
				ip = seen;
			} else if (seen === undefined) {
				ip = IP.newFromText(username);
				ipsSeen.set(username, ip || false);
			}
			if (!ip) {
				nonIpIndexes.add(i);
				continue;
			}

			for (const [j, cidr] of cidrs) {
				// Covered by already collected CIDRs?
				if (cidr.contains(ip)) continue outer;

				// Covers any of already collected CIDRs?
				if (ip.contains(cidr)) cidrs.delete(j);
			}

			cidrs.set(i, ip);
		}

		return selected.filter((_, i) => nonIpIndexes.has(i) || cidrs.has(i));
	}

	/**
	 * Blocks users and IPs selected in `target`.
	 *
	 * @private
	 */
	async blockUsers() {
		this.block.setDisabled(true);

		const targets = this.getCategorizedUsernames();
		if (!targets || !Object.values(targets).some(arr => arr.length)) {
			// The user should never get caught in this block because we disable the block button
			// when no user is selected; hence the message is not translated
			await OO.ui.alert('No users are selected as the block targets.');
			this.block.setDisabled(false);
			return;
		}

		// Ensure users and IPs aren't mixed
		const userMixConfirmed = await BlockField.confirmUserMix(!!targets.user.length && !!targets.ip.length);
		if (!userMixConfirmed) {
			this.block.setDisabled(false);
			return;
		}

		const dialog = new this.BlockDialog(this, { size: 'larger' });
		this.BlockDialog.windowManager.addWindows([dialog]);
		this.BlockDialog.windowManager.openWindow(dialog, { targets });
		/**
		 * @param {OO.ui.Window} win
		 */
		const handleClosure = (win) => {//teardown
			if (win === dialog) {
				this.block.setDisabled(false);
				this.BlockDialog.windowManager.off('closing', handleClosure);
				// Note: BlockDialog.teardown removes the dialog from the window
			}
		};
		this.BlockDialog.windowManager.on('closing', handleClosure);
	}

	/**
	 * Gets currently selected usernames, categorized by registered users, temporary users, and IP users.
	 *
	 * @returns
	 */
	getCategorizedUsernames() {
		const targets = this.target.getSelectedUsernames();
		if (!targets.length) return null;

		/** @type {Set<string>} */
		const users = new Set();
		/** @type {Set<string>} */
		const temps = new Set();
		/** @type {Map<string, InstanceType<IP>>} */
		const ips = new Map();
		/**
		 * @param {string} username
		 * @returns {boolean=}
		 */
		const isTempUser = (username) => {
			return mw.util.isTemporaryUser && mw.util.isTemporaryUser(username);
		};

		for (let i = 0; i < targets.length; i++) {
			const target = targets[i];
			if (isTempUser(target)) {
				temps.add(target);
				continue;
			}
			const ip = IP.newFromText(target);
			if (!ip) {
				users.add(target);
			} else {
				const ipStr = ip.sanitize();
				if (!ips.has(ipStr)) {
					ips.set(ipStr, ip);
				}
			}
		}

		/** @type {Record<CategorizedUsername['usertype'], CategorizedUsername[]>} */
		const ret = {
			user: [],
			temp: [],
			ip: []
		};
		if (users.size) {
			for (const user of users) {
				ret.user.push({
					username: user,
					usertype: 'user'
				});
			}
			ret.user.sort((a, b) => b.username.localeCompare(a.username));
		}
		if (temps.size) {
			for (const temp of temps) {
				ret.temp.push({
					username: temp,
					usertype: 'temp'
				});
			}
			ret.temp.sort((a, b) => b.username.localeCompare(a.username));
		}
		if (ips.size) {
			for (const [sanitized, ip] of ips) {
				/** @type {Set<string>} */
				const covers = new Set();
				/** @type {Set<string>} */
				const coveredBy = new Set();

				if (ip.isCIDR()) {
					for (const ip2 of ips.values()) {
						if (ip !== ip2 && ip.contains(ip2, { excludeEquivalent: true })) {
							covers.add(ip2.abbreviate());
						}
					}
				}
				for (const ip2 of ips.values()) {
					if (ip !== ip2 && ip.isInRange(ip2, { excludeEquivalent: true })) {
						coveredBy.add(ip2.abbreviate());
					}
				}

				ret.ip.push({
					username: sanitized,
					usertype: 'ip',
					abbreviated: ip.abbreviate(),
					covers: Array.from(covers).sort(),
					coveredBy: Array.from(coveredBy).sort()
				});
			}

		}

		return ret;
	}

	/**
	 * Shows a confirmation dialog for blocking users and IPs simultaneously. If `mixed` is not `true`,
	 * this method returns `true` immediately.
	 *
	 * @param {boolean} mixed Whether users and IPs are mixed in the block targets.
	 * @returns {JQueryPromise<boolean>} Whether the warning was confirmed.
	 * @private
	 */
	static confirmUserMix(mixed) {
		if (mixed) {
			return OO.ui.confirm(
				$('<div>')
					.addClass('ih-confirm')
					.html(Messages.get('wikimedia-checkuser-investigateblock-warning-ips-and-users-in-targets')),
				{ size: 'large' }
			);
		} else {
			return $.Deferred().resolve(true);
		}
	}

	/**
	 * Checks the block status of `targets` and returns a Map of usernames to block info.
	 *
	 * @param {NonNullable<ReturnType<BlockField['getCategorizedUsernames']>>} targets The users to check the block status of.
	 * @returns {JQueryPromise<BlockIdMap | string>} A Promise that resolves with a Map of usernames to block data, or
	 * an API error code as a string on failure.
	 */
	static checkBlocks(targets) {
		/** @type {string[]} */
		const usernames = [];
		/** @type {Set<number>} */
		const userIndexes = new Set();

		Object.values(targets).forEach((arr) => {
			arr.forEach(({ username, usertype }) => {
				if (usertype === 'user') {
					userIndexes.add(usernames.length);
				}
				usernames.push(username);
			});
		});

		const /** @type {BlockIdMap} */ map = new Map();
		/**
		 * @param {number} index
		 * @returns {JQueryPromise<?BlockIdMap>}
		 */
		return (function execute(index) {
			const allUsers = usernames.slice(index, index + 500);
			const params = {
				action: 'query',
				formatversion: '2',
				list: ['blocks'],
				bkusers: allUsers.join('|'),
				bklimit: 'max',
				bkprop: 'id|user|timestamp'
			};

			// Add `list=users` params to retrieve users' genders if `usernames` involves registered users
			const registeredUsers = allUsers.filter((user, i) => userIndexes.has(i + index) && !Messages.userGenderMap.has(user));
			if (registeredUsers.length) {
				params.list.push('users');
				params.usprop = 'gender';
				params.ususers = registeredUsers.join('|');
			}

			return api.post(params, nonwritePost()).then(/** @param {ApiResponse} res */ (res) => {
				const blocks = res && res.query && res.query.blocks || [];
				for (const { id, user, timestamp } of blocks) {
					const username = mw.util.isIPAddress(user, true) ? user.toLowerCase() : user;
					const unixTime = Date.parse(timestamp) / 1000;
					if (!map.has(username)) {
						map.set(username, {
							ids: new Set([id]),
							latestTimestamp: unixTime,
							earliestTimestamp: unixTime
						});
					} else {
						const entry = /** @type {BlockIdMapValue} */ (map.get(username));
						entry.ids.add(id);
						entry.latestTimestamp = Math.max(entry.latestTimestamp, unixTime);
						entry.earliestTimestamp = Math.min(entry.earliestTimestamp, unixTime);
					}
				}

				const users = res && res.query && res.query.users;
				if (users) {
					for (const obj of users) {
						const { userid, name, gender } = obj;
						if (!userid || !gender) {
							console.warn('Unexpected value found in response.query.users', obj);
							continue;
						}
						Messages.userGenderMap.set(name, gender);
					}
				}

				index += 500;
				if (targets[index]) {
					return execute(index);
				}
				return map;
			}).catch((code, err) => {
				console.warn(err);
				return /** @type {string} */ (code);
			});
		})(0);
	}

	getBaseParams() {
		return {
			expiry: this.getExpiry(),
			reason: this.getReason(),
			anononly: !this.hardblock.isSelected(),
			nocreate: this.nocreate.isSelected(),
			autoblock: this.autoblock.isSelected(),
			noemail: this.noemail.isSelected(),
			hidename: this.hidename.isSelected(),
			allowusertalk: !this.nousertalk.isSelected()
		};
	}

	getExpiry() {
		return (
			/** @type {string} */ (/** @type {OO.ui.MenuOptionWidget} */ (this.expiry.getMenu().findFirstSelectedItem()).getData()) ||
			this.expiryCustom.getValue() ||
			'never'
		);
	}

	getReason() {
		const reasons = [
			/** @type {string} */ (/** @type {OO.ui.MenuOptionWidget} */ (this.reason1.getMenu().findFirstSelectedItem()).getData()),
			/** @type {string} */ (/** @type {OO.ui.MenuOptionWidget} */ (this.reason2.getMenu().findFirstSelectedItem()).getData()),
			this.reasonC.getValue()
		];
		return reasons.filter(Boolean).join(': ');
	}

}

/**
 * Class that generates block loglines for a given blocked user.
 */
class BlockLog {

	/**
	 * Retrieves the detailed log entries of active blocks for the given user,
	 * based on block IDs and time frames in which the blocks were applied.
	 *
	 * @param {string} username
	 * @param {BlockIdMapValue} data
	 * @returns {JQueryPromise<BlockLogMap | string>} A Promise resolving to a Map of block IDs to log information,
	 * or an API error code as a string on failure.
	 * @private
	 */
	static getEntries(username, data) {
		const { ids, latestTimestamp, earliestTimestamp } = data;
		return api.get({
			action: 'query',
			formatversion: '2',
			list: 'logevents',
			leprop: 'user|type|timestamp|parsedcomment|details',
			letype: 'block',
			lestart: latestTimestamp + 1,
			leend: earliestTimestamp,
			letitle: `User:${username}`,
			lelimit: 'max'
		}).then(/** @param {ApiResponse} res */ (res) => {
			const logevents = res && res.query && res.query.logevents || [];
			/**
			 * @type {BlockLogMap}
			 */
			const ret = new Map();

			const rIsoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
			for (const { params, action, user, timestamp, parsedcomment } of logevents) {
				const { duration, flags, restrictions, blockId, finalTargetCount, sitewide, 'duration-l10n': duration_l10n } = params;

				if (!ids.has(blockId) || action === 'unblock') {
					continue;
				}
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
					this.listToText(this.formatRestrictions(restrictions))
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
		let logline = mw.format(Messages.get(key), ...parameters);
		logline = Messages.parseGenders(logline);
		const comment = parsedcomment && mw.format(Messages.get('parentheses'), parsedcomment);

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
		return mw.format(
			Messages.get('parentheses'),
			formatted.join(Messages.get('comma-separator'))
		);
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
			const msg = mw.format(
				Messages.parsePlurals(Messages.get('logentry-partialblock-block-page'), num),
				num,
				this.listToText(list)
			);
			$7.push(msg);
		}
		if (namespaces && namespaces.length) {
			const num = String(namespaces.length);
			const nsMap = Object.assign({}, mw.config.get('wgFormattedNamespaces'));
			nsMap[0] = Messages.get('blanknamespace');
			const list = namespaces.map((ns) => nsMap[ns]);
			const msg = mw.format(
				Messages.parsePlurals(Messages.get('logentry-partialblock-block-ns'), num),
				num,
				this.listToText(list)
			);
			$7.push(msg);
		}
		if (actions && actions.length) {
			const num = String(actions.length);
			const list = actions.map((action) => Messages.get(`ipb-action-${action}`));
			const msg = mw.format(
				Messages.parsePlurals(Messages.get('logentry-partialblock-block-action'), num),
				num,
				this.listToText(list)
			);
			$7.push(msg);
		}
		return $7;
	}

	/**
	 * Takes a list of strings and build a locale-friendly comma-separated list, using the local
	 * comma-separator message. The last two strings are chained with an "and".
	 *
	 * This method is adapted from `Language::listToText` in MediaWiki-core.
	 *
	 * @param {string[]} list
	 * @return {string}
	 * @private
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

	/**
	 * @param {string} username
	 * @param {BlockIdMapValue} data
	 * @returns {Promise<BlockLog | string>}
	 */
	static async new(username, data) {
		const entry = await this.getEntries(username, data);
		if (typeof entry === 'string') {
			return entry;
		}
		if (!entry.size) {
			console.warn(`Block log query for ${username} returned an empty response.`);
			return 'empty';
		}

		/** @type {BlockLoglineMap} */
		const loglineMap = new Map();
		for (const [id, builder] of entry) {
			loglineMap.set(id, this.create(builder));
		}
		return new this(username, loglineMap);
	}

	/**
	 * @param {string} username
	 * @param {BlockLoglineMap} loglineMap
	 */
	constructor(username, loglineMap) {
		/**
		 * @type {string}
		 */
		this.username = username;
		/**
		 * @type {BlockLoglineMap}
		 */
		this.loglineMap = loglineMap;
	}

}

/**
 * Lazy-loads the `BlockDialog` class.
 *
 * This factory function ensures that `oojs-ui` is fully loaded before `BlockDialog` extends `OO.ui.ProcessDialog`.
 *
 * @returns The `BlockDialog` class.
 * @requires oojs-ui
 */
function BlockDialogFactory() {

	const redSpan = () => $('<span>').css('color', 'var(--color-icon-error, #f54739)');

	class BlockDialog extends OO.ui.ProcessDialog {

		/**
		 * Creates a BlockDialog.
		 *
		 * @param {BlockField} blockField
		 * @param {OO.ui.ProcessDialog.ConfigOptions} [config]
		 */
		constructor(blockField, config) {
			super(config);
			/**
			 * @type {BlockField}
			 */
			this.blockField = blockField;
			/**
			 * @type {OO.ui.FieldsetLayout}
			 */
			this.fieldset = new OO.ui.FieldsetLayout();
			/**
			 * @type {OO.ui.TextInputWidget}
			 */
			this.unblockReason = new OO.ui.TextInputWidget({
				placeholder: Messages.get('block-removal-reason-placeholder')
			});
			/**
			 * @type {BlockTargetSelector[]}
			 */
			this.targets = [];
		}

		/**
		 * @inheritdoc
		 * @override
		 */
		initialize() {
			super.initialize.apply(this, arguments);

			this.content = new OO.ui.PanelLayout({
				padded: true,
				expanded: false
			});
			this.content.$element.append(this.fieldset.$element);
			// @ts-expect-error
			this.$body.append(this.content.$element);

			return this;
		}

		/**
		 * @inheritdoc
		 * @override
		 */
		getSetupProcess() {
			return super.getSetupProcess().next(() => {

				// Always start up in pending mode
				this.pushPending();

				// Disable all buttons on start-up
				this.getActions().forEach(null, (action) => {
					action.setDisabled(true);
				});

			}, this);
		}

		/**
		 * @inheritdoc
		 * @param {DialogData} data
		 * @override
		 */
		getReadyProcess(data) {
			// @ts-expect-error - The call back type is `() => Promise<void>` rather than `() => Promise<void, any, any>`
			return super.getReadyProcess().next(async () => {

				// Check for existing blocks on the targets
				const blockIdMap = await BlockField.checkBlocks(data.targets);
				if (typeof blockIdMap === 'string') {
					return this.handleSetupError(blockIdMap);
				}

				const params = this.blockField.getBaseParams();
				const summaryPromise = params.reason
					? Messages.parseSummary(params.reason)
					: $.Deferred().resolve('');

				/**
				 * Map of usernames to `BlockLog` instances.
				 * @type {Map<string, BlockLog>}
				 */
				const logMap = new Map();

				// Fetch block logs if any of the targets are currently blocked
				if (blockIdMap.size) {
					const deferreds = [];
					for (const [username, data] of blockIdMap) {
						deferreds.push(BlockLog.new(username, data));
					}
					const results = await Promise.all(deferreds);

					for (const log of results) {
						if (typeof log === 'string') {
							return this.handleSetupError(log);
						}
						logMap.set(log.username, log);
					}
				}

				/**
				 * @type {BlockLogObject[]}
				 */
				const targets = [];

				// Create an array of block target objects for confirmation, where the objects may include
				// a `logs` field if the corresponding user is currenctly blocked
				Object.values(data.targets).forEach((arr) => {
					arr.forEach((obj) => {
						const logs = logMap.get(obj.username);
						const value = Object.assign(logs ? { logs } : {}, obj);
						targets.push(value);
					});
				});

				// Set up top elements on the dialog
				const parsedSummary = await summaryPromise;

				this.fieldset.addItems([
					new OO.ui.Element({
						$element: $('<div>')
							.css('margin-bottom', '0.5em')
							.append(
								$('<b>').text(Messages.get('block-expiry') + ':'),
								'&nbsp;',
								Messages.translateBlockExpiry(params.expiry)
							)
					}),
					new OO.ui.Element({
						$element: $('<div>')
							.css('margin-bottom', '0.5em')
							.append(
								$('<b>').text(Messages.get('checkuser-investigateblock-reason') + ':'),
								'&nbsp;',
								parsedSummary !== null
									? (parsedSummary
										? $(parsedSummary)
										: redSpan().text(`(${Messages.get('historyempty')})`)
									)
									: redSpan().text('???')
							)
					})
				]);

				const unblockReasonLayout = new OO.ui.FieldLayout(this.unblockReason, {
					label: Messages.get('block-removal-confirm-yes'), // TODO: Need a better label
					align: 'top'
				});
				unblockReasonLayout.$element.css('margin-top', '0');

				this.fieldset.addItems([
					unblockReasonLayout,
					new OO.ui.Element({
						$element: $('<hr>').css('margin', '1em 0')
					})
				]);

				// Set up the dialog body for block confirmation
				let hasUnblockCheckbox = false;
				/**
				 * @type {BlockTargetSelector[]}
				 */
				this.targets = targets.map((target) => {
					hasUnblockCheckbox = hasUnblockCheckbox || !!target.logs;
					return new BlockTargetSelector(this.fieldset, target);
				});
				unblockReasonLayout.toggle(hasUnblockCheckbox);

				// Mark the dialog as ready for user interaction
				this.popPending();
				this.getActions().forEach(null, (action) => {
					action.setDisabled(false);
				});
				BlockDialog.windowManager.updateWindowSize(this);

			}, this);
		}

		/**
		 * Displays an error message in the dialog to halt further setup.
		 *
		 * @param {string} errorCode Error code to display in the message.
		 */
		handleSetupError(errorCode) {
			const error = new OO.ui.MessageWidget({
				type: 'error',
				label: mw.format(Messages.get('api-feed-error-title'), errorCode),
				inline: true
			});
			/** @type {OO.ui.PanelLayout} */ (this.content).$element.append(error.$element);

			// Re-enable the Cancel button
			this.getActions().forEach(null, (action) => {
				if (action.getAction() === '') {
					action.setDisabled(false);
				}
			});
		}

		/**
		 * @inheritdoc
		 * @param {string} [action]
		 * @override
		 */
		getActionProcess(action) {
			if (action) {
				return new OO.ui.Process(() => {
					this.close( {
						action: action
					});
				});
			}
			return super.getActionProcess(action);
		}

		/**
		 * @inheritdoc
		 * @override
		 */
		teardown() {
			// Remove the current instance from the WindowManager when the dialog has been closed
			return super.teardown().then(() => {
				BlockDialog.windowManager.removeWindows(['BlockDialog']);
			});
		}

	}

	BlockDialog.static.name = 'BlockDialog';
	BlockDialog.static.title = Messages.get('block');
	BlockDialog.static.actions = [
		{
			action: 'block',
			label: Messages.get('block-submit'),
			flags: ['primary', 'progressive']
		},
		{
			label: Messages.get('block-cancel'),
			flags: 'safe'
		}
	];
	BlockDialog.windowManager = (() => {
		const windowManager = new OO.ui.WindowManager();
		$(document.body).append(windowManager.$element);
		return windowManager;
	})();

	return BlockDialog;
}

class BlockTargetSelector {

	/**
	 * @param {OO.ui.FieldsetLayout} fieldset
	 * @param {BlockLogObject} target
	 */
	constructor(fieldset, target) {

		const {
			username,
			abbreviated,
			covers,
			coveredBy,
			logs
		} = target;

		/**
		 * The main checkbox with a boolean indicating whether the target should be blocked.
		 *
		 * @type {OO.ui.CheckboxInputWidget}
		 */
		this.checkbox = new OO.ui.CheckboxInputWidget({
			selected: true
		});
		/**
		 * A `FieldLayout` widget that serves as the entire row.
		 *
		 * @type {OO.ui.FieldLayout}
		 */
		this.row = new OO.ui.FieldLayout(this.checkbox, {
			label: new OO.ui.HtmlSnippet(`<b>${abbreviated || username}</b>`),
			align: 'inline',
			classes: ['ih-dialog-row']
		});
		/**
		 * @type {OO.ui.Element}
		 */
		this.subrow = new OO.ui.Element({
			$element: $('<div>'),
			classes: ['ih-dialog-subrow']
		});

		// If the target is an IP, display a list of IP addresses that the target contains and is contained in
		if (covers && covers.length) {
			this.subrow.$element.append(
				$('<i>').addClass('ih-inlineblock').text('Contains: ' + covers.join(', ')) // TODO: Translate
			);
		}
		if (coveredBy && coveredBy.length) {
			this.subrow.$element.append(
				$('<i>').addClass('ih-inlineblock').text('Contained in: ' + coveredBy.join(', ')) // TODO: Translate
			);
		}

		/**
		 * Map of block IDs to checkboxes whose values indicate how the associated existing blocks should be handled.
		 *
		 * @type {Map<number, { override: OO.ui.CheckboxInputWidget; lift: OO.ui.CheckboxInputWidget; }>}
		 */
		this.existing = new Map();
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 */
		this.addBlock = new OO.ui.CheckboxInputWidget();

		const addBlockLayout = new OO.ui.FieldLayout(this.addBlock, {
			label: Messages.get('block-create'),
			align: 'inline',
			classes: ['ih-dialog-addblock']
		});

		// List existing blocks so that the client can choose to add/override/lift blocks
		if (logs) {
			const $tbody = $('<tbody>');
			const $table = $('<table>').append(
				$('<thead>').append(
					$('<tr>').append(
						$('<th>').append(
							new OO.ui.IconWidget({
								icon: 'edit',
								title: Messages.get('checkuser-investigateblock-reblock-label')
							}).$element
						),
						$('<th>').append(
							new OO.ui.IconWidget({
								icon: 'trash',
								title: Messages.get('block-removal-confirm-yes'),
								flags: 'destructive'
							}).$element
						),
						$('<th>')
					)
				),
				$tbody
			);

			for (const [id, logline] of logs.loglineMap) {
				const override = new OO.ui.CheckboxInputWidget();
				const lift = new OO.ui.CheckboxInputWidget();

				$tbody.append(
					$('<tr>').append(
						$('<td>').append(override.$element),
						$('<td>').append(lift.$element),
						$('<td>').html(logline)
					)
				);

				if (!this.existing.size) {
					// Check the first "override" checkbox
					override.setSelected(true);
					lift.setDisabled(true);
				}
				this.existing.set(id, { override, lift });
			}

			this.subrow.$element.append(
				addBlockLayout.$element,
				$table
			);
		}

		fieldset.addItems([this.row]);
		if (this.subrow.$element.children().length) {
			fieldset.addItems([this.subrow]);
		}
		this.initializeDisabled();

	}

	/**
	 * Initializes event handlers to enable/disable checkboxes when other checkboxes are changed.
	 *
	 * @private
	 */
	initializeDisabled() {

		// For the "Add block" checkbox
		this.addBlock.off('change').on('change', (checked) => {
			for (const { override, lift } of this.existing.values()) {
				if (checked) {
					override.setSelected(false).setDisabled(true);
					lift.setDisabled(false);
				} else {
					override.setDisabled(lift.isSelected());
				}
			}
		});

		// For the "Override block" and "Remove block" checkboxes
		for (const { override, lift } of this.existing.values()) {
			override.off('change').on('change', (checked) => {
				if (!this.addBlock.isSelected()) {
					lift.setDisabled(!!checked);
				}
			});
			lift.off('change').on('change', (checked) => {
				if (!this.addBlock.isSelected()) {
					override.setDisabled(!!checked);
				}
			});
		}

	}

	/**
	 * Returns a boolean indicating whether the main checkbox is checked.
	 *
	 * @returns {boolean} `true` if the target should be blocked; `false` otherwise.
	 */
	isSelected() {
		return this.checkbox.isSelected();
	}
}

/**
 * @typedef {import('./window/InvestigateHelper.d.ts').IP} IP
 * @typedef {import('./window/InvestigateHelper.d.ts').UserList} UserList
 * @typedef {import('./window/InvestigateHelper.d.ts').UserInfo} UserInfo
 * @typedef {import('./window/InvestigateHelper.d.ts').IpInfo} IpInfo
 * @typedef {import('./window/InvestigateHelper.d.ts').LoadedMessages} LoadedMessages
 * @typedef {import('./window/InvestigateHelper.d.ts').Gender} Gender
 * @typedef {import('./window/InvestigateHelper.d.ts').ApiResponse} ApiResponse
 * @typedef {import('./window/InvestigateHelper.d.ts').UserType} UserType
 * @typedef {import('./window/InvestigateHelper.d.ts').IpInfoLevel} IpInfoLevel
 * @typedef {import('./window/InvestigateHelper.d.ts').ExtendedIpInfo} ExtendedIpInfo
 * @typedef {import('./window/InvestigateHelper.d.ts').CategorizedUsername} CategorizedUsername
 * @typedef {import('./window/InvestigateHelper.d.ts').BlockIdMap} BlockIdMap
 * @typedef {import('./window/InvestigateHelper.d.ts').BlockIdMapValue} BlockIdMapValue
 * @typedef {import('./window/InvestigateHelper.d.ts').BlockLogMap} BlockLogMap
 * @typedef {import('./window/InvestigateHelper.d.ts').BlockLogMapValue} BlockLogMapValue
 * @typedef {import('./window/InvestigateHelper.d.ts').BlockFlags} BlockFlags
 * @typedef {import('./window/InvestigateHelper.d.ts').ApiResponseQueryListLogeventsParamsRestrictions} ApiResponseQueryListLogeventsParamsRestrictions
 * @typedef {import('./window/InvestigateHelper.d.ts').BlockLoglineMap} BlockLoglineMap
 */
/**
 * @typedef {object} DialogData
 * @property {NonNullable<ReturnType<BlockField['getCategorizedUsernames']>>} targets
 *
 * @typedef {CategorizedUsername & { logs?: BlockLog; }} BlockLogObject
 */

// ********************************************* ENTRY POINT *********************************************

init();

// *******************************************************************************************************
})();
// </nowiki>