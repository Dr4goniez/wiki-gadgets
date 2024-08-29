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
/// <reference path="./window/Selective Rollback.d.ts" />
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
		'summary-tooltip-preview': '(Las palabras mágicas serán reemplazadas.)', // v4.0.0
		'markbot-label': 'Marcar las reversiones cómo ediciones de un bot',
		'watchlist-label': 'Vigilar las páginas en tu lista de seguimiento',
		'watchlist-expiry-label': 'Tiempo',
		'watchlist-expiry-indefinite': 'Permanente',
		'watchlist-expiry-1week': '1 semana',
		'watchlist-expiry-1month': '1 mes',
		'watchlist-expiry-3months': '3 meses',
		'watchlist-expiry-6months': '6 meses',
		'watchlist-expiry-1year': '1 año',
		'watchlist-expiry-3years': '3 años', // Not used
		'button-rollbackchecked': 'Revertir elegidos',
		'button-checkall': 'Elegir todos',
		'button-close': 'Cerrar',
		'msg-nonechecked': 'Ningún casilla fue elegida.',
		'msg-linksresolved': 'Todos los enlaces de reversión en esta página se han resuelto.',
		'msg-confirm': '¿Estás seguro que quieres revertir este edición?',
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
						if (typeof val === 'string' && ['ja', 'en', 'zh', 'es', 'ro', 'vi'].indexOf(val) !== -1) {
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

class SelectiveRollbackConfig extends SelectiveRollbackBase {

	static init() {
		const modules = [
			'mediawiki.user',
			'mediawiki.api',
			'oojs-ui'
		];
		$.when(mw.loader.using(modules), $.ready).then(() => {
			new SelectiveRollbackConfig();
		});
	}

	/**
	 * @requires document
	 * @requires mediawiki.user
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

		// Construct the config interface
		$content.empty().append();

	}

	/**
	 * Create a style tag for Selective Rollback config in the document head.
	 * @returns {void}
	 * @requires document
	 */
	static createStyleTag() {
		const id = 'src-styles';
		if (document.getElementById(id)) {
			return;
		}
		const style = document.createElement('style');
		style.id = id;
		style.textContent =
			'';
		document.head.appendChild(style);
	}

}

class SelectiveRollback extends SelectiveRollbackBase {

	static init() {

	}

	constructor() {
		super();
	}

}

// Entry point
const onConfig = mw.config.get('wgNamespaceNumber') === -1 && /^(SelectiveRollbackConfig|SRC)$/i.test(mw.config.get('wgTitle'));
if (onConfig) {
	SelectiveRollbackConfig.init();
} else {
	SelectiveRollback.init();
}

})();
//</nowiki>