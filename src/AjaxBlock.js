/**********************************************************************\

	AjaxBlock
	Block/unblock users via a dialog without having to visit the
	special page.

	@author [[User:Dragoniez]]
	@version 1.1.11
	@see https://meta.wikimedia.org/wiki/User:Dragoniez/AjaxBlock

\**********************************************************************/

// @ts-check
/* global mw */
//<nowiki>
(function() {

// *********************************************************************************************************************

// Don't run the script on action=edit
if (mw.config.get('wgAction') === 'edit') {
	return;
}

/**
 * AjaxBlock Config object.
 * @type {AjaxBlockConfig}
 * @readonly
 */
var abCfg = {

	script: 'AjaxBlock',

	isOnConfig: mw.config.get('wgNamespaceNumber') === -1 && /^(AjaxBlockConfig|ABC)$/i.test(mw.config.get('wgTitle')),

	prefkey: {
		local: 'userjs-ajaxblock',
		global: 'userjs-ajaxblock-global'
	},

	languages: ['en', 'ja'],

	i18n: {
		en: {
			'options-username-label': 'Username',
			'options-reason1-label': 'Reason 1',
			'options-reason2-label': 'Reason 2',
			'options-otherreason': 'Other',
			'options-userdefined': 'User-defined',
			'options-reasonC-placeholder': 'Other reasons',
			'options-reason-label': 'Reason',
			'options-suffix-label': 'Suffix',
			'options-suffix-none': 'None',
			'options-expiry-label': 'Expiration',
			'options-expiry-other': 'Other',
			'options-expiry-indefinite': 'Indefinite',
			'options-expiry-1hour': '1 hour',
			'options-expiry-2hours': '2 hours',
			'options-expiry-1day': '1 day',
			'options-expiry-31hours': '31 hours',
			'options-expiry-2days': '2 days',
			'options-expiry-3days': '3 days',
			'options-expiry-1week': '1 week',
			'options-expiry-2weeks': '2 weeks',
			'options-expiry-1month': '1 month',
			'options-expiry-3months': '3 months',
			'options-expiry-6months': '6 months',
			'options-expiry-1year': '1 year',
			'options-expiry-2years': '2 years',
			'options-expiry-3years': '3 years',
			'options-customexpiry-placeholder': 'Other time',
			'options-checkbox-nocreate': 'Prevent account creation',
			'options-checkbox-noemail': 'Prevent the user from sending e-mails',
			'options-checkbox-notalk': 'Disallow the user to edit their own talk page',
			'options-checkbox-hardblock': 'Hard block',
			'options-checkbox-autoblock': 'Auto block',
			'options-checkbox-partial': 'Partial block',
			'options-partial-pages-label': 'Pages',
			'options-partial-pages-placeholder': 'Separate each entry with a pipe ("|", 10 at maximum)',
			'options-partial-namespaces-label': 'Namespaces',
			'options-partial-namespaces-placeholder': 'Separate each entry with a pipe ("|")',
			'options-partial-namespaces-tooltip': 'Add 1 for talk namespaces',
			'options-partial-namespaces-tooltip-main': 'Main',
			'options-checkbox-hideuser': 'Oversight the username',
			'options-checkbox-watchuser': 'Watch this user',
			'options-makeglobal': 'Make this option global',
			'dialog-heading-block': 'Block user',
			'dialog-heading-unblock': 'Unblock user',
			'dialog-overwritewarning': 'Caution: You will overwrite the existing block.',
			'dialog-hasqueryparams': 'This anchor has predefined (un)block settings. (<span class="ab-replaceme"></span>)',
			'dialog-hasqueryparams-get': 'Apply',
			'dialog-button-block': 'Block',
			'dialog-button-unblock': 'Unblock',
			'dialog-button-preset': 'Preset',
			'dialog-button-currentblock': 'Current block',
			'dialog-button-reset': 'Reset',
			'dialog-button-close': 'Close',
			'portlet-label': 'AjaxBlock config',
			'config-header': 'Configure AjaxBlock',
			'config-header-nopermission': 'Permission error',
			'config-body-nopermission': '<p>You do not have permission to block or unblock users from editing.</p>',
			'config-loading': 'Loading the interface',
			'config-loading-failed': 'Failed to load the interface.',
			'config-field-general': 'General options',
			'config-field-language': 'Language',
			'config-field-userdefined-local': 'User-defined dropdown options (local)',
			'config-field-userdefined-global': 'User-defined dropdown options (global)',
			'config-field-userdefined-add': 'Add',
			'config-field-userdefined-remove': 'Remove',
			'config-field-preset': 'Preset options',
			'config-field-preset-user': 'Block (registered users)',
			'config-field-preset-ip': 'Block (IP users)',
			'config-field-preset-unblock': 'Unblock',
			'config-field-warning': 'Warning options',
			'config-field-warning-dialog': 'Dialog actions',
			'config-field-warning-oneclick': 'One-click actions',
			'config-field-warning-noreason': 'When no reason is provided',
			'config-field-warning-noexpiry': 'When no expiration time is specified (defaulted to "indefinite")',
			'config-field-warning-nopartialspecs': 'When partial block is enabled but neither pages nor namespaces are specified',
			'config-field-warning-hardblock': 'When applying hardblock',
			'config-field-warning-hideuser': 'When oversighting a username',
			'config-field-warning-overwrite': 'When overwriting the existing block',
			'config-field-warning-ignorepredefined': 'When specifying options different from predefined ones',
			'config-field-warning-blockself': 'When (un)blocking yourself',
			'config-field-warning-unblock': 'When unblocking the target',
			'config-button-save': 'Save',
			'config-saving': 'Saving options',
			'config-savedone': 'Saved options',
			'config-savefailed': 'Failed to save options',
			'error-fetch-dropdown': 'AjaxBlock: Failed to get the block reason dropdown.',
			'error-fetch-userrights': 'Failed to get user rights on this project. AjaxBlock will not run.',
			'error-fetch-aliases': 'Failed to get aliases for Special:Block and/or Special:Unblock. AjaxBlock will not run.',
			'error-partial-morethan10': 'More than 10 pages are specified in "$1". ($2 pages)',
			'error-multiplecalls': 'Caution: A second AjaxBlock dialog has been created. It seems that the script is loaded from multiple files.',
			'warning-partial-removed': 'Duplicate/Invalid values have been removed from "$1".',
			'warning-hideuser-unchecked': 'The "hideuser" option has been unchecked because it is incompatible with a non-indefinite expiry and/or partial block.',
			'warning-confirm-opening-block': 'You are about to <u>block</u> <b>$1</b>. Double-check the potential problems listed below.',
			'warning-confirm-opening-unblock': 'You are about to <u>unblock</u> <b>$1</b>. Double-check the potential problems listed below.',
			'warning-confirm-closing': 'Check all the boxes to proceed.',
			'warning-confirm-noreason': 'Proceed with an empty reason',
			'warning-confirm-noexpiry': 'Proceed with an empty expiration time (defaulted to "indefinite")',
			'warning-confirm-nopartialspecs': 'Proceed with pages and namespaces unspecified for partial block',
			'warning-confirm-hardblock': 'Hardblock this IP',
			'warning-confirm-hideuser': 'Oversight the username',
			'warning-confirm-overwrite': 'Overwrite the existing block',
			'warning-confirm-ignorepredefined': 'Ignore predifined options',
			'warning-confirm-blockself': '(Un)block yourself',
			'warning-confirm-unblock': 'Unblock the target',
			'warning-confirm-dialog-open': 'Open the AjaxBlock dialog when cancelled',
			'warning-confirm-dialog-proceed': 'Proceed',
			'warning-confirm-dialog-cancel': 'Cancel',
			'warning-confirm-dialog-cancelled': 'Cancelled.',
			'warning-confirm-dialog-forcecancelled': 'The (un)block action has been forcibly cancelled because some warning was not confirmed.',
			'progress-block-done': 'blocked',
			'progress-block-failed': 'block failed',
			'progress-unblock-done': 'unblocked',
			'progress-unblock-failed': 'unblock failed'
		},
		ja: {
			'options-username-label': '利用者名',
			'options-reason1-label': '理由1',
			'options-reason2-label': '理由2',
			'options-otherreason': 'その他',
			'options-userdefined': '個人用',
			'options-reasonC-placeholder': 'その他の理由',
			'options-reason-label': '理由',
			'options-suffix-label': '接尾辞',
			'options-suffix-none': 'なし',
			'options-expiry-label': '期間',
			'options-expiry-other': 'その他',
			'options-expiry-indefinite': '無期限',
			'options-expiry-1hour': '1時間',
			'options-expiry-2hours': '2時間',
			'options-expiry-1day': '1日',
			'options-expiry-31hours': '31時間',
			'options-expiry-2days': '2日',
			'options-expiry-3days': '3日',
			'options-expiry-1week': '1週間',
			'options-expiry-2weeks': '2週間',
			'options-expiry-1month': '1か月',
			'options-expiry-3months': '3か月',
			'options-expiry-6months': '6か月',
			'options-expiry-1year': '1年',
			'options-expiry-2years': '2年',
			'options-expiry-3years': '3年',
			'options-customexpiry-placeholder': 'その他の期間',
			'options-checkbox-nocreate': 'アカウント作成禁止',
			'options-checkbox-noemail': 'メール送信禁止',
			'options-checkbox-notalk': '会話ページ編集禁止',
			'options-checkbox-hardblock': 'ハードブロック',
			'options-checkbox-autoblock': '自動ブロック',
			'options-checkbox-partial': '部分ブロック',
			'options-partial-pages-label': 'ページ',
			'options-partial-pages-placeholder': 'パイプで分割（"|"、最大10ページ）',
			'options-partial-namespaces-label': '名前空間',
			'options-partial-namespaces-placeholder': 'パイプで分割（"|"）',
			'options-partial-namespaces-tooltip': 'トーク名前空間: +1',
			'options-partial-namespaces-tooltip-main': '標準',
			'options-checkbox-hideuser': '利用者名を秘匿化',
			'options-checkbox-watchuser': 'この利用者をウォッチ',
			'options-makeglobal': 'このオプションをグローバルにする',
			'dialog-heading-block': '投稿ブロック',
			'dialog-heading-unblock': 'ブロック解除',
			'dialog-overwritewarning': '注意: 現在のブロック設定を上書きします。',
			'dialog-hasqueryparams': 'ブロックオプションが事前定義されています。(<span class="ab-replaceme"></span>)',
			'dialog-hasqueryparams-get': '適用',
			'dialog-button-block': 'ブロック',
			'dialog-button-unblock': 'ブロック解除',
			'dialog-button-preset': 'プリセット',
			'dialog-button-currentblock': '現在のブロック',
			'dialog-button-reset': 'リセット',
			'dialog-button-close': '閉じる',
			'portlet-label': 'AjaxBlockの設定',
			'config-header': 'AjaxBlockの設定を変更',
			'config-header-nopermission': '権限エラー',
			'config-body-nopermission': '<p>あなたには「利用者をブロックまたはブロック解除」を行う権限がありません。</p>',
			'config-loading': 'インターフェースを読み込み中',
			'config-loading-failed': 'インターフェースの読み込みに失敗しました。',
			'config-field-general': '全般設定',
			'config-field-language': '言語',
			'config-field-userdefined-local': '個人用ドロップダウンオプション (ローカル)',
			'config-field-userdefined-global': '個人用ドロップダウンオプション (グローバル)',
			'config-field-userdefined-add': '追加',
			'config-field-userdefined-remove': '除去',
			'config-field-preset': 'プリセット設定',
			'config-field-preset-user': 'ブロック（登録利用者）',
			'config-field-preset-ip': 'ブロック（IP利用者）',
			'config-field-preset-unblock': 'ブロック解除',
			'config-field-warning': '警告設定',
			'config-field-warning-dialog': 'ダイアログアクション',
			'config-field-warning-oneclick': 'ワンクリックアクション',
			'config-field-warning-noreason': '理由が未指定の場合',
			'config-field-warning-noexpiry': '期間が未指定の場合（デフォルトで無期限として処理）',
			'config-field-warning-nopartialspecs': '部分ブロックが有効化されているがページ名も名前空間も指定されていない場合',
			'config-field-warning-hardblock': 'ハードブロックを適用する場合',
			'config-field-warning-hideuser': '利用者名を秘匿化する場合',
			'config-field-warning-overwrite': '既存のブロックを上書きする場合',
			'config-field-warning-ignorepredefined': '事前指定された設定とは異なる設定がされている場合',
			'config-field-warning-blockself': '自身をブロックまたはブロック解除する場合',
			'config-field-warning-unblock': '対象のブロックを解除する場合',
			'config-button-save': '保存',
			'config-saving': '保存しています',
			'config-savedone': '保存しました',
			'config-savefailed': '保存に失敗しました',
			'error-fetch-dropdown': 'AjaxBlock: ブロック理由ドロップダウンの取得に失敗しました。',
			'error-fetch-userrights': '利用者権限の取得に失敗しました。AjaxBlockの読み込みを中止します。',
			'error-fetch-aliases': '投稿ブロック用特別ページの名称取得に失敗しました。AjaxBlockの読み込みを中止します。',
			'error-partial-morethan10': '「$1」は10ページを超えて指定できません。（$2ページ）',
			'error-multiplecalls': '注意: 2つめのAjaxBlockダイアログが作成されました。スクリプトが複数ファイルから読み込まれています。',
			'warning-partial-removed': '重複または無効な値が「$1」から除去されました。',
			'warning-hideuser-unchecked': '「利用者名を秘匿化」オプションは有期のブロック期間または部分ブロックと互換性がないためアンチェックされました。',
			'warning-confirm-opening-block': '<b>$1</b>を<u>ブロック</u>します。以下の潜在的な問題を確認してください。',
			'warning-confirm-opening-unblock': '<b>$1</b>の<u>ブロックを解除</u>します。以下の潜在的な問題を確認してください。',
			'warning-confirm-closing': '続行する場合は全てのチェックボックスをチェックしてください。',
			'warning-confirm-noreason': '理由が空白のまま続行',
			'warning-confirm-noexpiry': '期間が空白のまま続行（無期限で処理）',
			'warning-confirm-nopartialspecs': '部分ブロックの対象ページおよび名前空間が未指定のまま続行',
			'warning-confirm-hardblock': 'このIPをハードブロック',
			'warning-confirm-hideuser': '当該利用者名を秘匿化',
			'warning-confirm-overwrite': '既存のブロック設定を上書き',
			'warning-confirm-ignorepredefined': '事前指定された設定を無視',
			'warning-confirm-blockself': '自身をブロック（またはブロック解除）',
			'warning-confirm-unblock': '対象のブロックを解除',
			'warning-confirm-dialog-open': '中止時にAjaxBlockダイアログを開く',
			'warning-confirm-dialog-proceed': '続行',
			'warning-confirm-dialog-cancel': '中止',
			'warning-confirm-dialog-cancelled': '中止しました。',
			'warning-confirm-dialog-forcecancelled': '警告のいずれかが確認されなかったため、処理が強制的に中止されました。',
			'progress-block-done': 'ブロック成功',
			'progress-block-failed': 'ブロック失敗',
			'progress-unblock-done': 'ブロック解除成功',
			'progress-unblock-failed': 'ブロック解除失敗'
		}
	},

	reason: {
		dropdown: (function() {
			var dd = document.createElement('select');
			dd.style.minWidth = '36ch';
			return dd;
		})(),
		regex: null,
		fetched: false
	},

	aliases: {
		block: [],
		unblock: [],
		special: (function() {
			var wgNamespaceIds = mw.config.get('wgNamespaceIds');
			return Object.keys(wgNamespaceIds).reduce(/** @param {string[]} acc */ function(acc, alias) {
				var id = wgNamespaceIds[alias];
				if (id === -1) acc.push(alias);
				return acc;
			}, []);
		})()
	},

	rights: {
		block: null,
		oversight: null,
		sysop: (mw.config.get('wgUserGroups') || []).indexOf('sysop') !== -1
	},

	// @ts-ignore
	lang: '',

	dropdown: {
		local: [],
		global: []
	},

	preset: {
		block: {
			user: {
				user: '',
				reason: mw.config.get('wgContentLanguage') === 'ja' ? '[[WP:SOCK|sockpuppet]]' : '[[WP:Vandalism|Vandalism]]',
				expiry: 'infinity',
				automatic: false,
				nocreate: true,
				noemail: true,
				allowusertalk: false,
				anononly: false,
				autoblock: true,
				hidden: false,
				partial: false,
				restrictions: {},
				watchlist : false,
				watchlistexpiry: 'infinity'
			},
			ip: {
				user: '',
				reason: mw.config.get('wgContentLanguage') === 'ja' ? '荒らし' : '[[WP:Vandalism|Vandalism]]',
				expiry: '1 week',
				automatic: false,
				nocreate: true,
				noemail: false,
				allowusertalk: true,
				anononly: true,
				autoblock: false,
				hidden: false,
				partial: false,
				restrictions: {},
				watchlist : false,
				watchlistexpiry: 'infinity'
			}
		},
		unblock: {
			reason: '',
			watchlist : false,
			watchlistexpiry: 'infinity'
		}
	},

	warning: {
		dialog: {
			noReason: true,
			noExpiry: true,
			noPartialSpecs: true,
			willHardblock: false,
			willHideUser: true,
			willOverwrite: false,
			willIgnorePredefined: true,
			willBlockSelf: true,
			willUnblock: false
		},
		oneclick: {
			noReason: true,
			noExpiry: true,
			noPartialSpecs: true,
			willHardblock: false,
			willHideUser: true,
			willOverwrite: true,
			willIgnorePredefined: true,
			willBlockSelf: true,
			willUnblock: true
		}
	}

};

/**
 * Language-specific interface message object.
 * @type {AjaxBlockMessages}
 * @readonly
 */
var msg;

// Exit before init() if the current user doesn't belong to any group with the 'block' user right
// @ts-ignore
if (!mw.config.get('wgUserGroups', []).concat(mw.config.get('wgGlobalGroups', [])).some(function(group) {
		return ['sysop', 'global-sysop', 'staff', 'steward', 'sysadmin'].indexOf(group) !== -1;
	})
) {
	if (abCfg.isOnConfig) {
		msg = abCfg.i18n.en;
		$(createPermissionErrorInterface);
	}
	return;
}

/** @type {mw.Api} @readonly */
var api;

/** @type {ABDialog} @readonly */
var abDialog;

// *********************************************************************************************************************

/**
 * Entry point. This function is called at the bottom of the script to make sure that prototype methods
 * (not hoisted by the constructor on script initialization) are loaded beforehand.
 */
function init() {
	load().then(function() { // When prerequisite asynchronous procedures are done

		// Properties of the 'rights' object being null means that user rights failed to be fetched
		if (abCfg.rights.block === null || abCfg.rights.oversight === null) {
			mw.notify(msg['error-fetch-userrights'], {type: 'error'});
			var loadingMsg = document.querySelector('.ab-loading');
			if (loadingMsg) {
				loadingMsg.innerHTML = '';
				loadingMsg.appendChild(getIcon('failed'));
				loadingMsg.appendChild(document.createTextNode(' ' + msg['config-loading-failed']));
			}
			return;
		}

		// Warn if the block reason dropdown failed to be fetched
		if (!abCfg.reason.fetched) {
			mw.notify(msg['error-fetch-dropdown'], {type: 'warn'});
		}

		// Add style tag
		addStyleTag();

		// If on the configuration page, create the config interface
		if (abCfg.isOnConfig) {
			if (abCfg.rights.block) {
				createConfigInterface();
			} else {
				createPermissionErrorInterface();
			}
			return;
		}

		// Don't run the script if the current user can't block users
		if (!abCfg.rights.block) {
			return;
		}

		// Create a portlet link to the config page.
		createPortletLink();

		// Were special page aliases fetched?
		if (!abCfg.aliases.block.length || !abCfg.aliases.unblock.length) { // Aliases failed to be fetched, meaning that block links can't be collected
			mw.notify(msg['error-fetch-aliases'], {type: 'error'});
			return;
		}

		// Collect and initialize block links (when hook is triggered; IOW every time when the page content is updated e.g. on RC and Watchlist)
		var hookTimeout;
		mw.hook('wikipage.content').add(function() {
			clearTimeout(hookTimeout); // Prevent hook from being fired multiple times
			hookTimeout = setTimeout(function() {
				initializeBlockLinks();
			}, 100);
		});

	});
}

/**
 * @typedef AjaxBlockConfigGlobal
 * @type {object}
 * @property {AvailableLanguages|""} lang
 * @property {string[]} dropdown
 */
/**
 * Asynchronous procedures to get the script ready.
 * @returns {JQueryPromise<void>}
 */
function load() {
	var def = $.Deferred();

	// A mw.Api instance must be initialized at the first place, along with modules that are used in the query functions.
	mw.loader.using(['mediawiki.api', 'mediawiki.util', 'mediawiki.user'], function() {

		api = new mw.Api();

		// Check user config
		/**
		 * @requires mediawiki.user
		 */
		var userCfgStr = mw.user.options.get(abCfg.prefkey.local);
		/** @type {AjaxBlockPublicConfig?} */
		var userCfg = null;
		if (userCfgStr !== null) {
			try {
				userCfg = JSON.parse(userCfgStr); // Cast string to object
			}
			catch (err) {
				console.error(abCfg.script, err);
			}
		}
		if (userCfg !== null && typeof userCfg === 'object') {
			Object.keys(userCfg).forEach(function(key) { // Overwrite abCfg
				if (['script', 'isOnConfig', 'prefkey', 'languages', 'i18n', 'reason', 'aliases', 'rights'].indexOf(key) === -1) { // Just in case
					// @ts-ignore 'userCfg' is possibly 'null'.
					abCfg[key] = userCfg[key];
				}
			});
		}
		var gUserCfgStr = mw.user.options.get(abCfg.prefkey.global);
		/** @type {AjaxBlockConfigGlobal?} */
		var gUserCfg = null;
		if (gUserCfgStr !== null) {
			try {
				gUserCfg = JSON.parse(gUserCfgStr); // Cast string to object
			}
			catch (err) {
				console.error(abCfg.script, err);
			}
		}
		if (gUserCfg !== null && typeof gUserCfg === 'object') {
			if (gUserCfg.lang) {
				abCfg.lang = gUserCfg.lang; // Overwrite language config
			}
			abCfg.dropdown.global = gUserCfg.dropdown.slice();
		}

		// Set language
		var lang = abCfg.lang || mw.user.options.get('language') || '';
		if (abCfg.i18n[lang]) {
			msg = abCfg.i18n[lang];
			abCfg.lang = lang;
		} else {
			msg = abCfg.i18n.en;
			abCfg.lang = 'en';
		}

		// On the config page, manipulate some elements as soon as the DOM gets ready.
		if (abCfg.isOnConfig) {
			$.when($.ready).then(function() {

				// Change document title (without this, 'No such special page')
				document.title = 'AjaxBlockConfig - ' + mw.config.get('wgSiteName');

				// Native DOM elements to manipulate
				var firstHeading = document.querySelector('.mw-first-heading') || document.querySelector('.firstHeading');
				if (firstHeading) {
					if (!document.querySelector('.ab-heading-nopermission')) {
						firstHeading.textContent = msg['config-header'];
					}
				} else {
					console.error(abCfg.script, 'Selector for the first heading was not found.');
				}

				var content = document.querySelector('.mw-body-content');
				if (content && !document.getElementById('ab-config-body')) {
					var span = document.createElement('span');
					span.classList.add('ab-loading');
					span.textContent = msg['config-loading'] + ' ';
					span.appendChild(getIcon('doing'));
					content.replaceChildren(span);
				}

			});
		}

		// Initialize the reason dropdown
		abCfg.reason.dropdown.innerHTML = // The dropdown should always have an 'other' option
			'<option value="">' + msg['options-otherreason'] + '</option>';

		if (abCfg.dropdown.global.length || abCfg.dropdown.local.length) { // If the user has defined their own options

			var userDefined = document.createElement('optgroup');
			userDefined.label = msg['options-userdefined'];

			abCfg.dropdown.global.concat(abCfg.dropdown.local).forEach(function(val, i, arr) { // Loop all the options

				if (arr.indexOf(val) !== i) { // Skip duplicates
					return;
				}

				var txt = parseWikilinks(val);
				var trunc = truncateByBytes(txt, 60); // The dropdown shouldn't be too wide
				if (trunc.length !== txt.length) {
					trunc += '..';
				}

				var opt = document.createElement('option');
				opt.value = val;
				opt.textContent = trunc;
				opt.title = val; // Set the full option value that's neither parsed nor truncated as a tooltip
				userDefined.appendChild(opt);

			});

			// Add optgroup to the dropdown
			abCfg.reason.dropdown.add(userDefined);

			// Update the reason regex
			// This regex is used to parse a reason string and select a dropdown option if any option value
			// matches part of the string. If the string is "XXX: YYY: ZZZ" and an option has the value of
			// "XXX" for instance, that option should be selected and the rest ("YYY: ZZZ") should be put
			// into the custom reason textbox.
			abCfg.reason.regex = new RegExp(
				'^(' +
				Array.prototype.reduce.call(
					abCfg.reason.dropdown.options,
					/**
					 * @param {string[]} acc
					 * @param {HTMLOptionElement} opt
					 */
					function(acc, opt) {
						var val = opt.value;
						if (val) { // No need to check duplicates
							acc.push(mw.util.escapeRegExp(val));
						}
						return acc;
					},
					[]
				).join('|') +
				')(?::|$)'
			);

		}

		/**
		 * Get meta information from the API that is required for this script.
		 * @returns {JQueryPromise<void>}
		 */
		var getMetaInfo = function() {

			/** @readonly */
			var msgName = 'ipbreason-dropdown';

			return api.get({
				action: 'query',
				meta: 'allmessages|siteinfo|userinfo',
				ammessages: msgName,
				siprop: 'specialpagealiases',
				uiprop: 'rights',
				formatversion: '2'
			}).then(function(res) {

				var resAm, resMsg, resSpa, resUi, resRgt;
				if (!res || !res.query) return;

				// Get block reason dropdown
				if (Array.isArray(resAm = res.query.allmessages) && // meta=allmessages has a valid response
					resAm[0] && resAm[0].name === msgName && // The array correctly has the relevant message
					typeof (resMsg = resAm[0].content) === 'string' && (abCfg.reason.fetched = true) &&
					resMsg.indexOf('*') !== -1 // The message is a stringified <ul>
				) {

					(function() { // Just to prevent the var declarations below from propagating to the entire function

						/** (*)(OPTION) */
						var optionRegex = /(\*+)([^*]+)/g;
						var m, val, txt, trunc, optgroup, opt;

						while ((m = optionRegex.exec(resMsg))) {

							val = m[2].trim(); // The raw option text
							txt = parseWikilinks(val);
							trunc = truncateByBytes(txt, 60);
							if (trunc.length !== txt.length) {
								trunc += '..';
							}

							// Append the option to the dropdown
							if (m[1].length === 1) {
								optgroup = document.createElement('optgroup');
								optgroup.label = val;
								abCfg.reason.dropdown.add(optgroup);
							} else {
								opt = document.createElement('option');
								opt.value = val;
								opt.textContent = trunc;
								opt.title = val;
								if (optgroup) {
									optgroup.appendChild(opt);
								} else {
									abCfg.reason.dropdown.add(opt);
								}
							}

						}

					})();

					// Update the reason regex
					/** @type {string[]} */
					var options = Array.prototype.reduce.call(
						abCfg.reason.dropdown.options,
						/**
						 * @param {string[]} acc
						 * @param {HTMLOptionElement} opt
						 */
						function(acc, opt) {
							var val = opt.value;
							var esc = mw.util.escapeRegExp(val);
							if (val && acc.indexOf(esc) === -1) {
								acc.push(esc);
							}
							return acc;
						},
						[]
					);
					if (options.length) {
						abCfg.reason.regex = new RegExp('^(' + options.join('|') + ')(?::|$)');
					}

				}

				// Get local aliases for Special:Block and Special:Unblock
				if (Array.isArray((resSpa = res.query.specialpagealiases))) {
					resSpa.some(function(obj) {
						/** @type {string} */
						var alias = (obj.realname || '').toLowerCase();
						if (alias === 'block' || alias === 'unblock') {
							obj.aliases.forEach(function(el) {
								abCfg.aliases[alias].push(el.replace(/ /g, '_'));
							});
						}
						return abCfg.aliases.block.length && abCfg.aliases.unblock.length; // Get out of the loop when both arrays are filled
					});
				}

				// Get the current user's user rights on this project
				if ((resUi = res.query.userinfo) && Array.isArray((resRgt = resUi.rights))) {
					abCfg.rights.block = resRgt.indexOf('block') !== -1;
					abCfg.rights.oversight = resRgt.indexOf('suppressrevision') !== -1;
				}

			}).catch(function(code, err) {
				console.warn(abCfg.script, err);
			});

		};

		// Send API requests and load other dependent modules. When these are done, the script can start its main procedures.
		var dependencies = ['jquery.ui', 'mediawiki.Uri'];
		if (abCfg.isOnConfig) {
			dependencies.pop();
		}
		$.when(
			getMetaInfo(),
			mw.loader.using(dependencies),
			$.ready
		).then(function() {
			def.resolve();
		});

	});

	return def.promise();
}

/**
 * Add a style tag to the DOM for AjaxBlock.
 */
function addStyleTag() {
	var style = document.createElement('style');
	style.textContent =
		// For (un)block links that can't be processed
		'.ab-blocklink-invalid {' +
			'text-decoration: underline dotted;' +
		'}' +
		// Config and dialog designs
		'#ab-config-body fieldset {' +
			'border-color: #a2a9b1;' + // silver-like border
		'}' +
		'#ab-config-body legend {' +
			'font-weight: bold;' +
		'}' +
		// Option creator
		'.ab-option-creator {' +
			'min-width: 44ch;' +
			'max-width: 60ch;' +
		'}' +
		'.ad-option-creator-badvalue {' +
			'border: 2px solid red;' +
			'background-color: mistyrose;' +
		'}' +
		'.ab-option-creator-list {' +
			'list-style: none;' +
			'margin: 0;' +
		'}' +
		'.ab-option-creator-list li:not(.ab-option-creator-list-dummyitem) {' +
			'padding: 0 0.2em;' +
			'cursor: pointer;' +
		'}' +
		'.ab-option-creator-list-dummyitem {' +
			'height: 0.3em;' +
		'}' +
		'.ab-option-creator-list li:not(.ab-option-creator-list-dummyitem):hover {' +
			'background-color: #80ccff;' +
		'}' +
		'.ab-option-creator-buttons {' +
			'margin-top: 0.3em;' +
		'}' +
		// First column of table (storing labels for block options)
		'.ab-table tr > td:first-child {' +
			'padding-right: 1em;' +
		'}' +
		// No 'x' button on the main dialog. See also the doc on ABDialog.close for why this is needed.
		'.ab-dialog .ui-dialog-titlebar-close {' +
			'visibility: hidden;' +
		'}' +
		'#ab-config-body input[type="text"],' +
		'#ab-config-body textarea,' +
		'#ab-config-body select,' +
		'.ab-dialog input[type="text"],' +
		'.ab-dialog textarea,' +
		'.ab-dialog select {' +
			'box-sizing: border-box;' +
			'width: 100%;' +
			'font-family: inherit;' +
		'}' +
		// Checkbox designs
		'.ab-checkbox-wrapper {' +
			'margin: 0.1em 0;' +
		'}' +
		'.ab-checkbox-wrapper > * {' +
			'vertical-align: middle;' +
		'}' +
		'.ab-checkbox-wrapper input[type="checkbox"] {' +
			'margin-right: 0.5em;' +
		'}' +
		// Partial block option visibility
		'.ab-options-partial-details {' +
			'display: none;' +
		'}' +
		'.ab-options-partial:checked ~ .ab-options-partial-details {' +
			'display: block;' +
		'}' +
		// Watch user option visibility
		'.ab-options-watchuser-expiry-ul {' +
			'display: none;' +
		'}' +
		'.ab-options-watchuser:checked ~ .ab-options-watchuser-expiry-ul {' +
			'display: block;' +
		'}' +
		// jQuery UI tooltip, break lines by '\n'
		'.ab-namespace-tooltip {' +
			'white-space: pre-line;' +
		'}';
	document.head.appendChild(style);
}

/**
 * Create a portlet link to the config page.
 */
function createPortletLink() {
	mw.util.addPortletLink(
		'p-cactions',
		mw.util.getUrl('Special:AjaxBlockConfig'),
		msg['portlet-label']
	);
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
 * Parse wikilinks in a string.
 * @param {string} str
 * @return {string}
 */
function parseWikilinks(str) {
	var m;
	var regex = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;
	var ret = str;
	while ((m = regex.exec(str))) { // Parse wikilinks
		if (m[2]) { // Piped link with a display text
			ret = ret.replace(m[0], m[2]); // Truncate '[[PAGE|DISPLAYTEXT]]' into 'DISPLAYTEXT'
		} else { // Non-piped link
			ret = ret.replace(m[0], m[1]); // Truncate '[[PAGE]]' into 'PAGE'
		}
	}
	return ret;
}

/**
 * Truncate a string to an n-byte string. If the byte size of the input string in itself is the same as or smaller than the max byte size,
 * trucation doesn't take place and the input string is returned.
 * @param {string} str
 * @param {number} maxBytes
 * @returns {string}
 */
function truncateByBytes(str, maxBytes) {
	maxBytes = Math.max(maxBytes, 0); // This isn't needed but hardcoding to ensure that the number is positive
	var enc = encodeURIComponent(str);
	var bytes = enc.replace(/%../g, 'x').length;
	if (bytes <= maxBytes) {
		return str;
	}
	while (enc.length) {
		enc = /%..$/.test(enc) ? enc.slice(0, enc.length - 3) : enc.slice(0, enc.length - 1); // Erase '%XX' or 'w' at the end of the string
		var dec;
		try {
			// Decoding may fail in the case of 2+ byte characters (e.g. if %XX%YY is one character, we can't erase %YY)
			dec = decodeURIComponent(enc);
		}
		catch (err) {
			continue;
		}
		bytes = enc.replace(/%../g, 'x').length;
		if (bytes <= maxBytes) {
			return dec;
		}
	}
	return str; // This line is never reached (as long as maxBytes is positive)
}

/**
 * Create the config interface by replacing the page content.
 * @returns {void}
 */
function createConfigInterface() {

	// Get native DOM elements to manipulate
	var content = document.querySelector('.mw-body-content');
	if (!content) {
		console.error(abCfg.script, 'Selector for the body content was not found.');
		return;
	}

	// Create interface
	// Container div
	var body = document.createElement('div');
	body.id = 'ab-config-body';
	body.style.fontFamily = 'inherit';
	content.replaceChildren(body);

	// Wrapper fieldset for general options
	var fsGeneral = document.createElement('fieldset');
	fsGeneral.id = 'ab-config-general';
	fsGeneral.innerHTML = '<legend>' + msg['config-field-general'] + '</legend>';
	body.appendChild(fsGeneral);

	// Language option
	var fsLang = document.createElement('fieldset');
	fsLang.id = 'ab-config-general-language';
	fsLang.innerHTML = '<legend>' + msg['config-field-language'] + '</legend>';
	fsGeneral.appendChild(fsLang);
	var ddLang = document.createElement('select');
	ddLang.id = 'ab-config-general-language-selector';
	ddLang.style.maxWidth = '20ch';
	abCfg.languages.forEach(function(el, i) {
		var opt = document.createElement('option');
		opt.textContent = el;
		ddLang.add(opt);
		if (el === abCfg.lang) {
			ddLang.selectedIndex = i;
		}
	});
	fsLang.appendChild(ddLang);
	var langGlobal = createCheckbox(fsLang, msg['options-makeglobal'], {id: 'ab-config-general-language-global'});

	var fsLocalOptions = document.createElement('fieldset');
	fsLocalOptions.id = 'ab-config-general-options-local';
	fsLocalOptions.innerHTML = '<legend>' + msg['config-field-userdefined-local'] + '</legend>';
	fsGeneral.appendChild(fsLocalOptions);
	var localOptions = new OptionCreator(fsLocalOptions, abCfg.dropdown.local);

	var fsGlobalOptions = document.createElement('fieldset');
	fsGlobalOptions.id = 'ab-config-general-options-global';
	fsGlobalOptions.innerHTML = '<legend>' + msg['config-field-userdefined-global'] + '</legend>';
	fsGeneral.appendChild(fsGlobalOptions);
	var globalOptions = new OptionCreator(fsGlobalOptions, abCfg.dropdown.global);

	// Wrapper fieldset for preset options
	var fsPreset = document.createElement('fieldset');
	fsPreset.id = 'ab-config-preset';
	fsPreset.innerHTML = '<legend>' + msg['config-field-preset'] + '</legend>';
	body.appendChild(fsPreset);

	// Preset options > block registered users
	var fsUser = document.createElement('fieldset');
	fsUser.id = 'ab-config-preset-blockuser';
	fsUser.innerHTML = '<legend>' + msg['config-field-preset-user'] + '</legend>';
	fsPreset.appendChild(fsUser);
	var boUser = new BlockOptions(fsUser);
	boUser.initPartialDetails();
	boUser.setUserType('user');
	boUser.setData(abCfg.preset.block.user);

	// Preset options > block IP users
	var fsIp = document.createElement('fieldset');
	fsIp.id = 'ab-config-preset-blockip';
	fsIp.innerHTML = '<legend>' + msg['config-field-preset-ip'] + '</legend>';
	fsPreset.appendChild(fsIp);
	var boIp = new BlockOptions(fsIp);
	boIp.initPartialDetails();
	boIp.setUserType('ip');
	boIp.setData(abCfg.preset.block.ip);

	// Get LTA shortcuts if possible, and set them as autocomplete candidates of the reason textboxes
	setAutocompleteSource([boUser.reasonCInput, boIp.reasonCInput]);

	// Preset options > unblock users
	var fsUbo = document.createElement('fieldset');
	fsUbo.id = 'ab-config-preset-unblock';
	fsUbo.innerHTML = '<legend>' + msg['config-field-preset-unblock'] + '</legend>';
	fsPreset.appendChild(fsUbo);
	var ubo = new UnblockOptions(fsUbo);
	ubo.setData(abCfg.preset.unblock);

	// Hide the username rows (irrelevant on the config page)
	[boUser.usernameWrapper, boIp.usernameWrapper, ubo.usernameWrapper].forEach(function(el) {
		el.hidden = true;
	});

	// Wrapper fieldset for warning options
	var fsWarn = document.createElement('fieldset');
	fsWarn.id = 'ab-config-warning';
	fsWarn.innerHTML = '<legend>' + msg['config-field-warning'] + '</legend>';
	body.appendChild(fsWarn);

	// Warning options > dialog actions
	var fsWarnDialog = document.createElement('fieldset');
	fsWarnDialog.id = 'ab-config-warning-dialog';
	fsWarnDialog.innerHTML = '<legend>' + msg['config-field-warning-dialog'] + '</legend>';
	fsWarn.appendChild(fsWarnDialog);

	// Warning options > one-click actions
	var fsWarnOneclick = document.createElement('fieldset');
	fsWarnOneclick.id = 'ab-config-warning-oneclick';
	fsWarnOneclick.innerHTML = '<legend>' + msg['config-field-warning-oneclick'] + '</legend>';
	fsWarn.appendChild(fsWarnOneclick);

	// Create the same checkboxes in the warning option fieldsets
	/** @type {Record<AjaxBlockActions, Record<AjaxBlockWarningOptions, CheckboxObject>>} */
	// @ts-ignore
	var warn = ['dialog', 'oneclick'].reduce(
		/**
		 * @param {Record<AjaxBlockActions, Record<AjaxBlockWarningOptions, CheckboxObject>>} acc
		 * @param {AjaxBlockActions} key
		 */
		// @ts-ignore
		function(acc, key, i) {
			var fs = i === 0 ? fsWarnDialog : fsWarnOneclick;
			acc[key] = {
				noReason: createCheckbox(fs, msg['config-field-warning-noreason'], {className: 'ab-config-warning-noreason'}),
				noExpiry: createCheckbox(fs, msg['config-field-warning-noexpiry'], {className: 'ab-config-warning-noexpiry'}),
				noPartialSpecs: createCheckbox(fs, msg['config-field-warning-nopartialspecs'], {className: 'ab-config-warning-nopartialspecs'}),
				willHardblock: createCheckbox(fs, msg['config-field-warning-hardblock'], {className: 'ab-config-warning-hardblock'}),
				willHideUser: createCheckbox(fs, msg['config-field-warning-hideuser'], {className: 'ab-config-warning-hideuser'}),
				willOverwrite: createCheckbox(fs, msg['config-field-warning-overwrite'], {className: 'ab-config-warning-overwrite'}),
				willIgnorePredefined: createCheckbox(fs, msg['config-field-warning-ignorepredefined'], {className: 'ab-config-warning-ignorepredefined'}),
				willBlockSelf: createCheckbox(fs, msg['config-field-warning-blockself'], {className: 'ab-config-warning-blockself'}),
				willUnblock: createCheckbox(fs, msg['config-field-warning-unblock'], {className: 'ab-config-warning-unblock'})
			};
			if (!abCfg.rights.oversight) {
				acc[key].willHideUser.wrapper.hidden = true; // The 'hideuser' option is only relevant to oversighters
			}
			Object.keys(acc[key]).forEach(function(optKey) {
				acc[key][optKey].box.checked = abCfg.warning[key][optKey]; // Check the boxes in accordance with the pre-initialized user configs
			});
			return acc;
		},
	Object.create(null));

	/**
	 * Toggle the disabled attributes of all input, textarea, and select elements in the config body.
	 * @param {boolean} disable
	 */
	var toggleDisabled = function(disable) {
		// Note: NodeList.forEach isn't supported on browsers like Edge 4; handle the array-like object as a pure array
		Array.prototype.forEach.call(
			body.querySelectorAll('input, textarea, select'),
			/**
			 * @param {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} el
			 */
			function(el) {
				el.disabled = disable;
			}
		);
	};

	// Save button
	var saveButton = document.createElement('input');
	saveButton.id = 'ab-config-save';
	saveButton.type = 'button';
	saveButton.value = msg['config-button-save'];
	body.appendChild(saveButton);

	// Span to show the progress of the saving procedure
	var saveProgress = document.createElement('span');
	saveProgress.id = 'ab-config-saveprogress';
	saveProgress.style.marginLeft = '1em';
	body.appendChild(saveProgress);

	/**
	 * Save local user preferences.
	 * @param {AjaxBlockPublicConfig} lCfg
	 * @returns {JQueryPromise<string|undefined>} Returns an error code on failure
	 */
	var saveLocalOptions = function(lCfg) {
		var lCfgStr = JSON.stringify(lCfg);
		return api.saveOption(abCfg.prefkey.local, lCfgStr)
			.then(function() {
				mw.user.options.set(abCfg.prefkey.local, lCfgStr);
				return;
			})
			.catch(function(code, err) {
				console.warn(abCfg.script, err);
				return code;
			});
	};

	/**
	 * Save global user preferences.
	 * @param {AjaxBlockConfigGlobal} gCfg
	 * @returns {JQueryPromise<string|undefined>} Returns an error code on failure
	 */
	var saveGlobalOptions = function(gCfg) {
		var gCfgStr = JSON.stringify(gCfg);
		var params = {
			action: 'globalpreferences',
			optionname: abCfg.prefkey.global,
			optionvalue: gCfgStr,
			formatversion:'2'
		};
		return api.postWithToken('csrf', params)
			.then(function() {
				mw.user.options.set(abCfg.prefkey.global, gCfgStr);
				return;
			}).catch(function(code, err) {
				console.warn(abCfg.script, err);
				return code;
			});
	};

	/**
	 * Save local and global user preferences.
	 * @param {AjaxBlockPublicConfig} lCfg
	 * @param {AjaxBlockConfigGlobal} gCfg
	 * @returns {JQueryPromise<string>} Returns an error code on failure, otherwise an empty string
	 */
	var saveOptions = function(lCfg, gCfg) {
		return $.when.apply($, [saveLocalOptions(lCfg), saveGlobalOptions(gCfg)]).then(function(lErr, gErr) {
			return [lErr, gErr].filter(function(el) { return el; }).join(' ');
		});
	};

	// Event listner for when the save button is clicked
	var saveTimeout;
	saveButton.addEventListener('click', function() {

		this.disabled = true;

		// Evaluate partial block options and if there's an error or if some entries are removed, don't proceed to the saving procedure
		var evalPtlUser = boUser.evalPartialBlockOptions(
			msg['config-field-preset-user'] + ' > ' + msg['options-checkbox-partial'] + ' > ' + msg['options-partial-pages-label'],
			msg['config-field-preset-user'] + ' > ' + msg['options-checkbox-partial'] + ' > ' + msg['options-partial-namespaces-label']
		);
		var evalPtlIp = boIp.evalPartialBlockOptions(
			msg['config-field-preset-ip'] + ' > ' + msg['options-checkbox-partial'] + ' > ' + msg['options-partial-pages-label'],
			msg['config-field-preset-ip'] + ' > ' + msg['options-checkbox-partial'] + ' > ' + msg['options-partial-namespaces-label']
		);
		if (evalPtlUser.pages.set.length > 10 || evalPtlUser.pages.removed.length || evalPtlUser.namespaces.removed.length ||
			evalPtlIp.pages.set.length > 10|| evalPtlIp.pages.removed.length || evalPtlIp.namespaces.removed.length
		) {
			this.disabled = false;
			return;
		}

		// Some manipulations of DOM elements on the config interface
		toggleDisabled(true);
		clearTimeout(saveTimeout);  // saveTimeout may be storing a setTimeout procedure to blank the progress span. Cancel this here or
									// the span can be unintentionally blanked while the save-option attempt
		saveProgress.innerHTML = msg['config-saving'] + ' ';
		saveProgress.appendChild(getIcon('doing'));

		// Now save the config
		/** @type {AjaxBlockPublicConfig} */
		var userCfg = {
			// @ts-ignore
			lang: ddLang.value,
			dropdown: {
				local: localOptions.getOptions(),
				global: []
			},
			preset: {
				block: {
					user: boUser.getData(evalPtlUser.pages.set, evalPtlUser.namespaces.set),
					ip: boIp.getData(evalPtlIp.pages.set, evalPtlIp.namespaces.set)
				},
				unblock: ubo.getData()
			},
			warning: {
				dialog: {
					noReason: warn.dialog.noReason.box.checked,
					noExpiry: warn.dialog.noExpiry.box.checked,
					noPartialSpecs: warn.dialog.noPartialSpecs.box.checked,
					willHardblock: warn.dialog.willHardblock.box.checked,
					willHideUser: warn.dialog.willHideUser.box.checked,
					willOverwrite: warn.dialog.willOverwrite.box.checked,
					willIgnorePredefined: warn.dialog.willIgnorePredefined.box.checked,
					willBlockSelf: warn.dialog.willBlockSelf.box.checked,
					willUnblock: warn.dialog.willUnblock.box.checked,
				},
				oneclick: {
					noReason: warn.oneclick.noReason.box.checked,
					noExpiry: warn.oneclick.noExpiry.box.checked,
					noPartialSpecs: warn.oneclick.noPartialSpecs.box.checked,
					willHardblock: warn.oneclick.willHardblock.box.checked,
					willHideUser: warn.oneclick.willHideUser.box.checked,
					willOverwrite: warn.oneclick.willOverwrite.box.checked,
					willIgnorePredefined: warn.oneclick.willIgnorePredefined.box.checked,
					willBlockSelf: warn.oneclick.willBlockSelf.box.checked,
					willUnblock: warn.oneclick.willUnblock.box.checked,
				}
			}
		};
		/** @type {AjaxBlockConfigGlobal} */
		var gUserCfg = {
			// @ts-ignore
			lang: langGlobal.box.checked ? ddLang.value : '',
			dropdown: globalOptions.getOptions()
		};

		saveOptions(userCfg, gUserCfg).then(function(err) {
			saveProgress.innerHTML = '';
			if (err) {
				saveProgress.appendChild(getIcon('failed'));
				saveProgress.appendChild(document.createTextNode(' ' + msg['config-savefailed'] + ' (' + err + ')'));
			} else {
				saveProgress.appendChild(getIcon('done'));
				saveProgress.appendChild(document.createTextNode(' ' + msg['config-savedone']));
			}
			toggleDisabled(false);
			saveTimeout = setTimeout(function(){
				saveProgress.innerHTML = ''; // Blank the progress span after 5 seconds
			}, 5000);
		});

	});

}

/**
 * Create the permission error interface by replacing the page content.
 * @returns {void}
 */
function createPermissionErrorInterface() {
	var firstHeading = document.querySelector('.mw-first-heading') || document.querySelector('.firstHeading');
	if (firstHeading) {
		firstHeading.classList.add('ab-heading-nopermission');
		firstHeading.textContent = msg['config-header-nopermission'];
	} else {
		console.error(abCfg.script, 'Selector for the first heading was not found.');
	}
	var content = document.querySelector('.mw-body-content');
	if (content) {
		content.innerHTML = msg['config-body-nopermission'];
	} else {
		console.error(abCfg.script, 'Selector for the body content was not found.');
	}
}

var listItemCnt = 0;

/**
 * Interface to manage user-defined dropdown options.
 * @class
 * @constructor
 * @param {HTMLElement} appendTo
 * @param {string[]} options Initialize the options with these.
 */
function OptionCreator(appendTo, options) {

	var self = this;
	var idPrefix = 'ab-option-creator-list-item';
	/** @type {string} */
	this.idPrefix = idPrefix;

	// Wrapper div
	var wrapper = document.createElement('div');
	wrapper.classList.add('ab-option-creator');
	appendTo.appendChild(wrapper);
	/** @type {HTMLDivElement} */
	this.wrapper = wrapper;

	// Unordered list into which items go
	var ul = document.createElement('ul');
	ul.classList.add('ab-option-creator-list');
	var dummyLi = document.createElement('li'); // This makes it possible to drag items to the bottom of the list
	dummyLi.classList.add('ab-option-creator-list-dummyitem');
	dummyLi.id = idPrefix + (listItemCnt++);
	makeDraggable(dummyLi);
	ul.appendChild(dummyLi);
	wrapper.appendChild(ul);
	/** @type {HTMLUListElement} */
	this.ul = ul;
	/** @type {HTMLLIElement} */
	this.dummyLi = dummyLi;

	// Textbox to add/remove options
	var input = document.createElement('input');
	input.type = 'text';
	input.classList.add('ab-option-creator-input');
	input.addEventListener('keydown', function(e) { // Add the item into the list when Enter is pressed
		if (e.key === 'Enter') {
			self.addOption(this.value.trim());
		}
	});
	input.addEventListener('input', function() { // Remove red border added on error by addOption()
		this.classList.remove('ad-option-creator-badvalue');
	});
	wrapper.appendChild(input);
	/** @type {HTMLInputElement} */
	this.input = input;

	// Initialize list items
	options.forEach(function(el) {
		var li = document.createElement('li');
		li.id = idPrefix + (listItemCnt++);
		li.textContent = el;
		li.draggable = true;
		li.addEventListener('click', function() { // When the item is clicked, put the value into the input
			self.input.value = this.textContent || '';
		});
		makeDraggable(li);
		ul.insertBefore(li, dummyLi);
	});

	var buttonWrapper = document.createElement('div');
	buttonWrapper.classList.add('ab-option-creator-buttons');
	wrapper.appendChild(buttonWrapper);
	/** @type {HTMLDivElement} */
	this.buttonWrapper = buttonWrapper;

	// Add button
	var add = document.createElement('input');
	add.type = 'button';
	add.value = msg['config-field-userdefined-add'];
	add.classList.add('ab-option-creator-addoption');
	add.addEventListener('click', function() { // Add the item into the list when clicked
		self.addOption(input.value.trim());
	});
	buttonWrapper.appendChild(add);
	/** @type {HTMLInputElement} */
	this.add = add;

	// Remove button
	var remove = document.createElement('input');
	remove.type = 'button';
	remove.value = msg['config-field-userdefined-remove'];
	remove.style.marginLeft = '0.5em';
	remove.classList.add('ab-option-creator-removeoption');
	remove.addEventListener('click', function() { // Remove the selected item from the list when clicked
		self.removeOption(input.value.trim());
	});
	buttonWrapper.appendChild(remove);
	/** @type {HTMLInputElement} */
	this.remove = remove;

}

/**
 * Add an item to the list.
 * @param {string} val
 * @method
 */
OptionCreator.prototype.addOption = function(val) {
	var self = this;
	var values = this.getOptions(); // Collect list items
	if (!val || values.indexOf(val) !== -1) { // If the input is blank or the value is a duplicate
		this.input.classList.add('ad-option-creator-badvalue'); // Apply red border to the input
	} else { // If the value is valid
		// Add the item to the list
		var li = document.createElement('li');
		li.id = this.idPrefix + (listItemCnt++);
		li.textContent = val;
		li.draggable = true;
		li.addEventListener('click', function() {
			self.input.value = this.textContent || '';
		});
		makeDraggable(li);
		this.ul.insertBefore(li, this.dummyLi);
		this.input.value = '';
		this.input.dispatchEvent(new Event('input')); // For red border removal
	}
};

/**
 * Remove an item with a certain value from the list.
 * @param {string} val
 * @method
 */
OptionCreator.prototype.removeOption = function(val) {
	var listitems = Array.prototype.slice.call(this.ul.querySelectorAll('li'));
	for (var i = 0; i < listitems.length; i++) {
		var li = listitems[i];
		if (li.textContent === val) {
			li.remove();
			this.input.value = '';
			this.input.dispatchEvent(new Event('input')); // For red border removal
			break;
		}
	}
};

/**
 * Get user-defined options.
 * @returns {string[]}
 * @method
 */
OptionCreator.prototype.getOptions = function() {
	return Array.prototype.reduce.call(
		this.ul.querySelectorAll('li'),
		/**
		 * @param {string[]} acc
		 * @param {HTMLLIElement} li
		 */
		function(acc, li) {
			var val = li.textContent;
			if (val) acc.push(val);
			return acc;
		},
		[]
	);
};

/**
 * Make a listitem draggable for order shuffling.
 * @param {HTMLLIElement} li
 */
function makeDraggable(li) {
	li.ondragstart = function(e) { // When the listitem has started to be dragged
		if (e.dataTransfer) {
			e.dataTransfer.setData('text/plain', li.id); // Save the element's ID
		}
	};
	li.ondragover = function(e) { // When the listitem is dragged over a valid drop target
		e.preventDefault();
		li.style.borderTop = '2px solid blue'; // Highlight the drop point by border
	};
	li.ondragleave = function() { // When the listitem is dragged off a valid drop target
		li.style.borderTop = ''; // Reset border
	};
	li.ondrop = function(e) { // When the dragged listitem is dropped
		e.preventDefault();
		if (e.dataTransfer) {
			var id = e.dataTransfer.getData('text/plain'); // Get the dragged element
			var dragged;
			if ((dragged = document.getElementById(id)) && li.parentElement) {
				li.parentElement.insertBefore(dragged, li); // Insert the element before the drop target
			}
		}
		li.style.borderTop = '';
	};
}

/**
 * BlockOptions class. Creates options for action=block.
 * @class
 * @constructor
 * @param {HTMLElement} appendTo
 */
function BlockOptions(appendTo) {

	var container = document.createElement('div');
	container.classList.add('ab-blockoptions');
	container.style.width = 'max-content';
	appendTo.appendChild(container);
	/** @type {HTMLDivElement} */
	this.container = container;

	var table = document.createElement('table');
	table.classList.add('ab-table');
	container.appendChild(table);
	var tbody = document.createElement('tbody');
	table.appendChild(tbody);

	var usernameWrapper = document.createElement('tr');
	tbody.appendChild(usernameWrapper);
	/** @type {HTMLTableRowElement} */
	this.usernameWrapper = usernameWrapper;

	var usernameLabel = document.createElement('td');
	usernameLabel.textContent = msg['options-username-label'];
	usernameWrapper.appendChild(usernameLabel);
	var usernameCell = document.createElement('td');
	usernameCell.style.minWidth = '44ch';
	usernameCell.style.maxWidth = '60ch';
	usernameCell.style.overflowWrap = 'break-word';
	usernameWrapper.appendChild(usernameCell);
	/** @type {HTMLTableCellElement} */
	this.usernameCell = usernameCell;

	var expiryWrapper = document.createElement('tr');
	tbody.appendChild(expiryWrapper);
	var expiryLabel = document.createElement('td');
	expiryLabel.textContent = msg['options-expiry-label'];
	expiryWrapper.appendChild(expiryLabel);
	var expiryCell = document.createElement('td');
	expiryWrapper.appendChild(expiryCell);
	var expiryDropdown = document.createElement('select');
	[
		{value: '', text: msg['options-expiry-other']},
		{value: 'infinity', text: msg['options-expiry-indefinite']},
		{value: '1 hour', text: msg['options-expiry-1hour']},
		{value: '2 hours', text: msg['options-expiry-2hours']},
		{value: '1 day', text: msg['options-expiry-1day']},
		{value: '31 hours', text: msg['options-expiry-31hours']},
		{value: '2 days', text: msg['options-expiry-2days']},
		{value: '3 days', text: msg['options-expiry-3days']},
		{value: '1 week', text: msg['options-expiry-1week']},
		{value: '2 weeks', text: msg['options-expiry-2weeks']},
		{value: '1 month', text: msg['options-expiry-1month']},
		{value: '3 months', text: msg['options-expiry-3months']},
		{value: '6 months', text: msg['options-expiry-6months']},
		{value: '1 year', text: msg['options-expiry-1year']},
		{value: '2 year', text: msg['options-expiry-2years']},
		{value: '3 year', text: msg['options-expiry-3years']}
	].forEach(function(obj) {
		var opt = document.createElement('option');
		opt.value = obj.value;
		opt.textContent = obj.text;
		expiryDropdown.add(opt);
	});
	expiryCell.appendChild(expiryDropdown);
	/** @type {HTMLSelectElement} */
	this.expiryDropdown = expiryDropdown;

	var expiryCWrapper = document.createElement('tr');
	tbody.appendChild(expiryCWrapper);
	var expiryCLabel = document.createElement('td');
	expiryCWrapper.appendChild(expiryCLabel);
	var expiryCCell = document.createElement('td');
	expiryCWrapper.appendChild(expiryCCell);
	var expiryCInput = document.createElement('input');
	expiryCInput.type = 'text';
	expiryCInput.placeholder = msg['options-customexpiry-placeholder'];
	expiryCInput.addEventListener('focus', function() {
		expiryDropdown.selectedIndex = 0; // Select 'other' in the expiry dropdown when the custom expiry textbox is focused
		expiryDropdown.dispatchEvent(new Event('change')); // For clearExpiryInput and validateHideuser
	});
	expiryCCell.appendChild(expiryCInput);
	/** @type {HTMLInputElement} */
	this.expiryCInput = expiryCInput;

	/**
	 * Clear the custom expiry input when a non-'other' option is selected.
	 * @param {Event} _e
	 * @this {HTMLSelectElement}
	 */
	var clearExpiryInput = function(_e) {
		if (this.value !== '') {
			expiryCInput.value = '';
		}
	};
	expiryDropdown.addEventListener('change', clearExpiryInput);

	var reason1Wrapper = document.createElement('tr');
	tbody.appendChild(reason1Wrapper);
	var reason1Label = document.createElement('td');
	reason1Label.textContent = msg['options-reason1-label'];
	reason1Wrapper.appendChild(reason1Label);
	var reason1Cell = document.createElement('td');
	reason1Wrapper.appendChild(reason1Cell);
	/** @type {HTMLSelectElement} */
	// @ts-ignore
	var reason1Dropdown = abCfg.reason.dropdown.cloneNode(true);
	reason1Cell.appendChild(reason1Dropdown);
	/** @type {HTMLSelectElement} */
	this.reason1Dropdown = reason1Dropdown;

	var reason2Wrapper = document.createElement('tr');
	tbody.appendChild(reason2Wrapper);
	var reason2Label = document.createElement('td');
	reason2Label.textContent = msg['options-reason2-label'];
	reason2Wrapper.appendChild(reason2Label);
	var reason2Cell = document.createElement('td');
	reason2Wrapper.appendChild(reason2Cell);
	/** @type {HTMLSelectElement} */
	// @ts-ignore
	var reason2Dropdown = abCfg.reason.dropdown.cloneNode(true);
	reason2Cell.appendChild(reason2Dropdown);
	/** @type {HTMLSelectElement} */
	this.reason2Dropdown = reason2Dropdown;

	/** @type {RegExp?} */
	this.reasonRegex = abCfg.reason.regex;

	var reasonCWrapper = document.createElement('tr');
	tbody.appendChild(reasonCWrapper);
	var reasonCLabel = document.createElement('td');
	reasonCWrapper.appendChild(reasonCLabel);
	var reasonCCell = document.createElement('td');
	reasonCWrapper.appendChild(reasonCCell);
	var reasonCInput = document.createElement('input');
	reasonCInput.type = 'text';
	reasonCInput.placeholder = msg['options-reasonC-placeholder'];
	reasonCCell.appendChild(reasonCInput);
	/** @type {HTMLInputElement} */
	this.reasonCInput = reasonCInput;

	var suffixWrapper = document.createElement('tr');
	tbody.appendChild(suffixWrapper);
	var suffixLabel = document.createElement('td');
	suffixLabel.textContent = msg['options-suffix-label'];
	suffixWrapper.appendChild(suffixLabel);
	var suffixCell = document.createElement('td');
	suffixWrapper.appendChild(suffixCell);
	var suffixDropdown = document.createElement('select');
	suffixDropdown.innerHTML = '<option value="">' + msg['options-suffix-none'] + '</option>';
	if (!abCfg.rights.sysop) {
		addSuffixOptions(suffixDropdown);
	}
	if (!suffixDropdown.options[1]) {
		suffixWrapper.hidden = true;
	}
	suffixCell.appendChild(suffixDropdown);
	/** @type {HTMLSelectElement} */
	this.suffixDropdown = suffixDropdown;

	[reason1Dropdown, reason2Dropdown, suffixDropdown].forEach(function(el) {
		el.addEventListener('change', setTitle); // Set a value to the title attribute when the selection changes
	});

	var nocreate = createCheckbox(container, msg['options-checkbox-nocreate'], {className: 'ab-options-nocreate'});
	/** @type {CheckboxObject} */
	this.nocreate = nocreate;
	var noemail = createCheckbox(container, msg['options-checkbox-noemail'], {className: 'ab-options-noemail'});
	/** @type {CheckboxObject} */
	this.noemail = noemail;
	var notalk = createCheckbox(container, msg['options-checkbox-notalk'], {className: 'ab-options-notalk'});
	/** @type {CheckboxObject} */
	this.notalk = notalk;
	var hardblock = createCheckbox(container, msg['options-checkbox-hardblock'], {className: 'ab-options-hardblock'});
	/** @type {CheckboxObject} */
	this.hardblock = hardblock;
	var autoblock = createCheckbox(container, msg['options-checkbox-autoblock'], {className: 'ab-options-autoblock'});
	/** @type {CheckboxObject} */
	this.autoblock = autoblock;
	var hideuser = createCheckbox(container, msg['options-checkbox-hideuser'], {className: 'ab-options-hideuser'});
	if (!abCfg.rights.oversight) {
		hideuser.wrapper.hidden = true;
	}
	/** @type {CheckboxObject} */
	this.hideuser = hideuser;
	var partial = createCheckbox(container, msg['options-checkbox-partial'], {className: 'ab-options-partial'});
	/** @type {CheckboxObject} */
	this.partial = partial;

	var self = this;
	/**
	 * The 'hideuser' option can be applied only if the block expiry is indefinite and the block is sitewide.
	 * This function unchecks the 'hideuser' option when an incompatible option is enabled.
	 * @param {Event} _e
	 */
	var validateHideuser = function(_e) {
		if (!self.hideuser.box.checked || self.hideuser.wrapper.hidden) {
			self.hideuser.box.checked = false;
			return;
		} else if (
			['infinite', 'indefinite', 'infinity', 'never'].indexOf(self.expiryDropdown.value || self.expiryCInput.value.trim()) === -1 ||
			self.partial.box.checked
		) {
			self.hideuser.box.checked = false;
			mw.notify(msg['warning-hideuser-unchecked'], {type: 'warn'});
		}
	};
	expiryDropdown.addEventListener('change', validateHideuser);
	expiryCInput.addEventListener('input', validateHideuser);
	hideuser.box.addEventListener('change', validateHideuser);
	partial.box.addEventListener('change', validateHideuser);

	var partialDetails = document.createElement('div');
	partialDetails.classList.add('ab-options-partial-details');
	partial.wrapper.appendChild(partialDetails);
	/** @type {HTMLDivElement} */
	this.partialDetails = partialDetails;

	partialDetails.appendChild(document.createTextNode(msg['options-partial-pages-label']));
	var partialPages = document.createElement('textarea');
	partialPages.classList.add('ab-options-partial-pages');
	partialPages.rows = 2;
	partialPages.placeholder = msg['options-partial-pages-placeholder'];
	partialDetails.appendChild(partialPages);
	/** @type {HTMLTextAreaElement} */
	this.partialPages = partialPages;

	partialDetails.appendChild(document.createTextNode(msg['options-partial-namespaces-label']));
	var partialNamespaces = document.createElement('textarea');
	partialNamespaces.classList.add('ab-options-partial-namespaces');
	partialNamespaces.rows = 2;
	partialNamespaces.placeholder = msg['options-partial-namespaces-placeholder'];
	var tooltipArray = [msg['options-partial-namespaces-tooltip']]; // Create a namespace number tooltip
	var wgFormattedNamespaces = mw.config.get('wgFormattedNamespaces');
	Object.keys(wgFormattedNamespaces).forEach(function(n) {
		var num = parseInt(n);
		if (num >= 0 && num % 2 === 0) {
			tooltipArray.push(num + ': ' + (num === 0 ? msg['options-partial-namespaces-tooltip-main'] : wgFormattedNamespaces[num]));
		}
	});
	partialNamespaces.title = tooltipArray.join('\n');
	$(partialNamespaces).tooltip({
		tooltipClass: 'ab-namespace-tooltip',
		position: {
			my: 'left bottom',
			at: 'left top'
		}
	});
	partialDetails.appendChild(partialNamespaces);
	/** @type {HTMLTextAreaElement} */
	this.partialNamespaces = partialNamespaces;

	var wo = createWatchlistOptions(container);
	/** @type {CheckboxObject} */
	this.watchuser = wo.watchuser;
	/** @type {HTMLSelectElement} */
	this.watchuserExpiry = wo.watchuserExpiry;

}

/**
 * Set the left margin of the partial details div. The partial option checkbox must be visible when this method is called.
 * @method
 */
BlockOptions.prototype.initPartialDetails = function() {
	this.partialDetails.style.marginLeft = $(this.partial.box).outerWidth(true) + 'px';
};

/**
 * Show/hide the hardblock/autoblock options, depending on the user type.
 * @param {AjaxBlockUserTypes} usertype
 * @method
 */
BlockOptions.prototype.setUserType = function(usertype) {
	this.hardblock.wrapper.hidden = usertype !== 'ip';
	this.autoblock.wrapper.hidden = usertype !== 'user';
	this.hideuser.wrapper.hidden = !(usertype === 'user' && abCfg.rights.oversight);
};

/**
 * Set options in accordance with the parameter object.
 * @param {AjaxBlockDialogOptionsBlock} data Ignored properties: user, automatic
 * @method
 */
BlockOptions.prototype.setData = function(data) {

	// Set reason
	var reason = data.reason;
	var sdd = this.suffixDropdown;
	var /** @type {RegExp} */ sRegex;
	var /** @type {number} */ index;
	if (sdd.options.length > 0) { // If the suffix dropdown has an option
		var suffixSet = false;
		for (index = 1; index < sdd.options.length; index++) { // Set value if possible
			sRegex = new RegExp(mw.util.escapeRegExp(sdd.options[index].value) + '$');
			if (sRegex.test(reason)) {
				sdd.selectedIndex = index;
				suffixSet = true;
				reason = reason.replace(sRegex, '').trim();
				break;
			}
		}
		if (!suffixSet) {
			sdd.selectedIndex = 0;
		}
	}
	if (this.reasonRegex) {
		for (index = 1; index <= 2; index++) {
			/** @type {HTMLSelectElement} */
			var rdd = this['reason' + index + 'Dropdown'];
			var m = this.reasonRegex.exec(reason); // ^(A|B|C|...):?
			if (m) { // If the reason starts with one of the dropdown values
				for (var j = 0; j < rdd.options.length; j++) {
					if (rdd.options[j].value === m[1]) {
						rdd.selectedIndex = j; // Select the reason
						reason = reason.replace(m[0], '').trim(); // Erase the set reason in the original string
						break;
					}
				}
			} else { // If the reason doesn't start with any of the dropdown values
				// Set the rest of the dropdowns with the value of 'Other' and exit the loop
				rdd.selectedIndex = 0;
				if (index === 1) {
					this.reason2Dropdown.selectedIndex = 0;
				}
				break;
			}
		}
	} else { // If the reason regex is absent, select 'Other' in the dropdowns and put the whole reason to the textbox
		this.reason1Dropdown.selectedIndex = 0;
		this.reason2Dropdown.selectedIndex = 0;
	}
	this.reasonCInput.value = reason; // Set the rest of the reason to the custom reason textbox
	[this.reason1Dropdown, this.reason2Dropdown, sdd].forEach(function(el) {
		el.dispatchEvent(new Event('change')); // For setTitle
	});

	// Set expiry
	var edd = this.expiryDropdown;
	var set = false;
	for (var i = 0; i < edd.options.length; i++) {
		if (edd.options[i].value === (['infinity', 'infinite', 'indefinite', 'never'].indexOf(data.expiry) !== -1 ? 'infinity' : data.expiry)) {
			edd.selectedIndex = i; // Select the reason
			set = true;
			break;
		}
	}
	if (!set) {
		edd.selectedIndex = 0;
		this.expiryCInput.value = data.expiry;
	}
	edd.dispatchEvent(new Event('change')); // For clearExpiryInput and validateHideuser

	var self = this;
	Object.keys(data).forEach(function(key) {
		switch (key) {
			case 'nocreate':
				self.nocreate.box.checked = data[key];
				break;
			case 'noemail':
				self.noemail.box.checked = data[key];
				break;
			case 'allowusertalk':
				self.notalk.box.checked = !data[key];
				break;
			case 'anononly':
				self.hardblock.box.checked = !data[key];
				break;
			case 'autoblock':
				self.autoblock.box.checked = data[key];
				break;
			case 'hidden':
				self.hideuser.box.checked = !!abCfg.rights.oversight && !!data[key];
				break;
			case 'partial':
				self.partial.box.checked = data[key];
				self.partialPages.value =
					data.restrictions.pages ?
					self.partialPages.value = data.restrictions.pages.map(function(obj) {
						return obj.title.replace(/ /g, '_');
					}).join('|') :
					'';
				self.partialNamespaces.value =
					data.restrictions.namespaces ?
					data.restrictions.namespaces.join('|') :
					'';
				break;
			case 'watchlist':
				self.watchuser.box.checked = data[key];
				break;
			case 'watchlistexpiry':
				var dd = self.watchuserExpiry;
				for (var i = 0; i < dd.options.length; i++) {
					if (dd.options[i].value === data[key]) {
						dd.selectedIndex = i; // Select the reason
						break;
					}
				}
				break;
			default:
		}
	});
	this.expiryDropdown.dispatchEvent(new Event('change')); // For clearExpiryInput and validateHideuser

};

/**
 * Get block options. This method should be called after calling BlockOptions.evalPartialBlockOptions().
 * @param {string[]} pages Valid pagetitles for partial block.
 * @param {string[]} namespaces Valid namespaces for partial block.
 * @returns {AjaxBlockDialogOptionsBlock} Note: 'user' is an empty string, and 'automatic' is false.
 * @method
 */
BlockOptions.prototype.getData = function(pages, namespaces) {
	var rArr = [this.reason1Dropdown.value, this.reason2Dropdown.value, this.reasonCInput.value.trim()];
	return {
		user: '',
		reason: [rArr.filter(function(r) { return r; }).join(': '), this.suffixDropdown.value].filter(function(r) { return r; }).join(' '),
		expiry: this.expiryDropdown.value || forceInfinity(this.expiryCInput.value.trim()),
		automatic: false,
		nocreate: this.nocreate.box.checked,
		noemail: this.noemail.box.checked,
		allowusertalk: !this.notalk.box.checked,
		anononly: !this.hardblock.box.checked,
		autoblock: this.autoblock.box.checked,
		hidden: this.hideuser.box.checked,
		partial: this.partial.box.checked,
		restrictions: (function() {
			/**
			 * There's a few complications here. Object properties being non-existent and undefined are different:
			 * ```
			 * var obj = {
			 *	pages: undefined,
			 *	namespaces: undefined
			 * };
			 * console.log(Object.keys(obj)); // ['pages', 'namespaces']
			 * console.log($.isEmptyObject(obj)); // false
			 * ```
			 * The IIFE here is to ensure that the object properties are NON-EXISTENT if the 'pages' and 'namespaces' arrays
			 * are empty.
			 * @type {ApiResponseQueryListBlocksRestrictions}
			 */
			var obj = {};
			if (pages.length) {
				obj.pages = pages.map(function(p) {
					return {title: p};
				});
			}
			if (namespaces.length) {
				obj.namespaces = namespaces.slice(); // Deep copy
			}
			return obj;
		})(),
		watchlist: this.watchuser.box.checked,
		watchlistexpiry: this.watchuserExpiry.value
	};
};

/**
 * Object that stores an array of cleaned-up and removed partial block option values.
 * @typedef AjaxBlockPartialBlockOptionValues
 * @type {object}
 * @property {{set: string[]; removed: string[];}} pages
 * @property {{set: string[]; removed: string[];}} namespaces
 */
/**
 * Clean up pages and namespaces in the patial block option fields.
 * @param {string} page$1 The name of the page field, used in mw.notify when dupicate/invalid entries are found.
 * @param {string} ns$1 The name of the namespace field, used in mw.notify when dupicate/invalid entries are found.
 * @returns {AjaxBlockPartialBlockOptionValues}
 * @method
 */
BlockOptions.prototype.evalPartialBlockOptions = function(page$1, ns$1) {

	// Parse pages
	/** @type {string[]} */
	var pagesRemoved = [];
	var pages = this.partialPages.value.trim().split('|').reduce(/** @param {string[]} acc */ function(acc, page, i) {

		// When the field is empty, the 'pages' array should also be empty
		page = page.trim().replace(/ /g, '_');
		if (i === 0 && !page) {
			return acc;
		}

		// Get namespace number and non-prefixed title
		var pageLc = page.toLowerCase();
		var ns = 0;
		var title = page; // This will be the non-prefixed title
		var wgNamespaceIds = mw.config.get('wgNamespaceIds');
		for (var alias in wgNamespaceIds) {
			if (pageLc.indexOf(alias + ':') === 0) { // If the page title starts with a certain namespace prefix
				ns = wgNamespaceIds[alias]; // Save the namespace number
				title = page.slice(alias.length + 1); // Get the non-prefixed title
				break;
			}
		}

		// Get a tidied-up prefixed title and verify whether it is a valid page title for partial block
		var prefixedTitle = (ns !== 0 ? mw.config.get('wgFormattedNamespaces')[ns] + ':' : '') + title.charAt(0).toUpperCase() + title.slice(1);
		if (ns < 0 || !title || /[#<>[\]|{}]/.test(title)) { // Invalid titles to be removed
			if (pagesRemoved.indexOf(prefixedTitle) === -1) {
				pagesRemoved.push(prefixedTitle);
			}
		} else if (acc.indexOf(prefixedTitle) === -1) { // Valid titles
			acc.push(prefixedTitle);
		} else if (pagesRemoved.indexOf(prefixedTitle) === -1) { // Duplicate removal
			pagesRemoved.push(prefixedTitle);
		}

		return acc;

	}, []);

	// Update the pages field
	this.partialPages.value = pages.join('|');

	// Show warn/error messages
	if (pagesRemoved.length) { // If the field has invalid pagetitles
		var pageMsgSpan = document.createElement('span');
		pageMsgSpan.appendChild(document.createTextNode(mw.format(msg['warning-partial-removed'], page$1)));
		var pageMsgUl = document.createElement('ul');
		pageMsgSpan.appendChild(pageMsgUl);
		pagesRemoved.forEach(function(p) {
			var li = document.createElement('li');
			li.textContent = '"' + p + '"';
			pageMsgUl.appendChild(li);
		});
		mw.notify(pageMsgSpan, {type: 'warn', autoHideSeconds: 'long'});
	}
	if (pages.length > 10) { // If the field has more than 10 pagetitles
		mw.notify(mw.format(msg['error-partial-morethan10'], page$1, pages.length.toString()), {type: 'error', autoHideSeconds: 'long'});
	}

	// Parse namespaces
	var validNamespaceNumbers = Object.keys(mw.config.get('wgFormattedNamespaces')).reduce(/** @param {string[]} acc */ function(acc, num) {
		if (parseInt(num) >= 0) {
			acc.push(num); // Get valid namespace numbers as an array
		}
		return acc;
	}, []);
	/** @type {string[]} */
	var namespacesRemoved = [];
	var namespaces = this.partialNamespaces.value.trim().split('|').reduce(/** @param {string[]} acc */ function(acc, num, i) {
		num = num.trim().replace(/ /g, '_');
		if (i === 0 && !num) {
			return acc;
		}
		if (validNamespaceNumbers.indexOf(num) === -1) { // Invalid namespace numbers to be removed
			if (namespacesRemoved.indexOf(num) === -1) {
				namespacesRemoved.push(num);
			}
		} else if (acc.indexOf(num) === -1) { // Valid namespace numbers
			acc.push(num);
		} else if (namespacesRemoved.indexOf(num) === -1) { // Duplicate removal
			namespacesRemoved.push(num);
		}

		return acc;
	}, []);

	// Update the namespace field
	this.partialNamespaces.value = namespaces.join('|');

	// Show warn/error messages
	if (namespacesRemoved.length) {
		var nsMsgSpan = document.createElement('span');
		nsMsgSpan.appendChild(document.createTextNode(mw.format(msg['warning-partial-removed'], ns$1)));
		var nsMsgUl = document.createElement('ul');
		nsMsgSpan.appendChild(nsMsgUl);
		namespacesRemoved.forEach(function(ns) {
			var li = document.createElement('li');
			li.textContent = '"' + ns + '"';
			nsMsgUl.appendChild(li);
		});
		mw.notify(nsMsgSpan, {type: 'warn', autoHideSeconds: 'long'});
	}

	return {
		pages: {
			set: pages,
			removed: pagesRemoved
		},
		namespaces: {
			set: namespaces,
			removed: namespacesRemoved
		}
	};

};

/**
 * Global user groups with the 'block' right.
 * @typedef {(
 *	|"global-sysop"
 *	|"staff"
 *	|"steward"
 *	|"sysadmin"
 * )} GlobalGroupsWithBlockRight
 */
/**
 * Global user groups with the 'block' right to which the current user belongs.
 * @type {GlobalGroupsWithBlockRight[]}
 * @readonly
 */
// @ts-ignore
var gGroups = mw.config.get('wgGlobalGroups', []).filter(function(group) {
	return ['global-sysop', 'staff', 'steward', 'sysadmin'].indexOf(group) !== -1;
});
/**
 * The titles of pages on metawiki that document global user groups with the 'block' right.
 * @type {Record<GlobalGroupsWithBlockRight, string>}
 * @readonly
 */
var metaDoc = {
	'global-sysop': 'Global_sysops',
	staff: 'Special_global_permissions#staff',
	steward: 'Stewards',
	sysadmin: 'System_administrators'
};

/**
 * Add options to a suffix selector dropdown.
 * @param {HTMLSelectElement} dd
 */
function addSuffixOptions(dd) {
	gGroups.forEach(function(group) {
		var opt = document.createElement('option');
		var val = '([[:m:Special:MyLanguage/' + metaDoc[group] + '|' + group.replace(/-/g, ' ') + ']] action)';
		opt.value = val;
		opt.textContent = parseWikilinks(val).trim();
		opt.title = val;
		dd.add(opt);
	});
}

/**
 * Set the selected option's value as the dropdown's title attribute.
 * @param {Event} _e
 * @this {HTMLSelectElement}
 */
function setTitle(_e) {
	this.title = this.options[this.selectedIndex].value;
}

/**
 * Each checkbox is accompanied by a label but for this to work, the box must have an ID.
 * This index is used to indentify all the boxes in this respect, when the function below
 * is called without an ID specification.
 */
var checkboxIndex = 0;

/**
 * Object of a checkbox and its wrapper div.
 * @typedef {{wrapper: HTMLDivElement; box: HTMLInputElement;}} CheckboxObject
 */
/**
 * @param {HTMLElement} appendTo
 * @param {string} labelText
 * @param {{id?: string; className?: string;}} [config]
 * @returns {CheckboxObject}
 */
function createCheckbox(appendTo, labelText, config) {

	config = config || {};
	var id = config.id || 'ab-checkbox-' + (checkboxIndex++);

	var wrapper = document.createElement('div');
	wrapper.classList.add('ab-checkbox-wrapper');
	appendTo.appendChild(wrapper);

	var checkbox = document.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.id = id;
	if (config.className) {
		checkbox.className = config.className;
	}
	wrapper.appendChild(checkbox);

	var label = document.createElement('label');
	label.htmlFor = id;
	label.textContent = labelText;
	wrapper.appendChild(label);

	return {wrapper: wrapper, box: checkbox};

}

/**
 * Create a watchuser option field with a checkbox and an expiry dropdown.
 * @param {HTMLElement} appendTo
 * @returns {{watchuser: CheckboxObject; watchuserExpiry: HTMLSelectElement;}}
 */
function createWatchlistOptions(appendTo) {

	var watchuser = createCheckbox(appendTo, msg['options-checkbox-watchuser'], {className: 'ab-options-watchuser'});
	var watchuserExpiryUl = document.createElement('ul');
	watchuserExpiryUl.classList.add('ab-options-watchuser-expiry-ul');
	watchuserExpiryUl.style.marginTop = '0';
	watchuser.wrapper.appendChild(watchuserExpiryUl);
	var watchuserExpiryLi = document.createElement('li');
	watchuserExpiryUl.appendChild(watchuserExpiryLi);
	watchuserExpiryLi.appendChild(document.createTextNode(msg['options-expiry-label']));
	var watchuserExpiry = document.createElement('select');
	watchuserExpiry.classList.add('ab-options-watchuser-expiry');
	watchuserExpiry.style.display = 'inline-block';
	watchuserExpiry.style.width = 'initial';
	watchuserExpiry.style.marginLeft = '1em';
	[
		{value: 'infinity', text: msg['options-expiry-indefinite']},
		{value: '1 week', text: msg['options-expiry-1week']},
		{value: '2 weeks', text: msg['options-expiry-2weeks']},
		{value: '1 month', text: msg['options-expiry-1month']},
		{value: '3 months', text: msg['options-expiry-3months']},
		{value: '6 months', text: msg['options-expiry-6months']},
		{value: '1 year', text: msg['options-expiry-1year']}
	].forEach(function(obj) {
		var opt = document.createElement('option');
		opt.value = obj.value;
		opt.textContent = obj.text;
		watchuserExpiry.add(opt);
	});
	watchuserExpiryLi.appendChild(watchuserExpiry);

	return {
		watchuser: watchuser,
		watchuserExpiry: watchuserExpiry
	};

}

/**
 * Get a list of vandalism-in-progress (VIP) and long-term-abuse (LTA) shortcuts in the form of wikilinks.
 * @returns {JQueryPromise<string[]>}
 */
function getAutocompleteSource() {

	/**
	 * Get VIP shortcuts. This is relevant only to jawiki.
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
			console.log(abCfg.script, 'Failed to get a VIP list.', err);
			return [];
		});

	};

	/**
	 * Get LTA shortcuts.
	 * @returns {JQueryPromise<string[]>}
	 */
	var getLtaList = function() {

		/** @type {string[]} */
		var ltalistMain = [];

		/**
		 * Get all non-subpage redirects in the Main namespace starting with 'LTA:'.
		 * @param {string} [apcontinue]
		 * @returns {JQueryPromise<undefined>}
		 */
		var queryMain = function(apcontinue) {

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
						if (/^LTA:[^/]+$/.test(obj.title)) {
							ltalistMain.push('[[' + obj.title + ']]'); // Push '[[LTA:NAME]]'
						}
					});

					var resCont;
					return res.continue && (resCont = res.continue.apcontinue) ? queryMain(resCont) : undefined;

				})
				.catch(function(code, err) {
					console.log(abCfg.script, 'Failed to get an LTA list.', err);
					return undefined;
				});

		};

		/** @type {string[]} */
		var ltalistProject = [];

		/**
		 * Get all non-subpage redirects in the Project namespace starting with '(WP:)LTA/'.
		 * @param {string} [apcontinue]
		 * @returns {JQueryPromise<undefined>}
		 */
		var queryProject = function(apcontinue) {

			var params = {
				action: 'query',
				list: 'allpages',
				apprefix: 'LTA/',
				apnamespace: '4',
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
						var m;
						if ((m = obj.title.match(/^[^:]+:(LTA\/[^/]+)$/))) {
							ltalistProject.push('[[WP:' + m[1] + ']]'); // Push '[[WP:LTA/NAME]]'
						}
					});

					var resCont;
					return res.continue && (resCont = res.continue.apcontinue) ? queryProject(resCont) : undefined;

				})
				.catch(function(code, err) {
					console.log(abCfg.script, 'Failed to get an LTA list.', err);
					return undefined;
				});

		};

		// Return an array when the queries are done
		return $.when.apply($, [queryMain(), queryProject()]).then(function() {
			return ltalistMain.concat(ltalistProject);
		});

	};

	// Send API requests
	var deferreds = [getLtaList()];
	if (mw.config.get('wgWikiID') === 'jawiki') {
		deferreds.push(getVipList());
	}
	return $.when.apply($, deferreds).then(function(ltalist, viplist) {
		return ltalist.concat(viplist || []); // Return a merged array
	});

}

/**
 * Set autocomplete items to textboxes.
 * @param {HTMLInputElement[]} inputs
 * @returns {JQueryPromise<void>}
 */
function setAutocompleteSource(inputs) {
	return getAutocompleteSource().then(function(list) { // Get a VIP/LTA list and set its items as autocomplate candidates
		if (!list.length) return;
		inputs.forEach(function(inp) {
			$(inp).autocomplete({
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
	});
}

/**
 * UnblockOptions class. Creates options for action=unblock.
 * @class
 * @constructor
 * @param {HTMLElement} appendTo
 */
function UnblockOptions(appendTo) {

	var container = document.createElement('div');
	container.classList.add('ab-unblockoptions');
	container.style.width = 'max-content';
	appendTo.appendChild(container);
	/** @type {HTMLDivElement} */
	this.container = container;

	var table = document.createElement('table');
	table.classList.add('ab-table');
	container.appendChild(table);
	var tbody = document.createElement('tbody');
	table.appendChild(tbody);

	var usernameWrapper = document.createElement('tr');
	tbody.appendChild(usernameWrapper);
	/** @type {HTMLTableRowElement} */
	this.usernameWrapper = usernameWrapper;

	var usernameLabel = document.createElement('td');
	usernameLabel.textContent = msg['options-username-label'];
	usernameWrapper.appendChild(usernameLabel);
	var usernameCell = document.createElement('td');
	usernameCell.style.minWidth = '44ch';
	usernameCell.style.maxWidth = '60ch';
	usernameCell.style.overflowWrap = 'break-word';
	usernameWrapper.appendChild(usernameCell);
	/** @type {HTMLTableCellElement} */
	this.usernameCell = usernameCell;

	var reasonWrapper = document.createElement('tr');
	tbody.appendChild(reasonWrapper);
	var reasonLabel = document.createElement('td');
	reasonLabel.textContent = msg['options-reason-label'];
	reasonWrapper.appendChild(reasonLabel);
	var reasonCell = document.createElement('td');
	reasonCell.style.minWidth = '44ch';
	reasonCell.style.maxWidth = '60ch';
	reasonWrapper.appendChild(reasonCell);
	var reasonInput = document.createElement('textarea');
	reasonInput.rows = 2;
	reasonCell.appendChild(reasonInput);
	/** @type {HTMLTextAreaElement} */
	this.reasonInput = reasonInput;

	var suffixWrapper = document.createElement('tr');
	tbody.appendChild(suffixWrapper);
	var suffixLabel = document.createElement('td');
	suffixLabel.textContent = msg['options-suffix-label'];
	suffixWrapper.appendChild(suffixLabel);
	var suffixCell = document.createElement('td');
	suffixWrapper.appendChild(suffixCell);
	var suffixDropdown = document.createElement('select');
	suffixDropdown.innerHTML = '<option value="">' + msg['options-suffix-none'] + '</option>';
	suffixDropdown.addEventListener('change', setTitle);
	if (!abCfg.rights.sysop) {
		addSuffixOptions(suffixDropdown);
	}
	if (!suffixDropdown.options[1]) {
		suffixWrapper.hidden = true;
	}
	suffixCell.appendChild(suffixDropdown);
	/** @type {HTMLSelectElement} */
	this.suffixDropdown = suffixDropdown;

	var wo = createWatchlistOptions(container);
	/** @type {CheckboxObject} */
	this.watchuser = wo.watchuser;
	/** @type {HTMLSelectElement} */
	this.watchuserExpiry = wo.watchuserExpiry;

}

/**
 * Set options in accordance with the parameter object.
 * @param {AjaxBlockDialogOptionsUnblock} data
 * @method
 */
UnblockOptions.prototype.setData = function(data) {
	var reason = data.reason;
	var sdd = this.suffixDropdown;
	var /** @type {RegExp} */ sRegex;
	var /** @type {number} */ index;
	if (sdd.options.length > 0) { // If the suffix dropdown has an option
		var suffixSet = false;
		for (index = 1; index < sdd.options.length; index++) { // Set value if possible
			sRegex = new RegExp(mw.util.escapeRegExp(sdd.options[index].value) + '$');
			if (sRegex.test(reason)) {
				sdd.selectedIndex = index;
				suffixSet = true;
				reason = reason.replace(sRegex, '').trim();
				break;
			}
		}
		if (!suffixSet) {
			sdd.selectedIndex = 0;
		}
	}
	sdd.dispatchEvent(new Event('change')); // For setTitle
	this.reasonInput.value = reason;
	this.watchuser.box.checked = data.watchlist;
	var dd = this.watchuserExpiry;
	for (index = 0; index < dd.options.length; index++) {
		if (dd.options[index].value === data.watchlistexpiry) {
			dd.selectedIndex = index; // Select the reason
			break;
		}
	}
};

/**
 * Get unblock options.
 * @returns {AjaxBlockDialogOptionsUnblock}
 * @method
 */
UnblockOptions.prototype.getData = function() {
	return {
		reason: [this.reasonInput.value.trim(), this.suffixDropdown.value].filter(function(r) { return r; }).join(' '),
		watchlist: this.watchuser.box.checked,
		watchlistexpiry: this.watchuserExpiry.value
	};
};

/**
 * AjaxBlock logo shown when the script is being loaded (= the functionalities are not ready).
 * @type {HTMLImageElement}
 * @readonly
 */
var logo;

/**
 * Anchor type, block or unblock.
 * @typedef {"block"|"unblock"} AjaxBlockLinkTypes
 */
/**
 * @template T
 * @template U
 * @typedef {import('ts-xor').XOR<T,U>} XOR
 */
/**
 * Object that stores the information of (un)block links.
 * @typedef AjaxBlockLinkInfo
 * @type {object}
 * @property {HTMLAnchorElement} anchor
 * @property {string} username
 * @property {AjaxBlockUserTypes} usertype
 * @property {AjaxBlockLinkTypes} linktype
 * @property {string=} id Block ID. If this property is present, the action will be unblock.
 * @property {XOR<AjaxBlockDialogOptionsBlock,AjaxBlockDialogOptionsUnblock>?} query
 */
/**
 * Collect block links to add AJAX functionalities.
 */
function initializeBlockLinks() {

	/** @readonly */
	var content = document.getElementById('bodyContent') || document.querySelector('.mw-body-content');
	if (!content) {
		console.error(abCfg.script, 'Selector for the body content was not found.');
		return;
	}

	// Regular expressions to evaluate hrefs
	/** @readonly */
	var regex = {
		/** @readonly /wiki/PAGENAME */
		article: new RegExp('^' + mw.config.get('wgArticlePath').replace('$1', '([^?]+)')),
		/** @readonly Special:(XXX)/?(YYY)? */
		special: new RegExp('^(?:' + abCfg.aliases.special.join('|') + '):([^/]+)(?:/([^#]+))?', 'i'),
		/** @readonly ^Block$ */
		block: new RegExp('^(' + abCfg.aliases.block.join('|') + ')$', 'i'),
		/** @readonly ^Unblock$ */
		unblock: new RegExp('^(' + abCfg.aliases.unblock.join('|') + ')$', 'i')
	};

	// Collect block links and create an array of objects
	/**
	 * E.g. 'ja.wikipedia.org'. Used to find project-internal links.
	 * @readonly
	 */
	var host = mw.config.get('wgServer').replace(/^\/\//, '');
	var linkCnt = 0;
	/**
	 * Milliseconds from the epoch when the logo is appended.
	 * @type {number}
	 */
	var timeLogoAppended;
	/**
	 * An array of the names of users whose block status needs to be fetched from the API.
	 * @type {string[]}
	 * @readonly
	 */
	var blockCheck = [];
	/**
	 * @type {AjaxBlockLinkInfo[]}
	 * @readonly
	 */
	var blockLinks = Array.prototype.reduce.call(
		content.getElementsByTagName('a'),
		/**
		 * @param {AjaxBlockLinkInfo[]} acc
		 * @param {HTMLAnchorElement} a
		 */
		function(acc, a) {

			// Get href
			var href = a.href;
			if (!href) return acc;

			// Create a mw.Uri instance
			var /** @type {mw.Uri} */ uri;
			try {
				uri = new mw.Uri(href, {overrideKeys: true});
			}
			catch (err) {
				console.warn(
					[err.name, err.message].filter(function(el) { return el; }).join(': '),
					a
				);
				return acc;
			}
			if (uri.host !== host) return acc; // Look at project-internal links only

			// Get pagetitle from the URI
			var /** @type {RegExpExecArray?} */ m,
				/** @type {string} */ pagetitle;
			if (uri.path === mw.config.get('wgScript')) { // /w/index.php
				pagetitle = (typeof uri.query.title === 'string' ? uri.query.title : '').trim().replace(/ /g, '_'); // ?title=
			} else if ((m = regex.article.exec(uri.path))) { // /wiki/($1)
				pagetitle = decodeURIComponent((m[1] || '').trim().replace(/ /g, '_')); // $1
			} else {
				return acc;
			}

			// Check the URI to see if it's for block/unblock
			var /** @type {string} */ username,
				/** @type {AjaxBlockLinkTypes} */ linktype;
			if ((m = regex.special.exec(pagetitle))) {
				if (regex.block.test(m[1])) {
					linktype = 'block';
				} else if (regex.unblock.test(m[1])) {
					linktype = 'unblock';
				} else {
					return acc;
				}
				username = (typeof uri.query.wpTarget === 'string' ? m[2] : ''); // wpTarget overrides the username specified in 'Special:Block/USERNAME'
			} else {
				return acc;
			}

			// Verify username
			var /** @type {AjaxBlockUserTypes} */ usertype,
				/** @type {string=} */ id;
			if (!username) {
				a.classList.add('ab-blocklink-invalid');
				return acc;
			} else if (/^#\d+$/.test(username)) { // Unblock by ID
				if (linktype !== 'unblock') {
					a.classList.add('ab-blocklink-invalid');
					return acc;
				} else {
					id = username;
					usertype = 'user'; // Just a temporary value, never used
				}
			} else if (mw.util.isIPAddress(username, true)) { // The block target is an IP or CIDR
				usertype = 'ip';
				if (mw.util.isIPv6Address(username, true)) {
					username = username.toUpperCase(); // Capitalize IPv6
				}
			} else if (/[@/#<>[\]|{}:]/.test(username)) { // The block target is a registered user but contains an invalid character
				a.classList.add('ab-blocklink-invalid');
				return acc;
			} else {
				usertype = 'user';
			}
			if (!id && blockCheck.indexOf(username) === -1) {
				blockCheck.push(username);
			}

			// Parse query parameters
			/** @type {XOR<AjaxBlockDialogOptionsBlock,AjaxBlockDialogOptionsUnblock>?} */
			var query;
			if (linktype === 'block') {
				query = Object.keys(uri.query).reduce(/** @param {AjaxBlockDialogOptionsBlock} acc */ function(acc, key) {
					/** @type {string?} */
					// @ts-ignore
					var val = uri.query[key];
					if (!val) {
						return acc;
					}
					switch (key) {
						case 'wpReason':
							if (val !== 'other') {
								if (acc.reason) {
									acc.reason = val + ': ' + acc.reason;
								} else {
									acc.reason = val;
								}
							}
							break;
						case 'wpReason-other':
							if (acc.reason) {
								acc.reason += val;
							} else {
								acc.reason = val;
							}
							break;
						case 'wpExpiry':
							acc.expiry = forceInfinity(val);
							break;
						case 'wpCreateAccount':
							acc.nocreate = stringToPHPBoolean(val);
							break;
						case 'wpDisableEmail':
							acc.noemail = stringToPHPBoolean(val);
							break;
						case 'wpDisableUTEdit':
							acc.allowusertalk = !stringToPHPBoolean(val);
							break;
						case 'wpHardBlock':
							acc.anononly = !stringToPHPBoolean(val);
							break;
						case 'wpAutoBlock':
							acc.autoblock = stringToPHPBoolean(val);
							break;
						case 'wpHideUser':
							if (abCfg.rights.oversight) {
								acc.hidden = stringToPHPBoolean(val);
							}
							break;
						case 'wpEditingRestriction':
							acc.partial = val === 'partial';
							break;
						case 'wpPageRestrictions':
							if (!acc.restrictions) acc.restrictions = {};
							acc.restrictions.pages = val.split('\n').map(function(p) {
								return {title: p.trim()};
							});
							break;
						case 'wpNamespaceRestrictions':
							if (!acc.restrictions) acc.restrictions = {};
							acc.restrictions.namespaces = val.split('\n');
							break;
						case 'wpWatch':
							acc.watchlist = stringToPHPBoolean(val);
							break;
						default:
					}
					return acc;
				}, Object.create(null));
				if ($.isEmptyObject(query)) {
					query = null;
				} else {
					var isUser = usertype === 'user';
					query = $.extend( // Supplement missing properties
						{
							user: '',
							reason: '',
							expiry: '',
							automatic: false,
							nocreate: true,
							noemail: false,
							allowusertalk: true,
							anononly: !isUser,
							autoblock: isUser,
							hidden: false,
							partial: false,
							restrictions: {},
							watchlist : false,
							watchlistexpiry: 'infinity'
						},
						query
					);
				}
			} else { // Unblock
				query = Object.keys(uri.query).reduce(/** @param {AjaxBlockDialogOptionsUnblock} acc */ function(acc, key) {
					/** @type {string?} */
					// @ts-ignore
					var val = uri.query[key];
					if (!val) return acc;
					switch (key) {
						case 'wpReason':
							acc.reason = val;
							break;
						case 'wpWatch':
							acc.watchlist = stringToPHPBoolean(val);
							break;
						default:
					}
					return acc;
				}, Object.create(null));
				if ($.isEmptyObject(query)) {
					query = null;
				} else {
					query = $.extend( // Supplement missing properties
						{
							reason: '',
							watchlist : false,
							watchlistexpiry: 'infinity'
						},
						query
					);
				}
			}

			// Create object and push it into the array
			a.classList.add('ab-blocklink');
			a.dataset.ajaxblock = (linkCnt++).toString(); // Index of this object in the array
			acc.push({
				anchor: a,
				username: username,
				usertype: usertype,
				linktype: linktype,
				id: id,
				query: query
			});

			if (!logo) { // When a first block link is found, show a logo to let the user know that the script is being loaded
				logo = document.createElement('img');
				logo.src = '//upload.wikimedia.org/wikipedia/commons/6/69/AjaxBlock_logo.svg';
				$.extend(logo.style, {
					position: 'fixed',
					bottom: '2em',
					right: '2em',
					height: '3em'
				});
				document.body.appendChild(logo);
				timeLogoAppended = mw.now();
			}
			return acc;

		},
		[]
	);

	// Stop running the script if there's no (un)block links that can be processed via the dialog
	if (!blockLinks.length) {
		return;
	}

	// Create dialog
	if (!abDialog) {
		if (document.querySelector('.ab-dialog')) {
			mw.notify(msg['error-multiplecalls'], {type: 'warn'});
		}
		abDialog = new ABDialog(blockLinks);
	} else {
		abDialog.info = blockLinks;
	}

	// Add AJAX functionalities to the anchors
	/**
	 * @param {MouseEvent} e
	 * @this {HTMLAnchorElement}
	 */
	var linkAction = function(e) {

		e.preventDefault();
		// @ts-ignore
		abDialog.setIndex(this.dataset.ajaxblock);

		if (e.shiftKey && e.ctrlKey) { // One click, suppress warnings
			abDialog.execute(true);
		} else if (e.shiftKey) { // One click
			abDialog.execute(false);
		} else if (e.ctrlKey) { // Open link on a new tab
			window.open(this.href, '_self');
		} else { // Open dialog
			abDialog.open();
		}

	};
	blockLinks.forEach(function(obj) {
		obj.anchor.addEventListener('click', linkAction);
	});

	// Get the block status of users associated with the collected links
	getBlockStatus(blockCheck).then(function(resObj) {

		if (timeLogoAppended !== undefined) { // Now the script is fully ready; remove the loading logo
			// Ensure that some time has passed since the logo was appended, to prevent flickering effects
			var waitFor = 1000 - (mw.now() - timeLogoAppended);
			setTimeout(function() {
				logo.remove();
			}, Math.max(waitFor, 0));
		} else {
			logo.remove();
		}
		abDialog.blocks = resObj;

		// If the dialog is already open, update dialog contents
		if (abDialog.isOpen()) {
			abDialog.evalBlocked();
			abDialog.setButtons();
		}

	});

}

/**
 * Evaluate an expiry value and if it's a value equivalent to 'infinity', return 'infinity'.
 * This is to prevent the code from interpreting 'infinity', indefinite', 'infinite', and 'never'
 * as different expiration times.
 * @param {string} val
 * @returns {string}
 */
function forceInfinity(val) {
	switch (val) {
		case 'infinity':
		case 'indefinite':
		case 'infinite':
		case 'never':
			return 'infinity';
		default:
			return val;
	}
}

/**
 * Convert a string value to a PHP boolean value.
 * @param {string} str
 * @returns {boolean}
 */
function stringToPHPBoolean(str) {
	return ['', '0', 'false'].indexOf(str) === -1; // True if the str matches none of the elements
}

/**
 * Object that stores the block status of users.
 * @typedef BlockInfo
 * @type {Object.<string, ApiResponseQueryListBlocks>} username-object pairs
 */
/**
 * Get the block status of given users.
 * @param {string[]} usersArr
 * @returns {JQueryPromise<BlockInfo>} username-object pairs
 */
function getBlockStatus(usersArr) {

	/** @type {BlockInfo} */
	var blocked = {};

	if (!usersArr.length) {
		return $.Deferred().resolve(blocked);
	}

	/**
	 * Query the block status of given users.
	 * @param {string[]} users
	 * @returns {JQueryPromise<void>}
	 */
	var query = function(users) {
		return api.post({ // This must be a POST request because a GET request may return a '404 URL too long' error
			action: 'query',
			list: 'blocks',
			bkusers: users.join('|'), // This is the long part, 500 usernames at maximum
			bklimit: 'max',
			bkprop: 'user|by|expiry|reason|flags|restrictions',
			formatversion: '2'
		}).then(function(res) {

			/** @type {ApiResponseQueryListBlocks[]} */
			var resBlck;
			if (!res || !res.query || !(resBlck = res.query.blocks) || !resBlck.length) return;

			resBlck.forEach(function(obj) {
				var user = obj.user.replace(/ /g, '_');
				if (obj.restrictions.namespaces) {
					// This array must be of string-type elements for the use with Array.join (though
					// not strictly neccesary because the join method casts numbers to strings).
					obj.restrictions.namespaces = obj.restrictions.namespaces.map(function(num) {
						return num.toString();
					});
				}
				blocked[user] = obj;
			});

		}).catch(function(code, err) {
			console.error(abCfg.script, err);
		});
	};

	usersArr = usersArr.slice(); // Deep copy
	var deferreds = [];
	while (usersArr.length) {
		deferreds.push(query(usersArr.splice(0, 500)));
	}
	return $.when.apply($, deferreds).then(function() {
		return blocked;
	});

}

/**
 * ABDialog class. Creates a dialog and handles both block and unblock links.
 * @class
 * @constructor
 * @param {AjaxBlockLinkInfo[]} info
 */
function ABDialog(info) {

	var self = this;

	/** @type {AjaxBlockLinkInfo[]} */
	this.info = info;

	/** @type {BlockInfo} */
	this.blocks = {};

	/**
	 * The index number of the info array. Registered on each AB anchor as 'data-ajaxblock'.
	 * A value must set when the dialog is opened for a given user.
	 * @type {string}
	 */
	this.index = '';

	/** @type {HTMLDivElement} */
	var dialog = document.createElement('div');
	dialog.title = abCfg.script;

	// Block options for registered users
	var boUserWrapper = document.createElement('div');
	boUserWrapper.innerHTML = '<h2>' + msg['dialog-heading-block'] + '</h2>';
	dialog.appendChild(boUserWrapper);
	/** @type {HTMLDivElement} */
	this.boUserWrapper = boUserWrapper;

	var boUser = new BlockOptions(boUserWrapper);
	boUser.setUserType('user');
	/** @type {BlockOptions} */
	this.boUser = boUser;

	// Block options for IP users
	var boIpWrapper = document.createElement('div');
	boIpWrapper.innerHTML = '<h2>' + msg['dialog-heading-block'] + '</h2>';
	dialog.appendChild(boIpWrapper);
	/** @type {HTMLDivElement} */
	this.boIpWrapper = boIpWrapper;

	var boIp = new BlockOptions(boIpWrapper);
	boIp.setUserType('ip');
	/** @type {BlockOptions} */
	this.boIp = boIp;

	// Unblock options
	var uboWrapper = document.createElement('div');
	uboWrapper.innerHTML = '<h2>' + msg['dialog-heading-unblock'] + '</h2>';
	dialog.appendChild(uboWrapper);
	/** @type {HTMLDivElement} */
	this.uboWrapper = uboWrapper;

	var ubo = new UnblockOptions(uboWrapper);
	/** @type {UnblockOptions} */
	this.ubo = ubo;

	// Set preset options. This is neccesary because (un)block may be performed right after opening the page
	// without opening the dialog beforehand.
	boUser.setData(abCfg.preset.block.user);
	boIp.setData(abCfg.preset.block.ip);
	ubo.setData(abCfg.preset.unblock);
	setAutocompleteSource([boUser.reasonCInput, boIp.reasonCInput]);

	// A warning shown when the user is already blocked and there's a need to overwrite the block
	var overwriteWarning = document.createElement('div');
	overwriteWarning.appendChild(document.createTextNode(msg['dialog-overwritewarning']));
	overwriteWarning.style.color = 'red';
	overwriteWarning.style.fontWeight = 'bold';
	overwriteWarning.style.margin = '0.1em 0';
	dialog.appendChild(overwriteWarning);
	/** @type {HTMLDivElement} */
	this.overwriteWarning = overwriteWarning;

	// A notice shown when the associated anchor has query parameters
	var queryParamsNote = document.createElement('div');
	queryParamsNote.innerHTML = '<b>' + msg['dialog-hasqueryparams'] + '</b>';
	queryParamsNote.style.margin = '0.1em 0';
	dialog.appendChild(queryParamsNote);
	/** @type {HTMLDivElement} */
	this.queryParamsNote = queryParamsNote;

	var queryParamsBtn = document.createElement('a');
	queryParamsBtn.type = 'button';
	queryParamsBtn.textContent = msg['dialog-hasqueryparams-get'];
	queryParamsBtn.addEventListener('click', function() {
		self.applyQueryParams();
	});
	$(queryParamsNote).find('.ab-replaceme').replaceWith(queryParamsBtn);

	var $dialog = $(dialog);
	/** @type {JQuery<HTMLDivElement>} */
	this.$dialog = $dialog;

	// 'Dialogize' the div
	var firstOpenForBlock = true;
	this.$dialog.dialog({
		dialogClass: 'ab-dialog',
		resizable: false,
		height: 'auto',
		width: 'auto',
		modal: true,
		autoOpen: false,
		position: {
			my: 'center center',
			at: 'center center-5%',
			of: window
		},
		open: function() { // Initialize dialog designs when first opened for block
			if (firstOpenForBlock && self.getInfo().linktype === 'block') {
				firstOpenForBlock = false;
				boUser.initPartialDetails();
				boIp.initPartialDetails();
				var dropdownWidth = $(boUser.reason1Dropdown).outerWidth() + 'px';
				[boUser.usernameCell, boIp.usernameCell, ubo.usernameCell].forEach(function(el) {
					el.style.maxWidth = dropdownWidth;
				});
				var tableWith = $dialog.find('.ab-table:visible').outerWidth() + 'px';
				overwriteWarning.style.maxWidth = tableWith;
				queryParamsNote.style.maxWidth = tableWith;
			}
		}
	});

}

/**
 * Check whether the AjaxBlock dialog is open.
 * @returns {boolean}
 * @method
 */
ABDialog.prototype.isOpen = function() {
	return this.$dialog.dialog('isOpen');
};

/**
 * Set an index to the class and toggle content visibility. This method must be called before any procedure that retrieves dialog options.
 * @param {string} index anchor.dataset.ajaxblock
 * @returns {void}
 */
ABDialog.prototype.setIndex = function(index) {

	// Set index
	this.index = index;
	var info = this.getInfo();

	// Set username
	[this.boUser.usernameCell, this.boIp.usernameCell, this.ubo.usernameCell].forEach(function(el) {
		el.textContent = info.username;
	});

	// Toggle content visibility
	if (info.linktype === 'unblock') {
		this.boUserWrapper.hidden = true;
		this.boIpWrapper.hidden = true;
		this.uboWrapper.hidden = false;
		this.ubo.watchuser.wrapper.hidden = !!info.id;
	} else if (info.usertype === 'user') {
		this.boUserWrapper.hidden = false;
		this.boIpWrapper.hidden = true;
		this.uboWrapper.hidden = true;
	} else { // info.usertype === 'ip'
		this.boUserWrapper.hidden = true;
		this.boIpWrapper.hidden = false;
		this.uboWrapper.hidden = true;
	}
	this.queryParamsNote.hidden = !info.query;

	// Toggle overwrite warning visibility
	this.evalBlocked();

	// Set dialog buttons
	this.setButtons();

};

/**
 * Get a link information object associated with an anchor based on the currently specified index.
 * @returns {AjaxBlockLinkInfo}
 * @method
 */
ABDialog.prototype.getInfo = function() {
	return this.info[this.index];
};

/**
 * Evaluate whether the user associated with the current index is blocked, and show/hide the overwrite warning.
 * @returns {boolean}
 * @method
 */
ABDialog.prototype.evalBlocked = function() {
	var info = this.getInfo();
	var blocked = !!this.blocks[info.username];
	if (info.linktype === 'block') {
		this.overwriteWarning.hidden = !blocked;
	} else {
		this.overwriteWarning.hidden = true;
	}
	return blocked;
};

/**
 * Change dialog buttons in accordance with the current index.
 * @method
 */
ABDialog.prototype.setButtons = function() {

	var self = this;
	var info = this.getInfo();
	var isBlock = info.linktype === 'block';

	/** @type {JQueryUI.DialogButtonOptions[]} */
	var buttons = [{
		// Block/Unblock button
		text: isBlock ? msg['dialog-button-block'] : msg['dialog-button-unblock'],
		click: function(e) {
			self.execute(e.shiftKey && e.ctrlKey); // Suppress-warnings functionality also for the dialog button
		}
	}];
	if (isBlock) {
		buttons.push({
			// 'Set preset' button
			text: msg['dialog-button-preset'],
			click: function() {
				if (info.linktype === 'unblock') {
					self.ubo.setData(abCfg.preset.unblock);
				} else if (info.usertype === 'user') {
					self.boUser.setData(abCfg.preset.block.user);
				} else {
					self.boIp.setData(abCfg.preset.block.ip);
				}
			}
		});
		if (this.blocks[info.username]) { // Show this button only when the relevant user is blocked
			// 'Get the current block settings' button
			buttons.push({
				text: msg['dialog-button-currentblock'],
				click: function() {
					if (info.usertype === 'user') {
						self.boUser.setData($.extend(
							{watchlist: self.boUser.watchuser.box.checked, watchlistexpiry: self.boUser.watchuserExpiry.value},
							self.blocks[info.username]
						));
					} else {
						self.boIp.setData($.extend(
							{watchlist: self.boIp.watchuser.box.checked, watchlistexpiry: self.boIp.watchuserExpiry.value},
							self.blocks[info.username]
						));
					}
				}
			});
		}
		buttons.push({
			// 'Reset options' button
			text: msg['dialog-button-reset'],
			click: function() {
				if (info.linktype === 'unblock') {
					self.ubo.setData({
						reason: '',
						watchlist: false,
						watchlistexpiry: 'infinity'
					});
				} else {
					var bo = info.usertype === 'user' ? self.boUser : self.boIp;
					bo.setData({
						user: info.username,
						expiry: '',
						reason: '',
						automatic: false,
						anononly: true,
						nocreate: false,
						autoblock: false,
						noemail: false,
						hidden: false,
						allowusertalk: true,
						partial: false,
						restrictions: {},
						watchlist: false,
						watchlistexpiry: 'infinity'
					});
				}
			}
		});
	}
	buttons.push({
		// 'Close dialog' button
		text: msg['dialog-button-close'],
		click: function() {
			self.close();
		}
	});

	// Set the buttons
	this.$dialog.dialog({buttons: buttons});

};

/**
 * Open the dialog in accordance with the current index.
 * @method
 */
ABDialog.prototype.open = function() {
	this.$dialog.dialog('open');
};

/**
 * Close the dialog. If there's some problem with partial block options, closure doesn't take place.
 * If there's no need to check the options, directly call the dialog method.
 * ```
 * this.$dialog.dialog('close');
 * ```
 * This also means that what this method does shouldn't be hooked up to the beforeClose event.
 * @method
 */
ABDialog.prototype.close = function() {
	var info = this.getInfo();
	if (info.linktype === 'unblock') {
		this.$dialog.dialog('close');
		return;
	}
	var bo = info.usertype === 'user' ? this.boUser : this.boIp;
	var page$1 = msg['options-checkbox-partial'] + ' > ' + msg['options-partial-pages-label'];
	var namespace$1 = msg['options-checkbox-partial'] + ' > ' + msg['options-partial-namespaces-label'];
	var ptl = bo.evalPartialBlockOptions(page$1, namespace$1);
	if (ptl.pages.set.length <= 10 && !ptl.pages.removed.length && !ptl.namespaces.removed.length) {
		this.$dialog.dialog('close');
	}
};

/**
 * Set options in accordance with the query params.
 * @method
 */
ABDialog.prototype.applyQueryParams = function() {
	var info = this.getInfo();
	if (info.query) {
		if (info.linktype === 'unblock') {
			this.ubo.setData(info.query);
		} else if (info.usertype === 'user') {
			// @ts-ignore
			this.boUser.setData(info.query);
		} else {
			// @ts-ignore
			this.boIp.setData(info.query);
		}
	}
};

/**
 * Parameters for action=block.
 * @typedef ApiBlockParams
 * @type {object}
 * @property {"block"} action
 * @property {string} user User to block.
 * @property {string} expiry Expiry time. (Default: never)
 * @property {string} reason Reason for block.
 * @property {boolean} nocreate Prevent account creation.
 * @property {boolean} noemail Prevent user from sending email through the wiki.
 * @property {boolean} allowusertalk Allow the user to edit their own talk page.
 * @property {boolean=} anononly Block anonymous users only.
 * @property {boolean=} autoblock Automatically block the last used IP address, and any subsequent IP addresses they try to login from.
 * @property {boolean=} hidename Hide the username from the block log.
 * @property {boolean} partial Block user from specific pages or namespaces rather than the entire site.
 * @property {string=} pagerestrictions List of titles to block the user from editing. Only applies when partial is set to true.
 * @property {string=} namespacerestrictions List of namespace IDs to block the user from editing. Only applies when partial is set to true.
 * @property {boolean} watchuser Watch the user's or IP address's user and talk pages.
 * @property {string=} watchlistexpiry Watchlist expiry timestamp. Omit this parameter entirely to leave the current expiry unchanged.
 * @property {boolean} reblock If the user is already blocked, overwrite the existing block.
 * @property {"2"} formatversion
 */
/**
 * Parameters for action=unblock.
 * @typedef ApiUnblockParams
 * @type {object}
 * @property {"unblock"} action
 * @property {string=} id ID of the block to unblock. Cannot be used together with 'user'.
 * @property {string=} user User to unblock. Cannot be used together with 'id'.
 * @property {string} reason Reason for unblock.
 * @property {boolean} watchuser Watch the user's or IP address's user and talk pages.
 * @property {string=} watchlistexpiry Watchlist expiry timestamp. Omit this parameter entirely to leave the current expiry unchanged.
 * @property {"2"} formatversion
 */
/**
 * Get parameters for an API request. The index must be set beforehand.
 * @param {boolean} suppressWarnings
 * @returns {JQueryPromise<XOR<ApiBlockParams,ApiUnblockParams>|undefined>}
 * @method
 */
ABDialog.prototype.getParams = function(suppressWarnings) {

	if (this.index === '') {
		throw new Error(abCfg.script + ': Index is not set.');
	}
	var info = this.getInfo();
	var isUser = info.usertype === 'user';
	var isBlock = info.linktype === 'block';
	var target = info.username;
	/** @type {AjaxBlockActions} */
	var warningType = this.isOpen() ? 'dialog' : 'oneclick';

	// Collect (un)block options from the dialog
	/** @type {XOR<AjaxBlockDialogOptionsBlock,AjaxBlockDialogOptionsUnblock>} */
	var data;
	var page$1 = msg['options-checkbox-partial'] + ' > ' + msg['options-partial-pages-label'];
	var namespace$1 = msg['options-checkbox-partial'] + ' > ' + msg['options-partial-namespaces-label'];
	if (isBlock) {
		var bo = isUser ? this.boUser : this.boIp;
		// Stop the procedure if there's some problem with the partial block settings
		var ptl = bo.evalPartialBlockOptions(page$1, namespace$1);
		if (ptl.pages.set.length > 10 || ptl.pages.removed.length || ptl.namespaces.removed.length) {
			if (!this.isOpen()) {
				this.open();
			}
			return $.Deferred().resolve();
		}
		data = bo.getData(ptl.pages.set, ptl.namespaces.set);
	} else { // Unblock
		data = this.ubo.getData();
	}

	// Create a warning message div
	var w = abCfg.warning;
	var wDialog = document.createElement('div');
	var top = document.createElement('span');
	top.style.cssText = 'display: block; margin: 0.5em 0;';
	top.innerHTML = mw.format(
		isBlock ? msg['warning-confirm-opening-block'] : msg['warning-confirm-opening-unblock'],
		target
	);
	wDialog.appendChild(top);
	if (!suppressWarnings) { // Add checkboxes when there's something that should be warned
		if (w[warningType].noReason && !data.reason) {
			createCheckbox(wDialog, msg['warning-confirm-noreason']);
		}
		if (w[warningType].noExpiry && isBlock && !data.expiry) {
			createCheckbox(wDialog, msg['warning-confirm-noexpiry']);
		}
		if (w[warningType].noPartialSpecs && isBlock && data.partial && !data.restrictions.pages && !data.restrictions.namespaces) {
			createCheckbox(wDialog, msg['warning-confirm-nopartialspecs']);
		}
		if (w[warningType].willHardblock && isBlock && !data.anononly) {
			createCheckbox(wDialog, msg['warning-confirm-hardblock']);
		}
		if (w[warningType].willHideUser && isBlock && data.hidden) {
			createCheckbox(wDialog, msg['warning-confirm-hideuser']);
		}
		if (w[warningType].willOverwrite && isBlock && this.blocks[target]) {
			createCheckbox(wDialog, msg['warning-confirm-overwrite']);
		}
		var query = info.query;
		if (w[warningType].willIgnorePredefined && query && !Object.keys(query).every( // If any option is different
			/**
			 * @param {keyof AjaxBlockDialogOptionsBlock|keyof AjaxBlockDialogOptionsUnblock} key
			 */
			// @ts-ignore
			function(key) {
				// @ts-ignore 'query' isn't null.
				var val = query[key]; // Predefined settings
				var val2 = data[key]; // Actual dialog settings
				if (['user', 'watchlistexpiry'].indexOf(key) !== -1) {
					return true;
				} else if (typeof val === 'object') { // 'restrictions' - this is the only property that is of type object
					if ($.isEmptyObject(val) && $.isEmptyObject(val2)) {
						return true; // If both objects are empty, the user settings and predefined settings are the same
					} else {
						return Object.keys(val).every(function(restKey) {
							// @ts-ignore Type of val2 isn't "string|boolean|ApiResponseQueryListBlocksRestrictions|undefined" but the third
							if (!val2[restKey]) { // Query params have a 'pages' or 'namespces' property but partial block options don't
								return false; // Settings are different
							} else if (restKey === 'pages') {
								return arraysEqual(
									// @ts-ignore
									val[restKey].map(function(obj) { return obj.title; }),
									// @ts-ignore
									val2[restKey].map(function(obj) { return obj.title; }),
									true
								);
							} else { // namespaces
								// @ts-ignore
								return arraysEqual(val[restKey], val2[restKey], true);
							}
						});
					}
				} else {
					return val === val2;
				}
			})
		) {
			createCheckbox(wDialog, msg['warning-confirm-ignorepredefined']);
		}
		// @ts-ignore
		if (w[warningType].willBlockSelf && target === mw.config.get('wgUserName').replace(/ /g, '_')) {
			createCheckbox(wDialog, msg['warning-confirm-blockself']);
		}
		if (w[warningType].willUnblock && !isBlock) {
			createCheckbox(wDialog, msg['warning-confirm-unblock']);
		}
		var bottom = document.createElement('span');
		bottom.style.cssText = 'display: block; margin: 0.5em 0;';
		bottom.innerHTML = msg['warning-confirm-closing'];
		wDialog.appendChild(bottom);
	}

	// Return params after warning confirmation
	var self = this;
	return this.boxConfirm(wDialog).then(function(bool) {

		if (!bool) { // The warnings weren't confirmed
			return;
		} else if (typeof data.nocreate === 'boolean') { // Block
			return {
				action: 'block',
				user: target,
				expiry: data.expiry,
				reason: data.reason,
				nocreate: data.nocreate,
				noemail: data.noemail,
				allowusertalk: data.allowusertalk,
				anononly: !isUser ? data.anononly : undefined,
				autoblock: isUser ? data.autoblock : undefined,
				hidename: isUser && abCfg.rights.oversight ? data.hidden : undefined,
				partial: data.partial,
				pagerestrictions: data.partial && data.restrictions.pages ? data.restrictions.pages.map(function(obj) { return obj.title; }).join('|') : undefined,
				namespacerestrictions: data.partial && data.restrictions.namespaces ? data.restrictions.namespaces.join('|') : undefined,
				watchuser: data.watchlist,
				watchlistexpiry: data.watchlist ? data.watchlistexpiry : undefined,
				reblock: !!self.blocks[target],
				formatversion: '2'
			};
		} else { // Unblock
			return {
				action: 'unblock',
				id: info.id ? info.id.replace(/^#/, '') : undefined,
				user: info.id ? undefined : target,
				reason: data.reason,
				watchuser: info.id ? false : data.watchlist,
				watchlistexpiry: info.id ? undefined : data.watchlist ? data.watchlistexpiry : undefined,
				formatversion: '2'
			};
		}

	});

};

/**
 * Show a confirm dialog and return a boolean value. True is returned if the user has checked all the boxes on the dialog
 * and pressed 'Proceed', or if the dialog doesn't contain any checkbox. This method internally appends a checkbox labelled
 * 'open the main dialog on cancellation'.
 * @param {HTMLDivElement} dialog
 * @returns {JQueryPromise<boolean>}
 * @method
 */
ABDialog.prototype.boxConfirm = function(dialog) {
	var def = $.Deferred();

	if (this.index === '') {
		throw new Error(abCfg.script + ': Index is not set.');
	}
	if (!dialog.querySelector('input[type="checkbox"]')) { // Dialog doesn't have any checkbox
		return def.resolve(true); // Return true
	}
	var openDialog;
	if (!this.isOpen()) { // Add an 'open the main dialog on cancellation' checkbox only when the dialog isn't open
		dialog.appendChild(document.createElement('hr'));
		openDialog = createCheckbox(dialog, msg['warning-confirm-dialog-open']);
		openDialog.box.checked = true;
		openDialog.wrapper.style.margin = '0.5em 0';
	}

	var self = this;
	var bool = false;
	dialog.title = abCfg.script + ' - Confirm';
	var $dialog = $(dialog);
	$dialog.dialog({
		dialogClass: 'ab-dialog-confirm',
		resizable: false,
		height: 'auto',
		width: 'auto',
		minWidth: 500,
		modal: true,
		position: {
			my: 'center center',
			at: 'center center-5%',
			of: window
		},
		buttons: [
			{
				text: msg['warning-confirm-dialog-proceed'],
				click: function() {
					bool = true;
					$(this).dialog('close');
				}
			},
			{
				text: msg['warning-confirm-dialog-cancel'],
				click: function() {
					$(this).dialog('close');
				}
			}
		],
		close: function() {
			var allChecked = Array.prototype.every.call(dialog.querySelectorAll('input[type="checkbox"]'), /** @param {HTMLInputElement} box */ function(box) {
				return box.checked;
			});
			if (bool && allChecked) { // Return true when 'Proceed' is hit and all the boxes are checked
				def.resolve(true);
			} else if (bool && !allChecked) { // Force-cancel and return false when 'Proceed' is hit but some box isn't checked
				mw.notify(msg['warning-confirm-dialog-forcecancelled'], {type: 'warn'});
				if (openDialog && openDialog.box.checked) {
					self.open();
				}
				def.resolve(false);
			} else { // Return false when 'Cancel' is simply hit
				mw.notify(msg['warning-confirm-dialog-cancelled']);
				if (openDialog && openDialog.box.checked) {
					self.open();
				}
				def.resolve(false);
			}
			$dialog.dialog('destroy').remove();
		}
	});

	return def.promise();
};

/**
 * Block or unblock a user.
 * @param {boolean} suppressWarnings
 * @method
 */
ABDialog.prototype.execute = function(suppressWarnings) {

	var self = this;
	var info = this.getInfo();
	var username = info.username;
	var linktype = info.linktype;
	var isBlock = linktype === 'block';
	var progress = {
		done: isBlock ? msg['progress-block-done'] : msg['progress-unblock-done'],
		failed: isBlock ? msg['progress-block-failed'] : msg['progress-unblock-failed']
	};

	this.getParams(suppressWarnings).then(function(params) {

		if (!params) {
			return;
		}
		self.$dialog.dialog('close'); // Not using the method to bypass unnecessary procedures

		// Replace (un)block links with a spinner icon
		/**
		 * Array indexes of the object containing an anchor that's being processed
		 * @type {number[]}
		 */
		var indexes = [];
		var spans = self.info.reduce(/** @param {HTMLSpanElement[]} acc */ function(acc, obj, i) {
			if (obj === null) {
				return acc;
			}
			if (obj.linktype === linktype && obj.username === username) {
				var a = obj.anchor;
				/** @type {HTMLSpanElement?} */
				var pr = a.parentElement;
				if (pr && pr.nodeName === 'SPAN' && pr.childElementCount === 1) { // If the parent is a span tag and this anchor is its only child
					pr.replaceChildren(getIcon('doing')); // Replace the anchor with a spinner
					acc.push(pr);
				} else { // If the parent isn't a span, just replace the anchor with a newly-created span containing a spinner
					var span = document.createElement('span');
					span.appendChild(getIcon('doing'));
					a.replaceWith(span);
					acc.push(span);
				}
				indexes.push(i);
			}
			return acc;
		}, []);

		// API request
		// @ts-ignore
		api.postWithToken('csrf', params)
			.then(function() { // Success
				spans.forEach(function(sp) {
					sp.classList.add('ab-blocklink-resolved');
					sp.innerHTML =
						'[<span style="background-color: lightgreen;">' +
							progress.done +
						'</span>]';
				});
			})
			.catch(function(code, err) { // Failure
				console.warn(abCfg.script, err);
				spans.forEach(function(sp) {
					sp.classList.add('ab-blocklink-resolved');
					sp.innerHTML =
						'[<span style="background-color: lightpink;">' +
							progress.failed + ' (' + code + ')' +
						'</span>]';
				});
			})
			.then(function() { // Always
				// Update info array
				indexes.forEach(function(i) {
					// @ts-ignore
					self.info[i] = null;
				});
			});

	});
};

/**
 * Check the equation of two arrays.
 * @param {(boolean|string|number|undefined|null)[]} array1
 * @param {(boolean|string|number|undefined|null)[]} array2
 * @param {boolean} [orderInsensitive] If true, ignore the order of elements
 * @returns {boolean}
 */
function arraysEqual(array1, array2, orderInsensitive) {
	if (orderInsensitive) {
		return array1.length === array2.length && array1.every(function(el) {
			return array2.indexOf(el) !== -1;
		});
	} else {
		return array1.length === array2.length && array1.every(function(el, i) {
			return array2[i] === el;
		});
	}
}

// *********************************************************************************************************************

// Run the script
init();

// *********************************************************************************************************************
})();

/**
 * The keys of the message object storing AjaxBlock's interface messages.
 * @typedef {object} AjaxBlockMessages
 * @property {string} options-username-label The label of the username field.
 * @property {string} options-reason1-label The label of the first block reason dropdown.
 * @property {string} options-reason2-label The label of the second block reason dropdown.
 * @property {string} options-otherreason The display text of the 'other' option in the block reason dropdowns.
 * @property {string} options-userdefined The display text of the 'user-defined' optgroup in the block reason dropdowns.
 * @property {string} options-reasonC-placeholder The placeholder of the custom block reason textbox.
 * @property {string} options-reason-label The label of the unblock reason textbox.
 * @property {string} options-suffix-label The label of the 'suffix' dropdown, relevant to global users.
 * @property {string} options-suffix-none The display text of the 'none' option in the suffix dropdown.
 * @property {string} options-expiry-label The label of the block expiry dropdown.
 * @property {string} options-expiry-other The display text of the 'other' option in the block expiry dropdown.
 * @property {string} options-expiry-indefinite The display text of the 'indefinite' option in the block expiry dropdown.
 * @property {string} options-expiry-1hour The display text of the '1 hour' option in the block expiry dropdown.
 * @property {string} options-expiry-2hours The display text of the '2 hours' option in the block expiry dropdown.
 * @property {string} options-expiry-1day The display text of the '1 day' option in the block expiry dropdown.
 * @property {string} options-expiry-31hours The display text of the '31 hours' option in the block expiry dropdown.
 * @property {string} options-expiry-2days The display text of the '2 days' option in the block expiry dropdown.
 * @property {string} options-expiry-3days The display text of the '3 days' option in the block expiry dropdown.
 * @property {string} options-expiry-1week The display text of the '1 week' option in the block expiry dropdown.
 * @property {string} options-expiry-2weeks The display text of the '2 weeks' option in the block expiry dropdown.
 * @property {string} options-expiry-1month The display text of the '1 month' option in the block expiry dropdown.
 * @property {string} options-expiry-3months The display text of the '3 months' option in the block expiry dropdown.
 * @property {string} options-expiry-6months The display text of the '6 months' option in the block expiry dropdown.
 * @property {string} options-expiry-1year The display text of the '1 year' option in the block expiry dropdown.
 * @property {string} options-expiry-2years The display text of the '2 years' option in the block expiry dropdown.
 * @property {string} options-expiry-3years The display text of the '3 years' option in the block expiry dropdown.
 * @property {string} options-customexpiry-placeholder The placeholder of the custom block expiry textbox.
 * @property {string} options-checkbox-nocreate The label of the 'block account creation' checkbox.
 * @property {string} options-checkbox-noemail The label of the 'block e-mails' checkbox.
 * @property {string} options-checkbox-notalk The label of the 'block talk page' checkbox.
 * @property {string} options-checkbox-hardblock The label of the 'hard block' checkbox.
 * @property {string} options-checkbox-autoblock The label of the 'auto block' checkbox.
 * @property {string} options-checkbox-partial The label of the 'partial block' checkbox.
 * @property {string} options-partial-pages-label The label of the textbox to specify the target pages of partial block.
 * @property {string} options-partial-pages-placeholder The placeholder of the textbox to specify the target pages of partial block.
 * @property {string} options-partial-namespaces-label The label of the textbox to specify the target namespaces of partial block.
 * @property {string} options-partial-namespaces-placeholder The placeholder of the textbox to specify the target namespaces of partial block.
 * @property {string} options-partial-namespaces-tooltip The first line of the namespace tooltip.
 * @property {string} options-partial-namespaces-tooltip-main A pseudo-alias for the main namespace.
 * @property {string} options-checkbox-hideuser The label of the 'suppress username' checkbox.
 * @property {string} options-checkbox-watchuser The label of the 'watch this user' checkbox.
 * @property {string} options-makeglobal The label of the 'make this option global' checkbox.
 * @property {string} dialog-heading-block The text of the \<h2> tag for the block interface of the AjaxBlock dialog.
 * @property {string} dialog-heading-unblock The text of the \<h2> tag for the unblock interface of the AjaxBlock dialog.
 * @property {string} dialog-overwritewarning The warning message to show when action=block will have to overwrite the existing block.
 * @property {string} dialog-hasqueryparams The message to show when an (un)block link has predefined settings. This message needs to
 * be set as the parent element's innerHTML, and the child span with the class 'ab-replaceme' is to be replaced with an anchor button.
 * @property {string} dialog-hasqueryparams-get The label of the 'get query params' button.
 * @property {string} dialog-button-block The text of the 'block' button on the AjaxBlock dialog.
 * @property {string} dialog-button-unblock The text of the 'unblock' button on the AjaxBlock dialog.
 * @property {string} dialog-button-preset The text of the 'preset' button on the AjaxBlock dialog.
 * @property {string} dialog-button-currentblock The text of the 'current block' button on the AjaxBlock dialog.
 * @property {string} dialog-button-reset The text of the 'reset' button on the AjaxBlock dialog.
 * @property {string} dialog-button-close The text of the 'close' button on the AjaxBlock dialog.
 * @property {string} portlet-label The label text of the portlet link to the config page.
 * @property {string} config-header The heading text of the config page.
 * @property {string} config-header-nopermission The heading text of the config page when the user doesn't have the 'block' right.
 * @property {string} config-body-nopermission The config body innerHTML when the user doesn't have the 'block' right.
 * @property {string} config-loading The text displayed when the config interface is being loaded.
 * @property {string} config-loading-failed The text displayed when the config interface fails to be loaded.
 * @property {string} config-field-general The text of the legend for the wrapper fieldset of general options.
 * @property {string} config-field-language The text of the legend for the fieldset of the language option.
 * @property {string} config-field-userdefined-local The text of the legend for the fieldset of user-defined dropdown options for the local project.
 * @property {string} config-field-userdefined-global The text of the legend for the fieldset of user-defined dropdown options across projects.
 * @property {string} config-field-userdefined-add The text of the 'add' button in the field of user-defined dropdown options.
 * @property {string} config-field-userdefined-remove The text of the 'remove' button in the field of user-defined dropdown options.
 * @property {string} config-field-preset The text of the legend for the wrapper fieldset of preset options.
 * @property {string} config-field-preset-user The text of the legend for the fieldset of preset block options for registered users.
 * @property {string} config-field-preset-ip The text of the legend for the fieldset of preset block options for IP users.
 * @property {string} config-field-preset-unblock The text of the legend for the fieldset of preset unblock options.
 * @property {string} config-field-warning The text of the legend for the wrapper fieldset of warning options.
 * @property {string} config-field-warning-dialog The text of the legend for the fieldset of dialog action warining options.
 * @property {string} config-field-warning-oneclick The text of the legend for the fieldset of one-click action warining options.
 * @property {string} config-field-warning-noreason The label text of the checkbox for the 'no reason' warning option.
 * @property {string} config-field-warning-noexpiry The label text of the checkbox for the 'no expiry' warning option.
 * @property {string} config-field-warning-nopartialspecs The label text of the checkbox for the 'no partial specs' warning option.
 * (i.e. Partial block is enabled but neither pages nor namespaces are specified).
 * @property {string} config-field-warning-hardblock The label text of the checkbox for the 'hard block' warning option.
 * @property {string} config-field-warning-hideuser The label text of the checkbox for the 'suppress username' warning option.
 * @property {string} config-field-warning-overwrite The label text of the checkbox for the 'overwrite' warning option.
 * @property {string} config-field-warning-ignorepredefined The label text of the checkbox for the 'ignore predefined' warning option.
 * @property {string} config-field-warning-blockself The label text of the checkbox for the '(un)block self' warning option.
 * @property {string} config-field-warning-unblock The label text of the checkbox for the 'unblock' warning option.
 * @property {string} config-button-save The text of the button to save user configurations.
 * @property {string} config-saving The message to show when resolving an API request to save user configurations.
 * @property {string} config-savedone The message to show when user configurations have been saved.
 * @property {string} config-savefailed The message to show when user configurations have failed to be saved.
 * @property {string} error-fetch-dropdown A mw.notify message to show when the block reason dropdown has failed to be fetched.
 * @property {string} error-fetch-userrights A mw.notify message to show when user rights have failed to be fetched.
 * @property {string} error-fetch-aliases A mw.notify message to show when local special page aliases for (un)block have failed to be fetched.
 * @property {string} error-partial-morethan10 A mw.notify message to show when more than 10 pages are specified in the 'pages' field for
 * partial block ($1: The name of the field in which the values are specified, $2: Total number of pages).
 * @property {string} error-multiplecalls A mw.notify message to show when AjaxBlock is loaded from multiple files.
 * @property {string} warning-partial-removed A mw.notify message to let the user know that some values in the 'pages' field for partial block
 * have been removed because of being duplicate or invalid ($1: The name of the field in which the values are specified).
 * @property {string} warning-hideuser-unchecked A mw.notify message to let the user know that the 'hideuser' option has been unchecked because
 * an incompatible option has been enabled.
 * @property {string} warning-confirm-opening-block The opening line of the confirm dialog for warnings. ($1: The name of the user to block)
 * @property {string} warning-confirm-opening-unblock The opening line of the confirm dialog for warnings. ($1: The name of the user to unblock)
 * @property {string} warning-confirm-closing The closing line of the confirm dialog for warnings to ask the user to check all boxes.
 * @property {string} warning-confirm-noreason The checkbox label of the 'noreason' warning on the confirm dialog.
 * @property {string} warning-confirm-noexpiry The checkbox label of the 'noexpiry' warning on the confirm dialog.
 * @property {string} warning-confirm-nopartialspecs The checkbox label of the 'nopartialspecs' warning on the confirm dialog.
 * @property {string} warning-confirm-hardblock The checkbox label of the 'nopartialspecs' warning on the confirm dialog.
 * @property {string} warning-confirm-hideuser The checkbox label of the 'hideuser' warning on the confirm dialog.
 * @property {string} warning-confirm-overwrite The checkbox label of the 'overwrite' warning on the confirm dialog.
 * @property {string} warning-confirm-ignorepredefined The checkbox label of the 'ignore predefined' warning on the confirm dialog.
 * @property {string} warning-confirm-blockself The checkbox label of the '(un)blockself' warning on the confirm dialog.
 * @property {string} warning-confirm-unblock The checkbox label of the 'unblock' warning on the confirm dialog.
 * @property {string} warning-confirm-dialog-open The label of the 'open dialog when cancelled' checkbox on the confirm dialog.
 * @property {string} warning-confirm-dialog-proceed The text of the button for 'Proceed' on the confirm dialog.
 * @property {string} warning-confirm-dialog-cancel The text of the button for 'Cancel' on the confirm dialog.
 * @property {string} warning-confirm-dialog-cancelled A mw.notify message to show when 'Cancel' is clicked on the confirm dialog.
 * @property {string} warning-confirm-dialog-forcecancelled A mw.notify message to show when 'Proceed' on the confirm dialog
 * is clicked but some checkbox is not checked.
 * @property {string} progress-block-done The text to show when a user is successfully blocked.
 * @property {string} progress-block-failed The text to show when a user fails to be blocked.
 * @property {string} progress-unblock-done The text to show when a user is successfully unblocked.
 * @property {string} progress-unblock-failed The text to show when a user fails to be unblocked.
 */
/**
 * Codes of languages that are available as AjaxBlock's interface language.
 * @typedef {"en"|"ja"} AvailableLanguages
 */
/**
 * @typedef {object} AjaxBlockPrivateConfig
 * @property {string} script The script name.
 * @property {boolean} isOnConfig Whether the user is on the config page.
 * @property {{local: string; global: string;}} prefkey The names of options used by AjaxBlock.
 * @property {AvailableLanguages[]} languages An array of language codes that are available as AjaxBlock's interface language.
 * @property {Record<AvailableLanguages, AjaxBlockMessages>} i18n Message object for internationalization.
 * @property {{dropdown: HTMLSelectElement; regex: RegExp?; fetched: boolean;}} reason Block reason dropdown.
 * @property {{block: string[]; unblock: string[]; special: string[];}} aliases Local aliases for special pages.
 * @property {{block: boolean?; oversight: boolean?; sysop: boolean;}} rights The current user's user rights.
 */

/**
 * The possible user types associated with (un)block links.
 * @typedef {"user"|"ip"} AjaxBlockUserTypes
 */
/**
 * Type of the object internal to the array returned by a list=blocks API request in res.query.blocks.
 * @typedef {object} ApiResponseQueryListBlocks
 * @property {string} user
 * @property {string} reason
 * @property {string} expiry
 * @property {boolean} automatic
 * @property {boolean} nocreate
 * @property {boolean} noemail
 * @property {boolean} allowusertalk
 * @property {boolean} anononly
 * @property {boolean} autoblock
 * @property {boolean} [hidden]
 * @property {boolean} partial
 * @property {ApiResponseQueryListBlocksRestrictions} restrictions
 */
/**
 * Partial block details in the object elements of a res.query.blocks array fetched by a list=blocks API request.
 * @typedef {object} ApiResponseQueryListBlocksRestrictions
 * @property {{id?: number; ns?: number; title: string;}[]=} pages
 * @property {string[]=} namespaces
 */
/**
 * Type of the object created by the AjaxBlock dialog when passing/collecting block options specified on it.
 * AjaxBlockConfig also contains an object of this type for preset options.
 * @typedef AjaxBlockDialogOptionsBlock
 * @type {ApiResponseQueryListBlocks & {watchlist: boolean; watchlistexpiry: string;}}
 */
/**
 * Type of the object created by the AjaxBlock dialog when passing/collecting unblock options specified on it.
 * AjaxBlockConfig also contains an object of this type for preset options.
 * @typedef {object} AjaxBlockDialogOptionsUnblock
 * @property {string} reason
 * @property {boolean} watchlist
 * @property {string} watchlistexpiry
 */
/**
 * The keys of the object for warning options.
 * @typedef AjaxBlockWarningOptions
 * @type {(
 *	|"noReason"
 *	|"noExpiry"
 *	|"noPartialSpecs"
 *	|"willHardblock"
 *	|"willHideUser"
 *	|"willOverwrite"
 *	|"willIgnorePredefined"
 *	|"willBlockSelf"
 *	|"willUnblock"
 * )}
 */
/**
 * Type of the object storing warning opt-in/out options.
 * @typedef {Record<AjaxBlockWarningOptions, boolean>} AjaxBlockWarningOptionObject
 */
/**
 * Type of actions taken to (un)block a user (or the ways in which the "execute" method is called).
 * @typedef {"dialog"|"oneclick"} AjaxBlockActions
 */
/**
 * Type of the config for the AjaxBlock dialogs.
 * @typedef {object} AjaxBlockPublicConfig
 * @property {AvailableLanguages} lang
 * @property {{local: string[]; global: string[];}} dropdown
 * @property {{
 *	block: Record<AjaxBlockUserTypes, AjaxBlockDialogOptionsBlock>;
 *	unblock: AjaxBlockDialogOptionsUnblock;
 * }} preset
 * @property {Record<AjaxBlockActions, AjaxBlockWarningOptionObject>} warning
 */
/**
 * Type of the whole config of AjaxBlock.
 * @typedef {AjaxBlockPrivateConfig & AjaxBlockPublicConfig} AjaxBlockConfig
 */

//</nowiki>