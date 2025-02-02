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

//*********************************************************************************************

/** @type {mw.Api} */
let api;
function init() {

	// Start loading modules but mediawiki.api in the background
	const deferreds = mw.loader.using([
		'jquery.makeCollapsible',
		'oojs-ui',
		'oojs-ui.styles.icons-movement'
	]);

	// Load mediawiki.api and the DOM
	$.when(mw.loader.using('mediawiki.api'), $.ready).then(() => {

		// Set up a mw.Api instance
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

		// Finish loading other modules and also fetch interface messages
		$.when(
			deferreds,
			api.loadMessagesIfMissing([
				'revdelete-hide-text',
				'revdelete-hide-comment',
				'revdelete-hide-user',
				'revdelete-otherreason',
				'revdelete-reason-dropdown',
				'revdelete-reasonotherlist',
			])
		).then(() => {

			// Set up a style tag and the collapsible MRD fieldset
			createStyleTag();
			const fieldset = createFieldset($contribsList);

			// Initialize MassRevisionDelete
			new MassRevisionDelete(fieldset, $contribsList);

		});

	});
}

function createStyleTag() {
	const style = document.createElement('style');
	style.textContent =
		'.mrd-wrapper .oo-ui-fieldLayout-header {' +
			'font-weight: bold;' +
		'}' +
		'.mrd-horizontal > * {' + // Class to align block-level widgets horizontally
			'display: inline-block;' +
			'margin-right: 1em;' +
		'}' +
		'.mrd-progress:not(:empty) {' +
			'margin-right: 0.5em;' +
		'}' +
		'.mrd-checkbox {' +
			'margin-right: 0.5em;' +
		'}' +
		'.mrd-green {' +
			'color: mediumseagreen;' +
		'}' +
		'.mrd-red {' +
			'color: mediumvioletred;' +
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
	 * See also:
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
	fieldset.$element.makeCollapsible();

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

class MassRevisionDelete {

	/**
	 * @param {OO.ui.FieldsetLayout} fieldset
	 * @param {JQuery<HTMLUListElement>} $contribsList
	 */
	constructor(fieldset, $contribsList) {

		/**
		 * @type {Revision[]}
		 */
		this.list = Array.from($contribsList.children('li')).map((li) => new Revision(li));

		/**
		 * @type {VisibilityLevel}
		 */
		this.vlContent = new VisibilityLevel(fieldset, mw.messages.get('revdelete-hide-text') || '??');
		/**
		 * @type {VisibilityLevel}
		 */
		this.vlComment = new VisibilityLevel(fieldset, mw.messages.get('revdelete-hide-comment') || '??');
		/**
		 * @type {VisibilityLevel}
		 */
		this.vlUser = new VisibilityLevel(fieldset, mw.messages.get('revdelete-hide-user') || '??');
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
			placeholder: (mw.messages.get('revdelete-otherreason') || '').replace(/[:：]$/, '')
		});
		const btnSelectAll = new OO.ui.ButtonWidget({
			label: '全選択'
		}).off('click').on('click', () => {
			this.list.forEach((Rev) => {
				Rev.toggleSelection(true);
			});
		});
		const btnUnselectAll = new OO.ui.ButtonWidget({
			label: '全選択解除'
		}).off('click').on('click', () => {
			this.list.forEach((Rev) => {
				Rev.toggleSelection(false);
			});
		});
		const btnInvertSelection = new OO.ui.ButtonWidget({
			label: '選択反転'
		}).off('click').on('click', () => {
			this.list.forEach((rev) => {
				rev.toggleSelection(!rev.isSelected());
			});
		});
		this.btnExecute = new OO.ui.ButtonWidget({
			label: '実行',
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
				items: [btnSelectAll, btnUnselectAll, btnInvertSelection]
			})),
			new OO.ui.FieldLayout(this.btnExecute)
		]);

		MassRevisionDelete.initializeReasonDropdowns(this.reason1, this.reason2);

	}

	/**
	 * Fetch the delete-reason dropdown options and add them to the MRD's reason dropdowns.
	 * @param {OO.ui.DropdownInputWidget} reason1
	 * @param {OO.ui.DropdownInputWidget} reason2
	 * @private
	 * @returns {void}
	 */
	static initializeReasonDropdowns(reason1, reason2) {

		const reasons = mw.messages.get('revdelete-reason-dropdown');
		/** @type {{optgroup?:string; data?: string; label?: string;}[]} */
		const options = [{
			data: '',
			label: mw.messages.get('revdelete-reasonotherlist') || 'その他の理由'
		}];

		if (typeof reasons === 'string') {
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
		}

		if (options.length < 2) {
			mw.notify('MassRevisionDelete: 削除理由の取得に失敗しました。', {type: 'error'});
		}

		reason1.setOptions(options);
		reason2.setOptions(options);

	}

}

class Revision {

	/**
	 * @param {HTMLLIElement} li
	 */
	constructor(li) {

		const $li = $(li);

		/**
		 * The ID number of this revision.
		 * @type {string}
		 */
		this.revid = $li.data('mw-revid');

		const $pageLink = $li.find(isDeletedContribs ? '.mw-changeslist-title' : '.mw-contributions-title');
		/**
		 * The prefixed page name associated with this revision.
		 * @type {string}
		 */
		this.pagename = (() => {
			const href = $pageLink.attr('href');
			let m;
			if (href && (m = Revision.regex.article.exec(href) || Revision.regex.script.exec(href))) {
				return decodeURIComponent(m[1]).replace(/_/g, ' ');
			} else {
				console.log($pageLink[0]);
				throw new Error('The page link does not have a well-formed href.');
			}
		})();

		/**
		 * A span tag used to show the progress of revdel execution. This tag will contain an image or an error code.
		 * @type {JQuery<HTMLInputElement>}
		 */
		this.$progress = $('<span>');

		/**
		 * @type {JQuery<HTMLInputElement>}
		 */
		this.$checkbox = $('<input>');

		$li.prepend(
			this.$progress
				.addClass('mrd-progress'),
			this.$checkbox
				.prop('type', 'checkbox')
				.addClass('mrd-checkbox')
		);

		/**
		 * The date link. See {@link toggleContentVisibility} for all its HTML structures.
		 * @type {JQuery<HTMLElement>} Usually an `<a>` tag, or a `<span>` tag when revdel-ed, or an empty jQuery object
		 * when suppressed and the user doesn't have the suppressor rights.
		 */
		this.$date = (() => {
			const $a = $li.find('a.mw-changeslist-date');
			const $pr = $a.parent('span.' + Revision.class.deleted);
			if ($pr.length) {
				return $pr;
			} else {
				return $a;
			}
		})();

		/**
		 * Then `<span>` tag for summary. See {@link toggleCommentVisibility} for all its HTML structures.
		 *
		 * The tag is entirely missing on [[Special:DeletedContributions]] if the revision has no edit summary.
		 * In this case, we create one here.
		 *
		 * @type {JQuery<HTMLSpanElement>}
		 */
		this.$comment = $li.children('.comment');
		if (!this.$comment.length) {
			this.$comment = $('<span>');
			const clss = ['comment', 'comment--without-parentheses'];
			if (isDeletedContribs) {
				clss.pop();
			}
			$pageLink.after(
				this.$comment.addClass(clss.join(' '))
			);
		}

	}

	/**
	 * Set an icon and a text on its right in the progress tag.
	 * @param {IconType?} icon The symbolic name of the icon to set, or `null` for no icon.
	 * @param {string} [message] An optional message to display to the right of the icon.
	 * @returns {Revision}
	 */
	setProgress(icon, message) {

		this.$progress.empty();

		let cls = '';
		switch (icon) {
			case 'doing':
				this.$progress.append(getIcon(icon));
				break;
			case 'done':
				cls = 'mrd-green';
				this.$progress.append(getIcon(icon));
				break;
			case 'failed':
				cls = 'mrd-red';
				this.$progress.append(getIcon(icon));
				break;
			default:
		}

		if (typeof message === 'string') {
			this.$progress.append(
				$('<span>')
					.text(message)
					.addClass(cls)
					.css('margin-left', '0.5em')
			);
		}

		return this;

	}

	/**
	 * Toggle the checked state of the checkbox.
	 * @param {boolean} check
	 * @returns {Revision}
	 */
	toggleSelection(check) {
		this.$checkbox.prop('checked', check);
		return this;
	}

	/**
	 * Check if the checkbox is selected.
	 * @returns {boolean}
	 */
	isSelected() {
		return this.$checkbox.prop('checked');
	}

	/**
	 * Toggle the revdel status of a date link.
	 * ```
	 *  // Normal date link
	 *  <a class="mw-changeslist-date">2023-01-01T00:00:00</a>
	 *  // Deleted date link
	 *  <span class="history-deleted">
	 *      <a class="mw-changeslist-date">2023-01-01T00:00:00</a>
	 *  </span>
	 *  // Suppressed date link (non-suppressor view; this function should never face this pattern)
	 *  <span class="history-deleted mw-history-suppressed mw-changeslist-date"></span>
	 * ```
	 * Concerning the third pattern, a revision with any field suppressed can only be revision-deleted by suppressors.
	 * This means that undeletable revisions should never be forwarded to the API in the first place.
	 */
	toggleContentVisibility() {

	}

	/**
	 * Toggle the revdel status of a comment (edit summary).
	 * ```
	 *  // On [[Special:Contributions]]
	 *  // Normal comment
	 *  <span class="comment comment--without-parentheses">Some comment</span>
	 *  // Deleted comment
	 *  <span class="history-deleted comment">
	 *      <span class="comment">(edit summary removed)</span>
	 *  </span>
	 *  // On [[Special:DeletedContributions]]
	 *  // Normal comment (same as the topmost one)
	 *  <span class="comment comment--without-parentheses">Some comment</span>
	 *  // Deleted comment
	 *  <span class="history-deleted comment">
	 *      <span class="comment comment--without-parentheses">Some comment</span>
	 *  </span>
	 * ```
	 * Note that when the comment is an empty string, there IS a span tag for comment with the 'mw-comment-none' class added
	 * to pattern #1 on [[Special:Contributions]], but the tag is entirely missing on [[Special:DeletedContributions]]. This
	 * script internally creates a comment element in createForm() if missing, so there's no problem.
	 */
	toggleCommentVisibility() {

	}

}

Revision.regex = {
	article: new RegExp(mw.config.get('wgArticlePath').replace('$1', '([^#?]+)')),
	script: new RegExp(mw.config.get('wgScript') + '\\?title=([^#&]+)')
};

Revision.class = {
	deleted: 'history-deleted',
	suppressed: 'mw-history-suppressed'
};

/**
 * @typedef {'doing'|'done'|'failed'} IconType
 */
/**
 * Get a loading/check/cross image tag.
 * @param {IconType} iconType
 * @returns {HTMLImageElement}
 */
function getIcon(iconType) {
	const img = document.createElement('img');
	switch (iconType) {
		case 'doing':
			img.src = '//upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif';
			break;
		case 'done':
			img.src = '//upload.wikimedia.org/wikipedia/commons/f/fb/Yes_check.svg';
			break;
		case 'failed':
			img.src = '//upload.wikimedia.org/wikipedia/commons/a/a2/X_mark.svg';
	}
	img.style.cssText = 'vertical-align: middle; height: 1em; border: 0;';
	return img;
}

//*********************************************************************************************

init();

//*********************************************************************************************
})();