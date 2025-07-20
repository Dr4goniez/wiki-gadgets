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

/**
 * @typedef {import('ip-wiki')} IpWiki
 * @typedef {IpWiki['IP']} IP
 */
/**
 * @type {IpWiki}
 */
let ipWiki = Object.create(null);

/**
 * Initializes the script.
 */
function init() {

	let mblRunning = false;
	const mblStartHook = mw.hook('userjs.markblocked-start');
	const mblEndHook = mw.hook('userjs.markblocked-end');
	mblStartHook.add(() => {
		mblRunning = true;
	});
	mblEndHook.add(() => {
		mblRunning = false;
	});

	// Run the script only on Special:Investigate
	if (mw.config.get('wgCanonicalSpecialPageName') !== 'Investigate') {
		return;
	}

	$.when(
		loadIpWiki(), // This must be called before calling collectUsernames()
		mw.loader.using(['mediawiki.util', 'mediawiki.api']),
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
				'oojs-ui.styles.icons-movement',
				'mediawiki.widgets.UsersMultiselectWidget'
			]),
			api.loadMessagesIfMissing([
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
				'checkuser-investigateblock-actions',
				'checkuser-investigateblock-email-label',
				'checkuser-investigateblock-usertalk-label',
				'checkuser-investigateblock-reblock-label',
				'checkuser-investigateblock-reason',
				'ipbreason-dropdown',
				'htmlform-selectorother-other',

				'blocklink',
				'wikimedia-checkuser-investigateblock-warning-ips-and-users-in-targets',
			])
		).then(() => {
			return parseMessages([
				'wikimedia-checkuser-investigateblock-warning-ips-and-users-in-targets'
			]);
		}).then(() => {

			const $content = $('.mw-body-content');
			let $newContent = $([]);
			createStyleTag();
			const { users, ips } = names;
			const /** @type {UserList} */ list = {};

			// Create a list of registered users
			if (users.length) {
				const userField = collapsibleFieldsetLayout($content, getMessage('checkuser-helper-user'));
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
				$newContent = $newContent.add(userField.$element);
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
					$newContent = $newContent.add(ipField.$element);
				}
				if (v6s.length) {
					const ipField = collapsibleFieldsetLayout($content, 'IPv6');
					list.ipv6 = new IPFieldContent(ipField, v6s);
					$newContent = $newContent.add(ipField.$element);
				}
			}

			UserListItem.checkExistence();

			const blockField = collapsibleFieldsetLayout($content, getMessage('block'));
			new BlockField(blockField, list);

			const contentHook = mw.hook('wikipage.content');
			if (!mblRunning) {
				contentHook.fire($newContent);
			} else {
				const hookHandler = function hookHandler() {
					contentHook.fire($newContent);
					mblEndHook.remove(hookHandler);
				};
				mblEndHook.add(hookHandler);
			}

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
			ipWiki = req(moduleName);
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
 * @typedef {object} UserInfo
 * @property {string} user The username.
 * @property {(Omit<IpInfo, 'ip' | 'users'> & { ip : string })[]} ips IP addresses associated with the username, if any.
 */
/**
 * @typedef {object} IpInfo
 * @property {InstanceType<IP>} ip
 * @property {Set<string>} users Usernames associated with the IP.
 * @property {number} actions The total number of actions by a registered user from the respective IP and User Agent.
 * @property {number} all The total number of actions from the respective IP.
 */
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
	const { IP } = ipWiki;

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
 * Creates a style tag for `InvestigateHelper` in the document header.
 */
function createStyleTag() {
	const style = document.createElement('style');
	style.id = 'ih-styles';
	style.textContent =
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
 * @typedef {object} LoadedMessages
 *
 * @property {string} tux-editor-translate-mode "List"
 * @property {string} checkuser-helper-user
 * @property {string} sp-contributions-talk
 * @property {string} contribslink
 * @property {string} sp-contributions-logs
 * @property {string} sp-contributions-blocklog
 * @property {string} abusefilter-log-linkoncontribs
 * @property {string} checkuser-log-checks-on
 * @property {string} centralauth-contribs-link
 * @property {string} checkuser-global-contributions-link
 * @property {string} ooui-copytextlayout-copy
 * @property {string} checkuser-helper-copy-success
 * @property {string} checkuser-helper-copy-failed
 *
 * @property {string} checkuser-investigate-compare-table-cell-actions
 * @property {string} checkuser-investigate-compare-table-cell-other-actions
 *
 * @property {string} checkuser-investigate-compare-table-header-ip
 * @property {string} block
 * @property {string} checkuser-investigateblock-target
 * @property {string} mw-widgets-usersmultiselect-placeholder
 * @property {string} checkuser-investigate
 * @property {string} checkuser-investigateblock-actions
 * @property {string} checkuser-investigateblock-email-label
 * @property {string} checkuser-investigateblock-usertalk-label
 * @property {string} checkuser-investigateblock-reblock-label
 * @property {string} checkuser-investigateblock-reason
 * @property {string} ipbreason-dropdown
 * @property {string} htmlform-selectorother-other
 *
 * @property {string} blocklink
 * @property {string} wikimedia-checkuser-investigateblock-warning-ips-and-users-in-targets
 */

/**
 * Gets an interface message.
 *
 * @template {keyof LoadedMessages} K
 * @param {K} key
 * @returns {LoadedMessages[K]}
 */
function getMessage(key) {
	let ret = mw.messages.get(key);
	if (ret === null) {
		throw new ReferenceError(`Message named ${key} is not found.`);
	}
	return ret;
}

/**
 * Parses interface messages via the API and sets the results to `mw.messages`.
 *
 * @param {(keyof LoadedMessages)[]} keys
 * @returns {JQueryPromise<void>}
 */
function parseMessages(keys) {
	// TODO: Cache parsed messages in localStorage
	const $wrapper = $('<div>').prop('id', 'parser-wrapper');
	for (const key of keys) {
		$wrapper.append(
			$('<div>').prop('id', key).text(getMessage(key))
		);
	}
	return api.post({
		action: 'parse',
		text: $wrapper.html(),
		prop: 'text',
		disablelimitreport: true,
		disableeditsection: true,
		disabletoc: true,
		contentmodel: 'wikitext',
		formatversion: '2'
	}).then((res) => {
		const $res = $(res.parse.text);
		for (const key of keys) {
			const text = $res.find(`#${key}`).html();
			if (text) {
				mw.messages.set(key, text);
			}
		}
	});
}

/**
 * @typedef {'user' | 'ip' | 'cidr'} UserType
 */

class UserListItem {

	/**
	 * Creates a new `UserListItem` instance.
	 *
	 * @param {OO.ui.FieldsetLayout} fieldset
	 * @param {string} username
	 * @param {UserType} type
	 */
	constructor(fieldset, username, type) {
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
				UserListItem.createInternalLink(getMessage('checkuser-helper-user').toLowerCase(), `User:${username}`, { redirect: 'no' }, true)
			);
		}
		if (type !== 'cidr') {
			anchors.push(
				UserListItem.createInternalLink(getMessage('sp-contributions-talk'), `User talk:${username}`, { redirect: 'no' }, true)
			);
		}
		anchors.push(
			UserListItem.createInternalLink(getMessage('contribslink'), `Special:Contributions/${username}`),
			UserListItem.createInternalLink(getMessage('sp-contributions-logs'), `Special:Log/${username}`),
			UserListItem.createInternalLink(getMessage('sp-contributions-blocklog'), 'Special:Log/block', { page: `User:${username}` })
		);
		if (type !== 'cidr') {
			anchors.push(
				UserListItem.createInternalLink(getMessage('abusefilter-log-linkoncontribs'), 'Special:AbuseLog', { wpSearchUser: username })
			);
		}
		anchors.push(
			UserListItem.createInternalLink(getMessage('checkuser-log-checks-on'), 'Special:CheckUserLog', { cuSearch: username })
		);
		if (type === 'user') {
			anchors.push(
				UserListItem.createInternalLink(getMessage('centralauth-contribs-link'), `Special:CentralAuth/${username}`)
			);
		} else {
			anchors.push(
				UserListItem.createExternalLink('APNIC', `https://wq.apnic.net/apnic-bin/whois.pl?searchtext=${username}`)
			);
		}
		anchors.push(
			UserListItem.createInternalLink(getMessage('checkuser-global-contributions-link'), `Special:GlobalContributions/${username}`),
			UserListItem.createExternalLink('stalk toy', `https://meta3.toolforge.org/stalktoy/${username}`)
		);
		if (clipboardSupported()) {
			anchors.push(
				$('<span>').append($('<a>')
					.prop('role', 'button')
					.text(getMessage('ooui-copytextlayout-copy').toLowerCase())
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
				titles,
				formatversion: '2'
			}).then(({ query }) => {
				/**
				 * @typedef {{ fromencoded: boolean;  from: string; to: string; }} ApiResponseNormalized
				 * @typedef {{ ns: number; title: string; missing?: true; known?: true; }} ApiResponsePageExistence
				 */
				const {
					normalized = [],
					pages = []
				} = /** @type {{ normalized?: ApiResponseNormalized[]; pages?: ApiResponsePageExistence[] }} */ (query);

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
				.text(getMessage('tux-editor-translate-mode').toLowerCase())
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
			mw.notify(getMessage('checkuser-helper-copy-success'), { type: 'success' });
		}).catch(err => {
			console.error('Clipboard copy failed:', err);
			mw.notify(getMessage('checkuser-helper-copy-failed'), { type: 'error' });
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
			mw.notify(getMessage('checkuser-helper-copy-success'), { type: 'success' });
		} else {
			throw new Error('execCommand failed');
		}
	} catch (err) {
		console.error('Clipboard copy failed:', err);
		mw.notify(getMessage('checkuser-helper-copy-failed'), { type: 'error' });
	}

	document.body.removeChild(textarea);
}

/**
 * Represents a CIDR block along with the set of indexes of `info` entries it covers.
 * - The `ip` property is an IP instance representing the CIDR.
 * - The `covers` property is a Set of numeric indexes referring to entries in the original `info` array
 *   that fall within the CIDR range.
 *
 * @typedef {object} IpInfoLevel
 * @property {InstanceType<IP>} ip The IP instance representing the CIDR block.
 * @property {Set<number>} covers Set of indexes from the original `info` array covered by this CIDR.
 */

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
		const { IP } = ipWiki;

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
			const cidr = IP.newFromRange(ip.sanitize(), 64);
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
		/**
		 * @typedef {IpInfo & { contains?: IpInfo[]; }} ExtendedIpInfo
		 */
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
		let msg = getMessage('checkuser-investigate-compare-table-cell-actions');
		const countStr = String(count);
		msg = this.parsePlural(msg, countStr).replace('$1', countStr);
		return '&nbsp;' + msg;
	}

	/**
	 * Gets a `'<i>(~$1 from all users)</i>'` message.
	 *
	 * @param {number} count
	 * @returns
	 */
	static getAllActionCountText(count) {
		let msg = getMessage('checkuser-investigate-compare-table-cell-other-actions');
		const countStr = String(count);
		msg = this.parsePlural(msg, countStr).replace('$1', countStr);
		return '&nbsp;' + msg;
	}

	/**
	 * Parses a `{{PLURAL}}` magic word if `text` contains any.
	 *
	 * @param {string} text
	 * @param {string} $1
	 * @returns {string}
	 * @private
	 */
	static parsePlural(text, $1) {
		const m = text.match(/\{\{PLURAL:\s*\$1\s*\|\s*([^|]+?)\s*(?:\|\s*([^}]+?)\s*)?\}\}/i);
		if (m) {
			const single = m[1].trim();
			const plural = m[2] !== undefined ? m[2].trim() : single;
			const newText = parseInt(String($1)) === 1 ? single : plural;
			text = text.replace(m[0], newText);
		}
		return text;
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

/**
 * @typedef {object} UserList
 * @property {UserListItem[]} [user]
 * @property {IPFieldContent} [ipv4]
 * @property {IPFieldContent} [ipv6]
 */

class BlockField {

	/**
	 * @param {OO.ui.FieldsetLayout} fieldset
	 * @param {UserList} list
	 */
	constructor(fieldset, list) {

		/**
		 * Maps from usernames to {@link UserListItem} instances.
		 *
		 * @type {Map<string, UserListItem>}
		 * @readonly
		 */
		this.checkboxMap = new Map();

		const /** @type {UserListItem[]} */ userList = [];
		if (list.user) userList.push(...list.user);
		if (list.ipv4) userList.push(...list.ipv4.items);
		if (list.ipv6) userList.push(...list.ipv6.items);
		for (const item of userList) {
			const username = item.getUsername();
			this.checkboxMap.set(username, item);
		}

		// Block targets
		const targetField = new OO.ui.FieldsetLayout({
			label: getMessage('checkuser-investigateblock-target')
		});
		/**
		 * The target selector widget.
		 *
		 * @type {mw.widgets.UsersMultiselectWidget}
		 */
		this.target = new mw.widgets.UsersMultiselectWidget({
			inputPosition: 'outline',
			orientation: 'horizontal',
			placeholder: getMessage('mw-widgets-usersmultiselect-placeholder'),
			api: new mw.Api(getApiOptions()),
			ipAllowed: true,
			ipRangeAllowed: true
		});
		/**
		 * Tracks change events to the {@link target} widget, in order to prevent circular
		 * actions from taking place in its event handlers.
		 *
		 * @type {boolean}
		 */
		this.inChangeEvent = false;

		// this.bindTagsWithCheckboxes();
		this.bindCheckboxesWithTags();

		const investigateButton = this.createInvestigateButton();
		targetField.addItems([
			new OO.ui.FieldLayout(this.target),
			new OO.ui.FieldLayout(investigateButton)
		]);

		// Block actions
		const actionField = new OO.ui.FieldsetLayout({
			label: getMessage('checkuser-investigateblock-actions')
		});
		const blockEmail = new OO.ui.CheckboxInputWidget();
		const blockTalk = new OO.ui.CheckboxInputWidget();
		const reblock = new OO.ui.CheckboxInputWidget();
		actionField.addItems([
			new OO.ui.FieldLayout(blockEmail, {
				label: getMessage('checkuser-investigateblock-email-label'),
				align: 'inline'
			}),
			new OO.ui.FieldLayout(blockTalk, {
				label: getMessage('checkuser-investigateblock-usertalk-label'),
				align: 'inline'
			}),
			new OO.ui.FieldLayout(reblock, {
				label: getMessage('checkuser-investigateblock-reblock-label'),
				align: 'inline'
			}),
		]);

		// Block reasons
		const reasonField = new OO.ui.FieldsetLayout({
			label: getMessage('checkuser-investigateblock-reason')
		});
		const reason1 = new OO.ui.DropdownWidget({
			menu: {
				items: BlockField.createReasonMenuItems()
			},
			classes: ['ih-dropdown-reducedmaxheight']
		});
		reason1.getMenu().selectItemByData('');
		const reason2 = new OO.ui.DropdownWidget({
			menu: {
				items: BlockField.createReasonMenuItems()
			},
			classes: ['ih-dropdown-reducedmaxheight']
		});
		reason2.getMenu().selectItemByData('');
		const reasonC = new OO.ui.TextInputWidget();
		reasonField.addItems([
			new OO.ui.FieldLayout(reason1),
			new OO.ui.FieldLayout(reason2),
			new OO.ui.FieldLayout(reasonC)
		]);

		this.block = new OO.ui.ButtonWidget({
			label: (() => {
				const msg = getMessage('blocklink');
				return msg[0].toUpperCase() + msg.slice(1);
			})(),
			flags: ['progressive', 'primary'],
			disabled: true
		});
		this.block.off('click').on('click', () => this.blockUsers());

		const blockButtonLayout = new OO.ui.FieldLayout(this.block);

		/**
		 * A loading icon placed next to the block button.
		 *
		 * @type {JQuery<HTMLImageElement>}
		 * @readonly
		 * @private
		 */
		this.$spinner = $('<img>');
		this.$spinner
			.prop('src', 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Ajax_loader_metal_512.gif')
			.css({
				verticalAlign: 'middle',
				height: '1.4em',
				border: 0,
				marginLeft: '0.5em'
			})
			.hide();
		blockButtonLayout.$body.append(this.$spinner);

		fieldset.addItems([
			targetField,
			actionField,
			reasonField,
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
				for (const [username, item] of this.checkboxMap) {
					if (removed.has(username)) {
						item.checkbox.setSelected(false);
					} else if (added.has(username)) {
						item.checkbox.setSelected(true);
					}
				}
			}
			previousItems = currentData;
			this.inChangeEvent = false;
		});
	}

	/**
	 * Binds changes in checkboxes in username lists with the tag selector widget,
	 * so that unchecking triggers tag removal and checking triggers tag addition.
	 *
	 * @private
	 */
	bindCheckboxesWithTags() {
		for (const [username, item] of this.checkboxMap) {
			this.target.addAllowedValue(item.getUsername());
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
		}
	}

	/**
	 * Creates a button to open Special:Investigate on a new tab, inheriting usernames
	 * selected in {@link target}.
	 *
	 * @returns {OO.ui.ButtonWidget}
	 * @private
	 */
	createInvestigateButton() {
		const button = new OO.ui.ButtonWidget({
			label: getMessage('checkuser-investigate'),
			disabled: true
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

		const { IP } = ipWiki;
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
	 * Parses the `ipbreason-dropdown` message to an array of `OO.ui.OptionWidget` instances.
	 *
	 * @returns {OO.ui.OptionWidget[]}
	 * @private
	 */
	static createReasonMenuItems() {
		// Adapted from Html::listDropdownOptions
		const /** @type {Record<string, string | Record<string, string>>} */ options = {};
		let /** @type {string | false} */optgroup = false;

		for (const rawOption of getMessage('ipbreason-dropdown').split('\n')) {
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
		const /** @type {OO.ui.OptionWidget[]} */ items = [
			new OO.ui.MenuOptionWidget({ data: '', label: getMessage('htmlform-selectorother-other') })
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
	 * @private
	 */
	blockUsers() {
		const targets = this.target.getSelectedUsernames();
		if (!targets.length) {
			// The user should never get caught in this block because we disable the block button
			// when no user is selected; hence the message is not translated
			OO.ui.alert('No users are selected as the block targets.');
			return;
		}

		this.block.setDisabled(true);
		this.$spinner.show();

		// Ensure users and IPs aren't mixed
		let hasUser = false, hasIp = false;
		for (const target of targets) {
			const isIp = mw.util.isIPAddress(target, true);
			hasUser = hasUser || !isIp;
			hasIp = hasIp || !isIp;
			if (hasUser && hasIp) break;
		}

		BlockField.confirmUserMix(hasUser && hasIp).then((confirmed) => {
			if (!confirmed) return;
		});

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
					.html(getMessage('wikimedia-checkuser-investigateblock-warning-ips-and-users-in-targets')),
				{ size: 'large' }
			);
		} else {
			return $.Deferred().resolve(true);
		}
	}

	/**
	 *
	 * @param {string[]} targets
	 */
	static checkBlocks(targets) {

	}

}

// ********************************************* ENTRY POINT *********************************************

init();

// *******************************************************************************************************
})();
// </nowiki>