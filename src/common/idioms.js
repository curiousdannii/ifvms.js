/*
 * Inform idioms
 *
 * Copyright (c) 2011 The ifvms.js team
 * Licenced under the BSD
 * http://github.com/curiousdannii/ifvms.js
 */

/*
	
TODO:
	
*/

// Check if the second last op is a branch to the next address
// TODO: look further than the second last op
var idiom_branch_reverser = function( context, pc )
{
	var temp = context.ops[context.ops.length - 2];
	
	if ( temp instanceof Brancher && temp.offset == pc )
	{
		// Make the last op be the brancher's result, reversing it's conditions
		temp.result = context.ops.pop();
		temp.invert = 1;
		return 1;
	}
	return 0;
};