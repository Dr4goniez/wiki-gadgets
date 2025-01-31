/*********************************************************************************************\

    MassRevisionDelete

    Create an interface to delete multiple revisions at one fell swoop when the script
    user visits a user's contributions page.

    @link https://ja.wikipedia.org/wiki/Help:MassRevisionDelete
    @author [[User:Dragoniez]]

\*********************************************************************************************/
//<nowiki>

(function() { // Container IIFE

// ************************************** INITIALIZATION **************************************

/**
 * When true, the result of action=revisiondelete is fabricated when the revdel execution button is hit,
 * meaning that the user can test all the functionalities of this script but actual revision deletion
 * isn't performed.
 * @readonly
 */
var debuggingMode = false;

/** @readonly */
var MRD = 'MassRevisionDelete';

// Use script only on [[Special:Contributions]] and [[Special:DeletedContributions]]
var spPageName = mw.config.get('wgCanonicalSpecialPageName');
var isDeletedContribs = spPageName === 'DeletedContributions' ? true : spPageName === 'Contributions' ? false : null;
if (isDeletedContribs === null) return;

// Use script only when the current user has the 'deleterevision' user right
var userRights = {
	deleterevision: ['sysop', 'eliminator', 'suppress', 'global-sysop', 'staff', 'steward', 'sysadmin'],
	suppressrevision: ['suppress', 'staff'],
	apihighlimits: ['sysop', 'apihighlimits-requestor', 'global-sysop', 'staff', 'steward', 'sysadmin', 'wmf-researcher']
};
var canRevDel = false;
var canOversight = false;
var hasApiHighLimits = false;
// @ts-ignore
mw.config.get('wgUserGroups').concat(mw.config.get('wgGlobalGroups')).some(function(group) {
	if (!canRevDel) {
		canRevDel = userRights.deleterevision.indexOf(group) !== -1;
	}
	if (!canOversight) {
		canOversight = userRights.suppressrevision.indexOf(group) !== -1;
	}
	if (!hasApiHighLimits) { // Bots excluded
		hasApiHighLimits = userRights.apihighlimits.indexOf(group) !== -1;
	}
	return canRevDel && canOversight && hasApiHighLimits; // Get out of the loop when all entries have become true
});
if (!canRevDel) return;

/**
 * The maximum number of revisions that can be handled by one API request
 * @readonly
 */
var apilimit = hasApiHighLimits ? 500 : 50;

/** @type {mw.Api} @readonly */
var api;

/** @readonly */
var classSuppressed = 'mw-history-suppressed';
/** @readonly */
var classDeleted = 'history-deleted';

/**
 * Interface messages.
 * @readonly
 */
var msg = {
	'rev-deleted-comment': '(edit summary removed)',
	'rev-deleted-user-contribs': '[username or IP address removed - edit hidden from contributions]',
	'rev-delundel': 'change visibility',
	/** This message should be hidden on the DOM by '.mw-comment-none'. */
	'changeslist-nocomment': 'No edit summary'
};
/** @readonly */
var msgNames = Object.keys(msg);

// Load dependent modules and create form
mw.loader.using('mediawiki.api', function() {
	api = new mw.Api();
	$.when(
		getMessages(msgNames), // Get local interface messages
		mw.loader.using('jquery.ui'),
		$.ready
	).then(function(res) {
		msgNames.forEach(function(name) {
			if (res[name]) msg[name] = res[name]; // Set local interface messages
		});
		createForm();
	});
});

// ************************************** MAIN FUNCTIONS **************************************

/**
 * Get interface messages.
 * @param {string[]} namesArr
 * @returns {JQueryPromise<Object.<string, string>>} name-message pairs
 */
function getMessages(namesArr) {
	return api.getMessages(namesArr)
		.then(function(res) {
			return res || {};
		}).catch(function(code, err) {
			console.error(MRD, err);
			return {};
		});
}

/** Create the MassRevisionDelete interface. */
function createForm() {

	/** @type {JQuery<HTMLUListElement>} */
	var $contribsList = $('ul.mw-contributions-list');
	if (!$contribsList.length) return;

	// Counter of revisions that are to be (un)deleted (will be appended to the DOM later)
	var checkedCounter = document.createElement('span');
	checkedCounter.style.display = 'block';
	checkedCounter.style.marginTop = '0.5em';
	checkedCounter.textContent = '選択済み版数: ';
	var checkedCounterNum = document.createElement('span');
	checkedCounterNum.textContent = '0';
	checkedCounter.appendChild(checkedCounterNum);

	// Add checkboxes etc. to the contribs list and create a reference object
	var listHasHiddenField = false;
	var revdelLinkFontSize = $('.mw-revdelundel-link:first').css('font-size');
	/** @type {string[]} */
	var revidsNoComment = [];

	/** @type {RevisionList} */
	var revisionList = Array.prototype.reduce.call($contribsList.children('li'), // Create object out of all contribs list items

		/**
		 * @param {RevisionList} acc
		 * @param {HTMLLIElement} listitem
		 */
		function(acc, listitem) {

			var $listitem = $(listitem);
			var clss = isDeletedContribs ? '.mw-changeslist-title' : '.mw-contributions-title';
			var $title = $listitem.children(clss).eq(0);
			var title = $title.text();
			var revid = listitem.dataset.mwRevid;

			// Get the 'change visibility' link and create its disabled alternant
			/** @type {HTMLSpanElement|null} */
			var revdelLink = listitem.querySelector('.mw-revdelundel-link');
			var revdelLinkDisabled = document.createElement('span');
			revdelLinkDisabled.classList.add('mrd-revdelundel-link');
			revdelLinkDisabled.style.display = 'none';
			revdelLinkDisabled.style.fontSize = revdelLinkFontSize;
			revdelLinkDisabled.textContent = '(' + msg['rev-delundel'] + ')';
			listitem.prepend(revdelLinkDisabled);

			// Checkbox
			var checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.classList.add('mrd-revdel-target');
			checkbox.style.marginRight = '0.5em';
			checkbox.addEventListener('change', function() { // Update counter when the box is (un)checked
				// @ts-ignore
				var num = parseInt(checkedCounterNum.textContent);
				checkedCounterNum.textContent = (this.checked ? ++num : --num).toString();
			});
			listitem.prepend(checkbox);

			// A span tag to show the progress of revdel execution
			var progress = document.createElement('span');
			progress.style.cssText = 'display: none; margin-right: 0.5em;';
			progress.classList.add('mrd-progress');
			listitem.prepend(progress);

			/**
			 * PermaLink with a date text. See toggleContentVisibility() for all possible HTML structures.
			 * @type {HTMLSpanElement|HTMLAnchorElement|null}
			 */
			var date = (function() {
				/** @type {HTMLAnchorElement|null} */
				var dateAnchor = listitem.querySelector('a.mw-changeslist-date');
				var pr;
				if (dateAnchor && (pr = dateAnchor.parentElement) && pr.tagName === 'SPAN' && pr.classList.contains(classDeleted)) {
					return pr; // span
				} else {
					return dateAnchor; // a or null
				}
			})();

			/**
			 * Comment (missing on [[Special:DeletedContributions]] if the revision has no edit summary; create a tag in this case).
			 * See toggleCommentVisibility() for all possible HTML structures.
			 * @type {HTMLSpanElement|null}
			 */
			var comment = listitem.querySelector('.comment');
			if (!comment) {
				comment = document.createElement('span');
				comment.classList.add('comment');
				if (!isDeletedContribs) comment.classList.add('comment--without-parentheses');
				$title.after(comment);
			}

			// Comment in an HTML format
			var parsedcomment;
			if (!comment.classList.contains(classDeleted) && !comment.classList.contains(classSuppressed) || // On Contributions and not deleted
				// On DeletedContributions, parsed comment can be fetched even when deleted (unless oversighted in non-OS view)
				isDeletedContribs && (canOversight ? true : !comment.classList.contains(classSuppressed)) 
			) {
				parsedcomment = comment.innerHTML;
			} else {
				parsedcomment = '';
				if (revid && revidsNoComment.indexOf(revid) === -1) {
					// Register revid for a later API request (fetch parsed comment from the API)
					revidsNoComment.push(revid);
				}
			}

			// 'Username hidden' warning (create one if there isn't any)
			var $userhidden = $listitem.children('strong').filter(function() { return $(this).text() === msg['rev-deleted-user-contribs']; });
			var userhidden = (function() {
				/** @type {HTMLElement} */
				var strong;
				if ($userhidden.length) {
					strong = $userhidden[0];
				} else {
					strong = document.createElement('strong');
					strong.style.cssText = 'display: none; margin-right: 0.5em;';
					strong.textContent = msg['rev-deleted-user-contribs'];
					if (comment.nextElementSibling) { // Insert after the comment tag
						listitem.insertBefore(strong, comment.nextElementSibling);
					} else {
						listitem.appendChild(strong);
					}
				}
				strong.classList.add('mrd-userhidden');
				return strong;
			})();

			var hasDeletedField = !!listitem.querySelector('.' + classDeleted);
			var hasOversightedField = !!listitem.querySelector('.' + classSuppressed);
			if (!listHasHiddenField) listHasHiddenField = hasDeletedField || hasOversightedField;

			if (hasOversightedField && !canOversight) {

				// Can't perform revdel if any item of the revision is oversighted and the current user isn't an oversighter
				checkbox.disabled = true;

			} else if (revdelLink && revid) {

				// Labelify the 'change visibility' link for the checkbox
				revdelLink.addEventListener('click', function(e) {
					if (!e.shiftKey && !e.ctrlKey) {
						e.preventDefault();
						checkbox.checked = !checkbox.checked;
						checkbox.dispatchEvent(new Event('change')); // Update counter
					}
				});

				// Add object (only if the current user can (un)delete this revision)
				acc[revid] = {
					progress: progress,
					checkbox: checkbox,
					label: revdelLink,
					pseudolabel: revdelLinkDisabled,
					date: date,
					title: title,
					comment: comment,
					parsedcomment: parsedcomment,
					userhidden: userhidden,
					revdeled: hasDeletedField || hasOversightedField,
					suppressed: hasOversightedField,
					current: !!listitem.querySelector('.mw-uctop')
				};

			}

			return acc;

		},
	Object.create(null));
	if (!Object.keys(revisionList).length) return; // Exit if all the revisions are inaccessible for revdel

	// Get revdel'd edit summaries and overwrite the revisionList object
	getParsedComment(revidsNoComment).then(function(obj) {
		Object.keys(obj).forEach(function(revid) {
			revisionList[revid].parsedcomment = obj[revid];
		});
	});

	// Create a style tag
	var style = document.createElement('style');
	style.textContent =
		// General
		'#mrd-form legend {' +
			'font-weight: bold;' +
		'}' +
		'#mrd-form select,' +
		'#mrd-form input {' +
			'box-sizing: border-box;' +
		'}' +
		'#mrd-form,' +
		'#mrd-form fieldset {' +
			'border-color: #a2a9b1;' +
		'}' +
		// Right margin for buttons
		'#mrd-buttons > div > input:not(first-child) {' +
			'margin-right: 0.5em;' +
		'}';
	document.head.appendChild(style);

	// The form
	var revdelForm = document.createElement('fieldset');
	revdelForm.id = 'mrd-form';
	revdelForm.style.cssText = 'font-size: 95%; margin: 0.5em 0;';
	revdelForm.innerHTML = '<legend>一括版指定削除</legend>';

	// Show/hide toggle
	var formToggle = document.createElement('input');
	formToggle.id = 'mrd-form-toggle';
	formToggle.type = 'button';
	formToggle.value = 'フォームを表示';
	revdelForm.appendChild(formToggle);

	// Form body
	var formBody = document.createElement('div');
	formBody.id = 'mrd-form-body';
	formBody.style.display = 'none';
	revdelForm.appendChild(formBody);

	var reasonFetched = false;
	var $formBody = $(formBody);
	formToggle.addEventListener('click', function() { // Toggle show/hide of the form when the button is hit
		this.value = $formBody.is(':visible') ? 'フォームを表示' : 'フォームを隠す';
		$formBody.slideToggle();
		if (reasonFetched) { // Adjust the width of custom reason input to that of the reason dropdowns when the form is expanded for the first time
			reasonFetched = false;
			reasonC.style.width = reason1.offsetWidth + 'px'; // reasonC: variable defined below
		}
	});

	// Visibility level field
	var levelField = document.createElement('fieldset');
	levelField.id = 'mrd-levels';
	levelField.style.margin = '0';
	levelField.innerHTML = '<legend>閲覧レベル</legend>';
	formBody.appendChild(levelField);

	var levelsTable = document.createElement('table');
	levelsTable.id = 'mrd-levels-revdel';
	levelField.appendChild(levelsTable);
	var levelsTableBody = document.createElement('tbody');
	levelsTable.appendChild(levelsTableBody);

	var visLevelCount = 0;
	/**
	 * @class
	 * @constructor
	 * @param {HTMLTableSectionElement} tbody
	 * @param {string} labelText
	 * @param {{nochangeLabel?: string; showLabel?: string; hideLabel?: string;}} [options]
	 */
	var VisLevel = function(tbody, labelText, options) {

		options = options || {};
		var labelRow = document.createElement('tr');
		tbody.appendChild(labelRow);
		/** @type {HTMLTableRowElement} */
		this.labelRow = labelRow;
		var label = document.createElement('td');
		label.style.fontWeight = 'bold';
		label.colSpan = 3;
		label.textContent = labelText;
		labelRow.appendChild(label);

		var radioRow = document.createElement('tr');
		tbody.appendChild(radioRow);
		/** @type {HTMLTableRowElement} */
		this.radioRow = radioRow;

		var nochange = document.createElement('td');
		radioRow.appendChild(nochange);
		var nochangeRadio = document.createElement('input');
		nochangeRadio.type = 'radio';
		nochangeRadio.style.marginRight = '0.5em';
		var nochangeId = 'mp-levels-nochange-' + (++visLevelCount);
		nochangeRadio.id = nochangeId;
		var levelName = 'level' + visLevelCount;
		nochangeRadio.name = levelName;
		nochangeRadio.checked = true;
		nochange.appendChild(nochangeRadio);
		var nochangeLabel = document.createElement('label');
		nochangeLabel.textContent = options.nochangeLabel || '変更しない';
		nochangeLabel.htmlFor = nochangeId;
		nochange.appendChild(nochangeLabel);
		/** @type {HTMLInputElement} */
		this.nochangeRadio = nochangeRadio;

		var show = document.createElement('td');
		radioRow.appendChild(show);
		var showRadio = document.createElement('input');
		showRadio.type = 'radio';
		showRadio.style.marginLeft = '1em';
		showRadio.style.marginRight = '0.5em';
		var showId = 'mp-levels-show-' + visLevelCount;
		showRadio.id = showId;
		showRadio.name = levelName;
		show.appendChild(showRadio);
		var showLabel = document.createElement('label');
		showLabel.textContent = options.showLabel || '閲覧可能';
		showLabel.htmlFor = showId;
		show.appendChild(showLabel);
		/** @type {HTMLInputElement} */
		this.showRadio = showRadio;

		var hide = document.createElement('td');
		radioRow.appendChild(hide);
		var hideRadio = document.createElement('input');
		hideRadio.type = 'radio';
		hideRadio.style.marginLeft = '1em';
		hideRadio.style.marginRight = '0.5em';
		var hideId = 'mp-levels-hide-' + visLevelCount;
		hideRadio.id = hideId;
		hideRadio.name = levelName;
		hide.appendChild(hideRadio);
		var hideLabel = document.createElement('label');
		hideLabel.textContent = options.hideLabel || '隠す';
		hideLabel.htmlFor = hideId;
		hide.appendChild(hideLabel);
		/** @type {HTMLInputElement} */
		this.hideRadio = hideRadio;

	};

	/**
	 * Get the value of the checked radio.
	 * @returns {VisStates}
	 * @method
	 * @typedef {"nochange"|"show"|"hide"} VisStates
	 */
	VisLevel.prototype.val = function() {
		return this.nochangeRadio.checked ? 'nochange' : this.showRadio.checked ? 'show' : 'hide';
	};

	/**
	 * Hide the table rows created by the constructor.
	 * @returns {void}
	 * @method
	 */
	VisLevel.prototype.hide = function() {
		this.labelRow.style.display = 'none';
		this.radioRow.style.display = 'none';
	};

	var visLevelContent = new VisLevel(levelsTableBody, '版の本文');
	var visLevelComment = new VisLevel(levelsTableBody, '編集の要約');
	var visLevelUser = new VisLevel(levelsTableBody, '投稿者の利用者名/IPアドレス');
	var visLevelOversight = new VisLevel(levelsTableBody, 'オーバーサイト', {showLabel: '適用しない', hideLabel: '適用する'});
	if (!canOversight) visLevelOversight.hide();

	// Reason field
	var reasonField = document.createElement('fieldset');
	reasonField.id = 'mrd-deletereason';
	reasonField.style.margin = '0';
	reasonField.innerHTML = '<legend>理由</legend>';
	formBody.appendChild(reasonField);

	var reason1 = createLabeledDropdown(reasonField, 'mrd-deletereason-1', '理由1');
	var reason2 = createLabeledDropdown(reasonField, 'mrd-deletereason-2', '理由2', {appendBr: true});
	var reasonC = createLabeledTextbox(reasonField, 'mrd-deletereason-C', '', {appendBr: true});
	reasonC.placeholder = '非定型理由 (自由記述)';

	// Button field
	var buttonField = document.createElement('div');
	buttonField.id = 'mrd-buttons';
	buttonField.style.cssText = 'margin-top: 0.5em;';
	formBody.appendChild(buttonField);

	var buttonsPrimary = document.createElement('div');
	buttonsPrimary.id = 'mrd-buttons-primary';
	buttonField.appendChild(buttonsPrimary);

	var buttonCheckAll = createButton(buttonsPrimary, 'mrd-checkall', '全選択');
	buttonCheckAll.addEventListener('click', function() {
		var cnt = 0;
		Object.keys(revisionList).forEach(function(revid) {
			var obj = revisionList[revid];
			obj.checkbox.checked = true;
			cnt++;
		});
		checkedCounterNum.textContent = cnt.toString();
	});
	var buttonUncheckAll = createButton(buttonsPrimary, 'mrd-uncheckall', '全選択解除');
	buttonUncheckAll.addEventListener('click', function() {
		Object.keys(revisionList).forEach(function(revid) {
			var obj = revisionList[revid];
			obj.checkbox.checked = false;
		});
		checkedCounterNum.textContent = '0';
	});
	var buttonInvert = createButton(buttonsPrimary, 'mrd-invert', '選択反転');
	buttonInvert.addEventListener('click', function() {
		var cnt = 0;
		Object.keys(revisionList).forEach(function(revid) {
			var obj = revisionList[revid];
			obj.checkbox.checked = !obj.checkbox.checked;
			if (obj.checkbox.checked) cnt++;
		});
		checkedCounterNum.textContent = cnt.toString();
	});

	var buttonsSecondary = document.createElement('div');
	buttonsSecondary.id = 'mrd-buttons-secondary';
	buttonsSecondary.style.cssText = 'margin-top: 0.5em;';
	buttonField.appendChild(buttonsSecondary);
	if (!listHasHiddenField) buttonsSecondary.style.display = 'none';

	var buttonCheckAllDeleted = createButton(buttonsSecondary, 'mrd-checkall-deleted', '削除済み版全選択');
	buttonCheckAllDeleted.addEventListener('click', function() {
		var cnt = 0;
		Object.keys(revisionList).forEach(function(revid) {
			var obj = revisionList[revid];
			if (obj.revdeled) obj.checkbox.checked = true;
			if (obj.checkbox.checked) cnt++;
		});
		checkedCounterNum.textContent = cnt.toString();
	});
	var buttonUncheckAllDeleted = createButton(buttonsSecondary, 'mrd-uncheckall-deleted', '削除済み版全選択解除');
	buttonUncheckAllDeleted.addEventListener('click', function() {
		var cnt = 0;
		Object.keys(revisionList).forEach(function(revid) {
			var obj = revisionList[revid];
			if (obj.revdeled) obj.checkbox.checked = false;
			if (obj.checkbox.checked) cnt++;
		});
		checkedCounterNum.textContent = cnt.toString();
	});
	var buttonCheckAllNotDeleted = createButton(buttonsSecondary, 'mrd-checkall-notdeleted', '未削除版全選択');
	buttonCheckAllNotDeleted.addEventListener('click', function() {
		var cnt = 0;
		Object.keys(revisionList).forEach(function(revid) {
			var obj = revisionList[revid];
			if (!obj.revdeled) obj.checkbox.checked = true;
			if (obj.checkbox.checked) cnt++;
		});
		checkedCounterNum.textContent = cnt.toString();
	});
	var buttonUncheckAllNotDeleted = createButton(buttonsSecondary, 'mrd-uncheckall-notdeleted', '未削除版全選択解除');
	buttonUncheckAllNotDeleted.addEventListener('click', function() {
		var cnt = 0;
		Object.keys(revisionList).forEach(function(revid) {
			var obj = revisionList[revid];
			if (!obj.revdeled) obj.checkbox.checked = false;
			if (obj.checkbox.checked) cnt++;
		});
		checkedCounterNum.textContent = cnt.toString();
	});

	formBody.appendChild(checkedCounter);

	// Execute button
	var buttonRevDel = createButton(formBody, 'mrd-revdel', '実行');
	buttonRevDel.style.cssText = 'margin-top: 0.5em;';

	var revdelProgress = document.createElement('span');
	revdelProgress.id = 'mrd-revdel-progress';
	revdelProgress.style.cssText = 'display: inline; margin-left: 0.5em;';
	formBody.appendChild(revdelProgress);

	var processMsgTimeout;
	buttonRevDel.addEventListener('click', function() {

		// Get target items to (un)delete
		/** @type {{raw: string[]; show: string[]; hide: string[]; suppress: "no"|"nochange"|"yes";}} */
		var targets = {
			raw: ['content', 'comment', 'user'],
			show: [],
			hide: [],
			// @ts-ignore
			suppress: {show: 'no', hide: 'yes', nochange: 'nochange'}[visLevelOversight.val()]
		};
		[visLevelContent, visLevelComment, visLevelUser].forEach(function(visLevelObj, i) {
			var val = visLevelObj.val();
			if (targets[val]) { // 'show' and 'hide' only
				targets[val].push(targets.raw[i]);
			}
		});

		/**
		 * Object to store the revdel states of revisions before executing this procedure
		 * @type {Prev} revid-object pairs
		 */
		var prev = {};

		/** How many revisions are selected */
		var totalCount = 0;

		/** Whether the visibility status of at least one revision is to be changed */
		var someRevInfoIsToBeChanged = false;

		// Get revids to (un)delete
		/** @typedef {Object.<string, string[]>} Revids pagetitle-revids pairs */
		/** @type {Revids} */
		var revids = Object.keys(revisionList).reduce(/** @param {Revids} acc */ function(acc, revid) {
			var obj = revisionList[revid];
			if (obj.checkbox.checked) {
				totalCount++;
				if (acc[obj.title]) {
					acc[obj.title].push(revid);
				} else {
					acc[obj.title] = [revid];
				}
				var prevObj = {
					suppressed: obj.suppressed,
					texthidden: !obj.date ? false : obj.date.classList.contains(classDeleted), // obj.date is basically never null
					commenthidden: obj.comment.classList.contains(classDeleted),
					userhidden: obj.userhidden.style.display !== 'none',
					current: obj.current
				};
				prev[revid] = prevObj;
				if (!someRevInfoIsToBeChanged) {
					someRevInfoIsToBeChanged = targets[prevObj.texthidden ? 'show' : 'hide'].indexOf('content') !== -1 ||
												targets[prevObj.commenthidden ? 'show' : 'hide'].indexOf('comment') !== -1 ||
												targets[prevObj.userhidden ? 'show' : 'hide'].indexOf('user') !== -1 ||
												targets.suppress === 'yes' && !prevObj.suppressed ||
												targets.suppress === 'no' && prevObj.suppressed;
				}
			}
			return acc;
		}, Object.create(null));
		if (!totalCount) { // No checked box is checked (= no revision selected)
			return alert('版指定削除の対象版が指定されていません');
		}
		if (!someRevInfoIsToBeChanged) { // There'll be no change in revision item visibility
			return alert('指定された新しい閲覧レベルが、選択された版の現在の閲覧レベルと全て同一です (処理を行っても閲覧レベルが変化しません)');
		}

		// Get reason
		var reason = [reason1.value, reason2.value, reasonC.value.trim()].filter(function(el) { return el; }).join(': ');
		if (!reason && !confirm('版指定削除理由が指定されていません。このまま実行しますか？')) {
			return; // No reason is provided and the user has chosen to stop the execution
		}

		// Final confirm
		/** @param {VisStates} revdelType */
		var getRevdelType = function(revdelType) {
			switch (revdelType) {
				case 'nochange':
					return ' (<b>変更なし</b>)';
				case 'show':
					return ' (<b style="color: mediumseagreen;">閲覧可</b>)';
				case 'hide':
					return ' (<b style="color: mediumvioletred;">閲覧不可</b>)';
			}
		};
		/** @type {string[]} */
		var confirmMsg = [];
		confirmMsg.push('計' + totalCount + '版の閲覧レベルを変更します。');
		confirmMsg.push('');
		confirmMsg.push('・版の本文' + getRevdelType(visLevelContent.val()));
		confirmMsg.push('・編集の要約' + getRevdelType(visLevelComment.val()));
		confirmMsg.push('・投稿者の利用者名/IPアドレス' + getRevdelType(visLevelUser.val()));
		confirmMsg.push('');
		confirmMsg.push('よろしいですか？');

		var self = this;
		/** @type {JQuery<HTMLDivElement>} */
		var $confirmDialog = $('<div><p>' + confirmMsg.join('<br>') + '</p></div>');
		dConfirm($confirmDialog).then(function(confirmed) {

			if (!confirmed) {
				mw.notify('処理を中止しました。');
				return;
			}

			// Final prep for revdel
			self.disabled = true; // Make the execution button unclickable
			Object.keys(revisionList).forEach(function(revid) {
				var obj = revisionList[revid];
				obj.checkbox.disabled = true; // Same for all the checkboxes
				obj.label.style.display = 'none'; // And revdel links
				obj.pseudolabel.style.display = 'inline'; // Temporarily show the pseudo-label
				obj.progress.innerHTML = '';
				if (obj.checkbox.checked) {
					obj.progress.appendChild(getIcon('doing'));
					obj.progress.style.display = 'inline';
				}
			});
			clearTimeout(processMsgTimeout);
			revdelProgress.innerHTML = '';
			revdelProgress.appendChild(getIcon('doing'));
			revdelProgress.appendChild(document.createTextNode(' 処理中'));

			// Create parameters for action=revisiondelete
			/** @type {ApiParamsRevisionDeleteFragment} */
			var defaultParams = {
				action: 'revisiondelete',
				type: 'revision',
				reason: reason,
				show: targets.show.join('|'),
				hide: targets.hide.join('|'),
				suppress: targets.suppress,
				tags: mw.config.get('wgDBname') === 'testwiki' ? 'testtag' : MRD + '|DevScript',
				formatversion: '2'
			};

			// Send API requests (per page)
			var deferreds = [];
			var req = debuggingMode ? dev : revdel;
			Object.keys(revids).forEach(function(pagetitle) {
				var ids = revids[pagetitle].slice(); // Deep copy
				while (ids.length) {
					var params = $.extend({target: pagetitle, ids: ids.splice(0, apilimit).join('|')}, defaultParams);
					deferreds.push(req(params, prev));
				}
			});

			$.when.apply($, deferreds).then(function() { // When all done

				// Merge the results to one object
				/** @type {ApiResultRevisionDelete} */
				var res = {};
				var args = arguments;
				for (var i = 0; i < args.length; i++) {
					$.extend(res, args[i]);
				}
				console.log(MRD, res);

				// Reflect the results to the DOM
				var summaryShown = false;
				var someRevisionDeleted = false;
				var successCount = 0;
				Object.keys(revisionList).forEach(function(revid) {

					var revisionListObj = revisionList[revid];
					revisionListObj.checkbox.disabled = false; // Get checkbox back to a clickable state
					revisionListObj.label.style.display = 'inline'; // Show label
					revisionListObj.pseudolabel.style.display = 'none'; // Hide pseudo-label

					var resObj = res[revid];
					if (resObj) { // Just in case ensure that the response object has this revid as a key
						revisionListObj.progress.innerHTML = '';
						if (resObj.errors) { // On failure
							revisionListObj.progress.appendChild(getIcon('failed'));
							var errMsg = document.createElement('span');
							errMsg.style.color = 'mediumvioletred';
							errMsg.textContent = ' (' + resObj.errors + ')';
							revisionListObj.progress.appendChild(errMsg);
						} else { // On success
							successCount++;
							if (!summaryShown && resObj.commenthidden === false) summaryShown = true;
							revisionListObj.revdeled = resObj.texthidden || resObj.commenthidden || resObj.userhidden || resObj.suppressed;
							revisionListObj.suppressed = resObj.suppressed;
							revisionListObj.progress.appendChild(getIcon('done'));
							// Update the DOM to display the show/hide results without reloading the page
							revisionListObj.date = toggleContentVisibility(revisionListObj, resObj);
							revisionListObj.comment = toggleCommentVisibility(revisionListObj, resObj);
							toggleUsernameVisibility(revisionListObj, resObj);
						}
					}
					if (!someRevisionDeleted && revisionListObj.revdeled) {
						someRevisionDeleted = true;
					}

				});

				// Trigger hook if edit summaries are replaced (event listners are gone; things like NavPopups won't work without this)
				if (summaryShown) {
					var content = document.querySelector('.mw-body-primary') ||
									document.querySelector('.mw-body') ||
									document.querySelector('#mw-content-text') ||
									document.body;
					mw.hook('wikipage.content').fire($(content));
				}

				// Show 'done' on the main form
				self.disabled = false;
				buttonsSecondary.style.display = someRevisionDeleted ? 'block' : 'none';
				revdelProgress.innerHTML = '';
				revdelProgress.appendChild(getIcon('done'));
				revdelProgress.appendChild(document.createTextNode(' 処理が完了しました (' + successCount + '/' + totalCount + ')'));
				processMsgTimeout = setTimeout(function() {
					revdelProgress.innerHTML = '';
				}, 10000);

			});

		});

	});

	// Append the form to the DOM
	$contribsList.eq(0).before(revdelForm);

	// Get revdel reason dropdown
	getDeleteReasonDropdown().then(function(dropdown) {
		if (!dropdown) return alert(MRD + '\n削除理由の取得に失敗しました。');
		reasonFetched = true;
		[reason1, reason2].forEach(function(el) {
			el.innerHTML = dropdown.innerHTML;
		});
	});

}

/**
 * Get edit summaries in an HTML format from revision IDs.
 * Note: This function does not fetch parsed comments of the revisions of deleted pages (which is done by 'prop=deletedrevisions').
 * Such a functionality is just unneeded because on [[Special:DeletedContributions]], parsed comments are struck through but visible.
 * @param {string[]} revids
 * @returns {JQueryPromise<Object.<string, string>>}
 */
function getParsedComment(revids) {

	if (!revids.length) return $.Deferred().resolve({});

	/**
	 * @param {string[]} revidsArr
	 * @returns {JQueryPromise<Object.<string, string>>}
	 */
	var query = function(revidsArr) {
		return api.post({ // POST request just in case to prevent 404 (URL too long)
			action: 'query',
			revids: revidsArr.join('|'),
			prop: 'revisions',
			rvprop: 'ids|parsedcomment',
			formatversion: '2'
		}).then(function(res) {
			var resPages;
			if (res && res.query && (resPages = res.query.pages) && resPages.length) {
				return resPages.reduce(/** @param {Object.<string, string>} acc */ function(acc, obj) {
					(obj.revisions || []).forEach(function(revObj) {
						var parsedcomment = revObj.parsedcomment;
						if (typeof parsedcomment === 'string') {
							var revid = revObj.revid.toString();
							acc[revid] = parsedcomment;
						}
					});
					return acc;
				}, Object.create(null));
			} else {
				return {};
			}
		}).catch(function(code, err) {
			console.log(MRD, err);
			return {};
		});
	};

	var deferreds = [];
	revids = revids.slice();
	while (revids.length) {
		deferreds.push(query(revids.splice(0, apilimit)));
	}
	return $.when.apply($, deferreds).then(function() {
		var args = arguments;
		var ret = {};
		for (var i = 0; i < args.length; i++) {
			$.extend(ret, args[i]);
		}
		return ret;
	});

}

/**
 * Create a dropdown with a label on its left. Default CSS for the dropdown: 'display: inline-block; width: 6ch;'
 * @param {HTMLElement} appendTo
 * @param {string} id
 * @param {string} labelText
 * @param {{labelCss?: string; dropdownCss?: string; appendBr?: boolean;}} [options]
 * @returns {HTMLSelectElement}
 */
function createLabeledDropdown(appendTo, id, labelText, options) {

	options = options || {};
	if (options.appendBr) appendTo.appendChild(document.createElement('br'));

	var label = document.createElement('label');
	label.htmlFor = id;
	label.textContent = labelText;
	label.style.cssText = 'display: inline-block; width: 6ch;';
	if (options.labelCss) parseAndApplyCssText(label, options.labelCss);
	appendTo.appendChild(label);

	var dropdown = document.createElement('select');
	dropdown.id = id;
	if (options.dropdownCss) dropdown.style.cssText = options.dropdownCss;
	appendTo.appendChild(dropdown);

	return dropdown;

}

/**
 * Create a textbox with a label on its left. Default CSS for the textbox: 'display: inline-block; width: 6ch;'
 * @param {HTMLElement} appendTo
 * @param {string} id
 * @param {string} labelText
 * @param {{labelCss?: string; textboxCss?: string; appendBr?: boolean;}} [options]
 * @returns {HTMLInputElement}
 */
function createLabeledTextbox(appendTo, id, labelText, options) {

	options = options || {};
	if (options.appendBr) appendTo.appendChild(document.createElement('br'));

	var label = document.createElement('label');
	label.htmlFor = id;
	label.textContent = labelText;
	label.style.cssText = 'display: inline-block; width: 6ch;';
	if (options.labelCss) parseAndApplyCssText(label, options.labelCss);
	appendTo.appendChild(label);

	var textbox = document.createElement('input');
	textbox.type = 'text';
	textbox.id = id;
	if (options.textboxCss) textbox.style.cssText = options.textboxCss;
	appendTo.appendChild(textbox);

	return textbox;

}

/**
 * @param {HTMLElement} appendTo
 * @param {string} id
 * @param {string} label
 * @param {{buttonCss?: string;}} [options]
 * @returns {HTMLInputElement}
 */
function createButton(appendTo, id, label, options) {
	options = options || {};
	var button = document.createElement('input');
	button.type = 'button';
	if (id) button.id = id;
	button.value = label;
	if (options.buttonCss) button.style.cssText = options.buttonCss;
	appendTo.appendChild(button);
	return button;
}

/**
 * Parse cssText ('property: value;') recursively and apply the styles to a given element.
 * @param {HTMLElement} element
 * @param {string} cssText
 */
function parseAndApplyCssText(element, cssText) {
	var regex = /(\S+?)\s*:\s*(\S+?)\s*;/g;
	var m;
	while ((m = regex.exec(cssText))) {
		element.style[m[1]] = m[2];
	}
}

/**
 * An alternative to window.confirm, by a dialog.
 * @param {JQuery<HTMLDivElement>} $dialog
 * @returns {JQueryPromise<boolean>}
 */
function dConfirm($dialog) {
	var def = $.Deferred();
	var bool = false;
	$dialog.prop('title', MRD + ' - Confirm');
	$dialog.dialog({
		resizable: false,
		height: 'auto',
		width: 'auto',
		minWidth: 500,
		modal: true,
		position: {
			my: 'center',
			at: 'center',
			of: window
		},
		buttons: [
			{
				text: 'はい',
				click: function() {
					bool = true;
					$(this).dialog('close');
				}
			},
			{
				text: 'いいえ',
				click: function() {
					$(this).dialog('close');
				}
			}
		],
		close: function() {
			def.resolve(bool);
			$dialog.dialog('destroy').remove();
		}
	});
	return def.promise();
}

/**
 * Get a loading/check/cross image tag.
 * @param {"doing"|"done"|"failed"} iconType
 * @returns {HTMLImageElement}
 */
function getIcon(iconType) {
	var img = document.createElement('img');
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
 * @typedef ApiParamsRevisionDeleteFragment
 * @type {object}
 * @property {"revisiondelete"} action
 * @property {"archive"|"filearchive"|"logging"|"oldimage"|"revision"} type
 * @property {string} hide Values (separate with "|"): comment, content, user
 * @property {string} show Values (separate with "|"): comment, content, user
 * @property {"no"|"nochange"|"yes"} suppress Default: nochange
 * @property {string} reason
 * @property {string} tags
 * @property {"2"} formatversion
 */
/**
 * @typedef ApiParamsRevisionDeleteRest
 * @type {object}
 * @property {string} target Pagetitle
 * @property {string} ids Pipe-separated revision IDs
 */
/**
 * @typedef ApiParamsRevisionDelete
 * @type {ApiParamsRevisionDeleteFragment & ApiParamsRevisionDeleteRest}
 */
/**
 * @typedef ApiResultRevisionDeleteItem
 * @type {object}
 * @property {boolean} suppressed
 * @property {boolean} texthidden
 * @property {boolean} commenthidden
 * @property {boolean} userhidden
 * @property {string} errors
 */
/**
 * @typedef ApiResultRevisionDelete
 * @type {Object.<string, ApiResultRevisionDeleteItem>} revid-object pairs
 */
/**
 * @typedef Prev
 * @type {Object.<string, {suppressed: boolean; texthidden: boolean; commenthidden: boolean; userhidden: boolean; current: boolean;}>} revid-object pairs
 */

/**
 * Execute revision delete.
 * @param {ApiParamsRevisionDelete} params
 * @param {Prev} prev
 * @returns {JQueryPromise<ApiResultRevisionDelete>}
 */
function revdel(params, prev) {

	var revids = params.ids.split('|');
	return api.postWithToken('csrf', params)
		.then(function(res) {

			var resItems;
			if (res && res.revisiondelete && (resItems = res.revisiondelete.items) && resItems.length) {

				return resItems.reduce(/** @param {ApiResultRevisionDelete} acc */ function(acc, obj) {

					/** @type {string[]} */
					var err = [];
					var revid = obj.id.toString();
					if (obj.errors) { // Get error codes if there's any
						err = obj.errors.reduce(function(errAcc, errObj) {
							if (errObj.type === 'error' && errAcc.indexOf(errObj.code) === -1) {
								errAcc.push(errObj.code);
							}
							return errAcc;
						}, err);
					}
					acc[revid] = {
						suppressed: params.suppress === 'yes' || params.suppress === 'nochange' && prev[revid].suppressed,
						texthidden: obj.texthidden,
						commenthidden: obj.commenthidden,
						userhidden: obj.userhidden,
						errors: err.join(', ')
					};
					return acc;

				}, Object.create(null));

			} else {
				return _createRevdelErrorObject(revids, 'unknown', prev);
			}

		}).catch(function(code, err) {
			console.error(MRD, err);
			return _createRevdelErrorObject(revids, code, prev);
		});

}

/**
 * Create a return object for revdel() by assigning the same error code to all the passed revision IDs.
 * @param {string[]} revids
 * @param {string} code
 * @param {Prev} prev
 * @returns {ApiResultRevisionDelete}
 * @private
 */
function _createRevdelErrorObject(revids, code, prev) {
	return revids.reduce(/** @param {ApiResultRevisionDelete} acc */ function(acc, revid) {
		acc[revid] = {
			suppressed: prev[revid].suppressed,
			texthidden: prev[revid].texthidden,
			commenthidden: prev[revid].commenthidden,
			userhidden: prev[revid].userhidden,
			errors: code
		};
		return acc;
	}, Object.create(null));
}

/**
 * Debugging alternant of revdel(). Return the same kind of object without executing revision (un)deletion.
 * @param {ApiParamsRevisionDelete} params
 * @param {Prev} prev
 * @returns {JQueryPromise<ApiResultRevisionDelete>}
 */
function dev(params, prev) {

	var def = $.Deferred();
	var targets = {
		show: params.show.split('|'),
		hide: params.hide.split('|')
	};

	/** @type {ApiResultRevisionDelete} */
	var ret = params.ids.split('|').reduce(/** @param {ApiResultRevisionDelete} acc */ function(acc, revid) {
		if (targets.hide.indexOf('content') !== -1 && prev[revid].current) {
			$.extend(acc, _createRevdelErrorObject([revid], 'revdelete-hide-current', prev));
		} else {
			acc[revid] = {
				suppressed: params.suppress === 'yes' || params.suppress === 'nochange' && prev[revid].suppressed,
				texthidden: targets.hide.indexOf('content') !== -1 ? true : targets.show.indexOf('content') !== -1 ? false : prev[revid].texthidden,
				commenthidden: targets.hide.indexOf('comment') !== -1 ? true : targets.show.indexOf('comment') !== -1 ? false : prev[revid].commenthidden,
				userhidden: targets.hide.indexOf('user') !== -1 ? true : targets.show.indexOf('user') !== -1 ? false : prev[revid].userhidden,
				errors : ''
			};
		}
		return acc;
	}, Object.create(null));
	setTimeout(function() {
		def.resolve(ret);
	}, 1000);

	return def.promise();

}

/**
 * @typedef RevisionListItem
 * @type {object}
 * @property {HTMLSpanElement} progress Wrapper to show revdel progress by an icon
 * @property {HTMLInputElement} checkbox
 * @property {HTMLSpanElement} label The 'change visibility' link that works as the label of the checkbox
 * @property {HTMLSpanElement} pseudolabel An alternative 'change visibility' label that cannot be clicked
 * @property {HTMLSpanElement|HTMLAnchorElement|null} date PermaLink to revision with a date text
 * @property {string} title
 * @property {HTMLSpanElement} comment Edit summary wrapper
 * @property {string} parsedcomment Edit summary in an HTML format
 * @property {HTMLElement} userhidden A (hidden) \<strong> tag storing a warning message for revdel'd username
 * @property {boolean} revdeled Whether some item of the revision is deleted
 * @property {boolean} suppressed Whether some item of the revision is oversighted
 * @property {boolean} current Whether this is the current revision
 */
/**
 * @typedef RevisionList
 * @type {Object.<string, RevisionListItem>} revid-object pairs
 */

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
 * @param {RevisionListItem} reivisionListItem
 * @param {ApiResultRevisionDeleteItem} revdelResult
 * @return {HTMLSpanElement|HTMLAnchorElement|null} The input tag must be updated with this returned tag.
 */
function toggleContentVisibility(reivisionListItem, revdelResult) {

	var dateSpanchor = reivisionListItem.date;
	if (dateSpanchor == null) return null;
	var alreadyDeleted = dateSpanchor.tagName === 'SPAN';

	if (revdelResult.texthidden) { // Deleted

		if (alreadyDeleted) {

			// #2 => #2
			// The date link is already a span tag. This means that the content of this revision had already been hidden
			// before the current revdel execution. We just need to modify the class list of the tag.
			console.log(MRD, 'content1');
			if (revdelResult.suppressed) {
				dateSpanchor.classList.add(classSuppressed);
			} else {
				dateSpanchor.classList.remove(classSuppressed);
			}
			return dateSpanchor;

		} else {

			// #1 => #2
			// The date link is a bare anchor tag (newly revision-deleted): wrap this tag with span.
			console.log(MRD, 'content2');
			var wrapper = document.createElement('span');
			wrapper.classList.add(classDeleted);
			if (revdelResult.suppressed) wrapper.classList.add(classSuppressed);
			// @ts-ignore
			dateSpanchor.parentElement.insertBefore(wrapper, dateSpanchor); // Insert the new span tag before the anchor
			wrapper.appendChild(dateSpanchor); // Move the anchor into the span tag

			// Final note: outerHTML strategies should be avoided because that would destroy event listners of the date link, if there's any.

			return wrapper;

		}

	} else { // Undeleted

		if (alreadyDeleted) {

			// #2 => #1
			// Deleted content has been undeleted: remove span wrapper.
			console.log(MRD, 'content3');
			/** @type {HTMLAnchorElement} */
			// @ts-ignore This should never be null, as documented above
			var a = dateSpanchor.querySelector('a.mw-changeslist-date');
			// @ts-ignore
			dateSpanchor.parentElement.insertBefore(a, dateSpanchor); // Move the anchor out of the span and make it the preceding sibling
			dateSpanchor.remove(); // Remove wrapper span
			return a;

		} else {

			// #1 => #1
			// Content not hidden before and after the execution (no need to do anything).
			console.log(MRD, 'content4');
			return dateSpanchor;

		}

	}

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
 *  // Normal comment (same as #1)
 *  <span class="comment comment--without-parentheses">Some comment</span>
 *  // Deleted comment
 *  <span class="history-deleted comment">
 *      <span class="comment comment--without-parentheses">Some comment</span>
 *  </span>
 * ```
 * Note that when the comment is an empty string, there IS a span tag for comment with the 'mw-comment-none' class added
 * to pattern #1 on [[Special:Contributions]], but the tag is entirely missing on [[Special:DeletedContributions]]. This
 * script internally creates a comment element in createForm() if missing, so there's no problem.
 * @param {RevisionListItem} revisionListItem
 * @param {ApiResultRevisionDeleteItem} revdelResult
 * @returns {HTMLSpanElement}
 */
function toggleCommentVisibility(revisionListItem, revdelResult) {

	var commentSpan = revisionListItem.comment;
	var parsedComment = revisionListItem.parsedcomment;
	var alreadyDeleted = commentSpan.classList.contains(classDeleted) || commentSpan.classList.contains(classSuppressed);
	var classComment = 'comment';
	var classNoComment = 'mw-comment-none';
	var classNoParentheses = 'comment--without-parentheses';
	/** @type {HTMLSpanElement|null} */
	var innerComment = commentSpan.querySelector('.' + classComment);

	if (revdelResult.commenthidden) { // Deleted

		if (alreadyDeleted) {

			// #2/#4 => #2/#4 (class modification only)
			console.log(MRD, 'comment1');
			if (revdelResult.suppressed) {
				commentSpan.classList.add(classSuppressed);
			} else {
				commentSpan.classList.remove(classSuppressed);
			}
			if (innerComment) {
				if (isDeletedContribs) {
					innerComment.classList.add(classNoParentheses);
				} else {
					innerComment.classList.remove(classNoParentheses);
				}
			}
			return commentSpan;

		} else {

			// #1/#3 => #2/#4 (wrap with another span)
			console.log(MRD, 'comment2');
			if (isDeletedContribs) {
				commentSpan.classList.add(classNoParentheses);
			} else {
				commentSpan.classList.remove(classNoParentheses);
				commentSpan.innerHTML = msg['rev-deleted-comment'];
			}
			commentSpan.classList.remove(classNoComment); // When deleted, the inner span of #2/#4 should never have this class

			var wrapper = document.createElement('span');
			wrapper.classList.add(classComment);
			wrapper.classList.add(classDeleted);
			if (revdelResult.suppressed) wrapper.classList.add(classSuppressed);
			// @ts-ignore
			commentSpan.parentElement.insertBefore(wrapper, commentSpan); // Insert wrapper right before the comment span
			wrapper.appendChild(commentSpan); // Move the comment span inside wrapper

			return wrapper;

		}

	} else { // Undeleted

		if (alreadyDeleted) {

			// #2/#4 => #1/#3 (remove wrapper span)
			console.log(MRD, 'comment3');
			var inner;
			if (innerComment) {
				innerComment.innerHTML = parsedComment;
				inner = innerComment;
			} else {
				inner = document.createElement('span');
				inner.classList.add(classComment);
				inner.innerHTML = parsedComment;
			}
			if (inner.innerHTML === '' || inner.innerHTML === msg['changeslist-nocomment']) { // in case the comment is an empty string
				inner.classList.add(classNoComment);
			} else {
				inner.classList.add(classNoParentheses);
			}
			// @ts-ignore
			commentSpan.parentElement.insertBefore(inner, commentSpan); // Move the inner span out of and immediately before wrapper
			commentSpan.remove(); // Remove wrapper
			return inner;

		} else {

			// #1/#3 => #1/#3 (do nothing)
			console.log(MRD, 'comment4');
			return commentSpan;

		}
	}

}

/**
 * Toggle the revdel status of a username.
 * @param {RevisionListItem} revisionListItem
 * @param {ApiResultRevisionDeleteItem} revdelResult
 */
function toggleUsernameVisibility(revisionListItem, revdelResult) {
	revisionListItem.userhidden.style.display = revdelResult.userhidden ? 'inline' : 'none';
}

/**
 * Get a dropdown for revision-delete reasons. (Note: this function presumes that the interface is an HTMLUList equivalent
 * indented only by asterisks.
 * @returns {JQueryPromise<HTMLSelectElement|null>}
 */
function getDeleteReasonDropdown() {

	var interfaceName = 'revdelete-reason-dropdown';
	return getMessages([interfaceName]).then(function(res) {

		var reasons = res[interfaceName];
		if (typeof reasons !== 'string') return null;

		var wrapper = document.createElement('select');
		wrapper.innerHTML =
			'<optgroup label="その他の理由">' +
				'<option value="">その他の理由</option>' +
			'</optgroup>';

		var regex = /(\*+)([^*]+)/g;
		var m, optgroup;
		while ((m = regex.exec(reasons))) {
			if (m[1].length === 1) {
				optgroup = document.createElement('optgroup');
				optgroup.label = m[2].trim();
				wrapper.appendChild(optgroup);
			} else {
				var opt = document.createElement('option');
				opt.textContent = m[2].trim();
				if (optgroup) {
					optgroup.appendChild(opt);
				} else {
					wrapper.appendChild(opt);
				}
			}
		}
		return wrapper;

	});

}

// ****************************************************************************

})();
//</nowiki>
