import { XOR } from 'ts-essentials';
import { ApiResponseQueryListLogevents } from './InvestigateHelper';

/**
 * Object that holds required data for script initialization.
 *
 * Note: Page name aliases use **underscores**, not spaces.
 */
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
	blocks?: ApiResponseQueryListBlocks[];
	logevents?: ApiResponseQueryListLogevents[];
	specialpagealiases?: ApiResponseQueryMetaSiteinfoSpecialpagealiases[];
	userinfo?: ApiResponseQueryMetaUserinfoRights;
}

/**
 * `bkprop=id|user|by|timestamp|expiry|reason|flags|restrictions`
 */
export interface ApiResponseQueryListBlocks {
	id: number;
	/** Missing for autoblocks */
	user?: string;
	by: string;
	timestamp: string;
	expiry: string;
	'duration-l10n': string;
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

interface ApiResponseQueryListBlocksRestrictions {
	pages?: ApiResponseQueryListBlocksPages[];
	namespaces?: number[];
	actions?: string[];
}

interface ApiResponseQueryListBlocksPages {
	id: number;
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
	'ajaxblock-title-unprocessable': string;
	'ajaxblock-dialog-button-label-block': string;
	'ajaxblock-dialog-button-label-unblock': string;
	'ajaxblock-dialog-button-label-docs': string;
	'ajaxblock-dialog-button-label-config': string;
	'ajaxblock-dialog-block-label-reason1': string;
	'ajaxblock-dialog-block-label-reason2': string;
	'ajaxblock-dialog-block-label-partial': string;
	'ajaxblock-dialog-block-label-option-autoblock': string;
	'ajaxblock-dialog-message-nonactive-id': string;
	'ajaxblock-dialog-message-unprocessable-id': string;
	'ajaxblock-dialog-message-existingblocks': string;
	'ajaxblock-notify-error-loadblocklogs': string;
}

/**
 * List of built-in messsages reused by AjaxBlock.
 */
export interface MediaWikiMessages {
	'colon-separator': string;

	'block': string;
	'block-target': string;
	'autoblockid': string;
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
	'ipb-action-create': string;
	'ipb-action-move': string;
	'ipb-action-upload': string;
	'ipb-action-thanks': string; // Added by extensions?

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
	'ipb-action-create': string;
	'ipb-action-move': string;
	'ipb-action-thanks': string;
	'ipb-action-upload': string;
	'logentry-partialblock-block-page': string;
	'logentry-partialblock-block-ns': string;
	'logentry-partialblock-block-action': string;
}

/**
 * List of all messsages used by AjaxBlock, including built-in and script-specific messages.
 */
export interface LoadedMessages extends AjaxBlockMessages, MediaWikiMessages {}

export interface CachedMessage {
	'ipbreason-dropdown': readonly Record<string, string | Record<string, string>>;
	'ipboptions': readonly Map<string, string>;
}

export interface BlockLink {
	anchor: HTMLAnchorElement;
	query: URLSearchParams;
	target: BlockTarget; // unresolved
	type: 'block' | 'unblock';
}

export interface BlockLinkMap {
	[idOrUser: string]: BlockLink[];
}

export interface UnblockLink extends BlockLink {}

export interface UnblockLinkMap {
	[idOrUser: string]: UnblockLink[];
}

export type BlockTargetType = 'anon' | 'temp' | 'named' | null;

export interface Target {
	id: number | null;
	username: string | null;
}

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

export interface BlockParams extends UserParams, PartialBlockParams, WatchUserParams {
	expiry: string;
	reason: string;
	anononly: boolean;
	autoblock: boolean;
	noemail: boolean;
	hidename: boolean;
	allowusertalk: boolean;
	reblock: boolean;
	newblock: boolean;
}

export interface UnblockParams extends UserParams, WatchUserParams {
	reason: string;
}