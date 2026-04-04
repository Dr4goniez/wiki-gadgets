import { XOR } from 'ts-essentials';
import { ApiResponseQueryListLogevents } from './InvestigateHelper';

declare global {
	interface Window {
		ajaxBlockLoaded?: true;
	}
}

export type BlockPageNames = 'Block' | 'Unblock';

export type BlockActions = 'block' | 'unblock';

/**
 * Object that holds required data for script initialization.
 *
 * Note: Page name aliases use **underscores**, not spaces.
 */
export interface Initializer {
	blockPageAliases: Record<BlockPageNames, readonly string[]>;
	specialNamespaceAliases: readonly string[];
	userRights: Set<string>;
	actionRestrictions: readonly string[];
	multiBlocksEnabled: boolean;
}

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
	'ajaxblock-dialog-block-label-reason1': string;
	'ajaxblock-dialog-block-label-reason2': string;
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
	'ajaxblock-notify-warning-invalidparamvalue-pages': string;
	'ajaxblock-notify-warning-invalidparamvalue-namespaces': string;
	'ajaxblock-confirm-block-self': string;
	'ajaxblock-confirm-block-noexpiry': string;
	'ajaxblock-confirm-block-noreason': string;
	'ajaxblock-confirm-block-hideuser': string;
	'ajaxblock-confirm-unblock': string;
	'ajaxblock-confirm-unblock-self': string;
	'ajaxblock-confirm-unblock-noreason': string;
	'ajaxblock-confirm-dialog-title-block': string;
	'ajaxblock-confirm-dialog-title-unblock': string;
	'ajaxblock-confirm-dialog-label-instruction': string;
	'ajaxblock-confirm-dialog-label-opendialog': string;
	'ajaxblock-result-block-success': string;
	'ajaxblock-result-block-failure': string;
	'ajaxblock-result-unblock-success': string;
	'ajaxblock-result-unblock-failure': string;
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
	'ipbreason-dropdown': readonly Record<string, string | Record<string, string>>;
	'ipboptions': readonly Map<string, string>;
}

export type BlockTargetType = 'anon' | 'temp' | 'named' | null;

export interface PartialBlockParams {
	partial: boolean;
	pagerestrictions?: string;
	namespacerestrictions?: string;
	actionrestrictions?: string;
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
		newblock: boolean;
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
	| 'dialog'
	| 'oneclick';

export type TargetHandler =
	| { message: () => string }
	| { log: () => JQuery.Promise<OO.ui.RadioOptionWidget[] | JQuery<HTMLElement> | null> }
	| { none: true };

export interface ParamApplierBlockParams {
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
	watch: boolean | null;
}

export interface ParamApplierUnblockParams {
	reason: string;
	watch: boolean;
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
	watch: ParamApplierHandler<boolean, boolean | null>;
}