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
	@version 1.0.1

\**************************************************************************************************/

// @ts-check
/// <reference path="./window/PrivateSandbox.d.ts" />
/* global mw, OO */
//<nowiki>
(() => {

// Exit on certain conditions
if (
	// User is not on Special:PrivateSandbox, or
	!(mw.config.get('wgNamespaceNumber') === -1 && /^(PrivateSandbox|PS)$/i.test(mw.config.get('wgTitle'))) ||
	// User is not logged in
	mw.config.get('wgUserId') === null
) {
	return;
}

/**
 * The ScreenOverlay class.
 */
class ScreenOverlay {

	/**
	 * @typedef {object} ScreenOverlayOptions
	 * @property {string} [text] The text to use to initialize ScreenOverlay.
	 * @property {boolean} [autoStart] Whether to auto-start ScreenOverlay, defaulted to `true`.
	 */
	/**
	 * Initialize a ScreenOverlay instance.
	 * @param {ScreenOverlayOptions} [options]
	 */
	constructor(options = {}) {

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
					'background-color: rgba(255, 255, 255, 0.8);' +
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
									$('<img>')
										.prop('src', 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Ajax_loader_metal_512.gif')
								)
						)
				)
		);

		// Initialize per the options
		if (options.text) {
			options.text = options.text.trim() ? options.text.trim() + ' ' : '';
			this.$text.text(options.text);
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
	 * @returns {ScreenOverlay}
	 */
	/**
	 * Get the text of the overlay.
	 * @overload
	 * @returns {string}
	 */
	/**
	 * @param {string} [str]
	 * @returns {ScreenOverlay|string}
	 */
	text(str) {
		if (typeof str === 'string') {
			str = str.trim() ? str.trim() + ' ' : '';
			this.$text.text(str);
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
		'label-profiles-edit-help': 'The profile name must consist only of alphanumeric characeters, underscores, and hyphens (<code>a-zA-Z0-9_-</code>).',
		'title-profiles-empty': 'Enter a profile name.',
		'title-profiles-invalidchars': 'The profile name must consist only of alphanumeric characeters, underscores, and hyphens.',
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
		'title-dialog-listunsaved': 'Unsaved profiles',
		'label-dialog-listunsaved-deleteditem': 'deleted',
		'message-save-doing': 'Saving...',
		'message-save-done': 'Saved the profile(s).',
		'message-save-failed': 'Failed to save the profile(s). Please see the browser console for details.'
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
		'title-dialog-listunsaved': '未保存プロファイル',
		'label-dialog-listunsaved-deleteditem': '削除',
		'message-save-doing': '保存中...',
		'message-save-done': 'プロファイルを保存しました。',
		'message-save-failed': 'プロファイルの保存に失敗しました。詳細はブラウザーコンソールをご覧ください。'
	}
};

const cfg = Object.assign({
	debug: false
}, window.privateSandboxConfig);

/**
 * The PrivateSandbox class.
 */
class PrivateSandbox {

	static messages = i18n[mw.config.get('wgUserLanguage').replace(/-.*$/, '')] || i18n.en;

	/**
	 * Get an interface message.
	 * @param {keyof PrivateSandboxMessage} key
	 * @returns {string}
	 * @static
	 */
	static getMessage(key) {
		return PrivateSandbox.messages[key];
	}

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
					'border: 1px solid #ccc;' +
				'}' +
				'#pvtsand-profiles-buttons {' +
					'margin-top: 12px;' +
					'margin-bottom: 4px;' +
				'}' +
				'#pvtsand-profiles-input-warning.pvtsand-warning {' +
					'color: red;' +
				'}' +
				'#pvtsand-editor-container {' +
					'width: 100%;' +
					'position: relative;' +
				'}' +
				'#pvtsand-editor-overlay {' +
					'width: 100%;' +
					'height: 100%;' +
					'position: absolute;' +
					'top: 0;' +
					'left: 0;' +
					'z-index: 10;' +
					'border: 1px solid #c0c0c0;' +
					'background-color: rgba(200, 204, 209, 0.6);' +
					'cursor: not-allowed;' +
					'user-select: none;' +
				'}' +
				'.pvtsand-editor {' +
					'font-size: 82%;' +
				'}' +
				'#pvtsand-savebutton-container {' +
					'margin-top: 1em;' +
				'}';
			document.head.appendChild(style);

			// Show a "now loading" overlay
			const sco = new ScreenOverlay({
				text: PrivateSandbox.getMessage('message-load-interface'),
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
				mw.notify(PrivateSandbox.getMessage('message-load-failed'), {type: 'error', autoHide: false});
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
		// @ts-ignore
		return new mw.Api({timeout: 0}).postWithToken('csrf', {
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
		 * Initial options for the profile selector dropdown.
		 * @type {OO.ui.MenuOptionWidget[]}
		 */
		const ddItems = [];
		/**
		 * @type {Record<string, string>}
		 */
		const options = mw.user.options.get();

		/**
		 * Profiles that have been saved to the server, stored as arrays.
		 * @type {Record<string, string[]>}
		 */
		this.savedProfiles = Object.keys(options).reduce(/** @param {Record<string, string[]>} acc */ (acc, key) => {
			const m = key.match(/^userjs-pvtsand-(.+?)-(\d+)$/); // $1: profile name, $2: index
			if (m) {
				if (!acc[m[1]]) {
					acc[m[1]] = [];
					ddItems.push(new OO.ui.MenuOptionWidget({label: m[1], data: m[1]}));
				}
				acc[m[1]][m[2]] = options[key];
			}
			return acc;
		}, Object.create(null));

		/**
		 * Profiles that have yet to be saved to the server, stored as strings.
		 * @type {Record<string, string>}
		 */
		this.profiles = Object.keys(this.savedProfiles).reduce(/** @param {Record<string, string>} acc */ (acc, key) => {
			acc[key] = this.savedProfiles[key].join('');
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
			label: PrivateSandbox.getMessage('label-profiles'),
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
			placeholder: PrivateSandbox.getMessage('label-profiles-edit-placeholder'),
			validate: (v) => {
				let title = '';
				let needWarning = false;
				if (!v) {
					title = PrivateSandbox.getMessage('title-profiles-empty');
				} else if (/[^a-zA-Z0-9_-]/.test(v)) {
					title = PrivateSandbox.getMessage('title-profiles-invalidchars');
					needWarning = true;
				} else if (this.mwString.byteLength(v) > 255) {
					title = PrivateSandbox.getMessage('title-profiles-toomanychars');
					needWarning = true;
				}
				this.prfInput.setTitle(title);
				$('#pvtsand-profiles-input-warning').toggleClass('pvtsand-warning', needWarning);
				return title === '';
			}
		});

		prfFieldset.addItems([
			new OO.ui.FieldLayout(this.prfDropdown, {
				label: PrivateSandbox.getMessage('label-profiles-select'),
				align: 'top'
			}),
			new OO.ui.FieldLayout(this.prfInput, {
				label: PrivateSandbox.getMessage('label-profiles-edit'),
				align: 'top',
				help: new OO.ui.HtmlSnippet(`<span id="pvtsand-profiles-input-warning">${PrivateSandbox.getMessage('label-profiles-edit-help')}</span>`),
				helpInline: true
			})
		]);

		/**
		 * The button to create a profile.
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnCreate = new OO.ui.ButtonWidget({
			label: PrivateSandbox.getMessage('label-profiles-button-create'),
			flags: 'progressive',
			icon: 'add'
		});

		/**
		 * The button to rename a profile.
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnRename = new OO.ui.ButtonWidget({
			label: PrivateSandbox.getMessage('label-profiles-button-rename'),
			icon: 'edit'
		});

		/**
		 * The button to delete a profile.
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnDelete = new OO.ui.ButtonWidget({
			label: PrivateSandbox.getMessage('label-profiles-button-delete'),
			flags: 'destructive',
			icon: 'trash'
		});

		/**
		 * The container of the editor textarea.
		 * @type {JQuery<HTMLDivElement>}
		 */
		this.$editorOverlay = $('<div>');

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
			label: PrivateSandbox.getMessage('label-profiles-save'),
			title: PrivateSandbox.getMessage('title-profiles-save'),
			flags: ['progressive', 'primary'],
			icon: 'check'
		});

		/**
		 * The button to save changes to all the profiles.
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnSaveAll = new OO.ui.ButtonWidget({
			label: PrivateSandbox.getMessage('label-profiles-saveall'),
			title: PrivateSandbox.getMessage('title-profiles-saveall'),
			flags: 'progressive',
			icon: 'checkAll'
		});

		/**
		 * The button to show a list of unsaved profiles.
		 * @type {OO.ui.ButtonWidget}
		 */
		this.btnListUnsaved = new OO.ui.ButtonWidget({
			label: PrivateSandbox.getMessage('label-profiles-listunsaved'),
			title: PrivateSandbox.getMessage('title-profiles-listunsaved'),
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
								prof += ` (${PrivateSandbox.getMessage('label-dialog-listunsaved-deleteditem')})`;
							}
							return $('<li>').text(prof);
						})
					),
				{
					title: PrivateSandbox.getMessage('title-dialog-listunsaved'),
					size: 'medium'
				}
			);
		});

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
								label: PrivateSandbox.getMessage('label-profiles-save-help'),
								classes: ['oo-ui-inline-help']
							}).$element
						),
					$('<div>')
						.prop('id', 'pvtsand-editor-container')
						.append(
							this.$editorOverlay
								.prop({
									id: 'pvtsand-editor-overlay',
									title: PrivateSandbox.getMessage('title-editor-disabled')
								}),
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
							this.btnListUnsaved.$element
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

		// Set up events

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

			// Make the editor unreachable when there's no profile
			this.$editorOverlay.toggle(!profileName);

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

		// Add events to the buttons
		this.btnCreate.off('click').on('click', () => {
			this.modifyProfile('create');
		});
		this.btnRename.off('click').on('click', () => {
			this.modifyProfile('rename');
		});
		this.btnDelete.off('click').on('click', () => {
			this.modifyProfile('delete');
		});
		this.btnSave.off('click').on('click', () => {
			this.saveProfiles(this.getSelectedProfile(true));
		});
		this.btnSaveAll.off('click').on('click', () => {
			this.saveProfiles();
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
		mw.hook('pvtsand.content').add(/** @param {string} value */ (value) => {

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
				e.returnValue = PrivateSandbox.getMessage('message-unload'); // Ignored on most modern browsers
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
	 * Welcome the user on their first visit to the private sandbox. This is to be called every time when a class instance is created.
	 * @returns {void}
	 */
	welcomeOnFirstVisit() {
		const optionKey = 'userjs-pvtsand-welcomed';
		if (mw.user.options.get(optionKey) !== '') {
			PrivateSandbox.saveOptions({[optionKey]: ''}).then(() => {
				this.sco.toggle(false, 1000).then(() => {
					OO.ui.alert(PrivateSandbox.getMessage(this.processed ? 'message-load-updated' : 'message-load-welcome'), {
						title: 'Welcome!',
						size: 'medium'
					});
				});
			});
		} else {
			this.sco.toggle(false, 1000);
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
		mw.notify(mw.format(PrivateSandbox.getMessage('message-profiles-create-done'), name), {type: 'success'});

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
			OO.ui.confirm(mw.format(PrivateSandbox.getMessage('message-profiles-rename-confirm'), oldName, name), {
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
					mw.notify(mw.format(PrivateSandbox.getMessage('message-profiles-rename-done'), oldName, name), {type: 'success'});

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
		OO.ui.confirm(mw.format(PrivateSandbox.getMessage('message-profiles-delete-confirm'), name), {
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

				mw.notify(mw.format(PrivateSandbox.getMessage('message-profiles-delete-done'), name), {type: 'success'});

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
		this.sco.text(PrivateSandbox.getMessage('message-save-doing')).toggle(true);

		// Collect profiles that need to be updated
		const options = this.getUnsavedProfiles(name).reduce(/** @param {Record<string, string?>} acc */ (acc, prof) => {
			/**
			 * @type {(string|null)[]}
			 */
			const values = [];
			if (this.profiles[prof]) {
				// Push the profile's content that's been byte-split
				values.push(...this.byteSplit(this.profiles[prof]));
			}
			let gap;
			if (this.savedProfiles[prof] && (gap = this.savedProfiles[prof].length - values.length) > 0) {
				// If the profile previously had more entries, fill the gap with null
				// e.g. profile "pfl" had "pfl-0" and "pfl-1" (i.e. ['content1', 'content2']) but the "values" array only has one element
				// In this case, the array should be padded (['content1'] => ['content1', null])
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

				notifyResult = () => mw.notify(PrivateSandbox.getMessage('message-save-done'), {type: 'success'});
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
				notifyResult = () => mw.notify(PrivateSandbox.getMessage('message-save-failed'), {type: 'error'});
			}

			// Hide the "now saving" message and notify the result
			this.sco.toggle(false, 1000).then(notifyResult);

			if (cfg.debug) {
				const {savedProfiles, deletedProfiles, renameLogs} = this;
				console.log({options, savedProfiles, deletedProfiles, renameLogs});
			}

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

}

// Start-up
PrivateSandbox.init();

})();
//</nowiki>