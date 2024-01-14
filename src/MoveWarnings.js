/*****************************************************************************************\
 * MoveWarnings
 *	 Generate warnings on Special:Movepage, per the states of the move destination.
 *
 * @author [[User:Dragoniez]]
 * @version 1.0.1
\*****************************************************************************************/

/* eslint-disable @typescript-eslint/no-this-alias */
// @ts-check
/* global mw */
//<nowiki>

(function() {

	// Check whether we should run the script
	if (
		// User isn't going to move the page, or
		mw.config.get('wgCanonicalSpecialPageName') !== 'Movepage' ||
		// User doesn't have the right to move pages, or
		mw.config.get('wgUserGroups').indexOf('autoconfirmed') === -1 ||
		// Browser isn't compatible with MutationObserver (we have to be able to detect changes in software-defined OOUI elements)
		!MutationObserver
	) {
		// Stop running the script
		return;
	}

	// Define main functions, using a class
	var MoveWarnings = /** @class */ (function() {

		/**
		 * Initialize a MoveWarnings instance.
		 *
		 * @constructor
		 * @param {string} target
		 * @param {Element} prefixLabel
		 * @param {HTMLInputElement} titleInput
		 * @param {JQuery<HTMLElement>} $submitButton
		 */
		function MoveWarnings(target, prefixLabel, titleInput, $submitButton) {

			MoveWarnings.addStyleTag();

			// Define class properties

			/**
			 * The page name of the moving target (the "from" page name).
			 * @type {string}
			 */
			this.target = target;

			var prefix = prefixLabel.innerHTML;
			if (prefix.indexOf('標準') !== -1) prefix = '';
			/**
			 * The value selected in the namespace selector dropdown (updated in the callback of MutationObserver).
			 * @type {string}
			 */
			this.prefix = prefix;

			/**
			 * The input tag in the OOUI InputWidget used as a wgTitle specifier.
			 * @type {HTMLInputElement}
			 */
			this.titleInput = titleInput;

			/**
			 * The span tag in the OOUI button for form submission.
			 * @type {JQuery<HTMLSpanElement>}
			 */
			this.$submitButton = $submitButton;

			/**
			 * The "move associated talk page" button.
			 * @type {HTMLInputElement?}
			 */
			this.moveTalkBox = document.querySelector('#wpMovetalk > input');

			/**
			 * The wrapper div for warning messages.
			 * @type {JQuery<HTMLDivElement>}
			 */
			this.$warning = $('<div>');
			this.$warning
				.addClass('mw-message-box mw-message-box-warning')
				.prop('id', 'mvw-warnings')
				.hide();
			/**
			 * The warning message list.
			 * @type {JQuery<HTMLOListElement>}
			 */
			this.$warningList = $('<ol>');
			this.$warningList.prop('id', 'mvw-warnings-list');
			this.$warning.append(
				$('<span>').prop('innerHTML', '<b>警告:</b> 移動先ページについて、以下の点を確認してください。'),
				this.$warningList
			);
			$('.mw-body-content').children('h2').eq(0).before(this.$warning);

			/**
			 * Stores the title of the move destination last inputted.
			 * @type {string}
			 */
			this.lastTitle = target;

			/**
			 * Whether the current user can delete pages.
			 * @type {boolean}
			 * @readonly
			 */
			// @ts-ignore
			this.candelete = mw.config.get('wgUserGroups', []).concat(mw.config.get('wgGlobalGroups', [])).some(function(group) {
				return ['eliminator', 'sysop', 'interface-admin', 'global-deleter', 'staff', 'steward', 'sysadmin'].indexOf(group) !== -1;
			});

			/** @type {mw.Api} */
			this.api = new mw.Api();

			// Watch the move destination specifiers
			var _this = this;
			var inputTimeout;
			/**
			 * The input event handler.
			 */
			var initWarnings = function() {
				clearTimeout(inputTimeout);
				inputTimeout = setTimeout(function() { _this.updateWarnings(); }, 500);
			};

			// Event listener for changes in the namespace prefix
			new MutationObserver(function(mutations) {
				var val = mutations[1] && mutations[1].addedNodes[0] && mutations[1].addedNodes[0].nodeValue;
				if (val) {
					if (val.indexOf('標準') !== -1) val = '';
					_this.prefix = val; // Update prefix
					initWarnings();
				}
			}).observe(prefixLabel, {
				childList: true,
				subtree: true
			});

			// Event listener for changes in the title
			this.titleInput.addEventListener('input', initWarnings);

			initWarnings();

		}

		/**
		 * Load dependent modules and call the constructor.
		 * @static
		 */
		MoveWarnings.init = function() {

			$.when(
				mw.loader.using(['mediawiki.api', 'mediawiki.Title', 'mediawiki.util']),
				$.ready
			).then(function() { // Load modules and the DOM, then

				var title = mw.util.getParamValue('target') || mw.config.get('wgTitle').replace(/^移動\/?/, '');
				var Title = mw.Title.newFromText(title);

				var prefixDropdown = document.getElementById('wpNewTitleNs');
				var prefixLabel = prefixDropdown && prefixDropdown.querySelector('span.oo-ui-labelElement-label');

				/** @type {HTMLInputElement?} */
				var titleInput = document.querySelector('#wpNewTitleMain > input');

				var $submitButton = $('span').filter(function() {
					return !!$(this).children('button[name="wpMove"]').length;
				}).eq(0);

				// Run the script if all the above are defined
				if (Title && prefixLabel && titleInput && $submitButton.length) {
					new MoveWarnings(Title.getPrefixedText(), prefixLabel, titleInput, $submitButton);
				}

			});

		};

		// Define getters
		Object.defineProperty(MoveWarnings.prototype, 'moveTalk', {
			/**
			 * Check whether the `Move associated talk page` box is checked.
			 *
			 * @returns {boolean}
			 */
			get: function moveTalk() {
				return this.moveTalkBox && this.moveTalkBox.checked || false;
			}
		});

		/**
		 * Add a \<style> for MoveWarnings.
		 * @static
		 */
		MoveWarnings.addStyleTag = function() {
			var style = document.createElement('style');
			style.textContent =
				'.mvw-seewarning::after {' +
					'display: inline-block;' +
					'content: "※ 下記の警告も確認してください";' +
					'color: red;' +
					'font-family: inherit;' +
					'font-weight: bold;' +
					'margin-left: 1em;' +
					'padding-top: 5px;' +
				'}';
			document.head.appendChild(style);
		};

		/**
		 * Toggle the visibility of warnings.
		 * @param {boolean} show
		 */
		MoveWarnings.prototype.toggle = function(show) {
			this.$submitButton.toggleClass('mvw-seewarning', show);
			this.$warning.toggle(show);
		};

		/**
		 * Update warnings. This is to be called when either the prefix or the title has been changed.
		 * @returns {JQueryPromise<void>}
		 */
		MoveWarnings.prototype.updateWarnings = function() {

			// Pick up the prefixed title to which to move the current page
			var title = (this.prefix && this.prefix + ':') + this.titleInput.value;
			var Title = mw.Title.newFromText(title);
			title = Title ? Title.getPrefixedText() : title.replace(/_/g, ' ');

			// Compare with the last-checked title
			var isSameTitle = title === this.lastTitle;
			this.lastTitle = title;

			// Synchronous checks for possible warnings
			if (isSameTitle) {
				return $.Deferred().resolve(void 0);
			} else if (!title || title === this.target) {
				this.api.abort();
				this.clearWarnings();
				return $.Deferred().resolve(void 0);
			} else if (!Title) {
				this.api.abort();
				this.setWarnings({
					invalidtitle: [title]
				});
				return $.Deferred().resolve(void 0);
			}

			// Asynchronous checks for possible warnings
			this.api.abort();
			this.clearWarnings();
			var _this = this;
			var associatedTitle = this.moveTalk && Title && !Title.isTalkPage() && Title.getTalkPage() || void 0;
			var talkTitle = associatedTitle && associatedTitle.getPrefixedText();
			return $.when(
				this.queryTitleInfo(title),
				this.queryAdditionalTitleInfo(title, talkTitle)
			).then(function(info, plusInfo) {

				var cnt = 0;
				if (info === null) {
					cnt += _this.clearWarnings();
				} else if (info.invalid) {
					cnt += _this.setWarnings({
						invalidtitle: [title]
					});
				} else {
					cnt += _this.setWarnings({
						overwrite: info.single && info.redirect && plusInfo.redirectTo === title ? [title] : null,
						talkexists: plusInfo.talkExists && associatedTitle ? [associatedTitle.getPrefixedText()] : null,
						needdelete: info.missing === false && info.single === false && _this.candelete ? [title] : null,
						cantmove: info.missing === false && info.single === false && !_this.candelete ? [title] : null
					});
					if (info.protected) {
						var pwCnt = _this.setProtectionWarning(info.protection);
						if (pwCnt) _this.searchRedlinks();
						cnt += pwCnt;
					}
				}

				if (cnt) {
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
		MoveWarnings.template = {
			invalidtitle: '「$1」は[[Help:ページ名#特殊文字|不正なページ名]]です。',
			overwrite: 'リダイレクトの「[[$1]]」を上書きして移動します。',
			talkexists: '「[[$1]]」が存在するため、<b>ノートページは付随移動されません</b>。',
			needdelete: '「[[$1]]」への移動を行うためにはページの削除が必要です。',
			cantmove: '「[[$1]]」への移動は削除権限を要するため、<b>あなたは移動できません</b>。記事としての履歴がない (またはあっても' +
				'即時削除対象となる) 場合は[[Wikipedia:移動依頼|移動依頼]]を、そうでない場合は[[Wikipedia:削除の方針#C|ケースC]]の' +
				'[[Wikipedia:削除依頼|削除依頼]]を利用してください。',
			/** `$1`: logid, `$2`: timestamp, `$3`: user, `$4`: target, `$5`: levels, `$6`: parsedcomment */
			'protect/protect': protectionWarningWrapper(
				'[[Special:Redirect/logid/$1|$2]] <span class="mvw-logline-userhidden">[[User:$3|$3]] ([[User_talk:$3|会話]] | ' +
				'[[Special:Contribs/$3|投稿記録]]) が</span> <span class="mvw-logline-actionhidden">[[$4]] を保護しました $5</span> ' +
				'<span class="mvw-logline-commenthidden">($6)</span>'
			),
			/** `$1`: logid, `$2`: timestamp, `$3`: user, `$4`: target, `$5`: levels, `$6`: parsedcomment */
			'protect/modify': protectionWarningWrapper(
				'[[Special:Redirect/logid/$1|$2]] <span class="mvw-logline-userhidden">[[User:$3|$3]] ([[User_talk:$3|会話]] | ' +
				'[[Special:Contribs/$3|投稿記録]]) が</span> <span class="mvw-logline-actionhidden">[[$4]] の保護設定を変更しました ' +
				'$5</span> <span class="mvw-logline-commenthidden">($6)</span>'
			),
			/** `$1`: logid, `$2`: timestamp, `$3`: user, `$4`: target, `$5`: moved_from, `$6`: parsedcomment */
			'protect/move_prot': protectionWarningWrapper(
				'[[Special:Redirect/logid/$1|$2]] <span class="mvw-logline-userhidden">[[User:$3|$3]] ([[User_talk:$3|会話]] | ' +
				'[[Special:Contribs/$3|投稿記録]]) が</span> <span class="mvw-logline-actionhidden">保護設定を [[$5]] から [[$4]] に' +
				'移動しました</span> <span class="mvw-logline-commenthidden">($6)</span>'
			)
		};

		/**
		 * Set warnings.
		 *
		 * @param {Partial<Record<keyof MoveWarnings.template, string[]?>>} warningMap
		 * The values should be an array of variables for `mw.format`, or `null` if they shouldn't be converted to warnings.
		 * @returns {number} The number of warnings generated.
		 */
		MoveWarnings.prototype.setWarnings = function(warningMap) {

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
			var cnt = this.$warningList.children('li').length;
			this.toggle(!!cnt);
			return cnt;

		};

		/**
		 * Clear all warnings.
		 * @returns {number} The number of warnings generated (always 0).
		 */
		MoveWarnings.prototype.clearWarnings = function() {
			this.$warningList.empty();
			this.toggle(false);
			return 0;
		};

		/**
		 * Create a warning message as a raw HTML by parsing [[links]] and $-variables.
		 *
		 * @param {keyof MoveWarnings.template} key
		 * @param {string[]} variables
		 * @param {string} [template] Use this template instead of what can be obtained by the key
		 * @returns {string}
		 */
		function createWarning(key, variables, template) {

			// Get template and replace variables
			var def = template || MoveWarnings.template[key];
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
		MoveWarnings.prototype.setProtectionWarning = function(info) {

			if (!info || !info.action) return 0;

			// Get template
			var key = 'protect/' + info.action;
			/** @type {string} */
			var template = MoveWarnings.template[key];
			if (!template) return 0;

			// Handle hidden parts in the logline, if any
			var $logline = $('<div>').prop('innerHTML', template); // Temporarily convert the string to a JQuery element
			if (info.user === null) {
				$logline.children('.mvw-logline-userhidden').addClass('history-hidden').prop('innerHTML',
					'(利用者名は除去されています)'
				);
			}
			if (info.actionhidden) {
				$logline.children('.mvw-logline-actionhidden').addClass('history-hidden').prop('innerHTML',
					'(ログの詳細は除去されています)'
				);
			}
			if (info.parsedcomment === null) {
				$logline.children('.mvw-logline-commenthidden').addClass('history-hidden').prop('innerHTML',
					'(要約は除去されています)'
				);
			}
			template = $logline.prop('innerHTML'); // Convert back to a string

			// Get variables to mw.format
			var variables = [
				String(info.logid),
				info.timestamp,
				info.user || void 0,
				info.target,
				info.action === 'move_prot' ? info.moved_from : translateLevels(info.levels),
				info.parsedcomment || void 0
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
		MoveWarnings.prototype.searchRedlinks = function() {

			/**
			 * @typedef {Record<string, HTMLAnchorElement[]>} AnchorMap
			 * Keyed by a page title and valued by anchors
			 */
			/** @type {AnchorMap} */
			var anchors = Array.prototype.reduce.call(
				this.$warningList.find('a'),
				/**
				 * @param {AnchorMap} acc
				 * @param {HTMLAnchorElement} a
				 * @returns {AnchorMap}
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

			return this.api.get({
				action: 'query',
				titles: Object.keys(anchors),
				formatversion: '2'
			}).then(/** @param {ApiResponse} res */ function(res) {
				var resPages = res && res.query && res.query.pages;
				if (!resPages) return;
				resPages.forEach(function(obj) {
					if (obj.missing && anchors[obj.title]) {
						anchors[obj.title].forEach(function(a) {
							a.classList.add('new');
						});
					}
				});
			}).catch(function(_, err) {
				if (err && err['exception'] !== 'abort') {
					console.log(err);
				}
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
		 * 		redirects?: {
		 * 			from: string;
		 * 			to: string;
		 * 		}[];
		 * 		pages?: {
		 * 			ns: number;
		 * 			title: string;
		 * 			missing?: boolean;
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
		 * @typedef ApiResponseLogeventsParamsDetails
		 * @type {{
		 *	type: string;
		 *	level: string;
		 *	expiry: string;
		 *	cascade: boolean;
		 * }}
		 */
		/**
		 * The object returned by `MoveWarnings.queryTitleInfo`.
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
		 * The object returned by `MoveWarnings.queryAdditionalTitleInfo`.
		 * @typedef AdditionalTitleInfo
		 * @type {object}
		 * @property {string?} redirectTo If the page is a redirect, the title to which it is redirected to
		 * @property {boolean} talkExists `true` if the talk page exists
		 */

		/**
		 * Get information about a move destination.
		 *
		 * @param {string} title
		 * @returns {JQueryPromise<TitleInfo?>}
		 */
		MoveWarnings.prototype.queryTitleInfo = function(title) {
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
						missing: !!resPg.missing,
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
						console.log(obj);
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
									.replace(/[\u200E\u200F\u202A-\u202E]/g, '') // Remove unicode bidirectional markers
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
		 * Get additional information about a move destination (and its associated talk page).
		 * - Is the destination page a redirect to somewhere?
		 * - Does the destination page have an associated talk page?
		 *
		 * @param {string} page
		 * @param {string} [talkpage]
		 * @returns {JQueryPromise<AdditionalTitleInfo>}
		 */
		MoveWarnings.prototype.queryAdditionalTitleInfo = function(page, talkpage) {
			var titles = [page];
			if (talkpage) titles.push(talkpage);
			return this.api.get({
				action: 'query',
				titles: titles,
				redirects: true,
				formatversion: '2'
			}).then(/** @param {ApiResponse} res */ function(res) {
				console.log(res);
				/** @type {AdditionalTitleInfo} */
				var ret = {
					redirectTo: null,
					talkExists: false
				};
				if (res && res.query) {
					(res.query.redirects || []).some(function(obj) {
						if (obj.from === titles[0]) {
							ret.redirectTo = obj.to;
							return true;
						}
						return false;
					});
					if (titles[1] && res.query.pages) {
						res.query.pages.some(function(obj) {
							if (obj.title === titles[1]) {
								ret.talkExists = !obj.missing;
								return true;
							}
							return false;
						});
					}
				}
				return ret;
			}).catch(function(_, err) {
				if (err && err['exception'] !== 'abort') {
					console.log(err);
				}
				return {
					redirectTo: null,
					talkExists: false
				};
			});
		};

		return MoveWarnings;

	})();

	// Entry point
	MoveWarnings.init();

})();
//</nowiki>