//<nowiki>
(() => {
// ****************************************************************************************************************

// Across-the-board variables

/** The script name. */
const MD = 'MassDelete';

// Check user rights
const groupsWithRights = {
	delete: ['eliminator', 'sysop', 'interface-admin', 'global-deleter', /*'global-sysop',*/ 'new-wikis-importer', 'staff', 'steward', 'sysadmin'],
    undelete: ['eliminator', 'sysop', 'global-deleter', /*'global-sysop',*/ 'new-wikis-importer', 'staff', 'steward', 'sysadmin', 'wmf-researcher'],
    apihighlimits: ['sysop', /*'bot',*/ 'apihighlimits-requestor', /*'global-bot',*/ /*'global-sysop',*/ 'staff', 'steward', 'sysadmin', 'wmf-researcher']
};
const rights = {
	delete: false,
	undelete: false,
	apihighlimits: false
};
// @ts-ignore
for (const group of mw.config.get('wgUserGroups').concat(mw.config.get('wgGlobalGroups') || [])) {
	rights.delete = rights.delete || groupsWithRights.delete.includes(group);
	rights.undelete = rights.undelete || groupsWithRights.undelete.includes(group);
	rights.apihighlimits = rights.apihighlimits || groupsWithRights.apihighlimits.includes(group);
}

let lib: WpLibExtra;

// ****************************************************************************************************************

// Main functions

/** Initialize MassDelete. */
function init(): void {

	const modules = [
		'mediawiki.util',
		'mediawiki.api',
		'mediawiki.Title',
		'mediawiki.user'
	];
	const libName = 'ext.gadget.WpLibExtra';
	const onMassDelete = mw.config.get('wgNamespaceNumber') === -1 && /^(massdelete|md|一括削除)$/i.test(mw.config.get('wgTitle'));
	if (onMassDelete) {
		modules.unshift(libName);
		$(loadInterface);
	}
	
	$.when(modules, $.ready).then((require) => {
		if (onMassDelete) {
			// @ts-ignore
			lib = require(libName);
			createStyleTag();
			createInterface();
		} else {
			// Add portlet link to the special page
			mw.util.addPortletLink(
				'p-cactions',
				mw.util.getUrl('Special:一括削除'),
				'一括削除',
				'ca-md',
				'複数のページを一括削除する'
			);
		}
	});

}

/**
 * Replace the content body with a 'now loading' message.
 * @returns
 */
function loadInterface(): {header?: HTMLHeadingElement|null; body?: HTMLDivElement|null} {

	document.title = MD + ' - ' + mw.config.get('wgSiteName');

	const header: HTMLHeadingElement|null = 
		document.querySelector('.mw-first-heading') ||
		document.querySelector('.firstHeading') ||
		document.querySelector('#firstHeading');
	const body: HTMLDivElement|null =
		document.querySelector('.mw-body-content') ||
		document.querySelector('#mw-content-text');
	if (!header || !body) {
		return {};
	}
	header.textContent = '一括削除';
	if (!document.getElementById('md-container')) {
		body.innerHTML = 'インターフェースを読み込み中 ';
		body.appendChild(lib.getIcon('load'));
	}

	return {header, body};

}

/** Create a style tag for the MassDelete interface. */
function createStyleTag(): void {
	const style = document.createElement('style');
	style.textContent = '';
	document.head.appendChild(style);
}

/** Create the MassDelete interface. */
function createInterface() {

	const {header, body} = loadInterface();
	if (!header || !body || !lib) {
		mw.notify('インターフェースの読み込みに失敗しました。', {type: 'error', autoHide: false});
		return;
	}

	// Create container and make it the only child of the body content
	const $container = $('<div>').prop('id', 'md-container');
	body.innerHTML = '';
	body.appendChild($container[0]);

}

// ****************************************************************************************************************

// Entry point
init();

// ****************************************************************************************************************
})();
//</nowiki>
export {};