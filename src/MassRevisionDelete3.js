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

		// Set up mw.Api instance
		api = new mw.Api({
				ajax: {
				headers: {
					'Api-User-Agent': 'MassRevisionDelete/3.0.0 (https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MassRevisionDelete.js)'
				}
			},
			parameters: {
				action: 'query',
				format: 'json',
				formatversion: '2'
			}
		});

		// Get the contributions list
		/** @type {JQuery<HTMLUListElement>} */
		const $contribsList = $('ul.mw-contributions-list');
		if (!$contribsList.length || !$contribsList.children('li').length) {
			return;
		}

		// Set up a style tag and the collapsible MRD fieldset
		createStyleTag();
		const fieldset = createFieldset($contribsList);

		const form = new RevdelForm(fieldset);
		form.initializeReasonDropdowns();

	});
}

function createStyleTag() {
	const style = document.createElement('style');
	style.textContent =
		'.mrd-wrapper .oo-ui-fieldLayout-header {' +
			'font-weight: bold;' +
		'}' +
		// Class to align block-level widgets horizontally
		'.mrd-horizontal > * {' +
			'display: inline-block;' +
			'margin-right: 1em;' +
		'}';
	document.head.appendChild(style);
}

/**
 * Create a collapsible fieldset layout used as the MRD form.
 * @param {JQuery<HTMLUListElement>} $contribsList
 * @returns {OO.ui.FieldsetLayout}
 */
function createFieldset($contribsList) {

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

	return fieldset;

}

class VisibilityLevel {

	/**
	 * Append a horizontal radio options for revdel visibility levels.
	 * @param {OO.ui.FieldsetLayout} fieldset
	 * @param {string} labelText
	 */
	constructor(fieldset, labelText) {

		// Create radio options
		const optNochange = new OO.ui.RadioOptionWidget({
			data: 'nochange',
			label: '変更なし'
		});
		const optShow = new OO.ui.RadioOptionWidget({
			data: 'show',
			label: '可視化'
		});
		const optHide = new OO.ui.RadioOptionWidget({
			data: 'hide',
			label: '不可視化'
		});

		/** @type {OO.ui.RadioSelectWidget} */
		this.radioSelect = new OO.ui.RadioSelectWidget({
			classes: ['mrd-horizontal'],
			items: [optNochange, optShow, optHide]
		});
		this.radioSelect.selectItem(optNochange);

		fieldset.addItems([
			new OO.ui.FieldLayout(this.radioSelect, {
				label: labelText,
				align: 'top'
			})
		]);

	}

	/**
	 * Get the data of the selected radio.
	 * @returns {'nochange'|'show'|'hide'}
	 */
	getData() {
		const selectedRadio = this.radioSelect.findSelectedItem();
		if (!selectedRadio || Array.isArray(selectedRadio)) {
			throw new TypeError();
		}
		// @ts-ignore
		return selectedRadio.getData();
	}

}

class RevdelForm {

	/**
	 * @param {OO.ui.FieldsetLayout} fieldset
	 */
	constructor(fieldset) {

		/**
		 * @type {VisibilityLevel}
		 */
		this.vlContent = new VisibilityLevel(fieldset, '版の本文');
		/**
		 * @type {VisibilityLevel}
		 */
		this.vlComment = new VisibilityLevel(fieldset, '編集の要約');
		/**
		 * @type {VisibilityLevel}
		 */
		this.vlUser = new VisibilityLevel(fieldset, '投稿者の利用者名/IPアドレス');
		/**
		 * @type {OO.ui.DropdownInputWidget}
		 */
		this.reason1 = new OO.ui.DropdownInputWidget();
		/**
		 * @type {OO.ui.DropdownInputWidget}
		 */
		this.reason2 = new OO.ui.DropdownInputWidget();
		/**
		 * @type {OO.ui.TextInputWidget}
		 */
		this.reasonC = new OO.ui.TextInputWidget({
			placeholder: '他の、または追加の理由'
		});
		this.btnSelectAll = new OO.ui.ButtonWidget({
			label: '全選択'
		});
		this.btnUnelectAll = new OO.ui.ButtonWidget({
			label: '全選択解除'
		});
		this.btnInvertSelection = new OO.ui.ButtonWidget({
			label: '選択反転'
		});
		this.btnExecute = new OO.ui.ButtonWidget({
			label: '選択された版に適用',
			flags: ['primary', 'progressive']
		});

		fieldset.addItems([
			new OO.ui.FieldLayout(this.reason1, {
				label: '理由',
				align: 'top'
			}),
			new OO.ui.FieldLayout(this.reason2),
			new OO.ui.FieldLayout(this.reasonC),
			new OO.ui.FieldLayout(new OO.ui.ButtonGroupWidget({
				items: [this.btnSelectAll, this.btnUnelectAll, this.btnInvertSelection]
			})),
			new OO.ui.FieldLayout(this.btnExecute)
		]);

	}

	/**
	 * Fetch the delete-reason dropdown options and add them to the MRD's reason dropdowns.
	 * @returns {void}
	 */
	initializeReasonDropdowns() {
		const interfaceName = 'revdelete-reason-dropdown';
		/** @type {{optgroup?:string; data?: string; label?: string;}[]} */
		const options = [{
			data: '',
			label: 'その他の理由'
		}];
		getMessages([interfaceName]).then((res) => {

			const reasons = res[interfaceName];
			if (typeof reasons !== 'string') {
				throw new Error();
			}

			const regex = /(\*+)([^*]+)/g;
			let m;
			while ((m = regex.exec(reasons))) {
				const content = m[2].trim();
				if (m[1].length === 1) {
					options.push({
						optgroup: content
					});
				} else {
					options.push({
						data: content,
						label: content
					});
				}
			}

			if (options.length < 2) {
				throw new Error();
			}

		}).catch(() => {
			mw.notify('MassRevisionDelete: 削除理由の取得に失敗しました。', {type: 'error'});
		}).then(() => {
			this.reason1.setOptions(options);
			this.reason2.setOptions(options);
		});
	}

}

/**
 * Get interface messages.
 * @param {string[]} namesArr
 * @returns {JQueryPromise<Record<string, string>>} name-message pairs
 */
function getMessages(namesArr) {
	return api.getMessages(namesArr)
		.then((res) => res || {})
		.catch((_, err) => {
			console.error(err);
			return {};
		});
}

//*********************************************************************************************

init();

//*********************************************************************************************
})();