/*********************************************************************************************\
    MassRevisionDelete (一括版指定削除スクリプト)
    削除権限を有する利用者が利用者の投稿記録にアクセスした際、一括版指定削除用のフォームを生成します。
    解説: [[H:MRD]]
    作者: (オリジナル) [[en:User:Writ Keeper]]
                      => [[en:User:Writ Keeper/Scripts/massRevdel.js]]
        　(移入)      [[User:Infinite0694]]
                      => [[User:Infinite0694/Mass RevisionDelete tool/ja.js]]
          (大幅改変)  [[User:Dragoniez]] 
                      => このスクリプト
                      (編集者: )
    このスクリプトを使用すると大量の版を一瞬で削除することが可能になりますが、基本的に使用者の責任で
    使用してください。
\*********************************************************************************************/
//<nowiki>

(function(mw, $) { // コンテナ即時関数

// ************************************** スクリプトの初期化 **************************************

// 利用者の投稿記録でなければスクリプトを使用しない
var spPageName = mw.config.get('wgCanonicalSpecialPageName');
var isDeletedContribs = spPageName === 'DeletedContributions' ? true : (spPageName === 'Contributions' ? false : null);
if (isDeletedContribs === null) return;

// 使用者に deleterevision の利用者権限がある場合のみスクリプトを使用
var userGroups = mw.config.get('wgUserGroups');
var userRightRevDel = userGroups.some(function(group) {
	return $.inArray(group, ['sysop', 'eliminator', 'suppress']) !== -1;
});
if (!userRightRevDel) return;

// 依存モジュールとDOMの読み込みが完了したら一括版指定削除のフォームを生成
var apiEndpoint;
$.when(
	mw.loader.using('mediawiki.util'),
	$.ready
).then(function() {
	apiEndpoint = mw.util.wikiScript('api');
	createForm();
});

// ************************************** 主要関数 **************************************

/**
 * 一括版指定削除用フォームを作成する関数
 */
function createForm() {

	if ($('ul.mw-contributions-list').length === 0) return;

	// フォーム用の style タグを生成
	$('head').append(
		'<style>' +
			'.mrd-checkbox, #mrd-utility-buttons input {' +
				'margin-right: 0.5em;' +
			'}' +
		'</style>'
	);

	// フォームを生成
	var revdelForm =
	'<div id="mrd-form" style="font-size: 95%;">' +
		'<fieldset style="margin: 0.5em 0;">' +
			'<legend>一括版指定削除</legend>' +
			'<input id="mrd-form-toggle" type="button" value="フォームを表示"></input>' +
			'<div id="mrd-form-body" style="display: none;">' +
				'<fieldset style="margin: 0;">' +
					'<legend>設定</legend>' +
					'<label for="mrd-settings" style="display: inline-block; width: 6ch;">処理</label>' +
					'<select id="mrd-settings" style="width: 10ch;">' +
						'<option>削除</option>' +
						'<option>復帰</option>' +
					'</select>' +
					'<div id="mrd-settings-delete">' +
						'<input id="mrd-settings-delete-content" class="mrd-checkbox" type="checkbox"></input>' +
						'<label for="mrd-settings-delete-content">内容を不可視化</label><br/>' +
						'<input id="mrd-settings-delete-username" class="mrd-checkbox" type="checkbox"></input>' +
						'<label for="mrd-settings-delete-username">利用者名を不可視化</label><br/>' +
						'<input id="mrd-settings-delete-summary" class="mrd-checkbox" type="checkbox"></input>' +
						'<label for="mrd-settings-delete-summary">要約を不可視化</label>' +
					'</div>' +
					'<div id="mrd-settings-restore" style="display: none;">' +
						'<input id="mrd-settings-restore-content" class="mrd-checkbox" type="checkbox"></input>' +
						'<label for="mrd-settings-restore-content">内容を復帰</label><br/>' +
						'<input id="mrd-settings-restore-username" class="mrd-checkbox" type="checkbox"></input>' +
						'<label for="mrd-settings-restore-username">利用者名を復帰</label><br/>' +
						'<input id="mrd-settings-restore-summary" class="mrd-checkbox" type="checkbox"></input>' +
						'<label for="mrd-settings-restore-summary">要約を復帰</label>' +
					'</div>' +
				'</fieldset>' +
				'<fieldset style="margin: 0;">' +
					'<legend>理由</legend>' +
					'<label for="mrd-deletereason-1" style="display: inline-block; width: 6ch;">理由1</label>' +
					'<select id="mrd-deletereason-1" class="mrd-deletereason">' +
						'<optgroup label="指定なし">' +
							'<option value="">なし</option>' +
						'</optgroup>' +
					'</select><br/>' +
					'<label for="mrd-deletereason-2" style="display: inline-block; width: 6ch;">理由2</label>' +
					'<select id="mrd-deletereason-2" class="mrd-deletereason">' +
						'<optgroup label="指定なし">' +
							'<option value="">なし</option>' +
						'</optgroup>' +
					'</select><br/>' +
					'<label for="mrd-deletereason-custom" style="width: 6ch; display: inline-block;"></label>' +
					'<input id="mrd-deletereason-custom" style="width: 60ch; padding: auto 0;" placeholder="非定型理由 (自由記述)"><br>' +
				'</fieldset>' +
				'<div id="mrd-oversight" style="margin-top: 0.3em; display: none;">' +
					'<input id="mrd-oversight-toggle" class="mrd-checkbox" type="checkbox"></input>' +
					'<label for="mrd-oversight-toggle">オーバーサイト</label>' +
				'</div>' +
				'<div id="mrd-utility-buttons" style="margin-top: 0.5em;">' +
					'<div id="mrd-utility-buttons-primary">' +
						'<input id="mrd-checkall" type="button" value="全選択"></input>' +
						'<input id="mrd-uncheckall" type="button" value="全選択解除"></input><br/>' +
					'</div>' +
					'<div id="mrd-utility-buttons-secondary" style="margin-top: 0.5em;">' +
						'<input id="mrd-checkall-deleted" type="button" value="削除済み版全選択"></input>' +
						'<input id="mrd-uncheckall-deleted" type="button" value="削除済み版全選択解除"></input>' +
						'<input id="mrd-checkall-notdeleted" type="button" value="未削除版全選択"></input>' +
						'<input id="mrd-uncheckall-notdeleted" type="button" value="未削除版全選択解除"></input>' +
					'</div>' +
				'</div>' +
				'<input id="mrd-submit" type="button" style="margin-top: 1em;" value="実行"></input>' +
			'</div>' +
		'</fieldset>' +
	'</div>';
	$('ul.mw-contributions-list:first').before(revdelForm);

	// 版指定削除理由ドロップダウンを取得
	getDeleteReasonDropdown();

	// 使用者がオーバーサイトの場合は「オーバーサイト」チェックボックスを表示
	if (/suppress/.test(userGroups)) $('#mrd-oversight').css('display', 'block');

	// 投稿記録のリストにチェックボックスを追加
	$('ul.mw-contributions-list').children('li').each(function() { // 全てのリストをループ

		// リストの先頭にチェックボックスを追加
		var title = isDeletedContribs ? $(this).find('.mw-changeslist-title').text() : $(this).find('.mw-contributions-title').prop('title');
		$(this).prepend(
			$('<input/>')
				.attr({
					class: 'mrd-revdel-target mrd-checkbox',
					type: 'checkbox',
					'data-revid': $(this).attr('data-mw-revid'), // 版IDをチェックボックスの属性に設定
					'data-title': title // ページ名をチェックボックスの属性に設定
				})
		);

		// リストの項目のいずれかが既に版指定削除されている場合はクラスを追加
		if ($(this).find('.history-deleted').length !== 0) {
			$(this).children('.mrd-revdel-target').addClass('mrd-history-deleted');
		}

	});

	// 版指定削除済みの版がない場合は追加機能をもったボタンを隠す
	if ($('.mrd-history-deleted').length === 0) {
		$('#mrd-utility-buttons-secondary').css('display', 'none');
	}

	// 「(閲覧レベルの変更)」のリンクをチェックボックスのラベルとして機能させる
	$('span.mw-revdelundel-link').children('a').click(function(e) { // 「(閲覧レベルの変更)」リンクがクリックされたら
		if (!e.shiftKey) { // シフトキーが押されていなければ

			// リンク先への移動をキャンセル
			e.preventDefault(); 

			// チェックボックスを(アン)チェック
			var $checkbox = $(this).parent().prev('.mrd-revdel-target'),
				isChecked = !$checkbox.is(':checked');
			$checkbox.prop('checked', isChecked);

		}
	});

}

// 「フォームを表示/隠す」ボタンの制御
$(document).off('click', '#mrd-form-toggle').on('click', '#mrd-form-toggle', function() {
	var $toggleBtn = $('#mrd-form-toggle');
	var $form = $('#mrd-form-body');
	var hidden = $form.css('display') === 'none';
	if (hidden) { // フォームが隠れていれば
		$toggleBtn.val('フォームを隠す');
		$form.css('display', 'block'); // 表示
	} else { // フォームが表示されていれば
		$toggleBtn.val('フォームを表示');
		$form.css('display', 'none'); // 隠す
	}
});

// 「設定 -> 処理」の選択項目 (「削除」または「復帰」) に応じてチェックボックスの項目を制御
$(document).off('change', '#mrd-settings').on('change', '#mrd-settings', function() {
	var selected = $(this).children('option').filter(':selected').val();
	if (selected === '削除') {
		$('#mrd-settings-delete').css('display', 'block');
		$('#mrd-settings-restore').css('display', 'none');
	} else {
		$('#mrd-settings-delete').css('display', 'none');
		$('#mrd-settings-restore').css('display', 'block');
	}
});

/**
 * [[MediaWiki:Revdelete-reason-dropdown]] から版指定削除理由のドロップダウンを取得する関数
 * @returns {jQuery.Promise}
 */
function getDeleteReasonDropdown() {
	var def = new $.Deferred();

	// 該当ページの内容を取得
	var pagetitle = 'MediaWiki:Revdelete-reason-dropdown';
	var url = mw.config.get('wgScript') + '?action=raw&title=' + pagetitle;
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
		$('.mrd-deletereason')
			.css('width', $('#mrd-deletereason-custom').outerWidth())
			.append(deleteReasons);

		def.resolve();

	}).catch(function(err) { // 失敗
		var msg404 = err.status && err.status === 404 ? ' ( [[' + pagetitle + ']] は存在しません)' : '';
		if (confirm('MassRevisionDelete\n削除理由の取得に失敗しました' + msg404 + '。ページをリロードしますか？')) location.reload(true)
		def.reject();
	});

	return def.promise();
}

// 「全て選択」ボタンの制御
$(document).off('click', '#mrd-checkall').on('click', '#mrd-checkall', function() {
	$('.mrd-revdel-target').prop('checked', true);
});

// 「全て選択解除」ボタンの制御
$(document).off('click', '#mrd-uncheckall').on('click', '#mrd-uncheckall', function() {
	$('.mrd-revdel-target').prop('checked', false);
});

// 「削除済み版全選択」ボタンの制御
$(document).off('click', '#mrd-checkall-deleted').on('click', '#mrd-checkall-deleted', function() {
	$('.mrd-revdel-target.mrd-history-deleted').prop('checked', true);
});

// 「削除済み版全選択解除」ボタンの制御
$(document).off('click', '#mrd-uncheckall-deleted').on('click', '#mrd-uncheckall-deleted', function() {
	$('.mrd-revdel-target.mrd-history-deleted').prop('checked', false);
});

// 「未削除版全選択」ボタンの制御
$(document).off('click', '#mrd-checkall-notdeleted').on('click', '#mrd-checkall-notdeleted', function() {
	$('.mrd-revdel-target').not('.mrd-history-deleted').prop('checked', true);
});

// 「未削除版全選択解除」ボタンの制御
$(document).off('click', '#mrd-uncheckall-notdeleted').on('click', '#mrd-uncheckall-notdeleted', function() {
	$('.mrd-revdel-target').not('.mrd-history-deleted').prop('checked', false);
});

// 「実行」ボタンの制御
$(document).off('click', '#mrd-submit').on('click', '#mrd-submit', function() {

	// 設定を取得
	var dp = deletePrep();
	if (!dp) return;
	
	// 「実行」ボタンを無効化し進捗メッセージを表示
	$('#mrd-submit').prop('disabled', true);
	var totalCnt = $('.mrd-revdel-target').filter(':checked').length;
	$(this).after(
		'<p id="mrd-progress">' +
			'<span id="mrd-resolved">0</span>/' + totalCnt +
			'<img src="https://upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif" style="vertical-align: middle; max-height: 100%; border: 0;">' +
		'</p>'
	);

	// 一回のAPIリクエストで指定版の全てを処理できない場合の対策
	var apilimit = /sysop/.test(userGroups) ? 500 : 50; // 管理者の場合一度に処理できる版数は500、それ以外 (削除者) は50
	for (var key in dp.revids) { // dp.revids: {page1: [id1, id2], page2: [id3, id4]...} のキー (ページ名) をループ
		var revidsArr = JSON.parse(JSON.stringify(dp.revids[key]));// 版IDの配列を値渡しでコピー (参照渡しを防ぐ)
		if (revidsArr.length > apilimit) { // 版ID配列の要素数が上限値を超える場合
			var tempArr = [];
			while (revidsArr.length !== 0) {
				tempArr.push(revidsArr.slice(0, apilimit)); // 配列を配列の配列 ([ [1, ...50], [51, ...100], ...]) に変換
				revidsArr.splice(0, apilimit);
			}
			dp.revids[key] = tempArr; // プロパティの配列を、作成した配列の配列に置換
		}
	}

	/**
	 * 版指定削除を実行する非同期関数
	 * @param {Array} ids 
	 * @param {string} pagetitle
	 * @returns {jQuery.Promise}
	 */
	var revdel = function(ids, pagetitle) {
		var def = new $.Deferred();

		var params = {
			action: 'revisiondelete',
			type: 'revision',
			target: pagetitle,
			ids: ids.join('|'),
			suppress: dp.suppress,
			reason: dp.reason,
			tags: 'MassRevisionDelete',
			token: mw.user.tokens.get('csrfToken'),
			format: 'json'
		};
		params[dp.showhide] = dp.target;

		$.post(apiEndpoint, params, function(res) {
			var resItems;
			if (res && res.revisiondelete && (resItems = res.revisiondelete.items)) { // 成功
				var successCnt = resItems.filter(function(obj) { return !obj.errors; }).length; // 削除・復帰に成功した版数を取得
				successCnt = parseInt($('#mrd-resolved').text()) + successCnt; // 削除・復帰に成功した版数の合計を取得
				$('#mrd-resolved').text(successCnt); // 進捗の版数を更新
			} else { // 失敗
				if (res.error) console.log(res.error.info);
			}
			def.resolve();
		});

		return def.promise();
	};

	// 版指定削除を実行
	var result = []; // 非同期処理を格納する配列
	for (var key in dp.revids) { // ページ名ごとにループ
		var revidsArr = dp.revids[key];
		var isArrayOfArrays = revidsArr.some(function(item) { // 配列の要素が配列かを識別
			return Array.isArray(item);
		});
		if (isArrayOfArrays) { // 配列の要素が配列の場合 (例: [ [1, ...50], [51, ...100], ...])
			revidsArr.forEach(function(arr) { // 配列の要素である配列をループ
				result.push(revdel(arr, key));
			});
		} else { // 配列の要素が文字型の場合 (例: ['1', '2', '3'...])
			result.push(revdel(revidsArr, key));
		}
	}

	// 全ての非同期処理が終了した際の処理
	$.when.apply($, result).then(function() {

		// 処理に失敗した版がある場合はその版数を取得
		var failedCnt = totalCnt - parseInt($('#mrd-resolved').text()),
			failedMsg = failedCnt === 0 ? '' : ' (' + totalCnt + '版中' + failedCnt + '版の処理に失敗しました)';

		// 進捗を更新
		$('#mrd-progress')
			.append(
				'<br/>' +
				'<span>' +
					'処理が完了しました' +
					failedMsg +
				'</span><br/>' +
				'<input id="mrd-reload" type="button" style="margin-top: 0.3em;" value="ページをリロード"></input>' // リロードボタン
			)
			.children('img').remove();

		// リロードボタンがクリックされたらページを更新
		$('#mrd-reload').click(function() {
			location.reload(true);
		});

	});

});

/**
 * 「実行」ボタンを押した際に必要な情報が入力されているかをチェックし設定を取得する関数
 * @returns {{revids: object, showhide: string, target: string, suppress: string, reason: string}}
 */
function deletePrep() {

	// 削除か復帰かを取得
	var showhide = $('#mrd-settings').children('option').filter(':selected').val() === '削除' ? 'hide' : 'show';
	var $settings = $(showhide === 'hide' ? '#mrd-settings-delete' : '#mrd-settings-restore');

	// 削除・復帰の対象 (内容、利用者名、要約) を取得
	var revdelTarget = []; // 例: ['content', 'user', 'comment']
	$settings.children('input').each(function(i) {
		var tar = i === 0 ? 'content' : (i === 1 ? 'user' : 'comment');
		if ($(this).is(':checked')) revdelTarget.push(tar); 
	});
	if (revdelTarget.length === 0) return alert('削除・復帰対象とする版内容が指定されていません');

	// 削除・復帰の対象版IDを取得
	var revids = {}; // {page1: [id1, id2], page2: [id3, id4]...}
	$('.mrd-revdel-target').filter(':checked').each(function() { // チェックされたチェックボックスをループ
		var revid = $(this).attr('data-revid'),
			pagetitle = $(this).attr('data-title');
		if (!revids[pagetitle]) revids[pagetitle] = []; // オブジェクトに該当ページ名が登録されていない場合はページ名をキー、プロパティに配列を登録
		revids[pagetitle].push(revid); // プロパティの配列に版IDをpush
	});
	if ($.isEmptyObject(revids)) return alert('削除・復帰対象とする版が選択されていません');
	
	// 削除・復帰理由を取得
	var reason1 = $('#mrd-deletereason-1').find('option').filter(':selected').val(),
		reason2 = $('#mrd-deletereason-2').find('option').filter(':selected').val(),
		reasonCustom = $('#mrd-deletereason-custom').val().trim();
	var reason = (reason1 ? reason1 + ': ' : '') + (reason2 ? reason2 + ': ' : '') + reasonCustom;
	reason = reason.replace(/: $/, ''); // 理由が「: 」で終わる場合はそれを除去
	if (!reason) {
		if (!confirm('理由が設定されていません。このまま実行しますか？')) return;
	}

	// オブジェクトをreturn
	return {
		revids: revids, // {page1: [id1, id2], page2: [id3, id4]...}
		showhide: showhide, // 'show' または 'hide'
		target: revdelTarget.join('|'),  // 例: 'content|user|comment'
		suppress: $('#mrd-oversight-toggle').is(':checked') ? 'yes' : 'nochange', // オーバーサイトするか否か
		reason: reason
	};

}

// ****************************************************************************

})(mediaWiki, jQuery);
//</nowiki>
