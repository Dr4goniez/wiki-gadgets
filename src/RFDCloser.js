// @ts-check
/* global mw */
//<nowiki>
(function() {

var /** @type {WpLibExtra} */ lib;

function init() {
	if (mw.config.get('wgPageName') !== 'Wikipedia:リダイレクトの削除依頼/受付') {
		return;
	}
	var modules = [
		'mediawiki.Title',
		'mediawiki.util',
		'mediawiki.api'
	];
	$.when(
		loadLibrary(),
		mw.loader.using(modules),
		$.ready
	).then(function(libReady) {
		if (!libReady ||
			mw.util.getParamValue('action') ||
			mw.util.getParamValue('oldid') ||
			mw.util.getParamValue('diff') ||
			!countUnclosed()
		) {
			return;
		}
	}).catch(console.error);
}

/**
 * Load WpLibExtra.
 * @returns {JQueryPromise<boolean>}
 */
function loadLibrary() {
	var libName = 'ext.gadget.WpLibExtra';
	return mw.loader.using(libName)
		.then(function(require) {
			lib = require(libName);
			if (typeof (lib && lib.version) !== 'string') { // Validate the library
				throw new Error('Library invalid');
			}
			return true;
		})
		.catch(function(err) {
			console.error(err);
			return false;
		});
}

/**
 * Count the number of unclosed RFD templates.
 * @returns {number}
 */
function countUnclosed() {
	var $content = $('.mw-body-content');
	var $closed = $content.find('div').filter(function() {
		return this.style.background === 'rgb(227, 249, 223)';
	});
	var $rfd = $content.find('span[id^=RFD]').filter(function() {
		return !$closed.find($(this)).length;
	});
	return $rfd.length;
}

/**
 * 
 * @param {JQuery<HTMLSelectElement>} $dropdowns
 */
function RFDCloser($dropdowns) {

	/** @type {JQuery<HTMLSelectElement>} */
	this.$dropdowns = $dropdowns;

}

RFDCloser.init = function() {

	var $content = $('.mw-body-content');
	var $closed = $content.find('div').filter(function() {
		return this.style.background === 'rgb(227, 249, 223)';
	});
	var $unclosed = $content.find('span[id^=RFD]').filter(function() {
		return !$closed.find($(this)).length;
	});

	/**
	 * @returns {JQuery<HTMLSelectElement>}
	 */
	var createDropdown = function() {
		/** @type {JQuery<HTMLSelectElement>} */
		var $select = $('<select>');
		return $select
			.addClass('rfdc-result')
			.prop('innerHTML',
				'<option value="delete">削除</option>' +
				'<option value="keep">存続</option>'
			);
	};
	/** @type {JQuery<HTMLSelectElement>} */
	var $dropdowns = $([]);
	$unclosed.each(function() {
		var $dd = createDropdown();
		$(this).before($dd);
		$dropdowns = $dropdowns.add($dd);
	});

	return $dropdowns.length ? new RFDCloser($dropdowns) : null;

};

// Entry point
init();

})();
//</nowiki>