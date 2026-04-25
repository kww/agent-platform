/**
 * 日志工具
 */

import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private level: LogLevel;
  
  constructor(level: LogLevel = 'info') {
    this.level = level;
  }
  
  setLevel(level: LogLevel): void {
    this.level = level;
  }
  
  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log(chalk.gray(`[DEBUG] ${message}`), ...args);
    }
  }
  
  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(chalk.blue(`[INFO] ${message}`), ...args);
    }
  }
  
  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.log(chalk.yellow(`[WARN] ${message}`), ...args);
    }
  }
  
  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.log(chalk.red(`[ERROR] ${message}`), ...args);
    }
  }
  
  success(message: string, ...args: any[]): void {
    console.log(chalk.green(`[OK] ${message}`), ...args);
  }
  
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }
}

export const logger = new Logger(
  (process.env.LOG_LEVEL as LogLevel) || 'info'
);
