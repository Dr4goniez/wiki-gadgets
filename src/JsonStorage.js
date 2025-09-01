module.exports = (() => {

/**
 * A typed wrapper around localStorage that serializes to/from JSON.
 *
 * Once removed, an instance becomes inactive and must be explicitly reinitialized via {@link reinit}.
 *
 * @template {Record<string, any>} T
 */
class JsonStorage {
	/**
	 * Creates a new JsonStorage instance for the given localStorage key.
	 * Initializes the storage with an empty object if it doesn't exist.
	 *
	 * @param {string} key The localStorage key to persist data under.
	 */
	constructor(key) {
		/**
		 * @type {string}
		 * @private
		 * @readonly
		 */
		this._key = key;
		/**
		 * Whether this instance is active.
		 * Once {@link remove} is called, the instance becomes inactive until {@link reinit} is called.
		 *
		 * @type {boolean} @private
		 */
		this._active = true;

		if (!localStorage.getItem(key)) {
			localStorage.setItem(key, '{}');
		}
	}

	/**
	 * Returns the storage key associated with this instance.
	 *
	 * @returns {string}
	 */
	get key() {
		return this._key;
	}

	/**
	 * Throws if the instance is inactive.
	 *
	 * @private
	 */
	_assertActive() {
		if (!this._active) {
			throw new Error(`JsonStorage for "${this._key}" is inactive (was removed).`);
		}
	}

	/**
	 * Returns the parsed value from localStorage, or an empty object if missing or invalid.
	 *
	 * @returns {T}
	 */
	get() {
		this._assertActive();
		const raw = localStorage.getItem(this._key);
		if (!raw) {
			localStorage.setItem(this._key, '{}');
			return /** @type {T} */ ({});
		}

		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return parsed;
			}
		} catch (_) { /* ignore */ }

		localStorage.setItem(this._key, '{}');
		return /** @type {T} */ ({});
	}

	/**
	 * Returns the value for the given key in the stored object, or `null` if not present.
	 *
	 * @param {keyof T} key
	 * @returns {?T[keyof T]}
	 */
	getByKey(key) {
		this._assertActive();
		const obj = this.get();
		return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : null;
	}

	/**
	 * Overwrites the entire object in localStorage.
	 *
	 * @param {T} data The new object to store.
	 * @returns {this}
	 */
	set(data) {
		this._assertActive();
		localStorage.setItem(this._key, JSON.stringify(data));
		return this;
	}

	/**
	 * Checks whether the stored object has a given key, optionally verifying its type.
	 *
	 * @param {keyof T} key The key to check for.
	 * @param {object} [options]
	 * @param {string} [options.type] Expected type of the value (`typeof` style, or `"array"`/`"null"`).
	 * @param {(value: unknown) => boolean} [options.validate] Optional predicate to further validate the value.
	 * @param {T} [options.obj] Optional object to check instead of reading from storage.
	 *   If provided, skips active state check.
	 * @returns {boolean}
	 */
	has(key, options = {}) {
		const obj = options.obj ?? this.get();
		if (!Object.prototype.hasOwnProperty.call(obj, key)) {
			return false;
		}
		const value = obj[key];

		if (options.type) {
			const actualType = typeof value;
			switch (options.type) {
				case 'array': return Array.isArray(value);
				case 'null': return value === null;
				case 'object':
					return actualType === 'object' && value !== null && !Array.isArray(value);
				default:
					return actualType === options.type;
			}
		}

		if (typeof options.validate === 'function' && !options.validate(value)) {
			return false;
		}

		return true;
	}

	/**
	 * Sets a specific key in the stored object to a given value.
	 *
	 * @param {keyof T} key
	 * @param {T[keyof T]} value
	 * @returns {this}
	 */
	setByKey(key, value) {
		this._assertActive();
		const obj = this.get();
		obj[key] = value;
		return this.set(obj);
	}

	/**
	 * Removes the entire stored object from localStorage and marks this instance as inactive.
	 * After calling this, all method calls (except {@link reinit}) will throw.
	 *
	 * @returns {this}
	 */
	remove() {
		this._assertActive();
		localStorage.removeItem(this._key);
		this._active = false;
		return this;
	}

	/**
	 * Removes a specific key from the stored object, if present.
	 *
	 * @param {keyof T} key
	 * @returns {this}
	 */
	removeByKey(key) {
		this._assertActive();
		const obj = this.get();
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			delete obj[key];
			this.set(obj);
		}
		return this;
	}

	/**
	 * Reinitializes the storage with an empty object and marks it as active again.
	 *
	 * @returns {this}
	 */
	reinit() {
		localStorage.setItem(this._key, '{}');
		this._active = true;
		return this;
	}
}

return JsonStorage;

})();