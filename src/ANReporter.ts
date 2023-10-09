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
					'<code>portletId</code>を指定します。未指定または値が無効の場合、使用中のスキンに応じて自動的にリンクの生成位置が決定されます。'
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
		const cfg: ANReporterConfig = {
			reasons: this.reasons.getValue().split('\n').filter(el => lib.clean(el)),
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
		'.anr-dialog-spinner {' +
			'padding: 1em;' +
		'}' +
		'#anr-dialog-optionfield {' +
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
		'.anr-option-row:not(:last-child) {' +
			'margin-bottom: 0.15em;' +
		'}' +
		'.anr-option-row-withselect2 {' +
			'margin: 0.3em 0;' +
		'}' +
		'.anr-option-label {' +
			'margin-right: 1em;' +
			'float: left;' + // For a juxtaposed div to fill the remaining space
		'}' +
		'.anr-option-wrapper {' +
			'overflow: hidden;' + // Implicit width of 100% (for the child element below)
		'}' +
		'#anr-option-reason, ' +
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
		'.anr-dialog-userpane-types {' +
			'float: right;' +
			'margin-left: 0.3em;' +
		'}' +
		'.anr-checkbox {' +
			'margin-right: 0.5em;' +
		'}' +
		'#anr-option-comment {' +
			'display: none;' +
		'}' +
		'#anr-option-addcomment:checked ~ #anr-option-comment {' +
			'display: block;' +
		'}' +
		'#anr-option-watchexpiry-wrapper {' +
			'display: none;' +
		'}' +
		'#anr-option-watchuser:checked ~ #anr-option-watchexpiry-wrapper {' +
			'display: block;' +
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

/**
 * The Reporter class. Manipulates the ANR dialog.
 */
class Reporter {

	/** The Reporter config. */
	cfg: ANReporterConfig;
	/** The Reporter dialog. */
	$dialog: JQuery<HTMLDivElement>;
	/** The wrapper of the div with a spinner. */
	$spinner: JQuery<HTMLDivElement>;
	/** The label of the spinner image. */
	$spinnerLabel: JQuery<HTMLSpanElement>;
	/** The inner content wrapper of the dialog. */
	$content: JQuery<HTMLDivElement>;
	/** The fieldset that contains main dialog options on $content. */
	$fieldset: JQuery<HTMLFieldSetElement>;
	/** The page selector dropdown. */
	page: HTMLSelectElement;
	/** The link to (the section in) the page to which to forward the report. */
	pageLink: HTMLAnchorElement;
	/** The wrapper row for the section selector dropdown for ANI and AN3RR. */
	$sectionWrapper: JQuery<HTMLDivElement>;
	/** The section selector dropdown for ANI and AN3RR. */
	section: HTMLSelectElement;
	/** The wrapper row for the select2 section selector dropdown for ANS. */
	$sectionAnsWrapper: JQuery<HTMLDivElement>;
	/** The select2 section selector dropdown for ANS. */
	$sectionAns: JQuery<HTMLSelectElement>;
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
	reason: HTMLTextAreaElement;
	/** The checkbox for whether to add a comment to the report summary. */
	addComment: HTMLInputElement;
	/** The text field to specify an additional comment to the report summary. */
	comment: HTMLTextAreaElement;
	/** The checkbox for whether to check the block statuses of reportees before submitting the report. */
	checkBlock: HTMLInputElement;
	/** The checkbox for whether to check existing duplicate reports before submitting the report. */
	checkDuplicates: HTMLInputElement;
	/** The checkbox for whether to watch the reportees. */
	watchUser: HTMLInputElement;
	/** The dropdown to specify the expiration time of watching the reportees. */
	watchExpiry: HTMLSelectElement;

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

		// Create spinner container
		this.$spinner = $('<div>');
		this.$spinner.addClass('anr-dialog-spinner');
		this.$spinnerLabel = $('<span>');
		this.$spinnerLabel.text('読み込み中');
		const spinnerImg = lib.getIcon('load');
		spinnerImg.style.marginLeft = '0.5em';
		this.$spinner.append(this.$spinnerLabel, spinnerImg);
		this.$dialog.append(this.$spinner);

		// Create option container
		this.$content = $('<div>');
		this.$content.addClass('anr-dialog-content');
		this.$dialog.append(this.$content);

		// Create fieldset
		this.$fieldset = $('<fieldset>');
		this.$fieldset.prop({
			id: 'anr-dialog-optionfield',
			innerHTML: '<legend>利用者を報告</legend>'
		});
		this.$content.append(this.$fieldset);

		// Create target page option
		const pageWrapper = Reporter.createRow();
		Reporter.createLeftLabel(pageWrapper, '報告先');
		this.page = document.createElement('select');
		this.page.classList.add('anr-juxtaposed'); // Important for the dropdown to fill the remaining space
		this.page.innerHTML =
			'<option selected disabled hidden>選択してください</option>' +
			'<option>' + ANI + '</option>' +
			'<option>' + ANS + '</option>' +
			'<option>' + AN3RR + '</option>';
		Reporter.wrapElement(pageWrapper, this.page); // As important as above
		this.$fieldset.append(pageWrapper);

		// Create target page anchor
		const pageLinkWrapper = Reporter.createRow();
		Reporter.createLeftLabel(pageLinkWrapper, '&nbsp;');
		this.pageLink = document.createElement('a');
		this.pageLink.target = '_blank';
		this.pageLink.textContent = '報告先を確認';
		this.pageLink.classList.add('anr-disabledanchor'); // Disable the anchor by default
		pageLinkWrapper.appendChild(this.pageLink);
		this.$fieldset.append(pageLinkWrapper);

		// Create section option for ANI and AN3RR
		const sectionWrapper = Reporter.createRow();
		this.$sectionWrapper = $(sectionWrapper);
		Reporter.createLeftLabel(sectionWrapper, '節');
		this.section = document.createElement('select');
		this.section.innerHTML = '<option selected disabled hidden>選択してください</option>';
		this.section.disabled = true;
		Reporter.wrapElement(sectionWrapper, this.section);
		this.$fieldset.append(sectionWrapper);

		// Create section option for ANS
		const section2Wrapper = Reporter.createRow(true);
		this.$sectionAnsWrapper = $(section2Wrapper);
		Reporter.createLeftLabel(section2Wrapper, '節');
		const section2 = document.createElement('select'); // Options are created in `new`
		Reporter.wrapElement(section2Wrapper, section2);
		this.$sectionAns = $(section2);
		this.$fieldset.append(section2Wrapper);
		Reporter.select2(this.$sectionAns);

		// Create a user pane (which is supposed to be the widest row)
		this.$fieldset.append(document.createElement('hr'));
		this.$fieldset.append(new UserPane().wrapper);
		const dialogWith = this.$fieldset.outerWidth(true)!;
		this.$fieldset.css('width', dialogWith); // Assign an absolute width to $content
		this.$spinner.css('width', dialogWith);
		this.$fieldset.append(document.createElement('hr'));
		Reporter.centerDialog(this.$dialog); // Recenter the dialog because the width has been changed

		// Create VIP copier
		const vipWrapper = Reporter.createRow(true);
		vipWrapper.style.clear = 'all';
		this.$vipWrapper = $(vipWrapper);
		Reporter.createLeftLabel(vipWrapper, 'VIP');
		const vip = document.createElement('select'); // Options are created in `new`
		Reporter.wrapElement(vipWrapper, vip);
		this.$vip = $(vip);
		this.$vip.off('change').on('change', function() {
			copyToClipboard(this.value);
			this.selectedIndex = 0;
		});
		this.$fieldset.append(vipWrapper);
		Reporter.select2(this.$vip);

		// Create LTA copier
		const ltaWrapper = Reporter.createRow(true);
		this.$ltaWrapper = $(ltaWrapper);
		Reporter.createLeftLabel(ltaWrapper, 'LTA');
		const lta = document.createElement('select'); // Options are created in `new`
		Reporter.wrapElement(ltaWrapper, lta);
		this.$lta = $(lta);
		this.$lta.off('change').on('change', function() {
			copyToClipboard(this.value);
			this.selectedIndex = 0;
		});
		this.$fieldset.append(ltaWrapper);
		Reporter.select2(this.$lta);

		// Create predefined reason selector
		const predefinedWrapper = Reporter.createRow(true);
		Reporter.createLeftLabel(predefinedWrapper, '定型文');
		const predefined = document.createElement('select');
		['選択して挿入'].concat(this.cfg.reasons).forEach((reason, i) => {
			const option = document.createElement('option');
			option.textContent = reason;
			if (i === 0) {
				option.selected = true;
				option.disabled = true;
				option.hidden = true;
			}
			predefined.add(option);
		});
		Reporter.wrapElement(predefinedWrapper, predefined);
		this.$predefined = $(predefined);
		this.$fieldset.append(predefinedWrapper);
		Reporter.select2(this.$predefined);

		// Create reason field
		const reasonWrapper = Reporter.createRow();
		Reporter.createLeftLabel(reasonWrapper, '理由');
		this.reason = document.createElement('textarea');
		this.reason.id = 'anr-option-reason';
		this.reason.rows = 5;
		this.reason.placeholder = '署名不要';
		reasonWrapper.appendChild(this.reason);
		this.$fieldset.append(reasonWrapper);

		// Create "add comment" option
		const addCommentElements = createLabelledCheckbox('要約にコメントを追加', 'anr-option-addcomment');
		this.addComment = addCommentElements.checkbox;
		this.$fieldset.append(addCommentElements.wrapper);
		this.comment = document.createElement('textarea');
		this.comment.id = 'anr-option-comment';
		this.comment.rows = 2;
		addCommentElements.wrapper.appendChild(this.comment);

		// Create "block check" option
		const checkBlockElements = createLabelledCheckbox('報告前にブロック状態をチェック', 'anr-option-checkblock');
		this.checkBlock = checkBlockElements.checkbox;
		this.$fieldset.append(checkBlockElements.wrapper);

		// Create "duplicate check" option
		const checkDuplicatesElements = createLabelledCheckbox('報告前に重複報告をチェック', 'anr-option-checkduplicates');
		this.checkDuplicates = checkDuplicatesElements.checkbox;
		this.$fieldset.append(checkDuplicatesElements.wrapper);

		// Create "watch user" option
		const watchUserElements = createLabelledCheckbox('報告対象者をウォッチ', 'anr-option-watchuser');
		this.watchUser = watchUserElements.checkbox;
		this.$fieldset.append(watchUserElements.wrapper);
		this.watchExpiry = document.createElement('select');
		this.watchExpiry.id = 'anr-option-watchexpiry';
		this.watchExpiry.innerHTML =
			'<option value="infinity">無期限</option>' +
			'<option value="1 week">1週間</option>' +
			'<option value="2 weeks">2週間</option>' +
			'<option value="1 month">1か月</option>' +
			'<option value="3 months">3か月</option>' +
			'<option value="6 months">6か月</option>' +
			'<option value="1 year">1年</option>';
		const watchExpiryWrapper = document.createElement('div');
		watchExpiryWrapper.id = 'anr-option-watchexpiry-wrapper';
		watchExpiryWrapper.style.marginLeft = $(this.watchUser).outerWidth(true)! + 'px';
		watchExpiryWrapper.style.marginTop = '0.3em';
		watchExpiryWrapper.appendChild(document.createTextNode('期限: '));
		watchExpiryWrapper.appendChild(this.watchExpiry);
		watchUserElements.wrapper.appendChild(watchExpiryWrapper);

		// Set all the left labels to the same width
		const $labels = $('.anr-option-label');
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const optionsWidths = Array.prototype.map.call<JQuery<HTMLElement>, any[], number[]>(
			$labels,
			(el: HTMLElement) => el.offsetWidth // Collect the widths of all left labels
		);
		const optionWidth = Math.max(...optionsWidths); // Get the max value
		$labels.css('width', optionWidth); // Set the value to all

		// Make some wrappers invisible
		this.$sectionAnsWrapper.hide();
		this.$vipWrapper.hide();
		this.$ltaWrapper.hide();
		if (predefined.querySelectorAll('option').length < 2) {
			$(predefinedWrapper).hide();
		}
		this.$content.hide();

	}

	/**
	 * Create `<div class="anr-option-row"></div>`, used as a row.
	 * @param hasSelect2 `false` by default. If true, create `<div class="anr-option-row-withselect2"></div>`.
	 * @returns The created row.
	 */
	static createRow(hasSelect2 = false): HTMLDivElement {
		const row = document.createElement('div');
		row.classList.add(!hasSelect2 ? 'anr-option-row' : 'anr-option-row-withselect2');
		return row;
	}

	/**
	 * Create a \<div> that works as a left-aligned label.
	 * @param appendTo The element to which to append the label.
	 * @param labelText The text of the label (in fact the innerHTML).
	 * @returns The created label.
	 */
	static createLeftLabel(appendTo: HTMLElement, labelText: string): HTMLDivElement {
		const label = document.createElement('div');
		label.classList.add('anr-option-label');
		label.innerHTML = labelText;
		appendTo.appendChild(label);
		return label;
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
	 * @param appendTo The element to which to append the wrapper div.
	 * @param element The element to wrap.
	 * @returns The wrapper div.
	 */
	static wrapElement(appendTo: HTMLDivElement, element: HTMLSelectElement|HTMLInputElement): HTMLDivElement {
		const wrapper = document.createElement('div');
		wrapper.classList.add('anr-option-wrapper');
		element.classList.add('anr-juxtaposed');
		wrapper.appendChild(element);
		appendTo.appendChild(wrapper);
		return wrapper;
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
	 * Create a new Reporter dialog. This static method handles asynchronous procedures that are necessary
	 * after calling the constructor.
	 * @param e
	 */
	static new(e: MouseEvent) {

		e.preventDefault();

		const R = new Reporter();
		$.when(
			lib.Wikitext.newFromTitle(ANS),
			getVipList(),
			getLtaList()
		)
		.then((Wkt, vipList, ltaList) => {

			// Initialize the ANS section dropdown
			R.$sectionAns[0].innerHTML =
				'<option selected disabled hidden>選択してください</option>' +
				'<optgroup label="系列が立てられていないもの">' +
					'<option>著作権侵害・犯罪予告</option>' +
					'<option>名誉毀損・なりすまし・個人情報</option>' +
					'<option>妨害編集・いたずら</option>' +
					'<option>その他</option>' +
				'</optgroup>';
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
				R.$vip[0].innerHTML = '<option selected disabled hidden>選択してコピー</option>';
				const optgroup = document.createElement('optgroup');
				optgroup.style.display = 'none'; // Wrap with optgroup to adjust font size
				vipList.forEach((vip) => {
					const option = document.createElement('option');
					option.textContent = vip;
					option.value = '[[WP:VIP#' + vip + ']]';
					optgroup.appendChild(option);
				});
				R.$vip[0].add(optgroup);
				R.$vipWrapper.show();
			}

			// Initialize the LTA copier dropdown
			if (ltaList.length) {
				R.$lta[0].innerHTML = '<option selected disabled hidden>選択してコピー</option>';
				const optgroup = document.createElement('optgroup');
				optgroup.style.display = 'none'; // Wrap with optgroup to adjust font size
				ltaList.forEach((lta) => {
					const option = document.createElement('option');
					option.textContent = lta;
					option.value = '[[LTA:' + lta + ']]';
					optgroup.appendChild(option);
				});
				R.$lta[0].add(optgroup);
				R.$ltaWrapper.show();
			}

			R.$spinner.hide();
			R.$content.show();

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
	 * Destroy the Reporter dialog.
	 */
	destroy(): void {
		this.$dialog.empty().dialog('destroy');
	}

}

/**
 * The UserPane class. An instance of this handles a User field row on the main dialog.
 */
class UserPane {

	/** The wrapper row. */
	wrapper: HTMLDivElement;
	/** The username input. */
	input: HTMLInputElement;
	/** The type dropdown. */
	type: HTMLSelectElement;
	/** The options of the type dropdown. */
	options: HTMLOptionElement[];

	/**
	 * Create the following structure.
	 * ```html
	 * <div class="anr-dialog-userpane">
	 * 	<div class="anr-option-label">利用者</div> <!-- float: left; -->
	 * 	<div class="anr-dialog-userpane-types"> <!-- float: right; -->
	 * 		<select>...</select>
	 * 	</div>
	 * 	<div class="anr-option-wrapper"> <!-- overflow: hidden; -->
	 * 		<input class="anr-dialog-userpane-user anr-juxtaposed"> <!-- width: 100%; -->
	 * 	</div>
	 * </div>
	 * ```
	 */
	constructor() {

		this.wrapper = document.createElement('div');
		this.wrapper.classList.add('anr-dialog-userpane');
		Reporter.createLeftLabel(this.wrapper, '利用者');

		const typeWrapper = document.createElement('div');
		typeWrapper.classList.add('anr-dialog-userpane-types');
		this.type = document.createElement('select');
		this.options = ['UNL', 'User2', 'IP2', 'logid', 'diff', 'none'].map((t) => {
			const option = document.createElement('option');
			option.textContent = t;
			this.type.add(option);
			return option;
		});
		typeWrapper.appendChild(this.type);
		this.wrapper.appendChild(typeWrapper);

		this.input = document.createElement('input');
		this.input.type = 'text';
		this.input.classList.add('anr-dialog-userpane-user');
		Reporter.wrapElement(this.wrapper, this.input);

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
	msg.innerHTML = `<code>${str}</code>をクリップボードにコピーしました。`;
	mw.notify(msg, {type: 'success'});

}

let checkboxCnt = 0;
/**
 * Create a labelled checkbox.
 * @param labelText The label text.
 * @param checkboxId An optional checkbox ID. If not provided, an automatically generated ID is used.
 * @returns 
 */
function createLabelledCheckbox(labelText: string, checkboxId?: string): {wrapper: HTMLDivElement, checkbox: HTMLInputElement} {
	const checkbox = document.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.classList.add('anr-checkbox');
	const id = checkboxId && !document.getElementById(checkboxId) ? checkboxId : 'anr-checkbox-' + (checkboxCnt++);
	checkbox.id = id;
	const label = document.createElement('label');
	label.htmlFor = id;
	label.textContent = labelText;
	const wrapper = Reporter.createRow();
	wrapper.appendChild(checkbox);
	wrapper.appendChild(label);
	return {wrapper, checkbox};
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