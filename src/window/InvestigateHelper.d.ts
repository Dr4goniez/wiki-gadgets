export type IP = typeof import('ip-wiki').IP;

export interface UserInfo {
	/**
	 * The username.
	 */
	user: string;
	/**
	 * IP addresses associated with the username, if any.
	 */
	ips: (Omit<IpInfo, 'ip' | 'users'> & { ip : string })[];
}

export interface IpInfo {
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

export interface LoadedMessages {
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

	/** `'IP'` */
	'checkuser-investigate-compare-table-header-ip': string;
	/** `'Block user'` */
	'block': string;
	/** `'Usernames and IP addresses'` */
	'checkuser-investigateblock-target': string;
	/** `'Add more...'` */
	'mw-widgets-usersmultiselect-placeholder': string;
	/** `'Investigate'` */
	'checkuser-investigate': string;

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

	/** `'Actions to block'` */
	'checkuser-investigateblock-actions': string;
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
	/** `'You are about to block both accounts and IPs with the same reason...'` */
	'wikimedia-checkuser-investigateblock-warning-ips-and-users-in-targets': string;
	/** `'Error ($1)'` */
	'api-feed-error-title': string;
	/** `'Submit'` */
	'block-submit': string;
	/** `'Cancel'` */
	'block-cancel': string;
	/** `'Type a reason'` */
	'block-removal-reason-placeholder': string;
	'historyempty': string;
	/** `'Add block'` */
	'block-create': string;
	/** `'Override existing blocks'` */
	'checkuser-investigateblock-reblock-label': string;
	/** `'Remove block'` */
	'block-removal-confirm-yes': string;

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

export type UserType = 'user' | 'ip' | 'cidr';

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

/**
 * Represents a CIDR block along with the set of indexes of `info` entries it covers.
 * - The `ip` property is an IP instance representing the CIDR.
 * - The `covers` property is a Set of numeric indexes referring to entries in the original `info` array
 *   that fall within the CIDR range.
 */
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
	usertype: 'user' | 'temp' | 'ip';
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