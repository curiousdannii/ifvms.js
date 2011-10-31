/*

ZVM intro - various functions and compatibility fixes
=====================================================

Copyright (c) 2011 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

/*

ZVM willfully ignores the standard in these ways:
	Non-buffered output is not supported
	Output streams 2 and 4 and input stream 1 are not supported
	Saving tables is not supported (yet?)
	No interpreter number or version is set

Any other non-standard behaviour should be considered a bug

TODO:
	Use a bind function to eliminate needless closures?
	Make class.js smarter to eliminate function layers
	Maybe use a custom OBJECT so that any other instance of class.js won't interfere - we would then include it in the compile zvm.js
	
*/
 
// Wrap all of ZVM in a closure/namespace, and enable strict mode
(function( window, undefined ){ 'use strict';

// In debug mode close the closure now
;;; })();

;;; var ZVM = 1, GVM = 0;

// Array.indexOf compatibility
if ( ![].indexOf )
{
	Array.prototype.indexOf = function( obj, fromIndex )
	{
		for ( var i = fromIndex || 0, l = this.length; i < l; i++ )
		{
			if ( this[i] == obj )
			{
				return i;
			}
		}
		return -1;
	};
}

// Utility to extend objects
var extend = function( old, add )
{
	for ( var name in add )
	{
		old[name] = add[name];
	}
	return old;
},

// Console dummy funcs
console = window.console || {
	log: function(){},
	info: function(){},
	warn: function(){}
},

// Utilities for 16-bit signed arithmetic
U2S = function( value )
{
	return ( (value & 0x8000) ? ~0xFFFF : 0 ) | value;
},
S2U = function( value )
{
	return value & 0xFFFF;
};