export interface PagerHref {
	prev?: string;
	next?: string;
}

export type IP = typeof import('ip-wiki').IP;

export type MultiValue<T> = T | T[];

export interface UserInfoBase {
	/**
	 * Whether the username was collected from a foreign tab.
	 */
	foreign: boolean;
	/**
	 * Start of the date range as a UNIX timestamp.
	 */
	startUnix: number;
	/**
	 * End of the date range as a UNIX timestamp.
	 */
	endUnix: number;
}

export interface UserInfo extends UserInfoBase {
	/**
	 * The username.
	 */
	user: string;
	/**
	 * IP addresses associated with the username, if any.
	 */
	ips: (Omit<IpInfo, 'ip' | 'users'> & { ip : string })[];

}

export interface IpInfo extends UserInfoBase {
	ip: InstanceType<IP>;
	/**
	 * Usernames associated with the IP.
	 */
	users: Set<string>;
	/**
	 * The total number of actions by a registered user from the respective IP and User Agent.
	 */
	actions: number;
	/**
	 * The total number of actions from the respective IP.
	 */
	all: number;
}

export interface IpInfoLevel {
	/**
	 * The IP instance representing the CIDR block.
	 */
	ip: InstanceType<IP>;
	/**
	 * Set of indexes from the original `info` array covered by this CIDR.
	 */
	covers: Set<number>;
}

export interface ExtendedIpInfo extends IpInfo {
	contains?: IpInfo[];
}

export interface CollectedUsernames {
	users: UserInfo[];
	ips: IpInfo[];
}

export interface OriginalMessages {
	/**
	 * Label for the button that collects data from other Special:Investigate tabs.
	 */
	'investigatehelper-traverser-button': string;
	/**
	 * Main text shown in the screen overlay when the traverser is running.
	 */
	'investigatehelper-traverser-running-main': string;
	/**
	 * Label for the traverser counter shown in the screen overlay when the traverser is running.
	 */
	'investigatehelper-traverser-running-counter': string;
	/**
	 * Text displayed after the traverser completes, explaining the next steps to the user.
	 */
	'investigatehelper-traverser-notice': string;
	/**
	 * Additional text displayed after `investigatehelper-traverser-notice` if the traverser encountered an HTTP request failure.
	 */
	'investigatehelper-traverser-notice-http': string;
	/**
	 * Additional text displayed after `investigatehelper-traverser-notice` if the traverser was aborted before completion.
	 */
	'investigatehelper-traverser-notice-aborted': string;
	/**
	 * A `mw.notify` message shown when the traverser finishes running.
	 */
	'investigatehelper-traverser-complete': string;
	/**
	 * Label for the button to expand the dialog.
	 */
	'investigatehelper-dialog-button-expand': string;
	/**
	 * Label for the button to shrink the dialog.
	 */
	'investigatehelper-dialog-button-shrink': string;
	/**
	 * Label for the input box where the user enters an unblock reason in the dialog.
	 */
	'investigatehelper-dialog-unblockreason': string;
	/**
	 * The default unblock reason prefilled in the corresponding input box in the dialog.
	 */
	'investigatehelper-dialog-unblockreason-default': string;
	/**
	 * Text shown when a given IP block target contains other block targets (CIDR-wise).
	 *
	 * * `$1` – A comma-separated list of the contained block targets.
	 */
	'investigatehelper-dialog-blocktarget-contains': string;
	/**
	 * Text shown when a given IP block target is contained within other block targets (CIDR-wise).
	 *
	 * * `$1` – A comma-separated list of the containing block targets.
	 */
	'investigatehelper-dialog-blocktarget-containedin': string;
	/**
	 * A `mw.notify` message shown when no users are selected as block targets in the dialog.
	 */
	'investigatehelper-dialog-blocktarget-none': string;
	/**
	 * An `OO.ui.confirm` message shown when only unblock requests will be made.
	 */
	'investigatehelper-dialog-blocktarget-unblockonly': string;
	/**
	 * Warning text shown when mixed user types are selected as block targets.
	 *
	 * * `$1` - A comma-separated list of user types.
	 * * `$2` - An `<ul>` element listing the number of selected targets for each user type.
	 */
	'investigatehelper-dialog-blocktarget-mixed': string;
	/**
	 * Label for "registered accounts" (plural form).
	 */
	'investigatehelper-dialog-blocktarget-user': string;
	/**
	 * Label for "temporary accounts" (plural form).
	 */
	'investigatehelper-dialog-blocktarget-temp': string;
	/**
	 * Label for "IP addresses" (plural form).
	 */
	'investigatehelper-dialog-blocktarget-ip': string;
	/**
	 * A `mw.notify` message shown when all block/unblock requests are complete.
	 *
	 * * `$1` - The total number of requests.
	 * * `$2` - The number of successful requests.
	 * * `$3` - The number of failed requests.
	 */
	'investigatehelper-dialog-blocktarget-processed': string;
}

export interface LoadedMessages extends OriginalMessages {
	/** `'List'` */
	'tux-editor-translate-mode': string;
	/** `'User'` */
	'checkuser-helper-user': string;
	/** `'talk'` */
	'sp-contributions-talk': string;
	/** `'contribs'` */
	'contribslink': string;
	/** `'logs'` */
	'sp-contributions-logs': string;
	/** `'block log'` */
	'sp-contributions-blocklog': string;
	/** `'abuse log'` */
	'abusefilter-log-linkoncontribs': string;
	/** `'checks on'` */
	'checkuser-log-checks-on': string;
	/** `'global account'` */
	'centralauth-contribs-link': string;
	/** `'global contributions'` */
	'checkuser-global-contributions-link': string;
	/** `'Copy'` */
	'ooui-copytextlayout-copy': string;
	/** `'Copied'` */
	'checkuser-helper-copy-success': string;
	/** `'Could not copy'` */
	'checkuser-helper-copy-failed': string;

	/** `'<b>[$1 {{PLURAL:$1|action|actions}}]</b>'` */
	'checkuser-investigate-compare-table-cell-actions': string;
	/** `'<i>(~$1 from all users)</i>'` */
	'checkuser-investigate-compare-table-cell-other-actions': string;

	/** `'Block user'` */
	'block': string;
	/** `'Usernames and IP addresses'` */
	'checkuser-investigateblock-target': string;
	/** `'Add more...'` */
	'mw-widgets-usersmultiselect-placeholder': string;
	/** `'Investigate'` */
	'checkuser-investigate': string;
	/** `'Clear'` */
	'apisandbox-reset': string;
	/** `'Expiration'` */
	'block-expiry': string;
	/** `'2 hours:2 hours,1 day:1 day,...'` */
	'ipboptions': string;
	/** `'Other time:'` */
	'ipbother': string;
	/** `'Reason'` */
	'checkuser-investigateblock-reason': string;
	/** `'*Common block reasons\n...'` */
	'ipbreason-dropdown': string;
	/** `'Other'` */
	'htmlform-selectorother-other': string;
	/** `'Block details'` */
	'block-details': string;
	/** `'Account creation'` */
	'ipbcreateaccount': string;
	/** `'Sending email'` */
	'ipbemailban': string;
	/** `'Editing own talk page'` */
	'ipb-disableusertalk': string;
	/** `'Additional options'` */
	'block-options': string;
	/** `'(optional)'` */
	'htmlform-optional-flag': string;
	/** `'Block the last IP address used by this account,...'` */
	'ipbenableautoblock': string;
	/** `'{{PLURAL:$1|$1 day|$1 days}}'` */
	'days': string;
	/** `'Hide username from edits and lists'` */
	'ipbhidename': string;
	/** `'Apply block to logged-in users from this IP address'` */
	'ipb-hardblock': string;
	/** `'block'` */
	'blocklink': string;

	/** `'Error ($1)'` */
	'api-feed-error-title': string;
	/** `'Submit'` */
	'block-submit': string;
	/** `'Type a reason'` */
	'block-removal-reason-placeholder': string;
	/** `'empty'` */
	'historyempty': string;
	/** `'Add block'` */
	'block-create': string;
	/** `'Override existing blocks'` */
	'checkuser-investigateblock-reblock-label': string;
	/** `'Remove block'` */
	'block-removal-confirm-yes': string;
	/** `'Continue'` */
	'ooui-dialog-process-continue': string;
	/** `'Cancel'` */
	'ooui-dialog-message-reject': string;

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

export type Gender = 'male' | 'female' | 'unknown';

export type UserType = 'user' | 'temp' | 'ip' | 'cidr';

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
	normalized?: ApiResponseNormalized[];
	pages?: ApiResponsePageExistence[];
	blocks?: ApiResponseQueryListBlocks[];
	users?: ApiResponseQueryListUsers[];
	logevents?: ApiResponseQueryListLogevents[];
}

interface ApiResponseQueryMetaAllmessages {
	name: string;
	normalizedname: string;
	missing?: true;
	content?: string; // Missing if "missing" is true
}

interface ApiResponseNormalized {
	fromencoded: boolean;
	from: string;
	to: string;
}

interface ApiResponsePageExistence {
	ns: number;
	title: string;
	missing?: true;
	known?: true;
}

interface ApiResponseQueryListBlocks {
	id: number;
	user: string;
	timestamp: string;
}

interface ApiResponseQueryListUsers {
	userid: number;
	name: string;
	gender: Gender;
}

interface ApiResponseQueryListLogevents {
	params: ApiResponseQueryListLogeventsParams;
	type: 'block';
	action: 'block' | 'reblock' | 'unblock';
	user: string;
	timestamp: string;
	parsedcomment: string;
}

interface ApiResponseQueryListLogeventsParams {
	duration: string;
	flags: BlockFlags[];
	restrictions?: ApiResponseQueryListLogeventsParamsRestrictions;
	blockId: number;
	finalTargetCount?: number;
	sitewide: boolean;
	/**
	 * Missing for indefinite blocks
	 */
	expiry?: string;
	'duration-l10n': string;
}

export interface ApiResponseQueryListLogeventsParamsRestrictions {
	pages?: ApiResponseQueryListLogeventsParamsRestrictionsPages[];
	namespaces?: number[];
	actions?: BlockableActions[];
}

interface ApiResponseQueryListLogeventsParamsRestrictionsPages {
	page_ns: number;
	page_title: string;
}

type BlockableActions = 'create' | 'move' | 'thanks' | 'upload';

export interface UserList {
	user?: UserListItem[];
	ipv4?: IPFieldContent;
	ipv6?: IPFieldContent;
}

/**
 * Map of usernames to block ID data.
 */
export type BlockIdMap = Map<string, BlockIdMapValue>;

/**
 * Information about a user's active blocks.
 */
export interface BlockIdMapValue {
	/**
	 * Set of active block IDs.
	 */
	ids: Set<number>;
	/**
	 * Unix timestamp (in seconds) of the most recent block.
	 */
	latestTimestamp: number;
	/**
	 * Unix timestamp (in seconds) of the oldest block.
	 */
	earliestTimestamp: number;
}

export interface CategorizedUsername {
	/**
	 * The username.
	 */
	username: string;
	/**
	 * The type of the username.
	 */
	usertype: UserType;
	/**
	 * The abbreviated notation of `username`. Exists only if the usertype is `'ip'`.
	 */
	abbreviated?: string;
	/**
	 * IP addresses that the username covers.
	 *
	 * Exists only if the usertype is `'ip'` and may be an empty array.
	 */
	covers?: string[];
	/**
	 * IP addresses that are covered by the username.
	 *
	 * Exists only if the usertype is `'ip'` and may be an empty array.
	 */
	coveredBy?: string[];
}

export type BlockFlags = 'angry-autoblock' | 'anononly' | 'hiddenname' | 'noautoblock' | 'nocreate' | 'noemail' | 'nousertalk';

/**
 * Map of block IDs to log information to construct a log line.
 */
export type BlockLogMap = Map<number, BlockLogMapValue>;

export interface BlockLogMapValue {
	subtype: 'block' | 'reblock';
	/**
	 * The ISO timestamp at which the block was applied.
	 */
	timestamp: string;
	/**
	 * `true` for a sitewide block, or `false` for a partial block.
	 */
	sitewide: boolean;
	/**
	 * The number of blocks that have been applied to the same user.
	 */
	count: number;
	/**
	 * The name of the blocking admin.
	 */
	performer: string;
	/**
	 * The name of the blocked user.
	 */
	target: string;
	/**
	 * The duration of the block, formatted for the use for the `$5` variable.
	 */
	duration: string;
	/**
	 * Block flags, which can be used in `"block-log-flags-**"`.
	 */
	flags: BlockFlags[];
	/**
	 * Partial block details. Missing for sitewide blocks.
	 */
	restrictions?: ApiResponseQueryListLogeventsParamsRestrictions;
	/**
	 * The block reason parsed in HTML format. Can be empty if the block was applied with an empty reason.
	 */
	parsedcomment: string;
}

/**
 * Map of block IDs to block log lines.
 */
export type BlockLoglineMap = Map<number, string>;

export interface BlockParamsDetails {
	expiry: string;
	reason: string;
	anononly: boolean;
	nocreate: boolean;
	autoblock: boolean;
	noemail: boolean;
	hidename: boolean;
	allowusertalk: boolean;
}

type BlockParamsDetailsOptionalKeys = keyof Pick<BlockParamsDetails, 'anononly' | 'autoblock' | 'hidename'>;

export type BlockParamsCore =
	| {
		action: 'block';
		formatversion: '2';
		id: number;
		user?: never;
		reblock?: never;
		newblock?: never;
	}
	| {
		action: 'block';
		formatversion: '2';
		id?: never;
		user: string;
		reblock?: true;
		newblock?: never;
	}
	| {
		action: 'block';
		formatversion: '2';
		id?: never;
		user: string;
		reblock?: never;
		newblock?: true;
	};

export type BlockParams =
	BlockParamsCore &
	Omit<BlockParamsDetails, BlockParamsDetailsOptionalKeys> &
	Partial<Pick<BlockParamsDetails, BlockParamsDetailsOptionalKeys>>;

export interface UnblockParams {
	action: 'unblock';
	formatversion: '2';
	id: number;
	reason: string;
}