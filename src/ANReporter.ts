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

		// Create a style tag
		createStyleTag();

		// Main procedure
		if (onConfig) {
			// If on the config page, create the interface after loading dependent modules
			$(loadConfigInterface); // Show a 'now loading' message as soon as the DOM gets ready
			const modules = [
				'mediawiki.user',
				'oojs-ui',
				'oojs-ui.styles.icons-editing-core',
				'oojs-ui.styles.icons-moderation',
				'mediawiki.api',
			];
			$.when(mw.loader.using(modules), $.ready).then(createConfigInterface);
		} else {
			// If not on the config page, create a portlet link to open the ANR dialog after loading dependent modules
			const modules = [
				'mediawiki.user',
				'mediawiki.util',
				'mediawiki.api',
				'mediawiki.Title',
				'oojs-ui',
			];
			$.when(mw.loader.using(modules), $.ready).then(() => {
				const portlet = createPortletLink();
				if (!portlet) {
					console.error(`${ANR}: ポートレットリンクの作成に失敗しました。`);
					return;
				}
				portlet.addEventListener('click', (e) => {
					e.preventDefault();
					new Reporter();
				});
			});
		}

	});

}

// function createStyleTag

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
			reasons: this.reasons.getValue().split('\n').filter(el => el),
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
function createStyleTag(): void {
	const style = document.createElement('style');
	style.textContent =
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
		'.anr-dialog-content {' +
			'padding: 1em;' +
		// '}' +
		// '.anr-dialog.ui-dialog-content,' +
		// '.anr-dialog .ui-dialog-content,' +
		// '.anr-dialog.ui-corner-all,' +
		// '.anr-dialog .ui-corner-all,' +
		// '.anr-dialog.ui-draggable,' +
		// '.anr-dialog .ui-draggable,' +
		// '.anr-dialog.ui-resizable,' +
		// '.anr-dialog .ui-resizable,' +
		// '.anr-dialog .ui-dialog-buttonpane {' +
		// 	'background-color: yellow;' +
		// '}' +
		// '.anr-dialog .ui-dialog-titlebar,' +
		// '.anr-dialog .ui-dialog-titlebar-close {' +
		// 	'background-color: pink !important;' +
		'}';
	document.head.appendChild(style);
}

class Reporter {

	$dialog: JQuery<HTMLElement>;
	$content: JQuery<HTMLElement>;
	fieldset: OO.ui.FieldsetLayout;
	loader: OO.ui.ProgressBarWidget;

	page: OO.ui.DropdownWidget;
	section: OO.ui.DropdownWidget;
	reason: OO.ui.MultilineTextInputWidget;
	addComment: OO.ui.CheckboxInputWidget;
	blockCheck: OO.ui.CheckboxInputWidget;
	duplicateCheck: OO.ui.CheckboxInputWidget;
	watchUser: OO.ui.CheckboxInputWidget;

	constructor() {

		const cfg = Config.merge();

		// Create dialog
		this.$dialog = $('<div>').attr('title', ANR).css({
			'width': 'max-content'
		});
		this.$content = $('<div>').addClass('anr-dialog-content');
		this.$dialog.append(this.$content);
		this.fieldset = new OO.ui.FieldsetLayout();
		this.$content.append(this.fieldset.$element);
		this.$dialog.dialog({
			dialogClass: 'anr-dialog',
			resizable: false,
			modal: true,
			// height: 'auto',
			width: 'auto',
			position: {
				my: 'center',
				at: 'center',
				of: window
			}
		});
		// Reporter.setUpWidth(this.$dialog, this.fieldset);
		
		// Append a progress bar to show when the dialog is getting ready
		this.loader = new OO.ui.ProgressBarWidget({
			progress: false
		});
		this.fieldset.addItems([
			new OO.ui.FieldLayout(this.loader, {
				label: '読み込み中...',
				align: 'top'
			})
		]);
		Reporter.centerDialog(this.$dialog);

		// Create main dialog elements
		this.page = new OO.ui.DropdownWidget({
			id: 'anr-dialog-page',
			label: '選択してください',
			menu: {
				items: [
					new OO.ui.MenuOptionWidget({
						data: ANI,
						label: ANI
					}),
					new OO.ui.MenuOptionWidget({
						data: ANS,
						label: ANS
					}),
					new OO.ui.MenuOptionWidget({
						data: AN3RR,
						label: AN3RR
					})
				]
			}
		});
		this.section = new OO.ui.DropdownWidget({
			id: 'anr-dialog-section',
			label: '選択してください'
		});
		this.reason = new OO.ui.MultilineTextInputWidget({
			id: 'anr-dialog-reason',
			rows: 5
		});
		this.addComment = new OO.ui.CheckboxInputWidget();
		this.blockCheck = new OO.ui.CheckboxInputWidget({
			selected: cfg.blockCheck
		});
		this.duplicateCheck = new OO.ui.CheckboxInputWidget({
			selected: cfg.duplicateCheck
		});
		this.watchUser = new OO.ui.CheckboxInputWidget({
			selected: cfg.watchUser
		});

		this.fieldset.clearItems().addItems([
			new OO.ui.FieldLayout(this.page, {
				label: '報告先',
				align: 'top'
			}),
			new OO.ui.FieldLayout(this.section, {
				label: 'セクション',
				align: 'top'
			}),
			// new OO.ui.FieldLayout(this.reason, {
			// 	label: '理由',
			// 	align: 'top'
			// }),
			// new OO.ui.FieldLayout(this.addComment, {
			// 	label: '要約にコメントを追加',
			// 	align: 'inline'
			// }),
			// new OO.ui.FieldLayout(this.blockCheck, {
			// 	label: '報告前にブロック状態をチェック',
			// 	align: 'inline'
			// }),
			// new OO.ui.FieldLayout(this.duplicateCheck, {
			// 	label: '報告前に重複報告をチェック',
			// 	align: 'inline'
			// }),
			// new OO.ui.FieldLayout(this.watchUser, {
			// 	label: '報告対象者をウォッチ',
			// 	align: 'inline'
			// }),
		]);
		createUserPane();
		// this.$content.append(createUserPane());
		
		Reporter.centerDialog(this.$dialog);

		// const user = new User();
		// this.$content.append(user.wrapper);

	}

	/**
	 * Set up the width of the Reporter dialog (this static method is to be called in the constructor).
	 * 
	 * For this to work, **the dialog must be visible on the viewport**.
	 * @param $dialog
	 */
	static setUpWidth($dialog: JQuery<HTMLElement>, fieldset: OO.ui.FieldsetLayout): void {

		// Create a dummy dropdown with ANS selected
		const dummy = new OO.ui.DropdownWidget({
			id: 'anr-dialog-dummy',
			menu: {
				items: [
					new OO.ui.MenuOptionWidget({
						data: ANS,
						label: ANS
					})
				]
			}
		});
		dummy.getMenu().selectItemByData(ANS);

		// Add the dummy dropdown to the fieldset
		fieldset.addItems([
			new OO.ui.FieldLayout(dummy, {
				align: 'top'
			})
		]);

		// Set an absolute width to the dialog, in accordance with the outerWidth of the dropdown
		$dialog.dialog({width: $dialog.outerWidth(true)});

		// Remove the dummy dropdown
		fieldset.clearItems();

	}

	/**
	 * Bring a jQuery UI dialog to the center of the viewport.
	 * @param $dialog
	 */
	static centerDialog($dialog: JQuery<HTMLElement>): void {
		$dialog.dialog({
			position: {
				my: 'center',
				at: 'center',
				of: window
			}
		});
	}

}

/** The user field of the Reporter. */
class User {

	wrapper: JQuery<HTMLElement>;
	user: OO.ui.TextInputWidget;
	type: OO.ui.DropdownWidget;

	constructor() {

		this.wrapper = $('<div>').addClass('anr-userpane');

		this.user = new OO.ui.TextInputWidget();
		this.type = new OO.ui.DropdownWidget({
			label: this.user.$element,
			menu: {
				items: [
					new OO.ui.MenuOptionWidget({
						data: 'UNL',
						label: 'UNL'
					}),
					new OO.ui.MenuOptionWidget({
						data: 'user2',
						label: 'user2'
					}),
					new OO.ui.MenuOptionWidget({
						data: 'IP2',
						label: 'IP2'
					}),
					new OO.ui.MenuOptionWidget({
						data: 'logid',
						label: 'logid'
					}),
					new OO.ui.MenuOptionWidget({
						data: 'diff',
						label: 'diff'
					}),
					new OO.ui.MenuOptionWidget({
						data: 'none',
						label: 'none'
					}),
				]
			}
		});

		this.wrapper.append(this.user.$element, this.type.$element);

	}

	static add(fieldset: OO.ui.FieldsetLayout, index?: number): User {
		const U = new User();
		fieldset.addItems([
			// @ts-ignore
			new OO.ui.FieldLayout(U.wrapper)
		], index);
		return U;
	}

}

function createUserPane() {
	const wrapper = new OO.ui.mixin.GroupElement();
	const input = new OO.ui.TextInputWidget();
	const dropdown = new OO.ui.DropdownWidget({
		menu: {
			items: [
				new OO.ui.MenuOptionWidget({
					data: 'UNL',
					label: 'UNL'
				}),
				new OO.ui.MenuOptionWidget({
					data: 'user2',
					label: 'user2'
				}),
				new OO.ui.MenuOptionWidget({
					data: 'IP2',
					label: 'IP2'
				}),
				new OO.ui.MenuOptionWidget({
					data: 'logid',
					label: 'logid'
				}),
				new OO.ui.MenuOptionWidget({
					data: 'diff',
					label: 'diff'
				}),
				new OO.ui.MenuOptionWidget({
					data: 'none',
					label: 'none'
				}),
			]
		}
	});
	wrapper.addItems([input, dropdown]);
	console.log(wrapper);
	// input.$element.css('display', 'inline-block');
	// dropdown.$element.css('display', 'inline-block');
	// $wrapper.append(input.$element, dropdown.$element);

	return wrapper;
}

// ******************************************************************************************

// Entry point
init();

// ******************************************************************************************
})();
//</nowiki>