/************************************************************************\
 * ShortPagesForDeletion
 * Visualize which pages are AfD-ed or SD-ed on [[Special:Shortpages]].
 *
 * @version 1.0.2
 * @author Dragoniez
\************************************************************************/
/* global mw */
//<nowiki>
(() => {
//***********************************************************************

if (mw.config.get('wgCanonicalSpecialPageName') !== 'Shortpages') {
	return;
}

/** @type {mw.Api} */
let api;
$.when($.ready, mw.loader.using('mediawiki.api')).then(() => {
	api = new mw.Api();
	init();
});

//***********************************************************************

function init() {

	/** @type {JQuery<HTMLOListElement>} */
	const $ol = $('ol.special');
	if (!$ol.length) {
		return;
	}

	const pages = getTitles($ol);
	if (!pages.length) {
		return;
	}

	$.when(
		getCatMembers('削除依頼中のページ'),
		getCatMembers('即時削除対象のページ'),
	).then((afd, sd) => {

		if (!afd.length && !sd.length) {
			return;
		}

		pages.forEach(({$li, title}) => {
			const states = [];
			if (afd.indexOf(title) !== -1) {
				states.push('削除依頼中');
			}
			if (sd.indexOf(title) !== -1) {
				states.push('即時削除依頼中');
			}
			if (states.length) {
				$li.append(` (${states.join(', ')})`);
			}
		});

	});

}

/**
 * @typedef {{$li: JQuery<HTMLLIElement>; title: string;}} TitleObject
 */
/**
 * Extract titles from the list of short pages.
 * @param {JQuery<HTMLOListElement>} $ol
 * @returns {TitleObject[]}
 */
function getTitles($ol) {
	const articleRegex = new RegExp(mw.config.get('wgArticlePath').replace('$1', '([^#?]+)'));
	return Array.from($ol.children('li')).reduce(/** @param {TitleObject[]} acc */ (acc, li) => {
		const $li = $(li);
		const href = $li.children('bdi').children('a').attr('href');
		let m;
		if (href && (m = articleRegex.exec(href))) {
			const title = decodeURIComponent(m[1]);
			acc.push({$li, title});
		}
		return acc;
	}, []);
}

/**
 * Get all pages in a given category.
 * @param {string} cat Which category to enumerate, without prefix.
 * @param {object} [cont]
 * @returns {JQueryPromise<string[]>}
 */
function getCatMembers(cat, cont = {}) {
	/** @type {string[]} */
	const ret = [];
	return api.get({
		action: 'query',
		formatversion: '2',
		list: 'categorymembers',
		cmtitle: 'Category:' + cat,
		cmprop: 'title',
		cmlimit: 'max',
		...cont
	}).then((res) => {
		const resCm = res && res.query && res.query.categorymembers;
		if (resCm) {
			ret.push(...resCm.map((obj) => obj.title));
		}
		if (res && res.continue) {
			return getCatMembers(cat, res.continue).then((result) => {
				ret.push(...result);
				return ret;
			});
		} else {
			return ret;
		}
	}).catch((_, err) => {
		console.error(err);
		return ret;
	});
}

//***********************************************************************
})();
//</nowiki>