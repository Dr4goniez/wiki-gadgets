/*
	署名忘れ防止スクリプト [[利用者:Cpro|cpro]] 2012年12月6日 (木) 07:39 (UTC)

	以下のスクリプトはパブリックドメインとします。
	改変・再配布を含め自由にお使いいただけますが、自己責任でお願いします。
	This script is under the public domain.
	You can freely use, modify, or redistribute it at your own risk.

	Modified in December 2023 by [[User:Dragoniez]]
 */
/* global mw, OO */
//<nowiki>
(function() {

	// 編集またはプレビュー時にスクリプトを実行
	var wgAction = mw.config.get('wgAction');
	if (['edit', 'submit'].indexOf(wgAction) === -1) return;

	// すべてのノート名前空間と、Wikipedia名前空間、プロジェクト名前空間の一部を対象とする
	/**
	 * 条件付き名前空間でスクリプトを走らせるページ名の文字列型正規表現
	 * @type {Record<number, string[]>}
	 */
	var rTitles = {
		4: [
			'^井戸端($|/subj/)',
			'^削除依頼/(?!ログ/)',
			'^リダイレクトの削除依頼/受付$',
			'^(削除の復帰|投稿ブロック|チェックユーザー)依頼/',
			'^(保護(解除)?|移動|利用者ページの削除|著作権問題調査)依頼$',
			'^(改名|統合|分割)提案$',
			'^(ガジェット|編集フィルター)/提案$',
			'^管理者伝言板/(投稿ブロック|3RR|拡張承認の申請|保護ページ編集|各種初期化依頼|その他の伝言)($|/)'
		],
		102: [
			'^カテゴリ関連/議論/'
		]
	};
	var ns = mw.config.get('wgNamespaceNumber');
	if (
		ns < 0 ||
		ns % 2 === 0 && !rTitles[ns] || // 2で割り切れる、かつrTitlesのキーのどれとも合致しない
		rTitles[ns] && !new RegExp(rTitles[ns].join('|')).test(mw.config.get('wgTitle')) // rTitlesのキーと合致するがページ名が合致しない
	) {
		return;
	}

	// 依存モジュールとDOMをロード
	$.when(mw.loader.using(['oojs-ui-core', 'oojs-ui-windows']), $.ready).then(function() {

		// DOM要素を取得
		var $textbox = $('#wpTextbox1');
		var $saveButton = $('#wpSave');
		var $form = $('#editform');
		if (!$textbox.length || !$saveButton.length || !$form.length) return;

		// 初期テキストを保存
		var originalText = $textbox.val();
		if (typeof originalText !== 'string') return;

		// 「変更を公開」が押された時
		$saveButton.off('click').on('click', function(e) {

			// 細部の編集のチェック状態を取得
			var isMinorEdit = $('#wpMinoredit').prop('checked');

			// 「細部の編集にチェックを入れたときは署名がなくてもポップアップを表示しない」ガジェットが有効か
			var suppressWhenMinor = mw.loader.getState('ext.gadget.checkSignature-suppressWhenMinor') === 'ready';

			// 細部の編集がチェックされ、かつ確認抑制ガジェットが有効であれば終了
			if (isMinorEdit && suppressWhenMinor) return;

			// テキストを取得（action=editで変更がない場合は終了）
			var text = $textbox.val();
			if (typeof text !== 'string' || wgAction === 'edit' && text === originalText) return;

			// 署名がある場合
			var rSig = /[^~]~~~~(?!~)/; // チルダ4つ（それ以外の個数はNG）
			if (/^\s*~~~~(?!~)/.test(text)) { // 本文先頭に署名がある場合は上の正規表現がカバーできないので念のため
				return;
			} else if (rSig.test(text)) {

				// 署名がコメントまたはnowiki内にないことを保障
				var rTag = {
					comment: { // 以下、C
						start: /^<!--/,
						end: /^-->/
					},
					nowiki: { // 以下、N
						start: /^<nowiki[^>\n]*>/,
						end: /^<\/nowiki[^>\n]*>/
					}
				};
				var rClose, m;
				for (var i = 0; i < text.length; i++) { // 本文の1文字目から順番にチェック

					// i文字目から最後までのウィキテキスト
					var substr = text.slice(i);

					// C内でもN内でもない時に署名を見つけたら終了
					if (!rClose && substr.search(rSig) === 0) {
						return;

					// C内でもN内でもない時にCかNの開始タグを見つけたら、探す終了タグの正規表現を登録
					} else if (!rClose) {
						if ((m = rTag.comment.start.exec(substr))) {
							rClose = rTag.comment.end;
							i += m[0].length - 1;
						} else if ((m = rTag.nowiki.start.exec(substr))) {
							rClose = rTag.nowiki.end;
							i += m[0].length - 1;
						}

					// C内かN内で対応する閉じタグをを見つけたら、探す終了タグの正規表現をリセット
					} else if (rClose && (m = rClose.exec(substr))) {
						rClose = void 0;
						i += m[0].length - 1;
					}

				}

			}

			// コードがここまでたどり着いた場合署名がない
			e.preventDefault(); // OO.ui.confirmが非同期処理のため先に保存処理をキャンセル
			OO.ui.confirm('署名が入力されていません。このまま投稿しますか？').then(function(confirmed) {

				// OKが押されたらフォームをsubmit
				if (confirmed) $form.trigger('submit');

			});

		});

	});

})();
//</nowiki>