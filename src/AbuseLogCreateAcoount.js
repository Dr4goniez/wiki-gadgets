//<nowiki>
/* global mw */
(() => {

	if (mw.config.get('wgCanonicalSpecialPageName') !== 'AbuseLog') {
		return;
	}

	const init = () => {

		/** @typedef {Record<string, HTMLAnchorElement[]>} AnchorMap */
		const /** @type {AnchorMap} */ anchorMap = Array.from($('.mw-body-content > form > ul > li')).reduce(
			/**
			 * @param {AnchorMap} acc
			 */
			(acc, li) => {
				if (/「(auto)?createaccount」/.test(li.innerText)) {
					const anchor = li.querySelector('a');
					const username = anchor && anchor.textContent;
					if (anchor && username) {
						if (acc[username]) {
							acc[username].push(anchor);
						} else {
							acc[username] = [anchor];
						}
					}
				}
				return acc;
			},
		Object.create(null));

		const users = Object.keys(anchorMap);
		if (!users.length) return;

		new mw.Api().post({
			action: 'query',
			list: 'users',
			usprop: '',
			ususers: users,
			formatversion: '2'
		}).then((res) => {
			(res && res.query && res.query.users || []).forEach((obj, i) => {
				if (obj.missing) {
					anchorMap[users[i]].forEach((a) => a.classList.add('new'));
				}
			});
		}).catch((_, err) => {
			console.error(err);
		});

	};

	$.when(mw.loader.using('mediawiki.api'), $.ready).then(init);

})();
//</nowiki>