/*

ZVM
===

Copyright (c) 2020 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifvms.js

*/

use std::io::Cursor;
use fnv::FnvHashMap;

pub mod disassembler;
pub mod opcodes;

pub struct ZVMState {
    pub image: Cursor<Box<[u8]>>,
    pub version: u8,
    pub globals_addr: u16,
    pub opcode_definitions: FnvHashMap<u16, opcodes::OpcodeDefinition>,
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