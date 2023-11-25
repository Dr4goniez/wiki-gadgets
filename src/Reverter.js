// @ts-check
/* eslint-disable @typescript-eslint/no-this-alias */
/* global mw */
//<nowiki>
(() => {

let /** @type {WpLibExtra} */ lib;
let /** @type {mw.Api} */ api;
class Reverter {

	/**
	 * @param {string} username
	 * @param {string[]} titles
	 */
	constructor(username, titles) {
		/** @type {string} */
		this.username = username;
		/** @type {string[]} */
		this.titles = titles;
	}

	/**
	 * Initialize a class instance.
	 * @returns {JQueryPromise<Reverter?>}
	 */
	static init() {

		if (mw.config.get('wgCanonicalSpecialPageName') !== 'Contributions' ||
			!/^\u0044\u0072\u0061\u0067\u006f\u006e\u0069\u0065\u007a$/.test(mw.config.get('wgUserName')) ||
			mw.config.get('wgUserGroups').some((group) => ['sysop', 'rollbacker'].includes(group))
		) {
			return $.Deferred().resolve(null);
		}

		const modules = [
			'mediawiki.util',
			'mediawiki.api',
			'jquery.ui'
		];
		return $.when(Reverter.loadLibrary(), mw.loader.using(modules), $.ready).then((libLoaded) => {
			if (!libLoaded) return null;
			api = new mw.Api();
			const username = mw.config.get('wgRelevantUserName');
			if (!username) return null;
			const titles = Reverter.collectTitles();
			console.log('Reverter count: ' + titles.length);
			if (!titles.length) return null;
			const MR = new Reverter(username, titles);
			const portlet = MR.createPortlet();
			return portlet ? MR : null;
		});

	}

	/**
	 * Load the library.
	 * @returns {JQueryPromise<boolean>}
	 */
	static loadLibrary() {
		const libName = 'ext.gadget.WpLibExtra';
		/** @returns {JQueryPromise<boolean>}  */
		const loadLocal = () => {
			return mw.loader.using(libName)
				.then((require) => { // Load the library
					lib = require(libName);
					if (typeof (lib && lib.version) !== 'string') { // Validate the library
						console.error('Failed to load the library.');
						return false;
					}
					return true;
				})
				.catch((...err) => {
					console.error(err);
					return false;
				});
		};
		if (!mw.loader.getModuleNames().includes(libName)) {
			return mw.loader.getScript('https://ja.wikipedia.org/w/load.php?modules=' + libName).then(loadLocal).catch((...err) => {
				console.error(err);
				return false;
			});
		} else {
			return loadLocal();
		}
	}

	/**
	 * Collect titles for which to do reverts.
	 * @returns {string[]}
	 */
	static collectTitles() {
		const rTitle = new RegExp(mw.config.get('wgServer') + mw.config.get('wgArticlePath').replace('$1', '') + '([^?]+)');
		return Array.prototype.reduce.call(
			document.querySelectorAll('ul.mw-contributions-list > li.mw-contributions-current'),
			/**
			 * @param {string[]} acc
			 * @param {HTMLLIElement} li
			 */
			(acc, li) => {
				/** @type {HTMLAnchorElement?} */
				const titleAnchor = li.querySelector('.mw-contributions-title');
				if (!titleAnchor) return acc;
				const href = titleAnchor.href;
				const m = href.match(rTitle);
				if (m) {
					const title = decodeURIComponent(m[1]);
					if (!acc.includes(title)) {
						acc.push(title);
					}
				}
				return acc;
			},
			[]
		);
	}

	/**
	 * Create a portlet link to open the Reverter dialog.
	 * @returns {HTMLLIElement?}
	 * @requires mediawiki.util
	 */
	createPortlet() {
		/** @type {HTMLLIElement?} */
		const portlet = mw.util.addPortletLink(
			'p-cactions',
			'#',
			'Reverter',
			'ca-mrv'
		);
		if (portlet) {
			portlet.addEventListener('click', (e) => {
				this.createDialog(e);
			});
		} else {
			console.error('Failed to create a portlet link.');
		}
		return portlet;
	}

	/**
	 * @typedef {Record<string, {$checkbox: JQuery<HTMLInputElement>; $icon: JQuery<HTMLSpanElement>;}>} Progress
	 */
	/**
	 * Create the Reverter dialog.
	 * @param {MouseEvent} e
	 * @requires mediawiki.util
	 * @requires jquery.ui
	 */
	createDialog(e) {

		e.preventDefault();

		const /** @type {JQuery<HTMLOListElement>} */ $ol = $('<ol>');
		const progress = this.titles.reduce(/** @param {Progress} acc */ (acc, title) => {
			let /** @type {JQuery<HTMLInputElement>} */ $checkbox;
			let /** @type {JQuery<HTMLSpanElement>} */ $icon;
			$ol.append($('<li>')
				.addClass('mrv-dialog-listitem')
				.append(($checkbox = $('<input>'))
					.addClass('mrv-dialog-listitem-checkbox')
					.prop({
						type: 'checkbox',
						checked: true
					})
					.css('margin-right', '0.5em')
				)
				.append($('<a>')
					.text(title.replace(/_/g, ' '))
					.prop({
						href: mw.util.getUrl(title, {redirect: 'no'}),
						target: '_blank'
					})
				)
				.append(document.createTextNode(' ('))
				.append($('<a>')
					.text('history')
					.prop({
						href: mw.util.getUrl(title, {action: 'history'}),
						target: '_blank'
					})
				)
				.append(document.createTextNode(')'))
				.append(($icon = $('<span>'))
					.addClass('mrv-dialog-listitem-icon')
					.css('margin-left', '0.5em')
				)
			);
			acc[title] = {$checkbox, $icon};
			return acc;
		}, Object.create(null));

		// Create dialog
		let /** @type {JQuery<HTMLDivElement>} */ $dialog;
		let /** @type {JQuery<HTMLDivElement>} */ $summaryContainer;
		let /** @type {JQuery<HTMLInputElement>} */ $summaryComment;
		let /** @type {JQuery<HTMLInputElement>} */ $includeRevertSummary;
		($dialog = $('<div>'))
			.css({
				maxHeight: '70vh',
				maxWidth: '70vh'
			})
			.append($('<div>')
				.prop('id', 'mrv-dialog-container')
				.css('padding', '0.5em')
				.append($('<div>')
					.prop('id', 'mrv-dialog-listcontainer')
					.css({
						maxHeight: '40vh',
						overflowY: 'scroll',
						border: '1px solid silver'
					})
					.append($ol
						.css('padding', '0.5em')
						.prop('id', 'mrv-dialog-list')
					)
				)
				.append(($summaryContainer = $('<div>'))
					.prop('id', 'mrv-dialog-summarycontainer')
					.append($('<div>')
						.css('margin-top', '0.5em')
						.append($('<span>')
							.css('display', 'block')
							.text('Summary comment:')
						)
						.append(($summaryComment = $('<input>'))
							.prop('type', 'text')
							.css({
								width: '100%',
								boxSizing: 'border-box'
							})
						)
					)
					.append($('<div>')
						.css('margin-top', '0.5em')
						.append($('<label>')
							.prop('htmlFor', 'mrv-dialog-includerevertsummary')
							.append(($includeRevertSummary = $('<input>'))
								.prop({
									id: 'mrv-dialog-includerevertsummary',
									type: 'checkbox',
									checked: true
								})
							)
							.append($('<span>')
								.text('Include revert summary')
								.css({
									display: 'inline-block',
									marginLeft: '0.5em'
								})
							)
						)
					)
				)
			)
			.dialog({
				dialogClass: 'mrv-dialog',
				title: 'Reverter',
				resizable: false,
				height: 'auto',
				width: 'auto',
				modal: true,
				position: {
					my: 'top',
					at: 'top+5%',
					of: window
				},
				open: function() {
					mw.hook('wikipage.content').fire($(this));
				},
				close: function() {
					// Destory the dialog and its contents when closed by any means
					$(this).empty().dialog('destroy');
				},
				buttons: [
					{
						text: 'Revert',
						click: async () => {
							$summaryComment.val(lib.clean($summaryComment[0].value));
							$summaryContainer.hide();
							const result = await this.revert($dialog, progress, $summaryComment[0].value, $includeRevertSummary.prop('checked'));
							if (!result) {
								$summaryContainer.show();
							}
						}
					},
					{
						text: 'Close',
						click: function() {
							$(this).dialog('close');
						}
					}
				]
			});

	}

	/**
	 * Do reverts.
	 * @param {JQuery<HTMLDivElement>} $dialog
	 * @param {Progress} progress
	 * @param {string} summaryComment
	 * @param {boolean} includeRevertSummary
	 * @returns {Promise<boolean>} `false` if the procedure is cancelled.
	 * @requires jquery.ui
	 */
	async revert($dialog, progress, summaryComment, includeRevertSummary) {

		const defaultSummary = 'Reverted $7 by [[Special:Contributions/$2|$2]] ([[User talk:$2|talk]]) to last revision by $1';
		const /** @type {string[]} */ summaryElements = [];
		if (summaryComment) {
			summaryElements.push(summaryComment);
		}
		if (includeRevertSummary) {
			summaryElements.push(defaultSummary);
		}
		const summary = summaryElements.join(': ');
		if (!summary && !confirm('Summary is empty. Are you sure you want to proceed?')) {
			return false;
		}

		$dialog.dialog({buttons: []});
		const _this = this;
		const /** @type {Promise<void>[]} */ deferreds = [];
		Object.keys(progress).forEach((title) => {
			const {$checkbox, $icon} = progress[title];
			$checkbox.prop('disabled', true);
			deferreds.push(_this.revertPage($checkbox, $icon, title, summary));
		});
		await Promise.all(deferreds);
		mw.notify('Done', {type: 'success'});
		$dialog.dialog({
			buttons: [
				{
					text: 'Close',
					click: function() {
						$(this).dialog('close');
					}
				}
			]
		});
		return true;

	}

	/**
	 * Do reverts for a page.
	 * @param {JQuery<HTMLInputElement>} $checkbox
	 * @param {JQuery<HTMLSpanElement>} $icon
	 * @param {string} title
	 * @param {string} summary
	 * @returns {Promise<void>}
	 */
	async revertPage($checkbox, $icon, title, summary) {
		if ($checkbox.prop('checked')) {
			$icon.append(lib.getIcon('load'));
			const revision = await this.findRevision(title);
			if (typeof revision === 'string') {
				$icon.empty().append(
					$(lib.getIcon('cross')).css('margin-right', '0.5em'),
					$('<span>')
						.css('color', 'mediumvioletred')
						.text(revision)
				);
			} else {
				const {content, info, basetimestamp, starttimestamp} = revision;
				const result = this.editPage(
					title,
					content,
					mw.format(summary, info.$1, info.$2, info.$3, info.$4, info.$5, info.$6, info.$7),
					basetimestamp,
					starttimestamp
				);
				if (typeof result === 'string') {
					$icon.empty().append(
						$(lib.getIcon('cross')).css('margin-right', '0.5em'),
						$('<span>')
							.css('color', 'mediumvioletred')
							.text(result)
					);
				} else {
					$icon.empty().append(lib.getIcon('check'));
				}
			}
		} else {
			$icon.append(lib.getIcon('cancel'));
		}
		return void 0;
	}

	/**
	 * @typedef SummaryInfo
	 * @type {object}
	 * @property {string} $1 Name of the user who made the last edit before the user whose edits are to be rolled back
	 * @property {string} $2 Name of the user whose edits are to be rolled back
	 * @property {number} $3 The revision number of $1's edit
	 * @property {string} $4 The timestamp of $1's edit
	 * @property {number} $5 The revision number of $2's edit
	 * @property {string} $6 The timestamp of $2's edit
	 * @property {string} $7 The number of revisions to revert
	 */
	/**
	 * Find a revision to restore for a page.
	 * @param {string} title
	 * @returns {JQueryPromise<string|{content: string; info: SummaryInfo; basetimestamp: string; starttimestamp:string;}>}
	 * @requires mediawiki.api
	 */
	findRevision(title) {
		return api.get({
			action: 'query',
			titles: title,
			prop: 'revisions',
			rvprop: 'ids|user|content|timestamp',
			rvslots: 'main',
			rvlimit: 50,
			curtimestamp: true,
			formatversion: '2'
		}).then((res) => {
			/**
			 * @typedef ApiResponsePages
			 * @type {{
			 * 	pageid?: number;
			 * 	ns: number;
			 * 	title: string;
			 * 	missing?: boolean;
			 * 	revisions?: ApiResponseRevision[];
			 * }}
			 */
			/**
			 * @typedef ApiResponseRevision
			 * @type {{
			 * 	revid: number;
			 * 	parentid: number;
			 * 	user?: string;
			 * 	userhidden?: boolean;
			 * 	timestamp: string;
			 * 	anon?: boolean;
			 * 	slots: {
			 * 		main: {
			 *			content?: string;
			 *			texthidden?: boolean;
			 * 		};
			 * 	};
			 * }}
			 */
			const /** @type {ApiResponsePages[]=} */ resPages = res && res.query && res.query.pages;
			if (!resPages) {
				return 'unknown';
			} else if (!resPages.length) {
				return 'pagesempty';
			} else if (resPages[0].missing) {
				return 'pagemissing';
			}
			const resRev = resPages[0].revisions;
			if (!resRev) {
				return 'norevisions';
			} else if (!resRev.length) {
				return 'revisionsempty';
			}
			const basetimestamp = resRev[0].timestamp;
			const starttimestamp = res.curtimestamp;

			for (let i = 0; i < resRev.length; i++) {
				const obj = resRev[i];
				const user = obj.user;
				switch(user) {
					case this.username:
						continue;
					case void 0:
						return 'userhidden';
					default: { // Different user
						const content = obj.slots.main.content;
						if (i === 0) {
							return 'alreadyrolled';
						} else if (typeof content === 'string') {
							return {
								content,
								info: {
									$1: user,
									$2: this.username,
									$3: obj.revid,
									$4: obj.timestamp.replace(/Z$/, ''),
									$5: resRev[0].revid,
									$6: resRev[0].timestamp.replace(/Z$/, ''),
									$7: i + ' edit' + (i > 1 ? 's' : '')
								},
								basetimestamp,
								starttimestamp
							};
						} else {
							return 'nocontent';
						}
					}
				}
			}
			return 'norestorepoint';

		}).catch(/** @param {string} code */ (code, err) => {
			console.warn(err);
			return code;
		});
	}

	/**
	 * Edit a given page.
	 * @param {string} title
	 * @param {string} content
	 * @param {string} summary
	 * @param {string} basetimestamp
	 * @param {string} starttimestamp
	 * @returns {JQueryPromise<string?>} `null` on success, error code on failure.
	 * @requires mediawiki.api
	 */
	editPage(title, content, summary, basetimestamp, starttimestamp) {
		return api.postWithEditToken({
			action: 'edit',
			title: title,
			text: content,
			summary: summary,
			basetimestamp: basetimestamp,
			starttimestamp: starttimestamp,
			nocreate: true,
			formatversion: '2'
		}).then((res) => {
			return res && res.edit && res.edit.result === 'Success' ? null : 'editerror';
		}).catch(/** @param {string} code */ (code, err) => {
			console.warn(err);
			return code;
		});
	}

}

Reverter.init();

})();
//</nowiki>