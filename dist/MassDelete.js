"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
//<nowiki>
(function () {
    // ****************************************************************************************************************
    // Across-the-board variables
    /** The script name. */
    var MD = 'MassDelete';
    // Check user rights
    var groupsWithRights = {
        delete: ['eliminator', 'sysop', 'interface-admin', 'global-deleter', /*'global-sysop',*/ 'new-wikis-importer', 'staff', 'steward', 'sysadmin'],
        undelete: ['eliminator', 'sysop', 'global-deleter', /*'global-sysop',*/ 'new-wikis-importer', 'staff', 'steward', 'sysadmin', 'wmf-researcher'],
        apihighlimits: ['sysop', /*'bot',*/ 'apihighlimits-requestor', /*'global-bot',*/ /*'global-sysop',*/ 'staff', 'steward', 'sysadmin', 'wmf-researcher']
    };
    var rights = {
        delete: false,
        undelete: false,
        apihighlimits: false
    };
    // @ts-ignore
    for (var _i = 0, _a = mw.config.get('wgUserGroups').concat(mw.config.get('wgGlobalGroups') || []); _i < _a.length; _i++) {
        var group = _a[_i];
        rights.delete = rights.delete || groupsWithRights.delete.includes(group);
        rights.undelete = rights.undelete || groupsWithRights.undelete.includes(group);
        rights.apihighlimits = rights.apihighlimits || groupsWithRights.apihighlimits.includes(group);
    }
    var lib;
    // ****************************************************************************************************************
    // Main functions
    /** Initialize MassDelete. */
    function init() {
        var modules = [
            'mediawiki.util',
            'mediawiki.api',
            'mediawiki.Title',
            'mediawiki.user'
        ];
        var libName = 'ext.gadget.WpLibExtra';
        var onMassDelete = mw.config.get('wgNamespaceNumber') === -1 && /^(massdelete|md|一括削除)$/i.test(mw.config.get('wgTitle'));
        if (onMassDelete) {
            modules.unshift(libName);
            $(loadInterface);
        }
        $.when(modules, $.ready).then(function (require) {
            if (onMassDelete) {
                // @ts-ignore
                lib = require(libName);
                createStyleTag();
                createInterface();
            }
            else {
                // Add portlet link to the special page
                mw.util.addPortletLink('p-cactions', mw.util.getUrl('Special:一括削除'), '一括削除', 'ca-md', '複数のページを一括削除する');
            }
        });
    }
    /**
     * Replace the content body with a 'now loading' message.
     * @returns
     */
    function loadInterface() {
        document.title = MD + ' - ' + mw.config.get('wgSiteName');
        var header = document.querySelector('.mw-first-heading') ||
            document.querySelector('.firstHeading') ||
            document.querySelector('#firstHeading');
        var body = document.querySelector('.mw-body-content') ||
            document.querySelector('#mw-content-text');
        if (!header || !body) {
            return {};
        }
        header.textContent = '一括削除';
        if (!document.getElementById('md-container')) {
            body.innerHTML = 'インターフェースを読み込み中 ';
            body.appendChild(lib.getIcon('load'));
        }
        return { header: header, body: body };
    }
    /** Create a style tag for the MassDelete interface. */
    function createStyleTag() {
        var style = document.createElement('style');
        style.textContent = '';
        document.head.appendChild(style);
    }
    /** Create the MassDelete interface. */
    function createInterface() {
        var _a = loadInterface(), header = _a.header, body = _a.body;
        if (!header || !body || !lib) {
            mw.notify('インターフェースの読み込みに失敗しました。', { type: 'error', autoHide: false });
            return;
        }
        // Create container and make it the only child of the body content
        var $container = $('<div>').prop('id', 'md-container');
        body.innerHTML = '';
        body.appendChild($container[0]);
    }
    // ****************************************************************************************************************
    // Entry point
    init();
    // ****************************************************************************************************************
})();
