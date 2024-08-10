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
	'title-domain-local': string;
	'title-domain-global': string;
	'title-expiry-indefinite': string;
	/** `$1`: Expiration timestamp */
	'title-expiry-temporary': string;
	/** `$1`: Domain, `$2`: Expiry, `$3`: Blocking admin, `$4`: Reason */
	'title-blocked': string;
	/** `$1`: CIDR range, `$2`: Domain, `$3`: Expiry, `$4`: Blocking admin, `$5`: Reason */
	'title-rangeblocked': string;
}

interface Window {
	MarkBLockedLoaded?: boolean;
}

interface ApiResponse {
	query?: ApiResponseQuery;
}

interface ApiResponseQuery {
	specialpagealiases?: ApiResponseQuerySpecialpagealiases[];
	blocks?: ApiResponseQueryListBlocks[];
	globalallusers?: ApiResponseQueryListGlobalallusers[];
	globalblocks?: ApiResponseQueryListGlobalblocks[];
}

interface ApiResponseQuerySpecialpagealiases {
	realname: string;
	aliases: string[];
}

interface ApiResponseQueryListBlocks {
	user: string;
	by: string;
	expiry: string;
	reason: string;
	restrictions?: []|object;
}

interface ApiResponseQueryListGlobalallusers {
	locked?: string;
}

interface ApiResponseQueryListGlobalblocks {
	target: string;
	by: string;
	expiry: string;
	reason: string;
}