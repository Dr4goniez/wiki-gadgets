// Adds type definitions for mw.widgets.UsersMultiselectWidget
// See https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/refs/heads/master/resources/src/mediawiki.widgets/mw.widgets.UsersMultiselectWidget.js
declare namespace mw {
	namespace widgets {
		interface UsersMultiselectWidgetConfig extends OO.ui.MenuTagMultiselectWidget.ConfigOptions, OO.ui.mixin.PendingElement.ConfigOptions {
			/**
			 * mw.Api instance to use for queries (optional, default: new mw.Api())
			 */
			api?: mw.Api;
			/**
			 * Number of results to show in autocomplete menu (default: 10)
			 */
			limit?: number;
			/**
			 * Name for hidden input field when used in HTML form
			 */
			name?: string;
			/**
			 * Whether to allow single IP addresses (default: false)
			 */
			ipAllowed?: boolean;
			/**
			 * Whether to allow IP ranges (default: false)
			 */
			ipRangeAllowed?: boolean;
			/**
			 * Maximum allowed IP ranges (IPv4 and IPv6). Defaults: { IPv4: 16, IPv6: 32 }
			 */
			ipRangeLimits?: {
				IPv4?: number;
				IPv6?: number;
			};
			/**
			 * Whether to exclude named users (default: false)
			 */
			excludeNamed?: boolean;
			/**
			 * Whether to exclude temporary users (default: false)
			 */
			excludeTemp?: boolean;
		}

		class UsersMultiselectWidget extends OO.ui.MenuTagMultiselectWidget implements OO.ui.mixin.PendingElement {
			constructor(config?: UsersMultiselectWidgetConfig);
			/**
			 * Get currently selected usernames.
			 *
			 * @return An array of selected usernames.
			 */
			getSelectedUsernames(): string[];
			/**
			 * Internal: update autocomplete menu items.
			 */
			private updateMenuItems(): void;
			/**
			 * Internal: validate if the given IP range is within limits.
			 *
			 * @param ipRange A valid IPv4 or IPv6 CIDR range string.
			 * @return Whether the IP range is valid according to the limits.
			 */
			private validateIpRange(ipRange: string): boolean;
			/**
			 * Internal override to update menu when input changes.
			 */
			onInputChange(): void;
			/**
			 * Internal: update hidden `<textarea>` if used in form submission.
			 */
			private updateHiddenInput(): void;
			/**
			 * Internal override to allow tag selection only when input is empty.
			 */
			onTagSelect(): void;

			/**
			 * Hidden input element, if created (used for form submission)
			 * Only present if `config.name` was provided.
			 */
			$hiddenInput?: JQuery;
			/**
			 * API instance used to make queries (default: `new mw.Api()`)
			 */
			api: mw.Api;
			limit: number;
			ipAllowed: boolean;
			ipRangeAllowed: boolean;
			ipRangeLimits: {
				IPv4: number;
				IPv6: number;
			};
			excludeNamed: boolean;
			excludeTemp: boolean;
		}
	}
}