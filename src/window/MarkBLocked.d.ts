interface Lang {
	'config-notify-notloaded': string;
	'config-label-heading': string;
	'config-label-fsgeneral': string;
	'config-label-genportlet': string;
	'config-label-fsmarkup': string;
	'config-help-resources': string;
	'config-label-rangeblocks': string;
	'config-label-g_locks': string;
	'config-label-g_blocks': string;
	'config-label-g_rangeblocks': string;
	'config-help-g_rangeblocks': string;
	'config-label-save': string;
	'config-label-saving': string;
	'config-notify-savedone': string;
	'config-notify-savefailed': string;
	'portlet-text': string;
	'portlet-title': string;
	'toggle-title-enabled': string;
	'toggle-title-disabled': string;
	'toggle-notify-enabled': string;
	'toggle-notify-disabled': string;
}

interface Window {
	MarkBLockedLoaded?: boolean;
}

interface ApiResponse {
	query?: ApiResponseQuery;
}

interface ApiResponseQuery {
	blocks?: ApiResponseQueryListBlocks[];
	globalallusers?: ApiResponseQueryListGlobalallusers[];
	globalblocks?: ApiResponseQueryListGlobalblocks[];
}

interface ApiResponseQueryListBlocks {
	restrictions?: []|object;
	expiry: string;
	user: string;
}

interface ApiResponseQueryListGlobalallusers {
	locked?: string;
}

interface ApiResponseQueryListGlobalblocks {
	target: string;
	expiry: string;
}