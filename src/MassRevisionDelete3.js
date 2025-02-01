/*********************************************************************************************\

	MassRevisionDelete

	Create an interface to delete multiple revisions at one fell swoop when the script
	user visits a user's contributions page.

	@link https://ja.wikipedia.org/wiki/Help:MassRevisionDelete
	@author [[User:Dragoniez]]
	@version 3.0.0

\*********************************************************************************************/
// @ts-check
/* global mw, OO */
(() => {
//*********************************************************************************************

// Run the script only on [[Special:Contributions]] and [[Special:DeletedContributions]]
/** @type {boolean} */
let isDeletedContribs;
switch (mw.config.get('wgCanonicalSpecialPageName')) {
	case 'Contributions':
		isDeletedContribs = false;
		break;
	case 'DeletedContributions':
		isDeletedContribs = true;
		break;
	default:
		return;
}

// Run the script only when the current user has the 'deleterevision' user right
const rights = (() => {
	// @ts-ignore
	const userGroups = (mw.config.get('wgUserGroups') || []).concat(mw.config.get('wgGlobalGroups', []));
	const revdel = userGroups.some((group) => ['sysop', 'eliminator', 'suppress'].indexOf(group) !== -1);
	const suppress = userGroups.indexOf('suppress') !== -1;
	const AHL = userGroups.some((group) => ['sysop', 'apihighlimits-requestor'].indexOf(group) !== -1);
	return {revdel, suppress, AHL};
})();
if (!rights.revdel) {
	return;
}
const apilimit = rights.AHL ? 500 : 50;

const cls = {
	deleted: 'history-deleted',
	suppressed: 'mw-history-suppressed'
};

//*********************************************************************************************

/** @type {mw.Api} */
let api;
function init() {
	$.when(
		mw.loader.using(['mediawiki.api', 'oojs-ui', 'oojs-ui.styles.icons-movement']),
		$.ready
	).then(() => {
		api = new mw.Api();
		createForm();
	});
}

function createForm() {

	/** @type {JQuery<HTMLUListElement>} */
	const $contribsList = $('ul.mw-contributions-list');
	if (!$contribsList.length || !$contribsList.children('li').length) {
		return;
	}

	// Create a collapsible fieldset layout
	/**
	 * Adapted from:
	 * @link https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/refs/heads/master/includes/htmlform/CollapsibleFieldsetLayout.php
	 */
	const wrapper = new OO.ui.PanelLayout({
		classes: ['mrd-wrapper'],
		expanded: false,
		framed: true,
		padded: true
	});

	const fieldset = new OO.ui.FieldsetLayout({
		classes: ['mw-collapsibleFieldsetLayout', 'mw-collapsible', 'mw-collapsed'],
		label: '一括版指定削除',
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
				.parent()
		// content
		.next('div')
			.addClass('mw-collapsible-content');

	$contribsList.eq(0).before(wrapper.$element);
	mw.hook('wikipage.content').fire(wrapper.$element); // Make the fieldset collapsible

	const input1 = new OO.ui.TextInputWidget({ 
		placeholder: 'A form text field'
	});
	fieldset.addItems([
		new OO.ui.FieldLayout(input1, { 
			label: 'Top-aligned label, providing fastest scanability', 
			align: 'top', 
			help: 'A bit of help',
			helpInline: true
		})
	]);

}

function createStyleTag() {
	const style = document.createElement('style');
	style.textContent =
		'';
	document.head.appendChild(style);
}

//*********************************************************************************************

init();

//*********************************************************************************************
})();