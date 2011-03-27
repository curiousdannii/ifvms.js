/*

Inform idioms
=============

Copyright (c) 2011 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js
 
*/

/*
	
TODO:
	
*/

// Block if statements
var idiom_if_block = function( context, pc )
{
	var i = 0,
	subcontext;
	
	// First, find the branch opcode
	// (-1 because we don't want to catch the very last opcode, not that it should ever branch to the following statement)
	while ( i < context.ops.length - 1 )
	{
		// As long as no other types of opcodes have an offset property, it's safe to not check it's an instanceof Brancher
		if ( context.ops[i].offset == pc )
		{
			// Make a new Context to contain all of the following opcodes
			subcontext = new Context( context.e, context.ops[i + 1] );
			subcontext.ops = context.ops.slice( i + 1 );
			context.ops.length = i + 1;
			
			// Set that Context as the branch's target, and invert its condition
			context.ops[i].result = subcontext;
			context.ops[i].invert = !context.ops[i].invert;
			
			// Mark this subcontext as a stopper if its last opcode is
			subcontext.stopper = subcontext.ops[subcontext.ops.length - 1].stopper;
			
			// Indent subcontexts
			subcontext.spacer = context.spacer + '  ';
			
			// Return 1 to signal that we can continue past the stopper
			return 1;
		}
		i++;
	}
};