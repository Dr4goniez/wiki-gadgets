/* eslint-disable @typescript-eslint/no-explicit-any */
// Adds type definitions for mw.widgets.TitleWidget
// See https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/refs/heads/master/resources/src/mediawiki.widgets/mw.widgets.TitleWidget.js
declare namespace mw {
	namespace widgets {
		interface TitleWidgetConfig {
			/**
			 * Number of results to show
			 */
			limit?: number;
			/**
			 * Namespace to prepend to queries
			 */
			namespace?: number;
			/**
			 * Maximum query length
			 */
			maxLength?: number;
			/**
			 * If a namespace is set, display titles relative to it
			 */
			relative?: boolean;
			/**
			 * Display search suggestions
			 */
			suggestions?: boolean;
			/**
			 * Show the targets of redirects
			 */
			showRedirectTargets?: boolean;
			/**
			 * Show page images
			 */
			showImages?: boolean;
			/**
			 * Show page descriptions
			 */
			showDescriptions?: boolean;
			/**
			 * Show disambiguation pages as the last results
			 */
			showDisambigsLast?: boolean;
			/**
			 * Show the user's input as a missing page when a page with this exact name doesn't exist.
			 * Disabled by default when the namespace option is used, otherwise enabled by default.
			 */
			showMissing?: boolean;
			/**
			 * Show pages with a valid interwiki prefix
			 */
			showInterwikis?: boolean;
			/**
			 * Search for hash fragments on a specific page when typed
			 */
			searchFragments?: boolean;
			/**
			 * Add exact user's input query to results
			 */
			addQueryInput?: boolean;
			/**
			 * Exclude the current page from suggestions
			 */
			excludeCurrentPage?: boolean;
			/**
			 * Show only pages that can be created (not special pages)
			 */
			creatable?: boolean;
			/**
			 * Whether the input must be a valid title
			 */
			validateTitle?: boolean;
			/**
			 * Whether the input must not be empty
			 */
			required?: boolean;
			/**
			 * Highlight the partial query the user used for this title
			 */
			highlightSearchQuery?: boolean;
			/**
			 * Result cache which implements a 'set' method, taking keyed values as an argument
			 */
			cache?: {
				set(values: Record<string, unknown>): void;
			};
			/**
			 * API object to use, creates a default mw.Api instance if not specified
			 */
			api?: mw.Api;
		}

		interface TitleWidgetPageData {
			known: boolean;
			missing: boolean;
			redirect: boolean;
			disambiguation: boolean;
			imageUrl?: string;
			description?: string;
			index?: number;
			originalData: unknown;
		}

		interface TitleWidgetOptionData {
			data: string;
			url: string;
			showImages: boolean;
			imageUrl: string | null;
			description: string | null;
			missing: boolean;
			redirect: boolean;
			disambiguation: boolean;
			query: string | null;
			compare: (a: string, b: string) => number;
		}

		class TitleWidget {

			constructor(config?: TitleWidgetConfig);

			/* properties */

			limit: number;
			maxLength: number;
			namespace: number | null;
			relative: boolean;
			suggestions: boolean;
			showRedirectTargets: boolean;
			showImages: boolean;
			showDescriptions: boolean;
			showDisambigsLast: boolean;
			showMissing: boolean;
			showInterwikis: boolean;
			searchFragments: boolean;
			addQueryInput: boolean;
			excludeCurrentPage: boolean;
			creatable: boolean;
			validateTitle: boolean;
			highlightSearchQuery: boolean;

			cache?: {
				set(values: Record<string, unknown>): void;
			};

			api: mw.Api;

			compare: (a: string, b: string) => number;

			sectionsCache: Record<string, JQuery.Promise<any>>;

			static static: {
				interwikiPrefixesPromiseCache: Record<
					string,
					JQuery.Promise<string[]>
				>;
			};

			/* abstract */

			abstract getQueryValue(): string;

			/* namespace */

			getNamespace(): number | null;
			setNamespace(namespace: number | null): void;

			/* API helpers */

			getApi(): mw.Api;

			getApiParams(query: string): Record<string, unknown>;

			getInterwikiPrefixesPromise(): JQuery.Promise<string[]>;

			getSuggestionsPromise(): JQuery.Promise<any>;

			getSectionSuggestions(
				title: string,
				fragmentQuery: string
			): JQuery.Promise<any>;

			/* processing */

			getOptionsFromData(
				data: any
			): OO.ui.OptionWidget[];

			getPageData(
				page: any,
				redirectIndex?: number
			): TitleWidgetPageData;

			createOptionWidget(
				data: TitleWidgetOptionData
			): OO.ui.MenuOptionWidget;

			getOptionWidgetData(
				title: string,
				data: TitleWidgetPageData
			): TitleWidgetOptionData;

			responseContainsNonExistingTitle(
				apiResponse: any,
				title: string
			): boolean;

			/* title utilities */

			getMWTitle(value?: string): mw.Title | null;

			isQueryValid(): boolean;
		}
	}
}