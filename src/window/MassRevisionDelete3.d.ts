type RevdelTarget = 'content'|'comment'|'user';

type RevdelLevel = 'nochange'|'show'|'hide';

interface RevisionList {
	[pagename: string]: string[];
}

interface DefaultParams {
	action: 'revisiondelete';
	type: 'revision';
	reason: string;
	hide: string[];
	show: string[];
	suppress: 'no'|'nochange'|'yes';
	tags: string;
	formatversion: '2'
}

interface PreparationObject {
	revisions: RevisionList;
	defaultParams: DefaultParams;
}

interface ApiParamsActionRevisionDelete extends DefaultParams {
	target: string;
	ids: string;
}

interface ApiResponseActionRevisionDelete {
	status: string;
	target: string;
	items: ApiResponseActionRevisionDeleteItem[];
}

interface ApiResponseActionRevisionDeleteItem {
	status: string;
	id: number;
	timestamp: string;
	userhidden: boolean;
	commenthidden: boolean;
	userid: number;
	user: string;
	comment: boolean;
}