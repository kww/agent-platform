/**
 * Spec Schema 定义
 * 
 * 使用 Zod 定义 Spec 格式，支持：
 * - ARCHITECTURE.md（架构文档）
 * - Module（模块定义）
 * - API（接口定义）
 */

export * from './schemas/architecture';
export * from './schemas/module';
export * from './schemas/api';
export * from './validator';
