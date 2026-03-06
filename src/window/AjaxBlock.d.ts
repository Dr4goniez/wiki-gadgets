export interface Initializer {
	blockPageAliases: Record<'Block' | 'Unblock', string[]>;
	specialNamespaceAliases: string[];
	userRights: Set<string>;
	}

export interface ApiResponse {
	query?: ApiResponseQuery;
}

interface ApiResponseQuery {
	allmessages?: ApiResponseQueryMetaAllmessages[];
	specialpagealiases?: ApiResponseQuerySiteinfoSpecialpagealiases[];
	userinfo?: ApiResponseQueryUserinfoRights;
}

interface ApiResponseQueryMetaAllmessages {
	name: string;
	normalizedname: string;
	missing?: true;
	content?: string; // Missing if "missing" is true
}

interface ApiResponseQuerySiteinfoSpecialpagealiases {
	realname: string;
	aliases: string[];
}

interface ApiResponseQueryUserinfoRights {
	id: number;
	name: string;
	rights: string[];
}

export interface BlockLink {
	index: number;
	anchor: HTMLAnchorElement;
	type: 'block' | 'unblock';
	target: string;
	query: URLQueryParams;
}

export interface URLQueryParams {
	[key: string]: string | number;
}

/**
 * Picks method names whose return type extends string.
 */
export type StringMethodKeys<T> = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[K in keyof T]: T[K] extends (...args: any[]) => string ? K : never
}[keyof T];

/**
 * List of messsages added by AjaxBlock.
 */
export interface AjaxBlockMessages {
	'ajaxblock-dialog-button-label-block': string;
	'ajaxblock-dialog-button-label-unblock': string;
	'ajaxblock-dialog-button-label-docs': string;
	'ajaxblock-dialog-button-label-config': string;
	// 'ajaxblock-dialog-blockoption-createaccount': string;
	// 'ajaxblock-dialog-blockoption-sendemail': string;
	// 'ajaxblock-dialog-blockoption-editowntalk': string;
	// 'ajaxblock-dialog-blockoption-hardblock': string;
	// 'ajaxblock-dialog-blockoption-watchuser': string;
}

/**
 * List of built-in messsages reused by AjaxBlock.
 */
export interface MediaWikiMessages {
	'block': string;
	'block-target': string;
	'block-expiry': string;
	'ipboptions': string;
	'ipbother': string;
	'ipbreason-dropdown': string;
	'htmlform-selectorother-other': string;
	'block-reason': string;
	'block-reason-other': string;

	'unblock': string;
	'block-removal-reason-placeholder': string;
}

/**
 * List of all messsages used by AjaxBlock, including built-in and script-specific messages.
 */
export interface LoadedMessages extends AjaxBlockMessages, MediaWikiMessages {}

export interface CachedMessage {
	'ipbreason-dropdown': readonly Record<string, string | Record<string, string>>;
	'ipboptions': readonly Map<string, string>;
}
