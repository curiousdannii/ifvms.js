/*

ZVM Opcodes
===========

Copyright (c) 2020 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifvms.js

*/

use fnv::FnvHashMap;

pub enum OperandTypes {
    Unsigned,
    Signed,
}
pub use OperandTypes::*;

pub struct OpcodeDefinition {
    pub stores: bool,
    pub branches: bool,
    pub ends_block: bool,
    pub pauses_vm: bool,
    pub operands: Option<Vec<OperandTypes>>,
}

fn simple_operands(operands: Vec<OperandTypes>) -> OpcodeDefinition {
    OpcodeDefinition {stores: false, branches: false, ends_block: false, pauses_vm: false, operands: Some(operands)}
}

fn end_block() -> OpcodeDefinition {
    OpcodeDefinition {stores: false, branches: false, ends_block: true, pauses_vm: false, operands: None}
}

fn pause_vm() -> OpcodeDefinition {
    OpcodeDefinition {stores: false, branches: false, ends_block: true, pauses_vm: true, operands: None}
}

fn branch() -> OpcodeDefinition {
    OpcodeDefinition {stores: false, branches: true, ends_block: false, pauses_vm: false, operands: None}
}

fn branch_and_pause_vm() -> OpcodeDefinition {
    OpcodeDefinition {stores: false, branches: true, ends_block: true, pauses_vm: true, operands: None}
}

fn branch_with_operands(operands: Vec<OperandTypes>) -> OpcodeDefinition {
    OpcodeDefinition {stores: false, branches: true, ends_block: false, pauses_vm: false, operands: Some(operands)}
}

fn store() -> OpcodeDefinition {
    OpcodeDefinition {stores: true, branches: false, ends_block: false, pauses_vm: false, operands: None}
}

fn store_with_operands(operands: Vec<OperandTypes>) -> OpcodeDefinition {
    OpcodeDefinition {stores: true, branches: false, ends_block: false, pauses_vm: false, operands: Some(operands)}
}

fn store_and_branch() -> OpcodeDefinition {
    OpcodeDefinition {stores: true, branches: true, ends_block: false, pauses_vm: false, operands: None}
}

fn store_and_pause_vm() -> OpcodeDefinition {
    OpcodeDefinition {stores: true, branches: false, ends_block: true, pauses_vm: true, operands: None}
}

pub fn get_opcode_definitions(version: u8) -> FnvHashMap<u16, OpcodeDefinition> {
    let mut map = FnvHashMap::default();

    // Opcodes for all versions
    /* je */ map.insert(1, branch());
    /* jl */ map.insert(2, branch_with_operands(vec![Signed, Signed]));
    /* jg */ map.insert(3, branch_with_operands(vec![Signed, Signed]));
    /* dec_chk */ map.insert(4, branch_with_operands(vec![Unsigned, Signed]));
    /* inc_chk */ map.insert(5, branch_with_operands(vec![Unsigned, Signed]));
    /* jin */ map.insert(6, branch());
    /* test */ map.insert(7, branch());
    /* or */ map.insert(8, store());
    /* and */ map.insert(9, store());
    /* test_attr */ map.insert(10, branch());
    /* set_attr */
    /* clear_attr */
    /* store */
    /* insert_obj */
    /* loadw */ map.insert(15, store_with_operands(vec![Unsigned, Signed]));
    /* loadb */ map.insert(16, store_with_operands(vec![Unsigned, Signed]));
    /* get_prop */ map.insert(17, store());
    /* get_prop_addr */ map.insert(18, store());
    /* get_next_prop */ map.insert(19, store());
    /* add */ map.insert(20, store());
    /* sub */ map.insert(21, store());
    /* mul */ map.insert(22, store());
    /* div */ map.insert(23, store_with_operands(vec![Signed, Signed]));
    /* mod */ map.insert(24, store_with_operands(vec![Signed, Signed]));
    /* call_2s */ map.insert(25, end_block());
    /* call_2n */ map.insert(26, end_block());
    /* set_colour */
    /* throw */ map.insert(28, end_block());
    /* jz */ map.insert(128, branch());
    /* get_sibling */ map.insert(129, store_and_branch());
    /* get_child */ map.insert(130, store_and_branch());
    /* get_parent */ map.insert(131, store());
    /* get_prop_length */ map.insert(132, store());
    /* inc */
    /* dec */
    /* print_addr */
    /* call_1s */ map.insert(136, end_block());
    /* remove_obj */
    /* print_obj */
    /* ret */ map.insert(139, end_block());
    /* jump */ map.insert(140, OpcodeDefinition {stores: false, branches: false, ends_block: true, pauses_vm: false, operands: Some(vec![Signed])});
    /* print_paddr */
    /* load */ map.insert(142, store());
    /* rtrue */ map.insert(176, end_block());
    /* rfalse */ map.insert(177, end_block());
    /* print */
    /* print_ret */ map.insert(179, end_block());
    /* nop */
    /* restart */ map.insert(183, end_block());
    /* ret_popped */ map.insert(184, end_block());
    /* quit */ map.insert(186, pause_vm());
    /* new_line */
    /* verify */ map.insert(189, branch());
    /* piracy */ map.insert(191, branch());
    /* call_vs */ map.insert(224, end_block());
    /* storew */ map.insert(225, simple_operands(vec![Unsigned, Signed]));
    /* storeb */ map.insert(226, simple_operands(vec![Unsigned, Signed]));
    /* put_prop */
    /* print_char */
    /* print_num */ map.insert(230, simple_operands(vec![Signed]));
    /* random */ map.insert(231, store_with_operands(vec![Signed]));
    /* push */
    /* pull */
    /* split_window */
    /* set_window */
    /* call_vs2 */ map.insert(236, end_block());
    /* erase_window */ map.insert(237, simple_operands(vec![Signed]));
    /* erase_line */
    /* set_cursor */
    /* get_cursor */
    /* set_text_style */
    /* buffer_mode */
    /* output_stream */ map.insert(243, end_block());
    /* input_stream */ map.insert(244, pause_vm());
    /* sound_effect */
    /* read_char */ map.insert(246, store_and_pause_vm());
    /* scan_table */ map.insert(247, store_and_branch());
    /* not */ map.insert(248, store());
    /* call_vn */ map.insert(249, end_block());
    /* call_vn2 */ map.insert(250, end_block());
    /* tokenise */
    /* encode_text */
    /* copy_table */
    /* print_table */
    /* check_arg_count */ map.insert(255, branch());
    /* save */ map.insert(1000, store_and_pause_vm());
    /* restore */ map.insert(1001, store_and_pause_vm());
    /* log_shift */ map.insert(1002, store_with_operands(vec![Unsigned, Signed]));
    /* art_shift */ map.insert(1003, store_with_operands(vec![Signed, Signed]));
    /* set_font */ map.insert(1004, store());
    /* save_undo */ map.insert(1009, store());
    /* restore_undo */ // Need its store byte to be decoded, but don't set store
    /* print_unicode */
    /* check_unicode */ map.insert(1012, store());
    /* set_true_colour */
    /* gestalt */ map.insert(1030, store());

    if version < 4 {
        /* save */ map.insert(181, branch_and_pause_vm());
        /* restore */ map.insert(182, branch_and_pause_vm());
        /* show_status */ map.insert(188, pause_vm());
    } else {
        /* save */ map.insert(181, store_and_pause_vm());
        /* restore */ map.insert(182, store_and_pause_vm());
    }

    if version < 5 {
        /* not */ map.insert(143, store());
        /* pop */
        /* read */ map.insert(228, pause_vm());
    } else {
        /* call_1n */ map.insert(143, end_block());
        /* catch */ map.insert(185, store());
        /* read */ map.insert(228, store_and_pause_vm());
    }

    map
}