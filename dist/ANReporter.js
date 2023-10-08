"use strict";
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
            // Create a style tag
            createStyleTag();
            // Main procedure
            if (onConfig) {
                // If on the config page, create the interface after loading dependent modules
                $(loadConfigInterface); // Show a 'now loading' message as soon as the DOM gets ready
                var modules = [
                    'mediawiki.user',
                    'oojs-ui',
                    'oojs-ui.styles.icons-editing-core',
                    'oojs-ui.styles.icons-moderation',
                    'mediawiki.api',
                ];
                $.when(mw.loader.using(modules), $.ready).then(createConfigInterface);
            }
            else {
                // If not on the config page, create a portlet link to open the ANR dialog after loading dependent modules
                var modules = [
                    'mediawiki.user',
                    'mediawiki.util',
                    'mediawiki.api',
                    'mediawiki.Title',
                    'oojs-ui',
                ];
                $.when(mw.loader.using(modules), $.ready).then(function () {
                    var portlet = createPortletLink();
                    if (!portlet) {
                        console.error("".concat(ANR, ": \u30DD\u30FC\u30C8\u30EC\u30C3\u30C8\u30EA\u30F3\u30AF\u306E\u4F5C\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002"));
                        return;
                    }
                    portlet.addEventListener('click', function (e) {
                        e.preventDefault();
                        new Reporter();
                    });
                });
            }
        });
    }
    // function createStyleTag
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
                        '<code>portletId</code>を指定します。未指定または値が無効の場合、使用中のスキンに応じて自動的にリンクの生成位置が決定されます。')
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
            var cfg = {
                reasons: this.reasons.getValue().split('\n').filter(function (el) { return el; }),
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
    function createStyleTag() {
        var style = document.createElement('style');
        style.textContent =
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
                '.anr-dialog-content {' +
                'padding: 1em;' +
                // '}' +
                // '.anr-dialog.ui-dialog-content,' +
                // '.anr-dialog .ui-dialog-content,' +
                // '.anr-dialog.ui-corner-all,' +
                // '.anr-dialog .ui-corner-all,' +
                // '.anr-dialog.ui-draggable,' +
                // '.anr-dialog .ui-draggable,' +
                // '.anr-dialog.ui-resizable,' +
                // '.anr-dialog .ui-resizable,' +
                // '.anr-dialog .ui-dialog-buttonpane {' +
                // 	'background-color: yellow;' +
                // '}' +
                // '.anr-dialog .ui-dialog-titlebar,' +
                // '.anr-dialog .ui-dialog-titlebar-close {' +
                // 	'background-color: pink !important;' +
                '}';
        document.head.appendChild(style);
    }
    var Reporter = /** @class */ (function () {
        function Reporter() {
            var cfg = Config.merge();
            // Create dialog
            this.$dialog = $('<div>').attr('title', ANR).css({
                'width': 'max-content'
            });
            this.$content = $('<div>').addClass('anr-dialog-content');
            this.$dialog.append(this.$content);
            this.fieldset = new OO.ui.FieldsetLayout();
            this.$content.append(this.fieldset.$element);
            this.$dialog.dialog({
                dialogClass: 'anr-dialog',
                resizable: false,
                modal: true,
                // height: 'auto',
                width: 'auto',
                position: {
                    my: 'center',
                    at: 'center',
                    of: window
                }
            });
            // Reporter.setUpWidth(this.$dialog, this.fieldset);
            // Append a progress bar to show when the dialog is getting ready
            this.loader = new OO.ui.ProgressBarWidget({
                progress: false
            });
            this.fieldset.addItems([
                new OO.ui.FieldLayout(this.loader, {
                    label: '読み込み中...',
                    align: 'top'
                })
            ]);
            Reporter.centerDialog(this.$dialog);
            // Create main dialog elements
            this.page = new OO.ui.DropdownWidget({
                id: 'anr-dialog-page',
                label: '選択してください',
                menu: {
                    items: [
                        new OO.ui.MenuOptionWidget({
                            data: ANI,
                            label: ANI
                        }),
                        new OO.ui.MenuOptionWidget({
                            data: ANS,
                            label: ANS
                        }),
                        new OO.ui.MenuOptionWidget({
                            data: AN3RR,
                            label: AN3RR
                        })
                    ]
                }
            });
            this.section = new OO.ui.DropdownWidget({
                id: 'anr-dialog-section',
                label: '選択してください'
            });
            this.reason = new OO.ui.MultilineTextInputWidget({
                id: 'anr-dialog-reason',
                rows: 5
            });
            this.addComment = new OO.ui.CheckboxInputWidget();
            this.blockCheck = new OO.ui.CheckboxInputWidget({
                selected: cfg.blockCheck
            });
            this.duplicateCheck = new OO.ui.CheckboxInputWidget({
                selected: cfg.duplicateCheck
            });
            this.watchUser = new OO.ui.CheckboxInputWidget({
                selected: cfg.watchUser
            });
            this.fieldset.clearItems().addItems([
                new OO.ui.FieldLayout(this.page, {
                    label: '報告先',
                    align: 'top'
                }),
                new OO.ui.FieldLayout(this.section, {
                    label: 'セクション',
                    align: 'top'
                }),
                // new OO.ui.FieldLayout(this.reason, {
                // 	label: '理由',
                // 	align: 'top'
                // }),
                // new OO.ui.FieldLayout(this.addComment, {
                // 	label: '要約にコメントを追加',
                // 	align: 'inline'
                // }),
                // new OO.ui.FieldLayout(this.blockCheck, {
                // 	label: '報告前にブロック状態をチェック',
                // 	align: 'inline'
                // }),
                // new OO.ui.FieldLayout(this.duplicateCheck, {
                // 	label: '報告前に重複報告をチェック',
                // 	align: 'inline'
                // }),
                // new OO.ui.FieldLayout(this.watchUser, {
                // 	label: '報告対象者をウォッチ',
                // 	align: 'inline'
                // }),
            ]);
            createUserPane();
            // this.$content.append(createUserPane());
            Reporter.centerDialog(this.$dialog);
            // const user = new User();
            // this.$content.append(user.wrapper);
        }
        /**
         * Set up the width of the Reporter dialog (this static method is to be called in the constructor).
         *
         * For this to work, **the dialog must be visible on the viewport**.
         * @param $dialog
         */
        Reporter.setUpWidth = function ($dialog, fieldset) {
            // Create a dummy dropdown with ANS selected
            var dummy = new OO.ui.DropdownWidget({
                id: 'anr-dialog-dummy',
                menu: {
                    items: [
                        new OO.ui.MenuOptionWidget({
                            data: ANS,
                            label: ANS
                        })
                    ]
                }
            });
            dummy.getMenu().selectItemByData(ANS);
            // Add the dummy dropdown to the fieldset
            fieldset.addItems([
                new OO.ui.FieldLayout(dummy, {
                    align: 'top'
                })
            ]);
            // Set an absolute width to the dialog, in accordance with the outerWidth of the dropdown
            $dialog.dialog({ width: $dialog.outerWidth(true) });
            // Remove the dummy dropdown
            fieldset.clearItems();
        };
        /**
         * Bring a jQuery UI dialog to the center of the viewport.
         * @param $dialog
         */
        Reporter.centerDialog = function ($dialog) {
            $dialog.dialog({
                position: {
                    my: 'center',
                    at: 'center',
                    of: window
                }
            });
        };
        return Reporter;
    }());
    /** The user field of the Reporter. */
    var User = /** @class */ (function () {
        function User() {
            this.wrapper = $('<div>').addClass('anr-userpane');
            this.user = new OO.ui.TextInputWidget();
            this.type = new OO.ui.DropdownWidget({
                label: this.user.$element,
                menu: {
                    items: [
                        new OO.ui.MenuOptionWidget({
                            data: 'UNL',
                            label: 'UNL'
                        }),
                        new OO.ui.MenuOptionWidget({
                            data: 'user2',
                            label: 'user2'
                        }),
                        new OO.ui.MenuOptionWidget({
                            data: 'IP2',
                            label: 'IP2'
                        }),
                        new OO.ui.MenuOptionWidget({
                            data: 'logid',
                            label: 'logid'
                        }),
                        new OO.ui.MenuOptionWidget({
                            data: 'diff',
                            label: 'diff'
                        }),
                        new OO.ui.MenuOptionWidget({
                            data: 'none',
                            label: 'none'
                        }),
                    ]
                }
            });
            this.wrapper.append(this.user.$element, this.type.$element);
        }
        User.add = function (fieldset, index) {
            var U = new User();
            fieldset.addItems([
                // @ts-ignore
                new OO.ui.FieldLayout(U.wrapper)
            ], index);
            return U;
        };
        return User;
    }());
    function createUserPane() {
        var wrapper = new OO.ui.mixin.GroupElement();
        var input = new OO.ui.TextInputWidget();
        var dropdown = new OO.ui.DropdownWidget({
            menu: {
                items: [
                    new OO.ui.MenuOptionWidget({
                        data: 'UNL',
                        label: 'UNL'
                    }),
                    new OO.ui.MenuOptionWidget({
                        data: 'user2',
                        label: 'user2'
                    }),
                    new OO.ui.MenuOptionWidget({
                        data: 'IP2',
                        label: 'IP2'
                    }),
                    new OO.ui.MenuOptionWidget({
                        data: 'logid',
                        label: 'logid'
                    }),
                    new OO.ui.MenuOptionWidget({
                        data: 'diff',
                        label: 'diff'
                    }),
                    new OO.ui.MenuOptionWidget({
                        data: 'none',
                        label: 'none'
                    }),
                ]
            }
        });
        wrapper.addItems([input, dropdown]);
        console.log(wrapper);
        // input.$element.css('display', 'inline-block');
        // dropdown.$element.css('display', 'inline-block');
        // $wrapper.append(input.$element, dropdown.$element);
        return wrapper;
    }
    // ******************************************************************************************
    // Entry point
    init();
    // ******************************************************************************************
})();
//</nowiki>
