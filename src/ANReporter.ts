//<nowiki>
(() => {
// ******************************************************************************************

// Across-the-board variables

/** The script name. */
const ANR = 'AN Reporter';

const ANI = 'Wikipedia:管理者伝言板/投稿ブロック';
const ANS = 'Wikipedia:管理者伝言板/投稿ブロック/ソックパペット';
const AN3RR = 'Wikipedia:管理者伝言板/3RR';

let lib: WpLibExtra;
let mwString: MwString;
let idList: IdList;

// ******************************************************************************************

// Main functions

/** Initialize the script. */
function init() {

	// Is the user autoconfirmed?
	if (mw.config.get('wgUserGroups').indexOf('autoconfirmed') === -1) {
		mw.notify('あなたは自動承認されていません。AN Reporterを終了します。', {type: 'warn'});
		return;
	}

	// Shouldn't run on API pages
	if (location.href.indexOf('/api.php') !== -1) {
		return;
	}

	/** Whether the user is on the config page. */
	const onConfig = mw.config.get('wgNamespaceNumber') === -1 && /^(ANReporterConfig|ANRC)$/i.test(mw.config.get('wgTitle'));

	// Load the library and dependent modules, then go on to the main procedure
	loadLibrary(false).then((libReady) => {

		if (!libReady) return;

		// Main procedure
		if (onConfig) {
			// If on the config page, create the interface after loading dependent modules
			$(loadConfigInterface); // Show a 'now loading' message as soon as the DOM gets ready
			const modules = [
				'mediawiki.user', // mw.user.options
				'oojs-ui',
				'oojs-ui.styles.icons-editing-core',
				'oojs-ui.styles.icons-moderation',
				'mediawiki.api', // mw.Api().saveOption
			];
			$.when(mw.loader.using(modules), $.ready).then(() => {
				createStyleTag(Config.merge());
				createConfigInterface();
			});
		} else {
			// If not on the config page, create a portlet link to open the ANR dialog after loading dependent modules
			const modules = [
				'mediawiki.String', // IdList
				'mediawiki.user', // mw.user.options
				'mediawiki.util', // addPortletLink
				'mediawiki.api', // API queries
				'mediawiki.Title', // lib
				'jquery.ui',
			];
			$.when(
				mw.loader.using(modules),
				mw.loader.getScript('https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.13/js/select2.full.js'),
				$.ready
			).then((require) => {
				mwString = require(modules[0]);
				const portlet = createPortletLink();
				if (!portlet) {
					console.error(`${ANR}: ポートレットリンクの作成に失敗しました。`);
					return;
				}
				createStyleTag(Config.merge());
				$('head').append('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.13/css/select2.css">');
				idList = new IdList();
				portlet.addEventListener('click', Reporter.new);
			}).catch((...err) => {
				console.warn(err);
				mw.notify(ANR + ': モジュールの読み込みに失敗しました。', {type: 'error'});
			});
		}

	});

}

/**
 * Load the library.
 * @param dev Whether to load the dev version of the library.
 * @returns
 */
function loadLibrary(dev = false): JQueryPromise<boolean> {
	const libName = 'ext.gadget.WpLibExtra' + (dev ? 'Dev': '');
	const loadLocal = (): JQueryPromise<boolean> => {
		return mw.loader.using(libName)
			.then((require) => { // Load the library
				lib = require(libName);
				if (typeof (lib && lib.version) !== 'string') { // Validate the library
					console.error(`${ANR}: ライブラリの読み込みに失敗しました。`);
					return false;
				}
				return true;
			})
			.catch((...err) => {
				console.error(err);
				return false;
			});
	};
	if (dev) {
		return mw.loader.getScript('https://test.wikipedia.org/w/load.php?modules=' + libName).then(loadLocal).catch((...err) => {
			console.error(err);
			return false;
		});
	} else {
		return loadLocal();
	}
}

/**
 * Get the first heading and content body, replacing the latter with a 'now loading' message.
 * @returns
 */
function loadConfigInterface(): {
	heading: HTMLHeadingElement|null;
	content: HTMLDivElement|null;
} {

	// Change the document's title
	document.title = 'ANReporterConfig' + ' - ' + mw.config.get('wgSiteName');

	// Get the first heading and content body
	const heading: HTMLHeadingElement|null =
		document.querySelector('.mw-first-heading') ||
		document.querySelector('.firstHeading') ||
		document.querySelector('#firstHeading');
	const content: HTMLDivElement|null =
		document.querySelector('.mw-body-content') ||
		document.querySelector('#mw-content-text');
	if (!heading || !content) {
		return {heading: null, content: null};
	}

	// Set up the elements
	heading.textContent = ANR + 'の設定';
	content.innerHTML = 'インターフェースを読み込み中 ';
	content.appendChild(lib.getIcon('load'));

	return {heading, content};

}

/**
 * Create the config interface.
 * @returns
 */
function createConfigInterface(): void {

	const {heading, content} = loadConfigInterface();
	if (!heading || !content) {
		mw.notify('インターフェースの読み込みに失敗しました。', {type: 'error', autoHide: false});
		return;
	}

	// Create a config container
	const $container = $('<div>').prop('id', 'anrc-container');
	content.innerHTML = '';
	content.appendChild($container[0]);

	// Create the config body
	new Config($container);

}

/** The config object saved on the server. */
interface ANReporterConfig {
	reasons: string[];
	blockCheck: boolean;
	duplicateCheck: boolean;
	watchUser: boolean;
	watchExpiry: string;
	headerColor: string;
	backgroundColor: string;
	portletlinkPosition: string;
}

/** Class to create/manipulate the config interface. */
class Config {

	$overlay: JQuery<HTMLElement>;
	fieldset: OO.ui.FieldsetLayout;
	reasons: OO.ui.MultilineTextInputWidget;
	blockCheck: OO.ui.CheckboxInputWidget;
	duplicateCheck: OO.ui.CheckboxInputWidget;
	watchUser: OO.ui.CheckboxInputWidget;
	watchExpiry: OO.ui.DropdownWidget;
	headerColor: OO.ui.TextInputWidget;
	backgroundColor: OO.ui.TextInputWidget;
	portletlinkPosition: OO.ui.TextInputWidget;
	saveButton: OO.ui.ButtonWidget;

	/**
	 * The key of `mw.user.options`.
	 */
	static readonly key = 'userjs-anreporter';

	/**
	 * Merge and retrieve the ANReporter config.
	 * @param getDefault If `true`, get the default config. (Default: `false`)
	 * @returns
	 * @requires mw.user
	 */
	static merge(getDefault = false): ANReporterConfig {

		// Default config
		const cfg: ANReporterConfig = {
			reasons: [],
			blockCheck: true,
			duplicateCheck: true,
			watchUser: false,
			watchExpiry: 'infinity',
			headerColor: '#FEC493',
			backgroundColor: '#FFF0E4',
			portletlinkPosition: ''
		};
		if (getDefault) {
			return cfg;
		}

		// Objectify the user config
		const strCfg: string = mw.user.options.get(this.key) || '{}';
		let userCfg: ANReporterConfig;
		try {
			userCfg = JSON.parse(strCfg);
		}
		catch (err) {
			console.warn(err);
			return cfg;
		}

		// Merge the configs
		return Object.assign(cfg, userCfg);

	}

	/**
	 * @param $container The container in which to create config options.
	 * @requires mw.user
	 * @requires oojs-ui
	 * @requires oojs-ui.styles.icons-editing-core
	 * @requires oojs-ui.styles.icons-moderation
	 * @requires mediawiki.api - Used to save the config
	 */
	constructor($container: JQuery<HTMLElement>) {

		// Transparent overlay of the container used to make elements in it unclickable
		this.$overlay = $('<div>').prop('id', 'anrc-container-overlay').hide();
		$container.after(this.$overlay);

		// Get config
		const cfg = Config.merge();

		// Fieldset that stores config options
		this.fieldset = new OO.ui.FieldsetLayout({
			label: 'ダイアログ設定',
			id: 'anrc-options'
		});

		// Create config options
		this.reasons = new OO.ui.MultilineTextInputWidget({
			id: 'anrc-reasons',
			placeholder: '理由ごとに改行',
			rows: 8,
			value: cfg.reasons.join('\n')
		});
		this.blockCheck = new OO.ui.CheckboxInputWidget({
			id: 'anrc-blockcheck',
			selected: cfg.blockCheck
		});
		this.duplicateCheck = new OO.ui.CheckboxInputWidget({
			id: 'anrc-duplicatecheck',
			selected: cfg.duplicateCheck
		});
		this.watchUser = new OO.ui.CheckboxInputWidget({
			id: 'anrc-watchuser',
			selected: cfg.watchUser
		});
		this.watchExpiry = new OO.ui.DropdownWidget({
			id: 'anrc-watchexpiry',
			menu: {
				items: [
					new OO.ui.MenuOptionWidget({
						data: 'infinity',
						label: '無期限'
					}),
					new OO.ui.MenuOptionWidget({
						data: '1 week',
						label: '1週間'
					}),
					new OO.ui.MenuOptionWidget({
						data: '2 weeks',
						label: '2週間'
					}),
					new OO.ui.MenuOptionWidget({
						data: '1 month',
						label: '1か月'
					}),
					new OO.ui.MenuOptionWidget({
						data: '3 months',
						label: '3か月'
					}),
					new OO.ui.MenuOptionWidget({
						data: '6 months',
						label: '6か月'
					}),
					new OO.ui.MenuOptionWidget({
						data: '1 year',
						label: '1年'
					}),
				]
			}
		});
		this.watchExpiry.getMenu().selectItemByData(cfg.watchExpiry);
		this.headerColor = new OO.ui.TextInputWidget({
			id: 'anrc-headercolor',
			value: cfg.headerColor
		});
		this.backgroundColor = new OO.ui.TextInputWidget({
			id: 'anrc-backgroundcolor',
			value: cfg.backgroundColor
		});
		this.portletlinkPosition = new OO.ui.TextInputWidget({
			id: 'anrc-portletlinkposition',
			value: cfg.portletlinkPosition
		});

		// Add the config options to the fieldset
		this.fieldset.addItems([
			new OO.ui.FieldLayout(this.reasons, {
				label: '定形理由',
				align: 'top'
			}),
			new OO.ui.FieldLayout(this.blockCheck, {
				label: 'ブロックチェック',
				align: 'inline',
				help: new OO.ui.HtmlSnippet(
					'報告対象者の既存ブロック設定を、報告時に事前チェックするかを指定します。' +
					'<i>この設定はダイアログ上で変更可能です。</i>'
				)
			}),
			new OO.ui.FieldLayout(this.duplicateCheck, {
				label: '重複報告チェック',
				align: 'inline',
				help: new OO.ui.HtmlSnippet(
					'重複報告の有無を、報告時に事前チェックするかを指定します。' +
					'<i>この設定はダイアログ上で変更可能です。</i>'
				)
			}),
			new OO.ui.FieldLayout(this.watchUser, {
				label: '報告対象者をウォッチ',
				align: 'inline',
				help: new OO.ui.HtmlSnippet(
					'報告対象者をウォッチするか否かを指定します。' +
					'<i>この設定はダイアログ上で変更可能です。</i>'
				)
			}),
			new OO.ui.FieldLayout(this.watchExpiry, {
				label: 'ウォッチ期間',
				align: 'top',
				help: new OO.ui.HtmlSnippet(
					'報告対象者をウォッチする際の期間を設定します。' +
					'<i>この設定はダイアログ上で変更可能です。</i>'
				)
			}),
			new OO.ui.FieldLayout(this.headerColor, {
				label: 'ヘッダー色',
				align: 'top',
				help: new OO.ui.HtmlSnippet(
					'ダイアログのヘッダー色を指定 (見本: ' +
					'<span id="anrc-headercolor-demo" class="anrc-colordemo">ヘッダー色</span>' +
					')'
				),
				helpInline: true
			}),
			new OO.ui.FieldLayout(this.backgroundColor, {
				label: '背景色',
				align: 'top',
				help: new OO.ui.HtmlSnippet(
					'ダイアログの背景色を指定 (見本: ' +
					'<span id="anrc-backgroundcolor-demo" class="anrc-colordemo">背景色</span>' +
					')'
				),
				helpInline: true
			}),
			new OO.ui.FieldLayout(this.portletlinkPosition, {
				label: 'ポートレットID (上級)',
				align: 'top',
				help: new OO.ui.HtmlSnippet(
					'<a href="https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.util" target="_blank">mw.util.addPortletLink</a>の' +
					'<code style="font-family: inherit;">portletId</code>を指定します。未指定または値が無効の場合、使用中のスキンに応じて自動的にリンクの生成位置が決定されます。'
				)
			}),
		]);

		// Append the fieldset to the container (do this here and get DOM elements in it)
		$container.append(this.fieldset.$element);
		const $headerColorDemo = $('#anrc-headercolor-demo').css('background-color', cfg.headerColor);
		const $backgroundColorDemo = $('#anrc-backgroundcolor-demo').css('background-color', cfg.backgroundColor);

		// Event listeners
		let headerColorTimeout: NodeJS.Timeout;
		this.headerColor.$input.off('input').on('input', function(this: HTMLInputElement) {
			// Change the background color of span that demonstrates the color of the dialog header
			clearTimeout(headerColorTimeout);
			headerColorTimeout = setTimeout(() => {
				$headerColorDemo.css('background-color', this.value);
			}, 500);
		});

		let backgroundColorTimeout: NodeJS.Timeout;
		this.backgroundColor.$input.off('input').on('input', function(this: HTMLInputElement) {
			// Change the background color of span that demonstrates the color of the dialog body
			clearTimeout(backgroundColorTimeout);
			backgroundColorTimeout = setTimeout(() => {
				$backgroundColorDemo.css('background-color', this.value);
			}, 500);
		});

		// Buttons
		const $buttonGroup1 = $('<div>').addClass('anrc-buttonwrapper');
		const resetButton = new OO.ui.ButtonWidget({
			label: 'リセット',
			id: 'anrc-reset',
			icon: 'undo',
			flags: 'destructive'
		});
		resetButton.$element.off('click').on('click', () => {
			this.reset();
		});
		$buttonGroup1.append(resetButton.$element);

		const $buttonGroup2 = $('<div>').addClass('anrc-buttonwrapper');
		this.saveButton = new OO.ui.ButtonWidget({
			label: '設定を保存',
			id: 'anrc-save',
			icon: 'bookmarkOutline',
			flags: ['primary', 'progressive']
		});
		this.saveButton.$element.off('click').on('click', () => {
			this.save();
		});
		$buttonGroup2.append(this.saveButton.$element);

		// Append the buttons to the container
		$container.append(
			$buttonGroup1,
			$buttonGroup2
		);

	}

	/**
	 * Reset the options to their default values.
	 */
	reset(): void {
		OO.ui.confirm('設定をリセットしますか？').then((confirmed) => {

			if (!confirmed) {
				mw.notify('キャンセルしました。');
				return;
			}

			const defaultCfg = Config.merge(true);
			this.reasons.setValue('');
			this.blockCheck.setSelected(defaultCfg.blockCheck);
			this.duplicateCheck.setSelected(defaultCfg.duplicateCheck);
			this.watchUser.setSelected(defaultCfg.watchUser);
			this.watchExpiry.getMenu().selectItemByData(defaultCfg.watchExpiry);
			this.headerColor.setValue(defaultCfg.headerColor).$input.trigger('input');
			this.backgroundColor.setValue(defaultCfg.backgroundColor).$input.trigger('input');
			this.portletlinkPosition.setValue('');

			mw.notify('設定をリセットしました。', {type: 'success'});

		});
	}

	/**
	 * Set the visibility of the overlay div and toggle accesibility to DOM elements in the config body.
	 * @param show
	 */
	setOverlay(show: boolean): void {
		this.$overlay.toggle(show);
	}

	/**
	 * Save the config.
	 * @requires mediawiki.api
	 */
	save(): void {

		this.setOverlay(true);

		// Change the save button's label
		const $label = $('<span>');
		const spinner = lib.getIcon('load');
		spinner.style.marginRight = '1em';
		$label.append(spinner);
		const textNode = document.createTextNode('設定を保存しています...');
		$label.append(textNode);
		this.saveButton.setIcon(null).setLabel($label);

		// Get config
		const reasons = this.reasons.getValue().split('\n').reduce((acc: string[], r) => {
			const rsn = lib.clean(r);
			if (rsn && !acc.includes(rsn)) {
				acc.push(rsn);
			}
			return acc;
		}, []);
		this.reasons.setValue(reasons.join('\n'));
		const cfg: ANReporterConfig = {
			reasons,
			blockCheck: this.blockCheck.isSelected(),
			duplicateCheck: this.duplicateCheck.isSelected(),
			watchUser: this.watchUser.isSelected(),
			// @ts-ignore
			watchExpiry: this.watchExpiry.getMenu().findSelectedItem().getData(), // Always a string
			headerColor: this.headerColor.getValue(),
			backgroundColor: this.backgroundColor.getValue(),
			portletlinkPosition: this.portletlinkPosition.getValue()
		};
		const strCfg = JSON.stringify(cfg);

		// Save config
		new mw.Api().saveOption(Config.key, strCfg)
			.then(() => {
				mw.user.options.set(Config.key, strCfg);
				return null;
			})
			.catch((code: string, err) => {
				console.warn(err);
				return code;
			})
			.then((err) => {
				if (err) {
					mw.notify(`保存に失敗しました。(${err})`, {type: 'error'});
				} else {
					mw.notify('保存しました。', {type: 'success'});
				}
				this.saveButton.setIcon('bookmarkOutline').setLabel('設定を保存');
				this.setOverlay(false);
			});

	}

}

/** Create a '報告' portlet link. */
function createPortletLink(): HTMLLIElement|null {

	const cfg = Config.merge();

	let portletlinkPosition = '';
	if (cfg.portletlinkPosition) {
		if (document.getElementById(cfg.portletlinkPosition)) {
			portletlinkPosition = cfg.portletlinkPosition;
		} else {
			mw.notify(`AN Reporter: "${cfg.portletlinkPosition}" はポートレットリンクの生成位置として不正なIDです。`, {type: 'error'});
		}
	}
	if (!portletlinkPosition) {
		switch (mw.config.get('skin')) {
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
	}

	const portlet = mw.util.addPortletLink(
		portletlinkPosition,
		'#',
		'報告β',
		'ca-anr2',
		'管理者伝言板に利用者を報告',
		undefined,
		'#ca-move'
	);
	return portlet || null;

}

/**
 * Create a /<style> tag for the script.
 */
function createStyleTag(cfg: ANReporterConfig): void {
	const style = document.createElement('style');
	style.textContent =
		// Config
		'#anrc-container {' +
			'position: relative;' +
		'}' +
		'#anrc-container-overlay {' + // Overlay of the config body, used to make elements in it unclickable
			'width: 100%;' +
			'height: 100%;' +
			'position: absolute;' +
			'top: 0;' +
			'left: 0;' +
			'z-index: 10;' +
		'}' +
		'#anrc-options {' + // Border around fieldset
			'padding: 1em;' +
			'margin-bottom: 1em;' +
			'border: 1px solid silver;' +
		'}' +
		'.anrc-colordemo {' + // Demo color span, change inline to inline-block
			'display: inline-block;' +
			'border: 1px solid silver;' +
		'}' +
		'.anrc-buttonwrapper:not(:last-child),' + // Margin below buttons
		'#anr-dialog-progress-field tr:not(:last-child) {' +
			'margin-bottom: 0.5em;' +
		'}' +
		// Dialog
		'.anr-hidden {' + // Used to show/hide elements on the dialog (by Reporter.toggle)
			'display: none;' +
		'}' +
		'#anr-dialog-progress,' + // One of the main dialog field
		'#anr-dialog-preview-content {' +
			'padding: 1em;' +
		'}' +
		'#anr-dialog-optionfield,' + // The immediate child of #anr-dialog-content
		'#anr-dialog-progress-field {' +
			'padding: 1em;' +
			'margin: 0;' +
			'border: 1px solid #cccccc;' +
		'}' +
		'#anr-dialog-optionfield > legend,' +
		'#anr-dialog-progress-field > legend {' +
			'font-weight: bold;' +
			'padding-bottom: 0;' +
		'}' +
		'.anr-dialog hr {' +
			'margin: 0.8em 0;' +
			'background-color: #cccccc;' +
		'}' +
		'.anr-option-row:not(:last-child) {' + // Margin below every option row
			'margin-bottom: 0.15em;' +
		'}' +
		'.anr-option-row > .anr-option-row-inner:not(.anr-hidden):first-child {' +
			'margin-top: 0.15em;' +
		'}' +
		'.anr-option-userpane-wrapper {' +
			'position: relative;' +
		'}' +
		'.anr-option-userpane-overlay {' +
			'width: 100%;' +
			'height: 100%;' +
			'position: absolute;' +
			'top: 0;' +
			'left: 0;' +
			'z-index: 10;' +
		'}' +
		'.anr-option-row-withselect2 {' +
			'margin: 0.3em 0;' +
		'}' +
		'.anr-option-label {' + // The label div of a row
			'margin-right: 1em;' +
			'float: left;' + // For a juxtaposed div to fill the remaining space
		'}' +
		'.anr-option-wrapper {' +
			'overflow: hidden;' + // Implicit width of 100% (for the child element below)
		'}' +
		'#anr-option-reason, ' +
		'#anr-option-comment,' +
		'.anr-juxtaposed {' + // Assigned by Reporter.wrapElement.
			'box-sizing: border-box;' +
			'width: 100%;' + // Fill the remaining space ("float" and "overflow" are essential for this to work)
		'}' +
		'.select2-container,' + // Set up the font size of select2 options
		'.anr-select2 .select2-selection--single {' +
			'height: auto !important;' +
		'}' +
		'.anr-select2 .select2-selection__rendered {' +
			'padding: 1px 2px;' +
			'font-size: 1em;' +
			'line-height: normal !important;' +
		'}' +
		'.anr-select2 .select2-results__option,' +
		'.anr-select2 .select2-results__group {' +
			'padding: 1px 8px;' +
			'font-size: 0.9em;' +
			'margin: 0;' +
		'}' +
		'.anr-disabledanchor {' + // Disabled anchor
			'pointer: none;' +
			'pointer-events: none;' +
			'color: gray;' +
			'text-decoration: line-through;' +
		'}' +
		'.anr-option-usertype {' + // UserAN type selector in user pane
			'float: right;' +
			'margin-left: 0.3em;' +
		'}' +
		'.anr-option-invalidid,' +
		'.anr-option-usertype-none {' +
			'border: 2px solid red;' +
			'border-radius: 3px;' +
		'}' +
		'.anr-option-removable > .anr-option-label {' + // Change cursor for the label of a user pane that's removable
			'cursor: pointer;' +
		'}' +
		'.anr-option-removable > .anr-option-label:hover {' +
			'background-color: #80ccff;' + // Bluish on hover
		'}' +
		'.anr-checkbox {' +
			'margin-right: 0.5em;' +
		'}' +
		'.anr-dialog label {' + // Get 'vertical-align' to work, ensuring itself as a block element
			'display: inline-block;' +
		'}' +
		'.anr-dialog label > .anr-checkbox,' +
		'.anr-dialog label > .anr-checkbox-label {' +
			'vertical-align: middle;' +
		'}' +
		'.anr-option-hideuser > label {' +
			'margin-left: 0.2em;' +
		'}' +
		'.anr-option-blockstatus > a {' +
			'color: mediumvioletred;' +
		'}' +
		'#anr-dialog-progress-field img {' +
			'margin: 0 0.5em;' +
		'}' +
		'#anr-dialog-progress-field ul {' +
			'margin-top: 0;' +
		'}' +
		'#anr-dialog-preview-body > div {' +
			'border: 1px solid silver;' +
			'padding: 0.2em 0.5em;' +
			'background: white;' +
		'}' +
		'#anr-dialog-preview-body .autocomment a {' +  // Change the color of the section link in summary
			'color: gray;' +
		'}' +
		// Dialog colors
		'.anr-dialog.ui-dialog-content,' +
		'.anr-dialog.ui-corner-all,' +
		'.anr-dialog.ui-draggable,' +
		'.anr-dialog.ui-resizable,' +
		'.anr-dialog .ui-dialog-buttonpane {' +
			`background: ${cfg.backgroundColor};` +
		'}' +
		'.anr-dialog .ui-dialog-titlebar.ui-widget-header,' +
		'.anr-dialog .ui-dialog-titlebar-close {' +
			`background: ${cfg.headerColor} !important;` +
		'}';
	document.head.appendChild(style);
}

/** Object that stores event IDs associated with a user. */
interface EventIds {
	logid?: number;
	diffid?: number;
}

/**
 * The IdList class. Administrates username-ID conversions.
 */
class IdList {

	/**
	 * The list object of objects, keyed by usernames.
	 *
	 * The usernames are formatted by `lib.clean` and spaces in it are represented by underscores.
	 */
	list: {
		[username: string]: EventIds;
	};

	/** Initialize a new `IdList` instance. */
	constructor() {
		this.list = {};
	}

	/**
	 * Get event IDs of a user.
	 * @param username
	 * @returns
	 */
	getIds(username: string): JQueryPromise<EventIds> {
		username = User.formatName(username);
		for (const user in this.list) {
			if (user === username) {
				const {logid, diffid} = this.list[user];
				if (typeof logid === 'number' || typeof diffid === 'number') {
					return $.Deferred().resolve({...this.list[user]});
				}
			}
		}
		return this.fetchIds(username);
	}

	/**
	 * Search for the oldest account creation logid and the diffid of the newest edit of a user.
	 * @param username
	 * @returns
	 */
	private fetchIds(username: string): JQueryPromise<EventIds> {
		const ret: EventIds = {};
		return new mw.Api().get({
			action: 'query',
			list: 'logevents|usercontribs',
			leprop: 'ids',
			letype: 'newusers',
			ledir: 'newer',
			lelimit: 1,
			leuser: username,
			uclimit: 1,
			ucuser: username,
			ucprop: 'ids',
			formatversion: '2'
		}).then((res) => {
			const resLgev = res && res.query && res.query.logevents;
			const resCont = res && res.query && res.query.usercontribs;
			if (resLgev && resLgev[0] && resLgev[0].logid !== void 0) {
				ret.logid = resLgev[0].logid;
			}
			if (resCont && resCont[0] && resCont[0].revid !== void 0) {
				ret.diffid = resCont[0].revid;
			}
			if (Object.keys(ret).length) {
				this.list[username] = {...ret};
			}
			return ret;
		}).catch((_, err) => {
			console.error(err);
			return ret;
		});
	}

	/**
	 * Get a username from a log/diff ID.
	 * @param id
	 * @param type
	 * @returns
	 */
	getUsername(id: number, type: 'logid'|'diffid'): JQueryPromise<string|null> {

		// Attempt to convert the ID without making an HTTP request
		const registeredUsername = this.getRegisteredUsername(id, type);
		if (registeredUsername) {
			return $.Deferred().resolve(registeredUsername);
		}

		// Attempt to convert the ID through an HTTP request
		const fetcher = type === 'logid' ? this.scrapeUsername : this.fetchEditorName;
		return fetcher(id).then((username) => {
			if (username) {
				username = User.formatName(username);
				if (!this.list[username]) {
					this.list[username] = {};
				}
				this.list[username][type] = id;
			}
			return username;
		});

	}

	/**
	 * Attempt to convert an ID to a username based on the current username-ID list (no HTTP request).
	 * @param id
	 * @param type
	 * @returns
	 */
	getRegisteredUsername(id: number, type: 'logid'|'diffid'): string|null {
		for (const user in this.list) {
			const relId = this.list[user][type];
			if (relId === id) {
				return user;
			}
		}
		return null;
	}

	/**
	 * Scrape [[Special:Log]] by a logid and attempt to get the associated username (if any).
	 * @param logid
	 * @returns
	 */
	private scrapeUsername(logid: number): JQueryPromise<string|null> {
		const url = mw.util.getUrl('特別:ログ', {logid: logid.toString()});
		return $.get(url)
			.then((html) => {
				const $newusers = $(html).find('.mw-logline-newusers').last();
				if ($newusers.length) {
					switch ($newusers.data('mw-logaction')) {
						case 'newusers/create':
						case 'newusers/autocreate':
						case 'newusers/create2': // Created by an existing user
						case 'newusers/byemail': // Created by an existing user and password sent off
							return $newusers.children('a.mw-userlink').eq(0).text();
						case 'newusers/forcecreatelocal':
							return $newusers.children('a').last().text().replace(/^利用者:/, '');
						default:
					}
				}
				return null;
			})
			.catch((...err) => {
				console.log(err);
				return null;
			});
	}

	/**
	 * Convert a revision ID to a username.
	 * @param diffid
	 * @returns
	 */
	private fetchEditorName(diffid: number): JQueryPromise<string|null> {
		return new mw.Api().get({
			action: 'query',
			prop: 'revisions',
			revids: diffid,
			formatversion: '2'
		}).then((res) => {
			const resPg = res && res.query && res.query.pages;
			if (!resPg || !resPg.length) return null;
			const resRev = resPg[0].revisions;
			const user = Array.isArray(resRev) && !!resRev.length && <string|undefined>resRev[0].user;
			return user || null;
		}).catch((_, err) => {
			console.log(err);
			return null;
		});
	}

}

/**
 * The object returned by {@link Reporter.getBlockStatus}.
 */
interface BlockStatus {
    usertype: 'ip'|'user'|'other';
    blocked: boolean|null;
}
/** The object that stores data created out of the field values on the dialog. */
interface ReportData {
	/** The page to which to forward the report. */
	page: string;
	/** The section in the page to which to add the report. */
	section: string;
	/** An array of objects that store collected usernames and types. */
	users: UserInfo[];
	/** The value in the reason field with a signature added. */
	reason: string;
	/** The value in the additional comment field (without reportee links, ad links, etc). */
	summary: string;
	/** The checked state of the block check option. */
	blockCheck: boolean;
	/** The checked state of the duplicate report check option. */
	duplicateCheck: boolean;
	/** The value of the watchuser option. If turned on, the property has an expiration time, otherwise `null`. */
	watch: string|null;
}
/** The object that stores the username and type in a user pane. */
interface UserInfo {
	user: string;
	type: antype;
}
/** The object returned by {@link Reporter.processIds}. */
interface ProcessedIds {
	/**
	 * An array of arrays of duplicate usernames in the user panes, which is used to let the script user know
	 * which usernames are duplicates in {@link Reporter.report}.
	 */
	users: string[][];
	/**
	 * An array of usernames in which all IDs have been converted. For `type=none` or IDs that failed to be converted,
	 * the value is `null`.
	 */
	info: (string|null)[];
}

/**
 * The Reporter class. Manipulates the ANR dialog.
 */
class Reporter {

	/** The Reporter config. */
	cfg: ANReporterConfig;
	/** The Reporter dialog. */
	$dialog: JQuery<HTMLDivElement>;
	/** The wrapper of the div to show the progress of a dialog procedure. */
	$progress: JQuery<HTMLDivElement>;
	/** The inner content wrapper of the dialog. */
	$content: JQuery<HTMLDivElement>;
	/** The fieldset that contains main dialog options on $content. */
	$fieldset: JQuery<HTMLFieldSetElement>;
	/** The page selector dropdown. */
	$page: JQuery<HTMLSelectElement>;
	/** The link to (the section in) the page to which to forward the report. */
	$pageLink: JQuery<HTMLAnchorElement>;
	/** The wrapper row for the section selector dropdown for ANI and AN3RR. */
	$sectionWrapper: JQuery<HTMLDivElement>;
	/** The section selector dropdown for ANI and AN3RR. */
	$section: JQuery<HTMLSelectElement>;
	/** The wrapper row for the select2 section selector dropdown for ANS. */
	$sectionAnsWrapper: JQuery<HTMLDivElement>;
	/** The select2 section selector dropdown for ANS. */
	$sectionAns: JQuery<HTMLSelectElement>;
	/** The button to add a new user pane. */
	$addButton: JQuery<HTMLInputElement>;
	/** The collection of user panes. */
	Users: User[];
	/** The wrapper row for the select2 VIP dropdown. */
	$vipWrapper: JQuery<HTMLDivElement>;
	/** The select2 VIP dropdown. */
	$vip: JQuery<HTMLSelectElement>;
	/** The wrapper row for the select2 LTA dropdown. */
	$ltaWrapper: JQuery<HTMLDivElement>;
	/** The select2 LTA dropdown. */
	$lta: JQuery<HTMLSelectElement>;
	/** The select2 predefined reason dropdown. */
	$predefined: JQuery<HTMLSelectElement>;
	/** The text field for report reasons. */
	$reason: JQuery<HTMLTextAreaElement>;
	/** The checkbox for whether to add a comment to the report summary. */
	$addComment: JQuery<HTMLInputElement>;
	/** The text field to specify an additional comment to the report summary. */
	$comment: JQuery<HTMLTextAreaElement>;
	/** The checkbox for whether to check the block statuses of reportees before submitting the report. */
	$checkBlock: JQuery<HTMLInputElement>;
	/** The checkbox for whether to check existing duplicate reports before submitting the report. */
	$checkDuplicates: JQuery<HTMLInputElement>;
	/** The checkbox for whether to watch the reportees. */
	$watchUser: JQuery<HTMLInputElement>;
	/** The dropdown to specify the expiration time of watching the reportees. */
	$watchExpiry: JQuery<HTMLSelectElement>;

	/**
	 * Initializes a `Reporter` instance. This constructor only creates the base components of the dialog, and
	 * asynchronous procedures are externally handled by {@link new}.
	 */
	constructor() {

		this.cfg = Config.merge();
		Reporter.blockStatus = {}; // Reset

		// Create dialog contour
		this.$dialog = $('<div>');
		this.$dialog.prop('title', ANR).css('max-height', '70vh');
		this.$dialog.dialog({
			dialogClass: 'anr-dialog',
			resizable: false,
			height: 'auto',
			width: 'auto',
			modal: true,
			close: function() {
				// Destory the dialog and its contents when closed by any means
				$(this).empty().dialog('destroy');
			}
		});

		// Create progress container
		this.$progress = $('<div>');
		this.$progress
			.prop('id', 'anr-dialog-progress')
			.append(
				document.createTextNode('読み込み中'),
				$(lib.getIcon('load')).css('margin-left', '0.5em')
			);
		this.$dialog.append(this.$progress);

		// Create option container
		this.$content = $('<div>');
		this.$content.prop('id', 'anr-dialog-content');
		this.$dialog.append(this.$content);

		// Create fieldset
		this.$fieldset = $('<fieldset>');
		this.$fieldset.prop({
			id: 'anr-dialog-optionfield',
			innerHTML: '<legend>利用者を報告</legend>'
		});
		this.$content.append(this.$fieldset);

		// Create target page option
		const $pageWrapper = Reporter.createRow();
		const $pageLabel = Reporter.createRowLabel($pageWrapper, '報告先');
		this.$page = $('<select>');
		this.$page
			.addClass('anr-juxtaposed') // Important for the dropdown to fill the remaining space
			.prop('innerHTML',
				'<option selected disabled hidden value="">選択してください</option>' +
				'<option>' + ANI + '</option>' +
				'<option>' + ANS + '</option>' +
				'<option>' + AN3RR + '</option>'
			)
			.off('change').on('change', () => {
				this.switchSectionDropdown();
			});
		const $pageDropdownWrapper = Reporter.wrapElement($pageWrapper, this.$page); // As important as above
		this.$fieldset.append($pageWrapper);
		Reporter.verticalAlign($pageLabel, $pageDropdownWrapper);

		// Create target page anchor
		const $pageLinkWrapper = Reporter.createRow();
		Reporter.createRowLabel($pageLinkWrapper, '');
		this.$pageLink = $('<a>');
		this.$pageLink
			.addClass('anr-disabledanchor') // Disable the anchor by default
			.text('報告先を確認')
			.prop('target', '_blank');
		$pageLinkWrapper.append(this.$pageLink);
		this.$fieldset.append($pageLinkWrapper);

		// Create section option for ANI and AN3RR
		this.$sectionWrapper = Reporter.createRow();
		const $sectionLabel = Reporter.createRowLabel(this.$sectionWrapper, '節');
		this.$section = $('<select>');
		this.$section
			.prop({
				innerHTML: '<option selected disabled hidden value="">選択してください</option>',
				disabled: true
			})
			.off('change').on('change', () => {
				this.setPageLink();
			});
		const $sectionDropdownWrapper = Reporter.wrapElement(this.$sectionWrapper, this.$section);
		this.$fieldset.append(this.$sectionWrapper);
		Reporter.verticalAlign($sectionLabel, $sectionDropdownWrapper);

		// Create section option for ANS
		this.$sectionAnsWrapper = Reporter.createRow(true);
		const $sectionAnsLabel = Reporter.createRowLabel(this.$sectionAnsWrapper, '節');
		this.$sectionAns = $('<select>');
		this.$sectionAns
			.prop('innerHTML',
				'<option selected disabled hidden value="">選択してください</option>' +
				'<optgroup label="系列が立てられていないもの">' +
					'<option>著作権侵害・犯罪予告</option>' +
					'<option>名誉毀損・なりすまし・個人情報</option>' +
					'<option>妨害編集・いたずら</option>' +
					'<option>その他</option>' +
				'</optgroup>'
			)
			.off('change').on('change', () => {
				this.setPageLink();
			});
		const $sectionAnsDropdownWrapper = Reporter.wrapElement(this.$sectionAnsWrapper, this.$sectionAns);
		this.$fieldset.append(this.$sectionAnsWrapper);
		Reporter.select2(this.$sectionAns);
		Reporter.verticalAlign($sectionAnsLabel, $sectionAnsDropdownWrapper);

		// Create an 'add' button
		this.$fieldset.append(document.createElement('hr'));
		const $addButtonWrapper = Reporter.createRow();
		this.$addButton = $('<input>');
		this.$addButton.prop('type', 'button').val('追加');
		$addButtonWrapper.append(this.$addButton);
		this.$fieldset.append($addButtonWrapper);
		this.$fieldset.append(document.createElement('hr'));

		// Create a user pane
		this.Users = [
			new User($addButtonWrapper, {removable: false})
		];
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;
		this.$addButton.off('click').on('click', () => {
			new User($addButtonWrapper, {
				addCallback(User) {
					const minWidth = User.$label.outerWidth()! + 'px';
					$.each([User.$wrapper, User.$hideUserWrapper, User.$idLinkWrapper, User.$blockStatusWrapper], (_, $wrapper) => {
						$wrapper.children('.anr-option-label').css('min-width', minWidth);
					});
					self.Users.push(User);
				},
				removeCallback(User) {
					const idx = self.Users.findIndex((U) => U.id === User.id);
					if (idx !== -1) { // Should never be -1
						const U = self.Users[idx];
						U.$wrapper.remove();
						self.Users.splice(idx, 1);
					}
				}
			});
		});
		const dialogWith = this.$fieldset.outerWidth(true)!;
		this.$fieldset.css('width', dialogWith); // Assign an absolute width to $content
		this.$progress.css('width', dialogWith);
		Reporter.centerDialog(this.$dialog); // Recenter the dialog because the width has been changed

		/**
		 * (Bound to the change event of a \<select> element.)
		 *
		 * Copy the selected value to the clipboard and reset the selection.
		 * @param this
		 */
		const copyThenResetSelection = function(this: HTMLSelectElement) {
			lib.copyToClipboard(this.value, 'ja');
			this.selectedIndex = 0;
		};

		// Create VIP copier
		this.$vipWrapper = Reporter.createRow(true);
		const $vipLabel = Reporter.createRowLabel(this.$vipWrapper, 'VIP');
		this.$vip = $('<select>');
		this.$vip
			.prop('innerHTML', '<option selected disabled hidden value="">選択してコピー</option>')
			.off('change').on('change', copyThenResetSelection);
		const $vipDropdownWrapper = Reporter.wrapElement(this.$vipWrapper, this.$vip);
		this.$fieldset.append(this.$vipWrapper);
		Reporter.select2(this.$vip);
		Reporter.verticalAlign($vipLabel, $vipDropdownWrapper);

		// Create LTA copier
		this.$ltaWrapper = Reporter.createRow(true);
		const $ltaLabel = Reporter.createRowLabel(this.$ltaWrapper, 'LTA');
		this.$lta = $('<select>');
		this.$lta
			.prop('innerHTML', '<option selected disabled hidden value="">選択してコピー</option>')
			.off('change').on('change', copyThenResetSelection);
		const $ltaDropdownWrapper = Reporter.wrapElement(this.$ltaWrapper, this.$lta);
		this.$fieldset.append(this.$ltaWrapper);
		Reporter.select2(this.$lta);
		Reporter.verticalAlign($ltaLabel, $ltaDropdownWrapper);

		// Create predefined reason selector
		const $predefinedWrapper = Reporter.createRow(true);
		const $predefinedLabel = Reporter.createRowLabel($predefinedWrapper, '定型文');
		this.$predefined = addOptions($('<select>'), [
			{text: '選択してコピー', value: '', disabled: true, selected: true, hidden: true},
			...this.cfg.reasons.map((el) => ({text: el}))
		]);
		this.$predefined.off('change').on('change', copyThenResetSelection);
		const $predefinedDropdownWrapper = Reporter.wrapElement($predefinedWrapper, this.$predefined);
		this.$fieldset.append($predefinedWrapper);
		Reporter.select2(this.$predefined);
		Reporter.verticalAlign($predefinedLabel, $predefinedDropdownWrapper);

		// Create reason field
		const $reasonWrapper = Reporter.createRow();
		Reporter.createRowLabel($reasonWrapper, '理由');
		this.$reason = $('<textarea>');
		this.$reason.prop({
			id: 'anr-option-reason',
			rows: 5,
			placeholder: '署名不要'
		});
		$reasonWrapper.append(this.$reason);
		this.$fieldset.append($reasonWrapper);

		// Create "add comment" option
		const addCommentElements = createLabelledCheckbox('要約にコメントを追加', {checkboxId: 'anr-option-addcomment'});
		this.$addComment = addCommentElements.$checkbox;
		this.$fieldset.append(addCommentElements.$wrapper);
		this.$comment = $('<textarea>');
		this.$comment.prop({
			id: 'anr-option-comment',
			rows: 2
		});
		addCommentElements.$wrapper.append(this.$comment);
		this.$addComment.off('change').on('change', () => {
			Reporter.toggle(this.$comment, this.$addComment.prop('checked'));
		}).trigger('change');

		// Create "block check" option
		const checkBlockElements = createLabelledCheckbox('報告前にブロック状態をチェック', {checkboxId: 'anr-option-checkblock'});
		this.$checkBlock = checkBlockElements.$checkbox;
		this.$checkBlock.prop('checked', this.cfg.blockCheck);
		this.$fieldset.append(checkBlockElements.$wrapper);

		// Create "duplicate check" option
		const checkDuplicatesElements = createLabelledCheckbox('報告前に重複報告をチェック', {checkboxId: 'anr-option-checkduplicates'});
		this.$checkDuplicates = checkDuplicatesElements.$checkbox;
		this.$checkDuplicates.prop('checked', this.cfg.duplicateCheck);
		this.$fieldset.append(checkDuplicatesElements.$wrapper);

		// Create "watch user" option
		const watchUserElements = createLabelledCheckbox('報告対象者をウォッチ', {checkboxId: 'anr-option-watchuser'});
		this.$watchUser = watchUserElements.$checkbox;
		this.$watchUser.prop('checked', this.cfg.watchUser);
		this.$fieldset.append(watchUserElements.$wrapper);
		this.$watchExpiry = $('<select>');
		this.$watchExpiry
			.prop({
				id: 'anr-option-watchexpiry',
				innerHTML:	'<option value="infinity">無期限</option>' +
							'<option value="1 week">1週間</option>' +
							'<option value="2 weeks">2週間</option>' +
							'<option value="1 month">1か月</option>' +
							'<option value="3 months">3か月</option>' +
							'<option value="6 months">6か月</option>' +
							'<option value="1 year">1年</option>'
			})
			.val(this.cfg.watchExpiry);
		const $watchExpiryWrapper = $('<div>');
		$watchExpiryWrapper
			.prop({id: 'anr-option-watchexpiry-wrapper'})
			.css({
				marginLeft: this.$watchUser.outerWidth(true)! + 'px',
				marginTop: '0.3em'
			})
			.append(
				document.createTextNode('期間: '),
				this.$watchExpiry
			);
		watchUserElements.$wrapper.append($watchExpiryWrapper);
		this.$watchUser.off('change').on('change', () => {
			Reporter.toggle($watchExpiryWrapper, this.$watchUser.prop('checked'));
		}).trigger('change');

		// Set all the row labels to the same width
		Reporter.setWidestWidth($('.anr-option-label'));

		// Make some wrappers invisible
		Reporter.toggle(this.$sectionAnsWrapper, false);
		Reporter.toggle(this.$vipWrapper, false);
		Reporter.toggle(this.$ltaWrapper, false);
		if (this.$predefined.find('option').length < 2) {
			Reporter.toggle($predefinedWrapper, false);
		}
		Reporter.toggle(this.$content, false);

	}

	/**
	 * Taken several HTML elements, set the width that is widest among the elements to all of them.
	 * @param $elements
	 */
	static setWidestWidth($elements: JQuery<HTMLElement>): void {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const optionsWidths = Array.prototype.map.call<JQuery<HTMLElement>, any[], number[]>(
			$elements,
			(el: HTMLElement) => el.offsetWidth // Collect the widths of all the elements
		);
		const optionWidth = Math.max(...optionsWidths); // Get the max value
		$elements.css('min-width', optionWidth); // Set the value to all
	}

	/**
	 * Toggle the visibility of an element by (de)assigning the `anr-hidden` class.
	 * @param $element The element of which to toggle the visibility.
	 * @param show Whether to show the element.
	 * @returns The passed element.
	 */
	static toggle($element: JQuery<HTMLElement>, show: boolean): JQuery<HTMLElement> {
		return $element.toggleClass('anr-hidden', !show);
	}

	/**
	 * Create a \<div> that works as a Reporter row.
	 * ```html
	 * <!-- hasSelect2: false -->
	 * <div class="anr-option-row"></div>
	 * <!-- hasSelect2: true -->
	 * <div class="anr-option-row-withselect2"></div>
	 * ```
	 * @param hasSelect2 `false` by default.
	 * @returns The created row.
	 */
	static createRow(hasSelect2 = false): JQuery<HTMLDivElement> {
		const $row: JQuery<HTMLDivElement> = $('<div>');
		$row.addClass(!hasSelect2 ? 'anr-option-row' : 'anr-option-row-withselect2');
		return $row;
	}

	/**
	 * Create a \<div> that works as a left-aligned label.
	 * ```html
	 * <div class="anr-option-label">labelText</div>
	 * ```
	 * @param $appendTo The element to which to append the label.
	 * @param labelText The text of the label (technically, the innerHTML). If an empty string is passed, `&nbsp;` is used.
	 * @returns The created label.
	 */
	static createRowLabel($appendTo: JQuery<HTMLElement>, labelText: string|HTMLElement): JQuery<HTMLDivElement> {
		const $label: JQuery<HTMLDivElement> = $('<div>');
		$label.addClass('anr-option-label');
		if (typeof labelText === 'string') {
			$label.prop('innerHTML', labelText || '&nbsp;');
		} else {
			$label.append(labelText);
		}
		$appendTo.append($label);
		return $label;
	}

	/**
	 * Compare the outerHeight of a row label div and that of a sibling div, and if the former is smaller than the latter,
	 * assign `padding-top` to the former.
	 *
	 * Note: **Both elements must be visible when this function is called**.
	 * @param $label
	 * @param $sibling
	 */
	static verticalAlign($label: JQuery<HTMLDivElement>, $sibling: JQuery<HTMLDivElement>): void {
		const labelHeight = $label.outerHeight()!;
		const siblingHeight = $sibling.outerHeight()!;
		if ($label.text() && labelHeight < siblingHeight) {
			$label.css('padding-top', ((siblingHeight - labelHeight) / 2) + 'px');
		}
	}

	/**
	 * Wrap a (non-block) element (next to a row label) with a div. This is for the element to fill the remaining space.
	 * ```html
	 * <div class="anr-option-row">
	 * 	<div class="anr-option-label"></div> <!-- float: left; -->
	 * 	<div class="anr-option-wrapper"> <!-- overflow: hidden; -->
	 * 		<element class="anr-juxtaposed">...</element> <!-- width: 100%; -->
	 * 	</div>
	 * </div>
	 * ```
	 * @param $appendTo The element to which to append the wrapper div.
	 * @param $element The element to wrap.
	 * @returns The wrapper div.
	 */
	static wrapElement($appendTo: JQuery<HTMLElement>, $element: JQuery<HTMLElement>): JQuery<HTMLDivElement> {
		const $wrapper: JQuery<HTMLDivElement> = $('<div>');
		$wrapper.addClass('anr-option-wrapper');
		$element.addClass('anr-juxtaposed');
		$wrapper.append($element);
		$appendTo.append($wrapper);
		return $wrapper;
	}

	/**
	 * Set up `select2` to a dropdown.
	 * @param $dropdown
	 */
	static select2($dropdown: JQuery<HTMLSelectElement>): void {
		$dropdown.select2({
			width: '100%', // Without this, the right end of the dropdown overflows
			dropdownCssClass: 'anr-select2' // This needs select2.full.js
		});
	}

	/**
	 * Bring a jQuery UI dialog to the center of the viewport.
	 */
	static centerDialog($dialog: JQuery<HTMLDivElement>): void {
		$dialog.dialog({
			position: {
				my: 'top',
				at: 'top+5%',
				of: window
			}
		});
	}

	/**
	 * Create a new Reporter dialog. This static method handles asynchronous procedures that are necessary
	 * after calling the constructor.
	 * @param e
	 */
	static new(e: MouseEvent) {

		// Cancel portletlink click event
		e.preventDefault();

		// Create a Reporter dialog
		const R = new Reporter();

		// Get a username associated with the current page if any
		const heading: HTMLHeadingElement|null =
			document.querySelector('.mw-first-heading') ||
			document.querySelector('.firstHeading') ||
			document.querySelector('#firstHeading');
		const relevantUser =
			<string|null>mw.config.get('wgRelevantUserName') ||
			mw.config.get('wgCanonicalSpecialPageName') === 'Contributions' && heading && heading.textContent && extractCidr(heading.textContent);
		const U = R.Users[0];
		U.$input.val(relevantUser || '');
		const def = U.processInputChange();

		// Process additional asynchronous procedures for Reporter
		$.when(
			lib.Wikitext.newFromTitle(ANS),
			lib.getVipList(),
			lib.getLtaList()
		)
		.then((Wkt, vipList, ltaList) => {

			// Initialize the ANS section dropdown
			if (Wkt) {
				const exclude = [
					'top',
                    '系列が立てられていないもの',
                    '著作権侵害・犯罪予告',
                    '名誉毀損・なりすまし・個人情報',
                    '妨害編集・いたずら',
                    'その他',
                    'A. 最優先',
                    '暫定A',
                    '休止中A',
                    'B. 優先度高',
                    '暫定B',
                    '休止中B',
                    'C. 優先度中',
                    '暫定C',
                    '休止中C',
                    'D. 優先度低',
                    '暫定D',
                    '休止中D',
                    'N. 未分類',
                    'サブページなし',
                    '休止中N'
                ];
				const optgroup = document.createElement('optgroup');
				optgroup.label = 'LTA';
				Wkt.parseSections().forEach(({title}) => {
					if (!exclude.includes(title)) {
						const option = document.createElement('option');
						option.textContent = title;
						optgroup.appendChild(option);
					}
				});
				if (optgroup.querySelector('option')) {
					R.$sectionAns[0].add(optgroup);
				} else {
					mw.notify('WP:AN/Sのセクション情報の取得に失敗しました。節構成が変更された、またはスクリプトのバグの可能性があります。', {type: 'error'});
				}
			} else {
				mw.notify('WP:AN/Sのセクション情報の取得に失敗しました。ダイアログを開き直すと改善する場合があります。', {type: 'error'});
			}

			// Initialize the VIP copier dropdown
			if (vipList.length) {
				const optgroup = document.createElement('optgroup');
				optgroup.style.display = 'none'; // Wrap with optgroup to adjust font size
				vipList.forEach((vip) => {
					const option = document.createElement('option');
					option.textContent = vip;
					option.value = '[[WP:VIP#' + vip + ']]';
					optgroup.appendChild(option);
				});
				R.$vip[0].add(optgroup);
				Reporter.toggle(R.$vipWrapper, true);
			}

			// Initialize the LTA copier dropdown
			if (ltaList.length) {
				const optgroup = document.createElement('optgroup');
				optgroup.style.display = 'none'; // Wrap with optgroup to adjust font size
				ltaList.forEach((lta) => {
					const option = document.createElement('option');
					option.textContent = lta;
					option.value = '[[LTA:' + lta + ']]';
					optgroup.appendChild(option);
				});
				R.$lta[0].add(optgroup);
				Reporter.toggle(R.$ltaWrapper, true);
			}

			def.then(() => { // Ensure that processInputChange has been resolved as well
				Reporter.toggle(R.$progress, false);
				Reporter.toggle(R.$content, true);
				R.setMainButtons();
			});

		});

	}

	/**
	 * Set the main dialog buttons.
	 */
	setMainButtons(): void {
		this.$dialog.dialog({
			buttons: [
				{
					text: '報告',
					click: () => this.report()
				},
				{
					text: 'プレビュー',
					click: () => this.preview()
				},
				{
					text: '閉じる',
					click: () => this.close()
				}
			]
		});
	}

	/**
	 * Close the Reporter dialog (will be destroyed).
	 */
	close() {
		this.$dialog.dialog('close');
	}

	/**
	 * Get `YYYY年MM月D1日 - D2日新規依頼`, relative to the current day.
	 * @param getLast Whether to get the preceding section, defaulted to `false`.
	 * @returns
	 */
	static getCurrentAniSection(getLast = false): string {

		const d = new Date();
		let subtract;
		if (getLast) {
			if (d.getDate() === 1 || d.getDate() === 2) {
				subtract = 3;
			} else if (d.getDate() === 31) {
				subtract = 6;
			} else {
				subtract = 5;
			}
			d.setDate(d.getDate() - subtract);
		}

		const multiplier = Math.ceil(d.getDate() / 5); // 1 to 7
		let lastDay, startDay;
		if (multiplier < 6) {
			lastDay = 5 * multiplier; // 5, 10, 15, 20, 25
			startDay = lastDay - 4; // 1, 6, 11, 16, 21
		} else {
			lastDay = Reporter.getLastDay(d.getFullYear(), d.getMonth()); // 28-31
			startDay = 26;
		}
		return `${d.getFullYear()}年${d.getMonth() + 1}月${startDay}日 - ${lastDay}日新規報告`;

	}

	/**
	 * Get the last day of a given month in a given year.
	 * @param year A 4-digit year.
	 * @param month The month as a number between 0 and 11 (January to December).
	 * @returns
	 */
	static getLastDay(year: number, month: number): number {
		return new Date(year, month + 1, 0).getDate();
	}

	/**
	 * Get the page to which to forward the report.
	 * @returns
	 */
	getPage(): string|null {
		return <string>this.$page.val() || null;
	}

	/**
	 * Set an href to {@link $pageLink}. If {@link $page} is not selected, disable the anchor.
	 * @returns
	 */
	setPageLink(): Reporter {
		const page = this.getPage();
		if (page) {
			this.$pageLink
				.removeClass('anr-disabledanchor')
				.prop('href', mw.util.getUrl(page + (this.getSection(true) || '')));
		} else {
			this.$pageLink
				.addClass('anr-disabledanchor')
				.prop('href', '');
		}
		return this;
	}

	/**
	 * Get the selected section.
	 * @param addHash Add '#' to the beginning when there's a value to return. (Default: `false`)
	 * @returns
	 */
	getSection(addHash = false): string|null {
		let ret: string|null = null;
		switch (this.getPage()) {
			case ANI:
				ret = <string>this.$section.val() || null;
				break;
			case ANS:
				ret = <string>this.$sectionAns.val() || null;
				break;
			case AN3RR:
				ret = '3RR';
				break;
			default: // Section not selected
		}
		return ret && (addHash ? '#' : '') + ret;
	}

	/**
	 * Switch the section dropdown options in accordance with the selection in the page dropdown.
	 * This method calls {@link setPageLink} when done.
	 * @returns
	 */
	switchSectionDropdown(): Reporter {
		const page = this.getPage();
		if (page) {
			switch (page) {
				case ANI:
					this.$section.prop('disabled', false).empty();
					addOptions(this.$section, [
						{text: '選択してください', value: '', disabled: true, selected: true, hidden: true},
						{text: Reporter.getCurrentAniSection()},
						{text: '不適切な利用者名'},
						{text: '公開アカウント'},
						{text: '公開プロキシ・ゾンビマシン・ボット・不特定多数'},
						{text: '犯罪行為またはその疑いのある投稿'}
					]);
					Reporter.toggle(this.$sectionWrapper, true);
					Reporter.toggle(this.$sectionAnsWrapper, false);
					this.setPageLink();
					break;
				case ANS:
					this.$sectionAns.val('').trigger('change'); // For select2. This triggers `setPageLink`.
					Reporter.toggle(this.$sectionWrapper, false);
					Reporter.toggle(this.$sectionAnsWrapper, true);
					break;
				case AN3RR:
					this.$section.prop({
						disabled: false,
						innerHTML: '<option>3RR</option>'
					});
					Reporter.toggle(this.$sectionWrapper, true);
					Reporter.toggle(this.$sectionAnsWrapper, false);
					this.setPageLink();
			}
		} else {
			this.$section.prop({
				disabled: true,
				innerHTML: '<option disabled selected hidden value="">選択してください</option>'
			});
			Reporter.toggle(this.$sectionWrapper, true);
			Reporter.toggle(this.$sectionAnsWrapper, false);
			this.setPageLink();
		}
		return this;
	}

	/** Storage of the return value of {@link getBlockStatus}. */
	static blockStatus: {[username: string]: BlockStatus;} = {};

	/**
	 * Evaluate a username, classify it into a type, and check the block status of the relevant user.
	 * @param username Automatically formatted by {@link User.formatName}.
	 * @returns
	 */
	static getBlockStatus(username: string): JQueryPromise<BlockStatus> {

		username = User.formatName(username);
		const isIp = mw.util.isIPAddress(username, true);
		const bkpara: {bkusers?: string; bkip?: string;} = {};
		if (!username || !isIp && User.containsInvalidCharacter(username)) { // Blank or invalid
			return $.Deferred().resolve({
				usertype: 'other',
				blocked: null
			});
		} else if (Reporter.blockStatus[username]) {
			return $.Deferred().resolve({...Reporter.blockStatus[username]});
		} else if (isIp) {
			bkpara.bkip = username;
		} else {
			bkpara.bkusers = username;
		}

		const params = Object.assign({
			action: 'query',
			list: 'users|blocks',
			ususers: username,
			formatversion: '2'
		}, bkpara);
		return new mw.Api().get(params)
			.then((res) => {
				const resUs = res && res.query && res.query.users;
				const resBl = res && res.query && res.query.blocks;
				if (resUs && resBl) {
					const ret: BlockStatus = {
						usertype: isIp ? 'ip' : resUs[0].userid !== void 0 ? 'user' : 'other',
						blocked: !!resBl.length
					};
					Reporter.blockStatus[username] = {...ret};
					return ret;
				} else {
					throw new Error('APIリクエストにおける不明なエラー');
				}
			})
			.catch((_, err) => {
				console.error(err);
				mw.notify('ユーザー情報の取得に失敗しました。', {type: 'error'});
				return {
					usertype: 'other',
					blocked: null
				};
			});

	}

	// -- Methods related to the dialog buttons of "report" and "preview"

	/**
	 * Collect option values.
	 * @returns `null` if there's some error.
	 */
	collectData(): ReportData|null {

		//  -- Check first for required fields --

		const page = this.getPage();
		const section = this.getSection();

		const shiftClick = $.Event('click');
		shiftClick.shiftKey = true;
		let hasInvalidId = false;
		const users = this.Users.reduceRight((acc: UserInfo[], User) => {
			const inputVal = User.getName();
			const selectedType = User.getType();
			if (!inputVal) { // Username is blank
				User.$label.trigger(shiftClick); // Remove the user pane
			} else if (['logid', 'diff'].includes(selectedType) && !/^\d+$/.test(inputVal)) { // Invalid ID
				hasInvalidId = true;
			} else { // Valid
				acc.push({
					user: inputVal,
					type: selectedType
				});
			}
			return acc;
		}, []).reverse();

		let reason = <string>this.$reason.val();
		reason = lib.clean(reason.replace(/[\s-~]*$/, '')); // Remove signature (if any)
		this.$reason.val(reason);

		// Look for errors
		const $errList = $('<ul>');
		if (!page) {
			$errList.append($('<li>報告先のページ名が未指定</li>'));
		}
		if (!section) {
			$errList.append($('<li>報告先のセクション名が未指定</li>'));
		}
		if (!users.length) {
			$errList.append($('<li>報告対象者が未指定</li>'));
		}
		if (hasInvalidId) {
			$errList.append($('<li>数字ではないID</li>'));
		}
		if (!reason) {
			$errList.append($('<li>報告理由が未指定</li>'));
		}
		const errLen = $errList.children('li').length;
		if (errLen) {
			const $err = $('<div>')
				.text('以下のエラーを修正してください。')
				.append($errList);
			mw.notify($err, {type: 'error', autoHideSeconds: errLen > 2 ? 'long' : 'short'});
			return null;
		}

		//  -- Collect secondary data --

		reason += '--~~~~'; // Add signature to reason
		const summary = lib.clean(<string>this.$comment.val()); // This is incomplete
		const blockCheck = this.$checkBlock.prop('checked');
		const duplicateCheck = this.$checkDuplicates.prop('checked');
		const watchUser = this.$watchUser.prop('checked');
		const watch = watchUser ? <string>this.$watchExpiry.val() : null;

		// Return
		return {
			page: page!,
			section: section!,
			users,
			reason,
			summary,
			blockCheck,
			duplicateCheck,
			watch
		};

	}

	/**
	 * Convert all IDs to usernames and check whether the username fields have any duplicate values.
	 * @param data
	 * @returns
	 */
	processIds(data: ReportData): JQueryPromise<ProcessedIds> {
		const deferreds: JQueryPromise<string|null>[] = data.users.map((obj) => { // Create an array of $.Deferred out of input values
			if (obj.type === 'logid' || obj.type === 'diff') {
				return idList.getUsername(parseInt(obj.user), obj.type === 'diff' ? 'diffid' : 'logid'); // Convert ID
			} else if (obj.type === 'none') {
				return $.Deferred().resolve(null); // Immediate resolve
			} else {
				return $.Deferred().resolve(obj.user); // Immediate resolve
			}
		}, []);
		return $.when(...deferreds).then((...info) => { // When all the deferreds have been resolved
			/**
			 * An array of indexes that have already been checked.
			 *
			 * Suppose that the `data` array is as below:
			 * ```js
			 * [
			 * 	{user: 'Foo', type: 'UNL'},
			 * 	{user: '10000', type: 'logid'}, // Logid/10000 = Foo
			 * 	{user: 'Bar', type: 'UNL'},
			 * 	{user: '20000', type: 'diff'} // Diff/20000 = Foo
			 * ]
			 * ```
			 * where the comments on the right represent the return values of the deferreds. Then, when
			 * we check `data[0]` and look for its duplicates in `data[1-3]`, `1` and `3` should be pushed
			 * into the `skip` array so that when we check `data[1]`, we can skip it. Otherwise, the
			 * resulting array will be:
			 * ```
			 * [
			 * 	['Foo', 'Logid/10000', 'Diff/20000'],
			 * 	['Logid/10000', 'Diff/20000']
			 * ]
			 * ```
			 * while we only want:
			 * ```
			 * [
			 * 	['Foo', 'Logid/10000', 'Diff/20000']
			 * ]
			 * ```
			 */
			const skip: number[] = [];
			const users = info.reduce((acc: string[][], username, i, arr) => {
				if (username && !skip.includes(i)) { // username isn't null and not to be skipped
					const ret: string[] = [];
					for (let j = i; j < arr.length; j++) { // Check array elements from the current index
						if (j === i && arr.lastIndexOf(username) !== j ||
							j !== i && arr[j] === username
						) { // Found a duplicate username
							skip.push(j);
							const inputVal = data.users[j].user;
							let toPush;
							switch (data.users[j].type) { // Convert the username back to an ID if necessary
								case 'logid':
									toPush = `Logid/${inputVal}`;
									break;
								case 'diff':
									toPush = `差分/${inputVal}`;
									break;
								default:
									toPush = inputVal;
							}
							if (!ret.includes(toPush)) {
								ret.push(toPush);
							}
						}
					}
					if (ret.length) {
						acc.push(ret);
					}
				}
				return acc;
			}, []);
			return {users, info};
		});

	}

	/**
	 * Create the report text and summary out of the return values of {@link collectData} and {@link processIds}.
	 * @param data The (null-proof) return value of {@link collectData}.
	 * @param info The partial return value of {@link processIds}.
	 * @returns The report text and summary.
	 */
	createReport(data: ReportData, info: ProcessedIds['info']): {text: string; summary: string;} {

		// Create UserANs and summary links
		const templates: Template[] = [];
		const links: string[] = [];
		for (let i = 0; i < data.users.length; i++) {
			const obj = data.users[i];

			const Temp = new lib.Template('UserAN').addArgs([
				{
					name: 't',
					value: obj.type
				},
				{
					name: '1',
					value: obj.user,
					forceUnnamed: true
				}
			]);
			templates.push(Temp);

			switch (obj.type) {
				case 'UNL':
				case 'User2':
				case 'IP2':
					// If this username is the first occurrence in the "info" array in which IDs have been converted to usernames
					if (info.indexOf(info[i]) === i) {
						links.push(`[[特別:投稿記録/${obj.user}|${obj.user}]]`);
					}
					break;
				case 'logid':
					// The ID failed to be converted to a username or the converted username is the first occurrence and not a duplicate
					if (info[i] === null || info.indexOf(info[i]) === i) {
						links.push(`[[特別:転送/logid/${obj.user}|Logid/${obj.user}]]`);
					}
					break;
				case 'diff':
					if (info[i] === null || info.indexOf(info[i]) === i) {
						links.push(`[[特別:差分/${obj.user}|差分/${obj.user}]]の投稿者`);
					}
					break;
				default: // none
					if (info[i] === null || info.indexOf(info[i]) === i) {
						links.push(obj.user);
					}

			}
		}

		// Create the report text
		let text = '';
		templates.forEach((Temp, i) => {
			text += `${i === 0 ? '' : '\n'}* ${Temp.toString()}`;
		});
		text += templates.length > 1 ? '\n:' : ' - ';
		text += data.reason;

		// Create the report summary
		let summary = '';
		const fixed = [ // The fixed, always existing parts of the summary
			`/*${data.section}*/+`,
			' ([[利用者:Dragoniez/scripts/AN_Reporter|AN Reporter]])'
		];
		const fixedLen = fixed.join('').length; // The length of the fixed summary
		const summaryComment = data.summary ? ' - ' + data.summary : '';
		for (let i = 0; i < links.length; i++) { // Loop the reportee links
			const userLinks =
				links.slice(0, i + 1).join(', ') + // The first "i + 1" links
				(links.slice(i + 1).length ? `, ほか${links.slice(i + 1).length}アカウント` : ''); // and the number of the remaining links if any
			const totalLen = fixedLen + userLinks.length + summaryComment.length; // The total length of the summary
			if (i === 0 && totalLen > 500) { // The summary exceeds the word count limit only with the first link
				const maxLen = 500 - fixedLen - userLinks.length;
				const trunc = summaryComment.slice(0, maxLen - 3) + '...'; // Truncate the additional comment
				const augFixed = fixed.slice(); // Copy the fixed summary array
				augFixed.splice(1, 0, userLinks, trunc); // Augment the copied array by inserting the first user link and the truncated comment
				summary = augFixed.join(''); // Join the array elements and that will be the whole of the summary
				break;
			} else if (totalLen > 500) {
				// The word count limit is exceeded when we add a non-first link
				// In this case, use the summary created in the last loop
				break;
			} else { // If the word count limit isn't exceeded in the first loop, the code always reaches this block
				const augFixed = fixed.slice();
				augFixed.splice(1, 0, userLinks, summaryComment);
				summary = augFixed.join('');
			}
		}

		return {text, summary};

	}

	// The 3 methods above are used both in "report" and "preview" (the former needs additional functions, and they are defined below).

	/**
	 * Preview the report.
	 * @returns
	 */
	preview() {

		const data = this.collectData();
		if (!data) return;

		const $preview = $('<div>')
			.prop('title', ANR + ' - Preview')
			.css({
				'max-height': '80vh',
				'max-width': '80vw'
			})
			.dialog({
				dialogClass: 'anr-dialog anr-dialog-preview',
				height: 'auto',
				width: 'auto',
				modal: true,
				close: function() {
					// Destory the dialog and its contents when closed by any means
					$(this).empty().dialog('destroy');
				}
			});
		const $previewContent = $('<div>')
			.prop('id', 'anr-dialog-preview-content')
			.text('読み込み中')
			.append($(lib.getIcon('load')).css('margin-left', '0.5em'));
		$preview.append($previewContent);

		this.processIds(data).then(({info}) => {
			const {text, summary} = this.createReport(data, info);
			new mw.Api().get({
				action: 'parse',
				title: data.page,
				text,
				summary,
				prop: 'text',
				disablelimitreport: true,
				disableeditsection: true,
				disabletoc: true,
				formatversion: '2'
			}).then((res) => {
				const content = res && res.parse && res.parse.text;
				const comment = res && res.parse && res.parse.parsedsummary;
				if (content && comment) {

					const $header = $('<div>')
						.prop('id', 'anr-dialog-preview-header')
						.append($(
							'<p>' +
								'注意1: このプレビュー上のリンクは全て新しいタブで開かれます<br>' +
								'注意2: 報告先が <a href="' + mw.util.getUrl('WP:AN/S#OTH') + '" target="_blank">WP:AN/S#その他</a> の場合、' +
								'このプレビューには表示されませんが「他M月D日」のヘッダーは必要に応じて自動挿入されます' +
							'</p>')
						);
					const $body = $('<div>').prop('id', 'anr-dialog-preview-body');
					$body.append(
						$(content),
						$('<div>')
							.css('margin-top', '0.8em')
							.append($(comment))
					);

					$previewContent
						.empty()
						.append($header, $('<hr>'), $body)
						.find('a').prop('target', '_blank'); // Open all links on a new tab

					$preview.dialog({
						buttons: [
							{
								text: '閉じる',
								click: () => {
									$preview.dialog('close');
								}
							}
						],
						position: {
							at: 'center',
							my: 'center',
							of: window
						}
					});

				} else {
					throw new Error('action=parseのエラー');
				}
			}).catch((_, err) => {
				console.log(err);
				$previewContent
					.empty()
					.text('プレビューの読み込みに失敗しました。')
					.append($(lib.getIcon('cross')).css('margin-left', '0.5em'));
				$preview.dialog({
					buttons: [
						{
							text: '閉じる',
							click: () => {
								$preview.dialog('close');
							}
						}
					]
				});
			});
		});

	}

	/**
	 * Submit the report.
	 * @returns
	 */
	report() {

		// Collect dialog data and check for errors
		const data = this.collectData();
		if (!data) return;

		// Create progress dialog
		this.$progress.empty();
		Reporter.toggle(this.$content, false);
		Reporter.toggle(this.$progress, true);
		this.$dialog.dialog({buttons: []});

		const $progressField = $('<fieldset>').prop('id', 'anr-dialog-progress-field');
		this.$progress.append($progressField);
		$progressField.append(
			$('<legend>').text('報告の進捗'),
			$('<div>').prop('id', 'anr-dialog-progress-icons').append(
				lib.getIcon('check'),
				document.createTextNode('処理通過'),
				getImage('exclamation'),
				document.createTextNode('要確認'),
				getImage('bar'),
				document.createTextNode('スキップ'),
				getImage('clock'),
				document.createTextNode('待機中'),
				lib.getIcon('cross'),
				document.createTextNode('処理失敗')
			),
			$('<hr>')
		);
		const $progressTable = $('<table>');
		$progressField.append($progressTable);

		const $dupUsersRow = $('<tr>');
		$progressTable.append($dupUsersRow);
		const $dupUsersLabel = $('<td>').append(lib.getIcon('load'));
		const $dupUsersText = $('<td>').text('利用者名重複');
		$dupUsersRow.append($dupUsersLabel, $dupUsersText);

		const $dupUsersListRow = $('<tr>');
		$progressTable.append($dupUsersListRow);
		const $dupUsersListText = $('<td>');
		$dupUsersListRow.append($('<td>'), $dupUsersListText);
		const $dupUsersList = $('<ul>');
		$dupUsersListText.append($dupUsersList);
		Reporter.toggle($dupUsersListRow, false);

		const $blockedUsersRow = $('<tr>');
		$progressTable.append($blockedUsersRow);
		const $blockedUsersLabel = $('<td>').append(data.blockCheck ? getImage('clock') : getImage('bar'));
		const $blockedUsersText = $('<td>').text('既存ブロック');
		$blockedUsersRow.append($blockedUsersLabel, $blockedUsersText);

		const $blockedUsersListRow = $('<tr>');
		$progressTable.append($blockedUsersListRow);
		const $blockedUsersListText = $('<td>');
		$blockedUsersListRow.append($('<td>'), $blockedUsersListText);
		const $blockedUsersList = $('<ul>');
		$blockedUsersListText.append($blockedUsersList);
		Reporter.toggle($blockedUsersListRow , false);

		const $dupReportsRow = $('<tr>');
		$progressTable.append($dupReportsRow);
		const $dupReportsLabel = $('<td>').append(data.duplicateCheck ? getImage('clock') : getImage('bar'));
		const $dupReportsText = $('<td>').text('重複報告');
		$dupReportsRow.append($dupReportsLabel, $dupReportsText);

		const $dupReportsListRow = $('<tr>');
		$progressTable.append($dupReportsListRow);
		const $dupReportsListText = $('<td>');
		$dupReportsListRow.append($('<td>'), $dupReportsListText);
		const $dupReportsList = $('<ul>');
		$dupReportsListText.append($dupReportsList);
		Reporter.toggle($dupReportsListRow , false);

		const $reportRow = $('<tr>');
		$progressTable.append($reportRow);
		const $reportLabel = $('<td>').append(getImage('clock'));
		const $reportText = $('<td>').text('報告');
		$reportRow.append($reportLabel, $reportText);

		const $reportListRow = $('<tr>');
		$progressTable.append($reportListRow);
		const $reportListText = $('<td>');
		$reportListRow.append($('<td>'), $reportListText);
		const $reportList = $('<ul>');
		$reportListText.append($reportList);
		Reporter.toggle($reportListRow , false);

		this.processIds(data).then(({users, info}) => {

			const proceed = (): JQueryPromise<boolean> => {
				const def = $.Deferred();
				if (!users.length) {
					$dupUsersLabel.empty().append(lib.getIcon('check'));
					def.resolve(true);
				} else {
					$dupUsersLabel.empty().append(getImage('exclamation'));
					users.forEach((arr) => {
						const $li = $('<li>').text(arr.join(', '));
						$dupUsersList.append($li);
					});
					Reporter.toggle($dupUsersListRow, true);
					this.$dialog.dialog({
						buttons: [
							{
								text: '続行',
								click: () => {
									$dupUsersList.empty();
									Reporter.toggle($dupUsersListRow, false);
									this.$dialog.dialog({buttons: []});
									def.resolve(true);
								}
							},
							{
								text: '戻る',
								click: () => {
									$dupUsersList.empty();
									Reporter.toggle($dupUsersListRow, false);
									Reporter.toggle(this.$progress, false);
									Reporter.toggle(this.$content, true);
									this.setMainButtons();
									def.resolve(false);
								}
							},
							{
								text: '閉じる',
								click: () => {
									this.close();
									def.resolve(false);
								}
							}
						]
					});
					mw.notify('利用者名の重複を検出しました。', {type: 'warn'});
				}
				return def.promise();
			};

			proceed().then((bool) => {

				if (!bool) return;
				console.log(this.createReport(data, info));

			});

		});

	}

	/**
	 *
	 * @param usersArr The `info` property array of the return value of {@link processIds}.
	 */
	checkBlocks(usersArr: (string|null)[]) {
		const users: string[] = [];
		const ips: string[] = [];
		for (const user of usersArr) {
			if (!user) {
				// Do nothing
			} else if (mw.util.isIPAddress(user, true)) {
				if (!ips.includes(user)) ips.push(user);
			} else if (User.containsInvalidCharacter(user)) {
				// Do nothing
			} else {
				if (!users.includes(user)) users.push(user);
			}
		}

	}

}

/** The options for {@link User.constructor}. */
interface UserOptions {
	/**
	 * The callback function to execute when the constructor has generated the user pane.
	 * @param User
	 * @returns
	 */
	addCallback?: (User: User) => void;
	/**
	 * The callback function to execute when the user pane has been removed from the DOM.
	 * @param User
	 * @returns
	 */
	removeCallback?: (User: User) => void;
	/**
	 * Whether the user pane should be removable. (Default: `true`)
	 */
	removable?: boolean;
}

/**
 * UserAN type argument values.
 */
type antype = 'UNL'|'User2'|'IP2'|'logid'|'diff'|'none';

let userPaneCnt = 0;
/**
 * The User class. An instance of this handles a User field row on the Reporter dialog.
 */
class User {

	/** The main wrapper that contains the user pane as a row. */
	$wrapper: JQuery<HTMLDivElement>;
	/** The overlay of the user pane. */
	$overlay: JQuery<HTMLDivElement>;
	/** The ID on {@link $label}. */
	id: string;
	/** The row label. */
	$label: JQuery<HTMLDivElement>;
	/** The username input. */
	$input: JQuery<HTMLInputElement>;
	/** The type dropdown. */
	$type: JQuery<HTMLSelectElement>;
	/** The wrapper row of the hideuser checkbox. */
	$hideUserWrapper: JQuery<HTMLDivElement>;
	/** The hideuser checkbox. */
	$hideUser: JQuery<HTMLInputElement>;
	/** The label of the hideuser checkbox. */
	$hideUserLabel: JQuery<HTMLSpanElement>;
	/** The wrapper row of the ID link. */
	$idLinkWrapper: JQuery<HTMLDivElement>;
	/** The ID link. */
	$idLink: JQuery<HTMLAnchorElement>;
	/** The wrapper row of the "blockstatus" anchor. */
	$blockStatusWrapper: JQuery<HTMLDivElement>;
	/** The "blockstatus" anchor. */
	$blockStatus: JQuery<HTMLAnchorElement>;

	/**
	 * Create a user pane of the Reporter dialog with the following structure.
	 * ```html
	 * <div class="anr-option-row anr-option-userpane-wrapper">
	 * 	<div class="anr-option-label">利用者</div> <!-- float: left; -->
	 * 	<div class="anr-option-usertype"> <!-- float: right; -->
	 * 		<select>...</select>
	 * 	</div>
	 * 	<div class="anr-option-wrapper"> <!-- overflow: hidden; -->
	 * 		<input class="anr-option-username anr-juxtaposed"> <!-- width: 100%; -->
	 * 	</div>
	 * 	<!-- row boundary -->
	 * 	<div class="anr-option-row-inner anr-option-hideuser-wrapper">
	 * 		<div class="anr-option-label">&nbsp;</div> <!-- float: left; -->
	 * 		<div class="anr-option-hideuser">
	 * 			<label>
	 * 				<input class="anr-checkbox">
	 * 				<span class="anr-checkbox-label">利用者名を隠す</span>
	 * 			</label>
	 * 		</div>
	 * 	</div>
	 * 	<div class="anr-option-row-inner anr-option-idlink-wrapper">
	 * 		<div class="anr-option-label">&nbsp;</div>
	 * 		<div class="anr-option-idlink">
	 * 			<a></a>
	 * 		</div>
	 * 	</div>
	 * 	<div class="anr-option-row-inner anr-option-blockstatus-wrapper">
	 * 		<div class="anr-option-label">&nbsp;</div>
	 * 		<div class="anr-option-blockstatus">
	 * 			<a>ブロックあり</a>
	 * 		</div>
	 * 	</div>
	 * </div>
	 * <!-- ADD BUTTON HERE -->
	 * ```
	 * @param $next The element before which to create a user pane.
	 * @param options
	 */
	constructor($next: JQuery<HTMLElement>, options?: UserOptions) {

		options = Object.assign(
			{removable: true},
			options || {}
		);

		// Create user pane row
		this.$wrapper = Reporter.createRow();
		this.$wrapper.addClass('anr-option-userpane-wrapper');
		this.$overlay = $('<div>');
		this.$overlay.addClass('anr-option-userpane-overlay');
		Reporter.toggle(this.$overlay, false);
		this.$wrapper.append(this.$overlay);

		// Append a label div
		this.id = 'anr-dialog-userpane-' + (userPaneCnt++);
		this.$label = Reporter.createRowLabel(this.$wrapper, '利用者').prop('id', this.id);
		if (options.removable) {
			this.$wrapper.addClass('anr-option-removable');
			this.$label
				.prop('title', 'SHIFTクリックで除去')
				.off('click').on('click', (e) => {
					if (e.shiftKey) { // Remove the user pane when the label is shift-clicked
						this.$wrapper.remove();
						if (options && options.removeCallback) {
							options.removeCallback(this);
						}
					}
				});
		}

		// Append a type dropdown
		const $typeWrapper = $('<div>').addClass('anr-option-usertype');
		this.$type = addOptions($('<select>'),
			['UNL', 'User2', 'IP2', 'logid', 'diff', 'none'].map((el) => ({text: el}))
		);
		this.$type // Initialize
			.prop('disabled', true) // Disable
			.off('change').on('change', () => {
				this.processTypeChange();
			})
			.children('option').eq(5).prop('selected', true); // Select 'none'
		$typeWrapper.append(this.$type);
		this.$wrapper.append($typeWrapper);

		// Append a username input
		this.$input = $('<input>');
		let inputTimeout: NodeJS.Timeout;
		this.$input
			.addClass('anr-option-username') // Currently not used for anything
			.prop({
				type: 'text',
				placeholder: '入力してください'
			})
			.off('input').on('input', () => {
				clearTimeout(inputTimeout);
				inputTimeout = setTimeout(() => {
					this.processInputChange();
				}, 350);
			});
		const $userWrapper = Reporter.wrapElement(this.$wrapper, this.$input);
		$next.before(this.$wrapper);
		Reporter.verticalAlign(this.$label, $userWrapper);

		// Append a hide-user checkbox
		this.$hideUserWrapper = Reporter.createRow();
		this.$hideUserWrapper.removeAttr('class').addClass('anr-option-row-inner anr-option-hideuser-wrapper');
		Reporter.createRowLabel(this.$hideUserWrapper, '');
		const hideUserElements = createLabelledCheckbox('利用者名を隠す', {alterClasses: ['anr-option-hideuser']});
		this.$hideUser = hideUserElements.$checkbox;
		this.$hideUser.off('change').on('change', () => {
			this.processHideUserChange();
		});
		this.$hideUserLabel = hideUserElements.$label;
		this.$hideUserWrapper.append(hideUserElements.$wrapper);
		this.$wrapper.append(this.$hideUserWrapper);
		Reporter.toggle(this.$hideUserWrapper, false);

		// Append an ID link
		this.$idLinkWrapper = Reporter.createRow();
		this.$idLinkWrapper.removeAttr('class').addClass('anr-option-row-inner anr-option-idlink-wrapper');
		Reporter.createRowLabel(this.$idLinkWrapper, '');
		this.$idLink = $('<a>');
		this.$idLink.prop('target', '_blank');
		this.$idLinkWrapper
			.append(
				$('<div>').addClass('anr-option-idlink').append(this.$idLink)
			);
		this.$wrapper.append(this.$idLinkWrapper);
		Reporter.toggle(this.$idLinkWrapper, false);

		// Append a block status link
		this.$blockStatusWrapper = Reporter.createRow();
		this.$blockStatusWrapper.removeAttr('class').addClass('anr-option-row-inner anr-option-blockstatus-wrapper');
		Reporter.createRowLabel(this.$blockStatusWrapper, '');
		this.$blockStatus = $('<a>');
		this.$blockStatus.prop('target', '_blank').text('ブロックあり');
		this.$blockStatusWrapper
			.append(
				$('<div>').addClass('anr-option-blockstatus').append(this.$blockStatus)
			);
		this.$wrapper.append(this.$blockStatusWrapper);
		Reporter.toggle(this.$blockStatusWrapper, false);

		if (options.addCallback) {
			options.addCallback(this);
		}

	}

	/**
	 * Format a username by calling `lib.clean`, replacing underscores with spaces, and capitalizing the first letter.
	 * @param username
	 * @returns The formatted username.
	 */
	static formatName(username: string): string {
		return mwString.ucFirst(lib.clean(username.replace(/_/g, ' ')));
	}

	/**
	 * Get the username in the textbox (underscores are replaced by spaces).
	 * @returns
	 */
	getName(): string|null {
		return User.formatName(<string>this.$input.val()) || null;
	}

	/**
	 * Set a value into the username input. Note that this method does not call {@link processInputChange}.
	 * @param val
	 * @returns
	 */
	setName(val: string): User {
		this.$input.val(val);
		return this;
	}

	/**
	 * Get the UserAN type selected in the dropdown.
	 * @returns
	 */
	getType(): antype {
		return <antype>this.$type.val();
	}

	/**
	 * Select a type in the UserAN type dropdown. Note that this method does not call {@link processTypeChange}.
	 * @param type
	 * @returns
	 */
	setType(type: antype): User {
		this.$type.val(type);
		return this;
	}

	/**
	 * Change the hidden state of the options in the type dropdown.
	 * @param types An array of type options to make visible. The element at index 0 will be selected.
	 */
	setTypeOptions(types: antype[]): User {
		this.$type.children('option').each((_, opt) => { // Loop all the options
			// Set up the UserAN type dropdown
			const idx = types.indexOf(<antype>opt.value);
			opt.hidden = idx === -1; // Show/hide options
			if (idx === 0) {
				opt.selected = true; // Select types[0]
			}
		});
		return this;
	}

	/**
	 * Update the visibility of auxiliary wrappers when the selection is changed in the type dropdown.
	 */
	processTypeChange(): User {
		const selectedType = this.processAuxiliaryElements().getType();
		this.$type.toggleClass('anr-option-usertype-none', false);
		switch (selectedType) {
			case 'UNL':
			case 'User2':
				Reporter.toggle(this.$hideUserWrapper, true);
				Reporter.toggle(this.$idLinkWrapper, false);
				Reporter.toggle(this.$blockStatusWrapper, !!this.$blockStatus.text());
				break;
			case 'IP2':
				Reporter.toggle(this.$hideUserWrapper, false);
				Reporter.toggle(this.$idLinkWrapper, false);
				Reporter.toggle(this.$blockStatusWrapper, !!this.$blockStatus.text());
				break;
			case 'logid':
			case 'diff':
				Reporter.toggle(this.$hideUserWrapper, true);
				Reporter.toggle(this.$idLinkWrapper, true);
				Reporter.toggle(this.$blockStatusWrapper, !!this.$blockStatus.text());
				break;
			default: // 'none'
				Reporter.toggle(this.$hideUserWrapper, false);
				Reporter.toggle(this.$idLinkWrapper, false);
				Reporter.toggle(this.$blockStatusWrapper, false);
				this.$type.toggleClass('anr-option-usertype-none', !this.$type.prop('disabled'));
		}
		return this;
	}

	/**
	 * Update the properties of auxiliary elements in the user pane.
	 * - Toggle the application of a red border on the username input.
	 * - Toggle the checked and disabled states of the hideuser checkbox.
	 * - Change the display text, the href, and the disabled state of the event ID link.
	 * - Set up the display text and the href of the block status link (by {@link processBlockStatus}).
	 * @returns
	 */
	processAuxiliaryElements(): User {

		const selectedType = this.getType();
		const inputVal = this.getName() || '';
		const clss = 'anr-option-invalidid';

		if (['logid', 'diff'].includes(selectedType)) {

			// Set up $input, $hideUser, and $idLink
			const isNotNumber = !/^\d*$/.test(inputVal);
			this.$input.toggleClass(clss, isNotNumber);
			this.$hideUser.prop({
				disabled: isNotNumber,
				checked: true
			});
			const idTitle = (selectedType === 'logid' ? '特別:転送/logid/' : '特別:差分/') + inputVal;
			this.$idLink
				.text(idTitle)
				.prop('href', mw.util.getUrl(idTitle))
				.toggleClass('anr-disabledanchor', isNotNumber);

			// Set up $blockStatus
			if (!isNotNumber) {
				const idType: 'logid'|'diffid' = selectedType === 'diff' ? 'diffid' : <'logid'>selectedType;
				const username = idList.getRegisteredUsername(parseInt(inputVal), idType);
				if (username) {
					this.processBlockStatus(username);
				} else {
					this.$blockStatus.text('');
				}
			}

		} else {
			this.$input.toggleClass(clss, false);
			this.$hideUser.prop({
				disabled: false,
				checked: false
			});
			this.$idLink.toggleClass('anr-disabledanchor', false);
			this.processBlockStatus(inputVal);
		}

		return this;

	}

	/**
	 * Set up the display text and the href of the block status link
	 * @param username
	 */
	processBlockStatus(username: string): User {
		username = User.formatName(username);
		const status = Reporter.blockStatus[username];
		if (status) {
			if (status.usertype === 'user' || status.usertype === 'ip') {
				this.$blockStatus.prop('href', mw.util.getUrl('特別:投稿記録/' + username));
				switch (status.blocked) {
					case true:
						this.$blockStatus.text('ブロックあり');
						break;
					case false:
						this.$blockStatus.text('');
						break;
					default: // null
						this.$blockStatus.text('ブロック状態不明');
				}
			} else { // other
				this.$blockStatus.text('');
			}
		} else { // Block status yet to be fetched
			this.$blockStatus.text('');
		}
		return this;
	}

	/**
	 * Evaluate the input value, figure out its user type (and block status if relevant), and change selection
	 * in the type dropdown (which proceeds to {@link processTypeChange}).
	 */
	processInputChange(): JQueryPromise<User> {

		const def = $.Deferred();

		const typeMap: Record<'ip'|'user'|'other', antype[]> = {
			ip: ['IP2', 'none'],
			user: ['UNL', 'User2', 'none'],
			other: ['none', 'logid', 'diff']
		};
		const username = this.getName();
		if (!username) { // Blank

			this.setType('none').$type.prop('disabled', true); // Disable dropdown and select 'none'
			this.processTypeChange();
			def.resolve(this);

		} else { // Some username is in the input

			Reporter.getBlockStatus(username).then((obj) => { // Get the type of the user with their block status
				if (/^\d+$/.test(username) && obj.usertype === 'user') {
					typeMap.user.push('logid', 'diff');
				}
				this.setTypeOptions(typeMap[obj.usertype]).$type.prop('disabled', false);
				this.processTypeChange();
				def.resolve(this);
			});

		}

		return def.promise();

	}

	/**
	 * Process the change event of the hideuser checkbox and do a username-ID conversion.
	 */
	processHideUserChange(): JQueryPromise<User> {

		// Show a spinner aside the hideuser checkbox label
		const $processing = $(lib.getIcon('load')).css('margin-left', '0.5em');
		this.$hideUserLabel.append($processing);
		this.setOverlay(true);

		/*!*
		 * Error handlers. If the catch block is ever reached, there should be some problem with either processInputChange
		 * or processTypeChange because the hideuser checkbox should be unclickable when the variables would be substituted
		 * by an unexpected value.
		 */
		const inputVal = this.getName();
		const selectedType = this.getType();
		const checked = this.$hideUser.prop('checked');
		try {
			if (typeof inputVal !== 'string') {
				// The username input should never be empty
				throw new TypeError('User.getName returned null.');
			} else if (!checked && !['logid', 'diff'].includes(selectedType)) {
				// The type dropdown should have either value when the box can be unchecked
				throw new Error('User.getType returned neither "logid" nor "diff".');
			} else if (!checked && !/^\d+$/.test(inputVal)) {
				// The username input should only be of numbers when the box can be unchecked
				throw new Error('User.getName returned a non-number.');
			}
		}
		catch (err) {
			console.error(err);
			mw.notify('変換試行時にエラーが発生しました。スクリプトのバグの可能性があります。', {type: 'error'});
			this.$hideUser.prop('checked', !checked);
			$processing.remove();
			this.setOverlay(false);
			return $.Deferred().resolve(this);
		}

		if (checked) { // username to ID
			return idList.getIds(inputVal).then(({logid, diffid}) => {
				if (typeof logid === 'number') {
					this.setName(logid.toString()).setTypeOptions(['logid', 'diff', 'none']).processTypeChange();
					mw.notify(`利用者名「${inputVal}」をログIDに変換しました。`, {type: 'success'});
				} else if (typeof diffid === 'number') {
					this.setName(diffid.toString()).setTypeOptions(['diff', 'logid', 'none']).processTypeChange();
					mw.notify(`利用者名「${inputVal}」を差分IDに変換しました。`, {type: 'success'});
				} else {
					this.$hideUser.prop('checked', !checked);
					mw.notify(`利用者名「${inputVal}」をIDに変換できませんでした。`, {type: 'warn'});
				}
				$processing.remove();
				return this.setOverlay(false);
			});
		} else { // ID to username
			const idType: "logid"|"diffid" = selectedType === 'diff' ? 'diffid' : <"logid">selectedType;
			const idTypeJa = selectedType === 'logid' ? 'ログ' : '差分';
			return idList.getUsername(parseInt(inputVal), idType).then((username) => {
				if (username) {
					return this.setName(username).processInputChange().then(() => {
						mw.notify(`${idTypeJa}ID「${inputVal}」を利用者名に変換しました。`, {type: 'success'});
						$processing.remove();
						return this.setOverlay(false);
					});
				} else {
					this.$hideUser.prop('checked', !checked);
					mw.notify(`${idTypeJa}ID「${inputVal}」を利用者名に変換できませんでした。`, {type: 'warn'});
					$processing.remove();
					return this.setOverlay(false);
				}
			});
		}

	}

	/**
	 * Toggle the visibility of the overlay.
	 * @param show
	 * @returns
	 */
	setOverlay(show: boolean): User {
		Reporter.toggle(this.$overlay, show);
		return this;
	}

	/**
	 * Check the validity of a username (by checking the inclusion of `/[@/#<>[\]|{}:]/`).
	 *
	 * Note that IP(v6) addresses should not be passed.
	 * @param username
	 * @returns
	 */
	static containsInvalidCharacter(username: string): boolean {
		return /[@/#<>[\]|{}:]/.test(username);
	}

}

interface OptionElementData {
	text: string;
	value?: string;
	disabled?: boolean;
	selected?: boolean;
	hidden?: boolean;
}
/**
 * Add \<option>s to a dropdown by referring to object data.
 * @param $dropdown
 * @param data `text` is obligatory, and the other properties are optional.
 * @returns The passed dropdown.
 */
function addOptions($dropdown: JQuery<HTMLSelectElement>, data: OptionElementData[]): JQuery<HTMLSelectElement> {
	data.forEach(({text, value, disabled, selected, hidden}) => {
		const option = document.createElement('option');
		option.textContent = text;
		if (value !== undefined) {
			option.value = value;
		}
		option.disabled = !!disabled;
		option.selected = !!selected;
		option.hidden = !!hidden;
		$dropdown[0].add(option);
	});
	return $dropdown;
}

interface LabelledCheckboxOptions {
	/** An optional checkbox ID. If not provided, an automatically generated ID is used. */
	checkboxId?: string;
	/** Alter `anr-option-row` on the wrapper with these classes.  */
	alterClasses?: string[];
}
let checkboxCnt = 0;
/**
 * Create a labelled checkbox.
 * ```html
 * <div class="anr-option-row">
 * 	<label>
 * 		<input class="anr-checkbox">
 * 		<span class="anr-checkbox-label">labelText</span>
 * 	</label>
 * </div>
 * ```
 * @param labelText The label text.
 * @param options
 * @returns
 */
function createLabelledCheckbox(labelText: string, options: LabelledCheckboxOptions = {}): {
	$wrapper: JQuery<HTMLDivElement>;
	$checkbox: JQuery<HTMLInputElement>;
	$label: JQuery<HTMLSpanElement>;
} {
	const id = options.checkboxId && !document.getElementById(options.checkboxId) ? options.checkboxId : 'anr-checkbox-' + (checkboxCnt++);
	const $outerLabel: JQuery<HTMLLabelElement> = $('<label>');
	$outerLabel.attr('for', id);
	const $wrapper = Reporter.createRow();
	$wrapper.removeAttr('class').addClass((options.alterClasses || ['anr-option-row']).join(' ')).append($outerLabel);
	const $checkbox: JQuery<HTMLInputElement> = $('<input>');
	$checkbox
		.prop({
			id,
			type: 'checkbox'
		})
		.addClass('anr-checkbox');
	const $label = $('<span>');
	$label.addClass('anr-checkbox-label').text(labelText);
	$outerLabel.append($checkbox, $label);
	return {$wrapper, $checkbox, $label};
}

/**
 * Extract a CIDR address from text.
 *
 * Regular expressions used in this method are adapted from `mediawiki.util`.
 * - {@link https://doc.wikimedia.org/mediawiki-core/master/js/source/util.html#mw-util-method-isIPv4Address | mw.util.isIPv4Address}
 * - {@link https://doc.wikimedia.org/mediawiki-core/master/js/source/util.html#mw-util-method-isIPv6Address | mw.util.isIPv6Address}
 *
 * @param text
 * @returns The extracted CIDR, or `null` if there's no match.
 */
function extractCidr(text: string): string|null {

	const v4_byte = '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|0?[0-9]?[0-9])';
	const v4_regex = new RegExp('(?:' + v4_byte + '\\.){3}' + v4_byte + '\\/(?:3[0-2]|[12]?\\d)');
	const v6_block = '\\/(?:12[0-8]|1[01][0-9]|[1-9]?\\d)';
	const v6_regex = new RegExp(
		'(?::(?::|(?::[0-9A-Fa-f]{1,4}){1,7})|[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){0,6}::|[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){7})' +
		v6_block
	);
	const v6_regex2 = new RegExp('[0-9A-Fa-f]{1,4}(?:::?[0-9A-Fa-f]{1,4}){1,6}' + v6_block);

	let m;
	if ((m = text.match(v4_regex)) ||
		(m = text.match(v6_regex)) ||
		(m = text.match(v6_regex2)) && /::/.test(m[0]) && !/::.*::/.test(m[0])
	) {
		return m[0];
	} else {
		return null;
	}

}

function getImage(iconType: 'exclamation'|'bar'|'clock') {
	const img = document.createElement('img');
	switch (iconType) {
		case 'exclamation':
			img.src = 'https://upload.wikimedia.org/wikipedia/commons/c/c6/OOjs_UI_icon_alert-warning-black.svg';
			break;
		case 'bar':
			img.src = 'https://upload.wikimedia.org/wikipedia/commons/e/e5/OOjs_UI_icon_subtract.svg';
			break;
		case 'clock':
			img.src = 'https://upload.wikimedia.org/wikipedia/commons/8/85/OOjs_UI_icon_clock-progressive.svg';
	}
	img.style.cssText = 'vertical-align: middle; height: 1em; border: 0;';
	return img;
}

// ******************************************************************************************

// Entry point
init();

// ******************************************************************************************
})();
//</nowiki>