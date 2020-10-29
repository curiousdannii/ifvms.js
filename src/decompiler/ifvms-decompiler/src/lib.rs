/*

ifvms-decompiler - core library
===============================

Copyright (c) 2020 Dannii Willis
MIT licenced
https://github.com/curiousdannii/ifvms.js

*/

use fnv::*;

pub mod zvm;

// Function safety refers to whether or not a function can be compiled and run without worrying about its locals and stack being part of the savestate
// Safe functions will never be saved so they can have various optimisations
// Unsafe functions need to be compiled such that they can be serialised and restored
// SafetyTBD functions have not yet been determined, and may need to be recompiled if judged safe
pub enum FunctionSafety {
    Safe,
    Unsafe,
    SafetyTBD,
}

// Function state for disassembly and relooping
pub struct Function<T> {
    pub addr: u32,
    pub calls: FnvHashSet<u32>,
    pub entry_points: FnvHashSet<u32>,
    pub expressions: FnvHashMap<u32, Expression<T>>,
    pub first_fragment_addr: u32,
    pub locals: u32,
    pub safety: FunctionSafety,
}

// Expressions: instructions or combined branches
pub enum Expression<T> {
    Instruction(T),
    Branch(Branch<T>),
}

// Multi-instruction branches
pub struct Branch<T> {
    addr: u32,
    conditions: Vec<T>,
}