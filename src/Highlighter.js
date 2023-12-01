// @ts-check
/* global mw */
//<nowiki>
(() => {

const HL = 'Highlighter';

function init() {
	if (mw.config.get('wgNamespaceNumber') !== -1 ||
		location.href.includes('/api.php')
	) {
		return;
	}
	const modules = [
		'mediawiki.util',
		'mediawiki.api'
	];
	$.when(mw.loader.using(modules), $.ready).then(() => {
		if (mw.util.$content.find('a').length) {
			createPortletLink();
		}
	});
}

/**
 * @returns {HTMLLIElement?}
 */
function createPortletLink() {
	const portlet = mw.util.addPortletLink(
		'p-cactions',
		'#',
		HL,
		void 0,
		'Highlight links of users who have at least 1 global editcount.',
		'g'
	);
	if (portlet) {
		portlet.addEventListener('click', highlight);
	} else {
		console.error(HL + ': Failed to create a portlet link.');
	}
	return portlet;
}

/**
 * @this {HTMLLIElement}
 * @param {MouseEvent} _e
 */
async function highlight(_e) {
	const links = collectLinks();
	const users = Object.keys(links);
	const len = users.length;
	let cnt = 0;
	if (len) {
		const usersWithContribs = await getUsersWithContribs(users);
		for (const user in links) {
			if (usersWithContribs.includes(user)) {
				cnt++;
				links[user].forEach((anchor) => {
					anchor.style.backgroundColor = '#FEC493';
				});
			}
		}
	}
	mw.notify(`${cnt}/${len} users highlighted.`);
	this.remove();
}

/**
 * @typedef {Record<string, HTMLAnchorElement[]>} UserLinks Keyed by usernames (in which spaces are represented by underscores)
 */
/**
 * @returns {UserLinks}
 */
function collectLinks() {

	const wgNamespaceIds = mw.config.get('wgNamespaceIds');
	const userAliases = Object.keys(wgNamespaceIds).reduce(/** @param {string[]} acc */ (acc, alias) => {
		const num = wgNamespaceIds[alias];
		if (num === 2) {
			acc.push(alias);
		}
		return acc;
	}, []);
	const regex = {
		article: new RegExp(mw.config.get('wgServer') + mw.config.get('wgArticlePath').replace('$1', '([^#?]+)')),
		script: new RegExp(mw.config.get('wgServer') + mw.config.get('wgScript') + '\\?title=([^#&]+)'),
		user: new RegExp('^(?:' + userAliases.join('|') + '):([^/#]+)$', 'i')
	};

	return Array.prototype.reduce.call(
		document.querySelectorAll('.mbl-userlink'),
		/**
		 * @param {UserLinks} acc
		 * @param {HTMLAnchorElement} a
		 */
		(acc, a) => {

			const href = a.href;
			if (!href) return acc;

			let /** @type {RegExpExecArray?} */ m,
				/** @type {string} */ pagetitle;
			if ((m = regex.article.exec(href))) {
				pagetitle = m[1];
			} else if ((m = regex.script.exec(href))) {
				pagetitle = m[1];
			} else {
				return acc;
			}
			pagetitle = decodeURIComponent(pagetitle).replace(/ /g, '_');

			if (!(m = regex.user.exec(pagetitle))) {
				return acc;
			}
			let username = m[1].trim();
			if (!mw.util.isIPAddress(username, true) && !/[/@#<>[\]|{}:]|^(\d{1,3}\.){3}\d{1,3}$/.test(username)) {
				if (!/^[\u10A0-\u10FF]/.test(username)) { // ucFirst, except for Georgean letters
					username = username.charAt(0).toUpperCase() + username.slice(1);
				}
				if (acc[username]) {
					acc[username].push(a);
				} else {
					acc[username] = [a];
				}
			}

			return acc;

		},
		Object.create(null)
	);

}

/**
 * @param {string[]} users
 * @returns {Promise<string[]>} Users with global edits
 */
async function getUsersWithContribs(users) {

	const api = new mw.Api();
	/**
	 * @typedef ApiResponseMetaGlobaluserinfo
	 * @type {{
	 * 	missing?: boolean;
	 * 	home?: string;
	 * 	id?: number;
	 * 	registration?: string;
	 * 	name?: string;
	 * 	editcount?: number;
	 * }}
	 */
	/**
	 * @param {string} user
	 * @returns {JQueryPromise<boolean?>}
	 */
	const req = (user) => {
		return api.get({
			action: 'query',
			meta: 'globaluserinfo',
			guiuser: user,
			guiprop: 'editcount',
			formatversion: '2'
		}).then((res) => {
			/** @type {ApiResponseMetaGlobaluserinfo=} */
			const resGui = res && res.query && res.query.globaluserinfo;
			if (resGui && typeof resGui.editcount === 'number') {
				return !!resGui.editcount;
			}
			return null;
		}).catch((_, err) => {
			console.warn(err);
			return null;
		});
	};

	const /** @type {JQueryPromise<boolean?>[]} */ deferreds = [];
	users.forEach((user) => {
		deferreds.push(req(user));
	});
	const hasEdits = await Promise.all(deferreds);
	return users.filter((_, i) => hasEdits[i]);

}

init();

})();
//</nowiki>