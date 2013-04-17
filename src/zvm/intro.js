/*

ZVM - the ifvms.js Z-Machine (versions 5 and 8)
===============================================

Built: <%= grunt.template.today('yyyy-mm-dd') %>

Copyright (c) 2011-<%= grunt.template.today('yyyy') %> The ifvms.js team
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
	
*/
 
// Define our DEBUG constants
if ( typeof DEBUG === 'undefined' )
{
	DEBUG = true;
}
if ( DEBUG )
{
	ZVM = true;
	GVM = false;
}
 
// Wrap all of ZVM in a closure/namespace, and enable strict mode
var ZVM = (function(){ 'use strict';

