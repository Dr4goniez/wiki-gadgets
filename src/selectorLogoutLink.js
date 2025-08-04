/**
 * Returns the selector for the logout button, defined in `resources/Resources.php`.
 * Only the Minerva skin overrides this in its own `Hooks.php`.
 *
 * @see https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/refs/heads/master/resources/Resources.php
 * @see https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/skins/MinervaNeue/+/refs/heads/master/includes/Hooks.php
 * @see https://codesearch.wmcloud.org/search/?q=%5CbselectorLogoutLink%5Cb
 */
// @ts-check
/* global mw */
//<nowiki>
module.exports = (() => {
	switch (mw.config.get('skin')) {
		case 'minerva': return 'a.menu__item--logout[data-mw="interface"]';
		default: return '#pt-logout a[data-mw="interface"]';
	}
})();
//</nowiki>