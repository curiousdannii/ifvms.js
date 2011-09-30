/*

Z-Machine opcodes
=================

Copyright (c) 2011 The ifvms.js team
BSD licenced
http://github.com/curiousdannii/ifvms.js

*/

/*
	
TODO:
	consider generalising the indirect instructions
	Abstract out the signed conversions such that they can be eliminated if possible
	don't access memory directly
	consider scrapping the autowriter idea and calling the operands' .write()s directly
	
*/

// If the .write() of an operand generates code to access the stack or the memory (if non-native ByteArray) then don't access it more than once
// Currently only for branchers
var rUnsafeOperand = native_bytearrays ? /^s/ : /^[sm]/,
safe_operand = function( opcode, operand )
{
	var temp = operand();
	if ( rUnsafeOperand.test( temp ) )
	{
		pretemp( opcode, temp );
		temp = temp_var( opcode );
	}
	return temp;
},
// A temp var unique to this opcode
temp_var = function( opcode )
{
	return 't' + opcode.pc;
},
// Add a temporary var to the pre list
pretemp = function( opcode, value )
{
	opcode.pre.push( 'var ' + opcode.temp() + '=' + value );
},

// Z-Machine brancher
ZBrancher = Brancher.subClass({
	// Calculate the offset
	calc_offset: function()
	{
		var brancher = this.operands.pop(),
		word = brancher > 0xFF;
		this.offset = word ? ( (brancher & 0x1FFF) | (brancher & 0x2000 ? ~0x1FFF : 0) ) : brancher & 0x3F;
		this.iftrue = brancher & ( word ? 0x8000 : 0x80 );
	}
}),

// Common opcodes
alwaysbranch = opcode_builder( ZBrancher, function() { return 1; } ),

opcodes = {
	
/* je */ 1: opcode_builder( ZBrancher, function( a, b ) { return arguments.length == 2 ? a() + '==' + b() : 'e.jeq(' + this.var_args( arguments ) + ')'; } ),
/* jl */ 2: opcode_builder( ZBrancher, function( a, b ) { return a.U2S() + '<' + b.U2S(); } ),
/* jg */ 3: opcode_builder( ZBrancher, function( a, b ) { return a.U2S() + '>' + b.U2S(); } ),
/* dec_chk */
/* inc_chk */
/* jin */ 6: opcode_builder( ZBrancher, function( a, b ) { return 'e.jin(' + a() + ',' + b() + ')'; } ),
/* test */ 7: opcode_builder( ZBrancher, function( bitmap, flag ) { var temp = safe_operand( this, flag ); return bitmap() + '&' + temp + '==' + temp; } ),
/* or */ 8: opcode_builder( Storer, function( a, b ) { return a() + '|' + b(); } ),
/* and */ 9: opcode_builder( Storer, function( a, b ) { return a() + '&' + b(); } ),
/* test_attr */ 10: opcode_builder( ZBrancher, function( object, attr ) { return 'e.test_attr(' + object() + ',' + attr() + ')'; } ),
/* set_attr */
/* clear_attr */
/* store */ 13: opcode_builder( Indirect, function( variable, value ) { return value(); } ), // !!!
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
/* jz */ 128: opcode_builder( ZBrancher, function( a ) { return a() + '==0'; } ),
/* get_sibling */
/* get_child */
/* get_parent */
/* get_prop_length */ 132: opcode_builder( Storer, function( a ) { return 'e.get_prop_len(' + a() + ')'; } ),
/* inc */ 133: opcode_builder( Opcode, function( a ) { return 'e.incdec(' + a() + ',1)'; } ),
/* dec */ 134: opcode_builder( Opcode, function( a ) { return 'e.incdec(' + a() + ',-1)'; } ),
/* print_addr */ 135: opcode_builder( Opcode, function( addr ) { return 'e.buffer+=e.text.decode(' + addr() + ')[0]' } ),
/* call_1s */ 136: CallerStorer,
/* remove_obj */
/* print_obj */ 138: opcode_builder( Opcode, function( a ) { return 'e.buffer+=e.text.decode(m.getUint16(e.objects+14*(' + a() + '-1)+13))[0]'; } ),
/* ret */ 139: opcode_builder( Stopper, function( a ) { return 'e.ret(' + a() + ')'; } ),
/* jump */ 140: opcode_builder( Stopper, function( a ) { return 'e.pc=' + a.U2S() + '+' + (this.next - 2) + ''; } ),
/* print_paddr */ 141: opcode_builder( Opcode, function( addr ) { return 'e.buffer+=e.text.decode(' + addr() + '*' + this.e.packing_multipler + ')[0]'; } ),
/* load */
/* call_1n */ 143: Caller,
/* rtrue */ 176: opcode_builder( Stopper, function() { return 'e.ret(1)'; } ),
/* rfalse */ 177: opcode_builder( Stopper, function() { return 'e.ret(0)'; } ),
// Reconsider a generalised class for @print/@print_ret?
/* print */ 178: opcode_builder( Opcode, function( text ) { return 'e.buffer+="' + text + '"'; }, { printer: 1 } ),
/* print_ret */ 179: opcode_builder( Stopper, function( text ) { return 'e.buffer+="' + text + '"'; }, { printer: 1 } ),
/* nop */ 180: Opcode,
/* restart */ 183: opcode_builder( Stopper, function() { return 'e.act("restart")'; } ), // !!!
/* ret_popped */ 184: Stopper.subClass({
	post: function() { this.operands.push( new Variable( this.e, 0 ) ); },
	func: function( a ) { return 'e.ret(' + a.write() + ')'; }
}),
/* catch */
/* quit */ 186: opcode_builder( Stopper, function() { return 'e.act("quit")'; } ),
/* new_line */ 187: opcode_builder( Opcode, function() { return 'e.buffer+="\\n"'; } ),
/* verify */ 189: alwaysbranch, // Actually check??
/* piracy */ 191: alwaysbranch,
/* call_vs */ 224: CallerStorer,
/* storew */ 225: opcode_builder( Opcode, function( array, index, value ) { return 'm.setUint16(' + array() + '+2*' + index() + ',' + value() + ')'; } ),
/* storeb */ 226: opcode_builder( Opcode, function( array, index, value ) { return 'm.setUint8(' + array() + '+' + index() + ',' + value() + ')'; } ),
/* put_prop */
/* aread */ 228: opcode_builder( Storer, function() { var storer = this.storer.v; this.storer = 0; return 'e.read(' + this.var_args( arguments ) + ',' + storer + ')'; }, { stopper: 1 } ),
/* print_char */ 229: opcode_builder( Opcode, function( a ) { return 'e.buffer+=String.fromCharCode(' + a() + ')'; } ),
/* print_num */ 230: opcode_builder( Opcode, function( a ) { return 'e.buffer+=' + a.U2S(); } ),
/* random */
/* push */ 232: Storer.subClass({
	storer: 0, // Don't grab an extra byte
	post: function() { this.storer = new Variable( this.e, 0 ); },
	func: function( a ) { return a.write(); }
}),
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
/* print_unicode */ 1011: opcode_builder( Opcode, function( a ) { return 'e.buffer+=String.fromCharCode(' + a() + ')'; } ),
/* check_unicode */
// Assume we can print and read all unicode characters rather than actually testing
1012: opcode_builder( Storer, function() { return 3; } ),
/* gestalt */ 1030: opcode_builder( Storer, function() { return 'e.gestalt(' + this.var_args( arguments ) + ')'; } ),
/* parchment */ 1031: opcode_builder( Storer, function() { return 'e.op_parchment(' + this.var_args( arguments ) + ')'; } )
	
};
