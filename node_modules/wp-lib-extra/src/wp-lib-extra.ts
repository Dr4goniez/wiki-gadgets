// <nowiki>
/**
 * @packageDocumentation
 * `wp-lib-extra` is a function library prepared as a gadget on the Japanese Wikipedia.
 * - {@link https://ja.wikipedia.org/wiki/MediaWiki:Gadget-WpLibExtra.js}
 * 
 * This library is best characterized by its {@link Wikitext} class, which provides various interfaces to parse
 * wikitext, supplementing functionalities lacking in built-in JavaScript libraries of MediaWiki.
 * 
 * How to use this library:
 * ```
 * // In gadgets
 * var lib = require('./WpLibExtra.js');
 * ```
 * ```
 * // In local non-gadgets
 * var moduleName = 'ext.gadget.WpLibExtra';
 * mw.loader.using(moduleName).then(function(require) {
 * 	var lib = require(moduleName);
 * });
 * ```
 * ```
 * // In non-local scripts
 * var moduleName = 'ext.gadget.WpLibExtra';
 * var moduleUrl = '//ja.wikipedia.org/w/load.php?modules=' + moduleName;
 * mw.loader.getScript(moduleUrl).then(function() {
 * 	mw.loader.using(moduleName).then(function(require) {
 * 		var lib = require(moduleName);
 * 	});
 * });
 * ```
 */

/**
 * Type definitions for the methods of {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.String | mw.String}.
 * 
 * Note that the relevant object is not part of {@link WpLibExtra} (the interface is available in the npm package).
 */
interface MwString {
	// License: https://doc.wikimedia.org/mediawiki-core/master/js/source/mediawiki.String.html#mw-String
	/**
	 * Calculate the byte length of a string (accounting for UTF-8).
	 * @param str
	 * @returns
	 */
	byteLength(str: string): number;
	/**
	 * Calculate the character length of a string (accounting for UTF-16 surrogates).
	 * @param str
	 * @returns
	 */
	codePointLength(str: string): number;
	/**
	 * Like String#charAt, but return the pair of UTF-16 surrogates for characters outside of BMP.
	 * @param string
	 * @param offset Offset to extract the character.
	 * @param backwards Use backwards direction to detect UTF-16 surrogates, defaults to false.
	 * @returns
	 */
	charAt(string: string, offset: number, backwards?: boolean): string;
	/**
	 * Lowercase the first character. Support UTF-16 surrogates for characters outside of BMP.
	 * @param string
	 * @returns
	 */
	lcFirst(string: string): string;
	/**
	 * Uppercase the first character. Support UTF-16 surrogates for characters outside of BMP.
	 * @param string 
	 * @returns 
	 */
	ucFirst(string: string): string;
	/**
	 * Utility function to trim down a string, based on `byteLimit` and given a safe start position.
	 * It supports insertion anywhere in the string, so "foo" to "fobaro" if limit is 4 will result in "fobo",
	 * not "foba". Basically emulating the native maxlength by reconstructing where the insertion occurred.
	 * 
	 * @param safeVal Known value that was previously returned by this function, if none, pass empty string.
	 * @param newVal New value that may have to be trimmed down.
	 * @param byteLimit Number of bytes the value may be in size.
	 * @param filterFunction Function to call on the string before assessing the length.
	 * @returns
	 */
	trimByteLength(safeVal: string, newVal: string, byteLimit: number, filterFunction?: (val: string) => number): {newVal: string; trimmed: boolean;};
	/**
	 * Utility function to trim down a string, based on `codePointLimit` and given a safe start position.
	 * It supports insertion anywhere in the string, so "foo" to "fobaro" if limit is 4 will result in "fobo",
	 * not "foba". Basically emulating the native maxlength by reconstructing where the insertion occurred.
	 *
	 * @param safeVal Known value that was previously returned by this function, if none, pass empty string.
	 * @param newVal New value that may have to be trimmed down.
	 * @param codePointLimit Number of characters the value may be in size.
	 * @param filterFunction Function to call on the string before assessing the length.
	 * @returns
	 */
	trimCodePointLength(safeVal: string, newVal: string, codePointLimit: number, filterFunction?: (val: string) => number): {newVal: string; trimmed: boolean;};
}
/** @internal */
// @ts-ignore
const mwString: MwString = mw.loader.require('mediawiki.String');

// **************************************************** POLYFILLS ****************************************************

if (!String.prototype.includes) {
	// https://github.com/alfaslash/string-includes-polyfill/blob/master/string-includes-polyfill.js
	String.prototype.includes = function(search: string, start?: number): boolean {
		if (typeof start !== 'number') {
            start = 0;
        }
        if (start + search.length > this.length) {
            return false;
        } else {
            return this.indexOf(search, start) !== -1;
        }
	};
}

if (!Array.prototype.includes) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	Array.prototype.includes = function(searchElement: any, fromIndex?: number): boolean {
		fromIndex = typeof fromIndex === 'number' && fromIndex >= 0 ? fromIndex : 0;
		return this.indexOf(searchElement, fromIndex) !== -1;
	};
}

if (!Array.prototype.findIndex) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	Array.prototype.findIndex = function<T>(predicate: (value: T, index: number, obj: T[]) => boolean, thisArg?: any): number {
		if (typeof predicate !== 'function') {
			throw new TypeError(typeof predicate + ' is not a function');
		}
		for (let i = 0; i < this.length; i++) {
			if (predicate.call(thisArg, this[i], i, this)) {
				return i;
			}
		}
		return -1;
	};
}

if (!Object.assign) {
	// https://github.com/ryanhefner/Object.assign/blob/master/index.js
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	Object.assign = function(target: object, ...sources: any[]): any {
		if (target === undefined || target === null) {
			throw new TypeError('Cannot convert undefined or null to object');
		}
		const output = Object(target);
		for (let index = 1; index < sources.length; index++) {
			const source = sources[index];
			if (source !== undefined && source !== null) {
				for (const nextKey in source) {
					// eslint-disable-next-line no-prototype-builtins
					if (source.hasOwnProperty(nextKey)) {
						output[nextKey] = source[nextKey];
					}
				}
			}
		}
		return output;
	};
}

if (!String.prototype.repeat) {
	// https://reference.codeproject.com/javascript/Reference/Global_Objects/String/repeat
	String.prototype.repeat = function(count: number): string {
		if (this == null) {
			throw new TypeError('can\'t convert ' + this + ' to object');
		}
		let str = '' + this;
		count = +count;
		if (count != count) {
			count = 0;
		}
		if (count < 0) {
			throw new RangeError('repeat count must be non-negative');
		}
		if (count == Infinity) {
			throw new RangeError('repeat count must be less than infinity');
		}
		count = Math.floor(count);
		if (str.length == 0 || count == 0) {
			return '';
		}
		if (str.length * count >= 1 << 28) {
			throw new RangeError('repeat count must not overflow maximum string size');
		}
		let rpt = '';
		for (;;) {
			if ((count & 1) == 1) {
				rpt += str;
			}
			count >>>= 1;
			if (count == 0) {
				break;
			}
			str += str;
		}
		return rpt;
	};
}

// **************************************************** UTIL FUNCTIONS ****************************************************

/**
 * Load all the modules that this library depends on.
 * - {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Title |mediawiki.Title}
 * - {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.util |mediawiki.util}
 * - {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Api |mediawiki.api}
 * @returns `true` on success, `false` on failure.
 */
function load(): JQueryPromise<boolean> {
	return mw.loader.using([
		'mediawiki.Title',
		'mediawiki.util',
		'mediawiki.api'
	])
	.then(() => true)
	.catch((err) => {
		console.warn(err);
		return false;
	});
}

/**
 * Let the code sleep for `n` milliseconds.
 * @param milliseconds The milliseconds to sleep. If a negative number is passed, it is automatically rounded up to `0`.
 * @returns
 */
function sleep(milliseconds: number): JQueryPromise<void> {
	const def = $.Deferred();
	setTimeout(def.resolve, Math.max(0, milliseconds));
	return def.promise();
}

/**
 * Send an API request that automatically continues until the limit is reached. Works only for calls that have a 'continue' property in the response.
 * @param params
 * @param limit Default: 10
 * @returns The return array might have `null` elements if any internal API request failed.
 * @requires mediawiki.api
 */
function continuedRequest(params: DynamicObject, limit = 10): JQueryPromise<(DynamicObject|null)[]> {

	const api = new mw.Api();
	const responses: (DynamicObject|null)[] = [];

	const query = (params: DynamicObject, count: number): JQueryPromise<(DynamicObject|null)[]> => {
		return api.get(params)
			.then((res) => {
				responses.push(res || null);
				if (res.continue && count < limit) {
					return query(Object.assign(params, res.continue), count + 1);
				} else {
					return responses;
				}
			}).catch((_, err) => {
				console.log(`continuedRequest: Request failed (reason: ${err.error.info}, loop count: ${count}).`);
				responses.push(null);
				return responses;
			});
	};

	return query(params, 1);

}

/**
 * Send API requests with an apilimit-susceptible query parameter all at once. For instance:
 * ```
 * {
 * 	action: 'query',
 * 	titles: 'A|B|C|D|...', // This parameter is subject to the apilimit of 500 or 50
 * 	formatversion: '2'
 * }
 * ```
 * Pass the multi-value field as an array, and then this function sends multiple API requests by splicing the array in
 * accordance with the current user's apilimit (`500` for bots, `50` otherwise). It is also neccesary to pass the name
 * of the field to the second parameter of this function (if the request parameters have more than one multi-value field,
 * an array can be passed to the second parameter).
 *
 * @param params The request parameters.
 * @param batchParam The name of the multi-value field (can be an array).
 * @param apilimit
 * Optional splicing number (default: `500/50`). The `**limit` parameter, if there is any, is automatically set to `max`
 * if this argument has the value of either `500` or `50`. It also accepts a unique value like `1`, in cases such as
 * {@link https://www.mediawiki.org/w/api.php?action=help&modules=query%2Bblocks |list=blocks} with a `bkip` parameter
 * (which only allows one IP to be specified).
 * @returns
 * Always an array: Elements are either `ApiResponse` (success) or `null` (failure). If the multi-value field is an empty array,
 * the return array will also be empty.
 * @requires mediawiki.api
 */
function massRequest(params: DynamicObject, batchParams: string|string[], apilimit?: number): JQueryPromise<(DynamicObject|null)[]> {

	// Initialize variables
	params = Object.assign({}, params);
	// @ts-ignore
	const hasApiHighLimits = mw.config.get('wgUserGroups').concat(mw.config.get('wgGlobalGroups') || []).some((group) => {
		return ['sysop', 'bot', 'apihighlimits-requestor', 'global-bot', 'founder', 'staff', 'steward', 'sysadmin', 'wmf-researcher'].includes(group);
	});
	apilimit = apilimit || (hasApiHighLimits ? 500 : 50);
	const nonArrayBatchParams: string[] = [];

	// Get the array to be used for the batch operation
	const batchKeys = Array.isArray(batchParams) ? batchParams : [batchParams];
	const batchArrays = Object.keys(params).reduce((acc: string[][], key) => {
		if (batchKeys.includes(key)) {
			if (Array.isArray(params[key])) {
				acc.push(params[key].slice());
			} else {
				nonArrayBatchParams.push(key);
			}
		} else if (/limit$/.test(key) && (apilimit === 500 || apilimit === 50)) {
			// If this is a '**limit' parameter and the value is the default one, set it to 'max'
			params[key] = 'max';
		}
		return acc;
	}, []); 
	if (nonArrayBatchParams.length) {
		throw new Error('The batch param(s) (' + nonArrayBatchParams.join(', ') + ') must be arrays.');
	} else if (!batchKeys.length) {
		throw new Error('There is a problem with the value of the "batchParams" parameter.');
	} else if (!batchArrays.length) {
		throw new Error('The passed API params do not contain arrays for the batch operation.');
	} else if (batchArrays.length > 1 && !batchArrays.slice(1).every((arr) => arraysEqual(batchArrays[0], arr))) {
		throw new Error('The arrays passed for the batch operation must all be non-distinct with each other.');
	}

	// Final check
	const batchArray = batchArrays[0];
	if (!batchArray.length) {
		console.log('An empty array has been passed for the batch operation.');
		return $.Deferred().resolve([]);
	}

	// Send API requests
	const api = new mw.Api();
	const req = (reqParams: DynamicObject): JQueryPromise<DynamicObject|null> => {
		return api.post(reqParams)
		.then((res: DynamicObject) => res || null)
		.catch((_, err) => {
			console.warn(err);
			return null;
		});
	};
	const result: JQueryPromise<DynamicObject|null>[] = [];
	while (batchArray.length !== 0) {
		const batchArrayStr = batchArray.splice(0, apilimit).join('|');
		Object.assign( // Overwrite the batch parameters with a stringified batch array 
			params,
			batchKeys.reduce((acc: DynamicObject, key) => {
				acc[key] = batchArrayStr;
				return acc;
			}, Object.create(null))
		);
		result.push(req(params));
	}

	return $.when(...result).then((...args) => args);

}

/**
 * (Note: This function always returns an empty array if called on a project other than jawiki.)
 * 
 * Get a list of [[WP:VIP]]s.
 * @param format
 * By default, returns `NAME` in `WP:VIP#NAME`.
 * - `title`: `VIP#NAME`
 * - `prefixedtitle`: `WP:VIP#NAME`
 * - `wikilink`: `[[WP:VIP#NAME]]`
 * @returns
 * @requires mediawiki.api
 */
function getVipList(format?: 'title'|'prefixedtitle'|'wikilink'): JQueryPromise<string[]> {
	if (mw.config.get('wgDBname') !== 'jawiki') {
		return $.Deferred().resolve([]);
	}
	return new mw.Api().get({
		action: 'parse',
		page: 'Wikipedia:進行中の荒らし行為',
		prop: 'sections',
		formatversion: '2'
	}).then((res) => {

		const resSect = res && res.parse && res.parse.sections; // undefined or array of objects
		if (!resSect) return[];

		// Define sections titles that are irrelevant to VIP names
		const excludeList = [
			'記述について',
			'急を要する二段階',
			'配列',
			'ブロック等の手段',
			'このページに利用者名を加える',
			'注意と選択',
			'警告の方法',
			'未登録（匿名・IP）ユーザーの場合',
			'登録済み（ログイン）ユーザーの場合',
			'警告中',
			'関連項目'
		];

		// Return a list
		return resSect.reduce((acc: string[], {line, level}: {line: string, level: string}) => {
			if (!excludeList.includes(line) && level === '3') {
				switch (format) {
					case 'title':
						line = 'VIP#' + line;
						break;
					case 'prefixedtitle':
						line = 'WP:VIP#' + line;
						break;
					case 'wikilink':
						line = '[[WP:VIP#' + line + ']]';
						break;
					default:
				}
				if (!acc.includes(line)) {
					acc.push(line);
				}
			}
			return acc;
		}, []);

	}).catch((_, err) => {
		console.log(err);
		return [];
	});
}

/**
 * Collect LTA shortcuts (`LTA:XXX`) in the main namespace and return `XXX` as a list.
 * @param format
 * By default, returns `XXX` in `LTA:XXX`.
 * - `title`: `LTA:XXX`
 * - `wikilink`: `[[LTA:XXX]]`
 * @returns
 * @requires mediawiki.api
 */
function getLtaList(format?: 'title'|'wikilink'): JQueryPromise<string[]> {
	return continuedRequest({
		action: 'query',
		list: 'allpages',
		apprefix: 'LTA:',
		apnamespace: '0',
		apfilterredir: 'redirects',
		aplimit: 'max',
		formatversion: '2'
	}, Infinity)
	.then((response) => {
		return response.reduce((acc: string[], res) => {
			const resPgs = res && res.query && res.query.allpages;
			(resPgs || []).forEach(({title}: {title: string}) => {
				if (/^LTA:[^/]+$/.test(title)) {
					switch (format) {
						case 'title':
							break;
						case 'wikilink':
							title = '[[' + title + ']]';
							break;
						default:
							title = title.replace(/^LTA:/, '');
					}
					if (!acc.includes(title)) {
						acc.push(title);
					}
				}
			});
			return acc;
		}, []);
	});
}

/**
 * Remove unicode bidirectional characters and leading/trailing `\s`s from a string.
 *
 * @param str Input string.
 * @param trim Whether to trim `str`, defaulted to `true`.
 * @returns
 */
function clean(str: string, trim = true): string {
	/**
	 * The regex is adapted from {@link https://doc.wikimedia.org/mediawiki-core/master/js/source/Title.html#mw-Title |mediawiki.Title}.
	 */
	str = str.replace(/[\u200E\u200F\u202A-\u202E]+/g, '');
	return trim ? str.trim() : str;
}

/**
 * Get an icon as an \<img> tag.
 * 
 * Available icons:
 * - {@link https://upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif | load}
 * - {@link https://upload.wikimedia.org/wikipedia/commons/f/fb/Yes_check.svg | check}
 * - {@link https://upload.wikimedia.org/wikipedia/commons/a/a2/X_mark.svg | cross}
 * - {@link https://upload.wikimedia.org/wikipedia/commons/6/61/Symbol_abstain_vote.svg | cancel}
 * @param iconType The type of the icon.
 * @returns Always an `HTMLImageElement`. If an invalid value is passed to `iconType`, returns an \<img> tag
 * without a `src` attribute (which shows no image).
 */
function getIcon(iconType: 'load'|'check'|'cross'|'cancel'): HTMLImageElement {
    const img = document.createElement('img');
    switch (iconType) {
        case 'load':
            img.src = '//upload.wikimedia.org/wikipedia/commons/4/42/Loading.gif';
            break;
        case 'check':
            img.src = '//upload.wikimedia.org/wikipedia/commons/f/fb/Yes_check.svg';
            break;
        case 'cross':
            img.src = '//upload.wikimedia.org/wikipedia/commons/a/a2/X_mark.svg';
            break;
        case 'cancel':
            img.src = '//upload.wikimedia.org/wikipedia/commons/6/61/Symbol_abstain_vote.svg';
			break;
		default:
			console.error(`"${iconType}" is not a valid value as the parameter of getIcon.`);
    }
    img.style.cssText = 'vertical-align: middle; height: 1em; border: 0;';
    return img;
}

/**
 * Copy a string to the clipboard.
 * @param str The string to copy.
 * @param verbose Whether to show a {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw | mw.notify} message,
 * defaulted to `false`.
 * 
 * Available languages: `en`, `ja`.
 * @returns The copied string (same as the input string).
 */
function copyToClipboard(str: string, verbose?: 'en'|'ja'): string {

	const temp = document.createElement('textarea');
	document.body.appendChild(temp); // Create a temporarily hidden text field
	temp.value = str; // Put the passed string to the text field
	temp.select(); // Select the text
	document.execCommand('copy'); // Copy it to the clipboard
	temp.remove();

	if (verbose) {
		const code = `<code style="font-family: inherit;">${str}</code>`;
		let line = '';
		switch (verbose) {
			case 'en':
				line = `Copied ${code} to the clipboard.`;
				break;
			case 'ja':
				line = `${code}をクリップボードにコピーしました。`;
				break;
			default:
				console.error(`"${verbose}" is not a valid value for the verbose parameter of copyToClipboard.`);
		}
		if (line) {
			const msg = document.createElement('div');
			msg.innerHTML = line;
			mw.notify(msg, {type: 'success'});
		}
	}

	return str;

}

/**
 * Check whether two arrays are equal. Neither array should contain non-primitive values as its elements.
 * @param array1
 * @param array2
 * @param orderInsensitive Default: `false`
 * @returns
 */
function arraysEqual(array1: primitive[], array2: primitive[], orderInsensitive = false): boolean {
	if (orderInsensitive) {
		return array1.length === array2.length && array1.every(el => array2.includes(el));
	} else {
		return array1.length === array2.length && array1.every((el, i) => array2[i] === el);
	}
}

/**
 * Compare elements in two arrays and get differences.
 * @param sourceArray
 * @param targetArray
 * @returns
 */
function arraysDiff(sourceArray: primitive[], targetArray: primitive[]) {
	const added: primitive[] = [];
	const removed: primitive[] = [];
	sourceArray.forEach((el) => {
		if (!targetArray.includes(el)) removed.push(el);
	});
	targetArray.forEach((el) => {
		if (!sourceArray.includes(el)) added.push(el);
	});
	return {added, removed};
}

/**
 * `[key: string]: any;` object, used for API responses.
 */
interface DynamicObject {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
}

/**
 * A disjunctive union type for primitive types.
 */
type primitive = string|number|bigint|boolean|null|undefined;

// **************************************************** CLASSES ****************************************************

/** The object that stores the properties of a template argument, used in {@link Template.args}. */
interface TemplateArgument {
	/**
	 * The argument name, from which unicode bidirectional characters and leading/trailing spaces are removed.
	 *
	 * Note that this property is never an empty string even for unnamed arguments.
	 */
	name: string;
	/**
	 * The argument value, from which unicode bidirectional characters are removed. As for leading/trailing spaces,
	 * whether they are removed depends on whether the argument is named: Unnamed arguments ignore them, while named
	 * ones don't. Note, however, that trailing linebreak characters are always removed.
	 */
	value: string;
	/**
	 * The argument's text created out of {@link TemplateArgument.name |name} and {@link value}, starting with a pipe character.
	 *
	 * Note that the name is not rendered for unnamed arguments.
	 */
	text: string;
	/**
	 * The unformatted argument name.
	 */
	ufname: string;
	/**
	 * The unformatted argument value.
	 */
	ufvalue: string;
	/**
	 * The argument's text created out of {@link ufname} and {@link ufvalue}, starting with a pipe character.
	 *
	 * Note that the name is not rendered for unnamed arguments.
	 */
	uftext: string;
	/**
	 * Whether the argument is named.
	 */
	unnamed: boolean;
}

interface ArgumentHierarchy {
	/**
	 * Argument hierarchies.
	 *
	 * Module-invoking templates may have nested parameters; for example, `{{#invoke:module|user={{{1|{{{user|}}}}}}}}`
	 * can be transcluded as `{{template|user=value|1=value}}`. In this case, `|1=` and `|user=` should be regarded as
	 * instantiating the same template argument, and any non-empty `|user=` argument should override the `|1=` argument
	 * if any. To specify this type of argument hierarchies, pass `[['1', 'user'], [...]]`. Then, `|1=` will be
	 * overridden by `|user=` any time when an argument registration takes place and the operation detects the presence
	 * of a lower-hierarchy argument in the {@link Template} instance.
	 */
	hierarchy?: string[][];
}
/** The config object to be passed to {@link Template.constructor}. */
interface TemplateConfig extends ArgumentHierarchy {
	/**
	 * Full string that should fit into the first slot of the template (`{{fullName}}`), **excluding** double braces.
	 * May contain whitespace characters (`{{ fullName }}`) and/or expressions that are not part of the template name
	 * (`{{ <!--name-->fullName }}`, `{{ {{{|safesubst:}}}fullName }}`, `{{ fullName \n}}`).
	 */
	fullName?: string;
}

/**
 * The object that specifies what kind of a template argument should be added to {@link Template.args}.
 *
 * Used in {@link Template.addArgs} and {@link Template.setArgs}.
 */
interface NewArg {
	/**
	 * The name of the new argument. This can be an empty string if the class should automatically assign an integer name
	 * in accordance with the arguments that have already been registered.
	 *
	 * This property accepts leading/trailing spaces, for an output of e.g. `| 1 = value ` instead of `|1=value` (a config
	 * object must be passed to {@link Template.render} for this output).
	 */
	name: string;
	/**
	 * The value of the new argument.
	 *
	 * This property accepts leading/trailing spaces, for an output of e.g. `| 1 = value ` instead of `|1=value` (a config
	 * object must be passed to {@link Template.render} for this output). It can also end with `\n` when the argument should
	 * have a linebreak before the next argument or `}}` (although whether to add a new line should instead be specified by
	 * passing {@link RenderOptions.linebreak} or {@link RenderOptions.linebreakPredicate} to {@link Template.render}).
	 */
	value: string;
	/**
	 * Forcibly register this (integer-named) argument as unnamed. Ignored if {@link NewArg.name|name} (after being formatted)
	 * is not of an integer.
	 */
	forceUnnamed?: boolean;
}

/**
 * Object used to process the argument hierarchies of a template.
 */
interface TemplateArgumentHierarchy {
	/** The index number of {@link name} or its alias in {@link Template.keys}. */
	index: number;
	/** `1` if {@link name} is on a higher position than `key` is in the hierarchy, `-1` if lower, `0` if the same. */
	priority: number;
}

/** The option object passed to {@link Template.getArg} and {@link Template.hasArg}. */
interface GetArgOptions {
	/**
	 * Check whether the argument with the matched name meets this condition predicate.
	 * @param arg
	 */
	conditionPredicate?: (arg: TemplateArgument) => boolean;
}
/** The option object uniquely passed to {@link Template.getArg} (and not to {@link Template.hasArg}). */
interface GetArgUniqueOptions {
	/**
	 * If `true`, look for the first match, instead of the last.
	 */
	findFirst?: boolean;
}

/** The option object passed to {@link Template.render}. */
interface RenderOptions {
	/**
	 * Use the template name of this format. See {@link Template.getName} for details.
	 */
	nameprop?: 'full'|'clean'|'fullclean';
	/**
	 * Whether to add `subst:` before the template name.
	 */
	subst?: boolean;
	/**
	 * For template arguments, use the unformatted counterpart(s) of {@link TemplateArgument.name |name} (i.e. 
	 * {@link TemplateArgument.ufname |ufname}), {@link TemplateArgument.value |value} (i.e. {@link TemplateArgument.ufvalue |ufvalue}),
	 * or both, instead of the formatted ones. Note that specifying this option disables the auto-rendering of
	 * the name of an unnamed argument whose value contains a `=`.
	 */
	unformatted?: 'name'|'value'|'both';
	/**
	 * Callback function to {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort |Array.prototype.sort},
	 * called on the {@link Template.args} array before stringifying the template arguments.
	 * @param obj1
	 * @param obj2
	 */
	sortPredicate?: (obj1: TemplateArgument, obj2: TemplateArgument) => number;
	/**
	 * Whether to break lines for each template slot. Overridden by {@link linebreakPredicate}.
	 * 
	 * Note that if this option is specified, all trailing `\n`s are first removed, and it is then evaluated whether to
	 * add an `\n` at the end of the slot.
	 */
	linebreak?: boolean;
	/**
	 * Put a new line in accordance with this predicate. Prioritized than {@link linebreak}.
	 * 
	 * Note that if this option is specified, all trailing `\n`s are first removed, and it is then evaluated whether to
	 * add an `\n` at the end of the slot.
	 */
	linebreakPredicate?: {
		/**
		 * Whether to put a new line after the first template slot for the name. `\n` is added if the callback is true.
		 * @param name The template's name in accordance with {@link RenderOptions.nameprop}.
		 */
		name: (name: string) => boolean;
		/**
		 * Whether to put a new line after each template argument. `\n` is added if the callback is true.
		 * @param obj
		 */
		args: (obj: TemplateArgument) => boolean;
	};
}

/** The object returned by {@link Template.toJSON}. */
interface TemplateJSON {
	name: string;
	fullName: string;
	cleanName: string;
	fullCleanName: string;
	args: TemplateArgument[];
	keys: string[];
	overriddenArgs: TemplateArgument[];
	hierarchy: string[][];
}

/**
 * The Template class. Creates a new {{template}}.
 */
class Template {

	/**
	 * The trimmed `name` passed to the {@link Template.constructor |constructor}.
	 * @readonly
	 */
	readonly name: string;
	/**
	 * Full string that fits into the first slot of the template (i.e. `{{fullName}}`). May be accompanied by additional
	 * characters that are not relevant to the title of the page to be transcluded.
	 * @readonly
	 */
	readonly fullName: string;
	/**
	 * {@link Template.name |name} formatted by {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Title |mw.Title.newFromText}.
	 * @readonly
	 */
	readonly cleanName: string;
	/**
	 * {@link cleanName} with redundancies as in {@link fullName}.
	 * @readonly
	 */
	readonly fullCleanName: string;
	/**
	 * The arguments of the template parsed as an array of objects.
	 * @readonly
	 */
	readonly args: TemplateArgument[];
	/**
	 * An array of the names of the template arguments.
	 * @readonly
	 */
	readonly keys: string[];
	/**
	 * The overridden arguments of the template stored as an array of objects.
	 * @readonly
	 */
	readonly overriddenArgs: TemplateArgument[];
	/**
	 * Argument hierarchies.
	 * @protected
	 */
	protected readonly hierarchy: string[][];

	/**
	 * Initialize a new {@link Template} instance.
	 *
	 * @param name Name of the page that is to be transcluded. Should not contain anything but a page title.
	 * @param config Optional initializer object.
	 * @throws {Error} When `name` has inline `\n` characters or when {@link TemplateConfig.fullName |fullName}
	 * does not contain `name` as a substring.
	 * @requires mediawiki.Title
	 * @requires mediawiki.util
	 */
	constructor(name: string, config?: TemplateConfig) {

		const cfg = config || {};
		this.name = clean(name);
		if (this.name.includes('\n')) {
			throw new Error(`name ("${name}") is not allowed to contain inline "\\n" characters.`);
		}
		this.fullName = clean(cfg.fullName || name, false);
		this.args = [];
		this.keys = [];
		this.overriddenArgs = [];
		if (!this.fullName.includes(this.name)) {
			throw new Error(`fullName ("${this.fullName}") does not contain name ("${this.name}") as a substring.`);
		}
		this.hierarchy = cfg.hierarchy || [];

		// Truncate the leading colon, if any
		let colon = '';
		name = name.replace(/^[^\S\r\n]*:[^\S\r\n]*/, (m) => {
			colon = m;
			return '';
		});

		// Set cleanName
		const title = mw.Title.newFromText(name);
		const getConcatableFragment = (title: mw.Title): string => {
			const fragment = title.getFragment();
			return fragment ? '#' + fragment : '';
		};
		if (!title) {
			this.cleanName = colon + mwString.ucFirst(name);
		} else if (title.getNamespaceId() === 10) {
			this.cleanName = title.getMain() + getConcatableFragment(title);
		} else if (title.getNamespaceId() === 0) {
			this.cleanName = colon.trim() + title.getMain() + getConcatableFragment(title);
		} else {
			this.cleanName = title.getPrefixedDb() + getConcatableFragment(title);
		}
		this.fullCleanName = this.fullName.replace(this.name, this.cleanName);

	}

	/**
	 * Get the name of the template.
	 *
	 * @param prop By default, returns the original, unformatted `name` passed to {@link Template.constructor}.
	 * - If `full` is passed, returns {@link TemplateConfig.fullName |fullName} passed to {@link Template.constructor}
	 * (same as `name` if none was passed).
	 * - If `clean` is passed, returns {@link Template.name |name} that is formatted.
	 * - If `fullclean` is passed, returns {@link Template.name |name} that is formatted and accompanied by redundancies
	 * as in {@link TemplateConfig.fullName |fullName}.
	 *
	 * In specifying any of the above, the first letter is capitalized.
	 *
	 * Note that if `name` is prefixed by `Template:`, the namespace prefix is truncated in `prop=clean` and `prop=fullclean`.
	 * ```
	 * // name: Template:test
	 * const template = new Template('Template:test');
	 * console.log(template.getName()): // Template:test
	 * console.log(template.getName('full')): // Template:test
	 * console.log(template.getName('clean')): // Test
	 * console.log(template.getName('fullclean')): // Test
	 * ```
	 * For the clean names, namespace aliases are formatted to their canonical ones.
	 * ```
	 * // name: project:test', fullName: '<!--change?-->project:test
	 * const template = new Template('project:test', {fullName: '<!--change?-->project:test'});
	 * console.log(template.getName()): // project:test
	 * console.log(template.getName('full')): // <!--change?-->project:test
	 * console.log(template.getName('clean')): // Wikipedia:Test
	 * console.log(template.getName('fullclean')): // <!--change?-->Wikipedia:Test
	 * ```
	 */
	getName(prop?: 'full'|'clean'|'fullclean'): string {
		if (!prop) {
			return this.name;
		} else if (prop === 'fullclean') {
			return this.fullCleanName;
		} else if (prop === 'full') {
			return this.fullName;
		} else {
			return this.cleanName;
		}
	}

	/**
	 * Register template arguments into {@link args}.
	 *
	 * @param newArgs An array of `{name: string; value: string;}` objects.
	 * @param logOverride Whether to leave a log when overriding argument values.
	 */
	private registerArgs(newArgs: NewArg[], logOverride: boolean) {
		newArgs.forEach(({name, value, forceUnnamed}) => {

			const ufname = name;
			const ufvalue = value;
			name = clean(name);
			const unnamed = /^\d+$/.test(name) && forceUnnamed || !name;
			if (unnamed) {
				value = clean(value, false).replace(/\n*$/, '');
			} else {
				value = clean(value);
			}
			const text = '|' + (unnamed ? '' : name + '=') + value.replace(/^\|/, '');
			const uftext = '|' + (unnamed ? '' : ufname + '=') + ufvalue.replace(/^\|/, '');

			this.registerArg(
				{name, value, text, ufname, ufvalue, uftext, unnamed},
				logOverride
			);

		});
	}

	/**
	 * @param arg New argument object to register.
	 * @param logOverride Whether to leave a log when overriding argument values.
	 */
	private registerArg(arg: TemplateArgument, logOverride: boolean) {

		// Name if unnamed
		if (arg.unnamed) {
			for (let i = 1; i < Infinity; i++) {
				if (!this.keys.includes(i.toString())) {
					arg.name = i.toString();
					break;
				}
			}
		}

		// Check duplicates
		const hier = this.getHier(arg.name);
		let oldArg: TemplateArgument|null;
		if (hier !== null) {
			const foundArg = this.args[hier.index];
			if (hier.priority === 1 && arg.value || // There's an argument of a lower priority and this argument has a non-empty value
				hier.priority === -1 && !foundArg.value || // There's an argument of a higher priority and that argument's value is empty
				hier.priority === 0 && arg.value // This argument is a duplicate and has a non-empty value
			) {
				if (logOverride) {
					this.overriddenArgs.push({...foundArg}); // Leave a log of the argument to be overidden
				}
				// Delete the formerly-registered argument and proceed to registering this argument
				this.keys.splice(hier.index, 1);
				this.args.splice(hier.index, 1);
			} else {
				// The current argument is to be overridden by a formerly-registered argument
				if (logOverride) {
					this.overriddenArgs.push({...arg}); // Leave a log of this argument
				}
				return; // Don't register this argument
			}
		} else if ((oldArg = this.getArg(arg.name))){
			if (logOverride) {
				this.overriddenArgs.push({...oldArg});
			}
			this.deleteArg(arg.name);
		}

		// Register the new argument
		this.keys.push(arg.name);
		this.args.push(arg);

	}

	/**
	 * Check whether a given argument is to be hierarchically overridden.
	 * @param name
	 */
	private getHier(name: string): TemplateArgumentHierarchy|null {
		let ret = null;
		if (!this.hierarchy.length || !this.keys.length) {
			return ret;
		}
		this.hierarchy.some((arr) => {

			// Does this hierarchy array contain the designated argument name?
			const prIdx = arr.indexOf(name);
			if (prIdx === -1) return false;

			// Does the Template already have an argument of the designated name or its alias?
			const prIdx2 = arr.findIndex((key) => this.keys.includes(key));
			const keyIdx = this.keys.findIndex((key) => arr.includes(key));
			if (prIdx2 === -1 || keyIdx === -1) return false;

			// The argument of either the designated name or its alias is to be overridden
			ret = {
				index: keyIdx,
				priority: prIdx2 > prIdx ? -1 : prIdx2 < prIdx ? 1 : 0
			};
			return true;

		});
		return ret;
	}

	/**
	 * Add new arguments to the {@link Template} instance. This method leaves a log when argument override takes place,
	 * which can be viewed by {@link getOverriddenArgs}.
	 *
	 * @param newArgs An array of `{name: string; value: string;}` objects.
	 */
	addArgs(newArgs: NewArg[]): Template {
		this.registerArgs(newArgs, true);
		return this;
	}

	/**
	 * Set (or update) arguments in(to) the {@link Template} instance. This method does not leave a log when argument override takes place.
	 *
	 * Note: New arguments are simply newly added, just as when {@link addArgs} is used.
	 *
	 * @param newArgs An array of `{name: string; value: string;}` objects.
	 */
	setArgs(newArgs: NewArg[]): Template {
		this.registerArgs(newArgs, false);
		return this;
	}

	/**
	 * Get the arguments of the template as an array of objects.
	 *
	 * @param deepCopy Whether to return a deep copy, defaulted to `true`. Otherwise, {@link args} is passed by reference
	 * (not recommended).
	 * @returns
	 */
	getArgs(deepCopy = true): TemplateArgument[] {
		if (deepCopy) {
			return this.args.map(obj => ({...obj}));
		} else {
			return this.args;
		}
	}

	/**
	 * Get (a deep copy of) a template argument by an argument name.
	 * @param name Argument name.
	 * @param options Optional search options.
	 * @returns `null` if no argument is found with the specified name.
	 */
	getArg(name: string|RegExp, options?: GetArgOptions & GetArgUniqueOptions): TemplateArgument|null {

		options = options || {};

		const nameRegex = typeof name === 'string' ? new RegExp(`^${mw.util.escapeRegExp(name)}$`) : name;
		let firstMatch: TemplateArgument|null = null;
		let lastMatch: TemplateArgument|null = null;
		for (let i = 0; i < this.args.length; i++) {
			const arg = this.args[i];
			if (nameRegex.test(arg.name) && (!options.conditionPredicate || options.conditionPredicate(arg))) {
				if (!firstMatch) {
					firstMatch = arg;
				}
				lastMatch = arg;
			}
		}

		let ret = options.findFirst ? firstMatch : lastMatch;
		if (ret) ret = Object.assign({}, ret);
		return ret;

	}

	/**
	 * Check whether the {@link Template} instance has an argument with a certain name.
	 * @param name Name of the argument to search for.
	 * @param options Optional search options.
	 * @returns A boolean value in accordance with whether there is a match.
	 */
	hasArg(name: string|RegExp, options?: GetArgOptions): boolean {
		options = options || {};
		const nameRegex = typeof name === 'string' ? new RegExp(`^${mw.util.escapeRegExp(name)}$`) : name;
		for (let i = 0; i < this.args.length; i++) {
			const arg = this.args[i];
			if (nameRegex.test(arg.name) && (!options.conditionPredicate || options.conditionPredicate(arg))) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Delete template arguments.
	 * @param names
	 * @returns Deleted arguments.
	 */
	deleteArgs(names: string[]): TemplateArgument[] {
		return names.reduce((acc: TemplateArgument[], name) => {
			const idx = this.keys.indexOf(name);
			if (idx !== -1) {
				acc.push(this.args[idx]);
				this.keys.splice(idx, 1);
				this.args.splice(idx, 1);
			}
			return acc;
		}, []);
	}

	/**
	 * Delete a template argument.
	 * @param name
	 * @returns `true` if the instance has an argument with the specified name and if the argument is successfully removed,
	 * `false` otherwise.
	 */
	deleteArg(name: string): boolean {
		let deleted = false;
		const idx = this.keys.indexOf(name);
		if (idx !== -1) {
			this.keys.splice(idx, 1);
			this.args.splice(idx, 1);
			deleted = true;
		}
		return deleted;
	}

	/**
	 * Get a list of overridden template arguments as an array of objects. This method returns a deep copy,
	 * and modifying the return value does not modify the original array stored in the class.
	 */
	getOverriddenArgs(): TemplateArgument[] {
		return this.overriddenArgs.map(obj => ({...obj}));
	}

	/**
	 * Get the argument hierarchies.
	 * @returns
	 */
	getHierarchy(): string[][] {
		return this.hierarchy.map(arr => [...arr]);
	}

	/**
	 * Render the {@link Template} instance as wikitext.
	 *
	 * Use `render({nameprop: 'full', unformatted: 'both'})` for an output that is closest to the original configurations.
	 *
	 * @param options Optional object of rendering specifications
	 */
	render(options?: RenderOptions): string {

		options = options || {};
		let ret = '{{';

		// Render name
		let n;
		const subst = options.subst ? 'subst:' : '';
		switch (options.nameprop) {
			case 'full':
				n = this.fullName.replace(this.name, subst + this.name);
				break;
			case 'clean':
				n = subst + this.cleanName;
				break;
			case 'fullclean':
				n = this.fullCleanName.replace(this.cleanName, subst + this.cleanName);
				break;
			default:
				n = subst + this.name;
		}
		if (options.linebreakPredicate) {
			ret += n.replace(/\n+$/, '') + (options.linebreakPredicate.name(n) ? '\n' : '');
		} else if (options.linebreak) {
			ret += n.replace(/\n+$/, '') + '\n';
		} else {
			ret += n;
		}

		// Render args
		const args = this.args.map(obj => ({...obj}));
		if (options.sortPredicate) {
			args.sort(options.sortPredicate);
		}
		for (const obj of args) {
			let text = '|';
			const name = options.unformatted === 'name' || options.unformatted === 'both' ? obj.ufname : obj.name;
			const value = options.unformatted === 'value' || options.unformatted === 'both' ? obj.ufvalue : obj.value;
			if (!obj.unnamed || !options.unformatted && value.includes('=')) {
				text += name + '=';
			}
			text += value;
			if (options.linebreakPredicate) {
				ret += text.replace(/\n+$/, '') + (options.linebreakPredicate.args(obj) ? '\n' : '');
			} else if (options.linebreak) {
				ret += text.replace(/\n+$/, '') + '\n';
			} else {
				ret += text;
			}
		}
		ret += '}}';

		return ret;

	}

	/**
	 * Stringify the {@link Template} instance. Same as `render({nameprop: 'full', unformatted: 'both'})`.
	 */
	toString(): string {
		return this.render({nameprop: 'full', unformatted: 'both'});
	}

	/**
	 * Get class properties in a JSON format.
	 */
	toJSON(): TemplateJSON {
		return {
			name: this.name,
			fullName: this.fullName,
			cleanName: this.cleanName,
			fullCleanName: this.fullCleanName,
			args: this.args.map(obj => ({...obj})),
			keys: this.keys.slice(),
			overriddenArgs: this.overriddenArgs.map(obj => ({...obj})),
			hierarchy: this.hierarchy.map(arr => [...arr])
		};
	}

}

/** 
 * The object that is passed to {@link ParsedTemplate.constructor}.
 * @internal
 */
interface ParsedTemplateParam extends ArgumentHierarchy {
	name: string;
	fullName: string;
	args: ParsedArgument[];
	text: string;
	startIndex: number;
	endIndex: number;
	nestLevel: number;
}

/** Part of the object passed to the second parameter of {@link ParsedTemplate.replaceIn}. */
interface ReplaceInOptions {
	/**
	 * Replace the original template with this string.
	 *
	 * Default: {@link ParsedTemplate.render}(options)
	 */
	with?: string;
	/**
	 * If `true` (default), replacement takes place only if the passed wikitext has the original template
	 * starting at {@link ParsedTemplate._startIndex} and ending (exclusively) at {@link ParsedTemplate._endIndex}.
	 * This prevents a nonparsed template in a transclusion-preventing tag from being wrongly replaced
	 * ({@link Wikitext.parseTemplates} does not parse templates inside the relevant tags).
	 * ```
	 * const wikitext = '<!--{{Template}}-->\n{{Template}}'; // The second one is parsed
	 * const Wkt = new Wikitext(wikitext);
	 * const Temps = Wkt.parseTemplates(); // Temps[0]: ParsedTemplate, Temps[1]: undefined
	 * const newWikitext1 = Temps[0].replaceIn(wikitext, {with: ''});
	 * const newWikitext2 = Temps[0].replaceIn(wikitext, {with: '', useIndex: false});
	 * console.log(newWikitext1); // '<!--{{Template}}-->', expected result
	 * console.log(newWikitext2); // '<!---->\n{{Template}}', unexpected result
	 * ```
	 */
	useIndex?: boolean;
}

/** Class used by {@link Wikitext.parseTemplates}. */
class ParsedTemplate extends Template {

	/**
	 * The original text of the template.
	 * @readonly
	 */
	readonly originalText: string;
	/**
	 * **CAUTION**: Pseudo-private property. Use {@link getStartIndex} to get this property's value.
	 * 
	 * The index to the start of the template in the wikitext out of which the template was parsed.
	 * 
	 * Note that this property is made private-like because it shouldn't be modified externally, but sometimes
	 * {@link Wikitext.parseTemplates} needs to modify this property, from outside this class.
	 */
	_startIndex: number;
	/**
	 * **CAUTION**: Pseudo-private property. Use {@link getEndIndex} to get this property's value.
	 * 
	 * The index up to, but not including, the end of the template in the wikitext out of which the template was parsed.
	 * 
	 * Note that this property is made private-like because it shouldn't be modified externally, but sometimes
	 * {@link Wikitext.parseTemplates} needs to modify this property, from outside this class.
	 */
	_endIndex: number;
	/**
	 * The nest level of the template. If not nested by other templates, the value is `0`.
	 */
	readonly nestLevel: number;

	/**
	 * Initialize a new {@link ParsedTemplate} instance. **This constructor is not supposed to be used externally**.
	 * @param parsed
	 * @throws {Error} When `name` has inline `\n` characters or when {@link TemplateConfig.fullName |fullName}
	 * does not contain `name` as a substring.
	 */
	constructor(parsed: ParsedTemplateParam) {
		const {name, fullName, args, text, startIndex, endIndex, hierarchy, nestLevel} = parsed;
		super(name, {fullName, hierarchy});
		this.addArgs(args.map((obj) => ({'name': obj.name.replace(/^\|/, ''), value: obj.value.replace(/^\|/, '')})));
		this.originalText = text;
		this._startIndex = startIndex;
		this._endIndex = endIndex;
		this.nestLevel = nestLevel;
	}

	/**
	 * Error-proof constructor. **This method is supposed to be used only by {@link Wikitext.parseTemplates}**.
	 * @param parsed
	 * @returns `null` if the constructor threw an error.
	 */
	static new(parsed: ParsedTemplateParam): ParsedTemplate|null {
		try {
			return new ParsedTemplate(parsed);
		}
		catch (err) {
			return null;
		}
	}

	/**
	 * Get class properties in a JSON format.
	 */
	toJSON(): TemplateJSON & { // Overrides `Template.toJSON`
		originalText: string;
		startIndex: number;
		endIndex: number;
		nestLevel: number;
	} {
		return {
			name: this.name,
			fullName: this.fullName,
			cleanName: this.cleanName,
			fullCleanName: this.fullCleanName,
			args: this.args.map(obj => ({...obj})),
			keys: this.keys.slice(),
			overriddenArgs: this.overriddenArgs.map(obj => ({...obj})),
			hierarchy: this.hierarchy.map(arr => [...arr]),
			originalText: this.originalText,
			startIndex: this._startIndex,
			endIndex: this._endIndex,
			nestLevel: this.nestLevel
		};
	}

	/**
	 * Render the original template text.
	 * @returns
	 */
	renderOriginal(): string {
		return this.originalText;
	}

	/**
	 * Get {@link _startIndex}.
	 * @returns
	 */
	getStartIndex(): number {
		return this._startIndex;
	}

	/**
	 * Get {@link _endIndex}.
	 * @returns
	 */
	getEndIndex(): number {
		return this._endIndex;
	}

	/**
	 * Get the nest level of the template.
	 * @returns
	 */
	getNestLevel(): number {
		return this.nestLevel;
	}

	/**
	 * Find the original template in a wikitext and replace it with the (updated) template obtained by
	 * {@link render}. This method is supposed to be called on a wiktiext same as the one from which the
	 * {@link ParsedTemplate} instance was parsed and initialized.
	 * 
	 * Note that if this method is called recursively against an array of {@link ParsedTemplate}, the looped array needs to be
	 * reversed so that the replacement takes place from the bottom of the wikitext. This is because the method reads the start
	 * and end indexes of the original template before the replacement (unless {@link ReplaceInOptions.useIndex|useIndex} is set
	 * to `false`), and if the replacement is done in a top-down fashion, the indexes change and the subsequent replacements are
	 * affected.
	 *
	 * @param wikitext Wikitext in which to search for the original template.
	 * @param options Optional object to specify rendering and replacement options.
	 * @returns New wikitext with the original template replaced. (Could be the same as the input wikitext if the replacement
	 * didn't take place.)
	 */
	replaceIn(wikitext: string, options?: RenderOptions & ReplaceInOptions): string {

		const cfg = Object.assign({useIndex: true}, options || {});
		const replacer = typeof cfg.with === 'string' ? cfg.with : this.render(cfg);

		if (!cfg.useIndex) {
			return wikitext.replace(this.originalText, replacer);
		} else if (wikitext.slice(this._startIndex, this._endIndex) === this.originalText) {
			let chunk1 = wikitext.slice(0, this._startIndex);
			const chunk2 = replacer;
			let chunk3 = wikitext.slice(this._endIndex);
			const hasLineBreak = /\n[^\S\n\r]*$/.test(chunk1) || /^[^\S\n\r]*\n[^\S\n\r]*/.test(chunk3);
			if (replacer === '' && hasLineBreak) {
				chunk1 = chunk1.trim();
				chunk3 = (chunk1 !== '' ? '\n' : '') + chunk3.trim();
			}
			return chunk1 + chunk2 + chunk3;
		} else {
			return wikitext;
		}

	}

}

/** The object that stores revision information fetched by {@link Wikitext.fetch}. */
interface Revision {
	/** The ID of the page. */
	pageid: number;
	/** The ID of the current revision. */
	revid: number;
	/** The namespace number of the page. */
	ns: number;
	/** The formatted title of the page. */
	title: string;
	/** The JSON timestamp of the current revision. */
	basetimestamp: string;
	/** The JSON timestamp of the API request. */
	curtimestamp: string;
	/** The byte length of the page content. */
	length: number;
	/** The content of the page. */
	content: string;
	/** Whether the page is a redirect. */
	redirect: boolean;
}

/** The object that is an element of the return array of {@link Wikitext.parseTags}. */
interface Tag {
	/**
	 * The name of the tag in lowercase (for `<!---->` tags, the name is `comment`).
	 */
	name: string;
	/**
	 * The whole text of the tag (i.e. outerHTML).
	 */
	text: string;
	/**
	 * The text inside the tag (i.e. innerHTML).
	 */
	innerText: string;
	/**
	 * Whether the tag closes itself. For comments, `true` for empty ones (i.e. `<!---->`), `false` otherwise.
	 */
	selfClosed: boolean;
	/**
	 * Whether the tag is unclosed.
	 */
	unclosed: boolean;
	/**
	 * The index to the start of the tag in the wikitext.
	 */
	startIndex: number;
	/**
	 * The index up to, but not including, the end of the tag in the wikitext.
	 */
	endIndex: number;
	/**
	 * The nest level of the tag (`0` if not inside any parent tag).
	 */
	nestLevel: number;
}
/** The parsing config of {@link Wikitext.parseTags}. */
interface ParseTagsConfig {
	/**
	 * Only include \<tag>s that match this predicate.
	 * @param tag
	 * @returns
	 */
	conditionPredicate?: (tag: Tag) => boolean;
}

/** The object that is an element of the return array of {@link Wikitext.parseSections}. */
interface Section {
	/**
	 * The title of the section. Could be different from the result of `action=parse` if it contains HTML tags or templates.
	 * For the top section, the value is `top`.
	 */
	title: string;
	/**
	 * `==heading==` or the outerHTML of a heading element. Any leading/trailing `\s`s are trimmed.
	 * For the top section, the value is empty.
	 */
	heading: string;
	/**
	 * The level of the section (1 to 6). For the top section, the value is `1`.
	 */
	level: number;
	/**
	 * The index number of the section. This is the same as the `section` parameter of {@link https://www.mediawiki.org/wiki/API:Edit |the edit API}.
	 * For the top section, the value is `0`.
	 */
	index: number;
	/**
	 * The index to the start of the section in the wikitext.
	 */
	startIndex: number;
	/**
	 * The index up to, but not including, the end of the section in the wikitext.
	 */
	endIndex: number;
	/**
	 * The content of the section including the heading.
	 */
	content: string;
}

/** The object that is an element of the return array of {@link Wikitext.parseParameters}. */
interface Parameter {
	/**
	 * The entire text of the parameter.
	 */
	text: string;
	/**
	 * The index to the start of the parameter in the wikitext.
	 */
	startIndex: number;
	/**
	 * The index up to, but not including, the end of the parameter in the wikitext.
	 */
	endIndex: number;
	/**
	 * The nest level of the parameter. For parameters that are not nested inside another parameter, the value is `0`.
	 */
	nestLevel: number;
}
/** The parsing config of {@link Wikitext.parseParameters}. */
interface ParseParametersConfig {
	/**
	 * Whether to parse {{{parameter}}}s inside another {{{parameter}}}.
	 *
	 * Default: `true`
	 */
	recursive?: boolean;
	/**
	 * Only include {{{parameter}}}s that match this predicate. Note that this predicate is evaluated after the {@link recursive} config.
	 * For this reason, it had better not specify both of the configs simultaneously, but rather include a condition to see if the callback
	 * function's parameter of {@link Parameter.nestLevel|nestLevel} has the value of `0`.
	 * @param parameter
	 * @returns
	 */
	conditionPredicate?: (parameter: Parameter) => boolean;
}

/** The parsing config of {@link Wikitext.parseTemplates}. */
interface ParseTemplatesConfig extends ArgumentHierarchy {
	/**
	 * Only parse templates whose names match this predicate.
	 * @param name The name of the parsed template, which is the same as {@link ParsedTemplate.getName}('clean')`.
	 */
	namePredicate?: (name: string) => boolean;
	/**
	 * Only parse templates whose {@link ParsedTemplate} instances match this predicate. Can be used together with
	 * {@link namePredicate}, although this predicate is evaluated after evaluating {@link namePredicate}.
	 * @param Template
	 */
	templatePredicate?: (Template: ParsedTemplate) => boolean;
	/**
	 * Parse nested templates in accordance with this predicate.
	 *
	 * Default: Always parse nested templates
	 * @param Template Can be `null` if {@link ParsedTemplate.constructor} has thrown an error.
	 */
	recursivePredicate?: (Template: ParsedTemplate|null) => boolean;
	/**
	 * Private parameter used to determine the value of {@link ParsedTemplate.nestLevel}.
	 * @private
	 */
	_nestLevel?: number;
}

/** The Wikitext class with methods to manipulate wikitext. */
class Wikitext {

	/**
	 * The wikitext from which the {@link Wikitext} instance was initialized.
	 */
	readonly wikitext: string;
	/**
	 * Stores the return value of {@link Wikitext.fetch|fetch} when a {@link Wikitext} instance is created by {@link newFromTitle}.
	 *
	 * A deep copy can be retrieved by {@link getRevision}.
	 * @private
	 */
	private revision: Revision|null;
	/**
	 * Stores the return value of {@link parseTags}.
	 *
	 * A deep copy can be retrieved by {@link getTags}.
	 * @private
	 */
	private tags: Tag[]|null;
	/**
	 * Stores the return value of {@link parseSections}.
	 *
	 * A deep copy can be retrieved by {@link getSections}.
	 * @private
	 */
	private sections: Section[]|null;
	/**
	 * Stores the return value of {@link parseParameters}.
	 *
	 * A deep copy can be retrieved by {@link getParameters}.
	 * @private
	 */
	private parameters: Parameter[]|null;

	/**
	 * Initialize a {@link Wikitext} instance.
	 * @param wikitext
	 * @requires mediawiki.api
	 */
	constructor(wikitext: string) {
		this.wikitext = wikitext;
		this.revision = null;
		this.tags = null;
		this.sections = null;
		this.parameters = null;
	}

	/**
	 * Returns the length of the wikitext.
	 */
	get length(): number {
		return this.wikitext.length;
	}

	/**
	 * Returns the byte length of the wikitext.
	 */
	get byteLength(): number {
		const rev = this.getRevision();
		return rev && rev.length || mwString.byteLength(this.wikitext);
	}

	/**
	 * Fetch the wikitext of a page with additional information on the current revision.
	 * @param pagetitle
	 * @returns `false` if the page doesn't exist, `null` if the API request failed.
	 * @requires mediawiki.api
	 */
	static fetch(pagetitle: string): JQueryPromise<Revision|false|null> {
		return new mw.Api().get({
			action: 'query',
			titles: pagetitle,
			prop: 'info|revisions',
			rvprop: 'ids|timestamp|content',
			rvslots: 'main',
			curtimestamp: 1,
			formatversion: 2
		}).then((res: DynamicObject) => {
			const resPgs = res && res.query && Array.isArray(res.query.pages) && res.query.pages[0];
			if (!resPgs || typeof resPgs.pageid !== 'number' || !resPgs.revisions || typeof res.curtimestamp !== 'string' || typeof resPgs.length !== 'number') {
				return null;
			} else if (resPgs.missing) {
				return false;
			} else {
				const ret: Revision = {
					pageid: resPgs.pageid,
					revid: resPgs.revisions[0].revid,
					ns: resPgs.ns,
					title: resPgs.title,
					basetimestamp: resPgs.revisions[0].timestamp,
					curtimestamp: res.curtimestamp,
					length: resPgs.length,
					content: resPgs.revisions[0].slots.main.content,
					redirect: !!resPgs.redirect
				};
				return ret;
			}
		}).catch((_, err: DynamicObject) => {
			console.warn(err);
			return null;
		});
	}

	/**
	 * Fetch the wikitext of a page. If additional revision information should be included, use {@link Wikitext.fetch|fetch}.
	 * @param pagetitle
	 * @returns `false` if the page doesn't exist, `null` if the API request failed.
	 * @requires mediawiki.api
	 */
	static read(pagetitle: string): JQueryPromise<string|false|null> {
		return Wikitext.fetch(pagetitle).then((res) => res && res.content);
	}

	/**
	 * Initialize a new {@link Wikitext} instance by fetching the content of a page.
	 * @param pagetitle
	 * @returns `false` if the page doesn't exist, `null` if the content of the page failed to be fetched.
	 * @requires mediawiki.api
	 */
	static newFromTitle(pagetitle: string): JQueryPromise<Wikitext|false|null> {
		return Wikitext.fetch(pagetitle).then((revision) => {
			if (!revision) {
				return revision;
			} else {
				const Wkt = new Wikitext(revision.content);
				Wkt.revision = revision;
				return Wkt;
			}
		});
	}

	/**
	 * Get a deep copy of {@link revision}, which is a private property available only when the {@link Wikitext} instance was initialized
	 * by {@link newFromTitle}.
	 * @returns `null` if the instance doesn't have the relevant property, meaning that it wasn't initialized by {@link newFromTitle}.
	 */
	getRevision(): Revision|null {
		return this.revision && {...this.revision};
	}

	/**
	 * Parse \<tag>s in the wikitext.
	 * @param config
	 * @returns
	 */
	parseTags(config?: ParseTagsConfig): Tag[] {

		const cfg = config || {};
		if (this.tags) {
			return this.tags.reduce((acc: Tag[], obj) => {
				if (!cfg.conditionPredicate || cfg.conditionPredicate(obj)) {
					acc.push({...obj}); // Deep copy
				}
				return acc;
			}, []);
		}

		const wikitext = this.wikitext;
		let tags: Tag[] = [];
		/**
		 * HTML tags and whitespace
		 * ```html
		 * <foo   > <!-- No whitespace between "<" and the tag name -->
		 * </foo  > <!-- No whitespace between "</" and the tag name -->
		 * <foo  /> <!-- No whitespace in-between "/>" -->
		 * ```
		 */
		const regex = {
			/** Matches `<tag>`. (`$1`: tag name) */
			opening: /^<(?!\/)([^>\s]+)(?:\s[^>]*)?>/,
			/** Matches `</tag>`. (`$1`: tag name) */
			closing: /^<\/([^>\s]+)(?:\s[^>]*)?>/,
			/** Matches `/>`. */
			selfClosing: /\/>$/,
			/** Matches `<!--`. */
			commentOpening: /^<!--/,
			/** Matches `-->`. */
			commentClosing: /^-->/
		};
		/**
		 * Stores the last-found opening tag at index `0`.
		 * Once the opening of a comment tag is unshifted, no new opening tag is unshifted before the comment tag is shifted.
		 */
		const parsing: {name: string; index: number; innerIndex: number;}[] = [];
		/** Whether we are in a comment (i.e. `<!---->`). */
		const inComment = () => parsing[0] && parsing[0].name === 'comment';

		// Parse the wikitext, character by character
		for (let i = 0; i < wikitext.length; i++) {
			const wkt = wikitext.slice(i);
			let m;
			if (!inComment()) {
				if (regex.commentOpening.test(wkt)) { // Found an occurrence of <!--
					parsing.unshift({
						name: 'comment',
						index: i,
						innerIndex: i + 4
					});
					i += 3;
				} else if ((m = wkt.match(regex.opening))) { // Found an occurrence of <tag>
					const tagName = m[1].toLowerCase();
					if (regex.selfClosing.test(m[0])) { // Closing self
						tags.push({
							name: tagName,
							text: m[0],
							innerText: '',
							selfClosed: true,
							unclosed: false,
							startIndex: i,
							endIndex: i + m[0].length,
							nestLevel: parsing.length
						});
					} else { // Found a new tag
						parsing.unshift({
							name: tagName,
							index: i,
							innerIndex: i + m[0].length
						});
					}
					i += m[0].length - 1;
				} else if (parsing.length && (m = wkt.match(regex.closing))) { // Found an occurrence of </tag>
					const tagName = m[1].toLowerCase();
					let spliceCnt = 0;
					for (let j = 0; j < parsing.length; j++) { // Loop the `parsing` array until we find the corresponding opening tag
						const isSameTagName = parsing[j].name === tagName; // e.g. true when <span></span>, false when <span><div></span>
						const endIndex = isSameTagName ? i + m[0].length : i; // "<span></span>" or <span>"<div>"</span>
						tags.push({
							name: parsing[j].name,
							text: wikitext.slice(parsing[j].index, endIndex),
							innerText: wikitext.slice(parsing[j].innerIndex, endIndex - (isSameTagName ? m[0].length : 0)),
							selfClosed: false,
							unclosed: !isSameTagName,
							startIndex: parsing[j].index,
							endIndex: endIndex,
							nestLevel: parsing.length - 1
						});
						spliceCnt++;
						if (isSameTagName) {
							break;
						}
					}
					parsing.splice(0, spliceCnt);
					i += m[0].length - 1;
				}
			} else if (regex.commentClosing.test(wkt)) { // In comment and found "-->"
				const startIndex = parsing[0].index;
				const endIndex = i + 3;
				tags.push({
					name: 'comment',
					text: wikitext.slice(startIndex, endIndex),
					innerText: wikitext.slice(parsing[0].innerIndex, endIndex - 3),
					selfClosed: i - 4 === startIndex, // <!--|-->: The pipe is where the current index is at
					unclosed: false,
					startIndex: startIndex,
					endIndex: endIndex,
					nestLevel: parsing.length - 1
				});
				parsing.shift();
				i += 2;
			}
		}

		// Do we have any unclosed tag left?
		for (let i = 0; i < parsing.length; i++) {
			tags.push({
				name: parsing[i].name,
				text: wikitext.slice(parsing[i].index, wikitext.length),
				innerText: wikitext.slice(parsing[i].innerIndex, wikitext.length),
				selfClosed: false,
				unclosed: true,
				startIndex: parsing[i].index,
				endIndex: wikitext.length,
				nestLevel: parsing.length - 1 - i
			});
		}

		// Sort the parsed tags
		tags.sort((obj1, obj2) => {
			if (obj1.startIndex < obj2.startIndex && obj1.endIndex > obj2.endIndex) {
				return -1;
			} else if (obj1.startIndex < obj2.startIndex) {
				return -1;
			} else if (obj1.endIndex > obj2.endIndex) {
				return 1;
			} else {
				return 0;
			}
		});

		// Save the tags
		this.tags = tags.map(obj => ({...obj})); // Deep copy

		// Filter the result in accordance with the config
		if (cfg.conditionPredicate) {
			tags = tags.filter(Tag => cfg.conditionPredicate!(Tag));
		}

		return tags;

	}

	/**
	 * Get a deep copy of {@link tags}, which is a private property available only when {@link parseTags} has
	 * been called at least once. Note that {@link parseTags} returns a (filtered) deep copy of {@link tags}
	 * on a non-first call, so simply call the relevant method if there is no need for a `null` return.
	 * @returns
	 */
	getTags(): Tag[]|null {
		return this.tags && this.tags.map(obj => ({...obj}));
	}

	/**
	 * Check whether a substring of the wikitext starting and ending at a given index is inside any transclusion-preventing tag.
	 * @param tpTags An array of transclusion-preventing tags fetched by {@link parseTags}.
	 * @param startIndex The start index of the string in the wikitext.
	 * @param endIndex The end index of the string in the wikitext.
	 * @returns
	 */
	private inTpTag(tpTags: Tag[], startIndex: number, endIndex: number): boolean {
		return tpTags.some((obj) => obj.startIndex < startIndex && endIndex < obj.endIndex);
	}

	/**
	 * Parse sections in the wikitext.
	 * @returns
	 */
	parseSections(): Section[] {

		if (this.sections) {
			return this.sections.map(obj => ({...obj})); // Deep copy
		}

		// Get transclusion-preventing tags
		const tpTags = this.parseTags({
			conditionPredicate: (tag) => ['comment', 'nowiki', 'pre', 'syntaxhighlight', 'source', 'math'].includes(tag.name)
		});
		/**
		 * Remove `<!---->` tags from a string.
		 * @param str
		 * @returns
		 */
		const removeComments = (str: string): string => {
			tpTags.forEach(({name, text}) => {
				if (name === 'comment') {
					str = str.replace(text, '');
				}
			});
			return str;
		};

		// Define regular expressions
		/**
		 * Regular expression to parse out ==heading==s.
		 *
		 * Notes on the wiki markup of headings:
		 * - `== 1 ===`: `<h2>1 =</h2>`
		 * - `=== 1 ==`: `<h2>= 1</h2>`
		 * - `== 1 ==\S+`: Not recognized as the beginning of a section (but see below)
		 * - `== 1 ==<!--string-->`: `<h2>1</h2>`
		 * - `======= 1 =======`: `<h6>= 1 =</h6>`
		 *
		 * Capture groups:
		 * - `$1`: Left equals
		 * - `$2`: Heading text
		 * - `$3`: Right equals
		 * - `$4`: Remaining characters
		 *
		 * In `$4`, basically no character can appear, except:
		 * - `[\t\n\u0020\u00a0]` ( = `[\u0009\u000a\u0020\u00a0]`)
		 *
		 * Note that this is not the same as the JS `\s`, which is equivalent to
		 * `[\t\n\v\f\r\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]`.
		 */
		const rHeading = /^(={1,6})(.+?)(={1,6})([^\n]*)\n?$/gm;
		const rWhitespace = /[\t\u0020\u00a0]/g;

		// Get <heading>s
		interface Heading {
			/** The entire line of the heading, starting with `=`. Any leading/trailing `\s`s are trimmed. */
			text: string;
			/** The inner text of the heading. Could be different from the result of `action=parse` if it contains HTML tags or templates. */
			title: string;
			/** The level of the heading. */
			level: number;
			/** The index to the start of the heading in the wikitext. */
			index: number;
		}
		const headings = this.parseTags().reduce((acc: Heading[], obj) => {
			let m;
			if ((m = obj.name.match(/^h([1-6])$/)) && !obj.selfClosed && !this.inTpTag(tpTags, obj.startIndex, obj.endIndex)) {
				// The tag is a heading element, not self-closing, and not in a transclusion-preventing tag
				acc.push({
					text: obj.text,
					title: clean(removeComments(obj.innerText)),
					level: parseInt(m[1]),
					index: obj.startIndex
				});
			}
			return acc;
		}, []);

		// Parse ==heading==s
		let m;
		while ((m = rHeading.exec(this.wikitext))) {

			// If `$4` isn't empty or the ==heading== is inside a transclusion-preventing tag, the heading isn't the start of a section
			const m4 = m[4].replace(rWhitespace, '');
			if (m4 && removeComments(m4) || this.inTpTag(tpTags, m.index, m.index + m[0].length)) {
				continue;
			}

			// Validate the heading
			const level = Math.min(m[1].length, m[3].length); // The number of "="s (smallest)
			const title = clean(removeComments(
				'='.repeat(Math.max(0, m[1].length - level)) + // Add "="s if the left and right "="s don't count the same
				m[2] +
				'='.repeat(Math.max(0, m[3].length - level))
			));
			headings.push({
				text: m[0].trim(),
				title,
				level,
				index: m.index
			});

		}
		headings.sort((obj1, obj2) => obj1.index - obj2.index);
		headings.unshift({text: '', title: 'top', level: 1, index: 0}); // For the top section

		// Parse sections from the headings
		const wkt = this.wikitext;
		const sections: Section[] = headings.map(({text, title, level, index}, i, arr) => {
			const boundaryIdx =
				i === 0 ? // If this is the top section,
				(arr.length > 1 ? 1 : -1) :	// the next heading or else no boundary, otherwise
				arr.findIndex((obj, j) => j > i && obj.level <= level); // find a next non-subsection of this section
			const content = wkt.slice(
				index,
				boundaryIdx !== -1 ? arr[boundaryIdx].index : wkt.length // Up to the next heading or to the end of the entire wikitext
			);
			return {
				title,
				heading: text,
				level,
				index: i,
				startIndex: index,
				endIndex: index + content.length,
				content
			};
		});

		// Save the sections
		this.sections = sections.map(obj => ({...obj})); // Deep copy

		return sections;

	}

	/**
	 * Get a deep copy of {@link sections}, which is a private property available only when {@link parseSections} has
	 * been called at least once. Note that {@link parseSections} returns a (filtered) deep copy of {@link sections}
	 * on a non-first call, so simply call the relevant method if there is no need for a `null` return.
	 * @returns
	 */
	getSections(): Section[]|null {
		return this.sections && this.sections.map(obj => ({...obj}));
	}

	/**
	 * Parse {{{parameter}}}s in the wikitext.
	 * @param config
	 * @returns
	 */
	parseParameters(config?: ParseParametersConfig): Parameter[] {

		const cfg: ParseParametersConfig = Object.assign({recursive: true}, config || {});
		if (this.parameters) {
			return this.parameters.reduce((acc: Parameter[], obj) => {
				if (obj.nestLevel > 0 && !cfg.recursive) {
					return acc;
				}
				if (cfg.conditionPredicate && !cfg.conditionPredicate(obj)) {
					return acc;
				}
				acc.push({...obj}); // Deep copy
				return acc;
			}, []);
		}

		const tpTags = this.parseTags({
			conditionPredicate: (tag) => ['comment', 'nowiki', 'pre', 'syntaxhighlight', 'source', 'math'].includes(tag.name)
		});

		// Parse parameters from the left to the right
		const params: Parameter[] = [];
		let exe;
		const regex = /\{\{\{[^{][^}]*\}\}\}/g;
		const wikitext = this.wikitext;
		let nestLevel = 0;
		while ((exe = regex.exec(wikitext))) {

			/**
			 * Parameters can have templates nested (e.g. `{{{1|{{{page|{{PAGENAME}}}}}}}}`), and the `exec` above
			 * gets `{{{1|{{{page|{{PAGENAME}}}` in such cases.
			 */
			let para = exe[0];
			const leftBraceCnt = (para.match(/\{{2,}/g) || []).join('').length;
			let rightBraceCnt = (para.match(/\}{2,}/g) || []).join('').length;
			let grammatical = true;
			if (leftBraceCnt > rightBraceCnt) { // If the numbers of left and right braces aren't the same
				grammatical = false;
				let pos = exe.index + para.length - 3; // Get the end index of `{{{1|{{{page|{{PAGENAME` in `wikitext`
				rightBraceCnt -= 3;
				for (pos; pos < wikitext.length; pos++) { // Check what character comes at `_` in `{{{1|{{{page|{{PAGENAME_`
					const m = wikitext.slice(pos).match(/^\}{2,}/);
					if (m) { // `_` is a right brace followed by another
						if (leftBraceCnt <= rightBraceCnt + m[0].length) { // If the right braces close all the left braces
							const lastIndex = pos + (leftBraceCnt - rightBraceCnt);
							para = wikitext.slice(exe.index, lastIndex); // Get the correct parameter
							grammatical = true;
							regex.lastIndex = lastIndex; // Update the index at which to start the next match
							break;
						} else {
							pos += m[0].length - 1;
							rightBraceCnt += m[0].length;
						}
					}
				}
			}

			if (grammatical) {
				if (!this.inTpTag(tpTags, exe.index, regex.lastIndex)) {
					params.push({
						text: para,
						startIndex: exe.index,
						endIndex: regex.lastIndex,
						nestLevel
					});
					if (cfg.recursive && para.slice(3).includes('{{{')) {
						regex.lastIndex = exe.index + 3;
						nestLevel++;
					} else {
						nestLevel = 0;
					}
				}
			} else {
				console.log(`Unparsable parameter: ${para}`);
			}

		}

		// Save the parameters
		this.parameters = params.map(obj => ({...obj})); // Deep copy

		return params.reduce((acc: Parameter[], obj) => {
			if (obj.nestLevel > 0 && !cfg.recursive) {
				return acc;
			}
			if (cfg.conditionPredicate && !cfg.conditionPredicate(obj)) {
				return acc;
			}
			acc.push(obj);
			return acc;
		}, []);

	}

	/**
	 * Get a deep copy of {@link parameters}, which is a private property available only when {@link parseParameters} has
	 * been called at least once. Note that {@link parseParameters} returns a (filtered) deep copy of {@link parameters}
	 * on a non-first call, so simply call the relevant method if there is no need for a `null` return.
	 * @returns
	 */
	getParameters(): Parameter[]|null {
		return this.parameters && this.parameters.map(obj => ({...obj}));
	}

	/**
	 * Parse {{template}}s in the wikitext.
	 * @param config
	 * @returns
	 */
	parseTemplates(config?: ParseTemplatesConfig): ParsedTemplate[] {

		const cfg = Object.assign({_nestLevel: 0}, config || {});
		const tpTags = this.parseTags({
			conditionPredicate: (tag) => ['comment', 'nowiki', 'pre', 'syntaxhighlight', 'source', 'math'].includes(tag.name)
		});
		const params = this.parseParameters({recursive: false});

		let numUnclosed = 0;
		let startIdx = 0;
		let args: ParsedArgument[] = [];

		// Character-by-character loop
		const wikitext = this.wikitext;
		let ret: ParsedTemplate[] = [];
		for (let i = 0; i < wikitext.length; i++) {

			const wkt = wikitext.slice(i);

			// Skip certain expressions
			let idx: number;
			let m: RegExpMatchArray|null;
			if ((idx = tpTags.findIndex(obj => obj.startIndex === i)) !== -1) { // Transclusion-preventing tag
				const {text} = tpTags[idx];
				if (numUnclosed !== 0) processArgFragment(args, text, {nonname: true});
				tpTags.splice(0, idx + 1);
				i += text.length - 1;
				continue;
			} else if ((idx = params.findIndex(obj => obj.startIndex === i)) !== -1) { // Parameter
				const {text} = params[idx];
				if (numUnclosed !== 0) processArgFragment(args, text, {nonname: true});
				params.splice(0, idx + 1);
				i += text.length - 1;
				continue;
			} else if ((m = wkt.match(/^\[\[[^[]]*?\]\]/))) { // Wikilink
				i += m[0].length - 1;
				if (numUnclosed !== 0) processArgFragment(args, m[0], {nonname: true});
				continue;
			}

			if (numUnclosed === 0) { // We are not in a template
				if (/^\{\{/.test(wkt)) { // Found the start of a template
					startIdx = i;
					args = [];
					numUnclosed += 2;
					i++;
				}
			} else if (numUnclosed === 2) { // We are looking for closing braces
				if (/^\{\{/.test(wkt)) { // Found a nested template
					numUnclosed += 2;
					i++;
					processArgFragment(args, '{{');
				} else if (/^\}\}/.test(wkt)) { // Found the end of the template
					const name = args[0] ? args[0].name : '';
					const fullName = args[0] ? args[0].text : '';
					const endIdx = i + 2;
					const text = wikitext.slice(startIdx, endIdx);
					const t = ParsedTemplate.new({
						name,
						fullName,
						args: args.slice(1),
						text,
						startIndex: startIdx,
						endIndex: endIdx,
						hierarchy: cfg.hierarchy,
						nestLevel: cfg._nestLevel
					});
					if (t) {
						if (!cfg.namePredicate || cfg.namePredicate(t.getName('clean'))) {
							if (!cfg.templatePredicate || cfg.templatePredicate(t)) {
								ret.push(t);
							}
						}
					}
					if (!cfg.recursivePredicate || cfg.recursivePredicate(t)) {
						const inner = text.slice(2, -2);
						if (/\{\{/.test(inner) && /\}\}/.test(inner)) {
							const nested = new Wikitext(inner).parseTemplates(Object.assign(cfg, {_nestLevel: ++cfg._nestLevel}));
							if (nested.length) {
								nested.forEach((Temp) => {
									Temp._startIndex += startIdx + 2;
									Temp._endIndex += startIdx + 2;
								});
								ret = ret.concat(nested);
							}
							cfg._nestLevel = 0;
						}
					}
					numUnclosed -= 2;
					i++;
				} else { // Just part of the template
					processArgFragment(args, wkt[0], wkt[0] === '|' ? {new: true} : {});
				}
			} else { // We are in a nested template
				let fragment;
				if (/^\{\{/.test(wkt)) { // Found another nested template
					fragment = '{{';
					numUnclosed += 2;
					i++;
				} else if (/^\}\}/.test(wkt)) { // Found the end of the nested template
					fragment = '}}';
					numUnclosed -= 2;
					i++;
				} else { // Just part of the nested template
					fragment = wkt[0];
				}
				processArgFragment(args, fragment);
			}

		}

		return ret;

	}

}

// Helper function for Wikitext class

/** @internal */
interface ParsedArgument {
	/**
	 * The whole text of the template argument (e.g. `|1=value`).
	 */
	text: string;
	/**
	 * The name of the template argument, if any (e.g. `1`). If the argument isn't named, this property carries an empty string.
	 * This property carries a direct parsing result and is always prefixed by a pipe character for named arguments.
	 */
	name: string;
	/**
	 * The value of the template argument.
	 */
	value: string;
}
/** @internal */
interface FragmentOptions {
	/** Whether the passed fragment can be part of the name of the template. */
	nonname?: boolean;
	/** Whether the passed fragment starts a new template argument. */
	new?: boolean;
}
/**
 * Incrementally process fragments of template arguments. This function has no return value, and the original array
 * passed as {@link args} is modified.
 *
 * The {@link args} array will consist of:
 * ```
 * const [name, ...params] = args;
 * ```
 * meaning that `args[0]` will store the name of the template. For `args[0]`, `text` is the whole of the name slot (which could
 * contain redundant strings in cases like `{{Template<!--1-->|arg1=}}`, and `name` is its clean counterpart.
 *
 * The other elements will be the arguments of the template, and each of the `text` properties starts with a pipe character (e.g. `|1=`).
 * Note also that `args[1+].name` properties also have a leading pipe to be stripped (e.g. `|1`) because the parser would otherwise face
 * problems if an unnamed argument has a value that starts with `=` (e.g. `{{Template|=}}`).
 *
 * @param args Pass-by-reference array that stores the arguments of the template that is getting parsed.
 * @param fragment Character(s) to register into the {@link args} array.
 * @param options Optional object that characterizes the fragment.
 * @internal
 */
function processArgFragment(args: ParsedArgument[], fragment: string, options?: FragmentOptions): void {
	options = options || {};
	const len = options.new ? args.length : Math.max(args.length - 1, 0);
	if (args[len] === undefined) {
		args[len] = {text: '', name: '', value: ''};
	}
	let frIdx;
	if (len === 0 && options.nonname) { // Looking for a template name but the fragment is an unusual expression
		args[len].text += fragment;
	} else if (len === 0) { // Looking for a template name and the fragment is part of the name
		args[len].text += fragment;
		args[len].name += fragment;
	} else if ((frIdx = fragment.indexOf('=')) !== -1 && !args[len].name && !options.nonname) { // Found `=` when `name` is empty
		args[len].name = args[len].text + fragment.slice(0, frIdx);
		args[len].text += fragment;
		args[len].value = args[len].text.slice(args[len].name.length + 1);
	} else {
		args[len].text += fragment;
		args[len].value += fragment;
	}
}

// **************************************************** EXPORTS ****************************************************

module.exports = {
	version: '1.2.0',
	load,
	sleep,
	continuedRequest,
	massRequest,
	getVipList,
	getLtaList,
	clean,
	getIcon,
	copyToClipboard,
	arraysEqual,
	arraysDiff,
	Template,
	Wikitext
};
// </nowiki>
export {};