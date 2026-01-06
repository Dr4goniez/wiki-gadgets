/**
 * Helper to update the JSON data for MarkAdmins.
 *
 * @module
 * @link https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MarkAdmins.js
 * @link https://ja.wikipedia.org/wiki/MediaWiki:Gadget-MarkAdmins-data.json
 *
 * NOTE: This module is for use by sysops only, as `editsitejson` is required to edit the JSON
 * page in the MediaWiki namespace, and also `apihighlimits` because the `list=globalallusers`
 * API currectly does not support query continuation due to a bug ([[phab:T241940]]).
 */
// @ts-check
/* global mw, OO */
// <nowiki>
/**
 * @typedef {'local' | 'global' | 'meta'} Domain
 */
/**
 * @param {Record<Domain, string[]>} groupMap List of group names to search users for.
 * The order of the groups in the arrays affects the order of markers.
 * @param {boolean} DEVMODE
 */
module.exports = function MarkAdminsUpdaterFactory(groupMap, DEVMODE) {
// ***********************************************************************************************

class MarkAdminsUpdater {

	static async init() {
		if (!(mw.config.get('wgUserGroups') || []).includes('sysop')) {
			return;
		}
		await $.when(mw.loader.using('mediawiki.util'), $.ready);

		const portlet = mw.util.addPortletLink(
			document.getElementById('p-cactions') ? 'p-cactions' : 'p-personal',
			'#',
			'MarkAdmins-updater',
			'ca-mau'
		);
		if (portlet) {
			portlet.addEventListener('click', async (e) => {
				e.preventDefault();
				if (this.running) {
					mw.notify('別の更新処理が進行中です。完了までお待ちください', { type: 'warn' });
					return;
				}
				this.running = true;
				try {
					await this.execute();
				} finally {
					this.running = false;
				}
			});
		} else {
			throw new Error('Failed to create a portlet link for MarkAdmins-updater.');
		}
	}

	/**
	 * @typedef {Record<string, string[]>} JsonSchema
	 */
	/**
	 * @returns {Promise<void>}
	 */
	static async execute() {
		await this.load();

		const autoEdit = await this.askMode();
		mw.notify('JSONデータを取得しています...');

		const api = new mw.Api();
		const metaApi = new mw.ForeignApi('https://meta.wikimedia.org/w/api.php');
		const responses = await Promise.all([
			this.fetchData(api, 'local'),
			this.fetchData(api, 'global'),
			this.fetchData(metaApi, 'meta'),
		]);
		if (responses.some(v => v === null)) {
			mw.notify('JSONデータの取得に失敗しました', { type: 'error' });
			return;
		}

		/**
		 * @type {JsonSchema}
		 */
		const json = Object.create(null);
		/**
		 * @type {UserGroupMap[]}
		 */
		(responses).forEach((map, i) => {
			const isLastIteration = i === responses.length - 1;
			map.forEach((groups, username) => {
				if (!(username in json)) {
					json[username] = [];
				}
				json[username].push(...groups);

				if (isLastIteration) {
					// Ensure the array is non-empty and its elements are unique
					const set = new Set(json[username]);
					if (set.size) {
						json[username] = [...set];
					} else {
						delete json[username];
					}
				}
			});
		});
		console.log(json);
		mw.notify('JSONデータをブラウザコンソールに出力しました', { type: 'success' });
		const serialized = JSON.stringify(json);

		const title = 'MarkAdmins-data.json';
		const pagetitle = DEVMODE
			? `User:${mw.config.get('wgUserName')}/${title}`
			: 'MediaWiki:Gadget-' + title;
		const rev = await this.read(api, pagetitle);

		let proceed;
		if (!rev) {
			if (autoEdit) {
				mw.notify(`「${pagetitle}」の最新版の取得に失敗しました`, { type: 'error' });
			}
			proceed = false;
		} else if (rev.missing) {
			if (autoEdit) {
				proceed = await OO.ui.confirm(
					`「${rev.title}」は存在しません。新規に作成しますか？`,
					{
						actions: [
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
						],
						title: 'MarkAdmins-updater',
						size: 'medium'
					}
				);
			} else {
				proceed = false;
			}
		} else {
			let oldJson;
			try {
				oldJson = /** @type {JsonSchema} */ (JSON.parse(rev.content));
			} catch (_) {
				mw.notify('既存のJSONが不正です', { type: 'warn' });
				oldJson = null;
			}
			if (oldJson !== null && serialized === JSON.stringify(oldJson)) {
				mw.notify('データは最新です');
				proceed = false;
			} else if (autoEdit) {
				mw.notify('データを更新しています...');
				proceed = true;
			} else {
				mw.notify('データの更新が必要です');
				proceed = false;
			}
		}

		if (proceed && rev) {
			await api.postWithEditToken({
				action: 'edit',
				title: rev.title,
				text: serialized,
				summary: 'データの更新 ([[H:MA#UPDATER|MarkAdmins-updater]])',
				baserevid: rev.baserevid,
				basetimestamp: rev.basetimestamp,
				starttimestamp: rev.starttimestamp,
				formatversion: '2'
			}).then((res) => {
				if (res && res.edit && res.edit.result === 'Success') {
					mw.notify('データを更新しました', { type: 'success' });
				} else {
					console.error(res);
					mw.notify('データの更新に失敗しました', { type: 'error' });
				}
			}).catch((code, err) => {
				console.error(err);
				mw.notify('データの更新に失敗しました: ' + code, { type: 'error' });
			});
		}
	}

	/**
	 * Lazy-loads dependent modules.
	 *
	 * These modules are required only when {@link execute} is called by a portlet link click,
	 * so they shouldn't be unconditionally loaded.
	 */
	static load() {
		return mw.loader.using(['mediawiki.api', 'mediawiki.ForeignApi', 'oojs-ui-windows']);
	}

	/**
	 * @returns {JQuery.Promise<boolean>}
	 */
	static askMode() {
		return OO.ui.confirm(
			$('<div>').append(
				$('<p>').text('処理を選択してください:'),
				$('<h5>').text('自動編集'),
				$('<p>').text('MarkAdminsのJSONデータを取得し、ガジェットデータを自動的に編集・更新します。'),
				$('<h5>').text('コンソール出力'),
				$('<p>').text('自動編集は行わず、取得したJSONデータをブラウザコンソールに出力します。'),
			),
			{
				actions: [
					{
						action: 'accept',
						label: '自動編集',
						flags: ['primary', 'progressive']
					},
					{
						action: 'reject',
						label: 'コンソール出力',
						flags: 'safe'
					}
				],
				title: 'MarkAdmins-updater',
				size: 'medium'
			}
		);
	}

	/**
	 * @typedef {Map<string, string[]>} UserGroupMap username => groups
	 */
	/**
	 * @param {mw.Api} api
	 * @param {Domain} domain
	 * @returns {JQuery.Promise<?UserGroupMap>}
	 */
	static fetchData(api, domain) {
		let list, prefix;
		if (domain === 'local' || domain === 'meta') {
			list = 'allusers';
			prefix = 'au';
		} else {
			list = 'globalallusers';
			prefix = 'agu';
		}

		return api.get({
			action: 'query',
			list,
			[`${prefix}limit`]: 'max',
			[`${prefix}group`]: groupMap[domain].join('|'),
			[`${prefix}prop`]: 'groups',
			formatversion: '2'
		}).then((res) => {
			/**
			 * @type {{ id: number; name: string; groups: string[]; }[]=}
			 */
			const dataArray = res && res.query && res.query[list];
			if (!Array.isArray(dataArray)) {
				return null;
			}
			/**
			 * @type {UserGroupMap}
			 */
			const map = new Map();
			const orderMap = new Map(groupMap[domain].map((group, i) => [group, i]));
			for (const { name, groups } of dataArray) {
				const filtered = groups
					.filter(g => orderMap.has(g))
					// @ts-expect-error
					.sort((a, b) => orderMap.get(a) - orderMap.get(b));
				if (filtered.length) {
					map.set(name, filtered);
				}
			}
			return map;
		}).catch((_, err) => {
			console.error(err);
			return null;
		});
	}

	/**
	 * @typedef {import('ts-essentials').XOR<
	 *   { title: string; missing: true; },
	 *   { title: string; missing: false; baserevid: number; basetimestamp: string; starttimestamp: string; content: string; }
	 * >} Revision
	 */
	/**
	 * Retrieves the latest revision of a given title from the API.
	 *
	 * @param {mw.Api} api
	 * @param {string} pagetitle
	 * @returns {JQuery.Promise<?Revision>}
	 */
	static read(api, pagetitle) {
		return api.get({
			action: 'query',
			titles: pagetitle,
			prop: 'revisions',
			rvprop: 'ids|timestamp|content',
			rvslots: 'main',
			rvlimit: 1,
			curtimestamp: 1,
			formatversion: '2'
		}).then((res) => {
			const pages = res && res.query && res.query.pages;
			if (!Array.isArray(pages) || !pages[0]) {
				return null;
			}
			const { title, missing = false, revisions } = pages[0];
			if (missing) {
				return { title, missing };
			}
			if (!Array.isArray(revisions) || !revisions[0]) {
				return null;
			}
			const { revid, timestamp, slots } = revisions[0];
			const content = slots && slots.main && slots.main.content;
			if (typeof revid !== 'number' || !timestamp || typeof content !== 'string') {
				return null;
			} else {
				return {
					title,
					missing,
					baserevid: revid,
					basetimestamp: timestamp,
					starttimestamp: res.curtimestamp,
					content
				};
			}
		}).catch((_, err) => {
			console.error(err);
			return null;
		});
	}

}

MarkAdminsUpdater.running = false;

// ***********************************************************************************************

return MarkAdminsUpdater;

// ***********************************************************************************************
};
// </nowiki>