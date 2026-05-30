// Adds type definitions for mw.widgets.NamespacesMultiselectWidget
// See https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/refs/heads/master/resources/src/mediawiki.widgets/mw.widgets.NamespacesMultiselectWidget.js
declare namespace mw {
	namespace widgets {
		interface NamespacesMultiselectWidgetConfig extends OO.ui.MenuTagMultiselectWidget.ConfigOptions {
			/**
			 * Use this instead of `<input type="hidden">`, because hidden inputs do not have separate
			 * `value` and `defaultValue` properties. The script on Special:Preferences
			 * (`mw.special.preferences.confirmClose`) checks this property to see if a field was changed.
			 */
			name?: string;
		}

		class NamespacesMultiselectWidget extends OO.ui.MenuTagMultiselectWidget {
			constructor(config?: NamespacesMultiselectWidgetConfig);
		}
	}
}