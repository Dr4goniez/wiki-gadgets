/*************************************************************\

	MassRollback

	@see https://ja.wikipedia.org/wiki/Help:MassRollback
	@author [[User:Dragoniez]]
	@version 2.0.0

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
				MassRollbackDialog.windowManager.openWindow(dialog);
			});
		});
	}

	/**
	 * @returns {typeof this}
	 */
	static createStyleTag() {
		const style = document.createElement('style');
		style.id = 'mr-styles';
		style.textContent =
			'.mr-icon-container {' +
				'display: inline-block;' +
			'}' +
			'.mr-icon {' +
				'width: 1em;' +
				'vertical-align: middle;' +
				'border: 0;' +
			'}' +
			'.mr-icon-subtext {' +
				'margin-left: 0.2em;' +
			'}' +
			'.mr-icon-subtext-green {' +
				'color: var(--color-icon-success, #099979);' +
			'}' +
			'.mr-icon-subtext-red {' +
				'color: var(--color-icon-error, #f54739);' +
			'}' +
			'.mr-rollback-link-resolved::before {' +
				'content: "[";' +
			'}' +
			'.mr-rollback-link-resolved::after {' +
				'content: "]";' +
			'}' +
			'';
		document.head.appendChild(style);
		return this;
	}

	/**
	 * Preloads icons used by MassRollback.
	 *
	 * @returns {typeof this}
	 */
	static preloadIcons() {
		for (const [_, src] of this.iconMap) {
			const img = new Image();
			img.src = src;
		}
		return this;
	}

	/**
	 * Creates and retrieves an icon.
	 *
	 * @param {Icons} iconName The name of the icon to get.
	 * @param {string} [subtext] Optional text shown next to the icon.
	 *
	 * The text is coloured in:
	 * * Green when `iconName` is `'done'`.
	 * * Red when `iconName` is `'failed'`.
	 * @returns {HTMLSpanElement} The icon container.
	 */
	static getIcon(iconName, subtext) {
		const href = this.iconMap.get(iconName);
		if (!href) {
			throw new Error('Invalid icon name: ' + iconName);
		}

		const icon = new Image();
		icon.classList.add('mr-icon');
		icon.src = href;

		const container = document.createElement('span');
		container.classList.add('mr-icon-container');
		container.appendChild(icon);

		if (subtext) {
			const textElement = document.createElement('span');
			textElement.classList.add('mr-icon-subtext');
			textElement.textContent = subtext;
			if (iconName === 'done') {
				textElement.classList.add('mr-icon-subtext-green');
			} else if (iconName === 'failed') {
				textElement.classList.add('mr-icon-subtext-red');
			}
			container.appendChild(textElement);
		}

		return container;
	}

	/**
	 * Performs a rollback.
	 *
	 * @param {mw.Api} api
	 * @param {string} title
	 * @param {string} user
	 * @param {RollbackParams} params
	 * @param {boolean} debug
	 * @returns {JQueryPromise<string | undefined>} Error code on failure; otherwise, undefined.
	 */
	static execute(api, title, user, params, debug) {
		if (debug) {
			const def = $.Deferred();
			const rand = Math.random();
			setTimeout(() => {
				def.resolve(rand > 0.5 ? void 0 : 'debug');
			}, 800 + rand * 1000);
			return def.promise();
		}
		return api.rollback(title, user, /** @type {Record<string, any>} */ (params))
			.then(() => void 0)
			.catch(/** @param {string} code */ (code, err) => {
				console.warn(err);
				return code;
			});
	}

}
/**
 * @type {Map<Icons, string>}
 */
MassRollback.iconMap = new Map([
	['doing', 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Ajax_loader_metal_512.gif'],
	['done', 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Antu_mail-mark-notjunk.svg/30px-Antu_mail-mark-notjunk.svg.png'],
	['failed', 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Cross_reject.svg/30px-Cross_reject.svg.png'],
]);

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
					rbspan.replaceChildren(MassRollback.getIcon('failed', code));
					batch.push($.Deferred().resolve(false).promise());
				};
				const api = new mw.Api();

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
					const title = mw.util.getParamValue('title', href);
					if (!title) {
						return markAsFailed(rbspan, 'titlemissing');
					}
					const user = mw.util.getParamValue('from', href);
					if (!user) {
						return markAsFailed(rbspan, 'usermissing');
					}
					rbspan.replaceChildren(MassRollback.getIcon('doing'));

					// Execute rollback on this link
					batch.push(
						MassRollback.execute(api, title, user, params, true).then((code) => {
							console.log(code);
							const iconTyle = code ? 'failed' : 'done';
							rbspan.replaceChildren(MassRollback.getIcon(iconTyle, code));
							rbspan.classList.remove('mw-rollback-link');
							rbspan.classList.add('mr-rollback-link-resolved');
							return !code;
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
 *
 * @typedef {'doing' | 'done' | 'failed'} Icons
 */
MassRollback.init();

// *******************************************************************************************************
})();