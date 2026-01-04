import type { XOR } from 'ts-essentials';

export type RevdelTarget = 'content' | 'comment' | 'user';

export type RevdelLevel = 'nochange' | 'show' | 'hide';

export interface DefaultParams {
	action: 'revisiondelete';
	type: 'revision';
	reason: string;
	hide: string;
	show: string;
	suppress: 'no' | 'nochange' | 'yes';
	tags: string;
}

export interface ApiParamsActionRevisionDelete extends DefaultParams {
	target: string;
	ids: string;
}

export interface ApiResponse {
	query?: ApiResponseQuery;
	revisiondelete?: ApiResponseRevisionDelete;
}

interface ApiResponseQuery {
	pages?: ApiResponseQueryPages[];
}

interface ApiResponseQueryPages {
	pageid: number;
	ns: number;
	title: string;
	revisions?: ApiResponseQueryPagesRevisions[];
	deletedrevisions?: ApiResponseQueryPagesRevisions[];
}

interface ApiResponseQueryPagesRevisions {
	revid: number;
	parentid: number;
	parsedcomment: string;
}

interface ApiResponseRevisionDelete {
	// Note: We can't tell whether suppression is enabled from the response object
	status: string;
	target: string;
	items: ApiResponseRevisionDeleteItem[];
}

interface ApiResponseRevisionDeleteItem {
	status: string;
	id: number;
	timestamp: string;
	texthidden: boolean;
	commenthidden: boolean;
	userhidden: boolean;
	userid: number;
	user: string;
	comment: boolean;
	errors?: ApiResponseRevisionDeleteItemError[];
	warnings?: ApiResponseRevisionDeleteItemError[];
}

interface ApiResponseRevisionDeleteItemError {
	type: 'error' | 'warning';
	/** The error code. */
	code: string;
	/** The error message. */
	message: string;
	/** Usually `params[0]` is the date of the timestamp and `params[1]` is the time of the timestamp. */
	params: string[];
}

interface ApiResultRevisionDeleteSuccess {
	content: boolean;
	comment: boolean;
	user: boolean;
}

export interface ApiResultRevisionDeleteFailure {
	code: string;
}

export type RevisionDeleteResult = XOR<ApiResultRevisionDeleteSuccess, ApiResultRevisionDeleteFailure>;

export type MessageName =
	| 'revdelete-hide-text'
	| 'revdelete-hide-comment'
	| 'revdelete-hide-user'
	| 'revdelete-otherreason'
	| 'revdelete-reason-dropdown'
	| 'revdelete-reasonotherlist'
	| 'rev-deleted-user-contribs'
	| 'revdelete-hide-restricted'
	| 'rev-deleted-comment'
	| 'changeslist-nocomment'
	| 'empty-username';

export type IconType = 'doing' | 'done' | 'failed';