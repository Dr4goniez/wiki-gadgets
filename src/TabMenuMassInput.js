/* global mw */
/* eslint-disable @typescript-eslint/no-this-alias */
//<nowiki>

//module.exports.
var TabMenuMassInput = /* @class */ (function() {

	// -- Private members --

	/**
	 * Object that consists of the elements of a tab menu.
	 * @typedef TabMenuItems
	 * @type {object}
	 * @property {JQuery<HTMLInputElement>} $radio The radio \<input> of the tabmenu.
	 * @property {JQuery<HTMLLabelElement>} $label The \<label> of the tabmenu.
	 * @property {JQuery<HTMLDivElement>} $content The content \<div> (which is a sibling of `$tab`) of the tabmenu.
	 */
	/**
	 * Index number used in {@link createTabContour}.
	 */
	var tabCount = 0;
	/**
	 * Create items for a new tab menu and append them to a wrapper element.
	 * ```
	 * <input class="tmmi-tab-radio" id="tmmi-tab-N" type="radio">
	 * <label class="tmmi-tab-label" for="tmmi-tab-N">labelText</label>
	 * <div class="tmmi-tab-content" id="tmmi-tab-content-N"></div>
	 * ```
	 * @param {JQuery<HTMLElement>} $appendTo
	 * @param {string} labelText
	 * @returns {TabMenuItems}
	 */
	var createTabMenuItems = function($appendTo, labelText) {

		tabCount++;
		var id = 'tmmi-tab-' + tabCount;
		var contentId = 'tmmi-tab-content-' + tabCount;

		var tabMenuIndex = document.querySelectorAll('.tmmi-container').length + 1;
		var /** @type {JQuery<HTMLInputElement>} */ $radio = $('<input>');
		$radio
			.addClass('tmmi-tab-radio')
			.prop({
				id: id,
				type: 'radio',
				name: 'tabmenu' + tabMenuIndex,
				checked: tabCount === 1
			});

		var /** @type {JQuery<HTMLLabelElement>} */ $label = $('<label>');
		$label
			.addClass('tmmi-tab-label')
			.prop('htmlFor', id)
			.text(labelText);

		var /** @type {JQuery<HTMLDivElement>} */ $content = $('<div>');
		$content
			.addClass('tmmi-tab-content')
			.prop('id', contentId);

		$appendTo.append($radio, $label, $content);
		return {
			$radio: $radio,
			$label: $label,
			$content: $content
		};

	};

	// -- Public members --

	/**
	 * 
	 * @param {WpLibExtra} lib
	 * @param {JQuery<HTMLElement>} $appendTo
	 * @returns {TabMenuMassInput}
	 * @static
	 * @requires mw.Title
	 */
	TabMenuMassInput.new = function(lib, $appendTo) {
		TabMenuMassInput.createStyleTag();
		return new TabMenuMassInput(lib, $appendTo);
	};

	/**
	 * 
	 * @returns {void}
	 * @method
	 * @static
	 */
	TabMenuMassInput.createStyleTag = function() {
		var id = 'tmmi-styles';
		if (document.getElementById(id)) {
			return;
		}
		var style = document.createElement('style');
		style.id = id;
		style.textContent =
			'.tmmi-container {' +
				'border-color: #999;' +
			'}' +
			'.tmmi-container > legend {' +
				'font-weight: bold;' +
			'}' +
			'.tmmi-tab-wrapper {' +
				'display: flex;' +
				'flex-wrap: wrap;' +
			'}' +
			'.tmmi-tab-radio {' +
				'display: none;' +
			'}' +
			'.tmmi-tab-label {' +
				'display: inline-block;' +
				'padding: 0.3em 0.5em;' +
				'cursor: pointer;' +
				'width: 8em;' +
				'background-color: lightgray;' +
				'border: 1px solid #999;' +
				'text-align: center;' +
			'}' +
			'.tmmi-tab-label:not(:first-child) {' +
				'border-left: none;' +
			'}' +
			'.tmmi-tab-content {' +
				'order: 1;' +
				'width: 100%;' +
				'display: none;' +
				'margin-top: 0.5em;' +
			'}' +
			'.tmmi-tab-radio:checked + .tmmi-tab-label {' +
				'background-color: deepskyblue;' +
			'}' +
			'.tmmi-tab-radio:disabled + .tmmi-tab-label {' +
				'text-decoration: line-through;' +
				'color: rgba(0,0,0,0.4);' +
			'}' +
			'.tmmi-tab-radio:checked + .tmmi-tab-label + .tmmi-tab-content {' +
				'display: initial;' +
			'}' +
			'.tmmi-tab-input {' +
				'width: 100%;' +
				'font-family: inherit;' +
				'padding: 0.3em;' +
			'}' +
			'.tmmi-tab-input-clean {' +
				'margin: 0.5em 1em 0 0;' +
			'}' +
		'';
		document.head.appendChild(style);
	};

	/**
	 * 
	 * @param {WpLibExtra} lib
	 * @param {JQuery<HTMLElement>} $appendTo
	 * @constructor
	 * @requires mw.Title
	 */
	function TabMenuMassInput(lib, $appendTo) {

		var _this = this;

		/** @type {WpLibExtra} */
		this.lib = lib;

		/** @type {JQuery<HTMLFieldSetElement>} */
		this.$container = $('<fieldset>');
		this.$container
			.addClass('tmmi-container')
			.append($('<legend>')
				.text('対象ページ')
			);
		$appendTo.append(this.$container);

		/** @type {JQuery<HTMLDivElement>} */
		this.$tabWrapper = $('<div>');
		this.$tabWrapper.addClass('tmmi-tab-wrapper');
		this.$container.append(this.$tabWrapper);

		var inputTabItems = createTabMenuItems(this.$tabWrapper, '入力フィールド');
		/** @type {JQuery<HTMLInputElement>} */
		this.$inputTabRadio = inputTabItems.$radio;
		/** @type {JQuery<HTMLLabelElement>} */
		this.$inputTabLabel = inputTabItems.$label;
		/** @type {JQuery<HTMLDivElement>} */
		this.$inputTabContent = inputTabItems.$content;

		/** @type {JQuery<HTMLTextAreaElement>} */
		this.$input = $('<textarea>');
		this.$input
			.addClass('tmmi-tab-input')
			.prop({
				rows: 20,
				placeholder: 'ページ名ごとに改行'
			});
		this.$inputTabContent.append(this.$input);

		/** @type {JQuery<HTMLInputElement>} */
		this.$cleanInput = $('<input>');
		this.$cleanInput
			.addClass('tmmi-tab-input-clean')
			.val('整形')
			.prop('type', 'button')
			.off('click').on('click', function() {
				_this.cleanUpInput();
			});
		/** @type {JQuery<HTMLSpanElement>} */
		this.$inputCount = $('<span>');
		this.$inputCount
			.addClass('tmmi-tab-input-count')
			.text('0');
		this.$inputTabContent.append(
			this.$cleanInput,
			document.createTextNode('ページ数: '),
			this.$inputCount
		);

		var listTabItems = createTabMenuItems(this.$tabWrapper, 'リスト表示');
		/** @type {JQuery<HTMLInputElement>} */
		this.$listTabRadio = listTabItems.$radio;
		/** @type {JQuery<HTMLLabelElement>} */
		this.$listTabLabel = listTabItems.$label;
		/** @type {JQuery<HTMLDivElement>} */
		this.$listTabContent = listTabItems.$content;
		this.$listTabContent.css({
			border: '1px solid #999',
			padding: '0.3em',
			margin: 0,
			overflowY: 'scroll'
		});
		var height = this.$input.height();
		if (typeof height === 'number') {
			this.$listTabContent.height(height);
		}

		/** @type {JQuery<HTMLOListElement>} */
		this.$list = $('<list>');
		this.$listTabContent.append(this.$list);

	}
		
	/**
	 * @typedef TitleConfig
	 * @type {object} Only one config can be specified on one function call.
	 * @property {string[]} [add] Add these titles.
	 * @property {string[]} [remove] Remove these titles.
	 * @property {string[]} [replace] Replace with these titles.
	 */
	/**
	 * @typedef TitleObject
	 * @type {object}
	 * @property {string[]} titles An array of tidied-up pagetitles (first letter is in uppercase and spaces are represented by underscores).
	 * @property {mw.Title[]} mwTitles
	 */
	/**
	 * Clean up pagetitles in the textbox and return an object containing two arrays of pagetitles.
	 * @param {TitleConfig} [titleConfig]
	 * @returns {TitleObject}
	 * @method
	 */
	TabMenuMassInput.prototype.cleanUpInput = function(titleConfig) {

		titleConfig = titleConfig || {};

		// @ts-ignore
		var /** @type {string} */ val = this.$input.val();
		val = this.lib.clean(val);
		var sourceArr = (titleConfig.replace || val.split('\n')).concat(titleConfig.add || []);
		var pg = sourceArr.reduce(/** @param {TitleObject} acc */ function(acc, title) {
			var mwTitle = mw.Title.newFromText(title);
			if (!mwTitle || !mwTitle.canHaveTalkPage()) {
				return acc;
			}
			title = mwTitle.getPrefixedDb();
			if (!acc.titles.includes(title) &&  // No duplicates
				!(titleConfig && titleConfig.remove && titleConfig.remove.includes(title))  // Ignore titles in titleConfig.remove
			) {
				acc.titles.push(title);
				acc.mwTitles.push(mwTitle);
			}
			return acc;
		}, Object.create({titles: [], mwTitles: []}));

		this.$input.val(pg.titles.join('\n'));
		this.$inputCount.text(pg.titles.length);

		return pg;

	};

	/**
	 * @typedef ListObject
	 * @type {{
	 *	titles: string[];
	 *	existingTitles: string[];
	 *	existingFiles: string[];
	 *	missingTitles: string[];
	 *	progress: Progress;
	 * }}
	 */
	/**
	 * An object of pagetitle-object pairs.
	 * @typedef Progress
	 * @type {Object.<string, ProgressObjVal>}
	 */
	/**
	 * @typedef ProgressObjVal
	 * @type {object}
	 * @property {HTMLLIElement} list
	 * @property {{pagetitle: string; link: HTMLAnchorElement;}} maintitle Used only in createList
	 * @property {{pagetitle: string; link: HTMLAnchorElement;}} subtitle Used only in createList
	 * @property {HTMLSelectElement} expiry
	 * @property {HTMLInputElement} liremove
	 * @property {HTMLSpanElement} logs
	 * @property {{label: HTMLElement; msg: HTMLSpanElement;}} progress
	 * @property {{label: HTMLElement; msg: HTMLSpanElement;}} progress2
	 */

	/**
	 * A storage object of created list items.
	 * @type {Progress}
	 */
	var progressStorage = {};

	return TabMenuMassInput;

})();
//</nowiki>

if (mw.config.get('wgNamespaceNumber') === -1 && !mw.config.get('wgCanonicalSpecialPageName')) {
	// @ts-ignore
	var /** @type {WpLibExtra} */ lib = mw.loader.require('ext.gadget.WpLibExtra');
	lib.load().then(function() {
		TabMenuMassInput.new(lib, $('#mw-content-text').empty());
	});
}