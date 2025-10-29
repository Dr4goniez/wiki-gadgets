/*******************************************************************************\

	Selective Rollback

	@author [[User:Dragoniez]]
	@version 5.0.0
	@see https://meta.wikimedia.org/wiki/User:Dragoniez/Selective_Rollback

	Some functionalities of this script are adapted from:
	@link https://meta.wikimedia.org/wiki/User:Hoo_man/smart_rollback.js
	@link https://en.wikipedia.org/wiki/User:DannyS712/AjaxRollback.js

\*******************************************************************************/

// @ts-check
/// <reference path="./window/Selective Rollback5.d.ts" />
/* global mw, OO */
//<nowiki>
(() => {

/**
 * A regular expression for unicode bidirectional characters.
 */
const rUnicodeBidi = /[\u200E\u200F\u202A-\u202E]+/g;

/**
 * Localized interface messages.
 * @type {Record<Languages, Messages>}
 */
const i18n = {
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
		'rbstatus-notify-failure': '失敗', // v4.0.0
		// v5.0.0
		'config-load-failed': 'Selective Rollbackのコンフィグインターフェースの読み込みに失敗しました。',
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
		'rbstatus-notify-failure': 'Failure', // v4.0.0
		// v5.0.0
		'config-load-failed': 'Failed to load the Selective Rollback config interface.',
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
		'rbstatus-notify-failure': '失败', // v4.0.0
		// v5.0.0
		'config-load-failed': 'Failed to load the Selective Rollback config interface.',
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
		'rbstatus-notify-failure': 'Falla', // v4.0.0
		// v5.0.0
		'config-load-failed': 'Failed to load the Selective Rollback config interface.',
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
		'rbstatus-notify-failure': 'Eșec', // v4.0.0
		// v5.0.0
		'config-load-failed': 'Failed to load the Selective Rollback config interface.',
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
		'rbstatus-notify-failure': 'Không thành công', // v4.0.0
		// v5.0.0
		'config-load-failed': 'Failed to load the Selective Rollback config interface.',
	}
};

/**
 * Base class that initializes SR config and interface messages.
 * @abstract
 */
class SelectiveRollbackBase {

	constructor() {

		/**
		 * @type {SelectiveRollbackOptions}
		 * @protected
		 * @readonly
		 */
		this.cfg = SelectiveRollbackBase.getConfig();

		let langSwitch = (this.cfg.lang || mw.config.get('wgUserLanguage')).replace(/-.*$/, ''); // Fall back to the user's language in preferences
		if (Object.keys(i18n).indexOf(langSwitch) === -1) {
			// If SR doesn't support the specified language, set the interface language to "en"
			if (this.cfg.lang) {
				console.error(`Selective Rollback does not have "${this.cfg.lang}" language support for its interface messages.`);
			}
			langSwitch = 'en';
		}
		/**
		 * @type {Messages}
		 * @protected
		 * @readonly
		 */
		this.msg = i18n[langSwitch];

		/**
		 * @type {mw.Api}
		 * @protected
		 * @readonly
		 */
		this.api = new mw.Api({
			ajax: {
				headers: {
					'Api-User-Agent': 'Selective_Rollback/5.0.0 (https://meta.wikimedia.org/wiki/User:Dragoniez/Selective_Rollback.js)'
				}
			}
		});

	}

	/**
	 * Get the user config.
	 * @requires mediawiki.user
	 * @returns {SelectiveRollbackOptions}
	 * @private
	 */
	static getConfig() {
		/** @type {string?} */
		const userCfgStr = mw.user.options.get(this.optionKey);
		if (typeof userCfgStr === 'string') {
			return JSON.parse(userCfgStr);
		} else {
			// Return the default config only if user config has never been saved
			return Object.assign(
				// Shallow copy is fine here because defaultOptions is a getter that returns a new object
				this.defaultOptions,
				this.getDeprecatedConfig()
			);
		}
	}

	/**
	 * Get the language option value. This is a shorthand method that should only be used when
	 * the parent class cannot access its instance (e.g. before initialization).
	 * @returns {string}
	 * @protected
	 */
	static getLang() {
		/** @type {string?} */
		const userCfgStr = mw.user.options.get(this.optionKey);
		const src = window.selectiveRollbackConfig;
		if (typeof userCfgStr === 'string') {
			return JSON.parse(userCfgStr).lang || 'en';
		} else if (typeof src === 'object' && src !== null && typeof src.lang === 'string' && Object.keys(i18n).indexOf(src.lang) !== -1) {
			return src.lang;
		} else {
			return 'en';
		}
	}

	/**
	 * The key for `mw.user.options`.
	 * @returns {string}
	 * @protected
	 */
	static get optionKey() {
		return 'userjs-selectiverollback';
	}

	/**
	 * The default Selective Rollback options.
	 * @returns {SelectiveRollbackOptions}
	 * @private
	 */
	static get defaultOptions() {
		return {
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
	}

	/**
	 * Get the deprecated user config if there is any.
	 * @returns {Partial<SelectiveRollbackOptions>}
	 * @private
	 */
	static getDeprecatedConfig() {
		const userCfg = window.selectiveRollbackConfig;
		if (typeof userCfg !== 'object' || userCfg === null) {
			return {};
		} else {
			console.warn(
				'"window.selectiveRollbackConfig" has been deprecated. ' +
				'Please manage your config at Special:SRC and remove the raw JavaScript config from your user JS.'
			);
			return Object.keys(userCfg).reduce(/** @param {Partial<SelectiveRollbackOptions>} acc */ (acc, key) => {

				// Filter out configs of an invalid type
				/** @type {string|boolean|Record<string, string>} */
				const val = userCfg[key];
				if (!(
					['string', 'boolean'].indexOf(typeof val) !== -1 ||
					typeof val === 'object' && val !== null && Object.keys(val).every((k) => typeof val[k] === 'string')
				)) {
					return acc;
				}

				switch (key) {
					case 'lang':
						if (typeof val === 'string' && Object.keys(i18n).indexOf(val) !== -1) {
							acc[key] = val;
						}
						break;
					case 'editSummaries':
					case 'specialExpressions':
						if (typeof val === 'object') {
							acc[key] = val;
						}
						break;
					case 'showKeys':
					case 'markBot':
					case 'watchPage':
						if (typeof val === 'boolean') {
							acc[key] = val;
						}
						break;
					case 'watchExpiry':
						if (typeof val === 'string') {
							const v = val.replace(rUnicodeBidi, '').trim();
							let m;
							if (/^in|^never/.test(key)) {
								acc[key] = 'indefinite';
							} else if ((m = /^1\s*(week|month|year)/.exec(v))) {
								acc[key] = /** @type {SRWatchExpiry} */ ('1 ' + m[1]);
							} else if ((m = /^([36])\s*month/.exec(v))) {
								acc[key] = /** @type {SRWatchExpiry} */ (m[1] + ' months');
							}
						}
						break;
					case 'confirm':
					case 'mobileConfirm':
						if (typeof val === 'string' && ['never', 'always', 'RCW', 'nonRCW'].indexOf(val) !== -1) {
							acc[key] = /** @type {SRConfirm} */ (val);
						}
						break;
					case 'checkboxLabelColor':
						if (typeof val === 'string') {
							acc[key] = val;
						}
				}
				return acc;

			}, {});
		}
	}

	/**
	 * Get an icon.
	 * @param {"loading"} type
	 * @param {(style: CSSStyleDeclaration) => void} [stylePredicate]
	 * @returns {HTMLImageElement}
	 * @requires document
	 * @protected
	 */
	static getIcon(type, stylePredicate) {
		const icon = document.createElement('img');
		icon.style.verticalAlign = 'middle';
		icon.style.height = '1em';
		icon.style.border = '0';
		if (stylePredicate) {
			stylePredicate(icon.style);
		}
		switch (type) {
			case 'loading':
				icon.src = 'https://upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif';
		}
		return icon;
	}

	/**
	 * Get an interface message.
	 * @template {keyof Messages} K
	 * @template {Messages} O
	 * @param {K} key
	 * @returns {O[K]}
	 * @protected
	 */
	getMessage(key) {
		return this.msg[key];
	}

}

/**
 * Class that creates a table where each row contains a checkbox, a key input, and a value input.
 * Above the table are utility buttons that can be used to change the checked state of the checkbox
 * in each row at once, and below it are buttons to add/remove rows.
 * @requires
 * The following messages to be ready:
 * * `checkbox-select`
 * * `checkbox-all`
 * * `checkbox-none`
 * * `checkbox-invert`
 * * `comma-separator`
 */
class MultiInputTable {

	/**
	 * Initialize a MultiInputTable instance.
	 * @param {number} maxWidth The outerWidth of `#src-option-language-dropdown`.
	 * @param {string|JQuery<HTMLElement>} [help] Optional help text displayed above the add/remove buttons.
	 */
	constructor(maxWidth, help) {

		MultiInputTable.createStyleTag();

		/**
		 * @type {MultiInputTableRow[]}
		 * @private
		 * @readonly
		 */
		this.rows = [];

		/**
		 * @type {JQuery<HTMLDivElement>}
		 */
		const $content = $('<div>');

		/**
		 * The wrapper widget that constitutes the body of the MultiInputTable.
		 * @type {OO.ui.Widget}
		 * @readonly
		 */
		this.widget = new OO.ui.Widget({$content});

		/**
		 * @type {JQuery<HTMLTableElement>}
		 * @private
		 * @readonly
		 */
		this.$table = $('<table>');

		// Utility buttons to (un)select table rows at once
		const btnLabel = /** @type {string} */ (mw.messages.get('checkbox-select')).replace('$1', '');
		const btnAll = MultiInputTable.generateSelectButton('checkbox-all', () => {
			this.rows.forEach(({checkbox}) => checkbox.setSelected(true));
		});
		const btnNone = MultiInputTable.generateSelectButton('checkbox-none', () => {
			this.rows.forEach(({checkbox}) => checkbox.setSelected(false));
		});
		const btnInvert = MultiInputTable.generateSelectButton('checkbox-invert', () => {
			this.rows.forEach(({checkbox}) => checkbox.setSelected(!checkbox.isSelected()));
		});
		const sep = /** @type {string} */ (mw.messages.get('comma-separator'));

		// Help text wrapper
		const $help = $('<span>');
		if (help instanceof jQuery) {
			$help.append(help);
		} else if (typeof help === 'string') {
			$help.prop('innerHTML', help);
			console.log($help.prop('innerHTML'));
		}
		/**
		 * @type {OO.ui.LabelWidget}
		 * @private
		 * @readonly
		 */
		this.help = new OO.ui.LabelWidget({
			classes: ['oo-ui-inline-help'],
			$element: $('<div>'),
			label: $help
		});

		// Buttons to add/remove a table row
		const addButton = new OO.ui.ButtonWidget({
			label: 'Add',
			flags: ['progressive']
		}).off('click').on('click', () => {
			this.addRow();
		});
		const removeButton = new OO.ui.ButtonWidget({
			label: 'Remove',
			flags: ['destructive']
		}).off('click').on('click', () => {
			for (let i = this.rows.length - 1; i >= 0; i--) {
				const {checkbox} = this.rows[i];
				if (checkbox.isSelected()) {
					this.removeRow(i);
				}
			}
		});

		// Construct the content (in the widget)
		$content
			.addClass('src-multiinputtable-container')
			.append(
				$('<div>')
					.addClass('src-multiinputtable-utilbutton-container')
					.append(
						btnLabel,
						btnAll,
						sep,
						btnNone,
						sep,
						btnInvert
					),
				$('<div>')
					.addClass('src-multiinputtable-table-container')
					.css('max-width', maxWidth)
					.append(
						this.$table
							.addClass('src-multiinputtable-table')
					),
				this.help.$element
					.addClass('src-multiinputtable-help')
					.css('max-width', maxWidth)
					.toggle(!!this.rows.length),
				$('<div>')
					.addClass('src-multiinputtable-button-container')
					.append(
						addButton.$element,
						removeButton.$element
					)
			);

	}

	/**
	 * Create a style tag for MultiInputTable in the document head.
	 * @returns {void}
	 * @requires document
	 * @private
	 */
	static createStyleTag() {
		const id = 'src-styles-multiinputtable';
		if (document.getElementById(id)) {
			return;
		}
		const style = document.createElement('style');
		style.id = id;
		style.textContent =
			'.src-multiinputtable-container > div {' +
				'margin-bottom: 0.2em;' +
			'}' +
			'.src-multiinputtable-table > tr > td:first-child {' +
				'padding-right: 0.5em;' +
			'}' +
			'.src-multiinputtable-table > tr > td:not(:first-child) {' +
				'width: 100%;' +
			'}' +
			'.src-multiinputtable-table > tr > td:not(:first-child) > div {' +
				'margin-bottom: 0.2em;' +
			'}';
		document.head.appendChild(style);
	}

	/**
	 * Create an anchor button.
	 * @param {string} msgKey
	 * @param {() => void} callback Click event callback
	 * @returns {JQuery<HTMLAnchorElement>}
	 */
	static generateSelectButton(msgKey, callback) {
		/** @type {JQuery<HTMLAnchorElement>} */
		const $a = $('<a>');
		return $a
			.prop('role', 'button')
			.text(/** @type {string} */ (mw.messages.get(msgKey)))
			.off('click').on('click', callback);
	}

	/**
	 * Clean up a string.
	 * @param {string} str
	 * @returns {string}
	 * @private
	 */
	static clean(str) {
		return str.replace(rUnicodeBidi, '').trim().replace(/\n/g, ' ');
	}

	/**
	 * Add a new table row.
	 * @param {string} [key]
	 * @param {string} [value]
	 * @returns {MultiInputTable}
	 * @public
	 */
	addRow(key, value) {

		// Auto-assign a key if none is provided
		if (typeof key !== 'string') {
			let len = this.rows.length; // Defaults to the number of the existing rows + 1
			this.rows.forEach(({keyInput}, i) => { // Loop existing rows
				const k = keyInput.getValue();
				const kClean = MultiInputTable.clean(k);
				if (!kClean) {
					// Fill in the key input with row index if practically blank
					keyInput.setValue(i.toString());
				} else if (k !== kClean) {
					// Tidy up the existing key
					keyInput.setValue(kClean);
				}
				if (len.toString() === kClean) {
					// If the auto-generated numeral key is in use, increment it to make it different
					len += 0.1;
				}
			});
			key = len.toString();
		}

		// Generate a new row
		/** @type {JQuery<HTMLTableRowElement>} */
		const $row = $('<tr>');
		const checkbox = new OO.ui.CheckboxInputWidget();
		const keyInput = new OO.ui.TextInputWidget({
			label: 'Key',
			value: key
		});
		const valueInput = new OO.ui.TextInputWidget({
			label: 'Value',
			value
		});
		this.$table.append(
			$row.append(
				$('<td>').append(checkbox.$element),
				$('<td>').append(keyInput.$element, valueInput.$element)
			)
		);
		this.rows.push({$row, checkbox, keyInput, valueInput});
		this.help.$element.show();

		return this;

	}

	/**
	 * Remove a table row at an index.
	 * @param {number} index
	 * @returns {MultiInputTable}
	 * @private
	 */
	removeRow(index) {
		this.rows[index].$row.remove();
		this.rows.splice(index, 1);
		this.help.$element.toggle(!!this.rows.length);
		return this;
	}

	/**
	 * Get rows as an object.
	 * @returns {Record<string, string>?} `null` if there is an input box with an invalid value.
	 * @public
	 */
	getRows() {

		/** @type {OO.ui.TextInputWidget[]} */
		const unprocessable = [];
		/** @type {number[]} */
		const deleteIdx = [];
		const ret = this.rows.reduce(/** @param {Record<string, string>} acc */ (acc, {keyInput, valueInput}, i) => {
			const key = MultiInputTable.clean(keyInput.getValue());
			const value = MultiInputTable.clean(valueInput.getValue());
			keyInput.setValue(key);
			valueInput.setValue(value);
			if (!key && !value) {
				deleteIdx.push(i);
			} else if (!key) {
				keyInput.setValidityFlag(false);
				unprocessable.push(keyInput);
			} else if (!value) {
				deleteIdx.push(i);
			} else if (key in acc) {
				// Duplicate key
				keyInput.setValidityFlag(false);
				unprocessable.push(keyInput);
			} else {
				acc[key] = value;
			}
			return acc;
		}, Object.create(null));

		if (unprocessable.length) {
			unprocessable[0].focus();
			return null;
		} else if (deleteIdx.length) {
			deleteIdx.reverse().forEach(this.removeRow);
		}
		return ret;

	}

}

/**
 * Class that constructs the Selective Rollback config interface.
 */
class SelectiveRollbackConfig extends SelectiveRollbackBase {

	/**
	 * Load dependent modules and construct the Selective Rollback config interface.
	 * @returns {void}
	 * @public
	 */
	static init() {
		const modules = mw.loader.using([ // Start loading modules
			'mediawiki.user',
			'oojs-ui'
		]);
		mw.loader.using('mediawiki.api').then(() => {

			// As soon as mediawiki.api gets ready, fetch required messages
			const msg = new mw.Api().loadMessagesIfMissing(
				['checkbox-select', 'checkbox-all', 'checkbox-none', 'checkbox-invert', 'comma-separator'],
				{amlang: this.getLang()}
			);

			// When other modules, the messages, and the DOM are ready
			$.when(modules, msg, $.ready).then(() => {
				// Construct the Selective Rollback config interface
				new SelectiveRollbackConfig();
			});

		});
	}

	/**
	 * @requires document
	 * @requires mediawiki.user
	 * @requires mediawiki.api
	 * @requires oojs-ui
	 * @private
	 */
	constructor() {

		super();
		SelectiveRollbackConfig.createStyleTag();

		// Collect native DOM elements
		const pageName = 'Selective Rollback config';
		document.title = pageName + ' - ' + mw.config.get('wgSiteName');
		const $heading = $('.mw-first-heading');
		const $content = $('.mw-body-content');
		if (!$heading.length || !$content.length) {
			const err = this.getMessage('config-load-failed');
			mw.notify(err, {type: 'error', autoHide: false});
			throw new Error(err);
		}
		$heading.text(pageName);

		// Language option
		/**
		 * @type {OO.ui.DropdownWidget}
		 * @readonly
		 * @private
		 */
		this.lang = new OO.ui.DropdownWidget({
			id: 'src-option-language-dropdown',
			menu: {
				items: (() => {
					const items = Object.keys(i18n).map((key) => new OO.ui.MenuOptionWidget({data: key, label: key}));
					// Insert the default option at index 0
					items.unshift(new OO.ui.MenuOptionWidget({data: '', label: '(as in user preferences)'}));
					return items;
				})(),
			},
		});
		this.lang.getMenu().selectItemByData(this.cfg.lang); // Select the language specified in the config

		const langField = new OO.ui.FieldsetLayout({
			id: 'src-option-language',
			label: 'Language'
		}).addItems([
			new OO.ui.FieldLayout(this.lang)
		]);

		// Temporarily append the language field as the immediate child of $content
		// This makes it possible to retrieve the width of the dropdown widget
		$content.empty().append(langField.$element);
		const maxWidth = /** @type {number} */ (this.lang.$element.outerWidth());

		// Custom summary options
		/**
		 * @type {MultiInputTable}
		 * @readonly
		 * @private
		 */
		this.summaries = new MultiInputTable(maxWidth,
			'The keys are the iconic names of the values shown in the dropdown if the "Show keys" option is enabled.'
		);
		Object.keys(this.cfg.editSummaries).forEach((key) => {
			this.summaries.addRow(key, this.cfg.editSummaries[key]);
		});

		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 * @private
		 */
		this.showKeys = new OO.ui.CheckboxInputWidget({
			selected: this.cfg.showKeys
		});

		const summaryField = new OO.ui.FieldsetLayout({
			id: 'src-option-summaries',
			label: 'Custom summaries',
			help: new OO.ui.HtmlSnippet(
				'Variables:<br>' +
				'<code>$0</code>: The default rollback summary on the wiki<br>' +
				'<code>$1</code>: Name of the user who made the last edit before the user whose edits are to be rolled back<br>' +
				'<code>$2</code>: Name of the user whose edits are to be rolled back<br>' +
				"<code>$3</code>: The revision number of $1's edit<br>" +
				"<code>$4</code>: The timestamp of $1's edit<br>" +
				"<code>$5</code>: The revision number of $2's edit<br>" +
				"<code>$6</code>: The timestamp of $2's edit<br>" +
				'<code>$7</code>: The number of revisions to revert'
			)
		}).addItems([
			this.summaries.widget,
			new OO.ui.FieldLayout(this.showKeys, {
				label: 'Show the summary keys instead of their values in the dropdown',
				align: 'inline'
			})
		]);

		// Special expression options
		/**
		 * @type {MultiInputTable}
		 * @readonly
		 * @private
		 */
		this.specialExpressions = new MultiInputTable(maxWidth);
		Object.keys(this.cfg.specialExpressions).forEach((key) => {
			this.specialExpressions.addRow(key, this.cfg.specialExpressions[key]);
		});

		const seField = new OO.ui.FieldsetLayout({
			id: 'src-option-specialexpressions',
			label: 'Special expressions'
		}).addItems([
			this.specialExpressions.widget
		]);

		// Mark bot option
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 * @private
		 */
		this.markBot = new OO.ui.CheckboxInputWidget({
			selected: this.cfg.markBot
		});

		const markBotField = new OO.ui.FieldsetLayout({
			id: 'src-option-markbot',
			label: 'Mark bot'
		}).addItems([
			new OO.ui.FieldLayout(this.markBot, {
				label: 'Mark rollbacks as bot edits',
				align: 'inline'
			})
		]);

		// Watchlist option
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 * @readonly
		 * @private
		 */
		this.watchPage = new OO.ui.CheckboxInputWidget({
			selected: this.cfg.watchPage
		});
		/**
		 * @type {OO.ui.DropdownWidget}
		 * @readonly
		 * @private
		 */
		this.watchExpiry = new OO.ui.DropdownWidget({
			menu: {
				items: [
					new OO.ui.MenuOptionWidget({data: 'indefinite', label: this.getMessage('watchlist-expiry-indefinite')}),
					new OO.ui.MenuOptionWidget({data: '1 week', label: this.getMessage('watchlist-expiry-1week')}),
					new OO.ui.MenuOptionWidget({data: '1 month', label: this.getMessage('watchlist-expiry-1month')}),
					new OO.ui.MenuOptionWidget({data: '3 months', label: this.getMessage('watchlist-expiry-3months')}),
					new OO.ui.MenuOptionWidget({data: '6 months', label: this.getMessage('watchlist-expiry-6months')}),
					new OO.ui.MenuOptionWidget({data: '1 year', label: this.getMessage('watchlist-expiry-1year')}),
					// new OO.ui.MenuOptionWidget({data: '3 years', label: this.getMessage('watchlist-expiry-3years')}), // phab:T336142
				]
			}
		});
		this.watchExpiry.getMenu().selectItemByData(this.cfg.watchExpiry);

		const watchlistField = new OO.ui.FieldsetLayout({
			id: 'src-option-watchlist',
			label: 'Watchlist'
		}).addItems([
			new OO.ui.FieldLayout(this.watchPage, {
				label: 'Add the reverting pages to watchlist',
				align: 'inline'
			}),
			new OO.ui.FieldLayout(this.watchExpiry, {
				label: 'Expiration',
				align: 'top'
			}),
		]);

		// Construct the config interface
		$content.append(
			$('<div>')
				.prop('id', 'src-container')
				.append(
					$('<div>')
						.prop('id', 'src-optionfield')
						.append(
							langField.$element, // Moved from the temporary position
							summaryField.$element,
							seField.$element,
							markBotField.$element,
							watchlistField.$element,
						)
				)
		);

	}

	/**
	 * Create a style tag for Selective Rollback config in the document head.
	 * @returns {void}
	 * @requires document
	 * @private
	 */
	static createStyleTag() {
		const id = 'src-styles-main';
		if (document.getElementById(id)) {
			return;
		}
		const style = document.createElement('style');
		style.id = id;
		style.textContent =
			'#src-optionfield {' +
				'padding: 1em;' +
				'margin: 0;' +
				'border: 1px solid var(--border-color-subtle, #c8ccd1);' +
			'}';
		document.head.appendChild(style);
	}

	// getOptions() {

	// }

	/**
	 * Get the selected language code.
	 * @returns {string}
	 * @private
	 */
	getLang() {
		const item = /** @type {OO.ui.OptionWidget} */ (this.lang.getMenu().findSelectedItem());
		return /** @type {string} */ (item.getData());
	}

	// /**
	//  * @returns {Record<string, string>?}
	//  * @private
	//  */
	// getSummaries() {

	// }

	/**
	 * Get the checked state of the "Show keys" config checkbox.
	 * @returns {boolean}
	 * @private
	 */
	getShowKeys() {
		return this.showKeys.isSelected();
	}

}

// class SelectiveRollback extends SelectiveRollbackBase {

// 	static init() {

// 	}

// 	constructor() {
// 		super();
// 	}

// }

// Entry point
const onConfig = mw.config.get('wgNamespaceNumber') === -1 && /^(SelectiveRollbackConfig|SRC)$/i.test(mw.config.get('wgTitle'));
if (onConfig) {
	SelectiveRollbackConfig.init();
} else {
	// SelectiveRollback.init();
}

})();
//</nowiki>