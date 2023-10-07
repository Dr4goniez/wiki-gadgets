"use strict";
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
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
/** @internal */
// @ts-ignore
var mwString = mw.loader.require('mediawiki.String');
// **************************************************** POLYFILLS ****************************************************
// Types don't really matter with polyfills
if (!String.prototype.includes) {
    // https://github.com/alfaslash/string-includes-polyfill/blob/master/string-includes-polyfill.js
    String.prototype.includes = function (search, start) {
        if (typeof start !== 'number') {
            start = 0;
        }
        if (start + search.length > this.length) {
            return false;
        }
        else {
            return this.indexOf(search, start) !== -1;
        }
    };
}
if (!Array.prototype.includes) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Array.prototype.includes = function (searchElement, fromIndex) {
        fromIndex = typeof fromIndex === 'number' && fromIndex >= 0 ? fromIndex : 0;
        return this.indexOf(searchElement, fromIndex) !== -1;
    };
}
if (!Array.prototype.findIndex) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Array.prototype.findIndex = function (predicate, thisArg) {
        if (typeof predicate !== 'function') {
            throw new TypeError(typeof predicate + ' is not a function');
        }
        for (var i = 0; i < this.length; i++) {
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
    Object.assign = function (target) {
        var sources = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            sources[_i - 1] = arguments[_i];
        }
        if (target === undefined || target === null) {
            throw new TypeError('Cannot convert undefined or null to object');
        }
        var output = Object(target);
        for (var index = 1; index < sources.length; index++) {
            var source = sources[index];
            if (source !== undefined && source !== null) {
                for (var nextKey in source) {
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
    String.prototype.repeat = function (count) {
        if (this == null) {
            throw new TypeError('can\'t convert ' + this + ' to object');
        }
        var str = '' + this;
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
        var rpt = '';
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
function load() {
    return mw.loader.using([
        'mediawiki.Title',
        'mediawiki.util',
        'mediawiki.api'
    ])
        .then(function () { return true; })
        .catch(function (err) {
        console.warn(err);
        return false;
    });
}
/**
 * Let the code sleep for `n` milliseconds.
 * @param milliseconds The milliseconds to sleep. If a negative number is passed, it is automatically rounded up to `0`.
 * @returns
 */
function sleep(milliseconds) {
    var def = $.Deferred();
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
function continuedRequest(params, limit) {
    if (limit === void 0) { limit = 10; }
    var api = new mw.Api();
    var responses = [];
    var query = function (params, count) {
        return api.get(params)
            .then(function (res) {
            responses.push(res || null);
            if (res.continue && count < limit) {
                return query(Object.assign(params, res.continue), count + 1);
            }
            else {
                return responses;
            }
        }).catch(function (_, err) {
            console.log("continuedRequest: Request failed (reason: ".concat(err.error.info, ", loop count: ").concat(count, ")."));
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
function massRequest(params, batchParams, apilimit) {
    // Initialize variables
    params = Object.assign({}, params);
    // @ts-ignore
    var hasApiHighLimits = mw.config.get('wgUserGroups').concat(mw.config.get('wgGlobalGroups') || []).some(function (group) {
        return ['sysop', 'bot', 'apihighlimits-requestor', 'global-bot', 'founder', 'staff', 'steward', 'sysadmin', 'wmf-researcher'].includes(group);
    });
    apilimit = apilimit || (hasApiHighLimits ? 500 : 50);
    var nonArrayBatchParams = [];
    // Get the array to be used for the batch operation
    var batchKeys = Array.isArray(batchParams) ? batchParams : [batchParams];
    var batchArrays = Object.keys(params).reduce(function (acc, key) {
        if (batchKeys.includes(key)) {
            if (Array.isArray(params[key])) {
                acc.push(params[key].slice());
            }
            else {
                nonArrayBatchParams.push(key);
            }
        }
        else if (/limit$/.test(key) && (apilimit === 500 || apilimit === 50)) {
            // If this is a '**limit' parameter and the value is the default one, set it to 'max'
            params[key] = 'max';
        }
        return acc;
    }, []);
    if (nonArrayBatchParams.length) {
        throw new Error('The batch param(s) (' + nonArrayBatchParams.join(', ') + ') must be arrays.');
    }
    else if (!batchKeys.length) {
        throw new Error('There is a problem with the value of the "batchParams" parameter.');
    }
    else if (!batchArrays.length) {
        throw new Error('The passed API params do not contain arrays for the batch operation.');
    }
    else if (batchArrays.length > 1 && !batchArrays.slice(1).every(function (arr) { return arraysEqual(batchArrays[0], arr); })) {
        throw new Error('The arrays passed for the batch operation must all be non-distinct with each other.');
    }
    // Final check
    var batchArray = batchArrays[0];
    if (!batchArray.length) {
        console.log('An empty array has been passed for the batch operation.');
        return $.Deferred().resolve([]);
    }
    // Send API requests
    var api = new mw.Api();
    var req = function (reqParams) {
        return api.post(reqParams)
            .then(function (res) { return res || null; })
            .catch(function (_, err) {
            console.warn(err);
            return null;
        });
    };
    var result = [];
    var _loop_1 = function () {
        var batchArrayStr = batchArray.splice(0, apilimit).join('|');
        Object.assign(// Overwrite the batch parameters with a stringified batch array 
        params, batchKeys.reduce(function (acc, key) {
            acc[key] = batchArrayStr;
            return acc;
        }, Object.create(null)));
        result.push(req(params));
    };
    while (batchArray.length !== 0) {
        _loop_1();
    }
    return $.when.apply($, result).then(function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        return args;
    });
}
/**
 * Remove unicode bidirectional characters and leading/trailing `\s`s from a string.
 *
 * @param str Input string.
 * @param trim Whether to trim `str`, defaulted to `true`.
 * @returns
 */
function clean(str, trim) {
    if (trim === void 0) { trim = true; }
    /**
     * The regex is adapted from {@link https://doc.wikimedia.org/mediawiki-core/master/js/source/Title.html#mw-Title |mediawiki.Title}.
     */
    str = str.replace(/[\u200E\u200F\u202A-\u202E]+/g, '');
    return trim ? str.trim() : str;
}
/**
 * Get an \<img> tag for an icon.
 * @param iconType The type of the icon.
 * @returns
 */
function getIcon(iconType) {
    var img = document.createElement('img');
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
    }
    img.style.cssText = 'vertical-align: middle; height: 1em; border: 0;';
    return img;
}
/**
 * Check whether two arrays are equal. Neither array should contain non-primitive values as its elements.
 * @param array1
 * @param array2
 * @param orderInsensitive Default: `false`
 * @returns
 */
function arraysEqual(array1, array2, orderInsensitive) {
    if (orderInsensitive === void 0) { orderInsensitive = false; }
    if (orderInsensitive) {
        return array1.length === array2.length && array1.every(function (el) { return array2.includes(el); });
    }
    else {
        return array1.length === array2.length && array1.every(function (el, i) { return array2[i] === el; });
    }
}
/**
 * Compare elements in two arrays and get differences.
 * @param sourceArray
 * @param targetArray
 * @returns
 */
function arraysDiff(sourceArray, targetArray) {
    var added = [];
    var removed = [];
    sourceArray.forEach(function (el) {
        if (!targetArray.includes(el))
            removed.push(el);
    });
    targetArray.forEach(function (el) {
        if (!sourceArray.includes(el))
            added.push(el);
    });
    return { added: added, removed: removed };
}
/**
 * The Template class. Creates a new {{template}}.
 */
var Template = /** @class */ (function () {
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
    function Template(name, config) {
        var cfg = config || {};
        this.name = clean(name);
        if (this.name.includes('\n')) {
            throw new Error("name (\"".concat(name, "\") is not allowed to contain inline \"\\n\" characters."));
        }
        this.fullName = clean(cfg.fullName || name, false);
        this.args = [];
        this.keys = [];
        this.overriddenArgs = [];
        if (!this.fullName.includes(this.name)) {
            throw new Error("fullName (\"".concat(this.fullName, "\") does not contain name (\"").concat(this.name, "\") as a substring."));
        }
        this.hierarchy = cfg.hierarchy || [];
        // Truncate the leading colon, if any
        var colon = '';
        name = name.replace(/^[^\S\r\n]*:[^\S\r\n]*/, function (m) {
            colon = m;
            return '';
        });
        // Set cleanName
        var title = mw.Title.newFromText(name);
        var getConcatableFragment = function (title) {
            var fragment = title.getFragment();
            return fragment ? '#' + fragment : '';
        };
        if (!title) {
            this.cleanName = colon + mwString.ucFirst(name);
        }
        else if (title.getNamespaceId() === 10) {
            this.cleanName = title.getMain() + getConcatableFragment(title);
        }
        else if (title.getNamespaceId() === 0) {
            this.cleanName = colon.trim() + title.getMain() + getConcatableFragment(title);
        }
        else {
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
    Template.prototype.getName = function (prop) {
        if (!prop) {
            return this.name;
        }
        else if (prop === 'fullclean') {
            return this.fullCleanName;
        }
        else if (prop === 'full') {
            return this.fullName;
        }
        else {
            return this.cleanName;
        }
    };
    /**
     * Register template arguments into {@link args}.
     *
     * @param newArgs An array of `{name: string; value: string;}` objects.
     * @param logOverride Whether to leave a log when overriding argument values.
     */
    Template.prototype.registerArgs = function (newArgs, logOverride) {
        var _this = this;
        newArgs.forEach(function (_a) {
            var name = _a.name, value = _a.value, forceUnnamed = _a.forceUnnamed;
            var ufname = name;
            var ufvalue = value;
            name = clean(name);
            var unnamed = /^\d+$/.test(name) && forceUnnamed || !name;
            if (unnamed) {
                value = clean(value, false).replace(/\n*$/, '');
            }
            else {
                value = clean(value);
            }
            var text = '|' + (unnamed ? '' : name + '=') + value.replace(/^\|/, '');
            var uftext = '|' + (unnamed ? '' : ufname + '=') + ufvalue.replace(/^\|/, '');
            _this.registerArg({ name: name, value: value, text: text, ufname: ufname, ufvalue: ufvalue, uftext: uftext, unnamed: unnamed }, logOverride);
        });
    };
    /**
     * @param arg New argument object to register.
     * @param logOverride Whether to leave a log when overriding argument values.
     */
    Template.prototype.registerArg = function (arg, logOverride) {
        // Name if unnamed
        if (arg.unnamed) {
            for (var i = 1; i < Infinity; i++) {
                if (!this.keys.includes(i.toString())) {
                    arg.name = i.toString();
                    break;
                }
            }
        }
        // Check duplicates
        var hier = this.getHier(arg.name);
        var oldArg;
        if (hier !== null) {
            var foundArg = this.args[hier.index];
            if (hier.priority === 1 && arg.value || // There's an argument of a lower priority and this argument has a non-empty value
                hier.priority === -1 && !foundArg.value || // There's an argument of a higher priority and that argument's value is empty
                hier.priority === 0 && arg.value // This argument is a duplicate and has a non-empty value
            ) {
                if (logOverride) {
                    this.overriddenArgs.push(__assign({}, foundArg)); // Leave a log of the argument to be overidden
                }
                // Delete the formerly-registered argument and proceed to registering this argument
                this.keys.splice(hier.index, 1);
                this.args.splice(hier.index, 1);
            }
            else {
                // The current argument is to be overridden by a formerly-registered argument
                if (logOverride) {
                    this.overriddenArgs.push(__assign({}, arg)); // Leave a log of this argument
                }
                return; // Don't register this argument
            }
        }
        else if ((oldArg = this.getArg(arg.name))) {
            if (logOverride) {
                this.overriddenArgs.push(__assign({}, oldArg));
            }
            this.deleteArg(arg.name);
        }
        // Register the new argument
        this.keys.push(arg.name);
        this.args.push(arg);
    };
    /**
     * Check whether a given argument is to be hierarchically overridden.
     * @param name
     */
    Template.prototype.getHier = function (name) {
        var _this = this;
        var ret = null;
        if (!this.hierarchy.length || !this.keys.length) {
            return ret;
        }
        this.hierarchy.some(function (arr) {
            // Does this hierarchy array contain the designated argument name?
            var prIdx = arr.indexOf(name);
            if (prIdx === -1)
                return false;
            // Does the Template already have an argument of the designated name or its alias?
            var prIdx2 = arr.findIndex(function (key) { return _this.keys.includes(key); });
            var keyIdx = _this.keys.findIndex(function (key) { return arr.includes(key); });
            if (prIdx2 === -1 || keyIdx === -1)
                return false;
            // The argument of either the designated name or its alias is to be overridden
            ret = {
                index: keyIdx,
                priority: prIdx2 > prIdx ? -1 : prIdx2 < prIdx ? 1 : 0
            };
            return true;
        });
        return ret;
    };
    /**
     * Add new arguments to the {@link Template} instance. This method leaves a log when argument override takes place,
     * which can be viewed by {@link getOverriddenArgs}.
     *
     * @param newArgs An array of `{name: string; value: string;}` objects.
     */
    Template.prototype.addArgs = function (newArgs) {
        this.registerArgs(newArgs, true);
        return this;
    };
    /**
     * Set (or update) arguments in(to) the {@link Template} instance. This method does not leave a log when argument override takes place.
     *
     * Note: New arguments are simply newly added, just as when {@link addArgs} is used.
     *
     * @param newArgs An array of `{name: string; value: string;}` objects.
     */
    Template.prototype.setArgs = function (newArgs) {
        this.registerArgs(newArgs, false);
        return this;
    };
    /**
     * Get the arguments of the template as an array of objects.
     *
     * @param deepCopy Whether to return a deep copy, defaulted to `true`. Otherwise, {@link args} is passed by reference
     * (not recommended).
     * @returns
     */
    Template.prototype.getArgs = function (deepCopy) {
        if (deepCopy === void 0) { deepCopy = true; }
        if (deepCopy) {
            return this.args.map(function (obj) { return (__assign({}, obj)); });
        }
        else {
            return this.args;
        }
    };
    /**
     * Get (a deep copy of) a template argument by an argument name.
     * @param name Argument name.
     * @param options Optional search options.
     * @returns `null` if no argument is found with the specified name.
     */
    Template.prototype.getArg = function (name, options) {
        options = options || {};
        var nameRegex = typeof name === 'string' ? new RegExp("^".concat(mw.util.escapeRegExp(name), "$")) : name;
        var firstMatch = null;
        var lastMatch = null;
        for (var i = 0; i < this.args.length; i++) {
            var arg = this.args[i];
            if (nameRegex.test(arg.name) && (!options.conditionPredicate || options.conditionPredicate(arg))) {
                if (!firstMatch) {
                    firstMatch = arg;
                }
                lastMatch = arg;
            }
        }
        var ret = options.findFirst ? firstMatch : lastMatch;
        if (ret)
            ret = Object.assign({}, ret);
        return ret;
    };
    /**
     * Check whether the {@link Template} instance has an argument with a certain name.
     * @param name Name of the argument to search for.
     * @param options Optional search options.
     * @returns A boolean value in accordance with whether there is a match.
     */
    Template.prototype.hasArg = function (name, options) {
        options = options || {};
        var nameRegex = typeof name === 'string' ? new RegExp("^".concat(mw.util.escapeRegExp(name), "$")) : name;
        for (var i = 0; i < this.args.length; i++) {
            var arg = this.args[i];
            if (nameRegex.test(arg.name) && (!options.conditionPredicate || options.conditionPredicate(arg))) {
                return true;
            }
        }
        return false;
    };
    /**
     * Delete template arguments.
     * @param names
     * @returns Deleted arguments.
     */
    Template.prototype.deleteArgs = function (names) {
        var _this = this;
        return names.reduce(function (acc, name) {
            var idx = _this.keys.indexOf(name);
            if (idx !== -1) {
                acc.push(_this.args[idx]);
                _this.keys.splice(idx, 1);
                _this.args.splice(idx, 1);
            }
            return acc;
        }, []);
    };
    /**
     * Delete a template argument.
     * @param name
     * @returns `true` if the instance has an argument with the specified name and if the argument is successfully removed,
     * `false` otherwise.
     */
    Template.prototype.deleteArg = function (name) {
        var deleted = false;
        var idx = this.keys.indexOf(name);
        if (idx !== -1) {
            this.keys.splice(idx, 1);
            this.args.splice(idx, 1);
            deleted = true;
        }
        return deleted;
    };
    /**
     * Get a list of overridden template arguments as an array of objects. This method returns a deep copy,
     * and modifying the return value does not modify the original array stored in the class.
     */
    Template.prototype.getOverriddenArgs = function () {
        return this.overriddenArgs.map(function (obj) { return (__assign({}, obj)); });
    };
    /**
     * Get the argument hierarchies.
     * @returns
     */
    Template.prototype.getHierarchy = function () {
        return this.hierarchy.map(function (arr) { return __spreadArray([], arr, true); });
    };
    /**
     * Render the {@link Template} instance as wikitext.
     *
     * Use `render({nameprop: 'full', unformatted: 'both'})` for an output that is closest to the original configurations.
     *
     * @param options Optional object of rendering specifications
     */
    Template.prototype.render = function (options) {
        options = options || {};
        var ret = '{{';
        // Render name
        var n;
        var subst = options.subst ? 'subst:' : '';
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
        }
        else if (options.linebreak) {
            ret += n.replace(/\n+$/, '') + '\n';
        }
        else {
            ret += n;
        }
        // Render args
        var args = this.args.map(function (obj) { return (__assign({}, obj)); });
        if (options.sortPredicate) {
            args.sort(options.sortPredicate);
        }
        for (var _i = 0, args_1 = args; _i < args_1.length; _i++) {
            var obj = args_1[_i];
            var text = '|';
            var name_1 = options.unformatted === 'name' || options.unformatted === 'both' ? obj.ufname : obj.name;
            var value = options.unformatted === 'value' || options.unformatted === 'both' ? obj.ufvalue : obj.value;
            if (!obj.unnamed || !options.unformatted && value.includes('=')) {
                text += name_1 + '=';
            }
            text += value;
            if (options.linebreakPredicate) {
                ret += text.replace(/\n+$/, '') + (options.linebreakPredicate.args(obj) ? '\n' : '');
            }
            else if (options.linebreak) {
                ret += text.replace(/\n+$/, '') + '\n';
            }
            else {
                ret += text;
            }
        }
        ret += '}}';
        return ret;
    };
    /**
     * Stringify the {@link Template} instance. Same as `render({nameprop: 'full', unformatted: 'both'})`.
     */
    Template.prototype.toString = function () {
        return this.render({ nameprop: 'full', unformatted: 'both' });
    };
    /**
     * Get class properties in a JSON format.
     */
    Template.prototype.toJSON = function () {
        return {
            name: this.name,
            fullName: this.fullName,
            cleanName: this.cleanName,
            fullCleanName: this.fullCleanName,
            args: this.args.map(function (obj) { return (__assign({}, obj)); }),
            keys: this.keys.slice(),
            overriddenArgs: this.overriddenArgs.map(function (obj) { return (__assign({}, obj)); }),
            hierarchy: this.hierarchy.map(function (arr) { return __spreadArray([], arr, true); })
        };
    };
    return Template;
}());
/** Class used by {@link Wikitext.parseTemplates}. */
var ParsedTemplate = /** @class */ (function (_super) {
    __extends(ParsedTemplate, _super);
    /**
     * Initialize a new {@link ParsedTemplate} instance. **This constructor is not supposed to be used externally**.
     * @param parsed
     * @throws {Error} When `name` has inline `\n` characters or when {@link TemplateConfig.fullName |fullName}
     * does not contain `name` as a substring.
     */
    function ParsedTemplate(parsed) {
        var _this = this;
        var name = parsed.name, fullName = parsed.fullName, args = parsed.args, text = parsed.text, startIndex = parsed.startIndex, endIndex = parsed.endIndex, hierarchy = parsed.hierarchy, nestLevel = parsed.nestLevel;
        _this = _super.call(this, name, { fullName: fullName, hierarchy: hierarchy }) || this;
        _this.addArgs(args.map(function (obj) { return ({ 'name': obj.name.replace(/^\|/, ''), value: obj.value.replace(/^\|/, '') }); }));
        _this.originalText = text;
        _this._startIndex = startIndex;
        _this._endIndex = endIndex;
        _this.nestLevel = nestLevel;
        return _this;
    }
    /**
     * Error-proof constructor. **This method is supposed to be used only by {@link Wikitext.parseTemplates}**.
     * @param parsed
     * @returns `null` if the constructor threw an error.
     */
    ParsedTemplate.new = function (parsed) {
        try {
            return new ParsedTemplate(parsed);
        }
        catch (err) {
            return null;
        }
    };
    /**
     * Get class properties in a JSON format.
     */
    ParsedTemplate.prototype.toJSON = function () {
        return {
            name: this.name,
            fullName: this.fullName,
            cleanName: this.cleanName,
            fullCleanName: this.fullCleanName,
            args: this.args.map(function (obj) { return (__assign({}, obj)); }),
            keys: this.keys.slice(),
            overriddenArgs: this.overriddenArgs.map(function (obj) { return (__assign({}, obj)); }),
            hierarchy: this.hierarchy.map(function (arr) { return __spreadArray([], arr, true); }),
            originalText: this.originalText,
            startIndex: this._startIndex,
            endIndex: this._endIndex,
            nestLevel: this.nestLevel
        };
    };
    /**
     * Render the original template text.
     * @returns
     */
    ParsedTemplate.prototype.renderOriginal = function () {
        return this.originalText;
    };
    /**
     * Get {@link _startIndex}.
     * @returns
     */
    ParsedTemplate.prototype.getStartIndex = function () {
        return this._startIndex;
    };
    /**
     * Get {@link _endIndex}.
     * @returns
     */
    ParsedTemplate.prototype.getEndIndex = function () {
        return this._endIndex;
    };
    /**
     * Get the nest level of the template.
     * @returns
     */
    ParsedTemplate.prototype.getNestLevel = function () {
        return this.nestLevel;
    };
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
    ParsedTemplate.prototype.replaceIn = function (wikitext, options) {
        var cfg = Object.assign({ useIndex: true }, options || {});
        var replacer = typeof cfg.with === 'string' ? cfg.with : this.render(cfg);
        if (!cfg.useIndex) {
            return wikitext.replace(this.originalText, replacer);
        }
        else if (wikitext.slice(this._startIndex, this._endIndex) === this.originalText) {
            var chunk1 = wikitext.slice(0, this._startIndex);
            var chunk2 = replacer;
            var chunk3 = wikitext.slice(this._endIndex);
            var hasLineBreak = /\n[^\S\n\r]*$/.test(chunk1) || /^[^\S\n\r]*\n[^\S\n\r]*/.test(chunk3);
            if (replacer === '' && hasLineBreak) {
                chunk1 = chunk1.trim();
                chunk3 = (chunk1 !== '' ? '\n' : '') + chunk3.trim();
            }
            return chunk1 + chunk2 + chunk3;
        }
        else {
            return wikitext;
        }
    };
    return ParsedTemplate;
}(Template));
/** The Wikitext class with methods to manipulate wikitext. */
var Wikitext = /** @class */ (function () {
    /**
     * Initialize a {@link Wikitext} instance.
     * @param wikitext
     * @requires mediawiki.api
     */
    function Wikitext(wikitext) {
        this.wikitext = wikitext;
        this.revision = null;
        this.tags = null;
        this.sections = null;
        this.parameters = null;
    }
    Object.defineProperty(Wikitext.prototype, "length", {
        /**
         * Returns the length of the wikitext.
         */
        get: function () {
            return this.wikitext.length;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Wikitext.prototype, "byteLength", {
        /**
         * Returns the byte length of the wikitext.
         */
        get: function () {
            var rev = this.getRevision();
            return rev && rev.length || mwString.byteLength(this.wikitext);
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Fetch the wikitext of a page with additional information on the current revision.
     * @param pagetitle
     * @returns `false` if the page doesn't exist, `null` if the API request failed.
     * @requires mediawiki.api
     */
    Wikitext.fetch = function (pagetitle) {
        return new mw.Api().get({
            action: 'query',
            titles: pagetitle,
            prop: 'info|revisions',
            rvprop: 'ids|timestamp|content',
            rvslots: 'main',
            curtimestamp: 1,
            formatversion: 2
        }).then(function (res) {
            var resPgs = res && res.query && Array.isArray(res.query.pages) && res.query.pages[0];
            if (!resPgs || typeof resPgs.pageid !== 'number' || !resPgs.revisions || typeof res.curtimestamp !== 'string' || typeof resPgs.length !== 'number') {
                return null;
            }
            else if (resPgs.missing) {
                return false;
            }
            else {
                var ret = {
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
        }).catch(function (_, err) {
            console.warn(err);
            return null;
        });
    };
    /**
     * Fetch the wikitext of a page. If additional revision information should be included, use {@link Wikitext.fetch|fetch}.
     * @param pagetitle
     * @returns `false` if the page doesn't exist, `null` if the API request failed.
     * @requires mediawiki.api
     */
    Wikitext.read = function (pagetitle) {
        return Wikitext.fetch(pagetitle).then(function (res) { return res && res.content; });
    };
    /**
     * Initialize a new {@link Wikitext} instance by fetching the content of a page.
     * @param pagetitle
     * @returns `false` if the page doesn't exist, `null` if the content of the page failed to be fetched.
     * @requires mediawiki.api
     */
    Wikitext.newFromTitle = function (pagetitle) {
        return Wikitext.fetch(pagetitle).then(function (revision) {
            if (!revision) {
                return revision;
            }
            else {
                var Wkt = new Wikitext(revision.content);
                Wkt.revision = revision;
                return Wkt;
            }
        });
    };
    /**
     * Get a deep copy of {@link revision}, which is a private property available only when the {@link Wikitext} instance was initialized
     * by {@link newFromTitle}.
     * @returns `null` if the instance doesn't have the relevant property, meaning that it wasn't initialized by {@link newFromTitle}.
     */
    Wikitext.prototype.getRevision = function () {
        return this.revision && __assign({}, this.revision);
    };
    /**
     * Parse \<tag>s in the wikitext.
     * @param config
     * @returns
     */
    Wikitext.prototype.parseTags = function (config) {
        var cfg = config || {};
        if (this.tags) {
            return this.tags.reduce(function (acc, obj) {
                if (!cfg.conditionPredicate || cfg.conditionPredicate(obj)) {
                    acc.push(__assign({}, obj)); // Deep copy
                }
                return acc;
            }, []);
        }
        var wikitext = this.wikitext;
        var tags = [];
        /**
         * HTML tags and whitespace
         * ```html
         * <foo   > <!-- No whitespace between "<" and the tag name -->
         * </foo  > <!-- No whitespace between "</" and the tag name -->
         * <foo  /> <!-- No whitespace in-between "/>" -->
         * ```
         */
        var regex = {
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
        var parsing = [];
        /** Whether we are in a comment (i.e. `<!---->`). */
        var inComment = function () { return parsing[0] && parsing[0].name === 'comment'; };
        // Parse the wikitext, character by character
        for (var i = 0; i < wikitext.length; i++) {
            var wkt = wikitext.slice(i);
            var m = void 0;
            if (!inComment()) {
                if (regex.commentOpening.test(wkt)) { // Found an occurrence of <!--
                    parsing.unshift({
                        name: 'comment',
                        index: i,
                        innerIndex: i + 4
                    });
                    i += 3;
                }
                else if ((m = wkt.match(regex.opening))) { // Found an occurrence of <tag>
                    var tagName = m[1].toLowerCase();
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
                    }
                    else { // Found a new tag
                        parsing.unshift({
                            name: tagName,
                            index: i,
                            innerIndex: i + m[0].length
                        });
                    }
                    i += m[0].length - 1;
                }
                else if (parsing.length && (m = wkt.match(regex.closing))) { // Found an occurrence of </tag>
                    var tagName = m[1].toLowerCase();
                    var spliceCnt = 0;
                    for (var j = 0; j < parsing.length; j++) { // Loop the `parsing` array until we find the corresponding opening tag
                        var isSameTagName = parsing[j].name === tagName; // e.g. true when <span></span>, false when <span><div></span>
                        var endIndex = isSameTagName ? i + m[0].length : i; // "<span></span>" or <span>"<div>"</span>
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
            }
            else if (regex.commentClosing.test(wkt)) { // In comment and found "-->"
                var startIndex = parsing[0].index;
                var endIndex = i + 3;
                tags.push({
                    name: 'comment',
                    text: wikitext.slice(startIndex, endIndex),
                    innerText: wikitext.slice(parsing[0].innerIndex, endIndex - 3),
                    selfClosed: i - 4 === startIndex,
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
        for (var i = 0; i < parsing.length; i++) {
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
        tags.sort(function (obj1, obj2) {
            if (obj1.startIndex < obj2.startIndex && obj1.endIndex > obj2.endIndex) {
                return -1;
            }
            else if (obj1.startIndex < obj2.startIndex) {
                return -1;
            }
            else if (obj1.endIndex > obj2.endIndex) {
                return 1;
            }
            else {
                return 0;
            }
        });
        // Save the tags
        this.tags = tags.map(function (obj) { return (__assign({}, obj)); }); // Deep copy
        // Filter the result in accordance with the config
        if (cfg.conditionPredicate) {
            tags = tags.filter(function (Tag) { return cfg.conditionPredicate(Tag); });
        }
        return tags;
    };
    /**
     * Get a deep copy of {@link tags}, which is a private property available only when {@link parseTags} has
     * been called at least once. Note that {@link parseTags} returns a (filtered) deep copy of {@link tags}
     * on a non-first call, so simply call the relevant method if there is no need for a `null` return.
     * @returns
     */
    Wikitext.prototype.getTags = function () {
        return this.tags && this.tags.map(function (obj) { return (__assign({}, obj)); });
    };
    /**
     * Check whether a substring of the wikitext starting and ending at a given index is inside any transclusion-preventing tag.
     * @param tpTags An array of transclusion-preventing tags fetched by {@link parseTags}.
     * @param startIndex The start index of the string in the wikitext.
     * @param endIndex The end index of the string in the wikitext.
     * @returns
     */
    Wikitext.prototype.inTpTag = function (tpTags, startIndex, endIndex) {
        return tpTags.some(function (obj) { return obj.startIndex < startIndex && endIndex < obj.endIndex; });
    };
    /**
     * Parse sections in the wikitext.
     * @returns
     */
    Wikitext.prototype.parseSections = function () {
        var _this = this;
        if (this.sections) {
            return this.sections.map(function (obj) { return (__assign({}, obj)); }); // Deep copy
        }
        // Get transclusion-preventing tags
        var tpTags = this.parseTags({
            conditionPredicate: function (tag) { return ['comment', 'nowiki', 'pre', 'syntaxhighlight', 'source', 'math'].includes(tag.name); }
        });
        /**
         * Remove `<!---->` tags from a string.
         * @param str
         * @returns
         */
        var removeComments = function (str) {
            tpTags.forEach(function (_a) {
                var name = _a.name, text = _a.text;
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
        var rHeading = /^(={1,6})(.+?)(={1,6})([^\n]*)\n?$/gm;
        var rWhitespace = /[\t\u0020\u00a0]/g;
        var headings = this.parseTags().reduce(function (acc, obj) {
            var m;
            if ((m = obj.name.match(/^h([1-6])$/)) && !obj.selfClosed && !_this.inTpTag(tpTags, obj.startIndex, obj.endIndex)) {
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
        var m;
        while ((m = rHeading.exec(this.wikitext))) {
            // If `$4` isn't empty or the ==heading== is inside a transclusion-preventing tag, the heading isn't the start of a section
            var m4 = m[4].replace(rWhitespace, '');
            if (m4 && removeComments(m4) || this.inTpTag(tpTags, m.index, m.index + m[0].length)) {
                continue;
            }
            // Validate the heading
            var level = Math.min(m[1].length, m[3].length); // The number of "="s (smallest)
            var title = clean(removeComments('='.repeat(Math.max(0, m[1].length - level)) + // Add "="s if the left and right "="s don't count the same
                m[2] +
                '='.repeat(Math.max(0, m[3].length - level))));
            headings.push({
                text: m[0].trim(),
                title: title,
                level: level,
                index: m.index
            });
        }
        headings.sort(function (obj1, obj2) { return obj1.index - obj2.index; });
        headings.unshift({ text: '', title: 'top', level: 1, index: 0 }); // For the top section
        // Parse sections from the headings
        var wkt = this.wikitext;
        var sections = headings.map(function (_a, i, arr) {
            var text = _a.text, title = _a.title, level = _a.level, index = _a.index;
            var boundaryIdx = i === 0 ? // If this is the top section,
                (arr.length > 1 ? 1 : -1) : // the next heading or else no boundary, otherwise
                arr.findIndex(function (obj, j) { return j > i && obj.level <= level; }); // find a next non-subsection of this section
            var content = wkt.slice(index, boundaryIdx !== -1 ? arr[boundaryIdx].index : wkt.length // Up to the next heading or to the end of the entire wikitext
            );
            return {
                title: title,
                heading: text,
                level: level,
                index: i,
                startIndex: index,
                endIndex: index + content.length,
                content: content
            };
        });
        // Save the sections
        this.sections = sections.map(function (obj) { return (__assign({}, obj)); }); // Deep copy
        return sections;
    };
    /**
     * Get a deep copy of {@link sections}, which is a private property available only when {@link parseSections} has
     * been called at least once. Note that {@link parseSections} returns a (filtered) deep copy of {@link sections}
     * on a non-first call, so simply call the relevant method if there is no need for a `null` return.
     * @returns
     */
    Wikitext.prototype.getSections = function () {
        return this.sections && this.sections.map(function (obj) { return (__assign({}, obj)); });
    };
    /**
     * Parse {{{parameter}}}s in the wikitext.
     * @param config
     * @returns
     */
    Wikitext.prototype.parseParameters = function (config) {
        var cfg = Object.assign({ recursive: true }, config || {});
        if (this.parameters) {
            return this.parameters.reduce(function (acc, obj) {
                if (obj.nestLevel > 0 && !cfg.recursive) {
                    return acc;
                }
                if (cfg.conditionPredicate && !cfg.conditionPredicate(obj)) {
                    return acc;
                }
                acc.push(__assign({}, obj)); // Deep copy
                return acc;
            }, []);
        }
        var tpTags = this.parseTags({
            conditionPredicate: function (tag) { return ['comment', 'nowiki', 'pre', 'syntaxhighlight', 'source', 'math'].includes(tag.name); }
        });
        // Parse parameters from the left to the right
        var params = [];
        var exe;
        var regex = /\{\{\{[^{][^}]*\}\}\}/g;
        var wikitext = this.wikitext;
        var nestLevel = 0;
        while ((exe = regex.exec(wikitext))) {
            /**
             * Parameters can have templates nested (e.g. `{{{1|{{{page|{{PAGENAME}}}}}}}}`), and the `exec` above
             * gets `{{{1|{{{page|{{PAGENAME}}}` in such cases.
             */
            var para = exe[0];
            var leftBraceCnt = (para.match(/\{{2,}/g) || []).join('').length;
            var rightBraceCnt = (para.match(/\}{2,}/g) || []).join('').length;
            var grammatical = true;
            if (leftBraceCnt > rightBraceCnt) { // If the numbers of left and right braces aren't the same
                grammatical = false;
                var pos = exe.index + para.length - 3; // Get the end index of `{{{1|{{{page|{{PAGENAME` in `wikitext`
                rightBraceCnt -= 3;
                for (pos; pos < wikitext.length; pos++) { // Check what character comes at `_` in `{{{1|{{{page|{{PAGENAME_`
                    var m = wikitext.slice(pos).match(/^\}{2,}/);
                    if (m) { // `_` is a right brace followed by another
                        if (leftBraceCnt <= rightBraceCnt + m[0].length) { // If the right braces close all the left braces
                            var lastIndex = pos + (leftBraceCnt - rightBraceCnt);
                            para = wikitext.slice(exe.index, lastIndex); // Get the correct parameter
                            grammatical = true;
                            regex.lastIndex = lastIndex; // Update the index at which to start the next match
                            break;
                        }
                        else {
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
                        nestLevel: nestLevel
                    });
                    if (cfg.recursive && para.slice(3).includes('{{{')) {
                        regex.lastIndex = exe.index + 3;
                        nestLevel++;
                    }
                    else {
                        nestLevel = 0;
                    }
                }
            }
            else {
                console.log("Unparsable parameter: ".concat(para));
            }
        }
        // Save the parameters
        this.parameters = params.map(function (obj) { return (__assign({}, obj)); }); // Deep copy
        return params.reduce(function (acc, obj) {
            if (obj.nestLevel > 0 && !cfg.recursive) {
                return acc;
            }
            if (cfg.conditionPredicate && !cfg.conditionPredicate(obj)) {
                return acc;
            }
            acc.push(obj);
            return acc;
        }, []);
    };
    /**
     * Get a deep copy of {@link parameters}, which is a private property available only when {@link parseParameters} has
     * been called at least once. Note that {@link parseParameters} returns a (filtered) deep copy of {@link parameters}
     * on a non-first call, so simply call the relevant method if there is no need for a `null` return.
     * @returns
     */
    Wikitext.prototype.getParameters = function () {
        return this.parameters && this.parameters.map(function (obj) { return (__assign({}, obj)); });
    };
    /**
     * Parse {{template}}s in the wikitext.
     * @param config
     * @returns
     */
    Wikitext.prototype.parseTemplates = function (config) {
        var cfg = Object.assign({ _nestLevel: 0 }, config || {});
        var tpTags = this.parseTags({
            conditionPredicate: function (tag) { return ['comment', 'nowiki', 'pre', 'syntaxhighlight', 'source', 'math'].includes(tag.name); }
        });
        var params = this.parseParameters({ recursive: false });
        var numUnclosed = 0;
        var startIdx = 0;
        var args = [];
        // Character-by-character loop
        var wikitext = this.wikitext;
        var ret = [];
        var _loop_2 = function (i) {
            var wkt = wikitext.slice(i);
            // Skip certain expressions
            var idx = void 0;
            var m = void 0;
            if ((idx = tpTags.findIndex(function (obj) { return obj.startIndex === i; })) !== -1) { // Transclusion-preventing tag
                var text = tpTags[idx].text;
                if (numUnclosed !== 0)
                    processArgFragment(args, text, { nonname: true });
                tpTags.splice(0, idx + 1);
                i += text.length - 1;
                return out_i_1 = i, "continue";
            }
            else if ((idx = params.findIndex(function (obj) { return obj.startIndex === i; })) !== -1) { // Parameter
                var text = params[idx].text;
                if (numUnclosed !== 0)
                    processArgFragment(args, text, { nonname: true });
                params.splice(0, idx + 1);
                i += text.length - 1;
                return out_i_1 = i, "continue";
            }
            else if ((m = wkt.match(/^\[\[[^[]]*?\]\]/))) { // Wikilink
                i += m[0].length - 1;
                if (numUnclosed !== 0)
                    processArgFragment(args, m[0], { nonname: true });
                return out_i_1 = i, "continue";
            }
            if (numUnclosed === 0) { // We are not in a template
                if (/^\{\{/.test(wkt)) { // Found the start of a template
                    startIdx = i;
                    args = [];
                    numUnclosed += 2;
                    i++;
                }
            }
            else if (numUnclosed === 2) { // We are looking for closing braces
                if (/^\{\{/.test(wkt)) { // Found a nested template
                    numUnclosed += 2;
                    i++;
                    processArgFragment(args, '{{');
                }
                else if (/^\}\}/.test(wkt)) { // Found the end of the template
                    var name_2 = args[0] ? args[0].name : '';
                    var fullName = args[0] ? args[0].text : '';
                    var endIdx = i + 2;
                    var text = wikitext.slice(startIdx, endIdx);
                    var t = ParsedTemplate.new({
                        name: name_2,
                        fullName: fullName,
                        args: args.slice(1),
                        text: text,
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
                        var inner = text.slice(2, -2);
                        if (/\{\{/.test(inner) && /\}\}/.test(inner)) {
                            var nested = new Wikitext(inner).parseTemplates(Object.assign(cfg, { _nestLevel: ++cfg._nestLevel }));
                            if (nested.length) {
                                nested.forEach(function (Temp) {
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
                }
                else { // Just part of the template
                    processArgFragment(args, wkt[0], wkt[0] === '|' ? { new: true } : {});
                }
            }
            else { // We are in a nested template
                var fragment = void 0;
                if (/^\{\{/.test(wkt)) { // Found another nested template
                    fragment = '{{';
                    numUnclosed += 2;
                    i++;
                }
                else if (/^\}\}/.test(wkt)) { // Found the end of the nested template
                    fragment = '}}';
                    numUnclosed -= 2;
                    i++;
                }
                else { // Just part of the nested template
                    fragment = wkt[0];
                }
                processArgFragment(args, fragment);
            }
            out_i_1 = i;
        };
        var out_i_1;
        for (var i = 0; i < wikitext.length; i++) {
            _loop_2(i);
            i = out_i_1;
        }
        return ret;
    };
    return Wikitext;
}());
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
function processArgFragment(args, fragment, options) {
    options = options || {};
    var len = options.new ? args.length : Math.max(args.length - 1, 0);
    if (args[len] === undefined) {
        args[len] = { text: '', name: '', value: '' };
    }
    var frIdx;
    if (len === 0 && options.nonname) { // Looking for a template name but the fragment is an unusual expression
        args[len].text += fragment;
    }
    else if (len === 0) { // Looking for a template name and the fragment is part of the name
        args[len].text += fragment;
        args[len].name += fragment;
    }
    else if ((frIdx = fragment.indexOf('=')) !== -1 && !args[len].name && !options.nonname) { // Found `=` when `name` is empty
        args[len].name = args[len].text + fragment.slice(0, frIdx);
        args[len].text += fragment;
        args[len].value = args[len].text.slice(args[len].name.length + 1);
    }
    else {
        args[len].text += fragment;
        args[len].value += fragment;
    }
}
// **************************************************** EXPORTS ****************************************************
module.exports = {
    version: '1.0.12',
    load: load,
    sleep: sleep,
    continuedRequest: continuedRequest,
    massRequest: massRequest,
    clean: clean,
    getIcon: getIcon,
    arraysEqual: arraysEqual,
    arraysDiff: arraysDiff,
    Template: Template,
    Wikitext: Wikitext
};
// </nowiki>
// export {};
