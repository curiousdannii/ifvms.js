/*

ZVM - the ifvms.js implementation of the Z-Machine
==================================================

Built: BUILDDATE

Copyright (c) 2011 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

/*
	
TODO:
	Use a bind function to eliminate needless closures
	Make class.js smarter to eliminate function layers
	Maybe use a custom OBJECT so that any other instance of class.js won't interfere - we would then include it in the compile zvm.js
	
*/
 
// Wrap all of ZVM in a closure/namespace, and enable strict mode
(function( window ){ 'use strict';

// In debug mode close the closure now
;;; })();

;;; var ZVM = 1, GVM = 0, DEBUG = 1;

// Array.indexOf compatibility
// Note: the fromIndex parameter is not supported
if ( ![].indexOf )
{
	Array.prototype.indexOf = function( obj )
	{
		for ( var i = 0, l = this.length; i < l; i++ )
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
	for ( name in add )
	{
		old[name] = add[name];
	}
	return old;
},

// Utility to bind!
// Instead emulate Function.prototype.bind?
bind = Function.prototype.bind ? function( obj, func )
{
	return func.bind( obj );
} :
function( obj, func )
{
	return function() {
		func.apply( obj, arguments );
	};
},

// Log wrapper
log = window.console ? function( msg ){ console.log( msg ); } : function(){}

// Short cuts
fromCharCode = String.fromCharCode,

// Utilities for 16-bit signed arithmetic
U2S = function( value )
{
	return ( (value & 0x8000) ? ~0xFFFF : 0 ) | value;
},
S2U = function( value )
{
	return value & 0xFFFF;
},

PARCHMENT_SECURITY_OVERRIDE = window.PARCHMENT_SECURITY_OVERRIDE;
