$(function() {

	// Collect <input> tags in forms for an HTTP POST request
	/** @type {JQuery<HTMLInputElement>} */
	var $inputs = $('.mw-body-content form[method="post"] input');
	if (!$inputs.length) return;

	// Assign an event listner to prevent form submission
	$inputs.each(function() {
		if (!this.type || /^(text|number|url|tel|email|password)$/i.test(this.type)) {
			this.addEventListener('keypress', function(e) {
				if (e.key === 'Enter') {
					e.preventDefault();
				}
			});
		}
	});

});
