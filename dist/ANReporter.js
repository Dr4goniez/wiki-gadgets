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
    // ******************************************************************************************
    // Main functions
    /** Initialize the script. */
    function init() {
        // Is the user autoconfirmed?
        if (mw.config.get('wgUserGroups').indexOf('autoconfirmed') === -1) {
            mw.notify('あなたは自動承認されていません。AN Reporterを終了します。', { type: 'warn' });
            return;
        }
        /** Whether the user is on the config page. */
        var onConfig = mw.config.get('wgNamespaceNumber') === -1 && /^(ANReporterConfig|ANRC)$/i.test(mw.config.get('wgTitle'));
        var libName = 'ext.gadget.WpLibExtra';
        mw.loader.using(libName).then(function (require) {
            // Validate the library
            lib = require(libName);
            if (typeof (lib && lib.version) !== 'string') {
                console.error("".concat(ANR, ": \u30E9\u30A4\u30D6\u30E9\u30EA\u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002"));
                return;
            }
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
                var modules = [
                    'mediawiki.user',
                    'mediawiki.util',
                    'mediawiki.api',
                    'mediawiki.Title',
                    'jquery.ui',
                ];
                $.when(mw.loader.using(modules), mw.loader.getScript('https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.13/js/select2.full.js'), $.ready).then(function () {
                    var portlet = createPortletLink();
                    if (!portlet) {
                        console.error("".concat(ANR, ": \u30DD\u30FC\u30C8\u30EC\u30C3\u30C8\u30EA\u30F3\u30AF\u306E\u4F5C\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002"));
                        return;
                    }
                    createStyleTag(Config.merge());
                    $('head').append('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.13/css/select2.css">');
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
                '#anr-dialog-progress {' + // One of the main dialog field
                'padding: 1em;' +
                '}' +
                '#anr-dialog-optionfield {' + // The immediate child of #anr-dialog-content
                'padding: 1em;' +
                'margin: 0;' +
                'border: 1px solid gray;' +
                '}' +
                '#anr-dialog-optionfield > legend {' +
                'font-weight: bold;' +
                'padding-bottom: 0;' +
                '}' +
                '#anr-dialog-optionfield hr {' +
                'margin: 0.8em 0;' +
                'background-color: gray;' +
                '}' +
                '.anr-option-row:not(:last-child) {' + // Margin below every option row
                'margin-bottom: 0.15em;' +
                '}' +
                '.anr-option-hideuser-wrapper:not(.anr-hidden) + .anr-option-blockstatus-wrapper {' +
                'margin-top: -0.15em;' + // Nullify the bottom margin
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
                '.anr-option-usertype-none {' +
                'border: 2px solid red;' +
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
            // Create dialog contour
            this.$dialog = $('<div>');
            this.$dialog.attr('title', ANR).css('max-height', '70vh');
            this.$dialog.dialog({
                dialogClass: 'anr-dialog',
                resizable: false,
                height: 'auto',
                width: 'auto',
                modal: true,
                close: function () {
                    _this.destroy();
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
            var $pageLabel = Reporter.createLeftLabel($pageWrapper, '報告先');
            this.$page = $('<select>');
            this.$page
                .addClass('anr-juxtaposed') // Important for the dropdown to fill the remaining 
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
            Reporter.createLeftLabel($pageLinkWrapper, '');
            this.$pageLink = $('<a>');
            this.$pageLink
                .addClass('anr-disabledanchor') // Disable the anchor by default
                .text('報告先を確認')
                .prop('target', '_blank');
            $pageLinkWrapper.append(this.$pageLink);
            this.$fieldset.append($pageLinkWrapper);
            // Create section option for ANI and AN3RR
            this.$sectionWrapper = Reporter.createRow();
            var $sectionLabel = Reporter.createLeftLabel(this.$sectionWrapper, '節');
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
            var $sectionAnsLabel = Reporter.createLeftLabel(this.$sectionAnsWrapper, '節');
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
            var $newUserWrapper = Reporter.createRow();
            this.$newUser = $('<input>');
            this.$newUser.prop('type', 'button').val('追加');
            $newUserWrapper.append(this.$newUser);
            this.$fieldset.append($newUserWrapper);
            this.$fieldset.append(document.createElement('hr'));
            // Create a user pane 
            this.Users = new UserCollection($newUserWrapper);
            this.Users.add();
            this.$newUser.off('click').on('click', function () {
                var U = _this.Users.add(); // Add a new user pane when the 'add' button is clicked
                // Add event handler to remove the pane when the label is SHIFT-clicked
                U.$wrapper.addClass('anr-option-removable');
                // eslint-disable-next-line @typescript-eslint/no-this-alias
                var self = _this;
                U.$label
                    .off('click').on('click', function (e) {
                    if (e.shiftKey) {
                        self.Users.remove(this.id);
                    }
                })
                    .prop('title', 'SHIFTクリックで除去');
            });
            var dialogWith = this.$fieldset.outerWidth(true);
            this.$fieldset.css('width', dialogWith); // Assign an absolute width to $content
            this.$progress.css('width', dialogWith);
            Reporter.centerDialog(this.$dialog); // Recenter the dialog because the width has been changed
            this.ids = {};
            /**
             * (Bound to the change event of a \<select> element.)
             *
             * Copy the selected value to the clipboard and reset the selection.
             * @param this
             */
            var copyThenResetSelection = function () {
                copyToClipboard(this.value);
                this.selectedIndex = 0;
            };
            // Create VIP copier
            this.$vipWrapper = Reporter.createRow(true);
            var $vipLabel = Reporter.createLeftLabel(this.$vipWrapper, 'VIP');
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
            var $ltaLabel = Reporter.createLeftLabel(this.$ltaWrapper, 'LTA');
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
            var $predefinedLabel = Reporter.createLeftLabel($predefinedWrapper, '定型文');
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
            Reporter.createLeftLabel($reasonWrapper, '理由');
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
            // Set all the left labels to the same width
            var $labels = $('.anr-option-label');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            var optionsWidths = Array.prototype.map.call($labels, function (el) { return el.offsetWidth; } // Collect the widths of all left labels
            );
            var optionWidth = Math.max.apply(Math, optionsWidths); // Get the max value
            $labels.css('min-width', optionWidth); // Set the value to all
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
        Reporter.createLeftLabel = function ($appendTo, labelText) {
            var $label = $('<div>');
            $label.addClass('anr-option-label').prop('innerHTML', labelText || '&nbsp;');
            $appendTo.append($label);
            return $label;
        };
        /**
         * Compare the outerHeight of a left label div and that of a sibling div, and if the former is smaller than the latter,
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
         * Wrap a \<select> element (next to a left label) with a div. This is for the element to fill the remaining space.
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
                mw.config.get('wgCanonicalSpecialPageName') === 'Contributions' && heading && heading.textContent && User.extractCidr(heading.textContent);
            var U = R.Users.collection[0];
            U.$input.val(relevantUser || '');
            var def = U.processInputChange();
            // Process additional asynchronous procedures for Reporter
            $.when(lib.Wikitext.newFromTitle(ANS), getVipList(), getLtaList())
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
                    Reporter.toggle(R.$progress, false).empty();
                    Reporter.toggle(R.$content, true);
                });
            });
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
            return this.$page.find('option:selected').val() || null;
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
                    ret = this.$section.find('option:selected').val() || null;
                    break;
                case ANS:
                    ret = this.$sectionAns.find('option:selected').val() || null;
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
         * Search for the oldest account creation logid and the diffid of the newest edit of a user.
         * @param username
         * @returns
         */
        Reporter.prototype.getIds = function (username) {
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
                    _this.ids[username] = __assign({}, ret);
                }
                return ret;
            }).catch(function (_, err) {
                console.error(err);
                return ret;
            });
        };
        /**
         * Close the Reporter dialog. (The dialog will be destroyed.)
         */
        // close(): void {
        // 	this.$dialog.dialog('close');
        // }
        /**
         * Destroy the Reporter dialog.
         */
        Reporter.prototype.destroy = function () {
            this.$dialog.empty().dialog('destroy');
        };
        return Reporter;
    }());
    var UserCollection = /** @class */ (function () {
        function UserCollection($next) {
            this.$next = $next;
            this.collection = [];
        }
        /**
         * Add a new user pane to the {@link Reporter} and {@link UserCollection} instances.
         * @returns The newly-initialized {@link User} instance.
         */
        UserCollection.prototype.add = function () {
            var U = new User(this.$next);
            if (this.collection.length) {
                var minWidth_1 = this.collection[0].$label.outerWidth() + 'px';
                $.each([U.$wrapper, U.$hideUserWrapper, U.$blockStatusWrapper], function () {
                    $(this).children('.anr-option-label').css('min-width', minWidth_1);
                });
            }
            this.collection.push(U);
            return U;
        };
        /**
         * Remove a user pane from the {@link Reporter} and {@link UserCollection} instances.
         * @param id
         * @returns
         */
        UserCollection.prototype.remove = function (id) {
            var idx = this.collection.findIndex(function (U) { return U.id === id; });
            if (idx !== -1) { // Should never be -1
                var U = this.collection[idx];
                U.$wrapper.remove();
                U.$hideUserWrapper.remove();
                U.$blockStatusWrapper.remove();
                this.collection.splice(idx, 1);
            }
            return this;
        };
        return UserCollection;
    }());
    var userPaneCnt = 0;
    /**
     * The User class. An instance of this handles a User field row on the Reporter dialog.
     */
    var User = /** @class */ (function () {
        /**
         * Create a user pane of the Reporter dialog with the following structure.
         * ```html
         * <div class="anr-option-row">
         * 	<div class="anr-option-label">利用者</div> <!-- float: left; -->
         * 	<div class="anr-option-usertype"> <!-- float: right; -->
         * 		<select>...</select>
         * 	</div>
         * 	<div class="anr-option-wrapper"> <!-- overflow: hidden; -->
         * 		<input class="anr-option-username anr-juxtaposed"> <!-- width: 100%; -->
         * 	</div>
         * </div>
         * <div class="anr-option-row">
         * 	<div class="anr-option-label"></div> <!-- float: left; -->
         * 	<div class="anr-option-hideuser">
         * 		<label>
         * 			<input class="anr-checkbox">
         * 			<span class="anr-checkbox-label">利用者名を隠す</span>
         * 		</label>
         * 	</div>
         * </div>
         * <div class="anr-option-row">
         * 	<div class="anr-option-label"></div> <!-- float: left; -->
         * 	<div class="anr-option-blockstatus">
         * 		<a>ブロックあり</a>
         * 	</div>
         * </div>
         * <!-- ADD BUTTON HERE -->
         * ```
         * @param $next The element before which to create a user pane.
         */
        function User($next) {
            var _this = this;
            this.$wrapper = Reporter.createRow();
            this.$wrapper.addClass('anr-option-userpane-wrapper');
            /*!
             * Make it possible to remove the user pane when the label is SHIFT-clicked.
             * However, the event needs to be resolved by a prototype method of UserCollection,
             * so the event handler is attached in the constructor of Reporter that initializes
             * an instance of UserCollection.
             */
            this.id = 'anr-dialog-userpane-' + (userPaneCnt++);
            this.$label = Reporter.createLeftLabel(this.$wrapper, '利用者').prop('id', this.id);
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
            this.$hideUserWrapper = Reporter.createRow();
            this.$hideUserWrapper.addClass('anr-option-hideuser-wrapper');
            Reporter.createLeftLabel(this.$hideUserWrapper, '');
            var hideUserElements = createLabelledCheckbox('利用者名を隠す', { alterClasses: ['anr-option-hideuser'] });
            this.$hideUser = hideUserElements.$checkbox;
            this.$hideUserWrapper.append(hideUserElements.$wrapper);
            $next.before(this.$hideUserWrapper);
            Reporter.toggle(this.$hideUserWrapper, false);
            this.$idLinkWrapper = Reporter.createRow();
            this.$idLinkWrapper.addClass('anr-option-idlink-wrapper');
            Reporter.createLeftLabel(this.$idLinkWrapper, '');
            this.$idLink = $('<a>');
            this.$idLink.prop('target', '_blank');
            this.$idLinkWrapper
                .append($('<div>').addClass('anr-option-idlink').append(this.$idLink));
            $next.before(this.$idLinkWrapper);
            Reporter.toggle(this.$idLinkWrapper, false);
            this.$blockStatusWrapper = Reporter.createRow();
            this.$blockStatusWrapper.addClass('anr-option-blockstatus-wrapper');
            Reporter.createLeftLabel(this.$blockStatusWrapper, '');
            this.$blockStatus = $('<a>');
            this.$blockStatus.prop('target', '_blank').text('ブロックあり');
            this.$blockStatusWrapper
                .append($('<div>').addClass('anr-option-blockstatus').append(this.$blockStatus));
            $next.before(this.$blockStatusWrapper);
            Reporter.toggle(this.$blockStatusWrapper, false);
        }
        /**
         * Evaluate a username, classify it into a type, and check the block status of the relevant user.
         * @param username
         * @returns
         */
        User.getInfo = function (username) {
            var params = {
                action: 'query',
                list: 'users|blocks',
                ususers: username,
                formatversion: '2'
            };
            var isIp = mw.util.isIPAddress(username, true);
            if (isIp) {
                params.bkip = username;
            }
            else if (/[@/#<>[\]|{}:]/.test(username)) { // Contains a character that can't be used in a username
                return $.Deferred().resolve({
                    type: 'other',
                    blocked: null
                });
            }
            else {
                params.bkusers = username;
            }
            return new mw.Api().get(params)
                .then(function (res) {
                var resUs = res && res.query && res.query.users;
                var resBl = res && res.query && res.query.blocks;
                if (resUs && resBl) {
                    return {
                        type: isIp ? 'ip' : resUs[0].userid !== void 0 ? 'user' : 'other',
                        blocked: !!resBl.length
                    };
                }
                else {
                    throw new Error('APIリクエストにおける不明なエラー');
                }
            })
                .catch(function (_, err) {
                console.error(err);
                mw.notify('ユーザー情報の取得に失敗しました。', { type: 'error' });
                return {
                    type: 'other',
                    blocked: null
                };
            });
        };
        User.prototype.processTypeChange = function () {
            // Red border when 'none' is selected
            this.$type.toggleClass('anr-option-usertype-none', !this.$type.prop('disabled') && this.$type.val() === 'none');
        };
        /**
         * Update the user pane in accordance with the value in the username field. This method:
         * - figures out the type of the relevant username: `ip`, `user`, or `other` (uses an AJAX call).
         * - enables/disables options in the UserAN type selector dropdown with reference to the user type.
         * - checks the block status of the relevant user (if any) and shows/hides the block status link.
         */
        User.prototype.processInputChange = function () {
            var _this = this;
            var def = $.Deferred();
            /**
             * A mapping from a user type to array indexes that represent UserAN types to show in the type selector dropdown.
             * - 0: `UNL`
             * - 1: `User2`
             * - 2: `IP2`
             * - 3: `logid`
             * - 4: `diff`
             * - 5: `none`
             *
             * Note that the element at index 0 is what's selected at initialization.
             */
            var typeMap = {
                ip: [2, 5],
                user: [0, 1, 5],
                other: [5, 3, 4]
            };
            var username = lib.clean(this.$input.val(), false);
            Reporter.toggle(this.$idLinkWrapper, false); // Hide the id link
            this.$hideUser.prop('checked', false); // Uncheck the hideuser checkbox
            if (!username || /^\s+$/.test(username)) { // Blank or whitespace only
                this.$input.val('');
                this.$type.prop('disabled', true).children('option').eq(5).prop('selected', true); // Disable dropdown and select 'none'
                this.$type.trigger('change');
                Reporter.toggle(this.$hideUserWrapper, false); // Hide the hideuser checkbox
                Reporter.toggle(this.$blockStatusWrapper, false); // Hide the block status link
                def.resolve(void 0);
            }
            else { // Some username is in the input
                User.getInfo(username).then(function (obj) {
                    _this.$type
                        .prop('disabled', false) // Enable dropdown
                        .children('option').each(function (i, opt) {
                        // Set up the UserAN type dropdown
                        var idx = typeMap[obj.type].indexOf(i);
                        opt.hidden = idx === -1; // Show/hide options
                        if (idx === 0) {
                            opt.selected = true; // Select option in accordance with typeMap
                        }
                    });
                    _this.$type.trigger('change');
                    // Type-dependent setup
                    if (obj.type === 'user' || obj.type === 'ip') {
                        Reporter.toggle(_this.$hideUserWrapper, obj.type === 'user');
                        _this.$blockStatus.prop('href', mw.util.getUrl('Special:Contribs/' + username));
                        if (obj.blocked === null) {
                            _this.$blockStatus.text('ブロック状態不明');
                            Reporter.toggle(_this.$blockStatusWrapper, true);
                        }
                        else {
                            _this.$blockStatus.text('ブロックあり');
                            Reporter.toggle(_this.$blockStatusWrapper, obj.blocked);
                        }
                    }
                    else { // other
                        Reporter.toggle(_this.$hideUserWrapper, false);
                        Reporter.toggle(_this.$blockStatusWrapper, false);
                    }
                    def.resolve(void 0);
                });
            }
            return def.promise();
        };
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
        User.extractCidr = function (text) {
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
        };
        /**
         * Get the username in the textbox.
         * @returns
         */
        User.prototype.getName = function () {
            return lib.clean(this.$input.val()) || null;
        };
        /**
         * Get the UserAN type selected in the dropdown.
         * @returns
         */
        User.prototype.getType = function () {
            return this.$type.find('option:selected').val();
        };
        return User;
    }());
    /**
     * Copy a string to the clipboard.
     * @param str
     */
    function copyToClipboard(str) {
        var temp = document.createElement('textarea');
        document.body.appendChild(temp); // Create a temporarily hidden text field
        temp.value = str; // Put the passed string to the text field
        temp.select(); // Select the text
        document.execCommand('copy'); // Copy it to the clipboard
        temp.remove();
        var msg = document.createElement('div');
        msg.innerHTML = "<code style=\"font-family: inherit;\">".concat(str, "</code>\u3092\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\u3002");
        mw.notify(msg, { type: 'success' });
    }
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
        var $label = $('<label>');
        $label.attr('for', id);
        var $wrapper = Reporter.createRow();
        $wrapper.removeClass().addClass((options.alterClasses || ['anr-option-row']).join(' ')).append($label);
        var $checkbox = $('<input>');
        $checkbox
            .prop({
            id: id,
            type: 'checkbox'
        })
            .addClass('anr-checkbox');
        var $checkboxLabel = $('<span>');
        $checkboxLabel.addClass('anr-checkbox-label').text(labelText);
        $label.append($checkbox, $checkboxLabel);
        return { $wrapper: $wrapper, $checkbox: $checkbox };
    }
    /**
     * Get a list of VIPs.
     * @returns
     */
    function getVipList() {
        return new mw.Api().get({
            action: 'parse',
            page: 'Wikipedia:進行中の荒らし行為',
            prop: 'sections',
            formatversion: '2'
        }).then(function (res) {
            var resSect = res && res.parse && res.parse.sections; // undefined or array of objects
            if (!resSect)
                return [];
            // Define sections tiltles that are irrelevant to VIP names
            var excludeList = [
                '記述について',
                '急を要する二段階',
                '配列',
                'ブロック等の手段',
                'このページに利用者名を加える',
                '注意と選択',
                '警告の方法',
                '未登録（匿名・IP）ユーザーの場合',
                '登録済み（ログイン）ユーザーの場合',
                '警告中',
                '関連項目'
            ];
            // Return a list
            return resSect.reduce(function (acc, _a) {
                var line = _a.line, level = _a.level;
                if (excludeList.indexOf(line) === -1 && level === '3') {
                    acc.push(line); // NAME in WP:VIP#NAME
                }
                return acc;
            }, []);
        }).catch(function (code, err) {
            console.log(err);
            return [];
        });
    }
    /**
     * Get a list of LTAs.
     * @returns
     */
    function getLtaList() {
        return lib.continuedRequest({
            action: 'query',
            list: 'allpages',
            apprefix: 'LTA:',
            apnamespace: '0',
            apfilterredir: 'redirects',
            aplimit: 'max',
            formatversion: '2'
        }, Infinity)
            .then(function (response) {
            return response.reduce(function (acc, res) {
                var resPgs = res && res.query && res.query.allpages;
                (resPgs || []).forEach(function (_a) {
                    var title = _a.title;
                    if (/^LTA:[^/]+$/.test(title)) {
                        acc.push(title.replace(/^LTA:/, '')); // NAME in LTA:NAME
                    }
                });
                return acc;
            }, []);
        });
    }
    // ******************************************************************************************
    // Entry point
    init();
    // ******************************************************************************************
})();
//</nowiki>
