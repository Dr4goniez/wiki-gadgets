/************************************************************************\
 * ShortPagesForDeletion
 *
 * Visualize which pages are AfD-ed or SD-ed on [[Special:Shortpages]].
 *
 * @version 1.1.0
 * @author [[User:Dragoniez]]
\************************************************************************/
/* global mw */
//<nowiki>
(() => {
//***********************************************************************

if (mw.config.get('wgCanonicalSpecialPageName') !== 'Shortpages') return;

/** @type {mw.Api} */
let api;

$.when($.ready, mw.loader.using('mediawiki.api')).then(() => {
	api = new mw.Api();

	const /** @type {JQuery<HTMLOListElement>} */ $ol = $('ol.special');
	if (!$ol.length) return;

	const titleBatches = getTitles($ol);
	if (!titleBatches.length) return;

	/**
	 * Depending on the `&limit=` query parameter and whether the user has `apihighlimits`,
	 * we may need to perform several continued API requests. Waiting for all of these to
	 * finish may take time, and users without the permission would find the script execution
	 * slow. For better user experience, we reflect the result to the DOM each time we get
	 * a renponse from the API.
	 *
	 * @param {TitleMap[]} titleMap Array of title → <li> mappings, split by batch.
	 * @param {number} iter Current batch index.
	 */
	(function execute(titleMap, iter) {
		const batch = titleMap[iter];
		queryCategories([...batch.keys()]).then((map) => {
			if (map) {
				for (const [title, { afd, csd }] of map) {
					const $li = batch.get(title);
					if (!$li) continue;

					const /** @type {string[]} */ states = [];
					if (afd) states.push('削除依頼中');
					if (csd) states.push('即時削除依頼中');
					if (states.length) $li.append(` (${states.join(', ')})`);
				}
			}
			if (titleMap[++iter]) {
				execute(titleMap, iter);
			}
		});
	})(titleBatches, 0);
});

/**
 * @typedef {Map<string, JQuery<HTMLLIElement>>} TitleMap
 */
/**
 * Extracts page titles from the short pages list and chunks them by API limit.
 *
 * @param {JQuery<HTMLOListElement>} $ol
 * @returns {TitleMap[]} Array of maps: title => list item element
 */
function getTitles($ol) {
	const articleRegex = new RegExp(mw.config.get('wgArticlePath').replace('$1', '([^#?]+)'));
	const apilimit = (mw.config.get('wgUserGroups') || []).includes('sysop') ? 500 : 50;

	const /** @type {TitleMap[]} */ ret = [];
	$ol.children('li').each(function() {
		const $li = $(this);
		const href = $li.children('bdi').children('a').attr('href');
		let m;
		if (href && (m = articleRegex.exec(href))) {
			const title = decodeURIComponent(m[1]).replace(/_/g, ' ');
			if (!ret.length || ret[ret.length - 1].size === apilimit) {
				ret.push(new Map());
			}
			ret[ret.length - 1].set(title, $li);
		}
	});
	return ret;
}

const CAT_AFD = 'Category:削除依頼中のページ';
const CAT_CSD = 'Category:即時削除対象のページ';

/**
 * @typedef {Map<string, { afd: boolean; csd: boolean; }>} CategoryMap
 */
/**
 * Checks which of the given titles are in AFD or CSD categories.
 *
 * @param {string[]} titles Page titles to query.
 * @returns {JQueryPromise<CategoryMap?>} A map of title → status object, or `null` on failure.
 */
function queryCategories(titles) {
	return api.post({
		action: 'query',
		titles: titles.join('|'),
		prop: 'categories',
		clprop: '',
		clcategories: [CAT_AFD, CAT_CSD].join('|'),
		formatversion: '2'
	}).then((res) => {
		/** @type {{ title: string; categories: { ns: number; title: string; }[] | undefined; }[]=} */
		const pages = res && res.query && res.query.pages;
		if (!pages) return null;

		const /** @type {CategoryMap} */ ret = new Map();
		pages.forEach(({ title, categories }) => {
			if (!categories) return;
			let afd = false, csd = false;
			categories.forEach(({ title: cat }) => {
				afd = afd || cat === CAT_AFD;
				csd = csd || cat === CAT_CSD;
			});
			if (afd || csd) ret.set(title, { afd, csd });
		});
		return ret;
	}).catch((_, err) => {
		console.error(err);
		return null;
	});
}

//***********************************************************************
})();
//</nowiki>