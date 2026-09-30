$(function () {
	var $forms = $('.mw-body-content form[method="post"]');
	var rInputTypes = /^(text|number|url|tel|email|password)$/i;

	$forms.on('keydown', 'input:not([name="wpInsertFilter"])', function (e) {
		if (e.key === 'Enter' && rInputTypes.test(this.type)) {
			// Prevent Enter from triggering submit logic (including AJAX)
			e.preventDefault();
		}
	});
});
