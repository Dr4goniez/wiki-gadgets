type RevdelTarget = 'content'|'comment'|'user';

type RevdelLevel = 'nochange'|'show'|'hide';

interface DefaultParams {
	action: 'revisiondelete';
	type: 'revision';
	reason: string;
	hide: string;
	show: string;
	suppress: 'no'|'nochange'|'yes';
	tags: string;
}

interface ApiParamsActionRevisionDelete extends DefaultParams {
	target: string;
	ids: string;
}

interface ApiResponseActionRevisionDelete {
	// Note: We can't tell whether suppression is enabled from the response object
	revisiondelete: {
		status: string;
		target: string;
		items: ApiResponseActionRevisionDeleteItem[];
	};
}

interface ApiResponseActionRevisionDeleteItem {
	status: string;
	id: number;
	timestamp: string;
	texthidden: boolean;
	commenthidden: boolean;
	userhidden: boolean;
	userid: number;
	user: string;
	comment: boolean;
	errors?: ApiResponseActionRevisionDeleteItemError[];
	warnings?: ApiResponseActionRevisionDeleteItemError[];
}

interface ApiResponseActionRevisionDeleteItemError {
	type: 'error'|'warning';
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

interface ApiResultRevisionDeleteFailure {
	code: string;
}

type MessageName =
	'revdelete-hide-text'|
	'revdelete-hide-comment'|
	'revdelete-hide-user'|
	'revdelete-otherreason'|
	'revdelete-reason-dropdown'|
	'revdelete-reasonotherlist'|
	'rev-deleted-user-contribs'|
	'revdelete-hide-restricted'|
	'rev-deleted-comment'|
	'changeslist-nocomment'|
	'empty-username';

interface ApiResponseQueryRevids {
	query: {
		pages: {
			pageid: number;
			ns: number;
			title: string;
			revisions?: ApiResponseQueryRevidsRevision[];
			deletedrevisions?: ApiResponseQueryRevidsRevision[];
		}[];
	};
}

interface ApiResponseQueryRevidsRevision {
	revid: number;
	parentid: number;
	parsedcomment: string;
}