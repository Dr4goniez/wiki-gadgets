"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
//<nowiki>
(function () {
    // ******************************************************************************************
    // Across-the-board variables
    /** The script name. */
    var ANR = 'AN Reporter';
    var ANI = 'Wikipedia:管理者伝言板/投稿ブロック';
    var ANS = 'Wikipedia:管理者伝言板/投稿ブロック/ソックパペット';
    var AN3RR = 'Wikipedia:管理者伝言板/3RR';
    var lib;
    var mwString;
    var idList;
    // ******************************************************************************************
    // Main functions
    /** Initialize the script. */
    function init() {
        // Is the user autoconfirmed?
        if (mw.config.get('wgUserGroups').indexOf('autoconfirmed') === -1) {
            mw.notify('あなたは自動承認されていません。AN Reporterを終了します。', { type: 'warn' });
            return;
        }
        // Shouldn't run on API pages
        if (location.href.indexOf('/api.php') !== -1) {
            return;
        }
        /** Whether the user is on the config page. */
        var onConfig = mw.config.get('wgNamespaceNumber') === -1 && /^(ANReporterConfig|ANRC)$/i.test(mw.config.get('wgTitle'));
        // Load the library and dependent modules, then go on to the main procedure
        loadLibrary(false).then(function (libReady) {
            if (!libReady)
                return;
            // Main procedure
            if (onConfig) {
                // If on the config page, create the interface after loading dependent modules
                $(loadConfigInterface); // Show a 'now loading' message as soon as the DOM gets ready
                var modules = [
                    'mediawiki.user',
                    'oojs-ui',
                    'oojs-ui.styles.icons-editing-core',
                    'oojs-ui.styles.icons-moderation',
                    'mediawiki.api', // mw.Api().saveOption
                ];
                $.when(mw.loader.using(modules), $.ready).then(function () {
                    createStyleTag(Config.merge());
                    createConfigInterface();
                });
            }
            else {
                // If not on the config page, create a portlet link to open the ANR dialog after loading dependent modules
                var modules_1 = [
                    'mediawiki.String',
                    'mediawiki.user',
                    'mediawiki.util',
                    'mediawiki.api',
                    'mediawiki.Title',
                    'jquery.ui',
                ];
                $.when(mw.loader.using(modules_1), mw.loader.getScript('https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.13/js/select2.full.js'), $.ready).then(function (require) {
                    mwString = require(modules_1[0]);
                    var portlet = createPortletLink();
                    if (!portlet) {
                        console.error("".concat(ANR, ": \u30DD\u30FC\u30C8\u30EC\u30C3\u30C8\u30EA\u30F3\u30AF\u306E\u4F5C\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002"));
                        return;
                    }
                    createStyleTag(Config.merge());
                    $('head').append('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.13/css/select2.css">');
                    idList = new IdList();
                    portlet.addEventListener('click', Reporter.new);
                }).catch(function () {
                    var err = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        err[_i] = arguments[_i];
                    }
                    console.warn(err);
                    mw.notify(ANR + ': モジュールの読み込みに失敗しました。', { type: 'error' });
                });
            }
        });
    }
    /**
     * Load the library.
     * @param dev Whether to load the dev version of the library.
     * @returns
     */
    function loadLibrary(dev) {
        if (dev === void 0) { dev = false; }
        var libName = 'ext.gadget.WpLibExtra' + (dev ? 'Dev' : '');
        var loadLocal = function () {
            return mw.loader.using(libName)
                .then(function (require) {
                lib = require(libName);
                if (typeof (lib && lib.version) !== 'string') { // Validate the library
                    console.error("".concat(ANR, ": \u30E9\u30A4\u30D6\u30E9\u30EA\u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002"));
                    return false;
                }
                return true;
            })
                .catch(function () {
                var err = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    err[_i] = arguments[_i];
                }
                console.error(err);
                return false;
            });
        };
        if (dev) {
            return mw.loader.getScript('https://test.wikipedia.org/w/load.php?modules=' + libName).then(loadLocal).catch(function () {
                var err = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    err[_i] = arguments[_i];
                }
                console.error(err);
                return false;
            });
        }
        else {
            return loadLocal();
        }
    }
    /**
     * Get the first heading and content body, replacing the latter with a 'now loading' message.
     * @returns
     */
    function loadConfigInterface() {
        // Change the document's title
        document.title = 'ANReporterConfig' + ' - ' + mw.config.get('wgSiteName');
        // Get the first heading and content body
        var heading = document.querySelector('.mw-first-heading') ||
            document.querySelector('.firstHeading') ||
            document.querySelector('#firstHeading');
        var content = document.querySelector('.mw-body-content') ||
            document.querySelector('#mw-content-text');
        if (!heading || !content) {
            return { heading: null, content: null };
        }
        // Set up the elements
        heading.textContent = ANR + 'の設定';
        content.innerHTML = 'インターフェースを読み込み中 ';
        content.appendChild(lib.getIcon('load'));
        return { heading: heading, content: content };
    }
    /**
     * Create the config interface.
     * @returns
     */
    function createConfigInterface() {
        var _a = loadConfigInterface(), heading = _a.heading, content = _a.content;
        if (!heading || !content) {
            mw.notify('インターフェースの読み込みに失敗しました。', { type: 'error', autoHide: false });
            return;
        }
        // Create a config container
        var $container = $('<div>').prop('id', 'anrc-container');
        content.innerHTML = '';
        content.appendChild($container[0]);
        // Create the config body
        new Config($container);
    }
    /** Class to create/manipulate the config interface. */
    var Config = /** @class */ (function () {
        /**
         * @param $container The container in which to create config options.
         * @requires mw.user
         * @requires oojs-ui
         * @requires oojs-ui.styles.icons-editing-core
         * @requires oojs-ui.styles.icons-moderation
         * @requires mediawiki.api - Used to save the config
         */
        function Config($container) {
            var _this = this;
            // Transparent overlay of the container used to make elements in it unclickable
            this.$overlay = $('<div>').prop('id', 'anrc-container-overlay').hide();
            $container.after(this.$overlay);
            // Get config
            var cfg = Config.merge();
            // Fieldset that stores config options
            this.fieldset = new OO.ui.FieldsetLayout({
                label: 'ダイアログ設定',
                id: 'anrc-options'
            });
            // Create config options
            this.reasons = new OO.ui.MultilineTextInputWidget({
                id: 'anrc-reasons',
                placeholder: '理由ごとに改行',
                rows: 8,
                value: cfg.reasons.join('\n')
            });
            this.blockCheck = new OO.ui.CheckboxInputWidget({
                id: 'anrc-blockcheck',
                selected: cfg.blockCheck
            });
            this.duplicateCheck = new OO.ui.CheckboxInputWidget({
                id: 'anrc-duplicatecheck',
                selected: cfg.duplicateCheck
            });
            this.watchUser = new OO.ui.CheckboxInputWidget({
                id: 'anrc-watchuser',
                selected: cfg.watchUser
            });
            this.watchExpiry = new OO.ui.DropdownWidget({
                id: 'anrc-watchexpiry',
                menu: {
                    items: [
                        new OO.ui.MenuOptionWidget({
                            data: 'infinity',
                            label: '無期限'
                        }),
                        new OO.ui.MenuOptionWidget({
                            data: '1 week',
                            label: '1週間'
                        }),
                        new OO.ui.MenuOptionWidget({
                            data: '2 weeks',
                            label: '2週間'
                        }),
                        new OO.ui.MenuOptionWidget({
                            data: '1 month',
                            label: '1か月'
                        }),
                        new OO.ui.MenuOptionWidget({
                            data: '3 months',
                            label: '3か月'
                        }),
                        new OO.ui.MenuOptionWidget({
                            data: '6 months',
                            label: '6か月'
                        }),
                        new OO.ui.MenuOptionWidget({
                            data: '1 year',
                            label: '1年'
                        }),
                    ]
                }
            });
            this.watchExpiry.getMenu().selectItemByData(cfg.watchExpiry);
            this.headerColor = new OO.ui.TextInputWidget({
                id: 'anrc-headercolor',
                value: cfg.headerColor
            });
            this.backgroundColor = new OO.ui.TextInputWidget({
                id: 'anrc-backgroundcolor',
                value: cfg.backgroundColor
            });
            this.portletlinkPosition = new OO.ui.TextInputWidget({
                id: 'anrc-portletlinkposition',
                value: cfg.portletlinkPosition
            });
            // Add the config options to the fieldset
            this.fieldset.addItems([
                new OO.ui.FieldLayout(this.reasons, {
                    label: '定形理由',
                    align: 'top'
                }),
                new OO.ui.FieldLayout(this.blockCheck, {
                    label: 'ブロックチェック',
                    align: 'inline',
                    help: new OO.ui.HtmlSnippet('報告対象者の既存ブロック設定を、報告時に事前チェックするかを指定します。' +
                        '<i>この設定はダイアログ上で変更可能です。</i>')
                }),
                new OO.ui.FieldLayout(this.duplicateCheck, {
                    label: '重複報告チェック',
                    align: 'inline',
                    help: new OO.ui.HtmlSnippet('重複報告の有無を、報告時に事前チェックするかを指定します。' +
                        '<i>この設定はダイアログ上で変更可能です。</i>')
                }),
                new OO.ui.FieldLayout(this.watchUser, {
                    label: '報告対象者をウォッチ',
                    align: 'inline',
                    help: new OO.ui.HtmlSnippet('報告対象者をウォッチするか否かを指定します。' +
                        '<i>この設定はダイアログ上で変更可能です。</i>')
                }),
                new OO.ui.FieldLayout(this.watchExpiry, {
                    label: 'ウォッチ期間',
                    align: 'top',
                    help: new OO.ui.HtmlSnippet('報告対象者をウォッチする際の期間を設定します。' +
                        '<i>この設定はダイアログ上で変更可能です。</i>')
                }),
                new OO.ui.FieldLayout(this.headerColor, {
                    label: 'ヘッダー色',
                    align: 'top',
                    help: new OO.ui.HtmlSnippet('ダイアログのヘッダー色を指定 (見本: ' +
                        '<span id="anrc-headercolor-demo" class="anrc-colordemo">ヘッダー色</span>' +
                        ')'),
                    helpInline: true
                }),
                new OO.ui.FieldLayout(this.backgroundColor, {
                    label: '背景色',
                    align: 'top',
                    help: new OO.ui.HtmlSnippet('ダイアログの背景色を指定 (見本: ' +
                        '<span id="anrc-backgroundcolor-demo" class="anrc-colordemo">背景色</span>' +
                        ')'),
                    helpInline: true
                }),
                new OO.ui.FieldLayout(this.portletlinkPosition, {
                    label: 'ポートレットID (上級)',
                    align: 'top',
                    help: new OO.ui.HtmlSnippet('<a href="https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.util" target="_blank">mw.util.addPortletLink</a>の' +
                        '<code style="font-family: inherit;">portletId</code>を指定します。未指定または値が無効の場合、使用中のスキンに応じて自動的にリンクの生成位置が決定されます。')
                }),
            ]);
            // Append the fieldset to the container (do this here and get DOM elements in it)
            $container.append(this.fieldset.$element);
            var $headerColorDemo = $('#anrc-headercolor-demo').css('background-color', cfg.headerColor);
            var $backgroundColorDemo = $('#anrc-backgroundcolor-demo').css('background-color', cfg.backgroundColor);
            // Event listeners
            var headerColorTimeout;
            this.headerColor.$input.off('input').on('input', function () {
                var _this = this;
                // Change the background color of span that demonstrates the color of the dialog header
                clearTimeout(headerColorTimeout);
                headerColorTimeout = setTimeout(function () {
                    $headerColorDemo.css('background-color', _this.value);
                }, 500);
            });
            var backgroundColorTimeout;
            this.backgroundColor.$input.off('input').on('input', function () {
                var _this = this;
                // Change the background color of span that demonstrates the color of the dialog body
                clearTimeout(backgroundColorTimeout);
                backgroundColorTimeout = setTimeout(function () {
                    $backgroundColorDemo.css('background-color', _this.value);
                }, 500);
            });
            // Buttons
            var $buttonGroup1 = $('<div>').addClass('anrc-buttonwrapper');
            var resetButton = new OO.ui.ButtonWidget({
                label: 'リセット',
                id: 'anrc-reset',
                icon: 'undo',
                flags: 'destructive'
            });
            resetButton.$element.off('click').on('click', function () {
                _this.reset();
            });
            $buttonGroup1.append(resetButton.$element);
            var $buttonGroup2 = $('<div>').addClass('anrc-buttonwrapper');
            this.saveButton = new OO.ui.ButtonWidget({
                label: '設定を保存',
                id: 'anrc-save',
                icon: 'bookmarkOutline',
                flags: ['primary', 'progressive']
            });
            this.saveButton.$element.off('click').on('click', function () {
                _this.save();
            });
            $buttonGroup2.append(this.saveButton.$element);
            // Append the buttons to the container
            $container.append($buttonGroup1, $buttonGroup2);
        }
        /**
         * Merge and retrieve the ANReporter config.
         * @param getDefault If `true`, get the default config. (Default: `false`)
         * @returns
         * @requires mw.user
         */
        Config.merge = function (getDefault) {
            if (getDefault === void 0) { getDefault = false; }
            // Default config
            var cfg = {
                reasons: [],
                blockCheck: true,
                duplicateCheck: true,
                watchUser: false,
                watchExpiry: 'infinity',
                headerColor: '#FEC493',
                backgroundColor: '#FFF0E4',
                portletlinkPosition: ''
            };
            if (getDefault) {
                return cfg;
            }
            // Objectify the user config
            var strCfg = mw.user.options.get(this.key) || '{}';
            var userCfg;
            try {
                userCfg = JSON.parse(strCfg);
            }
            catch (err) {
                console.warn(err);
                return cfg;
            }
            // Merge the configs
            return Object.assign(cfg, userCfg);
        };
        /**
         * Reset the options to their default values.
         */
        Config.prototype.reset = function () {
            var _this = this;
            OO.ui.confirm('設定をリセットしますか？').then(function (confirmed) {
                if (!confirmed) {
                    mw.notify('キャンセルしました。');
                    return;
                }
                var defaultCfg = Config.merge(true);
                _this.reasons.setValue('');
                _this.blockCheck.setSelected(defaultCfg.blockCheck);
                _this.duplicateCheck.setSelected(defaultCfg.duplicateCheck);
                _this.watchUser.setSelected(defaultCfg.watchUser);
                _this.watchExpiry.getMenu().selectItemByData(defaultCfg.watchExpiry);
                _this.headerColor.setValue(defaultCfg.headerColor).$input.trigger('input');
                _this.backgroundColor.setValue(defaultCfg.backgroundColor).$input.trigger('input');
                _this.portletlinkPosition.setValue('');
                mw.notify('設定をリセットしました。', { type: 'success' });
            });
        };
        /**
         * Set the visibility of the overlay div and toggle accesibility to DOM elements in the config body.
         * @param show
         */
        Config.prototype.setOverlay = function (show) {
            this.$overlay.toggle(show);
        };
        /**
         * Save the config.
         * @requires mediawiki.api
         */
        Config.prototype.save = function () {
            var _this = this;
            this.setOverlay(true);
            // Change the save button's label
            var $label = $('<span>');
            var spinner = lib.getIcon('load');
            spinner.style.marginRight = '1em';
            $label.append(spinner);
            var textNode = document.createTextNode('設定を保存しています...');
            $label.append(textNode);
            this.saveButton.setIcon(null).setLabel($label);
            // Get config
            var reasons = this.reasons.getValue().split('\n').reduce(function (acc, r) {
                var rsn = lib.clean(r);
                if (rsn && !acc.includes(rsn)) {
                    acc.push(rsn);
                }
                return acc;
            }, []);
            this.reasons.setValue(reasons.join('\n'));
            var cfg = {
                reasons: reasons,
                blockCheck: this.blockCheck.isSelected(),
                duplicateCheck: this.duplicateCheck.isSelected(),
                watchUser: this.watchUser.isSelected(),
                // @ts-ignore
                watchExpiry: this.watchExpiry.getMenu().findSelectedItem().getData(),
                headerColor: this.headerColor.getValue(),
                backgroundColor: this.backgroundColor.getValue(),
                portletlinkPosition: this.portletlinkPosition.getValue()
            };
            var strCfg = JSON.stringify(cfg);
            // Save config
            new mw.Api().saveOption(Config.key, strCfg)
                .then(function () {
                mw.user.options.set(Config.key, strCfg);
                return null;
            })
                .catch(function (code, err) {
                console.warn(err);
                return code;
            })
                .then(function (err) {
                if (err) {
                    mw.notify("\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002(".concat(err, ")"), { type: 'error' });
                }
                else {
                    mw.notify('保存しました。', { type: 'success' });
                }
                _this.saveButton.setIcon('bookmarkOutline').setLabel('設定を保存');
                _this.setOverlay(false);
            });
        };
        /**
         * The key of `mw.user.options`.
         */
        Config.key = 'userjs-anreporter';
        return Config;
    }());
    /** Create a '報告' portlet link. */
    function createPortletLink() {
        var cfg = Config.merge();
        var portletlinkPosition = '';
        if (cfg.portletlinkPosition) {
            if (document.getElementById(cfg.portletlinkPosition)) {
                portletlinkPosition = cfg.portletlinkPosition;
            }
            else {
                mw.notify("AN Reporter: \"".concat(cfg.portletlinkPosition, "\" \u306F\u30DD\u30FC\u30C8\u30EC\u30C3\u30C8\u30EA\u30F3\u30AF\u306E\u751F\u6210\u4F4D\u7F6E\u3068\u3057\u3066\u4E0D\u6B63\u306AID\u3067\u3059\u3002"), { type: 'error' });
            }
        }
        if (!portletlinkPosition) {
            switch (mw.config.get('skin')) {
                case 'vector':
                case 'vector-2022':
                    portletlinkPosition = 'p-views';
                    break;
                case 'minerva':
                    portletlinkPosition = 'p-personal';
                    break;
                default: // monobook, timeless, or something else
                    portletlinkPosition = 'p-cactions';
            }
        }
        var portlet = mw.util.addPortletLink(portletlinkPosition, '#', '報告β', 'ca-anr2', '管理者伝言板に利用者を報告', undefined, '#ca-move');
        return portlet || null;
    }
    /**
     * Create a /<style> tag for the script.
     */
    function createStyleTag(cfg) {
        var style = document.createElement('style');
        style.textContent =
            // Config
            '#anrc-container {' +
                'position: relative;' +
                '}' +
                '#anrc-container-overlay {' + // Overlay of the config body, used to make elements in it unclickable
                'width: 100%;' +
                'height: 100%;' +
                'position: absolute;' +
                'top: 0;' +
                'left: 0;' +
                'z-index: 10;' +
                '}' +
                '#anrc-options {' + // Border around fieldset
                'padding: 1em;' +
                'margin-bottom: 1em;' +
                'border: 1px solid silver;' +
                '}' +
                '.anrc-colordemo {' + // Demo color span, change inline to inline-block
                'display: inline-block;' +
                'border: 1px solid silver;' +
                '}' +
                '.anrc-buttonwrapper:not(:last-child) {' + // Margin below buttons
                'margin-bottom: 0.5em;' +
                '}' +
                // Dialog
                '.anr-hidden {' + // Used to show/hide elements on the dialog (by Reporter.toggle)
                'display: none;' +
                '}' +
                '#anr-dialog-progress,' + // One of the main dialog field
                '#anr-dialog-preview-content {' +
                'padding: 1em;' +
                '}' +
                '#anr-dialog-optionfield {' + // The immediate child of #anr-dialog-content
                'padding: 1em;' +
                'margin: 0;' +
                'border: 1px solid #cccccc;' +
                '}' +
                '#anr-dialog-optionfield > legend {' +
                'font-weight: bold;' +
                'padding-bottom: 0;' +
                '}' +
                '#anr-dialog-optionfield hr {' +
                'margin: 0.8em 0;' +
                'background-color: #cccccc;' +
                '}' +
                '.anr-option-row:not(:last-child) {' + // Margin below every option row
                'margin-bottom: 0.15em;' +
                '}' +
                '.anr-option-row > .anr-option-row-inner:not(.anr-hidden):first-child {' +
                'margin-top: 0.15em;' +
                '}' +
                '.anr-option-userpane-wrapper {' +
                'position: relative;' +
                '}' +
                '.anr-option-userpane-overlay {' +
                'width: 100%;' +
                'height: 100%;' +
                'position: absolute;' +
                'top: 0;' +
                'left: 0;' +
                'z-index: 10;' +
                '}' +
                '.anr-option-row-withselect2 {' +
                'margin: 0.3em 0;' +
                '}' +
                '.anr-option-label {' + // The label div of a row
                'margin-right: 1em;' +
                'float: left;' + // For a juxtaposed div to fill the remaining space
                '}' +
                '.anr-option-wrapper {' +
                'overflow: hidden;' + // Implicit width of 100% (for the child element below)
                '}' +
                '#anr-option-reason, ' +
                '#anr-option-comment,' +
                '.anr-juxtaposed {' + // Assigned by Reporter.wrapElement.
                'box-sizing: border-box;' +
                'width: 100%;' + // Fill the remaining space ("float" and "overflow" are essential for this to work)
                '}' +
                '.select2-container,' + // Set up the font size of select2 options 
                '.anr-select2 .select2-selection--single {' +
                'height: auto !important;' +
                '}' +
                '.anr-select2 .select2-selection__rendered {' +
                'padding: 1px 2px;' +
                'font-size: 1em;' +
                'line-height: normal !important;' +
                '}' +
                '.anr-select2 .select2-results__option,' +
                '.anr-select2 .select2-results__group {' +
                'padding: 1px 8px;' +
                'font-size: 0.9em;' +
                'margin: 0;' +
                '}' +
                '.anr-disabledanchor {' + // Disabled anchor
                'pointer: none;' +
                'pointer-events: none;' +
                'color: gray;' +
                'text-decoration: line-through;' +
                '}' +
                '.anr-option-usertype {' + // UserAN type selector in user pane
                'float: right;' +
                'margin-left: 0.3em;' +
                '}' +
                '.anr-option-invalidid,' +
                '.anr-option-usertype-none {' +
                'border: 2px solid red;' +
                'border-radius: 3px;' +
                '}' +
                '.anr-option-removable > .anr-option-label {' + // Change cursor for the label of a user pane that's removable
                'cursor: pointer;' +
                '}' +
                '.anr-option-removable > .anr-option-label:hover {' +
                'background-color: #80ccff;' + // Bluish on hover
                '}' +
                '.anr-checkbox {' +
                'margin-right: 0.5em;' +
                '}' +
                '.anr-dialog label {' + // Get 'vertical-align' to work, ensuring itself as a block element
                'display: inline-block;' +
                '}' +
                '.anr-dialog label > .anr-checkbox,' +
                '.anr-dialog label > .anr-checkbox-label {' +
                'vertical-align: middle;' +
                '}' +
                '.anr-option-hideuser > label {' +
                'margin-left: 0.2em;' +
                '}' +
                '.anr-option-blockstatus > a {' +
                'color: mediumvioletred;' +
                '}' +
                // Dialog colors
                '.anr-dialog.ui-dialog-content,' +
                '.anr-dialog.ui-corner-all,' +
                '.anr-dialog.ui-draggable,' +
                '.anr-dialog.ui-resizable,' +
                '.anr-dialog .ui-dialog-buttonpane {' +
                "background: ".concat(cfg.backgroundColor, ";") +
                '}' +
                '.anr-dialog .ui-dialog-titlebar.ui-widget-header,' +
                '.anr-dialog .ui-dialog-titlebar-close {' +
                "background: ".concat(cfg.headerColor, " !important;") +
                '}';
        document.head.appendChild(style);
    }
    /**
     * The IdList class. Administrates username-ID conversions.
     */
    var IdList = /** @class */ (function () {
        /** Initialize a new `IdList` instance. */
        function IdList() {
            this.list = {};
        }
        /**
         * Get event IDs of a user.
         * @param username
         * @returns
         */
        IdList.prototype.getIds = function (username) {
            username = User.formatName(username);
            for (var user in this.list) {
                if (user === username) {
                    var _a = this.list[user], logid = _a.logid, diffid = _a.diffid;
                    if (typeof logid === 'number' || typeof diffid === 'number') {
                        return $.Deferred().resolve(__assign({}, this.list[user]));
                    }
                }
            }
            return this.fetchIds(username);
        };
        /**
         * Search for the oldest account creation logid and the diffid of the newest edit of a user.
         * @param username
         * @returns
         */
        IdList.prototype.fetchIds = function (username) {
            var _this = this;
            var ret = {};
            return new mw.Api().get({
                action: 'query',
                list: 'logevents|usercontribs',
                leprop: 'ids',
                letype: 'newusers',
                ledir: 'newer',
                lelimit: 1,
                leuser: username,
                uclimit: 1,
                ucuser: username,
                ucprop: 'ids',
                formatversion: '2'
            }).then(function (res) {
                var resLgev = res && res.query && res.query.logevents;
                var resCont = res && res.query && res.query.usercontribs;
                if (resLgev && resLgev[0] && resLgev[0].logid !== void 0) {
                    ret.logid = resLgev[0].logid;
                }
                if (resCont && resCont[0] && resCont[0].revid !== void 0) {
                    ret.diffid = resCont[0].revid;
                }
                if (Object.keys(ret).length) {
                    _this.list[username] = __assign({}, ret);
                }
                return ret;
            }).catch(function (_, err) {
                console.error(err);
                return ret;
            });
        };
        /**
         * Get a username from a log/diff ID.
         * @param id
         * @param type
         * @returns
         */
        IdList.prototype.getUsername = function (id, type) {
            var _this = this;
            // Attempt to convert the ID without making an HTTP request
            var registeredUsername = this.getRegisteredUsername(id, type);
            if (registeredUsername) {
                return $.Deferred().resolve(registeredUsername);
            }
            // Attempt to convert the ID through an HTTP request
            var fetcher = type === 'logid' ? this.scrapeUsername : this.fetchEditorName;
            return fetcher(id).then(function (username) {
                if (username) {
                    username = User.formatName(username);
                    if (!_this.list[username]) {
                        _this.list[username] = {};
                    }
                    _this.list[username][type] = id;
                }
                return username;
            });
        };
        /**
         * Attempt to convert an ID to a username based on the current username-ID list (no HTTP request).
         * @param id
         * @param type
         * @returns
         */
        IdList.prototype.getRegisteredUsername = function (id, type) {
            for (var user in this.list) {
                var relId = this.list[user][type];
                if (relId === id) {
                    return user;
                }
            }
            return null;
        };
        /**
         * Scrape [[Special:Log]] by a logid and attempt to get the associated username (if any).
         * @param logid
         * @returns
         */
        IdList.prototype.scrapeUsername = function (logid) {
            var url = mw.util.getUrl('特別:ログ', { logid: logid.toString() });
            return $.get(url)
                .then(function (html) {
                var $newusers = $(html).find('.mw-logline-newusers').last();
                if ($newusers.length) {
                    switch ($newusers.data('mw-logaction')) {
                        case 'newusers/create':
                        case 'newusers/autocreate':
                        case 'newusers/create2': // Created by an existing user
                        case 'newusers/byemail': // Created by an existing user and password sent off
                            return $newusers.children('a.mw-userlink').eq(0).text();
                        case 'newusers/forcecreatelocal':
                            return $newusers.children('a').last().text().replace(/^利用者:/, '');
                        default:
                    }
                }
                return null;
            })
                .catch(function () {
                var err = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    err[_i] = arguments[_i];
                }
                console.log(err);
                return null;
            });
        };
        /**
         * Convert a revision ID to a username.
         * @param diffid
         * @returns
         */
        IdList.prototype.fetchEditorName = function (diffid) {
            return new mw.Api().get({
                action: 'query',
                prop: 'revisions',
                revids: diffid,
                formatversion: '2'
            }).then(function (res) {
                var resPg = res && res.query && res.query.pages;
                if (!resPg || !resPg.length)
                    return null;
                var resRev = resPg[0].revisions;
                var user = Array.isArray(resRev) && !!resRev.length && resRev[0].user;
                return user || null;
            }).catch(function (_, err) {
                console.log(err);
                return null;
            });
        };
        return IdList;
    }());
    /**
     * The Reporter class. Manipulates the ANR dialog.
     */
    var Reporter = /** @class */ (function () {
        /**
         * Initializes a `Reporter` instance. This constructor only creates the base components of the dialog, and
         * asynchronous procedures are externally handled by {@link new}.
         */
        function Reporter() {
            var _this = this;
            this.cfg = Config.merge();
            Reporter.blockStatus = {}; // Reset
            // Create dialog contour
            this.$dialog = $('<div>');
            this.$dialog.prop('title', ANR).css('max-height', '70vh');
            this.$dialog.dialog({
                dialogClass: 'anr-dialog',
                resizable: false,
                height: 'auto',
                width: 'auto',
                modal: true,
                close: function () {
                    // Destory the dialog and its contents when closed by any means
                    $(this).empty().dialog('destroy');
                }
            });
            // Create progress container
            this.$progress = $('<div>');
            this.$progress
                .prop('id', 'anr-dialog-progress')
                .append(document.createTextNode('読み込み中'), $(lib.getIcon('load')).css('margin-left', '0.5em'));
            this.$dialog.append(this.$progress);
            // Create option container
            this.$content = $('<div>');
            this.$content.prop('id', 'anr-dialog-content');
            this.$dialog.append(this.$content);
            // Create fieldset
            this.$fieldset = $('<fieldset>');
            this.$fieldset.prop({
                id: 'anr-dialog-optionfield',
                innerHTML: '<legend>利用者を報告</legend>'
            });
            this.$content.append(this.$fieldset);
            // Create target page option
            var $pageWrapper = Reporter.createRow();
            var $pageLabel = Reporter.createRowLabel($pageWrapper, '報告先');
            this.$page = $('<select>');
            this.$page
                .addClass('anr-juxtaposed') // Important for the dropdown to fill the remaining space
                .prop('innerHTML', '<option selected disabled hidden value="">選択してください</option>' +
                '<option>' + ANI + '</option>' +
                '<option>' + ANS + '</option>' +
                '<option>' + AN3RR + '</option>')
                .off('change').on('change', function () {
                _this.switchSectionDropdown();
            });
            var $pageDropdownWrapper = Reporter.wrapElement($pageWrapper, this.$page); // As important as above
            this.$fieldset.append($pageWrapper);
            Reporter.verticalAlign($pageLabel, $pageDropdownWrapper);
            // Create target page anchor
            var $pageLinkWrapper = Reporter.createRow();
            Reporter.createRowLabel($pageLinkWrapper, '');
            this.$pageLink = $('<a>');
            this.$pageLink
                .addClass('anr-disabledanchor') // Disable the anchor by default
                .text('報告先を確認')
                .prop('target', '_blank');
            $pageLinkWrapper.append(this.$pageLink);
            this.$fieldset.append($pageLinkWrapper);
            // Create section option for ANI and AN3RR
            this.$sectionWrapper = Reporter.createRow();
            var $sectionLabel = Reporter.createRowLabel(this.$sectionWrapper, '節');
            this.$section = $('<select>');
            this.$section
                .prop({
                innerHTML: '<option selected disabled hidden value="">選択してください</option>',
                disabled: true
            })
                .off('change').on('change', function () {
                _this.setPageLink();
            });
            var $sectionDropdownWrapper = Reporter.wrapElement(this.$sectionWrapper, this.$section);
            this.$fieldset.append(this.$sectionWrapper);
            Reporter.verticalAlign($sectionLabel, $sectionDropdownWrapper);
            // Create section option for ANS
            this.$sectionAnsWrapper = Reporter.createRow(true);
            var $sectionAnsLabel = Reporter.createRowLabel(this.$sectionAnsWrapper, '節');
            this.$sectionAns = $('<select>');
            this.$sectionAns
                .prop('innerHTML', '<option selected disabled hidden value="">選択してください</option>' +
                '<optgroup label="系列が立てられていないもの">' +
                '<option>著作権侵害・犯罪予告</option>' +
                '<option>名誉毀損・なりすまし・個人情報</option>' +
                '<option>妨害編集・いたずら</option>' +
                '<option>その他</option>' +
                '</optgroup>')
                .off('change').on('change', function () {
                _this.setPageLink();
            });
            var $sectionAnsDropdownWrapper = Reporter.wrapElement(this.$sectionAnsWrapper, this.$sectionAns);
            this.$fieldset.append(this.$sectionAnsWrapper);
            Reporter.select2(this.$sectionAns);
            Reporter.verticalAlign($sectionAnsLabel, $sectionAnsDropdownWrapper);
            // Create an 'add' button
            this.$fieldset.append(document.createElement('hr'));
            var $addButtonWrapper = Reporter.createRow();
            this.$addButton = $('<input>');
            this.$addButton.prop('type', 'button').val('追加');
            $addButtonWrapper.append(this.$addButton);
            this.$fieldset.append($addButtonWrapper);
            this.$fieldset.append(document.createElement('hr'));
            // Create a user pane 
            this.Users = [
                new User($addButtonWrapper, { removable: false })
            ];
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            var self = this;
            this.$addButton.off('click').on('click', function () {
                new User($addButtonWrapper, {
                    addCallback: function (User) {
                        var minWidth = User.$label.outerWidth() + 'px';
                        $.each([User.$wrapper, User.$hideUserWrapper, User.$idLinkWrapper, User.$blockStatusWrapper], function (_, $wrapper) {
                            $wrapper.children('.anr-option-label').css('min-width', minWidth);
                        });
                        self.Users.push(User);
                    },
                    removeCallback: function (User) {
                        var idx = self.Users.findIndex(function (U) { return U.id === User.id; });
                        if (idx !== -1) { // Should never be -1
                            var U = self.Users[idx];
                            U.$wrapper.remove();
                            self.Users.splice(idx, 1);
                        }
                    }
                });
            });
            var dialogWith = this.$fieldset.outerWidth(true);
            this.$fieldset.css('width', dialogWith); // Assign an absolute width to $content
            this.$progress.css('width', dialogWith);
            Reporter.centerDialog(this.$dialog); // Recenter the dialog because the width has been changed
            /**
             * (Bound to the change event of a \<select> element.)
             *
             * Copy the selected value to the clipboard and reset the selection.
             * @param this
             */
            var copyThenResetSelection = function () {
                lib.copyToClipboard(this.value, 'ja');
                this.selectedIndex = 0;
            };
            // Create VIP copier
            this.$vipWrapper = Reporter.createRow(true);
            var $vipLabel = Reporter.createRowLabel(this.$vipWrapper, 'VIP');
            this.$vip = $('<select>');
            this.$vip
                .prop('innerHTML', '<option selected disabled hidden value="">選択してコピー</option>')
                .off('change').on('change', copyThenResetSelection);
            var $vipDropdownWrapper = Reporter.wrapElement(this.$vipWrapper, this.$vip);
            this.$fieldset.append(this.$vipWrapper);
            Reporter.select2(this.$vip);
            Reporter.verticalAlign($vipLabel, $vipDropdownWrapper);
            // Create LTA copier
            this.$ltaWrapper = Reporter.createRow(true);
            var $ltaLabel = Reporter.createRowLabel(this.$ltaWrapper, 'LTA');
            this.$lta = $('<select>');
            this.$lta
                .prop('innerHTML', '<option selected disabled hidden value="">選択してコピー</option>')
                .off('change').on('change', copyThenResetSelection);
            var $ltaDropdownWrapper = Reporter.wrapElement(this.$ltaWrapper, this.$lta);
            this.$fieldset.append(this.$ltaWrapper);
            Reporter.select2(this.$lta);
            Reporter.verticalAlign($ltaLabel, $ltaDropdownWrapper);
            // Create predefined reason selector
            var $predefinedWrapper = Reporter.createRow(true);
            var $predefinedLabel = Reporter.createRowLabel($predefinedWrapper, '定型文');
            this.$predefined = addOptions($('<select>'), __spreadArray([
                { text: '選択してコピー', value: '', disabled: true, selected: true, hidden: true }
            ], this.cfg.reasons.map(function (el) { return ({ text: el }); }), true));
            this.$predefined.off('change').on('change', copyThenResetSelection);
            var $predefinedDropdownWrapper = Reporter.wrapElement($predefinedWrapper, this.$predefined);
            this.$fieldset.append($predefinedWrapper);
            Reporter.select2(this.$predefined);
            Reporter.verticalAlign($predefinedLabel, $predefinedDropdownWrapper);
            // Create reason field
            var $reasonWrapper = Reporter.createRow();
            Reporter.createRowLabel($reasonWrapper, '理由');
            this.$reason = $('<textarea>');
            this.$reason.prop({
                id: 'anr-option-reason',
                rows: 5,
                placeholder: '署名不要'
            });
            $reasonWrapper.append(this.$reason);
            this.$fieldset.append($reasonWrapper);
            // Create "add comment" option
            var addCommentElements = createLabelledCheckbox('要約にコメントを追加', { checkboxId: 'anr-option-addcomment' });
            this.$addComment = addCommentElements.$checkbox;
            this.$fieldset.append(addCommentElements.$wrapper);
            this.$comment = $('<textarea>');
            this.$comment.prop({
                id: 'anr-option-comment',
                rows: 2
            });
            addCommentElements.$wrapper.append(this.$comment);
            this.$addComment.off('change').on('change', function () {
                Reporter.toggle(_this.$comment, _this.$addComment.prop('checked'));
            }).trigger('change');
            // Create "block check" option
            var checkBlockElements = createLabelledCheckbox('報告前にブロック状態をチェック', { checkboxId: 'anr-option-checkblock' });
            this.$checkBlock = checkBlockElements.$checkbox;
            this.$checkBlock.prop('checked', this.cfg.blockCheck);
            this.$fieldset.append(checkBlockElements.$wrapper);
            // Create "duplicate check" option
            var checkDuplicatesElements = createLabelledCheckbox('報告前に重複報告をチェック', { checkboxId: 'anr-option-checkduplicates' });
            this.$checkDuplicates = checkDuplicatesElements.$checkbox;
            this.$checkDuplicates.prop('checked', this.cfg.duplicateCheck);
            this.$fieldset.append(checkDuplicatesElements.$wrapper);
            // Create "watch user" option
            var watchUserElements = createLabelledCheckbox('報告対象者をウォッチ', { checkboxId: 'anr-option-watchuser' });
            this.$watchUser = watchUserElements.$checkbox;
            this.$watchUser.prop('checked', this.cfg.watchUser);
            this.$fieldset.append(watchUserElements.$wrapper);
            this.$watchExpiry = $('<select>');
            this.$watchExpiry
                .prop({
                id: 'anr-option-watchexpiry',
                innerHTML: '<option value="infinity">無期限</option>' +
                    '<option value="1 week">1週間</option>' +
                    '<option value="2 weeks">2週間</option>' +
                    '<option value="1 month">1か月</option>' +
                    '<option value="3 months">3か月</option>' +
                    '<option value="6 months">6か月</option>' +
                    '<option value="1 year">1年</option>'
            })
                .val(this.cfg.watchExpiry);
            var $watchExpiryWrapper = $('<div>');
            $watchExpiryWrapper
                .prop({ id: 'anr-option-watchexpiry-wrapper' })
                .css({
                marginLeft: this.$watchUser.outerWidth(true) + 'px',
                marginTop: '0.3em'
            })
                .append(document.createTextNode('期間: '), this.$watchExpiry);
            watchUserElements.$wrapper.append($watchExpiryWrapper);
            this.$watchUser.off('change').on('change', function () {
                Reporter.toggle($watchExpiryWrapper, _this.$watchUser.prop('checked'));
            }).trigger('change');
            // Set all the row labels to the same width
            Reporter.setWidestWidth($('.anr-option-label'));
            // Make some wrappers invisible
            Reporter.toggle(this.$sectionAnsWrapper, false);
            Reporter.toggle(this.$vipWrapper, false);
            Reporter.toggle(this.$ltaWrapper, false);
            if (this.$predefined.find('option').length < 2) {
                Reporter.toggle($predefinedWrapper, false);
            }
            Reporter.toggle(this.$content, false);
        }
        /**
         * Taken several HTML elements, set the width that is widest among the elements to all of them.
         * @param $elements
         */
        Reporter.setWidestWidth = function ($elements) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            var optionsWidths = Array.prototype.map.call($elements, function (el) { return el.offsetWidth; } // Collect the widths of all the elements
            );
            var optionWidth = Math.max.apply(Math, optionsWidths); // Get the max value
            $elements.css('min-width', optionWidth); // Set the value to all
        };
        /**
         * Toggle the visibility of an element by (de)assigning the `anr-hidden` class.
         * @param $element The element of which to toggle the visibility.
         * @param show Whether to show the element.
         * @returns The passed element.
         */
        Reporter.toggle = function ($element, show) {
            return $element.toggleClass('anr-hidden', !show);
        };
        /**
         * Create a \<div> that works as a Reporter row.
         * ```html
         * <!-- hasSelect2: false -->
         * <div class="anr-option-row"></div>
         * <!-- hasSelect2: true -->
         * <div class="anr-option-row-withselect2"></div>
         * ```
         * @param hasSelect2 `false` by default.
         * @returns The created row.
         */
        Reporter.createRow = function (hasSelect2) {
            if (hasSelect2 === void 0) { hasSelect2 = false; }
            var $row = $('<div>');
            $row.addClass(!hasSelect2 ? 'anr-option-row' : 'anr-option-row-withselect2');
            return $row;
        };
        /**
         * Create a \<div> that works as a left-aligned label.
         * ```html
         * <div class="anr-option-label">labelText</div>
         * ```
         * @param $appendTo The element to which to append the label.
         * @param labelText The text of the label (technically, the innerHTML). If an empty string is passed, `&nbsp;` is used.
         * @returns The created label.
         */
        Reporter.createRowLabel = function ($appendTo, labelText) {
            var $label = $('<div>');
            $label.addClass('anr-option-label');
            if (typeof labelText === 'string') {
                $label.prop('innerHTML', labelText || '&nbsp;');
            }
            else {
                $label.append(labelText);
            }
            $appendTo.append($label);
            return $label;
        };
        /**
         * Compare the outerHeight of a row label div and that of a sibling div, and if the former is smaller than the latter,
         * assign `padding-top` to the former.
         *
         * Note: **Both elements must be visible when this function is called**.
         * @param $label
         * @param $sibling
         */
        Reporter.verticalAlign = function ($label, $sibling) {
            var labelHeight = $label.outerHeight();
            var siblingHeight = $sibling.outerHeight();
            if ($label.text() && labelHeight < siblingHeight) {
                $label.css('padding-top', ((siblingHeight - labelHeight) / 2) + 'px');
            }
        };
        /**
         * Wrap a (non-block) element (next to a row label) with a div. This is for the element to fill the remaining space.
         * ```html
         * <div class="anr-option-row">
         * 	<div class="anr-option-label"></div> <!-- float: left; -->
         * 	<div class="anr-option-wrapper"> <!-- overflow: hidden; -->
         * 		<element class="anr-juxtaposed">...</element> <!-- width: 100%; -->
         * 	</div>
         * </div>
         * ```
         * @param $appendTo The element to which to append the wrapper div.
         * @param $element The element to wrap.
         * @returns The wrapper div.
         */
        Reporter.wrapElement = function ($appendTo, $element) {
            var $wrapper = $('<div>');
            $wrapper.addClass('anr-option-wrapper');
            $element.addClass('anr-juxtaposed');
            $wrapper.append($element);
            $appendTo.append($wrapper);
            return $wrapper;
        };
        /**
         * Set up `select2` to a dropdown.
         * @param $dropdown
         */
        Reporter.select2 = function ($dropdown) {
            $dropdown.select2({
                width: '100%',
                dropdownCssClass: 'anr-select2' // This needs select2.full.js
            });
        };
        /**
         * Bring a jQuery UI dialog to the center of the viewport.
         */
        Reporter.centerDialog = function ($dialog) {
            $dialog.dialog({
                position: {
                    my: 'top',
                    at: 'top+5%',
                    of: window
                }
            });
        };
        /**
         * Create a new Reporter dialog. This static method handles asynchronous procedures that are necessary
         * after calling the constructor.
         * @param e
         */
        Reporter.new = function (e) {
            // Cancel portletlink click event
            e.preventDefault();
            // Create a Reporter dialog
            var R = new Reporter();
            // Get a username associated with the current page if any
            var heading = document.querySelector('.mw-first-heading') ||
                document.querySelector('.firstHeading') ||
                document.querySelector('#firstHeading');
            var relevantUser = mw.config.get('wgRelevantUserName') ||
                mw.config.get('wgCanonicalSpecialPageName') === 'Contributions' && heading && heading.textContent && extractCidr(heading.textContent);
            var U = R.Users[0];
            U.$input.val(relevantUser || '');
            var def = U.processInputChange();
            // Process additional asynchronous procedures for Reporter
            $.when(lib.Wikitext.newFromTitle(ANS), lib.getVipList(), lib.getLtaList())
                .then(function (Wkt, vipList, ltaList) {
                // Initialize the ANS section dropdown
                if (Wkt) {
                    var exclude_1 = [
                        'top',
                        '系列が立てられていないもの',
                        '著作権侵害・犯罪予告',
                        '名誉毀損・なりすまし・個人情報',
                        '妨害編集・いたずら',
                        'その他',
                        'A. 最優先',
                        '暫定A',
                        '休止中A',
                        'B. 優先度高',
                        '暫定B',
                        '休止中B',
                        'C. 優先度中',
                        '暫定C',
                        '休止中C',
                        'D. 優先度低',
                        '暫定D',
                        '休止中D',
                        'N. 未分類',
                        'サブページなし',
                        '休止中N'
                    ];
                    var optgroup_1 = document.createElement('optgroup');
                    optgroup_1.label = 'LTA';
                    Wkt.parseSections().forEach(function (_a) {
                        var title = _a.title;
                        if (!exclude_1.includes(title)) {
                            var option = document.createElement('option');
                            option.textContent = title;
                            optgroup_1.appendChild(option);
                        }
                    });
                    if (optgroup_1.querySelector('option')) {
                        R.$sectionAns[0].add(optgroup_1);
                    }
                    else {
                        mw.notify('WP:AN/Sのセクション情報の取得に失敗しました。節構成が変更された、またはスクリプトのバグの可能性があります。', { type: 'error' });
                    }
                }
                else {
                    mw.notify('WP:AN/Sのセクション情報の取得に失敗しました。ダイアログを開き直すと改善する場合があります。', { type: 'error' });
                }
                // Initialize the VIP copier dropdown
                if (vipList.length) {
                    var optgroup_2 = document.createElement('optgroup');
                    optgroup_2.style.display = 'none'; // Wrap with optgroup to adjust font size
                    vipList.forEach(function (vip) {
                        var option = document.createElement('option');
                        option.textContent = vip;
                        option.value = '[[WP:VIP#' + vip + ']]';
                        optgroup_2.appendChild(option);
                    });
                    R.$vip[0].add(optgroup_2);
                    Reporter.toggle(R.$vipWrapper, true);
                }
                // Initialize the LTA copier dropdown
                if (ltaList.length) {
                    var optgroup_3 = document.createElement('optgroup');
                    optgroup_3.style.display = 'none'; // Wrap with optgroup to adjust font size
                    ltaList.forEach(function (lta) {
                        var option = document.createElement('option');
                        option.textContent = lta;
                        option.value = '[[LTA:' + lta + ']]';
                        optgroup_3.appendChild(option);
                    });
                    R.$lta[0].add(optgroup_3);
                    Reporter.toggle(R.$ltaWrapper, true);
                }
                def.then(function () {
                    Reporter.toggle(R.$progress, false);
                    Reporter.toggle(R.$content, true);
                    R.setMainButtons();
                });
            });
        };
        /**
         * Set the main dialog buttons.
         */
        Reporter.prototype.setMainButtons = function () {
            var _this = this;
            this.$dialog.dialog({
                buttons: [
                    {
                        text: '報告',
                        click: function () { return _this.report(); }
                    },
                    {
                        text: 'プレビュー',
                        click: function () { return _this.preview(); }
                    },
                    {
                        text: '閉じる',
                        click: function () { return _this.close(); }
                    }
                ]
            });
        };
        /**
         * Close the Reporter dialog (will be destroyed).
         */
        Reporter.prototype.close = function () {
            this.$dialog.dialog('close');
        };
        /**
         * Get `YYYY年MM月D1日 - D2日新規依頼`, relative to the current day.
         * @param getLast Whether to get the preceding section, defaulted to `false`.
         * @returns
         */
        Reporter.getCurrentAniSection = function (getLast) {
            if (getLast === void 0) { getLast = false; }
            var d = new Date();
            var subtract;
            if (getLast) {
                if (d.getDate() === 1 || d.getDate() === 2) {
                    subtract = 3;
                }
                else if (d.getDate() === 31) {
                    subtract = 6;
                }
                else {
                    subtract = 5;
                }
                d.setDate(d.getDate() - subtract);
            }
            var multiplier = Math.ceil(d.getDate() / 5); // 1 to 7
            var lastDay, startDay;
            if (multiplier < 6) {
                lastDay = 5 * multiplier; // 5, 10, 15, 20, 25
                startDay = lastDay - 4; // 1, 6, 11, 16, 21
            }
            else {
                lastDay = Reporter.getLastDay(d.getFullYear(), d.getMonth()); // 28-31
                startDay = 26;
            }
            return "".concat(d.getFullYear(), "\u5E74").concat(d.getMonth() + 1, "\u6708").concat(startDay, "\u65E5 - ").concat(lastDay, "\u65E5\u65B0\u898F\u5831\u544A");
        };
        /**
         * Get the last day of a given month in a given year.
         * @param year A 4-digit year.
         * @param month The month as a number between 0 and 11 (January to December).
         * @returns
         */
        Reporter.getLastDay = function (year, month) {
            return new Date(year, month + 1, 0).getDate();
        };
        /**
         * Get the page to which to forward the report.
         * @returns
         */
        Reporter.prototype.getPage = function () {
            return this.$page.val() || null;
        };
        /**
         * Set an href to {@link $pageLink}. If {@link $page} is not selected, disable the anchor.
         * @returns
         */
        Reporter.prototype.setPageLink = function () {
            var page = this.getPage();
            if (page) {
                this.$pageLink
                    .removeClass('anr-disabledanchor')
                    .prop('href', mw.util.getUrl(page + (this.getSection(true) || '')));
            }
            else {
                this.$pageLink
                    .addClass('anr-disabledanchor')
                    .prop('href', '');
            }
            return this;
        };
        /**
         * Get the selected section.
         * @param addHash Add '#' to the beginning when there's a value to return. (Default: `false`)
         * @returns
         */
        Reporter.prototype.getSection = function (addHash) {
            if (addHash === void 0) { addHash = false; }
            var ret = null;
            switch (this.getPage()) {
                case ANI:
                    ret = this.$section.val() || null;
                    break;
                case ANS:
                    ret = this.$sectionAns.val() || null;
                    break;
                case AN3RR:
                    ret = '3RR';
                    break;
                default: // Section not selected
            }
            return ret && (addHash ? '#' : '') + ret;
        };
        /**
         * Switch the section dropdown options in accordance with the selection in the page dropdown.
         * This method calls {@link setPageLink} when done.
         * @returns
         */
        Reporter.prototype.switchSectionDropdown = function () {
            var page = this.getPage();
            if (page) {
                switch (page) {
                    case ANI:
                        this.$section.prop('disabled', false).empty();
                        addOptions(this.$section, [
                            { text: '選択してください', value: '', disabled: true, selected: true, hidden: true },
                            { text: Reporter.getCurrentAniSection() },
                            { text: '不適切な利用者名' },
                            { text: '公開アカウント' },
                            { text: '公開プロキシ・ゾンビマシン・ボット・不特定多数' },
                            { text: '犯罪行為またはその疑いのある投稿' }
                        ]);
                        Reporter.toggle(this.$sectionWrapper, true);
                        Reporter.toggle(this.$sectionAnsWrapper, false);
                        this.setPageLink();
                        break;
                    case ANS:
                        this.$sectionAns.val('').trigger('change'); // For select2. This triggers `setPageLink`.
                        Reporter.toggle(this.$sectionWrapper, false);
                        Reporter.toggle(this.$sectionAnsWrapper, true);
                        break;
                    case AN3RR:
                        this.$section.prop({
                            disabled: false,
                            innerHTML: '<option>3RR</option>'
                        });
                        Reporter.toggle(this.$sectionWrapper, true);
                        Reporter.toggle(this.$sectionAnsWrapper, false);
                        this.setPageLink();
                }
            }
            else {
                this.$section.prop({
                    disabled: true,
                    innerHTML: '<option disabled selected hidden value="">選択してください</option>'
                });
                Reporter.toggle(this.$sectionWrapper, true);
                Reporter.toggle(this.$sectionAnsWrapper, false);
                this.setPageLink();
            }
            return this;
        };
        /**
         * Evaluate a username, classify it into a type, and check the block status of the relevant user.
         * @param username Automatically formatted by {@link User.formatName}.
         * @returns
         */
        Reporter.getBlockStatus = function (username) {
            username = User.formatName(username);
            var isIp = mw.util.isIPAddress(username, true);
            var bkpara = {};
            if (!username || !isIp && User.containsInvalidCharacter(username)) { // Blank or invalid
                return $.Deferred().resolve({
                    usertype: 'other',
                    blocked: null
                });
            }
            else if (Reporter.blockStatus[username]) {
                return $.Deferred().resolve(__assign({}, Reporter.blockStatus[username]));
            }
            else if (isIp) {
                bkpara.bkip = username;
            }
            else {
                bkpara.bkusers = username;
            }
            var params = Object.assign({
                action: 'query',
                list: 'users|blocks',
                ususers: username,
                formatversion: '2'
            }, bkpara);
            return new mw.Api().get(params)
                .then(function (res) {
                var resUs = res && res.query && res.query.users;
                var resBl = res && res.query && res.query.blocks;
                if (resUs && resBl) {
                    var ret = {
                        usertype: isIp ? 'ip' : resUs[0].userid !== void 0 ? 'user' : 'other',
                        blocked: !!resBl.length
                    };
                    Reporter.blockStatus[username] = __assign({}, ret);
                    return ret;
                }
                else {
                    throw new Error('APIリクエストにおける不明なエラー');
                }
            })
                .catch(function (_, err) {
                console.error(err);
                mw.notify('ユーザー情報の取得に失敗しました。', { type: 'error' });
                return {
                    usertype: 'other',
                    blocked: null
                };
            });
        };
        Reporter.prototype.report = function () {
            var _this = this;
            // Collect dialog data and check for errors
            var data = this.collectData();
            if (!data)
                return;
            // Create progress dialog
            this.$progress.empty();
            this.$dialog.dialog({ buttons: [] });
            var $dupUsers = Reporter.createRow();
            var $dupUsersLabel = Reporter.createRowLabel($dupUsers, lib.getIcon('load'));
            var $dupUsersText = $('<div>').text('利用者名重複').css('width', '100%');
            $dupUsers.append($dupUsersText);
            this.$progress.append($dupUsers);
            var $dupUsersList = Reporter.createRow();
            var $dupUsersListLabel = Reporter.createRowLabel($dupUsersList, '');
            var $dupUsersListUl = $('<ul>').css('width', '100%');
            $dupUsersList.append($dupUsersListUl);
            this.$progress.append($dupUsersList);
            Reporter.toggle($dupUsersList, false); //$dupUsersListUl
            var $blockedUsers = Reporter.createRow();
            var $blockedLabel = Reporter.createRowLabel($blockedUsers, '待機中');
            var $blockedText = $('<div>').text('既存ブロック').css('width', '100%');
            $blockedUsers.append($blockedText);
            this.$progress.append($blockedUsers);
            var $blockedList = Reporter.createRow();
            var $blockedListLabel = Reporter.createRowLabel($blockedList, '');
            var $blockedListBody = $('<ul>').css('width', '100%');
            $blockedList.append($blockedListBody);
            this.$progress.append($blockedList);
            Reporter.toggle($blockedList, false);
            var $dupReports = Reporter.createRow();
            var $dupReportsLabel = Reporter.createRowLabel($dupReports, '待機中');
            var $dupReportsText = $('<div>').text('重複報告').css('width', '100%');
            $dupReports.append($dupReportsText);
            this.$progress.append($dupReports);
            var $dupReportsList = Reporter.createRow();
            var $dupReportsListLabel = Reporter.createRowLabel($dupReportsList, '');
            var $dupReportsListBody = $('<ul>').css('width', '100%');
            $dupReportsList.append($dupReportsListBody);
            this.$progress.append($dupReportsList);
            Reporter.toggle($dupReportsList, false);
            var $report = Reporter.createRow();
            var $reportLabel = Reporter.createRowLabel($report, 'スキップ'); // Label text is temporary
            var $reportText = $('<div>').text('報告').css('width', '100%');
            $report.append($reportText);
            this.$progress.append($report);
            Reporter.toggle(this.$content, false);
            Reporter.toggle(this.$progress, true);
            Reporter.setWidestWidth(this.$progress.find('.anr-option-label'));
            $reportLabel.text('待機中'); // Replace the temporary label text
            this.processIds(data).then(function (_a) {
                var users = _a.users, info = _a.info;
                var proceed = function () {
                    var def = $.Deferred();
                    if (!users.length) {
                        $dupUsersLabel.empty().append(lib.getIcon('check'));
                        def.resolve(true);
                    }
                    else {
                        $dupUsersLabel.empty().append(getExcl());
                        users.forEach(function (arr) {
                            var $li = $('<li>').text(arr.join(', '));
                            $dupUsersListUl.append($li);
                        });
                        Reporter.toggle($dupUsersList, true);
                        _this.$dialog.dialog({
                            buttons: [
                                {
                                    text: '続行',
                                    click: function () {
                                        $dupUsersListUl.empty();
                                        Reporter.toggle($dupUsersList, false);
                                        _this.$dialog.dialog({ buttons: [] });
                                        def.resolve(true);
                                    }
                                },
                                {
                                    text: '戻る',
                                    click: function () {
                                        $dupUsersListUl.empty();
                                        Reporter.toggle($dupUsersList, false);
                                        Reporter.toggle(_this.$progress, false);
                                        Reporter.toggle(_this.$content, true);
                                        _this.setMainButtons();
                                        def.resolve(false);
                                    }
                                },
                                {
                                    text: '閉じる',
                                    click: function () {
                                        _this.close();
                                        def.resolve(false);
                                    }
                                }
                            ]
                        });
                    }
                    return def.promise();
                };
                proceed().then(function (bool) {
                    if (!bool)
                        return;
                });
            });
        };
        Reporter.prototype.preview = function () {
            var data = this.collectData();
            if (!data)
                return;
            var $preview = $('<div>')
                .prop('title', ANR + ' - Preview')
                .css({
                'max-height': '80vh',
                'max-width': '80vw'
            })
                .dialog({
                dialogClass: 'anr-dialog anr-dialog-preview',
                height: 'auto',
                width: 'auto',
                modal: true,
                close: function () {
                    // Destory the dialog and its contents when closed by any means
                    $(this).empty().dialog('destroy');
                }
            });
            var $previewContent = $('<div>')
                .prop('id', 'anr-dialog-preview-content')
                .text('読み込み中')
                .append($(lib.getIcon('load')).css('margin-left', '0.5em'));
            $preview.append($previewContent);
        };
        /**
         * Collect option values.
         * @returns `null` if there's some error.
         */
        Reporter.prototype.collectData = function () {
            //  -- Check first for required fields --
            var page = this.getPage();
            var section = this.getSection();
            var shiftClick = $.Event('click');
            shiftClick.shiftKey = true;
            var hasInvalidId = false;
            var users = this.Users.reduceRight(function (acc, User) {
                var inputVal = User.getName();
                var selectedType = User.getType();
                if (!inputVal) { // Username is blank
                    User.$label.trigger(shiftClick); // Remove the user pane
                }
                else if (['logid', 'diff'].includes(selectedType) && !/^\d+$/.test(inputVal)) { // Invalid ID
                    hasInvalidId = true;
                }
                else { // Valid
                    acc.push({
                        user: inputVal,
                        type: selectedType
                    });
                }
                return acc;
            }, []).reverse();
            var reason = this.$reason.val();
            reason = lib.clean(reason.replace(/[\s-~]*$/, '')); // Remove signature (if any)
            this.$reason.val(reason);
            // Look for errors
            var $errList = $('<ul>');
            if (!page) {
                $errList.append($('<li>報告先のページ名が未指定</li>'));
            }
            if (!section) {
                $errList.append($('<li>報告先のセクション名が未指定</li>'));
            }
            if (!users.length) {
                $errList.append($('<li>報告対象者が未指定</li>'));
            }
            if (hasInvalidId) {
                $errList.append($('<li>数字ではないID</li>'));
            }
            if (!reason) {
                $errList.append($('<li>報告理由が未指定</li>'));
            }
            var errLen = $errList.children('li').length;
            if (errLen) {
                var $err = $('<div>')
                    .text('以下のエラーを修正してください。')
                    .append($errList);
                mw.notify($err, { type: 'error', autoHideSeconds: errLen > 2 ? 'long' : 'short' });
                return null;
            }
            //  -- Collect secondary data --
            reason += '--~~~~'; // Add signature to reason
            var summary = lib.clean(this.$comment.val()); // This is incomplete
            var blockCheck = this.$checkBlock.prop('checked');
            var duplicateCheck = this.$checkDuplicates.prop('checked');
            var watchUser = this.$watchUser.prop('checked');
            var watch = watchUser ? this.$watchExpiry.val() : null;
            // Return
            return {
                page: page,
                section: section,
                users: users,
                reason: reason,
                summary: summary,
                blockCheck: blockCheck,
                duplicateCheck: duplicateCheck,
                watch: watch
            };
        };
        /**
         * Convert all IDs to usernames and check whether the username fields have any duplicate values.
         * @param data
         * @returns
         */
        Reporter.prototype.processIds = function (data) {
            var deferreds = data.users.map(function (obj) {
                if (obj.type === 'logid' || obj.type === 'diff') {
                    return idList.getUsername(parseInt(obj.user), obj.type === 'diff' ? 'diffid' : 'logid'); // Convert ID
                }
                else if (obj.type === 'none') {
                    return $.Deferred().resolve(null); // Immediate resolve
                }
                else {
                    return $.Deferred().resolve(obj.user); // Immediate resolve
                }
            }, []);
            return $.when.apply($, deferreds).then(function () {
                var info = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    info[_i] = arguments[_i];
                }
                /**
                 * An array of indexes that have already been checked.
                 *
                 * Suppose that the `data` array is as below:
                 * ```js
                 * [
                 * 	{user: 'Foo', type: 'UNL'},
                 * 	{user: '10000', type: 'logid'}, // Logid/10000 = Foo
                 * 	{user: 'Bar', type: 'UNL'},
                 * 	{user: '20000', type: 'diff'} // Diff/20000 = Foo
                 * ]
                 * ```
                 * where the comments on the right represent the return values of the deferreds. Then, when
                 * we check `data[0]` and look for its duplicates in `data[1-3]`, `1` and `3` should be pushed
                 * into the `skip` array so that when we check `data[1]`, we can skip it. Otherwise, the
                 * resulting array will be:
                 * ```
                 * [
                 * 	['Foo', 'Logid/10000', 'Diff/20000'],
                 * 	['Logid/10000', 'Diff/20000']
                 * ]
                 * ```
                 * while we only want:
                 * ```
                 * [
                 * 	['Foo', 'Logid/10000', 'Diff/20000']
                 * ]
                 * ```
                 */
                var skip = [];
                var users = info.reduce(function (acc, username, i, arr) {
                    if (username && !skip.includes(i)) { // username isn't null and not to be skipped
                        var ret = [];
                        for (var j = i; j < arr.length; j++) { // Check array elements from the current index
                            if (j === i && arr.lastIndexOf(username) !== j ||
                                j !== i && arr[j] === username) { // Found a duplicate username
                                skip.push(j);
                                var inputVal = data.users[j].user;
                                var toPush = void 0;
                                switch (data.users[j].type) { // Convert the username back to an ID if necessary
                                    case 'logid':
                                        toPush = "Logid/".concat(inputVal);
                                        break;
                                    case 'diff':
                                        toPush = "\u5DEE\u5206/".concat(inputVal);
                                        break;
                                    default:
                                        toPush = inputVal;
                                }
                                if (!ret.includes(toPush)) {
                                    ret.push(toPush);
                                }
                            }
                        }
                        if (ret.length) {
                            acc.push(ret);
                        }
                    }
                    return acc;
                }, []);
                return { users: users, info: info };
            });
        };
        /** Storage of the return value of {@link getBlockStatus}. */
        Reporter.blockStatus = {};
        return Reporter;
    }());
    var userPaneCnt = 0;
    /**
     * The User class. An instance of this handles a User field row on the Reporter dialog.
     */
    var User = /** @class */ (function () {
        /**
         * Create a user pane of the Reporter dialog with the following structure.
         * ```html
         * <div class="anr-option-row anr-option-userpane-wrapper">
         * 	<div class="anr-option-label">利用者</div> <!-- float: left; -->
         * 	<div class="anr-option-usertype"> <!-- float: right; -->
         * 		<select>...</select>
         * 	</div>
         * 	<div class="anr-option-wrapper"> <!-- overflow: hidden; -->
         * 		<input class="anr-option-username anr-juxtaposed"> <!-- width: 100%; -->
         * 	</div>
         * 	<!-- row boundary -->
         * 	<div class="anr-option-row-inner anr-option-hideuser-wrapper">
         * 		<div class="anr-option-label">&nbsp;</div> <!-- float: left; -->
         * 		<div class="anr-option-hideuser">
         * 			<label>
         * 				<input class="anr-checkbox">
         * 				<span class="anr-checkbox-label">利用者名を隠す</span>
         * 			</label>
         * 		</div>
         * 	</div>
         * 	<div class="anr-option-row-inner anr-option-idlink-wrapper">
         * 		<div class="anr-option-label">&nbsp;</div>
         * 		<div class="anr-option-idlink">
         * 			<a></a>
         * 		</div>
         * 	</div>
         * 	<div class="anr-option-row-inner anr-option-blockstatus-wrapper">
         * 		<div class="anr-option-label">&nbsp;</div>
         * 		<div class="anr-option-blockstatus">
         * 			<a>ブロックあり</a>
         * 		</div>
         * 	</div>
         * </div>
         * <!-- ADD BUTTON HERE -->
         * ```
         * @param $next The element before which to create a user pane.
         * @param options
         */
        function User($next, options) {
            var _this = this;
            options = Object.assign({ removable: true }, options || {});
            // Create user pane row
            this.$wrapper = Reporter.createRow();
            this.$wrapper.addClass('anr-option-userpane-wrapper');
            this.$overlay = $('<div>');
            this.$overlay.addClass('anr-option-userpane-overlay');
            Reporter.toggle(this.$overlay, false);
            this.$wrapper.append(this.$overlay);
            // Append a label div
            this.id = 'anr-dialog-userpane-' + (userPaneCnt++);
            this.$label = Reporter.createRowLabel(this.$wrapper, '利用者').prop('id', this.id);
            if (options.removable) {
                this.$wrapper.addClass('anr-option-removable');
                this.$label
                    .prop('title', 'SHIFTクリックで除去')
                    .off('click').on('click', function (e) {
                    if (e.shiftKey) { // Remove the user pane when the label is shift-clicked
                        _this.$wrapper.remove();
                        if (options && options.removeCallback) {
                            options.removeCallback(_this);
                        }
                    }
                });
            }
            // Append a type dropdown
            var $typeWrapper = $('<div>').addClass('anr-option-usertype');
            this.$type = addOptions($('<select>'), ['UNL', 'User2', 'IP2', 'logid', 'diff', 'none'].map(function (el) { return ({ text: el }); }));
            this.$type // Initialize
                .prop('disabled', true) // Disable
                .off('change').on('change', function () {
                _this.processTypeChange();
            })
                .children('option').eq(5).prop('selected', true); // Select 'none'
            $typeWrapper.append(this.$type);
            this.$wrapper.append($typeWrapper);
            // Append a username input
            this.$input = $('<input>');
            var inputTimeout;
            this.$input
                .addClass('anr-option-username') // Currently not used for anything
                .prop({
                type: 'text',
                placeholder: '入力してください'
            })
                .off('input').on('input', function () {
                clearTimeout(inputTimeout);
                inputTimeout = setTimeout(function () {
                    _this.processInputChange();
                }, 350);
            });
            var $userWrapper = Reporter.wrapElement(this.$wrapper, this.$input);
            $next.before(this.$wrapper);
            Reporter.verticalAlign(this.$label, $userWrapper);
            // Append a hide-user checkbox
            this.$hideUserWrapper = Reporter.createRow();
            this.$hideUserWrapper.removeAttr('class').addClass('anr-option-row-inner anr-option-hideuser-wrapper');
            Reporter.createRowLabel(this.$hideUserWrapper, '');
            var hideUserElements = createLabelledCheckbox('利用者名を隠す', { alterClasses: ['anr-option-hideuser'] });
            this.$hideUser = hideUserElements.$checkbox;
            this.$hideUser.off('change').on('change', function () {
                _this.processHideUserChange();
            });
            this.$hideUserLabel = hideUserElements.$label;
            this.$hideUserWrapper.append(hideUserElements.$wrapper);
            this.$wrapper.append(this.$hideUserWrapper);
            Reporter.toggle(this.$hideUserWrapper, false);
            // Append an ID link
            this.$idLinkWrapper = Reporter.createRow();
            this.$idLinkWrapper.removeAttr('class').addClass('anr-option-row-inner anr-option-idlink-wrapper');
            Reporter.createRowLabel(this.$idLinkWrapper, '');
            this.$idLink = $('<a>');
            this.$idLink.prop('target', '_blank');
            this.$idLinkWrapper
                .append($('<div>').addClass('anr-option-idlink').append(this.$idLink));
            this.$wrapper.append(this.$idLinkWrapper);
            Reporter.toggle(this.$idLinkWrapper, false);
            // Append a block status link
            this.$blockStatusWrapper = Reporter.createRow();
            this.$blockStatusWrapper.removeAttr('class').addClass('anr-option-row-inner anr-option-blockstatus-wrapper');
            Reporter.createRowLabel(this.$blockStatusWrapper, '');
            this.$blockStatus = $('<a>');
            this.$blockStatus.prop('target', '_blank').text('ブロックあり');
            this.$blockStatusWrapper
                .append($('<div>').addClass('anr-option-blockstatus').append(this.$blockStatus));
            this.$wrapper.append(this.$blockStatusWrapper);
            Reporter.toggle(this.$blockStatusWrapper, false);
            if (options.addCallback) {
                options.addCallback(this);
            }
        }
        /**
         * Format a username by calling `lib.clean`, replacing underscores with spaces, and capitalizing the first letter.
         * @param username
         * @returns The formatted username.
         */
        User.formatName = function (username) {
            return mwString.ucFirst(lib.clean(username.replace(/_/g, ' ')));
        };
        /**
         * Get the username in the textbox (underscores are replaced by spaces).
         * @returns
         */
        User.prototype.getName = function () {
            return User.formatName(this.$input.val()) || null;
        };
        /**
         * Set a value into the username input. Note that this method does not call {@link processInputChange}.
         * @param val
         * @returns
         */
        User.prototype.setName = function (val) {
            this.$input.val(val);
            return this;
        };
        /**
         * Get the UserAN type selected in the dropdown.
         * @returns
         */
        User.prototype.getType = function () {
            return this.$type.val();
        };
        /**
         * Select a type in the UserAN type dropdown. Note that this method does not call {@link processTypeChange}.
         * @param type
         * @returns
         */
        User.prototype.setType = function (type) {
            this.$type.val(type);
            return this;
        };
        /**
         * Change the hidden state of the options in the type dropdown.
         * @param types An array of type options to make visible. The element at index 0 will be selected.
         */
        User.prototype.setTypeOptions = function (types) {
            this.$type.children('option').each(function (_, opt) {
                // Set up the UserAN type dropdown
                var idx = types.indexOf(opt.value);
                opt.hidden = idx === -1; // Show/hide options
                if (idx === 0) {
                    opt.selected = true; // Select types[0]
                }
            });
            return this;
        };
        /**
         * Update the visibility of auxiliary wrappers when the selection is changed in the type dropdown.
         */
        User.prototype.processTypeChange = function () {
            var selectedType = this.processAuxiliaryElements().getType();
            this.$type.toggleClass('anr-option-usertype-none', false);
            switch (selectedType) {
                case 'UNL':
                case 'User2':
                    Reporter.toggle(this.$hideUserWrapper, true);
                    Reporter.toggle(this.$idLinkWrapper, false);
                    Reporter.toggle(this.$blockStatusWrapper, !!this.$blockStatus.text());
                    break;
                case 'IP2':
                    Reporter.toggle(this.$hideUserWrapper, false);
                    Reporter.toggle(this.$idLinkWrapper, false);
                    Reporter.toggle(this.$blockStatusWrapper, !!this.$blockStatus.text());
                    break;
                case 'logid':
                case 'diff':
                    Reporter.toggle(this.$hideUserWrapper, true);
                    Reporter.toggle(this.$idLinkWrapper, true);
                    Reporter.toggle(this.$blockStatusWrapper, !!this.$blockStatus.text());
                    break;
                default: // 'none'
                    Reporter.toggle(this.$hideUserWrapper, false);
                    Reporter.toggle(this.$idLinkWrapper, false);
                    Reporter.toggle(this.$blockStatusWrapper, false);
                    this.$type.toggleClass('anr-option-usertype-none', !this.$type.prop('disabled'));
            }
            return this;
        };
        /**
         * Update the properties of auxiliary elements in the user pane.
         * - Toggle the application of a red border on the username input.
         * - Toggle the checked and disabled states of the hideuser checkbox.
         * - Change the display text, the href, and the disabled state of the event ID link.
         * - Set up the display text and the href of the block status link (by {@link processBlockStatus}).
         * @returns
         */
        User.prototype.processAuxiliaryElements = function () {
            var selectedType = this.getType();
            var inputVal = this.getName() || '';
            var clss = 'anr-option-invalidid';
            if (['logid', 'diff'].includes(selectedType)) {
                // Set up $input, $hideUser, and $idLink
                var isNotNumber = !/^\d*$/.test(inputVal);
                this.$input.toggleClass(clss, isNotNumber);
                this.$hideUser.prop({
                    disabled: isNotNumber,
                    checked: true
                });
                var idTitle = (selectedType === 'logid' ? '特別:転送/logid/' : '特別:差分/') + inputVal;
                this.$idLink
                    .text(idTitle)
                    .prop('href', mw.util.getUrl(idTitle))
                    .toggleClass('anr-disabledanchor', isNotNumber);
                // Set up $blockStatus
                if (!isNotNumber) {
                    var idType = selectedType === 'diff' ? 'diffid' : selectedType;
                    var username = idList.getRegisteredUsername(parseInt(inputVal), idType);
                    if (username) {
                        this.processBlockStatus(username);
                    }
                    else {
                        this.$blockStatus.text('');
                    }
                }
            }
            else {
                this.$input.toggleClass(clss, false);
                this.$hideUser.prop({
                    disabled: false,
                    checked: false
                });
                this.$idLink.toggleClass('anr-disabledanchor', false);
                this.processBlockStatus(inputVal);
            }
            return this;
        };
        /**
         * Set up the display text and the href of the block status link
         * @param username
         */
        User.prototype.processBlockStatus = function (username) {
            username = User.formatName(username);
            var status = Reporter.blockStatus[username];
            if (status) {
                if (status.usertype === 'user' || status.usertype === 'ip') {
                    this.$blockStatus.prop('href', mw.util.getUrl('特別:投稿記録/' + username));
                    switch (status.blocked) {
                        case true:
                            this.$blockStatus.text('ブロックあり');
                            break;
                        case false:
                            this.$blockStatus.text('');
                            break;
                        default: // null
                            this.$blockStatus.text('ブロック状態不明');
                    }
                }
                else { // other
                    this.$blockStatus.text('');
                }
            }
            else { // Block status yet to be fetched
                this.$blockStatus.text('');
            }
            return this;
        };
        /**
         * Evaluate the input value, figure out its user type (and block status if relevant), and change selection
         * in the type dropdown (which proceeds to {@link processTypeChange}).
         */
        User.prototype.processInputChange = function () {
            var _this = this;
            var def = $.Deferred();
            var typeMap = {
                ip: ['IP2', 'none'],
                user: ['UNL', 'User2', 'none'],
                other: ['none', 'logid', 'diff']
            };
            var username = this.getName();
            if (!username) { // Blank
                this.setType('none').$type.prop('disabled', true); // Disable dropdown and select 'none'
                this.processTypeChange();
                def.resolve(this);
            }
            else { // Some username is in the input
                Reporter.getBlockStatus(username).then(function (obj) {
                    if (/^\d+$/.test(username) && obj.usertype === 'user') {
                        typeMap.user.push('logid', 'diff');
                    }
                    _this.setTypeOptions(typeMap[obj.usertype]).$type.prop('disabled', false);
                    _this.processTypeChange();
                    def.resolve(_this);
                });
            }
            return def.promise();
        };
        /**
         * Process the change event of the hideuser checkbox and do a username-ID conversion.
         */
        User.prototype.processHideUserChange = function () {
            var _this = this;
            // Show a spinner aside the hideuser checkbox label
            var $processing = $(lib.getIcon('load')).css('margin-left', '0.5em');
            this.$hideUserLabel.append($processing);
            this.setOverlay(true);
            /*!*
             * Error handlers. If the catch block is ever reached, there should be some problem with either processInputChange
             * or processTypeChange because the hideuser checkbox should be unclickable when the variables would be substituted
             * by an unexpected value.
             */
            var inputVal = this.getName();
            var selectedType = this.getType();
            var checked = this.$hideUser.prop('checked');
            try {
                if (typeof inputVal !== 'string') {
                    // The username input should never be empty
                    throw new TypeError('User.getName returned null.');
                }
                else if (!checked && !['logid', 'diff'].includes(selectedType)) {
                    // The type dropdown should have either value when the box can be unchecked
                    throw new Error('User.getType returned neither "logid" nor "diff".');
                }
                else if (!checked && !/^\d+$/.test(inputVal)) {
                    // The username input should only be of numbers when the box can be unchecked
                    throw new Error('User.getName returned a non-number.');
                }
            }
            catch (err) {
                console.error(err);
                mw.notify('変換試行時にエラーが発生しました。スクリプトのバグの可能性があります。', { type: 'error' });
                this.$hideUser.prop('checked', !checked);
                $processing.remove();
                this.setOverlay(false);
                return $.Deferred().resolve(this);
            }
            if (checked) { // username to ID
                return idList.getIds(inputVal).then(function (_a) {
                    var logid = _a.logid, diffid = _a.diffid;
                    if (typeof logid === 'number') {
                        _this.setName(logid.toString()).setTypeOptions(['logid', 'diff', 'none']).processTypeChange();
                        mw.notify("\u5229\u7528\u8005\u540D\u300C".concat(inputVal, "\u300D\u3092\u30ED\u30B0ID\u306B\u5909\u63DB\u3057\u307E\u3057\u305F\u3002"), { type: 'success' });
                    }
                    else if (typeof diffid === 'number') {
                        _this.setName(diffid.toString()).setTypeOptions(['diff', 'logid', 'none']).processTypeChange();
                        mw.notify("\u5229\u7528\u8005\u540D\u300C".concat(inputVal, "\u300D\u3092\u5DEE\u5206ID\u306B\u5909\u63DB\u3057\u307E\u3057\u305F\u3002"), { type: 'success' });
                    }
                    else {
                        _this.$hideUser.prop('checked', !checked);
                        mw.notify("\u5229\u7528\u8005\u540D\u300C".concat(inputVal, "\u300D\u3092ID\u306B\u5909\u63DB\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002"), { type: 'warn' });
                    }
                    $processing.remove();
                    return _this.setOverlay(false);
                });
            }
            else { // ID to username
                var idType = selectedType === 'diff' ? 'diffid' : selectedType;
                var idTypeJa_1 = selectedType === 'logid' ? 'ログ' : '差分';
                return idList.getUsername(parseInt(inputVal), idType).then(function (username) {
                    if (username) {
                        return _this.setName(username).processInputChange().then(function () {
                            mw.notify("".concat(idTypeJa_1, "ID\u300C").concat(inputVal, "\u300D\u3092\u5229\u7528\u8005\u540D\u306B\u5909\u63DB\u3057\u307E\u3057\u305F\u3002"), { type: 'success' });
                            $processing.remove();
                            return _this.setOverlay(false);
                        });
                    }
                    else {
                        _this.$hideUser.prop('checked', !checked);
                        mw.notify("".concat(idTypeJa_1, "ID\u300C").concat(inputVal, "\u300D\u3092\u5229\u7528\u8005\u540D\u306B\u5909\u63DB\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002"), { type: 'warn' });
                        $processing.remove();
                        return _this.setOverlay(false);
                    }
                });
            }
        };
        /**
         * Toggle the visibility of the overlay.
         * @param show
         * @returns
         */
        User.prototype.setOverlay = function (show) {
            Reporter.toggle(this.$overlay, show);
            return this;
        };
        /**
         * Check the validity of a username (by checking the inclusion of `/[@/#<>[\]|{}:]/`).
         *
         * Note that IP(v6) addresses should not be passed.
         * @param username
         * @returns
         */
        User.containsInvalidCharacter = function (username) {
            return /[@/#<>[\]|{}:]/.test(username);
        };
        return User;
    }());
    /**
     * Add \<option>s to a dropdown by referring to object data.
     * @param $dropdown
     * @param data `text` is obligatory, and the other properties are optional.
     * @returns The passed dropdown.
     */
    function addOptions($dropdown, data) {
        data.forEach(function (_a) {
            var text = _a.text, value = _a.value, disabled = _a.disabled, selected = _a.selected, hidden = _a.hidden;
            var option = document.createElement('option');
            option.textContent = text;
            if (value !== undefined) {
                option.value = value;
            }
            option.disabled = !!disabled;
            option.selected = !!selected;
            option.hidden = !!hidden;
            $dropdown[0].add(option);
        });
        return $dropdown;
    }
    var checkboxCnt = 0;
    /**
     * Create a labelled checkbox.
     * ```html
     * <div class="anr-option-row">
     * 	<label>
     * 		<input class="anr-checkbox">
     * 		<span class="anr-checkbox-label">labelText</span>
     * 	</label>
     * </div>
     * ```
     * @param labelText The label text.
     * @param options
     * @returns
     */
    function createLabelledCheckbox(labelText, options) {
        if (options === void 0) { options = {}; }
        var id = options.checkboxId && !document.getElementById(options.checkboxId) ? options.checkboxId : 'anr-checkbox-' + (checkboxCnt++);
        var $outerLabel = $('<label>');
        $outerLabel.attr('for', id);
        var $wrapper = Reporter.createRow();
        $wrapper.removeAttr('class').addClass((options.alterClasses || ['anr-option-row']).join(' ')).append($outerLabel);
        var $checkbox = $('<input>');
        $checkbox
            .prop({
            id: id,
            type: 'checkbox'
        })
            .addClass('anr-checkbox');
        var $label = $('<span>');
        $label.addClass('anr-checkbox-label').text(labelText);
        $outerLabel.append($checkbox, $label);
        return { $wrapper: $wrapper, $checkbox: $checkbox, $label: $label };
    }
    /**
     * Extract a CIDR address from text.
     *
     * Regular expressions used in this method are adapted from `mediawiki.util`.
     * - {@link https://doc.wikimedia.org/mediawiki-core/master/js/source/util.html#mw-util-method-isIPv4Address | mw.util.isIPv4Address}
     * - {@link https://doc.wikimedia.org/mediawiki-core/master/js/source/util.html#mw-util-method-isIPv6Address | mw.util.isIPv6Address}
     *
     * @param text
     * @returns The extracted CIDR, or `null` if there's no match.
     */
    function extractCidr(text) {
        var v4_byte = '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|0?[0-9]?[0-9])';
        var v4_regex = new RegExp('(?:' + v4_byte + '\\.){3}' + v4_byte + '\\/(?:3[0-2]|[12]?\\d)');
        var v6_block = '\\/(?:12[0-8]|1[01][0-9]|[1-9]?\\d)';
        var v6_regex = new RegExp('(?::(?::|(?::[0-9A-Fa-f]{1,4}){1,7})|[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){0,6}::|[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){7})' +
            v6_block);
        var v6_regex2 = new RegExp('[0-9A-Fa-f]{1,4}(?:::?[0-9A-Fa-f]{1,4}){1,6}' + v6_block);
        var m;
        if ((m = text.match(v4_regex)) ||
            (m = text.match(v6_regex)) ||
            (m = text.match(v6_regex2)) && /::/.test(m[0]) && !/::.*::/.test(m[0])) {
            return m[0];
        }
        else {
            return null;
        }
    }
    function getExcl() {
        var img = document.createElement('img');
        img.src = 'https://upload.wikimedia.org/wikipedia/commons/c/c3/Crystal_important.png';
        img.style.cssText = 'vertical-align: middle; height: 1em; border: 0;';
        return img;
    }
    // ******************************************************************************************
    // Entry point
    init();
    // ******************************************************************************************
})();
//</nowiki>
