/**************************************************************************************************\

	PrivateSandbox

	Create a private sandbox, accessible at [[Special:PrivateSandbox]]. Unlike other authors'
	versions, this version:
	- comes with WikiEditor
	- handles multiple profiles
	- can save large texts, of the byte size of more than 65,530

	Note that this script (including all other versions) exports the saved data on every page
	load, which can adversely affect the user's browser	experience. The "Wikitext" extension of
	Visual Studio Code may be a	good alternative.
	@link https://marketplace.visualstudio.com/items?itemName=RoweWilsonFrederiskHolme.wikitext

	@author [[User:Dragoniez]]
	@version 1.0.20

\**************************************************************************************************/

// @ts-check
/// <reference path="./window/PrivateSandbox.d.ts" />
/* global mw, OO */
//<nowiki>
(() => {

// Initialize configs
/** @type {PrivateSandboxConfig} */
const cfg = Object.assign({
	debug: false,
	lang: '',
	expandPreview: false,
	showDeleter: false,
	generatePortletLink: false
}, window.privateSandboxConfig);

// Exit on certain conditions
if (mw.config.get('wgUserId') === null) {
	// User is not logged in
	mw.notify('You are not logged in. Please log in to your account to access the private sandbox.', {type: 'error', autoHideSeconds: 'long'});
	return;
} else if (!(mw.config.get('wgNamespaceNumber') === -1 && /^(PrivateSandbox|PS)$/i.test(mw.config.get('wgTitle')))) {
	// User is not on Special:PrivateSandbox

	// Add a portlet link to the special page per config
	if (cfg.generatePortletLink) {
		$.when(mw.loader.using('mediawiki.util'), $.ready).then(() => {
			mw.util.addPortletLink(
				document.getElementById('p-cactions') ? 'p-cactions' : 'p-personal',
				mw.util.getUrl('Special:PrivateSandbox'),
				'PrivateSandbox',
				'ca-pvtsand'
			);
		});
	}

	return;
}

/**
 * The ScreenOverlay class.
 */
class ScreenOverlay {

	/**
	 * @typedef {object} ScreenOverlayOptions
	 * @property {string} [text] The text to use to initialize ScreenOverlay.
	 * @property {boolean} [showSpinner] Whether to show the spinner on the side of the text, defaulted to `true`.
	 * @property {boolean} [autoStart] Whether to auto-start ScreenOverlay, defaulted to `true`.
	 */
	/**
	 * Initialize a ScreenOverlay instance.
	 * @param {ScreenOverlayOptions} [options]
	 */
	constructor(options = {}) {

		if (options.text !== void 0) {
			options.text = String(options.text);
		}
		if (typeof options.showSpinner !== 'boolean') {
			options.showSpinner = true;
		}
		if (typeof options.autoStart !== 'boolean') {
			options.autoStart = true;
		}

		// Create a style tag
		const id = 'pvtsand-scoverlay-styles';
		if (!document.getElementById(id)) {
			const style = document.createElement('style');
			style.id = id;
			style.textContent =
				'#pvtsand-scoverlay {' +
					'position: fixed;' +
					'top: 0;' +
					'left: 0;' +
					'height: 100%;' +
					'width: 100%;' +
					'z-index: 1000;' +
					'overflow: hidden;' +
					'background-color: var(--background-color-base, white);' +
					'opacity: 0.8;' +
				'}' +
				'#pvtsand-scoverlay-inner {' +
					'position: fixed;' +
					'top: 50%;' +
					'left: 50%;' +
					'-webkit-transform: translate(-50%, -50%);' +
					'transform: translate(-50%, -50%);' +
				'}' +
				'#pvtsand-scoverlay-inner p {' +
					'font-size: 140%;' +
					'font-family: inherit;' +
				'}' +
				'#pvtsand-scoverlay-inner img {' +
					'height: 1em;' +
				'}';
			document.head.appendChild(style);
		}

		/**
		 * The overlay container.
		 * @type {JQuery<HTMLDivElement>}
		 */
		this.$overlay = $('<div>');

		/**
		 * The overlay text span.
		 * @type {JQuery<HTMLSpanElement>}
		 */
		this.$text = $('<span>');

		/**
		 * The overlay spinner image.
		 * @type {JQuery<HTMLImageElement>}
		 */
		this.$image = $('<img>');

		/**
		 * Date object that saves when the overlay started to show.
		 * @type {Date}
		 */
		this.timestamp = new Date();

		// Construct DOM elements
		$('body').append(
			this.$overlay
				.prop('id', 'pvtsand-scoverlay')
				.append(
					$('<div>')
						.prop('id', 'pvtsand-scoverlay-inner')
						.append(
							$('<p>')
								.append(
									this.$text,
									this.$image
										.prop('src', 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Ajax_loader_metal_512.gif')
								)
						)
				)
		);

		// Initialize per the options
		if (typeof options.text === 'string') {
			options.text = options.text.trim();
			const delimiter = options.text && options.showSpinner ? ' ' : '';
			this.$text.text(options.text + delimiter);
		}
		if (!options.showSpinner) {
			this.$image.hide();
		}
		if (!options.autoStart) {
			this.$overlay.hide();
		}

	}

	/**
	 * Toggle the visibility of the overlay.
	 * @overload
	 * @param {boolean} show Whether to show the overlay.
	 * @returns {ScreenOverlay}
	 */
	/**
	 * Toggle the visibility of the overlay, ensuring that it has been shown for at least *n*-milliseconds.
	 * @overload
	 * @param {false} show
	 * @param {number} displayedFor Milliseconds for which to ensure that the overlay has been displayed.
	 * @returns {JQueryPromise<ScreenOverlay>}
	 */
	/**
	 * @param {boolean} show
	 * @param {number} [displayedFor]
	 * @returns {ScreenOverlay|JQueryPromise<ScreenOverlay>}
	 */
	toggle(show, displayedFor) {
		if (show === false && typeof displayedFor === 'number') {
			if (!this.isVisible()) {
				console.warn('The screen overlay is invisible.');
				return $.Deferred().resolve(this);
			}
			const def = $.Deferred();
			const delay = Math.max(0, displayedFor - (new Date().getMilliseconds() - this.timestamp.getMilliseconds()));
			setTimeout(() => {
				this.$overlay.hide();
				def.resolve(this);
			}, delay);
			return def.promise();
		} else if (show) {
			this.timestamp = new Date();
			this.$overlay.show();
			return this;
		} else {
			this.$overlay.hide();
			return this;
		}
	}

	/**
	 * Evaluate whether the overlay is currently visible.
	 * @returns {boolean}
	 */
	isVisible() {
		return this.$overlay.is(':visible');
	}

	/**
	 * Set text to the overlay.
	 * @overload
	 * @param {string} str
	 * @param {boolean} showSpinner
	 * @returns {ScreenOverlay}
	 */
	/**
	 * Get the text of the overlay.
	 * @overload
	 * @returns {string}
	 */
	/**
	 * @param {string} [str]
	 * @param {boolean} [showSpinner]
	 * @returns {ScreenOverlay|string}
	 */
	text(str, showSpinner) {
		if (typeof str === 'string') {
			str = str.trim();
			showSpinner = !!showSpinner;
			const delimiter = str && showSpinner ? ' ' : '';
			this.$text.text(str + delimiter);
			this.$image.toggle(showSpinner);
			return this;
		} else {
			return this.$text.text();
		}
	}

}

/**
 * @type {Record<string, PrivateSandboxMessage>}
 */
const i18n = {
	en: {
		'message-load-interface': 'Loading the interface...',
		'message-load-failed': 'Failed to load the interface.',
		'message-load-welcome': 'Welcome to the private sandbox! Create your first profile to get started.',
		'message-load-updated': 'Welcome to the new private sandbox! The private sandbox now supports profile management, and your old data have been saved as profile "1".',
		'message-unload': 'You have unsaved changes. Are you sure you want to leave the page?',
		'label-profiles': 'Profiles',
		'label-profiles-select': 'Select profile:',
		'label-profiles-edit': 'Edit profile:',
		'label-profiles-edit-placeholder': 'Enter a profile name',
		'label-profiles-edit-help': 'The profile name must consist only of alphanumeric characters, underscores, and hyphens (<code>a-zA-Z0-9_-</code>).',
		'title-profiles-empty': 'Enter a profile name.',
		'title-profiles-invalidchars': 'The profile name must consist only of alphanumeric characters, underscores, and hyphens.',
		'title-profiles-toomanychars': 'The byte length of the profile name must be 255 or less.',
		'label-profiles-button-create': 'Create',
		'label-profiles-button-rename': 'Rename',
		'label-profiles-button-delete': 'Delete',
		'message-profiles-create-done': 'Created profile "$1".',
		'message-profiles-rename-done': 'Renamed profile "$1" to "$2".',
		'message-profiles-rename-confirm': 'Are you sure you want to rename profile "$1" to "$2"?',
		'message-profiles-delete-done': 'Deleted profile "$1".',
		'message-profiles-delete-confirm': 'Are you sure you want to delete profile "$1"?',
		'label-profiles-save-help': 'Changes need to be manually saved.',
		'title-editor-disabled': 'Create a profile to use the editor.',
		'label-profiles-save': 'Save',
		'title-profiles-save': 'Save this profile',
		'label-profiles-saveall': 'Save all',
		'title-profiles-saveall': 'Save all the profiles',
		'label-profiles-listunsaved': 'List unsaved',
		'title-profiles-listunsaved': 'Show a list of unsaved profiles',
		'label-deletedata': 'Delete data',
		'title-deletedata': 'Delete all data managed by PrivateSandbox',
		'message-deletedata-confirm': 'This action cannot be undone. Are you sure you want to delete all data?',
		'message-deletedata-doing': 'Deleting all data...',
		'message-deletedata-done': 'Deleted all the data. Please close this page once.',
		'message-deletedata-failed': 'Failed to delete the data. Please try again.',
		'message-predeletedata-failed': 'The procedure has been canceled because PrivateSandbox failed to fetch the newest profiles in the pre-deletion process. Please try again in a few minutes. (See the browser console for the details of this error.)',
		'title-dialog-listunsaved': 'Unsaved profiles',
		'label-dialog-listunsaved-deleteditem': 'deleted',
		'message-presave-failed': 'The procedure has been canceled because PrivateSandbox failed to fetch the newest profiles in the pre-saving process. Please try again in a few minutes. (See the browser console for the details of this error.)',
		'message-conflict-created': 'Created elsewhere',
		'message-conflict-modified': 'Modified elsewhere',
		'message-conflict-deleted': 'Deleted elsewhere',
		'message-conflict-alert1': 'PrivateSandbox has detected edit conflicts in the following profiles:',
		'message-conflict-alert2': 'This occurs when new changes are saved in another tab after opening PrivateSandbox in the current tab. To prevent any potential data corruption, it is highly recommended that you press "Cancel", emigrate your changes in this tab to the tab where the changes above were made, and close PrivateSandbox in this tab. If it is okay to overwrite the newest profiles with the data on this page, close all other tabs that have opened PrivateSandbox and press "OK". This will refresh the current tab when the saving process is finished.',
		'title-conflict': 'Edit conflict',
		'message-save-doing': 'Saving...',
		'message-save-done': 'Saved the profile(s).',
		'message-save-failed': 'Failed to save the profile(s). Please see the browser console for details.',
		'label-preview': 'Preview',
		'message-preview-failed': 'Failed to fetch preview.',
		'title-preview-expand': 'Expand the preview tab',
		'title-preview-collapse': 'Collapse the preview tab',
		'title-preview-disabled': 'Create a profile to use the preview tab.'
	},
	ja: {
		'message-load-interface': 'インターフェースを読み込み中...',
		'message-load-failed': 'インターフェースの読み込みに失敗しました。',
		'message-load-welcome': 'プライベートサンドボックスへようこそ！最初のプロファイルを作成して始めましょう。',
		'message-load-updated': '新しいプライベートサンドボックスへようこそ！プライベートサンドボックスはプロファイル管理に対応し、あなたの古いデータはプロファイル「1」として保存されました。',
		'message-unload': '未保存の変更があります。ページを離れますか？',
		'label-profiles': 'プロファイル',
		'label-profiles-select': 'プロファイルを選択:',
		'label-profiles-edit': 'プロファイルを編集:',
		'label-profiles-edit-placeholder': 'プロファイル名を入力',
		'label-profiles-edit-help': 'プロファイル名には半角英数字、アンダースコア、ハイフン (<code>a-zA-Z0-9_-</code>) のみが使用可能です。',
		'title-profiles-empty': 'プロファイル名を入力してください。',
		'title-profiles-invalidchars': 'プロファイル名に使用可能な文字は英数字、アンダースコア、ハイフンのみです。',
		'title-profiles-toomanychars': 'プロファイル名には255バイト以下の文字列を指定してください。',
		'label-profiles-button-create': '作成',
		'label-profiles-button-rename': '改名',
		'label-profiles-button-delete': '削除',
		'message-profiles-create-done': 'プロファイル「$1」を作成しました。',
		'message-profiles-rename-done': 'プロファイル「$1」を「$2」に改名しました。',
		'message-profiles-rename-confirm': 'プロファイル「$1」を「$2」に改名しますか？',
		'message-profiles-delete-done': 'プロファイル「$1」を削除しました。',
		'message-profiles-delete-confirm': 'プロファイル「$1」を削除しますか？',
		'label-profiles-save-help': '変更は手動保存してください。',
		'title-editor-disabled': 'エディターを使用するにはプロファイルを作成してください。',
		'label-profiles-save': '保存',
		'title-profiles-save': 'このプロファイルを保存',
		'label-profiles-saveall': '全保存',
		'title-profiles-saveall': '全てのプロファイルを保存',
		'label-profiles-listunsaved': '未保存リスト',
		'title-profiles-listunsaved': '未保存のプロファイルをリスト表示',
		'label-deletedata': 'データ削除',
		'title-deletedata': 'PrivateSandboxに関わる全てのデータを削除',
		'message-deletedata-confirm': 'この操作は元に戻せません。全てのデータを削除しますか？',
		'message-deletedata-doing': '全てのデータを削除しています...',
		'message-deletedata-done': '全てのデータを削除しました。このページを一度閉じてください。',
		'message-deletedata-failed': 'データを削除に失敗しました。もう一度お試しください。',
		'message-predeletedata-failed': '削除の準備プロセスにおいて、最新版プロファイルの取得に失敗したため削除処理が中止されました。数分おいて再度お試しください。(エラーの詳細をブラウザーコンソールにて確認できます。)',
		'title-dialog-listunsaved': '未保存プロファイル',
		'label-dialog-listunsaved-deleteditem': '削除',
		'message-presave-failed': '保存の準備プロセスにおいて、最新版プロファイルの取得に失敗したため保存処理が中止されました。数分おいて再度お試しください。(エラーの詳細をブラウザーコンソールにて確認できます。)',
		'message-conflict-created': '他所で新規作成',
		'message-conflict-modified': '他所で内容更新',
		'message-conflict-deleted': '他所で削除',
		'message-conflict-alert1': '下記のプロファイルで編集競合を検知しました:',
		'message-conflict-alert2': 'これは、現在のタブでPrivateSandboxを開いた後に別タブ内で変更が保存された場合に発生します。データの破損を避けるため、「キャンセル」をクリック後、このタブ上のデータを上記の更新が保存されたタブに全て移し、このタブのPrivateSandboxを閉じることを強く推奨します。このページ上のデータで最新版プロファイルを上書きしてもよろしければ、PrivateSandboxを開いている別タブを全て閉じた後「OK」をクリックしてください。この場合、保存処理の終了後に現在のタブをリロードします。',
		'title-conflict': '編集競合',
		'message-save-doing': '保存中...',
		'message-save-done': 'プロファイルを保存しました。',
		'message-save-failed': 'プロファイルの保存に失敗しました。詳細はブラウザーコンソールをご覧ください。',
		'label-preview': 'プレビュー',
		'message-preview-failed': 'プレビューの取得に失敗しました。',
		'title-preview-expand': 'プレビュータブを展開',
		'title-preview-collapse': 'プレビュータブを格納',
		'title-preview-disabled': 'プレビュータブを使用するにはプロファイルを作成してください。'
	}
};
/**
 * @type {PrivateSandboxMessage}
 */
const messages = (() => {
	cfg.lang = String(cfg.lang);
	const lang = cfg.lang || mw.config.get('wgUserLanguage').replace(/-.*$/, '');
	if (cfg.lang && !i18n[cfg.lang]) {
		mw.notify(
			$(`<div>Sorry, PrivateSandbox does not currently have <code>${cfg.lang}</code> language support for its interface.</div>`),
			{type: 'error', autoHideSeconds: 'long'}
		);
	}
	return i18n[lang] || i18n.en;
})();
/**
 * Get an interface message.
 * @param {keyof PrivateSandboxMessage} key
 * @returns {string}
 */
const getMessage = (key) => messages[key];

/**
 * The PrivateSandbox class.
 */
class PrivateSandbox {

	/**
	 * Initialize PrivateSandbox.
	 * @static
	 */
	static init() {

		// Load modules in the background
		const dependencies = {
			main: [
				'mediawiki.String',
				'mediawiki.user',
				'mediawiki.api',
				'oojs-ui',
				'oojs-ui.styles.icons-content',
				'oojs-ui.styles.icons-interactions',
				'oojs-ui.styles.icons-moderation',
				'oojs-ui.styles.icons-editing-core',
				'oojs-ui.styles.icons-editing-list'
			],
			ed: [
				'ext.wikiEditor'
			]
		};
		const defModules = mw.loader.using(dependencies.main);

		// Load the DOM
		$(function() {

			// Create a style tag
			const style = document.createElement('style');
			style.textContent =
				'#pvtsand-container {' +
					'position: relative;' +
				'}' +
				'#pvtsand-container-overlay {' +
					'width: 100%;' +
					'height: 100%;' +
					'position: absolute;' +
					'top: 0;' +
					'left: 0;' +
					'z-index: 10;' +
				'}' +
				'#pvtsand-profiles-container {' +
					'padding: 1em;' +
					'margin-bottom: 1em;' +
					'border: 1px solid var(--border-color-base, #ccc);' +
				'}' +
				'#pvtsand-profiles-buttons {' +
					'margin-top: 12px;' +
					'margin-bottom: 4px;' +
				'}' +
				'#pvtsand-profiles-input-warning.pvtsand-warning {' +
					'color: red;' +
				'}' +
				'.pvtsand-warning code {' +
					'color: inherit;' +
				'}' +
				'.pvtsand-overlay-parent {' +
					'width: 100%;' +
					'position: relative;' +
				'}' +
				'.pvtsand-overlay {' +
					'width: 100%;' +
					'height: 100%;' +
					'position: absolute;' +
					'top: 0;' +
					'left: 0;' +
					'z-index: 10;' +
					'border: 1px solid var(--border-color-base, #ccc);' +
					'background-color: var(--background-color-disabled, #ccc);' +
					'opacity: 0.6;' +
					'cursor: not-allowed;' +
					'user-select: none;' +
				'}' +
				'.pvtsand-editor {' +
					'font-size: 82%;' +
				'}' +
				'#pvtsand-savebutton-container {' +
					'margin-top: 1em;' +
				'}' +
				'#pvtsand-preview-container {' +
					'margin-top: 1em;' +
					'border: 1px solid var(--border-color-base, #ccc);' +
				'}' +
				'#pvtsand-preview-header {' +
					'background-color: var(--background-color-neutral-subtle, #f8f8f8);' +
					'padding-left: 1em;' +
					'padding-right: 1em;' +
				'}' +
				'#pvtsand-preview-loading {' +
					'height: 1em;' +
				'}' +
				'#pvtsand-preview-content {' +
					'text-align: justify;' +
					'min-height: 1em;' +
					'padding: 0.3em 1em;' +
					'border-top: 1px solid var(--border-color-base, #ccc);' +
				'}';
			document.head.appendChild(style);

			// Show a "now loading" overlay
			const sco = new ScreenOverlay({
				text: getMessage('message-load-interface'),
				autoStart: true
			});

			// Load wikiEditor-related modules in the background
			let edModules;
			if (mw.loader.getState(dependencies.ed[0])) { // If wikiEditor is available as an extension

				// Hack: wikiEditor-related manipulations before loading the extension
				mw.config.get('wgExtraSignatureNamespaces', []).push(-1); // For the signature button to be available
				$('body').addClass('ns-subject'); // For the reference button to be avaiable

				// Also load plugins if available
				[
					'ext.TemplateWizard',
					'ext.cite.wikiEditor',
					// 'ext.CodeMirror.v6.WikiEditor'
				]
				.forEach((m) => {
					if (mw.loader.getState(m)) {
						dependencies.ed.push(m);
					}
				});
				edModules = mw.loader.using(dependencies.ed);

			}

			// Collect and manipulate native DOM elements
			const scriptName = 'Private sandbox';
			document.title = scriptName + ' - ' + mw.config.get('wgSiteName');
			const $heading = $('.mw-first-heading');
			const $content = $('.mw-body-content');
			if (!$heading.length || !$content.length) {
				sco.toggle(false);
				mw.notify(getMessage('message-load-failed'), {type: 'error', autoHide: false});
				return;
			}
			$heading.text(scriptName);

			/**
			 * Process the old profile if there's any, for the new version of PrivateSandbox.
			 * @returns {JQueryPromise<boolean>} Whether an old profile has been processed.
			 * @requires mediawiki.user
			 * @requires mediawiki.api
			 */
			const processOldProfile = () => {

				const key = 'userjs-pvt-sandbox';
				/**
				 * The saved content for the old version of PrivateSandbox, if any.
				 *
				 * This never exceeds the maximum byte length because the version wasn't capable of handling such an excess.
				 * @type {string?}
				 */
				const content = mw.user.options.get(key);
				const newProfilesExist = Object.keys(mw.user.options.get()).some((k) => /^userjs-pvtsand-.+?-\d+$/.test(k));

				// There isn't an old profile
				if (content === null) {
					return $.Deferred().resolve(false);
				// There is an old profile
				} else if (newProfilesExist) { // There's some new profile (= failed to clean up the old profile in the last run)
					// Reset the old profile
					return PrivateSandbox.saveOptions({
						[key]: null,
					}).then(() => {
						mw.user.options.set(key, null);
						return false;
					});
				} else { // There's no new profile
					// Cast the old profile to profile 1 and reset the option
					const options = {
						[key]: null,
						'userjs-pvtsand-1-0': content
					};
					return PrivateSandbox.saveOptions(options).then(() => {
						mw.user.options.set(options);
						return true;
					});
				}

			};

			// When modules are ready, create the PrivateSandbox interface
			$.when(defModules, edModules).then((req) => {
				/** @type {MwString} */
				const mwString = req('mediawiki.String');
				processOldProfile().then((processed) => {
					const ps = new PrivateSandbox(mwString, processed, sco, $content);
					ps.welcomeOnFirstVisit();
					if (cfg.debug) {
						// @ts-ignore
						mw.libs.PrivateSandbox = ps;
					}
				});
			});

		});

	}

	/**
	 * Save options to the server. *This method does not prepend `userjs-pvtsand-` to the option keys.*
	 * @param {Record<string, string?>} options If a property is valued with `null`, the given option will be reset.
	 * @returns {JQueryPromise<boolean>} The result of the HTTP request as a boolean value.
	 * @static
	 */
	static saveOptions(options) {
		const data = [];
		for (const key in options) {
			const value = options[key];
			if (value === null) {
				data.push(key);
			} else {
				data.push(`${key}=${value}`);
			}
		}
		if (!data.length) {
			console.warn('An empty object has been passed to saveOptions.');
			return $.Deferred().resolve(false);
		}
		const sep = '\u001F';
		return new mw.Api({
			ajax: {
				timeout: 60*1000 // 60 seconds, overwriting the default value of 30 seconds
			}
		}).postWithToken('csrf', {
			action: 'options',
			change: sep + data.join(sep),
			formatversion: '2'
		}).then((res) => {
			if (res) {
				if (res.options !== 'success' || res.warning) {
					console.warn(res);
					return false;
				}
				return true;
			} else {
				console.warn('Undefined response.');
				return false;
			}
		}).catch((_, err) => {
			console.warn(err);
			return false;
		});
	}

	/**
	 * @param {MwString} mwString
	 * @param {boolean} processed Whether an old profile has been processed.
	 * @param {ScreenOverlay} sco
	 * @param {JQuery<HTMLElement>} $content
	 */
	constructor(mwString, processed, sco, $content) {

		/**
		 * @type {MwString}
		 */
		this.mwString = mwString;

		/**
		 * Whether an old profile has been processed.
		 * @type {boolean}
		 */
		this.processed = processed;

		/**
		 * @type {ScreenOverlay}
		 */
		this.sco = sco;

		// Get profiles as an object

		/**
		 * @type {Record<string, string>}
		 */
		const options = mw.user.options.get();

		/**
		 * Profiles that have been saved to the server, stored as arrays.
		 * @type {Record<string, string[]>}
		 */
		this.savedProfiles = PrivateSandbox.objectifySavedOptions(options);

		/**
		 * Initial options for the profile selector dropdown.
		 * @type {OO.ui.MenuOptionWidget[]}
		 */
		const ddItems = [];

		/**
		 * Profiles that have yet to be saved to the server, stored as strings.
		 * @type {Record<string, string>}
		 */
		this.profiles = Object.keys(this.savedProfiles).reduce(/** @param {Record<string, string>} acc */ (acc, key) => {
			acc[key] = this.savedProfiles[key].join('');
			ddItems.push(new OO.ui.MenuOptionWidget({label: key, data: key}));
			return acc;
		}, Object.create(null));

		/**
		 * Object that stores renaming logs, keyed by current profiles and valued by previous profiles.
		 * @type {Record<string, string[]>}
		 */
		this.renameLogs = Object.create(null);

		/**
		 * A list of deleted profile names. Note that the original profiles of renamed profiles are also considered
		 * to have been deleted.
		 * @type {string[]}
		 */
		this.deletedProfiles = [];

		// Create DOM elements for the interface

		/**
		 * Transparent overlay of the container used to make elements in it unclickable.
		 * @type {JQuery<HTMLDivElement>}
		 */
		this.$overlay = $('<div>');

		const prfFieldset = new OO.ui.FieldsetLayout({
			label: getMessage('label-profiles'),
			id: 'pvtsand-profiles-fieldset'
		});

		/**
		 * The profile selector dropdown.
		 * @type {OO.ui.DropdownWidget}
		 */
		this.prfDropdown = new OO.ui.DropdownWidget({
			id: 'pvtsand-profiles-selector',
			menu: {
				items: ddItems
			}
		});

		/**
		 * The profile name input.
		 * @type {OO.ui.TextInputWidget}
		 */
		this.prfInput = new OO.ui.TextInputWidget({
			id: 'pvtsand-profiles-input',
			placeholder: getMessage('label-profiles-edit-placeholder'),
			validate: (v) => {
				let title = '';
				let needWarning = false;
				if (!v) {
					title = getMessage('title-profiles-empty');
				} else if (/[^a-zA-Z0-9_-]/.test(v)) {
					title = getMessage('title-profiles-invalidchars');
					needWarning = true;
				} else if (this.mwString.byteLength(v) > 255) {
					title = getMessage('title-profiles-toomanychars');
					needWarning = true;
				}
				this.prfInput.setTitle(title);
				$('#pvtsand-profiles-input-warning').toggleClass('pvtsand-warning', needWarning);
				return title === '';
			}
		});

		prfFieldset.addItems([
			new OO.ui.FieldLayout(this.prfDropdown, {
				label: getMessage('label-profiles-select'),
				align: 'top'
			}),
			new OO.ui.FieldLayout(this.prfInput, {
				label: getMessage('label-profiles-edit'),
				align: 'top',
				help: new OO.ui.HtmlSnippet(`<span id="pvtsand-profiles-input-warning">${getMessage('label-profiles-edit-help')}</span>`),
				helpInline: true
			})
		]);

		/**
		 * The button to create a profile.
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnCreate = new OO.ui.ButtonWidget({
			label: getMessage('label-profiles-button-create'),
			flags: 'progressive',
			icon: 'add'
		}).off('click').on('click', () => {
			this.modifyProfile('create');
		});

		/**
		 * The button to rename a profile.
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnRename = new OO.ui.ButtonWidget({
			label: getMessage('label-profiles-button-rename'),
			icon: 'edit'
		}).off('click').on('click', () => {
			this.modifyProfile('rename');
		});

		/**
		 * The button to delete a profile.
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnDelete = new OO.ui.ButtonWidget({
			label: getMessage('label-profiles-button-delete'),
			flags: 'destructive',
			icon: 'trash'
		}).off('click').on('click', () => {
			this.modifyProfile('delete');
		});

		/**
		 * The overlay of the editor.
		 * @type {JQuery<HTMLDivElement>}
		 */
		const $editorOverlay = $('<div>');

		/**
		 * The textarea that holds a profile content.
		 *
		 * The `val` method should not be called. Use {@link getEditorValue} or {@link setEditorValue} instead.
		 * @type {JQuery<HTMLTextAreaElement>}
		 */
		this.$editor = $('<textarea>');

		/**
		 * The button to save changes to the given profile.
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnSave = new OO.ui.ButtonWidget({
			label: getMessage('label-profiles-save'),
			title: getMessage('title-profiles-save'),
			flags: ['progressive', 'primary'],
			icon: 'check'
		}).off('click').on('click', () => {
			this.saveProfiles(this.getSelectedProfile(true));
		});

		/**
		 * The button to save changes to all the profiles.
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnSaveAll = new OO.ui.ButtonWidget({
			label: getMessage('label-profiles-saveall'),
			title: getMessage('title-profiles-saveall'),
			flags: 'progressive',
			icon: 'checkAll'
		}).off('click').on('click', () => {
			this.saveProfiles();
		});

		/**
		 * The button to show a list of unsaved profiles.
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnListUnsaved = new OO.ui.ButtonWidget({
			label: getMessage('label-profiles-listunsaved'),
			title: getMessage('title-profiles-listunsaved'),
			icon: 'listBullet'
		}).off('click').on('click', () => {
			// When clicked, show a list of unsaved profiles on a dialog
			OO.ui.alert(
				$('<ul>')
					.css({
						'word-break': 'break-all',
						'overflow-wrap': 'break-word'
					})
					.append(
						$.map(this.getUnsavedProfiles(), (prof) => {
							if (this.deletedProfiles.indexOf(prof) !== -1) {
								// If this unsaved profile has been deleted, add " (deleted)"
								prof += ` (${getMessage('label-dialog-listunsaved-deleteditem')})`;
							}
							return $('<li>').text(prof);
						})
					),
				{
					title: getMessage('title-dialog-listunsaved'),
					size: 'medium'
				}
			);
		});

		/**
		 * The button to delete all data managed by PrivateSandbox.
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnDeleteData = new OO.ui.ButtonWidget({
			label: getMessage('label-deletedata'),
			title: getMessage('title-deletedata'),
			icon: 'trash',
			flags: ['destructive', 'primary']
		}).off('click').on('click', () => {
			this.deleteData();
		});

		/**
		 * The overlay of the preview tab.
		 * @type {JQuery<HTMLDivElement>}
		 */
		const $previewOverlay = $('<div>');

		/**
		 * @type {JQuery<HTMLImageElement>}
		 */
		this.$previewLoader = $('<img>');

		/**
		 * The container for preview content.
		 * @type {JQuery<HTMLDivElement>}
		 */
		this.$previewContent = $('<div>');

		/**
		 * A mw.Api instance for content preview.
		 * @type {mw.Api}
		 */
		this.previewApi = new mw.Api({
			ajax: {
				headers: {
					'Api-User-Agent': 'PrivateSandbox/1.0.20 (https://meta.wikimedia.org/wiki/User:Dragoniez/PrivateSandbox.js)',
					/** @see https://www.mediawiki.org/wiki/API:Etiquette#Other_notes */
					// @ts-ignore
					'Promise-Non-Write-API-Action': true
				}
			}
		});

		/**
		 * Wikitext that was previewed last time.
		 * @type {string}
		 */
		this.lastPreviewed = '';

		/**
		 * The button to expand/collapse the preview tab.
		 * @type {OO.ui.ButtonWidget}
		 */
		const btnPreview = new OO.ui.ButtonWidget({
			framed: false,
			label: getMessage('label-preview'),
			title: getMessage(cfg.expandPreview ? 'title-preview-collapse' : 'title-preview-expand'),
			icon: 'article'
		}).off('click').on('click', () => {
			const show = !this.$previewContent.is(':visible');
			this.$previewContent.toggle(show);
			btnPreview
				.setFlags({progressive: show})
				.setTitle(getMessage(show ? 'title-preview-collapse' : 'title-preview-expand'));
			if (show) {
				this.preview(this.getEditorValue());
			}
		});
		if (cfg.expandPreview) {
			// The collapsed state of $previewContent is initialized when it's added to the DOM,
			// meaning that no click event fires on it; hence add the flag if needed
			btnPreview.setFlags({progressive: true});
		}

		// Construct the interface
		$content.empty().append(
			$('<div>')
				.prop('id', 'pvtsand-container')
				.append(
					$('<div>')
						.prop('id', 'pvtsand-profiles-container')
						.append(
							prfFieldset.$element,
							$('<div>')
								.prop('id', 'pvtsand-profiles-buttons')
								.append(
									this.btnCreate.$element,
									this.btnRename.$element,
									this.btnDelete.$element
								),
							new OO.ui.LabelWidget({
								label: getMessage('label-profiles-save-help'),
								classes: ['oo-ui-inline-help']
							}).$element
						),
					$('<div>')
						.prop('id', 'pvtsand-editor-container')
						.addClass('pvtsand-overlay-parent')
						.append(
							$editorOverlay
								.prop({
									id: 'pvtsand-editor-overlay',
									title: getMessage('title-editor-disabled')
								})
								.addClass('pvtsand-overlay'),
							this.$editor
								.prop({
									id: 'wpTextbox1',
									class: 'pvtsand-editor',
									cols: 80,
									rows: 20
								})
						),
					$('<div>')
						.prop('id', 'pvtsand-savebutton-container')
						.append(
							this.btnSave.$element,
							this.btnSaveAll.$element,
							this.btnListUnsaved.$element,
							this.btnDeleteData.$element.toggle(!!cfg.showDeleter)
						),
					$('<div>')
						.prop('id', 'pvtsand-preview-container')
						.addClass('pvtsand-overlay-parent')
						.append(
							$previewOverlay
								.prop({
									id: 'pvtsand-preview-overlay',
									title: getMessage('title-preview-disabled')
								})
								.addClass('pvtsand-overlay'),
							$('<div>')
								.prop('id', 'pvtsand-preview-header')
								.append(
									btnPreview.$element,
									this.$previewLoader
										.prop({
											id: 'pvtsand-preview-loading',
											src: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Ajax_loader_metal_512.gif'
										})
										.hide()
								),
							this.$previewContent
								.prop('id', 'pvtsand-preview-content')
								.toggle(!!cfg.expandPreview)
						)
				),
			this.$overlay
				.prop('id', 'pvtsand-container-overlay')
				.hide()
		);

		// Set up wikiEditor
		// @ts-ignore
		const addWikiEditor = mw.addWikiEditor;
		if (typeof addWikiEditor === 'function') {

			addWikiEditor(this.$editor);

			// Load realtimepreview if available. The extension internally defines a "context" variable, and
			// the loading must be deferred until wikiEditor is initialized.
			const rtp ='ext.wikiEditor.realtimepreview';
			if (mw.loader.getState(rtp)) {
				mw.user.options.set('wikieditor-realtimepreview', 0); // Turn it off by default
				mw.loader.using(rtp);
			}

		}

		// Set up events (for non-buttons)

		// When a different profile is selected in the dropdown
		// The event is triggered also when the profile buttons are clicked
		this.prfDropdown.off('labelChange').on('labelChange', () => {

			// Get the dropdown value
			const profileName = this.getSelectedProfile();

			// Enable the dropdown if there's at least one profile; otherwise disable it
			this.setDisabled('dropdown', !profileName);

			// Copy the profile name into the input, or clear the input if there's no selectable profile
			this.prfInput.setValue(profileName || '');
			// @ts-ignore
			this.prfInput.emit('change'); // Change the disabled states of the buttons per the input value

			// Set the profile content to the textarea
			this.setEditorValue(profileName && this.getProfileContent(profileName) || '');

			// Toggle the visibility of the overlays based on whether there's a profile
			$editorOverlay.toggle(!profileName);
			$previewOverlay.toggle(!profileName);

		});

		// When the value of the input is changed, change the disabled states of the buttons
		this.prfInput.off('change').on('change', () => {
			this.getValidatedValue().then((v) => {
				if (!v) { // Invalid input value
					this.setDisabled({
						create: true,
						rename: true,
						delete: true
					});
				} else { // Valid input value
					if (this.getSelectedProfile()) { // There's some profiles
						/**
						 * Whether the input value matches a profile name.
						 */
						const profileExists = this.getProfileNames().indexOf(v) !== -1;
						this.setDisabled({
							create: profileExists,
							rename: profileExists,
							delete: !profileExists
						});
					} else { // No profile has been created
						this.setDisabled({
							create: false,
							rename: true,
							delete: true
						});
					}
				}
			});
		});

		// Fire the "pvtsand.content" hook when the content is edited
		/** @type {NodeJS.Timeout} */
		let editorTimeout;
		this.$editor.off('input').on('input', () => {
			clearTimeout(editorTimeout);
			editorTimeout = setTimeout(() => {
				mw.hook('pvtsand.content').fire(this.getEditorValue());
			}, 500);
		});

		// Event handler for when the editor content is changed
		/** @type {NodeJS.Timeout} */
		let previewTimeout;
		mw.hook('pvtsand.content').add(/** @param {string} value */ (value) => {

			clearTimeout(previewTimeout);
			previewTimeout = setTimeout(() => {
				if (this.$previewContent.is(':visible')) {
					this.preview(value);
				}
			}, 1000);

			// Update the profile
			const prof = this.getSelectedProfile();
			if (!prof) {
				// Propagated from the labelChange event triggered by deleteProfile
				// Reaches this block when all profiles have been deleted
				const unsaved = this.getUnsavedProfiles();
				this.setDisabled({
					save: true,
					saveall: unsaved.length === 0,
					listunsaved: unsaved.length === 0
				});
				return;
			}
			this.profiles[prof] = value;

			// Change the disabled states of the save buttons
			const unsaved = this.getUnsavedProfiles();
			this.setDisabled({
				save: unsaved.indexOf(prof) === -1,
				saveall: !(unsaved.length >= 2 || unsaved.some((v) => v !== prof)),
				listunsaved: unsaved.length === 0
			});

		});

		// Warn the user before unloading the page if there're unsaved changes
		window.onbeforeunload = (e) => {
			if (this.getUnsavedProfiles().length) {
				e.preventDefault();
				e.returnValue = getMessage('message-unload'); // Ignored on most modern browsers
			}
		};

		// Initialize profile display
		const keys = Object.keys(this.profiles);
		if (keys.length) {
			// If there's some profile, select the first profile in the dropdown.
			// selectItemByData fires a labelChange event that manipulates the interface elements.
			this.prfDropdown.getMenu().selectItemByData(keys[0]);
		} else {
			// If there's no profile, trigger a labelChange event to initialize the interface elements
			this.prfDropdown.emit('labelChange');
		}

	}

	/**
	 * Extract `userjs-pvtsand-PROFILE-INDEX` options out of a given object of user options and create a new object
	 * keyed by `PROFILE` and valued by string arrays in accordance with the number of `INDEX`s.
	 * @param {Record<string, string>} options
	 * @returns {Record<string, string[]>}
	 */
	static objectifySavedOptions(options) {
		return Object.keys(options).reduce(/** @param {Record<string, string[]>} acc */ (acc, key) => {
			const m = key.match(/^userjs-pvtsand-(.+?)-(\d+)$/); // $1: profile name, $2: index
			if (m) {
				if (!acc[m[1]]) {
					acc[m[1]] = [];
				}
				acc[m[1]][m[2]] = options[key];
			}
			return acc;
		}, Object.create(null));
	}

	/**
	 * Welcome the user on their first visit to the private sandbox. This is to be called every time when a class instance is created.
	 * @returns {void}
	 */
	welcomeOnFirstVisit() {
		const optionKey = 'userjs-pvtsand-welcomed';
		if (mw.user.options.get(optionKey) !== '') {
			PrivateSandbox.saveOptions({[optionKey]: ''}).then(() => {
				this.sco.toggle(false, 800).then(() => {
					OO.ui.alert(getMessage(this.processed ? 'message-load-updated' : 'message-load-welcome'), {
						title: 'Welcome!',
						size: 'medium'
					});
				});
			});
		} else {
			this.sco.toggle(false, 800);
		}
	}

	/**
	 * Set the visibility of the overlay div and toggle accesibility to DOM elements under it.
	 * @param {boolean} show
	 */
	toggleOverlay(show) {
		this.$overlay.toggle(show);
		return this;
	}

	/**
	 * Get all the profile names.
	 * @param {boolean} [getSaved] Whether to get the saved profile names, defaulted to `false`.
	 * @returns {string[]}
	 */
	getProfileNames(getSaved = false) {
		return Object.keys(!getSaved ? this.profiles : this.savedProfiles);
	}

	/**
	 * Get the name of the profile that is currently selected in the dropdown.
	 * @overload
	 * @returns {string?} A string value if some option is selected (i.e. there's at least one option);
	 * `null` if no option is selected (i.e. there's no option).
	 */
	/**
	 * Get the name of the profile that is currently selected in the dropdown.
	 * @overload
	 * @param {true} nullproof Whether to expect a non-null value to be returned.
	 * @returns {string} The name of the selected profile.
	 * @throws {Error} When no profile is selected, meaning that the return value will have to be `null`.
	 */
	/**
	 * @param {true} [nullproof]
	 * @returns {string?}
	 */
	getSelectedProfile(nullproof) {
		const selected = this.prfDropdown.getMenu().findSelectedItem();
		if (!selected) {
			if (nullproof) {
				throw new Error('getSelectedProfile returned null in the nullproof mode.');
			} else {
				// If no option is selected (i.e. there's no option)
				return null;
			}
		} else if (selected instanceof OO.ui.OptionWidget) {
			// If some option is selected (i.e. there's at least one option)
			// @ts-ignore
			const /** @type {string} */ v = selected.getData();
			return v;
		} else { // OO.ui.OptionWidget[]
			console.error(selected);
			throw new Error('Expected items are selected in the dropdown.');
		}
	}

	/**
	 * Get the value of the editor.
	 * @returns {string}
	 */
	getEditorValue() {
		// @ts-ignore
		return this.$editor.val();
	}

	/**
	 * Set a value to the editor. This fires the `pvtsand.content` hook.
	 * @param {string} content
	 * @returns {PrivateSandbox}
	 */
	setEditorValue(content) {
		this.$editor.val(content);
		mw.hook('pvtsand.content').fire(content);
		return this;
	}

	/**
	 * Get the content of a profile.
	 * @param {string} key
	 * @returns {string}
	 */
	getProfileContent(key) {
		if (key in this.profiles) {
			return this.profiles[key];
		} else {
			throw new Error('Profile named "' + key + '" does not exist.');
		}
	}

	/**
	 * Validate and return the current input value.
	 * @returns {JQueryPromise<string?>} A string value if valid, or else `null`.
	 */
	getValidatedValue() {
		return this.prfInput.getValidity().then(() => true).catch(() => false).then((valid) => {
			return valid ? this.prfInput.getValue() : null;
		});
	}

	/**
	 * @typedef {"dropdown"|"input"|"create"|"rename"|"delete"|"save"|"saveall"|"listunsaved"} PSElements
	 */
	/**
	 * Toggle the disabled states of interface elements.
	 * @overload
	 * @param {Partial<Record<PSElements, boolean>>} nameOrObj Object keyed by target elements' names and valued by
	 * whether or not to disable the elements.
	 * @returns {PrivateSandbox}
	 */
	/**
	 * Toggle the disabled state of an interface elements.
	 * @overload
	 * @param {PSElements} nameOrObj The target element's name.
	 * @param {boolean} disable Whether to disable the element.
	 * @returns {PrivateSandbox}
	 */
	/**
	 * @param {PSElements|Partial<Record<PSElements, boolean>>} nameOrObj
	 * @param {boolean} [disable]
	 * @returns {PrivateSandbox}
	 */
	setDisabled(nameOrObj, disable) {
		const elementMap = {
			dropdown: this.prfDropdown,
			input: this.prfInput,
			create: this.btnCreate,
			rename: this.btnRename,
			delete: this.btnDelete,
			save: this.btnSave,
			saveall: this.btnSaveAll,
			listunsaved: this.btnListUnsaved
		};
		if (typeof nameOrObj === 'string') {
			if (typeof disable !== 'boolean') {
				throw new TypeError('"disable" is not a boolean value.');
			}
			elementMap[nameOrObj].setDisabled(disable);
		} else if (typeof nameOrObj === 'object' && !Array.isArray(nameOrObj) && nameOrObj !== null) {
			for (const key in nameOrObj) {
				elementMap[key].setDisabled(nameOrObj[key]);
			}
		} else {
			throw new TypeError('"nameOrObj" is neither a string nor an object.');
		}
		return this;
	}

	/**
	 * Perform an action to modify a profile when the given button is clicked.
	 * @param {"create"|"rename"|"delete"} action
	 * @returns {void}
	 */
	modifyProfile(action) {
		this.toggleOverlay(true);
		this.getValidatedValue().then((v) => {
			if (v) {
				if (action === 'create') {
					this.createProfile(v);
				} else if (action === 'rename') {
					this.renameProfile(v);
				} else {
					this.deleteProfile(v);
				}
			} else {
				throw new Error('The ' + this.mwString.ucFirst(action) + ' button has been clicked when the input value is invalid.');
			}
			this.toggleOverlay(false);
		});
	}

	/**
	 * Create a profile. This method is only to be called by {@link modifyProfile}.
	 * @param {string} name Validated profile name
	 * @returns {void}
	 * @private
	 */
	createProfile(name) {

		// Register the new profile
		this.profiles[name] = '';

		// If there's a deleted profile named the same, mark this profile as not deleted
		let index;
		if ((index = this.deletedProfiles.findIndex((v) => v === name)) !== -1) {
			this.deletedProfiles.splice(index, 1);
		}

		// Change interface contents
		this.prfDropdown.getMenu().addItems([new OO.ui.MenuOptionWidget({label: name, data: name})]).selectItemByLabel(name);
		mw.notify(mw.format(getMessage('message-profiles-create-done'), name), {type: 'success'});

	}

	/**
	 * Rename a profile. This method is only to be called by {@link modifyProfile}.
	 * @param {string} name Validated profile name
	 * @returns {void}
	 * @private
	 */
	renameProfile(name) {
		const oldName = this.getSelectedProfile();
		if (oldName) {
			OO.ui.confirm(mw.format(getMessage('message-profiles-rename-confirm'), oldName, name), {
				size: 'medium'
			}).then((confirmed) => {
				if (confirmed) {

					// Register the new profile and delete the old one
					this.profiles[name] = this.profiles[oldName];
					this.markAsDeleted(oldName);

					// If the new profile is marked as deleted, unmark it because we're creating it
					let index;
					if ((index = this.deletedProfiles.findIndex((v) => v === name)) !== -1) {
						this.deletedProfiles.splice(index, 1);
					}

					// Leave a log of the rename
					if (this.renameLogs[oldName]) { // If the old profile has renaming logs
						this.renameLogs[name] = this.renameLogs[oldName].concat(oldName);
						delete this.renameLogs[oldName];
					} else { // If the old profile doesn't have renaming logs
						this.renameLogs[name] = [oldName];
					}

					// Change interface contents
					const menu = this.prfDropdown.getMenu();
					// @ts-ignore
					const /** @type {OO.ui.MenuOptionWidget} */ oldItem = menu.getItemFromLabel(oldName);
					index = menu.getItemIndex(oldItem);
					menu.addItems([new OO.ui.MenuOptionWidget({label: name, data: name})], index + 1).selectItemByLabel(name).removeItems([oldItem]);
					mw.notify(mw.format(getMessage('message-profiles-rename-done'), oldName, name), {type: 'success'});

				}
			});
		} else {
			throw new ReferenceError('"getSelectedProfile" returned null or an empty string.');
		}
	}

	/**
	 * Delete a profile. This method is only to be called by {@link modifyProfile}.
	 * @param {string} name Validated profile name
	 * @returns {void}
	 * @private
	 */
	deleteProfile(name) {
		OO.ui.confirm(mw.format(getMessage('message-profiles-delete-confirm'), name), {
			size: 'medium'
		}).then((confirmed) => {
			if (confirmed) {

				// Update profiles
				this.markAsDeleted(name);

				// Change interface contents
				const menu = this.prfDropdown.getMenu();
				/** @type {OO.ui.MenuOptionWidget[]} */
				// @ts-ignore
				const options = menu.items;
				let err = true;
				for (let i = 0; i < options.length; i++) {
					if (options[i].getLabel() === name) {
						err = false;
						if (options.length >= 2) {
							menu.selectItem(options[i === 0 ? i + 1 : i - 1]).removeItems([options[i]]);
						} else {
							menu.removeItems([options[i]]);
						}
						break;
					}
				}
				if (err) {
					throw new Error('There is no option labelled as "' + name + '".');
				}

				mw.notify(mw.format(getMessage('message-profiles-delete-done'), name), {type: 'success'});

			}
		});
	}

	/**
	 * Mark a profile as deleted.
	 *
	 * This method:
	 * - First deletes `this.profiles[name]`.
	 * - Pushes `name` into `this.deletedProfiles` (if `this.savedProfiles` has a property for `name`).
	 * @param {string} name
	 * @returns {PrivateSandbox}
	 */
	markAsDeleted(name) {
		delete this.profiles[name];
		if (this.getProfileNames(true).indexOf(name) !== -1) {
			// Mark the profile as deleted if the saved profiles have the profile to be deleted
			this.deletedProfiles.push(name);
		}
		return this;
	}

	/**
	 * Get an array of unsaved profile names.
	 * @param {string} [name] If provided, only get unsaved profile names associated with `name`.
	 * @returns {string[]}
	 */
	getUnsavedProfiles(name) {

		// Collect the names of profiles that have yet to be saved
		const ret = Object.keys(this.profiles).reduce(/** @param {string[]} acc */ (acc, name) => {
			// Get profiles that have been newly created or modified
			if (acc.indexOf(name) === -1 && (
				!this.savedProfiles[name] || this.savedProfiles[name].join('') !== this.profiles[name]
			)) {
				acc.push(name);
			}
			return acc;
		// Get profiles that have been renamed or deleted
		}, this.deletedProfiles.slice());

		if (!name) {
			return ret;
		} else {
			/**
			 * Previous names of the target profile, if any, which have already been deleted.
			 */
			const prev = (this.renameLogs[name] || []).filter((v) => this.deletedProfiles.indexOf(v) !== -1);

			// If "name" is specified, only include profiles with that name or previously associated with that name
			return ret.filter((el) => el === name || prev.indexOf(el) !== -1);
		}

	}

	/**
	 * Delete all data managed by PrivateSandbox.
	 * @returns {void}
	 */
	deleteData() {
		OO.ui.confirm(getMessage('message-deletedata-confirm'), {
			size: 'medium'
		}).then((confirmed) => {
			if (confirmed) {

				// Show a "now deleting" message
				this.sco.text(getMessage('message-deletedata-doing'), true).toggle(true);

				// Fetch the up-to-date user options from the API
				PrivateSandbox.fetchOptions().then((fetchedOptions) => {

					if (!fetchedOptions) {
						this.sco.toggle(false, 800).then(() => {
							mw.notify(getMessage('message-predeletedata-failed'), {type: 'error', autoHideSeconds: 'long'});
						});
						return;
					}

					// Collect profiles to delete
					const options = Object.keys(fetchedOptions).reduce(/** @param {Record<string, null>} acc */ (acc, key) => {
						if (/^userjs-pvtsand-.+?-\d+$/.test(key)) {
							acc[key] = null;
						}
						return acc;
					}, Object.create(null));
					options['userjs-pvtsand-welcomed'] = null; // Also add the welcome log

					// Delete data
					PrivateSandbox.saveOptions(options).then((success) => {
						if (success) {
							this.sco.text(getMessage('message-deletedata-done'), false);
						} else {
							this.sco.toggle(false, 800).then(() => {
								mw.notify(getMessage('message-deletedata-failed'), {type: 'error'});
							});
						}
					});

				});

			}
		});
	}

	/**
	 * Save a given profile.
	 * @overload
	 * @param {string} name
	 * @returns {void}
	 */
	/**
	 * Save all profiles.
	 * @overload
	 * @returns {void}
	 */
	/**
	 * @param {string} [name]
	 * @returns {void}
	 */
	saveProfiles(name) {

		// Show a "now saving" message
		this.sco.text(getMessage('message-save-doing'), true).toggle(true);

		// Fetch the newest profiles from the API
		PrivateSandbox.fetchOptions().then((fetchedOptions) => {

			// Exit if the fetching failed
			if (!fetchedOptions) {
				this.sco.toggle(false, 500).then(() => {
					mw.notify(getMessage('message-presave-failed'), {type: 'error', autoHideSeconds: 'long'});
				});
				return;
			}
			const newestProfiles = PrivateSandbox.objectifySavedOptions(fetchedOptions);

			// Check for edit conflicts
			const conflicts = Object.keys(newestProfiles).reduce(/** @param {Record<string, string>} acc */ (acc, key) => {
				const value = newestProfiles[key].join('');
				const oldValue = key in this.savedProfiles && this.savedProfiles[key].join('');
				if (typeof oldValue === 'string') {
					if (value !== oldValue) { // Profile has been modified elsewhere
						acc[key] = getMessage('message-conflict-modified');
					}
				} else { // Profile has been created elsewhere
					acc[key] = getMessage('message-conflict-created');
				}
				return acc;
			}, Object.create(null));
			Object.keys(this.savedProfiles).forEach((key) => {
				if (newestProfiles[key] === void 0) { // Profile has been deleted elsewhere
					conflicts[key] = getMessage('message-conflict-deleted');
				}
			});

			// Deal with edits conflicts
			/** @type {JQueryPromise<boolean?>} */
			let conflictPromise;
			if (Object.keys(conflicts).length) { // Edit conflict detected
				conflictPromise = (() => {
					this.sco.$overlay.css('z-index', 0); // Show the confirmation window on top
					return OO.ui.confirm(
						$('<div style="text-align: justify;">').append(
							getMessage('message-conflict-alert1'),
							$('<ul style="max-height: 5em; overflow-y: auto;">').append(
								Object.keys(conflicts).map((prof) => $('<li>').text(`"${prof}": ${conflicts[prof]}`))
							),
							getMessage('message-conflict-alert2')
						),
						{
							size: 'large',
							title: getMessage('title-conflict')
						}
					).then((confirmed) => {
						this.sco.$overlay.css('z-index', ''); // Reset to the default
						return confirmed;
					});
				})();
			} else {
				conflictPromise = $.Deferred().resolve(null);
			}

			// Continue the saving process
			conflictPromise.then((confirmed) => {

				if (confirmed === false) {
					this.sco.toggle(false);
					return;
				}

				// Collect profiles that need to be updated
				const options = this.getUnsavedProfiles(name).reduce(/** @param {Record<string, string?>} acc */ (acc, prof) => {
					/**
					 * @type {(string|null)[]}
					 */
					const values = [];
					if (typeof this.profiles[prof] === 'string') {
						// Push the profile's content that's been byte-split
						values.push(...this.byteSplit(this.profiles[prof]));
					}
					let gap;
					if (this.savedProfiles[prof] && (gap = this.savedProfiles[prof].length - values.length) > 0) {
						// If the profile previously had more entries, fill the gap with null
						// e.g. profile "pfl" had "pfl-0" and "pfl-1" (i.e. ['content1', 'content2']) but the "values" array
						// only has one element. In this case, the array should be padded (['content1'] => ['content1', null])
						values.push(...new Array(gap).fill(null));
					}
					if (!values.length) {
						throw new Error(`Unexpected error: Failed to collect values for the profile "${prof}".`);
					}
					for (let i = 0; i < values.length; i++) {
						// Register the values into the options object
						acc[`userjs-pvtsand-${prof}-${i}`] = values[i];
					}
					return acc;
				}, Object.create(null));

				// Save the profiles
				PrivateSandbox.saveOptions(options).then((success) => {

					let notifyResult;
					if (success) {

						notifyResult = () => mw.notify(getMessage('message-save-done'), {type: 'success'});
						mw.user.options.set(options);

						// Update saved profiles
						const keys = Object.keys(options).reduce(/** @param {string[]} acc */ (acc, key) => {
							const val = options[key];
							let m;
							if ((m = key.match(/^userjs-pvtsand-(.+?)-(\d+)$/))) { // $1: profile name, $2: index
								acc.push(m[1]);
								if (val) {
									if (!this.savedProfiles[m[1]]) {
										this.savedProfiles[m[1]] = [];
									}
									this.savedProfiles[m[1]][m[2]] = val;
								} else {
									delete this.savedProfiles[m[1]];
								}
							}
							return acc;
						}, []);

						// Update unsaved profiles, rename logs, and deleted profiles
						for (const key of keys) {
							let arr;
							if ((arr = this.savedProfiles[key])) {
								this.profiles[key] = arr.join('');
							} else {
								delete this.profiles[key];
							}
							if (this.renameLogs[key]) {
								delete this.renameLogs[key];
							}
						}
						this.deletedProfiles = this.deletedProfiles.filter((v) => keys.indexOf(v) === -1);

						// Update the disabled states of the save buttons
						mw.hook('pvtsand.content').fire(this.getEditorValue());

					} else {
						notifyResult = () => mw.notify(getMessage('message-save-failed'), {type: 'error'});
					}

					if (confirmed) {
						window.location.reload();
					} else {

						// Hide the "now saving" message and notify the result
						this.sco.toggle(false, 800).then(notifyResult);

						if (cfg.debug) {
							const {savedProfiles, profiles, deletedProfiles, renameLogs} = this;
							console.log({options, savedProfiles, profiles, deletedProfiles, renameLogs});
						}

					}

				});

			});

		});

	}

	/**
	 * Fetch user options from the API.
	 * @returns {JQueryPromise<Record<string, string>?>}
	 */
	static fetchOptions() {
		return new mw.Api().get({
			action: 'query',
			meta: 'userinfo',
			uiprop: 'options',
			formatversion: '2'
		}).then(/** @param {ApiResponseUserinfo} res */ (res) => {
			return res && res.query && res.query.userinfo && res.query.userinfo.options || null;
		}).catch((_, err) => {
			console.warn(err);
			return null;
		});
	}

	/**
	 * Split text into an array of 65530-or-less-byte elements. This is for when a profile content
	 * exceeds the byte length of 65530, which cannot be saved as a userjs option.
	 * @param {string} text
	 * @returns {string[]}
	 */
	byteSplit(text) {
		const maxBytes = 65530;
		if (this.mwString.byteLength(text) <= maxBytes) {
			return [text];
		} else {
			const ret = [];
			let acc = text;
			// eslint-disable-next-line no-constant-condition
			while (true) {
				const chunk = this.mwString.trimByteLength('', acc, maxBytes);
				ret.push(chunk.newVal);
				acc = acc.slice(chunk.newVal.length);
				if (this.mwString.byteLength(acc) <= maxBytes) {
					ret.push(acc);
					break;
				}
			}
			return ret;
		}
	}

	/**
	 * Parse a wikitext as HTML for preview.
	 * @param {string} wikitext Wikitext to parse for preview.
	 * @returns {void}
	 */
	preview(wikitext) {
		if (wikitext === this.lastPreviewed) {
			return;
		} else {
			this.lastPreviewed = wikitext;
		}
		this.previewApi.abort();
		this.$previewLoader.show();
		this.previewApi.post({
			action: 'parse',
			text: wikitext,
			title: 'Special:PrivateSandbox',
			prop: 'text|categorieshtml|modules|jsconfigvars',
			pst: true,
			disablelimitreport: true,
			disableeditsection: true,
			contentmodel: 'wikitext',
			formatversion: '2'
		}).then(/** @param {ApiResponseParse} res */ (res) => {
			const resParse = res && res.parse;
			if (resParse) {
				const {text, modules, modulestyles, categorieshtml} = resParse;
				if (modules.length) {
					mw.loader.load(modules);
				}
				if (modulestyles.length) {
					mw.loader.load(modulestyles);
				}
				return text + (categorieshtml || '');
			} else {
				return null;
			}
		}).catch(/** @param {object} err */ function(_, err) {
			if (err.exception === 'abort') {
				return '';
			} else {
				console.error(err);
				return null;
			}
		}).then(/** @param {string?} html */ (html) => {
			this.$previewLoader.hide();
			if (typeof html === 'string') {
				const $content = $(html);
				this.$previewContent.empty().append($content);
				mw.hook('wikipage.content').fire($content);
			} else {
				this.$previewContent.empty().append(
					$('<span>')
						.text(getMessage('message-preview-failed'))
						.css('color', 'red')
				);
			}
		});
	}

}

// Start-up
PrivateSandbox.init();

})();
//</nowiki>