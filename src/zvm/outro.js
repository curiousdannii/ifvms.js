/*

ZVM outro
=========

Copyright (c) 2013 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

// Export ZVM
if ( typeof module === "object" && typeof module.exports === "object" )
{
	module.exports = ZVM;
}
else
{
	window.ZVM = ZVM;
}

})( this );