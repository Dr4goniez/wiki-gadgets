/***************************************************************************\

	MassRevisionDelete

	Add an interface to delete multiple revisions in one fell swoop to
	[[Special:Contributions]] and [[Special:DeletedContributions]].

	@link https://ja.wikipedia.org/wiki/Help:MassRevisionDelete
	@author [[User:Dragoniez]]
	@version 3.0.11

\***************************************************************************/
// @ts-check
/// <reference path="./window/MassRevisionDelete.d.ts" />
/* global mw, OO */
//<nowiki>
(() => {
//*********************************************************************************************

/**
 * If `true`, no actual API requests will be sent.
 */
const debuggingMode = false;
/**
 * Whether to consider the user a suppressor for debugging. If the user isn't actually a suppressor
 * and the contribution list contains suppressed revisions, this won't work.
 */
const feignSuppressor = false;

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
	// @ts-expect-error
	const userGroups = (mw.config.get('wgUserGroups') || []).concat(mw.config.get('wgGlobalGroups', []));
	const revdel = userGroups.some((group) => ['sysop', 'eliminator', 'suppress'].indexOf(group) !== -1);
	const suppress = userGroups.indexOf('suppress') !== -1;
	const AHL = userGroups.some((group) => ['sysop', 'apihighlimits-requestor'].indexOf(group) !== -1);
	return { revdel, suppress, AHL };
})();
if (!rights.revdel) {
	return;
}
if (feignSuppressor) {
	rights.suppress = true;
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

		// Get the contributions list
		/** @type {JQuery<HTMLUListElement>} */
		const $contribsList = $('ul.mw-contributions-list');
		if (!$contribsList.length || !$contribsList.children('li').length) {
			return;
		}

		// Set up a mw.Api instance
		api = new mw.Api({
			ajax: {
				headers: {
					'Api-User-Agent': 'MassRevisionDelete/3.0.11 (https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MassRevisionDelete.js)'
				}
			},
			parameters: {
				action: 'query',
				format: 'json',
				formatversion: '2'
			}
		});

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
				'rev-deleted-comment',
				'changeslist-nocomment',
				'empty-username'
			])
		).then(() => {

			// Set up a style tag and the collapsible MRD fieldset
			createStyleTag();
			const fieldset = createFieldset($contribsList);

			// Initialize MassRevisionDelete
			new MassRevisionDelete(fieldset, $contribsList).init();

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
		'#mrd-revision-selector > span,' +
		'#mrd-revision-selector > select {' +
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
		'}' +
		'.mrd-disabledlink {' +
			'pointer-events: none;' +
			'color: unset;' +
		'}' +
		'.mrd-revdelundel-link-userhidden {' +
			'font-weight: bold;' +
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

	const $target = document.querySelector('.mw-pager-navigation-bar') ? $('.mw-pager-navigation-bar').eq(0) : $contribsList.eq(0);
	$target.before(wrapper.$element);
	fieldset.$element.makeCollapsible();

	return fieldset;

}

class VisibilityLevel {

	/**
	 * Create horizontally-aligned radio options for revdel visibility levels and append them to a FieldsetLayout widget.
	 * @param {OO.ui.FieldsetLayout} fieldset The FieldsetLayout widget to which to append the RadioSelect widget.
	 * @param {string} labelText The label text for the RadioSelect widget.
	 * @param {{ show?: string; hide?: string; visible?: boolean; }} [options]
	 * Optional object to specify the "show" and "hide" radio labels, and the visibility of the widget (`true` by default).
	 */
	constructor(fieldset, labelText, options = { visible: true }) {

		// Create radio options
		/** @type {OO.ui.RadioOptionWidget} */
		this.optNochange = new OO.ui.RadioOptionWidget({
			data: 'nochange',
			label: '変更なし'
		});
		/** @type {OO.ui.RadioOptionWidget} */
		this.optShow = new OO.ui.RadioOptionWidget({
			data: 'show',
			label: options.show || '閲覧可'
		});
		/** @type {OO.ui.RadioOptionWidget} */
		this.optHide = new OO.ui.RadioOptionWidget({
			data: 'hide',
			label: options.hide || '閲覧不可'
		});

		/** @type {OO.ui.RadioSelectWidget} */
		this.radioSelect = new OO.ui.RadioSelectWidget({
			classes: ['mrd-horizontal-radios'],
			items: [this.optNochange, this.optShow, this.optHide]
		});
		this.radioSelect.selectItem(this.optNochange);

		const fieldLayout = new OO.ui.FieldLayout(this.radioSelect, {
			classes: ['mrd-fieldLayout-boldheader'],
			label: labelText,
			align: 'top'
		});
		if (!options.visible) {
			fieldLayout.toggle(false);
		}

		fieldset.addItems([fieldLayout]);

	}

	/**
	 * Get the data of the currently selected radio button.
	 * @returns {RevdelLevel}
	 */
	getData() {
		const selectedRadio = /** @type {OO.ui.OptionWidget} */ (this.radioSelect.findSelectedItem());
		return /** @type {RevdelLevel} */ (selectedRadio.getData());
	}

}

class MassRevisionDelete {

	/**
	 * @param {OO.ui.FieldsetLayout} fieldset The wrapper FieldsetLayout widget to which to append form fields
	 * @param {JQuery<HTMLUListElement>} $contribsList
	 */
	constructor(fieldset, $contribsList) {

		/**
		 * A collection of revision selector checkboxes, used to add click event handlers.
		 * @type {JQuery<HTMLInputElement>}
		 */
		let $checkbox = $([]);
		/**
		 * @type {Revision[]}
		 */
		this.list = Array.from($contribsList.children('li')).map((li) => {
			const rev = new Revision(li);
			$checkbox = $checkbox.add(rev.$checkbox);
			return rev;
		});
		/**
		 * @type {JQueryPromise<void>}
		 */
		this.initPromise = $.Deferred();
		/**
		 * @type {VisibilityLevel}
		 */
		this.vlContent = new VisibilityLevel(fieldset, getMessage('revdelete-hide-text'));
		/**
		 * @type {VisibilityLevel}
		 */
		this.vlComment = new VisibilityLevel(fieldset, getMessage('revdelete-hide-comment'));
		/**
		 * @type {VisibilityLevel}
		 */
		this.vlUser = new VisibilityLevel(fieldset, getMessage('revdelete-hide-user'));
		/**
		 * @type {VisibilityLevel}
		 */
		this.vlSuppress = new VisibilityLevel(fieldset, getMessage('revdelete-hide-restricted'), {
			show: '適用しない',
			hide: '適用する',
			visible: rights.suppress
		});
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
			placeholder: (getMessage('revdelete-otherreason')).replace(/[:：]$/, '')
		});
		/**
		 * Whether to accept a new click on the Execute button.
		 * @type {boolean}
		 */
		this.acceptExecution = true;
		/**
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnExecute = new OO.ui.ButtonWidget({
			label: '実行',
			flags: ['primary', 'progressive']
		}).off('click').on('click', () => {
			if (this.acceptExecution) {
				this.setExecutionAcceptability(false).execute();
			} else {
				console.warn('The new execution request was rejected.');
			}
		});

		// Add the widgets to the fieldset
		fieldset.addItems([
			new OO.ui.FieldLayout(this.reason1, {
				classes: ['mrd-fieldLayout-boldheader'],
				label: '理由',
				align: 'top'
			}),
			new OO.ui.FieldLayout(this.reason2).toggle(false), // Disabled ATM
			new OO.ui.FieldLayout(this.reasonC),
			new OO.ui.FieldLayout(this.btnExecute)
		]);

		// Set up options for the revdel reason dropdowns
		MassRevisionDelete.initializeReasonDropdowns([this.reason1, this.reason2]);

		// Create utility buttons to select revdel target revisions
		const { $wrapper, $revisionCounter } = MassRevisionDelete.createRevisionSelector($contribsList, this.list);
		/**
		 * The container of the revision selector buttons.
		 * @type {JQuery<HTMLDivElement>}
		 */
		this.$btnContainer = $wrapper;

		// Dynamically count selected revisions when the checkboxes are (un)checked
		let checkboxChangeTimeout;
		$checkbox.off('change').on('change', () => {
			clearTimeout(checkboxChangeTimeout);
			checkboxChangeTimeout = setTimeout(() => {
				const cnt = this.list.filter((rev) => rev.isSelected()).length;
				$revisionCounter.text(cnt);
			}, 100);
		});

	}

	/**
	 * Initialize the MassRevisionDelete instance by fetching missing parsed comments.
	 */
	init() {

		// Collect the IDs of revisions whose parsed comments can't be picked up from the DOM
		const revids = this.list.reduce(/** @param {string[]} acc */ (acc, rev) => {
			if (!rev.parsedCommentFetched) {
				acc.push(rev.getRevid());
			}
			return acc;
		}, []);
		if (!revids.length) {
			this.initPromise = /** @type {JQueryDeferred} */ (this.initPromise).resolve();
			return;
		}

		/**
		 * Given revision IDs, get their parsed comments from the API and set them
		 * to the corresponding {@link Revision} instances.
		 * @param {string[]} revids
		 * @returns {JQueryPromise<void>}
		 */
		const setParsedComments = (revids) => {
			const params =
				isDeletedContribs ? {
					revids: revids.join('|'),
					prop: 'deletedrevisions',
					drvprop: 'ids|parsedcomment'
				} : {
					revids: revids.join('|'),
					prop: 'revisions',
					rvprop: 'ids|parsedcomment'
				};
			return api.post(params, {
				headers: {
					// @ts-expect-error
					'Promise-Non-Write-API-Action': true
				},
				timeout: 0
			// @ts-expect-error
			}).then(/** @param {ApiResponseQueryRevids} res */ (res) => {
				const resPages = res && res.query && res.query.pages || [];
				resPages.forEach(({ revisions, deletedrevisions }) => {
					const arr = revisions || deletedrevisions;
					if (!arr) {
						return;
					}
					arr.forEach(({ revid, parsedcomment }) => {
						const rev = this.list.find((r) => r.getRevid() === String(revid));
						if (rev) {
							rev.parsedComment = parsedcomment;
							rev.parsedCommentFetched = true;
						}
					});
				});
			}).catch(console.error);
		};

		// Send API requests
		const deferreds = [];
		while (revids.length) {
			deferreds.push(setParsedComments(revids.splice(0, apilimit)));
		}
		this.initPromise = $.when(...deferreds).then(() => void 0).catch(() => void 0);

	}

	/**
	 * Fetch the delete-reason dropdown's options and add them to the MRD's reason dropdowns.
	 * @param {OO.ui.DropdownInputWidget[]} dropdowns
	 * @returns {void}
	 * @private
	 */
	static initializeReasonDropdowns(dropdowns) {

		const reasons = getMessage('revdelete-reason-dropdown');
		/** @type {{ optgroup?:string; data?: string; label?: string; }[]} */
		const options = [{
			data: '',
			label: getMessage('revdelete-reasonotherlist')
		}];

		if (typeof reasons === 'string') {
			const regex = /(\*+)([^*]+)/g;
			let m;
			while ((m = regex.exec(reasons))) {
				const content = m[2].trim();
				if (m[1].length === 1) { // * <optgroup text>
					options.push({
						optgroup: content
					});
				} else { // ** <option text>
					options.push({
						data: content,
						label: content
					});
				}
			}
		}

		if (options.length < 2) {
			mw.notify('MassRevisionDelete: 削除理由の取得に失敗しました。', { type: 'error' });
		}
		dropdowns.forEach((dd) => {
			dd.setOptions(options);
		});

	}

	/**
	 * Create utility buttons to select revdel target revisions.
	 * @param {JQuery<HTMLUListElement>} $contribsList
	 * @param {MassRevisionDelete['list']} list
	 * @returns {{ $wrapper: JQuery<HTMLDivElement>; $revisionCounter: JQuery<HTMLElement>; }}
	 * @private
	 */
	static createRevisionSelector($contribsList, list) {

		/**
		 * @type {JQuery<HTMLDivElement>}
		 */
		const $wrapper = $('<div>');
		/**
		 * @type {JQuery<HTMLSelectElement>}
		 */
		const $dropdown = $('<select>');
		/**
		 * @type {JQuery<HTMLElement>}
		 */
		const $revisionCounter = $('<b>');
		/**
		 * @param {'select'|'unselect'|'invert'} type
		 */
		const clickEvent = (type) => {
			if ($wrapper.hasClass('mrd-disabledlink')) {
				return;
			}
			const target = /** @type {''|'deleted'|'undeleted'} */ ($dropdown.val());
			list.forEach((rev) => {
				if (!target || target === 'deleted' && rev.hasDeletedItem() || target === 'undeleted' && !rev.hasDeletedItem()) {
					const selection =
						type === 'select' ? true :
						type === 'unselect' ? false :
						!rev.isSelected();
					rev.toggleSelection(selection);
				}
			});
		};

		$contribsList.eq(0).before(
			$wrapper
				.prop('id', 'mrd-revision-selector')
				.append(
					$('<span>')
						.text('選択:'),
					$dropdown
						.attr('title', '選択ボタンの対象を制限します。')
						.append(
							new Option('(対象:全ての版)', '', true, true),
							new Option('既削除版のみ', 'deleted'),
							new Option('未削除版のみ', 'undeleted')
						),
					$('<span>')
						.append(
							$('<a>')
								.prop('role', 'button')
								.text('全選択')
								.off('click').on('click', () => {
									clickEvent('select');
								}),
							'・',
							$('<a>')
								.prop('role', 'button')
								.text('全選択解除')
								.off('click').on('click', () => {
									clickEvent('unselect');
								}),
							'・',
							$('<a>')
								.prop('role', 'button')
								.text('選択反転')
								.off('click').on('click', () => {
									clickEvent('invert');
								})
						),
					$('<span>').text('選択済みの版数:'),
					$revisionCounter.text('0')
				)
		);

		return { $wrapper, $revisionCounter };

	}

	/**
	 * Set the state of whether the Execute button should accept a click on it.
	 * @param {boolean} accept
	 * @returns {MassRevisionDelete}
	 */
	setExecutionAcceptability(accept) {
		this.acceptExecution = accept;
		return this;
	}

	/**
	 * Set the 'disabled' states of the execute button, the revision selector buttons,
	 * and the checkboxes and revdel links of all revisions.
	 * @param {boolean} disable
	 * @param {('execute'|'selector'|'revisions')[]} [skip] Which target(s) to skip.
	 * @returns {MassRevisionDelete}
	 */
	setDisabled(disable, skip = []) {
		if (skip.indexOf('execute') === -1) {
			this.setExecuteButtonDisabled(disable);
		}
		if (skip.indexOf('selector') === -1) {
			this.setSelectorButtonDisabled(disable);
		}
		if (skip.indexOf('revisions') === -1) {
			this.setRevisionsDisabled(disable);
		}
		return this;
	}

	/**
	 * Set the 'disabled' state of the execute button.
	 * @param {boolean} disable If `false`, {@link acceptExecution} will be set back to `true`.
	 * @returns {MassRevisionDelete}
	 */
	setExecuteButtonDisabled(disable) {
		if (!disable) {
			this.acceptExecution = true;
		}
		this.btnExecute.setDisabled(disable);
		return this;
	}

	/**
	 * Set the 'disabled' states of the revision selector buttons.
	 * @param {boolean} disable
	 * @returns {MassRevisionDelete}
	 */
	setSelectorButtonDisabled(disable) {
		this.$btnContainer.toggleClass('mrd-disabledlink', disable);
		return this;
	}

	/**
	 * Set the 'disabled' states of the checkboxes and the revdel links for all revisions.
	 * @param {boolean} disable
	 * @returns {MassRevisionDelete}
	 */
	setRevisionsDisabled(disable) {
		this.list.forEach((rev) => {
			rev.setDisabled(disable);
		});
		return this;
	}

	/**
	 * Given a target item of revison deletion, get the corresponding RadioSelect widget that holds settings for the visibility level.
	 * @param {RevdelTarget | 'suppress'} target
	 * @returns {VisibilityLevel}
	 */
	getVisibilityLevelWidget(target) {
		switch (target) {
			case 'content':
				return this.vlContent;
			case 'comment':
				return this.vlComment;
			case 'user':
				return this.vlUser;
			case 'suppress':
				return this.vlSuppress;
			default: {
				const err = `MassRevisionDelete.getVisibilityLevelWidget encountered an unexpected target of "${target}".`;
				console.error(err);
				throw new Error(err);
			}
		}
	}

	/**
	 * Prepare for revision deletion.
	 * @returns {JQueryPromise<DefaultParams|false>}
	 * @private
	 */
	prepare() {

		// Get the number of revisions to delete
		// We don't collect IDs here because we'll have to loop MassRevisionDelete.list later, before sending API requests
		const revisionCount = this.list.filter((rev) => rev.isSelected()).length;
		if (!revisionCount) {
			return mw.notify('版指定削除の対象版が選択されていません。', { type: 'error' }).then(() => false);
		}

		// Get visibility levels
		const vis = {
			hide: [],
			show: [],
			suppress: 'nochange'
		};
		/**
		 * An object valued by jQuery Objects, later used for the revdel confirmation popup.
		 * @type {Record<RevdelTarget | 'suppress', JQuery<HTMLElement>>}
		 */
		const conf = Object.create(null);
		/** @type {(RevdelTarget | 'suppress')[]} */(['suppress'].concat(Revision.targets)).forEach((target) => {
			const widget = this.getVisibilityLevelWidget(target);
			conf[target] = widgetToConfirmationMessage(widget); // Will be used later to confirm the revision deletion
			const level = widget.getData();
			if (vis[level] && target !== 'suppress') {
				// "level=nochange" is ignored because the "vis" object doesn't have that key
				vis[level].push(target);
			} else if (target === 'suppress' && level !== 'nochange') {
				vis.suppress = level === 'show' ? 'no' : 'yes';
			}
		});
		if (!vis.hide.length && !vis.show.length) {
			return mw.notify('版指定削除の対象項目が選択されていません。', { type: 'error' }).then(() => false);
		}

		// Get reason
		const reason = [this.reason1.getValue(), this.reason2.getValue(), this.reasonC.getValue().trim()].filter(Boolean).join(': ');
		return (() => {
			if (reason) {
				return $.Deferred().resolve(true).promise();
			} else {
				return OO.ui.confirm('版指定削除の理由が指定されていません。このまま実行しますか？', { size: 'medium' });
			}
		})()
		.then(/** @param {boolean} confirmed */ (confirmed) => {

			if (!confirmed) {
				return false;
			}

			const $confirm = $('<div>').append(
				`<b>計${revisionCount}版</b>の閲覧レベルを変更します。`,
				$('<ul>').append(
					$('<li>').append(
						getMessage('revdelete-hide-text'),
						' (',
						conf.content,
						')'
					),
					$('<li>').append(
						getMessage('revdelete-hide-comment'),
						' (',
						conf.comment,
						')'
					),
					$('<li>').append(
						getMessage('revdelete-hide-user'),
						' (',
						conf.user,
						')'
					),
					$('<li>').append(
						getMessage('revdelete-hide-restricted'),
						' (',
						conf.suppress,
						')'
					).toggle(rights.suppress)
				),
				'よろしいですか？'
			);
			return OO.ui.confirm($confirm, { size: 'medium' });

		}).then((confirmed) => {

			if (!confirmed) {
				return false;
			}

			let tags = '';
			switch (mw.config.get('wgWikiID')) {
				case 'testwiki':
					tags = 'testtag';
					break;
				case 'jawiki':
					tags = 'MassRevisionDelete';
			}

			return /** @type {DefaultParams} */ ({
				action: 'revisiondelete',
				type: 'revision',
				reason,
				hide: vis.hide.join('|'),
				show: vis.show.join('|'),
				suppress: vis.suppress,
				tags
			});

		});

		/**
		 * @param {VisibilityLevel} widget
		 * @returns {JQuery<HTMLElement>}
		 */
		function widgetToConfirmationMessage(widget) {
			const level = widget.getData();
			const $b = $('<b>');
			switch (level) {
				case 'nochange':
					return $b.text(/** @type {string} */(widget.optNochange.getLabel()));
				case 'show':
					return $b.text(/** @type {string} */(widget.optShow.getLabel())).addClass('mrd-green');
				case 'hide':
					return $b.text(/** @type {string} */(widget.optHide.getLabel())).addClass('mrd-red');
			}
		}

	}

	/**
	 * Perform mass revision deletion.
	 */
	execute() {
		this.prepare().then((defaultParams) => {

			if (!defaultParams) {
				this.setExecutionAcceptability(true);
				return;
			} else {
				this.setDisabled(true);
			}

			/**
			 * An object keyed by pagenames and each valued by an array of revision IDs.
			 * @type {Record<string, string[]>}
			 */
			const revisions = Object.create(null);
			/**
			 * An object keyed by revision IDs and each valued by a Revision instance.
			 */
			const instances = this.list.reduce(/** @param {Record<string, Revision>} acc */ (acc, rev) => {
				if (rev.isSelected()) {

					const revid = rev.getRevid();
					const pagename = rev.getPagename();

					// Create the "instances" object
					acc[revid] = rev;

					// Create the "revisions" object
					if (!revisions[pagename]) {
						revisions[pagename] = [];
					}
					revisions[pagename].push(revid);

					// Show a sninner icon to visualize that revision deletion is in progress
					rev.setProgress('doing');

				}
				return acc;
			}, Object.create(null));

			// Send API requests (per page)
			/**
			 * @type {ReturnType<MassRevisionDelete['revdel']>[]}
			 */
			const deferreds = [];
			const request = debuggingMode ? this.testRevdel.bind(this) : this.revdel.bind(this);
			Object.keys(revisions).forEach((pagename) => {
				const ids = revisions[pagename].slice();
				while (ids.length) {
					const params = Object.assign({
						target: pagename,
						ids: ids.splice(0, apilimit).join('|'),
					}, defaultParams);
					deferreds.push(request(params));
				}
			});

			// Wait until the deletions finish
			// Also wait for initPromise to resolve, to ensure that parsed comments have been fetched
			$.when(...deferreds, this.initPromise).then((...res) => {

				// Convert the array of result objects to one object
				/** @type {Record<string, ApiResultRevisionDelete>} */
				const result = Object.assign({}, ...res); // No need to care for initPromise because it's always undefined

				// Update the progress
				let requireHookCall = false;
				/** @type {Revision[]} */
				const failedRevs = [];
				// Using Array.reduceRight because "Object.keys(instances)" creates an array of revids in ascending order
				// The same array can be obtained when we collect revids by processing the revision <li>s in a bottom-up
				// fashion, but we'll want to process them in a top-down fashion
				const allRevs = Object.keys(instances).reduceRight(/** @param {Revision[]} acc */ (acc, revid) => {
					const rev = instances[revid];
					if (result[revid]) {
						if (typeof result[revid].code === 'string') {
							rev.setProgress('failed', result[revid].code);
							failedRevs.push(rev);
						} else {
							const h = rev.setProgress('done').setNewVisibility(result[revid], defaultParams.suppress);
							requireHookCall = requireHookCall || h;
						}
					} else {
						rev.setProgress('failed', 'unknown error');
						failedRevs.push(rev);
					}
					acc.push(rev);
					return acc;
				}, []);
				if (requireHookCall) {
					mw.hook('wikipage.content').fire($('.mw-body-content'));
				}

				// Show a post-execution notification
				if (!failedRevs.length) { // All succeeded
					this.setDisabled(false);
					mw.notify(
						$('<span>').html(`<b>計${allRevs.length}版</b>の版指定削除を実行しました。`),
						{ type: 'success' }
					);
					setTimeout(() => {
						allRevs.forEach((rev) => rev.setProgress(null));
					}, 3000);

				} else { // Some failed, create detailed elements for mw.notify in this case

					this.setDisabled(false, ['execute']);

					// Error navigation buttons (prev/next)
					const btnPrev = new OO.ui.ButtonWidget({
						icon: 'arrowUp',
						title: '前のエラーへ'
					});
					const btnNext = new OO.ui.ButtonWidget({
						icon: 'arrowDown',
						title: '次のエラーへ'
					});
					const buttons = new OO.ui.ButtonGroupWidget({
						items: [btnPrev, btnNext]
					});
					buttons.$element.css('display', 'inline-flex');

					// Error index dropdown
					const indexDropdown = new OO.ui.DropdownWidget({
						menu: {
							items: failedRevs.map((_, i) => new OO.ui.MenuOptionWidget({ data: i, label: String(i + 1) }))
						}
					});
					indexDropdown.getMenu().on('select', (selectedItem) => {
						if (!selectedItem || Array.isArray(selectedItem)) {
							return;
						}
						const index = /** @type {number} */ (selectedItem.getData());
						failedRevs[index].scrollIntoView(); // Scroll to <li> with the corresponding index
					});
					indexDropdown.$element.css('display', 'inline-flex');

					// Set up the buttons' events
					btnPrev.off('click').on('click', () => {
						const menu = indexDropdown.getMenu();
						const selectedItem = /** @type {OO.ui.OptionWidget?} */ (menu.findSelectedItem());
						let index = selectedItem ? /** @type {number} */ (selectedItem.getData()) - 1 : failedRevs.length - 1;
						if (index < 0) {
							index = failedRevs.length - 1;
						}
						// Deselect once and select the new option
						// This is because we want to trigger the "select" event even when the selected option won't change
						menu.selectItem().selectItemByData(index);
					});
					btnNext.off('click').on('click', () => {
						const menu = indexDropdown.getMenu();
						const selectedItem = /** @type {OO.ui.OptionWidget?} */ (menu.findSelectedItem());
						let index = selectedItem ? /** @type {number} */ (selectedItem.getData()) + 1 : 0;
						if (index === failedRevs.length) {
							index = 0;
						}
						menu.selectItem().selectItemByData(index);
					});

					mw.notify(
						$('<div>')
							.append(
								$('<p>').html(
									`<b>計${allRevs.length}版</b>の版指定削除を実行しました。` +
									`うち<b class="mrd-red">${failedRevs.length}版の削除に失敗</b>しました。`
								),
								$('<p>').text('クリックしてこの通知を閉じると、結果をクリアし実行ボタンを再有効化します。'),
								$('<p>').text('エラーを閲覧：'),
								$('<div>')
									.append(
										buttons.$element,
										indexDropdown.$element
									)
									.css({
										display: 'flex',
										marginTop: '0.8em'
									})
							)
							.css('text-align', 'justify'),
						{ type: 'warn', autoHide: false }
					).then((notif) => {
						// Detect when the notification is closed using a custom event
						notif.$notification.off('mrd-notif-close').on('mrd-notif-close', () => {
							allRevs.forEach((rev) => rev.setProgress(null));
							this.setExecuteButtonDisabled(false);
						});
					});

				}

			});

		});
	}

	/**
	 * @typedef {import('ts-xor').XOR<ApiResultRevisionDeleteSuccess, ApiResultRevisionDeleteFailure>} ApiResultRevisionDelete
	 */
	/**
	 * Perform revision deletion.
	 * @param {ApiParamsActionRevisionDelete} params
	 * @returns {JQueryPromise<Record<string, ApiResultRevisionDelete>>}
	 */
	revdel(params) {

		return api.postWithToken('csrf', /** @type {Record<string, any>} */ (params))
		// @ts-expect-error
		.then(/** @param {ApiResponseActionRevisionDelete} res */ (res) => {

			const resItems = res && res.revisiondelete && res.revisiondelete.items;
			if (!resItems || !resItems.length) {
				return createErrorObject('unknown error');
			}

			return resItems.reduce(/** @param {Record<string, ApiResultRevisionDelete>} acc */ (acc, obj) => {
				if (obj.errors && obj.errors.length) {
					const err = obj.errors.reduce(/** @param {string[]} codeArr */ (codeArr, { code }) => {
						if (codeArr.indexOf(code) === -1) {
							codeArr.push(code);
						}
						return codeArr;
					}, []);
					acc[obj.id] = {
						code: err.join(', ')
					};
				} else {
					acc[obj.id] = {
						content: !obj.texthidden,
						comment: !obj.commenthidden,
						user: !obj.userhidden
					};
				}
				return acc;
			}, Object.create(null));

		})
		.catch(/** @param {string} code */ (code, err) => {
			console.log(err);
			return createErrorObject(code);
		});

		/**
		 * @param {string} code
		 * @returns {Record<string, ApiResultRevisionDeleteFailure>}
		 */
		function createErrorObject(code) {
			return params.ids.split('|').reduce(/** @param {Record<string, ApiResultRevisionDeleteFailure>} acc */ (acc, revid) => {
				acc[revid] = { code };
				return acc;
			}, Object.create(null));
		}

	}

	/**
	 * Perform experimental revision deletion.
	 * @param {ApiParamsActionRevisionDelete} params
	 * @returns {JQueryPromise<Record<string, ApiResultRevisionDelete>>}
	 */
	testRevdel(params) {
		const def = $.Deferred();
		const vis = Revision.targets.reduce(/** @param {Record<RevdelTarget, RevdelLevel>} acc */ (acc, target) => {
			if (params.hide.indexOf(target) === -1 && params.show.indexOf(target) === -1) {
				acc[target] = 'nochange';
			} else if (params.hide.indexOf(target) === -1) {
				acc[target] = 'show';
			} else {
				acc[target] = 'hide';
			}
			return acc;
		}, Object.create(null));
		const ret = params.ids.split('|').reduce(/** @param {Record<string, ApiResultRevisionDelete>} acc */ (acc, revid) => {
			/** @type {Revision=} */
			let rev;
			if (Math.random() > 0.1 && (rev = this.list.find((r) => r.getRevid() === revid))) {
				acc[revid] = Object.create(null);
				for (const target of Revision.targets) {
					switch (vis[target]) {
						case 'show':
							acc[revid][target] = true;
							break;
						case 'hide':
							acc[revid][target] = false;
							break;
						case 'nochange':
							acc[revid][target] = !!rev.currentVisibility[target];
							break;
						default: {
							const err = `Encountered an unexpected value: ${vis[target]}.`;
							console.error(err);
							throw new Error(err);
						}
					}
				}
			} else {
				acc[revid] = {
					code: 'fabricated error'
				};
			}
			return acc;
		}, Object.create(null));
		setTimeout(() => def.resolve(ret), 1000);
		return def.promise();
	}

}

// Custom event for when mw.notification is closed
$.event.special['mrd-notif-close'] = {
	remove: (o) => {
		if (o.handler) {
			// @ts-expect-error
			o.handler();
		}
	}
};

class Revision {

	/**
	 * @param {HTMLLIElement} li
	 */
	constructor(li) {

		/**
		 * @type {JQuery<HTMLLIElement>}
		 */
		this.$li = $(li);

		/**
		 * The ID number of this revision.
		 * @type {string}
		 */
		this.revid = this.$li.data('mw-revid').toString();

		/**
		 * The prefixed page name associated with this revision.
		 * @type {string}
		 */
		this.pagename = (() => {
			const $pageLink = this.$li.find('.mw-contributions-title');
			const href = $pageLink.attr('href');
			let m;
			if (href && (m = Revision.regex.article.exec(href) || Revision.regex.script.exec(href))) {
				return decodeURIComponent(m[1]).replace(/_/g, ' ');
			} else {
				const err = 'The page link does not have a well-formed href.';
				console.error(err, $pageLink);
				throw new Error(err);
			}
		})();

		/**
		 * A span tag used to show the progress of revdel execution. This tag will contain an image or an error code.
		 * @type {JQuery<HTMLInputElement>}
		 */
		this.$progress = $('<span>');

		/**
		 * The revision selector checkbox.
		 *
		 * **`$checkbox.prop('checked')` is read-only.** Use {@link toggleSelection} to (un)check the box programmatically.
		 * @type {JQuery<HTMLInputElement>}
		 */
		this.$checkbox = $('<input>');

		this.$li.prepend(
			this.$progress
				.addClass('mrd-progress'),
			this.$checkbox
				.prop('type', 'checkbox')
				.addClass('mrd-checkbox')
		);

		/**
		 * A <span> tag in which there's an <a> tag.
		 * @type {JQuery<HTMLSpanElement>}
		 */
		this.$revdelLink = this.$li.children('.mw-revdelundel-link');
		// The wrapper is a <strong> tag on a suppressor's view if the editor's name is suppressed
		const isUserSuppressed = this.$revdelLink.prop('nodeName') === 'STRONG';
		if (isUserSuppressed) {
			// Replace <strong> with <span> because it's challenging to do this when we change the revdel
			// status of "userhidden"
			const $wrapper = $('<span>').addClass('mw-revdelundel-link mrd-revdelundel-link-userhidden');
			this.$revdelLink.before($wrapper); // Insert the new wrapper before the revdel link
			$wrapper.append(this.$revdelLink.children()); // Move the inner elements into the new wrapper
			this.$revdelLink.remove(); // Remove the old wrapper from the DOM
			this.$revdelLink = $wrapper;
		}
		/**
		 * Whether the current user can change the visibility of this revision.
		 * @type {boolean}
		 */
		this.changeable = !!this.$revdelLink.children('a').length;
		if (this.changeable) {
			// Use the revdel link as a button to toggle the checkbox only when the link has an <a> tag in it
			this.$revdelLink.off('click').on('click', (e) => {
				if (this.$revdelLink.hasClass('mrd-disabledlink')) {
					e.preventDefault();
				} else if (!e.shiftKey && !e.ctrlKey) {
					e.preventDefault();
					this.toggleSelection(!this.isSelected());
				}
			});
		} else {
			this.$checkbox.prop('disabled', true);
		}

		/**
		 * An object keyed by revdel targets and each valued by its current visibility level.
		 * (`true` if visible, `false` if not, or `null` if suppressed)
		 * @type {Record<RevdelTarget, boolean?>}
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
			let $link = this.$li.find('.mw-changeslist-date').eq(0);
			if ($link.parent('span').hasClass(Revision.class.deleted)) {
				// On DC, the wrapper <span> doesn't have the "mw-changeslist-date" class
				$link = $link.parent('span');
			}
			if ($link.hasClass(Revision.class.suppressed) && $link.hasClass(Revision.class.deleted)) {
				this.currentVisibility.content = null;
			} else if ($link.hasClass(Revision.class.deleted)) {
				this.currentVisibility.content = false;
			}
			if ($link.prop('nodeName') !== 'SPAN' && $link.parent().prop('nodeName') === 'BDI') {
				$link = $link.parent(); // Substitute with the <bdi> tag
			}
			return $link;
		})();

		/**
		 * The `<span>` tag for summary. See {@link toggleCommentVisibility} for all its HTML structures.
		 * @type {JQuery<HTMLSpanElement>}
		 */
		this.$comment = this.$li.children('.comment');
		if (this.$comment.hasClass(Revision.class.suppressed) && this.$comment.hasClass(Revision.class.deleted)) {
			this.currentVisibility.comment = null;
		} else if (this.$comment.hasClass(Revision.class.deleted)) {
			this.currentVisibility.comment = false;
		}

		/**
		 * Comment in an HTML format.
		 * @type {string}
		 */
		this.parsedComment = '';
		/**
		 * @type {boolean}
		 */
		this.parsedCommentFetched = true;
		if (this.$comment.hasClass(Revision.class.deleted)) {
			if (isDeletedContribs) {
				this.parsedComment = this.$comment.children('.comment').html();
			} else {
				this.parsedCommentFetched = false;
			}
		} else if (this.$comment.hasClass('mw-comment-none')) {
			// Do nothing because the parsed comment will be an empty string
		} else {
			this.parsedComment = this.$comment.html();
		}

		const msgUserHidden = getMessage('rev-deleted-user-contribs');
		/**
		 * The \<strong> tag shown if the user name has been hidden.
		 * @type {JQuery<HTMLElement>}
		 */
		this.$userhidden = this.$li.children('strong').filter((_, el) => $(el).text() === msgUserHidden);
		if (this.$userhidden.length) {
			if (isUserSuppressed) {
				this.currentVisibility.user = null;
			} else {
				this.currentVisibility.user = false;
			}
		} else {
			// The tag doesn't exist if the username isn't revdel-ed; create one in this case
			this.$userhidden = $('<strong>')
				.text(msgUserHidden)
				.css('margin', '0 0.5em')
				.hide()
				.insertAfter(this.$comment);
		}
		this.$userhidden.addClass('mrd-userhidden');

	}

	/**
	 * Scroll to the revision and make it flash.
	 * @returns {Revision}
	 */
	scrollIntoView() {
		this.$li[0].scrollIntoView();
		this.$li.css('background-color', 'var(background-color-error-subtle--active,#ffc8bd)');
		setTimeout(() => {
			this.$li.animate({ backgroundColor: '' }, 500, function() {
				$(this).css('background-color', '');
			});
		}, 500);
		return this;
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
	 * Given the new visibility levels and the suppression setting, update the {@link currentVisibility} property
	 * and the DOM appearances of revdel targets.
	 * @param {Record<RevdelTarget, boolean>} newVis
	 * @param {DefaultParams['suppress']} suppress
	 * @returns {boolean} Whether mw.hook will need to be called
	 */
	setNewVisibility(newVis, suppress) {

		// Update the current visibility levels
		const oldVisibility = Object.assign({}, this.currentVisibility);
		this.currentVisibility = Revision.targets.reduce((acc, target) => {
			if (newVis[target]) {
				acc[target] = true;
			} else { // newVis[target] === false or null
				switch (suppress) {
					case 'nochange':
						acc[target] = this.currentVisibility[target] === null ? null : false;
						break;
					case 'yes':
						acc[target] = null;
						break;
					case 'no':
						acc[target] = false;
						break;
					default: {
						const err = `Revision.setNewVisibility encountered an unexpected value of ${suppress}.`;
						console.error(err);
						throw new TypeError(err);
					}
				}
			}
			return acc;
		}, Object.create(null));

		// Update the DOM appearances of revdel targets and return
		return this.toggleTargetVisibility(oldVisibility);

	}

	/**
	 * Toggle the checked state of the checkbox. Do nothing if the checkbox is disabled (which means that
	 * the current user does not have the rights to change the visibility of this revision).
	 * @param {boolean} check
	 * @returns {Revision}
	 */
	toggleSelection(check) {
		if (this.changeable) {
			this.$checkbox.prop('checked', check).trigger('change');
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
	 * Change the disabled states of the checkbox and the revdel link.
	 * @param {boolean} disable
	 * @returns {Revision}
	 */
	setDisabled(disable) {
		if (this.changeable) {
			// If the revision is revdel-wise not changeable, the checkbox is initially disabled and the revdel
			// link doesn't contain an <a> tag (i.e. not clickable). Because of this, we only look at changeable
			// revisions, and this also prevents checkboxes that should always be disabled from being enabled back.
			this.$checkbox.prop('disabled', disable);
			this.$revdelLink.toggleClass('mrd-disabledlink', disable);
		}
		return this;
	}

	/**
	 * Toggle the revdel statuses of all the revdel targets.
	 * @param {Revision['currentVisibility']} oldVis
	 * @returns {boolean} Whether mw.hook will need to be called
	 */
	toggleTargetVisibility(oldVis) {
		return this
			.toggleContentVisibility(oldVis.content, this.currentVisibility.content)
			.toggleUserVisibility(oldVis.user, this.currentVisibility.user)
			.toggleCommentVisibility(oldVis.comment, this.currentVisibility.comment);
	}

	/**
	 * Toggle the revdel status of the content.
	 *
	 * `[[Special:Contributions]]`
	 * ```html
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
	 * `[[Special:DeletedContributions]]`
	 *
	 * Summary: `<bdi>` tags missing, the `mw-changeslist-date` class missing from the wrapper when deleted
	 * ```html
	 * <!-- Normal date link -->
	 * <a class="mw-changeslist-date">2023-01-01T00:00:00</a>
	 * <!-- Deleted date link -->
	 * <span class="history-deleted"><!-- Has an additional class if suppressed -->
	 * 	<!-- Empty on a non-suppressor's view if suppressed -->
	 * 	<a class="mw-changeslist-date">2023-01-01T00:00:00</a>
	 * </span>
	 * ```
	 * @param {boolean?} oldVis
	 * @param {boolean?} newVis
	 * @returns {Revision}
	 */
	toggleContentVisibility(oldVis, newVis) {
		if (oldVis === newVis) {
			return this;
		}
		if (newVis) { // false/null -> true; wrapper is <span>

			const $inner = this.$date.children().eq(0); // Get the inner element
			this.$date.before($inner).remove(); // Move the inner element before the wrapper and remove the wrapper
			this.$date = $inner; // Set the inner element as the date link

		} else if (oldVis) { // true -> false/null; wrapper is <a> or <bdi>

			const $wrapper = $('<span>')
				.toggleClass('mw-changeslist-date', !isDeletedContribs)
				.addClass(Revision.class.deleted)
				.toggleClass(Revision.class.suppressed, newVis === null);
			this.$date.before($wrapper); // Append the wrapper before the date link
			$wrapper.append(this.$date); // Move the date link inside the wrapper
			this.$date = $wrapper; // Set the wrapper as the date link

		} else { // false -> null, null -> false

			this.$date.toggleClass(Revision.class.suppressed, newVis === null);

		}
		return this;
	}

	/**
	 * Toggle the revdel status of the comment (edit summary).
	 *
	 * `[[Special:Contributions]]`
	 * ```html
	 * <!-- Normal comment -->
	 * <span class="comment comment--without-parentheses">COMMENT</span>
	 * <!-- Normal comment (empty) -->
	 * <span class="comment mw-comment-none">No edit summary</span><!-- Has text but invisible -->
	 * <!-- Deleted comment -->
	 * <span class="history-deleted comment"><!-- Has an additional class if suppressed -->
	 * 	<span class="comment">(edit summary removed)</span>
	 * </span>
	 * ```
	 * `[[Special:DeletedContributions]]`
	 * ```html
	 * <!-- Normal comment -->
	 * <span class="comment comment--without-parentheses">COMMENT</span>
	 * <!-- Normal comment (empty) -->
	 * <span class="comment mw-comment-none">No edit summary</span><!-- Has text but invisible -->
	 * <!-- Deleted comment -->
	 * <span class="history-deleted comment"><!-- Has an additional class if suppressed -->
	 * 	<!-- Empty if there's no edit summary -->
	 * 	<span class="comment comment--without-parentheses">COMMENT</span>
	 * </span>
	 * <!-- Suppressed comment on a non-supressor's view (empty, non-empty) -->
	 * <!-- This pattern is irrelevant to this method because the user can't change visibility -->
	 * <span class="history-deleted mw-history-suppressed comment">
	 * 	<span class="comment">(edit summary removed)</span>
	 * </span>
	 * ```
	 * @param {boolean?} oldVis
	 * @param {boolean?} newVis
	 * @returns {boolean} Whether mw.hook will need to be called
	 */
	toggleCommentVisibility(oldVis, newVis) {
		if (oldVis === newVis) {
			return false;
		}
		let ret = true;
		if (newVis) { // false/null -> true

			const $inner =
				this.$comment.children().length ? // The inner tag can be missing on DC
				this.$comment.children().eq(0) : // On C, just get the inner tag
				$('<span>').addClass('comment'); // On DC, create one
			this.$comment.before($inner).remove(); // Move the inner tag before the wrapper and remove the wrapper
			this.$comment = $inner;
			if (this.parsedComment) {
				this.$comment
					.addClass('comment--without-parentheses')
					.html(this.parsedComment);
			} else {
				this.$comment
					.addClass('mw-comment-none')
					.html(getMessage('changeslist-nocomment'));
			}

		} else if (oldVis) { // true -> false/null

			const $wrapper = $('<span>')
				.addClass('comment')
				.addClass(Revision.class.deleted)
				.toggleClass(Revision.class.suppressed, newVis === null);
			this.$comment // This will be the inner content
				.before($wrapper) // Insert the wrapper before the comment
				.removeAttr('class').addClass('comment') // Remove all classes but "comment"
				.toggleClass('comment--without-parentheses', isDeletedContribs);
			$wrapper.append(this.$comment); // Move the comment into the wrapper
			if (!isDeletedContribs) { // On C
				this.$comment.html(getMessage('rev-deleted-comment'));
			} else if (this.parsedComment) { // On DC and comment is non-empty
				this.$comment.html(this.parsedComment);
			} else {
				$wrapper.empty();
			}
			this.$comment = $wrapper;

		} else { // false -> null, null -> false

			this.$comment.toggleClass(Revision.class.suppressed, newVis === null);
			ret = false;

		}
		return ret;
	}

	/**
	 * Toggle the revdel status of the username.
	 * @param {boolean?} oldVis
	 * @param {boolean?} newVis
	 * @returns {Revision}
	 */
	toggleUserVisibility(oldVis, newVis) {

		if (oldVis === newVis) {
			return this;
		}
		this.$userhidden.toggle(!newVis);
		this.$revdelLink.toggleClass('mrd-revdelundel-link-userhidden', newVis === null);

		// When the username is unhidden, remove "(no username available)" nodes if any
		const msg = getMessage('empty-username');
		if (newVis === true && msg) {
			const childNodes = this.$li[0].childNodes;
			for (let i = childNodes.length - 1; i >= 0; i--) {
				const node = childNodes[i];
				const text = node.textContent;
				if (typeof text !== 'string') {
					continue;
				}
				if (text.indexOf(msg) !== -1) {
					node.remove();
				}
			}
		}

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
 * An array of revdel target names, used only for typing reasons.
 * @type {RevdelTarget[]}
 */
Revision.targets = ['content', 'comment', 'user'];

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

/**
 * Get an interface message.
 * @param {MessageName} name
 * @returns {string}
 */
function getMessage(name) {
	let ret = mw.messages.get(name);
	if (ret === null) {
		ret = {
			'revdelete-hide-text': '版の本文',
			'revdelete-hide-comment': '編集の要約',
			'revdelete-hide-user': '投稿者の利用者名/IPアドレス',
			'revdelete-otherreason': '他の、または追加の理由:',
			'revdelete-reason-dropdown': '',
			'revdelete-reasonotherlist': 'その他の理由',
			'rev-deleted-user-contribs': '[利用者名またはIPアドレスは除去されました - この編集は投稿記録で非表示にされています]',
			'revdelete-hide-restricted': '一般利用者に加え管理者からもデータを隠す',
			'rev-deleted-comment': '(要約は除去されています)',
			'changeslist-nocomment': '編集の要約なし',
			'empty-username': ''
		}[name];
	}
	if (ret === void 0) {
		throw new ReferenceError(`Message named ${name} is not found.`);
	}
	return ret;
}

//*********************************************************************************************

init();

//*********************************************************************************************
})();
//</nowiki>