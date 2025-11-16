export type InterfaceDirection = 'ltr' | 'rtl';

/**
 * The parent node that rollback links should look for to generate SR checkboxes.
 * * `string` - The CSS selector of the parent node.
 * * `false` - No checkboxes should be generated.
 * * `null` - The current page is Recentchanges or Watchlist.
 */
export type ParentNode = 'li' | '#mw-diff-ntitle2' | false | null;

declare global {
	interface Window {
		selectiveRollbackConfig?: Partial<SelectiveRollbackConfigObjectLegacy>;
	}
}

type WatchlistExpiry = 'indefinite' | 'infinite' | 'infinity' | 'never' | '1 week' | '1 month' | '3 months' | '6 months' | '1 year';

export interface SelectiveRollbackConfigObjectLegacy {
	lang?: string;
	editSummaries?: Record<string, string>;
	showKeys?: boolean;
	specialExpressions?: Record<string, string>;
	markBot?: boolean;
	watchPage?: boolean;
	watchExpiry?: WatchlistExpiry;
	confirm?: SRConfirm;
	mobileConfirm?: SRConfirm;
	checkboxLabelColor?: string;
}

export interface SelectiveRollbackConfigObject extends Omit<SelectiveRollbackConfigObjectLegacy,
	// Renamed config keys
	| 'specialExpressions'
	| 'watchPage'
	| 'watchExpiry'
	| 'confirm'
> {
	// Renamed config keys
	replacementExpressions?: Record<string, string>;
	watchlist?: boolean;
	watchlistExpiry?: WatchlistExpiry;
	desktopConfirm?: SRConfirm;
	// Non-legacy config keys
	mergeSummaries?: boolean;
	mergeReplacers?: boolean;
	configLink?: boolean;
	purgerLink?: boolean;
}

export type ConfigRetriever = <T extends ConfigDomain>(
	domain: T
) => (
	T extends 'localexists' ? Record<string, string> | null :
	T extends ConfigDomain ? SelectiveRollbackConfigObject | null : never
);

/**
 * Creates a variant of type T where all non-boolean properties are allowed to take the value `null`
 * in addition to their original type.
 *
 * How it works:
 *
 * For each property K in T:
 * * If the property type extends `boolean`, it is left unchanged.
 * * Otherwise, the property type is widened to `T[K] | null`.
 */
export type NullableNonBoolean<T> = {
	[K in keyof T]: T[K] extends boolean ? T[K] : T[K] | null;
};

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

export type Languages = 'ja' | 'en' | 'zh' | 'es' | 'ro' | 'vi' | 'ar';

export interface Messages {
	/** Optional translation for "Selective Rollback". */
	'scriptname': string;
	/** Tooltip for the portlet link used to open the SR dialog. */
	'portlet-tooltip-dialog': string;
	/** Label (and tooltip) for the portlet link used to purge cache for Selective Rollback. */
	'portlet-label-uncacher': string;
	/** The label for the edit summary dropdown. */
	'dialog-label-summary': string;
	/** The text for the default edit summary dropdown option. */
	'dialog-label-summary-default': string;
	/** The text for the custom edit summary dropdown option. */
	'dialog-label-summary-custom': string;
	/** The label for the custom edit summary inputbox. */
	'dialog-label-summaryinput': string;
	/** Help text saying $0 will be replaced with the default edit summary. */
	'dialog-help-summaryinput-$0': string;
	/** [Contains a \<b> tag]: Help text saying $0 will be replaced with the default edit summary **in English**. */
	'dialog-help-summaryinput-$0-error': string;
	/** The label for the summary preview div. */
	'dialog-label-summarypreview': string;
	/** Help text for summary preview saying {{PLURAL}} will be parsed. */
	'dialog-help-summarypreview': string;
	/** The label for the markbot checkbox. */
	'dialog-label-markbot': string;
	/** The label for the watch-page checkbox. */
	'dialog-label-watchlist': string;
	/** The label for the watch-expiry dropdown. */
	'dialog-label-watchlistexpiry': string;
	/** The text for the indefinite expiry dropdown option. */
	'dialog-label-watchlistexpiry-indefinite': string;
	/** The text for the 1-week expiry dropdown option. */
	'dialog-label-watchlistexpiry-1week': string;
	/** The text for the 1-month expiry dropdown option. */
	'dialog-label-watchlistexpiry-1month': string;
	/** The text for the 3-month expiry dropdown option. */
	'dialog-label-watchlistexpiry-3months': string;
	/** The text for the 6-month expiry dropdown option. */
	'dialog-label-watchlistexpiry-6months': string;
	/** The text for the 1-year expiry dropdown option. */
	'dialog-label-watchlistexpiry-1year': string;
	/** The text for the "Rollback" dialog button. */
	'dialog-button-rollback': string;
	/** The text for the "Docs" dialog button. */
	'dialog-button-documentation': string;
	/** The text for the "Config" dialog button. */
	'dialog-button-config': string;
	/** The text for the "Select all" dialog button. */
	'dialog-button-selectall': string;
	/** The text for "Selected: n", displayed on the side of the "Select all" button. */
	'dialog-label-selectcount': string;
	/** The text for the "Close" dialog button. */
	'dialog-button-close': string;
	/** A mw.notify message for when no checkbox is checked for selective rollback. */
	'rollback-notify-noneselected': string;
	/** A mw.notify message for when there's no checkbox to check when the "Select all" button is hit. */
	'rollback-notify-linksresolved': string;
	/** An OO.ui.confirm message for rollback confirmation. */
	'rollback-confirm': string;
	/** The text for reverted rollback links. */
	'rollback-label-success': string;
	/** The text for non-reverted rollback links. */
	'rollback-label-failure': string;
	/** Internal text ("Success") for a mw.notify message that shows how many rollbacks succeeded. */
	'rollback-notify-success': string;
	/** Internal text ("Failure") for a mw.notify message that shows how many rollbacks failed. */
	'rollback-notify-failure': string;
	'config-title': string;
	'config-tab-local': string;
	'config-tab-global': string;
	'config-notice-local': string;
	'config-notice-global': string;
	'config-default': string;
	'config-default-disabled': string;
	'config-default-enabled': string;
	'config-label-lang': string;
	'config-help-lang': string;
	'config-label-summary': string;
	'config-label-propertyinput-key': string;
	'config-label-propertyinput-value': string;
	/** `$1` - Input value */
	'config-error-propertyinput-key-empty': string;
	/** `$1` - Input value */
	'config-error-propertyinput-value-empty': string;
	/** `$1` - Input value */
	'config-error-propertyinput-key-reserved': string;
	/** `$1` - Input value */
	'config-error-propertyinput-key-duplicate': string;
	'config-button-add': string;
	'config-button-remove': string;
	'config-button-deselectall': string;
	'config-help-summary-$0': string;
	'config-help-summary-$1': string;
	'config-help-summary-$2': string;
	'config-help-summary-$3': string;
	'config-help-summary-$4': string;
	'config-help-summary-$5': string;
	'config-help-summary-$6': string;
	'config-help-summary-$7': string;
	'config-label-showkeys': string;
	'config-label-mergesummaries': string;
	'config-label-replacer': string;
	'config-help-replacer': string;
	'config-label-mergereplacers': string;
	'config-label-watchlist': string;
	'config-label-watchlistexpiry': string;
	'config-label-confirmation': string;
	'config-label-confirmation-desktop': string;
	'config-label-confirmation-mobile': string;
	'config-label-confirmation-always': string;
	'config-label-confirmation-never': string;
	'config-label-confirmation-RCW': string;
	'config-label-confirmation-nonRCW': string;
	'config-label-checkboxlabelcolor': string;
	'config-help-checkboxlabelcolor': string;
	'config-label-miscellaneous': string;
	'config-help-markbot': string;
	'config-label-configlink': string;
	'config-label-purger': string;
	'config-button-save': string;
	'config-notify-save-success': string;
	/** `$1` - Comma-delimited error codes */
	'config-notify-save-failure': string;
	'config-button-reset': string;
	'config-confirm-reset': string;
	'config-notify-reset': string;
	'config-label-deleteglobal': string;
	'config-help-deleteglobal-absent': string;
	'config-label-deletelocal': string;
	'config-help-deletelocal-absent': string;
	'config-label-deletelocalall': string;
	'config-help-deletelocalall-present': string;
	'config-help-deletelocalall-absent': string;
	'config-label-deletedata': string;
	'config-button-deletedata': string;
	'config-confirm-deletedata': string;
	'config-notify-deletedata-success': string;
	'config-notify-deletedata-failure': string;
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

export interface SRBox {
	$wrapper: JQuery<HTMLSpanElement>;
	$label: JQuery<HTMLLabelElement>;
	$checkbox: JQuery<HTMLInputElement>;
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

export type ConfigDomain = 'local' | 'global' | 'localexists';

export type DeleteConfigCallback = (types: Omit<ConfigDomain, 'localexists'>[]) => unknown;

export interface KeyValueCollectionRow {
	checkbox: OO.ui.CheckboxInputWidget;
	keyInput: OO.ui.TextInputWidget;
	keyLayout: OO.ui.FieldLayout;
	valueInput: OO.ui.TextInputWidget;
	valueLayout: OO.ui.FieldLayout;
	layout: OO.ui.HorizontalLayout;
}

/**
 * Represents a single key–value input pair involved in duplicate-key detection.
 * These objects contain the input widget and the FieldLayout used to display errors.
 */
export interface KeyValueCollectionDuplicateKey {
	input: OO.ui.TextInputWidget;
	layout: OO.ui.FieldLayout;
}

/**
 * Description of a validation error associated with a field.
 *
 * Each error descriptor:
 * - Knows which field (input + layout) the error belongs to.
 * - Knows the message key to display for this error.
 * - Stores `invalidValue` which is the value that originally triggered the error.
 * - Provides a `validator()` function that determines when this error should clear.
 *
 * The validator receives an array of the *currently active* error descriptors of
 * the same error type (e.g., duplicate-key errors grouped together).
 *
 * It returns:
 * * `null` - if the error should *remain*
 * * `[]` - also means the error should remain
 * * `KeyValueCollectionDuplicateKey[]` - fields whose errors should be cleared
 *
 * Returning a non-empty array instructs `applyErrors()` to clear UI errors on
 * those specific fields and detach their change handlers.
 */
export interface KeyValueCollectionErrorDesc extends KeyValueCollectionDuplicateKey {
	msgKey: keyof Messages;
	invalidValue: string;
	/**
	 * @param descs An array of error description objects collected together with `this`.
	 * Those in which the relevant error has already been cleared are not included.
	 * @returns The fields to clear errors, or `null` if the errors should persist.
	 */
	validator: (
		this: KeyValueCollectionErrorDesc,
		descs: KeyValueCollectionErrorDesc[]
	) => KeyValueCollectionDuplicateKey[] | null;
}