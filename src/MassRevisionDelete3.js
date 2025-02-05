/*********************************************************************************************\

	MassRevisionDelete

	Create an interface to delete multiple revisions at one fell swoop when the script
	user visits a user's contributions page.

	@link https://ja.wikipedia.org/wiki/Help:MassRevisionDelete
	@author [[User:Dragoniez]]
	@version 3.0.0

\*********************************************************************************************/
// @ts-check
/// <reference path="./window/MassRevisionDelete3.d.ts" />
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
				'rev-deleted-user-contribs',
				'revdelete-hide-restricted',
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
		'.mrd-fieldLayout-boldheader .oo-ui-fieldLayout-header > label {' +
			'font-weight: bold;' +
		'}' +
		'.mrd-horizontal-radios > label {' + // Class to align block-level RadioOption widgets horizontally
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
 * Create a collapsible fieldset layout used as the wrapper of the MRD form.
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
			label: '閲覧可'
		});
		const optHide = new OO.ui.RadioOptionWidget({
			data: 'hide',
			label: '閲覧不可'
		});

		/** @type {OO.ui.RadioSelectWidget} */
		this.radioSelect = new OO.ui.RadioSelectWidget({
			classes: ['mrd-horizontal-radios'],
			items: [optNochange, optShow, optHide]
		});
		this.radioSelect.selectItem(optNochange);

		fieldset.addItems([
			new OO.ui.FieldLayout(this.radioSelect, {
				classes: ['mrd-fieldLayout-boldheader'],
				label: labelText,
				align: 'top'
			})
		]);

	}

	/**
	 * Get the data of the selected radio.
	 * @returns {RevdelLevel}
	 */
	getData() {
		const selectedRadio = this.radioSelect.findSelectedItem();
		if (!selectedRadio || Array.isArray(selectedRadio)) {
			throw new TypeError();
		}
		// @ts-ignore
		return selectedRadio.getData();
	}

	/**
	 * Set the 'disabled' state of the RadioSelect widget.
	 * @param {boolean} disable
	 * @returns {VisibilityLevel}
	 */
	setDisabled(disable) {
		this.radioSelect.setDisabled(disable);
		return this;
	}

}

class MassRevisionDelete {

	/**
	 * @param {OO.ui.FieldsetLayout} fieldset The wrapper FieldsetLayout widget to which to append form fields
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
		 * @type {OO.ui.CheckboxInputWidget}
		 */
		this.vlSuppress = new OO.ui.CheckboxInputWidget();
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
		/**
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnSelectAll = new OO.ui.ButtonWidget({
			label: '全選択'
		}).off('click').on('click', () => {
			this.list.forEach((rev) => {
				rev.toggleSelection(true);
			});
		});
		/**
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnUnselectAll = new OO.ui.ButtonWidget({
			label: '全選択解除'
		}).off('click').on('click', () => {
			this.list.forEach((rev) => {
				rev.toggleSelection(false);
			});
		});
		/**
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnInvertSelection = new OO.ui.ButtonWidget({
			label: '選択反転'
		}).off('click').on('click', () => {
			this.list.forEach((rev) => {
				rev.toggleSelection(!rev.isSelected());
			});
		});
		/**
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnSelectAllDeleted = new OO.ui.ButtonWidget({
			label: '削除済み版全選択'
		}).off('click').on('click', () => {
			this.list.forEach((rev) => {
				if (rev.hasDeletedItem()) {
					rev.toggleSelection(true);
				}
			});
		});
		/**
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnUnselectAllDeleted = new OO.ui.ButtonWidget({
			label: '削除済み版全選択解除'
		}).off('click').on('click', () => {
			this.list.forEach((rev) => {
				if (rev.hasDeletedItem()) {
					rev.toggleSelection(false);
				}
			});
		});
		/**
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnSelectAllUndeleted = new OO.ui.ButtonWidget({
			label: '未削除版全選択'
		}).off('click').on('click', () => {
			this.list.forEach((rev) => {
				if (!rev.hasDeletedItem()) {
					rev.toggleSelection(true);
				}
			});
		});
		/**
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnUnselectAllUndeleted = new OO.ui.ButtonWidget({
			label: '未削除版全選択解除'
		}).off('click').on('click', () => {
			this.list.forEach((rev) => {
				if (!rev.hasDeletedItem()) {
					rev.toggleSelection(false);
				}
			});
		});
		/**
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnExecute = new OO.ui.ButtonWidget({
			label: '実行',
			flags: ['primary', 'progressive']
		}).off('click').on('click', () => {
			this.execute();
		});

		// Add the widgets to the fieldset
		const items = [
			new OO.ui.FieldLayout(this.vlSuppress, {
				label: mw.messages.get('revdelete-hide-restricted') || '一般利用者に加え管理者からもデータを隠す',
				align: 'inline'
			}),
			new OO.ui.FieldLayout(this.reason1, {
				label: '理由',
				align: 'top'
			}),
			new OO.ui.FieldLayout(this.reason2),
			new OO.ui.FieldLayout(this.reasonC),
			new OO.ui.FieldLayout(new OO.ui.ButtonGroupWidget({
				items: [this.btnSelectAll, this.btnUnselectAll, this.btnInvertSelection]
			})),
			new OO.ui.FieldLayout(new OO.ui.ButtonGroupWidget({
				items: [this.btnSelectAllDeleted, this.btnUnselectAllDeleted, this.btnSelectAllUndeleted, this.btnUnselectAllUndeleted]
			})),
			new OO.ui.FieldLayout(this.btnExecute)
		];
		if (!rights.suppress) {
			items.shift();
		}
		fieldset.addItems(items);

		MassRevisionDelete.initializeReasonDropdowns([this.reason1, this.reason2]);

	}

	/**
	 * Fetch the delete-reason dropdown options and add them to the MRD's reason dropdowns.
	 * @param {OO.ui.DropdownInputWidget[]} dropdowns
	 * @returns {void}
	 * @private
	 */
	static initializeReasonDropdowns(dropdowns) {

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

		dropdowns.forEach((dd) => {
			dd.setOptions(options);
		});

	}

	/**
	 * Set the 'disabled' states of all the widgets in the MRD form.
	 * @param {boolean} disable
	 * @returns {MassRevisionDelete}
	 */
	setDisabled(disable) {
		[
			this.btnExecute,
			this.vlContent,
			this.vlComment,
			this.vlUser,
			this.vlSuppress,
			this.reason1,
			this.reason2,
			this.reasonC,
			this.btnSelectAll,
			this.btnUnselectAll,
			this.btnInvertSelection,
			this.btnSelectAllDeleted,
			this.btnUnselectAllDeleted,
			this.btnSelectAllUndeleted,
			this.btnUnselectAllUndeleted
		]
		.forEach((widget) => {
			widget.setDisabled(disable);
		});
		return this;
	}

	/**
	 * @param {RevdelTarget} target
	 * @returns {RevdelLevel}
	 */
	getSelectedVisibilityLevel(target) {
		switch (target) {
			case 'content':
				return this.vlContent.getData();
			case 'comment':
				return this.vlComment.getData();
			case 'user':
				return this.vlUser.getData();
			default:
				throw new Error();
		}
	}

	/**
	 * Prepare for revision deletion.
	 * @returns {JQueryPromise<PreparationObject|false>}
	 */
	prepare() {

		// Create an object keyed by pagenames and each valued by an array of revision IDs
		let revisionCount = 0;
		const revisions = this.list.reduce(/** @param {Record<string, string[]>} acc */ (acc, rev) => {
			if (rev.isSelected()) {
				const pagename = rev.getPagename();
				if (!acc[pagename]) {
					acc[pagename] = [];
				}
				acc[pagename].push(rev.getRevid());
				revisionCount++;
			}
			return acc;
		}, Object.create(null));
		if (revisionCount === 0) {
			return mw.notify('版指定削除の対象版が選択されていません。', {type: 'error'}).then(() => false);
		}

		// Get visibility levels
		/**
		 * @type {Record<RevdelTarget, JQuery<HTMLElement>>}
		 */
		const conf = Object.create(null);
		const vis = {
			hide: [],
			show: []
		};
		/**
		 * @type {RevdelTarget[]}
		 */
		const targets = ['content', 'comment', 'user'];
		targets.forEach((target) => {
			const level = this.getSelectedVisibilityLevel(target);
			conf[target] = levelToConfirmationMessage(level); // Will be used later to confirm the revision deletion
			if (vis[level]) { // Ignore "nochange"
				vis[level].push(target);
			}
		});
		if (!vis.hide.length && !vis.show.length) {
			return mw.notify('版指定削除の対象項目が選択されていません。', {type: 'error'}).then(() => false);
		}
		const suppress =
			!rights.suppress ?
			'nochange' :
			this.vlSuppress.isSelected() ?
			'yes' :
			'no';

		// Get reason
		const reason = [this.reason1.getValue(), this.reason2.getValue(), this.reasonC.getValue().trim()].filter(el => el).join(': ');
		return (() => {
			if (reason) {
				return $.Deferred().resolve(true);
			} else {
				return OO.ui.confirm('版指定削除の理由が指定されていません。このまま実行しますか？');
			}
		})()
		// @ts-ignore
		.then(/** @param {boolean} confirmed */ (confirmed) => {

			if (!confirmed) {
				return false;
			}

			const $confirm = $('<div>').append(
				`計${revisionCount}版の閲覧レベルを変更します。`,
				$('<ul>').append(
					$('<li>').append(
						mw.messages.get('revdelete-hide-text') || '??',
						' (',
						conf.content,
						')'
					),
					$('<li>').append(
						mw.messages.get('revdelete-hide-comment') || '??',
						' (',
						conf.comment,
						')'
					),
					$('<li>').append(
						mw.messages.get('revdelete-hide-user') || '??',
						' (',
						conf.user,
						')'
					),
				),
				'よろしいですか？'
			);
			return OO.ui.confirm($confirm, {size: 'medium'});

		}).then((confirmed) => {

			if (!confirmed) {
				return false;
			}

			return {
				revisions,
				defaultParams: {
					action: 'revisiondelete',
					type: 'revision',
					reason: reason,
					hide: vis.hide.join('|'),
					show: vis.show.join('|'),
					suppress,
					tags: mw.config.get('wgDBname') === 'testwiki' ? 'testtag' : 'MassRevisionDelete|DevScript',
					formatversion: '2'
				}
			};

		});

		/**
		 * @param {RevdelLevel} level
		 * @returns {JQuery<HTMLElement>}
		 */
		function levelToConfirmationMessage(level) {
			const $b = $('<b>');
			switch (level) {
				case 'nochange':
					return $b.text('変更なし');
				case 'show':
					return $b.text('閲覧可').addClass('mrd-green');
				case 'hide':
					return $b.text('閲覧不可').addClass('mrd-red');
			}
		}

	}

	/**
	 * Perform mass revision deletion.
	 * @private
	 */
	execute() {
		this.setDisabled(true).prepare().then((prep) => {
			console.log(prep);

		});
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
		 * A <span> tag in which there's an <a> tag. The wrapper is a <strong> tag on a suppressor's view
		 * if the editing user is hidden for this revision.
		 */
		const $revdelLink = $li.children('.mw-revdelundel-link');
		/**
		 * @type {boolean} Whether the current user can change the visibility of this revision
		 */
		this.changeable = !!$revdelLink.children('a').length;
		if (!this.changeable) {
			this.$checkbox.prop('disabled', true);
		}
		$revdelLink.off('click').on('click', (e) => { // Use the link to Special:RevisionDelete as a button
			if (!e.shiftKey && !e.ctrlKey) {
				e.preventDefault();
				this.toggleSelection(!this.isSelected());
			}
		});

		/**
		 * @type {Record<'content'|'comment'|'user', boolean?>} `null` if suppressed
		 */
		this.currentVisibility = {
			content: true,
			comment: true,
			user: true
		};

		/**
		 * The date link. See {@link toggleContentVisibility} for all its HTML structures.
		 *
		 * @type {JQuery<HTMLElement>} Usually an `<a>` tag, or a `<span>` tag when revdel-ed.
		 */
		this.$date = (() => {
			const $link = $li.find('.mw-changeslist-date').eq(0);
			if ($link.hasClass(Revision.class.suppressed) && $link.hasClass(Revision.class.deleted)) {
				this.currentVisibility.content = null;
			} else if ($link.hasClass(Revision.class.deleted)) {
				this.currentVisibility.content = false;
			}
			return $link;
		})();

		/**
		 * Then `<span>` tag for summary. See {@link toggleCommentVisibility} for all its HTML structures.
		 * @type {JQuery<HTMLSpanElement>}
		 */
		this.$comment = $li.children('.comment');
		if (this.$comment.hasClass(Revision.class.suppressed) && this.$comment.hasClass(Revision.class.deleted)) {
			this.currentVisibility.comment = null;
		} else if (this.$comment.hasClass(Revision.class.deleted)) {
			this.currentVisibility.comment = false;
		}

		/**
		 * Comment in an HTML format
		 * @type {string?}
		 */
		this.parsedComment = null;

		const msgUserHidden = mw.messages.get('rev-deleted-user-contribs') || '[利用者名またはIPアドレスは除去されました - この編集は投稿記録で非表示にされています]';
		/**
		 * The \<strong> tag shown if the user name has been hidden.
		 * @type {JQuery<HTMLElement>}
		 */
		this.$userhidden = $li.children('strong').filter((_, el) => $(el).text() === msgUserHidden);
		if (this.$userhidden.length) {
			if ($revdelLink.prop('nodeName') === 'STRONG') {
				this.currentVisibility.user = null;
			} else {
				this.currentVisibility.user = false;
			}
		} else {
			// The tag doesn't exist if the username isn't revdel-ed; create one in this case
			this.$userhidden = $('<strong>')
				.text(msgUserHidden)
				.css('margin-right', '0.5em')
				.hide()
				.insertAfter(this.$comment);
		}
		this.$userhidden.addClass('mrd-userhidden');

	}

	/**
	 * Get the ID number of the revision.
	 * @returns {string}
	 */
	getRevid() {
		return this.revid;
	}

	/**
	 * Get the pagename of the revision.
	 * @returns {string}
	 */
	getPagename() {
		return this.pagename;
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
	 * Toggle the checked state of the checkbox. Do nothing if the checkbox is disabled (which means that
	 * the current user does not have the rights to change the visibility of this revision).
	 * @param {boolean} check
	 * @returns {Revision}
	 */
	toggleSelection(check) {
		if (this.changeable) {
			this.$checkbox.prop('checked', check);
		}
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
	 * Check if the revision has a deleted item.
	 * @returns {boolean}
	 */
	hasDeletedItem() {
		return Object.keys(this.currentVisibility).some((target) => !this.currentVisibility[target]);
	}

	/**
	 * Toggle the revdel status of a date link.
	 * ```html
	 * <!-- In both cases below, the <bdi> tag is missing on [[Special:DeletedContributions]] -->
	 * <!-- Normal date link -->
	 * <bdi>
	 * 	<a class="mw-changeslist-date">2023-01-01T00:00:00</a>
	 * </bdi>
	 * <!-- Deleted date link -->
	 * <span class="history-deleted mw-changeslist-date"><!-- Has an additional class if suppressed -->
	 * 	<!-- Empty on a non-suppressor's view if suppressed -->
	 * 	<bdi>
	 * 		<a class="mw-changeslist-date">2023-01-01T00:00:00</a>
	 * 	</bdi>
	 * </span>
	 * ```
	 */
	toggleContentVisibility() {

	}

	/**
	 * Toggle the revdel status of a comment (edit summary).
	 * ```html
	 * <!-- The comment--without-parentheses class is omitted in all of the following -->
	 * <!-- Normal comment -->
	 * <span class="comment">COMMENT</span>
	 * <!-- Normal comment (empty) -->
	 * <span class="comment mw-comment-none">No edit summary</span><!-- Has text but invisible -->
	 * <!-- Deleted comment -->
	 * <!-- [[Special:Contributions]] -->
	 * <span class="history-deleted comment"><!-- Has an additional class if suppressed -->
	 * 	<span class="comment">(edit summary removed)</span>
	 * </span>
	 * <!-- [[Special:DeletedContributions]] -->
	 * <span class="history-deleted comment"><!-- Has an additional class if suppressed -->
	 * 	<!-- Empty if there's no edit summary -->
	 * 	<span class="comment">COMMENT</span>
	 * </span>
	 * ```
	 */
	toggleCommentVisibility() {

	}

	/**
	 * @param {boolean} show
	 * @returns {Revision}
	 */
	toggleUserVisibility(show) {
		this.$userhidden.toggle(!show);
		return this;
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