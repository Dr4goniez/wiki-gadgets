/***************************************************************************************************\

	Selective Rollback

	@author [[User:Dragoniez]]
	@version 4.3.6
	@see https://meta.wikimedia.org/wiki/User:Dragoniez/Selective_Rollback

	Some functionalities of this script are adapted from:
	@link https://meta.wikimedia.org/wiki/User:Hoo_man/smart_rollback.js
	@link https://en.wikipedia.org/wiki/User:DannyS712/AjaxRollback.js

\***************************************************************************************************/

// @ts-check
/// <reference path="./window/Selective Rollback.d.ts" />
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
	 * The parent node that rollback links should look for for SR checkbox generation. If the checkbox shouldn't be generated, the value is `false`,
	 * and if on RCW, the value is `null`.
	 * @typedef {"li"|"#mw-diff-ntitle2"|false|null} ParentNode
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
			api = new mw.Api({
				ajax: {
					headers: {
						'Api-User-Agent': 'Selective_Rollback/4.3.6 (https://meta.wikimedia.org/wiki/User:Dragoniez/Selective_Rollback.js)'
					}
				}
			});
			var /** @type {ParentNode} */ parentNode = (function() {
				var spName = mw.config.get('wgCanonicalSpecialPageName');
				if (typeof spName === 'string' && ['Recentchanges', 'Watchlist'].indexOf(spName) !== -1) {
					return null; // RCW
				} else if (
					mw.config.get('wgAction') === 'history' ||
					(spName && ['Contributions', 'IPContributions', 'GlobalContributions'].indexOf(spName) !== -1)
				) {
					return 'li';
				} else if (typeof mw.config.get('wgDiffNewId') === 'number') {
					return '#mw-diff-ntitle2';
				} else if (document.querySelector('.mw-changeslist-line')) {
					// Special:Recentchanges can be transcluded, and rollback links can be generated in it depending on server settings,
					// and only RC and Watchlist use the class "mw-changeslist-line" (presumably). This condition block thus checks
					// whether the current page transcludes RC, and if so, SR checkboxes shouldn't be generated.
					return false;
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
						{ type: 'error', autoHideSeconds: 'long' }
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
				 * The hook to listen to.
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
						links = sr.links; // Store the SR-ed links for a next hook event
						dialog.bindSR(sr, parentNode); // Bind the SR instance to the Dialog instance
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
			mobileConfirm: 'always',
			checkboxLabelColor: 'orange'
		};

		// Sanitize and merge user config
		/**
		 * Check whether a config value is of the expected type.
		 * @type {IsOfType}
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
		var userCfg = window.selectiveRollbackConfig;
		if (typeof userCfg === 'object' && userCfg !== null) {
			for (var key in userCfg) {

				key = key.replace(rUnicodeBidi, '').trim();
				var val = userCfg[/** @type {keyof SelectiveRollbackConfig} */ (key)];

				// Strict type check
				var v;
				if (val === (v = null) || val === (v = undefined)) {
					console.error('[SR] The value ' + String(v) + ' for "' + key + '" is invalid.');
					continue;
				}
				switch (key) {
					case 'lang':
					case 'watchExpiry':
					case 'confirm':
					case 'mobileConfirm':
					case 'checkboxLabelColor':
						if (!isOfType('string', val, key)) continue;
						if (['confirm', 'mobileConfirm'].indexOf(key) !== -1 && ['never', 'always', 'RCW', 'nonRCW'].indexOf(val) === -1) {
							console.error('[SR] "' + val + '" isn\'t a valid value for "' + key + '".');
							continue;
						}
						break;
					case 'editSummaries':
					case 'specialExpressions':
						if (!isOfType('object', val, key)) continue;
						break;
					case 'showKeys':
					case 'markBot':
					case 'watchPage':
						if (!isOfType('boolean', val, key)) continue;
						break;
					default:
						console.error('[SR] "' + key + '" isn\'t a valid config key.');
						continue;
				}

				if (key === 'watchExpiry') { // Some typo fix
					var m;
					val = String(val).replace(rUnicodeBidi, '').trim();
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
						continue;
					}
					// @ts-expect-error
					userCfg[key] = val;
				}
				// @ts-expect-error
				cfg[key] = userCfg[key];

			}
		}

		return cfg;

	}

	/**
	 * Get interface messages as an object.
	 * @param {SelectiveRollbackConfig} cfg
	 * @returns {Messages}
	 */
	function getMessages(cfg) {

		/**
		 * @typedef {"ja"|"en"|"zh"|"es"|"ro"|"vi"} Languages
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
				'summary-tooltip-preview': '(マジックワードは置換されます。)', // v4.0.0
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
				'summary-tooltip-preview': '(Magic words will be replaced.)', // v4.0.0
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
				'summary-tooltip-preview': '(魔术字将被替换。)', // v4.0.0
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
			/** @author [[User:Codename Noreste]] */
			es: {
				'portletlink-tooltip': 'Abrir el cuadro de diálogo para Selective Rollback',
				'summary-label-primary': 'Resumen de edición',
				'summary-option-default': 'Resumen de edición predeterminado',
				'summary-option-custom': 'Personalizado',
				'summary-label-custom': 'Resumen de edición personalizada',
				'summary-tooltip-$0': '($0 será reemplazado con el resumen de edición predeterminado.)',
				'summary-tooltip-$0-error': '($0 será reemplazado con él resumen de edición predeterminado <b>en inglés</b>.)',
				'summary-tooltip-specialexpressions': 'Expresiones de reemplazo',
				'summary-label-preview': 'Vista previa del resumen', // v4.0.0
				'summary-tooltip-preview': '(Las palabras mágicas serán reemplazadas.)', // v4.0.0
				'markbot-label': 'Marcar las reversiones como ediciones del bot',
				'watchlist-label': 'Añadir las páginas de destino a la lista de seguimiento',
				'watchlist-expiry-label': 'Expiración',
				'watchlist-expiry-indefinite': 'Siempre',
				'watchlist-expiry-1week': '1 semana',
				'watchlist-expiry-1month': '1 mes',
				'watchlist-expiry-3months': '3 meses',
				'watchlist-expiry-6months': '6 meses',
				'watchlist-expiry-1year': '1 años',
				'watchlist-expiry-3years': '3 años', // Not used
				'button-rollbackchecked': 'Reversión marcada',
				'button-checkall': 'Marcar todo',
				'button-close': 'Cerrar',
				'msg-nonechecked': 'No hay ninguna casilla de verificación marcada.',
				'msg-linksresolved': 'Los enlaces de reversión en esta página se han resuelto todos.',
				'msg-confirm': '¿Estás seguro de que quieres revertir esta edición?',
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
				'summary-tooltip-preview': '(Cuvintele magice vor fi înlocuite.)', // v4.0.0
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
			},
			/** @author [[User:Hide on Rosé]] */
			vi: {
				'portletlink-tooltip': 'Mở hộp thoại Lùi sửa theo lựa chọn',
				'summary-label-primary': 'Tóm lược sửa đổi',
				'summary-option-default': 'Tóm lược sửa đổi mặc định',
				'summary-option-custom': 'Tuỳ chỉnh',
				'summary-label-custom': 'Tóm lược tuỳ chỉnh',
				'summary-tooltip-$0': '($0 sẽ được thay bằng tóm lược sửa đổi mặc định.)',
				'summary-tooltip-$0-error': '($0 sẽ được thay bằng tóm lược sửa đổi mặc định <b>trong tiếng Anh</b>.)',
				'summary-tooltip-specialexpressions': 'Thay thế biểu thức',
				'summary-label-preview': 'Xem trước tóm lược', // v4.0.0
				'summary-tooltip-preview': '(Từ ma thuật sẽ được thay thế.)', // v4.0.0
				'markbot-label': 'Đánh dấu là sửa đổi bot',
				'watchlist-label': 'Thêm trang mục tiêu vào danh sách theo dõi',
				'watchlist-expiry-label': 'Hết hạn',
				'watchlist-expiry-indefinite': 'Vô hạn',
				'watchlist-expiry-1week': '1 tuần',
				'watchlist-expiry-1month': '1 tháng',
				'watchlist-expiry-3months': '3 tháng',
				'watchlist-expiry-6months': '6 tháng',
				'watchlist-expiry-1year': '1 năm',
				'watchlist-expiry-3years': '3 năm', // Not used
				'button-rollbackchecked': 'Đã chọn để lùi sửa',
				'button-checkall': 'Chọn tất cả',
				'button-close': 'Đóng',
				'msg-nonechecked': 'Chưa chọn sửa đổi.',
				'msg-linksresolved': 'Đã xử lý tất cả liên kết lùi sửa.',
				'msg-confirm': 'Bạn có muốn lùi sửa sửa đổi này không?',
				'rbstatus-reverted': 'đã lùi sửa',
				'rbstatus-failed': 'lùi lại không thành công',
				'rbstatus-notify-success': 'Thành công', // v4.0.0
				'rbstatus-notify-failure': 'Không thành công' // v4.0.0
			}
		};

		var langSwitch = (cfg.lang || mw.config.get('wgUserLanguage')).replace(/-.*$/, ''); // Fall back to the user's language in preferences
		if (Object.keys(i18n).indexOf(langSwitch) !== -1) {
			return i18n[/** @type {Languages} */ (langSwitch)];
		} else {
			if (cfg.lang) {
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
				'vertical-align: middle;' +
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
				'padding: 2px 4px;' +
			'}' +
			'.sr-dialog-tooltip {' +
				'font-size: smaller;' +
				'margin: 0;' +
			'}' +
			'#sr-summarypreview {' +
				'max-height: 5em;' +
				'overflow: auto;' +
				'overflow-wrap: break-word;' +
				'word-wrap: break-word;' +
				'color: var(--color-base, white);' +
				'background-color: var(--background-color-neutral, #54595d);' +
			'}';
		document.head.appendChild(style);
	}

	/**
	 * @typedef {object} MetaInfo
	 * @property {string} summary The raw `revertpage` message.
	 * @property {string} parsedsummary The `revertpage` message with {{PLURAL}} margic words parsed.
	 * @property {boolean} fetched Whether the default rollback summary was fetched.
	 * @property {string[]} rights The current user's user rights.
	 */
	/**
	 * Get the default rollback summary and the current user's user rights on the local wiki.
	 * @returns {JQuery.Promise<MetaInfo>}
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
		}).then(/** @param {{ summary: string|undefined; rights: string[]; }} res */ function(res) {

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
	 * @typedef {{ $label: JQuery<HTMLLabelElement>; $checkbox: JQuery<HTMLInputElement>; }} Box
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
					.prop({ type: 'checkbox' })
					.addClass('sr-checkbox'),
				$('<span>')
					.text(labelText)
					.addClass(textClassNames || '')
			);
		return { $label: $label, $checkbox: $checkbox };
	}

	/**
	 * Additional parameters to `action=rollback`.
	 * @typedef {object} RollbackParams
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
				.prop({ title: 'Selective Rollback' })
				.css({
					padding: '1em',
					maxWidth: '580px'
				})
				.dialog({
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
					.prop({ id: 'sr-presetsummary-wrapper' })
					.css({ marginBottom: '0.5em' })
					.append(
						$('<label>')
							.prop({ htmlFor: psId })
							.text(msg['summary-label-primary']),
						($summaryList = $('<select>'))
							.prop({ id: psId })
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
													.prop({ value: cfg.editSummaries[key] })
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
					.prop({ id: 'sr-customsummary-wrapper' })
					.css({ marginBottom: '0.3em' })
					.append(
						$('<label>')
							.prop({ htmlFor: csId })
							.text(msg['summary-label-custom']),
						($summary = $('<input>'))
							.prop({ id: csId })
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
							.addClass('sr-dialog-tooltip'),
						$('<p>')
							.prop({id: 'sr-customsummary-$SE'})
							.addClass('sr-dialog-tooltip')
							.text(function() {
								// Show a list of special expressions if defined by the user
								if (!$.isEmptyObject(cfg.specialExpressions)) {
									var seTooltip = Object.keys(cfg.specialExpressions).join(', ');
									return '(' + msg['summary-tooltip-specialexpressions'] + ': ' + seTooltip + ')';
								} else {
									$(this).hide();
									return '';
								}
							})
					),
				// Summary preview wrapper
				$('<div>')
					.prop({ id: 'sr-summarypreview-wrapper' })
					.append(
						document.createTextNode(msg['summary-label-preview']),
						($summaryPreview = $('<div>'))
							.prop({ id: 'sr-summarypreview' })
							.addClass('sr-dialog-borderbox'),
						($summaryPreviewTooltip =  $('<p>'))
							.prop({ id: 'sr-summarypreview-tooltip' })
							.text(msg['summary-tooltip-preview'])
							.addClass('sr-dialog-tooltip')
							.hide()
					)
					.css({ marginBottom: '0.8em' }),
				// Markbot option wrapper
				$('<div>')
					.prop({ id: 'sr-bot-wrapper' })
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
					.prop({ id: 'sr-watchlist-wrapper' })
					.append(
						watchBox.$label,
						($watchUl = $('<ul>'))
							.prop({ id: 'sr-watchlist-expiry' })
							.css({ marginTop: '0.2em' })
							.hide()
							.append(
								$('<li>')
									.append(
										document.createTextNode(msg['watchlist-expiry-label']),
										($watchExpiry = $('<select>'))
											.prop({ id: 'sr-watchlist-expiry-dropdown' })
											.css({ marginLeft: '0.5em' })
											.append(
												[
													{ value: 'indefinite', text: msg['watchlist-expiry-indefinite'] },
													{ value: '1 week', text: msg['watchlist-expiry-1week'] },
													{ value: '1 month', text: msg['watchlist-expiry-1month'] },
													{ value: '3 months', text: msg['watchlist-expiry-3months'] },
													{ value: '6 months', text: msg['watchlist-expiry-6months'] },
													{ value: '1 year', text: msg['watchlist-expiry-1year'] }//,
													// { value: '3 years', text: msg['watchlist-expiry-3years'] } // 1y is the max ATM; phab:T336142
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
							/**
							 * @param {{ term: string; }} req
							 * @param {(data: any) => void} res
							 */
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
		 * Bind an SR instance to the Dialog instance, and construct buttons.
		 * @param {InstanceType<ReturnType<typeof SRFactory>>} sr
		 * @param {ParentNode} parentNode
		 * @returns {Dialog}
		 */
		Dialog.prototype.bindSR = function(sr, parentNode) {
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
						var cnt = Object.keys(sr.links).reduce(function(acc, key) {
							var obj = sr.links[key];
							if (obj.box) {
								obj.box.$checkbox.prop('checked', true);
								acc++;
							}
							return acc;
						}, 0);
						if (!cnt) {
							mw.notify(msg['msg-linksresolved'], { type: 'warn' });
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
			if (!parentNode) btns.splice(0, 2); // Only leave the "Close" button if parentNode is a falsy value
			this.$dialog.dialog({ buttons: btns });
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

		var /** @type {mw.Api} @readonly */ previewApi = new mw.Api({
			ajax: {
				headers: {
					'Api-User-Agent': 'Selective Rollback/4.3.6 (https://meta.wikimedia.org/wiki/User:Dragoniez/Selective_Rollback.js)',
					/** @see https://www.mediawiki.org/wiki/API:Etiquette#Other_notes */
					// @ts-expect-error
					'Promise-Non-Write-API-Action': true
				}
			}
		});
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
				}).catch(/** @param {Record<string, any>} err */ function(_, err) {
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
	 * @typedef {{ $wrapper: JQuery<HTMLSpanElement>; } & Box} SRBox
	 */
	/**
	 * Object that stores rollback links and their associated SR checkboxes.
	 * @typedef {Record<string, { rbspan: HTMLSpanElement; box: SRBox?; }>} Link
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
		var onRCW = parentNode === null;

		/**
		 * Initialize an SR instance.
		 * @constructor
		 * @param {Link} unresolvedLinks SR-ed rollback links previously initialized but yet to be resolved.
		 */
		function SR(unresolvedLinks) {

			var _this = this;

			/** Adapted from {@link https://github.com/wikimedia/mediawiki-extensions-MobileDetect/blob/master/src/Hooks.php}. */
			var rMobile = new RegExp(
				// iPod/iPhone
				'ipod|iphone|' +
				// Android
				'android|' +
				// Opera Mini/Mobile
				'opera mini|' +
				// Blackberry
				'blackberry|' +
				// Palm OS
				'pre/|palm os|palm|hiptop|avantgo|plucker|xiino|blazer|elaine|' +
				// Windows Mobile
				'iris|3g_t|windows ce|opera mobi|windows ce; smartphone;|windows ce; iemobile|' +
				// Other generic terms
				'mini 9.5|vx1000|lge|m800|e860|u940|ux840|compal|wireless|mobi|ahong|lg380|lgku|lgu900|lg210|lg47|lg920|lg840|lg370|sam-r|mg50|s55|g83|t66|vx400|mk99|d615|d763|el370|sl900|mp500|samu3|samu4|vx10|xda_|samu5|samu6|samu7|samu9|a615|b832|m881|s920|n210|s700|c-810|_h797|mob-x|sk16d|848b|mowser|s580|r800|471x|v120|rim8|c500foma:|160x|x160|480x|x640|t503|w839|i250|sprint|w398samr810|m5252|c7100|mt126|x225|s5330|s820|htil-g1|fly v71|s302|-x113|novarra|k610i|-three|8325rc|8352rc|sanyo|vx54|c888|nx250|n120|mtk|c5588|s710|t880|c5005|i;458x|p404i|s210|c5100|teleca|s940|c500|s590|foma|samsu|vx8|vx9|a1000|_mms|myx|a700|gu1100|bc831|e300|ems100|me701|me702m-three|sd588|s800|8325rc|ac831|mw200|brew|d88|htc/|htc_touch|355x|m50|km100|d736|p-9521|telco|sl74|ktouch|m4u/|me702|8325rc|kddi|phone|lg|sonyericsson|samsung|240x|x320|vx10|nokia|sony cmd|motorola|up.browser|up.link|mmp|symbian|smartphone|midp|wap|vodafone|o2|pocket|kindle|mobile|psp|treo|' +
				// First 4 letters
				'^(1207|3gso|4thp|501i|502i|503i|504i|505i|506i|6310|6590|770s|802s|a wa|acer|acs-|airn|alav|asus|attw|au-m|aur |aus |abac|acoo|aiko|alco|alca|amoi|anex|anny|anyw|aptu|arch|argo|bell|bird|bw-n|bw-u|beck|benq|bilb|blac|c55/|cdm-|chtm|capi|cond|craw|dall|dbte|dc-s|dica|ds-d|ds12|dait|devi|dmob|doco|dopo|el49|erk0|esl8|ez40|ez60|ez70|ezos|ezze|elai|emul|eric|ezwa|fake|fly-|fly_|g-mo|g1 u|g560|gf-5|grun|gene|go.w|good|grad|hcit|hd-m|hd-p|hd-t|hei-|hp i|hpip|hs-c|htc |htc-|htca|htcg|htcp|htcs|htct|htc_|haie|hita|huaw|hutc|i-20|i-go|i-ma|i230|iac|iac-|iac/|ig01|im1k|inno|iris|jata|java|kddi|kgt|kgt/|kpt |kwc-|klon|lexi|lg g|lg-a|lg-b|lg-c|lg-d|lg-f|lg-g|lg-k|lg-l|lg-m|lg-o|lg-p|lg-s|lg-t|lg-u|lg-w|lg/k|lg/l|lg/u|lg50|lg54|lge-|lge/|lynx|leno|m1-w|m3ga|m50/|maui|mc01|mc21|mcca|medi|meri|mio8|mioa|mo01|mo02|mode|modo|mot |mot-|mt50|mtp1|mtv |mate|maxo|merc|mits|mobi|motv|mozz|n100|n101|n102|n202|n203|n300|n302|n500|n502|n505|n700|n701|n710|nec-|nem-|newg|neon|netf|noki|nzph|o2 x|o2-x|opwv|owg1|opti|oran|p800|pand|pg-1|pg-2|pg-3|pg-6|pg-8|pg-c|pg13|phil|pn-2|pt-g|palm|pana|pire|pock|pose|psio|qa-a|qc-2|qc-3|qc-5|qc-7|qc07|qc12|qc21|qc32|qc60|qci-|qwap|qtek|r380|r600|raks|rim9|rove|s55/|sage|sams|sc01|sch-|scp-|sdk/|se47|sec-|sec0|sec1|semc|sgh-|shar|sie-|sk-0|sl45|slid|smb3|smt5|sp01|sph-|spv |spv-|sy01|samm|sany|sava|scoo|send|siem|smar|smit|soft|sony|t-mo|t218|t250|t600|t610|t618|tcl-|tdg-|telm|tim-|ts70|tsm-|tsm3|tsm5|tx-9|tagt|talk|teli|topl|hiba|up.b|upg1|utst|v400|v750|veri|vk-v|vk40|vk50|vk52|vk53|vm40|vx98|virg|vite|voda|vulc|w3c |w3c-|wapj|wapp|wapu|wapm|wig |wapi|wapr|wapv|wapy|wapa|waps|wapt|winc|winw|wonu|x700|xda2|xdag|yas-|your|zte-|zeto|acs-|alav|alca|amoi|aste|audi|avan|benq|bird|blac|blaz|brew|brvw|bumb|ccwa|cell|cldc|cmd-|dang|doco|eml2|eric|fetc|hipt|http|ibro|idea|ikom|inno|ipaq|jbro|jemu|java|jigs|kddi|keji|kyoc|kyok|leno|lg-c|lg-d|lg-g|lge-|libw|m-cr|maui|maxo|midp|mits|mmef|mobi|mot-|moto|mwbp|mywa|nec-|newt|nok6|noki|o2im|opwv|palm|pana|pant|pdxg|phil|play|pluc|port|prox|qtek|qwap|rozo|sage|sama|sams|sany|sch-|sec-|send|seri|sgh-|shar|sie-|siem|smal|smar|sony|sph-|symb|t-mo|teli|tim-|tosh|treo|tsm-|upg1|upsi|vk-v|voda|vx52|vx53|vx60|vx61|vx70|vx80|vx81|vx83|vx85|wap-|wapa|wapi|wapp|wapr|webc|whit|winw|wmlb|xda-)',
				'i'
			);
			var nav = navigator && navigator.userAgent || '';
			/** @type {SRConfirm} */
			var conf = rMobile.test(nav) ? cfg.mobileConfirm : cfg.confirm;

			/**
			 * An object of rollback links and their associated SR checkboxes.
			 *
			 * Each rbspan has `data-sr-index`, which corresponds to a key of the object.
			 * This is used when we need to unbind the link from the class instance.
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
					var _rbspan = this;
					var ajaxRollback = function() {
						_this.ajaxRollback(_rbspan, box).then(function() {
							_rbspan.removeEventListener('click', clickEvent);
						});
					};
					if (e.ctrlKey) {
						// If CTRL key is pressed down, just open the dialog, not executing rollback
						dialog.open();
					} else if (
						// Confirm rollback per config
						!e.shiftKey && (
							conf === 'always' ||
							onRCW && conf === 'RCW' ||
							!onRCW && conf === 'nonRCW'
						)
					) {
						window.requestAnimationFrame(function() { // Ensure that the popup takes place after the browser's repaint
							_rbspan.style.border = '1px dotted black'; // Visualize which rollback link has been clicked
							OO.ui.confirm(msg['msg-confirm']).then(function(confirmed) {
								_rbspan.style.border = '';
								if (confirmed) ajaxRollback();
							});
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
			box.$checkbox.css({ margin: '0 0.3em 0 0.2em' });
			return { $wrapper: $wrapper, $label: box.$label, $checkbox: box.$checkbox };
		};

		/**
		 * Perform AJAX rollback on a rollback link.
		 * @param {HTMLSpanElement} rbspan The wrapper span of the rollback link.
		 * @param {?SRBox} box The SR checkbox object. (**Note: this method removes the box unconditionally.**)
		 * @param {RollbackParams} [params] Parameters to `action=rollback`. If none is passed, obtained from the dialog.
		 * @returns {JQuery.Promise<boolean>} Whether the rollback succeeded.
		 */
		SR.prototype.ajaxRollback = function(rbspan, box, params) {

			if (box) box.$wrapper.remove();
			params = params || dialog.getParams();

			// Collect required parameters to action=rollback from the rollback link internal to the rbspan
			var rblink = rbspan.querySelector('a');
			var href = rblink && rblink.href;
			var /** @type {?string} */ title = null;
			var /** @type {?string} */ user = null;
			if (href) {
				title = mw.util.getParamValue('title', href);
				if (!title) {
					var article = (new RegExp(mw.config.get('wgArticlePath').replace('$1', '([^#?]+)')).exec(href) || [])[1] || null;
					if (article) {
						try {
							title = decodeURIComponent(article);
						} catch (_) { /**/ }
					}
				}
				user = mw.util.getParamValue('from', href);
			}

			var /** @type {?[string, string]} */ error = null;
			if (!rblink) {
				error = [
					'[SR] Error: Anchor tag is missing in the rollback link for some reason.',
					'linkmissing'
				];
			} else if (!href) {
				error = [
					'[SR] Error: The rollback link lacks an href attribute.',
					'hrefmissing'
				];
			} else if (!title) {
				error = [
					'[SR] Error: The rollback link does not have a "title" query parameter.',
					'titlemissing'
				];
			} else if (!user) {
				error = [
					'[SR] Error: The rollback link does not have a "from" query parameter.',
					'usermissing'
				];
			}
			if (error) {
				console.error(error[0], rbspan);
				this.processRollbackLink(rbspan, error[1]);
				return $.Deferred().resolve(false).promise();
			}

			// Perform AJAX rollback
			this.processRollbackLink(rbspan, null);
			var _this = this;
			var safeTitle = /** @type {string} */ (title);
			var safeUser = /** @type {string} */ (user);
			return rollback(safeTitle, safeUser, params).then(function(err) {
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
					.empty()
					.append(
						$('<img>')
							.prop({ src: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif' })
							.css({
								verticalAlign: 'middle',
								height: '1em',
								border: 0
							})
					);
			} else {

				// Replace the innerHTML of the rbspan with a rollback result
				$rbspan
					.empty()
					.append(
						document.createTextNode('['),
						$('<span>')
							.text(result ? msg['rbstatus-failed'] + ' (' + result + ')' : msg['rbstatus-reverted'])
							.css({ backgroundColor: result ? 'lightpink' : 'lightgreen' }),
						document.createTextNode(']')
					)
					.removeClass('mw-rollback-link')
					.addClass('sr-rollback-link-resolved');

				// Unbind the rbspan from the class
				var /** @type {string} */ index = $rbspan.data('sr-index');
				delete this.links[index];

				// If no rbspan is bound to the class any longer, remove the dialog and the portlet link
				// Never does this on RCW, because new rollback links can be generated when new changes are loaded
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
		 * @returns {JQuery.Promise<string|undefined>} Error code or `undefined`.
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
			var /** @type {JQuery.Promise<boolean>[]} */ deferreds = [];
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
				mw.notify(msg['msg-nonechecked'], { type: 'warn' });
			} else {
				dialog.close();
				$.when.apply($, deferreds).then(function() {
					// When all rollback requests are done, show a message that tells how many rollback links were processed
					var reverted = 0;
					var failed = 0;
					for (var i = 0; i < arguments.length; i++) {
						if (arguments[i]) {
							reverted++;
						} else {
							failed++;
						}
					}
					console.log(arguments); // Temporary
					mw.notify(
						$('<div>').append(
							document.createTextNode('Selective Rollback (' + (reverted + failed) + ')'),
							$('<ul>').append(
								$('<li>').text(msg['rbstatus-notify-success'] + ': ' + reverted),
								$('<li>').text(msg['rbstatus-notify-failure'] + ': ' + failed)
							)
						),
						{ type: 'success' }
					);
				});
			}

		};

		return SR;

	}

})();
//</nowiki>