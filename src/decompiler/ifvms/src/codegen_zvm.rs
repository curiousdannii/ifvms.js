/*

ZVM Code Generator
==================

Copyright (c) 2020 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifvms.js

*/

use ifvms_decompiler::zvm;
use ifvms_decompiler::zvm::*;

pub fn output_block(state: &mut ZVMState, addr: u32) -> String {

    // Set some variables we'll need for code gen
    let version = state.version;
    let globals_addr = state.globals_addr;
    let addr_multiplier = match version {
        3 => 2,
        8 => 8,
        _ => 4,
    };

    // Output functions
    // Some of these are closures because they depend on the variables above
    fn output_operand(operand: &Operand) -> String {
        match operand {
            Operand::Constant(value) => value.to_string(),
            Operand::SignedConstant(value) => value.to_string(),
            Operand::StackPointer => String::from("s[--e.sp]"),
            Operand::SignedStackPointer => String::from("(s[--e.sp]<<16>>16)"),
            Operand::LocalVariable(var) => format!("l[{}]", var),
            Operand::SignedLocalVariable(var) => format!("(l[{}]<<16>>16)", var),
            Operand::GlobalVariable(var) => format!("e.m.getUint16({})", var),
            Operand::SignedGlobalVariable(var) => format!("e.m.getInt16({})", var),
        }
    }

    // Common instruction helpers
    fn args_join(operands: Vec<String>, joiner: &str) -> String {
        match operands.len() {
            0 => String::new(),
            1 => format!("{}", operands[0]),
            2 => format!("{}{}{}", operands[0], joiner, operands[1]),
            _ => operands.join(joiner)
        }
    }
    fn args(operands: Vec<String>) -> String {
        args_join(operands, ",")
    }
    fn runtime(name: &str, operands: Vec<String>) -> String {
        format!("e.{}({})", name, args(operands))
    }

    // Write a storer
    let store = |var: u8, inner: String| -> String {
        match var {
            0 => format!("t={},s[e.sp++]=t", inner),
            1 ..= 15 => format!("l[{}]={}", var - 1, inner),
            16 ..= 255 => format!("t={},e.ram.setUint16({},t),t", inner, globals_addr + (var as u16 - 16) * 2),
        }
    };

    // Common instructions
    fn call(inst: &Instruction, operands: &mut Vec<String>) -> String {
        let storer = match inst.result {
            Some(var) => var as u16 as i16,
            None => -1,
        };
        let call_args = operands.split_off(1);
        format!("e.call({},{},{},[{}])", operands[0], storer, inst.next, args(call_args))
    }
    let restore = |inst: &Instruction| -> String {
        format!("e.restore({})", if version == 3 { inst.addr + 1 } else { inst.next - 1 })
    };
    let save = |inst: &Instruction| -> String {
        format!("e.save({})", if version == 3 { inst.addr + 1 } else { inst.next - 1 })
    };

    let output_instruction = |inst: &Instruction| -> String {
        let mut operands: Vec<String> = inst.operands.iter().map(output_operand).collect();
        let null = String::from("null");
        let op_a = operands.get(0).unwrap_or(&null);
        let op_b = operands.get(1).unwrap_or(&null);
        let mut code = match inst.opcode {
            /* je */ 1 => if operands.len() == 2 { args_join(operands, "===") } else { runtime("jeq", operands) },
            /* jl */ 2 => args_join(operands, "<"),
            /* jg */ 3 => args_join(operands, ">"),
            /* dec_chk */ 4 => format!("(e.incdec({},-1)<<16>>16)<{}", op_a, op_b),
            /* inc_chk */ 5 => format!("(e.incdec({},1)<<16>>16)>{}", op_a, op_b),
            /* jin */ 6 => runtime("jin", operands),
            /* test */ 7 => runtime("test", operands),
            /* or */ 8 => args_join(operands, "|"),
            /* and */ 9 => args_join(operands, "&"),
            /* test_attr */ 10 => runtime("test_attr", operands),
            /* set_attr */ 11 => runtime("set_attr", operands),
            /* clear_attr */ 12 => runtime("clear_attr", operands),
            /* store */ 13 => format!("e.indirect({},{})", op_a, op_b),
            /* insert_obj */ 14 => runtime("insert_obj", operands),
            /* loadw */ 15 => format!("e.m.getUint16({}+2*{})", op_a, op_b),
            /* loadb */ 16 => format!("e.m.getUint8({}+{})", op_a, op_b),
            /* get_prop */ 17 => runtime("get_prop", operands),
            /* get_prop_addr */ 18 => runtime("find_prop", operands),
            /* get_next_prop */ 19 => format!("e.find_prop({},0,{})", op_a, op_b),
            /* add */ 20 => args_join(operands, "+"),
            /* sub */ 21 => args_join(operands, "-"),
            /* mul */ 22 => args_join(operands, "*"),
            /* div */ 23 => format!("({}/{})|0", op_a, op_b),
            /* mod */ 24 => args_join(operands, "%"),
            /* set_colour */ 27 => runtime("set_colour", operands),
            /* throw */ 28 => format!("while(e.frames.length+1>{}){{e.frameptr=e.frames.pop()}}return {}", op_b, op_a),
            /* jz */ 128 => format!("{}===0", op_a),
            /* get_sibling */ 129 => runtime("get_sibling", operands),
            /* get_child */ 130 => runtime("get_child", operands),
            /* get_parent */ 131 => runtime("get_parent", operands),
            /* get_prop_length */ 132 => runtime("get_prop_len", operands),
            /* inc */ 133 => format!("e.incdec({},1)", op_a),
            /* dec */ 134 => format!("e.incdec({},-1)", op_a),
            /* print_addr */ 135 => format!("e.print(2,{})", op_a),
            /* remove_obj */ 137 => runtime("remove_obj", operands),
            /* print_obj */ 138 => format!("e.print(3,{})", op_a),
            /* ret */ 139 => format!("return {}", op_a),
            /* jump */ 140 => format!("e.pc={}+{}", op_a, inst.next - 2),
            /* print_paddr */ 141 => format!("e.print(2,{}*{})", op_a, addr_multiplier),
            /* load */ 142 => format!("e.indirect({})", op_a),
            /* not/call_1n */ 143 => if version < 5 { format!("~{}", op_a) } else { call(inst, &mut operands) },
            /* rtrue */ 176 => String::from("return 1"),
            /* rfalse */ 177 => String::from("return 0"),
            /* print */ 178 => format!("e.print(2,{})", inst.text.unwrap()),
            /* print_ret */ 179 => format!("e.print(2,{});e.print(1,13);return 1", inst.text.unwrap()),
            /* nop */ 180 => String::new(),
            /* save */ 181 => save(inst),
            /* restore */ 182 => restore(inst),
            /* restart */ 183 => String::from("e.restart()"),
            /* ret_popped */ 184 => String::from("return s[--e.sp]"),
            /* pop/catch */ 185 => String::from(if version < 5 { "s[--e.sp]" } else { "e.frames.length+1" }),
            /* quit */ 186 => String::from("e.quit=1;e.Glk.glk_exit()"),
            /* new_line */ 187 => String::from("e.print(1,13)"),
            /* show_status */ 188 => if version < 4 { String::from("e.v3_status()") } else { String::new() },
            /* verify */ 189 => String::from("1"),
            /* piracy */ 191 => String::from("1"),
            /* storew */ 225 => format!("e.ram.setUint16({}+2*{},{})", op_a, op_b, operands.get(2).unwrap_or(&null)),
            /* storeb */ 226 => format!("e.ram.setUint8({}+{},{})", op_a, op_b, operands.get(2).unwrap_or(&null)),
            /* put_prop */ 227 => runtime("put_prop", operands),
            /* read */ 228 => format!("e.read({},{})", if version < 5 { 0 } else { inst.result.unwrap() }, args(operands)),
            /* print_char */ 229 => format!("e.print(4,{})", op_a),
            /* print_num */ 230 => format!("e.print(0,{})", op_a),
            /* random */ 231 => runtime("random", operands),
            /* push */ 232 => format!("t={};s[e.sp++]=t", op_a),
            /* pull */ 233 => format!("e.indirect({},s[--e.sp])", op_a),
            /* split_window */ 234 => runtime("split_window", operands),
            /* set_window */ 235 => runtime("set_window", operands),
            /* erase_window */ 237 => runtime("erase_window", operands),
            /* erase_line */ 238 => runtime("erase_line", operands),
            /* set_cursor */ 239 => format!("e.set_cursor({}-1,{}-1)", op_a, op_b),
            /* get_cursor */ 240 => runtime("get_cursor", operands),
            /* set_text_style */ 241 => runtime("set_style", operands),
            /* buffer_mode */ 242 => String::new(),
            /* output_stream */ 243 => format!("e.pc={};e.output_stream({})", inst.next, args(operands)),
            /* input_stream */ 244 => runtime("input_stream", operands),
            /* sound_effect */ 245 => String::new(),
            /* read_char */ 246 => format!("e.read_char({},{})", inst.result.unwrap(), if operands.len() == 0 { String::from("1") } else { args(operands) }),
            /* scan_table */ 247 => runtime("scan_table", operands),
            /* not */ 248 => format!("~{}", op_a),
            /* tokenise */ 251 => runtime("tokenise", operands),
            /* encode_text */ 252 => runtime("encode_text", operands),
            /* copy_table */ 253 => runtime("copy_table", operands),
            /* print_table */ 254 => runtime("print_table", operands),
            /* check_arg_count */ 255 => format!("e.stack.getUint8(e.frameptr+5)&(1<<({}-1))", op_a),
            /* save */ 1000 => save(inst),
            /* restore */ 1001 => restore(inst),
            /* log_shift */ 1002 => runtime("log_shift", operands),
            /* art_shift */ 1003 => runtime("art_shift", operands),
            /* set_font */ 1004 => runtime("set_font", operands),
            /* save_undo */ 1009 => format!("e.save_undo({},{})", inst.next, inst.result.unwrap()),
            /* restore_undo */ 1010 => String::from("if(e.restore_undo())return"),
            /* print_unicode */ 1011 => format!("e.print(1,{})", op_a),
            /* check_unicode */ 1012 => String::from("3"),
            /* set_true_colour */ 1013 => runtime("set_true_colour", operands),
            /* gestalt */ 1030 => runtime("gestalt", operands),

            /* call_* */ 25 | 26 | 136 | 224 | 236 | 249 | 250 => call(inst, &mut operands),
            _ => panic!("Unknown opcode #{} at pc={}", inst.opcode, inst.addr),
        };

        // Store
        if inst.stores {
            code = store(inst.result.unwrap(), code);
        }

        // Branch (except version 4 save/restore)
        if !inst.ends_block && inst.branch.is_some() {
            let branch = inst.branch.unwrap();
            let target = match branch.offset {
                0 | 1 => format!("return {}", branch.offset),
                _ => format!("e.pc={};return", branch.offset as u32 + inst.next - 2),
            };
            code = format!("if({}({})){{{}}}", if branch.iftrue { "" } else { "!" }, code, target);
        }

        // Pause VM
        if inst.pauses_vm {
            code = format!("e.stop=1;e.pc={};{}", inst.next, code);
        }

        code
    };

    // Output the code block for the current address
    let mut output = String::from("var l=e.l,s=e.s,t=0;");
    state.image.set_position(addr as u64);
    loop {
        let instruction = zvm::disassembler::disassemble_instruction(state);
        output = format!("{}\n/* {}/{} */ {};", output, instruction.addr, instruction.opcode, output_instruction(&instruction));
        if instruction.ends_block {
            break
        }
    }
    output
}