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
                reasons: this.reasons.getValue().split('\n').filter(function (el) { return lib.clean(el); }),
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
                '.anr-dialog-spinner {' +
                'padding: 1em;' +
                '}' +
                '#anr-dialog-optionfield {' +
                'padding: 1em;' +
                'margin: 0;' +
                // 'border: 1px solid silver;' +
                '}' +
                '#anr-dialog-optionfield > legend {' +
                'font-weight: bold;' +
                'padding-bottom: 0;' +
                '}' +
                '#anr-dialog-optionfield hr {' +
                'margin: 0.8em 0;' +
                // 'background-color: silver;' +
                '}' +
                '.anr-option-row:not(:last-child) {' +
                'margin-bottom: 0.15em;' +
                '}' +
                '.anr-option-row-withselect2 {' +
                'margin: 0.3em 0;' +
                '}' +
                '.anr-option-label {' +
                'margin-right: 1em;' +
                'float: left;' + // For a juxtaposed div to fill the remaining space
                '}' +
                '.anr-option-wrapper {' +
                'overflow: hidden;' + // Implicit width of 100% (for the child element below)
                '}' +
                '#anr-option-reason, ' +
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
                '.anr-dialog-userpane-types {' +
                'float: right;' +
                'margin-left: 0.3em;' +
                '}' +
                '.anr-checkbox {' +
                'margin-right: 0.5em;' +
                '}' +
                '#anr-option-comment {' +
                'display: none;' +
                '}' +
                '#anr-option-addcomment:checked ~ #anr-option-comment {' +
                'display: block;' +
                '}' +
                '#anr-option-watchexpiry-wrapper {' +
                'display: none;' +
                '}' +
                '#anr-option-watchuser:checked ~ #anr-option-watchexpiry-wrapper {' +
                'display: block;' +
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
            Reporter.dialogColor(this.$dialog, this.cfg.headerColor, this.cfg.backgroundColor);
            // Create spinner container
            this.$spinner = $('<div>');
            this.$spinner.addClass('anr-dialog-spinner');
            this.$spinnerLabel = $('<span>');
            this.$spinnerLabel.text('読み込み中');
            var spinnerImg = lib.getIcon('load');
            spinnerImg.style.marginLeft = '0.5em';
            this.$spinner.append(this.$spinnerLabel, spinnerImg);
            this.$dialog.append(this.$spinner);
            // Create option container
            this.$content = $('<div>');
            this.$content.addClass('anr-dialog-content');
            this.$dialog.append(this.$content);
            // Create fieldset
            this.$fieldset = $('<fieldset>');
            this.$fieldset.prop({
                id: 'anr-dialog-optionfield',
                innerHTML: '<legend>利用者を報告</legend>'
            });
            this.$content.append(this.$fieldset);
            // Create target page option
            var pageWrapper = Reporter.createRow();
            Reporter.createLeftLabel(pageWrapper, '報告先');
            this.page = document.createElement('select');
            this.page.classList.add('anr-juxtaposed'); // Important for the dropdown to fill the remaining space
            this.page.innerHTML =
                '<option selected disabled hidden>選択してください</option>' +
                    '<option>' + ANI + '</option>' +
                    '<option>' + ANS + '</option>' +
                    '<option>' + AN3RR + '</option>';
            Reporter.wrapElement(pageWrapper, this.page); // As important as above
            this.$fieldset.append(pageWrapper);
            // Create target page anchor
            var pageLinkWrapper = Reporter.createRow();
            Reporter.createLeftLabel(pageLinkWrapper, '&nbsp;');
            this.pageLink = document.createElement('a');
            this.pageLink.target = '_blank';
            this.pageLink.textContent = '報告先を確認';
            this.pageLink.classList.add('anr-disabledanchor'); // Disable the anchor by default
            pageLinkWrapper.appendChild(this.pageLink);
            this.$fieldset.append(pageLinkWrapper);
            // Create section option for ANI and AN3RR
            var sectionWrapper = Reporter.createRow();
            this.$sectionWrapper = $(sectionWrapper);
            Reporter.createLeftLabel(sectionWrapper, '節');
            this.section = document.createElement('select');
            this.section.innerHTML = '<option selected disabled hidden>選択してください</option>';
            this.section.disabled = true;
            Reporter.wrapElement(sectionWrapper, this.section);
            this.$fieldset.append(sectionWrapper);
            // Create section option for ANS
            var section2Wrapper = Reporter.createRow(true);
            this.$sectionAnsWrapper = $(section2Wrapper);
            Reporter.createLeftLabel(section2Wrapper, '節');
            var section2 = document.createElement('select'); // Options are created in `new`
            Reporter.wrapElement(section2Wrapper, section2);
            this.$sectionAns = $(section2);
            this.$fieldset.append(section2Wrapper);
            Reporter.select2(this.$sectionAns);
            // Create a user pane (which is supposed to be the widest row)
            this.$fieldset.append(document.createElement('hr'));
            this.$fieldset.append(new UserPane().wrapper);
            var dialogWith = this.$fieldset.outerWidth(true);
            this.$fieldset.css('width', dialogWith); // Assign an absolute width to $content
            this.$spinner.css('width', dialogWith);
            this.$fieldset.append(document.createElement('hr'));
            Reporter.centerDialog(this.$dialog); // Recenter the dialog because the width has been changed
            // Create VIP copier
            var vipWrapper = Reporter.createRow(true);
            vipWrapper.style.clear = 'all';
            this.$vipWrapper = $(vipWrapper);
            Reporter.createLeftLabel(vipWrapper, 'VIP');
            var vip = document.createElement('select'); // Options are created in `new`
            Reporter.wrapElement(vipWrapper, vip);
            this.$vip = $(vip);
            this.$vip.off('change').on('change', function () {
                copyToClipboard(this.value);
                this.selectedIndex = 0;
            });
            this.$fieldset.append(vipWrapper);
            Reporter.select2(this.$vip);
            // Create LTA copier
            var ltaWrapper = Reporter.createRow(true);
            this.$ltaWrapper = $(ltaWrapper);
            Reporter.createLeftLabel(ltaWrapper, 'LTA');
            var lta = document.createElement('select'); // Options are created in `new`
            Reporter.wrapElement(ltaWrapper, lta);
            this.$lta = $(lta);
            this.$lta.off('change').on('change', function () {
                copyToClipboard(this.value);
                this.selectedIndex = 0;
            });
            this.$fieldset.append(ltaWrapper);
            Reporter.select2(this.$lta);
            // Create predefined reason selector
            var predefinedWrapper = Reporter.createRow(true);
            Reporter.createLeftLabel(predefinedWrapper, '定型文');
            var predefined = document.createElement('select');
            ['選択して挿入'].concat(this.cfg.reasons).forEach(function (reason, i) {
                var option = document.createElement('option');
                option.textContent = reason;
                if (i === 0) {
                    option.selected = true;
                    option.disabled = true;
                    option.hidden = true;
                }
                predefined.add(option);
            });
            Reporter.wrapElement(predefinedWrapper, predefined);
            this.$predefined = $(predefined);
            this.$fieldset.append(predefinedWrapper);
            Reporter.select2(this.$predefined);
            // Create reason field
            // this.$fieldset.append(document.createElement('hr'));
            var reasonWrapper = Reporter.createRow();
            Reporter.createLeftLabel(reasonWrapper, '理由');
            this.reason = document.createElement('textarea');
            this.reason.id = 'anr-option-reason';
            this.reason.rows = 5;
            reasonWrapper.appendChild(this.reason);
            this.$fieldset.append(reasonWrapper);
            // Create "add comment" option
            // this.$fieldset.append(document.createElement('hr'));
            var addCommentElements = createLabelledCheckbox('要約にコメントを追加', 'anr-option-addcomment');
            this.addComment = addCommentElements.checkbox;
            this.$fieldset.append(addCommentElements.wrapper);
            this.comment = document.createElement('textarea');
            this.comment.id = 'anr-option-comment';
            this.comment.rows = 2;
            addCommentElements.wrapper.appendChild(this.comment);
            // Create "block check" option
            var checkBlockElements = createLabelledCheckbox('報告前にブロック状態をチェック', 'anr-option-checkblock');
            this.checkBlock = checkBlockElements.checkbox;
            this.$fieldset.append(checkBlockElements.wrapper);
            // Create "duplicate check" option
            var checkDuplicatesElements = createLabelledCheckbox('報告前に重複報告をチェック', 'anr-option-checkduplicates');
            this.checkDuplicates = checkDuplicatesElements.checkbox;
            this.$fieldset.append(checkDuplicatesElements.wrapper);
            // Create "watch user" option
            var watchUserElements = createLabelledCheckbox('報告対象者をウォッチ', 'anr-option-watchuser');
            this.watchUser = watchUserElements.checkbox;
            this.$fieldset.append(watchUserElements.wrapper);
            this.watchExpiry = document.createElement('select');
            this.watchExpiry.id = 'anr-option-watchexpiry';
            this.watchExpiry.innerHTML =
                '<option value="infinity">無期限</option>' +
                    '<option value="1 week">1週間</option>' +
                    '<option value="2 weeks">2週間</option>' +
                    '<option value="1 month">1か月</option>' +
                    '<option value="3 months">3か月</option>' +
                    '<option value="6 months">6か月</option>' +
                    '<option value="1 year">1年</option>';
            var watchExpiryWrapper = document.createElement('div');
            watchExpiryWrapper.id = 'anr-option-watchexpiry-wrapper';
            watchExpiryWrapper.style.marginLeft = $(this.watchUser).outerWidth(true) + 'px';
            watchExpiryWrapper.style.marginTop = '0.3em';
            watchExpiryWrapper.appendChild(document.createTextNode('期限: '));
            watchExpiryWrapper.appendChild(this.watchExpiry);
            watchUserElements.wrapper.appendChild(watchExpiryWrapper);
            // Set all the left labels to the same width
            var $labels = $('.anr-option-label');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            var optionsWidths = Array.prototype.map.call($labels, function (el) { return el.offsetWidth; } // Collect the widths of all left labels
            );
            var optionWidth = Math.max.apply(Math, optionsWidths); // Get the max value
            $labels.css('width', optionWidth); // Set the value to all
            // Make some wrappers invisible
            this.$sectionAnsWrapper.hide();
            this.$vipWrapper.hide();
            this.$ltaWrapper.hide();
            if (predefined.querySelectorAll('option').length < 2) {
                $(predefinedWrapper).hide();
            }
            this.$content.hide();
        }
        /**
         * Change the color of a jQuery UI dialog.
         * @param $dialog
         * @param headerColor
         * @param backgroundColor
         */
        Reporter.dialogColor = function ($dialog, headerColor, backgroundColor) {
            // $dialog.find('.ui-dialog-titlebar, .ui-dialog-titlebar-close').attr('style', 'background: ' + headerColor + ' !important;');
            // $dialog.filter('.ui-dialog-content, .ui-corner-all, .ui-draggable, .ui-resizable').css('background', backgroundColor);
            // $dialog.find('.ui-dialog-buttonpane').css('background', backgroundColor);
        };
        /**
         * Create `<div class="anr-option-row"></div>`, used as a row.
         * @param hasSelect2 `false` by default. If true, create `<div class="anr-option-row-withselect2"></div>`.
         * @returns The created row.
         */
        Reporter.createRow = function (hasSelect2) {
            if (hasSelect2 === void 0) { hasSelect2 = false; }
            var row = document.createElement('div');
            row.classList.add(!hasSelect2 ? 'anr-option-row' : 'anr-option-row-withselect2');
            return row;
        };
        /**
         * Create a \<div> that works as a left-aligned label.
         * @param appendTo The element to which to append the label.
         * @param labelText The text of the label (in fact the innerHTML).
         * @returns The created label.
         */
        Reporter.createLeftLabel = function (appendTo, labelText) {
            var label = document.createElement('div');
            label.classList.add('anr-option-label');
            label.innerHTML = labelText;
            appendTo.appendChild(label);
            return label;
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
         * @param appendTo The element to which to append the wrapper div.
         * @param element The element to wrap.
         * @returns The wrapper div.
         */
        Reporter.wrapElement = function (appendTo, element) {
            var wrapper = document.createElement('div');
            wrapper.classList.add('anr-option-wrapper');
            element.classList.add('anr-juxtaposed');
            wrapper.appendChild(element);
            appendTo.appendChild(wrapper);
            return wrapper;
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
         * Create a new Reporter dialog. This static method handles asynchronous procedures that are necessary
         * after calling the constructor.
         * @param e
         */
        Reporter.new = function (e) {
            e.preventDefault();
            var R = new Reporter();
            $.when(lib.Wikitext.newFromTitle(ANS), getVipList(), getLtaList())
                .then(function (Wkt, vipList, ltaList) {
                // Initialize the ANS section dropdown
                R.$sectionAns[0].innerHTML =
                    '<option selected disabled hidden>選択してください</option>' +
                        '<optgroup label="系列が立てられていないもの">' +
                        '<option>著作権侵害・犯罪予告</option>' +
                        '<option>名誉毀損・なりすまし・個人情報</option>' +
                        '<option>妨害編集・いたずら</option>' +
                        '<option>その他</option>' +
                        '</optgroup>';
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
                    R.$vip[0].innerHTML = '<option selected disabled hidden>選択してコピー</option>';
                    var optgroup_2 = document.createElement('optgroup');
                    optgroup_2.style.display = 'none'; // Wrap with optgroup to adjust font size
                    vipList.forEach(function (vip) {
                        var option = document.createElement('option');
                        option.textContent = vip;
                        option.value = '[[WP:VIP#' + vip + ']]';
                        optgroup_2.appendChild(option);
                    });
                    R.$vip[0].add(optgroup_2);
                    R.$vipWrapper.show();
                }
                // Initialize the LTA copier dropdown
                if (ltaList.length) {
                    R.$lta[0].innerHTML = '<option selected disabled hidden>選択してコピー</option>';
                    var optgroup_3 = document.createElement('optgroup');
                    optgroup_3.style.display = 'none'; // Wrap with optgroup to adjust font size
                    ltaList.forEach(function (lta) {
                        var option = document.createElement('option');
                        option.textContent = lta;
                        option.value = '[[LTA:' + lta + ']]';
                        optgroup_3.appendChild(option);
                    });
                    R.$lta[0].add(optgroup_3);
                    R.$ltaWrapper.show();
                }
                R.$spinner.hide();
                R.$content.show();
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
         * Destroy the Reporter dialog.
         */
        Reporter.prototype.destroy = function () {
            this.$dialog.empty().dialog('destroy');
        };
        return Reporter;
    }());
    /**
     * The UserPane class. An instance of this handles a User field row on the main dialog.
     */
    var UserPane = /** @class */ (function () {
        /**
         * Create the following structure.
         * ```html
         * <div class="anr-dialog-userpane">
         * 	<div class="anr-option-label">利用者</div> <!-- float: left; -->
         * 	<div class="anr-dialog-userpane-types"> <!-- float: right; -->
         * 		<select>...</select>
         * 	</div>
         * 	<div class="anr-option-wrapper"> <!-- overflow: hidden; -->
         * 		<input class="anr-dialog-userpane-user anr-juxtaposed"> <!-- width: 100%; -->
         * 	</div>
         * </div>
         * ```
         */
        function UserPane() {
            var _this = this;
            this.wrapper = document.createElement('div');
            this.wrapper.classList.add('anr-dialog-userpane');
            Reporter.createLeftLabel(this.wrapper, '利用者');
            var typeWrapper = document.createElement('div');
            typeWrapper.classList.add('anr-dialog-userpane-types');
            this.type = document.createElement('select');
            this.options = ['UNL', 'User2', 'IP2', 'logid', 'diff', 'none'].map(function (t) {
                var option = document.createElement('option');
                option.textContent = t;
                _this.type.add(option);
                return option;
            });
            typeWrapper.appendChild(this.type);
            this.wrapper.appendChild(typeWrapper);
            this.input = document.createElement('input');
            this.input.type = 'text';
            this.input.classList.add('anr-dialog-userpane-user');
            Reporter.wrapElement(this.wrapper, this.input);
        }
        return UserPane;
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
        msg.innerHTML = "<code>".concat(str, "</code>\u3092\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\u3002");
        mw.notify(msg, { type: 'success' });
    }
    var checkboxCnt = 0;
    /**
     * Create a labelled checkbox.
     * @param labelText The label text.
     * @param checkboxId An optional checkbox ID. If not provided, an automatically generated ID is used.
     * @returns
     */
    function createLabelledCheckbox(labelText, checkboxId) {
        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.classList.add('anr-checkbox');
        var id = checkboxId && !document.getElementById(checkboxId) ? checkboxId : 'anr-checkbox-' + (checkboxCnt++);
        checkbox.id = id;
        var label = document.createElement('label');
        label.htmlFor = id;
        label.textContent = labelText;
        var wrapper = Reporter.createRow();
        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        return { wrapper: wrapper, checkbox: checkbox };
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