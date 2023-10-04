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
/// <reference types="jquery" />
/**
 * @link https://doc.wikimedia.org/mediawiki-core/master/js/source/mediawiki.String.html#mw-String
 * @internal
 */
// interface MwString {
//     /**
//      * Calculate the byte length of a string (accounting for UTF-8).
//      * @param str
//      * @returns
//      */
//     byteLength: (str: string) => number;
//     /**
//      * Uppercase the first character. Support UTF-16 surrogates for characters outside of BMP.
//      * @param string
//      * @returns
//      */
//     ucFirst: (string: string) => string;
// }
// /** @internal */
// declare const mwString: MwString;
/**
 * Load all the modules that this library depends on.
 * - {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Title |mediawiki.Title}
 * - {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.util |mediawiki.util}
 * - {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Api |mediawiki.api}
 * @returns `true` on success, `false` on failure.
 */
declare function load(): JQueryPromise<boolean>;
/**
 * Let the code sleep for `n` milliseconds.
 * @param milliseconds The milliseconds to sleep. If a negative number is passed, it is automatically rounded up to `0`.
 * @returns
 */
declare function sleep(milliseconds: number): JQueryPromise<void>;
interface DynamicObject {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}
/**
 * Send an API request that automatically continues until the limit is reached. Works only for calls that have a 'continue' property in the response.
 * @param params
 * @param limit Default: 10
 * @returns The return array might have `null` elements if any internal API request failed.
 * @requires mediawiki.api
 */
declare function continuedRequest(params: DynamicObject, limit?: number): JQueryPromise<(DynamicObject | null)[]>;
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
declare function massRequest(params: DynamicObject, batchParams: string | string[], apilimit?: number): JQueryPromise<(DynamicObject | null)[]>;
/**
 * Remove unicode bidirectional characters and leading/trailing `\s`s from a string.
 *
 * @param str Input string.
 * @param trim Whether to trim `str`, defaulted to `true`.
 * @returns
 */
declare function clean(str: string, trim?: boolean): string;
/**
 * A disjunctive union type for primitive types.
 */
type primitive = string | number | bigint | boolean | null | undefined;
/**
 * Check whether two arrays are equal. Neither array should contain non-primitive values as its elements.
 * @param array1
 * @param array2
 * @param orderInsensitive Default: `false`
 * @returns
 */
declare function arraysEqual(array1: primitive[], array2: primitive[], orderInsensitive?: boolean): boolean;
/**
 * Compare elements in two arrays and get differences.
 * @param sourceArray
 * @param targetArray
 * @returns
 */
declare function arraysDiff(sourceArray: primitive[], targetArray: primitive[]): {
    added: primitive[];
    removed: primitive[];
};
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
    nameprop?: 'full' | 'clean' | 'fullclean';
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
    unformatted?: 'name' | 'value' | 'both';
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
declare class Template {
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
    constructor(name: string, config?: TemplateConfig);
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
    getName(prop?: 'full' | 'clean' | 'fullclean'): string;
    /**
     * Register template arguments into {@link args}.
     *
     * @param newArgs An array of `{name: string; value: string;}` objects.
     * @param logOverride Whether to leave a log when overriding argument values.
     */
    private registerArgs;
    /**
     * @param arg New argument object to register.
     * @param logOverride Whether to leave a log when overriding argument values.
     */
    private registerArg;
    /**
     * Check whether a given argument is to be hierarchically overridden.
     * @param name
     */
    private getHier;
    /**
     * Add new arguments to the {@link Template} instance. This method leaves a log when argument override takes place,
     * which can be viewed by {@link getOverriddenArgs}.
     *
     * @param newArgs An array of `{name: string; value: string;}` objects.
     */
    addArgs(newArgs: NewArg[]): Template;
    /**
     * Set (or update) arguments in(to) the {@link Template} instance. This method does not leave a log when argument override takes place.
     *
     * Note: New arguments are simply newly added, just as when {@link addArgs} is used.
     *
     * @param newArgs An array of `{name: string; value: string;}` objects.
     */
    setArgs(newArgs: NewArg[]): Template;
    /**
     * Get the arguments of the template as an array of objects.
     *
     * @param deepCopy Whether to return a deep copy, defaulted to `true`. Otherwise, {@link args} is passed by reference
     * (not recommended).
     * @returns
     */
    getArgs(deepCopy?: boolean): TemplateArgument[];
    /**
     * Get (a deep copy of) a template argument by an argument name.
     * @param name Argument name.
     * @param options Optional search options.
     * @returns `null` if no argument is found with the specified name.
     */
    getArg(name: string | RegExp, options?: GetArgOptions & GetArgUniqueOptions): TemplateArgument | null;
    /**
     * Check whether the {@link Template} instance has an argument with a certain name.
     * @param name Name of the argument to search for.
     * @param options Optional search options.
     * @returns A boolean value in accordance with whether there is a match.
     */
    hasArg(name: string | RegExp, options?: GetArgOptions): boolean;
    /**
     * Delete template arguments.
     * @param names
     * @returns Deleted arguments.
     */
    deleteArgs(names: string[]): TemplateArgument[];
    /**
     * Delete a template argument.
     * @param name
     * @returns `true` if the instance has an argument with the specified name and if the argument is successfully removed,
     * `false` otherwise.
     */
    deleteArg(name: string): boolean;
    /**
     * Get a list of overridden template arguments as an array of objects. This method returns a deep copy,
     * and modifying the return value does not modify the original array stored in the class.
     */
    getOverriddenArgs(): TemplateArgument[];
    /**
     * Get the argument hierarchies.
     * @returns
     */
    getHierarchy(): string[][];
    /**
     * Render the {@link Template} instance as wikitext.
     *
     * Use `render({nameprop: 'full', unformatted: 'both'})` for an output that is closest to the original configurations.
     *
     * @param options Optional object of rendering specifications
     */
    render(options?: RenderOptions): string;
    /**
     * Stringify the {@link Template} instance. Same as `render({nameprop: 'full', unformatted: 'both'})`.
     */
    toString(): string;
    /**
     * Get class properties in a JSON format.
     */
    toJSON(): TemplateJSON;
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
declare class ParsedTemplate extends Template {
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
    constructor(parsed: ParsedTemplateParam);
    /**
     * Error-proof constructor. **This method is supposed to be used only by {@link Wikitext.parseTemplates}**.
     * @param parsed
     * @returns `null` if the constructor threw an error.
     */
    static new(parsed: ParsedTemplateParam): ParsedTemplate | null;
    /**
     * Get class properties in a JSON format.
     */
    toJSON(): TemplateJSON & {
        originalText: string;
        startIndex: number;
        endIndex: number;
        nestLevel: number;
    };
    /**
     * Render the original template text.
     * @returns
     */
    renderOriginal(): string;
    /**
     * Get {@link _startIndex}.
     * @returns
     */
    getStartIndex(): number;
    /**
     * Get {@link _endIndex}.
     * @returns
     */
    getEndIndex(): number;
    /**
     * Get the nest level of the template.
     * @returns
     */
    getNestLevel(): number;
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
    replaceIn(wikitext: string, options?: RenderOptions & ReplaceInOptions): string;
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
    recursivePredicate?: (Template: ParsedTemplate | null) => boolean;
    /**
     * Private parameter used to determine the value of {@link ParsedTemplate.nestLevel}.
     * @private
     */
    _nestLevel?: number;
}
/** The Wikitext class with methods to manipulate wikitext. */
declare class Wikitext {
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
    private revision;
    /**
     * Stores the return value of {@link parseTags}.
     *
     * A deep copy can be retrieved by {@link getTags}.
     * @private
     */
    private tags;
    /**
     * Stores the return value of {@link parseSections}.
     *
     * A deep copy can be retrieved by {@link getSections}.
     * @private
     */
    private sections;
    /**
     * Stores the return value of {@link parseParameters}.
     *
     * A deep copy can be retrieved by {@link getParameters}.
     * @private
     */
    private parameters;
    /**
     * Initialize a {@link Wikitext} instance.
     * @param wikitext
     * @requires mediawiki.api
     */
    constructor(wikitext: string);
    /**
     * Returns the length of the wikitext.
     */
    get length(): number;
    /**
     * Returns the byte length of the wikitext.
     */
    get byteLength(): number;
    /**
     * Fetch the wikitext of a page with additional information on the current revision.
     * @param pagetitle
     * @returns `false` if the page doesn't exist, `null` if the API request failed.
     * @requires mediawiki.api
     */
    static fetch(pagetitle: string): JQueryPromise<Revision | false | null>;
    /**
     * Fetch the wikitext of a page. If additional revision information should be included, use {@link Wikitext.fetch|fetch}.
     * @param pagetitle
     * @returns `false` if the page doesn't exist, `null` if the API request failed.
     * @requires mediawiki.api
     */
    static read(pagetitle: string): JQueryPromise<string | false | null>;
    /**
     * Initialize a new {@link Wikitext} instance by fetching the content of a page.
     * @param pagetitle
     * @returns `false` if the page doesn't exist, `null` if the content of the page failed to be fetched.
     * @requires mediawiki.api
     */
    static newFromTitle(pagetitle: string): JQueryPromise<Wikitext | false | null>;
    /**
     * Get a deep copy of {@link revision}, which is a private property available only when the {@link Wikitext} instance was initialized
     * by {@link newFromTitle}.
     * @returns `null` if the instance doesn't have the relevant property, meaning that it wasn't initialized by {@link newFromTitle}.
     */
    getRevision(): Revision | null;
    /**
     * Parse \<tag>s in the wikitext.
     * @param config
     * @returns
     */
    parseTags(config?: ParseTagsConfig): Tag[];
    /**
     * Get a deep copy of {@link tags}, which is a private property available only when {@link parseTags} has
     * been called at least once. Note that {@link parseTags} returns a (filtered) deep copy of {@link tags}
     * on a non-first call, so simply call the relevant method if there is no need for a `null` return.
     * @returns
     */
    getTags(): Tag[] | null;
    /**
     * Check whether a substring of the wikitext starting and ending at a given index is inside any transclusion-preventing tag.
     * @param tpTags An array of transclusion-preventing tags fetched by {@link parseTags}.
     * @param startIndex The start index of the string in the wikitext.
     * @param endIndex The end index of the string in the wikitext.
     * @returns
     */
    private inTpTag;
    /**
     * Parse sections in the wikitext.
     * @returns
     */
    parseSections(): Section[];
    /**
     * Get a deep copy of {@link sections}, which is a private property available only when {@link parseSections} has
     * been called at least once. Note that {@link parseSections} returns a (filtered) deep copy of {@link sections}
     * on a non-first call, so simply call the relevant method if there is no need for a `null` return.
     * @returns
     */
    getSections(): Section[] | null;
    /**
     * Parse {{{parameter}}}s in the wikitext.
     * @param config
     * @returns
     */
    parseParameters(config?: ParseParametersConfig): Parameter[];
    /**
     * Get a deep copy of {@link parameters}, which is a private property available only when {@link parseParameters} has
     * been called at least once. Note that {@link parseParameters} returns a (filtered) deep copy of {@link parameters}
     * on a non-first call, so simply call the relevant method if there is no need for a `null` return.
     * @returns
     */
    getParameters(): Parameter[] | null;
    /**
     * Parse {{template}}s in the wikitext.
     * @param config
     * @returns
     */
    parseTemplates(config?: ParseTemplatesConfig): ParsedTemplate[];
}
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
declare function processArgFragment(args: ParsedArgument[], fragment: string, options?: FragmentOptions): void;

/** The object exported by `ext.gadget.WpLibExtra`. */
declare global {
    interface WpLibExtra {
        load: typeof load;
        sleep: typeof sleep;
        continuedRequest: typeof continuedRequest;
        massRequest: typeof massRequest;
        clean: typeof clean;
        arraysEqual: typeof arraysEqual;
        arraysDiff: typeof arraysDiff;
        Template: typeof Template;
        Wikitext: typeof Wikitext;
    }
}
export {};