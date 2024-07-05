interface Window {
	selectiveRollbackConfig?: {
		lang?: string;
		editSummaries?: Record<string, string>;
		showKeys?: boolean;
		specialExpressions?: Record<string, string>;
		markBot?: boolean;
		watchPage?: boolean;
		watchExpiry?: "indefinite"|"infinite"|"infinity"|"never"|"1 week"|"1 month"|"3 months"|"6 months"|"1 year";
		confirm?: "always"|"never"|"RCW"|"nonRCW";
		mobileConfirm?: "always"|"never"|"RCW"|"nonRCW";
		checkboxLabelColor?: string;
	};
}