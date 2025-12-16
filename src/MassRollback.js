/*************************************************************\

	MassRollback

	@see https://ja.wikipedia.org/wiki/Help:MassRollback
	@author [[User:Dragoniez]]
	@version 2.0.3

\*************************************************************/
// @ts-check
/* global mw, OO */
// <nowiki>
(() => {
// *******************************************************************************************************

const spName = mw.config.get('wgCanonicalSpecialPageName');
if (!spName || !/Contributions/.test(spName)) return;

/**
 * A namespace class with initialization and helper methods.
 *
 * Helper methods should go into this class instead of `MassRollbackDialog`, because it extends `OO.ui.ProcessDialog`,
 * meaning there are slight risks of inadvertently overriding parent methods.
 */
class MassRollback {

	static init() {
		$.when(
			mw.loader.using(['mediawiki.util', 'mediawiki.api', 'oojs-ui']),
			$.ready
		).then(() => {
			const $rbspans = $('.mw-rollback-link:visible');
			if (!$rbspans.length) return;

			const portlet = mw.util.addPortletLink('p-tb', '#', '一括巻き戻し' , 't-mr', '投稿記録の一括巻き戻し');
			if (!portlet) return;

			this.createStyleTag().preloadIcons();

			const MassRollbackDialog = MassRollbackDialogFactory();
			const dialog = new MassRollbackDialog($rbspans, portlet);
			MassRollbackDialog.windowManager.addWindows([dialog]);

			portlet.addEventListener('click', (e) => {
				e.preventDefault();
				dialog.open();
			});
		});
	}

	/**
	 * @returns {typeof this}
	 * @private
	 */
	static createStyleTag() {
		const style = document.createElement('style');
		style.id = 'mr-styles';
		style.textContent =
			'.mr-icon {' +
				'width: 1em;' +
				'vertical-align: middle;' +
				'border: 0;' +
			'}' +
			'.mr-rollback-link-resolved::before {' +
				'content: "[";' +
			'}' +
			'.mr-rollback-link-resolved::after {' +
				'content: "]";' +
			'}' +
			'.mr-rollback-link-success {' +
				'background-color: lightgreen;' +
			'}' +
			'@media screen {' +
				'html.skin-theme-clientpref-night .mr-rollback-link-success {' +
					'background-color: #099979;' +
				'}' +
			'}' +
			'@media screen and (prefers-color-scheme: dark) {' +
				'html.skin-theme-clientpref-os .mr-rollback-link-success {' +
					'background-color: #099979;' +
				'}' +
			'}' +
			'.mr-rollback-link-fail {' +
				'background-color: lightpink;' +
			'}' +
			'@media screen {' +
				'html.skin-theme-clientpref-night .mr-rollback-link-fail {' +
					'background-color: #f54739;' +
				'}' +
			'}' +
			'@media screen and (prefers-color-scheme: dark) {' +
				'html.skin-theme-clientpref-os .mr-rollback-link-fail {' +
					'background-color: #f54739;' +
				'}' +
			'}' +
			'';
		document.head.appendChild(style);
		return this;
	}

	/**
	 * Preloads icons used by MassRollback.
	 *
	 * @returns {typeof this}
	 * @private
	 */
	static preloadIcons() {
		const img = new Image();
		img.src = this.loadingIconUrl;
		return this;
	}

	/**
	 * Pre- or post-processes the given rollback link.
	 *
	 * This method:
	 * * Replaces the innerHTML of the rollback link with a spinner icon for a pre-process,
	 *   or with the result of a rollback for a post-process.
	 * * Removes click event handlers on the rollback link once called.
	 *
	 * @param {HTMLSpanElement} rbspan
	 * @param {string | boolean} [result]
	 * * `string` - The error code on failure.
	 * * `true` - On success.
	 * * `false` (default) - For a spinner icon.
	 * @returns {void}
	 */
	static processRollbackLink(rbspan, result = false) {
		const $rbspan = $(rbspan);
		$rbspan.off('click');
		if (result === false) {
			// Replace the innerHTML of the rbspan with a spinner icon
			$rbspan
				.empty()
				.append(
					$('<img>')
						.prop({ src: this.loadingIconUrl })
						.addClass('mr-icon')
				);
		} else {
			// Replace the innerHTML of the rbspan with the rollback result
			const isFailure = typeof result === 'string';
			$rbspan
				.empty()
				.append(
					$('<span>')
						.text(isFailure ? `巻き戻し失敗 (${result})` : '巻き戻し済み')
						.addClass(isFailure ? 'mr-rollback-link-fail' : 'mr-rollback-link-success')
				)
				.removeClass('mw-rollback-link')
				.addClass('mr-rollback-link-resolved');
		}
	}

	/**
	 * Performs a rollback.
	 *
	 * @param {mw.Api} api
	 * @param {string} title
	 * @param {string} user
	 * @param {RollbackParams} params
	 * @returns {JQueryPromise<string | true>} Error code on failure; otherwise, true.
	 */
	static execute(api, title, user, params) {
		return api.rollback(title, user, /** @type {Record<string, any>} */ (params))
			.then(() => true)
			.catch(/** @param {string} code */ (code, err) => {
				console.warn(err);
				return code;
			});
	}

	/**
	 * @param {mw.Api} _api
	 * @param {string} _title
	 * @param {string} _user
	 * @param {RollbackParams} _params
	 * @returns {JQueryPromise<string | true>} Error code on failure; otherwise, true.
	 */
	static executeDev(_api, _title, _user, _params) {
		const def = $.Deferred();
		const rand = Math.random();
		setTimeout(() => {
			def.resolve(rand > 0.5 ? true : 'debug');
		}, 800 + rand * 1000);
		return def.promise();
	}

}
MassRollback.loadingIconUrl = 'https://upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif';

function MassRollbackDialogFactory() {
	class MassRollbackDialog extends OO.ui.ProcessDialog {

		/**
		 * @param {JQuery<HTMLElement>} $rbspans
		 * @param {HTMLLIElement} portlet
		 * @param {OO.ui.ProcessDialog.ConfigOptions} [config]
		 */
		constructor($rbspans, portlet, config) {
			super(config);

			/**
			 * @type {JQuery<HTMLElement>}
			 * @readonly
			 */
			this.$rbspans = $rbspans;
			/**
			 * @type {HTMLLIElement}
			 * @readonly
			 */
			this.portlet = portlet;
			/**
			 * @type {OO.ui.FieldsetLayout}
			 * @readonly
			 */
			this.fieldset = new OO.ui.FieldsetLayout();
			/**
			 * @type {OO.ui.CheckboxInputWidget}
			 * @readonly
			 */
			this.markBot = new OO.ui.CheckboxInputWidget();
			/**
			 * @type {OO.ui.CheckboxInputWidget}
			 * @readonly
			 */
			this.hideName = new OO.ui.CheckboxInputWidget();
			/**
			 * @type {OO.ui.CheckboxInputWidget}
			 * @readonly
			 */
			this.watch = new OO.ui.CheckboxInputWidget();
			/**
			 * @type {OO.ui.DropdownWidget}
			 * @readonly
			 */
			this.watchExpiry = new OO.ui.DropdownWidget({
				$overlay: this.$overlay,
				menu: {
					items: [
						new OO.ui.MenuOptionWidget({ data: 'infinity', label: '無期限' }),
						new OO.ui.MenuOptionWidget({ data: '1 week', label: '1週間' }),
						new OO.ui.MenuOptionWidget({ data: '2 weeks', label: '2週間' }),
						new OO.ui.MenuOptionWidget({ data: '1 month', label: '1か月' }),
						new OO.ui.MenuOptionWidget({ data: '3 months', label: '3か月' }),
						new OO.ui.MenuOptionWidget({ data: '6 months', label: '6か月' }),
						new OO.ui.MenuOptionWidget({ data: '1 year', label: '1年' })
					]
				}
			});
			this.watchExpiry.getMenu().selectItemByData('infinity');

			/** @type {OO.ui.Element[]} */
			const items = [];

			// @ts-expect-error
			const userGroups = (mw.config.get('wgUserGroups') || []).concat(mw.config.get('wgGlobalGroups') || []);
			const groupsMarkbot = new Set(['sysop', 'global-rollbacker', 'steward']);
			if (userGroups.some((group) => groupsMarkbot.has(group))) {
				this.markBot.setSelected(true);
				items.push(
					new OO.ui.FieldLayout(this.markBot, {
						label: '巻き戻しをボットの編集として扱う',
						align: 'inline'
					})
				);
			}

			let watchExpiryLayout;
			items.push(
				new OO.ui.FieldLayout(this.hideName, {
					label: '利用者名を隠す',
					align: 'inline'
				}),
				new OO.ui.FieldLayout(this.watch, {
					label: '対象ページをウォッチ',
					align: 'inline'
				}),
				(watchExpiryLayout = new OO.ui.FieldLayout(this.watchExpiry))
			);
			watchExpiryLayout.$element.css({
				'margin-left': '1.8em',
				'margin-top': '12px'
			});
			watchExpiryLayout.toggle(false);

			this.watch.off('change').on('change', (selected) => {
				watchExpiryLayout.toggle(!!selected);
				MassRollbackDialog.windowManager.updateWindowSize(this);
			});

			this.fieldset.addItems(items);
		}

		/**
		 * @inheritdoc
		 * @override
		 */
		initialize() {
			// @ts-expect-error
			super.initialize.apply(this, arguments);

			this.content = new OO.ui.PanelLayout({
				padded: true,
				expanded: false
			});
			this.content.$element.append(this.fieldset.$element);
			// @ts-expect-error
			this.$body.append(this.content.$element);

			return this;
		}

		/**
		 * @inheritdoc
		 * @param {string} [action]
		 * @override
		 */
		getActionProcess(action) {
			if (!action) {
				// Close dialog via the parent method when the close button is pressed
				return super.getActionProcess(action);
			}

			// Destroy dialog and portlet when the execute button is pressed
			const params = this.getRollbackParams(); // Retrieve rollback parameters before the destruction
			MassRollbackDialog.windowManager.destroy();
			this.portlet.remove();

			// Perform mass rollback
			return new OO.ui.Process(() => {
				/**
				 * @type {JQueryPromise<boolean>[]}
				 */
				const batch = [];
				/**
				 * @param {HTMLElement} rbspan
				 * @param {string} code
				 */
				const markAsFailed = (rbspan, code) => {
					MassRollback.processRollbackLink(rbspan, code);
					batch.push($.Deferred().resolve(false).promise());
				};
				const api = new mw.Api({
					ajax: {
						headers: {
							'Api-User-Agent': 'MassRollback/2.0.3 (https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MassRollback.js)'
						}
					}
				});
				const rArticle = new RegExp(mw.config.get('wgArticlePath').replace('$1', '([^#?]+)'));

				this.$rbspans.each((_, rbspan) => {
					// Get anchor in the rollback span
					const rblink = rbspan.querySelector('a');
					if (!rblink) return;

					// Remove a rollback link added by [[MediaWiki:Gadget-rollbackBot.js]], if there's any
					const rbBotLink = rbspan.nextElementSibling;
					if (rbBotLink && rbBotLink.classList.contains('mw-rollback-link-bot')) {
						rbBotLink.remove();
					}

					// Get pagetitle and username for rollback
					const href = rblink.href;
					if (!href) {
						return markAsFailed(rbspan, 'hrefmissing');
					}
					let title = mw.util.getParamValue('title', href);
					if (!title) {
						const articleMatch = rArticle.exec(href);
						if (articleMatch && articleMatch[1]) {
							try {
								title = decodeURIComponent(articleMatch[1]);
							} catch (_) { /**/ }
						}
					}
					if (!title) {
						return markAsFailed(rbspan, 'titlemissing');
					}
					const user = mw.util.getParamValue('from', href);
					if (!user) {
						return markAsFailed(rbspan, 'usermissing');
					}
					MassRollback.processRollbackLink(rbspan);

					// Execute rollback on this link
					batch.push(
						MassRollback.execute(api, title, user, params).then((code) => {
							MassRollback.processRollbackLink(rbspan, code);
							return code === true;
						})
					);
				});

				return $.when(...batch).then((...results) => {
					let success = 0, failed = 0;
					for (const ok of results) {
						ok ? success++ : failed++;
					}
					mw.notify(
						$('<div>').html(
							`一括巻き戻しの処理が完了しました。<ul><li>成功: ${success}</li><li>失敗: ${failed}</li></ul>`
						)
					);
				});
			});
		}

		/**
		 * @returns {RollbackParams}
		 */
		getRollbackParams() {
			const watch = this.watch.isSelected();
			return {
				summary: this.hideName.isSelected() ? '$1 による ID: $3 ($4) の版へ[[H:RV|巻き戻し]]' : '',
				markbot: this.markBot.isSelected(),
				watchlist: watch ? 'watch' : 'nochange',
				watchlistexpiry: watch &&
					/** @type {string} */ (/** @type {OO.ui.MenuOptionWidget} */ (this.watchExpiry.getMenu().findSelectedItem()).getData()),
				tags: mw.config.get('wgWikiID') === 'jawiki' && 'MassRollback'
			};
		}
	}

	MassRollbackDialog.static.name = 'MassRollback';
	MassRollbackDialog.static.title = '一括巻き戻し';
	MassRollbackDialog.static.actions = [
		{
			action: 'execute',
			label: '実行',
			flags: ['primary', 'progressive']
		},
		{
			flags: ['safe', 'close']
		}
	];
	MassRollbackDialog.windowManager = (() => {
		const windowManager = new OO.ui.WindowManager();
		$(document.body).append(windowManager.$element);
		return windowManager;
	})();

	return MassRollbackDialog;
}

// *******************************************************************************************************

/**
 * @typedef {object} RollbackParams
 * @property {string} summary
 * @property {boolean} markbot
 * @property {'nochange' | 'preferences' | 'unwatch' | 'watch'} watchlist
 * @property {string | false} watchlistexpiry
 * @property {string | false} tags
 */
MassRollback.init();

// *******************************************************************************************************
})();