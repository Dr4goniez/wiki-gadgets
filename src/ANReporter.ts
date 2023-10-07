//<nowiki>
(() => {
// ******************************************************************************************

// Across-the-board variables

let lib: WpLibExtra;

// ******************************************************************************************

// Main functions

/** Initialize the script. */
function init() {

	// Is the user autoconfirmed?
	if (mw.config.get('wgUserGroups').indexOf('autoconfirmed') === -1) {
		mw.notify('あなたは自動承認されていません。AN Reporterを終了します。', {type: 'warn'});
		return;
	}

	const onConfig = mw.config.get('wgNamespaceNumber') === -1 && /^(ANReporterConfig|ANRC)$/i.test(mw.config.get('wgTitle'));

	const libName = 'ext.gadget.WpLibExtra';
	mw.loader.using(libName).then((require) => {

		lib = require(libName);
		if (typeof (lib && lib.version) !== 'string') {
			return;
		}
		createStyleTag();

		if (onConfig) {

			$(loadConfigInterface); // Show a 'now loading' message as soon as the DOM gets ready

			const modules = [
				'oojs-ui',
			];
			$.when(mw.loader.using(modules), $.ready).then(createConfigInterface);

		} else {

			const modules = [
				'mediawiki.util',
				'mediawiki.api',
				'mediatiki.Title',
				'oojs-ui',
			];
			$.when(mw.loader.using(modules), $.ready).then(() => {
				const portlet = createPortletLink();
				if (!portlet) {
					return;
				}
				portlet.addEventListener('click', (e) => {
					e.preventDefault();
					// OPEN DIALOG
				});
			});

		}

	});

}

/**
 * Create a /<style> tag for the script.
 */
function createStyleTag(): void {
	const style = document.createElement('style');
	document.head.appendChild(style);
}

/**
 * Replace the content body with a 'now loading' message.
 * @returns
 */
function loadConfigInterface(): {
	header: HTMLHeadingElement|null;
	body: HTMLDivElement|null;
} {

	document.title = 'ANReporterConfig' + ' - ' + mw.config.get('wgSiteName');

	const header: HTMLHeadingElement|null = 
		document.querySelector('.mw-first-heading') ||
		document.querySelector('.firstHeading') ||
		document.querySelector('#firstHeading');
	const body: HTMLDivElement|null =
		document.querySelector('.mw-body-content') ||
		document.querySelector('#mw-content-text');
	if (!header || !body) {
		return {header: null, body: null};
	}
	header.textContent = 'AN Reporterの設定';
	body.innerHTML = 'インターフェースを読み込み中 ';
	body.appendChild(lib.getIcon('load'));

	return {header, body};

}

/**
 * Create the config interface.
 * @returns
 */
function createConfigInterface(): void {

	const {header, body} = loadConfigInterface();
	if (!header || !body) {
		mw.notify('インターフェースの読み込みに失敗しました。', {type: 'error', autoHide: false});
		return;
	}

	const $container = $('<div>').prop('id', 'anrc-container');
	body.innerHTML = '';
	body.appendChild($container[0]);
	new Config($container);

}

class Config {

	fieldset: OO.ui.FieldsetLayout;
	reasons: OO.ui.MultilineTextInputWidget;
	blockCheck: OO.ui.CheckboxInputWidget;
	duplicateCheck: OO.ui.CheckboxInputWidget;
	watchUser: OO.ui.CheckboxInputWidget;
	// headerColor
	// backgroundColor
	// portletlinkPosition


	/**
	 * @param $container The container in which to create config options.
	 */
	constructor($container: JQuery<HTMLElement>) {

		this.fieldset = new OO.ui.FieldsetLayout({
			id: 'anrc-body'
		});
	
		this.reasons = new OO.ui.MultilineTextInputWidget({ 
			placeholder: '理由ごとに改行'
		});
		this.blockCheck = new OO.ui.CheckboxInputWidget();
		this.duplicateCheck = new OO.ui.CheckboxInputWidget();
		this.watchUser = new OO.ui.CheckboxInputWidget();
	
		this.fieldset.addItems([
			new OO.ui.FieldLayout(this.reasons, {
				label: '定形理由',
				align: 'top'
			}),
			new OO.ui.FieldLayout(this.blockCheck, {
				label: 'ブロックチェック',
				align: 'inline',
				help: '報告時、既に報告対象者がブロック済みか否かをチェック'
			}),
			new OO.ui.FieldLayout(this.duplicateCheck, {
				label: '定形理由',
				align: 'inline',
				help: '報告時、既に報告対象者が報告済みか否かをチェック'
			}),
			new OO.ui.FieldLayout(this.watchUser, {
				label: '定形理由',
				align: 'inline',
				help: '報告時、報告対象者をウォッチリストに登録するか否か'
			}),
		]);

		$container.append(this.fieldset.$element);

	}

}

/** Create a '報告' portlet link. */
function createPortletLink(): HTMLLIElement|null {

	let portletlinkPosition: string;
	switch(mw.config.get('skin')) {
		case 'vector':
		case 'vector-2022':
			portletlinkPosition = 'p-views';
			break;
		case 'minerva':
			portletlinkPosition = 'p-personal';
			break;
		default: // monobook, timeless, or something else
			portletlinkPosition = 'p-cactions';
	}

	const portlet = mw.util.addPortletLink(
		portletlinkPosition,
		'#',
		'報告',
		'ca-anr',
		'管理者伝言板に利用者を報告',
		undefined,
		'#ca-move'
	);
	return portlet || null;

}

// ******************************************************************************************

// Entry point
init();

// ******************************************************************************************
})();
//</nowiki>