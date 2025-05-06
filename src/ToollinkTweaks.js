/******************************************************************************************************************\
	ToollinkTweaks
	Extend toollinks attached to user links to the script user's liking.
	@version 1.3.2
	@author [[User:Dragoniez]]
\******************************************************************************************************************/

// @ts-check
/* global mw, OO */
/* eslint-disable @typescript-eslint/no-this-alias */
//<nowiki>
(function() {
// *****************************************************************************************************************

// Across-the-board variables

/**
 * Array to store toollink option fields on the config page.
 * @type {ToollinkField[]}
 */
var ttFields = [];

/** Index used to give an ID to \<li> elements on the config page. */
var listitemIdx = 0;

/**
 * Canonical special names that are to be removed from the autocomplete candidates
 * @readonly
 */
var disabledSps = [
	'AllMyUploads', // ---> Special:Listfiles/USER || title=Special:Listfiles&user=USER
	'ApiHelp', // ---> api.php?action=help&modules=main
	'BannerLoader', // ---> error
	'BannerRandom', // ---> error
	'BetaFeatures', // ---> Special:Preferences#mw-prefsection-betafeatures
	'ChangePassword', // ---> Special:ChangeCredentials/MediaWiki\\Auth\\PasswordAuthenticationRequest
	'Listadmins', // ---> Special:Listusers/sysop || title=Special:Listusers&group=sysop
	'Listbots', // ---> Special:Listusers/bot || title=Special:Listusers&group=bot
	'MobileLanguages',
	'MyLanguage',
	'Mycontributions', // ---> Special:Contributions/USER || title=Special:Contributions&target=USER
	'Mylog', // ---> Special:Log/USER || title=Special:Log&user=USER
	'Mypage', // ---> User:XXX(/subpage)
	'Mytalk', // ---> User talk:XXX(/subpage)
	'Myuploads', // ---> Special:Listfiles/USER || title=Special:Listfiles&user=USER
	'NewSection', // ---> action=edit&section=new
	'Uploads' // ---> Special:Listfiles
];

/**
 * The special page name on which this script is loaded. (See #getCanonicalSpecialPageName)
 * @type {string|false}
 * @readonly
 */
var spName;

/**
 * Canonical special page names, used on the config page.
 * @type {string[]?}
 * @readonly
 */
var spList = null;

/**
 * The database name of the project on which this script is loaded.
 * @readonly
 */
var dbName = mw.config.get('wgDBname');

/**
 * Keys for `action=options` and `action=globalpreferences`.
 * @readonly
 */
var userjs = {
	local: 'userjs-toollinktweaks',
	global: 'userjs-toollinktweaks-global'
};

// *****************************************************************************************************************

/**
 * Initialize ToollinkTweaks.
 * @returns {void}
 */
function init() {

	/**
	 * Whether we're on the config page.
	 * @readonly
	 */
	var onConfig = mw.config.get('wgNamespaceNumber') === -1 && /^(ToollinkTweaksConfig|TTC)$/i.test(mw.config.get('wgTitle'));

	/**
	 * Required modules.
	 * @readonly
	 */
	var modules = [
		'mediawiki.util',
		'mediawiki.user',
		// Config
		'mediawiki.api',
		'oojs-ui',
		'oojs-ui.styles.icons-movement',
		'oojs-ui.styles.icons-interactions',
		'oojs-ui.styles.icons-moderation',
		'oojs-ui.styles.icons-editing-list',
		'jquery.ui' // For effects
	];
	if (!onConfig) {
		modules.splice(2);
	}

	// Load dependencies
	var deferreds = [
		mw.loader.using(modules),
		$.ready
	];
	if (onConfig) {
		deferreds.unshift(getCanonicalSpecialPageList());
		$(loadConfigInterface); // Show a 'Loading the interface' message as soon as the DOM gets ready
	}
	$.when.apply($, deferreds).then(function() { // When all the modules are loaded and the DOM is ready

		// Get canonical special page name, retrieve the user config, and set up CSS styles
		spName = getCanonicalSpecialPageName();
		var cfg = mergeConfig();
		createStyleTag();

		if (onConfig) {

			// Create interface when we're on the config page
			spList = arguments[0];
			if (!spList) {
				mw.notify('Failed to fetch canonical special page names.', {type: 'error'});
			}
			createConfigInterface(cfg);

		} else {

			// Add portlet link to the config page
			mw.util.addPortletLink(
				'p-cactions',
				mw.util.getUrl('Special:ToollinkTweaksConfig'),
				'ToollinkTweaksConfig',
				'ca-ttc',
				'Configure ToollinkTweaks'
			);

			// Filter out toollink builder config
			var builderCfg = cfg.reduce(/** @param {TTBuilderConfig[]} acc */ function(acc, obj) {
				if (!(isSpOptedOut(spName, obj.spInclude, obj.spExclude) ||
					obj.optedOut.indexOf(dbName) !== -1 ||
					!obj.enabled)
				) {
					acc.push({
						label: obj.label,
						url: obj.url,
						target: obj.target.slice(),
						tab: obj.tab
					});
				}
				return acc;
			}, []);
			if (!builderCfg.length) {
				console.log('ToollinkTweaks: The config is empty.');
				return;
			}

			// Add toollinks when hook is triggered
			var hookTimeout;
			mw.hook('wikipage.content').add(function() {
				clearTimeout(hookTimeout); // Prevent `addLinks` from being called multiple times (hook can be fired several times in an instant)
				hookTimeout = setTimeout(function() {
					addLinks(builderCfg);
				}, 100);
			});

		}

	});

}

/**
 * Get all canonical special page names on the local project.
 * @returns {JQueryPromise<string[]?>}
 */
function getCanonicalSpecialPageList() {
	return new mw.Api().get({
		action: 'query',
		meta: 'siteinfo',
		siprop: 'specialpagealiases',
		formatversion: '2'
	}).then(function(res) {
		var resSpa;
		if (!res || !res.query || !Array.isArray((resSpa = res.query.specialpagealiases))) {
			return null;
		}
		return resSpa.reduce(/** @param {string[]} acc */ function(acc, obj) {
			var canonical = obj.realname;
			if (canonical && disabledSps.indexOf(canonical) === -1) {
				acc.push(canonical);
			}
			return acc;
		}, [
			'Preview'
		])
		.sort();
	}).catch(function(_code, err) {
		console.warn(err);
		return null;
	});
}

/**
 * Show 'now loading' message ahead of when the config page gets ready.
 * @returns {{header?: HTMLHeadingElement; body?: HTMLDivElement;}}
 */
function loadConfigInterface() {

	document.title = 'ToollinkTweaksConfig - ' + mw.config.get('wgSiteName');

	var /** @type {HTMLHeadingElement?} */ header =
		document.querySelector('.mw-first-heading') ||
		document.querySelector('.firstHeading') ||
		document.querySelector('#firstHeading');
	var /** @type {HTMLDivElement?} */ body =
		document.querySelector('.mw-body-content') ||
		document.querySelector('#mw-content-text');
	if (!header || !body) {
		return {};
	}
	header.textContent = 'Configure ToollinkTweaks';
	header.style.fontFamily = 'Linux Libertine,Georgia,Times,serif';
	if (mw.util) { // This script per se has yet to load this module: Can be undefined
		mw.util.$content.css('font-size', '90%');
	}
	body.innerHTML = 'Loading the interface ';
	body.appendChild(createSpinner());

	return {
		header: header,
		body: body
	};

}

/**
 * Create a spinner icon.
 * @returns {HTMLImageElement}
 */
function createSpinner() {
	var img = document.createElement('img');
	img.src = '//upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif';
	img.style.cssText = 'vertical-align: middle; height: 1em; border: 0;';
	return img;
}

/**
 * Quite the same as `mw.config.get('wgCanonicalSpecialPageName')`, except that some index.php actions are converted to special page names.
 * @returns {string|false} `False` if we are not on a special page
 */
function getCanonicalSpecialPageName() {
	var canonicalSpecialPageName = mw.config.get('wgCanonicalSpecialPageName');
	if (canonicalSpecialPageName) {
		return canonicalSpecialPageName;
	} else {
		switch (mw.config.get('wgAction')) {
			case 'view':
				var diff = mw.util.getParamValue('diff');
				var oldid = mw.util.getParamValue('oldid');
				var wgRevisionId = mw.config.get('wgRevisionId').toString();
				if (diff === wgRevisionId || (diff !== null && oldid === wgRevisionId)) {
					return 'Diff';
				} else if (oldid !== null) {
					return 'PermanentLink';
				}
				return false;
			// case 'watch':
			// case 'unwatch':
			// case 'revert':
			case 'delete':
				return 'DeletePage';
			// case 'rollback':
			case 'protect':
			case 'unprotect':
				return 'ProtectPage';
			// case 'markpatrolled':
			// case 'render':
			case 'purge':
				return 'Purge';
			case 'submit':
				return 'Preview';
			case 'edit':
			case 'editredlink':
				return 'EditPage';
			case 'history':
				return 'PageHistory';
			// case 'historysubmit':
			// case 'raw':
			// case 'ajax':
			// case 'credits':
			case 'info':
				return 'PageInfo';
			case 'revisiondelete':
				return 'Revisiondelete';
			default:
				return false;
		}
	}
}

/**
 * @typedef {"User"|"IP"|"CIDR"} UserType
 */
/**
 * Toollink builder config object.
 * @typedef TTBuilderConfig
 * @type {object}
 * @property {string} label
 * @property {string} url
 * @property {UserType[]} target This is actually used for filtering purposes but must be run against each user link
 * @property {"_self"|"_blank"} tab
 */
/**
 * Object that is keyed by DB names and valued by integers. The integers represent where in the `cfg` array the globalized toollink should be inserted.
 * @typedef {Object.<string, number>} IndexObject
 */
/**
 * Toollink filter config object.
 * @typedef TTFilterConfig
 * @type {object}
 * @property {string[]} spInclude
 * @property {string[]} spExclude
 * @property {IndexObject|false} global `false` if the toollink isn't made global; otherwise an object keyed by DB names and valued by integers.
 * @property {string[]} optedOut An array of DB names that opt out for the toollink
 * @property {boolean} enabled
 */
/**
 * The ToollinkTweaks config object.
 * @typedef {TTBuilderConfig & TTFilterConfig} TTConfig
 */
/**
 * Merge and retrieve the ToollinkTweaks config.
 * @returns {TTConfig[]}
 */
function mergeConfig() {

	// Parse config data
	var /** @type {string} */ strCfgGlobal = mw.user.options.get(userjs.global) || '[]';
	var /** @type {string} */ strCfg = mw.user.options.get(userjs.local) || '[]';
	var /** @type {TTConfig[]} */ cfgGlobal;
	var /** @type {TTConfig[]} */ cfg;
	try {
		cfgGlobal = JSON.parse(strCfgGlobal);
	}
	catch (err) {
		console.error(err);
		cfgGlobal = [];
	}
	try {
		cfg = JSON.parse(strCfg);
	}
	catch (err) {
		console.error(err);
		cfg = [];
	}

	// Merge the global config data into the local one
	for (var i = cfgGlobal.length - 1; i >= 0; i--) {
		var obj = cfgGlobal[i];
		var gl = obj.global || {}; // Never reaches the right operand
		if (typeof gl[dbName] === 'number') { // TTConfig was saved on this project at some time
			cfg.splice(gl[dbName], 0, obj);
		} else { // TTConfig has never been saved on this project
			cfg.unshift(obj);
		}
	}

	return cfg;

}

/**
 * Create a style tag for ToollinkTweaks.
 * @returns {void}
 */
function createStyleTag() {
	var style = document.createElement('style');
	style.textContent =
		// Config
		'#tt-config {' +
			'position: relative;' +
		'}' +
		'#tt-config-overlay {' + // Overlay of the config body, used to make elements in it unclickable
			'width: 100%;' +
			'height: 100%;' +
			'position: absolute;' +
			'top: 0;' +
			'left: 0;' +
			'z-index: 10;' +
		'}' +
		'.tt-config-overlay-hidden {' +
			'display: none;' +
		'}' +
		'#tt-config-scrollbuttons {' +
			'position: fixed;' +
			'top: 50%;' +
			'left: 0.1em;' +
			'transform: translateY(-50%)' +
		'}' +
		'.tt-config-scrollbutton {' +
			'display: block;' +
			'cursor: pointer;' +
			'width: 1em;' +
			'padding: 0.2em 0.4em;' +
			'background-color: #f8f9fa;' +
			'border: 1px solid #a2a9b1;' +
			'border-radius: 2px;' +
		'}' +
		'#tt-config-list {' + // Toollink list default
			'margin: 0;' +
			'padding: 0;' +
		'}' +
		'.tt-config-listitem {' + // No bullets
			'list-style: none;' +
		'}' +
		'.tt-config-listitem > fieldset {' + // Border around fieldset
			'padding: 1em;' +
			'margin-bottom: 1em;' +
			'border: 1px solid silver;' +
		'}' +
		'.tt-config-listitem-dragger {' + // Wrapper <div> of toollink reorderer
			'margin-bottom: 0.3em;' +
		'}' +
		'.tt-config-listitem-dragger-icon {' + // Whitespace between icon and label
			'margin-right: 0.5em;' +
		'}' +
		'.tt-config-listitem-dragger-label {' +
			'cursor: inherit;' +
		'}' +
		'.tt-config-buttongroup:not(:last-child) {' + // Bottom margin for each button div
			'margin-bottom: 0.8em;' +
		'}'	+
		'#tt-config-list.tt-config-list-reordering {' + // Set border on list when getting reordered (inner fieldset is hidden)
			'padding: 1em 1em 0.5em 1em;' +
			'margin-bottom: 1em;' +
			'border: 1px solid silver;' +
		'}' +
		'#tt-config-listitem-dummy {' +
			'height: 0.3em;' +
		'}' +
		'#tt-config-list:not(.tt-config-list-reordering) > #tt-config-listitem-dummy {' + // Hide the dummy listitem when not on the reordering mode
			'display: none;' +
		'}' +
		'#tt-config-list.tt-config-list-reordering > .tt-config-listitem:not(#tt-config-listitem-dummy) {' +
			'cursor: pointer;' +
		'}' +
		'#tt-config-list.tt-config-list-reordering > .tt-config-listitem:not(#tt-config-listitem-dummy):hover {' +
			'background-color: #80ccff;' +
		'}' +
		'.tt-config-listitem-dragger:not(.tt-config-list-reordering),' + // Hide reorder-irrelevant elements when on the reordering mode
		'#tt-config-buttongroup1.tt-config-list-reordering,' +
		'#tt-config-buttongroup2:not(.tt-config-list-reordering),' +
		'#tt-config-buttongroup3.tt-config-list-reordering {' +
			'display: none;' +
		'}' +
		'#tt-config .oo-ui-selectWidget:not(.oo-ui-element-hidden) {' + // Prevent SelectWidget options from propagating all over
			'max-height: 22em;' +										// the viewport by restricting the field's height
		'}' +
		'.tt-config-localexception {' + // "Lower the level" of local exception checkboxes
			'margin-left: 2em;' +
		'}'	+
		// Toollinks
		'.tt-toollink-bare::before {' + // For toollink wrapper spans that are not enclosed by a parent span
			'content: " | ";' +
		'}';
	document.head.appendChild(style);
}

/**
 * Create the ToollinkTweaks config interface on `Special:ToollinkTweaksConfig`.
 * @param {TTConfig[]} cfg An array of ToollinkTweaks config objects.
 * @returns {void}
 */
function createConfigInterface(cfg) {

	var elements = loadConfigInterface();
	var header = elements.header;
	var body = elements.body;
	if (!header || !body) {
		mw.notify('Failed to load the config interface.', {type: 'error', autoHide: false});
		return;
	}
	mw.util.$content.css('font-size', '90%');

	// Create container and make it the only child of the body content
	var $container = $('<div>').prop('id', 'tt-config');
	body.innerHTML = '';
	body.appendChild($container[0]);

	// Transparent overlay of the container used to make elements in it unclickable
	var overlay = document.createElement('div');
	overlay.id = 'tt-config-overlay';
	overlay.classList.add('tt-config-overlay-hidden');
	body.appendChild(overlay);

	// Create inner containers
	var /** @type {JQuery<HTMLUListElement>} */ $ul = $('<ul>');
	$ul.prop('id', 'tt-config-list');
	var /** @type {JQuery<HTMLLIElement>} */ $dummyLi = $('<li>'); // This makes it possible to drag items to the bottom of the list
	$dummyLi.addClass('tt-config-listitem').prop('id', 'tt-config-listitem-dummy');
	makeDraggable($dummyLi);
	$ul.append($dummyLi);
	var $buttons = $('<div>').prop('id', 'tt-config-buttons');

	// Create buttons
	var $scrollButtons = $('<div>').prop('id', 'tt-config-scrollbuttons');
	var $upButton = $('<img>').prop('id', 'tt-config-scrollup').addClass('tt-config-scrollbutton')
		.attr('src', 'https://upload.wikimedia.org/wikipedia/commons/1/10/OOjs_UI_icon_collapse.svg')
		.off('click').on('click', function() {
			setOverlay(true);
			window.scrollTo({top: 0});
			setOverlay(false);
		});
	var $downButton = $('<img>').prop('id', 'tt-config-scrolldown').addClass('tt-config-scrollbutton')
		.attr('src', 'https://upload.wikimedia.org/wikipedia/commons/9/90/OOjs_UI_icon_expand.svg')
		.off('click').on('click', function() {
			setOverlay(true);
			window.scrollTo({top: document.body.scrollHeight});
			setOverlay(false);
		});
	$scrollButtons.append($upButton, $downButton);
	$('body').append($scrollButtons);

	var $buttonGroup1 = $('<div>').addClass('tt-config-buttongroup').prop('id', 'tt-config-buttongroup1');
	var addButton = new OO.ui.ButtonWidget({
		label: 'Add toollink',
		id: 'tt-config-add',
		icon: 'add'
	});
	var reorderButton = new OO.ui.ButtonWidget({
		label: 'Reorder toollinks',
		id: 'tt-config-reorder',
		icon: 'listNumbered'
	});
	addButton.$element.off('click').on('click', function(_e) {
		var options = ttFields.length ? {scroll: true}: {animate: true};
		new ToollinkField($dummyLi, reorderButton, options);
	});
	reorderButton.$element.off('click').on('click', function(_e) {
		reorderToollinkFields(true);
	});
	$buttonGroup1.append(addButton.$element, reorderButton.$element);

	var $buttonGroup2 = $('<div>').addClass('tt-config-buttongroup').prop('id', 'tt-config-buttongroup2');
	var reorderEndButton = new OO.ui.ButtonWidget({
		label: 'End reordering',
		id: 'tt-config-endreorder',
		icon: 'logOut'
	});
	reorderEndButton.$element.off('click').on('click', function(_e) {
		reorderToollinkFields(false);
	});
	$buttonGroup2.append(reorderEndButton.$element);

	var $buttonGroup3 = $('<div>').addClass('tt-config-buttongroup').prop('id', 'tt-config-buttongroup3');
	var saveButton = new OO.ui.ButtonWidget({
		label: 'Save toollinks',
		id: 'tt-config-save',
		icon: 'bookmarkOutline',
		flags: ['primary', 'progressive']
	});
	saveButton.$element.off('click').on('click', function(_e) {
		saveConfig(saveButton);
	});
	$buttonGroup3.append(saveButton.$element);

	$buttons.append($buttonGroup1, $buttonGroup2, $buttonGroup3);
	$container.append($ul, $buttons);

	// Initialize toollink options, reflecting the user config
	cfg.forEach(function(obj) {
		new ToollinkField($dummyLi, reorderButton, {cfg: obj});
	});

}

/**
 * Make a listitem draggable for order shuffling.
 * @param {JQuery<HTMLLIElement>} $li
 */
function makeDraggable($li) {
	$li.on({
		dragstart: function(e) { // When the listitem has started to be dragged
			// Start dragging only on the reordering mode
			if (this.querySelector('.tt-config-listitem-dragger.tt-config-list-reordering') && e.originalEvent && e.originalEvent.dataTransfer) {
				e.originalEvent.dataTransfer.setData('text/plain', this.id); // Save the element's ID
			} else {
				e.preventDefault();
			}
		},
		dragover: function(e) { // When the listitem is dragged over a valid drop target
			e.preventDefault();
			this.style.borderTop = '2px solid blue'; // Highlight the drop point by border
		},
		dragleave: function(_e) { // When the listitem is dragged off a valid drop target
			this.style.borderTop = ''; // Reset border
		},
		drop: function(e) { // When the dragged listitem is dropped
			e.preventDefault();
			if (e.originalEvent && e.originalEvent.dataTransfer) {
				var id = e.originalEvent.dataTransfer.getData('text/plain');
				var dragged = document.getElementById(id);
				if (dragged && this.parentElement) {
					this.parentElement.insertBefore(dragged, this); // Insert the element before the drop target
					/** @type {HTMLLIElement[]} */
					var listitems = Array.prototype.slice.call(document.querySelectorAll('.tt-config-listitem:not(#tt-config-listitem-dummy)'));
					var ids = listitems.map(function(el) { return el.id; });
					ttFields.sort(function(field1, field2) {
						return ids.indexOf(field1.getId()) - ids.indexOf(field2.getId());
					});
				}
			}
			this.style.borderTop = '';
		}
	});
}

/**
 * Create a new toollink field.
 * @class ToollinkField
 * @constructor
 * @param {JQuery<HTMLLIElement>} $dummyLi \<li> before which the field will be inserted.
 * @param {OO.ui.ButtonWidget} reorderButton
 * @param {object} [options]
 * @param {TTConfig} [options.cfg] Optional config object, referring to which initial values are set.
 * @param {boolean} [options.scroll] If true, scroll to the new toollink field.
 * @param {boolean} [options.animate] If true, add a toollink field with animation.
 */
function ToollinkField($dummyLi, reorderButton, options) {

	// Variable initialization
	options = options || {};
	var _this = this;
	var /** @type {TTConfig} */ cfg = options.cfg || {
		label: '',
		url: '',
		target: [],
		tab: '_self',
		spInclude: ['*'],
		spExclude: [],
		global: false,
		optedOut: [],
		enabled: true
	};
	this.index /** @type {number} */ = ttFields.length;
	this.reorderButton /** @type {OO.ui.ButtonWidget} */ = reorderButton;

	// Create a listitem that stores this field
	/**
	 * The ID of the wrapper \<li> element.
	 * @type {string}
	 */
	this.id = 'tt-config-listitem' + (++listitemIdx);
	/** @type {JQuery<HTMLLIElement>} */
	this.$li = $('<li>');
	this.$li.addClass('tt-config-listitem').prop('id', this.id).attr('draggable', 'true');
	makeDraggable(this.$li);

	// Create div for listitem reordering
	/**
	 * @type {{
	 * 	icon: OO.ui.IconWidget;
	 * 	label: OO.ui.LabelWidget;
	 * }}
	 */
	this.dragger = {
		icon: new OO.ui.IconWidget({
			icon: 'draggable',
			classes: ['tt-config-listitem-dragger-icon']
		}),
		label: new OO.ui.LabelWidget({
			classes: ['tt-config-listitem-dragger-label']
		})
	};
	var $wrapper = $('<div>').addClass('tt-config-listitem-dragger');
	$wrapper.append(this.dragger.icon.$element, this.dragger.label.$element);
	this.$li.append($wrapper);

	// Create toollink fieldset
	this.fieldset /** @type {OO.ui.FieldsetLayout} */ = new OO.ui.FieldsetLayout({
		label: 'Toollink',
		classes: ['tt-config-listitem-field']
	});
	this.$li.append(this.fieldset.$element);

	// Create field items
	this.label /** @type {OO.ui.TextInputWidget} */ = new OO.ui.TextInputWidget({
		placeholder: 'Label',
		value: cfg.label,
		required: true
	});
	this.url /** @type {OO.ui.TextInputWidget} */ = new OO.ui.TextInputWidget({
		placeholder: 'URL',
		value: cfg.url,
		required: true
	});
	this.target /** @type {OO.ui.MenuTagMultiselectWidget} */ = new OO.ui.MenuTagMultiselectWidget({
		inputPosition: 'inline',
		options: [
			{data: 'User'},
			{data: 'IP'},
			{data: 'CIDR'}
		],
		allowedValues: ['User', 'IP', 'CIDR'],
		selected: cfg.target,
		placeholder: 'Add taget user links',
	});
	this.tab /** @type {OO.ui.DropdownWidget} */ = new OO.ui.DropdownWidget({
		label: 'Tab on which to open the toollink',
		menu: {
			items: [
				new OO.ui.MenuOptionWidget({
					data: '_self',
					label: 'The current tab'
				}),
				new OO.ui.MenuOptionWidget({
					data: '_blank',
					label: 'A new tab'
				})
			]
		}
	});
	this.tab.getMenu().selectItemByData(cfg.tab);
	var spNameData = ['*'].concat(spList || []).map(function(name) {
		return {data: name};
	});
	this.spInclude /** @type {OO.ui.MenuTagMultiselectWidget} */ = new OO.ui.MenuTagMultiselectWidget({
		inputPosition: 'inline',
		options: spNameData.slice(),
		selected: cfg.spInclude,
		placeholder: 'Add canonical special page names'
	});
	this.spExclude /** @type {OO.ui.MenuTagMultiselectWidget} */ = new OO.ui.MenuTagMultiselectWidget({
		inputPosition: 'inline',
		options: spNameData.slice(),
		selected: cfg.spExclude,
		placeholder: 'Add canonical special page names'
	});
	this.global /** @type {OO.ui.CheckboxInputWidget} */ = new OO.ui.CheckboxInputWidget({
		selected: !!cfg.global
	});
	this.globalIndexes /** @type {IndexObject} */ = $.extend({}, cfg.global || {});
	this.optedOutDBs /** @type {string[]} */ = cfg.optedOut;
	this.localException /** @type {OO.ui.CheckboxInputWidget} */ = new OO.ui.CheckboxInputWidget({
		classes: ['tt-config-localexception'],
		selected: cfg.optedOut.indexOf(dbName) !== -1
	});
	this.enabled /** @type {OO.ui.CheckboxInputWidget} */ = new OO.ui.CheckboxInputWidget({
		selected: cfg.enabled
	});
	this.removeButton /** @type {OO.ui.ButtonWidget} */ = new OO.ui.ButtonWidget({
		label: 'Remove toollink',
		icon: 'trash',
		flags: 'destructive'
	});
	this.removeButton.$element.off('click').on('click', function(_e) {
		_this.remove();
	});

	// Set field items
	var spIncludeHelp = mw.config.get('wgServer') + mw.util.wikiScript('api') + '?action=query&meta=siteinfo&siprop=specialpagealiases&formatversion=2';
	var otherDbs = cfg.optedOut.filter(function(project) { return project !== dbName; });
	this.localExceptionWrapper /** @type {OO.ui.FieldLayout} */ = new OO.ui.FieldLayout(this.localException, {
		label: 'Set a local exception and disable this toollink on this project',
		align: 'inline',
		help: 'Other opted-out projects: ' + (otherDbs.length ? otherDbs.join(', ') : 'none')
	});
	this.fieldset.addItems([
		new OO.ui.FieldLayout(this.label, {
			label: 'Label (required)',
			align: 'top'
		}),
		new OO.ui.FieldLayout(this.url, {
			label: 'URL (required)',
			align: 'top',
			help: new OO.ui.HtmlSnippet(
				'Variables:' +
				'<ul>' +
					'<li>$1: The username associated with the toollink</li>' +
					'<li>$2: Article path (usually <code>/wiki/</code>)</li>' +
					'<li>$3: Script path (usually <code>/w/index.php</code>)</li>' +
					'<li>$4: API path (usually <code>/w/api.php</code>)</li>' +
				'</ul>'
			)
		}),
		new OO.ui.FieldLayout(this.target, {
			label: 'Target',
			align: 'top'
		}),
		new OO.ui.FieldLayout(this.tab, {
			label: 'Open link on',
			align: 'top'
		}),
		new OO.ui.FieldLayout(this.spInclude, {
			label: 'Run on special pages including',
			align: 'top',
			help: new OO.ui.HtmlSnippet('<code>*</code> signifies <code>all</code> (<a href="' + spIncludeHelp + '"target="_blank">find aliases</a>)'),
			helpInline: true
		}),
		new OO.ui.FieldLayout(this.spExclude, {
			label: 'Run on special pages excluding',
			align: 'top',
			help: 'Overrides the inclusion settings',
			helpInline: true
		}),
		new OO.ui.FieldLayout(this.global, {
			label: 'Make this toollink global',
			align: 'inline'
		}),
		this.localExceptionWrapper,
		new OO.ui.FieldLayout(this.enabled, {
			label: 'Enable',
			align: 'inline'
		}),
		new OO.ui.FieldLayout(this.removeButton, {
			align: 'top'
		})
	]);

	// Variable-dependent event listeners
	this.global.$element.off('change').on('change', function(_e) {
		_this.localExceptionWrapper.toggle(_this.global.isSelected());
	});
	this.global.$element.trigger('change');
	this.localException.$element.off('change').on('change', function() {
		// When the "local exception" checkbox is checked, disable all other elements in the field
		var disable = _this.localException.isSelected();
		if (disable) { // Ensure that the required fields are filled before disabling them
			var /** @type {OO.ui.TextInputWidget} */ blankInput;
			[_this.label, _this.url].forEach(function(widget) {
				if (!widget.getValue() && widget.isRequired()) {
					// @ts-ignore "Property 'onBlur' does not exist on type 'TextInputWidget'."
					widget.onBlur(); // Highlight the blank input
					blankInput = blankInput || widget;
				}
			});
			// @ts-ignore "Variable 'blankInput' is used before being assigned."
			if (blankInput) {
				_this.localException.setSelected(false);
				blankInput.focus();
				mw.notify('Fill out the required field(s).', {type: 'error'});
				return;
			}
		}
		[
			_this.label,
			_this.url,
			_this.target,
			_this.tab,
			_this.spInclude,
			_this.spExclude,
			_this.global,
			_this.enabled,
			_this.removeButton
		]
		.forEach(function(widget) {
			widget.setDisabled(disable);
		});
	});
	this.localException.$element.trigger('change');

	// Append <li> to <ul>
	if (options.scroll) {
		$dummyLi.before(this.$li);
		this.$li[0].scrollIntoView({behavior: 'smooth'}); // Scroll to the new field
		toggleScrollButtons();
	} else if (options.animate) {
		this.$li.css('display', 'none'); // Temporarily hide the element to append
		$dummyLi.before(this.$li);
		this.$li.show({ // Gradually show the appended element
			duration: 400,
			complete: function() {
				toggleScrollButtons();
			}
		});
	} else {
		$dummyLi.before(this.$li);
		toggleScrollButtons();
	}

	ttFields.push(this);
	reorderButton.toggle(ttFields.length > 1);

}

/**
 * Get the ID of the wrapper \<li> element.
 * @returns {string}
 */
ToollinkField.prototype.getId = function() {
	return this.id;
};

/**
 * Get `globalIndexes`.
 * @returns {IndexObject}
 */
ToollinkField.prototype.getGlobalIndexes = function() {
	return this.globalIndexes;
};

/**
 * Set a value to `globalIndexes`.
 * @param {IndexObject} globalIndexes
 */
ToollinkField.prototype.setGlobalIndexes = function(globalIndexes) {
	this.globalIndexes = globalIndexes;
};

/**
 * Get the names of projects that have opted out for this toolink.
 * @returns {string[]} A deep copy of `optedOutDBs`.
 */
ToollinkField.prototype.getOptedOutDBs = function() {
	return this.optedOutDBs.slice();
};

/**
 * Set a value to `optedOutDBs`.
 * @param {string[]} optedOutDBs
 */
ToollinkField.prototype.setOptedOutDBs = function(optedOutDBs) {
	this.optedOutDBs = optedOutDBs;
};

/**
 * Get the field index (in the `ttFields` array).
 * @returns {number}
 */
ToollinkField.prototype.getIndex = function() {
	return this.index;
};

/**
 * Set the field index (in the `ttFields` array).
 * @param {number} index
 */
ToollinkField.prototype.setIndex = function(index) {
	this.index = index;
};

/**
 * Remove this toollink field from the DOM and `ttFields`.
 */
ToollinkField.prototype.remove = function() {
	setOverlay(true); // The save button shouldn't function when we're removing the option
	var _this = this;
	this.$li.hide(400, function() { // Hide the option with animation, then remove it
		this.remove();
		toggleScrollButtons();
		var idx = _this.getIndex();
		var cnt = 0;
		ttFields = ttFields.reduce(/** @param {ToollinkField[]} acc */ function(acc, field, i) {
			if (i !== idx) {
				field.setIndex(cnt++);
				acc.push(field);
			}
			return acc;
		}, []);
		_this.reorderButton.toggle(ttFields.length > 1);
		setOverlay(false);
	});
};

/**
 * Toggle between the normal and reordering interfaces.
 * @param {boolean} start Whether to start reordering
 */
function reorderToollinkFields(start) {

	var selectors = [
		'#tt-config-list',
		'.tt-config-listitem-dragger',
		'#tt-config-buttongroup1',
		'#tt-config-buttongroup2',
		'#tt-config-buttongroup3'
	];
	var $elements = $(selectors.join(', '));
	var $fields = $('.tt-config-listitem-field');
	var clss = 'tt-config-list-reordering';

	setOverlay(true);
	if (start) {
		var emptyFieldCnt = 0;
		ttFields.forEach(function(field) {
			var /** @type {string|OO.ui.HtmlSnippet} */ inputVal = field.label.getValue() || field.url.getValue();
			if (!inputVal) {
				inputVal = new OO.ui.HtmlSnippet('<span style="color: red;">(Empty ' + (emptyFieldCnt++) + ')</span>');
			}
			field.dragger.label.setLabel(inputVal);
		});
		$fields.hide({
			effect: 'highlight',
			complete: function() {
				$elements.addClass(clss);
				toggleScrollButtons();
				setOverlay(false);
			}
		});
		if (emptyFieldCnt) {
			mw.notify('Fill out required fields for the best results.', {type: 'warn'});
		}
	} else {
		$elements.removeClass(clss);
		$fields.show({
			effect: 'highlight',
			complete: function() {
				toggleScrollButtons();
				setOverlay(false);
			}
		});
	}

}

/**
 * Save the ToollinkTweaks config.
 * @param {OO.ui.ButtonWidget} saveButton
 * @returns {void}
 */
function saveConfig(saveButton) {

	setOverlay(true);

	/** @type {{local: TTConfig[]; global: TTConfig[];}} */
	var cfg = {
		local: [],
		global: []
	};

	var /** @type {OO.ui.TextInputWidget} */ blankInput;
	cfg = ttFields.reduce(function(acc, field) {

		var widget;
		if (blankInput) {
			return acc;
		} else if (!(widget = field.label).getValue() || !(widget = field.url).getValue()) {
			// @ts-ignore "Property 'onBlur' does not exist on type 'TextInputWidget'."
			widget.onBlur(); // Highlight the blank input
			blankInput = blankInput || widget;
			return acc;
		}

		var madeGlobal = field.global.isSelected();

		var globalIndexes = field.getGlobalIndexes();
		var optedOutDBs = field.getOptedOutDBs();
		if (madeGlobal) {
			globalIndexes[dbName] = acc.local.length;
			var dbIdx = optedOutDBs.indexOf(dbName);
			if (dbIdx !== -1) {
				optedOutDBs.splice(dbIdx, 1);
			}
			if (field.localException.isSelected()) {
				optedOutDBs.push(dbName);
			}
		} else {
			globalIndexes = {};
			optedOutDBs = [];
		}
		field.setGlobalIndexes(globalIndexes);
		field.setOptedOutDBs(optedOutDBs);

		acc[madeGlobal ? 'global' : 'local'].push({
			label: field.label.getValue(),
			url: field.url.getValue(),
			// @ts-ignore
			target: field.target.getValue(),
			// @ts-ignore "Type 'unknown' is not assignable to type '"_self" | "_blank"'."
			tab: (function() {
				/**
				 * `OO.ui.OptionWidget` when one item is selected, `OO.ui.OptionWidget[]` when multiple items are selected, and `null` when nothing is selected.
				 * @type {OO.ui.OptionWidget|OO.ui.OptionWidget[]|null}
				 */
				var selected = field.tab.getMenu() && field.tab.getMenu().findSelectedItem(); // This is never an array because we don't use multiselect
				return selected instanceof OO.ui.OptionWidget ? selected.getData() : '_self';
			})(),
			// @ts-ignore
			spInclude: field.spInclude.getValue(),
			// @ts-ignore
			spExclude: field.spExclude.getValue(),
			global: !madeGlobal ? false : globalIndexes,
			optedOut: optedOutDBs,
			enabled: field.enabled.isSelected()
		});
		return acc;

	}, cfg);

	// Stop if there's some blank field that's required to be filled out
	// @ts-ignore "Variable 'blankInput' is used before being assigned."
	if (blankInput) {
		mw.notify('Some required fields are not filled.', {type: 'error'});
		blankInput.focus();
		setOverlay(false);
		return;
	}

	// Change the save button's label
	var $label = $('<span>');
	var spinner = createSpinner();
	spinner.style.marginRight = '1em';
	$label.append(spinner);
	var textNode = document.createTextNode('Saving the toollinks...');
	$label.append(textNode);
	saveButton.setIcon(null).setLabel($label);

	// Save config (separate API requests for local and global settings)
	$.when.apply($, [saveLocalOptions(cfg.local), saveGlobalOptions(cfg.global)]).then(function(lErr, gErr) {

		if (!lErr && !gErr) { // Success on both

			saveButton.setIcon('bookmarkOutline').setLabel('Save toollinks');
			setOverlay(false);
			mw.notify('Successfully saved the toollinks.', {type: 'success'});

		} else if (lErr && gErr) { // Failure on both

			saveButton.setIcon('bookmarkOutline').setLabel('Save toollinks');
			setOverlay(false);
			mw.notify('Failed to save the toollinks (' + [lErr, gErr].join(', ') + ').', {type: 'error'});

		} else { // Failure on one, config is messed up

			var success = gErr ? 'local' : 'global';
			var fail = gErr ? 'global' : 'local';
			var errMsg = 'Successfully saved the ' + success + ' toollinks, but failed to save the ' + fail + ' ones. Retrying in 10 seconds...';
			mw.notify(errMsg, {type: 'warn'});
			textNode.textContent = 'Please wait for a while...';

			setTimeout(function() { // Make another try
				var retrying = 'Retrying...';
				mw.notify(retrying);
				textNode.textContent = retrying;
				$.when.apply($, [lErr ? saveLocalOptions(cfg.local) : saveGlobalOptions(cfg.global)]).then(function(err) {
					saveButton.setIcon('bookmarkOutline').setLabel('Save toollinks');
					setOverlay(false);
					if (!err) {
						mw.notify('Successfully saved both types of the toollinks.', {type: 'success'});
					} else {
						mw.notify(
							'Failed to save the ' + fail + ' toollinks. It is recommended that you wait for a few minutes and try again before ' +
							'making other changes in the settings or leaving this page.',
							{type: 'error', autoHideSeconds: 'long'}
						);
					}
				});
			}, 10000);

		}
	});

}

/**
 * Set the visibility of the overlay div and toggle accesibility to DOM elements in the config body.
 * @param {boolean} show
 */
function setOverlay(show) {
	var $overlay = $('#tt-config-overlay');
	var clss = 'tt-config-overlay-hidden';
	if (show) {
		$overlay.removeClass(clss);
	} else {
		$overlay.addClass(clss);
	}
}

/**
 * Toggle the visibility of scroll buttons.
 */
function toggleScrollButtons() {
	// Show/hide the scroll buttons if the document has a sroll bar
	$('#tt-config-scrollbuttons').toggle(window.innerWidth > document.body.clientWidth);
}

/**
 * Save local user preferences.
 * @param {TTConfig[]} cfg
 * @returns {JQueryPromise<string?>} Returns an error code on failure
 */
function saveLocalOptions(cfg) {
	var /** @type {string} */ oldCfgStr = mw.user.options.get(userjs.local) || '[]';
	var cfgStr = JSON.stringify(cfg);
	if (oldCfgStr === '[]' && !cfg.length || oldCfgStr === cfgStr) {
		return $.Deferred().resolve(null);
	} else {
		return new mw.Api().saveOption(userjs.local, cfgStr)
			.then(function() {
				mw.user.options.set(userjs.local, cfgStr);
				return null;
			})
			.catch(function(code, err) {
				console.warn(err);
				return code;
			});
	}
}

/**
 * Save global user preferences.
 * @param {TTConfig[]} cfg
 * @returns {JQueryPromise<string?>} Returns an error code on failure
 */
function saveGlobalOptions(cfg) {
	var /** @type {string} */ oldCfgStr = mw.user.options.get(userjs.global) || '[]';
	var cfgStr = JSON.stringify(cfg);
	if (oldCfgStr === '[]' && !cfg.length || oldCfgStr === cfgStr) {
		return $.Deferred().resolve(null);
	} else {
		return new mw.Api().postWithToken('csrf', {
			action: 'globalpreferences',
			optionname: userjs.global,
			optionvalue: cfgStr,
			formatversion:'2'
		}).then(function() {
			mw.user.options.set(userjs.global, cfgStr);
			return null;
		}).catch(function(code, err) {
			console.warn(err);
			return code;
		});
	}
}

/**
 * Check whether the current page is opted out for toollink building.
 * @param {string|false} specialPageName
 * @param {string[]} spInclude
 * @param {string[]} spExclude
 * @returns {boolean}
 */
function isSpOptedOut(specialPageName, spInclude, spExclude) {
	if (typeof specialPageName !== 'string') {
		return false;
	} else if (spExclude.indexOf('*') !== -1 || spExclude.indexOf(specialPageName) !== -1) {
		return true;
	} else if (spInclude.indexOf('*') !== -1 || spInclude.indexOf(specialPageName) !== -1) {
		return false;
	} else {
		return true;
	}
}

/**
 * Add toollinks.
 * @param {TTBuilderConfig[]} cfg
 * @returns {void}
 */
function addLinks(cfg) {

	// Make sure that this isn't a redundant run
	if (document.querySelector('.tt-toollink')) {
		return;
	}

	// Toollink right below the first heading on Special:Contributions
	var headingToollink;
	if (spName === 'Contributions' && (headingToollink = document.querySelector('.mw-changeslist-links'))) {
		var /** @type {string?} */ user = mw.config.get('wgRelevantUserName');
		if (!user) {
			var /** @type {HTMLHeadingElement?} */ heading = document.querySelector('.mw-first-heading');
			if (heading) {
				user = extractCidr(heading.innerText);
			}
		}
		if (user) {
			createLinks(cfg, user, headingToollink);
		}
	}

	// Iterate over user links
	var /** @type {JQuery<HTMLAnchorElement>} */ $anchors = $('.mw-userlink, .mw-anonuserlink');
	var /** @readonly */ CLS_USERTOOLLINKS = 'mw-usertoollinks';
	var /** @readonly */ CLS_USERTOOLLINKS_TALK = 'mw-usertoollinks-talk';
	$anchors.each(function(_, a) {

		if (a.role === 'button') {
			return;
		}

		var /** @type {string?} */ user = null;
		for (var i = 0; i < a.childNodes.length; i++) {
			// Get the text content of the first <bdi> node; a.textContent might have been messed up
			// if other scripts created new nodes in the anchor
			var node = a.childNodes[i];
			if (node.nodeName === 'BDI') {
				user = node.textContent;
				break;
			}
		}
		if (!user) {
			return;
		}

		/**
		 * Normal structure
		 * ```html
		 * 	<a class="mw-userlink">User</a>
		 * 	<span class="mw-usertoollinks">
		 * 		<span></span>
		 * 	</span>
		 * ```
		 * Special:AbuseLog
		 * ```html
		 *	<a class="mw-userlink">User</a>
		 *	<span class="mw-usertoollinks">
		 *		(
		 *		<a></a>
		 *		 |
		 *		<a></a>
		 *		)
		 *	</span>
		 * ```
		 * Contribs of a CIDR
		 * ```html
		 * <bdi>
		 *	<a class="mw-anonuserlink">IP</a>
		 * </bdi>
		 * <span class="mw-usertoollinks">
		 * 	<span>
		 * 		<a class="mw-usertoollinks-talk"></a>
		 * 	</span>
		 * </span>
		 * ```
		 * Special:RecentChanges, Special:Watchlist (Group changes by page)
		 * ```html
		 *	<span class="mw-changeslist-line-inner-userLink">
		 *		<a class="mw-userlink">User</a>
		 *	</span>
		 *	<span class="mw-changeslist-line-inner-userTalkLink">
		 *		<span class="mw-usertoollinks">
		 *			<span></span>
		 *		</span>
		 *	</span>
		 * ```
		 */
		var $a = $(a);
		var $next = $a.next();
		var $parent = $a.parent();
		var $el;
		if ($next.hasClass(CLS_USERTOOLLINKS_TALK)) {
			// Contribs of a CIDR (backwards compatibility)
			createLinks(cfg, user, $next[0], 'after');
		} else if (($el = $parent.next('.' + CLS_USERTOOLLINKS_TALK)).length) {
			// Contribs of a CIDR (backwards compatibility)
			createLinks(cfg, user, $el[0], 'after');
		} else if (($el = $parent.next('.' + CLS_USERTOOLLINKS)).length) {
			// Contribs of a CIDR
			createLinks(cfg, user, $el[0]);
		} else if (
			($el = $next).hasClass(CLS_USERTOOLLINKS) ||
			// There might be an intervening node created by the ipinfo extension
			($next.hasClass('ext-ipinfo-button') && ($el = $next.next('.' + CLS_USERTOOLLINKS)).length)
		) {
			if ($el.children('a').length) {
				// AbuseLog, bare anchor toollinks
				createLinks(cfg, user, $el[0], 'piped');
			} else {
				// Normal, just append new links as span tags
				createLinks(cfg, user, $el[0]);
			}
		} else if (
			// Non-collaspsed links with the "Group changes by page" setting
			$parent.prop('nodeName') === 'SPAN' && $parent.hasClass('mw-changeslist-line-inner-userLink') &&
			($el = $parent.next('.mw-changeslist-line-inner-userTalkLink')).length &&
			($el = $el.find('.' + CLS_USERTOOLLINKS)).length
		) {
			createLinks(cfg, user, $el[0]);
		}

	});

}

/**
 * Extract a CIDR address from text.
 *
 * Regular expressions used in this function are adapted from `mediawiki.util`.
 * @param {string} text
 * @returns {string?}
 * @link https://doc.wikimedia.org/mediawiki-core/master/js/source/util.html#mw-util-method-isIPv4Address
 * @link https://doc.wikimedia.org/mediawiki-core/master/js/source/util.html#mw-util-method-isIPv6Address
 */
function extractCidr(text) {

	var v4_byte = '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|0?[0-9]?[0-9])';
	var v4_regex = new RegExp('(?:' + v4_byte + '\\.){3}' + v4_byte + '\\/(?:3[0-2]|[12]?\\d)');
	var v6_block = '\\/(?:12[0-8]|1[01][0-9]|[1-9]?\\d)';
	var v6_regex = new RegExp(
		'(?::(?::|(?::[0-9A-Fa-f]{1,4}){1,7})|[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){0,6}::|[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){7})' +
		v6_block
	);
	var v6_regex2 = new RegExp('[0-9A-Fa-f]{1,4}(?:::?[0-9A-Fa-f]{1,4}){1,6}' + v6_block);

	var m;
	if ((m = text.match(v4_regex)) ||
		(m = text.match(v6_regex)) ||
		(m = text.match(v6_regex2)) && /::/.test(m[0]) && !/::.*::/.test(m[0])
	) {
		return m[0];
	} else {
		return null;
	}

}

/**
 * Create toollinks.
 * @param {TTBuilderConfig[]} cfg
 * @param {string} username
 * @param {Element} targetElement
 * @param {"after"|"piped"} [appendType]
 *
 * Types:
 * - `undefined`: Appends toollink spans to `element`.
 * - `'after'`: Appends toollink spans after `element`.
 * - `'piped'`: Appends toollink spans to `element`, by delimiting each with a pipe character.
 *
 * @returns {void}
 */
function createLinks(cfg, username, targetElement, appendType) {

	var userType;
	if (mw.util.isIPAddress(username)) {
		userType = 'IP';
	} else if (mw.util.isIPAddress(username, true)) {
		userType = 'CIDR';
	} else {
		userType = 'User';
	}
	username = encodeURIComponent(username.trim().replace(/ /g, '_'));

	var rep = {
		$2: mw.config.get('wgArticlePath').replace('$1', ''),
		$3:  mw.config.get('wgScript'),
		$4: mw.util.wikiScript('api')
	};
	cfg.forEach(function(obj) {

		if (obj.target.indexOf(userType) === -1) {
			return;
		}

		var a = document.createElement('a');
		a.href = obj.url.replace(/\$[1234]/g, function(m) {
			switch (m) {
				case '$1':
					return username;
				case '$2':
					return rep.$2;
				case '$3':
					return rep.$3;
				case '$4':
					return rep.$4;
				default:
					return m;
			}
		});
		a.textContent = obj.label;
		a.target = obj.tab;

		var span = document.createElement('span');
		span.classList.add('tt-toollink');
		if (appendType === 'after') {
			span.classList.add('tt-toollink-bare');
		}
		span.appendChild(a);

		switch (appendType) {
			case 'after':
				$(targetElement).after(span);
				targetElement = span;
				break;
			case 'piped':
				var ch = targetElement.childNodes;
				ch[ch.length - 1].remove(); // Remove text node
				targetElement.appendChild(document.createTextNode(' | '));
				targetElement.appendChild(span);
				targetElement.appendChild(document.createTextNode(')'));
				break;
			default:
				targetElement.appendChild(span);
		}

	});

}

// *****************************************************************************************************************

// Entry point
init();

// *****************************************************************************************************************
})();
//</nowiki>
