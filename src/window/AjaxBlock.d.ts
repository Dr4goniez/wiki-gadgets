import { XOR } from 'ts-essentials';
import { ApiResponseQueryListLogevents } from './InvestigateHelper';

declare global {
	interface Window {
		ajaxBlockLoaded?: true;
	}
}

export type BlockPageNames = 'Block' | 'Unblock';

export type BlockActions = 'block' | 'unblock';

export interface ApiResponse {
	block?: ApiResponseBlock;
	paraminfo?: ApiResponseParaminfo;
	query?: ApiResponseQuery;
	unblock?: ApiResponseUnblock;

	curtimestamp?: string;
}

interface ApiResponseParaminfo {
	helpformat: string;
	modules: ApiResponseParaminfoModules[];
}

/** @see ApiBase::getHelpFlags */
type ApiResponseHelpFlags =
	| 'deprecated'
	| 'internal'
	| 'readrights'
	| 'writerights'
	| 'mustbeposted';

type ApiResponseParaminfoModulesHelpmessages<K extends string> = {
	[P in K]:
		| string
		| {
			// helpformat=raw
			key: string;
			params: string[];
			forvalue?: string;
		};
};

interface ApiResponseParaminfoModules extends
	Partial<Record<ApiResponseHelpFlags, true>>,
	ApiResponseParaminfoModulesHelpmessages<'description'>
{
	name: string;
	classname: string;
	path: string;
	group?: string;
	prefix: string;
	source?: string;
	sourcename?: string;
	licensetag?: string;
	licenselink?: string;
	helpurls: string[];
	examples?: Partial<ApiResponseParaminfoModulesHelpmessages<'description'>> & {
		query: string;
	};
	parameters: ApiResponseParaminfoModulesParameters[];
	templatedparameters: ApiResponseParaminfoModulesParameters[];
}

interface ApiResponseParaminfoModulesParameters extends
	Partial<ApiResponseParaminfoModulesHelpmessages<'description'>>
{
	index: number;
	name: string;
	// <- templatevars
	// Delegated to ParamValidator::getParamInfo
	type: string | string[];
	required: boolean;
	deprecated?: true;
	sensitive?: true;
	default?: unknown;
	multi: boolean;
	lowlimit?: number;
	highlimit?: number;
	limit?: number;
	allowsduplicates?: true;
	allspecifier?: string;
	[key: string]: unknown; // TypeDef::getParamInfo (can be articulated)
	// -- ParamValidator::getParamInfo end --
	tokentype?: string;
	// <- info
}

interface ApiResponseQuery {
	allmessages?: ApiResponseQueryMetaAllmessages[];
	blocks?: ApiResponseQueryListBlocks[];
	interwiki?: ApiResponseQueryInterwikiTitles[];
	languageinfo?: {
		[code: string]: ApiResponseQueryMetaLanguageinfo;
	};
	logevents?: ApiResponseQueryListLogevents[];
	specialpagealiases?: ApiResponseQueryMetaSiteinfoSpecialpagealiases[];
	userinfo?: ApiResponseQueryMetaUserinfoRights;
	pages?: ApiResponseQueryPages[];
}

/**
 * `bkprop=id|user|by|timestamp|expiry|reason|flags|restrictions`
 */
export interface ApiResponseQueryListBlocks {
	id: number;
	/** Missing for autoblocks */
	user?: string;
	by: string;
	timestamp: string; // Cannot be fabricated from ApiResponseBlock
	expiry: string;
	// 'duration-l10n': string; // Cannot be fabricated from ApiResponseBlock
	reason: string;
	automatic: boolean;
	anononly: boolean;
	nocreate: boolean;
	autoblock: boolean;
	noemail: boolean;
	hidden: boolean;
	allowusertalk: boolean;
	partial: boolean;
	restrictions: [] | ApiResponseQueryListBlocksRestrictions;
}

export interface ApiResponseQueryListBlocksRestrictions {
	pages?: ApiResponseQueryListBlocksPages[];
	namespaces?: number[];
	actions?: string[];
}

interface ApiResponseQueryListBlocksPages {
	id?: number; // Generally defined, but missing when converted from ApiResponseBlock
	ns: number;
	title: string;
}

interface ApiResponseQueryMetaAllmessages {
	name: string;
	normalizedname: string;
	missing?: true;
	content?: string; // Missing if "missing" is true
}

interface ApiResponseQueryMetaLanguageinfo {
	autonym: string;
}

interface ApiResponseQueryMetaSiteinfoSpecialpagealiases {
	realname: string;
	aliases: string[];
}

interface ApiResponseQueryMetaUserinfoRights {
	id: number;
	name: string;
	rights: string[];
}

interface ApiResponseQueryPages {
	invalid?: true;
	invalidreason?: string;
	iw?: string;
	known?: true;
	missing?: true;
	ns?: number;
	pageid?: number;
	revid?: number;
	special?: true;
	title: string;
	url?: string;
}

interface ApiResponseQueryInterwikiTitles {
	title: string;
	iw: string;
	url?: string;
}

// Temporary hack around T420404
interface CurtimestampToTimestamp {
	timestamp: string;
}

export interface ApiResponseBlock extends CurtimestampToTimestamp {
	user: string;
	userID: number;
	expiry: string;
	id: number;
	reason: string;
	anononly: boolean;
	nocreate: boolean;
	autoblock: boolean;
	noemail: boolean;
	hidename: boolean;
	allowusertalk: boolean;
	watchuser: boolean;
	watchlistexpiry?: string;
	partial: boolean;
	pagerestrictions: string[] | null;
	namespacerestrictions: number[] | null;
	actionrestrictions: string[] | null;
}

export interface ApiResponseUnblock {
	user: string;
	userid: number;
	expiry: string;
	id: number;
	reason: string;
	watchuser: boolean;
	watchlistexpiry?: string;
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
	'ajaxblock-link-title-unprocessable': string;
	'ajaxblock-dialog-button-label-block': string;
	'ajaxblock-dialog-button-label-unblock': string;
	'ajaxblock-dialog-button-label-docs': string;
	'ajaxblock-dialog-button-label-config': string;
	'ajaxblock-dialog-block-placeholder-preset': string;
	'ajaxblock-notify-block-placeholder-preset': string;
	'ajaxblock-dialog-block-label-reason1': string;
	'ajaxblock-dialog-block-label-reason2': string;
	'ajaxblock-dialog-block-label-customreasons': string;
	'ajaxblock-dialog-block-label-partial': string;
	'ajaxblock-dialog-block-label-option-autoblock': string;
	'ajaxblock-dialog-message-nonactive-id': string;
	'ajaxblock-dialog-message-existingblocks': string;
	'ajaxblock-dialog-message-existingblocks-canadd': string;
	'ajaxblock-dialog-message-existingblocks-unblock': string;
	'ajaxblock-dialog-message-existingblocks-dialogonly': string;
	'ajaxblock-dialog-message-predefinedparams-block': string;
	'ajaxblock-dialog-message-predefinedparams-unblock': string;
	'ajaxblock-dialog-message-applyparams-short': string;
	'ajaxblock-dialog-message-applyparams-long': string;
	'ajaxblock-dialog-message-blocklog-missing': string;
	'ajaxblock-notify-error-loadblocklogs': string;
	'ajaxblock-notify-error-idinactivenousername': string;
	'ajaxblock-notify-error-cannotunblock': string;
	'ajaxblock-notify-error-ambiguousblock': string;
	'ajaxblock-notify-error-ambiguousblock-canadd': string;
	'ajaxblock-notify-error-notarget': string;
	'ajaxblock-notify-error-emptyblock': string;
	'ajaxblock-notify-error-processing': string;
	'ajaxblock-notify-error-noblocklinks': string;
	'ajaxblock-notify-error-cannotopendialog': string;
	'ajaxblock-notify-error-cannotopendialog-oneclick': string;
	'ajaxblock-notify-error-paramapplier-presetsnotready': string;
	'ajaxblock-notify-warning-paramapplier-filtered-top': string;
	'ajaxblock-notify-warning-paramapplier-filtered-pages': string;
	'ajaxblock-notify-warning-paramapplier-filtered-namespaces': string;
	'ajaxblock-confirm-block-noreason': string;
	'ajaxblock-confirm-block-noexpiry': string;
	'ajaxblock-confirm-block-hardblock': string;
	'ajaxblock-confirm-block-hideuser': string;
	'ajaxblock-confirm-block-reblock': string;
	'ajaxblock-confirm-block-newblock': string;
	'ajaxblock-confirm-block-self': string;
	'ajaxblock-confirm-block-ignorepredefined': string;
	'ajaxblock-confirm-unblock': string;
	'ajaxblock-confirm-unblock-noreason': string;
	'ajaxblock-confirm-unblock-self': string;
	'ajaxblock-confirm-unblock-ignorepredefined': string;
	'ajaxblock-confirm-dialog-title-block': string;
	'ajaxblock-confirm-dialog-title-unblock': string;
	'ajaxblock-confirm-dialog-label-instruction': string;
	'ajaxblock-confirm-dialog-label-opendialog': string;
	'ajaxblock-result-block-success': string;
	'ajaxblock-result-block-failure': string;
	'ajaxblock-result-unblock-success': string;
	'ajaxblock-result-unblock-failure': string;
	'ajaxblock-config-title': string;
	'ajaxblock-config-loading': string;
	'ajaxblock-config-loading-failure': string;
	'ajaxblock-config-label-tab-common': string;
	'ajaxblock-config-label-tab-global': string;
	'ajaxblock-config-label-tab-local': string;
	'ajaxblock-config-label-tab-misc': string;
	'ajaxblock-config-label-default': string;
	'ajaxblock-config-label-languages-layout': string;
	'ajaxblock-config-label-languages-used': string;
	'ajaxblock-config-placeholder-languages-used': string;
	'ajaxblock-config-help-languages-used': string;
	'ajaxblock-config-label-languages-default': string;
	'ajaxblock-config-help-languages-default': string;
	'ajaxblock-config-label-warning-layout': string;
	'ajaxblock-config-label-warning-th-oneclick': string;
	'ajaxblock-config-label-warning-th-dialog': string;
	'ajaxblock-config-label-warning-block-noreason': string;
	'ajaxblock-config-label-warning-block-noexpiry': string;
	'ajaxblock-config-label-warning-block-hardblock': string;
	'ajaxblock-config-label-warning-block-hideuser': string;
	'ajaxblock-config-label-warning-block-reblock': string;
	'ajaxblock-config-label-warning-block-newblock': string;
	'ajaxblock-config-label-warning-block-self': string;
	'ajaxblock-config-label-warning-block-ignorepredefined': string;
	'ajaxblock-config-label-warning-unblock': string;
	'ajaxblock-config-label-warning-unblock-noreason': string;
	'ajaxblock-config-label-warning-unblock-self': string;
	'ajaxblock-config-label-warning-unblock-ignorepredefined': string;
	'ajaxblock-config-label-reset': string;
	'ajaxblock-config-label-override': string;
	'ajaxblock-config-label-presetreasons-layout': string;
	'ajaxblock-config-label-presetreasons-name': string;
	'ajaxblock-config-placeholder-presetreasons-name': string;
	'ajaxblock-config-message-presetreasons-name-empty': string;
	'ajaxblock-config-message-presetreasons-name-duplicate': string;
	'ajaxblock-config-notify-presetreasons-resolveerrors': string;
	'ajaxblock-config-label-presetreasons-target-named': string;
	'ajaxblock-config-label-presetreasons-target-temp': string;
	'ajaxblock-config-label-presetreasons-target-ip': string;
	'ajaxblock-config-placeholder-presetreasons-target': string;
	'ajaxblock-config-notice-presetreasons-additionaloptions': string;
	'ajaxblock-config-label-presetreasons-add': string;
	'ajaxblock-config-label-presetreasons-delete': string;
	'ajaxblock-config-placeholder-customreasons': string;
	'ajaxblock-config-label-customreasons-block-layout': string;
	'ajaxblock-config-label-customreasons-unblock-layout': string;
	'ajaxblock-config-help-customreasons-block': string;
	'ajaxblock-config-help-customreasons-unblock': string;
	'ajaxblock-config-label-purgecache': string;
	'ajaxblock-config-label-deletelocal': string;
	'ajaxblock-config-help-deletelocal-absent': string;
	'ajaxblock-config-label-deletelocalall': string;
	'ajaxblock-config-help-deletelocalall-present': string;
	'ajaxblock-config-help-deletelocalall-absent': string;
	'ajaxblock-config-label-deleteglobal': string;
	'ajaxblock-config-help-deleteglobal-absent': string;
	'ajaxblock-config-label-deletedata': string;
	'ajaxblock-config-label-deletedata-short': string;
	'ajaxblock-config-confirm-deletedata': string;
	'ajaxblock-config-notify-deletedata-success': string;
	'ajaxblock-config-notify-deletedata-failure': string;
}

/**
 * List of built-in messsages reused by AjaxBlock.
 */
export interface MediaWikiMessages {
	'colon-separator': string;
	'parentheses-start': string;
	'parentheses-end': string;
	'internalerror_info': string;

	'block': string;
	'block-target': string;
	'block-expiry': string;
	'infiniteblock': string;
	'ipboptions': string;
	'ipbother': string;
	'ipbreason-dropdown': string;
	'ipbreason-indef-dropdown': string;
	'htmlform-selectorother-other': string;
	'block-reason-other': string;

	'ipb-pages-label': string;
	'block-pages-placeholder': string;
	'ipb-namespaces-label': string;
	'block-namespaces-placeholder': string;

	'block-details': string;
	'ipbcreateaccount': string;
	'ipbemailban': string;
	'ipb-disableusertalk': string;

	'block-options': string;
	'ipb-hardblock': string;
	'ipbhidename': string;
	'ipbwatchuser': string;
	'watchlist-expiry-options': string;
	'block-create': string;

	'unblock': string;
	'block-reason': string;
	'block-removal-reason-placeholder': string;

	// Used in setTarget()
	'apierror-modify-autoblock': string;
	'autoblockid': string;

	'confirm': string;
	'cancel': string;

	// Copied from InvestigateHelper
	'logentry-block-block': string;
	'logentry-block-block-multi': string;
	'logentry-block-reblock': string;
	'logentry-partialblock-block': string;
	'logentry-partialblock-block-multi': string;
	'logentry-partialblock-reblock': string;
	'logentry-non-editing-block-block': string;
	'logentry-non-editing-block-block-multi': string;
	'logentry-non-editing-block-reblock': string;
	'block-log-flags-angry-autoblock': string;
	'block-log-flags-anononly': string;
	'block-log-flags-hiddenname': string;
	'block-log-flags-noautoblock': string;
	'block-log-flags-nocreate': string;
	'block-log-flags-noemail': string;
	'block-log-flags-nousertalk': string;
	'parentheses': string;
	'comma-separator': string;
	'and': string;
	'word-separator': string;
	'blanknamespace': string;
	'logentry-partialblock-block-page': string;
	'logentry-partialblock-block-ns': string;
	'logentry-partialblock-block-action': string;

	'blocked-notice-logextract': string;
	'blocked-notice-logextract-anon': string;

	// 'ipb-action-create': string;
	// 'ipb-action-move': string;
	// 'ipb-action-thanks': string;
	// 'ipb-action-upload': string;
}

/**
 * List of all messsages used by AjaxBlock, including built-in and script-specific messages.
 */
export interface LoadedMessages extends AjaxBlockMessages, MediaWikiMessages {}

export interface CachedMessage {
	'ipbreason-dropdown': Record<string, string | Record<string, string>>;
	'ipbreason-indef-dropdown': Record<string, string | Record<string, string>>;
	'ipboptions': Map<string, string>;
	'watchlist-expiry-options': Map<string, string>;
}

export type BlockTargetType = 'ip' | 'temp' | 'named' | null;

export interface AjaxBlockRegex {
	/**
	 * * `$0` - `/wiki/<title>`
	 * * `$1` - `<title>`
	 */
	article: RegExp;
	/**
	 * * `$0` - `Special:<root>/<subpage>`
	 * * `$1` - `<root>`
	 * * `$2`? - `<subpage>`
	 */
	special: RegExp;
	/**
	 * * `$0` - `Block` (+aliases, case-insensitive)
	 */
	block: RegExp;
	/**
	 * * `$0` - `Unblock` (+aliases, case-insensitive)
	 */
	unblock: RegExp;
}

export interface PartialBlockParams {
	partial: boolean;
	pagerestrictions?: string[];
	namespacerestrictions?: string[];
	actionrestrictions?: string[];
}

export interface WatchUserParams {
	watchuser?: true;
	watchlistexpiry?: string;
}

type UserParams = XOR<
	{ id: number; },
	{ user: string; }
>;

export type BaseParams =
	UserParams &
	WatchUserParams &
	{ action: BlockActions; };

export type BlockParams =
	BaseParams &
	PartialBlockParams &
	{
		action: 'block';
		expiry: string;
		reason: string;
		nocreate: boolean;
		noemail: boolean;
		allowusertalk: boolean;
		anononly?: boolean;
		autoblock?: boolean;
		hidename?: boolean;
		reblock?: true;
		newblock?: boolean;
	};

export type UnblockParams =
	BaseParams &
	{
		action: 'unblock';
		reason: string;
	};

export type AbortCallback = (reason: AbortReason) => void;

type AbortReason =
	| 'unprocessable'
	| 'nooneclick'
	| 'invalidparams'
	| 'unconfirmed'
	| 'unconfirmed-dialog'
	| 'noblocklinks'; // Internal error

export type WarningContext =
	| 'oneclick'
	| 'dialog';

export type BlockLogGenerator = () => JQuery.Promise<OO.ui.RadioOptionWidget[] | JQuery<HTMLElement> | null>;

export type TargetHandler =
	| { type: 'message'; message: () => string; }
	| { type: 'log'; log: BlockLogGenerator; }
	| { type: 'none'; };

interface ParamApplierWatchParams {
	watchuser: boolean | null;
	watchlistexpiry: string | null;
}

export interface ParamApplierBlockParams extends ParamApplierWatchParams {
	expiry: string;
	reason: string;
	hardblock: boolean;
	nocreate: boolean;
	autoblock: boolean;
	noemail: boolean;
	hidden: boolean;
	nousertalk: boolean;
	partial: boolean;
	pagerestrictions: string[];
	namespacerestrictions: number[] | string[];
	actionrestrictions: string[];
}

export interface ParamApplierUnblockParams extends ParamApplierWatchParams {
	reason: string;
}

interface ParamApplierHandler<SetterValue, GetterValue = SetterValue> {
	getter?: (value: GetterValue) => SetterValue | JQuery.Promise<SetterValue>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	setter: (value: SetterValue) => any;
}

export interface BlockParamApplierHandler {
	expiry: ParamApplierHandler<string>;
	reason: ParamApplierHandler<string>;
	hardblock: ParamApplierHandler<boolean>;
	nocreate: ParamApplierHandler<boolean>;
	autoblock: ParamApplierHandler<boolean>;
	noemail: ParamApplierHandler<boolean>;
	hidden: ParamApplierHandler<boolean>;
	nousertalk: ParamApplierHandler<boolean>;
	partial: ParamApplierHandler<boolean>;
	pagerestrictions: ParamApplierHandler<string[]>;
	namespacerestrictions: ParamApplierHandler<string[], number[] | string[]>;
	actionrestrictions: ParamApplierHandler<string[]>;
	watchuser: ParamApplierHandler<boolean | null>;
	watchlistexpiry: ParamApplierHandler<string | null>;
}

/**
 * Optional hooks for `ParamApplier.applyBlockParams`.
 *
 * These callbacks allow callers to integrate UI behavior (e.g. dialog state,
 * overlays, or additional side effects) without coupling the applier to a
 * specific implementation such as `BlockUser`.
 */
export interface BlockParamApplierHookOptions {
	/**
	 * Called after all synchronous parameter setters have been applied.
	 *
	 * This runs regardless of whether any asynchronous getters are present.
	 * Useful for lightweight side effects that should always occur.
	 */
	onAfterApply?: () => void;
	/**
	 * Called immediately before handling asynchronous parameter resolution.
	 *
	 * Typically used to put the UI into a "pending" state (e.g. disabling inputs
	 * or showing a loading overlay).
	 *
	 * Only invoked if at least one parameter getter returns a Promise.
	 */
	onBeforePromise?: () => void;
	/**
	 * Called after all asynchronous parameter setters have finished.
	 *
	 * Typically used to clear pending UI state and optionally surface errors.
	 */
	onAfterPromise?: () => void;
	/**
	 * If provided, translate target-dependent boolean values (e.g., coerce the
	 * "hardblock" parameter to `fase` for non-IP targets).
	 */
	targetType?: NonNullable<BlockTargetType>;
}

/**
 * Contextual metadata for `ParamApplier.applyBlockParams`.
 *
 * This object provides optional information used when generating user-facing
 * notifications (e.g. warnings about filtered or invalid restrictions).
 * It does not affect how parameters are applied—only how related messages
 * are presented.
 */
export interface BlockParamApplierContextOptions {
	/**
	 * Name of the preset being applied.
	 *
	 * When provided, this will be displayed in notifications to help identify
	 * the source of the applied parameters.
	 */
	preset?: string;
	/**
	 * Domain or configuration category associated with the preset.
	 *
	 * Used to append additional contextual information (e.g. tab labels)
	 * in notifications.
	 */
	domain?: AjaxBlockConfigDomains;
	/**
	 * Whether to prepend the script name (e.g. "AjaxBlock") to notifications.
	 *
	 * Useful for distinguishing messages originating from this script when
	 * multiple tools may emit notifications.
	 */
	scriptName?: boolean;
}

export type BlockParamApplierInvalidRestrictionMap = Partial<Record<'pages' | 'namespaces', Set<string>>>;

export interface BlockPresetJson {
	name: string;
	targets: NonNullable<BlockTargetType>[];
	params: ParamApplierBlockParams;
}

export type AjaxBlockLanguages = 'en' | 'ja';

export type AjaxBlockConfigVersions = 'current' | 'legacy';

export type AjaxBlockConfigDomains = 'local' | 'global';

export interface AjaxBlockLegacyConfigGlobal {
	lang: string;
	dropdown: string[];
}

export interface AjaxBlockLegacyConfigLocal {
	lang: string;
	dropdown: {
		local: string[];
		global: [];
	};
	preset: {
		block: Record<'user' | 'ip', AjaxBlockLegacyConfigBlockPresetOptions>;
		unblock: AjaxBlockLegacyConfigUnblockPresetOptions;
	};
	warning: Record<WarningContext, AjaxBlockLegacyConfigWarning>;
}

export interface AjaxBlockLegacyConfigWatchOptions {
	watchlist: boolean;
	watchlistexpiry: string;
}

interface AjaxBlockLegacyConfigBlockPresetOptions extends AjaxBlockLegacyConfigWatchOptions {
	user: string;
	reason: string;
	expiry: string;
	automatic: boolean;
	nocreate: boolean;
	noemail: boolean;
	allowusertalk: boolean;
	anononly: boolean;
	autoblock: boolean;
	hidden?: boolean;
	partial: boolean;
	restrictions: Omit<ApiResponseQueryListBlocksRestrictions, 'actions'>;
}

interface AjaxBlockLegacyConfigUnblockPresetOptions extends AjaxBlockLegacyConfigWatchOptions {
	reason: string;
}

export interface AjaxBlockLegacyConfigWarning {
	noReason: boolean;
	noExpiry: boolean;
	noPartialSpecs: boolean;
	willHardblock: boolean;
	willHideUser: boolean;
	willOverwrite: boolean;
	willIgnorePredefined: boolean;
	willBlockSelf: boolean;
	willUnblock: boolean;
}

export interface AjaxBlockLanguageConfig {
	used: AjaxBlockLanguages[];
	default: AjaxBlockLanguages | null;
}

export type WarningKeys =
	| 'block-noreason'
	| 'block-noexpiry'
	| 'block-hardblock'
	| 'block-hideuser'
	| 'block-reblock'
	| 'block-newblock'
	| 'block-self'
	| 'block-ignorepredefined'
	| 'unblock'
	| 'unblock-noreason'
	| 'unblock-self'
	| 'unblock-ignorepredefined';

export type AjaxBlockWarningConfig = Record<WarningKeys, Record<WarningContext, boolean>>;