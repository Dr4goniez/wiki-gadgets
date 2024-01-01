/************************************************
	SpurLink
	@author [[User:Dragoniez]]
	@version 2.2.0
*************************************************/
// @ts-check
/* global mw */
//<nowiki>
(function() {

// **************************************************** INITIALIZATION ****************************************************

/**
 * @type {Object.<string, Config>}
 * @typedef Config
 * @property {string} Config.url
 * @property {string} Config.label
 * @property {boolean} Config.enabled
 * @property {boolean} Config.cidr
 * @property {boolean} Config.track
 * @property {Array<string>} Config.checked
 * @property {Array<string>} Config.proxy
 */
var defaultCfg = {
	spur: {
		label: 'SPUR',
		url: '//spur.us/context/$1',
		cidr: false,
		track: true,
		enabled: true,
		checked: [],
		proxy: []
	},
	ipqs: {
		label: 'IPQS',
		url: '//www.ipqualityscore.com/free-ip-lookup-proxy-vpn-test/lookup/$1',
		cidr: false,
		track: true,
		enabled: true,
		checked: [],
		proxy: []
	}
};

var image = {
	loading: (function() {
		var img = document.createElement('img');
		img.style.cssText = 'vertical-align: middle; height: 1em; border: 0;';
		img.src = '//upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif';
		return img;
	})(),
	check: (function() {
		var img = document.createElement('img');
		img.style.cssText = 'vertical-align: middle; height: 1em; border: 0;';
		img.src = '//upload.wikimedia.org/wikipedia/commons/f/fb/Yes_check.svg';
		return img;
	})(),
	cross: (function() {
		var img = document.createElement('img');
		img.style.cssText = 'vertical-align: middle; height: 1em; border: 0;';
		img.src = '//upload.wikimedia.org/wikipedia/commons/a/a2/X_mark.svg';
		return img;
	})()
};

var userGroupsWithApiHighlimits = [
	'bot',
	'sysop',
	'apihighlimits-requestor',
	'founder',
	'global-bot',
	'global-sysop',
	'staff',
	'steward',
	'sysadmin',
	'wmf-researcher'
];
/** @type {boolean} */
// @ts-ignore
var hasApiHighlimits = mw.config.get('wgUserGroups').concat(mw.config.get('wgGlobalGroups') || []).some(function(group) {
	return userGroupsWithApiHighlimits.indexOf(group) !== -1;
});

/** @readonly */
var optionName = 'userjs-sl-config';

if (localStorage.getItem('SpurLinkConfigModified') === null) localStorage.setItem('SpurLinkConfigModified', '0');
/** @type {string} */
// @ts-ignore
var initialSLCM = localStorage.getItem('SpurLinkConfigModified');

/**
 * Check whether the value of SLCM is the same as when the tab was opened
 * @returns {boolean}
 */
var evaluateSLCM = function() {
	return initialSLCM !== localStorage.getItem('SpurLinkConfigModified');
};

/**
 * Update SLMC
 * @returns {void}
 */
var updateSLCM = function() {
	// @ts-ignore
	var storageVal = parseInt(localStorage.getItem('SpurLinkConfigModified'));
	var newVal = (++storageVal).toString();
	localStorage.setItem('SpurLinkConfigModified', newVal);
	initialSLCM = newVal;
};

$.when(mw.loader.using(['mediawiki.util', 'mediawiki.api', 'mediawiki.user']), $.ready).then(init);

// **************************************************** MAIN FUNCTIONS ****************************************************

var api;
/** Entry point */
function init() {

	if (['edit', 'submit'].indexOf(mw.config.get('wgAction')) !== -1 && !document.querySelector('.mw-message-box-warning')) {
		return;
	}

	api = new mw.Api();
	createStyleTag();

	// Main procedure
	if (mw.config.get('wgNamespaceNumber') === -1 && /^(spurlinkconfig|slc)$/i.test(mw.config.get('wgTitle'))) { // When on the config page
		createConfigPage();
	} else {

		createPortletlink(); // Create a portletlink to the config page

		// Hook up a function that generates IP toollinks
		var hookTimeout;
		mw.hook('wikipage.content').add(function() {
			clearTimeout(hookTimeout); // Prevent hook from being fired multiple times
			hookTimeout = setTimeout(addLinks, 100);
		});

		// On Special:Recentchanges and Special:Watchlist, auto-update the page ashchronously after getting the updated config
		if (['Recentchanges', 'Watchlist'].indexOf(mw.config.get('wgCanonicalSpecialPageName') || '') !== -1) {
			window.addEventListener('storage', function(e) {
				if (e.key !== 'SpurLinkConfigModified') return;
				api.get({
					action: 'query',
					meta: 'userinfo',
					uiprop: 'options',
					formatversion: '2'
				}).then(function(res) {
					var cfg;
					if (res && res.query && res.query.userinfo && res.query.userinfo.options && (cfg = res.query.userinfo.options[optionName])) {
						mw.user.options.set(optionName, cfg);
						// @ts-ignore
						initialSLCM = localStorage.getItem('SpurLinkConfigModified');
						// @ts-ignore
						document.querySelector('.mw-rcfilters-ui-filterWrapperWidget-showNewChanges > a').click();
						if (res.query.userinfo.options['userjs-sl-history']) api.saveOption('userjs-sl-history', null);
					}
				});
			});
		}

	}

}

/** Create \<style> in \<head> tag */
function createStyleTag() {
	var style = document.createElement('style');
	style.textContent =
	// ==== Main selectors ====
	'.sl-toollink[data-status="checked"]::after {' +
		'content: "C";' +
		'color: orange;' +
		'font-weight: bold;' +
		'vertical-align: super;' +
		'font-size: smaller;' +
	'}' +
	'.sl-toollink[data-status="proxy"]::after {' +
		'content: "P";' +
		'color: red;' +
		'font-weight: bold;' +
		'vertical-align: super;' +
		'font-size: smaller;' +
	'}' +
	'.sl-toollink-bare::before {' +
		'content: " | ";' +
	'}' +
	// ==== Selectors on config page ====
	// Order swapping buttons
	// Hide the buttons for fixed options
	'#slc-container fieldset:nth-child(-n+2) .slc-toollink-swapup,' +
	'#slc-container fieldset:nth-child(-n+2) .slc-toollink-swapdown {' +
		'display: none;' +
	'}' +
	// Hide buttons in field 3 when field 3 is the only optional field
	'#slc-container fieldset:first-child:nth-last-child(3) ~ fieldset .slc-toollink-swapup,' +
	'#slc-container fieldset:first-child:nth-last-child(3) ~ fieldset .slc-toollink-swapdown {' +
		'display: none;' +
	'}' +
	// Show only 'down' for field 3 and 'up' for field 4 when field 3 and 4 is the only optional fields
	'#slc-container fieldset:first-child:nth-last-child(4) ~ fieldset:nth-child(3) .slc-toollink-swapup,' +
	'#slc-container fieldset:first-child:nth-last-child(4) ~ fieldset:nth-child(4) .slc-toollink-swapdown {' +
		'display: none;' +
	'}' +
	// Show only 'down' for field 3 and 'up' for the last field when there are 3 or more optional fields
	'#slc-container fieldset:first-child:nth-last-child(n+5) ~ fieldset:nth-child(3) .slc-toollink-swapup,' +
	'#slc-container fieldset:first-child:nth-last-child(n+5) ~ fieldset:last-child .slc-toollink-swapdown {' +
		'display: none;' +
	'}' +
	// IP List toollinks
	'.slc-toollink-iplist-toollinks::before {' +
		'content: " (";' +
	'}' +
	'.slc-toollink-iplist-toollinks::after {' +
		'content: ")";' +
	'}' +
	'.slc-toollink-iplist-toollinks > span:not(:first-child)::before {' +
		'content: " | ";' +
	'}';
	document.head.appendChild(style);
}

/** Create the content of the config page */
function createConfigPage() {

	// Create page contour
	document.title = 'SpurLinkの設定 - Wikipedia';
	var container = document.createElement('div');
	container.id = 'slc-container';
	var cbody = document.createElement('div');
	cbody.id = 'slc-config-body';
	container.appendChild(cbody);

	/**
	 * Create a textbox with a label on its left
	 * @param {HTMLElement} appenedTo
	 * @param {string} id slc-toollink-xxx-
	 * @param {string} labelText
	 * @param {string} textboxValue
	 * @param {boolean} [disabled]
	 * @returns {HTMLDivElement}
	 */
	var createLabeledTextbox = function(appenedTo, id, labelText, textboxValue, disabled) {

		var wrapper = document.createElement('div');
		wrapper.style.marginBottom = '0.2em';

		var label = document.createElement('label');
		label.textContent = labelText;
		label.style.cssText = 'display: inline-block; width: 8ch;';
		label.htmlFor = id;
		wrapper.appendChild(label);
		var input = document.createElement('input');
		input.type = 'text';
		input.style.width = '50%';
		input.id = id;
		input.classList.add(id.replace(/-\d+$/, ''));
		if (textboxValue) input.value = textboxValue;
		if (disabled) {
			input.disabled = true;
			input.classList.add('slc-toollink-disabled');
		}
		wrapper.appendChild(input);

		appenedTo.appendChild(wrapper);

		return wrapper;

	};

	/**
	 * Create a checkbox with a label on its right
	 * @param {HTMLElement} appenedTo
	 * @param {string} id slc-toollink-xxx-
	 * @param {string} labelText
	 * @param {boolean} checked
	 * @param {boolean} [disabled]
	 * @returns {HTMLDivElement}
	 */
	var createLabeledCheckbox = function(appenedTo, id, labelText, checked, disabled) {

		var wrapper = document.createElement('div');

		var input = document.createElement('input');
		input.type = 'checkbox';
		input.style.marginRight = '0.5em';
		input.id = id;
		input.classList.add(id.replace(/-\d+$/, ''));
		if (checked) input.checked = !!checked;
		if (disabled) {
			input.disabled = true;
			input.classList.add('slc-toollink-disabled');
		}
		wrapper.appendChild(input);
		var label = document.createElement('label');
		label.textContent = labelText;
		label.htmlFor = id;
		wrapper.appendChild(label);

		appenedTo.appendChild(wrapper);

		return wrapper;

	};

	/**
	 * Create functional buttons for checkboxes (check all, uncheck all, invert checks)
	 * @param {HTMLElement} appendTo
	 * @returns {HTMLDivElement}
	 */
	var createCheckboxFunctors = function(appendTo) {

		var checker = document.createElement('div');
		checker.classList.add('slc-toollink-iplist-checkbox-buttons');
		checker.appendChild(document.createTextNode('選択: '));

		var chkAll = document.createElement('a');
		chkAll.classList.add('slc-toollink-iplist-checkbox-all');
		chkAll.type = 'button';
		chkAll.textContent = 'すべて';
		checker.appendChild(chkAll);
		checker.appendChild(document.createTextNode('、'));
		var chkNone = document.createElement('a');
		chkNone.classList.add('slc-toollink-iplist-checkbox-none');
		chkNone.type = 'button';
		chkNone.textContent = 'なし';
		checker.appendChild(chkNone);
		checker.appendChild(document.createTextNode('、'));
		var chkInvert = document.createElement('a');
		chkInvert.classList.add('slc-toollink-iplist-checkbox-invert');
		chkInvert.type = 'button';
		chkInvert.textContent = '反転';
		checker.appendChild(chkInvert);
		appendTo.appendChild(checker);

		return checker;

	};

	// Event handler for checkbox functors
	$(document).off('click', '.slc-toollink-iplist-checkbox-buttons a').on('click', '.slc-toollink-iplist-checkbox-buttons a', function() {
		/** @type {NodeListOf<HTMLInputElement>} */
		var checkboxes = this.parentNode.parentNode.querySelectorAll('ol input[type="checkbox"]');
		if (this.classList.contains('slc-toollink-iplist-checkbox-all')) {
			checkboxes.forEach(function(ch) { ch.checked = true; });
		} else if (this.classList.contains('slc-toollink-iplist-checkbox-none')) {
			checkboxes.forEach(function(ch) { ch.checked = false; });
		} else if (this.classList.contains('slc-toollink-iplist-checkbox-invert')) {
			checkboxes.forEach(function(ch) { ch.checked = !ch.checked; });
		}
	});

	/** @type {Array<string>} */
	var allIps = []; // Stores all the saved IPs
	var chCnt = 0; // For the id/for attributes of checkbox/label

	/**
	 * Create a list of saved IPs
	 * @param {HTMLElement} appendTo
	 * @param {Config} cfgObj
	 * @returns {HTMLDivElement}
	 */
	var createIpList = function(appendTo, cfgObj) {

		var wrapper = document.createElement('div');
		wrapper.classList.add('slc-toollink-iplist-wrapper');
		wrapper.appendChild(document.createTextNode('登録済みIP '));
		if (cfgObj.checked.length === 0 && cfgObj.proxy.length === 0) {
			wrapper.style.display = 'none';
		}

		var toggle = document.createElement('span');
		toggle.appendChild(document.createTextNode('['));
		var toggleA = document.createElement('a');
		toggleA.classList.add('slc-toollink-iplist-toggle');
		toggleA.textContent = '表示';
		toggle.appendChild(toggleA);
		toggle.appendChild(document.createTextNode(']'));
		wrapper.appendChild(toggle);

		var ipList = document.createElement('div');
		ipList.style.backgroundColor = 'rgba(239, 239, 239, 0.3)';
		ipList.style.border = '1px solid rgba(118, 118, 118, 0.3)';
		ipList.style.padding = '0.3em';
		ipList.classList.add('slc-toollink-iplist');
		ipList.style.display = 'none';
		['checked', 'proxy'].forEach(function(arrKey) {

			var ipInnerList = document.createElement('div');
			ipInnerList.classList.add('slc-toollink-iplist-' + arrKey);

			var b = document.createElement('b');
			b.textContent = arrKey;
			ipInnerList.appendChild(b);

			createCheckboxFunctors(ipInnerList);

			var ol = document.createElement('ol');
			cfgObj[arrKey].forEach(function(ip) {

				if (allIps.indexOf(ip) === -1) allIps.push(ip);
				var isCidr = /\/\d{1,3}$/.test(ip);

				var li = document.createElement('li');
				li.dataset.ip = ip;
				var id = 'ch' + (++chCnt);
				var checkbox = document.createElement('input');
				checkbox.type = 'checkbox';
				checkbox.style.cssText = 'margin-left: 0.5em; margin-right: 0.5em;';
				checkbox.id = id;
				li.appendChild(checkbox);
				var label = document.createElement('label');
				label.textContent = 'IP:' + ip;
				label.htmlFor = id;
				li.appendChild(label);
				var toollinks = document.createElement('span');
				toollinks.classList.add('slc-toollink-iplist-toollinks');
				li.appendChild(toollinks);

				if (!isCidr) {
					var aTalk = document.createElement('a');
					aTalk.classList.add('slc-toollink-iplist-toollinks-talk');
					aTalk.dataset.ip = ip;
					aTalk.href = mw.config.get('wgArticlePath').replace('$1', 'User_talk:' + ip);
					aTalk.textContent = '会話';
					aTalk.target = '_blank';
					var span = document.createElement('span');
					span.appendChild(aTalk);
					toollinks.appendChild(span);
				}

				var aContribs = document.createElement('a');
				aContribs.classList.add('slc-toollink-iplist-toollinks-contribs');
				aContribs.dataset.ip = ip;
				aContribs.href = mw.config.get('wgArticlePath').replace('$1', 'Special:Contributions/' + ip);
				aContribs.textContent = '投稿記録';
				aContribs.target = '_blank';
				var aContribsSpan = document.createElement('span');
				aContribsSpan.appendChild(aContribs);
				toollinks.appendChild(aContribsSpan);

				var aBlockLog = document.createElement('a');
				aBlockLog.classList.add('slc-toollink-iplist-toollinks-blocklog');
				aBlockLog.dataset.ip = ip;
				aBlockLog.href = mw.config.get('wgScript') + '?title=Special:Log/block&page=User:' + ip;
				aBlockLog.textContent = 'ブロック記録';
				aBlockLog.target = '_blank';
				var aBlockLogSpan = document.createElement('span');
				aBlockLogSpan.appendChild(aBlockLog);
				toollinks.appendChild(aBlockLogSpan);

				var blockStatus = document.createElement('span');
				blockStatus.dataset.ip = ip;
				blockStatus.classList.add('slc-toollink-iplist-blockstatus');
				li.appendChild(blockStatus);

				ol.appendChild(li);

			});
			if (!ol.querySelector('li')) ipInnerList.style.display = 'none'; // Hide this list if no IP is saved in it
			ipInnerList.appendChild(ol);

			if (cfgObj[arrKey].length > 30) createCheckboxFunctors(ipInnerList);

			var removeChecked = document.createElement('input');
			removeChecked.type = 'button';
			removeChecked.value = '選択したIPを除去';
			removeChecked.classList.add('slc-toollink-iplist-rmchecked');
			removeChecked.addEventListener('click', function() {
				var posY = window.scrollY;
				var removedElementHeight = 0;
				var li, styles, yMargin, outerHeight;
				if ((li = ol.querySelector('li'))) { // This could be included in the loop but that will be very slow
					styles = window.getComputedStyle(li);
					yMargin = parseFloat(styles.marginTop) + parseFloat(styles.marginBottom);
					outerHeight = li.offsetHeight + yMargin; // Get the outerHeight of li, including margin
				}
				ol.querySelectorAll('li input[type="checkbox"]:checked').forEach(function(checkedBox) {
					var pr;
					if ((pr = checkedBox.parentElement)) {
						if (typeof outerHeight === 'undefined') outerHeight = pr.offsetHeight;
						removedElementHeight += outerHeight;
						pr.remove();
					}
				});
				window.scrollTo(window.scrollX, posY - removedElementHeight);
				if (!ol.querySelector('li')) ipInnerList.style.display = 'none';
				var $wrapper = $(wrapper);
				if (!$wrapper.find('ol:visible').length) { // Hide the entire wrapper div if there's no item left in the list
					wrapper.style.display = 'none';
					$wrapper.next('input').css('margin-top', '0.2em'); // Modify the top margin of the remove button, if there's any
				}
			});
			ipInnerList.appendChild(removeChecked);

			ipList.appendChild(ipInnerList);

		});

		toggleA.addEventListener('click', function() { // Event listner for the show/hide button
			var $ipList = $(ipList);
			$ipList.toggle();
			var $removeBtn = $(wrapper).next('input');
			if ($ipList.find(':visible').length) {
				this.textContent = '隠す';
				$removeBtn.css('margin-top', '1em');
			} else {
				this.textContent = '表示';
				$removeBtn.css('margin-top', '0.2em');
			}
		});

		wrapper.appendChild(ipList);
		appendTo.appendChild(wrapper);
		return wrapper;

	};

	var toolLinkCnt = 0;
	var resetToollinkNumbers = function() {
		var legends = container.getElementsByTagName('legend');
		for (var i = 0; i < legends.length; i++) {
			var l = legends[i];
			l.textContent = 'ツールリンク' + (i + 1);
		}
		toolLinkCnt = i;
	};

	/**
	 * Create a set of config options as a fieldset
	 * @param {Config} [cfgObj]
	 * @return {HTMLFieldSetElement}
	 */
	var createConfigOptions = function(cfgObj) {

		// Contour fieldset
		var fieldset = document.createElement('fieldset');
		var legend = document.createElement('legend');
		legend.textContent = 'ツールリンク' + (++toolLinkCnt);
		legend.style.fontWeight = 'bold';
		fieldset.appendChild(legend);

		// Order swapper
		var swapper = document.createElement('div');
		swapper.style.float = 'right';
		fieldset.appendChild(swapper);
		var up = document.createElement('img');
		up.src = '//upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Skip_to_top3.svg/50px-Skip_to_top3.svg.png';
		up.style.width = '2em';
		var upA = document.createElement('a');
		upA.type = 'button';
		upA.classList.add('slc-toollink-swapup');
		upA.appendChild(up);
		swapper.appendChild(upA);
		var down = document.createElement('img');
		down.src = '//upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Skip_to_bottom3.svg/50px-Skip_to_bottom3.svg.png';
		down.style.width = '2em';
		var downA = document.createElement('a');
		downA.type = 'button';
		downA.classList.add('slc-toollink-swapdown');
		downA.appendChild(down);
		swapper.appendChild(downA);

		// Options
		var disabled = typeof cfgObj !== 'undefined' && toolLinkCnt < 3;
		createLabeledTextbox(fieldset, 'slc-toollink-label-' + toolLinkCnt, 'ラベル', cfgObj ? cfgObj.label : '', disabled);
		createLabeledTextbox(fieldset, 'slc-toollink-url-' + toolLinkCnt, 'URL', cfgObj ? cfgObj.url : '', disabled);
		createLabeledCheckbox(fieldset,'slc-toollink-cidr-' + toolLinkCnt, 'CIDR', cfgObj ? cfgObj.cidr : false, disabled);
		createLabeledCheckbox(fieldset,'slc-toollink-track-' + toolLinkCnt, '履歴保存', cfgObj ? cfgObj.track : false, disabled);
		createLabeledCheckbox(fieldset,'slc-toollink-enabled-' + toolLinkCnt, '有効化', cfgObj ? cfgObj.enabled: true);
		if (cfgObj) createIpList(fieldset, cfgObj);

		// Remove button
		if (toolLinkCnt > 2) { // No preset config, newly added one
			var removeBtn = document.createElement('input');
			removeBtn.type = 'button';
			removeBtn.value = 'フィールドを除去';
			removeBtn.style.marginTop = '0.2em';
			removeBtn.classList.add('slc-toollink-remove');
			removeBtn.addEventListener('click', function() {
				$(this).closest('fieldset').remove();
				resetToollinkNumbers();
			});
			fieldset.appendChild(removeBtn);
		}

		cbody.appendChild(fieldset);
		return fieldset;

	};

	// Loop every key of the config object and create options
	var cfg = mergeConfig();
	Object.keys(cfg).forEach(function(key) {
		var cfgObj = cfg[key];
		createConfigOptions(cfgObj);
	});

	// Button to add a new field
	var addBtnWrapper = document.createElement('div');
	addBtnWrapper.style.marginTop = '0.5em';
	var addBtn = document.createElement('input');
	addBtn.type = 'button';
	addBtn.value = 'フィールドを追加';
	addBtnWrapper.appendChild(addBtn);
	container.appendChild(addBtnWrapper);
	addBtn.addEventListener('click', function() {
		var fieldset = createConfigOptions();
		fieldset.scrollIntoView({behavior: 'smooth'});
	}, false);

	// Button to save config
	var saveBtnWrapper = document.createElement('div');
	saveBtnWrapper.style.marginTop = '0.5em';
	var saveBtn = document.createElement('input');
	saveBtn.type = 'button';
	saveBtn.value = '設定を保存';
	saveBtnWrapper.appendChild(saveBtn);
	container.appendChild(saveBtnWrapper);
	var saveMsg = document.createElement('p');
	saveMsg.style.display = 'none';
	container.appendChild(saveMsg);

	// Event listener for the save button
	var saveMsgTimeout;
	saveBtn.addEventListener('click', function() {

		/** @type {Array<HTMLFieldSetElement>} */
		var fields = Array.prototype.slice.call(container.getElementsByTagName('fieldset'));
		/** @type {Object.<string, Config>} */
		var newCfg = {};
		/** @type {Array<string>} */
		var lackingLabel = [];

		fields.forEach(function(fs) {

			var toollinkName = fs.getElementsByTagName('legend')[0].textContent || '';
			var cfgObj = {
				/** @type {HTMLInputElement} */
				// @ts-ignore
				label: fs.querySelector('.slc-toollink-label'),
				/** @type {HTMLInputElement} */
				// @ts-ignore
				url: fs.querySelector('.slc-toollink-url'),
				/** @type {HTMLInputElement} */
				// @ts-ignore
				cidr: fs.querySelector('.slc-toollink-cidr'),
				/** @type {HTMLInputElement} */
				// @ts-ignore
				track: fs.querySelector('.slc-toollink-track'),
				/** @type {HTMLInputElement} */
				// @ts-ignore
				enabled: fs.querySelector('.slc-toollink-enabled'),
				/** @type {Array<HTMLLIElement>} */
				checked: Array.prototype.slice.call(fs.querySelectorAll('.slc-toollink-iplist-checked ol li')),
				/** @type {Array<HTMLLIElement>} */
				proxy: Array.prototype.slice.call(fs.querySelectorAll('.slc-toollink-iplist-proxy ol li')),
			};
			if (Object.keys(cfgObj).some(function(key) { return !cfgObj[key]; })) {
				throw new Error('Selector not found.');
			}

			/** @type {Array<string>} */
			var accmulator = [];
			var cfgKey = cfgObj.label.value.trim();
			if (!cfgKey) {
				lackingLabel.push(toollinkName);
				return;
			} else {
				cfgKey = cfgKey.toLowerCase();
				newCfg[cfgKey] = {
					label: cfgObj.label.value,
					url: cfgObj.url.value.replace(/^https?:/, ''),
					cidr: cfgObj.cidr.checked,
					track: cfgObj.track.checked,
					enabled: cfgObj.enabled.checked,
					checked: cfgObj.checked.reduce(function(acc, li) {
						var ip = li.dataset.ip;
						if (ip && acc.indexOf(ip) === -1) acc.push(ip);
						return acc;
					}, accmulator.slice()),
					proxy: cfgObj.proxy.reduce(function(acc, li) {
						var ip = li.dataset.ip;
						if (ip && acc.indexOf(ip) === -1) acc.push(ip);
						return acc;
					}, accmulator.slice())
				};
			}

		});

		// Are the necessary fields filled?
		if (lackingLabel.length !== 0) {
			return alert('以下のツールリンクのラベルが設定されていません\n\n' + lackingLabel.join('\n'));
		}

		// Send an API request
		/** @type {NodeListOf<HTMLInputElement>} */
		var toDisable = container.querySelectorAll('input:not(.slc-toollink-disabled)');
		toDisable.forEach(function(el) { el.disabled = true; });
		clearTimeout(saveMsgTimeout);
		saveMsg.style.display = 'inline-block';
		saveMsg.appendChild(document.createTextNode('設定を保存しています'));
		saveMsg.appendChild(image.loading);
		saveConfig(newCfg).then(function(result) {
			toDisable.forEach(function(el) { el.disabled = false; });
			saveMsg.innerHTML = '';
			switch(result) {
				case true:
					cfg = newCfg;
					saveMsg.appendChild(document.createTextNode('保存しました'));
					saveMsg.appendChild(image.check);
					break;
				case false:
					saveMsg.appendChild(document.createTextNode('保存に失敗しました'));
					saveMsg.appendChild(image.cross);
					break;
				case null:
					saveMsg.appendChild(document.createTextNode('保存済みの設定が既に最新の状態です'));
					saveMsg.appendChild(image.cross);
					break;
				case undefined:
					saveMsg.appendChild(document.createTextNode('保存に失敗しました'));
					saveMsg.appendChild(image.cross);
					break;
				default:
			}
			saveMsgTimeout = setTimeout(function() {
				saveMsg.innerHTML = '';
				saveMsg.style.display = 'none';
			}, 5000);
		});

	}, false);

	// Replace body content. Easier to just replace mw.util.$content[0].innerHTML, but this would remove #p-cactions etc.
	var bodyContent = document.querySelector('.mw-body-content') || mw.util.$content[0];
	bodyContent.replaceChildren(container);
	var firstHeading = document.querySelector('.mw-first-heading');
	if (firstHeading) { // The innerHTML of .mw-body-content was replaced
		firstHeading.textContent = 'SpurLinkの設定';
	} else { // The innerHTML of mw.util.$content[0] was replaced (in this case the heading is gone)
		var h1 = document.createElement('h1');
		h1.textContent = 'SpurLinkの設定';
		container.prepend(h1);
	}
	reddenMissingTalkPages(allIps);
	getBlockStatus(allIps);

	// Field order swapper
	var swappers = '.slc-toollink-swapup, .slc-toollink-swapdown';
	$(document).off('click', swappers).on('click', swappers, function() {
		var swapup = this.classList.contains('slc-toollink-swapup');
		var $thisFs = $(this).closest('fieldset');
		var swapAround = (swapup ? $thisFs : $thisFs.next('fieldset'))[0];
		var swapMeDown = (swapup ? $thisFs.prev('fieldset') : $thisFs)[0];
		var result = swapElements(swapAround, swapMeDown);
		if (result) resetToollinkNumbers();
	});

	/**
	 * @param {HTMLElement} obj1
	 * @param {HTMLElement} obj2
	 * @returns {boolean}
	 */
	function swapElements(obj1, obj2) {

		var isSibling = obj1 !== obj2 && obj1.parentElement === obj2.parentElement;
		if (!isSibling) {
			console.error('The nodes aren\'t siblings.', obj1, obj2);
			return false;
		}
		var hasParent = obj1.parentElement && obj2.parentElement;
		if (!hasParent) {
			console.error('The nodes don\'t have parents.', obj1, obj2);
			return false;
		}

		// create marker element and insert it where obj1 is
		var temp = document.createElement('div');
		// @ts-ignore
		obj1.parentNode.insertBefore(temp, obj1);

		// move obj1 to right before obj2
		// @ts-ignore
		obj2.parentNode.insertBefore(obj1, obj2);

		// move obj2 to right before where obj1 used to be
		// @ts-ignore
		temp.parentNode.insertBefore(obj2, temp);

		// remove temporary marker node
		// @ts-ignore
		temp.parentNode.removeChild(temp);

		return true;

	}

	/**
	 * @param {Array<string>} ips
	 */
	function reddenMissingTalkPages(ips) {

		if (ips.length === 0) return;
		/** @type {NodeListOf<HTMLAnchorElement>} */
		var talkLinks = document.querySelectorAll('.slc-toollink-iplist-toollinks-talk');
		if (talkLinks.length === 0) return;

		/**
		 * @param {Array<string>} ipsArr
		 * @returns {JQueryPromise<Array<string>>} IPs whose talk pages are missing
		 */
		var queryIpTalkPages = function(ipsArr) {
			var def = $.Deferred();
			api.post({
				action: 'query',
				titles: ipsArr
					.map(function(ip) {
						return 'User_talk:' + ip;
					})
					.join('|'),
				formatversion: '2'
			}).then(function(res) {
				var resPages;
				if (!res || !res.query || !(resPages = res.query.pages) || resPages.length === 0) return def.resolve([]);
				var talkPageMissing = resPages.reduce(function(acc, obj) {
					if (!obj.title) return acc;
					if (obj.missing) {
						acc.push(obj.title.replace(/^.+:/, ''));
					}
					return acc;
				}, []);
				def.resolve(talkPageMissing);
			}).catch(function(code, err) {
				console.error(err);
				def.resolve([]);
			});
			return def.promise();
		};

		ips = ips.slice().filter(function(ip) {
			return !/\/\d{1,3}$/.test(ip); // Remove CIDRs
		});
		var deferreds = [];
		var limit = hasApiHighlimits ? 500 : 50;
		while (ips.length) {
			deferreds.push(queryIpTalkPages(ips.splice(0, limit)));
		}

		$.when.apply($, deferreds).then(function() {

			var args = arguments;
			var ipsWithMissingTalkPage = [];
			for (var i = 0; i < args.length; i++) {
				ipsWithMissingTalkPage = ipsWithMissingTalkPage.concat(args[i]);
			}
			if (ipsWithMissingTalkPage.length === 0) return;

			talkLinks.forEach(function(a) {
				var ip = a.dataset.ip;
				if (ipsWithMissingTalkPage.indexOf(ip) !== -1) {
					a.classList.add('new');
				}
			});

		});

	}

	/**
	 * @param {Array<string>} ips
	 */
	function getBlockStatus(ips) {

		if (ips.length === 0) return;
		/** @type {NodeListOf<HTMLSpanElement>} */
		var statusSpans = document.querySelectorAll('.slc-toollink-iplist-blockstatus');
		if (statusSpans.length === 0) return;

		/** @type {Object.<string, string>} */
		var statuses = {};
		var queryIpBlockStatus = function(ipsArr) {
			var def = $.Deferred();
			api.post({
				action: 'query',
				list: 'blocks',
				bkusers: ipsArr.join('|'),
				bkprop: 'user|expiry',
				formatversion: '2'
			}).then(function(res) {
				var resBlk;
				if (!res || !res.query || !(resBlk = res.query.blocks) || resBlk.length === 0) return def.resolve();
				resBlk.forEach(function(obj) {
					if (!obj.user || !obj.expiry) return;
					var msg = obj.expiry !== 'infinity' ? obj.expiry.replace(/Z$/, '') : '';
					msg = ' (' + (msg ? msg + 'まで' : msg) + 'ブロック中)';
					statuses[obj.user] = msg;
				});
				def.resolve();
			}).catch(function(code, err) {
				console.error(err);
				def.resolve();
			});
			return def.promise();
		};

		ips = ips.slice();
		var deferreds = [];
		var limit = hasApiHighlimits ? 500 : 50;
		while (ips.length) {
			deferreds.push(queryIpBlockStatus(ips.splice(0, limit)));
		}

		$.when.apply($, deferreds).then(function() {

			statusSpans.forEach(function(span) {
				var ip = span.dataset.ip;
				if (!ip) return;
				if (statuses[ip]) {
					span.textContent = statuses[ip];
				}
			});

		});
	}

}

/**
 * @returns {Object.<string, Config>}
 */
function mergeConfig() {

	// For backward compatibility
	var history = mw.user.options.get('userjs-sl-history');
	history = history ? JSON.parse(history) : {};

	// Get personal config
	var userCfg = mw.user.options.get(optionName);
	userCfg = userCfg ? JSON.parse(userCfg) : {};

	// Merge config
	/** @type {Object.<string, Config>} */
	var merged = {};
	[JSON.parse(JSON.stringify(defaultCfg)), history, userCfg].forEach(function(obj) {
		for (var key in obj) {
			merged[key] = obj[key];
		}
	});
	return merged;

}

/**
 * @param {Object.<string, Config>} cfg
 * @param {boolean} [verbose]
 * @returns {JQueryPromise<boolean|null|undefined>} True if save succeeds, false if it fails, null if config hasn't been changed,
 * undefined if a new config cannot be saved by overwriting the current version
 */
function saveConfig(cfg, verbose) {
	var def = $.Deferred();

	if (!configUpdated(cfg)) return def.resolve(null);

	if (evaluateSLCM()) {
		alert('SpurLink: 別タブでコンフィグが変更されています。ページをリロードしてください。');
		return def.resolve(undefined);
	}

	verbose = verbose === true;
	if (verbose) mw.notify('SpurLink: 履歴を保存しています...');
	var newCfgStr = JSON.stringify(cfg);

	// api.saveOption permits a value of 65,530 bytes or less
	var bytes = calculateBytes(newCfgStr);
	var maxBytes = 65530;
	if (bytes > maxBytes) {

		/** @type {Array<Array<string>>} */
		var accmulator = [];

		// Create an array of checked/proxy arrays by pass-by-reference (modification of this array affects the original arrays)
		var ipsArr = Object.keys(cfg).reduce(function(acc, cfgKey) {
			var cfgObj = cfg[cfgKey];
			acc.push(cfgObj.checked, cfgObj.proxy);
			return acc;
		}, accmulator);
		var lenArr = ipsArr.map(function(arr) { return arr.length; });

		// Remove the first element of the longest array until the size of the cfg object becomes smaller than the max bytes
		while (bytes > maxBytes) {
			var longestArrIndex = lenArr.indexOf(Math.max.apply(Math, lenArr));
			var arrToSplice = ipsArr[longestArrIndex];
			var firstEl = arrToSplice[0];
			if (!firstEl) break;
			var firstElBytes = calculateBytes(firstEl);
			arrToSplice.shift();
			lenArr[longestArrIndex]--;
			bytes -= (firstElBytes + 2); // 2 is for the enclosing quotations
			if (arrToSplice.length !== 0) bytes--; // This is for the element-separating comma
		}
		newCfgStr = JSON.stringify(cfg);

		// Remove overwritten IPs from the saved IP lists if on the config page
		var cbody = document.getElementById('slc-config-body');
		if (cbody) {
			cbody.querySelectorAll('fieldset').forEach(function(fs) {
				/** @type {string} */
				// @ts-ignore
				var configKey = fs.querySelector('.slc-toollink-label').value.toLowerCase();
				['checked', 'proxy'].forEach(function(ipType) {
					var iplist = fs.querySelector('.slc-toollink-iplist-' + ipType);
					if (!iplist) return;
					/** @type {NodeListOf<HTMLLIElement>} */
					var listitems = iplist.querySelectorAll('ol li');
					listitems.forEach(function(li) {
						/** @type {string|undefined} */
						var ip = li.dataset.ip;
						if (!ip) return;
						/** @type {HTMLInputElement|null} */
						var checkbox = li.querySelector('input[type="checkbox"]');
						if (!checkbox) return;
						checkbox.checked = false;
						if (ip && cfg[configKey][ipType].indexOf(ip) === -1) checkbox.checked = true;
						// @ts-ignore
						li.querySelector('.slc-toollink-iplist-rmchecked').click();
					});
				});
			});
		}

	}

	api.saveOption(optionName, newCfgStr)
		.then(function(res) { // Success
			if (res && res.warnings && res.warnings.indexOf('value too long') !== -1) {
				mw.notify('SpurLink: 保存に失敗しました (データ量過多)', {type: 'error'});
				def.resolve(false);
			} else {
				updateSLCM();
				mw.user.options.set(optionName, newCfgStr);
				if (verbose) mw.notify('SpurLink: 保存しました', {type: 'success'});
				def.resolve(true);
			}
		}).catch(function(code, err) { // Failure
			mw.log.error(err);
			if (verbose) mw.notify('SpurLink: 保存に失敗しました' + (code ? ' (' + code + ')' : ''), {type: 'error'});
			def.resolve(false);
		});

	return def.promise();
}

/**
 * @param {Object.<string, Config>} cfg
 * @returns {boolean}
 */
function configUpdated(cfg) {
	var oldCfg = mw.user.options.get(optionName);
	oldCfg = oldCfg ? JSON.parse(oldCfg) : {};

	return !arraysEqual(Object.keys(oldCfg), Object.keys(cfg)) ||
		Object.keys(oldCfg).some(function(ocKey) {
			var oc = oldCfg[ocKey];
			var nc = cfg[ocKey];
			return Object.keys(oc).some(function(ocInnerKey) {
				var ocInner = oc[ocInnerKey];
				var ncInner = nc[ocInnerKey];
				if (Array.isArray(ocInner)) {
					return !arraysEqual(ocInner, ncInner, true);
				} else {
					return ocInner !== ncInner;
				}
			});
		});
}

/**
 * Calculate bytes of a string
 * @param {string} str
 * @returns {number}
 */
function calculateBytes(str) {
	return encodeURIComponent(str).replace(/%../g, 'x').length;
}

/**
 * @param {Array<(boolean|string|number|undefined|null)>} array1
 * @param {Array<(boolean|string|number|undefined|null)>} array2
 * @param {boolean} [orderInsensitive] If true, ignore the order of elements
 * @returns {boolean|null} Null if non-arrays are passed as arguments
 */
function arraysEqual(array1, array2, orderInsensitive) {
	if (!Array.isArray(array1) || !Array.isArray(array2)) {
		return null;
	} else if (orderInsensitive) {
		return array1.length === array2.length && array1.every(function(el) {
			return array2.indexOf(el) !== -1;
		});
	} else {
		return array1.length === array2.length && array1.every(function(el, i) {
			return array2[i] === el;
		});
	}
}

function createPortletlink() {
	mw.util.addPortletLink(
		'p-tb',
		mw.config.get('wgArticlePath').replace('$1', 'Special:SpurLinkConfig'),
		'SpurLinkの設定',
		't-slc',
		'SpurLinkの設定を変更する'
	);
}

var runCnt = 0;
function addLinks() {

	var cfg = mergeConfig();
	runCnt++;

	// For tool links immediately below the page header on Special:Contributions
	if (mw.config.get('wgCanonicalSpecialPageName') === 'Contributions' && runCnt === 1) {
		(function() {

			/** @type {HTMLElement|null} */
			var heading = document.querySelector('.mw-first-heading');
			if (!heading) return;

			var relIp = heading.innerText.replace(/の投稿記録$/, '');
			if (!mw.util.isIPAddress(relIp, true)) return;

			/** @type {Element|null} */
			var headingToolLink = document.querySelector('.mw-changeslist-links');
			if (!headingToolLink) return;
			createLinks(cfg, relIp, headingToolLink, '');

		})();
	}

	/** @type {NodeListOf<HTMLAnchorElement>} */
	var anchors = document.querySelectorAll('.mw-anonuserlink');
	if (!anchors[0]) return;

	// Loop through all anonymous user links
	for (var i = 0; i < anchors.length; i++) {

		var a = anchors[i];
		var ip = a.textContent;
		if (
			a.type === 'button' ||
			a.classList.contains('sl-toollink-added') ||
			!ip ||
			!mw.util.isIPAddress(ip, true)
		) {
			continue;
		}

		/**
		 * Normal structure
		 * ```html
		 * 	<a class="mw-anonuserlink">IP</a>
		 * 	<span class="mw-usertoollinks">
		 * 		<span></span>
		 * 	</span>
		 * ```
		 * Special:AbuseLog
		 * ```html
		 *	<a class="mw-anonuserlink">IP</a>
		 *	<span class="mw-usertoollinks">
		 *		(
		 *		<a></a>
		 *		 |
		 *		<a></a>
		 *		)
		 *	</span>
		 * ```
		 * Contribs of a CIDR IP
		 * ```html
		 *	<a class="mw-anonuserlink">IP</a>
		 *	<a class="new mw-usertoollinks-talk"></a>
		 * ```
		 * Special:RecentChanges, Special:Watchlist (Group changes by page)
		 * ```html
		 *	<span class="mw-changeslist-line-inner-userLink">
		 *		<a class="mw-anonuserlink">IP</a>
		 *	</span>
		 *	<span class="mw-changeslist-line-inner-userTalkLink">
		 *		<span class="mw-usertoollinks">
		 *			<span></span>
		 *		</span>
		 *	</span>
		 * ```
		 */
		var targetElement = a.nextElementSibling;
		var pr = a.parentElement;
		if (targetElement&& targetElement.classList.contains('mw-usertoollinks-talk')) { // Contribs of a CIDR IP
			createLinks(cfg, ip, targetElement, 'after');
			a.classList.add('sl-toollink-added');
		} else if ( /* Normal */ targetElement && (
			targetElement.classList.contains('mw-usertoollinks') ||
			// There might be an intervening node created by the ipinfo extension
			targetElement.classList.contains('ext-ipinfo-button') && (targetElement = targetElement.nextElementSibling) && targetElement.classList.contains('mw-usertoollinks')
		)) {
			/** @type {HTMLElement[]} */
			var ch = Array.prototype.slice.call(targetElement.children);
			if (ch.some(function(el) { return el && el.nodeName === 'A' && el.textContent !== '無期限'; })) { // Compatibility w/ Simple blocking tool
				createLinks(cfg, ip, targetElement, 'nospan'); // AbuseLog
			} else {
				createLinks(cfg, ip, targetElement, ''); // Normal
			}
			a.classList.add('sl-toollink-added');
		} else if ( // Non-collaspsed links with the "Group changes by page" setting
			pr && pr.nodeName === 'SPAN' && pr.classList.contains('mw-changeslist-line-inner-userLink') &&
			(targetElement = pr.nextElementSibling) && targetElement.classList.contains('mw-changeslist-line-inner-userTalkLink') &&
			(targetElement = targetElement.querySelector('.mw-usertoollinks'))
		) {
			createLinks(cfg, ip, targetElement, '');
			a.classList.add('sl-toollink-added');
		} else {
			continue;
		}

	}

}

/**
 * Append span-enclosed toollink
 * @param {Object.<string, Config>} cfg
 * @param {string} ip
 * @param {Element} targetElement
 * @param {""|"after"|"nospan"} appendType
 */
function createLinks(cfg, ip, targetElement, appendType) {

	var isCidr = /\/\d{1,3}$/.test(ip);

	Object.keys(cfg).forEach(function(key) {
		var cfgObj = cfg[key];
		if (!cfgObj.enabled || !cfgObj.cidr && isCidr) {
			return;
		} else {

			var a = document.createElement('a');
			a.href = cfgObj.url.replace('$1', ip);
			a.textContent = cfgObj.label;
			a.target = '_blank';
			a.classList.add('sl-toollink');
			a.dataset.ip = ip;
			a.dataset.type = key;
			if (cfgObj.track) {
				if (cfgObj.checked.indexOf(ip) !== -1) {
					a.dataset.status = 'checked';
				} else if (cfgObj.proxy.indexOf(ip) !== -1) {
					a.dataset.status = 'proxy';
				} else {
					a.dataset.status = '';
				}
			}
			var span = document.createElement('span');
			if (appendType === 'after') span.classList.add('sl-toollink-bare');
			span.appendChild(a);

			switch(appendType) {
				case 'after':
					$(targetElement).after(span);
					targetElement = span;
					break;
				case 'nospan':
					var ch = targetElement.childNodes;
					ch[ch.length - 1].remove(); // Remove text node
					targetElement.appendChild(document.createTextNode(' | '));
					targetElement.appendChild(span);
					targetElement.appendChild(document.createTextNode(')'));
					break;
				default:
					targetElement.appendChild(span);
			}

		}
	});

}

var saveTimeout;
var trackedSelectors = '.sl-toollink[data-status=""], .sl-toollink[data-status="checked"], .sl-toollink[data-status="proxy"]';
$(document).off('click', trackedSelectors).on('click', trackedSelectors, function(e) {

	if (evaluateSLCM()) {
		e.preventDefault();
		return alert('SpurLink: 別タブでコンフィグが変更されています。ページをリロードしてください。');
	}

	clearTimeout(saveTimeout);
	var cfg = mergeConfig();

	/** @type {string} */
	// @ts-ignore
	var ip = this.dataset.ip;
	/** @type {string} */
	// @ts-ignore
	var configKey = this.dataset.type;
	if (!ip || !configKey) {
		throw new Error('SpurLink couldn\'t identify an IP or a configKey for a toollink.');
	}
	/** @type {NodeListOf<HTMLAnchorElement>} */
	var associatedLinks = document.querySelectorAll('.sl-toollink[data-ip="' + ip + '"][data-type="' + configKey + '"]');

	// Erase statuses
	var index;
	if (e.ctrlKey && e.shiftKey) {

		e.preventDefault();
		['checked', 'proxy'].forEach(function(arrKey) {
			var i = cfg[configKey][arrKey].indexOf(ip);
			if (i !== -1) cfg[configKey][arrKey].splice(i, 1);
		});
		associatedLinks.forEach(function(l) { l.dataset.status = ''; });

	// C -> P or P -> C
	} else if (e.ctrlKey) {

		e.preventDefault();
		if (this.dataset.status === 'proxy') {
			index = cfg[configKey].proxy.indexOf(ip);
			if (index !== -1) cfg[configKey].proxy.splice(index, 1);
			if (cfg[configKey].checked.indexOf(ip) === -1) cfg[configKey].checked.push(ip);
			associatedLinks.forEach(function(l) { l.dataset.status = 'checked'; });
		} else {
			index = cfg[configKey].checked.indexOf(ip);
			if (index !== -1) cfg[configKey].checked.splice(index, 1);
			if (cfg[configKey].proxy.indexOf(ip) === -1) cfg[configKey].proxy.push(ip);
			associatedLinks.forEach(function(l) { l.dataset.status = 'proxy'; });
		}

	// -> C, not opening the href
	} else if (e.shiftKey) {

		e.preventDefault();
		index = cfg[configKey].proxy.indexOf(ip);
		if (index !== -1) cfg[configKey].proxy.splice(index, 1);
		if (cfg[configKey].checked.indexOf(ip) === -1) cfg[configKey].checked.push(ip);
		associatedLinks.forEach(function(l) { l.dataset.status = 'checked'; });

	// None -> C
	} else {

		if (this.dataset.status !== 'checked' && this.dataset.status !== 'proxy') {
			if (cfg[configKey].checked.indexOf(ip) === -1) cfg[configKey].checked.push(ip);
			associatedLinks.forEach(function(l) { l.dataset.status = 'checked'; });
		}

	}

	saveTimeout = setTimeout(function() {
		saveConfig(cfg, true);
	}, 3000);

});

// ***********************************************************************************************************************
})();
//</nowiki>
