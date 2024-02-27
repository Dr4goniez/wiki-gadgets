/***************************************************************************************************\

	Selective Rollback

	@author [[User:Dragoniez]]
	@version 4.0.0
	@see https://meta.wikimedia.org/wiki/User:Dragoniez/Selective_Rollback

	Some functionalities of this script are adapted from:
	@link https://meta.wikimedia.org/wiki/User:Hoo_man/smart_rollback.js
	@link https://en.wikipedia.org/wiki/User:DannyS712/AjaxRollback.js

\***************************************************************************************************/

/* global mw, OO */
/* eslint-disable @typescript-eslint/no-this-alias */
//<nowiki>
(function() {

	/**
	 * An across-the-board mw.Api instance.
	 * @type {mw.Api}
	 * @readonly
	 */
	var api;
	/**
	 * A regular expression for unicode bidirectional characters.
	 * @readonly
	 */
	var rUnicodeBidi = /[\u200E\u200F\u202A-\u202E]+/g;
	/**
	 * Index assigned to each rollback link.
	 */
	var srIndex = -1;

	init();

	/**
	 * The parent node of rollback links and checkboxes, "li" or "#mw-diff-ntitle2". On RCW, the value is `null`.
	 * @typedef {"li"|"#mw-diff-ntitle2"|null} ParentNode
	 */
	/**
	 * Initialize the script.
	 */
	function init() {
		// Load dependent modules and the DOM
		$.when(
			mw.loader.using(['mediawiki.api', 'mediawiki.util', 'jquery.ui', 'oojs-ui-core', 'oojs-ui-windows']),
			$.ready
		).then(function() {

			// Stop running the script if there're no visible rollback links
			if (!getRollbackLinks().length) return;

			// Set up variables
			api = new mw.Api();
			var spName = mw.config.get('wgCanonicalSpecialPageName');
			var onRCW = typeof spName === 'string' && ['Recentchanges', 'Watchlist'].indexOf(spName) !== -1;
			var /** @type {ParentNode} */ parentNode = (function() {
				if (onRCW) {
					return null;
				} else if (mw.config.get('wgAction') === 'history' || spName === 'Contributions') {
					return 'li';
				} else if (typeof mw.config.get('wgDiffNewId') === 'number') {
					return '#mw-diff-ntitle2';
				} else {
					var err = '[SR] Parent node could not be defined.';
					mw.notify(
						$('<div>').append(
							err + ' This is likely to be a bug of Selective Rollback. (',
							$('<a>')
								.prop({
									href: '//meta.wikimedia.org' + mw.util.getUrl('User_talk:Dragoniez/Selective_Rollback', {
											action: 'edit',
											section: 'new',
											preloadtitle: 'Error report (' + new Date().toJSON().replace(/T[^T]+$/, '').replace(/-/g, '') + ')',
											preload: 'User:Dragoniez/preload'
										}) +
										'&preloadparams%5B%5D=a%20parentNode%20error' +
										'&preloadparams%5B%5D=' + encodeURIComponent(location.href),
									target: '_blank'
								})
								.text('Report the error'),
							')'
						),
						{type: 'error', autoHideSeconds: 'long'}
					);
					throw new Error(err);
				}
			})();
			var cfg = getSRConfig();
			appendStyleTag(cfg);
			var msg = getMessages(cfg);

			// Get meta info from the API
			getMetaInfo().then(function(meta) {

				// Get the Dialog class and initialize an instance of it
				var Dialog = DialogFactory(cfg, msg, meta);
				var dialog = new Dialog();

				// Get the SR class
				var SR = SRFactory(dialog, cfg, msg, parentNode);

				// Initialize Selective Rollback
				/** @type {NodeJS.Timeout} */
				var hookTimeout;
				/**
				 * The hook to watch.
				 */
				var hook = mw.hook('wikipage.content');
				/**
				 * Storage for SR-ed rollback links.
				 * @type {Link}
				 */
				var links = Object.create(null);
				/**
				 * Function to execute when the page content is updated.
				 */
				var hookCallback = function() {
					// The hook can fire multiple times, but we need only initialize rollback links once in consective hook events
					clearTimeout(hookTimeout);
					hookTimeout = setTimeout(function() {
						if (dialog.isDestroyed()) {
							// If the dialog has been destroyed, unlisten to changes in the page content
							hook.remove(hookCallback);
							return;
						} else if (!$.isEmptyObject(links)) {
							// Create a new object of links that are not detached from the DOM
							links = Object.keys(links).reduce(function(acc, key) {
								if (document.body.contains(links[key].rbspan)) acc[key] = links[key];
								return acc;
							}, Object.create(null));
						}
						var sr = new SR(links); // Initialize rollback links and assign SR functionalities to them
						links = sr.links; // Store the initialized links for a next hook event
						dialog.bindSR(sr, onRCW); // Bind the SR instance to the Dialog instance
					}, 100);
				};
				hook.add(hookCallback); // Listen to updates in the page content

			});

		});
	}

	/**
	 * Get visible rollback links as a JavaScript array.
	 * @returns {HTMLSpanElement[]}
	 */
	function getRollbackLinks() {
		return Array.prototype.slice.call($('.mw-rollback-link:visible'));
	}

	/**
	 * @typedef SelectiveRollbackConfig
	 * @property {string} lang
	 * @property {Record<string, string>} editSummaries
	 * @property {boolean} showKeys
	 * @property {Record<string, string>} specialExpressions
	 * @property {boolean} markBot
	 * @property {boolean} watchPage
	 * @property {string} watchExpiry
	 * @property {"never"|"always"|"RCW"|"nonRCW"} confirm
	 * @property {string} checkboxLabelColor
	 */
	/**
	 * Get the Selective Rollback config, merged with the user config.
	 * @returns {SelectiveRollbackConfig}
	 */
	function getSRConfig() {

		var /** @type {SelectiveRollbackConfig} @readonly */ cfg = {
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

		// Sanitize and merge user config
		/**
		 * Check whether a config value is of the expected type.
		 * @param {"string"|"number"|"bigint"|"boolean"|"symbol"|"undefined"|"object"|"function"|"null"} expectedType
		 * @param {any} val
		 * @param {string} key
		 * @returns {boolean}
		 */
		var isOfType = function(expectedType, val, key) {
			var valType = val === null ? 'null' : typeof val;
			if (valType !== expectedType) {
				console.error('[SR] TypeError: ' + expectedType + ' expected for "' + key + '", but got ' + valType + '.');
				return false;
			} else {
				return true;
			}
		};
		// @ts-ignore
		var userCfg = window.selectiveRollbackConfig;
		if (typeof userCfg === 'object' && userCfg !== null) {
			Object.keys(userCfg).forEach(function(key) {

				key = key.replace(rUnicodeBidi, '').trim();
				var val = userCfg[key];

				// Strict type check
				var v;
				if (val === (v = null) || val === (v = undefined)) {
					console.error('[SR] The value ' + v + ' for "' + key + '" is invalid.');
					return;
				}
				switch (key) {
					case 'lang':
					case 'watchExpiry':
					case 'confirm':
					case 'checkboxLabelColor':
						if (!isOfType('string', val, key)) return;
						if (key === 'confirm' && ['never', 'always', 'RCW', 'nonRCW'].indexOf(val) === -1) {
							console.error('[SR] "' + val + '" isn\'t a valid value for "confirm".');
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
						console.error('[SR] "' + key + '" isn\'t a valid config key.');
						return;
				}

				if (key === 'watchExpiry') { // Some typo fix
					var m;
					val = val.replace(rUnicodeBidi, '').trim();
					if (/^in|^never/.test(key)) {
						val = 'indefinite';
					} else if ((m = /^1\s*(week|month|year)/.exec(val))) {
						val = '1 ' + m[1];
					} else if ((m = /^([36])\s*month/.exec(val))) {
						val = m[1] + ' months';
					// } else if (/^3\s*year/.test(val)) {
					//     val = '3 years';
					} else {
						console.error('[SR] "' + val + '" is not a valid watch-page expiry.');
						return;
					}
					userCfg[key] = val;
				}
				// @ts-ignore
				cfg[key] = userCfg[key];

			});
		}

		return cfg;

	}

	/**
	 * @typedef {object} Messages
	 * @property {string} portletlink-tooltip Tooltip for the portlet link used to open the SR dialog.
	 * @property {string} summary-label-primary The label for the edit summary dropdown.
	 * @property {string} summary-option-default The text for the default edit summary dropdown option.
	 * @property {string} summary-option-custom The text for the custom edit summary dropdown option.
	 * @property {string} summary-label-custom The label for the custom edit summary inputbox.
	 * @property {string} summary-tooltip-$0 Tooltip that says $0 will be replaced with the default edit summary.
	 * @property {string} summary-tooltip-$0-error [Contains a \<b> tag]: Tooltip that says $0 will be replaced with
	 * the default edit summary **in English**.
	 * @property {string} summary-tooltip-specialexpressions The leading text for replacement expressions.
	 * @property {string} summary-label-preview The label for the summary preview div.
	 * @property {string} summary-tooltip-preview Tooltip that says magic words in previewed summary will be replaced.
	 * @property {string} markbot-label The label for the markbot checkbox.
	 * @property {string} watchlist-label The label for the watch-page checkbox.
	 * @property {string} watchlist-expiry-label The label for the watch-expiry dropdown.
	 * @property {string} watchlist-expiry-indefinite The text for the indefinite expiry dropdown option.
	 * @property {string} watchlist-expiry-1week The text for the 1-week expiry dropdown option.
	 * @property {string} watchlist-expiry-1month The text for the 1-month expiry dropdown option.
	 * @property {string} watchlist-expiry-3months The text for the 3-month expiry dropdown option.
	 * @property {string} watchlist-expiry-6months The text for the 6-month expiry dropdown option.
	 * @property {string} watchlist-expiry-1year The text for the 1-year expiry dropdown option.
	 * @property {string} watchlist-expiry-3years The text for the 3-year expiry dropdown option.
	 * @property {string} button-rollbackchecked The text for "rollbackchecked" dialog button.
	 * @property {string} button-checkall The text for "checkall" dialog button.
	 * @property {string} button-close The text for "close" dialog button.
	 * @property {string} msg-nonechecked A mw.notify message for when no checkbox is checked for selective rollback.
	 * @property {string} msg-linksresolved A mw.notify message for when there's no checkbox to check when the "checkall" button is hit.
	 * @property {string} msg-confirm An OO.ui.confirm message to confirm rollback.
	 * @property {string} rbstatus-reverted The text for reverted rollback links.
	 * @property {string} rbstatus-failed The text for non-reverted rollback links.
	 * @property {string} rbstatus-notify-success Internal text ("Success") for a mw.notify message that shows how many rollbacks succeeded.
	 * @property {string} rbstatus-notify-failure Internal text ("Failure") for a mw.notify message that shows how many rollbacks failed.
	 */
	/**
	 * Get interface messages as an object.
	 * @param {SelectiveRollbackConfig} cfg
	 * @returns {Messages}
	 */
	function getMessages(cfg) {

		/**
		 * @typedef {"ja"|"en"|"zh"|"es"|"ro"} Languages
		 */
		/** @type {Record<Languages, Messages>} @readonly */
		var i18n = {
			ja: {
				'portletlink-tooltip': 'Selective Rollbackのダイアログを開く',
				'summary-label-primary': '編集要約',
				'summary-option-default': '標準の編集要約',
				'summary-option-custom': 'カスタム',
				'summary-label-custom': 'カスタム編集要約',
				'summary-tooltip-$0': '($0は標準の編集要約に置換されます。)',
				'summary-tooltip-$0-error': '($0は<b>英語の</b>標準編集要約に置換されます。)',
				'summary-tooltip-specialexpressions': '置換表現',
				'summary-label-preview': '要約プレビュー', // v4.0.0
				'summary-tooltip-preview': '(マジックワードは置換されます)', // v4.0.0
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
				'rbstatus-notify-success': '成功', // v4.0.0
				'rbstatus-notify-failure': '失敗' // v4.0.0
			},
			en: {
				'portletlink-tooltip': 'Open the Selective Rollback dialog',
				'summary-label-primary': 'Edit summary',
				'summary-option-default': 'Default edit summary',
				'summary-option-custom': 'Custom',
				'summary-label-custom': 'Custom edit summary',
				'summary-tooltip-$0': '($0 will be replaced with the default rollback summary.)',
				'summary-tooltip-$0-error': '($0 will be replaced with the default rollback summary <b>in English</b>.)',
				'summary-tooltip-specialexpressions': 'Replacement expressions',
				'summary-label-preview': 'Summary preview', // v4.0.0
				'summary-tooltip-preview': '(Magic words will be replaced)', // v4.0.0
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
				'rbstatus-failed': 'rollback failed',
				'rbstatus-notify-success': 'Success', // v4.0.0
				'rbstatus-notify-failure': 'Failure' // v4.0.0
			},
			zh: {
				'portletlink-tooltip': '打开Selective Rollback日志',
				'summary-label-primary': '编辑摘要',
				'summary-option-default': '默认编辑摘要',
				'summary-option-custom': '自定义',
				'summary-label-custom': '自定义编辑摘要',
				'summary-tooltip-$0': '($0将会被默认编辑摘要替代。)',
				'summary-tooltip-$0-error': '($0将会被默认编辑摘要为<b>英文</b>替代。)',
				'summary-tooltip-specialexpressions': '替换表达',
				'summary-label-preview': '编辑摘要的预览', // v4.0.0
				'summary-tooltip-preview': '(魔术字将被替换)', // v4.0.0
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
				'rbstatus-failed': '回退失败',
				'rbstatus-notify-success': '成功', // v4.0.0
				'rbstatus-notify-failure': '失败' // v4.0.0
			},
			/** @author [[User:64andtim]] */
			es: {
				'portletlink-tooltip': 'Abrir el diálogo Selective Rollback',
				'summary-label-primary': 'Resumen de edición',
				'summary-option-default': 'Resumen de edición automática',
				'summary-option-custom': 'Manual',
				'summary-label-custom': 'Resumen de edición manual',
				'summary-tooltip-$0': '($0 será reemplazada con la resumen de reversión automática.)',
				'summary-tooltip-$0-error': '($0 será reemplazada con la resumen de reversión automática <b>en inglés</b>.)',
				'summary-tooltip-specialexpressions': 'Expresiones de reemplazo',
				'summary-label-preview': 'Previsualización del resumen de edición', // v4.0.0
				'summary-tooltip-preview': '(Las palabras mágicas serán reemplazadas)', // v4.0.0
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
				'rbstatus-failed': 'la reversión falló',
				'rbstatus-notify-success': 'Éxito', // v4.0.0
				'rbstatus-notify-failure': 'Falla' // v4.0.0
			},
			/** @author [[User:NGC 54]] */
			ro: {
				'portletlink-tooltip': 'Deschide dialogul Selective Rollback',
				'summary-label-primary': 'Descrierea modificării',
				'summary-option-default': 'Descrierea implicită a modificării',
				'summary-option-custom': 'Personalizat',
				'summary-label-custom': 'Descriere personalizată a modificării',
				'summary-tooltip-$0': '($0 va fi înlocuit cu descrierea implicită a revenirii.)',
				'summary-tooltip-$0-error': '($0 va fi înlocuit cu descrierea implicită a revenirii <b>în engleză</b>.)',
				'summary-tooltip-specialexpressions': 'Expresii de înlocuire',
				'summary-label-preview': 'Previzualizare descriere', // v4.0.0
				'summary-tooltip-preview': '(Cuvintele magice vor fi înlocuite)', // v4.0.0
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
				'rbstatus-failed': 'revenire eșuată',
				'rbstatus-notify-success': 'Succes', // v4.0.0
				'rbstatus-notify-failure': 'Eșec' // v4.0.0
			}
		};

		var langSwitch = cfg.lang || mw.config.get('wgUserLanguage'); // Fall back to the user's language in preferences
		if (['ja', 'zh', 'es', 'ro'].indexOf(langSwitch) !== -1) {
			return i18n[langSwitch];
		} else {
			if (cfg.lang && cfg.lang !== 'en') {
				console.error('[SR] Sorry, "' + cfg.lang + '" is unavaiable as the interface language.');
			}
			return i18n.en;
		}

	}


	/**
	 * Append to the document head a \<style> tag for SR.
	 * @param {SelectiveRollbackConfig} cfg
	 * @returns {void}
	 */
	function appendStyleTag(cfg) {
		var style = document.createElement('style');
		style.textContent =
			'.sr-checkbox-wrapper {' +
				'display: inline-block;' +
			'}' +
			'.sr-checkbox {' +
				'margin-right: 0.5em;' +
			'}' +
			'.sr-rollback {' +
				'display: inline-block;' +
				'margin: 0 0.5em;' +
			'}' +
			'.sr-rollback-label {' +
				'font-weight: bold;' +
				'color: ' + cfg.checkboxLabelColor + ';' +
			'}' +
			'.sr-dialog-borderbox {' +
				'display: block;' +
				'width: 100%;' +
				'box-sizing: border-box;' +
				'border: 1px solid #777;' +
				'border-radius: 1%;' +
				'background-color: white;' +
				'padding: 2px 4px;' +
			'}';
		document.head.appendChild(style);
	}

	/**
	 * @typedef MetaInfo
	 * @type {object}
	 * @property {string} summary The raw `revertpage` message.
	 * @property {string} parsedsummary The `revertpage` message with {{PLURAL}} margic words parsed.
	 * @property {boolean} fetched Whether the default rollback summary was fetched.
	 * @property {string[]} rights The current user's user rights.
	 */
	/**
	 * Get the default rollback summary and the current user's user rights on the local wiki.
	 * @returns {JQueryPromise<MetaInfo>}
	 */
	function getMetaInfo() {
		return api.get({
			action: 'query',
			meta: 'allmessages|userinfo',
			ammessages: 'revertpage',
			amlang: mw.config.get('wgContentLanguage'), // the language of the wiki
			uiprop: 'rights',
			formatversion: '2'
		}).then(function(res) {
			/** @type {string=} */
			var summary = res && res.query && res.query.allmessages && res.query.allmessages[0] && res.query.allmessages[0].content;
			/** @type {string[]} */
			var rights = res && res.query && res.query.userinfo && res.query.userinfo.rights || [];
			return {
				summary: summary,
				rights: rights
			};
		}).catch(function(_, err) {
			console.log(err);
			return {
				summary: void 0,
				rights: []
			};
		}).then(/** @param {{summary: string|undefined; rights: string[];}} res */ function(res) {

			var fetched = !!res.summary;
			var summary = res.summary || 'Reverted edits by [[Special:Contributions/$2|$2]] ([[User talk:$2|talk]]) to last revision by [[User:$1|$1]]';
			var parsedsummary = summary;

			// Parse {{PLURAL}}
			var rPlural = /\{\{PLURAL:\$7\|(.+?)(?:\|(.*?))\}\}/gi;
			var m;
			while ((m = rPlural.exec(parsedsummary))) {
				parsedsummary = parsedsummary.replace(m[0], m[2] || m[1]);
			}

			return {
				summary: summary,
				parsedsummary: parsedsummary,
				fetched: fetched,
				rights: res.rights
			};

		});
	}

	/**
	 * @typedef {{$label: JQuery<HTMLLabelElement>; $checkbox: JQuery<HTMLInputElement>;}} Box
	 */
	/**
	 * Create a labeled checkbox.
	 * ```html
	 * <label class="sr-checkbox-wrapper">
	 * 	<input class="sr-checkbox" type="checkbox">
	 * 	<span>LABELTEXT</span>
	 * </label>
	 * ```
	 * @param {string} labelText
	 * @param {string} [textClassNames] Optional class names to apply to the text of the label.
	 * @returns {Box}
	 */
	function createCheckbox(labelText, textClassNames) {
		var /** @type {JQuery<HTMLLabelElement>} */ $label;
		var /** @type {JQuery<HTMLInputElement>} */ $checkbox;
		($label = $('<label>'))
			.addClass('sr-checkbox-wrapper')
			.append(
				($checkbox = $('<input>'))
					.prop({type: 'checkbox'})
					.addClass('sr-checkbox'),
				$('<span>')
					.text(labelText)
					.addClass(textClassNames || '')
			);
		return {$label: $label, $checkbox: $checkbox};
	}

	/**
	 * Additional parameters to `action=rollback`.
	 * @typedef RollbackParams
	 * @property {string} summary An empty string will be altered with the default summary by the mediawiki software
	 * @property {boolean} markbot
	 * @property {"nochange"|"preferences"|"unwatch"|"watch"} watchlist Default: preferences
	 * @property {string=} watchlistexpiry
	 */
	/**
	 * Return the Dialog class.
	 * @param {SelectiveRollbackConfig} cfg
	 * @param {Messages} msg
	 * @param {MetaInfo} meta
	 * @returns
	 */
	function DialogFactory(cfg, msg, meta) {

		function Dialog() {

			var _this = this;

			// Create dialog
			/**
			 * The SR dialog.
			 * @type {JQuery<HTMLDivElement>}
			 */
			this.$dialog = $('<div>');
			this.$dialog
				.prop({title: 'Selective Rollback'})
				.css({
					padding: '1em',
					maxWidth: '580px'
				}).dialog({
					dialogClass: 'sr-dialog',
					height: 'auto',
					width: 'auto',
					minWidth: 515,
					minHeight: 175,
					resizable: false,
					autoOpen: false,
					modal: true
				});

			// Property-related variables
			var /** @type {JQuery<HTMLSelectElement>} */ $summaryList;
			var /** @type {JQuery<HTMLInputElement>} */ $summary;
			var /** @type {JQuery<HTMLDivElement>} */ $summaryPreview;
			var /** @type {JQuery<HTMLParagraphElement>} */ $summaryPreviewTooltip;
			var botBox = createCheckbox(msg['markbot-label']);
			var watchBox = createCheckbox(msg['watchlist-label']);
			var /** @type {JQuery<HTMLUListElement>} */ $watchUl;
			var /** @type {JQuery<HTMLSelectElement>} */ $watchExpiry;

			// Intra-constructor variables
			var psId = 'sr-presetsummary';
			var csId = 'sr-customsummary';
			var /** @type {JQuery<HTMLOptionElement>} */ $psOptCustom;

			// Create dialog contents
			this.$dialog.append(
				// Preset summary wrapper
				$('<div>')
					.prop({id: 'sr-presetsummary-wrapper'})
					.css({marginBottom: '0.5em'})
					.append(
						$('<label>')
							.prop({htmlFor: psId})
							.text(msg['summary-label-primary']),
						($summaryList = $('<select>'))
							.prop({id: psId})
							.addClass('sr-dialog-borderbox')
							.append(
								$('<option>')
									.prop({
										id: 'sr-presetsummary-default',
										value: ''
									})
									.text(msg['summary-option-default']),
								(function() {
									// Append user-defined edit summaries if there's any
									var $options = $([]);
									if (!$.isEmptyObject(cfg.editSummaries)) {
										Object.keys(cfg.editSummaries).forEach(function(key) {
											$options = $options.add(
												$('<option>')
													.prop({value: cfg.editSummaries[key]})
													.text(cfg.showKeys ? key : cfg.editSummaries[key])
											);
										});
									}
									return $options;
								})(),
								($psOptCustom = $('<option>'))
									.prop({
										id: 'sr-presetsummary-custom',
										value: 'other'
									})
									.text(msg['summary-option-custom'])
							)
							.off('change').on('change', function() {
								_this.previewSummary();
							})
					),
				// Custom summary wrapper
				$('<div>')
					.prop({id: 'sr-customsummary-wrapper'})
					.css({marginBottom: '0.3em'})
					.append(
						$('<label>')
							.prop({htmlFor: csId})
							.text(msg['summary-label-custom']),
						($summary = $('<input>'))
							.prop({id: csId})
							.addClass('sr-dialog-borderbox')
							.off('focus').on('focus', function() {
								// When the custom summary field is focused, set the dropdown option to "other"
								var initiallySelected = $psOptCustom.is(':selected');
								$psOptCustom.prop('selected', true);
								if (!initiallySelected) {
									$summaryList.trigger('change');
								}
							})
							.off('input').on('input', function() {
								_this.previewSummary();
							}),
						$('<p>')
							.prop({
								id: 'sr-customsummary-$0',
								innerHTML: msg[meta.fetched ? 'summary-tooltip-$0' : 'summary-tooltip-$0-error']
							})
							.css({
								fontSize: 'smaller',
								margin: '0'
							}),
						$('<p>')
							.prop({id: 'sr-customsummary-$SE'})
							.css({
								fontSize: 'smaller',
								margin: '0',
								display: 'none'
							})
							.text(function() {
								// Show a list of special expressions if defined by the user
								if (!$.isEmptyObject(cfg.specialExpressions)) {
									var seTooltip = Object.keys(cfg.specialExpressions).join(', ');
									$(this).css({
										display: 'inline-block',
										marginBottom: '0'
									});
									return '(' + msg['summary-tooltip-specialexpressions'] + ': ' + seTooltip + ')';
								} else {
									return '';
								}
							})
					),
				// Summary preview wrapper
				$('<div>')
					.prop({id: 'sr-summarypreview-wrapper'})
					.append(
						document.createTextNode(msg['summary-label-preview']),
						($summaryPreview = $('<div>'))
							.prop({id: 'sr-summarypreview'})
							.addClass('sr-dialog-borderbox')
							.css({backgroundColor: 'initial'}),
						($summaryPreviewTooltip =  $('<p>'))
							.prop({id: 'sr-summarypreview-tooltip'})
							.text(msg['summary-tooltip-preview'])
							.css({
								fontSize: 'smaller',
								margin: '0'
							})
							.hide()
					)
					.css({marginBottom: '0.8em'}),
				// Markbot option wrapper
				$('<div>')
					.prop({id: 'sr-bot-wrapper'})
					.append(botBox.$label)
					.css('display', function() {
						if (meta.rights.indexOf('markbotedits') !== -1) {
							// If the current user has "markbotedits", show the checkbox and (un)check it in accordance with the config
							botBox.$checkbox.prop('checked', cfg.markBot);
							return 'block';
						} else {
							// If the current user doesn't have "markbotedits", hide the checkbox
							return 'none';
						}
					}),
				// Watchlist option wrapper
				$('<div>')
					.prop({id: 'sr-watchlist-wrapper'})
					.append(
						watchBox.$label,
						($watchUl = $('<ul>'))
							.prop({id: 'sr-watchlist-expiry'})
							.css({marginTop: '0.2em'})
							.hide()
							.append(
								$('<li>')
									.append(
										document.createTextNode(msg['watchlist-expiry-label']),
										($watchExpiry = $('<select>'))
											.prop({id: 'sr-watchlist-expiry-dropdown'})
											.css({marginLeft: '0.5em'})
											.append(
												[
													{value: 'indefinite', text: msg['watchlist-expiry-indefinite']},
													{value: '1 week', text: msg['watchlist-expiry-1week']},
													{value: '1 month', text: msg['watchlist-expiry-1month']},
													{value: '3 months', text: msg['watchlist-expiry-3months']},
													{value: '6 months', text: msg['watchlist-expiry-6months']},
													{value: '1 year', text: msg['watchlist-expiry-1year']}//,
													// {value: '3 years', text: msg['watchlist-expiry-3years']} // 1y is the max ATM; phab:T336142
												]
												.map(function(obj) {
													return $('<option>').prop('value', obj.value).text(obj.text);
												})
											)
											.val(cfg.watchExpiry)
									)
							)
					)
			);

			// Initialize the watchlist checkbox
			watchBox.$checkbox
				.off('change').on('change', function() {
					// Show/hide the expiry dropdown when the checkbox is (un)checked
					$watchUl.toggle($(this).is(':checked'));
				})
				.prop('checked', cfg.watchPage)
				.trigger('change');

			// Define properties
			/**
			 * The summary dropdown.
			 * @type {JQuery<HTMLSelectElement>}
			 */
			this.$summaryList = $summaryList;

			/**
			 * The summary input.
			 * @type {JQuery<HTMLInputElement>}
			 */
			this.$summary = $summary;

			/**
			 * The div for summary preview.
			 * @type {JQuery<HTMLDivElement>}
			 */
			this.$summaryPreview = $summaryPreview;

			/**
			 * The div for summary preview tooltip (which says "Magic words will be replaced").
			 * @type {JQuery<HTMLDivElement>}
			 */
			this.$summaryPreviewTooltip = $summaryPreviewTooltip;

			/**
			 * The markbox checkbox.
			 * @type {JQuery<HTMLInputElement>}
			 */
			this.$markbot = botBox.$checkbox;

			/**
			 * The watch-page checkbox.
			 * @type {JQuery<HTMLInputElement>}
			 */
			this.$watch = watchBox.$checkbox;

			/**
			 * The watch-expiry dropdown.
			 * @type {JQuery<HTMLSelectElement>}
			 */
			this.$watchExpiry = $watchExpiry;

			/**
			 * The portlet link to open the SR dialog.
			 * @type {HTMLLIElement?}
			 */
			this.portlet = mw.util.addPortletLink(
				mw.config.get('skin') === 'minerva' ? 'p-personal' : 'p-cactions',
				'#',
				'Selective Rollback',
				'ca-sr',
				msg['portletlink-tooltip'],
				void 0,
				'#ca-move'
			);
			if (this.portlet) {
				this.portlet.addEventListener('click', function(e) {
					e.preventDefault();
					_this.open();
				});
			} else {
				console.error('[SR] Failed to create a portlet link.');
			}

			/**
			 * Whether the dialog has been destroyed.
			 * @type {boolean}
			 */
			this.destroyed = false;

			// On jawp, set up autocomplete for the custom summary textbox
			var moduleName = 'ext.gadget.WpLibExtra';
			if (mw.config.get('wgWikiID') === 'jawiki' && mw.loader.getModuleNames().indexOf(moduleName) !== -1) {
				mw.loader.using(moduleName).then(function(require) {
					var /** @type {WpLibExtra} */ lib = require(moduleName);
					$.when(lib.getVipList('wikilink'), lib.getLtaList('wikilink')).then(function(vipList, ltaList) {
						var list = vipList.concat(ltaList);
						$summary.autocomplete({
							source: function(req, res) {
								// Limit the list to the maximum number of 10, or it can stick out of the viewport
								var results = $.ui.autocomplete.filter(list, req.term);
								res(results.slice(0, 10));
							},
							select: function(_, ui) {
								// When the event is triggered, getSummary picks up the value before selection
								// Because of this, pick up the autocompleted value and pass it to previewSummary
								var /** @type {string?} */ val = ui.item && ui.item.value;
								if (val) {
									_this.previewSummary(val);
								}
							},
							position: {
								my: 'left bottom',
								at: 'left top'
							}
						});
					});
				});
			}

			// Initialize summary preview
			this.$summary.trigger('input');

		}

		/**
		 * Bind an SR instance to this instance of the Dialog class and construct buttons.
		 * @param {InstanceType<ReturnType<typeof SRFactory>>} sr
		 * @param {boolean} onRCW
		 * @returns {Dialog}
		 */
		Dialog.prototype.bindSR = function(sr, onRCW) {
			var _this = this;
			var btns = [
				{	// "Rollback checked" button
					text: msg['button-rollbackchecked'],
					click: function() {
						sr.selectiveRollback();
					}
				},
				{	// "Check all" button
					text: msg['button-checkall'],
					click: function() {
						var cnt = 0;
						for (var key in sr.links) {
							var obj = sr.links[key];
							if (obj.box) {
								obj.box.$checkbox.prop('checked', true);
								cnt++;
							}
						}
						if (!cnt) {
							mw.notify(msg['msg-linksresolved'], {type: 'warn'});
						}
					}
				},
				{	// "Close" button
					text: msg['button-close'],
					click: function() {
						_this.close();
					}
				}
			];
			if (onRCW) btns.splice(0, 2); // Only leave the "Close" button if the user is on RCW
			this.$dialog.dialog({buttons: btns});
			return this;
		};

		/**
		 * Open the SR dialog.
		 * @returns {Dialog}
		 */
		Dialog.prototype.open = function() {
			this.$dialog.dialog('open');
			return this;
		};

		/**
		 * Close the SR dialog.
		 * @returns {Dialog}
		 */
		Dialog.prototype.close = function() {
			this.$dialog.dialog('close');
			return this;
		};

		/**
		 * Destroy the dialog. This method also removes the portlet link.
		 * @returns {void}
		 */
		Dialog.prototype.destroy = function() {
			this.$dialog.empty().dialog('destroy');
			this.destroyed = true;
			if (this.portlet) this.portlet.remove();
		};

		/**
		 * Get the destroyed state of the dialog.
		 * @returns {boolean}
		 */
		Dialog.prototype.isDestroyed = function() {
			return this.destroyed;
		};

		/**
		 * Get summary.
		 * @returns {string} Can return an empty string if the default option is selected or if the custom option is selected but the
		 * input for a custom summary is empty.
		 *
		 * Note that the default rollback summary is used by the mediawiki software if the `summary` parameter to `action=rollback`
		 * is unspecified or specified with an empty string.
		 */
		Dialog.prototype.getSummary = function() {
			var summary = this.$summaryList.val() === 'other' ? this.$summary[0].value.replace(rUnicodeBidi, '').trim() : this.$summaryList[0].value;
			if (summary === '$0') {
				// If the summary is customized but is only of "$0", let the mediawiki software use the default summary
				// (This leads to a better performance of magic word parsing)
				summary = '';
			} else {
				// Replace $0 with the default summary
				summary = summary.replace('$0', meta.parsedsummary);
			}
			if (!$.isEmptyObject(cfg.specialExpressions)) { // Replace special expressions as defined by the user
				for (var key in cfg.specialExpressions) {
					summary = summary.split(key).join(cfg.specialExpressions[key]);
				}
			}
			return summary;
		};

		/**
		 * Get the checked state of the markbot box.
		 * @returns {boolean}
		 */
		Dialog.prototype.getMarkBot = function() {
			return this.$markbot.is(':checked');
		};

		/**
		 * Get the checked state of the watch-page box, converted to a string value.
		 * @returns {"watch"|"nochange"}
		 */
		Dialog.prototype.getWatchlist = function() {
			return this.$watch.is(':checked') ? 'watch' : 'nochange';
		};

		/**
		 * Get the selected watchlist expiry.
		 * @returns {string=} `undefined` if the watch-page box isn't checked.
		 */
		Dialog.prototype.getWatchlistExpiry = function() {
			return this.$watch.is(':checked') && this.$watchExpiry[0].value || void 0;
		};

		/**
		 * Get parameters to `action=rollback`.
		 * @returns {RollbackParams}
		 */
		Dialog.prototype.getParams = function() {
			return {
				summary: this.getSummary(),
				markbot: this.getMarkBot(),
				watchlist: this.getWatchlist(),
				watchlistexpiry: this.getWatchlistExpiry()
			};
		};

		var /** @type {mw.Api} @readonly */ previewApi = new mw.Api();
		var /** @type {NodeJS.Timeout} */ previewTimeout;
		/**
		 * Preview summary.
		 * @param {string} [manualSummary] If not passed, the method calls `getSummary`.
		 * @returns {void}
		 */
		Dialog.prototype.previewSummary = function(manualSummary) {
			clearTimeout(previewTimeout);
			var _this = this;

			// Get summary to preview
			var summary = manualSummary || this.getSummary();
			var containsMagicWords = false;
			if (!summary) { // If the obtained summary is an empty string, preview the default summary
				summary = meta.summary; // Might contain magic words
				containsMagicWords = /\{\{plural:/i.test(summary);
			}

			// Preview
			previewTimeout = setTimeout(function() {
				previewApi.abort();
				previewApi.post({
					action: 'parse',
					summary: summary,
					prop: '',
					formatversion: '2'
				}).then(function(res) {
					return res && res.parse && typeof res.parse.parsedsummary === 'string' ? res.parse.parsedsummary : null;
				}).catch(/** @param {object} err */ function(_, err) {
					if (err && err.exception !== 'abort') {
						console.log(err);
					}
					return null;
				}).then(/** @param {string?} parsedsummary */ function(parsedsummary) {
					parsedsummary = parsedsummary !== null ? parsedsummary : '???';
					_this.$summaryPreview.prop('innerHTML', parsedsummary);
					_this.$summaryPreviewTooltip.toggle(containsMagicWords); // Toggle the visibility of the magic word tooltip
				});
			}, 500);
		};

		return Dialog;

	}

	/**
	 * Object that stores elements related to the SR checkbox.
	 * @typedef {{$wrapper: JQuery<HTMLSpanElement>;} & Box} SRBox
	 */
	/**
	 * Object that stores rollback links and their associated SR checkboxes.
	 * @typedef {Record<string, {rbspan: HTMLSpanElement; box: SRBox?;}>} Link
	 */
	/**
	 * Return the SR class.
	 * @param {InstanceType<ReturnType<typeof DialogFactory>>} dialog An instance of the Dialog class.
	 * @param {SelectiveRollbackConfig} cfg
	 * @param {Messages} msg
	 * @param {ParentNode} parentNode
	 * @returns
	 */
	function SRFactory(dialog, cfg, msg, parentNode) {

		/** @readonly */
		var onRCW = !parentNode;

		/**
		 * Initialize an SR instance.
		 * @constructor
		 * @param {Link} unresolvedLinks SR-ed rollback links previously initialized but yet to be resolved.
		 */
		function SR(unresolvedLinks) {

			var _this = this;

			/**
			 * An object of rollback spans and their associated SR checkboxes.
			 *
			 * Each rbspan has `data-sr-index` to be used to unbind the associated property from the class.
			 * @type {Link}
			 */
			this.links = getRollbackLinks().reduce(function(acc, rbspan) {

				// Set up data for the wrapper span
				var $rbspan = $(rbspan);
				var clss = 'sr-rollback-link';
				if ($rbspan.hasClass(clss)) {
					return acc;
				}
				$rbspan
					.addClass(clss)
					.data('sr-index', (++srIndex));

				// Add an SR checkbox
				var /** @type {SRBox?} */ box = null;
				if (parentNode && (box = SR.createCheckbox())) {
					$rbspan.closest(parentNode).append(box.$wrapper);
				}

				// Bind AJAX rollback as a click event
				rbspan.addEventListener('click', function clickEvent(e) {
					e.preventDefault();
					var rbspan = this;
					var ajaxRollback = function() {
						_this.ajaxRollback(rbspan, box).then(function() {
							rbspan.removeEventListener('click', clickEvent);
						});
					};
					if (e.ctrlKey) {
						// If CTRL key is pressed down, just open the dialog, not executing rollback
						dialog.open();
					} else if (
						// Confirm rollback per config
						!e.shiftKey && (
							cfg.confirm === 'always' ||
							onRCW && cfg.confirm === 'RCW' ||
							!onRCW && cfg.confirm === 'nonRCW'
						)
					) {
						OO.ui.confirm(msg['msg-confirm']).then(function(confirmed) {
							if (confirmed) ajaxRollback();
						});
					} else {
						ajaxRollback();
					}
				});

				acc[srIndex] = {
					rbspan: rbspan,
					box: box
				};
				return acc;

			}, unresolvedLinks);

		}

		/**
		 * Create an SR checkbox.
		 * @returns {SRBox}
		 * @static
		 */
		SR.createCheckbox = function() {
			var box = createCheckbox('SR', 'sr-rollback-label');
			var /** @type {JQuery<HTMLSpanElement>} */ $wrapper =
			$('<span>')
				.addClass('sr-rollback')
				.append(
					$('<b>').text('['),
					box.$label,
					$('<b>').text(']')
				);
			box.$checkbox.css({margin: '0 0.3em 0 0.2em'});
			return {$wrapper: $wrapper, $label: box.$label, $checkbox: box.$checkbox};
		};

		/**
		 * Perform AJAX rollback on a rollback link.
		 * @param {HTMLSpanElement} rbspan The wrapper span of the rollback link.
		 * @param {SRBox?} box The SR checkbox object. (**Note: this method removes the box unconditionally.**)
		 * @param {RollbackParams} [params] Parameters to `action=rollback`. If none is passed, obtained from the dialog.
		 * @returns {JQueryPromise<boolean>} Whether the rollback succeeded.
		 */
		SR.prototype.ajaxRollback = function(rbspan, box, params) {

			var _this = this;
			if (box) box.$wrapper.remove();
			params = params || dialog.getParams();

			// Collect required parameters to action=rollback from the rollback link internal to the rbspan
			var rblink = rbspan.querySelector('a');
			var href = rblink && rblink.href;
			var title = href && mw.util.getParamValue('title', href);
			var user = href && mw.util.getParamValue('from', href);
			if (!rblink || !title || !user) {
				var info =
					!rblink ? '[SR] Error: Anchor tag is missing in the rollback link for some reason.' :
					!title ? '[SR] Error: The rollback link does not have a "title" query parameter.' :
					'[SR] Error: The rollback link does not have a "from" query parameter.';
				var code = !rblink ? 'linkmissing' : !title ? 'titlemissing' : 'usermissing';
				console.error(info, rbspan);
				this.processRollbackLink(rbspan, code);
				return $.Deferred().resolve(false);
			}

			// Perform AJAX rollback
			this.processRollbackLink(rbspan, null);
			return rollback(title, user, params).then(function(err) {
				_this.processRollbackLink(rbspan, err);
				return !err;
			});

		};

		/**
		 * Replace the innerHTML of a rollback link with the result of a rollback or a loading spinner.
		 *
		 * This method also unbinds the rollback link from the class if needed.
		 * @param {HTMLSpanElement} rbspan
		 * @param {string?} [result] An error code on failure, `undefined` on success, `null` for a loading spinner.
		 * @returns {void}
		 */
		SR.prototype.processRollbackLink = function(rbspan, result) {
			var $rbspan = $(rbspan);
			if (result === null) {
				// Replace the innerHTML of the rbspan with a loading spinner
				$rbspan
					.prop({'innerHTML': ''})
					.append(
						$('<img>')
							.prop({src: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif'})
							.css({
								verticalAlign: 'middle',
								height: '1em',
								border: 0
							})
					);
			} else {

				// Replace the innerHTML of the rbspan with a rollback result
				$rbspan
					.prop({'innerHTML': ''})
					.append(
						document.createTextNode('['),
						$('<span>')
							.text(result ? msg['rbstatus-failed'] + ' (' + result + ')' : msg['rbstatus-reverted'])
							.css({backgroundColor: result ? 'lightpink' : 'lightgreen'}),
						document.createTextNode(']')
					)
					.removeClass('mw-rollback-link')
					.addClass('sr-rollback-link-resolved');

				// Unbind the rbspan from the class
				var /** @type {string} */ index = $rbspan.data('sr-index');
				delete this.links[index];

				// If no rbspan is bound to the class any longer, remove the dialog and the portlet link
				if (!onRCW && $.isEmptyObject(this.links)) {
					dialog.destroy();
				}

			}
		};

		/**
		 * Send an `action=rollback` HTTP request.
		 * @param {string} title
		 * @param {string} user
		 * @param {RollbackParams} params
		 * @returns {JQueryPromise<string|undefined>} Error code or `undefined`.
		 */
		function rollback(title, user, params) {
			return api.rollback(title, user, params)
				.then(function() {
					return void 0;
				}).catch(function(code, err) {
					console.log(err);
					return code;
				});
		}

		/**
		 * Perform selective rollback.
		 * @returns {void}
		 */
		SR.prototype.selectiveRollback = function() {

			// Perform AJAX rollback on links whose associated SR checkboxes are checked
			var /** @type {JQueryPromise<boolean>[]} */ deferreds = [];
			var params = dialog.getParams();
			for (var key in this.links) {
				var obj = this.links[key];
				if (obj.box && obj.box.$checkbox.is(':checked')) {
					deferreds.push(this.ajaxRollback(obj.rbspan, obj.box, params));
				}
			}

			// Post-procedures
			if (!deferreds.length) {
				// Show a message if no SR checkbox is checked
				mw.notify(msg['msg-nonechecked'], {type: 'warn'});
			} else {
				dialog.close();
				$.when.apply($, deferreds).then(function() {
					// When all rollback requests are done, show a message that tells how many rollback links were processed
					var reverted = 0;
					var failed = 0;
					Object.keys(arguments).forEach(function(key) {
						var success = arguments[key];
						if (success) {
							reverted++;
						} else {
							failed++;
						}
					});
					mw.notify(
						$('<div>').append(
							document.createTextNode('Selective Rollback (' + (reverted + failed) + ')'),
							$('<ul>').append(
								$('<li>').text(msg['rbstatus-notify-success'] + ': ' + reverted),
								$('<li>').text(msg['rbstatus-notify-failure'] + ': ' + failed)
							)
						),
						{type: 'success'}
					);
				});
			}

		};

		return SR;

	}

})();
//</nowiki>