/*

Inform idioms
=============

Copyright (c) 2011 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

/*

TODO:
	loops
		doesn't work yet because of storers before the branch
		Need loops where the condition is at the end -> do {} while ()
	break (& continue?)
	when opcodes are removed, if debug then add a comment
	The @jump check isn't VM independant

*/

var AST = require( '../common/ast.js' ),
utils = require( '../common/utils.js' );

// Block if statements / while loops
function idiom_if_block( context, pc )
{
	var i = 0,
	subcontext,
	sublen,
	brancher,
	lastop,
	secondlastop,
	update_contexts,
	allbranches;

	// This is only needed for pretty printing
	if ( context.e.env.debug )
	{
		// Update the contexts of new contexts
		update_contexts = function( ops, context )
		{
			for ( i = 0; i < ops.length; i++ )
			{
				ops[i].context = context;
			}
		};
	}

	// First, find the branch opcode
	// (-1 because we don't want to catch the very last opcode, not that it should ever branch to the following statement)
	while ( i < context.ops.length - 1 )
	{
		// As long as no other opcodes have an offset property we can skip the instanceof check
		if ( /* context.ops[i] instanceof Brancher && */ context.ops[i].offset === pc )
		{
			// Sometimes Inform makes complex branches, where the only subcontext opcode would be a brancher itself
			// Join the two branches into one
			if ( context.ops.length - i === 2 /* && context.ops[i + 1] instanceof Brancher */ && context.ops[i + 1].offset )
			{
				lastop = context.ops.pop();
				secondlastop = context.ops.pop();
				// The first brancher must be inverted
				secondlastop.cond.invert = !secondlastop.cond.invert;
				// Make a new BrancherLogic to AND the old branchers together
				lastop.cond = new AST.BrancherLogic( [secondlastop.cond, lastop.cond], '&&' );
				// Fix the labels and return the last opcode to the opcodes array
				lastop.labels = secondlastop.labels.concat( lastop.labels );
				context.ops.push( lastop );
				return 1;
			}

			// Make a new Context to contain all of the following opcodes
			subcontext = new AST.Context( context.e, context.ops[i + 1].pc );
			subcontext.ops = context.ops.slice( i + 1 );
			sublen = subcontext.ops.length - 1;
			context.ops.length = i + 1;
			// This is only needed for pretty printing
			if ( context.e.env.debug )
			{
				update_contexts( subcontext.ops, subcontext );
			}

			// Set that Context as the branch's target, and invert its condition
			brancher = context.ops[i];
			brancher.result = subcontext;
			brancher.cond.invert = !brancher.cond.invert;

			// Check if this is actually a loop
			lastop = subcontext.ops[sublen];
			if ( lastop.code === 140 && ( utils.U2S16( lastop.operands[0].v ) + lastop.next - 2 ) === brancher.pc )
			{
				brancher.keyword = 'while';
				subcontext.ops.pop();
			}
			else
			{
				// Mark this subcontext as a stopper if its last opcode is
				subcontext.stopper = lastop.stopper;
			}

			if ( context.e.env.debug )
			{
				// Check whether this could be a very complex condition
				allbranches = 1;
				for ( i = 0; i < sublen + 1; i++ )
				{
					if ( !( subcontext.ops[i] instanceof AST.Brancher ) )
					{
						allbranches = 0;
					}
				}
				if ( allbranches === 1 )
				{
					context.e.log( 'Potential complex condition in ' + context.pc + ' at ' + brancher.pc );
				}
			}

			// Return 1 to signal that we can continue past the stopper
			return 1;
		}
		i++;
	}
}
module.exports.idiom_if_block = idiom_if_block;
