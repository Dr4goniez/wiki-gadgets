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

// ******************************************************************************************

// Main functions

/** Initialize the script. */
function init() {

	// Is the user autoconfirmed?
	if (mw.config.get('wgUserGroups').indexOf('autoconfirmed') === -1) {
		mw.notify('あなたは自動承認されていません。AN Reporterを終了します。', {type: 'warn'});
		return;
	}

	/** Whether the user is on the config page. */
	const onConfig = mw.config.get('wgNamespaceNumber') === -1 && /^(ANReporterConfig|ANRC)$/i.test(mw.config.get('wgTitle'));

	const libName = 'ext.gadget.WpLibExtra';
	mw.loader.using(libName).then((require) => { // Load the library

		// Validate the library
		lib = require(libName);
		if (typeof (lib && lib.version) !== 'string') {
			console.error(`${ANR}: ライブラリの読み込みに失敗しました。`);
			return;
		}

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
			).then(() => {
				const portlet = createPortletLink();
				if (!portlet) {
					console.error(`${ANR}: ポートレットリンクの作成に失敗しました。`);
					return;
				}
				createStyleTag(Config.merge());
				$('head').append('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.13/css/select2.css">');
				portlet.addEventListener('click', Reporter.new);
			}).catch((...err) => {
				console.warn(err);
				mw.notify(ANR + ': モジュールの読み込みに失敗しました。', {type: 'error'});
			});
		}

	});

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
		'.anrc-buttonwrapper:not(:last-child) {' + // Margin below buttons
			'margin-bottom: 0.5em;' +
		'}' +
		// Dialog
		'.anr-hidden {' + // Used to show/hide elements on the dialog (by Reporter.toggle)
			'display: none;' +
		'}' +
		'#anr-dialog-progress {' + // One of the main dialog field
			'padding: 1em;' +
		'}' +
		'#anr-dialog-optionfield {' + // The immediate child of #anr-dialog-content
			'padding: 1em;' +
			'margin: 0;' +
			'border: 1px solid gray;' +
		'}' +
		'#anr-dialog-optionfield > legend {' +
			'font-weight: bold;' +
			'padding-bottom: 0;' +
		'}' +
		'#anr-dialog-optionfield hr {' +
			'margin: 0.8em 0;' +
			'background-color: gray;' +
		'}' +
		'.anr-option-row:not(:last-child) {' + // Margin below every option row
			'margin-bottom: 0.15em;' +
		'}' +
		'.anr-option-hideuser-wrapper:not(.anr-hidden) + .anr-option-blockstatus-wrapper {' +
			'margin-top: -0.15em;' + // Nullify the bottom margin
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
		'.anr-option-usertype-none {' +
			'border: 2px solid red;' +
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

interface EventIds {
	logid?: number;
	diffid?: number;
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
	$newUser: JQuery<HTMLInputElement>;
	/** The collection of user panes. */
	Users: UserCollection;
	/** The storage of event IDs associated with users. */
	ids: {[username: string]: EventIds;};
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

		// Create dialog contour
		this.$dialog = $('<div>');
		this.$dialog.attr('title', ANR).css('max-height', '70vh');
		this.$dialog.dialog({
			dialogClass: 'anr-dialog',
			resizable: false,
			height: 'auto',
			width: 'auto',
			modal: true,
			close: () => {
				this.destroy();
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
		const $pageLabel = Reporter.createLeftLabel($pageWrapper, '報告先');
		this.$page = $('<select>');
		this.$page
			.addClass('anr-juxtaposed') // Important for the dropdown to fill the remaining 
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
		Reporter.createLeftLabel($pageLinkWrapper, '');
		this.$pageLink = $('<a>');
		this.$pageLink
			.addClass('anr-disabledanchor') // Disable the anchor by default
			.text('報告先を確認')
			.prop('target', '_blank');
		$pageLinkWrapper.append(this.$pageLink);
		this.$fieldset.append($pageLinkWrapper);

		// Create section option for ANI and AN3RR
		this.$sectionWrapper = Reporter.createRow();
		const $sectionLabel = Reporter.createLeftLabel(this.$sectionWrapper, '節');
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
		const $sectionAnsLabel = Reporter.createLeftLabel(this.$sectionAnsWrapper, '節');
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
		const $newUserWrapper = Reporter.createRow();
		this.$newUser = $('<input>');
		this.$newUser.prop('type', 'button').val('追加');
		$newUserWrapper.append(this.$newUser);
		this.$fieldset.append($newUserWrapper);
		this.$fieldset.append(document.createElement('hr'));

		// Create a user pane 
		this.Users = new UserCollection($newUserWrapper);
		this.Users.add();
		this.$newUser.off('click').on('click', () => {
			const U = this.Users.add(); // Add a new user pane when the 'add' button is clicked
			// Add event handler to remove the pane when the label is SHIFT-clicked
			U.$wrapper.addClass('anr-option-removable');
			// eslint-disable-next-line @typescript-eslint/no-this-alias
			const self = this;
			U.$label
				.off('click').on('click', function(e) {
					if (e.shiftKey) {
						self.Users.remove(this.id);
					}
				})
				.prop('title', 'SHIFTクリックで除去');
		});
		const dialogWith = this.$fieldset.outerWidth(true)!;
		this.$fieldset.css('width', dialogWith); // Assign an absolute width to $content
		this.$progress.css('width', dialogWith);
		Reporter.centerDialog(this.$dialog); // Recenter the dialog because the width has been changed

		this.ids = {};

		/**
		 * (Bound to the change event of a \<select> element.)
		 * 
		 * Copy the selected value to the clipboard and reset the selection.
		 * @param this
		 */
		const copyThenResetSelection = function(this: HTMLSelectElement) {
			copyToClipboard(this.value);
			this.selectedIndex = 0;
		};

		// Create VIP copier
		this.$vipWrapper = Reporter.createRow(true);
		const $vipLabel = Reporter.createLeftLabel(this.$vipWrapper, 'VIP');
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
		const $ltaLabel = Reporter.createLeftLabel(this.$ltaWrapper, 'LTA');
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
		const $predefinedLabel = Reporter.createLeftLabel($predefinedWrapper, '定型文');
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
		Reporter.createLeftLabel($reasonWrapper, '理由');
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

		// Set all the left labels to the same width
		const $labels = $('.anr-option-label');
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const optionsWidths = Array.prototype.map.call<JQuery<HTMLElement>, any[], number[]>(
			$labels,
			(el: HTMLElement) => el.offsetWidth // Collect the widths of all left labels
		);
		const optionWidth = Math.max(...optionsWidths); // Get the max value
		$labels.css('min-width', optionWidth); // Set the value to all

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
	static createLeftLabel($appendTo: JQuery<HTMLElement>, labelText: string): JQuery<HTMLDivElement> {
		const $label: JQuery<HTMLDivElement> = $('<div>');
		$label.addClass('anr-option-label').prop('innerHTML', labelText || '&nbsp;');
		$appendTo.append($label);
		return $label;
	}

	/**
	 * Compare the outerHeight of a left label div and that of a sibling div, and if the former is smaller than the latter,
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
	 * Wrap a \<select> element (next to a left label) with a div. This is for the element to fill the remaining space.
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

		e.preventDefault();

		const R = new Reporter();

		const heading: HTMLHeadingElement|null = 
			document.querySelector('.mw-first-heading') ||
			document.querySelector('.firstHeading') ||
			document.querySelector('#firstHeading');
		const relevantUser =
			<string|null>mw.config.get('wgRelevantUserName') ||
			mw.config.get('wgCanonicalSpecialPageName') === 'Contributions' && heading && heading.textContent && User.extractCidr(heading.textContent);
		if (relevantUser) {
			const U = R.Users.collection[0];
			U.$input.val(relevantUser);
			U.processInputChange();
		}
		
		$.when(
			lib.Wikitext.newFromTitle(ANS),
			getVipList(),
			getLtaList()
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

			Reporter.toggle(R.$progress, false).empty();
			Reporter.toggle(R.$content, true);

		});

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
		return <string>this.$page.find('option:selected').val() || null;
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
				ret = <string>this.$section.find('option:selected').val() || null;
				break;
			case ANS:
				ret = <string>this.$sectionAns.find('option:selected').val() || null;
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

	/**
	 * Search for the oldest account creation logid and the diffid of the newest edit of a user.
	 * @param username
	 * @returns
	 */
	getIds(username: string): JQueryPromise<EventIds> {
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
				this.ids[username] = {...ret};
			}
			return ret;
		}).catch((_, err) => {
			console.error(err);
			return ret;
		});
	}

	/**
	 * Close the Reporter dialog. (The dialog will be destroyed.)
	 */
	// close(): void {
	// 	this.$dialog.dialog('close');
	// }

	/**
	 * Destroy the Reporter dialog.
	 */
	destroy(): void {
		this.$dialog.empty().dialog('destroy');
	}

}

class UserCollection {

	$next: JQuery<HTMLElement>;
	collection: User[];

	constructor($next: JQuery<HTMLElement>) {
		this.$next = $next;
		this.collection = [];
	}

	/**
	 * Add a new user pane to the {@link Reporter} and {@link UserCollection} instances.
	 * @returns The newly-initialized {@link User} instance.
	 */
	add(): User {
		const U = new User(this.$next);
		if (this.collection.length) {
			const minWidth = this.collection[0].$label.outerWidth()! + 'px';
			$.each([U.$wrapper, U.$hideUserWrapper, U.$blockStatusWrapper], function() {
				$(this).children('.anr-option-label').css('min-width', minWidth);
			});
		}
		this.collection.push(U);
		return U;
	}

	/**
	 * Remove a user pane from the {@link Reporter} and {@link UserCollection} instances.
	 * @param id
	 * @returns
	 */
	remove(id: string): UserCollection {
		const idx = this.collection.findIndex((U) => U.id === id);
		if (idx !== -1) { // Should never be -1
			const U = this.collection[idx];
			U.$wrapper.remove();
			U.$hideUserWrapper.remove();
			U.$blockStatusWrapper.remove();
			this.collection.splice(idx, 1);
		}
		return this;
	}

}

let userPaneCnt = 0;
/**
 * The User class. An instance of this handles a User field row on the Reporter dialog.
 */
class User {

	/** The main wrapper that contains the user pane as a row. */
	$wrapper: JQuery<HTMLDivElement>;
	/** The ID on {@link $label}. */
	id: string;
	/** The label. */
	$label: JQuery<HTMLDivElement>;
	/** The username input. */
	$input: JQuery<HTMLInputElement>;
	/** The type dropdown. */
	$type: JQuery<HTMLSelectElement>;
	/** The wrapper row of the "hideuser" checkbox. */
	$hideUserWrapper: JQuery<HTMLDivElement>;
	/** The "hideuser" checkbox. */
	$hideUser: JQuery<HTMLInputElement>;

	$idLinkWrapper: JQuery<HTMLDivElement>;
	$idLink: JQuery<HTMLAnchorElement>;

	/** The wrapper row of the "blockstatus" anchor. */
	$blockStatusWrapper: JQuery<HTMLDivElement>;
	/** The "blockstatus" anchor. */
	$blockStatus: JQuery<HTMLAnchorElement>;

	/**
	 * Create a user pane of the Reporter dialog with the following structure.
	 * ```html
	 * <div class="anr-option-row">
	 * 	<div class="anr-option-label">利用者</div> <!-- float: left; -->
	 * 	<div class="anr-option-usertype"> <!-- float: right; -->
	 * 		<select>...</select>
	 * 	</div>
	 * 	<div class="anr-option-wrapper"> <!-- overflow: hidden; -->
	 * 		<input class="anr-option-username anr-juxtaposed"> <!-- width: 100%; -->
	 * 	</div>
	 * </div>
	 * <div class="anr-option-row">
	 * 	<div class="anr-option-label"></div> <!-- float: left; -->
	 * 	<div class="anr-option-hideuser">
	 * 		<label>
	 * 			<input class="anr-checkbox">
	 * 			<span class="anr-checkbox-label">利用者名を隠す</span>
	 * 		</label>
	 * 	</div>
	 * </div>
	 * <div class="anr-option-row">
	 * 	<div class="anr-option-label"></div> <!-- float: left; -->
	 * 	<div class="anr-option-blockstatus">
	 * 		<a>ブロックあり</a>
	 * 	</div>
	 * </div>
	 * <!-- ADD BUTTON HERE -->
	 * ```
	 * @param $next The element before which to create a user pane.
	 */
	constructor($next: JQuery<HTMLElement>) {

		this.$wrapper = Reporter.createRow();
		this.$wrapper.addClass('anr-option-userpane-wrapper');
		/*!
		 * Make it possible to remove the user pane when the label is SHIFT-clicked.
		 * However, the event needs to be resolved by a prototype method of UserCollection,
		 * so the event handler is attached in the constructor of Reporter that initializes
		 * an instance of UserCollection.
		 */
		this.id = 'anr-dialog-userpane-' + (userPaneCnt++);
		this.$label = Reporter.createLeftLabel(this.$wrapper, '利用者').prop('id', this.id);
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

		this.$hideUserWrapper = Reporter.createRow();
		this.$hideUserWrapper.addClass('anr-option-hideuser-wrapper');
		Reporter.createLeftLabel(this.$hideUserWrapper, '');
		const hideUserElements = createLabelledCheckbox('利用者名を隠す', {alterClasses: ['anr-option-hideuser']});
		this.$hideUser = hideUserElements.$checkbox;
		this.$hideUserWrapper.append(hideUserElements.$wrapper);
		$next.before(this.$hideUserWrapper);
		Reporter.toggle(this.$hideUserWrapper, false);

		this.$idLinkWrapper = Reporter.createRow();
		this.$idLinkWrapper.addClass('anr-option-idlink-wrapper');
		Reporter.createLeftLabel(this.$idLinkWrapper, '');
		this.$idLink = $('<a>');
		this.$idLink.prop('target', '_blank');
		this.$idLinkWrapper
			.append(
				$('<div>').addClass('anr-option-idlink').append(this.$idLink)
			);
		$next.before(this.$idLinkWrapper);
		Reporter.toggle(this.$idLinkWrapper, false);

		this.$blockStatusWrapper = Reporter.createRow();
		this.$blockStatusWrapper.addClass('anr-option-blockstatus-wrapper');
		Reporter.createLeftLabel(this.$blockStatusWrapper, '');
		this.$blockStatus = $('<a>');
		this.$blockStatus.prop('target', '_blank').text('ブロックあり');
		this.$blockStatusWrapper
			.append(
				$('<div>').addClass('anr-option-blockstatus').append(this.$blockStatus)
			);
		$next.before(this.$blockStatusWrapper);
		Reporter.toggle(this.$blockStatusWrapper, false);

	}

	/**
	 * Evaluate a username, classify it into a type, and check the block status of the relevant user.
	 * @param username
	 * @returns
	 */
	static getInfo(username: string): JQueryPromise<{type: 'ip'|'user'|'other'; blocked: boolean|null;}> {
		const params: {[key: string]: string;} = {
			action: 'query',
			list: 'users|blocks',
			ususers: username,
			formatversion: '2'
		};
		const isIp = mw.util.isIPAddress(username, true);
		if (isIp) {
			params.bkip = username;
		} else if (/[@/#<>[\]|{}:]/.test(username)) { // Contains a character that can't be used in a username
			return $.Deferred().resolve({
				type: 'other',
				blocked: null
			});
		} else {
			params.bkusers = username;
		}
		return new mw.Api().get(params)
			.then((res) => {
				const resUs = res && res.query && res.query.users;
				const resBl = res && res.query && res.query.blocks;
				if (resUs && resBl) {
					return {
						type: isIp ? 'ip' : resUs[0].userid !== void 0 ? 'user' : 'other',
						blocked: !!resBl.length
					};
				} else {
					throw new Error('APIリクエストにおける不明なエラー');
				}
			})
			.catch((_, err) => {
				console.error(err);
				mw.notify('ユーザー情報の取得に失敗しました。', {type: 'error'});
				return {
					type: 'other',
					blocked: null
				};
			});
	}

	processTypeChange(): void {
		// Red border when 'none' is selected
		this.$type.toggleClass('anr-option-usertype-none', !this.$type.prop('disabled') && this.$type.val() === 'none');
	}

	/**
	 * Update the user pane in accordance with the value in the username field. This method:
	 * - figures out the type of the relevant username: `ip`, `user`, or `other` (uses an AJAX call).
	 * - enables/disables options in the UserAN type selector dropdown with reference to the user type.
	 * - checks the block status of the relevant user (if any) and shows/hides the block status link.
	 */
	processInputChange(): JQueryPromise<void> {

		const def = $.Deferred();

		/**
		 * A mapping from a user type to array indexes that represent UserAN types to show in the type selector dropdown.
		 * - 0: `UNL`
		 * - 1: `User2`
		 * - 2: `IP2`
		 * - 3: `logid`
		 * - 4: `diff`
		 * - 5: `none`
		 * 
		 * Note that the element at index 0 is what's selected at initialization.
		 */
		const typeMap = {
			ip: [2, 5],
			user: [0, 1, 5],
			other: [5, 3, 4]
		};
		const username = lib.clean(<string>this.$input.val(), false);
		Reporter.toggle(this.$idLinkWrapper, false); // Hide the id link
		this.$hideUser.prop('checked', false); // Uncheck the hideuser checkbox

		if (!username || /^\s+$/.test(username)) { // Blank or whitespace only

			this.$input.val('');
			this.$type.prop('disabled', true).children('option').eq(5).prop('selected', true); // Disable dropdown and select 'none'
			this.$type.trigger('change');
			Reporter.toggle(this.$hideUserWrapper, false); // Hide the hideuser checkbox
			Reporter.toggle(this.$blockStatusWrapper, false); // Hide the block status link
			def.resolve(void 0);

		} else { // Some username is in the input

			User.getInfo(username).then((obj) => {

				this.$type
					.prop('disabled', false) // Enable dropdown
					.children('option').each(function(i, opt) { // Loop all the options

						// Set up the UserAN type dropdown
						const idx = typeMap[obj.type].indexOf(i);
						opt.hidden = idx === -1; // Show/hide options
						if (idx === 0) {
							opt.selected = true; // Select option in accordance with typeMap
						}

					});
				this.$type.trigger('change');

				// Type-dependent setup
				if (obj.type === 'user' || obj.type === 'ip') {
					Reporter.toggle(this.$hideUserWrapper, obj.type === 'user');
					this.$blockStatus.prop('href', mw.util.getUrl('Special:Contribs/' + username));
					if (obj.blocked === null) {
						this.$blockStatus.text('ブロック状態不明');
						Reporter.toggle(this.$blockStatusWrapper, true);
					} else {
						this.$blockStatus.text('ブロックあり');
						Reporter.toggle(this.$blockStatusWrapper, obj.blocked);
					}
				} else { // other
					Reporter.toggle(this.$hideUserWrapper, false);
					Reporter.toggle(this.$blockStatusWrapper, false);
				}

				def.resolve(void 0);

			});

		}

		return def.promise();

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
	static extractCidr(text: string): string|null {

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

	/**
	 * Get the username in the textbox.
	 * @returns
	 */
	getName(): string|null {
		return lib.clean(<string>this.$input.val()) || null;
	}

	/**
	 * Get the UserAN type selected in the dropdown.
	 * @returns
	 */
	getType(): string {
		return <string>this.$type.find('option:selected').val();
	}

}

/**
 * Copy a string to the clipboard.
 * @param str
 */
function copyToClipboard(str: string): void {

	const temp = document.createElement('textarea');
	document.body.appendChild(temp); // Create a temporarily hidden text field
	temp.value = str; // Put the passed string to the text field
	temp.select(); // Select the text
	document.execCommand('copy'); // Copy it to the clipboard
	temp.remove();

	const msg = document.createElement('div');
	msg.innerHTML = `<code style="font-family: inherit;">${str}</code>をクリップボードにコピーしました。`;
	mw.notify(msg, {type: 'success'});

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
} {
	const id = options.checkboxId && !document.getElementById(options.checkboxId) ? options.checkboxId : 'anr-checkbox-' + (checkboxCnt++);
	const $label: JQuery<HTMLLabelElement> = $('<label>');
	$label.attr('for', id);
	const $wrapper = Reporter.createRow();
	$wrapper.removeClass().addClass((options.alterClasses || ['anr-option-row']).join(' ')).append($label);
	const $checkbox: JQuery<HTMLInputElement> = $('<input>');
	$checkbox
		.prop({
			id,
			type: 'checkbox'
		})
		.addClass('anr-checkbox');
	const $checkboxLabel = $('<span>');
	$checkboxLabel.addClass('anr-checkbox-label').text(labelText);
	$label.append($checkbox, $checkboxLabel);
	return {$wrapper, $checkbox};
}

/**
 * Get a list of VIPs.
 * @returns
 */
function getVipList(): JQueryPromise<string[]> {
	return new mw.Api().get({
		action: 'parse',
		page: 'Wikipedia:進行中の荒らし行為',
		prop: 'sections',
		formatversion: '2'
	}).then((res) => {

		const resSect = res && res.parse && res.parse.sections; // undefined or array of objects
		if (!resSect) return[];

		// Define sections tiltles that are irrelevant to VIP names
		const excludeList = [
			'記述について',
			'急を要する二段階',
			'配列',
			'ブロック等の手段',
			'このページに利用者名を加える',
			'注意と選択',
			'警告の方法',
			'未登録（匿名・IP）ユーザーの場合',
			'登録済み（ログイン）ユーザーの場合',
			'警告中',
			'関連項目'
		];

		// Return a list
		return resSect.reduce((acc: string[], {line, level}: {line: string, level: string}) => {
			if (excludeList.indexOf(line) === -1 && level === '3') {
				acc.push(line); // NAME in WP:VIP#NAME
			}
			return acc;
		}, []);

	}).catch((code, err) => {
		console.log(err);
		return [];
	});
}

/**
 * Get a list of LTAs.
 * @returns
 */
function getLtaList(): JQueryPromise<string[]> {
	return lib.continuedRequest({
		action: 'query',
		list: 'allpages',
		apprefix: 'LTA:',
		apnamespace: '0',
		apfilterredir: 'redirects',
		aplimit: 'max',
		formatversion: '2'
	}, Infinity)
	.then((response) => {
		return response.reduce((acc: string[], res) => {
			const resPgs = res && res.query && res.query.allpages;
			(resPgs || []).forEach(({title}: {title: string}) => {
				if (/^LTA:[^/]+$/.test(title)) {
					acc.push(title.replace(/^LTA:/, '')); // NAME in LTA:NAME
				}
			});
			return acc;
		}, []);
	});
}

// ******************************************************************************************

// Entry point
init();

// ******************************************************************************************
})();
//</nowiki>