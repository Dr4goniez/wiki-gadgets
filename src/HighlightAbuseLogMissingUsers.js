/*****************************************************************************
	HighlightAbuseLogMissingUsers

	Searches for `action=createaccount` and `action=autocreateaccount` logs
	on [[Special:AbuseLog]], and marks up non-existing users' links in red
	with a dotted underline to make it easier to distinguish account creation
	attempts that succeeded from those that did not.

	@version 1.1.0
	@author [[User:Dragoniez]]
 *****************************************************************************/
// @ts-check
/* global mw */
//<nowiki>
$.when(
	mw.loader.using('mediawiki.api'),
	$.ready
).then(() => {

	if (mw.config.get('wgCanonicalSpecialPageName') !== 'AbuseLog') {
		return;
	}

	/**
	 * Map of usernames to their associated user links.
	 *
	 * @type {Map<string, HTMLAnchorElement[]>}
	 */
	const linkMap = new Map();

	const regex = {
		article: new RegExp(mw.config.get('wgArticlePath').replace('$1', '([^#?]+)')),
		script: new RegExp(mw.config.get('wgScript') + '\\?title=([^#&]+)'),
		user: /^利用者:(.+)$/,
		contribs: /^特別:投稿記録\/(.+)$/
	};

	$('*[data-afl-log-id]').each((_, el) => {
		if (!/「(auto)?createaccount」/.test(el.innerText)) {
			return;
		}

		const firstLink = el.querySelector('a');
		const href = firstLink && firstLink.href;
		if (!href) {
			return;
		}
		const match = regex.article.exec(href) || regex.script.exec(href);
		if (!match) {
			return;
		}
		let username = decodeURIComponent(match[1]);
		username = (regex.user.exec(username) || regex.contribs.exec(username) || [])[1];
		if (!username) {
			return;
		}
		username = username.replace(/_/g, ' ');

		if (!linkMap.has(username)) {
			linkMap.set(username, []);
		}
		/** @type {HTMLAnchorElement[]} */ (linkMap.get(username)).push(firstLink);
	});

	if (!linkMap.size) {
		return;
	}

	const style = document.createElement('style');
	style.id = 'halmu-styles';
	style.textContent =
		'.halmu-missing {' +
			'text-decoration-line: underline;' +
			'text-decoration-style: dotted;' +
			// 'text-decoration-color: var(--color-subtle, #54595d);' +
		'}';
	document.head.append(style);

	const ahGroups = new Set(['sysop', 'apihighlimits-requestor', 'staff', 'steward', 'sysadmin', 'wmf-researcher']);
	const hasAHL = (mw.config.get('wgUserGroups') || [])
		.concat(/** @type {?string[]} */ (mw.config.get('wgGlobalGroups')) || [])
		.some((group) => ahGroups.has(group));
	const apilimit = hasAHL ? 500 : 50;
	const api = new mw.Api();
	const allUsers = Array.from(linkMap.keys());

	/**
	 * @param {number} offset
	 */
	(function execute(offset) {
		const users = allUsers.slice(offset, offset + apilimit);
		return api.post({
			action: 'query',
			list: 'users',
			usprop: '',
			ususers: users,
			formatversion: '2'
		}).then(({ query }) => {
			/** @type {{ userid?: number; name: string; missing?: true; }[]=} */
			const resUsers = query.users;
			if (resUsers) {
				resUsers.forEach(({ name, missing }) => {
					if (!missing) {
						return;
					}
					const anchors = linkMap.get(name);
					if (!anchors) {
						console.warn('Could not find associated anchors for ' + name);
						return;
					}
					anchors.forEach((a) => {
						a.classList.add('new', 'halmu-missing');
						if (!a.title) {
							a.title = '存在しない利用者';
						}
					});
				});
			}
		}).catch((_, err) => {
			console.error(err);
		}).then(() => {
			offset += apilimit;
			if (allUsers[offset]) {
				return execute(offset);
			}
		});
	})(0);

});
//</nowiki>