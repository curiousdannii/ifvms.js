/*

VM outro (generic!)
===================

Copyright (c) 2013 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

// Export the VM in node.js
if ( typeof module === "object" && typeof module.exports === "object" )
{
	module.exports = VM;
}

// TODO: Support Web Workers

return VM;

})();