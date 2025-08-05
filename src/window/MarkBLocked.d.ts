/**
 * Options that control which types of user links are marked up based on block or lock status.
 */
export interface UserOptions {
	/**
	 * Whether to generate a portlet link to the config page.
	 */
	genportlet: boolean;
	/**
	 * Whether to mark up IPs that fall within locally blocked IP ranges.
	 */
	rangeblocks: boolean;
	/**
	 * Whether to mark up users who are globally locked.
	 */
	g_locks: boolean;
	/**
	 * Whether to mark up users and IPs that are globally blocked.
	 */
	g_blocks: boolean;
	/**
	 * Whether to mark up IPs that fall within globally blocked IP ranges.
	 */
	g_rangeblocks: boolean;
}

export interface ConstructorConfig {
	/**
	 * Optional default values for user options. These will be merged into the built-in defaults.
	 */
	defaultOptions?: Partial<UserOptions>;
	/**
	 * The key used for `mw.user.options`, defaulting to `userjs-markblocked-config`.
	 */
	optionKey?: string;
	/**
	 * If `true`, saves the options in global preferences.
	 */
	globalize?: boolean;
	/**
	 * A language object to merge into `MarkBLocked.i18n`. This allows customizing the default interface
	 * messages or adding new interface languages. For the latter to work, the {@link lang} property
	 * must also be set.
	 */
	i18n?: Record<string, Lang>;
	/**
	 * The language code to use for interface messages. Defaults to `en`.
	 */
	lang?: string;
}

export interface Lang {
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
	/** `$1`: Domain, `$2`: CIDR range, `$3`: Expiry, `$4`: Blocking admin, `$5`: Reason */
	'title-rangeblocked': string;
	/** `$1`: Locking steward, `$2`: "Since" timestamp, `$3`: Reason */
	'title-locked': string;
}

declare global {
	interface Window {
		MarkBLockedLoaded?: boolean;
	}
}

export interface SpecialPageAliases {
	Contributions?: string[];
	IPContributions?: string[];
	GlobalContributions?: string[];
	CentralAuth?: string[];
}

/**
 * Regular expressions to collect user-related links.
 */
export interface LinkRegex {
	/**
	 * `/wiki/PAGENAME`: $1: PAGENAME
	 */
	article: RegExp;
	/**
	 * `/w/index.php?title=PAGENAME`: $1: PAGENAME
	 */
	script: RegExp;
	/**
	 * `^Special:(?:Contribs|CA)($|/)`
	 */
	special: RegExp;
	/**
	 * `^(?:Special:.../|User:)(USERNAME|CIDR)`: $1: USERNAME or CIDR
	 */
	user: RegExp;
}

export interface ApiResponse {
	query?: ApiResponseQuery;
}

export interface ApiResponseQuery {
	specialpagealiases?: ApiResponseQuerySpecialpagealiases[];
	blocks?: ApiResponseQueryListBlocks[];
	globalallusers?: ApiResponseQueryListGlobalallusers[];
	globalblocks?: ApiResponseQueryListGlobalblocks[];
	logevents?: ApiResponseQueryListLogevents[];
}

export interface ApiResponseQuerySpecialpagealiases {
	realname: string;
	aliases: string[];
}

export interface ApiResponseQueryListBlocks {
	user: string;
	by: string;
	expiry: string;
	reason: string;
	partial: boolean;
}

export interface ApiResponseQueryListGlobalallusers {
	locked?: string;
}

export interface ApiResponseQueryListGlobalblocks {
	target: string;
	by: string;
	expiry: string;
	reason: string;
}

export interface ApiResponseQueryListLogevents {
	/**
	 * Note: This is basically of type `Record<string, any>`. Keys and values for this property are radically different
	 * depending on what kind of logevent we fetch.
	 */
	params?: {
		added?: string[];
		removed?: string[];
	};
	user?: string;
	timestamp?: string;
	comment?: string;
}