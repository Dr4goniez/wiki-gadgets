/***************************************************************************************************

    Selective Rollback

    @author [[User:Dragoniez]]
    @version 3.3.0
    @see https://meta.wikimedia.org/wiki/User:Dragoniez/Selective_Rollback

    Some functionalities of this script are adapted from:
    @link https://meta.wikimedia.org/wiki/User:Hoo_man/smart_rollback.js
    @link https://en.wikipedia.org/wiki/User:DannyS712/AjaxRollback.js

 ***************************************************************************************************/
/* global mw */
//<nowiki>

(function() { // Create a local function scope

// **************************************** INITIALIZATION ****************************************

/**
 * Script name
 * @readonly
 */
var SR = 'Selective Rollback';

// Type definitions

/**
 * @typedef {(
 *  |"portletlink-tooltip"
 *  |"summary-label-primary"
 *  |"summary-option-default"
 *  |"summary-option-custom"
 *  |"summary-label-custom"
 *  |"summary-tooltip-$0"
 *  |"summary-tooltip-$0-error"
 *  |"summary-tooltip-specialexpressions"
 *  |"markbot-label"
 *  |"watchlist-label"
 *  |"watchlist-expiry-label"
 *  |"watchlist-expiry-indefinite"
 *  |"watchlist-expiry-1week"
 *  |"watchlist-expiry-1month"
 *  |"watchlist-expiry-3months"
 *  |"watchlist-expiry-6months"
 *  |"watchlist-expiry-1year"
 *  |"watchlist-expiry-3years"
 *  |"button-rollbackchecked"
 *  |"button-checkall"
 *  |"button-close"
 *  |"msg-nonechecked"
 *  |"msg-linksresolved"
 *  |"msg-confirm"
 *  |"rbstatus-reverted"
 *  |"rbstatus-failed"
 * )} Msg
 */

/**
 * @typedef RollbackParams
 * @property {string} summary
 * @property {boolean} markbot
 * @property {string} watchlist
 * @property {string|undefined} watchlistexpiry
 */

/**
 * @typedef SelectiveRollbackConfig
 * @property {string} lang
 * @property {Object.<string, string>} editSummaries
 * @property {boolean} showKeys
 * @property {Object.<string, string>} specialExpressions
 * @property {boolean} markBot
 * @property {boolean} watchPage
 * @property {string} watchExpiry
 * @property {"never"|"always"|"RCW"|"nonRCW"} confirm
 * @property {string} checkboxLabelColor
 */

// Config settings

/** @type {SelectiveRollbackConfig} @readonly */
var SRC = {
	lang: '',
	editSummaries: {},
	showKeys: false,
	specialExpressions: {},
	markBot: true,
	watchPage: false,
	watchExpiry: 'indefinite',
	confirm: 'never',
	checkboxLabelColor: 'orange'
};

/**
 * @param {"string"|"number"|"bigint"|"boolean"|"symbol"|"undefined"|"object"|"function"|"null"} expectedType
 * @param {any} val
 * @param {string} key
 * @returns {boolean}
 */
var isOfType = function(expectedType, val, key) {
	var valType = val === null ? 'null' : typeof val;
	if (valType !== expectedType) {
		console.error(SR, 'TypeError: ' + expectedType + ' expected for "' + key + '", but got ' + valType + '.');
		return false;
	} else {
		return true;
	}
};

// @ts-ignore
var userCfg = window.selectiveRollbackConfig;
if (typeof userCfg === 'object' && userCfg !== null) {
	Object.keys(userCfg).forEach(function(key) {

		key = key.replace(/\u200e/g, '').trim();
		var val = userCfg[key];

		// Strict type check
		var v;
		if (val === (v = null) || val === (v = undefined)) {
			return console.error(SR, 'The value ' + v + ' for "' + key + '" is invalid.');
		}
		switch (key) {
			case 'lang':
			case 'watchExpiry':
			case 'confirm':
			case 'checkboxLabelColor':
				if (!isOfType('string', val, key)) return;
				if (key === 'confirm' && ['never', 'always', 'RCW', 'nonRCW'].indexOf(val) === -1) {
					console.warn(SR, '"' + val + '" isn\'t a valid value for "confirm".');
					return;
				}
				break;
			case 'editSummaries':
			case 'specialExpressions':
				if (!isOfType('object', val, key)) return;
				break;
			case 'showKeys':
			case 'markBot':
			case 'watchPage':
				if (!isOfType('boolean', val, key)) return;
				break;
			default:
				return;
		}

		if (key === 'watchExpiry') { // Some typo fix
			var m;
			val = val.replace(/\u200e/g, '').trim();
			if (/^in|^never/.test(key)) {
				val = 'indefinite';
			} else if ((m = /^1\s*(week|month|year)/.exec(val))) {
				val = '1 ' + m[1];
			} else if ((m = /^([36])\s*month/.exec(val))) {
				val = m[1] + ' months';
			// } else if (/^3\s*year/.test(val)) {
			//     val = '3 years';
			} else {
				return console.error(SR, '"' + val + '" is not an acceptable watch-page expiry.');
			}
			userCfg[key] = val;
		}
		// @ts-ignore
		SRC[key] = userCfg[key];

	});
}

// Language settings

/** @readonly */
var i18n = {
	/** @type {Record<Msg, string>} @readonly */
	ja: {
		'portletlink-tooltip': 'Selective Rollbackのダイアログを開く',
		'summary-label-primary': '編集要約',
		'summary-option-default': '標準の編集要約',
		'summary-option-custom': 'カスタム',
		'summary-label-custom': 'カスタム編集要約',
		'summary-tooltip-$0': '($0は標準の編集要約に置換されます。)',
		'summary-tooltip-$0-error': '($0は<span>英語の</span>標準編集要約に置換されます。)',
		'summary-tooltip-specialexpressions': '置換表現',
		'markbot-label': 'ボット編集として巻き戻し',
		'watchlist-label': '対象ページをウォッチリストに追加',
		'watchlist-expiry-label': '期間',
		'watchlist-expiry-indefinite': '無期限',
		'watchlist-expiry-1week': '1週間',
		'watchlist-expiry-1month': '1か月',
		'watchlist-expiry-3months': '3か月',
		'watchlist-expiry-6months': '6か月',
		'watchlist-expiry-1year': '1年',
		'watchlist-expiry-3years': '3年', // Not used
		'button-rollbackchecked': 'チェック項目を巻き戻し',
		'button-checkall': '全てチェック',
		'button-close': '閉じる',
		'msg-nonechecked': 'チェックボックスがチェックされていません。',
		'msg-linksresolved': 'このページの巻き戻しリンクは全て解消済みです。',
		'msg-confirm': '巻き戻しを実行しますか？',
		'rbstatus-reverted': '巻き戻し済',
		'rbstatus-failed': '巻き戻し失敗',
	},
	/** @type {Record<Msg, string>} @readonly */
	en: {
		'portletlink-tooltip': 'Open the Selective Rollback dialog',
		'summary-label-primary': 'Edit summary',
		'summary-option-default': 'Default edit summary',
		'summary-option-custom': 'Custom',
		'summary-label-custom': 'Custom edit summary',
		'summary-tooltip-$0': '($0 will be replaced with the default rollback summary.)',
		'summary-tooltip-$0-error': '($0 will be replaced with the default rollback summary <span>in English</span>.)',
		'summary-tooltip-specialexpressions': 'Replacement expressions',
		'markbot-label': 'Mark rollbacks as bot edits',
		'watchlist-label': 'Add the target pages to watchlist',
		'watchlist-expiry-label': 'Expiry',
		'watchlist-expiry-indefinite': 'Indefinite',
		'watchlist-expiry-1week': '1 week',
		'watchlist-expiry-1month': '1 month',
		'watchlist-expiry-3months': '3 months',
		'watchlist-expiry-6months': '6 months',
		'watchlist-expiry-1year': '1 year',
		'watchlist-expiry-3years': '3 years', // Not used
		'button-rollbackchecked': 'Rollback checked',
		'button-checkall': 'Check all',
		'button-close': 'Close',
		'msg-nonechecked': 'No checkbox is checked.',
		'msg-linksresolved': 'Rollback links on this page have all been resolved.',
		'msg-confirm': 'Are you sure you want to rollback this edit?',
		'rbstatus-reverted': 'reverted',
		'rbstatus-failed': 'rollback failed'
	},
	/** @type {Record<Msg, string>} @readonly */
	zh: {
		'portletlink-tooltip': '打开Selective Rollback日志',
		'summary-label-primary': '编辑摘要',
		'summary-option-default': '默认编辑摘要',
		'summary-option-custom': '自定义',
		'summary-label-custom': '自定义编辑摘要',
		'summary-tooltip-$0': '($0将会被默认编辑摘要替代。)',
		'summary-tooltip-$0-error': '($0将会被默认编辑摘要为<span>英文</span>替代。)',
		'summary-tooltip-specialexpressions': '替换表达',
		'markbot-label': '标记为机器人编辑',
		'watchlist-label': '将目标页面加入监视页面',
		'watchlist-expiry-label': '时间',
		'watchlist-expiry-indefinite': '不限期',
		'watchlist-expiry-1week': '1周',
		'watchlist-expiry-1month': '1个月',
		'watchlist-expiry-3months': '3个月',
		'watchlist-expiry-6months': '6个月',
		'watchlist-expiry-1year': '1年',
		'watchlist-expiry-3years': '3年', // Not used
		'button-rollbackchecked': '勾选回退',
		'button-checkall': '全选',
		'button-close': '关闭',
		'msg-nonechecked': '未选择任何勾选框。',
		'msg-linksresolved': '与该页面相关的回退全部完成。',
		'msg-confirm': '您确定要回退该编辑吗?',
		'rbstatus-reverted': '已回退',
		'rbstatus-failed': '回退失败'
	},
	/**
	 * @type {Record<Msg, string>}
	 * @readonly
	 * @author [[User:64andtim]]
	 */
	es: {
		'portletlink-tooltip': 'Abrir el diálogo Selective Rollback',
		'summary-label-primary': 'Resumen de edición',
		'summary-option-default': 'Resumen de edición automática',
		'summary-option-custom': 'Manual',
		'summary-label-custom': 'Resumen de edición manual',
		'summary-tooltip-$0': '($0 será reemplazada con la resumen de reversión automática.)',
		'summary-tooltip-$0-error': '($0 será reemplazada con la resumen de reversión automática <span>en Inglés</span>.)',
		'summary-tooltip-specialexpressions': 'Expresiones de reemplazo',
		'markbot-label': 'Marcar las reversiones cómo ediciones de un bot',
		'watchlist-label': 'Vigilar las páginas en tu lista de seguimiento',
		'watchlist-expiry-label': 'Tiempo',
		'watchlist-expiry-indefinite': 'Permanente',
		'watchlist-expiry-1week': 'una semana',
		'watchlist-expiry-1month': 'un mes',
		'watchlist-expiry-3months': 'tres meses',
		'watchlist-expiry-6months': 'seis meses',
		'watchlist-expiry-1year': 'un año',
		'watchlist-expiry-3years': 'tres años', // Not used
		'button-rollbackchecked': 'Revertir elegidos',
		'button-checkall': 'Elegir todos',
		'button-close': 'Cerrar',
		'msg-nonechecked': 'Ningún casilla fue elegida.',
		'msg-linksresolved': 'Todos los enlaces de reversión en esta página se han resuelto.',
		'msg-confirm': '¿Estás seguro que quieres revertir este edición?',
		'rbstatus-reverted': 'revertido',
		'rbstatus-failed': 'la reversión falló'
	},
	/**
	 * @type {Record<Msg, string>}
	 * @readonly
	 * @author [[User:NGC 54]]
	 */
	ro: {
		'portletlink-tooltip': 'Deschide dialogul Selective Rollback',
		'summary-label-primary': 'Descrierea modificării',
		'summary-option-default': 'Descrierea implicită a modificării',
		'summary-option-custom': 'Personalizat',
		'summary-label-custom': 'Descriere personalizată a modificării',
		'summary-tooltip-$0': '($0 va fi înlocuit cu descrierea implicită a revenirii.)',
		'summary-tooltip-$0-error': '($0 va fi înlocuit cu descrierea implicită a revenirii <span>în engleză</span>.)',
		'summary-tooltip-specialexpressions': 'Expresii de înlocuire',
		'markbot-label': 'Marchează revenirile drept modificări făcute de robot',
		'watchlist-label': 'Adaugă paginile țintă la pagini urmărite',
		'watchlist-expiry-label': 'Expiră',
		'watchlist-expiry-indefinite': 'Nelimitat',
		'watchlist-expiry-1week': '1 săptămână',
		'watchlist-expiry-1month': '1 lună',
		'watchlist-expiry-3months': '3 luni',
		'watchlist-expiry-6months': '6 luni',
		'watchlist-expiry-1year': '1 an',
		'watchlist-expiry-3years': '3 ani', // Not used
		'button-rollbackchecked': 'Revino asupra celor bifate',
		'button-checkall': 'Bifează tot',
		'button-close': 'Închide',
		'msg-nonechecked': 'Nu este bifată nicio căsuță bifabilă.',
		'msg-linksresolved': 'Toate legăturile de revenire de pe această pagină au fost utilizate.',
		'msg-confirm': 'Ești sigur(ă) că vrei să revii asupra acestei modificări?',
		'rbstatus-reverted': 'revenit',
		'rbstatus-failed': 'revenire eșuată'
	}
};

/** @type {Record<Msg, string>} @readonly */
var msg;
/** @readonly */
var langSwitch = SRC.lang ? SRC.lang : mw.config.get('wgContentLanguage');
if (['ja', 'zh', 'es', 'ro'].indexOf(langSwitch) !== -1) {
	msg = i18n[langSwitch];
} else {
	if (SRC.lang && SRC.lang !== 'en') {
		console.error(SR, 'Sorry, "' + SRC.lang + '" is unavaiable as the interface language.');
	}
	msg = i18n.en;
}

// Other constants

/** @readonly */
var spName = mw.config.get('wgCanonicalSpecialPageName');
/** @type {boolean} @readonly */
var onRCW = typeof spName === 'string' ? ['Recentchanges', 'Watchlist'].indexOf(spName) !== -1 : false;

/**
 * The parent node of rollback links and checkboxes, "li" or "#mw-diff-ntitle2". This property being null means that
 * the user is either on Special:Recentchanges or on Special:Watchlist. It being undefined means either that the user
 * is on a page on which no rollback link is created or that a parent node needs to be defined but failed to be defined.
 * @type {"li"|"#mw-diff-ntitle2"|null|undefined}
 * @readonly
 */
var parentNode = (function() {
	if (onRCW) {
		return null;
	} else if (mw.config.get('wgAction') === 'history' || spName === 'Contributions') {
		return 'li';
	} else if (typeof mw.config.get('wgDiffNewId') === 'number') {
		return '#mw-diff-ntitle2';
	} else {
		return undefined;
	}
})();

/**
 * @type {boolean|null} Null when the fetched summary contains unparsable magic words
 * @readonly
 */
var fetchedSummary;

/** @type {string} @readonly */
var defaultSummary;

// **************************************** ENTRY POINT ****************************************

/**
 * @type {mw.Api}
 * @readonly
 */
var api;
mw.loader.using('mediawiki.api', function() { // getSummary requires this module but not any other, not even DOM ready
	api = new mw.Api();
	$.when( // Proceed to initialization when summary is fetched, all other modules are loaded, and the DOM is ready
		getSummary(),
		mw.loader.using(['mediawiki.util', 'jquery.ui']),
		$.ready
	).then(init);
});

// **************************************** MAIN FUNCTIONS ****************************************

/**
 * Get the default rollback summary for the local wiki ($0 will be replaced with this)
 * @returns {JQueryPromise<void>}
 */
function getSummary() {

	/**
	 * @returns {JQueryPromise<string|undefined>}
	 */
	var query = function() {
		return api.getMessages(['revertpage'])
			.then(function(res) {
				return res && res.revertpage ? res.revertpage : undefined;
			}).catch(function(code, err) {
				console.log(SR, err);
				return undefined;
			});
	};

	return query().then(function(summary) {
		// Set up the default rollback summary
		if (summary && summary.indexOf('{{') === -1) {
			defaultSummary = summary;
			fetchedSummary = true;
		} else {
			defaultSummary = 'Reverted edit(s) by [[Special:Contributions/$2|$2]] ([[User talk:$2|talk]]) to last revision by [[User:$1|$1]]';
			if (summary === undefined) {
				console.error(SR, 'Failed to get the default rollback summary for the local wiki.');
				fetchedSummary = false;
			} else {
				fetchedSummary = null;
			}
		}
		return;
	});

}

function init() {

	// Don't run the script if there's no visible rollback links
	/** @type {JQuery<HTMLSpanElement>} */
	var $rbspans = $('.mw-rollback-link:visible');
	if (!$rbspans.length) {
		return;
	} else if (parentNode === undefined) {
		// Show error message on console if there's a rollback link but parent node is not defined
		return console.error(SR, 'Failed to define parent node.');
	}

	/**
	 * @param {HTMLElement} appendTo
	 * @param {string} id
	 * @param {string} labelText
	 * @param {string} [checkboxClassName]
	 * @param {string} [checkboxCssText]
	 * @param {string} [labelCssText]
	 * @returns {HTMLInputElement}
	 */
	var createLabelledCheckbox = function(appendTo, id, labelText, checkboxClassName, checkboxCssText, labelCssText) {

		var checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.id = id;
		if (checkboxClassName) checkbox.className = checkboxClassName;
		if (checkboxCssText) {
			checkbox.style.cssText = checkboxCssText;
		} else {
			checkbox.style.marginRight = '0.5em';
		}

		var label = document.createElement('label');
		label.htmlFor = id;
		label.textContent = labelText;
		if (labelCssText) label.style.cssText = labelCssText;

		appendTo.appendChild(checkbox);
		appendTo.appendChild(label);

		return checkbox;

	};

	// Add checkboxes
	if (!onRCW) {

		$rbspans.each(function(i) { // For each rollback link

			var clss = 'sr-rollback-checkbox';

			var span = document.createElement('span');
			span.classList.add('sr-rollback');
			span.style.cssText = 'display: inline-block; margin: 0 0.5em; font-weight: bold;';
			span.appendChild(document.createTextNode('['));
			createLabelledCheckbox(span, clss + i, 'SR', clss, 'margin-left: 0.2em; margin-right: 0.3em;', 'color: ' + SRC.checkboxLabelColor + ';');
			span.appendChild(document.createTextNode(']'));
			// @ts-ignore
			$(this).closest(parentNode).append(span);

		});

	}

	// Create a style tag
	var style = document.createElement('style');
	style.textContent =
		'.sr-bold > span {' +
			'font-weight: bold;' +
		'}';
	document.head.appendChild(style);

	// Create dialog
	var dialog = document.createElement('div');
	dialog.id = 'sr-dialog';
	dialog.title = SR;
	dialog.style.cssText = 'padding: 1em; max-width: 580px;';

	// Preset summary wrapper
	var psWrapper = document.createElement('div');
	psWrapper.id = 'sr-presetsummary-wrapper';
	psWrapper.style.cssText = 'margin-bottom: 0.5em;';
	var psId = 'sr-presetsummary';
	var psLabel = document.createElement('label');
	psLabel.htmlFor = psId;
	psLabel.textContent = msg['summary-label-primary'];
	psWrapper.appendChild(psLabel);
	var psSelect = document.createElement('select');
	psSelect.id = psId;
	psSelect.style.cssText = 'display: block; width: 100%; box-sizing: border-box;';
	psWrapper.appendChild(psSelect);
	var psOptDefault = document.createElement('option');
	psOptDefault.id = 'sr-presetsummary-default';
	psOptDefault.value = '';
	psOptDefault.textContent = msg['summary-option-default'];
	psSelect.appendChild(psOptDefault);
	var psOptCustom = document.createElement('option');
	psOptCustom.id = 'sr-presetsummary-custom';
	psOptCustom.value = 'other';
	psOptCustom.textContent = msg['summary-option-custom'];
	psSelect.appendChild(psOptCustom);
	dialog.appendChild(psWrapper);

	// Append user-defined edit summaries if there's any
	if (!$.isEmptyObject(SRC.editSummaries)) {
		Object.keys(SRC.editSummaries).forEach(function(key) {
			var opt = document.createElement('option');
			opt.textContent = SRC.showKeys ? key : SRC.editSummaries[key];
			opt.value =  SRC.editSummaries[key];
			psSelect.insertBefore(opt, psOptCustom);
		});
	}

	// Custom summary wrapper
	var csWrapper = document.createElement('div');
	csWrapper.id = 'sr-customsummary-wrapper';
	csWrapper.style.cssText = 'margin-bottom: 0.5em;';
	var csId = 'sr-customsummary';
	var csLabel = document.createElement('label');
	csLabel.htmlFor = csId;
	csLabel.textContent = msg['summary-label-custom'];
	csWrapper.appendChild(csLabel);
	var csInput = document.createElement('input');
	csInput.id = csId;
	csInput.style.cssText = 'display: block; width: 100%; box-sizing: border-box;';
	csInput.addEventListener('focus', function() {
		// When the custom summary field is focused, set the dropdown option to "other"
		psOptCustom.selected = true;
	});
	csWrapper.appendChild(csInput);
	var cs$0 = document.createElement('p');
	cs$0.id = 'sr-customsummary-$0';
	cs$0.style.fontSize = 'smaller';
	cs$0.innerHTML = msg['summary-tooltip-$0'];
	csWrapper.appendChild(cs$0);
	var cs$SE = document.createElement('p');
	cs$SE.id = 'sr-customsummary-$SE';
	cs$SE.style.fontSize = 'smaller';
	cs$SE.style.marginTop = '0';
	cs$SE.style.display = 'none';
	csWrapper.appendChild(cs$SE);
	dialog.appendChild(csWrapper);

	// If the default rollback summary failed to be fetched, change text of the $0 replacement tooltip
	if (!fetchedSummary) {
		cs$0.innerHTML = msg['summary-tooltip-$0-error'];
		if (fetchedSummary === false) {
			cs$0.style.color = 'red';
		} else {
			cs$0.classList.add('sr-bold');
		}
	}

	// Show a list of special expressions if defined by the user
	if (!$.isEmptyObject(SRC.specialExpressions)) {
		var seTooltip = Object.keys(SRC.specialExpressions).join(', ');
		cs$SE.textContent = '(' + msg['summary-tooltip-specialexpressions'] + ': ' + seTooltip + ')';
		cs$SE.style.display = 'inline-block';
		cs$0.style.marginBottom = '0';
	}

	// Markbot option wrapper
	var botWrapper = document.createElement('div');
	botWrapper.id = 'sr-bot-wrapper';
	var botCheckbox = createLabelledCheckbox(botWrapper, 'sr-bot', msg['markbot-label']);
	dialog.appendChild(botWrapper);

	// Hide the markbot checkbox if the user doesn't have required rights / check/uncheck the box in accordance with the config
	// @ts-ignore
	var allowedMarkBot = mw.config.get('wgUserGroups').concat(mw.config.get('wgGlobalGroups')).some(function(group) {
		return ['sysop', 'global-sysop', 'global-rollbacker', 'steward'].indexOf(group) !== -1;
	});
	if (allowedMarkBot) {
		botCheckbox.checked = SRC.markBot;
	} else {
		botWrapper.style.display = 'none';
	}

	// Watchlist option wrapper
	var wlWrapper = document.createElement('div');
	wlWrapper.id = 'sr-watchlist-wrapper';
	var wlCheckbox = createLabelledCheckbox(wlWrapper, 'sr-watchlist', msg['watchlist-label']);
	var wlUl = document.createElement('ul');
	wlUl.id = 'sr-watchlist-expiry';
	wlUl.style.display = 'none';
	wlWrapper.appendChild(wlUl);
	var wlLi = document.createElement('li');
	wlLi.appendChild(document.createTextNode(msg['watchlist-expiry-label']));
	wlUl.appendChild(wlLi);
	var wlSelect = document.createElement('select');
	wlSelect.id = 'sr-watchlist-expiry-dropdown';
	wlSelect.style.marginLeft = '0.5em';
	wlLi.appendChild(wlSelect);
	[
		{value: 'indefinite', text: msg['watchlist-expiry-indefinite']},
		{value: '1 week', text: msg['watchlist-expiry-1week']},
		{value: '1 month', text: msg['watchlist-expiry-1month']},
		{value: '3 months', text: msg['watchlist-expiry-3months']},
		{value: '6 months', text: msg['watchlist-expiry-6months']},
		{value: '1 year', text: msg['watchlist-expiry-1year']}//,
		// {value: '3 years', text: msg['watchlist-expiry-3years']} // 1y is the max ATM; phab:T336142
	]
	.forEach(function(obj) {
		var opt = document.createElement('option');
		opt.value = obj.value;
		opt.textContent = obj.text;
		wlSelect.appendChild(opt);
	});
	wlCheckbox.addEventListener('change', function() {
		// Show/hide the expiry dropdown when the checkbox is (un)checked
		$(wlUl).toggle();
	});
	dialog.appendChild(wlWrapper);

	// Initialize the watchlist checkbox
	if (SRC.watchPage) {
		wlCheckbox.checked = true;
		wlUl.style.display = 'block';
	}

	// Initialize watchlist expiry
	/** @type {HTMLOptionElement|null} */
	var optExpUserDefined = wlSelect.querySelector('option[value="' + SRC.watchExpiry + '"]');
	if (optExpUserDefined) optExpUserDefined.selected = true;

	// On jawp, set up autocomplete for the custom summary textbox
	if (mw.config.get('wgDBname') === 'jawiki') {
		// Get a VIP/LTA list and set its items as autocomplate condidates
		getAutocompleteSource().then(function(list) {
			$(csInput).autocomplete({
				source: function(req, res) { // Limit the list to the maximum number of 10, or the list can stick out of the viewport
					var results = $.ui.autocomplete.filter(list, req.term);
					res(results.slice(0, 10));
				},
				position: {
					my: 'left bottom',
					at: 'left top'
				}
			});
		});
	}

	// Create portletlink
	var btnPosition = mw.config.get('skin') === 'minerva' ? 'p-personal' : 'p-cactions';
	/** @type {HTMLLIElement|null} */
	var portlet = mw.util.addPortletLink(btnPosition, '#', 'Selective Rollback', 'ca-sr', msg['portletlink-tooltip'], undefined, '#ca-move');
	if (portlet) {
		portlet.addEventListener('click', function(e) {
			e.preventDefault();
			$dialog.dialog('open');
		});
	}

	/**
	 * @returns {RollbackParams}
	 */
	var getRollbackParams = function() {

		var summary = psSelect.value === 'other' ? csInput.value.replace(/\u200e/g, '').trim() : psSelect.value;
		summary = summary.replace('$0', defaultSummary); // Replace $0 with the default summary
		if (!$.isEmptyObject(SRC.specialExpressions)) { // Replace special expressions as defined by the user
			for (var key in SRC.specialExpressions) {
				summary = summary.split(key).join(SRC.specialExpressions[key]);
			}
		}

		return {
			summary: summary,
			markbot: botCheckbox.checked,
			watchlist: wlCheckbox.checked ? 'watch' : 'nochange',
			watchlistexpiry: wlCheckbox.checked ? wlSelect.value : undefined
		};

	};

	// Define buttons to show on the dialog
	var btns = [
		{   // "Rollback checked" button
			text: msg['button-rollbackchecked'],
			click: function() {
				/** @type {HTMLInputElement[]} */
				var srCheckedCheckboxes = Array.prototype.slice.call(document.querySelectorAll('.sr-rollback-checkbox:checked'));
				if (!srCheckedCheckboxes.length) return alert(msg['msg-nonechecked']);
				$(this).dialog('close');
				selectiveRollback(srCheckedCheckboxes, getRollbackParams()).then(function() {
					removeInterfaceIfNeeded($(this), portlet);
				});
			}
		},
		{   // "Check all" button
			text: msg['button-checkall'],
			click: function() {
				/** @type {HTMLInputElement[]} */
				var srCheckboxes = Array.prototype.slice.call(document.querySelectorAll('.sr-rollback-checkbox'));
				if (srCheckboxes.length) {
					srCheckboxes.forEach(function(el) { el.checked = true; });
				} else {
					alert(msg['msg-linksresolved']);
				}
			}
		},
		{   // "Close" button
			text: msg['button-close'],
			click: function() {
				$(this).dialog('close');
			}
		}
	];
	if (onRCW) btns.splice(0, 2); // Only leave the "Close" button if the user is on RCW

	// "Dialogize" the created html
	var $dialog = $(dialog);
	$dialog.dialog({
		height: 'auto',
		width: 'auto',
		minWidth: 515,
		minHeight: 175,
		resizable: false,
		autoOpen: false,
		modal: true,
		buttons: btns
	});

	// Ajax rollback
	$(document).off('click', '.mw-rollback-link').on('click', '.mw-rollback-link', function(e) {

		e.preventDefault();

		// If CTRL key is pressed down, just open the dialog, not executing rollback
		if (e.ctrlKey) return $dialog.dialog('open');

		// Confirm rollback per config
		if (!e.shiftKey && (
				SRC.confirm === 'always' ||
				onRCW && SRC.confirm === 'RCW' ||
				!onRCW && SRC.confirm === 'nonRCW'
			) &&
			!confirm(msg['msg-confirm'])
		) {
			return;
		}

		ajaxRollback(this, getRollbackParams()).then(function(_result) {
			removeInterfaceIfNeeded($dialog, portlet);
		});

	});

}

/**
 * @param {HTMLSpanElement} rbspan
 * @param {RollbackParams} params
 * @returns {JQueryPromise<boolean|null>}
 */
function ajaxRollback(rbspan, params) {

	// @ts-ignore
	var srCheckbox = $(rbspan).closest(parentNode).find('.sr-rollback')[0];
	if (srCheckbox) srCheckbox.remove();

	var rblink = rbspan.querySelector('a');
	if (!rblink) {
		console.error(SR, 'Error: Anchor tag is missing in the rollback link for some reason.');
		rbspan.innerHTML = '';
		rbspan.appendChild(document.createTextNode('['));
		var status = document.createElement('span');
		status.textContent = msg['rbstatus-failed'] + ' (linkmissing)';
		status.style.backgroundColor = 'lightpink';
		rbspan.appendChild(status);
		rbspan.appendChild(document.createTextNode(']'));
		rbspan.classList.remove('mw-rollback-link');
		rbspan.classList.add('sr-rollback-link-resolved');
		return $.Deferred().resolve(null);
	}

	var href = rblink.href;
	var title = mw.util.getParamValue('title', href);
	var user = mw.util.getParamValue('from', href);

	var processing = document.createElement('img');
	processing.src = 'https://upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif';
	processing.style.cssText = 'vertical-align: middle; height: 1em; border: 0;';
	rbspan.replaceChildren(processing);

	return rollback(title, user, params).then(function(err) {
		rbspan.innerHTML = '';
		rbspan.appendChild(document.createTextNode('['));
		var status = document.createElement('span');
		if (err) {
			status.textContent = msg['rbstatus-failed'] + ' (' + err + ')';
			status.style.backgroundColor = 'lightpink';
		} else {
			status.textContent = msg['rbstatus-reverted'];
			status.style.backgroundColor = 'lightgreen';
		}
		rbspan.appendChild(status);
		rbspan.appendChild(document.createTextNode(']'));
		rbspan.classList.remove('mw-rollback-link');
		rbspan.classList.add('sr-rollback-link-resolved');
		return !err;
	});

}

/**
 * @param {HTMLInputElement[]} srCheckedCheckboxes
 * @param {RollbackParams} rollbackParams
 * @returns {JQueryPromise<void>}
 */
function selectiveRollback(srCheckedCheckboxes, rollbackParams) {
	var deferreds = [];
	srCheckedCheckboxes.forEach(function(checkbox) {
		// @ts-ignore
		var rbspan = $(checkbox).closest(parentNode).find('.mw-rollback-link')[0];
		if (!rbspan) return console.error(SR, 'Rollback link not found for SR chekcbox.', checkbox);
		deferreds.push(ajaxRollback(rbspan, rollbackParams));
	});
	return $.when.apply($, deferreds);
}

/**
 * @param {string} title
 * @param {string} user
 * @param {object} params
 * @returns {JQuery.Promise<string|undefined>}
 */
function rollback(title, user, params) {
	return api.rollback(title, user, params)
		.then(function() {
			return;
		}).catch(function(code, err) {
			console.log(SR, err);
			return code;
		});
}

/**
 * @param {JQuery<HTMLDivElement>} $dialog
 * @param {HTMLLIElement|null} portlet
 */
function removeInterfaceIfNeeded($dialog, portlet) {
	var allRblinksResolved = !$('.mw-rollback-link:visible').length;
	if (allRblinksResolved) {
		$dialog.remove();
		if (portlet) portlet.remove();
	}
}

/**
 * Get a list of vandalism-in-progress and long-term-abuse shortcuts in the form of wikilinks (only for jawp)
 * @returns {JQueryPromise<Array<string>>}
 */
function getAutocompleteSource() {

	/**
	 * @returns {JQueryPromise<Array<string>>}
	 */
	var getVipList = function() {

		// Parse section titles of the page that lists VIPs
		return api.get({
			action: 'parse',
			page: 'Wikipedia:進行中の荒らし行為',
			prop: 'sections',
			format: 'json'
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
			return resSect.reduce(function(acc, obj) {
				if (excludeList.indexOf(obj.line) === -1 && obj.level == 3) {
					acc.push('[[WP:VIP#' + obj.line + ']]');
				}
				return acc;
			}, []);

		}).catch(function(code, err) {
			console.log(SR, 'Failed to get a VIP list.', err);
			return [];
		});

	};

	/**
	 * @returns {JQueryPromise<Array<string>>}
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
				format: 'json'
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

				}).catch(function(code, err) {
					console.log(SR, 'Failed to get an LTA list.', err);
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

// ********************************************************************************

})();
//</nowiki>
