/*****************************************************************************************\

	PrivateSandboxGlobal
	Access [[Special:PrivateSandbox]] for a sandbox that other people cannot view.

	Original script:
	@author [[User:SD0001]]
	@link https://en.wikipedia.org/wiki/User:SD0001/private-sandbox.js

	This script:
	@author [[User:Dragoniez]]
	@version 2.0.1

	This script differs from the original in the following respects:
	* Has a dynamic preview feature.
	* Correctly warns the user if the content to save exceeds the size limit.
	* Scripts like navigation popups work on links in the preview field.

	Note that the Wikitext extension in [[Visual Studio Code]] can be a good alternative
	of this script, which has a preview feature and isn't affected by the user's internet
	connections. But still, PrivateSandboxGlobal provides the user with an interface that
	facilitates link interactions, especially when they use other scripts that serve to
	add further functionalities to wikilinks.

\*****************************************************************************************/
//<nowiki>
//@ts-check
/* eslint-disable @typescript-eslint/no-this-alias */
/* global mw */

(function() {
// *********************************************************************************************************

if (!(mw.config.get('wgNamespaceNumber') === -1 && /^(PrivateSandbox|PS)$/i.test(mw.config.get('wgTitle')))) {
	return;
}

var PrivateSandbox = /** @class */ (function() {

	/**
	 * @typedef {"en"|"ja"} Langs
	 */
	/**
	 * @typedef Msg
	 * @type {object}
	 * @property {string} preview
	 * @property {string} previewfailed
	 * @property {string} save
	 * @property {string} saving
	 * @property {string} saved
	 * @property {string} savefailed
	 * @property {string} cannotsave `$1`: the size of the content (number), `$2`: maximum size (number)
	 * @property {string} savedon
	 * @property {string} loading
	 * @property {string} loadfailed
	 * @property {string} exit
	 */
	/**
	 * @typedef ConstructorConfig
	 * @type {object}
	 * @property {Langs} [lang]
	 */

	/**
	 * Initialize a PrivateSandbox instance. This is only to be called by {@link PrivateSandbox.init}.
	 * @param {ConstructorConfig} [config]
	 * @constructor
	 */
	function PrivateSandbox(config) {

		/** @type {ConstructorConfig=} */
		// @ts-ignore
		var wConfig = window.privateSandboxConfig;
		var cfg = wConfig || config || {};

		/** @type {string} @readonly */
		this.scriptName = 'Private sandbox';

		/** @type {string} @readonly */
		this.optionName = 'userjs-pvt-sandbox';

		/** @type {Record<Langs, Msg>} */
		var msg = {
			en: {
				preview: 'Preview:',
				previewfailed: 'Failed to fetch preview.',
				save: 'Save',
				saving: 'Saving',
				saved: 'Saved',
				savefailed: 'Failed to save',
				cannotsave: 'The size of the content ($1 bytes) exceeds the maximum size of $2 bytes. Please reduce it.',
				savedon: 'Last saved on ',
				loading: 'Loading the interface',
				loadfailed: 'Failed to load the interface.',
				exit: 'Your changes have not been saved. Are you sure you want to leave the page?'
			},
			ja: {
				preview: 'プレビュー:',
				previewfailed: 'プレビューに失敗しました。',
				save: '保存',
				saving: '保存中',
				saved: '保存成功',
				savefailed: '保存失敗',
				cannotsave: '本文の容量 ($1バイト) が上限容量 ($2バイト) を超過しています。本文を削減してください。',
				savedon: '最終保存: ',
				loading: 'インターフェースを読み込み中',
				loadfailed: 'インターフェースの読み込みに失敗しました。',
				exit: '変更が保存されていません。ページを閉じますか?'
			}
		};

		/** @type {Msg} */
		this.msg = cfg.lang && msg[cfg.lang] || msg.en;

	}

	var /** @type {MwString} */ mwString;
	var /** @type {mw.Api} */ api;
	/**
	 * Load modules and create the PrivateSandbox interface.
	 * @returns {JQueryPromise<PrivateSandbox>}
	 */
	PrivateSandbox.init = function() {
		var modules = [
			'mediawiki.String',
			'mediawiki.user',
			'mediawiki.api'
		];
		return mw.loader.using(modules).then(function(require) {
			mwString = require(modules[0]);
			api = new mw.Api();
			/** @type {string} */
			var userLang = mw.user.options.get('language') || 'en';
			// @ts-ignore
			var PS = new PrivateSandbox({lang: userLang});
			PS.createInterface();
			return PS;
		});
	};

	/**
	 * Get an interface message.
	 * @param {keyof Msg} key
	 * @returns {string}
	 */
	PrivateSandbox.prototype.getMessage = function(key) {
		return this.msg[key];
	};

	/**
	 * Create the PrivateSandbox interface.
	 * @returns {void}
	 */
	PrivateSandbox.prototype.createInterface = function() {

		document.title = this.scriptName + ' - ' + mw.config.get('wgSiteName');

		// Collect DOM elements
		var $heading = $('.mw-first-heading');
		var $content = $('.mw-body-content');
		if (!$heading.length || !$content.length) {
			mw.notify(this.getMessage('loadfailed'));
			return;
		}
		$heading.text(this.scriptName);

		// Add a style tag
		var style = document.createElement('style');
		style.textContent =
			// Div margin in the body
			'#ps-body > div {' +
				'margin-bottom: 0.5em;' +
			'}' +
			// "Last saved on" label
			'#ps-savedon.ps-shown::before {' +
				'content: "' + this.getMessage('savedon') + '";' +
			'}' +
			'#ps-saving.ps-shown + #ps-savedon.ps-shown {' +
				'margin-left: 1em;' +
			'}';
		document.head.appendChild(style);

		// Create interface elements
		var /** @type {JQuery<HTMLDivElement>} */ $psBody;
		var /** @type {JQuery<HTMLDivElement>} */ $psLoading;
		var /** @type {JQuery<HTMLDivElement>} */ $psTextareaWrapper;
		var /** @type {JQuery<HTMLTextAreaElement>} */ $psTextarea;
		var /** @type {JQuery<HTMLDivElement>} */ $psSaveWrapper;
		var /** @type {JQuery<HTMLInputElement>} */ $psSave;
		var /** @type {JQuery<HTMLSpanElement>} */ $psSaving;
		var /** @type {JQuery<HTMLSpanElement>} */ $psSavedOn;
		var /** @type {JQuery<HTMLDivElement>} */ $psPreviewWrapper;
		var /** @type {JQuery<HTMLSpanElement>} */ $psPreviewLoading;
		var /** @type {JQuery<HTMLDivElement>} */ $psPreview;
		($psBody = $('<div>'))
			.prop('id', 'ps-body')
			.append(($psLoading = $('<div>'))
				.prop('id', 'ps-loading')
				.text(this.getMessage('loading'))
				.append(getIcon('doing'))
			)
			.append(($psTextareaWrapper = $('<div>'))
				.prop('id', 'ps-textarea-wrapper')
				.css('margin-top', '1em')
				.hide()
				.append(($psTextarea = $('<textarea>'))
					.val(mw.user.options.get(this.optionName) || '')
					.prop({
						id: 'ps-textarea',
						cols: 80,
						rows: 20,
						tabindex: 1
					})
					.css('font-family', 'inherit')
				)
			)
			.append(($psSaveWrapper = $('<div>'))
				.prop('id', 'ps-save-wrapper')
				.hide()
				.append(($psSave = $('<input>'))
					.prop({
						id: 'ps-save',
						type: 'button'
					})
					.val(this.getMessage('save'))
					.css('margin-right', '1em')
				)
				.append(($psSaving = $('<span>'))
					.prop('id', 'ps-saving')
				)
				.append(($psSavedOn = $('<span>'))
					.prop('id', 'ps-savedon')
				)
			)
			.append(($psPreviewWrapper = $('<div>'))
				.prop('id', 'ps-preview-wrapper')
				.css({
					backgroundColor: '#f8f8f8',
					border: '1px solid darkgray',
					padding: '0.5em 1em'
				})
				.hide()
				.text(this.getMessage('preview'))
				.append(($psPreviewLoading = $('<span>')))
				.append(($psPreview = $('<div>'))
					.prop('id', 'ps-preview')
					.css('text-align', 'justify')
				)
			);
		$content.empty().append($psBody);

		// Save button event
		var /** @type {NodeJS.Timeout} */ psSaveTimeout;
		var _this = this;
		$psSave.off('click').on('click', function() {

			clearTimeout(psSaveTimeout);
			var content = $psTextarea[0].value;
			var bytes = mwString.byteLength(content);
			var maxBytes = 65530;
			if (bytes > maxBytes) {
				$psSaving
					.empty()
					.text(mw.format(
						_this.getMessage('cannotsave'),
						numberWithCommas(bytes),
						numberWithCommas(maxBytes)
					))
					.append(getIcon('failed'))
					.addClass('ps-shown');
				psSaveTimeout = setTimeout(function() {
					$psSaving.empty().removeClass('ps-shown');
				}, 10000);
				return;
			}

			$psTextarea.prop('disabled', true);
			$psSave.prop('disabled', true);
			$psSaving
				.empty()
				.text(_this.getMessage('saving'))
				.append(getIcon('doing'))
				.addClass('ps-shown');
			$psSavedOn
				.text('')
				.removeClass('ps-shown');

			api.saveOption(_this.optionName, content)
				.then(function() {
					$psSaving
						.empty()
						.text(_this.getMessage('saved'))
						.append(getIcon('done'));
					var curTimestamp = new Date().toJSON().split('.')[0];
					$psSavedOn
						.text(curTimestamp)
						.addClass('ps-shown')
						.data('previous', curTimestamp);
					mw.user.options.set(_this.optionName, content);
				})
				.catch(function(_, err) {
					console.error(err);
					$psSaving
						.empty()
						.text(_this.getMessage('savefailed'))
						.append(getIcon('failed'));
					var /** @type {string=} */ prevTimestamp = $psSavedOn.data('previous');
					if (prevTimestamp) {
						$psSavedOn.text(prevTimestamp).addClass('ps-shown');
					}
				})
				.then(function() {
					$psTextarea.prop('disabled', false);
					$psSave.prop('disabled', false);
					psSaveTimeout = setTimeout(function() {
						$psSaving.empty().removeClass('ps-shown');
					}, 3000);
				});

		});

		// Preview handlers
		/**
		 * @param {string?} innerHTML Parsed preview. If null, an error message is appended instead.
		 * @returns {void}
		 */
		var setPreviewHTML = function(innerHTML) {
			$psPreview.prop('innerHTML',
				innerHTML === null ?
				'<span style="color:mediumvioletred;">' + _this.getMessage('previewfailed') + '</span>' :
				innerHTML
			);
		};
		/**
		 * @param {string?} wikitext Wikitext to parse for preview. If null, an error message is appended instead.
		 * @returns {JQueryPromise<void>}
		 */
		var updatePreviewHTML = function(wikitext) {
			if (wikitext === null) {
				setPreviewHTML(wikitext);
				return $.Deferred().resolve();
			} else {
				return getPreviewHTML(wikitext).then(setPreviewHTML);
			}
		};

		// Initial setup
		(/** @returns {JQueryPromise<void>} */ function() {
			/** @type {string?} */
			var content = mw.user.options.get(_this.optionName);
			if (!content) {
				setPreviewHTML('');
				return $.Deferred().resolve();
			}
			return updatePreviewHTML(content);
		})()
		.then(function() {
			$psLoading.remove();
			$psTextareaWrapper.show();
			$psSaveWrapper.show();
			$psPreviewWrapper.show();
		});

		// Textarea input event handler
		var /** @type {NodeJS.Timeout} */ previewTimeout;
		$psTextarea.off('input').on('input', function() {
			var textarea = this;
			clearTimeout(previewTimeout);
			previewTimeout = setTimeout(function() {
				$psPreviewLoading.append(getIcon('doing'));
				updatePreviewHTML(textarea.value).then(function() {
					mw.hook('wikipage.content').fire($psPreview);
					$psPreviewLoading.empty();
				});
			}, 1500);
		});

		// Warn for unsaved changes before unloading the page
		window.onbeforeunload = function(e) {
			if ($psTextarea.val() !== mw.user.options.get(_this.optionName)) {
				e.returnValue = _this.getMessage('exit');
				return e.returnValue;
			}
		};

	};

	/**
	 * Separate a number with commas by 3 digits.
	 * @param {number} num
	 * @returns {string}
	 */
	function numberWithCommas(num) {
		return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}

	/**
	 * Parse a wikitext as HTML for preview.
	 * @param {string} wikitext Wikitext to parse for preview.
	 * @returns {JQueryPromise<string?>} Parsed wikitext. Null on error.
	 */
	function getPreviewHTML(wikitext) {
		return api.post({
			action: 'parse',
			text: wikitext,
			title: 'Special:PrivateSandbox',
			prop: 'text|categorieshtml|modules|jsconfigvars',
			pst: true,
			disablelimitreport: true,
			disableeditsection: true,
			contentmodel: 'wikitext',
			formatversion: '2'
		}).then(function(res) {
			var resParse, rawHtml;
			if (res && (resParse = res.parse) && (rawHtml = resParse.text)) {
				if (resParse.modules.length) {
					mw.loader.load(resParse.modules);
				}
				if (resParse.modulestyles.length) {
					mw.loader.load(resParse.modulestyles);
				}
				return rawHtml + (resParse.categorieshtml || '');
			} else {
				return null;
			}
		}).catch(function(_, err) {
			console.warn(err);
			return null;
		});
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

	return PrivateSandbox;

})();

PrivateSandbox.init();

// *********************************************************************************************************
})();
//</nowiki>
