/**
 * Flag administrators and special user group members with a letter
 * in parenthesis behind links that go into their user namespace.
 * E.g. Didym -> Didym (A)
 *
 * @license
 * @link https://commons.wikimedia.org/wiki/MediaWiki:Gadget-markAdmins.js
 *
 * @author Euku - 2005, PDD, Littl, Guandalug
 * @author Didym - 2014
 * @author Rillke <https://blog.rillke.com> - 2014
 * @contributor Perhelion - 2017
 *
 * @author Dragoniez - 2023, radically modified the original
 * This modified version differs from the original in three main respects:
 * - Does not create a new node for the label, and instead uses a data attribute
 *   to register the label and reads it by CSS.
 * - Does not suppport configurations via user common.js. Instead, it provides
 *   [[Special:MarkAdminsConfig]] for user configurations.
 * - User contribs links are also marked.
 * @version 2.0.1
 *
 * @requires [[MediaWiki:Gadget-MarkAdmins-data.json]]
 * @requires [[MediaWiki:Gadget-MarkAdmins-updater.js]]
 */
// @ts-check
/* eslint-disable @typescript-eslint/no-var-requires */
/* global mw, OO */
// <nowiki>
(() => {
// ***********************************************************************************************

// Run this script only when on /wiki/$1 or /w/index.php
if (
	!location.pathname.startsWith(mw.config.get('wgArticlePath').replace('$1', '')) &&
	location.pathname !== mw.config.get('wgScript')
) {
	return;
}

const version = '2.0.1';
const DEVMODE = false;
const wgNamespaceNumber = mw.config.get('wgNamespaceNumber');
const wgCanonicalSpecialPageName = mw.config.get('wgCanonicalSpecialPageName') || '';

class MarkAdmins {

	static async init() {
		const modules = ['mediawiki.util', 'mediawiki.user'];
		const isOnConfig = wgNamespaceNumber === -1 && /^(MarkAdminsConfig|MAC)$/i.test(mw.config.get('wgTitle'));
		if (isOnConfig) {
			modules.push('mediawiki.api', 'oojs-ui');
		}
		this.loadUpdater();
		await $.when(mw.loader.using(modules), $.ready);

		// Should we run the script?
		const cfg = await MarkAdminsConfig.getMerged();
		if (isOnConfig) {
			new MarkAdminsConfig(cfg);
			return;
		}
		MarkAdminsConfig.createPortletLink();
		if (
			!MarkAdminsConfig.decodeNamespaces(cfg.conds.namespaces).includes(wgNamespaceNumber) &&
			!(cfg.conds.talk && wgNamespaceNumber > 0 && wgNamespaceNumber % 2 === 1) &&
			!(cfg.conds.history && mw.config.get('wgAction') === 'history') &&
			!(cfg.conds.diff && typeof mw.util.getParamValue('diff') === 'string')
		) {
			return;
		}
		if (wgCanonicalSpecialPageName === 'CentralAuth') {
			return;
		}

		this.createStyleTag();
		const labelMap = this.getLabelMap(cfg);
		const groupMap = await this.getGroupMap();

		let runCount = -1;
		mw.hook('wikipage.content').add(($content) => {
			if ($content[0].isConnected) {
				this.markup($content, cfg, labelMap, groupMap, ++runCount);
			}
		});
	}

	/**
	 * @private
	 */
	static loadUpdater() {
		if (!(mw.config.get('wgUserGroups') || []).includes('sysop')) {
			return;
		}

		/** @type {Record<Domain, string[]>} */
		const groupMap = { local: [], global: [], meta: [] };
		for (const [group, { domain }] of MarkAdminsConfig.groupMap) {
			groupMap[domain].push(group);
		}

		const MarkAdminsUpdaterFactory = require('./MarkAdmins-updater.js');
		const MarkAdminsUpdater = MarkAdminsUpdaterFactory(groupMap, DEVMODE);
		MarkAdminsUpdater.init();
	}

	/**
	 * @private
	 */
	static createStyleTag() {
		const style = document.createElement('style');
		style.textContent =
			'a[data-markadmins]::after {' +
				'content: attr(data-markadmins);' +
				'font-weight: bold;' +
				'font-size: 85%;' +
				'vertical-align: middle;' +
				'margin-left: 0.2em;' +
			'}';
		document.head.appendChild(style);
	}

	/**
	 * Returns a Map object keyed by user group names and valued by their labels defined by the user.
	 *
	 * Groups that are disabled for markup by the user are not included.
	 *
	 * @param {typeof MarkAdminsConfig['defaults']} cfg
	 * @returns {Map<string, string>}
	 * @private
	 */
	static getLabelMap(cfg) {
		/** @type {Map<string, string>} */
		const ret = new Map();
		for (const [group, { enabled, label }] of Object.entries(cfg.groups)) {
			if (enabled) {
				ret.set(group, label);
			}
		}
		return ret;
	}

	/**
	 * Retrieves the user group JSON and returns it as a Map object keyed by
	 * usernames and valued by an array of their associated user groups.
	 *
	 * @returns {Promise<Map<string, string[]>>}
	 * @private
	 */
	static async getGroupMap() {
		/** @type {Record<string, string[]>} */
		const json = DEVMODE
			? await $.get(mw.util.getUrl('MediaWiki:Gadget-MarkAdmins-data.json', { action: 'raw', ctype: 'application/json' }))
			// @ts-expect-error
			: require('./MarkAdmins-data.json');
		return new Map(Object.entries(json));
	}

	/**
	 * @param {JQuery<HTMLElement>} $content
	 * @param {typeof MarkAdminsConfig['defaults']} cfg
	 * @param {Map<string, string>} labelMap See {@link getLabelMap}.
	 * @param {Map<string, string[]>} groupMap See {@link getGroupMap}.
	 * @param {number} runCount
	 * @private
	 */
	static markup($content, cfg, labelMap, groupMap, runCount) {
		$content = !runCount ? mw.util.$content : $content;
		let $anchors = $content.find('a');

		// Include links in the top navigation tab on user page
		const isUserPage = [2, 3].includes(wgNamespaceNumber);
		if (isUserPage && !runCount) {
			$anchors = $anchors.add($('#ca-nstab-user').find('a'));
		}
		if (!$anchors.length) {
			return;
		}

		const markSubpages = cfg.conds.subpages || ['Allpages', 'Prefixindex'].includes(wgCanonicalSpecialPageName);
		/**
		 * @typedef {'user' | 'usertalk' | 'contribs'} PageType
		 * @type {{ user?: string; pagetype?: PageType; }[]}
		 */
		const tracker = [];

		/**
		 * @type {Map<string, string>} username => marker (e.g. 'A')
		 */
		const markerStore = new Map();
		const wgUserName = mw.config.get('wgUserName');
		if (!cfg.conds.self && wgUserName) {
			markerStore.set(wgUserName, '');
		}

		$anchors.each((index, a) => {
			tracker.push({});

			if (
				a.role === 'button' ||
				a.href === '#' ||
				(a.children[0] && a.children[0].nodeName === 'IMG') ||
				(a.parentElement && a.parentElement.classList.contains('autocomment'))
			) {
				return;
			}

			let href = a.getAttribute('href'); // Attribute, not property, to retrieve the absolute URL
			if (!href && isUserPage && a.classList.contains('mw-selflink')) {
				href = '/wiki/' + mw.config.get('wgPageName');
			} else if (!href) {
				return;
			}

			// Extract prefixed title from the href
			let match, prefixedTitle;
			if ((match = this.regex.article.exec(href)) || a.classList.contains('new') && (match = this.regex.script.exec(href))) {
				// Look only for red links for index.php links. This is because special pages contain so many user links
				// with the index.php path, such as history links and undo links, which are mere distractors for the script.
				// Including them would over-mark, so we simply ignore them.
				prefixedTitle = decodeURIComponent(match[1]).replace(/_/g, ' ');
			} else {
				return;
			}

			// Extract non-prefixed title
			let title, /** @type {PageType} */ pagetype;
			if ((match = this.regex.user.exec(prefixedTitle))) {
				title = match[1];
				pagetype = 'user';
			} else if ((match = this.regex.usertalk.exec(prefixedTitle))) {
				title = match[1];
				pagetype = 'usertalk';
			} else if (cfg.conds.contribs && (match = this.regex.contribs.exec(prefixedTitle))) {
				title = match[1];
				pagetype = 'contribs';
			} else {
				return;
			}
			if (!/^[\u10A0-\u10FF]/.test(title)) { // ucFirst, except for Georgean letters
				title = title.charAt(0).toUpperCase() + title.slice(1);
			}

			// Is this a link to a User or User_talk subpage?
			const user = title.replace(/[/#].*/, '');
			const isSubpage = user !== title;
			if (isSubpage && !markSubpages) {
				return;
			}

			// Don't mark this anchor if it is part of consecutive anchors for the same user
			const prev = !isSubpage && tracker[index - 1];
			if ((prev && prev.user === user) && (
				(prev.pagetype === 'user' && pagetype === 'usertalk') ||
				(prev.pagetype === 'usertalk' && pagetype === 'contribs') ||
				(prev.pagetype === 'contribs' && pagetype === 'usertalk')
			)) {
				tracker[index] = { user, pagetype };
				return;
			}

			// Create or fetch marker
			let marker = markerStore.get(user);
			if (marker === void 0) {
				const groups = groupMap.get(user);
				if (!groups) {
					return;
				}

				const newMarkerList = groups.reduce(/** @param {string[]} acc */ (acc, g) => {
					const label = labelMap.get(g);
					if (label) {
						acc.push(label);
					}
					return acc;
				}, []);
				const newMarker = `(${newMarkerList.join('/')})`;
				markerStore.set(user, newMarker);
				marker = newMarker;
			}
			if (!marker) {
				// Skip empty-string markers
				return;
			}

			a.dataset.markadmins = marker;
			tracker[index] = { user, pagetype };
		});
	}

}

MarkAdmins.regex = (() => {
	/** @type {Record<-1 | 2 | 3, string[]>} */
	const aliases = {
		'-1': [],
		2: [],
		3: [],
	};
	for (const [alias, ns] of Object.entries(mw.config.get('wgNamespaceIds'))) {
		if (ns in aliases) {
			aliases[/** @type {keyof typeof aliases} */ (ns)].push(mw.util.escapeRegExp(alias.replace(/_/g, ' ')));
		}
	}

	return {
		article: new RegExp(mw.config.get('wgArticlePath').replace('$1', '([^?]+)')), // /wiki/PAGENAME (query parameters removed)
		script: new RegExp(mw.config.get('wgScript') + '\\?title=([^&]+)'), // ^/w/index.php?title=PAGENAME
		user: new RegExp('^(?:' + aliases[2].join('|') + '):(.+)', 'i'),
		usertalk: new RegExp('^(?:' + aliases[3].join('|') + '):(.+)', 'i'),
		contribs: new RegExp('^(?:' + aliases[-1].join('|') + '):(?:投稿記録|contrib(?:ution)?s)/(.+)', 'i')
	};
})();

class MarkAdminsConfig {

	/**
	 * @returns {Promise<DefaultConfigSchema>}
	 */
	static async getMerged() {
		return $.extend(
			true,
			Object.create(null),
			this.defaults,
			await this.getLegacy(),
			this.getLatest()
		);
	}

	/**
	 * Retrives the legacy config (if present) in the new format.
	 *
	 * @returns {Promise<PartialConfigSchema>}
	 * @private
	 */
	static async getLegacy() {
		const legacyKey = 'userjs-MarkAdminsCfg';
		const /** @type {?string} */ legecyStr = mw.user.options.get(legacyKey);
		const /** @type {PartialConfigSchema} */ ret = Object.create(null);
		if (!legecyStr) {
			return ret;
		}

		let /** @type {LegacyConfigSchema} */ legacy;
		try {
			legacy = JSON.parse(legecyStr);
		} catch (_) {
			return ret;
		}

		const defaults = this.defaults;
		for (const [group, { label, enabled }] of Object.entries(legacy.groups)) {
			if (group in defaults.groups) {
				if (defaults.groups[group].label !== label) {
					setProp(ret, 'groups', group, 'label', label);
				}
				if (defaults.groups[group].enabled !== enabled) {
					setProp(ret, 'groups', group, 'enabled', enabled);
				}
			}
		}

		const /** @type {number[]} */ namespaces = [];
		const runOn = new Set(legacy.runOn.map(val => val.toLowerCase()));
		for (const [alias, ns] of Object.entries(mw.config.get('wgNamespaceIds'))) {
			if (runOn.has(alias)) {
				namespaces.push(ns);
			}
		}
		const encodedNamespaces = this.encodeNamespaces(namespaces);
		if (encodedNamespaces !== defaults.conds.namespaces) {
			setProp(ret, 'conds', 'namespaces', encodedNamespaces);
		}

		const boolPropMap = {
			runOnTalk: 'talk',
			runOnHistory: 'history',
			runOnDiff: 'diff',
			markSubpages: 'subpages',
			markMyself: 'self',
			markContribs: 'contribs'
		};
		for (const [legecyKey, key] of Object.entries(boolPropMap)) {
			const legacyKeySafe = /** @type {keyof typeof boolPropMap} */ (legecyKey);
			const keySafe = /** @type {keyof Omit<ConfigSchema['conds'], 'namespaces'>} */ (key);
			if (legacy[legacyKeySafe] !== defaults.conds[keySafe]) {
				setProp(ret, 'conds', keySafe, legacy[legacyKeySafe]);
			}
		}

		await this.save(
			{
				[legacyKey]: null,
				[this.key]: $.isEmptyObject(ret) ? null : JSON.stringify(ret)
			},
			true // Always call `mw.user.options.set` for getLatest() to work properly
		);
		return ret;
	}

	/**
	 * Retrives the latest config.
	 *
	 * @returns {PartialConfigSchema}
	 * @private
	 */
	static getLatest() {
		const /** @type {?string} */ cfgStr = mw.user.options.get(this.key);
		if (!cfgStr) {
			return Object.create(null);
		}
		try {
			return /** @type {PartialConfigSchema} */ (JSON.parse(cfgStr));
		} catch (_) {
			return Object.create(null);
		}
	}

	/**
	 * Converts an array of namespace numbers to a pipe-separated string.
	 *
	 * @param {number[]} array
	 * @returns {string}
	 */
	static encodeNamespaces(array) {
		return Array.from(new Set(array)).sort((a, b) => a - b).join('|');
	}

	/**
	 * Converts a pipe-separated string representing namespace numbers to an array.
	 *
	 * @param {string} namespaces
	 * @returns {number[]}
	 */
	static decodeNamespaces(namespaces) {
		return namespaces.split('|').map(n => +n);
	}

	/**
	 * @returns {Promise<mw.Api>}
	 */
	static get api() {
		return new Promise((resolve) => {
			if (this._api instanceof mw.Api) {
				resolve(this._api);
			}
			mw.loader.using('mediawiki.api', () => {
				this._api = new mw.Api({
					ajax: {
						headers: {
							'Api-User-Agent': `MarkAdmins/${version} (https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MarkAdmins.js)`
						}
					},
					parameters: {
						action: 'query',
						format: 'json',
						formatversion: '2'
					}
				});
				resolve(this._api);
			});
		});
	}

	/**
	 * @param {Record<string, ?string>} data
	 * @param {boolean} [forceUpdatePageData] Whether to call `mw.user.options.set` regardless of
	 * the request result (default: `false`). By default, it is called only on success.
	 * @returns {Promise<?string>} `null` on success, or an error code on failure.
	 */
	static async save(data, forceUpdatePageData = false) {
		const api = await this.api;
		/** @type {?string} */
		const code = await api.saveOptions(data)
			.then(() => {
				mw.user.options.set(data);
				return null;
			}).catch((code, err) => {
				if (forceUpdatePageData) {
					mw.user.options.set(data);
				}
				console.error(err);
				return /** @type {string} */ (code);
			});
		return code;
	}

	/**
	 * @private
	 */
	static createStyleTag() {
		const style = document.createElement('style');
		style.textContent =
			'.mac-overlay {' +
				'width: 100%;' +
				'height: 100%;' +
				'position: absolute;' +
				'top: 0;' +
				'left: 0;' +
				'z-index: 10000;' +
			'}' +
			'.mac-label-table {' +
				'table-layout: auto;' +
				'border-collapse: collapse;' +
			'}' +
			'.mac-label-table > tbody > tr > td {' +
				'padding: 0.4em 0.6em;' +
			'}' +
			'.mac-label-table > tbody > tr:nth-child(2n) {' +
				'background-color: var(--background-color-neutral, #eaecf0);' +
			'}';
		document.head.appendChild(style);
	}

    static createPortletLink() {
        mw.util.addPortletLink(
            'p-tb',
            '/wiki/Special:MarkAdminsConfig',
            'MarkAdminsの設定',
            't-mac',
            'MarkAdminsの設定を変更する'
        );
    }

	/**
	 * Creates the config interface.
	 *
	 * @param {DefaultConfigSchema} cfg
	 */
	constructor(cfg) {
		// Initialize document
		MarkAdminsConfig.createStyleTag();
		const headingText = 'MarkAdminsの設定';
		document.title = `${headingText} - ${mw.config.get('wgSiteName')}`;
		$('.mw-first-heading').text(headingText);
		const $content = $('.mw-body-content');
		$content.empty();

		/**
		 * @type {JQuery<HTMLElement>}
		 */
		this.$overlay = $('<div>').addClass('mac-overlay').hide();

		/** @type {(() => void)[]} */
		const onReadyCallbacks = [];

		// Create a section for label settings
		/**
		 * @typedef {object} GroupRow
		 * @property {OO.ui.TextInputWidget} labelInput
		 * @property {OO.ui.CheckboxInputWidget} enableCheckbox
		 * @property {OO.ui.ButtonWidget} resetButton
		 * @property {() => void} reset
		 */
		/**
		 * @type {Record<string, GroupRow>}
		 */
		this.groups = Object.create(null);

		const $groupTableBody = $('<tbody>');
		const defaults = MarkAdminsConfig.defaults;
		for (const [group, defaultCfg] of Object.entries(defaults.groups)) {
			const labelInput = new OO.ui.TextInputWidget({
				$element: $('<div>').css({ 'min-width': '25em' }),
				label: 'ラベル',
				value: cfg.groups[group].label
			});
			const enableCheckbox = new OO.ui.CheckboxInputWidget({
				selected: cfg.groups[group].enabled
			});
			const resetButton = new OO.ui.ButtonWidget({
				flags: ['destructive'],
				label: 'リセット'
			});

			const setDisabledOnResetButton = () => {
				const canReset = labelInput.getValue() !== defaultCfg.label || enableCheckbox.isSelected() !== defaultCfg.enabled;
				resetButton.setDisabled(!canReset);
			};
			labelInput.on('change', setDisabledOnResetButton);
			enableCheckbox.on('change', setDisabledOnResetButton);
			onReadyCallbacks.push(() => enableCheckbox.emit('change', enableCheckbox.isSelected())); // Initialize state

			const reset = () => {
				labelInput.setValue(defaultCfg.label);
				enableCheckbox.setSelected(defaultCfg.enabled);
			};
			resetButton.on('click', reset);

			const fieldset = new OO.ui.FieldsetLayout();
			let labelInputLayout;
			fieldset.addItems([
				(labelInputLayout = new OO.ui.FieldLayout(labelInput, {
					align: 'top',
					help: `既定値: ${defaultCfg.label} (${defaultCfg.enabled ? '有効' : '無効'})`,
					helpInline: true,
					invisibleLabel: true
				})),
				new OO.ui.FieldLayout(enableCheckbox, {
					align: 'inline',
					label: '有効化',
				})
			]);
			labelInput.setValidation((val) => {
				const value = clean(val);
				if (value) {
					labelInputLayout.setErrors([]);
					return true;
				} else {
					labelInputLayout.setErrors(['空文字はラベルとして使用できません。']);
					return false;
				}
			});

			$groupTableBody.append(
				$('<tr>').append(
					$('<td>').append(
						$('<a>')
							.prop({
								href: defaultCfg.link,
								target: '_blank'
							})
							.text(defaultCfg.localized),
						$('<br>'),
						'(',
						$('<code>').text(group),
						')'
					),
					$('<td>').append(fieldset.$element),
					$('<td>').append(resetButton.$element)
				)
			);
			this.groups[group] = { labelInput, enableCheckbox, resetButton, reset };
		}

		// A "Reset all" button used at the bottom
		// XXX: Hoisting exploited: btnResetAllLabels, btnResetAllConds, resetAllLabels, resetAllConds
		const resetAllButton = new OO.ui.ButtonWidget({
			flags: ['destructive'],
			label: '全リセット'
		});
		const setDisabledOnResetAllButton = () => {
			const canReset = !btnResetAllLabels.isDisabled() || !btnResetAllConds.isDisabled();
			resetAllButton.setDisabled(!canReset);
		};
		const resetAll = () => {
			resetAllLabels();
			resetAllConds();
		};
		resetAllButton.on('click', () => MarkAdminsConfig.resetIfConfirmed(resetAll));

		// Create a "Reset all labels" button
		const btnResetAllLabels = new OO.ui.ButtonWidget({
			$element: $('<div>').css({ 'margin-top': '0.5em' }),
			flags: ['destructive'],
			label: '全てのラベル設定をリセット',
		});
		const labelRows = Object.values(this.groups);
		const resetAllLabels = () => labelRows.forEach(row => row.reset());
		btnResetAllLabels.on('click', () => MarkAdminsConfig.resetIfConfirmed(resetAllLabels));

		// Dynamically enable/disable `btnResetAllLabels`
		const setDisabledOnResetAllLabelsButton = () => {
			const disabled = labelRows.every(obj => obj.resetButton.isDisabled());
			btnResetAllLabels.setDisabled(disabled);
			setDisabledOnResetAllButton();
		};
		labelRows.forEach(row => row.resetButton.on('disable', setDisabledOnResetAllLabelsButton));
		onReadyCallbacks.push(() => labelRows[0].resetButton.emit('disable', true)); // Initialize state

		// Create a section for conds settings
		const nsWidgetInitializer = MarkAdminsConfig.getNamespaceWidgetInitializer(cfg);
		/**
		 * @type {OO.ui.MenuTagMultiselectWidget}
		 */
		this.namespaces = new OO.ui.MenuTagMultiselectWidget({
			inputPosition: 'outline',
			options: nsWidgetInitializer.options,
			allowedValues: nsWidgetInitializer.options.map(obj => obj.data)
		});
		this.namespaces.setValue(
			// Don't use the `selected` option in the constructor call. The specified tags will otherwise
			// appear in the tag list and duplicate the dropdown options (is this an upstream bug?)
			nsWidgetInitializer.labels
		);
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 */
		this.talk = new OO.ui.CheckboxInputWidget({
			selected: cfg.conds.talk
		});
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 */
		this.history = new OO.ui.CheckboxInputWidget({
			selected: cfg.conds.history
		});
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 */
		this.diff = new OO.ui.CheckboxInputWidget({
			selected: cfg.conds.diff
		});
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 */
		this.subpages = new OO.ui.CheckboxInputWidget({
			selected: cfg.conds.subpages
		});
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 */
		this.self = new OO.ui.CheckboxInputWidget({
			selected: cfg.conds.self
		});
		/**
		 * @type {OO.ui.CheckboxInputWidget}
		 */
		this.contribs = new OO.ui.CheckboxInputWidget({
			selected: cfg.conds.contribs
		});

		const fieldset = new OO.ui.FieldsetLayout();
		fieldset.addItems([
			new OO.ui.FieldLayout(this.namespaces, {
				align: 'top',
				help: '「ノートページ上で有効化」が無効の場合でも、ここで指定された名前空間が優先されます。',
				helpInline: true,
				label: '有効化する名前空間'
			}),
			new OO.ui.FieldLayout(this.talk, {
				align: 'inline',
				help: '既定値: 有効',
				helpInline: true,
				label: 'ノートページ上で有効化'
			}),
			new OO.ui.FieldLayout(this.history, {
				align: 'inline',
				help: '既定値: 有効',
				helpInline: true,
				label: '編集履歴ページ上で有効化'
			}),
			new OO.ui.FieldLayout(this.diff, {
				align: 'inline',
				help: '既定値: 有効',
				helpInline: true,
				label: '差分ページ上で有効化'
			}),
			new OO.ui.FieldLayout(this.subpages, {
				align: 'inline',
				help: '既定値: 無効',
				helpInline: true,
				label: 'サブページリンクをマークアップ'
			}),
			new OO.ui.FieldLayout(this.self, {
				align: 'inline',
				help: '既定値: 有効',
				helpInline: true,
				label: '自身の利用者リンクをマークアップ'
			}),
			new OO.ui.FieldLayout(this.contribs, {
				align: 'inline',
				help: '既定値: 有効',
				helpInline: true,
				label: '投稿記録リンクをマークアップ'
			})
		]);

		// Create a "Reset all conds" button
		const btnResetAllConds = new OO.ui.ButtonWidget({
			$element: $('<div>').css({ 'margin-top': '0.5em' }),
			flags: ['destructive'],
			label: 'マークアップ設定をリセット',
		});
		this.checkboxKeys = /** @type {(keyof Omit<DefaultConfigSchema['conds'], 'namespaces'>)[]} */ (
			Object.keys(cfg.conds).filter(v => v !== 'namespaces')
		);
		const resetAllConds = () => {
			this.namespaces.setValue(nsWidgetInitializer.defaultLabels);
			this.checkboxKeys.forEach(key => this[key].setSelected(defaults.conds[key]));
		};
		btnResetAllConds.on('click', () => MarkAdminsConfig.resetIfConfirmed(resetAllConds));

		// Dynamically enable/disable `btnResetAllConds`
		const setDisabledOnResetCondsButton = () => {
			const canReset = this.checkboxKeys.some(key => this[key].isSelected() !== defaults.conds[key]) ||
				MarkAdminsConfig.encodeNamespaces(this.getNamespaces()) !== defaults.conds.namespaces;
			btnResetAllConds.setDisabled(!canReset);
			setDisabledOnResetAllButton();
		};
		/**
		 * Used to prevent recursive calls of setDisabledOnResetCondsButton()
		 * @type {NodeJS.Timeout}
		 */
		let resetCondsTimeout;
		this.namespaces.on('change', () => {
			clearTimeout(resetCondsTimeout);
			resetCondsTimeout = setTimeout(setDisabledOnResetCondsButton, 50);
		});
		this.checkboxKeys.forEach((key) => {
			this[key].on('change', () => {
				clearTimeout(resetCondsTimeout);
				resetCondsTimeout = setTimeout(setDisabledOnResetCondsButton, 50);
			});
		});
		onReadyCallbacks.push(() => this.talk.emit('change', this.talk.isSelected())); // Initialize state

		// Create a section for saving the config
		const $saveSection = $('<div>').css({ 'margin-top': '0.5em' });
		const PendingButtonWidget = PendingButtonWidgetFactory();
		/**
		 * @type {InstanceType<typeof PendingButtonWidget>}
		 */
		this.saveButton = new PendingButtonWidget({
			flags: ['primary', 'progressive'],
			label: '保存'
		});
		this.saveButton.on('click', async () => {
			this.$overlay.show();
			await this.save();
			this.$overlay.hide();
		});

		// Finalize page content
		$content.append(
			$('<h3>').text('ラベル設定'),
			$('<table>').addClass('mac-label-table').append($groupTableBody),
			btnResetAllLabels.$element,
			$('<h3>').text('マークアップ設定'),
			fieldset.$element,
			btnResetAllConds.$element,
			$('<h3>').text('保存'),
			$saveSection.append(
				this.saveButton.$element,
				resetAllButton.$element
			),
			this.$overlay
		);

		onReadyCallbacks.forEach(callback => callback());
	}

	/**
	 * @param {() => (void | Promise<void>)} callback
	 * @returns {Promise<boolean>}
	 * @private
	 */
	static async resetIfConfirmed(callback) {
		const confirmed = await OO.ui.confirm('値を既定値にリセットしますか？', {
			actions: MarkAdminsConfig.getYesNoActions(),
			title: '確認',
			size: 'medium'
		});
		if (confirmed) {
			await callback();
			mw.notify('リセットしました', { type: 'success' });
		}
		return confirmed;
	}

	/**
	 * @returns {OO.ui.ActionWidget.ConfigOptions[]}
	 * @private
	 */
	static getYesNoActions() {
		return [
			{
				action: 'accept',
				label: 'はい',
				flags: ['primary', 'progressive']
			},
			{
				action: 'reject',
				label: 'いいえ',
				flags: 'safe'
			}
		];
	}

	/**
	 * @param {DefaultConfigSchema} cfg
	 * @returns {{ options: OO.ui.MenuTagMultiselectWidget.Option[]; labels: string[]; defaultLabels: string[]; }}
	 * @private
	 */
	static getNamespaceWidgetInitializer(cfg) {
		const wgFormattedNamespaces = mw.config.get('wgFormattedNamespaces');
		const /** @type {string[]} */ labels = [];
		const /** @type {string[]} */ defaultLabels = [];
		const namespaces = this.decodeNamespaces(cfg.conds.namespaces);
		const defaultNamespaces = this.decodeNamespaces(this.defaults.conds.namespaces);
		const options = Object.keys(wgFormattedNamespaces).sort((a, b) => +a - +b).map((n) => {
			const ns = +n;
			const label = wgFormattedNamespaces[ns] || '(標準)';
			if (namespaces.includes(ns)) {
				labels.push(label);
			}
			if (defaultNamespaces.includes(ns)) {
				defaultLabels.push(label);
			}
			return /** @type {OO.ui.MenuTagMultiselectWidget.Option} */ ({ label, data: ns });
		});
		return { options, labels, defaultLabels };
	}

	getNamespaces() {
		return /** @type {number[]} */ (this.namespaces.getValue());
	}

	/**
	 * @returns {Promise<void>}
	 * @private
	 */
	async save() {
		const /** @type {PartialConfigSchema} */ options = Object.create(null);
		const defaults = MarkAdminsConfig.defaults;

		let /** @type {?OO.ui.TextInputWidget} */ focusTarget = null;
		const /** @type {Set<string>} */ labelsSeen = new Set();
		const /** @type {Set<string>} */ duplicateLabels = new Set();

		for (const [group, { labelInput, enableCheckbox }] of Object.entries(this.groups)) {
			const label = clean(labelInput.getValue());
			labelInput.setValue(label);
			if (!label) {
				labelInput.focus();
				mw.notify('エラーを解消してください', { type: 'error' });
				return;
			} else if (labelsSeen.has(label)) {
				focusTarget = focusTarget || labelInput;
				duplicateLabels.add(label);
			}
			labelsSeen.add(label);
			if (label !== defaults.groups[group].label) {
				setProp(options, 'groups', group, 'label', label);
			}

			const enabled = enableCheckbox.isSelected();
			if (enabled !== defaults.groups[group].enabled) {
				setProp(options, 'groups', group, 'enabled', enabled);
			}
		}

		const namespaces = MarkAdminsConfig.encodeNamespaces(this.getNamespaces());
		if (namespaces !== defaults.conds.namespaces) {
			setProp(options, 'conds', 'namespaces', namespaces);
		}

		for (const key of this.checkboxKeys) {
			const checked = this[key].isSelected();
			if (checked !== defaults.conds[key]) {
				setProp(options, 'conds', key, checked);
			}
		}

		if (OO.compare(options, MarkAdminsConfig.getLatest())) {
			mw.notify('設定内容が保存済みの値と同一です');
			return;
		}

		if (duplicateLabels.size) {
			const labels = Array.from(duplicateLabels).map(label => `「${label}」`);
			const confirmed = await OO.ui.confirm(
				$('<div>').append(
					new OO.ui.MessageWidget({
						label: `ラベル${labels.join('')}が複数回使用されています。`,
						type: 'warning'
					}).$element,
					'このまま保存しますか？'
				),
				{
					actions: MarkAdminsConfig.getYesNoActions(),
					title: '警告',
					size: 'medium'
				}
			);
			if (!confirmed) {
				if (focusTarget) focusTarget.focus();
				return;
			}
		}

		// If this will reset all config values to their default values, clear the user config
		const optionValue = OO.compare(defaults, $.extend(true, Object.create(null), defaults, options))
			? null
			: JSON.stringify(options);
		console.log('options', optionValue && options);

		this.saveButton.setPending();
		const code = await MarkAdminsConfig.save({ [MarkAdminsConfig.key]: optionValue });
		if (code) {
			mw.notify('保存に失敗しました: ' + code, { type: 'error', autoHideSeconds: 'long' });
		} else {
			mw.notify('保存しました', { type: 'success' });
		}
		this.saveButton.unsetPending();
	}

}
/**
 * @type {mw.Api}
 */
MarkAdminsConfig._api = Object.create(null);
/**
 * @type {string}
 */
MarkAdminsConfig.key = 'userjs-markadmins';
/**
 * @typedef {{ label: string; enabled: boolean; }} LabelConfig
 *
 * @typedef {object} LegacyConfigSchema
 * @property {Record<string, LabelConfig>} groups
 * @property {string[]} runOn An array of canonical namespaces (e.g. "Special")
 * @property {boolean} runOnTalk
 * @property {boolean} runOnHistory
 * @property {boolean} runOnDiff
 * @property {boolean} markSubpages
 * @property {boolean} markMyself
 * @property {boolean} markContribs
 *
 * @typedef {object} ConfigSchema
 * @property {Record<string, LabelConfig>} groups
 * @property {ConfigSchemaConds} conds
 *
 * @typedef {object} ConfigSchemaConds
 * @property {string} namespaces Should MA run in these namespaces?
 * @property {boolean} talk Should MA run on talk pages?
 * @property {boolean} history Should MA run on history pages?
 * @property {boolean} diff Should MA run on diff pages?
 * @property {boolean} subpages Should MA mark subpage links?
 * @property {boolean} self Should MA mark the context user's user links?
 * @property {boolean} contribs Should MA mark user contribution links?
 *
 * @typedef {'local' | 'global' | 'meta'} Domain
 *
 * @typedef {LabelConfig & { localized: string; link: string; domain: Domain; }} GroupData
 *
 * @typedef {Omit<ConfigSchema, 'groups'> & { groups: Record<string, GroupData>; }} DefaultConfigSchema
 *
 * @typedef {import('ts-essentials').DeepPartial<ConfigSchema>} PartialConfigSchema
 */
/**
 * @type {Map<string, GroupData>}
 *
 * CAUTION: The order of elements in this list affects the order of markers.
 */
MarkAdminsConfig.groupMap = new Map([
	['sysop', {
		label: 'A',
		enabled: true,
		localized: '管理者',
		link: 'https://ja.wikipedia.org/wiki/Wikipedia:管理者',
		domain: 'local'
	}],
	['suppress', {
		label: 'OS',
		enabled: true,
		localized: 'オーバーサイト',
		link: 'https://ja.wikipedia.org/wiki/Wikipedia:オーバーサイトの方針',
		domain: 'local'
	}],
	['checkuser', {
		label: 'CU',
		enabled: true,
		localized: 'チェックユーザー',
		link: 'https://ja.wikipedia.org/wiki/Wikipedia:チェックユーザーの方針',
		domain: 'local'
	}],
	['bureaucrat', {
		label: 'B',
		enabled: true,
		localized: 'ビューロクラット',
		link: 'https://ja.wikipedia.org/wiki/Wikipedia:ビューロクラット',
		domain: 'local'
	}],
	['interface-admin', {
		label: 'IA',
		enabled: true,
		localized: 'インターフェース管理者',
		link: 'https://ja.wikipedia.org/wiki/Wikipedia:インターフェース管理者',
		domain: 'local'
	}],
	['accountcreator', {
		label: 'AC',
		enabled: true,
		localized: 'アカウント作成者',
		link: 'https://ja.wikipedia.org/wiki/Wikipedia:アカウント作成者',
		domain: 'local'
	}],
	['eliminator', {
		label: 'E',
		enabled: true,
		localized: '削除者',
		link: 'https://ja.wikipedia.org/wiki/Wikipedia:削除者',
		domain: 'local'
	}],
	['rollbacker', {
		label: 'RB',
		enabled: true,
		localized: '巻き戻し者',
		link: 'https://ja.wikipedia.org/wiki/Wikipedia:巻き戻し者',
		domain: 'local'
	}],
	['abusefilter', {
		label: 'FE',
		enabled: true,
		localized: '編集フィルター編集者',
		link: 'https://ja.wikipedia.org/wiki/Wikipedia:編集フィルター編集者',
		domain: 'local'
	}],
	['bot', {
		label: 'Bot',
		enabled: true,
		localized: 'ボット',
		link: 'https://ja.wikipedia.org/wiki/Wikipedia:Bot',
		domain: 'local'
	}],
	['founder', {
		label: 'F',
		enabled: true,
		localized: '創設者',
		link: 'https://meta.wikimedia.org/wiki/Founder/ja',
		domain: 'global'
	}],
	['steward', {
		label: 'S',
		enabled: true,
		localized: 'スチュワード',
		link: 'https://meta.wikimedia.org/wiki/Stewards/ja',
		domain: 'global'
	}],
	['ombuds', {
		label: 'Omb',
		enabled: true,
		localized: 'オンブズ委員',
		link: 'https://meta.wikimedia.org/wiki/Ombuds_commission/ja',
		domain: 'global'
	}],
	['staff', {
		label: 'Staff',
		enabled: true,
		localized: 'スタッフ',
		link: 'https://wikimediafoundation.org/role/staff-contractors/',
		domain: 'global'
	}],
	['sysadmin', {
		label: 'SA',
		enabled: true,
		localized: 'システム管理者',
		link: 'https://meta.wikimedia.org/wiki/System_administrators/ja',
		domain: 'global'
	}],
	['global-sysop', {
		label: 'GS',
		enabled: true,
		localized: 'グローバル管理者',
		link: 'https://meta.wikimedia.org/wiki/Global_sysops/ja',
		domain: 'global'
	}],
	['abusefilter-maintainer', {
		label: 'GFE',
		enabled: true,
		localized: '編集フィルター保守員',
		link: 'https://meta.wikimedia.org/wiki/Abuse_filter_maintainer/ja',
		domain: 'global'
	}],
	['abusefilter-helper', {
		label: 'GFH',
		enabled: true,
		localized: '編集フィルター閲覧者',
		link: 'https://meta.wikimedia.org/wiki/Abuse_filter_helpers/ja',
		domain: 'global'
	}],
	['global-interface-editor', {
		label: 'GIE',
		enabled: true,
		localized: 'グローバルインターフェース編集者',
		link: 'https://meta.wikimedia.org/wiki/Interface_editors/ja',
		domain: 'global'
	}],
	['global-bot', {
		label: 'GBot',
		enabled: true,
		localized: 'グローバルボット',
		link: 'https://meta.wikimedia.org/wiki/Bot_policy/ja#global',
		domain: 'global'
	}],
	['global-deleter', {
		label: 'GE',
		enabled: true,
		localized: 'グローバル削除者',
		link: 'https://meta.wikimedia.org/wiki/Global_deleters/ja',
		domain: 'global'
	}],
	['global-rollbacker', {
		label: 'GRB',
		enabled: true,
		localized: 'グローバル巻き戻し者',
		link: 'https://meta.wikimedia.org/wiki/Global_rollback/ja',
		domain: 'global'
	}],
	['vrt-permissions', {
		label: 'VRT',
		enabled: true,
		localized: '問い合わせ対応ボランティアチーム',
		link: 'https://meta.wikimedia.org/wiki/Volunteer_Response_Team/ja',
		domain: 'global'
	}],
	['global-renamer', {
		label: 'GRN',
		enabled: true,
		localized: 'グローバル利用者名変更者',
		link: 'https://meta.wikimedia.org/wiki/Global_renamers/ja',
		domain: 'meta'
	}],
	['wmf-officeit', {
		label: 'WMF OIT',
		enabled: true,
		localized: 'WMFオフィスIT',
		link: 'https://meta.wikimedia.org/wiki/Meta:WMF_Office_IT/ja',
		domain: 'meta'
	}],
	['wmf-supportsafety', {
		label: 'WMF T&S',
		enabled: true,
		localized: 'WMF信頼と安全班',
		link: 'https://meta.wikimedia.org/wiki/Meta:WMF_Trust_and_Safety/ja',
		domain: 'meta'
	}]
]);
/**
 * @type {import('ts-essentials').DeepReadonly<DefaultConfigSchema>}
 */
MarkAdminsConfig.defaults = {
	groups: (() => { // Avoid using Object.fromEntries (ES2019)
		const groups = Object.create(null);
		MarkAdminsConfig.groupMap.forEach((val, key) => groups[key] = val);
		return groups;
	})(),
	conds: {
		namespaces: [
			/* Special */ -1, /* (Main) */ 0, /* User */ 2, /* User_talk */ 3, /* Project */ 4,
			/* File */ 6, /* Help */ 12, /* Portal */ 100, /* プロジェクト */ 102
		].join('|'),
		talk: true,
		history: true,
		diff: true,
		subpages: false,
		self: true,
		contribs: true
	}
};

/**
 * Copy of `OO.setProp`.
 *
 * We need `oojs-ui` only on the config page, and loading the large library on all other pages
 * is overkill and resource-unfriendly; hence the copy.
 *
 * @link https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/34875dec1fdedbcf52e2d1a026c2f5562de2c4e4/resources/lib/oojs/oojs.js#215
 * @param {Record<string, any>} obj
 * @param {...any} keys The last element is used as the value.
 * @returns {void}
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setProp(obj, ...keys) {
	if ( Object( obj ) !== obj || arguments.length < 2 ) {
		return;
	}
	var prop = obj;
	for ( var i = 1; i < arguments.length - 2; i++ ) {
		if ( prop[ arguments[ i ] ] === undefined ) {
			prop[ arguments[ i ] ] = {};
		}
		if ( Object( prop[ arguments[ i ] ] ) !== prop[ arguments[ i ] ] ) {
			return;
		}
		prop = prop[ arguments[ i ] ];
	}
	prop[ arguments[ arguments.length - 2 ] ] = arguments[ arguments.length - 1 ];
}

function PendingButtonWidgetFactory() {
	const classPending = 'oo-ui-pendingElement-pending';
	return class PendingButtonWidget extends OO.ui.ButtonWidget {

		setPending() {
			this.setDisabled(true)
				.$element.children('.oo-ui-buttonElement-button').eq(0)
					.addClass(classPending);
			return this;
		}

		unsetPending() {
			this.setDisabled(false)
				.$element.children('.oo-ui-buttonElement-button').eq(0)
					.removeClass(classPending);
			return this;
		}

	};
}

/**
 * @param {string} str
 * @returns {string}
 */
function clean(str) {
	return str.replace(/[\u200E\u200F\u202A-\u202E]+/g, '').trim();
}

// ***********************************************************************************************

MarkAdmins.init();

// ***********************************************************************************************
})();
// </nowiki>