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

export interface Messages {
	/** Tooltip for the portlet link used to open the SR dialog. */
	'portletlink-tooltip': string;
	/** The label for the edit summary dropdown. */
	'summary-label-primary': string;
	/** The text for the default edit summary dropdown option. */
	'summary-option-default': string;
	/** The text for the custom edit summary dropdown option. */
	'summary-option-custom': string;
	/** The label for the custom edit summary inputbox. */
	'summary-label-custom': string;
	/** Tooltip that says $0 will be replaced with the default edit summary. */
	'summary-tooltip-$0': string;
	/** [Contains a \<b> tag]: Tooltip that says $0 will be replaced with the default edit summary **in English**. */
	'summary-tooltip-$0-error': string;
	/** The leading text for replacement expressions. */
	'summary-tooltip-specialexpressions': string;
	/** The label for the summary preview div. */
	'summary-label-preview': string;
	/** Tooltip that says magic words in previewed summary will be replaced. */
	'summary-tooltip-preview': string;
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
	/** The text for the 3-year expiry dropdown option. */
	'watchlist-expiry-3years': string;
	/** The text for the "Rollback checked" dialog button. */
	'button-rollbackchecked': string;
	/** The text for the "Check all" dialog button. */
	'button-checkall': string;
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

export type IsOfType = <T extends 'string' | 'number' | 'bigint' | 'boolean' | 'symbol' | 'undefined' | 'object' | 'function' | 'null'>(
	expectedType: T,
	val: unknown,
	key: string
) => val is (
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