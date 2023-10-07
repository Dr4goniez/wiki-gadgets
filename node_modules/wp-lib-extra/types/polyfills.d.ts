/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

// Types for polyfills

declare global {

	// license: Microsoft Corporation: lib.es2015.core.d.ts
	interface String {
		/**
		 * Returns true if searchString appears as a substring of the result of converting this
		 * object to a String, at one or more positions that are
		 * greater than or equal to position; otherwise, returns false.
		 * @param searchString search string
		 * @param position If position is undefined, 0 is assumed, so as to search all of the String.
		 */
		includes(searchString: string, position?: number): boolean;
		/**
		 * Returns a String value that is made from count copies appended together. If count is 0,
		 * the empty string is returned.
		 * @param count number of copies to append
		 */
		repeat(count: number): string;
	}

	// license: Microsoft Corporation: lib.es2015.core.d.ts
	interface Array<T> {
		/**
		 * Returns the index of the first element in the array where predicate is true, and -1
		 * otherwise.
		 * @param predicate find calls predicate once for each element of the array, in ascending
		 * order, until it finds one where predicate returns true. If such an element is found,
		 * findIndex immediately returns that element index. Otherwise, findIndex returns -1.
		 * @param thisArg If provided, it will be used as the this value for each invocation of
		 * predicate. If it is not provided, undefined is used instead.
		 */
		findIndex(predicate: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): number;
	}
	interface ReadonlyArray<T> {
		/**
		 * Returns the index of the first element in the array where predicate is true, and -1
		 * otherwise.
		 * @param predicate find calls predicate once for each element of the array, in ascending
		 * order, until it finds one where predicate returns true. If such an element is found,
		 * findIndex immediately returns that element index. Otherwise, findIndex returns -1.
		 * @param thisArg If provided, it will be used as the this value for each invocation of
		 * predicate. If it is not provided, undefined is used instead.
		 */
		findIndex(predicate: (value: T, index: number, obj: readonly T[]) => unknown, thisArg?: any): number;
	}

	// license: Microsoft Corporation: lib.es2016.array.include.d.ts
	interface Array<T> {
		/**
		 * Determines whether an array includes a certain element, returning true or false as appropriate.
		 * @param searchElement The element to search for.
		 * @param fromIndex The position in this array at which to begin searching for searchElement.
		 */
		includes(searchElement: T, fromIndex?: number): boolean;
	}
	interface ReadonlyArray<T> {
		/**
		 * Determines whether an array includes a certain element, returning true or false as appropriate.
		 * @param searchElement The element to search for.
		 * @param fromIndex The position in this array at which to begin searching for searchElement.
		 */
		includes(searchElement: T, fromIndex?: number): boolean;
	}
	interface Int8Array {
		/**
		 * Determines whether an array includes a certain element, returning true or false as appropriate.
		 * @param searchElement The element to search for.
		 * @param fromIndex The position in this array at which to begin searching for searchElement.
		 */
		includes(searchElement: number, fromIndex?: number): boolean;
	}
	interface Uint8Array {
		/**
		 * Determines whether an array includes a certain element, returning true or false as appropriate.
		 * @param searchElement The element to search for.
		 * @param fromIndex The position in this array at which to begin searching for searchElement.
		 */
		includes(searchElement: number, fromIndex?: number): boolean;
	}
	interface Uint8ClampedArray {
		/**
		 * Determines whether an array includes a certain element, returning true or false as appropriate.
		 * @param searchElement The element to search for.
		 * @param fromIndex The position in this array at which to begin searching for searchElement.
		 */
		includes(searchElement: number, fromIndex?: number): boolean;
	}
	interface Int16Array {
		/**
		 * Determines whether an array includes a certain element, returning true or false as appropriate.
		 * @param searchElement The element to search for.
		 * @param fromIndex The position in this array at which to begin searching for searchElement.
		 */
		includes(searchElement: number, fromIndex?: number): boolean;
	}
	interface Uint16Array {
		/**
		 * Determines whether an array includes a certain element, returning true or false as appropriate.
		 * @param searchElement The element to search for.
		 * @param fromIndex The position in this array at which to begin searching for searchElement.
		 */
		includes(searchElement: number, fromIndex?: number): boolean;
	}
	interface Int32Array {
		/**
		 * Determines whether an array includes a certain element, returning true or false as appropriate.
		 * @param searchElement The element to search for.
		 * @param fromIndex The position in this array at which to begin searching for searchElement.
		 */
		includes(searchElement: number, fromIndex?: number): boolean;
	}
	interface Uint32Array {
		/**
		 * Determines whether an array includes a certain element, returning true or false as appropriate.
		 * @param searchElement The element to search for.
		 * @param fromIndex The position in this array at which to begin searching for searchElement.
		 */
		includes(searchElement: number, fromIndex?: number): boolean;
	}
	interface Float32Array {
		/**
		 * Determines whether an array includes a certain element, returning true or false as appropriate.
		 * @param searchElement The element to search for.
		 * @param fromIndex The position in this array at which to begin searching for searchElement.
		 */
		includes(searchElement: number, fromIndex?: number): boolean;
	}
	interface Float64Array {
		/**
		 * Determines whether an array includes a certain element, returning true or false as appropriate.
		 * @param searchElement The element to search for.
		 * @param fromIndex The position in this array at which to begin searching for searchElement.
		 */
		includes(searchElement: number, fromIndex?: number): boolean;
	}

	// license: Microsoft Corporation: lib.es2015.core.d.ts
	interface ObjectConstructor {
		/**
		 * Copy the values of all of the enumerable own properties from one or more source objects to a
		 * target object. Returns the target object.
		 * @param target The target object to copy to.
		 * @param source The source object from which to copy properties.
		 */
		assign<T extends {}, U>(target: T, source: U): T & U;

		/**
		 * Copy the values of all of the enumerable own properties from one or more source objects to a
		 * target object. Returns the target object.
		 * @param target The target object to copy to.
		 * @param source1 The first source object from which to copy properties.
		 * @param source2 The second source object from which to copy properties.
		 */
		assign<T extends {}, U, V>(target: T, source1: U, source2: V): T & U & V;

		/**
		 * Copy the values of all of the enumerable own properties from one or more source objects to a
		 * target object. Returns the target object.
		 * @param target The target object to copy to.
		 * @param source1 The first source object from which to copy properties.
		 * @param source2 The second source object from which to copy properties.
		 * @param source3 The third source object from which to copy properties.
		 */
		assign<T extends {}, U, V, W>(target: T, source1: U, source2: V, source3: W): T & U & V & W;

		/**
		 * Copy the values of all of the enumerable own properties from one or more source objects to a
		 * target object. Returns the target object.
		 * @param target The target object to copy to.
		 * @param sources One or more source objects from which to copy properties
		 */
		assign(target: object, ...sources: any[]): any;
	}

}

export {};