/*****************************************************************\
    Name: RevisionFinder
    Author: Dragoniez
    Version: 1.2.7
    Documentation: [[User:Dragoniez/scripts/RevisionFinder]]
\*****************************************************************/
//<nowiki>
/* global mediaWiki, jQuery */

(function(mw, $) { // コンテナ関数

// ************************************** 初期化 **************************************

// 履歴ページのみでスクリプトを使用
if (mw.config.get('wgAction') !== 'history') return;

// 変数定義
var pagetitle = mw.config.get('wgPageName').replace(/_/g, ' ');
var userGroups = mw.config.get('wgUserGroups');
var canRevDel = userGroups.some(function(el) {
    return ['sysop', 'eliminator', 'suppress'].indexOf(el) !== -1;
});
var groupsAHL = ['bot', 'sysop', 'apihighlimits-requestor', 'founder', 'global-bot', 'global-sysop', 'staff', 'steward', 'sysadmin', 'wmf-researcher'];
var apihighlimit = [].concat(mw.config.get('wgUserGroups'), mw.config.get('wgGlobalGroups')).some(function(group) {
    return groupsAHL.indexOf(group) !== -1;
});
/**
 * @type {{integer: number, hours: string, area: string, merged: string}}
 * integer: time diff in minutes, hours: ±0:00, area: UTC|Asia/Tokyo|..., merged: ±0:00 (UTC)
 */
var userTimezone;
var img = {
    spinner: '<img src="//upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif" style="vertical-align: middle; height: 1em; border: 0;">',
    check: '<img src="//upload.wikimedia.org/wikipedia/commons/f/fb/Yes_check.svg" style="vertical-align: middle; height: 1em; border: 0;">',
    cross: '<img src="//upload.wikimedia.org/wikipedia/commons/a/a2/X_mark.svg" style="vertical-align: middle; height: 1em; border: 0;">'
};
var tsregex = {
    json: /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/,
    jpstd: /^(\d{4})年(\d{1,2})月(\d{1,2})日\s*\(.\)\s*(\d{1,2}):(\d{1,2}):?(\d{1,2})?$/,
    jpy: /^([^\d]{2}(?:\d{1,2}|元))年(\d{1,2})月(\d{1,2})日\s*\(.\)\s*(\d{1,2}):(\d{1,2}):?(\d{1,2})?$/,
    slash: /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s(\d{1,2}):(\d{1,2}):?(\d{1,2})?$/
};
var inputTimeout = {
    start: undefined,
    end: undefined
};
var api, revisions, contentObtained, revidsForSearch;

// 依存モジュールの読み込み
$.when(
    mw.loader.using(['mediawiki.api', 'mediawiki.util', 'mediawiki.user', 'jquery.ui']),
    $.ready
).then(function() { // 完了後

    // ページに変更履歴がない場合は終了
    if ($('.mw-contributions-list').children('li').length === 0) return;

    // 個人設定のタイムゾーンを取得
    userTimezone = mw.user.options.get('timecorrection');
    userTimezone = userTimezone.split('|');
    var int = parseInt(userTimezone[1]);
    var minutes;
    userTimezone = {
        integer: int,
        hours: (int === 0 ? '±' : int > 0 ? '+' : '') + Math.trunc(int / 60) + ':' + ((minutes = Math.abs(int % 60).toString()).length === 1 ? '0' + minutes : minutes),
        area: int === 0 ? 'UTC' : userTimezone[2] ? userTimezone[2] : 'カスタム'
    };
    userTimezone.merged = userTimezone.hours + ' (' + userTimezone.area + ')';

    // ページの全履歴をAPIから取得
    api = new mw.Api();
    getRevisions().then(function(revlist) {

        // 取得した配列をグローバル変数に代入し整理
        revisions = revlist;
        cleanupRevisionsArr();

        // スクリプト使用者が削除版閲覧権限を持たない場合、削除版のspanタグ内にダミーのaタグを生成
        $('.mw-contributions-list').children('li').children('span.history-deleted.mw-changeslist-date').filter(function() {
            return $(this).children('a').length === 0;
        }).each(function() {
            var ts = $(this).text();
            $(this).prop('innerHTML', '<a role="button" class="rf-dummylink">' + ts + '</a>');
        });

        // 各版の日時リンクにrevid属性とtimestamp属性を追加
        $('.mw-contributions-list').children('li').each(function() {
            var revid = $(this).attr('data-mw-revid');
            var revObj = revisions.filter(function(obj) { return obj.revid == revid; })[0];
            var timestamp = revObj.timestamp;
            $(this).find('a.mw-changeslist-date, a.rf-dummylink').attr({
                'data-rf-revid': revid,
                'data-rf-timestamp': timestamp
            });
        });

        // ダイアログとポートレットリンクを生成
        createDialog();
        $(mw.util.addPortletLink(
            mw.config.get('skin') === 'minerva' ? 'p-personal' : 'p-cactions',
            '#',
            'RevisionFinder',
            'ca-rf',
            '複数版のリンク生成' + (canRevDel ? 'および版指定削除' : ''),
            null,
            '#ca-move'
        )).click(function(e) {
            e.preventDefault();
            $('#rf-dialog-main').dialog('open');
        });

        // スクリプトの準備ができたことを可視化するために、一瞬リンクを点滅させる
        var $datelinks = $('.mw-contributions-list').children('li').find('a.mw-changeslist-date');
        $datelinks.css('color', 'orange').animate({color: '#0645AD'}, 800);

    });

});

// ************************************** 主要関数 **************************************

/**
 * APIから全ての版情報を取得する関数
 * @param {boolean} [getContent] trueの場合は版本文を取得
 * @returns {jQuery.Promise<Array<{revid: number, timestamp: string, user: string, content: string|undefined}>>}
 */
function getRevisions(getContent) {
    var def = new $.Deferred();

    var revlist = [];
    var failed = false;
    /**
     * @param {string|Array} [rvcontinue] Array の場合 String に自動変換
     * @returns {jQuery.Promise<undefined|Array<{}>>} !getContent の場合はレスポンスオブジェクトを revlist に格納 (返り値=undefined)、
     * getContent の場合は版情報オブジェクトの配列をそのまま return
     */
    var query = function(rvcontinue) { // 版数が多い場合同じ処理のループが必要な為APIリクエストを独立関数化
        var deferred = new $.Deferred();

        if (Array.isArray(rvcontinue)) rvcontinue = rvcontinue[0];
        api.get(
            {
                action: 'query',
                titles: pagetitle,
                prop: 'revisions',
                rvprop: 'ids|timestamp|user' + (getContent ? '|content' : ''),
                rvlimit: getContent ? '50' : 'max', // 本文を取得しない場合は500 (apihighlimit=5000)、する場合は50 (apihighlimit=500) が上限
                rvdir: 'newer',
                rvcontinue: rvcontinue,
                formatversion: '2'
            },
            {
                timeout: 0
            }
        ).then(function(res) {

            var resPg, resCont;
            if (!res || !res.query || !(resPg = res.query.pages)) {
                failed = true;
                return deferred.resolve();
            }

            var resRev = resPg[0].revisions;
            if (!getContent) revlist = revlist.concat(resRev);

            if (!getContent && res && res.continue && (resCont = res.continue.rvcontinue)) {
                query(resCont).then(function() {
                    deferred.resolve();
                });
            } else {
                deferred.resolve(getContent ? resRev : undefined);
            }

        }).catch(function(code, err) {
            console.log(err);
            failed = true;
            deferred.resolve();
        });

        return deferred.promise();
    };

    // 各版の情報を取得
    if (getContent) { // 本文を取得する場合は同期的に連続取得しなければならず時間が掛かるため、並列処理で一括取得

        // 取得済みの版情報から rvcontinue の配列を取得
        var len = 50; // 1回のAPIコールで取得できる本文の版数 (版数が多すぎるとレスポンスの容量が上限を超えるため50に固定)
        var rvcontinue = revisions.filter(function(obj, i) { return i % len === 0; }).map(function(obj) {
            return obj.timestamp.replace(/[-T:Z]/g, '') + '|' + obj.revid;
        });

        // 一括でAPIリクエストを送信
        var deferreds = [];
        while (rvcontinue.length) {
            deferreds.push(query(rvcontinue.splice(0, 1)));
        }

        // 全てのレスポンスが返ってきたら
        $.when.apply($, deferreds).then(function() {

            if (failed) alert('一部の版情報の取得に失敗しました。ページをリロードすると改善する場合があります。');

            // レスポンスオブジェクトを配列の配列に変換
            var args = arguments;
            revlist = Object.keys(args).map(function(key) { return args[key]; });

            // undefined の要素がある場合、取得済みの版情報と置き換える
            revlist.forEach(function(el, i) {
                if (!el) revlist[i] = revisions.slice(i * len, i * len + len);
            });

            // 配列の配列を1つの配列に変換
            revlist = revlist.concat.apply([], revlist);

            // 本文の取得前よりも後の方が版数が少なく、エラーが返って来ていない場合に警告を表示
            var lenBefore = JSON.parse(JSON.stringify(revisions)).length;
            if (!failed && lenBefore > revlist.length) {
                alert('致命的なエラーが発生しました。このエラーが起こったページ名および時間を開発者へ連絡願います。');
            }
            def.resolve(revlist);

        });

    } else { // 本文を取得しない場合
        query().then(function() {
            if (failed) alert('一部の版情報の取得に失敗しました。ページをリロードすると改善する場合があります。');
            def.resolve(revlist);
        });
    }

    return def.promise();
}

/** 取得した変更履歴を格納した配列を整理する関数 */
function cleanupRevisionsArr() {
    revisions.forEach(function(obj) {
        obj.timestamp = obj.timestamp.replace(/Z$/, ''); // タイムスタンプ語尾のZを除去
    });
}

/** メインダイアログを生成する関数 */
function createDialog() {

    // styleタグを生成
    $('head').append(
        '<style>' +
            '.rf-dummylink {' +
                'color: #72777D !important;' +
            '}' +
            '.rf-selected {' +
                'background: #FEC493;' +
            '}' +
            '.rf-matched {' +
                'background: pink;' +
            '}' +
            '.rf-label {' +
                'display: inline-block;' +
                'width: 10ch;' +
            '}' +
            '.rf-labelinfieldset {' +
                'display: inline-block;' +
                'width: calc(10ch - 1em);' +
            '}' +
            '#rf-dialog-main fieldset {' +
                'margin: 0;' +
            '}' +
            '#rf-dialog-main legend {' +
                'font-weight: bold;' +
            '}' +
            '#rf-dialog-main input[type="checkbox"],' +
            '#rf-dialog-search input[type="checkbox"] {' +
                'margin-right: 0.5em;' +
            '}' +
            '#rf-timestamp div:not(#rf-timestamp-buttons) {' +
                'margin-bottom: 0.3em;' +
            '}' +
            '.rf-timestamp-formateval {' +
                'display: inline-block;' +
                'margin-left: 0.5em;' +
            '}' +
            '#rf-revdelsettings-target label {' +
                'margin-right: 0.5em;' +
            '}' +
            '#rf-revdelsettings > div:not(#rf-revdelsettings-reason-div) {' +
                'margin-bottom: 0.3em;' +
            '}' +
            '#rf-revdelsettings-reason-div div {' +
                'margin-bottom: 0.3em;' +
            '}' +
            '#rf-dialog-search > div {' +
                'margin-bottom: 0.3em;' +
            '}' +
            '.rf-dialog input,' +
            '.rf-dialog textarea {' +
                'box-sizing: border-box;' +
            '}' +
            // スクロール時にダイアログがついてくるようにする
            '.rf-dialog {' +
                'position: fixed;' +
            '}' +
            // ダイアログのヘッダーに「X」を表示しない
            '.rf-dialog .ui-dialog-titlebar-close {' +
                'visibility: hidden;' +
            '}' +
            // ダイアログの色変更
            '.rf-dialog.ui-dialog-content,' +
            '.rf-dialog.ui-corner-all,' +
            '.rf-dialog.ui-draggable,' +
            '.rf-dialog.ui-resizable,' +
            '.rf-dialog .ui-dialog-buttonpane {' +
                'background: #FFF0E4;' +
            '}' +
            '.rf-dialog .ui-dialog-titlebar.ui-widget-header {' +
                'background: #FEC493 !important;' +
            '}' +
        '</style>'
    );

    // DOM上にダイアログを作成
    $('body').append(
        '<div id="rf-dialog-main" title="RevisionFinder" style="max-height: 80vh; padding-top: 1.5em;">' +
            '<div id="rf-info">' +
                '<label for="rf-info-pagetitle" class="rf-label" style="font-weight: bold;">ページ名</label>' +
                '<span id="rf-info-pagetitle">' + pagetitle + '</span><br/>' +
                '<label for="rf-info-rvcount" class="rf-label" style="font-weight: bold;">総版数</label>' +
                '<span id="rf-info-rvcount">' + revisions.length + '</span><br/>' +
                '<label for="rf-info-displaycount" class="rf-label" style="font-weight: bold;">表示版数</label>' +
                '<span id="rf-info-displaycount">' + $('.mw-contributions-list').children('li').length + '</span><br/>' +
                '<label for="rf-info-timeoffset" class="rf-label" style="font-weight: bold;">設定時間帯</label>' +
                '<span id="rf-info-timeoffset">' + userTimezone.merged + '</span>' +
                '<span id="rf-info-timeoffset-warning" style="color: red; font-weight: bold; display: none;">' +
                    '注意: Shift+Ctrlクリックの自動入力値はUTC時刻になります' +
                '</span>' +
            '</div>' +
            '<fieldset id="rf-target">' +
                '<legend>対象版</legend>' +
                '<div id="rf-target-temp">' + // ダイアログの横幅を絶対値にするためのみに使用
                    '<input type="checkbox"></input>' +
                    '<label>2000-01-01T00:00:00 UTC ～ 2000-01-01T00:00:00 UTC (連続1000版)</label>' +
                '</div>' +
                '<div style="margin-bottom: 0.3em;">' +
                    '<label for="rf-target-timezone" class="rf-labelinfieldset">基準</label>' +
                    '<select id="rf-target-timezone">' +
                        '<option value="0">UTC</option>' +
                        '<option value="540">JST</option>' +
                    '</select>' +
                '</div>' +
                '<div id="rf-targetrevisions-list" style="max-height: ' + (canRevDel ? '10vh' : '20vh') + '; overflow: auto;">' +
                '</div>' +
                '<div id="rf-target-remove" style="display: none; margin-top: 0.5em;">' +
                    '<input id="rf-target-remove-do" type="button" value="除去"></input>' +
                    '<input id="rf-target-remove-checkall" type="button" style="margin-left: 0.5em;" value="全選択"></input>' +
                    '<input id="rf-target-remove-uncheckall" type="button" style="margin-left: 0.5em;" value="全選択解除"></input>' +
                '</div>' +
            '</fieldset>' +
            '<fieldset id="rf-timestamp">' +
                '<legend>タイムスタンプ</legend>' +
                '<div>' +
                    '<label for="rf-timestamp-timezone" class="rf-labelinfieldset">基準</label>' +
                    '<select id="rf-timestamp-timezone">' +
                        '<option value="0">UTC</option>' +
                        '<option value="540">JST</option>' +
                    '</select>' +
                '</div>' +
                '<div>' +
                    '<label for="rf-timestamp-start" class="rf-labelinfieldset">始点</label>' +
                    '<input id="rf-timestamp-start" class="rf-timestamp-input"></input>' +
                    '<span id="rf-timestamp-start-formateval" class="rf-timestamp-formateval"></span>' +
                '</div>' +
                '<div>' +
                    '<label for="rf-timestamp-end" class="rf-labelinfieldset">終点</label>' +
                    '<input id="rf-timestamp-end" class="rf-timestamp-input"></input>' +
                    '<span id="rf-timestamp-start-formateval" class="rf-timestamp-formateval"></span>' +
                '</div>' +
                '<div id="rf-timestamp-buttons" style="margin-top: 0.5em;">' +
                    '<input id="rf-timestamp-add" type="button" value="追加"></input>' +
                    '<input id="rf-timestamp-clear" type="button" style="margin-left: 0.5em;" value="クリア"></input>' +
                '</div>' +
            '</fieldset>' +
            '<fieldset id="rf-revdelsettings" style="display: none;">' +
                '<legend>版指定削除の設定</legend>' +
                '<div>' +
                    '<label for="rf-revdelsettings-mode" class="rf-labelinfieldset">区分</label>' +
                    '<select id="rf-revdelsettings-mode">' +
                        '<option>削除</option>' +
                        '<option>復帰</option>' +
                    '</select>' +
                '</div>' +
                '<div>' +
                    '<label for="rf-revdelsettings-target" class="rf-labelinfieldset">対象</label>' +
                    '<div id="rf-revdelsettings-target" style="display: inline-block;">' +
                        '<input id="rf-revdelsettings-content" type="checkbox"></input>' +
                        '<label for="rf-revdelsettings-content">本文</label>' +
                        '<input id="rf-revdelsettings-user" type="checkbox"></input>' +
                        '<label for="rf-revdelsettings-user">利用者名</label>' +
                        '<input id="rf-revdelsettings-comment" type="checkbox"></input>' +
                        '<label for="rf-revdelsettings-comment">要約</label>' +
                        '<div style="display: none;">' +
                            '<input id="rf-revdelsettings-oversight" type="checkbox"></input>' +
                            '<label for="rf-revdelsettings-oversight">オーバーサイト</label>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div id="rf-revdelsettings-reason-div">' +
                    '<div>' +
                        '<label for="rf-revdelsettings-reason1" class="rf-labelinfieldset">理由1</label>' +
                        '<select id="rf-revdelsettings-reason1" class="rf-revdelsettings-reason">' +
                            '<optgroup label="指定なし">' +
                                '<option value="">なし</option>' +
                            '</optgroup>' +
                        '</select>' +
                    '</div>' +
                    '<div>' +
                        '<label for="rf-revdelsettings-reason2" class="rf-labelinfieldset">理由2</label>' +
                        '<select id="rf-revdelsettings-reason2" class="rf-revdelsettings-reason">' +
                            '<optgroup label="指定なし">' +
                                '<option value="">なし</option>' +
                            '</optgroup>' +
                        '</select>' +
                    '</div>' +
                    '<div>' +
                        '<label for="rf-revdelsettings-reasonC" class="rf-labelinfieldset"></label>' +
                        '<input id="rf-revdelsettings-reasonC" placeholder="非定型理由 (自由記述)">' +
                    '</div>' +
                '</div>' +
            '</fieldset>' +
        '</div>'
    );

    // ダイアログ用ボタンの定義
    var $dialog = $('#rf-dialog-main');
    var btns = [];
    if (canRevDel) { // 版指定削除権限がある場合
        getDeleteReasonDropdown(); // 削除理由インターフェースを取得
        btns.push(
            {
                text: '版指定削除',
                click: doRevDel
            }
        );
        $('#rf-revdelsettings').css('display', 'block');
        if (userGroups.indexOf('suppress') !== -1) {
            $('#rf-revdelsettings-oversight').parent('div').css('display', 'inline-block');
        }
    }
    btns = btns.concat([
        {
            text: 'リンク生成',
            click: createLinks
        },
        {
            text: '文字列検索',
            click: keywordSearch
        },
        {
            text: '閉じる',
            click: function() {
                $dialog.dialog('close');
            }
        }
    ]);

    // 作成したDOM要素をダイアログ化
    var firstDialogOpen = true;
    $dialog.dialog({
        dialogClass: 'rf-dialog rf-dialog-main',
        autoOpen: false,
        modal: false,
        width: 'auto',
        resizable: false,
        position: {
            my: 'center top',
            at: 'center top+2%',
            of: window
        },
        buttons: btns,
        open: function() { // 初めてダイアログを開いた際のみ使用
            if (firstDialogOpen) {

                firstDialogOpen = false;

                // 版指定削除の手動入力用テキストボックスを理由ドロップダウンと同じ横幅に変更
                if (canRevDel) {
                    $('#rf-revdelsettings-reasonC').css('width', $('.rf-revdelsettings-reason').eq(0).outerWidth());
                }

                // 横幅設定用のdivがある場合はダイアログの横幅をそのdivに合わせた絶対値に変更し除去
                if ($('#rf-target-temp').length !== 0) {
                    var dWidth = $dialog.innerWidth();
                    $dialog.dialog('option', 'width', dWidth);
                    $('#rf-target-temp').remove();
                }

                // 使用者のタイムゾーン設定に合わせて「基準」ドロップダウンの初期値を変更
                if (userTimezone.integer === 540) {
                    $('#rf-target-timezone').children('option[value="540"]').prop('selected', true);
                    $('#rf-timestamp-timezone').children('option[value="540"]').prop('selected', true);
                }

                // 個人設定のタイムゾーンがUTCでもJSTでもない場合、Shift+Ctrlクリックでの入力値の手動入力が必要である旨の警告を表示
                if ([0, 540].indexOf(userTimezone.integer) === -1) {
                    $('#rf-info-timeoffset-warning').css('display', 'block');
                }

            }
        }
    });

    // 編集履歴の日時リンクがクリックされた際、ダイアログにその日時をコピーする
    $('.mw-contributions-list').children('li').find('a.mw-changeslist-date, a.rf-dummylink').click(function(e) {

        // ShiftキーとCtrlキーの両方が押されている場合のみイベントをトリガー
        if (!(e.shiftKey && e.ctrlKey)) return;
        e.preventDefault();
        if ($('#rf-dialog-links').length !== 0) return; // 別ダイアログが開いている場合は無効化
        if ($('#rf-dialog-search').length !== 0) return;
        if (!$dialog.dialog('isOpen')) $dialog.dialog('open'); // ダイアログが開いていない場合は開く

        // ダイアログに入力済みのタイムスタンプを取得し、両方のテキストボックスが埋まっていないかを確認
        var start = $('#rf-timestamp-start').val().replace(/\u200e/g, '').trim(),
            end = $('#rf-timestamp-end').val().replace(/\u200e/g, '').trim(),
            $tar = !start ? $('#rf-timestamp-start') : !end ? $('#rf-timestamp-end') : null;
        if (!$tar) return alert('テキストボックスが埋まっています');

        // 個人設定の基準時間帯がJSTの場合の処理
        var ts = $(this).attr('data-rf-timestamp');
        if (userTimezone.integer === 540) {
            var d = new Date(ts);
            d.setMinutes(d.getMinutes() + 540);
            ts = dateToISOString(d);
            $('#rf-timestamp-timezone').children('option[value="540"]').prop('selected', true);
        }

        // 始点が空いていれば始点に、終点が空いていれば終点に日時を入力
        $tar.val(ts).trigger('input');

    });

}

/**
 * タイムスタンプフィールドの入力値が対応フォーマットに合致するか確認、アイコンを表示
 * @param {jQuery.event} e
 */
function evaluateTimestamp(e) {
    var inputtype = e.target.id.split('-')[2]; // start or end
    var $input = $('#' + e.target.id);
    clearTimeout(inputTimeout[inputtype]);
    inputTimeout[inputtype] = setTimeout(function() {
        var inputVal = $input.val().replace(/\u200e/g, '').trim();
        var $formateval = $input.siblings('.rf-timestamp-formateval');
        if (!inputVal) {
            $formateval.prop('innerHTML', '');
        } else {
            var goodformat = Object.keys(tsregex).some(function(key) { return inputVal.match(tsregex[key]); });
            $formateval.prop('innerHTML', goodformat ? img.check : img.cross);
        }
    }, 300);
}

// タイムスタンプフィールドの入力値が変更された際の処理 (timeoutを共有できないためクラスではなくidで指定)
$(document).off('input', '#rf-timestamp-start').on('input', '#rf-timestamp-start', evaluateTimestamp);
$(document).off('input', '#rf-timestamp-end').on('input', '#rf-timestamp-end', evaluateTimestamp);

/**
 * [[MediaWiki:Revdelete-reason-dropdown]] から版指定削除理由のドロップダウンを取得する関数
 * @returns {jQuery.Promise}
 */
function getDeleteReasonDropdown() {
    var def = new $.Deferred();

    // 該当ページの内容を取得
    var interface = 'MediaWiki:Revdelete-reason-dropdown';
    var url = mw.config.get('wgScript') + '?action=raw&title=' + interface;
    $.get(url)
    .then(function(content) { // 成功

        if (!content) return def.resolve();

        // インターフェースの内容をselect optionに変換
        var deleteReasons = '';
        content.split('\n').forEach(function(item, i) { // ページコンテンツを改行で split しその配列をループ

            if (item.match(/^\*[^*]/)) { // 行が「*」で始まる場合 (=<optgroup>)
                if (i !== 0) deleteReasons += '</optgroup>'; // 1回目のループではない場合 optgroup タグを閉じる
                deleteReasons += '<optgroup label="' + item.replace(/^\*[^\S\r\n]*/, '') + '">'; // 行頭の「*(+スペース)」を除去し optgroup タグ化
            } else { // その他 (行が「**」で始まる場合 (=<option/>))
                deleteReasons += '<option>' + item.replace(/^\*{2}[^\S\r\n]*/, '') + '</option>'; // 行頭の「**(+スペース)」を除去し option タグ化
            }

        });
        deleteReasons += '</optgroup>';

        // select に option を追加
        $('.rf-revdelsettings-reason').append(deleteReasons);

        def.resolve();

    }).catch(function(err) { // 失敗
        var msg404 = err.status && err.status === 404 ? ' ( [[' + interface + ']] は存在しません)' : '';
        if (confirm('RevisionFinder\n削除理由の取得に失敗しました' + msg404 + '。ページをリロードしますか？')) location.reload(true);
        def.reject();
    });

    return def.promise();
}

// 「追加」ボタンの制御
$(document).off('click', '#rf-timestamp-add').on('click', '#rf-timestamp-add', function() {

    // 「タイムスタンプ」フィールドの値を取得
    var ts = {
        start: $('#rf-timestamp-start').val().replace(/\u200e/g, '').trim(),
        end: $('#rf-timestamp-end').val().replace(/\u200e/g, '').trim()
    };
    if (!ts.start && !ts.end) return alert('タイムスタンプが入力されていません');
    var tskeys = ['start', 'end'];

    // タイムスタンプのフォーマット名を取得
    var format = {
        start: null,
        end: null
    };
    tskeys.forEach(function(key) { // TSフィールドの両方の値を確認
        if (!ts[key]) return;
        Object.keys(tsregex).some(function(f) { // tsregexオブジェクトをループ
            var m = ts[key].match(tsregex[f]); // どのフォーマットに合致するかを確認
            if (m) format[key] = f; // マッチした場合はtsregexオブジェクトのキーを保存
            return m; // マッチした場合はループをストップ、していない場合は次のループへ
        });
    });
    if (ts.start && !format.start || ts.end && !format.end) { // 入力値があるがフォーマット名の取得に失敗した場合
        return alert('タイムスタンプのフォーマットが不正です');
    }

    /**
     * フォーマット変換用関数の返り値処理用
     * @param {null|undefined} errtype
     */
    var errHandler = function(errtype) {
        var msg = errtype === null ? '不正な和暦が含まれています' : 'タイムスタンプの変換に失敗しました。このエラーが起きたタイムスタンプを開発者に報告してください';
        alert(msg);
    };

    // JSONフォーマットではないTSがある場合はJSON形式に変換
    var convResult = true;
    if (tskeys.some(function(key) { return format[key] && format[key] !== 'json'; })) {
        tskeys.forEach(function(key) {
            if (!ts[key] || format[key] === 'json') return;
            var timeArr = ts[key].match(tsregex[format[key]]);
            timeArr.shift();
            var iso = toISOString(timeArr);
            if (!iso) convResult = iso;
            ts[key] = iso;
        });
        if (!convResult) return errHandler(convResult);
    }

    // JST基準の場合はTSの時間を調整
    var timezonename = $('#rf-timestamp-timezone').children('option').filter(':selected').text();
    if (timezonename === 'JST') {
        tskeys.forEach(function(key) {
            if (!ts[key]) return;
            var c = ts[key].match(/C$/) ? 'C' : '';
            var d = new Date(ts[key].replace(/C$/, ''));
            d.setMinutes(d.getMinutes() - 540);
            ts[key] = dateToISOString(d) + c;
        });
    }

    // 入力されたTSの版があるかを確認
    var rv = {
        start: [],
        end: []
    };
    tskeys.forEach(function(key) {
        if (!ts[key]) return;
        var thisTs = ts[key].match(/C$/) ? ts[key].replace(/\d{2}C$/, '') : ts[key];
        ts[key] = ts[key].replace(/C$/, ''); // 語末のCはここで用済み
        rv[key] = revisions.filter(function(obj) { return obj.timestamp.indexOf(thisTs) !== -1; });
    });
    if (ts.start && ts.end) {
        if (rv.start.length === 0 && rv.end.length === 0) {
            return alert('指定された始点版と終点版が見つかりませんでした');
        } else if (rv.start.length === 0) {
            return alert('指定された始点版が見つかりませんでした');
        } else if (rv.end.length === 0) {
            return alert('指定された終点版が見つかりませんでした');
        }
    } else if (ts.start) {
        if (rv.start.length === 0) return alert('指定された版が見つかりませんでした');
    } else if (ts.end) {
        if (rv.end.length === 0) return alert('指定された版が見つかりませんでした');
    }

    // 始点TSと終点TSの整理
    if (ts.start && ts.end) {
        var dates = {
            start: new Date(ts.start),
            end: new Date(ts.end)
        };
        if (dates.start > dates.end) { // 始点と終点が逆の場合入れ替え
            [ts, format, rv].forEach(function(obj) {
                var temp = JSON.parse(JSON.stringify(obj.start));
                obj.start = obj.end;
                obj.end = temp;
            });
        }
        if (ts.start === ts.end) { // 始点と終点が同じ場合片方を除去
            ts.end = null;
            format.end = null;
            rv.end = [];
        }
    } else if (!ts.start && ts.end) { // 始点が空白で終点が入力されている場合入れ替え
        [ts, format, rv].forEach(function(obj) {
            var temp = JSON.parse(JSON.stringify(obj.start));
            obj.start = obj.end;
            obj.end = temp;
        });
    }

    // 指定された版間の版IDを取得
    var newRevids = [];
    if (ts.start && ts.end) { // 複数版の場合
        var startTs = rv.start[0].timestamp;
        var endTs = rv.end[rv.end.length - 1].timestamp;
        var counting = false;
        revisions.some(function(obj) {
            if (obj.timestamp === startTs) counting = true;
            if (counting) newRevids.push(obj.revid);
            if (obj.timestamp === endTs) counting = null;
            return counting === null;
        });
    } else { // 単一版の場合
        newRevids.push(rv.start[0].revid);
    }

    // 既に追加済みの版のrevidを取得
    var oldRevids = $('.rf-targetrevisions').map(function() { return $(this).attr('data-rf-revidchunk'); }).get();
    oldRevids = oldRevids.map(function(el) { return JSON.parse(el); });
    oldRevids = [].concat.apply([], oldRevids);

    // 重複チェック
    var intersect = oldRevids.some(function(n) { return newRevids.indexOf(n) !== -1; });
    if (intersect) {
        if (!confirm('追加済みの版と重複する版が指定されています。上書きしますか？')) return;
    }

    // 追加済みの版IDと新規追加の版IDの配列をマージし、版間差分テキストを取得
    newRevids = newRevids.concat(oldRevids).filter(function(n, i, arr) {
        return arr.indexOf(n) === i; // 重複revidの除去
    }).sort(function(a, b) { return a - b; }); // 昇順に並び替え

    // リストを更新
    updateRevisionsList(newRevids);

    // TSフィールドを白紙化
    $('.rf-timestamp-input').each(function() {
        $(this).val('').trigger('input');
    });

    // 同分台の版を検出した場合警告を表示
    if (rv.start.length > 1 || rv.end.length > 1) {
        var msg = ['警告: 以下の指定版について、同分以内に複数の編集を検出しました\n'];
        var point = function(el) { return el === 'start' ? '始点' : '終点'; };
        if (ts.start && ts.end) {
            tskeys.forEach(function(key) {
                if (rv[key].length > 1) msg.push(point(key) + ': ' + ts[key] + '台 (' + rv[key].length + '版)');
            });
        } else {
            var prop = ts.start ? 'start' : 'end';
            msg.push(point(prop) + ': ' + ts[prop] + '台 (' + rv[prop].length + '版)');
        }
        alert(msg.join('\n'));
    }

});

/**
 * 時間数値の配列からJSONフォーマットタイムスタンプを作成
 * @param {[year: string|number, month: string|number, date: string|number, hour: string|number, minute string|number, second: string|number]} timeArr
 * 要素数5または6の配列 (基本的に match の配列を shift() したキャプチャーグループ群); yearは「令和2」などのフォーマットを許容
 * @returns {string|null|undefined} yearが和暦の場合、無効なものの場合はnull、JPYToAD()で処理できなかった場合はundefined。
 * 引数の配列で秒が指定されていない場合、TSの末尾にはCを付けた形で出力
 */
function toISOString(timeArr) {
    if (typeof timeArr[0] === 'string' && timeArr[0].match(/^[^\d]/)) timeArr[0] = JPYToAD(timeArr[0]);
    if (!timeArr[0]) return timeArr[0];
    var c = typeof timeArr[5] === 'undefined' ? 'C' : ''; // 秒がない場合はTSの末尾にCをつける
    if (!timeArr[5]) timeArr[5] = 0;
    timeArr = timeArr.map(function(el) {
        return (el = el.toString()).length === 1 ? '0' + el : el;
    });
    var delimiters = ['', '-', '-', 'T', ':', ':'];
    var ts = '';
    timeArr.forEach(function(el, i) {
        ts += delimiters[i] + el;
    });
    return ts + c;
}

/**
 * 和暦を西暦に変換 (簡易的)
 * @param {string} jpy 「令和10」など
 * @returns {number|null|undefined} 無効な和暦の場合はnull、関数が入力値を処理できなかった場合はundefined
 */
function JPYToAD(jpy) {

    var m = jpy.match(/^([^\d]{2})(\d{1,2}|元)$/);
    var name = m[1];
    var year = m[2] === '元' ? 1 : parseInt(m[2]);
    if (!year) return null;

    var data = [
        {
            name: '令和',
            year: 2019,
            end: null
        },
        {
            name: '平成',
            year: 1989,
            end: 2019
        }
    ];

    var y;
    for (var i = 0; i < data.length; i++) {
        if (data[i].name === name) {
            y = data[i].year + year - 1;
            return data[i].end && data[i].end < y ? null : y;
        }
    }

}

/**
 * DateオブジェクトをJSON形式に変換 (UTC以外の出力用)
 * @param {Date} date
 * @returns {string}
 */
function dateToISOString(date) {
    return toISOString([date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()]);
}

/**
 * 対象版フィールドの内容をアップデートする関数
 * @param {Array} revidsArr
 */
function updateRevisionsList(revidsArr) {

    // 表示するテキストを取得
    var timediff = parseInt($('#rf-target-timezone').children('option').filter(':selected').val());
    var timezonename = $('#rf-target-timezone').children('option').filter(':selected').text();
    var revlist = convertRevids(revidsArr, 'none', 'timestamp', timediff, timezonename, true, ' ～ ');

    // ハイライトを更新
    $('.rf-selected').removeClass('rf-selected');
    $('.mw-contributions-list').children('li').find('a.mw-changeslist-date, a.rf-dummylink').filter(function() {
        return revidsArr.indexOf(parseInt($(this).attr('data-rf-revid'))) !== -1;
    }).addClass('rf-selected');

    // フィールドの更新
    $('#rf-targetrevisions-list').empty();
    revlist.revisionsLink.forEach(function(label, i) {
        var id = 'rf-targetrevisions-' + i;
        $('#rf-targetrevisions-list').append(
            $('<div>')
            .append(
                $('<input>')
                .attr({
                    id: id,
                    class: 'rf-targetrevisions',
                    type: 'checkbox',
                    'data-rf-revidchunk': JSON.stringify(revlist.revidsNested[i])
                })
                .css('margin-right', '0.5em')
            )
            .append(
                $('<label>')
                .attr('for', id)
                .text(label)
            )
        );
    });
    toggleRemoveButton();

}

/**
 * revidの配列を連続IDの配列にまとめ、版間のリンクを生成する関数
 * @param {Array} revidsArr
 * @param {string} linktype diff, permalink, none
 * @param {string} texttype timestamp, timestamp|suffix, pagetitle, pagetitle|timestamp, pagetitle|timestamp|suffix
 * @param {number} timediff in minutes
 * @param {string} timezonename
 * @param {boolean} showtimezone
 * @param {string} delimiter
 * @returns {{revisionsLink: Array<string>, revidsNested: Array<Array<number>>}}
 */
function convertRevids(revidsArr, linktype, texttype, timediff, timezonename, showtimezone, delimiter) {

    // 版情報の配列からrevidを抽出 (例: [111, 112, 113, 115, 117, ...])
    var allRevids = revisions.map(function(obj) { return obj.revid; });

    // それぞれのrevidの配列インデックスを取得
    var revidIndex = [];
    revidsArr.forEach(function(revid) {
        revidIndex.push(allRevids.indexOf(revid)); // 特定のrevidが全ての版のうち何番目かを判別
    });
    revidIndex.sort(function(a, b) { return a - b; }); // 昇順に並び替え

    // revidインデックスの配列で連続するインデックスをネストさせる（例: [1,2,3,5] => [[1,2,3], [5]]）
    var revidIndexNested = [];
    var tempArr;
    var consective = false;
    revidIndex.forEach(function(n, i, arr) {
        if (!consective) tempArr = [];
        tempArr.push(n);
        if (arr[i + 1] && arr[i + 1] === n + 1) {
            consective = true;
        } else {
            consective = false;
            revidIndexNested.push(tempArr);
        }
    });

    // ネストさせたインデックス配列を版情報オブジェクトに置換
    var revInfoNested = [];
    var revidsNested = [];
    revidIndexNested.forEach(function(arr) {
        var arrOfObj = revisions.slice(arr[0], arr[arr.length - 1] + 1);
        revInfoNested.push(arrOfObj);
        revidsNested.push(arrOfObj.map(function(obj) { return obj.revid; }));
    });

    /**
     * 版情報オブジェクトを文字列に変換する関数
     * @param {{revid: number, timestamp: string}} revInfoObj
     * @returns {string}
     */
    var getDiff = function(revInfoObj) {

        var wrapWithLink = function(str) {
            switch (linktype) {
                case 'diff':
                    return '[[特別:差分/' + revInfoObj.revid + '|' + str + ']]';
                case 'permalink':
                    return '[[特別:固定リンク/' + revInfoObj.revid + '|' + str + ']]';
                default:
                    return str;
            }
        };

        var ts = JSON.parse(JSON.stringify(revInfoObj.timestamp));
        var d = new Date(ts);
        d.setMinutes(d.getMinutes() + timediff);
        ts = dateToISOString(d);
        var tznote = showtimezone ? ' ' + timezonename : '';
        var converted;
        switch (texttype) {
            case 'timestamp':
                converted = ts + tznote;
                break;
            case 'timestamp|suffix':
                converted = ts + tznote + 'の版';
                break;
            case 'pagetitle':
                converted = pagetitle;
                break;
            case 'pagetitle|timestamp':
                converted = pagetitle + ' (' + ts + tznote + ')';
                break;
            case 'pagetitle|timestamp|suffix':
                converted = pagetitle + ' (' + ts + tznote + 'の版)';
                break;
            default:
                throw 'ReferenceError: texttype is not defined';
        }

        return wrapWithLink(converted);

    };

    var getRevisionsLink = function(revisionsArr) {
        var rvCnt = revisionsArr.length;
        var difflink;
        if (rvCnt > 1) {
            difflink = getDiff(revisionsArr[0]) + delimiter + getDiff(revisionsArr[revisionsArr.length - 1]);
        } else {
            difflink = getDiff(revisionsArr[0]);
        }
        rvCnt = rvCnt > 1 ? ' (連続' + rvCnt + '版)' : '';
        return difflink + rvCnt;
    };

    var revisionsLink = [];
    revInfoNested.forEach(function(arr) {
        revisionsLink.push(getRevisionsLink(arr));
    });

    return {
        revisionsLink: revisionsLink,
        revidsNested: revidsNested
    };

}

/** 対象版フィールド内に要素があれば「除去」ボタンを表示し、なければ非表示に */
function toggleRemoveButton() {
    var display = $('.rf-targetrevisions').length === 0 ? 'none' : 'block';
    $('#rf-target-remove').css('display', display);
}

// 対象版フィールドの「基準」時間帯設定が変更された際、タイムスタンプの値を更新
$(document).off('change', '#rf-target-timezone').on('change', '#rf-target-timezone', function() {
    var $checkbox = $('.rf-targetrevisions');
    if ($checkbox.length === 0) return;
    var revidsArr = $checkbox.map(function() { return $(this).attr('data-rf-revidchunk'); }).get();
    revidsArr = revidsArr.map(function(el) { return JSON.parse(el); });
    revidsArr = [].concat.apply([], revidsArr);
    updateRevisionsList(revidsArr);
});

// 「除去」ボタンの制御
$(document).off('click', '#rf-target-remove-do').on('click', '#rf-target-remove-do', function() {

    // チェックされた対象版を取得
    var $checked = $('.rf-targetrevisions').filter(':checked');
    if ($checked.length === 0) return alert('除去対象が指定されていません');

    // 対象版とハイライトを除去
    $checked.each(function() {
        var revids = JSON.parse($(this).attr('data-rf-revidchunk'));
        $('.rf-selected').filter(function() {
            return revids.indexOf(parseInt($(this).attr('data-rf-revid'))) !== -1;
        }).removeClass('rf-selected');
        $(this).parent('div').remove();
    });
    toggleRemoveButton();

});

// 「全選択」ボタンの制御
$(document).off('click', '#rf-target-remove-checkall').on('click', '#rf-target-remove-checkall', function() {
    $('.rf-targetrevisions').prop('checked', true);
});

// 「全選択解除」ボタンの制御
$(document).off('click', '#rf-target-remove-uncheckall').on('click', '#rf-target-remove-uncheckall', function() {
    $('.rf-targetrevisions').prop('checked', false);
});

// 「クリア」ボタンの制御
$(document).off('click', '#rf-timestamp-clear').on('click', '#rf-timestamp-clear', function() {
    $('.rf-timestamp-input').each(function() {
        $(this).val('').trigger('input');
    });
});

/** ダイアログの「リンク生成」ボタンの制御 */
function createLinks() {

    // 対象版のチェックボックスを取得
    var $target = $('.rf-targetrevisions');
    if ($target.length === 0) return alert('対象版が指定されていません');

    // 新しいダイアログ用のHTML要素をDOM上に作成
    $('body').append('<div id="rf-dialog-links" title="RevisionFinder" style="max-height: 80vh;"/>');

    // 要素のダイアログ化
    var $linkDialog = $('#rf-dialog-links');
    var $mainDialog = $('#rf-dialog-main');
    $linkDialog.dialog({
        dialogClass: 'rf-dialog rf-dialog-links',
        closeOnEscape: false,
        modal: false,
        width: 'auto',
        resizable: false,
        position: {
            my: 'left top',
            at: 'left top',
            of: $('.rf-dialog-main')
        },
        buttons: [
            {
                text: '戻る',
                click: function() {
                    $(this).empty().dialog('destroy').remove();
                    $mainDialog.dialog('open');
                }
            },
            {
                text: '閉じる',
                click: function() {
                    $(this).empty().dialog('destroy').remove();
                }
            }
        ],
        open: function() { // ダイアログを開いた際の初期設定
            var dWidth = $mainDialog.innerWidth();
            $linkDialog.dialog('option', 'width', dWidth); // メインダイアログと同じ横幅を設定
            $mainDialog.dialog('close'); // メインダイアログを隠す
            createDiffTextarea('#rf-dialog-links'); // リンク表示用のtextareaを作成
        }
    });

}

/**
 * リンク表示用のtextareaを作成する関数
 * @param {string} elementId textareaをappendする対象のelement ID (#の接頭辞必須)
 */
function createDiffTextarea(elementId) {

    $(elementId).append(
        '<textarea id="rf-revlist" style="width: 100%; margin: 0.5em 0;" rows="10" disabled></textarea>' +
        '<table id="rf-revlist-options">' +
            '<tr>' +
                '<td>' +
                    '<label for="rf-revlist-indent" class="rf-label">字下げ</label>' +
                    '<select id="rf-revlist-indent">' +
                        '<option>0</option>' +
                        '<option selected>1</option>' +
                        '<option>2</option>' +
                        '<option>3</option>' +
                        '<option>4</option>' +
                        '<option>5</option>' +
                    '</select>' +
                '</td>' +
                '<td>' +
                    '<label for="rf-revlist-linktype" class="rf-label">リンク</label>' +
                    '<select id="rf-revlist-linktype">' +
                        '<option value="none">なし</option>' +
                        '<option value="diff" selected>差分</option>' +
                        '<option value="permalink">固定リンク</option>' +
                    '</select>' +
                '</td>' +
            '</tr>' +
            '<tr>' +
                '<td>' +
                    '<label for="rf-revlist-texttype" class="rf-label">テキスト</label>' +
                    '<select id="rf-revlist-texttype">' +
                        '<option value="timestamp">時刻</option>' +
                        '<option value="timestamp|suffix" selected>時刻の版</option>' +
                        '<option value="pagetitle">ページ名</option>' +
                        '<option value="pagetitle|timestamp">ページ名 (時刻)</option>' +
                        '<option value="pagetitle|timestamp|suffix">ページ名 (時刻の版)</option>' +
                    '</select>' +
                    '<span style="display: inline-block; width: 1em;"/>' +
                '</td>' +
                '<td>' +
                    '<label for="rf-revlist-delimiter" class="rf-label">中間表現</label>' +
                    '<select id="rf-revlist-delimiter">' +
                        '<option value=" ～ ">～</option>' +
                        '<option value=" - ">-</option>' +
                        '<option value="から">から</option>' +
                    '</select>' +
                    '<span style="display: inline-block; width: 1em;"/>' +
                '</td>' +
            '</tr>' +
            '<tr>' +
                '<td>' +
                    '<label for="rf-revlist-timediff" class="rf-label">基準時間</label>' +
                    '<select id="rf-revlist-timediff">' +
                        '<option value="0">UTC</option>' +
                        '<option value="540">JST</option>' +
                    '</select>' +
                '</td>' +
                '<td>' +
                    '<label for="rf-revlist-showtimezone" class="rf-label">時間帯表記</label>' +
                    '<select id="rf-revlist-showtimezone">' +
                        '<option>あり</option>' +
                        '<option>なし</option>' +
                    '</select>' +
                '</td>' +
            '</tr>' +
            '<tr>' +
                '<td>' +
                    '<label for="rf-revlist-total" class="rf-label">合計版数</label>' +
                    '<select id="rf-revlist-total">' +
                        '<option>あり</option>' +
                        '<option>なし</option>' +
                    '</select>' +
                '</td>' +
                '<td>' +
                '</td>' +
            '</tr>' +
        '</table>' +
        '<div id="rf-revlist-buttons" style="margin-top: 0.5em;">' +
            '<input id="rf-revlist-copy" type="button" value="コピー"></input>' +
        '</div>'
    );

    setRevisionsLink(); // 作成したtextareaに値を設定

}

/** リンク表示用textareaに値を設定 */
function setRevisionsLink() {

    // リンク作成元のrevidを取得
    var revidsArr;
    var $searchDialog = $('#rf-dialog-search');
    if ($searchDialog.length !== 0 && $searchDialog.dialog('isOpen')) { // 検索ダイアログが開いている場合は検索結果のrevidを取得
        revidsArr = revidsForSearch;
    } else { // それ以外の場合はメインダイアログの対象版フィールドからrevidを取得
        revidsArr = $('.rf-targetrevisions').map(function() { return $(this).attr('data-rf-revidchunk'); }).get();
        revidsArr = revidsArr.map(function(el) { return JSON.parse(el); });
        revidsArr = [].concat.apply([], revidsArr);
    }

    // リンクの表示設定を取得
    var indenttype = $('#rf-revlist-indent').children('option').filter(':selected').val();
    var linktype = $('#rf-revlist-linktype').children('option').filter(':selected').val();
    var texttype = $('#rf-revlist-texttype').children('option').filter(':selected').val();
    var showtotal = $('#rf-revlist-total').children('option').filter(':selected').val() === 'あり';
    var timediff = parseInt($('#rf-revlist-timediff').children('option').filter(':selected').val());
    var timezonename = $('#rf-revlist-timediff').children('option').filter(':selected').text();
    var showtimezone = $('#rf-revlist-showtimezone').children('option').filter(':selected').val() === 'あり';
    var delimiter = $('#rf-revlist-delimiter').children('option').filter(':selected').val();

    // インデントの生成
    var indent = '';
    for (var i = 1; i <= parseInt(indenttype); i++) indent += '*';
    indent += ' ';

    // revidと設定から表示する値を取得し、textareaに設定
    var txt = indent + convertRevids(revidsArr, linktype, texttype, timediff, timezonename, showtimezone, delimiter).revisionsLink.join('\n' + indent);
    if (showtotal) txt += '\n' + indent + '計' + revidsArr.length + '版';
    $('#rf-revlist').val(txt);

}

// リンク設定用のドロップダウンの値が変化した際、textareaの値を更新
$(document).off('change', '#rf-revlist-options select').on('change', '#rf-revlist-options select', setRevisionsLink);

// リンク設定の「コピー」ボタンが押された際、textareaの値をコピー
$(document).off('click', '#rf-revlist-copy').on('click', '#rf-revlist-copy', function() {
    var $revlist = $('#rf-revlist');
    $revlist.prop('disabled', false).select();
    document.execCommand('copy');
    $revlist.prop('disabled', true);
});

/** ダイアログの「文字列検索」ボタンの制御 */
function keywordSearch() {

    // 初めて開く時に各版の本文の取得が必要なため、時間が掛かりそうであればメッセージを表示
    if (!contentObtained && revisions.length > 1000) {
        if (!confirm('全ての版の本文を取得します。版数に応じて時間が掛かる場合がありますが、実行しますか？')) return;
    }

    // 新しいダイアログ用のHTML要素をDOM上に作成
    $('body').append('<div id="rf-dialog-search" title="RevisionFinder" style="max-height: 80vh; padding-top: 1.5em;"/>');

    // 要素のダイアログ化
    var $selected = $('.rf-selected');
    var $searchDialog = $('#rf-dialog-search');
    var $mainDialog = $('#rf-dialog-main');
    $searchDialog.dialog({
        dialogClass: 'rf-dialog rf-dialog-search',
        closeOnEscape: false,
        modal: false,
        width: 'auto',
        resizable: false,
        position: {
            my: 'left top',
            at: 'left top',
            of: $('.rf-dialog-main')
        },
        open: function() {

            // 横幅設定
            var dWidth = $mainDialog.innerWidth();
            $searchDialog.dialog('option', 'width', dWidth);
            $mainDialog.dialog('close');

            // 初めてダイアログを開く場合は各版の本文を取得
            if (!contentObtained) {
                contentObtained = true;

                $searchDialog.append(
                    '<p>各版の本文を取得しています' + img.spinner + '</p>'
                );

                getRevisions(true).then(function(revlist) { // 取得し終わったら

                    // 取得した配列を整理
                    revisions = revlist;
                    cleanupRevisionsArr();

                    // ダイアログのインターフェースを作成
                    $searchDialog.empty();
                    createSearchDialogContent();

                    // 削除済みの版がある場合は警告
                    var texthidden = revisions.some(function(obj) {
                        return typeof obj.content === 'undefined';
                    });
                    if (texthidden) alert('注意: 本文を参照できない版があります');

                });

            } else {
                createSearchDialogContent();
            }

        }
    });

    /**
     * 検索ダイアログのインターフェースを作成する関数
     */
    function createSearchDialogContent() {
        $searchDialog
        .dialog({
            buttons: [
                {
                    text: '戻る',
                    click: function() {
                        $(this).empty().dialog('destroy').remove();
                        $mainDialog.dialog('open');
                        $selected.addClass('rf-selected');
                        $('.rf-matched').removeClass('rf-matched');
                    }
                },
                {
                    text: '閉じる',
                    click: function() {
                        $(this).empty().dialog('destroy').remove();
                        $selected.addClass('rf-selected');
                        $('.rf-matched').removeClass('rf-matched');
                    }
                }
            ]
        })
        .append(
            '<div>' +
                '<input id="rf-search-input" style="width: 100%;" placeholder="検索する文字列"></input>' +
            '</div>' +
            '<div>' +
                '<input id="rf-search-rmwhitespace" type="checkbox" checked></input>' +
                '<label for="rf-search-rmwhitespace">本文内のスペースとアンダーバーを無視</label>' +
            '</div>' +
            '<div>' +
                '<input id="rf-search-rmlinebreaks" type="checkbox" checked></input>' +
                '<label for="rf-search-rmlinebreaks">本文内の改行を無視</label>' +
            '</div>' +
            '<div>' +
                '<input id="rf-search-caseinsensitive" type="checkbox"></input>' +
                '<label for="rf-search-caseinsensitive">大文字小文字を区別しない</label>' +
            '</div>' +
            '<div>' +
                '<input id="rf-search-regex" type="checkbox"></input>' +
                '<label for="rf-search-regex">正規表現モード</label>' +
            '</div>' +
            '<div id="rf-search-regex-flag-div" style="display: none;">' +
                '<label for="rf-search-regex-flag" class="rf-label">フラグ</label>' +
                '<input id="rf-search-regex-flag"></input>' +
            '</div>' +
            '<div>' +
                '<input id="rf-search-button" type="button" value="検索"></input>' +
            '</div>' +
            '<div id="rf-search-result" style="margin-top: 0.5em;"></div>'
        );
    }

    // 「検索」ボタンが押されたら検索を実行
    $(document).off('click', '#rf-search-button').on('click', '#rf-search-button', function() {

        // 検索対象の文字列を取得
        var searchStr = $('#rf-search-input').val().replace(/\u200e/g, '');
        if (!searchStr) return alert('検索する文字列を入力してください');

        // 正規表現モードの場合、使用可能な正規表現かチェック
        var regexMode = $('#rf-search-regex').is(':checked');
        if (regexMode) {
            try {
                var flag = $('#rf-search-regex-flag').val();
                var regex;
                if (flag) {
                    regex = new RegExp(searchStr, flag);
                } else {
                    regex = new RegExp(searchStr);
                }
            }
            catch (err) {
                return alert(err);
            }
        }

        // 検索ボタンを無効化、検索結果を初期化、ハイライトを全て除去
        $(this).prop('disabled', true);
        $('#rf-search-result').empty();
        $('.rf-selected').removeClass('rf-selected');
        $('.rf-matched').removeClass('rf-matched');

        // 設定を取得
        var rmwhitespace = $('#rf-search-rmwhitespace').is(':checked');
        var rmlinebreaks = $('#rf-search-rmlinebreaks').is(':checked');
        var caseinsensitive;
        if (!regexMode) caseinsensitive = $('#rf-search-caseinsensitive').is(':checked');
        var iRegex = new RegExp(mw.util.escapeRegExp(searchStr), 'i');
        var rm;
        if (rmwhitespace && rmlinebreaks) {
            rm = /[_\s]/g;
        } else if (rmwhitespace) {
            rm = /([^\S\n\r]|_)/g;
        } else if (rmlinebreaks) {
            rm = /\n/g;
        }

        // 全ての版の本文を検索
        revidsForSearch = [];
        revisions.filter(function(obj) { return obj.content; }).forEach(function(obj) {
            var content = JSON.parse(JSON.stringify(obj.content));
            if (rm) content = content.replace(rm, '');
            if (regexMode) {
                if (content.match(regex)) revidsForSearch.push(obj.revid);
            } else {
                if (caseinsensitive) {
                    if (content.match(iRegex)) revidsForSearch.push(obj.revid);
                } else {
                    if (content.indexOf(searchStr) !== -1) revidsForSearch.push(obj.revid);
                }
            }
        });

        // 結果を表示
        if (revidsForSearch.length === 0) {
            alert('該当する版は見つかりませんでした');
        } else {
            createDiffTextarea('#rf-search-result');
            $('#rf-revlist-buttons').append(
                '<input id="rf-revlist-update" type="button" style="margin-left: 0.5em;" value="対象版を更新"></input>'
            );
            $('.mw-contributions-list').children('li').find('a.mw-changeslist-date, a.rf-dummylink').filter(function() {
                return revidsForSearch.indexOf(parseInt($(this).attr('data-rf-revid'))) !== -1;
            }).addClass('rf-matched');
            window.requestAnimationFrame(function() {
                setTimeout(function() {
                    alert(revidsForSearch.length + '版がヒットしました');
                });
            });
        }
        $(this).prop('disabled', false); // 検索ボタンを有効化

    });

    // 正規表現モードのチェックボックスの制御
    $(document).off('change', '#rf-search-regex').on('change', '#rf-search-regex', function() {
        var checked = $(this).is(':checked');
        var display = checked ? 'block' : 'none';
        $('#rf-search-caseinsensitive').prop('disabled', checked); // 「大文字小文字を区別しない」を有効化・無効化
        $('#rf-search-regex-flag-div').css('display', display); // regexのフラグ指定inputを表示・非表示
        if (!checked) $('#rf-search-regex-flag').val(''); // チェックが外されたらフラグを白紙化
    });

    // 「対象版を更新」が押されたら、メインダイアログの対象版を更新
    $(document).off('click', '#rf-revlist-update').on('click', '#rf-revlist-update', function() {
        $('.rf-matched').removeClass('rf-matched');
        updateRevisionsList(revidsForSearch);
        $selected = $('.rf-selected');
        alert('更新しました');
    });

}

/**
 * ダイアログの「版指定削除」ボタンの制御用関数
 */
function doRevDel() {

    // 設定を取得
    var dp = deletePrep();
    if (!dp) return;

    // ボタンとダイアログの内容を非表示に
    var $dialog = $('#rf-dialog-main');
    var dWidth = $dialog.innerWidth();
    $dialog.dialog({
        buttons: [],
        width: dWidth
    });
    $dialog.children().hide();

    // 処理メッセージを表示
    var totalCnt = dp.revids.length;
    $dialog.append(
        '<div id="rf-progress-div">' +
            '<p id="rf-progress">' +
                '対象版 (<span id="rf-progress-resolved">0</span>/' + totalCnt + ')<br/>' +
                '<span id="rf-progress-message">' +
                    '処理中' + img.spinner +
                '</span>' +
            '</p>' +
        '</div>'
    );

    // 一回のAPIリクエストで指定版の全てを処理できない場合の対策
    var revlist = [];
    var revidsCopy = JSON.parse(JSON.stringify(dp.revids));
    while (revidsCopy.length) {
        revlist.push(revidsCopy.splice(0, apihighlimit ? 500 : 50)); // 配列を配列の配列 ([ [1, ...50], [51, ...100], ...]) に変換
    }

    /**
     * 版指定削除を実行する非同期関数
     * @param {Array} ids
     * @returns {jQuery.Promise}
     */
    var revdel = function(ids) {
        var def = new $.Deferred();

        var params = {
            action: 'revisiondelete',
            type: 'revision',
            target: pagetitle,
            ids: ids.join('|'),
            suppress: dp.suppress,
            reason: dp.reason,
            format: 'json'
        };
        params[dp.showhide] = dp.target;

        api.postWithToken('csrf', params)
        .then(function(res) {
            var resItems;
            if (res && res.revisiondelete && (resItems = res.revisiondelete.items)) { // 成功
                var successCnt = resItems.filter(function(obj) { return !obj.errors; }).length; // 削除・復帰に成功した版数を取得
                successCnt = parseInt($('#rf-progress-resolved').text()) + successCnt; // 削除・復帰に成功した版数の合計を取得
                $('#rf-progress-resolved').text(successCnt); // 進捗の版数を更新
            }
            def.resolve();
        }).catch(function(code, err) {
            console.log(err);
            def.resolve();
        });

        return def.promise();
    };

    // 版指定削除を実行
    var result = []; // 非同期処理を格納する配列
    revlist.forEach(function(arr) {
        result.push(revdel(arr));
    });

    // // 全ての非同期処理が終了した際の処理
    $.when.apply($, result).then(function() {

        // 処理に失敗した版がある場合はその版数を取得
        var failedCnt = totalCnt - parseInt($('#rf-progress-resolved').text()),
            failedMsg = failedCnt === 0 ? '' : ' (' + totalCnt + '版中' + failedCnt + '版の処理に失敗しました)';

        // 進捗を更新
        $('#rf-progress-message').prop('innerHTML',
            '<span style="color: MediumSeaGree;">処理が完了しました</span>' + failedMsg
        );

        // 処理した版のリンク表示用textareaを生成
        createDiffTextarea('#rf-progress-div');

        // ダイアログボタンを再設定
        $dialog.dialog({
            buttons: [
                {
                    text: '閉じる',
                    click: function() {
                        $(this).dialog('close');
                    }
                }
            ]
        });

    });

}

/**
 * 「版指定削除」ボタンを押した際に必要な情報が入力されているかをチェックし設定を取得する関数
 * @returns {{revids: Array<number>, showhide: string, target: string, suppress: string, reason: string}}
 */
function deletePrep() {

    // 削除対象のrevidを取得
    if ($('.rf-targetrevisions').length === 0) return alert('版が指定されていません');
    var revidsNested = $('.rf-targetrevisions').map(function() { return $(this).attr('data-rf-revidchunk'); }).get();
    revidsNested = revidsNested.map(function(el) { return JSON.parse(el); });
    var revids = [].concat.apply([], revidsNested).sort(function(a, b) { return a - b; });

    // 版内容の何を削除・復帰の対象とするかの設定を取得
    var revdelTarget = [];
    var tars = ['content', 'user', 'comment'];
    var idPrefix = '#rf-revdelsettings-';
    tars.forEach(function(el) {
        if ($(idPrefix + el).is(':checked')) revdelTarget.push(el);
    });
    if (revdelTarget.length === 0) return alert('削除・復帰の対象とする版内容が指定されていません');

    // 削除理由を取得
    var reason = '';
    $('.rf-revdelsettings-reason').each(function() {
        var v = $(this).val();
        if (v) reason += v + ': ';
    });
    reason += $('#rf-revdelsettings-reasonC').val().replace(/\u200e/g, '').trim();
    reason = reason.replace(/: $/, '');
    if (!reason) {
        if (!confirm('理由が入力されていません。このまま実行しますか？')) return;
    }

    // 最終確認
    if (!confirm(revids.length + '版を削除・復帰します。よろしいですか？')) return;

    // オブジェクトをreturn
    return {
        revids: revids,
        target: revdelTarget.join('|'),  // 例: 'content|user|comment'
        showhide: $('#rf-revdelsettings-mode').children('option').filter(':selected').val() === '削除' ? 'hide' : 'show',
        suppress: $('#rf-revdelsettings-oversight').is(':checked') ? 'yes' : 'nochange', // オーバーサイトするか否か
        reason: reason
    };

}

// ****************************************************************************

})(mediaWiki, jQuery);
//</nowiki>
