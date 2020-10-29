/*

ZVM Disassembler
================

Copyright (c) 2020 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifvms.js

*/

use bytes::Buf;

use super::*;
use super::opcodes::*;
use super::Operand::*;

// Disassemble one Z-Code instruction
pub fn disassemble_instruction(state: &mut ZVMState) -> Instruction {

    let image = &mut state.image;
    let opcode_definitions = &state.opcode_definitions;

    // Begin with an enum that will only be used within this function
    enum OperandEncoding {LargeConstant, SmallConstant, Variable}
    use OperandEncoding::*;

    // Helper function to decode operand codes into the enum
    fn get_operand_encodings(mut operand_codes: u8, operand_encodings: &mut Vec<OperandEncoding>) {
        let mut count = 0;
        while count < 4 {
            let code = operand_codes & 0xC0;
            if code == 0xC0 {
                break;
            }
            operand_encodings.push(match code {
                0x00 => LargeConstant,
                0x40 => SmallConstant,
                0x80 => Variable,
                _ => unreachable!(),
            });
            operand_codes <<= 2;
            count += 1;
        }
    }

    // Start decoding the instruction
    let addr = image.position() as u32;

    // Decode the operand byte
    let opcode_byte = image.get_u8() as u16;
    let opcode: u16;
    let mut operand_encodings = Vec::new();

    // Get the opcode and operand_types
    match opcode_byte as u8 {
        // Long 2OP
        0 ..= 127 => {
            opcode = opcode_byte & 0x1F;
            operand_encodings.push(if opcode_byte & 0x40 == 0 {SmallConstant} else {Variable});
            operand_encodings.push(if opcode_byte & 0x20 == 0 {SmallConstant} else {Variable});
        },
        // Short 1OP
        128 ..= 175 => {
            opcode = opcode_byte & 0x8F;
            get_operand_encodings((opcode_byte << 2) as u8 | 0x3F, &mut operand_encodings);
        },
        // 0OP
        176 ..= 189 | 191 => {
            opcode = opcode_byte;
        },
        // EXT/VAR
        190 | 192 ..= 255 => {
            opcode = match opcode_byte {
                190 => 1000 + image.get_u8() as u16,
                192 ..= 223 => opcode_byte & 0x1F,
                _ => opcode_byte,
            };
            get_operand_encodings(image.get_u8(), &mut operand_encodings);
            if opcode == 236 || opcode == 250 {
                get_operand_encodings(image.get_u8(), &mut operand_encodings);
            }
        },
    }

    // Opcode definition
    let opcode_definition = opcode_definitions.get(&opcode).unwrap_or(&OpcodeDefinition {
        stores: false,
        branches: false,
        ends_block: false,
        pauses_vm: false, 
        operands: None,
    });

    // Read the operands
    let mut operands = Vec::new();
    if operand_encodings.len() > 0 {
        let default_operand_types = Vec::new();
        let operand_types = opcode_definition.operands.as_ref().unwrap_or(&default_operand_types);
        for (operand_num, operand_encoding) in operand_encodings.iter().enumerate() {
            let operand_type = operand_types.get(operand_num).unwrap_or(&Unsigned);
            operands.push(match operand_type {
                Unsigned => match operand_encoding {
                    LargeConstant => Constant(image.get_u16()),
                    SmallConstant=> Constant(image.get_u8() as u16),
                    Variable => {
                        let var = image.get_u8();
                        match var {
                            0 => StackPointer,
                            1 ..= 15 => LocalVariable(var - 1),
                            16 ..= 255 => GlobalVariable(((var - 16) as u16 * 2) + state.globals_addr),
                        }
                    },
                },
                Signed => match operand_encoding {
                    LargeConstant => SignedConstant(image.get_i16()),
                    SmallConstant => SignedConstant(image.get_u8() as u16 as i16),
                    Variable => {
                        let var = image.get_u8();
                        match var {
                            0 => SignedStackPointer,
                            1 ..= 15 => SignedLocalVariable(var - 1),
                            16 ..= 255 => SignedGlobalVariable(((var - 16) as u16 * 2) + state.globals_addr),
                        }
                    },
                }
            });
        }
    }

    // Result variable
    let stores = opcode_definition.stores;
    let result = if stores {
        Some(image.get_u8())
    // Call_*s, restore_undo
    } else if let 25 | 136 | 224 | 236 | 1010 = opcode {
        Some(image.get_u8())
    } else {
        None
    };

    // Branch offset
    let branch = if opcode_definition.branches {
        let first_branch_byte = image.get_u8();
        let iftrue = first_branch_byte & 0x80 != 0;
        let twobytes = first_branch_byte & 0x40 == 0;
        let offset: i16 = if twobytes {
            (((((first_branch_byte & 0x3F) as u16) << 8) | image.get_u8() as u16) << 2) as i16 >> 2
        } else {
            (first_branch_byte & 0x3F) as i16
        };
        Some(BranchTarget {
            iftrue,
            offset,
        })
    } else {
        None
    };
    let branches = opcode_definition.branches && !opcode_definition.pauses_vm;

    // Inline text data
    let text = if opcode == 178 || opcode == 179 {
        let addr = image.position() as u32;
        loop {
            if image.get_u16() & 0x8000 != 0 {
                break;
            }
        }
        Some(addr)
    } else {
        None
    };

    // Next instruction, and time to stop?
    let next = image.position() as u32;
    let ends_block = opcode_definition.ends_block;
    let pauses_vm = opcode_definition.pauses_vm;

    Instruction {
        addr,
        opcode,
        operands,
        result,
        stores,
        branch,
        branches,
        text,
        next,
        ends_block,
        pauses_vm,
    }
}