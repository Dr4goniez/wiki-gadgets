/* eslint-disable @typescript-eslint/no-explicit-any */
// Adds type definitions for mw.widgets.TitlesMultiselectWidget
// See https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/refs/heads/master/resources/src/mediawiki.widgets/mw.widgets.TitlesMultiselectWidget.js
declare namespace mw {
	namespace widgets {
		interface TitlesMultiselectWidgetConfig extends
			TitleWidgetConfig,
			OO.ui.MenuTagMultiselectWidget.ConfigOptions,
			OO.ui.mixin.RequestManager.ConfigOptions,
			OO.ui.mixin.PendingElement.ConfigOptions
		{
			/**
			 * Use this instead of `<input type="hidden">`, because hidden inputs do not have separate
			 * `value` and `defaultValue` properties. The script on Special:Preferences
			 * (`mw.special.preferences.confirmClose`) checks this property to see if a field was changed.
			 */
			name?: string;
		}

		class TitlesMultiselectWidget extends OO.ui.MenuTagMultiselectWidget implements
			OO.ui.mixin.RequestManager,
			OO.ui.mixin.PendingElement,
			TitleWidget
		{

			constructor(config?: TitlesMultiselectWidgetConfig);

			/* ----- mixed-in from TitleWidget ----- */

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

			getNamespace(): number | null;
			setNamespace(namespace: number | null): void;

			getApi(): mw.Api;
			getApiParams(query: string): Record<string, unknown>;

			getInterwikiPrefixesPromise(): JQuery.Promise<string[]>;
			getSuggestionsPromise(): JQuery.Promise<any>;
			getSectionSuggestions(
				title: string,
				fragmentQuery: string
			): JQuery.Promise<any>;

			getOptionsFromData(data: any): OO.ui.OptionWidget[];
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

			getMWTitle(value?: string): mw.Title | null;
			isQueryValid(): boolean;

			/* ----- widget-specific members ----- */

			$hiddenInput?: JQuery<HTMLTextAreaElement>;

			getQueryValue(): string;

			onInputChange(): void;

			onTagSelect(...args: unknown[]): void;

			/* RequestManager overrides */

			getRequestQuery(): string;

			getRequest(): JQuery.Promise<any>;

			getRequestCacheDataFromResponse(
				response: any
			): unknown;
		}
	}
}