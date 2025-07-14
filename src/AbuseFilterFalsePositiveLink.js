/**
 * AbuseFilterFalsePositiveLink
 *
 * Adds a link to [[WP:EF/FP]] in the navigation toolbar
 * on [[Special:AbuseFilter]] and [[Special:AbuseLog]].
 *
 * @version 1.0.0
 * @author [[User:Dragoniez]]
 */
// @ts-check
/* global mw */
// <nowiki>
$.when(mw.loader.using('mediawiki.util'), $.ready).then(function() {

	const spName = mw.config.get('wgCanonicalSpecialPageName');
	if (!(spName === 'AbuseFilter' || spName === 'AbuseLog')) {
		return;
	}

	const title = 'Wikipedia:編集フィルター/誤作動/報告';
	const href = mw.util.getUrl(title);
	const label = '誤作動報告';

	// vector-2022, minerva
	const portletLink = mw.util.addPortletLink('p-associated-pages', href, label);
	if (portletLink) {
		return;
	}

	// vector, monobook, timeless
	const afNav = document.querySelector('.mw-abusefilter-navigation');
	if (afNav) {
		const children = afNav.childNodes;
		for (let i = children.length - 1; i >= 0; i--) {
			const node = children[i];

			// Find a `#text` node with a closing parenthesis
			if (node.nodeType === 3 && node.nodeValue === ')') {
				const link = document.createElement('a');
				link.href = href;
				link.textContent = label;
				link.title = title;
				afNav.insertBefore(document.createTextNode(' | '), node);
				afNav.insertBefore(link, node);
				return;
			}
		}
	}

});
// </nowiki>