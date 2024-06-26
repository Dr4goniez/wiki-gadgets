/********************************************************************************************************\

	MassProtect

	Protect multiple pages at one fell swoop. This script creates a special page interface on:
		* [[Special:MassProtect]]
		* [[Special:MP]]
		* [[Special:一括保護]]
	A portlet link to [[Special:MassProtect]] is added to the toolbox if the current page is none of
	the above. If the debugging mode is on, the page path is changed to [[Special:MPD]] so that the
	developer does not need to disable the official version of this script in the user preferences.

	@link https://ja.wikipedia.org/wiki/Help:MassProtect
	@author [[User:Dragoniez]]

\********************************************************************************************************/

// @ts-check
/* global mw */
/* eslint-disable @typescript-eslint/no-this-alias */
//<nowiki>
(function() { // Container IIFE

// *************************************************** INITIALIZATION ***************************************************

/** @readonly */
var MP = 'MassProtect';

/**
 * When enabled, the path of the special page is changed.
 * @readonly
 */
var debuggingMode = false;

// Check user rights
var userRights = {
	protect: ['sysop', 'global-interface-editor', 'global-sysop', 'new-wikis-importer', 'staff', 'steward'],
	apihighlimits: ['sysop', 'apihighlimits-requestor', 'global-sysop', 'staff', 'steward', 'sysadmin', 'wmf-researcher']
};
var canProtect = false;
var hasApiHighLimits = false;
// @ts-ignore
mw.config.get('wgUserGroups').concat(mw.config.get('wgGlobalGroups')).some(function(group) {
	if (!canProtect) {
		canProtect = userRights.protect.indexOf(group) !== -1;
	}
	if (!hasApiHighLimits) { // Bots excluded
		hasApiHighLimits = userRights.apihighlimits.indexOf(group) !== -1;
	}
	return canProtect && hasApiHighLimits; // Get out of the loop when all entries have become true
});

/** @readonly */
var apilimit = hasApiHighLimits ? 500 : 50;

/** @readonly */
var optionName = 'userjs-mp-targetpages';

/** @type {mw.Api} @readonly */
var api;

// Entry point
$.when(
	mw.loader.using(['mediawiki.api', 'mediawiki.util', 'mediawiki.user', 'mediawiki.Title', 'jquery.ui']),
	$.ready
).then(function() { // When dependent modules and the DOM are loaded

	api = new mw.Api();

	// Create an interface on Special:MassProtect, or else create a portlet link to the special page
	var titleRegex = debuggingMode ? /^mpd$/i : /^(massprotect|mp|一括保護)$/i;
	var titlePath = debuggingMode ? 'Special:MPD' : 'Special:MassProtect';
	if (mw.config.get('wgNamespaceNumber') === -1 && titleRegex.test(mw.config.get('wgTitle'))) {

		document.title = '一括保護 - Wikipedia';

		if (canProtect) {
			createInterface();
		} else {
			showUserRightError();
		}

	} else {
		mw.util.addPortletLink(
			'p-tb',
			mw.util.getUrl(titlePath),
			'一括保護',
			't-mp',
			'ページを一括で保護する'
		);
	}

});

// *************************************************** MAIN FUNCTIONS ***************************************************

/** Create the MassProtect interface. */
function createInterface() {

	// style tag
	var style = document.createElement('style');
	style.textContent =
		// General
		'#mp-container legend {' +
			'font-weight: bold;' +
		'}' +
		'#mp-container fieldset {' +
			'border-color: #a2a9b1;' +
		'}' +
		'#mp-container input[type="text"],' +
		'#mp-container textarea,' +
		'#mp-container select {' +
			'box-sizing: border-box;' +
		'}' +
		'.mp-forcehidden {' +
			'display: none !important;' +
		'}' +
		// Tab switcher
		'#mp-targets-tab {' +
			'display: flex;' +
			'flex-wrap: wrap;' +
		'}' +
		'#mp-targets-tab > input[type="radio"] {' +
			'display: none;' +
		'}' +
		'#mp-targets-tab > label {' +
			'padding: 0.3em 0.5em;' +
			'cursor: pointer;' +
			'width: 8em;' +
			'background-color: lightgray;' +
			'border: 1px solid #a2a9b1;' +
			'text-align: center;' +
		'}' +
		'#mp-targets-tab > label:not(:first-child) {' +
			'border-left: none;' +
		'}' +
		'#mp-targets-tab > div {' +
			'order: 1;' +
			'width: 100%;' +
			'display: none;' +
			'margin-top: 0.5em;' +
		'}' +
		'#mp-targets-tab > input[type="radio"]:checked+label {' +
			'background-color: deepskyblue;' +
		'}' +
		'#mp-targets-tab > input[type="radio"]:disabled+label {' +
			'text-decoration: line-through;' +
			'color: rgba(0,0,0,0.4);' +
		'}' +
		'#mp-targets-tab > input[type="radio"]:checked+label+div {' +
			'display: initial;' +
		'}' +
		// Pagetitle fetcher's mode switcher
		'.mp-targets-fetcher-settings {' +
			'display: none;' +
		'}' +
		'#mp-targets-fetcher-mode[data-chosen="テンプレート"]+div {' +
			'display: block;' +
		'}' +
		'#mp-targets-fetcher-mode[data-chosen="カテゴリ"]+div+div {' +
			'display: block;' +
		'}' +
		'#mp-targets-fetcher-mode[data-chosen="投稿記録"]+div+div+div {' +
			'display: block;' +
		'}' +
		'#mp-targets-fetcher-mode[data-chosen="リンク選択"]+div+div+div+div {' +
			'display: block;' +
		'}' +
		// Fetchet contribs - Numeral input toggle
		'#mp-targets-fetcher-contribs-intersect-count {' +
			'display: none;' +
		'}' +
		'#mp-targets-fetcher-contribs-intersect:checked + label + #mp-targets-fetcher-contribs-intersect-count {' +
			'display: inline;' +
		'}' +
		// Link selector dialog
		'.mp-targets-fetcher-linkselector-dialog-invalidlink {' +
			'color: #64af70 !important;' +
		'}' +
		'.mp-targets-fetcher-linkselector-dialog-selectedlink {' +
			'background-color: orange;' +
		'}' +
		// jQuery UI toolip (line breaks by '\n')
		'.mp-tooltip {' +
			'white-space: pre-line;' +
		'}' +
		// Show/hide toggle for watchlist expiry dropdown
		'#mp-settings-watch-expiry-container {' +
			'display: none;' +
		'}' +
		'#mp-settings-watch:checked + label + #mp-settings-watch-expiry-container {' +
			'display: block;' +
		'}' +
		// Show/hide toggle for Pp selectors
		'#mp-settings-addpp-selector {' +
			'display: none;' +
		'}' +
		'#mp-settings-addpp:checked ~ #mp-settings-addpp-selector {' +
			'display: block;' +
		'}' +
		// Show/hide toggle for the confirm-to-unprotect checkbox
		'#mp-settings-confirmtounprotect-container {' +
			'display: none;' +
		'}' +
		'#mp-settings-confirmtooverwrite:checked ~ #mp-settings-confirmtounprotect-container {' +
			'display: block;' +
		'}';
	document.head.appendChild(style);

	// The form
	var container = document.createElement('div');
	container.id = 'mp-container';
	container.innerHTML =
		'<div id="mp-policy">' +
			'<p>' +
				'指定されたページ群の保護レベルを一括変更できます。変更する場合は、' +
				'<a href="' + mw.util.getUrl('Wikipedia:保護の方針') + '" title="Wikipedia:保護の方針">保護の方針</a>、' +
				'<a href="' + mw.util.getUrl('Wikipedia:拡張半保護の方針') + '" title="Wikipedia:拡張半保護の方針">拡張半保護の方針</a>、' +
				'<a href="' + mw.util.getUrl('Wikipedia:半保護の方針') + '" title="Wikipedia:半保護の方針">半保護の方針</a>、' +
				'に基づいているか確認して下さい。' +
			'</p>' +
			'<ul>' +
				'<li>有効期限のデフォルトは無期限です。適切な期間・期限を指定してください。</li>' +
				'<ul>' +
					'<li>' +
						'「その他の期間」の記入例 (' +
						'<a href="http://www.gnu.org/software/tar/manual/html_node/Date-input-formats.html">GNU標準フォーマット</a>' +
						'): "12 hours"、"5 days"、"3 weeks"、"2012-09-25 20:00"' +
						' (日時は<a href="' + mw.util.getUrl('協定世界時') + '" title="協定世界時">UTC</a>)' +
					'</li>' +
				'</ul>' +
				'<li>' +
					'保護レベルを変更した場合、ページ上で保護テンプレート (' +
					'<a href="' + mw.util.getUrl('Template:Pp') + '">Template:Pp</a>' +
					') を更新してください。' +
				'</li>' +
			'</ul>' +
		'</div>';
	replaceContent(container, '一括保護');

	/**
	 * Enable/disable select, input, and textarea elements in the mp-container.
	 * @param {boolean} disable
	 */
	var toggleDisableAttributes = function(disable) {
		Array.prototype.forEach.call(container.querySelectorAll('select, input, textarea'),
			/** @param {HTMLSelectElement|HTMLInputElement|HTMLTextAreaElement} el */
			function(el) {
				// Originally disabled elements shouldn't be enabled
				if (disable) {
					if (el.disabled) { // If originally disabled
						el.dataset.disabled = '1'; // Set a temporary data attribute
					} else {
						el.disabled = true;
					}
				} else {
					if (el.dataset.disabled === '1') { // Don't enable if originally disabled
						el.dataset.disabled = '0';
					} else {
						el.disabled = false;
					}
				}
			}
		);
	};

	// Field for protection targets
	var tgtWrapper = document.createElement('fieldset');
	tgtWrapper.id = 'mp-targets';
	tgtWrapper.innerHTML = '<legend>対象ページ</legend>';
	container.appendChild(tgtWrapper);

	// Field for protection targets - Tab container
	var tgtTab = document.createElement('div');
	tgtTab.id = 'mp-targets-tab';
	tgtWrapper.appendChild(tgtTab);

	var tabCnt = 0;
	/**
	 * Create elements for a new tab and append them to the tab container.
	 * ```
	 * <input id="mp-targets-tabN" type="radio" name="tab">
	 * <label for="mp-targets-tabN">labelText</label>
	 * <div></div>
	 * ```
	 * @param {string} labelText
	 * @param {string} contentId
	 * @returns {{radio: HTMLInputElement; label: HTMLLabelElement; content: HTMLDivElement;}}
	 */
	var createTab = function(labelText, contentId) {

		var id = 'mp-targets-tab' + (++tabCnt);

		var radio = document.createElement('input');
		radio.type = 'radio';
		if (tabCnt === 1) radio.checked = true;
		radio.name = 'tab';
		radio.id = id;
		tgtTab.appendChild(radio);

		var label = document.createElement('label');
		label.htmlFor = id;
		label.textContent = labelText;
		tgtTab.appendChild(label);

		var content = document.createElement('div');
		content.id = contentId;
		tgtTab.appendChild(content);

		return {radio: radio, label: label, content: content};

	};

	// Field for protection targets - Textbox tab
	var tgtTab1 = createTab('入力フィールド', 'mp-targets-input');
	var tgtInput = document.createElement('textarea');
	tgtInput.style.cssText = 'width: 100%; font-family: inherit; padding: 0.3em;';
	tgtInput.rows = 20;
	tgtInput.placeholder = 'ページ名ごとに改行';
	tgtTab1.content.appendChild(tgtInput);

	/**
	 * @typedef TitleConfig
	 * @type {object} Only one config can be specified on one function call.
	 * @property {string[]} [add] Add these titles.
	 * @property {string[]} [remove] Remove these titles.
	 * @property {string[]} [replace] Replace with these titles.
	 */
	/**
	 * @typedef Pg
	 * @type {object}
	 * @property {string[]} titles An array of tidied-up pagetitles (first letter is in uppercase and spaces are represented by underscores).
	 * @property {mw.Title[]} mwTitles
	 */
	/**
	 * Clean up pagetitles in the textbox and return an object containing two arrays of pagetitles.
	 * @param {TitleConfig} [titleConfig]
	 * @returns {Pg}
	 */
	var cleanupPagetitles = function(titleConfig) {

		titleConfig = titleConfig || {};
		var sourceArr = (titleConfig.replace || tgtInput.value.replace(/\u200e/g, '').split('\n')).concat(titleConfig.add || []);
		var pg = sourceArr.reduce(/** @param {Pg} acc */ function(acc, title) {
			try {
				var mwTitle = new mw.Title(title); // Can throw an error
				if (!mwTitle.canHaveTalkPage()) return acc;
				title = mwTitle.getPrefixedDb();
				if (acc.titles.indexOf(title) === -1) { // No duplicates
					if (!(titleConfig && titleConfig.remove && titleConfig.remove.indexOf(title) !== -1)) { // Ignore titles in titleConfig.remove
						acc.titles.push(title);
						acc.mwTitles.push(mwTitle);
					}
				}
			}
			// eslint-disable-next-line no-empty
			catch (err) {}
			return acc;
		}, Object.create({titles: [], mwTitles: []}));

		tgtInput.value = pg.titles.join('\n');
		tgtInputLength.textContent = pg.titles.length.toString(); // tgtInputLength - variable declared below
		return pg;

	};

	var tgtInputCleanup = createButton(tgtTab1.content, 'mp-targets-input-cleanup', '整形', {buttonCss: 'margin: 0.5em 1em 0 0;'});
	tgtInputCleanup.addEventListener('click', function() {
		cleanupPagetitles();
	});

	tgtTab1.content.appendChild(document.createTextNode('ページ数: '));
	var tgtInputLength = document.createElement('span');
	tgtInputLength.id = 'mp-targets-input-length';
	tgtInputLength.textContent = '0';
	tgtTab1.content.appendChild(tgtInputLength);

	// Field for protection targets - List tab
	var tgtTab2 = createTab('リスト表示', 'mp-targets-list');
	var tgtTab2Body = document.createElement('div');
	tgtTab2Body.style.cssText = 'margin: 0; overflow-y: scroll; border: 1px solid #a2a9b1;';
	tgtTab2Body.style.height = tgtInput.offsetHeight + 'px'; // Set this div the same height as that of the textarea
	tgtTab2.content.appendChild(tgtTab2Body);
	var tgtListOl = document.createElement('ol');
	tgtTab2Body.appendChild(tgtListOl);
	var tgtListGetLog = createButton(tgtTab2.content, 'mp-targets-list-protectionlog', '保護記録の詳細を取得', {buttonCss: 'margin: 0.5em 1em 0 0;'});
	var tgtListGetLogProgress = document.createElement('span');
	tgtTab2.content.appendChild(tgtListGetLogProgress);
	var getLogTimeout;
	tgtListGetLog.addEventListener('click', function() {

		toggleDisableAttributes(true);
		clearTimeout(getLogTimeout);
		tgtListGetLogProgress.innerHTML = '';
		tgtListGetLogProgress.appendChild(getIcon('doing'));
		tgtListGetLogProgress.appendChild(document.createTextNode(' 取得中'));

		var pg = cleanupPagetitles();
		getProtectionLogs(pg.titles).then(function(status) {

			Array.prototype.forEach.call(tgtListOl.querySelectorAll('.mp-targets-list-logs'), /** @param {HTMLSpanElement} el */ function(el) {
				var title = el.dataset.title;
				var logObj, display;
				if (title && (logObj = status[title])) {
					display = '保護歴: ' + logObj.previous.count.toString() + '回 ';
					if (!logObj.current) { // Currently not protected
						if (logObj.previous.count) {
							display += '最終保護: ' + logObj.previous.latest.join(', ');
						}
					} else { // Currently protected
						display += '<b>保護中</b>: ' + logObj.current.level.join(', ');
					}
				} else {
					display = '保護記録の詳細が取得できませんでした';
				}
				el.innerHTML = display;
				el.style.display = 'block';
			});

			toggleDisableAttributes(false);
			tgtListGetLogProgress.innerHTML = '';
			tgtListGetLogProgress.appendChild(getIcon('done'));
			tgtListGetLogProgress.appendChild(document.createTextNode(' 取得しました'));
			getLogTimeout = setTimeout(function() {
				tgtListGetLogProgress.innerHTML = '';
			}, 5000);

		});

	});

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

	/**
	 * Create list items in the \<ol> element of the list tab out of pagetitles in the textbox field. When the list is created,
	 * an API request is sent to check whether the listed pages exist and mark missing pages in red.
	 * @param {boolean} protectionPrep If true, hide the expiry dropdown, remove button, and protection log line.
	 * @param {TitleConfig} [titleConfig]
	 * @returns {JQueryPromise<ListObject|undefined>} Returns undefined if no pagetitle can be fetched from the textbox field.
	 */
	var createList = function(protectionPrep, titleConfig) {

		var pg = cleanupPagetitles(titleConfig);
		if (!pg.mwTitles.length) return $.Deferred().resolve(undefined);
		tgtListOl.innerHTML = '';

		/** @type {Object.<string, HTMLAnchorElement[]>} */
		var anchors = {};

		var progressObj = pg.mwTitles.reduce(/** @param {Progress} acc */ function(acc, Title) {

			var title = Title.getPrefixedDb();

			/** @type {ProgressObjVal} */
			var progressObjVal;
			if (progressStorage[title]) { // If list item for this title has already been created, use it

				progressObjVal = progressStorage[title];

			} else { // Or else create a new list item

				var li = document.createElement('li');
				li.style.marginBottom = '0.2em';

				var titleLink = document.createElement('a');
				titleLink.href = mw.util.getUrl(title, {redirect: 'no'});
				titleLink.classList.add('mp-targets-list-itemtitle');
				titleLink.target = '_blank';
				titleLink.textContent = title;
				titleLink.dataset.title = title;
				li.appendChild(titleLink);
				li.appendChild(document.createTextNode(' ('));

				var relPageLink = document.createElement('a');
				/** @type {string} */
				var relPageTitle;
				if (Title.isTalkPage()) {
					// @ts-ignore
					relPageTitle = Title.getSubjectPage().getPrefixedDb();
					relPageLink.textContent = 'メイン';
				} else {
					// @ts-ignore
					relPageTitle = Title.getTalkPage().getPrefixedDb();
					relPageLink.textContent = 'ノート';
				}
				relPageLink.href = mw.util.getUrl(relPageTitle, {redirect: 'no'});
				relPageLink.target = '_blank';
				relPageLink.dataset.title = relPageTitle;
				li.appendChild(relPageLink);
				li.appendChild(document.createTextNode(' | '));

				var historyLink = document.createElement('a');
				historyLink.href = mw.util.getUrl(title, {action: 'history'});
				historyLink.target = '_blank';
				historyLink.textContent = '履歴';
				li.appendChild(historyLink);
				li.appendChild(document.createTextNode(' | '));

				var logLink = document.createElement('a');
				logLink.href = mw.util.getUrl('Special:Log', {page: title});
				logLink.target = '_blank';
				logLink.textContent = '記録';
				li.appendChild(logLink);
				li.appendChild(document.createTextNode(' | '));

				var deleteLogLink = document.createElement('a');
				deleteLogLink.href = mw.util.getUrl('Special:Log/protect', {page: title});
				deleteLogLink.target = '_blank';
				deleteLogLink.textContent = '保護記録';
				li.appendChild(deleteLogLink);
				li.appendChild(document.createTextNode(')'));

				var expirySelector = document.createElement('select');
				expirySelector.style.marginLeft = '0.5em';
				expirySelector.innerHTML =
					'<option value=""></option>' +
					'<option value="indefinite">無期限</option>' +
					'<option value="1 week">1週間</option>' +
					'<option value="2 weeks">2週間</option>' +
					'<option value="1 month">1ヵ月</option>' +
					'<option value="3 months">3ヵ月</option>' +
					'<option value="6 months">6ヵ月</option>' +
					'<option value="1 year">1年</option>' +
					'<option value="3 years">3年</option>';
				li.appendChild(expirySelector);

				var removeButton = createButton(li, '', '除去', {buttonCss: 'margin-left: 0.5em;'});
				removeButton.classList.add('mp-targets-list-deleteitem');
				removeButton.addEventListener('click', function() {
					cleanupPagetitles({remove: [title]});
					li.remove();
				});

				var progressWrapper = document.createElement('span');
				progressWrapper.classList.add('mp-targets-list-progress-wrapper');
				progressWrapper.style.cssText = 'display: inline-block; margin-left: 0.5em;';
				li.appendChild(progressWrapper);
				var progressLabel = document.createElement('b');
				progressWrapper.appendChild(progressLabel);
				var progressMsg = document.createElement('span');
				progressMsg.classList.add('mp-targets-list-progress');
				progressWrapper.appendChild(progressMsg);

				var progress2Wrapper = document.createElement('span');
				progress2Wrapper.classList.add('mp-targets-list-progress2-wrapper');
				progress2Wrapper.style.cssText = 'display: inline-block; margin-left: 0.5em;';
				li.appendChild(progress2Wrapper);
				var progress2Label = document.createElement('b');
				progress2Wrapper.appendChild(progress2Label);
				var progress2Msg = document.createElement('span');
				progress2Msg.classList.add('mp-targets-list-progress2');
				progress2Wrapper.appendChild(progress2Msg);

				var logs = document.createElement('span');
				logs.style.display = 'none';
				logs.classList.add('mp-targets-list-logs');
				logs.dataset.title = title;
				li.appendChild(logs);

				progressStorage[title] = progressObjVal = {
					list: li,
					maintitle: {
						pagetitle: title,
						link: titleLink
					},
					subtitle: {
						pagetitle: relPageTitle,
						link: relPageLink
					},
					expiry: expirySelector,
					liremove: removeButton,
					logs: logs,
					progress: {
						label: progressLabel,
						msg: progressMsg
					},
					progress2: {
						label: progress2Label,
						msg: progress2Msg
					}
				};

			}

			tgtListOl.appendChild(progressObjVal.list);

			if (protectionPrep) {
				[progressObjVal.expiry, progressObjVal.liremove, progressObjVal.logs].forEach(function(el) {
					el.classList.add('mp-forcehidden');
				});
			}

			if (anchors[progressObjVal.maintitle.pagetitle]) {
				anchors[progressObjVal.maintitle.pagetitle].push(progressObjVal.maintitle.link);
			} else {
				anchors[progressObjVal.maintitle.pagetitle] = [progressObjVal.maintitle.link];
			}
			if (anchors[progressObjVal.subtitle.pagetitle]) {
				anchors[progressObjVal.subtitle.pagetitle].push(progressObjVal.subtitle.link);
			} else {
				anchors[progressObjVal.subtitle.pagetitle] = [progressObjVal.subtitle.link];
			}

			acc[title] = progressObjVal;
			return acc;

		}, Object.create(null));

		mw.hook('wikipage.content').fire(mw.util.$content);
		return checkPageExistence(Object.keys(anchors)).then(function(pageInfoArray) {

			/** @type {string[]} */
			var existingTitles = [];
			/** @type {string[]} */
			var existingFiles = [];
			/** @type {string[]} */
			var missingTitles = [];

			pageInfoArray.forEach(function(obj) {

				// Blue links for existing titles, red links for missing ones
				if (anchors[obj.title]) {
					anchors[obj.title].forEach(function(a) {
						if (obj.missing) {
							a.classList.add('new');
						} else {
							a.classList.remove('new');
						}
					});
				}

				// For the main pagetitles that are to be protected, save their existence states
				if (pg.titles.indexOf(obj.title) !== -1) { // Main titles only
					if (obj.missing) {
						if (missingTitles.indexOf(obj.title) === -1) { // No duplicates
							missingTitles.push(obj.title);
						}
					} else if (getNamespaceNumber(obj.title) === 6) { // Existing files
						if (existingFiles.indexOf(obj.title) === -1) {
							existingFiles.push(obj.title);
						}
					} else {
						if (existingTitles.indexOf(obj.title) === -1) {
							existingTitles.push(obj.title);
						}
					}
				}

			});

			return {
				titles: pg.titles,
				existingTitles: existingTitles,
				existingFiles: existingFiles,
				missingTitles: missingTitles,
				progress: progressObj
			};

		});

	};

	/** Remove the 'mp-forcehidden' class from all elements. */
	var removeForceHidden = function() {
		Array.prototype.forEach.call(container.querySelectorAll('.mp-forcehidden'), function(el) {
			el.classList.remove('mp-forcehidden');
		});
	};

	tgtTab2.radio.addEventListener('change', function() {
		createList(false).then(function(titlesGiven) {
			if (!titlesGiven) {
				tgtTab1.radio.checked = true;
				alert('対象ページが入力されていません。');
			}
		});
	});

	// Field for save button
	var saveButtonWrapper = document.createElement('div');
	saveButtonWrapper.id = 'mp-targets-save';
	saveButtonWrapper.style.marginTop = '0.5em';
	tgtWrapper.appendChild(saveButtonWrapper);

	var saveButton = createButton(saveButtonWrapper, '', '保存');
	var getSavedButton = createButton(saveButtonWrapper, '', '保存済みページを取得', {buttonCss: 'margin-left: 1em;'});
	if (!mw.user.options.get(optionName)) getSavedButton.style.display = 'none';
	getSavedButton.addEventListener('click', function() {
		/** @type {string|null} */
		var savedPages = mw.user.options.get(optionName);
		var pagetitles;
		if (savedPages && (pagetitles = JSON.parse(savedPages)).length) {
			if (tgtTab2.radio.checked) {
				createList(false, {add: pagetitles});
			} else {
				cleanupPagetitles({add: pagetitles});
			}
		}
	});
	saveButtonWrapper.appendChild(getSavedButton);

	var saveProgress = document.createElement('span');
	saveProgress.style.cssText = 'margin-left: 1em; display: inline-block;';
	saveButtonWrapper.appendChild(saveProgress);

	var saveTimeout;
	saveButton.addEventListener('click', function() {

		var pg = cleanupPagetitles();
		var reset = !pg.titles.length;
		if (reset) {
			if (!confirm('保存済みページを初期化します。よろしいですか？')) return;
		}
		toggleDisableAttributes(true);
		var data = reset ? null : JSON.stringify(pg.titles);

		clearTimeout(saveTimeout);
		saveProgress.innerHTML = getIcon('doing').outerHTML + ' 保存中';

		// @ts-ignore
		api.saveOption(optionName, data)
			.then(function(res) {
				console.log(MP, res);
				toggleDisableAttributes(false);
				saveProgress.innerHTML = getIcon('done').outerHTML + ' 保存完了';
				getSavedButton.style.display = reset ? 'none' : 'inline-block';
				mw.user.options.set(optionName, data);
			})
			.catch(function(code, err) {
				console.error(MP, err);
				toggleDisableAttributes(false);
				saveProgress.innerHTML = getIcon('failed').outerHTML + ' 保存失敗 (' + code + ')';
			})
			.then(function() {
				saveTimeout = setTimeout(function(){
					saveProgress.innerHTML = '';
				}, 5000);
			});

	});

	// Field for protection targets - Fetcher container
	var fetcherWrapper = document.createElement('fieldset');
	fetcherWrapper.id = 'mp-targets-fetcher';
	fetcherWrapper.style.marginTop = '1em';
	fetcherWrapper.innerHTML = '<legend>一括取得</legend>';
	tgtWrapper.appendChild(fetcherWrapper);

	/**
	 * Create a width-fixed label for a fetcher option.
	 * @param {HTMLElement} appendTo
	 * @param {string} labelText
	 * @param {boolean} [appendBr] Append \<br> before the label if true.
	 * @returns {HTMLLabelElement}
	 */
	var createFetcherLabel = function(appendTo, labelText, appendBr) {
		if (appendBr) appendTo.appendChild(document.createElement('br'));
		var label = document.createElement('label');
		label.style.cssText = 'display: inline-block; width: 7em;';
		label.textContent = labelText;
		appendTo.appendChild(label);
		return label;
	};

	/**
	 * Create a fetcher option textbox.
	 * @param {HTMLElement} appendTo
	 * @param {string} textboxId
	 * @param {string} labelText
	 * @param {boolean} [appendBr] Append \<br> before the label if true.
	 * @returns {HTMLInputElement}
	 */
	var createFetcherTextbox = function(appendTo, textboxId, labelText, appendBr) {
		return createLabeledTextbox(appendTo, textboxId, labelText, {labelCss: 'width: 7em;', textboxCss: 'width: 28em;', appendBr: !!appendBr});
	};

	/**
	 * @typedef FetcherRegexOption
	 * @type {object}
	 * @property {HTMLLabelElement} label
	 * @property {HTMLInputElement} regexMode
	 * @property {HTMLInputElement} caseInsensitive
	 */
	/**
	 * Create a regex fetcher option (empty label and two checkboxes).
	 * @param {HTMLElement} appendTo
	 * @param {string} checkboxIdFragment mp-targets-fetcher-XXXX-regex
	 * @param {boolean} [appendBr] Append \<br> before the label if true.
	 * @returns {FetcherRegexOption}
	 */
	var createFetcherRegexOption = function(appendTo, checkboxIdFragment, appendBr) {

		var label = createFetcherLabel(appendTo, '', !!appendBr);
		var id = 'mp-targets-fetcher-' + checkboxIdFragment + '-regex';

		var chRegex = createLabeledCheckbox(appendTo, id, '正規表現モード', {checkboxCss: 'margin-left: 1em;'});
		id += '-caseinsensitive';
		var chRegexCI = createLabeledCheckbox(appendTo, id, '大文字小文字を区別しない', {checkboxCss: 'margin-left: 1em;'});

		return {label: label, regexMode: chRegex, caseInsensitive: chRegexCI};

	};

	/**
	 * Set a dynamic placeholder for a regex setting textbox.
	 * @param {HTMLInputElement} textbox
	 * @param {HTMLInputElement} checkbox
	 */
	var setRegexPlaceholder = function(textbox, checkbox) {
		var defaultMsg = '複数指定する場合はパイプで分割';
		textbox.placeholder = defaultMsg;
		checkbox.addEventListener('change', function() {
			textbox.placeholder = this.checked ? '一文字目は大文字扱い・スペースは"_"扱い' : defaultMsg;
		});
	};

	// Field for protection targets - Fetcher - Mode dropdown
	var fetcherMode = createLabeledDropdown(fetcherWrapper, 'mp-targets-fetcher-mode', 'モード', {labelCss: 'width: 7em;'});
	fetcherMode.onchange = function() { // CSS looks at data-chosen to decide which field to show below the mode dropdown
		fetcherMode.dataset.chosen = fetcherMode.value;
	};
	fetcherMode.innerHTML =
		'<option value="テンプレート">テンプレート</option>' +
		'<option value="カテゴリ">カテゴリ</option>' +
		'<option value="投稿記録">投稿記録</option>' +
		'<option value="リンク選択">リンク選択</option>';
	fetcherMode.selectedIndex = 2; // Contribs fetcher by default
	fetcherMode.dataset.chosen = '投稿記録';
	fetcherWrapper.appendChild(fetcherMode);

	// Field for protection targets - Fetcher - By template
	var fetcherTemplateWrapper = document.createElement('div');
	fetcherTemplateWrapper.classList.add('mp-targets-fetcher-settings');
	fetcherTemplateWrapper.id = 'mp-targets-fetcher-template';
	fetcherWrapper.appendChild(fetcherTemplateWrapper);
	var fetcherTemplatePagetitle = createFetcherTextbox(fetcherTemplateWrapper, 'mp-targets-fetcher-template-pagetitle', 'ページ');
	var fetcherTemplateTitle = createFetcherTextbox(fetcherTemplateWrapper, 'mp-targets-fetcher-template-title', 'テンプレート', true);
	var fetcherTemplateTitleRegex = createFetcherRegexOption(fetcherTemplateWrapper, 'template-title', true);
	setRegexPlaceholder(fetcherTemplateTitle, fetcherTemplateTitleRegex.regexMode);
	var fetcherTemplateSection = createFetcherTextbox(fetcherTemplateWrapper, 'mp-targets-fetcher-template-section', 'セクション', true);
	fetcherTemplateSection.placeholder = '随意指定';

	// Field for protection targets - Fetcher - By category
	var fetcherCategoryWrapper = document.createElement('div');
	fetcherCategoryWrapper.classList.add('mp-targets-fetcher-settings');
	fetcherCategoryWrapper.id = 'mp-targets-fetcher-category';
	fetcherWrapper.appendChild(fetcherCategoryWrapper);
	var fetcherCategoryTitle = createFetcherTextbox(fetcherCategoryWrapper, 'mp-targets-fetcher-category-title', 'カテゴリ');
	fetcherCategoryTitle.placeholder = '名前空間接頭辞を除いたページ名';
	var fetcherCategoryExclude = createFetcherTextbox(fetcherCategoryWrapper, 'mp-targets-fetcher-category-exclude', '除外ページ', true);
	var fetcherCategoryExcludeRegex = createFetcherRegexOption(fetcherCategoryWrapper, 'category-exclude', true);
	setRegexPlaceholder(fetcherCategoryExclude, fetcherCategoryExcludeRegex.regexMode);
	var fetcherCategoryNamespace = createFetcherTextbox(fetcherCategoryWrapper, 'mp-targets-fetcher-category-namespace', '名前空間', true);
	var nsTooltip = [
		'ノートは+1', '0: 標準', '2: 利用者', '4: Wikipedia', '6: ファイル', '8: MediaWiki',
		'10: Template', '12: Help', '14: Category', '100: Portal', '102: プロジェクト', '828: モジュール'
	].join('\n');
	fetcherCategoryNamespace.title = nsTooltip;
	$(fetcherCategoryNamespace).tooltip({ // Show tooltip when the namespace specifier textbox is hovered over
		tooltipClass: 'mp-tooltip',
		position: {
			my: 'left bottom',
			at: 'left top'
		}
	});
	fetcherCategoryNamespace.placeholder = '随意指定・パイプで分割';

	// Field for protection targets - Fetcher - By contribs
	var fetcherContribsWrapper = document.createElement('div');
	fetcherContribsWrapper.classList.add('mp-targets-fetcher-settings');
	fetcherContribsWrapper.id = 'mp-targets-fetcher-contribs';
	fetcherWrapper.appendChild(fetcherContribsWrapper);
	createFetcherLabel(fetcherContribsWrapper, '');
	var fetcherContribsDeleted = createLabeledCheckbox(fetcherContribsWrapper, 'mp-targets-fetcher-contribs-deleted', '削除された投稿記録', {checkboxCss: 'margin-left: 1em;'});
	var fetcherContribsUsername = createFetcherTextbox(fetcherContribsWrapper, 'mp-targets-fetcher-contribs-username', '利用者名', true);
	createFetcherLabel(fetcherContribsWrapper, '', true);
	var fetcherContribsIntersect = createLabeledCheckbox(fetcherContribsWrapper, 'mp-targets-fetcher-contribs-intersect', '利用者間の重複投稿記録', {checkboxCss: 'margin-left: 1em;'});
	fetcherContribsIntersect.addEventListener('change', function() {
		fetcherContribsUsername.placeholder = this.checked ? 'パイプで分割 (複数入力必須)' : '';
	});
	var fetcherContribsIntersectCountWrapper = document.createElement('span');
	fetcherContribsIntersectCountWrapper.id = 'mp-targets-fetcher-contribs-intersect-count';
	fetcherContribsIntersectCountWrapper.appendChild(document.createTextNode(' (重複数'));
	createTooltip(fetcherContribsIntersectCountWrapper,
		'「n利用者以上が共通して編集したページ」の n の値を指定します (2以上の整数)。未指定の場合、入力された利用者名数が自動的に適用されます。\n' +
		'例1: "A|B" (自動)指定数: 2\n' +
		'この場合、「利用者AとBの投稿記録内で2利用者以上が共通して編集したページ」、すなわちAとBの双方が編集したページのみを抽出します。\n' +
		'例2: "A|B|C|D" 指定数: 3\n' +
		'この場合、「利用者A, B, C, Dの投稿記録内で3利用者以上が共通して編集したページ」を抽出します。'
	);
	fetcherContribsIntersectCountWrapper.appendChild(document.createTextNode(': '));
	var fetcherContribsIntersectCount = document.createElement('input');
	fetcherContribsIntersectCount.style.width = '5em';
	fetcherContribsIntersectCount.type = 'number';
	fetcherContribsIntersectCount.min = '2';
	fetcherContribsIntersectCount.placeholder = '整数指定';
	fetcherContribsIntersectCountWrapper.appendChild(fetcherContribsIntersectCount);
	fetcherContribsIntersectCountWrapper.appendChild(document.createTextNode(')'));
	fetcherContribsWrapper.appendChild(fetcherContribsIntersectCountWrapper);
	var fetcherContribsExclude = createFetcherTextbox(fetcherContribsWrapper, 'mp-targets-fetcher-contribs-exclude', '除外ページ', true);
	var fetcherContribsExcludeRegex = createFetcherRegexOption(fetcherContribsWrapper, 'contribs-exclude', true);
	setRegexPlaceholder(fetcherContribsExclude, fetcherContribsExcludeRegex.regexMode);
	var fetcherContribsNamespace = createFetcherTextbox(fetcherContribsWrapper, 'mp-targets-fetcher-contribs-namespace', '名前空間', true);
	fetcherContribsNamespace.title = nsTooltip;
	$(fetcherContribsNamespace).tooltip({
		tooltipClass: 'mp-tooltip',
		position: {
			my: 'left bottom',
			at: 'left top'
		}
	});
	fetcherContribsNamespace.placeholder = '随意指定・パイプで分割';
	createFetcherLabel(fetcherContribsWrapper, '期間', true); // Addtional date specifier
	var fetcherContribsDateFrom = document.createElement('input');
	fetcherContribsDateFrom.type = 'text';
	fetcherContribsDateFrom.id = 'mp-targets-fetcher-contribs-datefrom';
	fetcherContribsDateFrom.style.width = '13em';
	fetcherContribsDateFrom.placeholder = 'この日時以降';
	fetcherContribsWrapper.appendChild(fetcherContribsDateFrom);
	fetcherContribsWrapper.appendChild(document.createTextNode(' ～ '));
	var fetcherContribsDateTo = document.createElement('input');
	fetcherContribsDateTo.type = 'text';
	fetcherContribsDateTo.id = 'mp-targets-fetcher-contribs-dateto';
	fetcherContribsDateTo.style.width = '13em';
	fetcherContribsDateTo.placeholder = 'この日時以前';
	fetcherContribsWrapper.appendChild(fetcherContribsDateTo);
	var fetcherContribsDateWarning = document.createElement('span');
	fetcherContribsDateWarning.id = 'mp-targets-fetcher-contribs-datewarning';
	fetcherContribsDateWarning.style.cssText = 'display: none; margin-left: 1em;';
	fetcherContribsDateWarning.innerHTML = '<b style="color:red;">!</b>「YYYY-MM-DD」のフォーマットで入力してください';
	fetcherContribsWrapper.appendChild(fetcherContribsDateWarning);
	var dateRegex = /^(2[01][0-9][0-9]-[0-2][0-9]-[0-3][0-9])?$/;
	[fetcherContribsDateFrom, fetcherContribsDateTo].forEach(function(el, i, arr) {
		var other = i === 0 ? arr[1] : arr[0];
		el.addEventListener('input', function() { // Show a warning message if an ill-formatted timestamp is typed into either of the textboxes
			fetcherContribsDateWarning.style.display = dateRegex.test(this.value) && dateRegex.test(other.value) ? 'none' : 'inline-block';
		});
		$(el).datepicker({ // Add datepicker
			dateFormat: 'yy-mm-dd',
			onSelect: function() { // Trigger input event when a date is selected
				el.dispatchEvent(new Event('input'));
			}
		});
	});

	// Field for protection targets - Fetcher - By links
	var fetcherLinkselectorWrapper = document.createElement('div');
	fetcherLinkselectorWrapper.classList.add('mp-targets-fetcher-settings');
	fetcherLinkselectorWrapper.id = 'mp-targets-fetcher-linkselector';
	fetcherWrapper.appendChild(fetcherLinkselectorWrapper);
	var fetcherLinkselector = createFetcherTextbox(fetcherLinkselectorWrapper, 'mp-targets-fetcher-linkselector-pagename', 'ページ');

	createFetcherLabel(fetcherLinkselectorWrapper, '', true);
	var fetcherLinkselectorUrlMode = createLabeledCheckbox(fetcherLinkselectorWrapper, 'mp-targets-fetcher-linkselector-urlmode', 'URLモード', {checkboxCss: 'margin-left: 1em;'});
	fetcherLinkselectorUrlMode.addEventListener('change', function() {
		if (this.checked) {
			fetcherLinkselector.placeholder = '"' + mw.config.get('wgServer') + mw.config.get('wgScript') + '?title="の後続部分';
		} else {
			fetcherLinkselector.placeholder = '';
		}
	});

	// Field for protection targets - Fetcher - Main button
	var fetcher = createButton(fetcherWrapper, 'mp-targets-fetcher-fetch', '取得', {buttonCss: 'margin-top: 0.5em;'});
	var fetcherResult = document.createElement('span');
	fetcherResult.id = 'mp-targets-fetcher-result';
	fetcherResult.style.cssText = 'display: inline-block; margin-left: 1em;';
	fetcherWrapper.appendChild(fetcherResult);

	var fetcherTimeout;
	/**
	 * Show a progress message for a fetcher request.
	 * @param {string} message
	 * @param {"doing"|"done"|"failed"|"cancelled"} imageType
	 * @param {boolean} autoHide
	 */
	var showFetcherResult = function(message, imageType, autoHide) {
		clearTimeout(fetcherTimeout);
		toggleDisableAttributes(imageType === 'doing');
		fetcherResult.innerHTML = message;
		fetcherResult.appendChild(getIcon(imageType));
		if (autoHide) {
			fetcherTimeout = setTimeout(function() {
				fetcherResult.innerHTML = '';
			}, 5000);
		}
	};

	/**
	 * Show the number of pages fetched when the fetching succeeds.
	 * @param {string[]} pagetitles
	 */
	var pagesFetched = function(pagetitles) {
		var curTitleList = cleanupPagetitles();
		var newTitleList = cleanupPagetitles({replace: curTitleList.titles.concat(pagetitles)});
		var diff = pagetitles.length - (newTitleList.titles.length - curTitleList.titles.length);
		var msg = pagetitles.length + 'ページ取得しました' + (diff ? ' (うち' + diff + 'ページは既に入力済みです）' : '');
		showFetcherResult(msg, 'done', true);
		tgtTab1.radio.checked = true;
	};

	/**
	 * Create a regex out of a string.
	 * @param {string} trimedStr Input string. An empty string should not be passed.
	 * @param {FetcherRegexOption} options An object of HTML elements that stores regex settings.
	 * @returns {RegExp|undefined} Returns undefined if regex conversion fails.
	 */
	var createFetcherRegex = function(trimedStr, options) {
		var flag = options.caseInsensitive.checked ? 'i' : '';
		if (options.regexMode.checked) { // If the input string is intended as a regex
			try {
				return new RegExp(trimedStr, flag);
			}
			catch (err) {
				showFetcherResult(err, 'failed', false);
				return;
			}
		} else { // If not
			var strArr = trimedStr.split('|').reduce(/** @param {string[]} acc */ function(acc, val) {
				val = val.trim();
				if (!val) return acc;
				val = mw.util.escapeRegExp(ucFirst(val.replace(/ /g, '_')));
				if (acc.indexOf(val) === -1) acc.push(val);
				return acc;
			}, []);
			return new RegExp('^(' + strArr.join('|') + ')$', flag);
		}
	};

	/**
	 * Create a string array of namespace numbers from a comma-divided plain text.
	 * @param {string} nsStr A plain string of namespace numbers divided by commas.
	 * @returns {string[]} Returns an empty array if the input string contains an invalid namespace number.
	 * In this case, showFetcherResult() is called internally.
	 */
	var createNamespaceNumberArray = function(nsStr) {

		var invalidNsNums = [];

		var namespacesArr = nsStr.split('|').reduce(/** @param {string[]} acc */ function(acc, num) {
			if (!num) return acc;
			if (/^([0-9]|1[0-5]|10[0-3]|82[89])$/.test(num)) {
				if (acc.indexOf(num) === -1) acc.push(num);
			} else {
				if (invalidNsNums.indexOf(num) === -1) invalidNsNums.push(num);
			}
			return acc;
		}, []);

		if (invalidNsNums.length) {
			showFetcherResult(invalidNsNums.join(', ') + 'は不正な名前空間です', 'failed', false);
			return [];
		} else if (!namespacesArr.length) {
			return ['*'];
		} else {
			return namespacesArr;
		}

	};

	// Event listner to run the fetcher
	fetcher.addEventListener('click', function() {

		switch (fetcherMode.value) {
			case 'テンプレート':
				(function() { // just for scope

					var title = fetcherTemplatePagetitle.value.replace(/\u200e/g, '').trim();
					if (!title) return showFetcherResult('ページ名は必須です', 'failed', true);

					var nameVal = fetcherTemplateTitle.value.replace(/\u200e/g, '').trim();
					if (!nameVal) return showFetcherResult('取得するテンプレート名を入力してください', 'failed', true);
					var templateName = createFetcherRegex(nameVal, fetcherTemplateTitleRegex);
					if (!templateName) return;

					showFetcherResult('取得しています', 'doing', false);

					var sectionName = fetcherTemplateSection.value.replace(/\u200e/g, '').trim();
					var params = {
						title: title,
						templateName: templateName,
						sectionName: sectionName ? sectionName : undefined
					};
					return getFirstTemplateParameters(params).then(function(pagetitles) {
						if (typeof pagetitles === 'string') {
							var err = pagetitles;
							showFetcherResult(err, 'failed', true);
						} else {
							pagesFetched(pagetitles);
						}
					});

				})();
				break;
			case 'カテゴリ':
				(function() {

					var title = fetcherCategoryTitle.value.replace(/\u200e/g, '').trim();
					if (!title) return showFetcherResult('カテゴリ名は必須です', 'failed', true);

					var excludeVal = fetcherCategoryExclude.value.replace(/\u200e/g, '').trim();
					/** @type {RegExp|undefined} */
					var excludeRegex;
					if (excludeVal) {
						excludeRegex = createFetcherRegex(excludeVal, fetcherCategoryExcludeRegex);
						if (!excludeRegex) return;
					}

					var namespaces = fetcherCategoryNamespace.value.replace(/[\u200e\s]/g, '');
					var namespacesArr = createNamespaceNumberArray(namespaces);
					if (!namespacesArr.length) return;

					showFetcherResult('取得しています', 'doing', false);
					return getCatMembers(title, namespacesArr).then(function(pagetitles) {
						// @ts-ignore excludeRegex can't be undefined
						if (excludeRegex) pagetitles = pagetitles.filter(function(el) { return !excludeRegex.test(el); });
						if (!pagetitles.length) {
							showFetcherResult('ページが見つかりませんでした', 'failed', true);
						} else {
							pagesFetched(pagetitles);
						}
					});

				})();
				break;
			case '投稿記録':
				(function() {

					var intersect = fetcherContribsIntersect.checked;
					/** @type {string[]} */
					var usernames;
					/** @type {number} */
					var intersectCountInt;

					if (intersect) {

						var someIsCidr = false;
						var usernamesClean = fetcherContribsUsername.value.replace(/\u200e/g, '').trim();
						if (!usernamesClean) return showFetcherResult('利用者は必須です', 'failed', true);
						var overlapCount = 0;
						usernames = usernamesClean.split('|').reduce(/** @param {string[]} acc */ function(acc, user) {
							user = user.trim().replace(/ /g, '_');
							if (user && acc.indexOf(user) === -1) {
								acc.push(user);
							} else {
								overlapCount++;
							}
							if (!someIsCidr && mw.util.isIPAddress(user, true) && !mw.util.isIPAddress(user)) {
								someIsCidr = true;
							}
							return acc;
						}, []);
						if (usernames.length <= 1) {
							return showFetcherResult('複数の利用者名を指定してください', 'failed', true);
						}
						if (overlapCount) {
							return showFetcherResult('利用者名が重複しています', 'failed', true);
						}
						if (fetcherContribsDeleted.checked && someIsCidr) { // CIDR's deleted contribs can't be fetched
							return showFetcherResult('IPレンジの削除された投稿記録は取得できません', 'failed', true);
						}
						var intersectCount = fetcherContribsIntersectCount.value || usernames.length.toString();
						if (/^\d+$/.test(intersectCount) && (intersectCountInt = parseInt(intersectCount)) > 1) {
							if (intersectCountInt > usernames.length) {
								return showFetcherResult('指定された利用者数よりも多い重複数が指定されています', 'failed', true);
							}
						} else {
							return showFetcherResult('重複数の値が不正です', 'failed', true);
						}

					} else {
						usernames = [fetcherContribsUsername.value.replace(/\u200e/g, '').trim().replace(/ /g, '_')];
						if (!usernames[0]) return showFetcherResult('利用者は必須です', 'failed', true);
						if (fetcherContribsDeleted.checked && mw.util.isIPAddress(usernames[0], true) && !mw.util.isIPAddress(usernames[0])) {
							return showFetcherResult('IPレンジの削除された投稿記録は取得できません', 'failed', true);
						}
					}

					var excludeVal = fetcherContribsExclude.value.replace(/\u200e/g, '').trim();
					/** @type {RegExp|undefined} */
					var excludeRegex;
					if (excludeVal) {
						excludeRegex = createFetcherRegex(excludeVal, fetcherContribsExcludeRegex);
						if (!excludeRegex) return;
					}

					var namespaces = fetcherContribsNamespace.value.replace(/[\u200e\s]/g, '');
					var namespacesArr = createNamespaceNumberArray(namespaces);
					if (!namespacesArr.length) return;

					var tsFrom = fetcherContribsDateFrom.value.replace(/[\u200e\s]/g, '');
					var tsTo = fetcherContribsDateTo.value.replace(/[\u200e\s]/g, '');
					var /** @type {Date} */ dFrom,
						/** @type {Date} */ dTo;
					try {
						if (tsFrom) dFrom = new Date(tsFrom);
					}
					catch (err) {
						return showFetcherResult(err, 'failed', true);
					}
					try {
						if (tsTo) dTo = new Date(tsTo);
					}
					catch (err) {
						return showFetcherResult(err, 'failed', true);
					}
					// @ts-ignore
					if (dFrom && dTo && dFrom > dTo) { // If the from date is after the to date
						dFrom = new Date(tsTo);
						dTo = new Date(tsFrom);
					}
					var /** @type {string|undefined} */ isoFrom,
						/** @type {string|undefined} */ isoTo;
					// @ts-ignore
					if (dFrom) {
						isoFrom = dFrom.toJSON();
					}
					// @ts-ignore
					if (dTo) {
						dTo.setDate(dTo.getDate() + 1);
						dTo.setSeconds(dTo.getSeconds() - 1);
						isoTo = dTo.toJSON();
					}

					showFetcherResult('取得しています', 'doing', false);
					var takingTime = setTimeout(function() {
						mw.notify('取得に時間が掛かっています...');
					}, 10000);
					var query = fetcherContribsDeleted.checked ? getDeletedUserContribs : getUserContribs;
					var deferreds = [];
					usernames.forEach(function(user) {
						deferreds.push(query(user, namespacesArr, isoFrom, isoTo));
					});
					return $.when.apply($, deferreds).then(function() {

						clearTimeout(takingTime);

						/** @type {string[]} */
						var pagetitles = [];
						var args = arguments;
						/**
						 * @type {Object.<string, number>}
						 * pagetitle-occurrence count pairs
						 */
						var pageCount = {};

						for (var i = 0; i < args.length; i++) {
							/** @type {string[]|undefined} */
							var pagetitlesArr = args[i];
							if (!pagetitlesArr) { // If undefined, a query failed
								return showFetcherResult('取得に失敗しました', 'failed', true);
							} else if (intersect) {
								pagetitlesArr.forEach(function(title, j, arr) {
									if (arr.indexOf(title) !== j) { // Don't look at duplicates in the same array
										return;
									}
									if (!(excludeRegex && excludeRegex.test(title))) {
										if (pageCount[title]) {
											pageCount[title]++;
										} else {
											pageCount[title] = 1;
										}
									}
								});
								pagetitles = Object.keys(pageCount).reduce(/** @param {string[]} acc */ function(acc, title) {
									var cnt = pageCount[title];
									if (cnt >= intersectCountInt && acc.indexOf(title) === -1) {
										acc.push(title);
									}
									return acc;
								}, []);
							} else {
								pagetitles = pagetitlesArr.filter(function(el) {
									return excludeRegex ? !excludeRegex.test(el) : true;
								});
							}
						}

						if (!pagetitles.length) {
							showFetcherResult('ページが見つかりませんでした', 'failed', true);
						} else {
							pagesFetched(pagetitles);
						}

					});

				})();
				break;
			case 'リンク選択':
				(function() {

					var title = fetcherLinkselector.value.replace(/\u200e/g, '').trim();
					if (!title) return showFetcherResult('ページ名は必須です', 'failed', true);

					var getHtml = function() {
						if (fetcherLinkselectorUrlMode.checked || getNamespaceNumber(title) === -1) {
							return scrapeWikipage(title);
						} else {
							return read(title, true);
						}
					};

					showFetcherResult('取得しています', 'doing', false);
					return getHtml().then(function(html) {

						if (html === null) {
							showFetcherResult('ページが見つかりませんでした', 'failed', true);
							return;
						} else if (html === undefined) {
							showFetcherResult('ページコンテンツの取得に失敗しました', 'failed', true);
							return;
						}
						linkSelector(html).then(function(pagetitles) {
							if (!pagetitles.length) {
								showFetcherResult('ページが選択されませんでした', 'failed', true);
							} else {
								pagesFetched(pagetitles);
							}
						});

					});

				})();
				break;
			default:
				showFetcherResult('バグが発生しました', 'failed', true);
		}

	});

	// Field for protection settings
	var settingWrapper = document.createElement('fieldset');
	settingWrapper.id = 'mp-settings';
	settingWrapper.innerHTML = '<legend>処理設定</legend>';
	container.appendChild(settingWrapper);

	/**
	 * Valid action values for action=protect.
	 * @typedef ProtectLevelActions
	 * @type {"edit"|"move"|"upload"|"create"}
	 */
	/**
	 * Valid user group values for action=protect.
	 * @typedef ProtectLevelGroups
	 * @type {"all"|"autoconfirmed"|"extendedconfirmed"|"sysop"}
	 */
	/**
	 * An object of protection user group and dropdown option pairs.
	 * @typedef ProtectLevelGroupsOptions
	 * @type {Record<ProtectLevelGroups, HTMLOptionElement>}
	 */
	/**
	 * Valid expiry values for action=protect.
	 * @typedef ProtectLevelExpiries
	 * @type {"indefinite"|"1 week"|"2 weeks"|"1 month"|"3 months"|"6 months"|"1 year"|"3 years"|""}
	 */
	/**
	 * An object of expiry value and dropdown option pairs.
	 * @typedef ProtectLevelExpiriesOptions
	 * @type {Record<ProtectLevelExpiries, HTMLOptionElement>}
	 */

	/**
	 * Level class. Creates a fieldset with dropdowns and a textbox to select a protection level and expiry.
	 * @class
	 * @constructor
	 * @param {string} legendLabel
	 * @param {ProtectLevelActions} action
	 */
	var Level = function(legendLabel, action) {

		var self = this;
		this.action = action;

		// Wrapper fieldset
		var wrapper = document.createElement('fieldset');
		var id = 'mp-level-' + action;
		wrapper.id = id;
		wrapper.style.marginTop = '0';
		wrapper.innerHTML = '<legend>' + legendLabel + '</legend>';
		settingWrapper.appendChild(wrapper);
		this.wrapper = wrapper;

		// Level selector dropdown
		this.level = createLabeledDropdown(wrapper, id + '-select', 'レベル', {labelCss: 'width: 7em;'});
		/** @type {Record<ProtectLevelGroups, string>} */
		var groupOptions = {
			all: 'すべての利用者に許可',
			autoconfirmed: '自動承認された利用者のみ許可',
			extendedconfirmed: '拡張承認された利用者と管理者に許可',
			sysop: '管理者のみ許可'
		};
		/** @type {ProtectLevelGroupsOptions} */
		this.groupOptions = Object.keys(groupOptions).reduce(/** @param {ProtectLevelGroupsOptions} acc */ function(acc, group) {
			var opt = document.createElement('option');
			opt.value = group;
			opt.textContent = groupOptions[group];
			self.level.add(opt);
			acc[group] = opt;
			return acc;
		}, Object.create(null));

		// Expiry selector dropdown
		this.expiry = createLabeledDropdown(wrapper, id + '-expiry', '期間', {labelCss: 'width: 7em;', appendBr: true});
		this.expiry.style.width = this.level.offsetWidth + 'px';
		var expiryOptions = {
			'デフォルトタイム': {
				indefinite: '無期限'
			},
			'プリセットタイム': {
				'1 week': '1週間',
				'2 weeks': '2週間',
				'1 month': '1ヵ月',
				'3 months': '3ヵ月',
				'6 months': '6ヵ月',
				'1 year': '1年',
				'3 years': '3年'
			},
			'その他の期間': {
				'': 'その他の期間'
			}
		};
		/** @type {ProtectLevelExpiriesOptions} */
		this.expiryOptions = Object.keys(expiryOptions).reduce(/** @param {ProtectLevelExpiriesOptions} acc */ function(acc, optgroupLabel) {
			var expiryObj = expiryOptions[optgroupLabel];
			var optgroup = document.createElement('optgroup');
			optgroup.label = optgroupLabel;
			Object.keys(expiryObj).forEach(function(exp) {
				var opt = document.createElement('option');
				opt.value = exp;
				opt.textContent = expiryObj[exp];
				optgroup.appendChild(opt);
				acc[exp] = opt;
			});
			self.expiry.add(optgroup);
			return acc;
		}, Object.create(null));

		// Custom expiry input
		this.custom = createLabeledTextbox(wrapper, id + '-expirycustom', 'その他の期間', {labelCss: 'width: 7em;', appendBr: true});
		this.custom.style.width = this.level.offsetWidth + 'px';
		this.custom.addEventListener('focus', function() { // Select 'other' in the expiry dropdown when the custom expiry input is focused
			self.expiryOptions[''].selected = true;
			self.expiry.dispatchEvent(new Event('change'));
		});

		// When a preset expiry is selected, clear the custom expiry input
		this.expiry.addEventListener('change', function() {
			if (this.value !== '') {
				self.custom.value = '';
				self.custom.dispatchEvent(new Event('input'));
			}
		});

	};

	/**
	 * Get the level dropdown value.
	 * @returns {ProtectLevelGroups}
	 * @method
	 */
	Level.prototype.getLevel = function() {
		// @ts-ignore
		return this.level.value;
	};

	/**
	 * Select a value in the level dropdown. Unaffected by disabled states.
	 * @param {ProtectLevelGroups} val
	 * @method
	 */
	Level.prototype.setLevel = function(val) {
		if (this.level.disabled) {
			this.level.disabled = false;
			this.groupOptions[val].selected = true;
			this.level.disabled = true;
		} else {
			this.groupOptions[val].selected = true;
		}
	};

	/**
	 * Get the value of the expiry dropdown.
	 * @method
	 */
	Level.prototype.getExpiry = function() {
		return this.expiry.value;
	};

	/**
	 * Select a value in the expiry dropdown. Unaffected by disabled states.
	 * @param {ProtectLevelExpiries} val
	 * @method
	 */
	Level.prototype.setExpiry = function(val) {
		if (this.expiry.disabled) {
			this.expiry.disabled = false;
			this.expiryOptions[val].selected = true;
			this.expiry.disabled = true;
		} else {
			this.expiryOptions[val].selected = true;
		}
	};

	/**
	 * Get the value of the custom expiry textbox.
	 * @method
	 */
	Level.prototype.getCustomExpiry = function() {
		return this.custom.value.trim();
	};

	/**
	 * Set a value to the custom expiry textbox. Unaffected by disabled states.
	 * @param {string} val
	 * @method
	 */
	Level.prototype.setCustomExpiry = function(val) {
		if (this.custom.disabled) {
			this.custom.disabled = false;
			this.custom.value = val;
			this.custom.disabled = true;
		} else {
			this.custom.value = val;
		}
	};

	/**
	 * Get an expiry value either from the dropdown or the textbox, depending on what's selected in the former.
	 * @method
	 */
	Level.prototype.getCleanExpiry = function() {
		return this.expiryOptions[''].selected ? this.custom.value.trim() : this.expiry.value;
	};

	/**
	 * Enable all the dropdowns and the textbox.
	 * @method
	 */
	Level.prototype.enable = function() {
		[this.level, this.expiry, this.custom].forEach(function(el) {
			el.disabled = false;
		});
	};

	/**
	 * Disable all the dropdowns and the textbox.
	 * @method
	 */
	Level.prototype.disable = function() {
		[this.level, this.expiry, this.custom].forEach(function(el) {
			el.disabled = true;
		});
	};

	/**
	 * Synchronize the dropdown and textbox values with another LevelObject.
	 * @param {Level} LevelObject
	 * @param {() => boolean} [conditionPredicate] Trigger sync only when matching this condition predicate
	 */
	Level.prototype.sync = function(LevelObject, conditionPredicate) {
		var self = this;
		LevelObject.level.addEventListener('change', function() {
			if (conditionPredicate ? conditionPredicate() : true) {
				if (self.level.disabled) {
					self.level.disabled = false;
					// @ts-ignore
					self.setLevel(this.value);
					self.level.disabled = true;
				} else {
					// @ts-ignore
					self.setLevel(this.value);
				}
			}
		});
		LevelObject.expiry.addEventListener('change', function() {
			if (conditionPredicate ? conditionPredicate() : true) {
				if (self.expiry.disabled) {
					self.expiry.disabled = false;
					// @ts-ignore
					self.setExpiry(this.value);
					self.expiry.disabled = true;
				} else {
					// @ts-ignore
					self.setExpiry(this.value);
				}
			}
		});
		LevelObject.custom.addEventListener('input', function() {
			if (conditionPredicate ? conditionPredicate() : true) {
				if (self.custom.disabled) {
					self.custom.disabled = false;
					self.setCustomExpiry(this.value);
					self.custom.disabled = true;
				} else {
					self.setCustomExpiry(this.value);
				}
			}
		});
	};

	// Create level selectors
	var existingPageProtection = createLabeledCheckbox(settingWrapper, 'mp-settings-existingpage', '既存ページの保護');
	existingPageProtection.checked = true;

	var editProtection = new Level('編集保護', 'edit');

	var unlockAdditionalProtection = createLabeledCheckbox(settingWrapper, 'mp-settings-unlock', '追加保護オプションのロックを解除');

	var moveProtection = new Level('移動保護', 'move');
	moveProtection.disable();
	var conditionPredicate = function() { return !unlockAdditionalProtection.checked; };
	moveProtection.sync(editProtection, conditionPredicate);

	var uploadProtection = new Level('アップロード保護', 'upload');
	uploadProtection.disable();
	uploadProtection.sync(editProtection, conditionPredicate);

	existingPageProtection.addEventListener('change', function() { // Enable/disable the level fields for existing page protection
		var self = this;
		unlockAdditionalProtection.disabled = !self.checked;
		[editProtection, moveProtection, uploadProtection].forEach(function(LevelObject, i) {
			if (!unlockAdditionalProtection.checked && self.checked) {
				if (i === 0) LevelObject.enable();
			} else if (self.checked) {
				LevelObject.enable();
			} else {
				LevelObject.disable();
			}
		});
	});

	unlockAdditionalProtection.addEventListener('change', function() {
		var self = this;
		[moveProtection, uploadProtection].forEach(function(LevelObject) {
			if (self.checked) {
				LevelObject.enable();
			} else {
				LevelObject.setLevel(editProtection.getLevel());
				// @ts-ignore
				LevelObject.setExpiry(editProtection.getExpiry());
				LevelObject.setCustomExpiry(editProtection.getCustomExpiry());
				LevelObject.disable();
			}
		});
	});

	var missingPageProtection = createLabeledCheckbox(settingWrapper, 'mp-settings-missingpage', '未作成ページの保護');
	var createProtection = new Level('作成保護', 'create');
	createProtection.disable();
	missingPageProtection.addEventListener('change', function() { // Enable/disable the level fields for missing page protection
		if (this.checked) {
			createProtection.enable();
		} else {
			createProtection.disable();
		}
	});

	/**
	 * @typedef ActionProtectFragmentParams
	 * @type {{protections: string[]; expiry: string[]; unprotect: boolean;}|undefined}
	 */
	/**
	 * Get level settings. The object properties are undefined if protection is disabled for the relevant type of pages.
	 * @returns {{missing: ActionProtectFragmentParams; existing: ActionProtectFragmentParams; existingFiles: ActionProtectFragmentParams;}}
	 */
	var getLevels = function() {

		/** @type {ActionProtectFragmentParams} */
		var missing;
		/** @type {ActionProtectFragmentParams} */
		var existing;
		/** @type {ActionProtectFragmentParams} */
		var existingFiles;

		// Counters to check for unprotect only options
		var existingPagesUnprotectCount = 0;
		var existingFilesUnprotectCount = 0;

		[editProtection, moveProtection, uploadProtection, createProtection].forEach(function(levelObj) {

			var dependentLevelObj = ['move', 'upload'].indexOf(levelObj.action) !== -1 && !unlockAdditionalProtection.checked ?
						editProtection :
						levelObj;
			var action = levelObj.action;
			var level = dependentLevelObj.getLevel();
			var expiry = dependentLevelObj.getCleanExpiry();

			if (action === 'create') {
				if (missingPageProtection.checked) {
					missing = {
						protections: [action + '=' + level],
						expiry: [expiry],
						unprotect: level === 'all'
					};
				}
			} else {
				if (level === 'all') {
					existingFilesUnprotectCount++;
					if (action !== 'upload') {
						existingPagesUnprotectCount++;
					}
				}
				if (existingPageProtection.checked) {
					if (action !== 'upload') {
						if (!existing) {
							existing = {
								protections: [],
								expiry: [],
								unprotect: false
							};
						}
						existing.protections.push(action + '=' + level);
						existing.expiry.push(expiry);
					}
					if (!existingFiles) {
						existingFiles = {
							protections: [],
							expiry: [],
							unprotect: false
						};
					}
					existingFiles.protections.push(action + '=' + level);
					existingFiles.expiry.push(expiry);
				}
			}

		});
		if (existing) {
			existing.unprotect = existingPagesUnprotectCount === 2;
		}
		if (existingFiles) {
			existingFiles.unprotect = existingFilesUnprotectCount === 3;
		}

		return {
			missing: missing,
			existing: existing,
			existingFiles: existingFiles
		};

	};

	// Reasons
	var reasonWrapper = document.createElement('fieldset');
	reasonWrapper.id = 'mp-settings-reason';
	reasonWrapper.style.marginTop = '0';
	reasonWrapper.innerHTML = '<legend>保護理由</legend>';
	settingWrapper.appendChild(reasonWrapper);
	var reasonLabelCss = {labelCss: 'width: 7em;'};
	var reasonLabelCssBr = {labelCss: 'width: 7em;', appendBr: true};
	var rsnDefaultOption =
		'<optgroup label="その他の理由">' +
			'<option value="">その他の理由</option>' +
		'</optgroup>';
	var settingRsn1Dropdown = createLabeledDropdown(reasonWrapper, 'mp-settings-reason-1', '理由1', reasonLabelCss);
	settingRsn1Dropdown.innerHTML = rsnDefaultOption;
	var settingRsn2Dropdown = createLabeledDropdown(reasonWrapper, 'mp-settings-reason-2', '理由2', reasonLabelCssBr);
	settingRsn2Dropdown.innerHTML = rsnDefaultOption;
	var settingRsnCInput = createLabeledTextbox(reasonWrapper, 'mp-settings-reason-C', '', reasonLabelCssBr);
	settingRsnCInput.placeholder = '非定形理由';
	settingRsnCInput.style.cssText = 'margin-bottom: 0.5em; width: 32em;';
	getProtectReasonDropdown().then(function(dropdown) {
		if (!dropdown) {
			settingRsn1Dropdown.style.width = '32em';
			settingRsn2Dropdown.style.width = '32em';
			return alert('保護理由の取得に失敗しました。');
		}
		settingRsn1Dropdown.innerHTML = dropdown.innerHTML;
		settingRsn2Dropdown.innerHTML = dropdown.innerHTML;
		if (settingRsn1Dropdown.offsetWidth >= settingRsnCInput.offsetWidth) {
			settingRsnCInput.style.width = settingRsn1Dropdown.offsetWidth.toString() + 'px';
		} else {
			settingRsn1Dropdown.style.width = '32em';
			settingRsn2Dropdown.style.width = '32em';
		}
	});
	getAutocompleteSource().then(function(list) { // Get a VIP/LTA list and set its items as autocomplate condidates
		if (!list.length) return;
		$(settingRsnCInput).autocomplete({
			source: function(req, res) { // Limit the list to the maximum number of 10, or the list can stick out of the viewport
				var results = $.ui.autocomplete.filter(list, req.term);
				res(results.slice(0, 10));
			},
			position: {
				my: 'left bottom',
				at: 'left top'
			}
		});
		settingRsnCInput.placeholder = '非定型理由 (VIP・LTA名称を入力すると候補が表示されます)';
	});

	var getReasons = function() {
		var reasonsArr = [settingRsn1Dropdown.value, settingRsn2Dropdown.value, settingRsnCInput.value.trim()];
		return reasonsArr.filter(function(el) { return el; }).join(': ');
	};

	// Watchlist checkbox
	var settingWatch = createLabeledCheckbox(settingWrapper, 'mp-settings-watch', '保護対象ページをウォッチリストに追加', {wrapDiv: true});
	settingWatch.addEventListener('change', function() {
		if (this.checked) this.scrollIntoView({behavior: 'smooth'});
	});
	var settingWatchExpiryUl = document.createElement('ul');
	settingWatchExpiryUl.id = 'mp-settings-watch-expiry-container';
	settingWatchExpiryUl.style.marginTop = '0';
	settingWatchExpiryUl.style.listStyle = 'none';
	// @ts-ignore
	settingWatch.parentElement.appendChild(settingWatchExpiryUl);
	var settingWatchExpiryLi = document.createElement('li');
	settingWatchExpiryUl.appendChild(settingWatchExpiryLi);
	var settingWatchExpiry = createLabeledDropdown(settingWatchExpiryLi, 'mp-settings-watch-expiry', '期間', {labelCss: 'width: 3em;', dropdownCss: 'margin-right: 1em;'});
	settingWatchExpiry.innerHTML =
			'<option value="indefinite">無期限</option>' +
			'<option value="1 week">1週間</option>' +
			'<option value="1 month">1か月</option>' +
			'<option value="3 months">3か月</option>' +
			'<option value="6 months">6か月</option>' +
			'<option value="1 year">1年</option>';
	var settingWatchRelativeExpiry = createLabeledCheckbox(settingWatchExpiryLi, 'mp-settings-watch-expiry-relative', '保護期間満了時から換算', {wrapDiv: true});
	/** @type {HTMLDivElement} */
	// @ts-ignore
	var settingWatchRelativeExpiryWrapper = settingWatchRelativeExpiry.parentElement;
	createTooltip(settingWatchRelativeExpiryWrapper, // Maximum watchlist expiry is 1 year; show tooltip for this
		'保護解除時は、ドロップダウンで選択した期間設定がそのまま適用されます。' +
		'相対期間ウォッチリスト登録に限らず、最長のウォッチ期間はAPIの制限により1年です。これを超過する場合、無期限でウォッチリストに登録されます。'
	);
	var settingWatchExcludeUnprotect = createLabeledCheckbox(settingWatchExpiryLi, 'mp-settings-watch-excludeunprotect', '保護解除時は適用しない', {wrapDiv: true});
	settingWatchExcludeUnprotect.checked = true;

	// Cascade protection checkbox
	var settingCascade = createLabeledCheckbox(settingWrapper, 'mp-settings-cascade', 'カスケード保護', {wrapDiv: true});

	// Remove-RFP-template checkbox
	var settingRmRFPTemplates = createLabeledCheckbox(settingWrapper, 'mp-settings-rmrfp', '保護依頼タグを自動除去', {wrapDiv: true});
	settingRmRFPTemplates.checked = true;

	var settingRmPpTemplates = createLabeledCheckbox(settingWrapper, 'mp-settings-rmpp', '保護解除時に保護タグを自動除去', {wrapDiv: true});
	settingRmPpTemplates.checked = true;

	// Add-Pp-template checkbox
	var settingPpTemplatesLabel = '保護タグを自動添付 (<a href="/wiki/Template:Pp#関連項目" target="_blank">一覧</a>)';
	var settingPpTemplates = createLabeledCheckbox(settingWrapper, 'mp-settings-addpp', settingPpTemplatesLabel, {wrapDiv: true});
	settingPpTemplates.addEventListener('change', function() {
		if (this.checked) {
			settingRmRFPTemplates.checked = true;
			settingRmRFPTemplates.disabled = true;
			this.scrollIntoView({behavior: 'smooth'});
		} else {
			settingRmRFPTemplates.disabled = false;
		}
	});

	// Add-Pp-template checkbox - template selector
	var settingPpTemplatesUl = document.createElement('ul');
	settingPpTemplatesUl.id = 'mp-settings-addpp-selector';
	settingPpTemplatesUl.style.marginTop = '0';
	// @ts-ignore
	settingPpTemplates.parentElement.appendChild(settingPpTemplatesUl);

	/**
	 * PpDropdown class. Creates a pp-argument selector dropdown.
	 * @class
	 * @constructor
	 * @param {string} dropdownId
	 * @param {string} dropdownLabel
	 * @param {string[]} optionNames Name option elements with these names.
	 * @param {(arrayElement: string, arrayElementIndex: number, createdOption: HTMLOptionElement) => void} [optionPredicate]
	 * Initialize the object instance in accordance with this predicate.
	 */
	var PpDropdown = function(dropdownId, dropdownLabel, optionNames, optionPredicate) {

		var li = document.createElement('li');
		settingPpTemplatesUl.appendChild(li);

		var self = this;
		this.dropdown = createLabeledDropdown(li, dropdownId, dropdownLabel, {labelCss: 'width: 7em;', dropdownCss: 'width: 10em;'});
		/** An object of option name and option element pairs. */
		this.options = optionNames.reduce(/** @param {Object.<string, HTMLOptionElement>} acc */ function(acc, name, i) {
			var opt = document.createElement('option');
			opt.textContent = name;
			if (optionPredicate) {
				optionPredicate(name, i, opt);
			}
			self.dropdown.add(opt);
			acc[name] = opt;
			return acc;
		}, Object.create(null));

	};

	/**
	 * Reset the dropdown by enabling it and unhiding all its options.
	 * @method
	 */
	PpDropdown.prototype.reset = function() {
		this.dropdown.disabled = false;
		this.dropdown.selectedIndex = 0;
		var self = this;
		Object.keys(this.options).forEach(function(optionName) {
			self.options[optionName].hidden = false;
		});
	};

	/**
	 * Select a dropdown option.
	 * @param {string} target
	 * @method
	 */
	PpDropdown.prototype.select = function(target) {
		if (this.options[target]) {
			this.options[target].selected = true;
		} else {
			throw new Error('The value "' + target + '" does not exist in the dropdown options.');
		}
	};

	/**
	 * Hide a dropdown option.
	 * @param {string} target
	 * @method
	 */
	PpDropdown.prototype.hide = function(target) {
		if (this.options[target]) {
			this.options[target].hidden = true;
		} else {
			throw new Error('The value "' + target + '" does not exist in the dropdown options.');
		}
	};

	/**
	 * Disable the dropdown.
	 * @method
	 */
	PpDropdown.prototype.disable = function() {
		this.dropdown.disabled = true;
	};

	/**
	 * Get the selected value of the dropdown.
	 * @method
	 */
	PpDropdown.prototype.val = function() {
		return this.dropdown.value;
	};

	// Create pp-argument selector dropdowns
	var ppTemplateOptions = [
		'pp', 'pp-dispute', 'pp-vandalism', 'pp-semi-indef', 'pp-template',
		'pp-permanent', 'pp-move', 'pp-move-vandalism', 'pp-move-dispute', 'pp-office',
		'pp-reset', 'pp-office-dmca'
	];
	var ppTemplates = new PpDropdown('mp-settings-addpp-selector-pps', 'テンプレート', ppTemplateOptions, function(el, i, opt) {
		if (i === 2) opt.selected = true; // Set initial value, pp-vandalism
	});

	var ppTypeOptions = ['', 'action=edit', 'action=move', 'action=upload'];
	var ppTypes = new PpDropdown('mp-settings-addpp-selector-types', '種別', ppTypeOptions, function(el, i, opt) {
		if (i == 0) opt.selected = true;
		if (i > 0) opt.value = '|' + el;
	});
	ppTypes.hide('action=upload'); // For pp-vandalism

	var ppSmallOptions = ['', 'small=yes', 'small=no'];
	var ppSmall = new PpDropdown('mp-settings-addpp-selector-small', '縮小表示', ppSmallOptions, function(el, i, opt) {
		if (i == 1) opt.selected = true;
		if (i > 0) opt.value = '|' + el;
	});
	ppSmall.hide('small=no'); // For pp-vandalism

	/**
	 * Get the Pp template option.
	 * @returns {PpOptions}
	 */
	var getPpOptions = function() {

		/** @type {false|string} */
		var addPp = false;
		if (settingPpTemplates.checked) {
			var pp = [ppTemplates.val(), ppTypes.val(), ppSmall.val()].filter(function(el) { return el; });
			addPp = '{{' + pp.join('') + '}}';
		}

		return {
			addPp: addPp,
			removePp: settingRmPpTemplates.checked,
			removeRfp: settingRmRFPTemplates.checked
		};

	};

	ppTemplates.dropdown.addEventListener('change', function() {

		/*******************************************************************************************\
			Arguments of [[Template:Pp]] (def: default value when not specified: should be hidden)
			template		action					small
			pp				edit, move, upload		def=no
			dispute			edit, move, upload		X
			vandalism		edit, move				def=no
			semi-indef		X						def=yes
			template		X						def=yes
			permanent		X						def=yes
			move			X						def=no
			move-vandalism	X						def=no
			move-dispute	X						X
			office			X						X
			reset			X						X
			office-dmca		X						X
		\*******************************************************************************************/

		// Reset
		ppTypes.reset();
		ppSmall.reset();

		switch (this.options[this.selectedIndex].text) {
			case 'pp':
				ppSmall.hide('small=no');
				break;
			case 'pp-dispute':
				ppSmall.disable();
				break;
			case 'pp-vandalism':
				ppTypes.hide('action=upload');
				ppSmall.hide('small=no');
				ppSmall.select('small=yes');
				break;
			case 'pp-semi-indef':
			case 'pp-template':
			case 'pp-permanent':
				ppTypes.disable();
				ppSmall.hide('small=yes');
				break;
			case 'pp-move':
			case 'pp-move-vandalism':
				ppTypes.disable();
				ppSmall.hide('small=no');
				break;
			case 'pp-move-dispute':
			case 'pp-office':
			case 'pp-reset':
			case 'pp-office-dmca':
				ppTypes.disable();
				ppSmall.disable();
		}

	});

	// Confirm-to-overwrite checkbox
	var settingConfirmToOverwrite = createLabeledCheckbox(settingWrapper, 'mp-settings-confirmtooverwrite', '保護の上書き前に確認メッセージを表示', {wrapDiv: true});
	settingConfirmToOverwrite.checked = true;
	settingConfirmToOverwrite.addEventListener('change', function() {
		if (this.checked) this.scrollIntoView({behavior: 'smooth'});
	});
	/** @type {HTMLDivElement} */
	// @ts-ignore
	var settingConfirmToOverwriteWrapper = settingConfirmToOverwrite.parentElement;

	// Confirm-to-unprotect checkbox
	var settingConfirmToOverwriteUl = document.createElement('ul');
	settingConfirmToOverwriteUl.id = 'mp-settings-confirmtounprotect-container';
	settingConfirmToOverwriteUl.style.marginTop = '0';
	settingConfirmToOverwriteUl.style.listStyle = 'none';
	settingConfirmToOverwriteWrapper.appendChild(settingConfirmToOverwriteUl);
	var settingConfirmToOverwriteLi = document.createElement('li');
	settingConfirmToOverwriteUl.appendChild(settingConfirmToOverwriteLi);
	var settingConfirmToUnprotect = createLabeledCheckbox(settingConfirmToOverwriteLi, 'mp-settings-confirmtounprotect', '保護解除前に確認メッセージを表示');
	settingConfirmToUnprotect.checked = true;
	createTooltip(settingConfirmToOverwriteLi, '意図しない保護解除対策です。意図をもって保護解除のレベル設定をしている場合はチェックを外してください。');

	// Field for the 'execute' button
	var massProtectWrapper = document.createElement('div');
	massProtectWrapper.id = 'mp-massprotect-container';
	massProtectWrapper.style.marginTop = '0.5em';
	container.appendChild(massProtectWrapper);

	var massProtectButton = createButton(massProtectWrapper, 'mp-massprotect', '実行', {buttonCss: 'display: block;'});
	var massProtectMessage = document.createElement('span');
	massProtectMessage.style.marginTop = '0.5em';
	massProtectMessage.style.display = 'block';
	massProtectWrapper.appendChild(massProtectMessage);

	/**
	 * An alternative for window.confirm by a link.
	 * @param {string} confirmMsg An innerHTML for massProtectMessage. Anchor buttons follow this after a line break.
	 * @returns {JQueryPromise<boolean>}
	 */
	var linkConfirm = function(confirmMsg) {
		var def = $.Deferred();

		massProtectMessage.innerHTML = '';
		massProtectMessage.innerHTML = confirmMsg + '<br>';

		var msgYes = document.createElement('a');
		msgYes.role = 'button';
		msgYes.textContent = '続行';
		msgYes.addEventListener('click', function() {
			massProtectMessage.innerHTML = '';
			def.resolve(true);
		});
		massProtectMessage.appendChild(msgYes);
		massProtectMessage.appendChild(document.createTextNode('・'));

		var msgNo = document.createElement('a');
		msgNo.role = 'button';
		msgNo.textContent = '中止';
		msgNo.addEventListener('click', function() {
			massProtectMessage.innerHTML = '';
			def.resolve(false);
		});
		massProtectMessage.appendChild(msgNo);

		massProtectMessage.scrollIntoView({behavior: 'smooth'});

		return def.promise();
	};

	// Execute MassProtect when the button is hit
	massProtectButton.addEventListener('click', function() {

		// Get levels
		var levels = getLevels();
		if (!levels.existing && !levels.existingFiles && !levels.missing) { // If all protection settings are disabled
			alert('既存ページ・未作成ページともに保護設定が無効化されています。');
			return;
		}

		tgtTab2.radio.checked = true;
		toggleDisableAttributes(true);
		massProtectMessage.appendChild(document.createTextNode('準備中'));
		massProtectMessage.appendChild(getIcon('doing'));

		// Get target pages
		createList(true).then(function(listObj) {

			massProtectMessage.innerHTML = '';

			// No pages specified
			if (!listObj) {
				toggleDisableAttributes(false);
				tgtTab1.radio.checked = true;
				removeForceHidden();
				alert('保護対象ページが入力されていません。');
				return;
			// Existing pages only and existing page protection disabled
			} else if (listObj.existingTitles.length && !listObj.missingTitles.length && !levels.existing) {
				toggleDisableAttributes(false);
				tgtTab1.radio.checked = true;
				removeForceHidden();
				alert('保護対象ページが既存ページのみの中、既存ページの保護が無効化されています。');
				return;
			// Missing pages only and missing page protection disabled
			} else if (!listObj.existingTitles.length && listObj.missingTitles.length && !levels.missing) {
				toggleDisableAttributes(false);
				tgtTab1.radio.checked = true;
				removeForceHidden();
				alert('保護対象ページが未作成ページのみの中、未作成ページの保護が無効化されています。');
				return;
			}

			// Get reason
			var reason = getReasons();
			if (!reason) {
				if (!confirm('保護理由が入力されていません。このまま実行しますか？')) {
					toggleDisableAttributes(false);
					removeForceHidden();
					return;
				}
			}

			// Create final confirm message
			/** @type {string[]} */
			var confirmMsg = [];
			var followingMsg = '';
			if (listObj.existingTitles.length) {
				if (levels.existing) {
					followingMsg = ' (' + (levels.existing.unprotect ? '<b>保護解除</b>' : '保護') + ')';
				} else {
					followingMsg = ' (既存ページの保護が無効のためスキップ)';
				}
				confirmMsg.push('既存ページ数: ' + listObj.existingTitles.length + followingMsg);
			}
			if (listObj.existingFiles.length) {
				if (levels.existingFiles) {
					followingMsg = ' (' + (levels.existingFiles.unprotect ? '<b>保護解除</b>' : '保護') + ')';
				} else {
					followingMsg = ' (既存ページの保護が無効のためスキップ)';
				}
				confirmMsg.push('既存ファイル数: ' + listObj.existingFiles.length + followingMsg);
			}
			if (listObj.missingTitles.length) {
				if (levels.missing) {
					followingMsg = ' (' + (levels.missing.unprotect ? '<b>作成保護解除</b>' : '作成保護') + ')';
				} else {
					followingMsg = ' (未作成ページの保護が無効のためスキップ)';
				}
				confirmMsg.push('未作成ページ数: ' + listObj.missingTitles.length + followingMsg);
			}

			mw.notify('入力内容をよく確認のうえ「続行」ボタンを押してください');
			linkConfirm(confirmMsg.join('<br>')).then(function(confirmed) {

				if (!confirmed) {
					toggleDisableAttributes(false);
					removeForceHidden();
					mw.notify('中止しました');
					return;
				}

				// Create an amalgamated object containing parameters for API requests and HTML elements to show progress, per page

				/** @type {ActionProtectDefaultParams} */
				var defaultParams = {
					action: 'protect',
					reason: reason,
					tags: mw.config.get('wgDBname') === 'jawiki' ? MP : undefined,
					cascade: settingCascade.checked,
					watchlist: settingWatch.checked ? 'watch' : 'nochange',
					watchlistexpiry: settingWatch.checked ? settingWatchExpiry.value: undefined,
					curtimestamp: true,
					formatversion: '2'
				};
				var ppOptions = getPpOptions();

				/** @type {ActionProtectParamsPerTitle} */
				var extendedParams = Object.keys(listObj.progress).reduce(/** @param {ActionProtectParamsPerTitle} acc */ function(acc, pagetitle) {

					// Create parameters for this title only if it can be forwarded to the API
					/** @type {ExtendedParams} */
					var params;
					var unprotect = false;
					if (listObj.existingTitles.indexOf(pagetitle) !== -1) { // This page exists
						if (levels.existing) { // and existing page protection is enabled
							params = {
								title: pagetitle,
								protections: levels.existing.protections.join('|'),
								expiry: listObj.progress[pagetitle].expiry.value || levels.existing.expiry.join('|')
							};
							unprotect = levels.existing.unprotect;
						}
					} else if (listObj.existingFiles.indexOf(pagetitle) !== -1) { // This file exists
						if (levels.existingFiles) { // and existing file protection is enabled
							params = {
								title: pagetitle,
								protections: levels.existingFiles.protections.join('|'),
								expiry: listObj.progress[pagetitle].expiry.value || levels.existingFiles.expiry.join('|')
							};
							unprotect = levels.existingFiles.unprotect;
						}
					} else if (listObj.missingTitles.indexOf(pagetitle) !== -1) { // This page is missing
						if (levels.missing) { // and missing page protection is enabled
							params = {
								title: pagetitle,
								protections: levels.missing.protections.join('|'),
								expiry: listObj.progress[pagetitle].expiry.value || levels.missing.expiry.join('|')
							};
							unprotect = levels.missing.unprotect;
						}
					} else { // Titles that reach here will be skipped in the MassProtect procedure
						return acc;
					}

					// Progress of page protection
					var progressObj = listObj.progress[pagetitle];
					progressObj.progress.label.appendChild(document.createTextNode('保護' + (unprotect ? '解除' : '') + ': '));
					progressObj.progress.msg.appendChild(getIcon('doing'));
					acc[pagetitle] = {
						list: progressObj.list,
						progress: progressObj.progress.msg,
						unprotect: unprotect,
						overwrite: settingConfirmToOverwrite.checked && settingConfirmToUnprotect.checked ?
									'confirmall' :
									settingConfirmToOverwrite.checked ?
									'confirmprotect' :
									'proceed',
					};

					// Progress of template pasting. This object property (progress2) is undefined if the option is disabled
					if (unprotect) {
						// 'Remove pp on unprotect' is enabled and the page exists
						if (ppOptions.removePp && listObj.missingTitles.indexOf(pagetitle) === -1) {
							progressObj.progress2.label.appendChild(document.createTextNode('タグ除去: '));
							progressObj.progress2.msg.appendChild(getIcon('doing'));
							acc[pagetitle].progress2 = progressObj.progress2.msg;
						}
					} else {
						// 'Add pp' or 'remove RFP' is enabled, the page exists, and the page isn't a module
						if ((ppOptions.addPp || ppOptions.removeRfp) &&
							listObj.missingTitles.indexOf(pagetitle) === -1 &&
							getNamespaceNumber(pagetitle) !== 828
						) {
							progressObj.progress2.label.appendChild(document.createTextNode('タグ: '));
							progressObj.progress2.msg.appendChild(getIcon('doing'));
							acc[pagetitle].progress2 = progressObj.progress2.msg;
						}
					}

					// @ts-ignore
					if (params) { // If this page is to be forwarded to the API for (un)protect

						// Get conjoined params
						var conjParams = $.extend(params, defaultParams);

						// Clean up the 'watch' and 'watchexpiry' parameters. The former should be set to 'nochange' and the latter should
						// be deleted if 'add to watchlist' is checked && this page is to be protected && 'relative expiry' is checked &&
						// the watchlist expiry isn't indefinite (in this case a 'relative' property is added to the extended param obj),
						// OR this page is to be unprocted && 'ignore pages to unprotect' is checked.
						if (settingWatch.checked) {
							if (!unprotect) { // Protect
								if (settingWatchRelativeExpiry.checked) { // Watch page by relative expiry
									if (settingWatchExpiry.value !== 'indefinite') { // Selected expiry isn't indefinite (can be relativized)
										// @ts-ignore
										acc[pagetitle].relative = settingWatchExpiry.value;
										conjParams.watchlist = 'nochange';
										delete conjParams.watchlistexpiry;
									} else { // Selected expiry is indefinite (can't be relativized)
										// Do nothing, use the values of defaultParams (watch, indefinite)
									}
								} else { // Watch page by absolute expiry
									// Do nothing, use the values of defaultParams (watch, selected expiry)
								}
							} else { // Unprotect
								if (!settingWatchExcludeUnprotect.checked) { // Watch page on unprotection
									// Do nothing, use the values of defaultParams (watch, selected expiry)
								} else { // Don't watch page on unprotection
									conjParams.watchlist = 'nochange';
									delete conjParams.watchlistexpiry;
								}
							}
						}

						// Register the params
						acc[pagetitle].params = conjParams;

					}

					return acc;
				}, Object.create(null));

				// Scroll up to the list wrapper, hiding all irrelevant fields.
				tgtWrapper.scrollIntoView({behavior: 'smooth'});
				[saveButtonWrapper, fetcherWrapper, settingWrapper, massProtectWrapper].forEach(function(el) {
					el.hidden = true;
				});

				// Execute
				console.log(MP, extendedParams);
				massProtect(extendedParams, ppOptions);

			});

		});
	});

}

/** Create a user right error interface. */
function showUserRightError() {

	var container = document.createElement('div');
	container.id = 'mp-container';
	replaceContent(container, '権限エラー');

	container.innerHTML =
		'<p>あなたには「ページの保護設定の変更」を行う権限がありません。理由は以下の通りです:</p>' +
		'<ul>' +
			'<li>' +
				'この操作は、以下のグループに属する利用者のみが実行できます: <a href="' + mw.util.getUrl('Wikipedia:管理者') + '">管理者</a>。' +
			'</li>' +
		'</ul>';

}

/**
 * Replace the DOM body with a new content.
 * @param {HTMLDivElement} newContent
 * @param {string} headerText
 */
function replaceContent(newContent, headerText) {
	var bodyContent = document.querySelector('.mw-body-content');
	if (bodyContent) {
		bodyContent.replaceChildren(newContent);
		var firstHeading = document.querySelector('.mw-first-heading');
		if (firstHeading) {
			firstHeading.textContent = headerText;
		}
	}
}

/**
 * Get a loading/check/cross icon image tag.
 * @param {"doing"|"done"|"failed"|"cancelled"} iconType
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
			break;
		case 'cancelled':
			img.src = '//upload.wikimedia.org/wikipedia/commons/6/61/Symbol_abstain_vote.svg';
	}
	img.style.cssText = 'vertical-align: middle; height: 1em; border: 0;';
	return img;
}

/**
 * @typedef ProtectionStatus
 * @type {object}
 * @property {{
 *	user: string;
 *	timestamp: string;
 *	reason: string;
 *	level: string[];
 * }} [current] This property is missing if the page is currently not protected.
 * @property {{
 *	count: number;
 *	latest: string[];
 * }} previous
 */

/**
 * Get the protection logs of given pages.
 * @param {string[]} pagetitlesArr
 * @returns {JQueryPromise<Object.<string, ProtectionStatus|undefined>>}
 */
function getProtectionLogs(pagetitlesArr) {

	/**
	 * @param {string} pagetitle
	 * @returns {JQueryPromise<ProtectionStatus|undefined>}
	 */
	var query = function(pagetitle) {

		return api.get({
			action: 'query',
			titles: pagetitle,
			prop: 'info',
			inprop: 'protection',
			list: 'logevents',
			letype: 'protect',
			letitle: pagetitle,
			lelimit: 'max',
			formatversion: '2'
		}).then(function(res) {

			var resPages, resLgev;
			if (!res || !res.query || !(resPages = res.query.pages) || !(resLgev = res.query.logevents)) return undefined;

			/** @type {ProtectionStatus} */
			var ret = {
				previous: {
					count: 0,
					latest: []
				}
			};
			var currentProtection = detailsObjectArrayToStringArray(resPages[0].protection);
			/** @type {Date|undefined} */
			var lastProtectionDate;
			/** @type {object} */
			var newestProtectionObject;

			resLgev.forEach(function(obj) {

				// Only look at new protections and modifications
				if (['protect', 'modify'].indexOf(obj.action) === -1) {
					return;
				} else if (!newestProtectionObject) {
					newestProtectionObject = obj;
				}

				// If currently protected, save that information only once
				if (!ret.current && currentProtection.length) {
					ret.current = {
						user: obj.user,
						timestamp: obj.timestamp,
						reason: obj.comment,
						level: currentProtection
					};
				}

				// Save the latest protection log (note that 'params' can be an empty object in old logs)
				var details;
				if (!ret.previous.latest.length && obj.params && Array.isArray((details = obj.params.details))) {
					ret.previous.latest = detailsObjectArrayToStringArray(details, obj.timestamp);
					ret.previous.latest.push(parseIsoTimestamp(obj.timestamp));
				}

				// Increment protection counter if this log entry is one that was generated at least 1 day earlier than the newer log entry
				if (!lastProtectionDate || lastProtectionDate.getTime() - (lastProtectionDate = new Date(obj.timestamp)).getTime() > 1*24*60*60*1000) {
					ret.previous.count++;
					if (obj.action === 'protect') lastProtectionDate = undefined;
				}

			});

			// If the page has protection logs but the latest log information can't be fetched, push a parsed timestamp
			if (ret.previous.count && !ret.previous.latest.length && newestProtectionObject) {
				ret.previous.latest.push(parseIsoTimestamp(newestProtectionObject.timestamp));
			}

			return ret;

		}).catch(function(code, err) {
			console.log(MP, err);
			return undefined;
		});
	};

	var deferreds = [];
	pagetitlesArr.forEach(function(pagetitle) {
		deferreds.push(query(pagetitle));
	});
	return $.when.apply($, deferreds).then(function() {
		/** @type {Object.<string, ProtectionStatus|undefined>} */
		var ret = {};
		var args = arguments;
		for (var i = 0; i < args.length; i++) {
			ret[pagetitlesArr[i]] = args[i];
		}
		return ret;
	});

}

/**
 * res.query.pages[index].protection or res.query.logevents[index].params.details
 * @typedef ApiResponseProtectionDetails
 * @type {{
 *	type: string;
 *	level: string;
 *	expiry: string;
 *	cascase?: boolean;
 * }}
 */

/**
 * Convert an array of ApiResponseProtectionDetails objects to an array of human-readable strings (e.g. "Edit semi-protected (indefinite)").
 * If the second argument isn't passed, conversion takes place only if the objects signify that the relevant page is currently protected.
 * @param {ApiResponseProtectionDetails[]} detailsArr
 * @param {string} [baseTimestamp] If provided, get duration instead of expiry timestamp
 * @returns {string[]}
 */
function detailsObjectArrayToStringArray(detailsArr, baseTimestamp) {
	return detailsArr.reduce(/** @param {string[]} acc */ function(acc, obj) {
		if (!baseTimestamp && !isProtected(obj)) return acc;
		var duration = /^in/.test(obj.expiry) ? '無期限' : baseTimestamp ? getDuration(baseTimestamp, obj.expiry) : obj.expiry.replace(/Z$/, '') + 'まで';
		var el = translate(obj.type) + translate(obj.level) + ' (' + duration + ')';
		acc.push(el);
		return acc;
	}, []);
}

/**
 * Look at the details array of a list=logevents&letype=protect response and check if the relevant page is currently protected.
 * @param {ApiResponseProtectionDetails} detailsObj
 * @returns {boolean}
 */
function isProtected(detailsObj) {
	var d = new Date();
	if (!detailsObj.expiry) {
		return false;
	} else if (/^in/.test(detailsObj.expiry)) {
		return true;
	} else {
		return d < new Date(detailsObj.expiry);
	}
}

/**
 * Get the difference between two timestamps in a human-readable format, by subtracting timestamp2 by timestamp1.
 * If the result is a negative value, undefined is returned.
 * @param {string} timestamp1
 * @param {string} timestamp2
 */
function getDuration(timestamp1, timestamp2) {

	var ts1 = new Date(timestamp1);
	var ts2 = new Date(timestamp2);
	var diff = ts2.getTime() - ts1.getTime();
	if (diff < 0) return;

	var seconds = Math.round(diff / 1000);
	var minutes = Math.round(seconds / 60);
	var hours = Math.round(minutes / 60);
	var days = Math.round(hours / 24);
	var weeks = Math.round(days / 7);
	var months = Math.round(days / 30);
	var years = Math.floor(days / 365);
	seconds %= 60;
	minutes %= 60;
	hours %= 24;
	days %= 30;
	weeks %= 7;
	months %= 30;
	years %= 365;

	var duration, unit;
	if (years) {
		duration = years;
		unit = '年';
	}
	else if (months) {
		duration = months;
		unit = 'か月';
	}
	else if (weeks) {
		duration = weeks;
		unit = '週間';
	}
	else if (days) {
		duration = days;
		unit = '日';
	}
	else if (hours) {
		duration = hours;
		unit = '時間';
	}
	else if (minutes) {
		duration = minutes;
		unit = '分';
	}
	else {
		duration = seconds;
		unit = '秒';
	}
	switch (unit) {
		case 'か月':
			if (duration % 12 === 0) {
				duration /= 12;
				unit = '年';
			}
			break;
		case '週間':
			if (duration % 4 === 0) {
				duration /= 4;
				unit = 'か月';
			}
			break;
		case '日':
			if (duration % 7 === 0) {
				duration /= 7;
				unit = '週間';
			}
			break;
		case '時間':
			if (duration % 24 === 0) {
				duration /= 24;
				unit = '日';
			}
			break;
		case '分':
			if (duration % 60 === 0) {
				duration /= 60;
				unit = '時間';
			}
			break;
		case '秒':
			if (duration % 60 === 0) {
				duration /= 60;
				unit = '分';
			}
			break;
		default:
	}
	return duration + unit;

}

var translations = {
	create: '作成',
	edit: '編集',
	move: '移動',
	upload: 'アップロード',
	autoconfirmed: '半保護',
	extendedconfirmed: '拡張半保護',
	sysop: '全保護'
};

/**
 * @param {string} keyword
 * @returns {string}
 */
function translate(keyword) {
	return translations[keyword] || '??';
}

/**
 * Parse an ISO timestamp (YYYY-MM-DDThh:mm:ssZ) and get 'YYYY年MM月DD日'.
 * @param {string} ts
 * @returns {string}
 */
function parseIsoTimestamp(ts) {
	var m = ts.match(/^(\d{4})-0?(\d{1,2})-0?(\d{1,2})/);
	// @ts-ignore
	return m[1] + '年' + m[2] + '月' + m[3] + '日';
}

/**
 * @typedef PageInfo
 * @property {string} title Spaces are represented by underscores.
 * @property {boolean} missing
 */
/**
 * Check whether given pages exist.
 * @param {string[]} titlesArr
 * @returns {JQueryPromise<PageInfo[]>} Spaces in pagetitles are represented by underscores.
 */
function checkPageExistence(titlesArr) {

	/** @type {PageInfo[]} */
	var pageInfo = [];

	/**
	 * @param {string[]} titles
	 * @returns {JQueryPromise<void>}
	 */
	var query = function(titles) {
		return api.post({
			action: 'query',
			titles: titles.join('|'),
			formatversion: '2'
		}).then(function(res) {

			var resPages;
			if (!res || !res.query || !(resPages = res.query.pages) || !resPages.length) return;

			resPages.forEach(function(obj) {
				if (!obj.title) return;
				obj.title = obj.title.replace(/ /g, '_');
				pageInfo.push({
					title: obj.title,
					missing: !!obj.missing
				});
			});

		}).catch(function(code, err) {
			console.error(MP, err);
			return;
		});
	};

	titlesArr = titlesArr.slice();
	var deferreds = [];
	while (titlesArr.length) {
		deferreds.push(query(titlesArr.splice(0, apilimit)));
	}
	return $.when.apply($, deferreds).then(function() {
		return pageInfo;
	});

}

/**
 * Get the namespace number of a pagetitle.
 * @param {string} pagetitle
 * @returns {number}
 */
function getNamespaceNumber(pagetitle) {
	var prefix = pagetitle.replace(/ /g, '_').split(':')[0].toLowerCase();
	var namespaceIds = mw.config.get('wgNamespaceIds');
	for (var alias in namespaceIds) {
		if (prefix === alias) return namespaceIds[alias];
	}
	return 0;
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
 * Create a dropdown with a label on its left. Default CSS for the dropdown: 'display: inline-block;'
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
	label.style.cssText = 'display: inline-block;';
	if (options.labelCss) parseAndApplyCssText(label, options.labelCss);
	appendTo.appendChild(label);

	var dropdown = document.createElement('select');
	dropdown.id = id;
	if (options.dropdownCss) dropdown.style.cssText = options.dropdownCss;
	appendTo.appendChild(dropdown);

	return dropdown;

}

/**
 * Create a textbox with a label on its left. Default CSS for the textbox: 'display: inline-block;'
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
	label.style.cssText = 'display: inline-block;';
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
 * Create a checkbox with a label on its right. Default CSS for the checkbox: 'margin-right: 0.5em;'
 * @param {HTMLElement} appendTo
 * @param {string} id
 * @param {string} labelText This is applied to innerHTML, not textContent.
 * @param {{checkboxCss?: string; appendBr?: boolean; wrapDiv?: boolean;}} [options]
 * @returns {HTMLInputElement}
 */
function createLabeledCheckbox(appendTo, id, labelText, options) {

	options = options || {};
	if (options.appendBr) appendTo.appendChild(document.createElement('br'));

	var checkbox = document.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.id = id;
	checkbox.style.marginRight = '0.5em';
	if (options.checkboxCss) parseAndApplyCssText(checkbox, options.checkboxCss);

	var label = document.createElement('label');
	label.htmlFor = id;
	label.innerHTML = labelText;

	if (options.wrapDiv) {
		var wrapper = document.createElement('div');
		wrapper.appendChild(checkbox);
		wrapper.appendChild(label);
		appendTo.appendChild(wrapper);
	} else {
		appendTo.appendChild(checkbox);
		appendTo.appendChild(label);
	}

	return checkbox;

}

/**
 * Create a "？" mark tooltip.
 * @param {HTMLElement} appendTo
 * @param {string} tooltipText
 */
function createTooltip(appendTo, tooltipText) {
	var tt = document.createElement('span');
	tt.style.cssText = 'font-weight: bold; color: blue;';
	tt.textContent = '？';
	tt.title = tooltipText;
	$(tt).tooltip({
		tooltipClass: 'mp-tooltip',
		position: {
			my: 'left bottom',
			at: 'left top'
		}
	});
	appendTo.appendChild(tt);
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
 * Get the content of a page, parse templates in it, and filter out the values of the first parameter.
 * @param {{title: string; templateName: RegExp; sectionName?: string;}} parseConfig
 * @returns {JQueryPromise<string[]|string>} Returns an array of strings on success, otherwise an error message as a string.
 */
function getFirstTemplateParameters(parseConfig) {
	return read(parseConfig.title).then(function(content) {

		if (content === null) {
			return 'ページが見つかりませんでした';
		} else if (content === undefined) {
			return '取得に失敗しました';
		}
		if (parseConfig.sectionName) {
			var sections = parseSections(content).filter(function(obj) {
				return obj.title === parseConfig.sectionName;
			});
			if (!sections.length) return '指定された名前のセクションが見つかりませんでした';
			content = sections[0].content;
		}

		var templates = parseTemplates(content, {namePredicate: function(name) {
			return parseConfig.templateName.test(name);
		}});

		return templates.reduce(/** @param {string[]} acc */ function(acc, Template) {
			/** @type {TemplateArgument[]} */
			var filtered;
			if ((filtered = Template.arguments.filter(function(obj) { return obj.name === '1'; })).length) {
				if (filtered[0].value && acc.indexOf(filtered[0].value) === -1) acc.push(filtered[0].value);
			}
			return acc;
		}, []);

	});
}

/**
 * Parse the content of a page by each section.
 * @param {string} content
 * @returns {{header: string|null; title: string|null; level: number; index: number; content: string; deepest: boolean|null;}[]}
 */
function parseSections(content) {

	var regex = {
		comments: /<!--[\s\S]*?-->|<(nowiki|pre|syntaxhighlight|source|math)[\s\S]*?<\/\1\s*>/gi,
		header: /={2,5}[^\S\n\r]*.+[^\S\n\r]*={2,5}/,
		headerG: /={2,5}[^\S\n\r]*.+[^\S\n\r]*={2,5}/g,
		headerEquals: /(?:^={2,5}[^\S\n\r]*|[^\S\n\r]*={2,5}$)/g
	};

	// Replace comment-related tags
	var idx = 0;
	var comments = [];
	var m;
	while ((m = regex.comments.exec(content))) {
		content = content.replace(m[0], '$CM' + (idx++));
		comments.push(m[0]);
	}

	// Get headers
	/** @type {{text:string; title:string; level: number; index: number;}[]} */
	var headers = [];
	while ((m = regex.headerG.exec(content))) {
		headers.push({
			text: m[0],
			title: m[0].replace(regex.headerEquals, ''),
			level: (m[0].match(/=/g) || []).length / 2,
			index: m.index // This is the index number of the header in the content
		});
	}
	headers.unshift({text: '', title: '', level: 1, index: 0}); // For the top section

	// Return an array of objects
	return headers.map(function(obj, i, arr) {
		var isTopSection = i === 0;
		var sectionContent = arr.length > 1 ? content.slice(0, arr[1].index) : content;
		var deepest = null;
		if (!isTopSection) {
			var nextSameLevelSection = arr.slice(i + 1).filter(function(objF) {return objF.level <= obj.level; });
			sectionContent = content.slice(obj.index, nextSameLevelSection.length ? nextSameLevelSection[0].index : content.length);
			var dRegex = new RegExp('(={' + (obj.level + 1) + ',})[^\\S\\n\\r]*.+[^\\S\\n\\r]*\\1');
			deepest = !dRegex.test(sectionContent.slice(obj.text.length));
		}
		comments.forEach(function(el, j){ sectionContent = sectionContent.replace('$CM' + j, el); }); // Get comments back
		return {
			header: isTopSection ? null : obj.text,
			title: isTopSection ? null : obj.title,
			level: obj.level,
			index: i,
			content: sectionContent,
			deepest: deepest
		};
	});

}

/**
 * @typedef TemplateConfig
 * @property {boolean} [recursive] Whether to parse templates nested inside others. Defaulted to true.
 * @property {boolean} [parseComments] Whether to parse templates inside comment-related tags. Defaulted to false.
 * @property {NamePredicate} [namePredicate] Include template in result only if its name matches this predicate.
 * @property {TemplatePredicate} [templatePredicate] Include template in result only if it matches this predicate.
 * @callback NamePredicate
 * @param {string} name Template name (first letter in uppercase, spaces represented by underscores)
 * @returns {boolean}
 * @callback TemplatePredicate
 * @param {Template} Template Template object
 * @returns {boolean}
 * @typedef Template
 * @property {string} text The whole text of the template, starting with '{{' and ending with '}}'.
 * @property {string} name Name of the template. The first letter is always in upper case and spaces are represented by underscores.
 * @property {TemplateArgument[]} arguments Parsed template arguments as an array.
 * @property {number} nestlevel Nest level of the template. If it's not part of another template, the value is 0.
 * @typedef TemplateArgument
 * @property {string} text The whole text of the template argument.
 * @property {string} name A key name such as '1' (numeral key is assigned if not explicitly defined)
 * @property {string} value A value following a key such as '1='.
 */

/**
 * Parse templates in wikitext. Templates within \<!-- -->, nowiki, pre, syntaxhighlight, source, and math are ignored.
 * (Those in comment tags can be parsed if TemplateConfig.parseComments is true.)
 * @param {string} wikitext Text in which to parse templates.
 * @param {TemplateConfig} [config]
 * @param {number} [nestlevel] Private parameter. Do not specify this manually.
 * @returns {Template[]}
 */
function parseTemplates(wikitext, config, nestlevel) {

	/** @type {TemplateConfig} */
	var cfg = {
		recursive: true,
		parseComments: false,
		namePredicate: undefined,
		templatePredicate: undefined
	};
	$.extend(cfg, config || {});

	nestlevel = typeof nestlevel === 'number' ? nestlevel : 0;

	// Number of unclosed braces
	var numUnclosed = 0;

	// Are we in a {{{parameter}}}, or between wikitags that prevent transclusions?
	var inParameter = false;
	var inTag = false;
	var tagNames = [];

	var parsed = [];
	var startIdx, endIdx;

	// Look at every character of the wikitext one by one. This loop only extracts the outermost templates.
	for (var i = 0; i < wikitext.length; i++) {
		var slicedWkt = wikitext.slice(i);
		var matchedTag, isComment;
		if (!inParameter && !inTag) {
			if (/^\{\{\{(?!\{)/.test(slicedWkt)) {
				inParameter = true;
				i += 2;
			} else if (/^\{\{/.test(slicedWkt)) {
				if (numUnclosed === 0) {
					startIdx = i;
				}
				numUnclosed += 2;
				i++;
			} else if (/^\}\}/.test(slicedWkt)) {
				if (numUnclosed === 2) {
					endIdx = i + 2;
					var templateText = wikitext.slice(startIdx, endIdx); // Pipes could have been replaced with a control character if they're part of nested templates
					var templateTextPipesBack = _replacePipesBack(templateText);
					var templateName = templateTextPipesBack.replace(/\u200e|^\{\{\s*(:?\s*template\s*:|:?\s*テンプレート\s*:)?\s*|\s*[|}][\s\S]*$/gi, '').replace(/ /g, '_');
					templateName = ucFirst(templateName);
					if (!cfg.namePredicate || cfg.namePredicate(templateName)) {
						parsed.push({
							text: templateTextPipesBack,
							name: templateName,
							arguments: _parseTemplateArguments(templateText),
							nestlevel: nestlevel
						});
					}
				}
				numUnclosed -= 2;
				i++;
			} else if (wikitext[i] === '|' && numUnclosed > 2) { // numUnclosed > 2 means we're in a nested template
				// Swap out pipes with \x01 character.
				wikitext = strReplaceAt(wikitext, i, '\x01');
			} else if ((matchedTag = slicedWkt.match(/^(?:<!--|<(nowiki|pre|syntaxhighlight|source|math) ?[^>]*?>)/))) {
				isComment = /^<!--/.test(slicedWkt);
				if (!(cfg.parseComments && isComment)) {
					inTag = true;
					tagNames.push(isComment ? 'comment' : matchedTag[1]);
					i += matchedTag[0].length - 1;
				}
			}
		} else {
			// we are in a {{{parameter}}} or tag
			if (wikitext[i] === '|' && numUnclosed > 2) {
				wikitext = strReplaceAt(wikitext, i, '\x01');
			} else if ((matchedTag = slicedWkt.match(/^(?:-->|<\/(nowiki|pre|syntaxhighlight|source|math) ?[^>]*?>)/))) {
				isComment = /^-->/.test(slicedWkt);
				if (!(cfg.parseComments && isComment)) {
					inTag = false;
					tagNames.pop();
					i += matchedTag[0].length - 1;
				}
			} else if (/^\}\}\}/.test(slicedWkt)) {
				inParameter = false;
				i += 2;
			}
		}
	}

	// Get nested templates?
	if (cfg.recursive) {
		/** @type {Template[]} */
		var accumulator = [];
		var subtemplates = parsed.reduce(function(acc, obj) {
			var tempInner = obj.text.slice(2, -2);
			if (/\{\{[\s\S]*?\}\}/.test(tempInner)) {
				// @ts-ignore
				acc = acc.concat(parseTemplates(tempInner, cfg, nestlevel + 1));
			}
			return acc;
		}, accumulator);
		parsed = parsed.concat(subtemplates);
	}
	// Filter the array by a user-defined condition?
	if (cfg.templatePredicate) {
		// @ts-ignore
		parsed = parsed.filter(function(Template) { return cfg.templatePredicate(Template); });
	}

	return parsed;

}

/**
 * This function should never be called externally because it presupposes that pipes in nested templates have been replaced with the control character '\x01',
 * and otherwise it doesn't work as expeceted.
 * @param {string} template
 * @returns {TemplateArgument[]}
 */
function _parseTemplateArguments(template) {

	if (template.indexOf('|') === -1) return [];

	var innerContent = template.slice(2, -2); // Remove braces

	// Swap out pipes in links with \x01 control character
	// [[File: ]] can have multiple pipes, so might need multiple passes
	var wikilinkRegex = /(\[\[[^\]]*?)\|(.*?\]\])/g;
	while (wikilinkRegex.test(innerContent)) {
		innerContent = innerContent.replace(wikilinkRegex, '$1\x01$2');
	}

	var args = innerContent.split('|');
	args.shift(); // Remove template name
	var unnamedArgCount = 0;

	/** @type {TemplateArgument[]} */
	var parsedArgs = args.map(function(arg) {

		arg = arg.trim();

		// Replace {{=}}s with a (unique) control character
		// The magic words could have spaces before/after the equal sign in an inconsistent way
		// We need the input string back as it was before replacement, so mandane replaceAll isn't a solution here
		var magicWordEquals = arg.match(/\{\{\s*=\s*\}\}/g) || [];
		magicWordEquals.forEach(function(equal, i) {arg = arg.replace(equal, '$EQ' + i); });

		var argName, argValue;
		var indexOfEqual = arg.indexOf('=');
		if (indexOfEqual >= 0) { // The argument is named
			argName = arg.slice(0, indexOfEqual).trim();
			argValue = arg.slice(indexOfEqual + 1).trim();
			if (argName === unnamedArgCount.toString()) unnamedArgCount++;
		} else { // The argument is unnamed
			argName = (++unnamedArgCount).toString();
			argValue = arg.trim();
		}

		// Get the replaced {{=}}s back
		magicWordEquals.forEach(function(equal, i) {
			var replacee = '$EQ' + i;
			arg = arg.replace(replacee, equal);
			argName = argName.replace(replacee, equal);
			argValue = argValue.replace(replacee, equal);
		});

		return {
			text: _replacePipesBack(arg),
			name: _replacePipesBack(argName),
			value: _replacePipesBack(argValue)
		};

	});

	return parsedArgs;

}

/**
 * Capitalize the first letter of a string.
 * @param {string} string
 * @returns {string}
 */
function ucFirst(string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * Replace the nth character in a string with a given string.
 * @param {string} string
 * @param {number} index
 * @param {string} char
 * @returns {string}
 */
function strReplaceAt(string, index, char) {
	return string.slice(0, index) + char + string.slice(index + 1);
}

/**
 * @param {string} string
 * @returns {string}
 */
function _replacePipesBack(string) {
	// eslint-disable-next-line no-control-regex
	return string.replace(/\x01/g, '|');
}

/**
 * Get pagetitles that belong to a given category.
 * @param {string} cattitle A 'Category:' prefix is automatically added if there's none
 * @param {string[]} namespaces
 * @returns {JQueryPromise<string[]>} Spaces are represented by underscores.
 */
function getCatMembers(cattitle, namespaces) {

	if (!/^Category:/i.test(cattitle)) cattitle = 'Category:' + cattitle;

	/** @type {string[]} */
	var cats = [];

	var query = function(cmcontinue) {
		return api.get({
			action: 'query',
			list: 'categorymembers',
			cmtitle: cattitle,
			cmprop: 'title',
			cmnamespace: namespaces.join('|'),
			cmtype: 'page|file|subcat',
			cmlimit: 'max',
			cmcontinue: cmcontinue,
			formatversion: '2'
		}).then(function(res) {
			var resCM, resCont;
			if (!res || !res.query || !(resCM = res.query.categorymembers) || !resCM.length) return undefined;
			resCM.forEach(function(obj) {
				var title = obj.title;
				if (!title) return;
				title = title.replace(/ /g, '_');
				if (cats.indexOf(title) === -1) {
					cats.push(title);
				}
			});
			return res.continue && (resCont = res.continue.cmcontinue) ? query(resCont) : undefined;
		}).catch(function(code, err) {
			console.error(MP, err);
			return undefined;
		});
	};

	return query().then(function() {
		return cats;
	});

}

/**
 * Get pagetitles from a user's contributions.
 * @param {string} username
 * @param {string[]} namespaces A string array of namespace numbers. Pass ['*'] for all namespaces.
 * @param {string} [oldestTs] Filter out contribs AFTER this timestamp.
 * @param {string} [newestTs] Filter out contribs BEFORE this timestamp.
 * @returns {JQueryPromise<string[]|undefined>} Spaces are represented by underscores; Could be an empty array
 */
function getUserContribs(username, namespaces, oldestTs, newestTs) {

	var isCidr = mw.util.isIPAddress(username, true) && !mw.util.isIPAddress(username);
	var defaultParams = {
		action: 'query',
		list: 'usercontribs',
		uclimit: 'max',
		ucnamespace: namespaces.join('|'),
		ucprop: 'title|timestamp',
		formatversion: '2'
	};
	/** @param {string} ts */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	var inTimeRange = function(ts) {
		return true;
	};
	if (isCidr) {

		defaultParams.uciprange = username;

		// For some reason, queries for a CIDR's contribs are extremely slow and can even throw TimeoutException if ucstart/ucend
		// are specified. It's much faster to get all the contribs of the CIDR and filter them out.
		var dOldest = oldestTs ? new Date(oldestTs) : null;
		var dNewest = newestTs ? new Date(newestTs) : null;
		inTimeRange = function(ts) {
			var d = new Date(ts);
			if (dOldest && dNewest) {
				return dOldest <= d && d <= dNewest;
			} else if (dOldest) {
				return dOldest <= d;
			} else if (dNewest) {
				return d <= dNewest;
			} else {
				return true;
			}
		};

	} else {
		defaultParams.ucuser = username;
		$.extend(defaultParams, {
			ucstart: newestTs,
			ucend: oldestTs
		});
	}

	var failed = false;
	/** @type {TitleObject} */
	var titleObj = {};

	/**
	 * @param {string} [uccontinue]
	 * @returns {JQueryPromise<void>}
	 */
	var query = function(uccontinue) {
		var params = $.extend({uccontinue: uccontinue}, defaultParams);
		// @ts-ignore
		return api.get(params, {timeout: isCidr ? 0 : 30*1000})
			.then(function(res) {

				var resUc;
				if (!res || !res.query || !(resUc = res.query.usercontribs)) {
					failed = true;
					return;
				}

				resUc.forEach(function(obj) {
					var title = obj.title;
					if (!title) return;
					title = title.replace(/ /g, '_');
					if (inTimeRange(obj.timestamp) && (!titleObj[title] || isCidr && new Date(titleObj[title]) < new Date(obj.timestamp))) {
						titleObj[title] = obj.timestamp;
					}
				});

				var resCont;
				if (res.continue && (resCont = res.continue.uccontinue)) {
					return query(resCont);
				}

			})
			.catch(function(code, err) {
				console.error(MP, err);
				failed = true;
				return;
			});
	};

	return query().then(function() {
		return failed ? undefined : !isCidr ? Object.keys(titleObj) : sortTitleObjectArray(titleObj);
	});

}

/**
 * Get pagetitles from a user's deleted contributions. Incompatible with CIDRs.
 * @param {string} username
 * @param {string[]} namespaces A string array of namespace numbers. Pass ['*'] for all namespaces.
 * @param {string} [oldestTs] Filter out contribs AFTER this timestamp.
 * @param {string} [newestTs] Filter out contribs BEFORE this timestamp.
 * @returns {JQueryPromise<string[]|undefined>} Spaces are represented by underscores; Could be an empty array
 */
function getDeletedUserContribs(username, namespaces, oldestTs, newestTs) {

	var defaultParams = {
		action: 'query',
		list: 'alldeletedrevisions',
		adrlimit: 'max',
		adruser: username,
		adrnamespace: namespaces.join('|'),
		adrprop: 'timestamp',
		adrstart: newestTs,
		adrend: oldestTs,
		formatversion: '2'
	};

	var failed = false;
	/** @type {TitleObject} */
	var titleObj = {};

	/**
	 * @param {string} [adrcontinue]
	 * @returns {JQueryPromise<void>}
	 */
	var query = function(adrcontinue) {
		var params = $.extend({adrcontinue: adrcontinue}, defaultParams);
		// @ts-ignore
		return api.get(params)
			.then(function(res) {

				var resAdr;
				if (!res || !res.query || !(resAdr = res.query.alldeletedrevisions)) {
					failed = true;
					return;
				}

				resAdr.forEach(function(obj) {
					var title = obj.title;
					if (!title) return;
					title = title.replace(/ /g, '_');
					if (obj.revisions && obj.revisions.length && obj.revisions[0].timestamp && !titleObj[title]) {
						titleObj[title] = obj.revisions[0].timestamp;
					}
				});

				var resCont;
				if (res.continue && (resCont = res.continue.adrcontinue)) {
					return query(resCont);
				}

			})
			.catch(function(code, err) {
				console.error(MP, err);
				failed = true;
				return;
			});
	};

	return query().then(function() {
		return failed ? undefined : sortTitleObjectArray(titleObj);
	});

}

/**
 * Sort an object of pagetitle-timestamp pairs by timestamp and return an array of sorted pagetitles. Duplicates are not checked.
 * @param {TitleObject} titleObj
 * @returns {string[]}
 * @typedef {Object.<string, string>} TitleObject pagetitle-timestamp pairs
 */
function sortTitleObjectArray(titleObj) {
	return Object.keys(titleObj).sort(function(title1, title2) { // Sort the array, newer first
		var d1 = new Date(titleObj[title1]);
		var d2 = new Date(titleObj[title2]);
		if (d1 > d2) {
			return -1;
		} else if (d1 < d2) {
			return 1;
		} else {
			return 0;
		}
	});
}

/**
 * Create a link selector dialog from a raw html.
 * @param {string} html
 * @returns {JQueryPromise<string[]>}
 */
function linkSelector(html) {

	var def = $.Deferred();

	// Create the content of the dialog
	var dialog = document.createElement('div');
	dialog.id = 'mp-targets-fetcher-linkselector-dialog';
	dialog.title = 'MassDelete - LinkSelector';
	dialog.style.cssText = 'max-height: 80vh; max-width: 90vw;';

	var dialogHeader = document.createElement('div');
	dialogHeader.style.padding = '0.5em';
	dialogHeader.innerHTML =
		'リンクを選択してください（通常クリック: 選択、SHIFTクリック: 選択解除；リンク先は開きません）<br>' +
		'<b>黄緑色のリンク</b>は削除/復帰対象にできないページへのリンクです（クリックするとリンク先が開きます）';
	dialog.appendChild(dialogHeader);

	var dialogBody = document.createElement('div');
	dialogBody.style.cssText = 'border: 1px solid silver; padding: 0.5em; background: white; max-height: 60vh; overflow-y: scroll;';
	dialogBody.innerHTML = html;
	dialog.appendChild(dialogBody);

	var dialogFooter = document.createElement('div');
	dialogFooter.style.padding = '0.5em';
	dialogFooter.appendChild(document.createTextNode('選択済みページ数: '));
	var linkCnt = document.createElement('span');
	linkCnt.id = 'mp-targets-fetcher-linkselector-dialog-linkcount';
	linkCnt.textContent = '0';
	dialog.appendChild(dialogFooter);
	dialogFooter.appendChild(linkCnt);

	var endpoint = '^https?:' + mw.config.get('wgServer');
	var regex = {
		article: new RegExp(endpoint + mw.config.get('wgArticlePath').replace('$1', '([^#?]+)')), // '/wiki/PAGENAME'
		script: new RegExp(endpoint + mw.config.get('wgScript') + '\\?title=([^#&]+)') // '/w/index.php?title=PAGENAME'
	};

	// Loop all anchors
	/** @type {Object.<string, HTMLAnchorElement[]>} */
	var links = {};
	/** @type {string[]} */
	var pages = [];
	var invalidLinkClass = 'mp-targets-fetcher-linkselector-dialog-invalidlink';
	var selectedLinkClass = 'mp-targets-fetcher-linkselector-dialog-selectedlink';
	Array.prototype.forEach.call(dialogBody.getElementsByTagName('a'), /** @param {HTMLAnchorElement} a */ function(a) {

		var href = a.href;
		if (!href || a.role === 'button') {
			a.classList.add(invalidLinkClass);
			return;
		}
		a.target = '_blank';

		var m, pagetitle;
		if ((m = regex.article.exec(href))) {
			pagetitle = m[1];
		} else if ((m = regex.script.exec(href))) {
			pagetitle = m[1];
		} else {
			a.classList.add(invalidLinkClass);
			return;
		}
		pagetitle = decodeURIComponent(pagetitle);

		try {
			var Title = new mw.Title(pagetitle);
			if (Title.getNamespaceId() === -1) {
				a.classList.add(invalidLinkClass);
				return;
			}
			pagetitle = Title.getPrefixedDb();
		}
		catch (err) {
			a.classList.add(invalidLinkClass);
			return;
		}
		if (links[pagetitle]) {
			links[pagetitle].push(a);
		} else {
			links[pagetitle] = [a];
		}
		a.addEventListener('click', function(e) {
			if (e.shiftKey) {
				e.preventDefault();
				if (this.classList.contains(selectedLinkClass)) {
					links[pagetitle].forEach(function(l) {
						l.classList.remove(selectedLinkClass);
					});
					pages = pages.filter(function(p) { return p !== pagetitle; });
					linkCnt.textContent = pages.length.toString();
				}
			} else if (!e.ctrlKey) {
				e.preventDefault();
				if (!this.classList.contains(selectedLinkClass)) {
					links[pagetitle].forEach(function(l) {
						l.classList.add(selectedLinkClass);
					});
					pages.push(pagetitle);
					linkCnt.textContent = pages.length.toString();
				}
			}
		});

	});

	var $dialog = $(dialog);
	mw.hook('wikipage.content').fire($dialog);
	$dialog.dialog({
		resizable: false,
		draggable: true,
		height: 'auto',
		// @ts-ignore
		width: $(window).width() * 0.8,
		position: {
			my: 'center',
			at: 'center',
			of: window
		},
		modal: true,
		buttons: [{
			text: '選択終了',
			click: function() {
				$(this).dialog('close');
			}
		}],
		close: function() {
			def.resolve(pages);
			$(this).dialog('destroy').remove();
		}
	});

	return def.promise();

}

/**
 * Scrape the content of a wikipage from a pagetitle and additional query parameters.
 * @param {string} queryParam URL query params following '/w/index.php?title='
 * @returns {JQueryPromise<string|null|undefined>} Returns null if the page doesn't exist, undefined if the fetching fails.
 */
function scrapeWikipage(queryParam) {
	var def = $.Deferred();
	var url = mw.config.get('wgServer') + mw.config.get('wgScript') + '?title=' + queryParam;
	$.get(url)
		.then(function(res) {
			if (!res) return def.resolve(undefined);
			var html = document.createElement('html');
			html.innerHTML = res;
			var body;
			if (html.querySelector('.page-メインページ')) { // If the page doesn't exist, the content of Main page is returned
				return def.resolve(null);
			} else if ((body = html.querySelector('.mw-body-content'))) {
				return def.resolve(body.innerHTML);
			} else {
				return def.resolve(undefined);
			}
		})
		.catch(function(err) {
			console.log(MP, err);
			return def.resolve(undefined);
		});
	return def.promise();
}

/**
 * Get the content of a given page.
 * @param {string} pagename
 * @param {boolean} [parseHtml] Returns HTML if true.
 * @returns {JQueryPromise<string|null|undefined>} Returns null if the page doesn't exist, undefined if the fetching fails.
 */
function read(pagename, parseHtml) {

	var prop = parseHtml ? 'text' : 'wikitext';
	var params = {
		action: 'parse',
		page: pagename,
		prop: prop,
		formatversion: '2'
	};
	if (parseHtml) {
		$.extend(params, {
			disablelimitreport: true,
			disableeditsection: true,
			disabletoc: true,
			preview: true
		});
	}

	return api.get(params)
		.then(function(res) {
			var resParse;
			return res && res.parse && (resParse = res.parse[prop]) !== undefined ? resParse : undefined;
		})
		.catch(function(code, err) {
			console.log(MP, err);
			return code === 'missingtitle' ? null : undefined;
		});

}

/**
 * Get the delete reason dropdown as an HTMLSelectElement.
 * @returns {JQueryPromise<HTMLSelectElement|undefined>}
 */
function getProtectReasonDropdown() {

	var msgName = 'protect-dropdown';
	var query = function() {
		return api.getMessages([msgName])
			.then(function(res) {
				return res && res[msgName] ? res[msgName] : undefined;
			})
			.catch(function(code, err) {
				console.error(MP, err);
				return undefined;
			});
	};

	return query().then(function(msg) {

		if (!msg) return;

		var wrapper = document.createElement('select');
		wrapper.innerHTML =
			'<optgroup label="その他の理由">' +
				'<option value="">その他の理由</option>' +
			'</optgroup>';

		var regex = /(\*+)([^*]+)/g;
		var m, optgroup;
		while ((m = regex.exec(msg))) {
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

/**
 * Get a list of vandalism-in-progress and long-term-abuse shortcuts in the form of wikilinks.
 * @returns {JQueryPromise<string[]>}
 */
function getAutocompleteSource() {

	/**
	 * @returns {JQueryPromise<string[]>}
	 */
	var getVipList = function() {

		// Parse section titles of the page that lists VIPs
		return api.get({
			action: 'parse',
			page: 'Wikipedia:進行中の荒らし行為',
			prop: 'sections',
			formatversion: '2'
		}).then(function(res) {

			var resSect;
			if (!res || !res.parse || !(resSect = res.parse.sections) || !resSect.length) return [];

			// Define sections tiltles that are irrelevant to VIP names
			var excludeList = [
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

			// Return links like '[[WP:VIP#NAME]]'
			return resSect.reduce(/** @param {string[]} acc */ function(acc, obj) {
				if (excludeList.indexOf(obj.line) === -1 && obj.level == 3) {
					acc.push('[[WP:VIP#' + obj.line + ']]');
				}
				return acc;
			}, []);

		}).catch(function(code, err) {
			console.log(MP, 'Failed to get a VIP list.', err);
			return [];
		});

	};

	/**
	 * @returns {JQueryPromise<string[]>}
	 */
	var getLtaList = function() {

		var ltalist = [];
		/**
		 * @param {string} [apcontinue]
		 * @returns {JQueryPromise<undefined>}
		 */
		var query = function(apcontinue) { // There might be more than 500 LTA shortcuts and if so, API queries need to be repeated

			// Get all page titles that start with 'LTA:'
			var params = {
				action: 'query',
				list: 'allpages',
				apprefix: 'LTA:',
				apnamespace: '0',
				apfilterredir: 'redirects',
				aplimit: 'max',
				formatversion: '2'
			};
			if (apcontinue) params.apcontinue = apcontinue;

			return api.get(params)
				.then(function(res) {

					var resPages;
					if (!res || !res.query || !(resPages = res.query.allpages) || !resPages.length) return;

					resPages.forEach(function(obj) {
						if (/^LTA:[^/]+$/.test(obj.title)) ltalist.push('[[' + obj.title + ']]'); // Push '[[LTA:NAME]]'
					});

					var resCont;
					return res.continue && (resCont = res.continue.apcontinue) ? query(resCont) : undefined;

				})
				.catch(function(code, err) {
					console.log(MP, 'Failed to get an LTA list.', err);
					return undefined;
				});

		};

		// Return an array when the queries are done
		return query().then(function() {
			return ltalist;
		});

	};

	// Run the asynchronous functions defined above
	var deferreds = [];
	deferreds.push(getVipList(), getLtaList());
	return $.when.apply($, deferreds).then(function(viplist, ltalist) {
		return viplist.concat(ltalist); // Return a merged array
	});

}

/**
 * @typedef ActionProtectDefaultParams
 * @type {{
 *	action: "protect";
 *	reason: string;
 *	tags?: string;
 *	cascade: boolean;
 *	watchlist: "nochange"|"preferences"|"unwatch"|"watch";
 *	watchlistexpiry?: string;
 *	curtimestamp: boolean;
 *	formatversion: "2";
 * }}
 */
/**
 * @typedef ExtendedParams
 * @type {{
 *	title: string;
 *	protections: string;
 *	expiry: string;
 * }}
 */
/**
 * @typedef ActionProtectParams
 * @type {ActionProtectDefaultParams & ExtendedParams}
 */
/**
 * An object of pagetitle-object pairs.
 * @typedef ActionProtectParamsPerTitle
 * @type {Object.<string, ActionProtectParamsPerTitleVal>}
 */
/**
 * @typedef ActionProtectParamsPerTitleVal
 * @type {object}
 * @property {ActionProtectParams} [params] Undefined if the page is not to be forwarded to action=protect
 * @property {HTMLLIElement} list
 * @property {HTMLSpanElement} progress
 * @property {HTMLSpanElement} [progress2] Has a value only if a protection tag is to be modified
 * @property {boolean} unprotect If true, a pp tag (if there's any) is to be removed and there's no need to confirm overwriting
 * @property {"confirmall"|"confirmprotect"|"proceed"} overwrite Whether to ask before overwriting the current protection settings
 * @property {RelativeExpiryDuration} [relative] Relative watchlist expiry. This property has a value only if 'add to watchlist' is
 * checked && this page is to be protected && 'relative expiry' is checked && the watchlist expiry isn't indefinite.
 */
/**
 * @typedef RelativeExpiryDuration
 * @type {"1 week"|"2 weeks"|"1 month"|"3 months"|"6 months"|"1 year"}
 */
/**
 * @typedef PpOptions
 * @type {object}
 * @property {false|string} addPp A string of a pp template only if the 'add Pp' option is enabled.
 * @property {boolean} removePp Whether to remove pp on unprotection
 * @property {boolean} removeRfp Whether to remove RFP templates. No need to look at this if the addPp property is a string.
 */

/**
 * Execute MassProtect.
 * @param {ActionProtectParamsPerTitle} paramObj
 * @param {PpOptions} ppOptions
 */
function massProtect(paramObj, ppOptions) {

	/**
	 * Update the display of a progress span.
	 * @param {HTMLSpanElement} span
	 * @param {string|boolean} err One of the following: string (error message), true (unknown error), or false (success)
	 * @param {boolean} [cancelled] When true, show 'cancelled (err)'. The 'err' param must be a string.
	 */
	var updateProgress = function(span, err, cancelled) {
		if (cancelled) {
			if (typeof err !== 'string') {
				console.error(MP, 'The value of "err" must be a string when "cancelled" is true.');
			}
			span.innerHTML = getIcon('cancelled').outerHTML + ' 中止' + (err ? ' (' + err + ')' : '');
		} else if (typeof err === 'string') {
			span.innerHTML = getIcon('failed').outerHTML + ' 失敗 (' + err + ')';
		} else if (err) {
			span.innerHTML = getIcon('failed').outerHTML + ' 失敗 (不明なエラー)';
		} else {
			span.innerHTML = getIcon('done').outerHTML + ' 成功';
		}
	};

	/**
	 * @typedef ApiResponseProtectionSuccess
	 * @type {object}
	 * @property {string} curtimestamp
	 * @property {Object.<string, string>[]} protections
	 */
	/**
	 * @param {ActionProtectParams} params
	 * @returns {JQueryPromise<string|ApiResponseProtectionSuccess>} Error message string on failure, otherwise a formatted object
	 */
	var protectPage = function(params) {
		return api.postWithToken('csrf', params)
			.then(function(res) {
				console.log(MP, res);
				var resProt;
				if (res && res.protect && (resProt = res.protect.protections)) {
					return {
						curtimestamp: res.curtimestamp,
						protections: resProt
					};
				} else {
					return '不明なエラー';
				}
			})
			.catch(function(code, err) {
				console.log(MP, err);
				// @ts-ignore
				return err && err.error && err.error.info ? err.error.info : code;
			});
	};

	/**
	 * @param {ApiResponseProtectionSuccess} prot
	 * @param {RelativeExpiryDuration} duration
	 * @returns {string}
	 */
	var getRelativeExpiry = function(prot, duration) {

		if (!prot.protections.length) return 'indefinite';

		// Get the longest expiry
		/** @type {Date} */
		var newestD;
		for (var i = 0; i < prot.protections.length; i++) {
			var exp = prot.protections[i].expiry;
			if (/^in/.test(exp)) {
				return 'indefinite';
			} else {
				// @ts-ignore
				if (!newestD || newestD < new Date(exp)) {
					newestD = new Date(exp);
				}
			}
		}

		// @ts-ignore
		var relativeExpD = newestD;
		switch (duration) {
			case '1 week':
				relativeExpD.setDate(relativeExpD.getDate() + 7);
				break;
			case '2 weeks':
				relativeExpD.setDate(relativeExpD.getDate() + 14);
				break;
			case '1 month':
				relativeExpD.setMonth(relativeExpD.getMonth() + 1);
				break;
			case '3 months':
				relativeExpD.setMonth(relativeExpD.getMonth() + 3);
				break;
			case '6 months':
				relativeExpD.setMonth(relativeExpD.getMonth() + 6);
				break;
			case '1 year':
				relativeExpD.setFullYear(relativeExpD.getFullYear() + 1);
		}

		var max = new Date(prot.curtimestamp);
		max.setFullYear(max.getFullYear() + 1);
		if (relativeExpD > max) {
			return 'indefinite';
		} else {
			return relativeExpD.toJSON();
		}

	};

	/**
	 * @param {string} pagetitle
	 * @returns {JQueryPromise<{redirect: boolean; content: string; basetimestamp: string; starttimestamp: string;}|string>}
	 * Returns a string in the case of some error.
	 */
	var getLatestRevision = function(pagetitle) {
		return api.get({
			action: 'query',
			titles: pagetitle,
			prop: 'info|revisions',
			rvprop: 'content',
			rvslots: 'main',
			curtimestamp: 1,
			formatversion: '2'
		}).then(function(res) {

			var resPages;
			if (!res || !res.query || !(resPages = res.query.pages) || !resPages.length) {
				return '不明なエラー';
			}

			var resObj = resPages[0];

			return {
				redirect: !!resObj.redirect,
				content: resObj.revisions[0].slots.main.content,
				basetimestamp: resObj.touched,
				starttimestamp: res.curtimestamp
			};

		}).catch(function(code, err) {
			console.log(MP, err);
			return code;
		});
	};

	/**
	 * @param {string} pagetitle
	 * @param {boolean} unprotect
	 * @returns {JQueryPromise<{
	 *	result: "success"|"fail"|"cancel";
	 *	message: string;
	 * }>}
	 */
	var modifyPp = function(pagetitle, unprotect) {
		var def = $.Deferred();
		getLatestRevision(pagetitle).then(function(obj) {

			if (typeof obj === 'string') { // Failed to get the latest revision
				return def.resolve({result: 'fail', message: obj});
			}
			var content = obj.content;
			var originalContent = obj.content;

			// Get templates to remove
			/** @type {(name: string) => boolean} */
			var namePredicate;
			if (!unprotect && !ppOptions.addPp && ppOptions.removeRfp) {
				namePredicate = function(name) {
					return name === '保護依頼';
				};
			} else {
				var replacees = ['Pp', '保護', '半保護', '拡張半保護', '保護依頼', '保護運用', '移動保護', '移動拡張半保護'];
				namePredicate = function(name) {
					return /^Pp-/.test(name) || replacees.indexOf(name) !== -1;
				};
			}
			var templates = parseTemplates(content, {namePredicate: namePredicate});

			// Remove the templates (and a trailing line break), and also remove empty noinclude tags if the resulting content has any
			if (templates.length) {
				(function() {

					// Temporarily remove strip markers that prevent transclusion
					var stripMarkersRegex = /<!--[\s\S]*?-->|<(nowiki|pre|syntaxhighlight|source|math)[\s\S]*?<\/\1\s*>/gi;
					var idx = 0;
					/** @type {string[]} */
					var sm = [];
					var m;
					while ((m = stripMarkersRegex.exec(content))) {
						content = content.replace(m[0], '$SM' + (idx++));
						sm.push(m[0]);
					}

					// Template removal
					templates.forEach(function(Template) {
						content = content.replace(new RegExp(mw.util.escapeRegExp(Template.text) + '\\n?'), '');
					});
					content = content.replace(/<noinclude>\s*?<\/noinclude>[^\S\n\r]*\n?|\/\*\s*?\*\/[^\S\n\r]*\n?/gm, '');

					// Get strip markers back
					sm.forEach(function(marker, i) {
						content = content.replace('$SM' + i, marker);
					});

				})();
			}

			// Insert Pp
			if (ppOptions.addPp && !unprotect) {

				var pp = ppOptions.addPp;
				if (obj.redirect) { // If the page is a redirect

					content = content.trim(); // Redirects might have leading line breaks

					// Insert pp in the second line
					if (content.indexOf('\n') === -1) { // If the redirect doesn't have a line break
						content += '\n' + pp;
					} else {
						content = content.replace('\n', '\n' + pp + '\n');
					}

				} else {

					var nsNum = getNamespaceNumber(pagetitle);
					var isWikipedia = nsNum === 4;
					var isTemplate = nsNum === 10;
					var bool;

					// On a CSS page in the Template namespace
					if (isTemplate && /\.css$/.test(pagetitle)) {

						// Insert a commented-out pp
						content = '/* ' + pp + ' */' + '\n' + content;

					// On a template or on a subpage in the Wikipedia namespace
					} else if (isTemplate || (bool = isWikipedia && pagetitle.indexOf('/') !== -1)) {

						// Prevent transclusion
						content = '<noinclude>' + pp + '</noinclude>' + (bool ? '\n' : '') + content;

					// On ordinary pages, just prepend the pp
					} else {
						content = pp + '\n' + content;
					}

				}

			}

			// Don't edit page if the content is the same
			if (content === originalContent) {
				var msg;
				if (unprotect) {
					msg = '保護タグなし';
				} else {
					if (ppOptions.addPp) {
						msg = '同じ内容';
					} else {
						msg = '保護依頼タグなし';
					}
				}
				return def.resolve({result: 'cancel', message: msg});
			}

			// Edit page
			var summary;
			if (unprotect) {
				summary = '[[Template:Pp|保護テンプレート]]の除去';
			} else {
				if (ppOptions.addPp) {
					summary = ppOptions.addPp;
				} else {
					summary = '-{{保護依頼}}';
				}
			}
			api.postWithEditToken({
				action: 'edit',
				title: pagetitle,
				text: content,
				summary: summary,
				minor: 1,
				basetimestamp: obj.basetimestamp,
				starttimestamp: obj.starttimestamp,
				nocreate: 1,
				watchlist: 'nochange',
				// @ts-ignore
				tags: mw.config.get('wgDBname') === 'jawiki' ? MP : undefined,
				formatversion: '2'
			}).then(function(res) {
				if (res && res.edit && res.edit.result === 'Success') {
					def.resolve({result: 'success', message: ''});
				} else {
					def.resolve({result: 'fail', message: '不明なエラー'});
				}
			}).catch(function(code, err) {
				console.log(MP, err);
				// @ts-ignore
				def.resolve({result: 'fail', message: err && err.error && err.error.info ? err.error.info : code});
			});

		});
		return def.promise();
	};

	var pagetitles = Object.keys(paramObj);

	/**
	 * Execute protection and template pasting for a page. The titles in the list are processed sequentially.
	 * @param {number} index
	 */
	var execute = function(index) {

		var page = pagetitles[index];
		if (!page) { // When the index exceeds the length of the pagetitle array after recursive calls of this function
			mw.notify('処理が完了しました', {type: 'success'});
			return;
		}

		var params = paramObj[page].params;
		var progress = paramObj[page].progress;
		var progress2 = paramObj[page].progress2;
		var unprotect = paramObj[page].unprotect;
		var overwrite = paramObj[page].overwrite;
		var relative = paramObj[page].relative;
		paramObj[page].list.scrollIntoView(false); // Make sure that this list item is visible at the bottom of the page list

		// API parameters not having been prepared means that this page should be skipped
		if (!params) {
			updateProgress(progress, 'スキップ対象', true);
			if (progress2) {
				updateProgress(progress2, '', true);
			}
			execute(++index);
			return;
		}

		// Get the current protection settings. This could be done all at once for all the pages at the beginning of the procedure,
		// but list=logevents is limited to one page and if the target pages are too many, an ERR_INSUFFICIENT_RESOURCES error may result.
		getProtectionLogs([page]).then(function(status) {

			var s = status[page];

			// Skip if the page is to be unprotected but it's not protected
			if (unprotect && s && !s.current) {
				updateProgress(progress, '保護設定なし', true);
				if (progress2) {
					updateProgress(progress2, '', true);
				}
				execute(++index);
				return;
			}

			// Check whether we need to overwrite protection settings
			/** @returns {JQueryPromise<boolean>} */
			var proceed = function() {
				if (overwrite !== 'proceed') {
					var dialog;
					if (!s) { // Failed to fetch the current protection status; ask the user to check it manually
						dialog =
							'<div>' +
								'<p>' +
									'現在の保護設定の取得に失敗しました。続行するか手動で確認してください。<br>' +
									'<a href="' + mw.util.getUrl(page) + '" target="_blank">' + page + '</a> (' +
									'<a href="' + mw.util.getUrl(page, {action: 'history'}) + '" target="_blank">履歴</a> | ' +
									'<a href="' + mw.util.getUrl('Special:Log/protect', {page: page}) + '" target="_blank">保護記録</a> | ' +
									'<a href="' + mw.util.getUrl(page, {action: 'info'}) + '" target="_blank">情報</a>)' +
								'</p>' +
							'</div>';
						return dConfirm($(dialog));
					} else if (s.current) { // Page currently protected. Show information and ask the user whether to proceed
						if (unprotect) {
							if (overwrite === 'confirmall') { // Confirm both protect and unprotect
								dialog =
								'<div>' +
									'<p>' +
										'「' + page + '」の保護を<b>解除</b>します<br>' +
										'<br>保護者: ' + s.current.user +
										'<br>保護日時: ' + s.current.timestamp.replace(/Z$/, '') +
										'<br>現在時刻: ' + new Date().toJSON().replace(/\.\d{3}Z$/, '') +
										'<br>保護設定: ' + s.current.level.join(', ') +
										'<br>保護理由: ' + s.current.reason +
										'<br><br>よろしいですか？' +
									'</p>' +
								'</div>';
								return dConfirm($(dialog));
							} else { // overwrite === 'confirmprotect'
								return $.Deferred().resolve(true);
							}
						} else {
							// Ask the user to overwrite current protection both on overwrite === 'confirmall' and overwrite === 'confirmprotect'
							dialog =
							'<div>' +
								'<p>' +
									'「' + page + '」は既に保護されています<br>' +
									'<br>保護者: ' + s.current.user +
									'<br>保護日時: ' + s.current.timestamp.replace(/Z$/, '') +
									'<br>現在時刻: ' + new Date().toJSON().replace(/\.\d{3}Z$/, '') +
									'<br>保護設定: ' + s.current.level.join(', ') +
									'<br>保護理由: ' + s.current.reason +
									'<br><br>保護設定を上書きしますか？' +
								'</p>' +
							'</div>';
							return dConfirm($(dialog));
						}
					} else { // Page currently not protected; just proceed
						return $.Deferred().resolve(true);
					}
				} else { // The confirm-to-overwrite option is disabled; no pre-check before page protection
					return $.Deferred().resolve(true);
				}
			};

			proceed().then(function(proceedToProtect) {

				if (!proceedToProtect) { // User has chosen to not overwrite protection settings
					updateProgress(progress, '上書き防止', true);
					if (progress2) {
						updateProgress(progress2, '', true);
					}
					execute(++index);
					return;
				}

				// @ts-ignore "params" can't be undefined here
				protectPage(params).then(function(result) { // Send an API request to (un)protect the page

					// Show result
					if (typeof result === 'string') { // Failed
						updateProgress(progress, result);
					} else { // Succeeded
						updateProgress(progress, false);
						if (relative) {
							api.watch(page, getRelativeExpiry(result, relative))
								.then(function(res) {
									console.log(MP, res);
								})
								.catch(function(code, err) {
									console.log(MP, err);
								});
						}
					}

					// Check whether to end here or proceed to template modification
					if (!progress2) { // If no pp tag is to be modified
						execute(++index); // End here and go for next title
						return;
					} else { // If pp tag is to be modified
						if (typeof result === 'string') { // End here if protection failed
							updateProgress(progress2, '保護' + (unprotect ? '解除' : '') + '失敗', true);
							execute(++index);
							return;
						}
					} // Else, proceed

					modifyPp(page, unprotect).then(function(res) {
						switch (res.result) {
							case 'success':
								// @ts-ignore progress2 can't be undefined
								updateProgress(progress2, false);
								break;
							case 'fail':
								// @ts-ignore
								updateProgress(progress2, res.message);
								break;
							case 'cancel':
								// @ts-ignore
								updateProgress(progress2, res.message, true);
						}
						execute(++index);
					});

				});

			});

		});

	};

	execute(0);

}

/**
 * An alternative to window.confirm, by a dialog.
 * @param {JQuery<HTMLDivElement>} $dialog
 * @returns {JQueryPromise<boolean>}
 */
function dConfirm($dialog) {
	var def = $.Deferred();
	var bool = false;
	$dialog.prop('title', MP + ' - Confirm');
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

})();
//</nowiki>
