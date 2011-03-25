/*
 * Z-Machine opcodes
 *
 * Copyright (c) 2011 The ifvms.js team
 * Licenced under the BSD
 * http://github.com/curiousdannii/ifvms.js
 */

/*
	
TODO:
	consider generalising the indirect instructions
	Abstract out the signed conversions such that they can be eliminated if possible
	don't access memory directly
	consider scrapping the autowriter idea and calling the operands' .write()s directly
	
*/

var buffer = 'e.buffer+=',

// If the .write() of an operand generates code to access the stack or the memory (if non-native ByteArray) then don't access it more than once
// Currently only for branchers
rUnsafeOperand = native_bytearrays ? /^s/ : /^[sm]/,
safe_operand = function( opcode, operand )
{
	var temp = operand();
	if ( rUnsafeOperand.test( temp ) )
	{
		opcode.pretemp( temp );
		temp = opcode.temp();
	}
	return temp;
},

// Actually check??
verifypiracy = opcode_builder( Brancher, function() { return 1; } ),

opcodes = {
	
/* je */ 1: opcode_builder( Brancher, function( a, b ) { return arguments.length == 2 ? a() + '==' + b() : 'e.jeq(' + this.var_args( arguments ) + ')'; } ),
/* jl */ 2: opcode_builder( Brancher, function( a, b ) { return a.U2S() + '<' + b.U2S(); } ),
/* jg */ 3: opcode_builder( Brancher, function( a, b ) { return a.U2S() + '>' + b.U2S(); } ),
/* dec_chk */
/* inc_chk */
/* jin */ 6: opcode_builder( Brancher, function( a, b ) { return 'm.getUint16(e.objects+14*(' + a() + '-1)+6)==' + b(); } ),
/* test */ 7: opcode_builder( Brancher, function( bitmap, flag ) { var temp = safe_operand( this, flag ); return bitmap() + '&' + temp + '==' + temp; } ),
/* or */ 8: opcode_builder( Storer, function( a, b ) { return a() + '|' + b(); } ),
/* and */ 9: opcode_builder( Storer, function( a, b ) { return a() + '&' + b(); } ),
/* test_attr */ 10: opcode_builder( Brancher, function( object, attr ) { var temp = safe_operand( this, attr ); return '(m.getUint8(e.objects+14*(' + object() + '-1)+parseInt(' + temp + '/8))<<(' + temp + '%8))&128'; } ),
/* set_attr */
/* clear_attr */
/* store */ 13: opcode_builder( Indirect, function( variable, value ) { return value(); } ),
/* insert_obj */
/* loadw */ 15: opcode_builder( Storer, function( array, index ) { return 'm.getUint16(' + array() + '+2*' + index() + ')'; } ),
/* loadb */ 16: opcode_builder( Storer, function( array, index ) { return 'm.getUint8(' + array() + '+' + index() + ')'; } ),
/* get_prop */
/* get_prop_addr */ 18: opcode_builder( Storer, function( object, property ) { return 'e.get_prop_addr(' + object() + ',' + property() + ')'; } ),
/* get_next_prop */
/* add */ 20: opcode_builder( Storer, function( a, b ) { return 'e.S2U(' + a() + '+' + b() + ')'; } ),
/* sub */ 21: opcode_builder( Storer, function( a, b ) { return 'e.S2U(' + a() + '-(' + b() + '))'; } ),
/* mul */ 22: opcode_builder( Storer, function( a, b ) { return 'e.S2U(' + a() + '*' + b() + ')'; } ),
/* div */ 23: opcode_builder( Storer, function( a, b ) { return 'e.S2U(parseInt(' + a() + '/' + b() + '))'; } ),
/* mod */ 24: opcode_builder( Storer, function( a, b ) { return 'e.S2U(' + a() + '%' + b() + ')'; } ),
/* call_2s */ 25: CallerStorer,
/* call_2n */ 26: Caller,
/* set_colour */
/* throw */
/* jz */ 128: opcode_builder( Brancher, function( a ) { return a() + '==0'; } ),
/* get_sibling */
/* get_child */
/* get_parent */
/* get_prop_length */ 132: opcode_builder( Storer, function( a ) { return 'e.get_prop_len(' + a() + ')'; } ),
/* inc */ 133: opcode_builder( Opcode, function( a ) { return 'e.incdec(' + a() + ',1)'; } ),
/* dec */ 134: opcode_builder( Opcode, function( a ) { return 'e.incdec(' + a() + ',-1)'; } ),
/* print_addr */ 135: opcode_builder( Opcode, function( addr ) { return buffer + 'e.text.decode(' + addr() + ')[0]' } ),
/* call_1s */ 136: CallerStorer,
/* remove_obj */
/* print_obj */ 138: opcode_builder( Opcode, function( a ) { return buffer + 'e.text.decode(m.getUint16(e.objects+14*(' + a() + '-1)+13))[0]'; } ),
/* ret */ 139: opcode_builder( Stopper, function( a ) { return 'e.ret(' + a() + ')'; } ),
/* jump */ 140: opcode_builder( Stopper, function( a ) { return 'e.pc=' + a.U2S() + '+' + (this.next - 2) + ''; } ),
/* print_paddr */ 141: opcode_builder( Opcode, function( addr ) { return buffer + 'e.text.decode(' + addr() + '*' + this.e.packing_multipler + ')[0]'; } ),
/* load */
/* call_1n */ 143: Caller,
/* rtrue */ 176: opcode_builder( Stopper, function() { return 'e.ret(1)'; } ),
/* rfalse */ 177: opcode_builder( Stopper, function() { return 'e.ret(0)'; } ),
// Reconsider a generalised class for @print/@print_ret?
/* print */ 178: opcode_builder( Opcode, function( text ) { return buffer + '"' + text + '"'; }, { printer: 1 } ),
/* print_ret */ 179: opcode_builder( Stopper, function( text ) { return buffer + '"' + text + '"'; }, { printer: 1 } ),
/* nop */ 180: Opcode,
/* restart */ 183: opcode_builder( Stopper, function() { return 'e.act("restart")'; } ), // !!!
/* ret_popped */
/* catch */
/* quit */ 186: opcode_builder( Stopper, function() { return 'e.act("quit")'; } ),
/* new_line */ 187: opcode_builder( Opcode, function() { return buffer + '"\\n"'; } ),
/* verify */ 189: verifypiracy, // Actually check??
/* piracy */ 191: verifypiracy,
/* call_vs */ 224: CallerStorer,
/* storew */ 225: opcode_builder( Opcode, function( array, index, value ) { return 'm.setUint16(' + array() + '+2*' + index() + ',' + value() + ')'; } ),
/* storeb */ 226: opcode_builder( Opcode, function( array, index, value ) { return 'm.setUint8(' + array() + '+' + index() + ',' + value() + ')'; } ),
/* put_prop */
/* aread */ 228: opcode_builder( Storer, function() { var storer = this.storer.v; this.storer = 0; return 'e.read(' + this.var_args( arguments ) + ',' + storer + ')'; }, { stopper: 1 } ),
/* print_char */ 229: opcode_builder( Opcode, function( a ) { return buffer + 'String.fromCharCode(' + a() + ')'; } ),
/* print_num */ 230: opcode_builder( Opcode, function( a ) { return buffer + a.U2S(); } ),
/* random */
/* push */ /*232: Object.subClass({ // TODO: finish!
	init: function()
	{
		var self = this;
		self._super.apply( self, arguments );
		
		// Create a new storer
		self.storer = new Variable( self.e, 0 );
	}
}),*/
/* pull */
/* split_window */
/* set_window */
/* call_vs2 */ 236: CallerStorer,
/* erase_window */
/* erase_line */
/* set_cursor */
/* get_cursor */
/* set_text_style */ 241: opcode_builder( Opcode, function( stylebyte ) { return 'e.ui.set_style(' + stylebyte() + ')'; } ),
/* buffer_mode */
/* output_stream */
/* input_stream */
/* sound_effect */
/* read_char */
/* scan_table */
/* not */ 248: opcode_builder( Storer, function( a ) { return '~' + a(); } ),
/* call_vn */ 249: Caller,
/* call_vn2 */ 250: Caller,
/* tokenise */
/* encode_text */
/* copy_table */
/* print_table */
/* check_arg_count */
/* save */
/* restore */
/* log_shift */
/* art_shift */
/* set_font */
/* save_undo */
/* restore_undo */
/* print_unicode */ 1011: opcode_builder( Opcode, function( a ) { return buffer + 'String.fromCharCode(' + a() + ')'; } ),
/* check_unicode */
// Assume we can print and read all unicode characters rather than actually testing
1012: opcode_builder( Storer, function() { return 3; } ),
/* gestalt */ 1030: opcode_builder( Storer, function() { return 'e.gestalt(' + this.var_args( arguments ) + ')'; } ),
/* parchment */ 1031: opcode_builder( Storer, function() { return 'e.op_parchment(' + this.var_args( arguments ) + ')'; } )
	
};