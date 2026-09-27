/**
 * AetherJS 错误类型(实现层)。
 *
 * 规格第 9 节:脚本 catch 到的语言错误是字符串 "<类型>: <描述>";
 * 本模块的错误对象只在宿主侧流通 —— 进入脚本 try/catch 前由
 * 运行时的 $catch 转换为字符串(见 runtime.js)。
 */

export class AetherError extends Error {
  /** @param {string} kind syntax|type|range|access|limit|host 之一(规格第 9 节) */
  constructor(kind, message) {
    super(message);
    this.name = 'AetherError';
    this.kind = kind;
  }
}

export class CompileError extends AetherError {
  constructor(kind, message, line, col) {
    super(kind, message);
    this.name = 'CompileError';
    this.line = line ?? null;
    this.col = col ?? null;
  }
}

export const lexErr = (msg, line, col) => new CompileError('syntax', msg, line, col);
export const parseErr = (msg, line, col) => new CompileError('syntax', msg, line, col);
export const analyzeErr = (msg, node) => new CompileError('syntax', msg, node?.line ?? null);
