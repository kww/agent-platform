/**
 * 检查点验证器测试
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CheckpointValidator } from '@dommaker/harness';
import type { Checkpoint, CheckpointContext } from '@dommaker/harness';

describe('CheckpointValidator', () => {
  let validator: CheckpointValidator;
  let tempDir: string;

  beforeEach(() => {
    validator = CheckpointValidator.getInstance();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createContext = (workdir: string): CheckpointContext => ({
    projectPath: workdir,
    workdir,
    output: null
  });

  describe('file_exists check', () => {
    test('should pass when file exists', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      fs.writeFileSync(testFile, 'test content');

      const checkpoint: Checkpoint = {
        id: 'test-checkpoint',
        name: 'Test Checkpoint',
        checks: [
          { id: 'check1', type: 'file_exists', config: { path: testFile } }
        ]
      };

      const result = await validator.validate(checkpoint, createContext(tempDir));

      expect(result.passed).toBe(true);
      expect(result.checks[0].passed).toBe(true);
    });

    test('should fail when file does not exist', async () => {
      const checkpoint: Checkpoint = {
        id: 'test-checkpoint',
        name: 'Test Checkpoint',
        checks: [
          { id: 'check1', type: 'file_exists', config: { path: path.join(tempDir, 'non-existent.txt') } }
        ]
      };

      const result = await validator.validate(checkpoint, createContext(tempDir));

      expect(result.passed).toBe(false);
      expect(result.checks[0].passed).toBe(false);
    });
  });

  describe('file_not_empty check', () => {
    test('should pass when file is not empty', async () => {
      const testFile = path.join(tempDir, 'not-empty.txt');
      fs.writeFileSync(testFile, 'content');

      const checkpoint: Checkpoint = {
        id: 'test-checkpoint',
        name: 'Test Checkpoint',
        checks: [
          { id: 'check1', type: 'file_not_empty', config: { path: testFile } }
        ]
      };

      const result = await validator.validate(checkpoint, createContext(tempDir));

      expect(result.passed).toBe(true);
    });

    test('should fail when file is empty', async () => {
      const testFile = path.join(tempDir, 'empty.txt');
      fs.writeFileSync(testFile, '');

      const checkpoint: Checkpoint = {
        id: 'test-checkpoint',
        name: 'Test Checkpoint',
        checks: [
          { id: 'check1', type: 'file_not_empty', config: { path: testFile } }
        ]
      };

      const result = await validator.validate(checkpoint, createContext(tempDir));

      expect(result.passed).toBe(false);
    });
  });

  describe('file_contains check', () => {
    test('should pass when file contains pattern', async () => {
      const testFile = path.join(tempDir, 'contains.txt');
      fs.writeFileSync(testFile, 'Hello World\nThis is a test');

      const checkpoint: Checkpoint = {
        id: 'test-checkpoint',
        name: 'Test Checkpoint',
        checks: [
          { id: 'check1', type: 'file_contains', config: { path: testFile, content: 'World' } }
        ]
      };

      const result = await validator.validate(checkpoint, createContext(tempDir));

      expect(result.passed).toBe(true);
    });

    test('should fail when file does not contain pattern', async () => {
      const testFile = path.join(tempDir, 'no-match.txt');
      fs.writeFileSync(testFile, 'Hello World');

      const checkpoint: Checkpoint = {
        id: 'test-checkpoint',
        name: 'Test Checkpoint',
        checks: [
          { id: 'check1', type: 'file_contains', config: { path: testFile, content: 'NotFound' } }
        ]
      };

      const result = await validator.validate(checkpoint, createContext(tempDir));

      expect(result.passed).toBe(false);
    });
  });

  describe('multiple checks', () => {
    test('should fail if any check fails', async () => {
      const existingFile = path.join(tempDir, 'exists.txt');
      fs.writeFileSync(existingFile, 'content');

      const checkpoint: Checkpoint = {
        id: 'test-checkpoint',
        name: 'Test Checkpoint',
        checks: [
          { id: 'check1', type: 'file_exists', config: { path: existingFile } },
          { id: 'check2', type: 'file_exists', config: { path: path.join(tempDir, 'non-existent.txt') } }
        ]
      };

      const result = await validator.validate(checkpoint, createContext(tempDir));

      expect(result.passed).toBe(false);
      expect(result.checks.length).toBe(2);
      expect(result.checks[0].passed).toBe(true);
      expect(result.checks[1].passed).toBe(false);
    });

    test('should pass if all checks pass', async () => {
      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      fs.writeFileSync(file1, 'content 1');
      fs.writeFileSync(file2, 'content 2');

      const checkpoint: Checkpoint = {
        id: 'test-checkpoint',
        name: 'Test Checkpoint',
        checks: [
          { id: 'check1', type: 'file_exists', config: { path: file1 } },
          { id: 'check2', type: 'file_not_empty', config: { path: file2 } }
        ]
      };

      const result = await validator.validate(checkpoint, createContext(tempDir));

      expect(result.passed).toBe(true);
    });
  });

  describe('empty checkpoint', () => {
    test('should pass when no checks defined', async () => {
      const checkpoint: Checkpoint = {
        id: 'empty-checkpoint',
        name: 'Empty Checkpoint',
        checks: []
      };

      const result = await validator.validate(checkpoint, createContext(tempDir));

      expect(result.passed).toBe(true);
    });
  });
});