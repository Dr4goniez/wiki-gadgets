interface Window {
	privateSandboxConfig?: {
		debug?: boolean;
		lang?: string;
		expandPreview?: boolean;
	};
}

interface PrivateSandboxMessage {
	'message-load-interface': string;
	'message-load-failed': string;
	'message-load-welcome': string;
	'message-load-updated': string;
	'message-unload': string;
	'label-profiles': string;
	'label-profiles-select': string;
	'label-profiles-edit': string;
	'label-profiles-edit-placeholder': string;
	'label-profiles-edit-help': string;
	'title-profiles-empty': string;
	'title-profiles-invalidchars': string;
	'title-profiles-toomanychars': string;
	'label-profiles-button-create': string;
	'label-profiles-button-rename': string;
	'label-profiles-button-delete': string;
	/** `$1`: profile name. */
	'message-profiles-create-done': string;
	/** `$1`: old profile name; `$2`: new profile name. */
	'message-profiles-rename-done': string;
	/** `$1`: old profile name; `$2`: new profile name. */
	'message-profiles-rename-confirm': string;
	/** `$1`: profile name. */
	'message-profiles-delete-done': string;
	/** `$1`: profile name. */
	'message-profiles-delete-confirm': string;
	'label-profiles-save-help': string;
	'title-editor-disabled': string;
	'label-profiles-save': string;
	'title-profiles-save': string;
	'label-profiles-saveall': string;
	'title-profiles-saveall': string;
	'label-profiles-listunsaved': string;
	'title-profiles-listunsaved': string;
	'title-dialog-listunsaved': string;
	'label-dialog-listunsaved-deleteditem': string;
	'message-save-doing': string;
	'message-save-done': string;
	'message-save-failed': string;
	'label-preview': string;
	'message-preview-failed': string;
	'title-preview-expand': string;
	'title-preview-collapse': string;
	'title-preview-disabled': string;
}

interface ApiResponseParse {
	parse?: {
		title: string;
		pageid: number;
		text: string;
		categorieshtml: string;
		modules: string[];
        modulescripts: string[];
        modulestyles: string[];
        jsconfigvars: {
			[key: string]: {
                alert: string;
                notice: string;
            };
        };
	};
}

type Extension = never;

declare class CodeMirror {

	/**
	 * Instantiate a new CodeMirror instance.
	 * @param textarea Textarea to add syntax highlighting to.
	 */
	constructor(textarea: HTMLTextAreaElement|JQuery<HTMLElement>|string);

	/**
	 * The textarea that CodeMirror is bound to.
	 */
	$textarea: JQuery<HTMLTextAreaElement>;

	/**
	 * Setup CodeMirror and add it to the DOM. This will hide the original textarea.
	 * @param extensions
	 */
	initialize(extensions: Extension|Extension[]): void;

}

declare class CodeMirrorWikiEditor {

	constructor($textarea: JQuery<HTMLTextAreaElement>);

	/**
	 * Adds the CodeMirror button to WikiEditor.
	 */
	addCodeMirrorToWikiEditor(): void;

}