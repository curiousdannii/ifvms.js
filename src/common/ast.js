/*

Abstract syntax trees for IF VMs
================================

Copyright (c) 2011 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

/*

All AST nodes must use these functions, even constants
write() functions are used to generate JIT code

Aside from Variable is currently generic and could be used for Glulx too

TODO:
	Precalculate simple arith? Here? ZVM.compile?
	Combine print statements?
	Use strict mode for new Function()?
	
*/

// Find a routine's name
;;; var find_func_name = function( pc ) { while ( !vm_functions[pc] && pc > 0 ) { pc--; } return vm_functions[pc]; };

// Generic/constant operand
// Value is a constant
var Operand = Object.subClass({
	init: function( engine, value )
	{
		this.e = engine;
		this.v = value;
	},
	write: function()
	{
		return this.v;
	}
}),

// Variable operand
// Value is the variable number
// TODO: unrolling is needed -> retain immediate returns if optimisations are disabled
Variable = Operand.subClass({
	write: function( value )
	{
		var variable = this.v,
		// We may have already evaluated the value's write(), for example in Storer.write()
		value = value && value.write ? value.write() : value,
		offset = this.e.globals + (variable - 16) * 2;
		
		// Stack
		if ( variable == 0 )
		{
			// If we've been passed a value we're setting a variable
			if ( value )
			{
				return 's.push(' + value + ')';
			}
			else
			{
				return 's.pop()';
			}
		}
		// Locals
		else if ( variable < 16 )
		{
			variable--;
			if ( value )
			{
				return 'l[' + variable + ']=' + value;
			}
			else
			{
				return 'l[' + variable + ']';
			}
		}
		// Globals
		else
		{
			if ( value )
			{
				return 'm.setUint16(' + offset + ',' + value + ')';
			}
			else
			{
				return 'm.getUint16(' + offset + ')';
			}
		}
	}
}),

// Generic opcode
// .func() must be set, which returns what .write() will actually return; it is passed operands as its arguments
Opcode = Object.subClass({
	init: function( engine, context, code, pc, next, operands )
	{
		this.e = engine;
		this.context = context;
		this.code = code;
		this.pc = pc;
		this.next = next;
		this.operands = operands;

		// Pre-if statements
		this.pre = [];
		
		// Post-init function (so that they don't all have to call _super)
		if ( this.post )
		{
			this.post();
		}
	},
	
	// Write out the opcode, passing .operands to .func(), with a JS comment of the pc/opcode
	write: function()
	{
		return this.label() + ( this.func ? this.func( this.operands ) : '' );
	},
	
	// Return a string of the operands separated by commas
	var_args: function( array )
	{
		var i = 0,
		new_array = [];
		
		while ( i < array.length )
		{
			new_array.push( array[i++].write() );
		}
		return new_array.join();
	},
	
	// Generate a comment of the pc and code
	label: function()
	{
		return '/* ' + this.pc + '/' + this.code + ' */ ';
	}
}),

// Stopping opcodes
Stopper = Opcode.subClass({
	stopper: 1
}),

// Branching opcodes
Brancher = Opcode.subClass({
	// Flag for the disassembler
	brancher: 1,
	
	// Process the branch result now
	post: function()
	{
		var result,
		prev,
		
		// Set aside the branch address - must be just a number
		brancher = this.operands.pop(),
		word,
		offset;
		
		// Process the offset
		/* ZVM */ if ( ZVM ) {
			word = brancher > 0xFF;
			offset = word ? ( (brancher & 0x1FFF) | (brancher & 0x2000 ? ~0x1FFF : 0) ) : brancher & 0x3F;
			this.iftrue = brancher & ( word ? 0x8000 : 0x80 );
		} /* ENDZVM */
		/* GVM */ if ( GVM ) {
		} /* ENDGVM */
		
		if ( offset == 0 || offset == 1 )
		{
			result = 'e.ret(' + offset + ')';
		}
		else
		{
			offset += this.next - 2;
			
			// Add this target to this context's list
			this.context.targets.push( offset );
			result = 'e.pc=' + offset;
		}
		this.result = result + '; return';
		this.offset = offset;
		this.ops = [];
		this.labels = [];
		
		// Compare with previous statement
		if ( this.context.ops.length )
		{
			prev = this.context.ops.pop();
			if ( prev instanceof Brancher && prev.offset == offset )
			{
				// Goes to same offset so reuse the Brancher arrays
				this.pre = prev.pre;
				this.ops = prev.ops;
				this.labels = prev.labels;
			}
			else
			{
				this.context.ops.push( prev );
			}
		}
		
		// Push this op and label
		this.ops.push( this );
		this.labels.push( this.pc + '/' + this.code );
	},
	
	// Write out the brancher
	write: function()
	{
		var i = 0,
		op,
		result = this.result;
		
		// Account for Contexts
		if ( this.result instanceof Context )
		{
			result = this.result.write() + ( this.result.stopper ? '; return' : '' );
			
			// Extra line breaks for multi-op results
			if ( this.result.ops.length > 1 )
			{
				result = '\n' + this.result.spacer + result + '\n';
			}
		}
		
		// Acount for many possible conditions
		while ( i < this.ops.length )
		{
			op = this.ops[i];
			this.ops[i++] = ( op.iftrue ? '' : '!(' ) + op.func( op.operands ) + ( op.iftrue ? '' : ')' );
		}
		
		// Print out a label for all included branches, all pre-if statements and the branch itself
		this.pre.push( '' );
		return '/* ' + this.labels.join() + ' */ ' + this.pre.join( ';' ) +
		( this.invert ? 'if (!(' : 'if (' ) + this.ops.join( '||' ) + ( this.invert ? ')) {' : ') {' ) + result + '}';
	}
}),

// Storing opcodes
Storer = Opcode.subClass({
	// Flag for the disassembler
	storer: 1,
	
	// Set aside the storer operand
	post: function()
	{
		this.storer = this.operands.pop();
	},
	
	// Write out the opcode, passing it to the storer (if there still is one)
	write: function()
	{
		var data = this._super();
		
		// If we still have a storer operand, use it
		// Otherwise (if it's been removed due to optimisations) just return func()
		return this.storer ? this.storer.write( data ) : data;
	}
}),

// Indirect storer opcodes
Indirect = Opcode.subClass({
	// Fake a storer operand
	post: function()
	{
		// If the variable is a constant we can create the storer now
		if ( !(this.operands[0] instanceof Variable) )
		{
			this.storer = new Variable( this.e, this.operands[0].v );
		}
	},
	write: function()
	{
		var operands = this.operands,
		data = this._super();
		
		// If we the variable is not a constant we can only make it now
		if ( operands[0] instanceof Variable )
		{
			this.storer = new Variable( this.e, operands[0].write ? operands[0].write() : operands[0] );
		}
		
		// Write out (be careful because if the variable is a constant it could have already been dealt with)
		return this.storer ? this.storer.write( data ) : data;
	}
}),

// Routine calling opcodes
Caller = Stopper.subClass({
	post: function()
	{
		// Fake a result variable
		this.result = { v: -1 };
	},

	// Write out the opcode
	write: function()
	{
		// Get the address to call
		var addr = this.operands.shift();
		
		// Code generate
		// Debug: include label if possible
		/* DEBUG */ if ( DEBUG ) {
			addr = addr.write();
			var targetname = window.vm_functions && parseInt( addr ) ? ' /* ' + find_func_name( addr * 4 ) + '() */' : '';
			return this.label() + 'e.call(' + addr + ',' + this.result.v + ',' + this.next + ',[' + this.var_args( this.operands ) + '])' + targetname;
		} /* ENDDEBUG */
		return this.label() + 'e.call(' + addr.write() + ',' + this.result.v + ',' + this.next + ',[' + this.var_args( this.operands ) + '])';
	}
}),

// Routine calling opcodes, storing the result
CallerStorer = Caller.subClass({
	// Flag for the disassembler
	storer: 1,
	
	post: function()
	{
		// We can't let the storer be optimised away here
		this.result = this.operands.pop();
	}
}),

// A generic context (a routine, loop body etc)
Context = Object.subClass({
	init: function( engine, pc )
	{
		this.e = engine;
		this.pc = pc;
		this.ops = [];
		this.targets = []; // Branch targets
		this.contexts = []; // List of sub-contexts (though including this one)
		this.spacer = '';
	},
	
	write: function()
	{
		var ops = this.ops,
		compiled_ops = [],
		i = 0;
		
		while ( i < ops.length )
		{
			compiled_ops.push( ops[i++].write() );
		}
		
		// Return the code
		return compiled_ops.join( ';\n' + this.spacer );
	}
}),

// A routine body
RoutineContext = Context.subClass({
	write: function()
	{
		// Add in some extra vars and return
		// Debug: If we have routine names, find this one's name
		/* DEBUG */ if ( DEBUG ) {
			this.name = window.vm_functions && find_func_name( this.pc );
			var funcname = this.name ? '/* ' + this.name + ' */\n' : '';
			return funcname + 'var l=e.l,m=e.m,s=e.s;\n' + this._super();
		} /* ENDDEBUG */
		return 'var l=e.l,m=e.m.data,s=e.s;\n' + this._super();
	}
}),

// Opcode builder
// Pass in a function, return a new Class whose .func is set to pass in operands as its arguments
// operands will also be changed to an array of write() functions
opcode_builder = function( Class, func, flags )
{
	var flags = flags || {},
	props = extend( flags, {
		init: function()
		{
			var i = 0, operands;
			this._super.apply( this, arguments );
			
			// Alter .operands
			operands = this.operands;
			while ( i < operands.length )
			{
				// Don't autowrite a branch address/text literal
				if ( operands[i] instanceof Operand )
				{
					operands_autowriter( operands, operands[i], i );
				}
				i++;
			}
		},
		
		func: function( operands )
		{
			return func.apply( this, operands );
		}
	} );
	return Class.subClass(props);
},

// A closure is needed as i changes
operands_autowriter = function( operands, orig_operand, i )
{
	operands[i] = function()
	{
		return orig_operand.write();
	};
	//operands[i] = bind( orig_operand, orig_operand.write );
	
	// Add some extra functions
	extend( operands[i], {
		// Put the original operand back
		orig: orig_operand,
		v: orig_operand.v,
	
		// Add back a .write()
		write: function()
		{
			return orig_operand.write();
		},
		
		// Convert an Operand into a signed operand
		U2S: function()
		{
			// Variable operand
			if ( orig_operand instanceof Variable )
			{
				return 'e.U2S(' + orig_operand.write() + ')';
			}
			
			// Constant operand
			return U2S( orig_operand.v );
		}
	});
};
