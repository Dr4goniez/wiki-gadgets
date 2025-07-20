$(function() {
	var $forms = $('.mw-body-content form[method="post"]');

	$forms.each(function() {
		$(this).on('keydown', 'input', function(e) {
			if (
				e.key === 'Enter' &&
				/^(text|number|url|tel|email|password)$/i.test(this.type)
			) {
				// Prevent Enter from triggering submit logic (including AJAX)
				e.preventDefault();
			}
		});
	});
});
