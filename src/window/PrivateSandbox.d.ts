interface Window {
	privateSandboxConfig?:  {
		debug?: boolean;
	}
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
}