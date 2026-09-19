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
$(function () {

	const wgAction = mw.config.get('wgAction');
	if (wgAction !== 'edit' && wgAction !== 'submit') {
		return;
	}

	const ns = mw.config.get('wgNamespaceNumber');
	if (ns < 0) {
		return;
	}

	/**
	 * ノート以外でスクリプトを走らせるページの正規表現
	 * @type {Record<number, string[]>}
	 */
	const titleMap = {
		// Wikipedia
		4: [
			'^井戸端($|/subj/)',
			'^削除依頼/(?!ログ/)',
			'^リダイレクトの削除依頼/受付$',
			'^(削除の復帰|投稿ブロック|チェックユーザー)依頼/',
			'^(保護(解除)?|移動|利用者ページの削除|著作権問題調査|Bot作業)依頼$',
			'^(改名|統合|分割)提案$',
			'^(ガジェット|編集フィルター)/提案$',
			'^管理者伝言板/(投稿ブロック|3RR|拡張承認の申請|保護ページ編集|各種初期化依頼|その他の伝言)($|/)'
		],
		// プロジェクト
		102: [
			'^カテゴリ関連/議論/'
		],
	};
	const rTitle = ns in titleMap && new RegExp(titleMap[ns].join('|'));

	if (
		(ns % 2 === 0 && !rTitle) ||
		(rTitle && !rTitle.test(mw.config.get('wgTitle')))
	) {
		return;
	}

	const $textbox = $('#wpTextbox1');
	const $saveButton = $('#wpSave');
	if (!$textbox.length || !$saveButton.length) {
		return;
	}

	const originalText = /** @type {string} */ ($textbox.val());
	const rSig = /(^|[^~])~~~~(?!~)/;
	const rTag = {
		comment: { // 以下、C
			start: /^<!--/,
			end: /^-->/,
		},
		nowiki: { // 以下、N
			start: /^<nowiki[^>\n]*>/,
			end: /^<\/nowiki[^>\n]*>/,
		},
	};

	let userConfirmed = false;
	/**
	 * @this {HTMLElement}
	 * @param {JQuery.ClickEvent<HTMLElement, undefined, HTMLElement, HTMLElement>} e
	 */
	const saveButtonClickCallback = async function (e) {

		// 確認済みの場合はそのままクリック処理を続行
		if (userConfirmed) {
			return;
		}

		// 細部の編集がチェックされ、かつ確認抑制ガジェットが有効であればクリック処理を続行
		const isMinorEdit = $('#wpMinoredit').prop('checked');
		const suppressWhenMinor = mw.loader.getState('ext.gadget.checkSignature-suppressWhenMinor') === 'ready';
		if (isMinorEdit && suppressWhenMinor) {
			return;
		}

		// テキストを取得、action=editで変更がない場合はクリック処理を続行
		const text = /** @type {string} */ ($textbox.val());
		if (wgAction === 'edit' && text === originalText) {
			return;
		}

		// 署名がある場合
		if (rSig.test(text)) {

			// 署名がコメントまたはnowiki内にないことを保障
			/** @type {?RegExp} */
			let rClose = null;

			for (let i = 0; i < text.length; i++) {
				const substr = text.slice(i);

				if (!rClose) {
					// C内でもN内でもない

					if (substr.search(rSig) === 0) {
						// 署名を見つけたら終了
						return;
					}

					// CかNの開始タグを見つけたら、探す終了タグの正規表現を登録
					const mComment = rTag.comment.start.exec(substr);
					if (mComment) {
						rClose = rTag.comment.end;
					}

					const mNowiki = mComment ? null : rTag.nowiki.start.exec(substr);
					if (mNowiki) {
						rClose = rTag.nowiki.end;
					}

					const match = mComment || mNowiki;
					if (match) {
						i += match[0].length - 1;
					}
					continue;
				}

				// C内かN内で対応する閉じタグを見つけたら、探す終了タグの正規表現をリセット
				const mClose = rClose.exec(substr);
				if (mClose) {
					rClose = null;
					i += mClose[0].length - 1;
				}
			}
		}
		// コードがここまでたどり着いた場合署名がない

		// 非同期処理を行うため先に保存処理をキャンセル
		e.preventDefault();
		e.stopPropagation();

		await mw.loader.using('oojs-ui-windows');
		const confirmed = await OO.ui.confirm('署名が入力されていません。このまま投稿しますか？');

		// OKが押されたら確認済みにして保存ボタンを再度クリック
		if (confirmed) {
			userConfirmed = true;
			$saveButton.trigger('click');
		}
	};

	$saveButton.off('click').on('click', saveButtonClickCallback);
});
//</nowiki>
