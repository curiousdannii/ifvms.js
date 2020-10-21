/*

ZVM
===

Copyright (c) 2020 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifvms.js

*/

use std::io::Cursor;
use fnv::FnvHashMap;
use crate::*;

pub mod disassembler;
pub mod opcodes;

pub struct ZVMState {
    pub image: Cursor<Box<[u8]>>,
    pub version: u8,
    pub globals_addr: u16,
    pub opcode_definitions: FnvHashMap<u16, opcodes::OpcodeDefinition>,
    pub functions: FnvHashMap<u32, FunctionSafety>,
}

impl ZVMState {
    pub fn new(image: Cursor<Box<[u8]>>, version: u8, globals_addr: u16) -> ZVMState {
        ZVMState {
            image,
            version,
            globals_addr,
            opcode_definitions: opcodes::get_opcode_definitions(version),
            functions: FnvHashMap::default(),
        }
    }
}

pub enum Operand {
    Constant(u16),
    SignedConstant(i16),
    StackPointer,
    SignedStackPointer,
    LocalVariable(u8),
    SignedLocalVariable(u8),
    GlobalVariable(u16),
    SignedGlobalVariable(u16),
}

#[derive(Copy, Clone)]
pub struct Branch {
    pub iftrue: bool,
    pub offset: i16,
}

pub struct Instruction {
    pub addr: u32,
    pub opcode: u16,
    pub operands: Vec<Operand>,
    pub result: Option<u8>,
    pub stores: bool,
    pub branch: Option<Branch>,
    pub branches: bool,
    pub text: Option<u32>,
    pub next: u32,
    pub ends_block: bool,
    pub pauses_vm: bool,
}