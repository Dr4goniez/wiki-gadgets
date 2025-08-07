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

export type MessageKeys =
	| 'tux-editor-translate-mode'
	| 'checkuser-helper-user'
	| 'sp-contributions-talk'
	| 'contribslink'
	| 'sp-contributions-logs'
	| 'sp-contributions-blocklog'
	| 'abusefilter-log-linkoncontribs'
	| 'checkuser-log-checks-on'
	| 'centralauth-contribs-link'
	| 'checkuser-global-contributions-link'
	| 'ooui-copytextlayout-copy'
	| 'checkuser-helper-copy-success'
	| 'checkuser-helper-copy-failed'

	| 'checkuser-investigate-compare-table-cell-actions'
	| 'checkuser-investigate-compare-table-cell-other-actions'

	| 'checkuser-investigate-compare-table-header-ip'
	| 'block'
	| 'checkuser-investigateblock-target'
	| 'mw-widgets-usersmultiselect-placeholder'
	| 'checkuser-investigate'
	| 'checkuser-investigateblock-actions'
	| 'checkuser-investigateblock-email-label'
	| 'checkuser-investigateblock-usertalk-label'
	| 'checkuser-investigateblock-reblock-label'
	| 'checkuser-investigateblock-reason'
	| 'ipbreason-dropdown'
	| 'htmlform-selectorother-other'

	| 'blocklink'
	| 'wikimedia-checkuser-investigateblock-warning-ips-and-users-in-targets'
	| 'api-feed-error-title'

	| 'logentry-block-block'
	| 'logentry-block-block-multi'
	| 'logentry-block-reblock'
	| 'logentry-partialblock-block'
	| 'logentry-partialblock-block-multi'
	| 'logentry-partialblock-reblock'
	| 'logentry-non-editing-block-block'
	| 'logentry-non-editing-block-block-multi'
	| 'logentry-non-editing-block-reblock'
	| 'block-log-flags-angry-autoblock'
	| 'block-log-flags-anononly'
	| 'block-log-flags-hiddenname'
	| 'block-log-flags-noautoblock'
	| 'block-log-flags-nocreate'
	| 'block-log-flags-noemail'
	| 'block-log-flags-nousertalk'
	| 'parentheses'
	| 'comma-separator'
	| 'and'
	| 'word-separator'
	| 'blanknamespace'
	| 'ipb-action-create'
	| 'ipb-action-move'
	| 'ipb-action-thanks'
	| 'ipb-action-upload'
	| 'logentry-partialblock-block-page'
	| 'logentry-partialblock-block-ns'
	| 'logentry-partialblock-block-action';

export type LoadedMessages = Record<MessageKeys, string>;

export type Gender = 'male' | 'female' | 'unknown';

export type UserType = 'user' | 'ip' | 'cidr';

export interface ApiResponse {
	query?: ApiResponseQuery;
}

interface ApiResponseQuery {
	allmessages?: ApiResponseQueryMetaAllmessages[];
	normalized?: ApiResponseNormalized[];
	pages?: ApiResponsePageExistence[];
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

export interface CategorizedUsernameUser {
	username: string;
	type: 'user' | 'temp';
}

export interface CategorizedUsernameIp {
	username: string;
	type: 'ip';
	abbreviated: string;
	covers: string[];
	coveredBy: string[];
}

export type CategorizedUsername = import('ts-xor').XOR<CategorizedUsernameUser, CategorizedUsernameIp>;

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