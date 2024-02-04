/*****************************************************************************************\
	MovePageWarnings
	Generate warnings on Special:Movepage, per the states of the move destination.
	@author [[User:Dragoniez]]
	@version 1.1.3
\*****************************************************************************************/

/* eslint-disable @typescript-eslint/no-this-alias */
// @ts-check
/* global mw */
//<nowiki>

(function() {

	// Check whether we should run the script
	var moveFrom = mw.config.get('wgRelevantPageName').replace(/_/g, ' ');
	if (!(
		// User is on Special:Movepage, and
		mw.config.get('wgCanonicalSpecialPageName') === 'Movepage' &&
		// User isn't on the root of Special:Movepage, and
		moveFrom && moveFrom !== mw.config.get('wgPageName').replace(/_/g, ' ') &&
		// User has the right to move pages, and
		mw.config.get('wgUserGroups').indexOf('autoconfirmed') !== -1 &&
		// Browser is compatible with MutationObserver (we have to be able to detect changes in software-defined OOUI elements)
		MutationObserver
	)) {
		// If any of the above lacks, stop running the script
		return;
	}

	// Define main functions, using a class
	var MovePageWarnings = /** @class */ (function() {

		// Collect all localized, canonical namespace prefixes
		var wgFormattedNamespaces = mw.config.get('wgFormattedNamespaces');
		var prefixes = Object.keys(wgFormattedNamespaces).reduce(/** @param {string[]} acc */ function(acc, key) {
			var val = wgFormattedNamespaces[key];
			if (val) acc.push(val); // Except for the main namespace
			return acc;
		}, []);

		/**
		 * Sanitize a localized namespace prefix.
		 * @param {string} prefix
		 * @returns {string} An empty string if there's no match with any of the localized namespace prefixes. ("(Main)" -> "")
		 */
		var sanitizePrefix = function(prefix) {
			return prefixes.some(function(pfx) { return pfx === prefix; }) ? prefix : '';
		};

		// Create namespace alias regex
		var wgNamespaceIds = mw.config.get('wgNamespaceIds');
		var aliases = Object.keys(wgNamespaceIds).reduce(/** @param {string[]} acc */ function(acc, alias) {
			if (alias) acc.push(alias.replace(/_/g, '[_ ]'));
			return acc;
		}, []);
		var rWhitespaceStr = '[ _\u00A0\u1680\u180E\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]*'; // Stringified `\s`, including underscore and excluding tab
		var rAliases = new RegExp('^' + rWhitespaceStr + '(' + aliases.join('|') + ')' + rWhitespaceStr + ':', 'i');

		/**
		 * Regex for unicode bidirectional characters (from `MediaWikiTitleCodec::splitTitleString()` in PHP).
		 */
		var rUnicodeBidi = /[\u200E\u200F\u202A-\u202E]+/g;

		/**
		 * Initialize a MovePageWarnings instance.
		 *
		 * @constructor
		 * @param {Element} prefixLabel
		 * @param {HTMLInputElement} titleInput
		 * @param {JQuery<HTMLElement>} $submitButton
		 */
		function MovePageWarnings(prefixLabel, titleInput, $submitButton) {

			MovePageWarnings.addStyleTag();

			// Define class properties

			/**
			 * The page name of the moving target (the "from" page name).
			 * @type {string}
			 * @readonly
			 */
			this.target = moveFrom;

			/**
			 * The value selected in the namespace selector dropdown (updated in the callback of MutationObserver).
			 * @type {string}
			 */
			this.prefix = sanitizePrefix(prefixLabel.innerHTML);

			/**
			 * The input tag in the OOUI InputWidget used as a wgTitle specifier.
			 * @type {HTMLInputElement}
			 * @readonly
			 */
			this.titleInput = titleInput;

			/**
			 * The span tag in the OOUI button for form submission.
			 * @type {JQuery<HTMLSpanElement>}
			 * @readonly
			 */
			this.$submitButton = $submitButton;

			/**
			 * The "move associated talk page" button.
			 * @type {HTMLInputElement?}
			 * @readonly
			 */
			this.moveTalkBox = document.querySelector('#wpMovetalk > input');

			/**
			 * Stores the page name of the move destination last inputted.
			 * @type {string}
			 */
			this.lastPagename = moveFrom;

			/**
			 * Whether the current user can delete pages.
			 * @type {boolean}
			 * @readonly
			 */
			// @ts-ignore
			this.candelete = mw.config.get('wgUserGroups', []).concat(mw.config.get('wgGlobalGroups', [])).some(function(group) {
				return ['eliminator', 'sysop', 'interface-admin', 'global-deleter', 'staff', 'steward', 'sysadmin'].indexOf(group) !== -1;
			});

			/** @type {mw.Api} @readonly */
			this.api = new mw.Api();

			// Watch the move destination specifiers
			var _this = this;
			var inputTimeout;
			/**
			 * The input event handler.
			 * @param {boolean} [moveTalkChanged]
			 * @param {boolean} [noTimeout]
			 */
			var initWarnings = function(moveTalkChanged, noTimeout) {
				var mtc = !!moveTalkChanged;
				clearTimeout(inputTimeout);
				inputTimeout = setTimeout(function() {
					_this.updateWarnings(mtc);
				}, noTimeout ? 0 : 1000);
			};

			// Event listener for changes in the namespace prefix
			new MutationObserver(function(mutations) {
				var val = mutations[1] && mutations[1].addedNodes[0] && mutations[1].addedNodes[0].nodeValue;
				if (val) {
					_this.prefix = sanitizePrefix(val); // Update prefix
					initWarnings();
				}
			}).observe(prefixLabel, {
				childList: true,
				subtree: true
			});

			// Event listener for changes in the title
			this.titleInput.addEventListener('input', function() {
				initWarnings();
			});

			// Event listener for changes in "move associated talk page"
			if (this.moveTalkBox) {
				this.moveTalkBox.addEventListener('change', function() {
					initWarnings(true);
				});
			}

			/**
			 * The wrapper div for warning messages.
			 * @type {JQuery<HTMLDivElement>}
			 */
			this.$warning = $('<div>');
			this.$warning
				.addClass('mw-message-box mw-message-box-warning')
				.prop('id', 'mpw-warnings')
				.hide();

			/**
			 * The warning message list.
			 * @type {JQuery<HTMLOListElement>}
			 */
			this.$warningList = $('<ol>');
			this.$warningList.prop('id', 'mpw-warnings-list');

			// Append the warning wrapper to the DOM
			$('.mw-body-content').children('h2').eq(0).before(
				this.$warning.append(
					$('<span>').append(
						$('<b>').text('警告:'),
						document.createTextNode(' 移動先ページについて、以下の点を確認してください。('),
						$('<a>')
							.prop({
								id: 'mpw-warnings-reload',
								href: '#',
								role: 'button'
							})
							.text('更新')
							.off('click').on('click', function(e) {
								e.preventDefault();
								_this.clearWarnings();
								_this.lastPagename = '';
								initWarnings(false, true);
							}),
						document.createTextNode(')')
					),
					this.$warningList
				)
			);

			initWarnings(false, true);

		}

		/**
		 * Load dependent modules and call the constructor.
		 * @static
		 */
		MovePageWarnings.init = function() {
			$.when(
				mw.loader.using(['mediawiki.api', 'mediawiki.Title', 'mediawiki.util']),
				formReady()
			).then(function() { // Load modules and the DOM, then

				var prefixLabel = document.querySelector('#wpNewTitleNs span.oo-ui-labelElement-label');

				/** @type {HTMLInputElement?} */
				var titleInput = document.querySelector('#wpNewTitleMain > input');

				var $submitButton = $('button[name="wpMove"]').eq(0).parent('span');

				// Run the script if all the above are defined
				if (prefixLabel && titleInput && $submitButton.length) {
					new MovePageWarnings(prefixLabel, titleInput, $submitButton);
				}

			}).catch(console.error);
		};

		/**
		 * The movepage form is created by OOUI dynamically, so it's not enough to just wait for document ready.
		 * This function ensures that the form is ready in the document.
		 *
		 * See `[[Special:Permalink/98980431]]` for the older 1.0.X version of this function written with MutationObserver,
		 * which turned out to not work well if the page has been opened on a different tab (see also the bottom of this
		 * script for a handler of this situation).
		 */
		function formReady() {
			var def = $.Deferred();

			/** @returns {boolean} */
			var elementsReady = function() {
				return !!(
					document.querySelector('#wpNewTitleNs') &&
					document.querySelector('#wpNewTitleMain') &&
					document.querySelector('button[name="wpMove"]')
				);
			};

			$(function() { // When the document is ready

				// Check the ready state of form elements every 0.5 seconds (up to 10 times)
				var iterations = 0;
				var interval = setInterval(function() {
					if ((++iterations) > 10) {
						// If we have already done 10 iterations, reject the procedure
						clearInterval(interval);
						def.reject(new Error('[mpw] The form never got ready'));
					} else if (elementsReady()) {
						// If the form elements are ready, resolve the procedure
						clearInterval(interval);
						def.resolve();
					}
					// <= Proceed to the next interval
				}, 500);

			});

			return def.promise();
		}

		Object.defineProperty(MovePageWarnings.prototype, 'moveTalk', {
			/**
			 * Return the check state of the `Move associated talk page` box.
			 * @returns {boolean}
			 */
			get: function() {
				return this.moveTalkBox && this.moveTalkBox.checked || false;
			}
		});

		Object.defineProperty(MovePageWarnings.prototype, 'length', {
			/**
			 * Return the number of warnings.
			 * @returns {number}
			 */
			get: function() {
				return this.$warningList.children('li').length;
			}
		});

		/**
		 * Add a \<style> for MovePageWarnings.
		 * @static
		 */
		MovePageWarnings.addStyleTag = function() {
			var style = document.createElement('style');
			style.textContent =
				'.mpw-seewarning::after {' +
					'display: inline-block;' +
					'content: "※ 下記の警告も確認してください";' +
					'color: red;' +
					'font-family: inherit;' +
					'font-weight: bold;' +
					'margin-left: 1em;' +
					'padding-top: 5px;' +
				'}' +
				'.mpw-logline-hidden {' +
					'text-decoration: line-through;' +
					'color: #72777d;' +
					'font-style: italic;' +
				'}';
			document.head.appendChild(style);
		};

		/**
		 * Toggle the visibility of warnings.
		 * @param {boolean} show
		 */
		MovePageWarnings.prototype.toggle = function(show) {
			this.$submitButton.toggleClass('mpw-seewarning', show);
			this.$warning.toggle(show);
		};

		/**
		 * @param {string} logline
		 */
		function log(logline) {
			console.log('[mpw]', logline);
		}

		/**
		 * Update warnings. This is to be called when either the prefix or the title has been changed.
		 * @param {boolean} moveTalkChanged
		 * @returns {JQueryPromise<void>}
		 */
		MovePageWarnings.prototype.updateWarnings = function(moveTalkChanged) {

			// Pick up the page name to which to move the current page
			var prefix = this.prefix && this.prefix + ':';
			var title = this.titleInput.value.replace(rUnicodeBidi, '');
			var pagename = prefix + title;
			var hasPrefixInTitle = rAliases.test(title);
			var hasDuplicatePrefixes = !!prefix && hasPrefixInTitle;
			var Title = mw.Title.newFromText(pagename);
			pagename = Title ? Title.getPrefixedText() : pagename.replace(/_/g, ' ');
			log('Move destination: ' + pagename);

			// Compare with the last-checked pagename
			var isSamePagename = pagename === this.lastPagename;
			this.lastPagename = pagename;
			var isSameAsTarget = pagename === this.target;

			// Synchronous checks for possible warnings
			if (isSamePagename && !moveTalkChanged) {
				log('Exited for the reason of "same pagename".');
				return $.Deferred().resolve(void 0);
			} else if (!pagename || isSameAsTarget && !hasPrefixInTitle && !hasDuplicatePrefixes) {
				log('Exited for the reason of "no pagename" or "same as target pagename".');
				this.api.abort();
				this.clearWarnings();
				return $.Deferred().resolve(void 0);
			} else if (isSameAsTarget || !Title) {
				log('Exited for the reason of "invalid pagename".');
				this.api.abort();
				this.setWarnings({
					invalidPagename: !Title ? [pagename] : null,
					misplacedPrefix: hasPrefixInTitle ? [] : null,
					duplicatePrefixes: hasDuplicatePrefixes ? [pagename] : null
				});
				return $.Deferred().resolve(void 0);
			}

			// Asynchronous checks for possible warnings
			this.api.abort();
			var _this = this;
			var talkTitle = this.moveTalk && Title && !Title.isTalkPage() && Title.getTalkPage() || void 0;
			var talkPagename = talkTitle && talkTitle.getPrefixedText();
			return $.when(
				this.queryTitleInfo(pagename),
				this.getRedirectTarget(pagename),
				this.getExistenceFunc(typeof talkPagename === 'string' ? [talkPagename] : void 0)
			).then(function(info, redirectTo, exists) {

				if (info === null) {
					log('Exited for the reason of "info is null".');
					_this.clearWarnings();
				} else {
					log('Generated warnings.');
					var isSingleRevisionRedirectToTarget = !!(info.single && info.redirect && redirectTo === _this.target);
					_this.setWarnings({
						invalidPagename: info.invalid ? [pagename] : null,
						misplacedPrefix: hasPrefixInTitle ? [] : null,
						duplicatePrefixes: hasDuplicatePrefixes ? [pagename] : null,
						overwriteRedirect: isSingleRevisionRedirectToTarget ? [pagename] : null,
						talkPageExists: talkPagename && exists(talkPagename) ? [talkPagename] : null,
						deleteToMove: !(info.missing || isSingleRevisionRedirectToTarget) && _this.candelete ? [pagename] : null,
						cantDelete: !(info.missing || isSingleRevisionRedirectToTarget) && !_this.candelete ? [pagename] : null
					});
					if (info.protected) {
						var pwCnt = _this.setProtectionWarning(info.protection);
						if (pwCnt) _this.searchRedlinks();
					}
				}

				if (_this.length) {
					// If new warnings have been generated, trigger the wikipage.content hook to run any script
					// that watches the hook for updates in the page content (this will activate e.g. nav_popups
					// on links in the warnings)
					mw.hook('wikipage.content').fire(_this.$warningList);
				}

			});

		};

		/**
		 * Generate a wrapper for a protection warning.
		 * @param {string} str
		 * @returns {string}
		 */
		var protectionWarningWrapper = function(str) {
			return '<b>移動先のページは保護されています</b>。<ul><li>' + str + '</li></ul>';
		};

		/**
		 * Warning templates.
		 * @static
		 */
		MovePageWarnings.template = {
			/** `$1`: page name */
			invalidPagename: '「$1」は[[Help:ページ名#特殊文字|不正なページ名]]です。',
			misplacedPrefix: 'ページ名指定用テキストボックスの値に[[H:NS#詳細|名前空間]]接頭辞が含まれています。(名前空間の指定にはドロップダウンを' +
				'使用してください。)',
			/** `$1`: page name */
			duplicatePrefixes: '「[[$1]]」には重複した[[H:NS#詳細|名前空間]]接頭辞が含まれています。',
			/** `$1`: page name */
			overwriteRedirect: 'リダイレクトの「[[$1]]」を上書きして移動します。',
			/** `$1`: page name */
			talkPageExists: '「[[$1]]」が存在するため、<b>ノートページは付随移動されません</b>。',
			/** `$1`: page name */
			deleteToMove: '「[[$1]]」への移動を行うためにはページの削除が必要です。',
			/** `$1`: page name */
			cantDelete: '「[[$1]]」への移動は削除権限を要するため、<b>あなたは移動できません</b>。記事としての履歴がない (またはあっても' +
				'即時削除対象となる) 場合は[[Wikipedia:移動依頼|移動依頼]]を、そうでない場合は[[Wikipedia:削除の方針#C|ケースC]]の' +
				'[[Wikipedia:削除依頼|削除依頼]]を利用してください。',
			/** `$1`: logid, `$2`: timestamp, `$3`: user, `$4`: target, `$5`: levels, `$6`: parsedcomment */
			'protect/protect': protectionWarningWrapper(
				'[[Special:Redirect/logid/$1|$2]] <span class="mpw-logline-user">[[User:$3|$3]] ([[User_talk:$3|会話]] | ' +
				'[[Special:Contribs/$3|投稿記録]])</span><span class="mpw-logline-connective"></span><span class="mpw-logline-action">' +
				'[[$4]] を保護しました $5</span> <span class="mpw-logline-comment">$6</span>'
			),
			/** `$1`: logid, `$2`: timestamp, `$3`: user, `$4`: target, `$5`: levels, `$6`: parsedcomment */
			'protect/modify': protectionWarningWrapper(
				'[[Special:Redirect/logid/$1|$2]] <span class="mpw-logline-user">[[User:$3|$3]] ([[User_talk:$3|会話]] | ' +
				'[[Special:Contribs/$3|投稿記録]])</span><span class="mpw-logline-connective"></span><span class="mpw-logline-action">' +
				'[[$4]] の保護設定を変更しました $5</span> <span class="mpw-logline-comment">$6</span>'
			),
			/** `$1`: logid, `$2`: timestamp, `$3`: user, `$4`: target, `$5`: moved_from, `$6`: parsedcomment */
			'protect/move_prot': protectionWarningWrapper(
				'[[Special:Redirect/logid/$1|$2]] <span class="mpw-logline-user">[[User:$3|$3]] ([[User_talk:$3|会話]] | ' +
				'[[Special:Contribs/$3|投稿記録]])</span><span class="mpw-logline-connective-move"></span><span class="mpw-logline-action">' +
				'保護設定を [[$5]] から [[$4]] に移動しました</span> <span class="mpw-logline-comment">$6</span>'
			)
		};

		/**
		 * Set warnings.
		 *
		 * @param {Partial<Record<keyof MovePageWarnings.template, string[]?>>} warningMap
		 * The values should be an array of variables for `mw.format`, or `null` if they shouldn't be converted to warnings.
		 * @returns {number} The number of warnings generated.
		 */
		MovePageWarnings.prototype.setWarnings = function(warningMap) {

			// Erase old warnings
			this.$warningList.empty();

			// Loop each object key and set up a warning if the corresponding value is an array
			for (var key in warningMap) {
				var variables = warningMap[key];
				if (variables) {
					var li = document.createElement('li');
					// @ts-ignore
					li.innerHTML = createWarning(key, variables);
					this.$warningList.append(li);
				}
			}

			// Show/hide the warning wrapper depending on whether there's at least one warning
			var cnt = this.length;
			this.toggle(!!cnt);
			return cnt;

		};

		/**
		 * Clear all warnings.
		 * @returns {number} The number of warnings generated (always 0).
		 */
		MovePageWarnings.prototype.clearWarnings = function() {
			this.$warningList.empty();
			this.toggle(false);
			return 0;
		};

		/**
		 * Create a warning message as a raw HTML by parsing [[links]] and $-variables.
		 *
		 * @param {keyof MovePageWarnings.template} key
		 * @param {string[]} variables
		 * @param {string} [template] Use this template instead of what can be obtained by the key
		 * @returns {string}
		 */
		function createWarning(key, variables, template) {

			// Get template and replace variables
			var def = template || MovePageWarnings.template[key];
			def = mw.format.apply(mw, [def].concat(variables)); // Same as "mw.format(def, $1, $2, ...)"
			var transformed = def;

			// Parse [[links]]
			var rLink = /\[\[([^|\]]+)\|?([^\]]*)\]\]/g; // Matches [[page|display]] or [[page]]
			var m;
			while ((m = rLink.exec(def))) {
				// Replace the [[link]] with <a>
				transformed = transformed.replace(m[0], createLink(m[1], m[2]));
			}

			return transformed;

		}

		/**
		 * Create an anchor tag as a raw HTML.
		 *
		 * @param {string} page
		 * @param {string} [display]
		 * @returns {string}
		 */
		function createLink(page, display) {
			return '<a href="' + mw.util.getUrl(page, {redirect: 'no'}) + '">' + (display || page) + '</a>';
		}

		/**
		 * Set a protection warning.
		 *
		 * @param {TitleInfo["protection"]} info
		 * @returns {number} The number of warnings generated.
		 */
		MovePageWarnings.prototype.setProtectionWarning = function(info) {

			if (!info || !info.action) return 0;

			// Get template
			var key = 'protect/' + info.action;
			/** @type {string} */
			var template = MovePageWarnings.template[key];
			if (!template) return 0;

			// Handle hidden parts in the logline, if any
			var $logline = $('<div>').prop('innerHTML', template); // Temporarily convert the string to a JQuery element
			var userHidden = info.user === null;
			var actionHidden = info.actionhidden;
			var commentHidden = info.parsedcomment === null;
			if (!userHidden && !actionHidden) {
				$logline.find('.mpw-logline-connective').text(' が ');
				$logline.find('.mpw-logline-connective-move').text(' が');
			} else {
				$logline.find('.mpw-logline-connective, .mpw-logline-connective-move').text(' ');
			}
			if (userHidden) {
				$logline.find('.mpw-logline-user').addClass('mpw-logline-hidden').prop('innerHTML', '(利用者名は除去されています)');
			}
			if (actionHidden) {
				$logline.find('.mpw-logline-action').addClass('mpw-logline-hidden').prop('innerHTML', '(ログの詳細は除去されています)');
			}
			if (commentHidden) {
				$logline.find('.mpw-logline-comment').addClass('mpw-logline-hidden').prop('innerHTML', '(要約は除去されています)');
			}
			template = $logline.prop('innerHTML'); // Convert back to a string

			// Get variables to mw.format
			var variables = [
				String(info.logid),
				info.timestamp,
				info.user || void 0,
				info.target,
				info.action === 'move_prot' ? info.moved_from : translateLevels(info.levels),
				info.parsedcomment && ('(' + info.parsedcomment + ')') || ''
			];

			// Create warning
			var li = document.createElement('li');
			// @ts-ignore
			li.innerHTML = createWarning(key, variables, template);
			this.$warningList.append(li);
			this.toggle(true);
			return 1;

		};

		/**
		 * Turn blue links into red ones if any anchor in the warnings is linked to a non-existing page.
		 *
		 * This is to be called after `setProtectionWarning`.
		 *
		 * @returns {JQueryPromise<void>}
		 */
		MovePageWarnings.prototype.searchRedlinks = function() {

			/**
			 * @typedef {Record<string, HTMLAnchorElement[]>} AnchorMap
			 * Keyed by a page title and valued by anchors
			 */
			/** @type {AnchorMap} */
			var anchors = Array.prototype.reduce.call( // Collect anchors by pagename and create a mapping object
				this.$warningList.find('a'),
				/**
				 * @param {AnchorMap} acc
				 * @param {HTMLAnchorElement} a
				 */
				function(acc, a) {
					var title = mw.util.getParamValue('title', a.href);
					if (title) {
						if (!acc[title]) acc[title] = [];
						acc[title].push(a);
					}
					return acc;
				},
				Object.create(null)
			);
			if ($.isEmptyObject(anchors)) return $.Deferred().resolve(void 0);

			// Check page existence
			var pagenames = Object.keys(anchors);
			return this.getExistenceFunc(pagenames).then(function(exists) {
				pagenames.forEach(function(p) {
					if (anchors[p] && !exists(p)) { // If the page doesn't exist
						anchors[p].forEach(function(a) {
							a.classList.add('new'); // Add class that applies the redlink CSS
						});
					}
				});
			});

		};

		/**
		 * Translate e.g. "[edit=autoconfirmed] (無期限)[move=autoconfirmed] (無期限)".
		 * @param {string} [levels]
		 */
		function translateLevels(levels) {

			if (levels === void 0) return levels;

			var translations = {
				create: '作成',
				edit: '編集',
				move: '移動',
				upload: 'アップロード',
				autoconfirmed: '自動承認された利用者のみ許可',
				extendedconfirmed: '拡張承認された利用者と管理者に許可',
				sysop: '管理者のみ許可'
			};
			var rLevels = /\[([^=]+)=([^\]]+)\]/g;
			var m;
			var ret = levels;
			while ((m = rLevels.exec(levels))) {
				var line = m[0]
					.replace(m[1], translations[m[1]] || m[1])
					.replace(m[2], translations[m[2]] || m[2]);
				ret = ret.replace(m[0], line);
			}

			return ret;

		}

		/**
		 * @typedef ApiResponse
		 * @type {{
		 * 	query?: {
		 * 		normalized?: ApiResponseNormalized[];
		 * 		redirects?: {
		 * 			from: string;
		 * 			to: string;
		 * 		}[];
		 * 		pages?: {
		 * 			ns: number;
		 * 			title: string;
		 * 			missing?: boolean;
		 * 			known?: boolean;
		 * 			redirect?: boolean;
		 * 			invalid?: boolean;
		 * 			invalidreason?: string;
		 * 			protection?: {
		 * 				type: string;
		 * 				level: string;
		 * 				expiry: string;
		 * 			}[];
		 * 			revisions?: {
		 * 				revid: number;
		 * 				parentid: number;
		 * 			}[];
		 * 		}[];
		 * 		logevents?: {
		 * 			logid: number;
		 *			title: string;
		 * 			params: {
		 *				description?: string;
		 *				cascade?: boolean;
		 *				details?:  ApiResponseLogeventsParamsDetails[];
		 *				oldtitle_ns?: number;
		 *				oldtitle_title?: string;
		 *			};
		 *			type: "protect";
		 *			actionhidden?: boolean;
		 *			action?: "protect"|"modify"|"move_prot";
		 *			userhidden?: boolean;
		 *			user?: string;
		 *			timestamp: string;
		 *			commenthidden?: boolean;
		 *			parsedcomment?: string;
		 * 		}[];
		 * 	};
		 * }}
		 */
		/**
		 * @typedef ApiResponseNormalized
		 * @type {{
		 *	fromencoded: boolean;
		 *	from: string;
		 *	to: string;
		 * }}
		 */
		/**
		 * @typedef ApiResponseLogeventsParamsDetails
		 * @type {{
		 *	type: string;
		 *	level: string;
		 *	expiry: string;
		 *	cascade: boolean;
		 * }}
		 */
		/**
		 * The object returned by `MovePageWarnings.queryTitleInfo`.
		 * @typedef TitleInfo
		 * @type {object}
		 * @property {boolean} [missing]
		 * @property {boolean} [redirect]
		 * @property {boolean} [invalid]
		 * @property {boolean} [protected]
		 * @property {boolean} [single]
		 * @property {object} [protection]
		 * @property {("protect"|"modify"|"move_prot")?} protection.action `null` if hidden
		 * @property {boolean} protection.actionhidden
		 * @property {number} protection.logid
		 * @property {string} protection.timestamp
		 * @property {string?} protection.user `null` if hidden
		 * @property {string} protection.target
		 * @property {string} [protection.levels]
		 * @property {string} [protection.moved_from]
		 * @property {string?} protection.parsedcomment `null` if hidden
		 */

		/**
		 * Get information about a move destination.
		 *
		 * @param {string} title
		 * @returns {JQueryPromise<TitleInfo?>}
		 */
		MovePageWarnings.prototype.queryTitleInfo = function(title) {
			return this.api.get({
				action: 'query',
				titles: title,
				prop: 'info|revisions',
				inprop: 'protection',
				rvprop: 'ids',
				rvlimit: 2,
				list: 'logevents',
				leprop: 'ids|title|type|user|timestamp|parsedcomment|details',
				letype: 'protect',
				letitle: title,
				lelimit: 'max',
				formatversion: '2'
			}).then(/** @param {ApiResponse} res */ function(res) {

				/** @type {TitleInfo} */
				var ret = {};

				var resPg = res && res.query && res.query.pages && res.query.pages[0];
				if (resPg) {
					$.extend(ret, {
						missing: !!(resPg.missing && !resPg.known),
						redirect: !!resPg.redirect,
						invalid: !!resPg.invalid,
						protected: Array.isArray(resPg.protection) && !!resPg.protection.length,
						single: Array.isArray(resPg.revisions) && resPg.revisions.length === 1
					});
				}
				var resLgev = res && res.query && res.query.logevents;
				if (resLgev && ret.protected) {
					for (var i = 0; i < resLgev.length; i++) {
						var obj = resLgev[i];
						if (
							['protect', 'modify', 'move_prot'].indexOf(obj.action || '') !== -1 &&
							// The first log entry might not be the one assocaited with the current protection settings,
							// if the log body has been deleted and the script user doesn't have the "deletelogentry" user right
							isProtected(obj.params.details)
						) {
							ret.protection = {
								action: obj.action || null,
								actionhidden: !!obj.actionhidden, // If this is true and the user doesn't have "deletelogentry", the entire log is gone
								logid: obj.logid,
								timestamp: obj.timestamp.replace(/Z$/, ''),
								user: !obj.userhidden && obj.user || null,
								target: obj.title,
								levels: obj.params.description && obj.params.description
									.replace(rUnicodeBidi, '') // Remove unicode bidirectional markers
									.replace(/([^ ])\[/g, '$1 ['), // Ensure that there's a space before every "["
								moved_from: obj.params.oldtitle_title,
								parsedcomment: !obj.commenthidden && obj.parsedcomment || null
							};
							break;
						}
					}
				}
				return ret;
			}).catch(function(_, err) {
				if (err && err['exception'] !== 'abort') {
					console.log(err);
				}
				return null;
			});
		};

		/**
		 * Look at the details array of a `list=logevents&letype=protect` response and check if the relevant page is currently protected.
		 *
		 * @param {ApiResponseLogeventsParamsDetails[]} [details]
		 * @returns {boolean} Always `true` if `undefined` is passed
		 */
		function isProtected(details) {
			var d = new Date();
			if (!Array.isArray(details)) {
				return true;
			} else {
				for (var i = 0; i < details.length; i++) {
					var obj = details[i];
					if (!obj.expiry) {
						continue;
					} else if (/^in/.test(obj.expiry)) {
						return true;
					} else {
						return d < new Date(obj.expiry);
					}
				}
				return false;
			}
		}

		/**
		 * Get a function to sanitize a given pagename in API-response format.
		 *
		 * @param {ApiResponseNormalized[]} [normalized] response.query.normalized
		 * @returns {(page: string) => string} Function that takes a pagename and formats it
		 */
		function formatterFactory(normalized) {
			var formatterMap = (normalized || []).reduce(/** @param {Record<string, string>} acc */ function(acc, obj) {
				acc[obj.from] = obj.to;
				return acc;
			}, Object.create(null));
			return /** @param {string} page */ function(page) {
				return formatterMap[page] || page;
			};
		}

		/**
		 * Get the name of the page to which a given page is redirected.
		 *
		 * @param {string} pagename
		 * @returns {JQueryPromise<string?>} The redirected pagename if the queried page is a redirect, or else `null`.
		 */
		MovePageWarnings.prototype.getRedirectTarget = function(pagename) {
			return this.api.get({
				action: 'query',
				titles: pagename,
				redirects: true,
				formatversion: '2'
			}).then(/** @param {ApiResponse} res */ function(res) {
				if (res && res.query) {
					var resRedir = res.query.redirects || [];
					var formatter = formatterFactory(res.query.normalized);
					for (var i = 0; i < resRedir.length; i++) {
						var obj = resRedir[i];
						if (obj.from === formatter(pagename)) {
							return obj.to;
						}
					}
				}
				return null;
			}).catch(function(_, err) {
				if (err && err['exception'] !== 'abort') {
					console.log(err);
				}
				return null;
			});
		};

		/**
		 * Get a function from a pagename to its existence boolean.
		 *
		 * @param {string[]} [pagenames]
		 * @returns {JQueryPromise<(page: string) => boolean>}
		 */
		MovePageWarnings.prototype.getExistenceFunc = function(pagenames) {
			if (pagenames === void 0 || !pagenames.length) {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				return $.Deferred().resolve(/** @param {string} page */ function(page) { return false; });
			}
			/** @typedef {Record<string, boolean>} ExistenceMap */
			return this.api.get({
				action: 'query',
				titles: pagenames,
				formatversion: '2'
			}).then(/** @param {ApiResponse} res */ function(res) {
				var formatter = formatterFactory(res && res.query && res.query.normalized);
				var fPagenames = pagenames.map(function(p) {
					return formatter(p);
				});
				return (res && res.query && res.query.pages || []).reduce(/** @param {ExistenceMap} acc */ function(acc, obj) {
					var index = fPagenames.indexOf(obj.title);
					if (index !== -1) {
						acc[pagenames[index]] = !obj.missing;
					}
					return acc;
				}, Object.create(null));
			}).catch(function(_, err) {
				if (err && err['exception'] !== 'abort') {
					console.log(err);
				}
				return Object.create(null);
			}).then(/** @param {ExistenceMap} existenceMap */ function(existenceMap) {
				/** @param {string} page */
				return function(page) {
					return !!existenceMap[page];
				};
			});
		};

		return MovePageWarnings;

	})();

	// Entry point
	if (document.hidden) {
		// If Special:Movepage is opened on an inactive tab, wait until the tab gets active
		var vc = 'visibilitychange';
		var init = function() {
			if (!document.hidden) {
				document.removeEventListener(vc, init);
				MovePageWarnings.init();
			}
		};
		document.addEventListener(vc, init);
	} else {
		MovePageWarnings.init();
	}

})();
//</nowiki>