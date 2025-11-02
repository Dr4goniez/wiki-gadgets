/**
 * The parent node that rollback links should look for to generate SR checkboxes.
 * * `string` - The CSS selector of the parent node.
 * * `false` - No checkboxes should be generated.
 * * `null` - The current page is Recentchanges or Watchlist.
 */
export type ParentNode = 'li' | '#mw-diff-ntitle2' | false | null;

declare global {
	interface Window {
		selectiveRollbackConfig?: Partial<SelectiveRollbackConfig>;
	}
}

export interface SelectiveRollbackConfig {
	lang: string;
	editSummaries: Record<string, string>;
	showKeys: boolean;
	specialExpressions: Record<string, string>;
	markBot: boolean;
	watchPage: boolean;
	watchExpiry: 'indefinite' | 'infinite' | 'infinity' | 'never' | '1 week' | '1 month' | '3 months' | '6 months' | '1 year';
	confirm: SRConfirm;
	mobileConfirm: SRConfirm;
	checkboxLabelColor: string;
}

export type SRConfirm = 'always' | 'never' | 'RCW' | 'nonRCW';

export type IsOfType = <T extends 'string' | 'number' | 'bigint' | 'boolean' | 'symbol' | 'undefined' | 'object' | 'function' | 'null'>(
	expectedType: T,
	value: unknown,
	key: string
) => value is (
	T extends 'string' ? string :
	T extends 'number' ? number :
	T extends 'bigint' ? bigint :
	T extends 'boolean' ? boolean :
	T extends 'symbol' ? symbol :
	T extends 'undefined' ? undefined :
	T extends 'object' ? object :
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	T extends 'function' ? (...args: any[]) => any :
	T extends 'null' ? null : never
);

export type Languages = 'ja' | 'en' | 'zh' | 'es' | 'ro' | 'vi';

export interface Messages {
	/** Tooltip for the portlet link used to open the SR dialog. */
	'portletlink-main-tooltip': string;
	/** Label (and tooltip) for the portlet link used to purge cache for Selective Rollback. */
	'portletlink-uncacher-label': string;
	/** The label for the edit summary dropdown. */
	'summary-label-primary': string;
	/** The text for the default edit summary dropdown option. */
	'summary-option-default': string;
	/** The text for the custom edit summary dropdown option. */
	'summary-option-custom': string;
	/** The label for the custom edit summary inputbox. */
	'summary-label-custom': string;
	/** Help text saying $0 will be replaced with the default edit summary. */
	'summary-help-$0': string;
	/** [Contains a \<b> tag]: Help text saying $0 will be replaced with the default edit summary **in English**. */
	'summary-help-$0-error': string;
	/** The leading text for replacement expressions. */
	'summary-help-specialexpressions': string;
	/** The label for the summary preview div. */
	'summary-label-preview': string;
	/** Help text for summary preview saying {{PLURAL}} will be parsed. */
	'summary-help-preview': string;
	/** The label for the markbot checkbox. */
	'markbot-label': string;
	/** The label for the watch-page checkbox. */
	'watchlist-label': string;
	/** The label for the watch-expiry dropdown. */
	'watchlist-expiry-label': string;
	/** The text for the indefinite expiry dropdown option. */
	'watchlist-expiry-indefinite': string;
	/** The text for the 1-week expiry dropdown option. */
	'watchlist-expiry-1week': string;
	/** The text for the 1-month expiry dropdown option. */
	'watchlist-expiry-1month': string;
	/** The text for the 3-month expiry dropdown option. */
	'watchlist-expiry-3months': string;
	/** The text for the 6-month expiry dropdown option. */
	'watchlist-expiry-6months': string;
	/** The text for the 1-year expiry dropdown option. */
	'watchlist-expiry-1year': string;
	/** The text for the "Rollback" dialog button. */
	'button-rollback': string;
	/** The text for the "Docs" dialog button. */
	'button-documentation': string;
	/** The text for the "Select all" dialog button. */
	'button-selectall': string;
	/** The text for the "Close" dialog button. */
	'button-close': string;
	/** A mw.notify message for when no checkbox is checked for selective rollback. */
	'msg-nonechecked': string;
	/** A mw.notify message for when there's no checkbox to check when the "Check all" button is hit. */
	'msg-linksresolved': string;
	/** An OO.ui.confirm message for rollback confirmation. */
	'msg-confirm': string;
	/** The text for reverted rollback links. */
	'rbstatus-reverted': string;
	/** The text for non-reverted rollback links. */
	'rbstatus-failed': string;
	/** Internal text ("Success") for a mw.notify message that shows how many rollbacks succeeded. */
	'rbstatus-notify-success': string;
	/** Internal text ("Failure") for a mw.notify message that shows how many rollbacks failed. */
	'rbstatus-notify-failure': string;
}

export interface MetaInfo {
	/** The raw `revertpage` message. */
	summary: string;
	/** The `revertpage` message with {{PLURAL}} magic words parsed. */
	parsedsummary: string;
	/** Whether the default rollback summary was fetched. */
	fetched: boolean;
	/** The current user's user rights. */
	rights: Set<string>;
}

export interface ApiResponse {
	parse?: ApiResponseParse;
	query?: ApiResponseQuery;
}

interface ApiResponseParse {
	title: 'API';
	pageid: number;
	parsedsummary: string;
}

interface ApiResponseQuery {
	allmessages?: ApiResponseQueryMetaAllmessages[];
	userinfo?: ApiResponseQueryMetaUserinfo;
}

interface ApiResponseQueryMetaAllmessages {
	name: string;
	normalizedname: string;
	missing?: true;
	content?: string; // Missing if "missing" is true
}

interface ApiResponseQueryMetaUserinfo {
	id: number;
	name: string;
	rights?: string[];
}

export interface Box {
	$label: JQuery<HTMLLabelElement>;
	$checkbox: JQuery<HTMLInputElement>;
}

export interface SRBox extends Box {
	$wrapper: JQuery<HTMLSpanElement>;
}

export interface RollbackLink {
	rbspan: HTMLSpanElement;
	box: SRBox?;
}

export interface RollbackLinkMap {
	[index: string]: RollbackLink;
}

/**
 * Additional parameters to `action=rollback`.
 */
export interface RollbackParams {
	/** An empty string will be altered with the default summary by the mediawiki software. */
	summary: string;
	markbot: boolean;
	/** Default: `'preferences'` */
	watchlist: 'nochange' | 'preferences' | 'unwatch' | 'watch';
	watchlistexpiry?: string;
}